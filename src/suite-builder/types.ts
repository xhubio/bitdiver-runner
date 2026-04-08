import { z } from 'zod'

/**
 * A timed step mapping entry can be:
 * - A simple string (stepId) → uses default pattern: <TIME>_<key>_*.json
 * - An object with stepId and custom pattern containing <TIME> placeholder
 *
 * The <TIME> placeholder is replaced with (\d+) in the regex.
 *
 * @example
 * ```json
 * {
 *   "ri-fahrt-v1": "SendRiFahrtV1Time",
 *   "custom": {
 *     "stepId": "SendCustomTime",
 *     "pattern": "data_rifahrt_.*_<TIME>\\.json"
 *   }
 * }
 * ```
 */
const timedStepMappingEntrySchema = z.union([
  z.string(),
  z.object({
    stepId: z.string(),
    pattern: z.string()
  })
])

/** Mapping from key to stepId (simple) or { stepId, pattern } (custom) */
const timedStepMappingSchema = z.record(z.string(), timedStepMappingEntrySchema)

/**
 * A step entry in setup/teardown can be:
 * - A string: step name without data
 * - An object: { step: "name", ...params } — params become step data for ALL testcases
 *
 * @example
 * ```yaml
 * setup:
 *   - SetupEnvironmentRun
 *   - step: Wait
 *     seconds: 30
 *   - ClearDatabase
 * ```
 */
const stepEntrySchema = z.union([z.string(), z.object({ step: z.string() }).passthrough()])

export type StepEntry = z.infer<typeof stepEntrySchema>

/** Suite type phase definition */
const suiteTypeSchema = z.object({
  /** Steps to run before timed phase. String or { step, ...params }. */
  setup: z.array(stepEntrySchema).default([]),
  /** 'auto' = scan testdata files using timedStepMapping */
  timed: z.literal('auto').or(z.array(stepEntrySchema)).default([]),
  /** Steps to run after timed phase. String or { step, ...params }. */
  teardown: z.array(stepEntrySchema).default([]),
  /** Optional timing configuration — if set, the Runner manages step timing */
  timing: z
    .object({
      startAfterStep: z.string(),
      testcaseDelaySeconds: z.number().default(0)
    })
    .optional()
})

/** Complete suite configuration */
export const suiteConfigSchema = z.object({
  /** Display name */
  name: z.string().optional(),
  /** Mapping: filename-type → stepId for timed steps */
  timedStepMapping: timedStepMappingSchema.default({}),
  /** Available suite types with their phase definitions */
  suiteTypes: z.record(z.string(), suiteTypeSchema)
})

export type SuiteConfig = z.infer<typeof suiteConfigSchema>
export type SuiteTypeConfig = z.infer<typeof suiteTypeSchema>

/** Normalized timed step mapping entry */
export interface TimedStepMappingEntry {
  /** The key used to identify this mapping */
  key: string
  /** The step ID to register in the suite */
  stepId: string
  /** Regex pattern with a single capture group for the time value */
  regex: RegExp
}

/**
 * Normalize the timedStepMapping config into a list of entries with compiled regexes.
 * - Simple string value: uses default pattern `^<TIME>_<key>_`
 * - Object with pattern: replaces `<TIME>` with `(\d+)` and compiles
 */
export function normalizeTimedStepMapping(
  mapping: Record<string, string | { stepId: string; pattern: string }>
): TimedStepMappingEntry[] {
  const entries: TimedStepMappingEntry[] = []

  for (const [key, value] of Object.entries(mapping)) {
    if (typeof value === 'string') {
      // Simple: key is the type, value is the stepId
      // Default pattern: <TIME>_<key>_*
      entries.push({
        key,
        stepId: value,
        regex: new RegExp(`^(\\d+)_${escapeRegex(key)}_`)
      })
    } else {
      // Object with custom pattern
      const regexStr = value.pattern.replace('<TIME>', '(\\d+)')
      entries.push({
        key,
        stepId: value.stepId,
        regex: new RegExp(regexStr)
      })
    }
  }

  return entries
}

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Parsed file name from test data: <time>_<type>_<rest>.json */
export interface ParsedFileName {
  /** The time offset extracted from the prefix (as number) */
  time: number
  /** The type extracted from the second segment */
  type: string
  /** The original file name */
  fileName: string
  /** The testcase name (directory name) */
  testcaseName: string
  /** Path relative to testcase directory */
  relativePath: string
}
