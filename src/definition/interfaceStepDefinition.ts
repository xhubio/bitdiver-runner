/**
 * Timing configuration for a single step.
 * When set, the Runner waits until the right moment before executing this step.
 */
export interface StepTimingInterface {
  /** Seconds after reference time when this step should execute */
  offsetSeconds: number
}

/**
 * Defines the structure of one single step
 */
export interface StepDefinitionInterface {
  /** The name the step is registered in the step registry */
  id: string

  /** A different name for the step used in the execution log. and used to register the step in the test case */
  name: string

  /** An additional description of the step */
  description: string

  /** Optional timing — if set, the Runner waits until the right moment before executing this step */
  timing?: StepTimingInterface
}
