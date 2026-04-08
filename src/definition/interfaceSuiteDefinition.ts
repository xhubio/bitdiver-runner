import type { StepDefinitionInterface } from './interfaceStepDefinition'
import type { TestcaseDefinitionInterface } from './interfaceTestcaseDefinition'

export const EXECUTION_MODE_BATCH = 'batch'
export const EXECUTION_MODE_NORMAL = 'normal'

export type ExecutionModeType = 'batch' | 'normal'

/**
 * Timing configuration for a suite.
 * Defines when the Runner sets its reference time and how to stagger testcase execution.
 */
export interface SuiteTimingInterface {
  /** The Runner sets referenceTime = now() after this step completes */
  startAfterStep: string

  /** Delay in seconds between testcases for timed steps (default: 0) */
  testcaseDelaySeconds?: number
}

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

  /** Timing configuration for timed steps */
  timing?: SuiteTimingInterface
}
