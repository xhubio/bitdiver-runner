import { describe, expect, test } from 'vitest'
import { getLogAdapterMemory } from '../../src/logadapter/index'
import {
  EnvironmentRun,
  EnvironmentTestcase,
  REFERENCE_TIME_KEY,
  StepDetermineStartTime
} from '../../src/model/index'

function makeStep(
  opts: { offsetSeconds?: number; delaySeconds?: number; testcaseCount?: number } = {}
): {
  step: StepDetermineStartTime
  envRun: EnvironmentRun
} {
  const { offsetSeconds, delaySeconds, testcaseCount = 1 } = opts
  const step = new StepDetermineStartTime({ name: 'DetermineStartTime' })
  const envRun = new EnvironmentRun({ name: 'Suite' })
  step.environmentRun = envRun
  step.logAdapter = getLogAdapterMemory()

  const envTcs: EnvironmentTestcase[] = []
  const data: any[] = []
  for (let i = 0; i < testcaseCount; i++) {
    const tcEnv = new EnvironmentTestcase()
    tcEnv.name = `TC ${String(i + 1)}`
    envTcs.push(tcEnv)
    data.push({ offsetSeconds, delaySeconds })
  }
  step.environmentTestcase = envTcs
  step.data = data

  return { step, envRun }
}

describe('StepDetermineStartTime', () => {
  test('writes referenceTime to environmentRun.map', async () => {
    const { step, envRun } = makeStep({ offsetSeconds: 10, delaySeconds: 0 })
    const before = Date.now()
    await step.run()
    const after = Date.now()

    const refTime = envRun.map.get(REFERENCE_TIME_KEY) as number
    expect(typeof refTime).toBe('number')
    expect(refTime).toBeGreaterThanOrEqual(before + 10_000)
    expect(refTime).toBeLessThanOrEqual(after + 10_000)
  })

  test('applies delay per active testcase', async () => {
    const { step, envRun } = makeStep({
      offsetSeconds: 0,
      delaySeconds: 0.5,
      testcaseCount: 4
    })
    const before = Date.now()
    await step.run()
    const after = Date.now()

    const refTime = envRun.map.get(REFERENCE_TIME_KEY) as number
    // 4 * 0.5s = 2s
    expect(refTime).toBeGreaterThanOrEqual(before + 2000)
    expect(refTime).toBeLessThanOrEqual(after + 2000)
  })

  test('defaults offset and delay to 0 when omitted', async () => {
    const { step, envRun } = makeStep({ testcaseCount: 3 })
    const before = Date.now()
    await step.run()
    const after = Date.now()

    const refTime = envRun.map.get(REFERENCE_TIME_KEY) as number
    // no offset, no delay → referenceTime ≈ now
    expect(refTime).toBeGreaterThanOrEqual(before)
    expect(refTime).toBeLessThanOrEqual(after + 10)
  })

  test('combines offset and per-testcase delay', async () => {
    const { step, envRun } = makeStep({
      offsetSeconds: 40,
      delaySeconds: 0.3,
      testcaseCount: 10
    })
    const before = Date.now()
    await step.run()
    const after = Date.now()

    const refTime = envRun.map.get(REFERENCE_TIME_KEY) as number
    // 40s + 10 * 0.3s = 43s
    expect(refTime).toBeGreaterThanOrEqual(before + 43_000)
    expect(refTime).toBeLessThanOrEqual(after + 43_000)
  })
})
