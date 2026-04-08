import { LogAdapterMemory } from '../../src/logadapter/index'
import type { LogMessageInterface } from '../../src/logadapter/interfaceLogMessage'
import { getDefaultLogMessage } from './helper'

test('log run', async () => {
  const logAdapter = new LogAdapterMemory({ logLevel: 2 })

  const resRun: any = []
  const resTc: any = []
  const resStep: any = []
  logAdapter._logRun = (logMessage: LogMessageInterface) => {
    resRun.push(logMessage)
    return Promise.resolve()
  }
  logAdapter._logTestcase = (logMessage: LogMessageInterface) => {
    resTc.push(logMessage)
    return Promise.resolve()
  }
  logAdapter._logStep = (logMessage: LogMessageInterface) => {
    resStep.push(logMessage)
    return Promise.resolve()
  }

  const logMessage = getDefaultLogMessage()
  logMessage.logLevel = 3
  delete logMessage.meta.tc
  delete logMessage.meta.step

  await logAdapter.log(logMessage)

  expect(resRun).toEqual([{ ...logMessage, logLevel: 'error' }])
  expect(resTc).toEqual([])
  expect(resStep).toEqual([])
})

test('log test case', async () => {
  const logAdapter = new LogAdapterMemory({ logLevel: 2 })

  const resRun: any = []
  const resTc: any = []
  const resStep: any = []
  logAdapter._logRun = (logMessage: LogMessageInterface) => {
    resRun.push(logMessage)
    return Promise.resolve()
  }
  logAdapter._logTestcase = (logMessage: LogMessageInterface) => {
    resTc.push(logMessage)
    return Promise.resolve()
  }
  logAdapter._logStep = (logMessage: LogMessageInterface) => {
    resStep.push(logMessage)
    return Promise.resolve()
  }

  const logMessage = getDefaultLogMessage()
  logMessage.logLevel = 3
  delete logMessage.meta.step

  await logAdapter.log(logMessage)

  expect(resRun).toEqual([])
  expect(resTc).toEqual([{ ...logMessage, logLevel: 'error' }])
  expect(resStep).toEqual([])
})

test('log step', async () => {
  const logAdapter = new LogAdapterMemory({ logLevel: 2 })

  const resRun: any = []
  const resTc: any = []
  const resStep: any = []
  logAdapter._logRun = (logMessage: LogMessageInterface) => {
    resRun.push(logMessage)
    return Promise.resolve()
  }
  logAdapter._logTestcase = (logMessage: LogMessageInterface) => {
    resTc.push(logMessage)
    return Promise.resolve()
  }
  logAdapter._logStep = (logMessage: LogMessageInterface) => {
    resStep.push(logMessage)
    return Promise.resolve()
  }

  const logMessage = getDefaultLogMessage()
  logMessage.logLevel = 3

  await logAdapter.log(logMessage)

  expect(resRun).toEqual([])
  expect(resTc).toEqual([])
  expect(resStep).toEqual([{ ...logMessage, logLevel: 'error' }])
})

test('Test reset and log step', async () => {
  const logAdapter = new LogAdapterMemory({ logLevel: 2 })

  const logMessage = getDefaultLogMessage()
  logMessage.logLevel = 3

  await logAdapter.log(logMessage)

  expect(logAdapter.logs).toEqual({
    myRunId: {
      logs: [],
      testcases: {
        // biome-ignore lint/style/useNamingConvention: test fixture key matches testcase name format
        testcaseName_4: {
          countAll: 4,
          countCurrent: 2,
          logs: [],
          steps: {
            // biome-ignore lint/style/useNamingConvention: test fixture key matches step name format
            stepName_1: {
              logs: [
                {
                  countAll: 3,
                  countCurrent: 1,
                  data: { foo: 'bar' },
                  logLevel: 'error'
                }
              ]
            }
          }
        }
      }
    }
  })

  await logAdapter.reset()
  expect(logAdapter.logs).toEqual({})
})

test('Test log run', async () => {
  const logAdapter = new LogAdapterMemory({ logLevel: 2 })

  const logMessage = getDefaultLogMessage()
  logMessage.logLevel = 3
  delete logMessage.meta.tc
  delete logMessage.meta.step

  await logAdapter.log(logMessage)

  expect(logAdapter.logs).toEqual({
    myRunId: {
      logs: [{ data: { foo: 'bar' }, logLevel: 'error' }],
      testcases: {}
    }
  })

  await logAdapter.reset()
  expect(logAdapter.logs).toEqual({})
})

test('Test log test case', async () => {
  const logAdapter = new LogAdapterMemory({ logLevel: 2 })

  const logMessage = getDefaultLogMessage()
  logMessage.logLevel = 3
  delete logMessage.meta.step

  await logAdapter.log(logMessage)

  expect(logAdapter.logs).toEqual({
    myRunId: {
      logs: [],
      testcases: {
        // biome-ignore lint/style/useNamingConvention: test fixture key matches testcase name format
        testcaseName_4: {
          countAll: 4,
          countCurrent: 2,
          logs: [
            {
              countAll: 4,
              countCurrent: 2,
              data: { foo: 'bar' },
              logLevel: 'error'
            }
          ],
          steps: {}
        }
      }
    }
  })

  await logAdapter.reset()
  expect(logAdapter.logs).toEqual({})
})
