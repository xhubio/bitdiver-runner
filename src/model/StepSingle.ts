import { StepType } from './constants'
import type { EnvironmentTestcase } from './EnvironmentTestcase'
import { StepBase } from './StepBase'
import { deleteVars, exportVars, loadVars, writeVars } from './StepPersistence'

/**
 * Typed view of a single testcase within a SingleStep.
 * Combines the testcase environment with its data.
 */
export interface SingleStepTestcase {
  environment: EnvironmentTestcase
  data: any
}

export class StepSingle extends StepBase {
  /**
   * The test case environments for all the test cases.
   * A single step has access to all the test case environments.
   * @deprecated Use `testcases` for typed access
   */
  declare environmentTestcase?: EnvironmentTestcase[]

  /**
   * The array contains one entry (which could be undefined or null)
   * per test case.
   * @deprecated Use `testcases` for typed access
   */
  declare data?: any[]

  /** The type of this step */
  type: StepType = StepType.single

  /** Variable names to auto-cleanup in afterRun */
  private _tempVarNames: string[] = []

  /**
   * Typed access to all testcases with their data.
   * Preferred over `environmentTestcase` + `data` for new code.
   *
   * @example
   * ```typescript
   * for (const { environment, data } of this.testcases) {
   *   // environment: EnvironmentTestcase
   *   // data: any
   * }
   * ```
   */
  get testcases(): SingleStepTestcase[] {
    if (this.environmentTestcase === undefined) {
      throw new Error(
        `Step '${this.name}': testcases not set. Step was not initialized by the runner.`
      )
    }
    return this.environmentTestcase.map((env, i) => ({
      environment: env,
      data: this.data?.[i]
    }))
  }

  // ── Environment variable persistence (per testcase) ───────────────

  /**
   * Write environment variables for a specific testcase to disk.
   */
  writeVars(tcEnv: EnvironmentTestcase, varNames: string[], dir: string): Promise<void> {
    return writeVars(tcEnv, varNames, dir)
  }

  /**
   * Load environment variables for a specific testcase from disk.
   */
  loadVars(
    tcEnv: EnvironmentTestcase,
    varNames: string[],
    dir: string,
    opts?: { ignoreMissing?: boolean }
  ): Promise<boolean> {
    return loadVars(tcEnv, varNames, dir, opts)
  }

  /**
   * Write to disk and remove from memory for a specific testcase.
   */
  exportVars(tcEnv: EnvironmentTestcase, varNames: string[], dir: string): Promise<void> {
    return exportVars(tcEnv, varNames, dir)
  }

  /**
   * Remove environment variables from a specific testcase.
   */
  deleteVars(tcEnv: EnvironmentTestcase, varNames: string[]): void {
    deleteVars(tcEnv, varNames)
  }

  /**
   * Load temporary variables for a specific testcase. Auto-cleanup in afterRun.
   */
  loadTempVars(
    tcEnv: EnvironmentTestcase,
    varNames: string[],
    dir: string,
    opts?: { ignoreMissing?: boolean }
  ): Promise<boolean> {
    this._tempVarNames.push(...varNames)
    return this.loadVars(tcEnv, varNames, dir, opts)
  }

  /**
   * Auto-cleanup of temporary variables across all testcases.
   * Subclasses that override afterRun should call super.afterRun().
   */
  afterRun(): Promise<void> {
    if (this._tempVarNames.length > 0 && this.environmentTestcase) {
      for (const tcEnv of this.environmentTestcase) {
        deleteVars(tcEnv, this._tempVarNames)
      }
      this._tempVarNames = []
    }
    return Promise.resolve()
  }
}
