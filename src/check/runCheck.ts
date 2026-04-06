import fs from 'node:fs/promises'
import path from 'node:path'
import { compareData } from '@aikotools/datacompare'
import { mapFiles } from './mapFiles'
import type { CheckConfig, CheckFileStatus, CheckResult, CheckSummary } from './types'

export interface RunCheckRequest {
  /** The check configuration */
  checkConfig: CheckConfig

  /** Absolute path to the testcase result directory */
  resultDir: string

  /** Absolute path to the testcase data directory */
  dataDir: string
}

/**
 * Runs a single check: maps files, compares each pair, produces results.
 */
export async function runCheck(request: RunCheckRequest): Promise<CheckResult> {
  const { checkConfig, resultDir, dataDir } = request

  const actualDir = path.join(resultDir, checkConfig.actualDir)
  const expectedDir = path.join(dataDir, checkConfig.expectedDir)

  // Phase 1: Map actual files to expected files
  const mapping = await mapFiles({
    expectedDir,
    actualDir,
    filePattern: checkConfig.filePattern
  })

  // Phase 2: Compare each mapped pair
  const fileStatuses: CheckFileStatus[] = []

  for (const pair of mapping.mapped) {
    const expectedPath = path.join(expectedDir, pair.expectedFile)
    const actualPath = path.join(actualDir, pair.actualFile)

    const expected = JSON.parse(await fs.readFile(expectedPath, 'utf8'))
    const actual = JSON.parse(await fs.readFile(actualPath, 'utf8'))

    // Extract payload if dataPath is configured
    let actualData = actual
    if (checkConfig.dataPath && checkConfig.dataPath.length > 0) {
      actualData = getNestedValue(actual, checkConfig.dataPath) ?? actual
    }

    const compareResult = await compareData({
      expected,
      actual: actualData,
      context: checkConfig.compareContext,
      options: {
        ...checkConfig.compareOptions,
        ignorePaths: checkConfig.ignorePaths
      }
    })

    fileStatuses.push({
      expectedFile: pair.expectedFile,
      actualFile: pair.actualFile,
      passed: compareResult.success,
      compareResult
    })
  }

  // Phase 3: Build summary
  const summary: CheckSummary = {
    name: checkConfig.name,
    total: mapping.mapped.length + mapping.missing.length,
    passed: fileStatuses.filter((s) => s.passed).length,
    failed: fileStatuses.filter((s) => !s.passed).length,
    missing: mapping.missing.length,
    unexpected: mapping.unexpected.length
  }

  return { fileStatuses, summary, mapping }
}

/** Extract a value from a nested object by path */
function getNestedValue(obj: any, pathSegments: string[]): any {
  let current: any = obj
  for (const key of pathSegments) {
    if (current === null || current === undefined) return undefined
    current = current[key]
  }
  return current
}
