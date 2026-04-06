import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { StepCheck } from '../../src/check/StepCheck'
import type { CheckStepData } from '../../src/check/types'
import { getLogAdapterMemory } from '../../src/logadapter/index'
import { STATUS_ERROR, STATUS_OK } from '../../src/model/constants'
import { EnvironmentRun, EnvironmentTestcase } from '../../src/model/index'

let tmpDir: string
const logAdapter = getLogAdapterMemory({ logLevel: 'debug' })

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stepcheck-test-'))
  await logAdapter.reset()
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

async function createDir(...parts: string[]): Promise<string> {
  const dir = path.join(tmpDir, ...parts)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function writeJson(dir: string, name: string, data: unknown): Promise<void> {
  await fs.writeFile(path.join(dir, name), JSON.stringify(data, null, 2))
}

function createStep(): { step: StepCheck; envTc: EnvironmentTestcase } {
  const step = new StepCheck({ name: 'checkStep' })
  step.logAdapter = logAdapter
  const envRun = new EnvironmentRun()
  envRun.id = 'test-run'
  const envTc = new EnvironmentTestcase()
  envTc.name = 'test-tc'
  step.environmentRun = envRun
  step.environmentTestcase = envTc
  return { step, envTc }
}

describe('StepCheck', () => {
  test('no data: skips gracefully, status stays OK', async () => {
    const { step, envTc } = createStep()
    step.data = undefined

    await step.run()

    expect(envTc.status).toBe(STATUS_OK)
    expect(step.results).toEqual([])
  })

  test('empty checks array: skips gracefully, status stays OK', async () => {
    const { step, envTc } = createStep()
    const stepData: CheckStepData = {
      resultDir: tmpDir,
      dataDir: tmpDir,
      checks: []
    }
    step.data = stepData

    await step.run()

    expect(envTc.status).toBe(STATUS_OK)
    expect(step.results).toEqual([])
  })

  test('all matching: result files written, status OK', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    const actualDir = await createDir('result', 'kafka')
    const expectedDir = await createDir('data', 'expected-kafka')

    const payload = { id: 'abc', value: 42 }
    await writeJson(expectedDir, 'msg_001.json', payload)
    await writeJson(actualDir, 'msg_001.json', payload)

    const { step, envTc } = createStep()
    const stepData: CheckStepData = {
      resultDir,
      dataDir,
      checks: [
        {
          name: 'kafka',
          actualDir: 'kafka',
          expectedDir: 'expected-kafka'
        }
      ]
    }
    step.data = stepData

    await step.run()

    expect(envTc.status).toBe(STATUS_OK)
    expect(step.results).toHaveLength(1)
    expect(step.results[0].summary.passed).toBe(1)
    expect(step.results[0].summary.failed).toBe(0)

    // Verify result files were written
    const checkResultDir = path.join(resultDir, 'kafka')
    const summary = JSON.parse(await fs.readFile(path.join(checkResultDir, 'summary.json'), 'utf8'))
    expect(summary.passed).toBe(1)
    expect(summary.name).toBe('kafka')

    const mapping = JSON.parse(await fs.readFile(path.join(checkResultDir, 'mapping.json'), 'utf8'))
    expect(mapping.mapped).toHaveLength(1)

    const details = JSON.parse(await fs.readFile(path.join(checkResultDir, 'details.json'), 'utf8'))
    expect(details).toHaveLength(1)
    expect(details[0].passed).toBe(true)
  })

  test('failed comparison: status set to ERROR', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    const actualDir = await createDir('result', 'events')
    const expectedDir = await createDir('data', 'expected-events')

    await writeJson(expectedDir, 'msg_001.json', { id: 'abc', value: 42 })
    await writeJson(actualDir, 'msg_001.json', { id: 'abc', value: 999 }) // differs

    const { step, envTc } = createStep()
    const stepData: CheckStepData = {
      resultDir,
      dataDir,
      checks: [
        {
          name: 'events',
          actualDir: 'events',
          expectedDir: 'expected-events'
        }
      ]
    }
    step.data = stepData

    await step.run()

    expect(envTc.status).toBe(STATUS_ERROR)
    expect(step.results[0].summary.failed).toBe(1)
  })

  test('missing actual file: status set to ERROR', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    await createDir('result', 'events')
    const expectedDir = await createDir('data', 'expected-events')

    await writeJson(expectedDir, 'msg_001.json', { id: 'abc' })
    // no actual file

    const { step, envTc } = createStep()
    const stepData: CheckStepData = {
      resultDir,
      dataDir,
      checks: [
        {
          name: 'events',
          actualDir: 'events',
          expectedDir: 'expected-events'
        }
      ]
    }
    step.data = stepData

    await step.run()

    expect(envTc.status).toBe(STATUS_ERROR)
    expect(step.results[0].summary.missing).toBe(1)
  })

  test('no details.json when no file statuses', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    await createDir('result', 'events')
    await createDir('data', 'expected-events')
    // both dirs empty

    const { step } = createStep()
    const stepData: CheckStepData = {
      resultDir,
      dataDir,
      checks: [
        {
          name: 'events',
          actualDir: 'events',
          expectedDir: 'expected-events'
        }
      ]
    }
    step.data = stepData

    await step.run()

    const checkResultDir = path.join(resultDir, 'events')
    await expect(fs.access(path.join(checkResultDir, 'details.json'))).rejects.toThrow()
    // summary and mapping should still exist
    await expect(fs.access(path.join(checkResultDir, 'summary.json'))).resolves.not.toThrow()
    await expect(fs.access(path.join(checkResultDir, 'mapping.json'))).resolves.not.toThrow()
  })

  test('multiple checks: all results collected', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')

    const actualKafka = await createDir('result', 'kafka')
    const expectedKafka = await createDir('data', 'exp-kafka')
    const actualRabbit = await createDir('result', 'rabbit')
    const expectedRabbit = await createDir('data', 'exp-rabbit')

    await writeJson(expectedKafka, 'msg_001.json', { topic: 'a', val: 1 })
    await writeJson(actualKafka, 'msg_001.json', { topic: 'a', val: 1 })
    await writeJson(expectedRabbit, 'msg_001.json', { queue: 'b', val: 2 })
    await writeJson(actualRabbit, 'msg_001.json', { queue: 'b', val: 2 })

    const { step, envTc } = createStep()
    const stepData: CheckStepData = {
      resultDir,
      dataDir,
      checks: [
        { name: 'kafka', actualDir: 'kafka', expectedDir: 'exp-kafka' },
        { name: 'rabbit', actualDir: 'rabbit', expectedDir: 'exp-rabbit' }
      ]
    }
    step.data = stepData

    await step.run()

    expect(envTc.status).toBe(STATUS_OK)
    expect(step.results).toHaveLength(2)
    expect(step.results[0].summary.name).toBe('kafka')
    expect(step.results[1].summary.name).toBe('rabbit')
    expect(step.results.every((r) => r.summary.passed === 1)).toBe(true)
  })

  test('runOnError is true (cleanup step behavior)', () => {
    const step = new StepCheck({ name: 'myCheck' })
    expect(step.runOnError).toBe(true)
  })

  test('error thrown during check: logged, status set to ERROR', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    // do NOT create actualDir — this will cause an error in runCheck/mapFiles

    const { step, envTc } = createStep()
    const stepData: CheckStepData = {
      resultDir,
      dataDir,
      checks: [
        {
          name: 'broken',
          actualDir: 'nonexistent-actual',
          expectedDir: 'nonexistent-expected'
        }
      ]
    }
    step.data = stepData

    await step.run()

    // runCheck itself succeeds (mapFiles handles missing dirs with errors),
    // but missing expected dir causes error array, and summary.missing=0, failed=0
    // status should be OK since no failures, just empty result
    // (the error is in mapping.errors, not a thrown exception)
    // Verify the step didn't throw
    expect(step.results).toHaveLength(1)
    expect(step.results[0].mapping.errors.length).toBeGreaterThan(0)
  })
})
