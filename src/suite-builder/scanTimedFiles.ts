import fs from 'node:fs/promises'
import path from 'node:path'
import type { ParsedFileName, TimedStepMappingEntry } from './types'

/**
 * Scans all testcase directories for files matching the timed step patterns.
 *
 * Each mapping entry has a regex with a capture group for the time value.
 * Files are matched against all patterns. The first match wins.
 *
 * @param testDataDir - Root directory containing testcase subdirectories
 * @param testcaseNames - List of testcase directory names
 * @param mappingEntries - Normalized mapping entries with compiled regexes
 * @returns Flat list of all parsed file names across all testcases
 */
export async function scanTimedFiles(
  testDataDir: string,
  testcaseNames: string[],
  mappingEntries: TimedStepMappingEntry[]
): Promise<ParsedFileName[]> {
  const results: ParsedFileName[] = []

  for (const tcName of testcaseNames) {
    const tcDir = path.join(testDataDir, tcName)
    let entries: string[]
    try {
      entries = await fs.readdir(tcDir)
    } catch {
      continue // skip missing testcase dirs
    }

    for (const fileName of entries) {
      const parsed = matchFile(fileName, tcName, mappingEntries)
      if (parsed) {
        results.push({
          ...parsed,
          relativePath: path.join(tcName, fileName)
        })
      }
    }
  }

  return results
}

/**
 * Try to match a filename against all mapping entries.
 * Returns the first match, or undefined if no pattern matches.
 */
function matchFile(
  fileName: string,
  testcaseName: string,
  mappingEntries: TimedStepMappingEntry[]
): Omit<ParsedFileName, 'relativePath'> | undefined {
  for (const entry of mappingEntries) {
    const match = fileName.match(entry.regex)
    if (match?.[1]) {
      return {
        time: Number.parseInt(match[1], 10),
        type: entry.key,
        fileName,
        testcaseName
      }
    }
  }
  return undefined
}
