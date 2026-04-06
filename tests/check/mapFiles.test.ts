import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mapFiles } from '../../src/check/mapFiles'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mapfiles-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

async function createDir(name: string): Promise<string> {
  const dir = path.join(tmpDir, name)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function writeJson(dir: string, name: string, data: object): Promise<void> {
  await fs.writeFile(path.join(dir, name), JSON.stringify(data))
}

describe('mapFiles', () => {
  test('all files match: all mapped, missing and unexpected empty', async () => {
    const expectedDir = await createDir('expected')
    const actualDir = await createDir('actual')

    await writeJson(expectedDir, 'event_001.json', { id: 1 })
    await writeJson(expectedDir, 'event_002.json', { id: 2 })
    await writeJson(actualDir, 'event_001.json', { id: 1 })
    await writeJson(actualDir, 'event_002.json', { id: 2 })

    const result = await mapFiles({ expectedDir, actualDir })

    expect(result.errors).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.unexpected).toEqual([])
    expect(result.mapped).toHaveLength(2)
    expect(result.mapped.map((m) => m.expectedFile).sort()).toEqual([
      'event_001.json',
      'event_002.json'
    ])
    expect(result.mapped.every((m) => m.expectedFile === m.actualFile)).toBe(true)
  })

  test('some expected missing: in missing list', async () => {
    const expectedDir = await createDir('expected')
    const actualDir = await createDir('actual')

    await writeJson(expectedDir, 'event_001.json', { id: 1 })
    await writeJson(expectedDir, 'event_002.json', { id: 2 })
    // only event_001 exists as actual
    await writeJson(actualDir, 'event_001.json', { id: 1 })

    const result = await mapFiles({ expectedDir, actualDir })

    expect(result.errors).toEqual([])
    expect(result.mapped).toHaveLength(1)
    expect(result.mapped[0].expectedFile).toBe('event_001.json')
    expect(result.missing).toEqual(['event_002.json'])
    expect(result.unexpected).toEqual([])
  })

  test('extra actual files: in unexpected list', async () => {
    const expectedDir = await createDir('expected')
    const actualDir = await createDir('actual')

    await writeJson(expectedDir, 'event_001.json', { id: 1 })
    await writeJson(actualDir, 'event_001.json', { id: 1 })
    await writeJson(actualDir, 'extra_001.json', { id: 99 })

    const result = await mapFiles({ expectedDir, actualDir })

    expect(result.errors).toEqual([])
    expect(result.mapped).toHaveLength(1)
    expect(result.missing).toEqual([])
    expect(result.unexpected).toHaveLength(1)
    expect(result.unexpected[0].file).toBe('extra_001.json')
  })

  test('empty expected dir: no mapped, no missing, all actuals unexpected', async () => {
    const expectedDir = await createDir('expected')
    const actualDir = await createDir('actual')

    await writeJson(actualDir, 'event_001.json', { id: 1 })

    const result = await mapFiles({ expectedDir, actualDir })

    expect(result.errors).toEqual([])
    expect(result.mapped).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.unexpected).toHaveLength(1)
  })

  test('empty actual dir: all expected missing', async () => {
    const expectedDir = await createDir('expected')
    const actualDir = await createDir('actual')

    await writeJson(expectedDir, 'event_001.json', { id: 1 })

    const result = await mapFiles({ expectedDir, actualDir })

    expect(result.errors).toEqual([])
    expect(result.mapped).toEqual([])
    expect(result.missing).toEqual(['event_001.json'])
    expect(result.unexpected).toEqual([])
  })

  test('both dirs empty: all empty, no errors', async () => {
    const expectedDir = await createDir('expected')
    const actualDir = await createDir('actual')

    const result = await mapFiles({ expectedDir, actualDir })

    expect(result.errors).toEqual([])
    expect(result.mapped).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.unexpected).toEqual([])
  })

  test('non-existent expected directory: error in errors list', async () => {
    const actualDir = await createDir('actual')
    const nonExistent = path.join(tmpDir, 'does-not-exist')

    const result = await mapFiles({ expectedDir: nonExistent, actualDir })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Cannot read expected directory')
    expect(result.errors[0]).toContain(nonExistent)
  })

  test('non-existent actual directory: error in errors list', async () => {
    const expectedDir = await createDir('expected')
    await writeJson(expectedDir, 'event_001.json', { id: 1 })
    const nonExistent = path.join(tmpDir, 'does-not-exist')

    const result = await mapFiles({ expectedDir, actualDir: nonExistent })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Cannot read actual directory')
    expect(result.errors[0]).toContain(nonExistent)
  })

  test('non-json files are ignored', async () => {
    const expectedDir = await createDir('expected')
    const actualDir = await createDir('actual')

    await writeJson(expectedDir, 'event_001.json', { id: 1 })
    await fs.writeFile(path.join(actualDir, 'event_001.json'), JSON.stringify({ id: 1 }))
    await fs.writeFile(path.join(actualDir, 'notes.txt'), 'some text')
    await fs.writeFile(path.join(actualDir, 'event_002.xml'), '<data/>')

    const result = await mapFiles({ expectedDir, actualDir })

    expect(result.errors).toEqual([])
    expect(result.mapped).toHaveLength(1)
    expect(result.unexpected).toEqual([])
  })

  test('matchKey equals filename for matched pairs', async () => {
    const expectedDir = await createDir('expected')
    const actualDir = await createDir('actual')

    await writeJson(expectedDir, 'msg_abc.json', { value: 'x' })
    await writeJson(actualDir, 'msg_abc.json', { value: 'x' })

    const result = await mapFiles({ expectedDir, actualDir })

    expect(result.mapped[0].matchKey).toBe('msg_abc.json')
  })
})
