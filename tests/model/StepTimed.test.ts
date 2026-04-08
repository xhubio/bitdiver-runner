import { DateTime } from 'luxon'
import { EnvironmentRun } from '../../src/model/EnvironmentRun'
import { EnvironmentTestcase } from '../../src/model/EnvironmentTestcase'
import { StepTimed } from '../../src/model/StepTimed'

class TestTimedStep extends StepTimed {
  executed = false
  executedAt = 0

  getReferenceTime(): string {
    return this.tc.map.get('startTime') as string
  }

  getOffsetSeconds(): number {
    return this.data?.offsetTime ?? 0
  }

  doRun(): Promise<void> {
    this.executed = true
    this.executedAt = Date.now()
    return Promise.resolve()
  }
}

function createStep(opts: { offsetTime: number; testMode?: boolean }): TestTimedStep {
  const step = new TestTimedStep({ name: 'timedTest' })
  const tcEnv = new EnvironmentTestcase()
  const runEnv = new EnvironmentRun()

  // Set reference time to now
  tcEnv.map.set('startTime', DateTime.now().toISO())
  step.environmentTestcase = tcEnv
  step.environmentRun = runEnv
  step.data = { offsetTime: opts.offsetTime }
  step.testMode = opts.testMode ?? false
  return step
}

test('doRun is called', async () => {
  const step = createStep({ offsetTime: 0, testMode: true })
  await step.run()
  expect(step.executed).toBe(true)
})

test('testMode skips delay', async () => {
  // Even with a large offset, testMode should execute immediately
  const step = createStep({ offsetTime: 9999, testMode: true })
  const before = Date.now()
  await step.run()
  const elapsed = Date.now() - before
  expect(step.executed).toBe(true)
  expect(elapsed).toBeLessThan(500) // Should be nearly instant
})

test('calculateDelay returns 0 in testMode', () => {
  const step = createStep({ offsetTime: 100, testMode: true })
  expect(step.calculateDelay()).toBe(0)
})

test('calculateDelay returns positive value for future offset', () => {
  const step = createStep({ offsetTime: 60 }) // 60 seconds in the future
  const delay = step.calculateDelay()
  // Should be roughly 60000ms, allow some tolerance
  expect(delay).toBeGreaterThan(55000)
  expect(delay).toBeLessThan(65000)
})

test('calculateDelay returns 0 for past offset', () => {
  const step = createStep({ offsetTime: -10 }) // 10 seconds in the past
  const delay = step.calculateDelay()
  expect(delay).toBe(0)
})

test('short delay executes without setTimeout', async () => {
  // Offset of 0 = delay should be ~0 (already past)
  const step = createStep({ offsetTime: 0 })
  const before = Date.now()
  await step.run()
  const elapsed = Date.now() - before
  expect(step.executed).toBe(true)
  expect(elapsed).toBeLessThan(500)
})
