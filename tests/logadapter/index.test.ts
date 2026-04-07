import {
  // LogAdapterFile,
  getLogAdapterConsole,
  getLogAdapterFile,
  getLogAdapterMemory,
  LEVEL_DEBUG,
  LEVEL_ERROR,
  LEVEL_FATAL,
  LEVEL_INFO,
  LEVEL_WARNING,
  LogAdapterConsole,
  LogAdapterConsoleJson,
  LogAdapterMemory
} from '../../src/logadapter/index'

test('LEVEL_DEBUG', () => {
  expect(LEVEL_DEBUG).toEqual('debug')
})
test('LEVEL_INFO', () => {
  expect(LEVEL_INFO).toEqual('info')
})
test('LEVEL_WARNING', () => {
  expect(LEVEL_WARNING).toEqual('warning')
})
test('LEVEL_ERROR', () => {
  expect(LEVEL_ERROR).toEqual('error')
})
test('LEVEL_FATAL', () => {
  expect(LEVEL_FATAL).toEqual('fatal')
})

test('LogAdapterConsole', () => {
  const logAdapter = new LogAdapterConsole()
  expect(logAdapter).toBeDefined()
})

test('LogAdapterConsoleJson', () => {
  const logAdapter = new LogAdapterConsoleJson()
  expect(logAdapter).toBeDefined()
})

test('LogAdapterMemory', () => {
  const logAdapter = new LogAdapterMemory()
  expect(logAdapter).toBeDefined()
})

// test('LogAdapterFile', () => {
//   const logAdapter = new LogAdapterFile()
//   expect(logAdapter).toBeDefined()
// })

test('getLogAdapterConsole', () => {
  const logAdapter = getLogAdapterConsole()
  expect(logAdapter).toBeDefined()
})

test('getLogAdapterMemory', () => {
  const logAdapter = getLogAdapterMemory()
  expect(logAdapter).toBeDefined()
})

test('getLogAdapterFile', () => {
  const logAdapter = getLogAdapterFile()
  expect(logAdapter).toBeDefined()
})
