import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { runCheck } from '../../src/check/runCheck'
import type { CheckConfig } from '../../src/check/types'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runcheck-test-'))
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

const BASE_CONFIG: Omit<CheckConfig, 'actualDir' | 'expectedDir'> = {
  name: 'test-check'
}

describe('runCheck', () => {
  test('all matching: summary.passed = N, failed = 0', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    const actualDir = await createDir('result', 'actual')
    const expectedDir = await createDir('data', 'expected')

    const payload = { id: 'abc', value: 42, name: 'test' }
    await writeJson(expectedDir, 'msg_001.json', payload)
    await writeJson(expectedDir, 'msg_002.json', { id: 'xyz', value: 99, name: 'other' })
    await writeJson(actualDir, 'msg_001.json', payload)
    await writeJson(actualDir, 'msg_002.json', { id: 'xyz', value: 99, name: 'other' })

    const result = await runCheck({
      checkConfig: { ...BASE_CONFIG, actualDir: 'actual', expectedDir: 'expected' },
      resultDir,
      dataDir
    })

    expect(result.summary.passed).toBe(2)
    expect(result.summary.failed).toBe(0)
    expect(result.summary.missing).toBe(0)
    expect(result.summary.unexpected).toBe(0)
    expect(result.summary.total).toBe(2)
    expect(result.fileStatuses.every((s) => s.passed)).toBe(true)
  })

  test('differences: summary.failed > 0, compareResult has errors', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    const actualDir = await createDir('result', 'actual')
    const expectedDir = await createDir('data', 'expected')

    await writeJson(expectedDir, 'msg_001.json', { id: 'abc', value: 42 })
    await writeJson(actualDir, 'msg_001.json', { id: 'abc', value: 999 }) // value differs

    const result = await runCheck({
      checkConfig: { ...BASE_CONFIG, actualDir: 'actual', expectedDir: 'expected' },
      resultDir,
      dataDir
    })

    expect(result.summary.passed).toBe(0)
    expect(result.summary.failed).toBe(1)
    expect(result.fileStatuses[0].passed).toBe(false)
    expect(result.fileStatuses[0].compareResult.errors.length).toBeGreaterThan(0)
  })

  test('missing actual: summary.missing > 0', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    await createDir('result', 'actual')
    const expectedDir = await createDir('data', 'expected')

    await writeJson(expectedDir, 'msg_001.json', { id: 'abc' })
    // no actual file

    const result = await runCheck({
      checkConfig: { ...BASE_CONFIG, actualDir: 'actual', expectedDir: 'expected' },
      resultDir,
      dataDir
    })

    expect(result.summary.missing).toBe(1)
    expect(result.summary.passed).toBe(0)
    expect(result.mapping.missing).toEqual(['msg_001.json'])
    expect(result.fileStatuses).toHaveLength(0)
  })

  test('with dataPath extraction: extracts payload before comparing', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    const actualDir = await createDir('result', 'actual')
    const expectedDir = await createDir('data', 'expected')

    const payload = { id: 'abc', value: 42 }
    // expected file contains just the payload
    await writeJson(expectedDir, 'msg_001.json', payload)
    // actual file wraps the payload in an envelope
    await writeJson(actualDir, 'msg_001.json', { header: { ts: 123 }, data: payload })

    const result = await runCheck({
      checkConfig: {
        ...BASE_CONFIG,
        actualDir: 'actual',
        expectedDir: 'expected',
        dataPath: ['data']
      },
      resultDir,
      dataDir
    })

    expect(result.summary.passed).toBe(1)
    expect(result.summary.failed).toBe(0)
  })

  test('with ignorePaths: ignored fields do not cause failures', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    const actualDir = await createDir('result', 'actual')
    const expectedDir = await createDir('data', 'expected')

    await writeJson(expectedDir, 'msg_001.json', {
      id: 'abc',
      messageId: 'expected-id',
      value: 42
    })
    await writeJson(actualDir, 'msg_001.json', {
      id: 'abc',
      messageId: 'actual-different-id', // different, but ignored
      value: 42
    })

    const result = await runCheck({
      checkConfig: {
        ...BASE_CONFIG,
        actualDir: 'actual',
        expectedDir: 'expected',
        ignorePaths: [{ path: ['messageId'] }]
      },
      resultDir,
      dataDir
    })

    expect(result.summary.passed).toBe(1)
    expect(result.summary.failed).toBe(0)
  })

  test('unexpected actuals are tracked in mapping', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    const actualDir = await createDir('result', 'actual')
    const expectedDir = await createDir('data', 'expected')

    await writeJson(expectedDir, 'msg_001.json', { id: 'abc' })
    await writeJson(actualDir, 'msg_001.json', { id: 'abc' })
    await writeJson(actualDir, 'unexpected_001.json', { id: 'extra' })

    const result = await runCheck({
      checkConfig: { ...BASE_CONFIG, actualDir: 'actual', expectedDir: 'expected' },
      resultDir,
      dataDir
    })

    expect(result.summary.unexpected).toBe(1)
    expect(result.mapping.unexpected[0].file).toBe('unexpected_001.json')
  })

  test('summary name matches checkConfig name', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    await createDir('result', 'actual')
    await createDir('data', 'expected')

    const result = await runCheck({
      checkConfig: {
        ...BASE_CONFIG,
        name: 'my-custom-check',
        actualDir: 'actual',
        expectedDir: 'expected'
      },
      resultDir,
      dataDir
    })

    expect(result.summary.name).toBe('my-custom-check')
  })

  test('dataPath with deep nesting extracts correctly', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    const actualDir = await createDir('result', 'actual')
    const expectedDir = await createDir('data', 'expected')

    const payload = { id: 'deep', status: 'ok' }
    await writeJson(expectedDir, 'msg_001.json', payload)
    await writeJson(actualDir, 'msg_001.json', {
      envelope: { inner: payload }
    })

    const result = await runCheck({
      checkConfig: {
        ...BASE_CONFIG,
        actualDir: 'actual',
        expectedDir: 'expected',
        dataPath: ['envelope', 'inner']
      },
      resultDir,
      dataDir
    })

    expect(result.summary.passed).toBe(1)
  })

  test('empty dirs: zero totals, no errors', async () => {
    const resultDir = await createDir('result')
    const dataDir = await createDir('data')
    await createDir('result', 'actual')
    await createDir('data', 'expected')

    const result = await runCheck({
      checkConfig: { ...BASE_CONFIG, actualDir: 'actual', expectedDir: 'expected' },
      resultDir,
      dataDir
    })

    expect(result.summary.total).toBe(0)
    expect(result.summary.passed).toBe(0)
    expect(result.summary.failed).toBe(0)
    expect(result.summary.missing).toBe(0)
    expect(result.fileStatuses).toHaveLength(0)
  })
})
