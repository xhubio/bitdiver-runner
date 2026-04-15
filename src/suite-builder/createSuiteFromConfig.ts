import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  StepDefinitionInterface,
  SuiteDefinitionInterface,
  TestcaseDefinitionInterface
} from '../definition/index'
import { buildTimedSteps } from './buildTimedSteps'
import { scanTimedFiles } from './scanTimedFiles'
import { normalizeTimedStepMapping, type StepEntry, suiteConfigSchema } from './types'

export interface CreateSuiteFromConfigRequest {
  /** The suite configuration (parsed YAML/JSON) */
  config: unknown

  /** Which suite type to build (e.g. 'TEST_FIX') */
  suiteType: string

  /** Path to the test data directory (contains testcase subdirectories) */
  testDataDir: string

  /** Name for the suite */
  suiteName: string

  /** Execution mode (default: 'batch') */
  executionMode?: 'batch' | 'normal'
}

/**
 * Creates a complete suite definition from a declarative configuration.
 *
 * 1. Validates config against schema
 * 2. Discovers testcase directories in testDataDir
 * 3. Builds setup steps (simple sequential list)
 * 4. Scans files and builds timed steps (sorted by time)
 * 5. Builds teardown steps (simple sequential list)
 * 6. Assembles the complete suite with sparse data maps
 */
export async function createSuiteFromConfig(
  request: CreateSuiteFromConfigRequest
): Promise<SuiteDefinitionInterface> {
  const { suiteType, testDataDir, suiteName, executionMode = 'batch' } = request

  // Validate config
  const config = suiteConfigSchema.parse(request.config)

  const typeConfig = config.suiteTypes[suiteType]
  if (!typeConfig) {
    const available = Object.keys(config.suiteTypes).join(', ')
    throw new Error(`Unknown suite type '${suiteType}'. Available: ${available}`)
  }

  // Discover testcase directories
  const testcaseNames = await discoverTestcases(testDataDir)
  if (testcaseNames.length === 0) {
    throw new Error(`No testcase directories found in ${testDataDir}`)
  }

  // Build all three phases
  const stepDefinitions: { [key: string]: StepDefinitionInterface } = {}
  const stepOrder: string[] = []
  // Per-testcase sparse data: tcName → { stepName → data }
  const tcDataMap = new Map<string, Record<string, any>>()
  for (const tcName of testcaseNames) {
    tcDataMap.set(tcName, {})
  }

  // Phase 1: Setup steps
  await addPhaseSteps(
    typeConfig.setup,
    stepDefinitions,
    stepOrder,
    tcDataMap,
    testcaseNames,
    testDataDir
  )

  // Phase 2: Timed steps
  if (typeConfig.timed === 'auto') {
    const mappingEntries = normalizeTimedStepMapping(config.timedStepMapping)
    const timedFiles = await scanTimedFiles(testDataDir, testcaseNames, mappingEntries)
    const timedEntries = buildTimedSteps(timedFiles, mappingEntries)

    for (const entry of timedEntries) {
      stepDefinitions[entry.definition.name] = entry.definition
      stepOrder.push(entry.definition.name)

      // Add data per testcase
      for (const [tcName, data] of Object.entries(entry.data)) {
        const tcData = tcDataMap.get(tcName)
        if (tcData) {
          tcData[entry.definition.name] = data
        }
      }
    }
  }

  // Phase 3: Teardown steps
  await addPhaseSteps(
    typeConfig.teardown,
    stepDefinitions,
    stepOrder,
    tcDataMap,
    testcaseNames,
    testDataDir
  )

  // Assemble testcases
  const testcases: TestcaseDefinitionInterface[] = testcaseNames.map((tcName) => ({
    name: tcName,
    data: tcDataMap.get(tcName) ?? {}
  }))

  return {
    name: suiteName,
    executionMode,
    steps: stepOrder,
    stepDefinitions,
    testcases
  }
}

/**
 * Process a list of step entries (String or { step, ...params }) and add them to the suite.
 *
 * - String entry → step name only, no data.
 * - Object entry `{ step, ...params }` → params written as step data for ALL testcases.
 * - Object entry with `filePattern` → the pattern is resolved per testcase: the
 *   builder scans `<testDataDir>/<tcName>/` for files matching the regex and
 *   injects `{ files: [...], ...otherParams }` as step data for that testcase.
 *   Files are returned as relative paths (`<tcName>/<fileName>`) so the step
 *   can resolve them against `DIR_TEST_DATA`. `filePattern` itself is consumed
 *   by the builder and not forwarded to the step.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: straightforward step processing
async function addPhaseSteps(
  entries: StepEntry[],
  stepDefinitions: { [key: string]: StepDefinitionInterface },
  stepOrder: string[],
  tcDataMap: Map<string, Record<string, unknown>>,
  testcaseNames: string[],
  testDataDir: string
): Promise<void> {
  for (const entry of entries) {
    if (typeof entry === 'string') {
      // Simple step name, no data
      stepDefinitions[entry] = { id: entry, name: entry, description: '' }
      stepOrder.push(entry)
      continue
    }

    // Object with { step, ...params }
    const { step: stepId, ...params } = entry as { step: string; [key: string]: unknown }
    stepDefinitions[stepId] = { id: stepId, name: stepId, description: '' }
    stepOrder.push(stepId)

    const filePattern = typeof params.filePattern === 'string' ? params.filePattern : undefined
    if (filePattern !== undefined) {
      const { filePattern: _ignored, ...otherParams } = params
      const regex = new RegExp(filePattern)
      for (const tcName of testcaseNames) {
        const tcDir = path.join(testDataDir, tcName)
        let dirEntries: string[]
        try {
          dirEntries = await fs.readdir(tcDir)
        } catch {
          dirEntries = []
        }
        const files = dirEntries
          .filter((e) => regex.test(e))
          .sort()
          .map((e) => path.join(tcName, e))
        const tcData = tcDataMap.get(tcName)
        if (tcData) {
          tcData[stepId] = { files, ...otherParams }
        }
      }
      continue
    }

    // Write params as step data for all testcases
    if (Object.keys(params).length > 0) {
      for (const tcName of testcaseNames) {
        const tcData = tcDataMap.get(tcName)
        if (tcData) {
          tcData[stepId] = params
        }
      }
    }
  }
}

/**
 * Discover testcase directories in the test data directory.
 * Returns sorted directory names (not files).
 */
async function discoverTestcases(testDataDir: string): Promise<string[]> {
  const entries = await fs.readdir(testDataDir, { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}
