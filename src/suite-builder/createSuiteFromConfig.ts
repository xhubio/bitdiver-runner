import fs from 'node:fs/promises'
import type {
  StepDefinitionInterface,
  SuiteDefinitionInterface,
  TestcaseDefinitionInterface
} from '../definition/index'
import { buildTimedSteps } from './buildTimedSteps'
import { scanTimedFiles } from './scanTimedFiles'
import { normalizeTimedStepMapping, suiteConfigSchema } from './types'

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
  for (const stepId of typeConfig.setup) {
    const name = stepId
    stepDefinitions[name] = { id: stepId, name, description: '' }
    stepOrder.push(name)
  }

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
  for (const stepId of typeConfig.teardown) {
    const name = stepId
    stepDefinitions[name] = { id: stepId, name, description: '' }
    stepOrder.push(name)
  }

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
    testcases,
    timing: typeConfig.timing
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
