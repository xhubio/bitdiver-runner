import fs from 'node:fs/promises'
import path from 'node:path'
import type { ParsedFileName } from './types'

/**
 * Scans all testcase directories for files with time-prefixed names.
 * Pattern: <number>_<type>_<rest>.json
 * Example: 120_ri-fahrt-v1_23711_S8.json → { time: 120, type: 'ri-fahrt-v1', ... }
 *
 * @param testDataDir - Root directory containing testcase subdirectories
 * @param testcaseNames - List of testcase directory names
 * @returns Flat list of all parsed file names across all testcases
 */
export async function scanTimedFiles(
  testDataDir: string,
  testcaseNames: string[]
): Promise<ParsedFileName[]> {
  const results: ParsedFileName[] = []
  const timeTypePattern = /^(\d+)_([^_]+)_/

  for (const tcName of testcaseNames) {
    const tcDir = path.join(testDataDir, tcName)
    let entries: string[]
    try {
      entries = await fs.readdir(tcDir)
    } catch {
      continue // skip missing testcase dirs
    }

    for (const fileName of entries) {
      const match = fileName.match(timeTypePattern)
      if (match) {
        results.push({
          time: Number.parseInt(match[1], 10),
          type: match[2],
          fileName,
          testcaseName: tcName,
          relativePath: path.join(tcName, fileName)
        })
      }
    }
  }

  return results
}
