import { describe, expect, test } from 'vitest'
import type { LogMessageInterface } from '../../src/logadapter/index'
import {
  EnvironmentRun,
  EnvironmentTestcase,
  REFERENCE_TIME_KEY,
  StepCheckStartTime
} from '../../src/model/index'

function makeStep(referenceTime: number | undefined): {
  step: StepCheckStartTime
  envRun: EnvironmentRun
  logs: LogMessageInterface[]
} {
  const step = new StepCheckStartTime({ name: 'CheckStartTime' })
  const envRun = new EnvironmentRun({ name: 'Suite' })
  step.environmentRun = envRun

  const logs: LogMessageInterface[] = []
  step.logAdapter = {
    log(msg: LogMessageInterface): Promise<void> {
      logs.push(msg)
      return Promise.resolve()
    },
    close(): Promise<void> {
      return Promise.resolve()
    }
  } as any

  const tcEnv = new EnvironmentTestcase()
  tcEnv.name = 'TC 1'
  step.environmentTestcase = [tcEnv]
  step.data = [null]

  if (referenceTime !== undefined) {
    envRun.map.set(REFERENCE_TIME_KEY, referenceTime)
  }

  step.testMode = true // skip actual waiting
  return { step, envRun, logs }
}

describe('StepCheckStartTime', () => {
  test('logs INFO and waits when on schedule (testMode)', async () => {
    const future = Date.now() + 5000
    const { step, logs } = makeStep(future)
    await step.run()

    const infoLogs = logs.filter((l) => l.logLevel === 'info')
    expect(infoLogs.length).toBeGreaterThan(0)
    const msg = infoLogs[0].data
    expect(msg.message).toContain('On schedule')
    expect(msg.waitMs).toBeGreaterThan(0)
  })

  test('logs FATAL when reference time is already in the past', async () => {
    const past = Date.now() - 5000
    const { step, logs } = makeStep(past)
    await step.run()

    const fatalLogs = logs.filter((l) => l.logLevel === 'fatal')
    expect(fatalLogs.length).toBeGreaterThan(0)
    const msg = fatalLogs[0].data
    expect(msg.message).toContain('overrun')
    expect(msg.overrunMs).toBeGreaterThan(0)
  })

  test('logs ERROR when referenceTime is not set', async () => {
    const { step, logs } = makeStep(undefined)
    await step.run()

    const errorLogs = logs.filter((l) => l.logLevel === 'error')
    expect(errorLogs.length).toBeGreaterThan(0)
    expect(errorLogs[0].data.message).toContain('No referenceTime set')
  })

  test('skips actual waiting in testMode', async () => {
    const future = Date.now() + 5000
    const { step } = makeStep(future)

    const before = Date.now()
    await step.run()
    const elapsed = Date.now() - before

    // testMode must skip the wait — should complete in well under 1s
    expect(elapsed).toBeLessThan(500)
  })
})
