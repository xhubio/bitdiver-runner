import fs from 'node:fs'
import path from 'node:path'
import globby from 'globby'
import { DateTime } from 'luxon'
import { DEFAULT_TIME_FORMAT_FILE, LogAdapterFile } from '../../src/logadapter/index'
import { getDefaultLogMessage } from './helper'

const LOG_PATH = path.join(__dirname, 'volatile')

beforeAll(async () => {
  await fs.promises.rm(LOG_PATH, { recursive: true, force: true })
})

test('Log Message Run', async () => {
  const logAdapter = new LogAdapterFile({
    targetDir: LOG_PATH,
    logLevel: 3
  })

  const timeNow = DateTime.fromISO('2022-06-26T10:12:00+02:00').toMillis()
  const timeStart = DateTime.fromISO('2022-06-26T10:11:00+02:00').toMillis()

  const logMessage = getDefaultLogMessage()
  logMessage.logLevel = 3
  logMessage.meta.run.start = timeStart
  logMessage.meta.logTime = timeNow
  delete logMessage.meta.tc
  delete logMessage.meta.step

  await logAdapter.log(logMessage)

  const suiteName = `Run_myRunName_${DateTime.fromMillis(timeStart).toFormat(
    DEFAULT_TIME_FORMAT_FILE
  )}`
  const fileName = `${DateTime.fromMillis(timeNow).toFormat(DEFAULT_TIME_FORMAT_FILE)}`

  const rootGlob = path.join(LOG_PATH, `${suiteName}/**/*.json`)
  const files = await globby([rootGlob])

  expect(files.length).toBe(1)
  for (let i = 0; i < files.length; i++) {
    files[i] = path.relative(LOG_PATH, files[i])
  }

  expect(files).toEqual([`${suiteName}/${fileName}_error.json`])
})

test('Log Message Testcase', async () => {
  const logAdapter = new LogAdapterFile({
    targetDir: LOG_PATH,
    logLevel: 3
  })

  const timeNow = DateTime.fromISO('2022-06-27T10:12:00+02:00').toMillis()
  const timeStart = DateTime.fromISO('2022-06-27T10:11:00+02:00').toMillis()

  const logMessage = getDefaultLogMessage()
  logMessage.meta.logTime = timeNow
  logMessage.meta.run.start = timeStart
  logMessage.logLevel = 3
  // delete logMessage.meta.tc
  delete logMessage.meta.step

  await logAdapter.log(logMessage)

  const suiteName = `Run_myRunName_${DateTime.fromMillis(timeStart).toFormat(
    DEFAULT_TIME_FORMAT_FILE
  )}`
  const fileName = `${DateTime.fromMillis(timeNow).toFormat(DEFAULT_TIME_FORMAT_FILE)}`

  const rootGlob = path.join(LOG_PATH, `${suiteName}/**/*.json`)
  const files = await globby([rootGlob])

  expect(files.length).toBe(1)
  for (let i = 0; i < files.length; i++) {
    files[i] = path.relative(LOG_PATH, files[i])
  }

  expect(files).toEqual([`${suiteName}/TC_2_testcaseName_4/${fileName}_error.json`])
})

test('Log Message Step', async () => {
  const logAdapter = new LogAdapterFile({
    targetDir: LOG_PATH,
    logLevel: 3
  })

  const timeNow = DateTime.fromISO('2022-06-28T10:12:00+02:00').toMillis()
  const timeStart = DateTime.fromISO('2022-06-28T10:11:00+02:00').toMillis()

  const logMessage = getDefaultLogMessage()
  logMessage.meta.run.start = timeStart
  logMessage.meta.logTime = timeNow
  logMessage.logLevel = 3

  await logAdapter.log(logMessage)

  const suiteName = `Run_myRunName_${DateTime.fromMillis(timeStart).toFormat(
    DEFAULT_TIME_FORMAT_FILE
  )}`
  const fileName = `${DateTime.fromMillis(timeNow).toFormat(DEFAULT_TIME_FORMAT_FILE)}`

  const rootGlob = path.join(LOG_PATH, `${suiteName}/**/*.json`)
  const files = await globby([rootGlob])

  expect(files.length).toBe(1)
  for (let i = 0; i < files.length; i++) {
    files[i] = path.relative(LOG_PATH, files[i])
  }

  expect(files).toEqual([
    `${suiteName}/TC_2_testcaseName_4/Step_1_stepName_1/${fileName}_error.json`
  ])
})
