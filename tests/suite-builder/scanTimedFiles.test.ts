import fs from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { scanTimedFiles } from '../../src/suite-builder/scanTimedFiles'

const VOLATILE_DIR = path.join(__dirname, '..', '..', 'volatile', 'testdata-scan')

async function writeJson(filePath: string, content: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(content), 'utf8')
}

beforeAll(async () => {
  await fs.mkdir(VOLATILE_DIR, { recursive: true })

  // TC_01
  await writeJson(path.join(VOLATILE_DIR, 'TC_01', '1_ri-fahrt-v1_23711.json'), {})
  await writeJson(path.join(VOLATILE_DIR, 'TC_01', '120_playwright_soll.json'), {})
  await writeJson(path.join(VOLATILE_DIR, 'TC_01', 'JourneyDuration.json'), {})

  // TC_02
  await writeJson(path.join(VOLATILE_DIR, 'TC_02', '1_ri-fahrt-v1_99999.json'), {})
  await writeJson(path.join(VOLATILE_DIR, 'TC_02', '60_bi-basis-fahrt-v3_abc.json'), {})
})

afterAll(async () => {
  await fs.rm(VOLATILE_DIR, { recursive: true, force: true })
})

describe('scanTimedFiles', () => {
  test('parses time and type correctly from filenames', async () => {
    const results = await scanTimedFiles(VOLATILE_DIR, ['TC_01'])

    const riFile = results.find((r) => r.fileName === '1_ri-fahrt-v1_23711.json')
    expect(riFile).toBeDefined()
    expect(riFile!.time).toBe(1)
    expect(riFile!.type).toBe('ri-fahrt-v1')
    expect(riFile!.testcaseName).toBe('TC_01')

    const playwrightFile = results.find((r) => r.fileName === '120_playwright_soll.json')
    expect(playwrightFile).toBeDefined()
    expect(playwrightFile!.time).toBe(120)
    expect(playwrightFile!.type).toBe('playwright')
  })

  test('skips files without time prefix', async () => {
    const results = await scanTimedFiles(VOLATILE_DIR, ['TC_01'])
    const names = results.map((r) => r.fileName)
    expect(names).not.toContain('JourneyDuration.json')
  })

  test('returns files from all testcase directories', async () => {
    const results = await scanTimedFiles(VOLATILE_DIR, ['TC_01', 'TC_02'])

    const tc01Files = results.filter((r) => r.testcaseName === 'TC_01')
    const tc02Files = results.filter((r) => r.testcaseName === 'TC_02')

    expect(tc01Files).toHaveLength(2)
    expect(tc02Files).toHaveLength(2)
  })

  test('relativePath includes testcase directory', async () => {
    const results = await scanTimedFiles(VOLATILE_DIR, ['TC_01'])
    const riFile = results.find((r) => r.fileName === '1_ri-fahrt-v1_23711.json')
    expect(riFile!.relativePath).toBe(path.join('TC_01', '1_ri-fahrt-v1_23711.json'))
  })

  test('handles missing testcase dirs gracefully', async () => {
    const results = await scanTimedFiles(VOLATILE_DIR, ['TC_01', 'TC_MISSING'])
    const names = results.map((r) => r.testcaseName)
    expect(names).not.toContain('TC_MISSING')
    expect(results.length).toBeGreaterThan(0)
  })

  test('returns empty array for empty testcaseNames list', async () => {
    const results = await scanTimedFiles(VOLATILE_DIR, [])
    expect(results).toHaveLength(0)
  })
})
