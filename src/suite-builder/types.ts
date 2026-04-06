import { z } from 'zod'

/** Mapping from file-name type to stepId for timed steps */
const timedStepMappingSchema = z.record(z.string(), z.string())

/** Suite type phase definition */
const suiteTypeSchema = z.object({
  /** Steps to run before timed phase (sequential) */
  setup: z.array(z.string()).default([]),
  /** 'auto' = scan testdata files using timedStepMapping */
  timed: z.literal('auto').or(z.array(z.string())).default([]),
  /** Steps to run after timed phase (sequential) */
  teardown: z.array(z.string()).default([])
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
