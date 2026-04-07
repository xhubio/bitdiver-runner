import { StepType } from './constants'
import type { EnvironmentTestcase } from './EnvironmentTestcase'
import { StepBase } from './StepBase'
import { deleteVars, exportVars, loadVars, writeVars } from './StepPersistence'

export class StepNormal extends StepBase {
  /**
   * The test case environment for the current test case.
   * @deprecated Use `tc` for typed access
   */
  declare environmentTestcase?: EnvironmentTestcase

  /**
   * The data for this step instance.
   * @deprecated Use `tc` is preferred for new code, `data` still works
   */
  declare data?: any

  /** The type of this step */
  type: StepType = StepType.normal

  /** Variable names to auto-cleanup in afterRun */
  private _tempVarNames: string[] = []

  /**
   * Typed access to the testcase environment.
   * Preferred over `environmentTestcase` for new code.
   */
  get tc(): EnvironmentTestcase {
    if (this.environmentTestcase === undefined) {
      throw new Error(`Step '${this.name}': tc is not set. Step was not initialized by the runner.`)
    }
    return this.environmentTestcase
  }

  // ── Environment variable persistence ──────────────────────────────

  /**
   * Write environment variables to disk as JSON files.
   * @param varNames - Variable names to persist
   * @param dir - Target directory
   */
  async writeVars(varNames: string[], dir: string): Promise<void> {
    await writeVars(this.tc, varNames, dir)
  }

  /**
   * Load environment variables from disk into tc.map.
   * @param varNames - Variable names to load
   * @param dir - Source directory
   * @param opts.ignoreMissing - If true, missing files don't throw
   * @returns true if all loaded successfully
   */
  async loadVars(
    varNames: string[],
    dir: string,
    opts?: { ignoreMissing?: boolean }
  ): Promise<boolean> {
    return loadVars(this.tc, varNames, dir, opts)
  }

  /**
   * Write to disk and remove from memory. Frees memory while keeping data on disk.
   */
  async exportVars(varNames: string[], dir: string): Promise<void> {
    await exportVars(this.tc, varNames, dir)
  }

  /**
   * Remove environment variables from memory.
   */
  deleteVars(varNames: string[]): void {
    deleteVars(this.tc, varNames)
  }

  /**
   * Load variables that will be automatically cleaned up after the step runs.
   * Useful for data that is only needed during this step's execution.
   */
  async loadTempVars(
    varNames: string[],
    dir: string,
    opts?: { ignoreMissing?: boolean }
  ): Promise<boolean> {
    this._tempVarNames.push(...varNames)
    return this.loadVars(varNames, dir, opts)
  }

  /**
   * Auto-cleanup of temporary variables. Called by the runner after run().
   * Subclasses that override afterRun should call super.afterRun().
   */
  async afterRun(): Promise<void> {
    if (this._tempVarNames.length > 0) {
      deleteVars(this.tc, this._tempVarNames)
      this._tempVarNames = []
    }
  }
}
