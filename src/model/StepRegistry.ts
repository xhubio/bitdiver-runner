import type { StepBase } from './StepBase'
import { StepCheckStartTime } from './StepCheckStartTime'
import { StepDetermineStartTime } from './StepDetermineStartTime'
import { StepWait } from './StepWait'

type StepClass = new (opts: any) => StepBase

interface RegisterStepRequest {
  /** The name under which the step class is registered */
  stepName: string

  /** The step class to be registered */
  step: StepClass
}

/**
 * This registry stores all the available steps by there name.
 *
 * Built-in steps provided by bitdiver-runner are registered automatically
 * and can be used without manual registration:
 * - `Wait` — blocks for a configurable number of seconds
 * - `DetermineStartTime` — calculates a future reference time for timed steps
 * - `CheckStartTime` — verifies the reference time has not been exceeded
 */
export class StepRegistry {
  /** The map storing the step classes by name */
  stepClassMap = new Map()

  constructor() {
    // Register built-in steps shipped with bitdiver-runner
    this.stepClassMap.set('Wait', StepWait)
    this.stepClassMap.set('DetermineStartTime', StepDetermineStartTime)
    this.stepClassMap.set('CheckStartTime', StepCheckStartTime)
  }

  /**
   * Register a class for a step by a given name
   * @param stepName - The name under the class will be rigistered
   * @param step - The class of the step
   */
  registerStep(request: RegisterStepRequest): void {
    const { stepName, step } = request

    if (this.stepClassMap.has(stepName)) {
      // A step with the same name was already registred
      // biome-ignore lint/suspicious/noConsole: intentional warning for duplicate registration
      console.warn(`There was already a step registered with the name '${stepName}'`)
    }

    this.stepClassMap.set(stepName, step)
  }

  /**
   * Returns an instance of a step class
   * @param stepName - The name under the class is be rigistered
   * @returns step - The instance of the step class
   */
  getStep(stepName: string): StepBase {
    if (!this.stepClassMap.has(stepName)) {
      throw new Error(`There was no step registered with the name '${stepName}'`)
    }
    const stepClass = this.stepClassMap.get(stepName)

    // eslint-disable-next-line new-cap
    return new stepClass({ name: stepName })
  }
}
