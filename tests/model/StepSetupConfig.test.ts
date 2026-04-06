import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { getLogAdapterMemory } from '../../src/logadapter/index'
import { EnvironmentRun } from '../../src/model/EnvironmentRun'
import { EnvironmentTestcase } from '../../src/model/EnvironmentTestcase'
import { StepSetupConfig } from '../../src/model/StepSetupConfig'

const VOLATILE = path.join(__dirname, '..', '..', 'tests', 'model', 'volatile', 'setup-config')

const testSchema = z.object({
  targetEnvironment: z.string().default('tu2'),
  kafka: z.object({
    brokers: z.string(),
    password: z.string()
  }),
  runner: z.object({
    testMode: z.boolean().default(false),
    maxParallelSteps: z.number().default(20)
  })
})

class TestSetupStep extends StepSetupConfig<typeof testSchema.shape> {
  getConfigSchema() {
    return testSchema
  }

  getSecrets() {
    return ['kafka.password']
  }
}

function createStep(configData?: { configFile: string; envPrefix?: string }): TestSetupStep {
  const step = new TestSetupStep({ name: 'SetupConfig' })
  const tcEnv1 = new EnvironmentTestcase({ name: 'TC 1' })
  const tcEnv2 = new EnvironmentTestcase({ name: 'TC 2' })
  const runEnv = new EnvironmentRun()

  step.environmentTestcase = [tcEnv1, tcEnv2]
  step.environmentRun = runEnv
  step.logAdapter = getLogAdapterMemory()

  if (configData) {
    // Same data for all testcases (as is typical)
    step.data = [configData, configData]
  }

  return step
}

beforeEach(async () => {
  await fs.rm(VOLATILE, { recursive: true, force: true })
  await fs.mkdir(VOLATILE, { recursive: true })
})

afterAll(async () => {
  await fs.rm(VOLATILE, { recursive: true, force: true })
})

test('loads config and writes to environmentRun.map', async () => {
  const configFile = path.join(VOLATILE, 'config.json')
  await fs.writeFile(
    configFile,
    JSON.stringify({
      kafka: { brokers: 'localhost:9092', password: 'secret' },
      runner: { testMode: true }
    })
  )

  const step = createStep({ configFile })
  await step.run()

  expect(step.environmentRun?.map.get('targetEnvironment')).toBe('tu2') // default
  expect(step.environmentRun?.map.get('kafka')).toEqual({
    brokers: 'localhost:9092',
    password: 'secret'
  })
  expect(step.environmentRun?.map.get('runner')).toEqual({
    testMode: true,
    maxParallelSteps: 20 // default
  })
})

test('env variables override config file', async () => {
  const configFile = path.join(VOLATILE, 'config.json')
  await fs.writeFile(
    configFile,
    JSON.stringify({
      kafka: { brokers: 'file-brokers', password: 'file-pw' },
      runner: { testMode: false }
    })
  )

  process.env.MYPREFIX_KAFKA_BROKERS = 'env-brokers'
  try {
    const step = createStep({ configFile, envPrefix: 'MYPREFIX' })
    await step.run()

    expect(step.environmentRun?.map.get('kafka')).toEqual({
      brokers: 'env-brokers', // from env
      password: 'file-pw' // from file
    })
  } finally {
    delete process.env.MYPREFIX_KAFKA_BROKERS
  }
})

test('deep-merges with existing environmentRun values', async () => {
  const configFile = path.join(VOLATILE, 'config.json')
  await fs.writeFile(
    configFile,
    JSON.stringify({
      kafka: { brokers: 'new-brokers', password: 'pw' },
      runner: { testMode: true }
    })
  )

  const step = createStep({ configFile })
  // Pre-set some values in the run environment
  step.environmentRun?.map.set('runner', { existingKey: 'keep-me' })

  await step.run()

  // Should be deep-merged
  const runner = step.environmentRun?.map.get('runner')
  expect(runner.testMode).toBe(true)
  expect(runner.maxParallelSteps).toBe(20)
  expect(runner.existingKey).toBe('keep-me')
})

test('skips gracefully when no data provided', async () => {
  const step = createStep()
  step.data = []

  // Should not throw
  await step.run()
})

test('skips gracefully when no configFile in data', async () => {
  const step = createStep()
  step.data = [{}]

  // Should not throw
  await step.run()
})

test('throws on invalid config (missing required field)', async () => {
  const configFile = path.join(VOLATILE, 'config.json')
  await fs.writeFile(
    configFile,
    JSON.stringify({
      // kafka is missing entirely — required by schema
      runner: { testMode: true }
    })
  )

  const step = createStep({ configFile })
  await expect(step.run()).rejects.toThrow('Config validation failed')
})
