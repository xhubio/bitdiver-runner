import type { StepDefinitionInterface } from '../definition/index'
import type { ParsedFileName, TimedStepMappingEntry } from './types'

export interface TimedStepEntry {
  /** The step definition (id + unique name) */
  definition: StepDefinitionInterface
  /** Data per testcase: { [tcName]: { files[] } } */
  data: { [testcaseName: string]: { files: string[] } }
}

/**
 * Build timed step entries from scanned files and mapping entries.
 *
 * Groups files by time, then by type. For each time+type combination,
 * creates a step with a unique name like "SendRiFahrtV1Time 120".
 *
 * Steps are sorted by time (ascending).
 *
 * @param files - All parsed file names from scanTimedFiles
 * @param mappingEntries - Normalized mapping entries with stepId per type key
 * @returns Ordered list of timed step entries
 */
export function buildTimedSteps(
  files: ParsedFileName[],
  mappingEntries: TimedStepMappingEntry[]
): TimedStepEntry[] {
  // Build a quick lookup: type key → stepId
  const stepIdByKey = new Map<string, string>()
  for (const entry of mappingEntries) {
    stepIdByKey.set(entry.key, entry.stepId)
  }

  const byTime = groupFilesByTimeAndType(files, stepIdByKey)
  const sortedTimes = [...byTime.keys()].sort((a, b) => a - b)

  const entries: TimedStepEntry[] = []
  for (const time of sortedTimes) {
    const byType = byTime.get(time)!
    const sortedTypes = [...byType.keys()].sort()
    for (const type of sortedTypes) {
      const stepId = stepIdByKey.get(type)
      if (stepId) {
        entries.push(buildEntryForType(time, byType.get(type)!, stepId))
      }
    }
  }
  return entries
}

function groupFilesByTimeAndType(
  files: ParsedFileName[],
  stepIdByKey: Map<string, string>
): Map<number, Map<string, ParsedFileName[]>> {
  const byTime = new Map<number, Map<string, ParsedFileName[]>>()
  for (const file of files) {
    if (!stepIdByKey.has(file.type)) continue
    if (!byTime.has(file.time)) byTime.set(file.time, new Map())
    const byType = byTime.get(file.time)!
    if (!byType.has(file.type)) byType.set(file.type, [])
    byType.get(file.type)!.push(file)
  }
  return byTime
}

function buildEntryForType(
  time: number,
  typeFiles: ParsedFileName[],
  stepId: string
): TimedStepEntry {
  const stepName = `${stepId} ${time}`
  const definition: StepDefinitionInterface = {
    id: stepId,
    name: stepName,
    description: '',
    timing: { offsetSeconds: time }
  }

  const data: { [tcName: string]: { files: string[] } } = {}
  for (const file of typeFiles) {
    if (!data[file.testcaseName]) {
      data[file.testcaseName] = { files: [] }
    }
    data[file.testcaseName].files.push(file.relativePath)
  }

  return { definition, data }
}
