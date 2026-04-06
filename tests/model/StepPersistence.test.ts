import fs from 'node:fs/promises'
import path from 'node:path'
import { EnvironmentTestcase } from '../../src/model/EnvironmentTestcase'
import { deleteVars, exportVars, loadVars, writeVars } from '../../src/model/StepPersistence'

const VOLATILE = path.join(__dirname, '..', '..', 'tests', 'model', 'volatile', 'persistence')

beforeEach(async () => {
  await fs.rm(VOLATILE, { recursive: true, force: true })
})

afterAll(async () => {
  await fs.rm(VOLATILE, { recursive: true, force: true })
})

test('writeVars writes JSON to disk', async () => {
  const tcEnv = new EnvironmentTestcase()
  tcEnv.map.set('myVar', { hello: 'world' })

  await writeVars(tcEnv, ['myVar'], VOLATILE)

  const content = await fs.readFile(path.join(VOLATILE, 'myVar.json'), 'utf8')
  expect(JSON.parse(content)).toEqual({ hello: 'world' })
})

test('writeVars writes strings directly', async () => {
  const tcEnv = new EnvironmentTestcase()
  tcEnv.map.set('raw', 'just a string')

  await writeVars(tcEnv, ['raw'], VOLATILE)

  const content = await fs.readFile(path.join(VOLATILE, 'raw.json'), 'utf8')
  expect(content).toBe('just a string')
})

test('loadVars reads JSON from disk into map', async () => {
  await fs.mkdir(VOLATILE, { recursive: true })
  await fs.writeFile(path.join(VOLATILE, 'myVar.json'), JSON.stringify({ loaded: true }))

  const tcEnv = new EnvironmentTestcase()
  const result = await loadVars(tcEnv, ['myVar'], VOLATILE)

  expect(result).toBe(true)
  expect(tcEnv.map.get('myVar')).toEqual({ loaded: true })
})

test('loadVars reads non-JSON as string', async () => {
  await fs.mkdir(VOLATILE, { recursive: true })
  await fs.writeFile(path.join(VOLATILE, 'raw.json'), 'not json')

  const tcEnv = new EnvironmentTestcase()
  const result = await loadVars(tcEnv, ['raw'], VOLATILE)

  expect(result).toBe(true)
  expect(tcEnv.map.get('raw')).toBe('not json')
})

test('loadVars throws on missing file', async () => {
  const tcEnv = new EnvironmentTestcase()
  await expect(loadVars(tcEnv, ['missing'], VOLATILE)).rejects.toThrow(
    "Failed to load variable 'missing'"
  )
})

test('loadVars with ignoreMissing returns false but does not throw', async () => {
  const tcEnv = new EnvironmentTestcase()
  const result = await loadVars(tcEnv, ['missing'], VOLATILE, { ignoreMissing: true })
  expect(result).toBe(false)
})

test('deleteVars removes from map', () => {
  const tcEnv = new EnvironmentTestcase()
  tcEnv.map.set('a', 1)
  tcEnv.map.set('b', 2)
  tcEnv.map.set('c', 3)

  deleteVars(tcEnv, ['a', 'c'])

  expect(tcEnv.map.has('a')).toBe(false)
  expect(tcEnv.map.has('b')).toBe(true)
  expect(tcEnv.map.has('c')).toBe(false)
})

test('exportVars writes to disk and removes from memory', async () => {
  const tcEnv = new EnvironmentTestcase()
  tcEnv.map.set('big', { lots: 'of data' })

  await exportVars(tcEnv, ['big'], VOLATILE)

  // Removed from memory
  expect(tcEnv.map.has('big')).toBe(false)

  // But exists on disk
  const content = await fs.readFile(path.join(VOLATILE, 'big.json'), 'utf8')
  expect(JSON.parse(content)).toEqual({ lots: 'of data' })
})

test('roundtrip: write → delete → load', async () => {
  const tcEnv = new EnvironmentTestcase()
  tcEnv.map.set('data', [1, 2, 3])

  await writeVars(tcEnv, ['data'], VOLATILE)
  deleteVars(tcEnv, ['data'])
  expect(tcEnv.map.has('data')).toBe(false)

  await loadVars(tcEnv, ['data'], VOLATILE)
  expect(tcEnv.map.get('data')).toEqual([1, 2, 3])
})
