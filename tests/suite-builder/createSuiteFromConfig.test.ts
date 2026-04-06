import fs from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createSuiteFromConfig } from '../../src/suite-builder/createSuiteFromConfig'

const VOLATILE_DIR = path.join(__dirname, '..', '..', 'volatile', 'testdata-suite')

async function writeJson(filePath: string, content: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(content), 'utf8')
}

const sampleConfig = {
  name: 'Test Suite Config',
  timedStepMapping: {
    'ri-fahrt-v1': 'SendRiFahrtV1Time',
    'bi-basis-v3': 'SendBiBasisV3Time'
  },
  suiteTypes: {
    TEST_FIX: {
      setup: ['SetupStep', 'LoginStep'],
      timed: 'auto',
      teardown: ['CleanupStep']
    },
    MINIMAL: {
      setup: [],
      timed: 'auto',
      teardown: []
    },
    NO_TIMED: {
      setup: ['SetupStep'],
      timed: [],
      teardown: ['CleanupStep']
    }
  }
}

beforeAll(async () => {
  await fs.mkdir(VOLATILE_DIR, { recursive: true })

  // TC_01 with timed files
  await writeJson(path.join(VOLATILE_DIR, 'TC_01', '1_ri-fahrt-v1_train_A.json'), { id: 'A' })
  await writeJson(path.join(VOLATILE_DIR, 'TC_01', '120_ri-fahrt-v1_train_B.json'), { id: 'B' })
  await writeJson(path.join(VOLATILE_DIR, 'TC_01', '120_bi-basis-v3_train_C.json'), { id: 'C' })
  await writeJson(path.join(VOLATILE_DIR, 'TC_01', 'JourneyDuration.json'), { ignore: true })

  // TC_02 with different timed files
  await writeJson(path.join(VOLATILE_DIR, 'TC_02', '1_ri-fahrt-v1_train_D.json'), { id: 'D' })
  await writeJson(path.join(VOLATILE_DIR, 'TC_02', '300_ri-fahrt-v1_train_E.json'), { id: 'E' })
})

afterAll(async () => {
  await fs.rm(VOLATILE_DIR, { recursive: true, force: true })
})

describe('createSuiteFromConfig', () => {
  test('creates a complete suite with setup + timed + teardown phases', async () => {
    const suite = await createSuiteFromConfig({
      config: sampleConfig,
      suiteType: 'TEST_FIX',
      testDataDir: VOLATILE_DIR,
      suiteName: 'My Suite'
    })

    expect(suite.name).toBe('My Suite')
    expect(suite.executionMode).toBe('batch')
    expect(suite.steps).toBeDefined()
    expect(suite.stepDefinitions).toBeDefined()
    expect(suite.testcases).toHaveLength(2)
  })

  test('step order is: setup steps → timed steps (sorted by time) → teardown steps', async () => {
    const suite = await createSuiteFromConfig({
      config: sampleConfig,
      suiteType: 'TEST_FIX',
      testDataDir: VOLATILE_DIR,
      suiteName: 'My Suite'
    })

    const steps = suite.steps
    expect(steps[0]).toBe('SetupStep')
    expect(steps[1]).toBe('LoginStep')

    // timed steps sorted by time: time=1 first, then time=120 (bi-basis before ri-fahrt), then time=300
    const timedSteps = steps.slice(2, steps.length - 1)
    expect(timedSteps[0]).toMatch(/1$/) // ends with time 1
    expect(timedSteps[timedSteps.length - 1]).toMatch(/300$/) // ends with time 300

    expect(steps[steps.length - 1]).toBe('CleanupStep')
  })

  test('timed step names include the time offset', async () => {
    const suite = await createSuiteFromConfig({
      config: sampleConfig,
      suiteType: 'TEST_FIX',
      testDataDir: VOLATILE_DIR,
      suiteName: 'My Suite'
    })

    const timedStepNames = suite.steps.filter(
      (s) => s !== 'SetupStep' && s !== 'LoginStep' && s !== 'CleanupStep'
    )

    expect(timedStepNames).toContain('SendRiFahrtV1Time 1')
    expect(timedStepNames).toContain('SendRiFahrtV1Time 120')
    expect(timedStepNames).toContain('SendBiBasisV3Time 120')
    expect(timedStepNames).toContain('SendRiFahrtV1Time 300')
  })

  test('testcase data is sparse (only timed steps have data)', async () => {
    const suite = await createSuiteFromConfig({
      config: sampleConfig,
      suiteType: 'TEST_FIX',
      testDataDir: VOLATILE_DIR,
      suiteName: 'My Suite'
    })

    const tc01 = suite.testcases.find((tc) => tc.name === 'TC_01')!
    expect(tc01).toBeDefined()
    const d01 = tc01.data as Record<string, any>

    // Setup/teardown steps have no data
    expect(d01.SetupStep).toBeUndefined()
    expect(d01.LoginStep).toBeUndefined()
    expect(d01.CleanupStep).toBeUndefined()

    // Timed steps have data (keys contain spaces — must use bracket notation)
    expect(d01['SendRiFahrtV1Time 1']).toBeDefined()
    expect(d01['SendRiFahrtV1Time 1'].offsetTime).toBe(1)
    expect(d01['SendRiFahrtV1Time 1'].files).toHaveLength(1)
  })

  test('TC_02 only has data for its own files', async () => {
    const suite = await createSuiteFromConfig({
      config: sampleConfig,
      suiteType: 'TEST_FIX',
      testDataDir: VOLATILE_DIR,
      suiteName: 'My Suite'
    })

    const tc02 = suite.testcases.find((tc) => tc.name === 'TC_02')!
    expect(tc02).toBeDefined()
    const d02 = tc02.data as Record<string, any>

    // TC_02 has time=1 and time=300
    expect(d02['SendRiFahrtV1Time 1']).toBeDefined()
    expect(d02['SendRiFahrtV1Time 300']).toBeDefined()

    // TC_02 has no time=120 data
    expect(d02['SendRiFahrtV1Time 120']).toBeUndefined()
    expect(d02['SendBiBasisV3Time 120']).toBeUndefined()
  })

  test('unknown suite type throws error', async () => {
    await expect(
      createSuiteFromConfig({
        config: sampleConfig,
        suiteType: 'DOES_NOT_EXIST',
        testDataDir: VOLATILE_DIR,
        suiteName: 'My Suite'
      })
    ).rejects.toThrow("Unknown suite type 'DOES_NOT_EXIST'")
  })

  test('error message for unknown suite type lists available types', async () => {
    await expect(
      createSuiteFromConfig({
        config: sampleConfig,
        suiteType: 'DOES_NOT_EXIST',
        testDataDir: VOLATILE_DIR,
        suiteName: 'My Suite'
      })
    ).rejects.toThrow('TEST_FIX')
  })

  test('empty testdata dir throws error', async () => {
    const emptyDir = path.join(__dirname, '..', '..', 'volatile', 'testdata-suite-empty')
    await fs.mkdir(emptyDir, { recursive: true })

    try {
      await expect(
        createSuiteFromConfig({
          config: sampleConfig,
          suiteType: 'TEST_FIX',
          testDataDir: emptyDir,
          suiteName: 'My Suite'
        })
      ).rejects.toThrow('No testcase directories found')
    } finally {
      await fs.rm(emptyDir, { recursive: true, force: true })
    }
  })

  test('validates config with Zod (invalid config throws)', async () => {
    await expect(
      createSuiteFromConfig({
        config: { suiteTypes: 'not-an-object' },
        suiteType: 'TEST_FIX',
        testDataDir: VOLATILE_DIR,
        suiteName: 'My Suite'
      })
    ).rejects.toThrow()
  })

  test('timed steps use the mapping correctly', async () => {
    const suite = await createSuiteFromConfig({
      config: sampleConfig,
      suiteType: 'TEST_FIX',
      testDataDir: VOLATILE_DIR,
      suiteName: 'My Suite'
    })

    // step definition id should match mapping value
    const stepDef = suite.stepDefinitions['SendRiFahrtV1Time 1']
    expect(stepDef).toBeDefined()
    expect(stepDef.id).toBe('SendRiFahrtV1Time')
    expect(stepDef.name).toBe('SendRiFahrtV1Time 1')
  })

  test('executionMode defaults to batch', async () => {
    const suite = await createSuiteFromConfig({
      config: sampleConfig,
      suiteType: 'TEST_FIX',
      testDataDir: VOLATILE_DIR,
      suiteName: 'My Suite'
    })
    expect(suite.executionMode).toBe('batch')
  })

  test('executionMode can be overridden to normal', async () => {
    const suite = await createSuiteFromConfig({
      config: sampleConfig,
      suiteType: 'TEST_FIX',
      testDataDir: VOLATILE_DIR,
      suiteName: 'My Suite',
      executionMode: 'normal'
    })
    expect(suite.executionMode).toBe('normal')
  })

  test('suite type with no timed steps (timed=[]) produces only setup and teardown', async () => {
    const suite = await createSuiteFromConfig({
      config: sampleConfig,
      suiteType: 'NO_TIMED',
      testDataDir: VOLATILE_DIR,
      suiteName: 'No Timed Suite'
    })

    expect(suite.steps).toEqual(['SetupStep', 'CleanupStep'])
  })

  test('stepDefinitions contains all steps in step order', async () => {
    const suite = await createSuiteFromConfig({
      config: sampleConfig,
      suiteType: 'TEST_FIX',
      testDataDir: VOLATILE_DIR,
      suiteName: 'My Suite'
    })

    for (const stepName of suite.steps) {
      expect(suite.stepDefinitions[stepName]).toBeDefined()
    }
  })
})
