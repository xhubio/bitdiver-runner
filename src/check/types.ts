import type {
  CompareContext,
  CompareOptions,
  CompareResult,
  IgnorePathConfig
} from '@aikotools/datacompare'

/** Defines how to find and match actual result files to expected files */
export interface MappingCriteria {
  /** Glob pattern or regex to find actual files in the result directory */
  filePattern: string

  /** JSON path to extract a matching key from actual files (e.g. ['data', 'id']) */
  matchPath: string[]

  /** JSON path to extract a matching key from expected files */
  expectedMatchPath?: string[]

  /** JSON path to the payload data within actual files */
  dataPath?: string[]

  /** JSON path to extract timestamp from actual files */
  timePath?: string[]

  /** If true, expected files without a match are not errors */
  optionalExpected?: boolean
}

/** Result of mapping actual files to expected files */
export interface MappedFile {
  /** Path to the expected file (relative) */
  expectedFile: string

  /** Path to the actual file that matched */
  actualFile: string

  /** The matching key value */
  matchKey: string
}

/** An actual file that couldn't be matched to any expected file */
export interface UnmappedFile {
  /** Path to the unmatched actual file */
  file: string

  /** The extracted match key (if any) */
  matchKey?: string
}

/** Result of the mapping phase */
export interface MappingResult {
  /** Successfully mapped file pairs */
  mapped: MappedFile[]

  /** Expected files with no matching actual file */
  missing: string[]

  /** Actual files with no matching expected file */
  unexpected: UnmappedFile[]

  /** Errors during mapping */
  errors: string[]
}

/** Status of a single file comparison */
export interface CheckFileStatus {
  expectedFile: string
  actualFile: string
  passed: boolean
  compareResult: CompareResult
}

/** Summary of all checks for one channel/category */
export interface CheckSummary {
  /** Name of the check (e.g. channel name) */
  name: string

  /** Total expected files */
  total: number

  /** Successfully compared and matching */
  passed: number

  /** Compared but with differences */
  failed: number

  /** Expected but no actual file found */
  missing: number

  /** Actual files without expected match */
  unexpected: number
}

/** Complete check result for one check configuration */
export interface CheckResult {
  /** Individual file comparison results */
  fileStatuses: CheckFileStatus[]

  /** Aggregated summary */
  summary: CheckSummary

  /** Mapping result details */
  mapping: MappingResult
}

/** Configuration for a single check within the step */
export interface CheckConfig {
  /** Name for this check (used in result file names) */
  name: string

  /** Directory containing actual result files (relative to result dir) */
  actualDir: string

  /** Directory containing expected files (relative to data dir) */
  expectedDir: string

  /** Glob pattern to find actual files */
  filePattern?: string

  /** JSON path to extract the payload from actual files */
  dataPath?: string[]

  /** Paths to ignore during comparison */
  ignorePaths?: IgnorePathConfig[]

  /** Additional compare options */
  compareOptions?: CompareOptions

  /** Compare context (timestamps etc.) */
  compareContext?: CompareContext
}

/** Step data for the check step */
export interface CheckStepData {
  /** Directory containing actual results for this testcase */
  resultDir: string

  /** Directory containing test data (expected files) for this testcase */
  dataDir: string

  /** List of checks to perform */
  checks: CheckConfig[]
}
