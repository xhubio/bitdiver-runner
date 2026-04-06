import fs from 'node:fs/promises'
import type { MappedFile, MappingResult, UnmappedFile } from './types'

export interface MapFilesRequest {
  /** Directory containing expected files */
  expectedDir: string

  /** Directory containing actual result files */
  actualDir: string

  /** Glob pattern for actual files (default: '*.json') */
  filePattern?: string
}

/**
 * Maps actual result files to expected files by filename matching.
 *
 * Simple strategy: match by filename. An expected file 'event_001.json'
 * matches an actual file 'event_001.json' in the actual directory.
 *
 * For more complex mapping (e.g. by content matching), this can be extended.
 */
export async function mapFiles(request: MapFilesRequest): Promise<MappingResult> {
  const { expectedDir, actualDir } = request

  const mapped: MappedFile[] = []
  const missing: string[] = []
  const unexpected: UnmappedFile[] = []
  const errors: string[] = []

  // Read expected files
  let expectedFiles: string[] = []
  try {
    const entries = await fs.readdir(expectedDir)
    expectedFiles = entries.filter((f) => f.endsWith('.json')).sort()
  } catch {
    errors.push(`Cannot read expected directory: ${expectedDir}`)
    return { mapped, missing, unexpected, errors }
  }

  // Read actual files
  let actualFiles: string[] = []
  try {
    const entries = await fs.readdir(actualDir)
    actualFiles = entries.filter((f) => f.endsWith('.json')).sort()
  } catch {
    errors.push(`Cannot read actual directory: ${actualDir}`)
    return { mapped, missing, unexpected, errors }
  }

  const actualSet = new Set(actualFiles)
  const matchedActuals = new Set<string>()

  // Match expected to actual by filename
  for (const expectedFile of expectedFiles) {
    if (actualSet.has(expectedFile)) {
      mapped.push({
        expectedFile,
        actualFile: expectedFile,
        matchKey: expectedFile
      })
      matchedActuals.add(expectedFile)
    } else {
      missing.push(expectedFile)
    }
  }

  // Find unmatched actuals
  for (const actualFile of actualFiles) {
    if (!matchedActuals.has(actualFile)) {
      unexpected.push({ file: actualFile })
    }
  }

  return { mapped, missing, unexpected, errors }
}
