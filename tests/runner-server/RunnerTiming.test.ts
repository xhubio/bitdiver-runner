import { describe, expect, test } from 'vitest'
import type { SuiteDefinitionInterface } from '../../src/definition/index'
import { getLogAdapterMemory } from '../../src/logadapter/index'
import { REFERENCE_TIME_KEY, StepNormal, StepRegistry } from '../../src/model/index'
import { Runner } from '../../src/runner-server/index'

// ---------------------------------------------------------------------------
// Minimal step implementation for timing tests — records execution order
// ---------------------------------------------------------------------------

const executionOrder: string[] = []

class TrackingStep extends StepNormal {
  run(): Promise<void> {
    executionOrder.push(`${this.name}:${(this.environmentTestcase as any)?.name ?? 'unknown'}`)
    return Promise.resolve()
  }
}

function createTimingRegistry(): StepRegistry {
  const registry = new StepRegistry()
  registry.registerStep({ stepName: 'normal', step: TrackingStep })
  return registry
}

// ---------------------------------------------------------------------------
// Suite factory helpers
// ---------------------------------------------------------------------------

function makeTimingSuite(
  opts: { timedOffsetSeconds?: number; withDetermine?: boolean; withCheck?: boolean } = {}
): SuiteDefinitionInterface {
  const { timedOffsetSeconds = 5, withDetermine = true, withCheck = false } = opts

  const steps: string[] = ['Step1']
  const stepDefinitions: SuiteDefinitionInterface['stepDefinitions'] = {
    Step1: { id: 'normal', name: 'Step1', description: '' }
  }

  if (withDetermine) {
    steps.push('DetermineStartTime')
    stepDefinitions.DetermineStartTime = {
      id: 'DetermineStartTime',
      name: 'DetermineStartTime',
      description: ''
    }
  }

  steps.push('Step2')
  stepDefinitions.Step2 = { id: 'normal', name: 'Step2', description: '' }

  if (withCheck) {
    steps.push('CheckStartTime')
    stepDefinitions.CheckStartTime = {
      id: 'CheckStartTime',
      name: 'CheckStartTime',
      description: ''
    }
  }

  steps.push('TimedStep')
  stepDefinitions.TimedStep = {
    id: 'normal',
    name: 'TimedStep',
    description: '',
    timing: { offsetSeconds: timedOffsetSeconds }
  }

  return {
    name: 'timing test suite',
    executionMode: 'batch',
    steps,
    stepDefinitions,
    testcases: [
      {
        name: 'TC 1',
        data: {
          Step1: { tc: 1 },
          DetermineStartTime: { offsetSeconds: 0, delaySeconds: 0 },
          Step2: { tc: 1 },
          TimedStep: { tc: 1 }
        }
      },
      {
        name: 'TC 2',
        data: {
          Step1: { tc: 2 },
          DetermineStartTime: { offsetSeconds: 0, delaySeconds: 0 },
          Step2: { tc: 2 },
          TimedStep: { tc: 2 }
        }
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Runner timing — suite execution in testMode (delays skipped)', () => {
  test('steps without timing run without any referenceTime being set', async () => {
    executionOrder.length = 0
    const registry = createTimingRegistry()

    // Suite with no timed steps at all
    const suite: SuiteDefinitionInterface = {
      name: 'no-timing suite',
      executionMode: 'batch',
      steps: ['StepA', 'StepB'],
      stepDefinitions: {
        StepA: { id: 'normal', name: 'StepA', description: '' },
        StepB: { id: 'normal', name: 'StepB', description: '' }
      },
      testcases: [{ name: 'TC 1', data: { StepA: { tc: 1 }, StepB: { tc: 1 } } }]
    }

    const runner = new Runner({
      id: 'test',
      dataDirectory: '',
      suite,
      stepRegistry: registry,
      logAdapter: getLogAdapterMemory(),
      testMode: true
    })

    await runner.run()

    // referenceTime must not be set in the map
    expect(runner.environmentRun?.map.get(REFERENCE_TIME_KEY)).toBeUndefined()
    expect(executionOrder).toContain('StepA:TC 1')
    expect(executionOrder).toContain('StepB:TC 1')
  })

  test('referenceTime is set by DetermineStartTime step', async () => {
    executionOrder.length = 0
    const registry = createTimingRegistry()
    const suite = makeTimingSuite({ timedOffsetSeconds: 0 })

    const runner = new Runner({
      id: 'test',
      dataDirectory: '',
      suite,
      stepRegistry: registry,
      logAdapter: getLogAdapterMemory(),
      testMode: true
    })

    // Before run: referenceTime must not be set
    expect(runner.environmentRun?.map.get(REFERENCE_TIME_KEY)).toBeUndefined()

    await runner.run()

    // After run: referenceTime must be a number
    const refTime = runner.environmentRun?.map.get(REFERENCE_TIME_KEY)
    expect(typeof refTime).toBe('number')
  })

  test('timed step still executes in testMode (delay is skipped)', async () => {
    executionOrder.length = 0
    const registry = createTimingRegistry()
    // Large offset — would block for a long time without testMode
    const suite = makeTimingSuite({ timedOffsetSeconds: 3600 })

    const runner = new Runner({
      id: 'test',
      dataDirectory: '',
      suite,
      stepRegistry: registry,
      logAdapter: getLogAdapterMemory(),
      testMode: true
    })

    await runner.run()

    // TimedStep must appear for both testcases despite huge offset
    const timedStepEntries = executionOrder.filter((e) => e.startsWith('TimedStep:'))
    expect(timedStepEntries).toHaveLength(2)
  })

  test('all steps execute in correct order', async () => {
    executionOrder.length = 0
    const registry = createTimingRegistry()
    const suite = makeTimingSuite({ timedOffsetSeconds: 0 })

    const runner = new Runner({
      id: 'test',
      dataDirectory: '',
      suite,
      stepRegistry: registry,
      logAdapter: getLogAdapterMemory(),
      testMode: true
    })

    await runner.run()

    // Step1 must come before Step2, Step2 before TimedStep
    const firstStep1 = executionOrder.findIndex((e) => e.startsWith('Step1:'))
    const firstStep2 = executionOrder.findIndex((e) => e.startsWith('Step2:'))
    const firstTimed = executionOrder.findIndex((e) => e.startsWith('TimedStep:'))

    expect(firstStep1).toBeGreaterThanOrEqual(0)
    expect(firstStep2).toBeGreaterThan(firstStep1)
    expect(firstTimed).toBeGreaterThan(firstStep2)
  })
})

describe('Runner timing — DetermineStartTime calculation', () => {
  test('referenceTime = now + offset + count*delay', async () => {
    const registry = createTimingRegistry()
    const suite = makeTimingSuite({ timedOffsetSeconds: 0 })

    // override data with non-zero offset/delay
    for (const tc of suite.testcases) {
      tc.data.DetermineStartTime = { offsetSeconds: 10, delaySeconds: 0.5 }
    }

    const runner = new Runner({
      id: 'test',
      dataDirectory: '',
      suite,
      stepRegistry: registry,
      logAdapter: getLogAdapterMemory(),
      testMode: true
    })

    const before = Date.now()
    await runner.run()
    const after = Date.now()

    const refTime = runner.environmentRun?.map.get(REFERENCE_TIME_KEY) as number
    // 2 testcases * 0.5s = 1s delay budget + 10s offset = 11s buffer
    const expectedMin = before + 11_000
    const expectedMax = after + 11_000
    expect(refTime).toBeGreaterThanOrEqual(expectedMin)
    expect(refTime).toBeLessThanOrEqual(expectedMax)
  })
})
