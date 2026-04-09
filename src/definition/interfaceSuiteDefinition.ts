import type { StepDefinitionInterface } from './interfaceStepDefinition'
import type { TestcaseDefinitionInterface } from './interfaceTestcaseDefinition'

export const EXECUTION_MODE_BATCH = 'batch'
export const EXECUTION_MODE_NORMAL = 'normal'

export type ExecutionModeType = 'batch' | 'normal'

export interface SuiteDefinitionInterface {
  /** The name of this suite */
  name: string

  /** An optional description for the suite */
  description?: string

  /** String tags for filtering results */
  tags?: string[]

  /**
   * Ordered list of step names to execute (applies to all testcases)
   */
  steps: string[]

  /**
   * Step definitions keyed by step name
   */
  stepDefinitions: { [key: string]: StepDefinitionInterface }

  /**
   * The list of testcases to be executed in the right order
   */
  testcases: TestcaseDefinitionInterface[]

  executionMode: ExecutionModeType
}
