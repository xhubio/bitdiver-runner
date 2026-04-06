import fs from 'node:fs'
import path from 'node:path'

import { getLogAdapterMemory } from '../../src/logadapter/index'
import { Runner } from '../../src/runner-server/index'
import { createRegistry } from './helper/helper'

const TIMEOUT = 1000000
const STEP_REGISTRY = createRegistry()
const LOG_ADAPTER = getLogAdapterMemory()
LOG_ADAPTER.level = 0

const VOLATILE = path.join(__dirname, 'volatile', 'RunnerSuite')
const FIXTURES = path.join(__dirname, 'fixtures', 'RunnerSuite')

beforeAll(async () => {
  await fs.promises.rm(VOLATILE, { recursive: true, force: true })
  await fs.promises.mkdir(VOLATILE, { recursive: true })
})

test(
  'Run with file logAdapter',
  async () => {
    const fileNameSuite = path.join(FIXTURES, 'suite_normal.json')
    const fileNameLogExpected = path.join(FIXTURES, 'suite_normal_log.json')
    const fileNameLogActual = path.join(VOLATILE, 'suite_normal_log.json')

    const suiteDefiniton = JSON.parse(await fs.promises.readFile(fileNameSuite, 'utf8'))

    const runner = new Runner({
      id: 'myGreatId',
      dataDirectory: '',
      suite: suiteDefiniton,
      stepRegistry: STEP_REGISTRY,
      logAdapter: LOG_ADAPTER,
      parallelExecution: true
    })

    await runner.run()

    const runId = runner.environmentRun?.id as string
    const runLog = LOG_ADAPTER.logs[runId].logs
    const tcLog = LOG_ADAPTER.logs[runId].testcases

    const expectedLogRaw = await fs.promises.readFile(fileNameLogExpected, 'utf8')
    const expectedLog = JSON.parse(expectedLogRaw)

    // the file is only written to have a new master if something is changed in the test
    await fs.promises.writeFile(fileNameLogActual, JSON.stringify(tcLog, null, 2), 'utf8')

    expect(runLog).toEqual([
      {
        data: {
          message: 'Start Run',
          stepCount: 6,
          suite: 'suite name',
          testCaseCount: 2
        },
        logLevel: 'info'
      }
    ])

    expect(tcLog).toEqual(expectedLog)
  },
  TIMEOUT
)
