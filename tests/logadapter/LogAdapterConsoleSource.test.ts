import { LogAdapterConsole, type LogMessageInterface } from '../../src/logadapter/index'
import { getDefaultLogMessage } from './helper'

test('_logRun without source shows plain format', async () => {
  const logAdapter = new LogAdapterConsole()
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

  const logMessage = getDefaultLogMessage()
  logMessage.logLevel = 'error'
  delete logMessage.meta.tc
  delete logMessage.meta.step

  await logAdapter._logRun(logMessage)

  expect(consoleSpy).toHaveBeenCalledTimes(1)
  const callArg = consoleSpy.mock.calls[0][0]
  expect(callArg).toMatch(/^Run: /)
  expect(callArg).not.toContain('[SingleStep]')

  consoleSpy.mockRestore()
})

test('_logRun with source shows TC and step name', async () => {
  const logAdapter = new LogAdapterConsole()
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

  const logMessage: LogMessageInterface = getDefaultLogMessage()
  logMessage.logLevel = 'error'
  delete logMessage.meta.tc
  delete logMessage.meta.step
  logMessage.meta.source = {
    testcases: ['TC_14_TeilausfallBis'],
    stepName: 'SendRiFahrtV1Time'
  }

  await logAdapter._logRun(logMessage)

  expect(consoleSpy).toHaveBeenCalledTimes(1)
  const callArg = consoleSpy.mock.calls[0][0]
  expect(callArg).toContain('TC_14_TeilausfallBis')
  expect(callArg).toContain('SendRiFahrtV1Time')
  expect(callArg).not.toContain('[SingleStep]')

  consoleSpy.mockRestore()
})

test('_logRun with source and isSingleStep shows marker', async () => {
  const logAdapter = new LogAdapterConsole()
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

  const logMessage: LogMessageInterface = getDefaultLogMessage()
  logMessage.logLevel = 'error'
  delete logMessage.meta.tc
  delete logMessage.meta.step
  logMessage.meta.source = {
    testcases: ['TC_14_TeilausfallBis'],
    stepName: 'SendRiFahrtV1Time',
    isSingleStep: true
  }

  await logAdapter._logRun(logMessage)

  expect(consoleSpy).toHaveBeenCalledTimes(1)
  const callArg = consoleSpy.mock.calls[0][0]
  expect(callArg).toContain('[SingleStep]')
  expect(callArg).toContain('TC_14_TeilausfallBis')
  expect(callArg).toContain('SendRiFahrtV1Time')

  consoleSpy.mockRestore()
})

test('_logRun with source but no step name', async () => {
  const logAdapter = new LogAdapterConsole()
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

  const logMessage: LogMessageInterface = getDefaultLogMessage()
  logMessage.logLevel = 'error'
  delete logMessage.meta.tc
  delete logMessage.meta.step
  logMessage.meta.source = {
    testcases: ['TC_14_TeilausfallBis']
  }

  await logAdapter._logRun(logMessage)

  expect(consoleSpy).toHaveBeenCalledTimes(1)
  const callArg = consoleSpy.mock.calls[0][0]
  expect(callArg).toContain('TC_14_TeilausfallBis')
  expect(callArg).not.toContain(' → ')
  expect(callArg).not.toContain('[SingleStep]')

  consoleSpy.mockRestore()
})

test('_logRun with multiple testcases in source', async () => {
  const logAdapter = new LogAdapterConsole()
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

  const logMessage: LogMessageInterface = getDefaultLogMessage()
  logMessage.logLevel = 'error'
  delete logMessage.meta.tc
  delete logMessage.meta.step
  logMessage.meta.source = {
    testcases: ['TC_01_Grundfahrt', 'TC_02_Verspaetung'],
    stepName: 'SendRiFahrtV1Time'
  }

  await logAdapter._logRun(logMessage)

  expect(consoleSpy).toHaveBeenCalledTimes(1)
  const callArg = consoleSpy.mock.calls[0][0]
  expect(callArg).toContain('TC_01_Grundfahrt')
  expect(callArg).toContain('TC_02_Verspaetung')
  expect(callArg).toContain('SendRiFahrtV1Time')

  consoleSpy.mockRestore()
})
