import type { StepDefinitionInterface } from '../definition/index'
import type { ParsedFileName } from './types'

export interface TimedStepEntry {
  /** The step definition (id + unique name) */
  definition: StepDefinitionInterface
  /** Data per testcase: { [tcName]: { offsetTime, files[] } } */
  data: { [testcaseName: string]: { offsetTime: number; files: string[] } }
}

/**
 * Build timed step entries from scanned files and a type→stepId mapping.
 *
 * Groups files by time, then by type. For each time+type combination,
 * creates a step with a unique name like "SendRiFahrtV1Time 120".
 *
 * Steps are sorted by time (ascending).
 *
 * @param files - All parsed file names from scanTimedFiles
 * @param mapping - Map from file-type to stepId (e.g. 'ri-fahrt-v1' → 'SendRiFahrtV1Time')
 * @returns Ordered list of timed step entries
 */
export function buildTimedSteps(
  files: ParsedFileName[],
  mapping: Record<string, string>
): TimedStepEntry[] {
  // Group by time → type → files
  const byTime = new Map<number, Map<string, ParsedFileName[]>>()

  for (const file of files) {
    if (!mapping[file.type]) continue // skip unmapped types

    if (!byTime.has(file.time)) {
      byTime.set(file.time, new Map())
    }
    const byType = byTime.get(file.time)!
    if (!byType.has(file.type)) {
      byType.set(file.type, [])
    }
    byType.get(file.type)!.push(file)
  }

  // Sort times numerically
  const sortedTimes = [...byTime.keys()].sort((a, b) => a - b)

  const entries: TimedStepEntry[] = []

  for (const time of sortedTimes) {
    const byType = byTime.get(time)!

    // Sort types for deterministic order
    const sortedTypes = [...byType.keys()].sort()

    for (const type of sortedTypes) {
      const typeFiles = byType.get(type)!
      const stepId = mapping[type]
      const stepName = `${stepId} ${time}`

      const definition: StepDefinitionInterface = {
        id: stepId,
        name: stepName,
        description: '',
        timing: { offsetSeconds: time }
      }

      // Group files by testcase
      const data: { [tcName: string]: { offsetTime: number; files: string[] } } = {}
      for (const file of typeFiles) {
        if (!data[file.testcaseName]) {
          data[file.testcaseName] = { offsetTime: time, files: [] }
        }
        data[file.testcaseName].files.push(file.relativePath)
      }

      entries.push({ definition, data })
    }
  }

  return entries
}
