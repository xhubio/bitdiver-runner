import { describe, expect, test } from 'vitest'
import type { SuiteDefinitionInterface } from '../../src/definition/index'
import { getLogAdapterMemory } from '../../src/logadapter/index'
import { StepNormal, StepRegistry } from '../../src/model/index'
import { Runner } from '../../src/runner-server/index'

// ---------------------------------------------------------------------------
// Minimal step implementation for timing tests — records execution order
// ---------------------------------------------------------------------------

const executionOrder: string[] = []

class TrackingStep extends StepNormal {
  async run(): Promise<void> {
    executionOrder.push(`${this.name}:${(this.environmentTestcase as any)?.name ?? 'unknown'}`)
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
  opts: { startAfterStep?: string; testcaseDelaySeconds?: number; timedOffsetSeconds?: number } = {}
): SuiteDefinitionInterface {
  const { startAfterStep = 'Step1', testcaseDelaySeconds = 0, timedOffsetSeconds = 5 } = opts

  return {
    name: 'timing test suite',
    executionMode: 'batch',
    steps: ['Step1', 'Step2', 'TimedStep'],
    stepDefinitions: {
      Step1: { id: 'normal', name: 'Step1', description: '' },
      Step2: { id: 'normal', name: 'Step2', description: '' },
      TimedStep: {
        id: 'normal',
        name: 'TimedStep',
        description: '',
        timing: { offsetSeconds: timedOffsetSeconds }
      }
    },
    testcases: [
      {
        name: 'TC 1',
        data: { Step1: { tc: 1 }, Step2: { tc: 1 }, TimedStep: { tc: 1 } }
      },
      {
        name: 'TC 2',
        data: { Step1: { tc: 2 }, Step2: { tc: 2 }, TimedStep: { tc: 2 } }
      }
    ],
    timing: { startAfterStep, testcaseDelaySeconds }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Runner timing — _calculateTimingDelay', () => {
  test('returns 0 when referenceTime is not set', () => {
    const registry = createTimingRegistry()
    const suite = makeTimingSuite()
    const runner = new Runner({
      id: 'test',
      dataDirectory: '',
      suite,
      stepRegistry: registry,
      logAdapter: getLogAdapterMemory(),
      testMode: true
    })

    // referenceTime is not set → delay must be 0
    const delay = (runner as any)._calculateTimingDelay(60)
    expect(delay).toBe(0)
  })

  test('returns 0 when target time is already in the past', () => {
    const registry = createTimingRegistry()
    const suite = makeTimingSuite()
    const runner = new Runner({
      id: 'test',
      dataDirectory: '',
      suite,
      stepRegistry: registry,
      logAdapter: getLogAdapterMemory(),
      testMode: true
    })

    // Set referenceTime to 10 seconds ago
    ;(runner as any).referenceTime = Date.now() - 10_000
    const delay = (runner as any)._calculateTimingDelay(5) // target = -5 s ago
    expect(delay).toBe(0)
  })

  test('returns positive delay when target is in the future', () => {
    const registry = createTimingRegistry()
    const suite = makeTimingSuite()
    const runner = new Runner({
      id: 'test',
      dataDirectory: '',
      suite,
      stepRegistry: registry,
      logAdapter: getLogAdapterMemory(),
      testMode: true
    })

    // Set referenceTime to now
    ;(runner as any).referenceTime = Date.now()
    const delay = (runner as any)._calculateTimingDelay(10) // 10 s from now
    expect(delay).toBeGreaterThan(0)
    expect(delay).toBeLessThanOrEqual(10_000)
  })
})

describe('Runner timing — suite execution in testMode (delays skipped)', () => {
  test('steps without timing run without any referenceTime being set', async () => {
    executionOrder.length = 0
    const registry = createTimingRegistry()

    // Suite with no timing config at all
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

    // referenceTime must still be undefined (no timing config)
    expect((runner as any).referenceTime).toBeUndefined()
    // Both steps must have executed
    expect(executionOrder).toContain('StepA:TC 1')
    expect(executionOrder).toContain('StepB:TC 1')
  })

  test('referenceTime is set after startAfterStep completes', async () => {
    executionOrder.length = 0
    const registry = createTimingRegistry()
    const suite = makeTimingSuite({ startAfterStep: 'Step1', timedOffsetSeconds: 0 })

    const runner = new Runner({
      id: 'test',
      dataDirectory: '',
      suite,
      stepRegistry: registry,
      logAdapter: getLogAdapterMemory(),
      testMode: true
    })

    // Before run: referenceTime must be undefined
    expect((runner as any).referenceTime).toBeUndefined()

    await runner.run()

    // After run: referenceTime must have been set
    expect((runner as any).referenceTime).toBeDefined()
    expect(typeof (runner as any).referenceTime).toBe('number')
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

describe('Runner timing — testcaseDelaySeconds', () => {
  test('with testcaseDelaySeconds=0, all testcase instances are executed', async () => {
    executionOrder.length = 0
    const registry = createTimingRegistry()
    const suite = makeTimingSuite({ testcaseDelaySeconds: 0, timedOffsetSeconds: 0 })

    const runner = new Runner({
      id: 'test',
      dataDirectory: '',
      suite,
      stepRegistry: registry,
      logAdapter: getLogAdapterMemory(),
      testMode: true
    })

    await runner.run()

    const timedStepEntries = executionOrder.filter((e) => e.startsWith('TimedStep:'))
    expect(timedStepEntries).toHaveLength(2)
  })

  test('timing config is stored on runner', () => {
    const registry = createTimingRegistry()
    const suite = makeTimingSuite({
      startAfterStep: 'Step2',
      testcaseDelaySeconds: 0.5,
      timedOffsetSeconds: 10
    })

    const runner = new Runner({
      id: 'test',
      dataDirectory: '',
      suite,
      stepRegistry: registry,
      logAdapter: getLogAdapterMemory(),
      testMode: true
    })

    const timing = (runner as any).timing
    expect(timing).toBeDefined()
    expect(timing.startAfterStep).toBe('Step2')
    expect(timing.testcaseDelaySeconds).toBe(0.5)
  })
})

describe('Runner timing — suite without timing field', () => {
  test('timing property is undefined when suite has no timing config', () => {
    const registry = createTimingRegistry()

    const suite: SuiteDefinitionInterface = {
      name: 'untimed suite',
      executionMode: 'batch',
      steps: ['StepA'],
      stepDefinitions: {
        StepA: { id: 'normal', name: 'StepA', description: '' }
      },
      testcases: [{ name: 'TC 1', data: { StepA: {} } }]
    }

    const runner = new Runner({
      id: 'test',
      dataDirectory: '',
      suite,
      stepRegistry: registry,
      logAdapter: getLogAdapterMemory(),
      testMode: true
    })

    expect((runner as any).timing).toBeUndefined()
    expect((runner as any).referenceTime).toBeUndefined()
  })
})
