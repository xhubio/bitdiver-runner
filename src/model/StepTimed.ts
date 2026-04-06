import { DateTime } from 'luxon'
import { StepNormal } from './StepNormal'

/**
 * A step that waits until a specific time offset before executing.
 *
 * The offset is relative to a reference time (e.g. test start time).
 * The step calculates the delay and waits before calling `doRun()`.
 *
 * In testMode, the delay is skipped (runs immediately).
 *
 * Subclasses must implement:
 * - `getReferenceTime()` — ISO timestamp to calculate delay from
 * - `getOffsetSeconds()` — seconds after reference time to execute
 * - `doRun()` — the actual work
 *
 * @example
 * ```typescript
 * class SendDataAtTime extends StepTimed {
 *   getReferenceTime(): string {
 *     return this.tc.map.get('START_TIME')
 *   }
 *   getOffsetSeconds(): number {
 *     return this.data.offsetTime
 *   }
 *   async doRun(): Promise<void> {
 *     await sendData(this.data.files)
 *   }
 * }
 * ```
 */
export abstract class StepTimed extends StepNormal {
  /**
   * The ISO timestamp used as reference for the delay calculation.
   * Typically the test start time from the run environment.
   */
  abstract getReferenceTime(): string

  /**
   * The offset in seconds after the reference time when this step should execute.
   * Typically from the step's data (e.g. `this.data.offsetTime`).
   */
  abstract getOffsetSeconds(): number

  /**
   * The actual work to perform after the delay.
   * Implement this instead of `run()`.
   */
  abstract doRun(): Promise<void>

  /**
   * Calculates the delay and waits before calling doRun().
   * In testMode, executes immediately without waiting.
   */
  async run(): Promise<void> {
    const delay = this.calculateDelay()

    if (delay > 100) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delay)
      })
    }

    await this.doRun()
  }

  /**
   * Calculate the delay in milliseconds until the step should execute.
   * Returns 0 in testMode.
   */
  calculateDelay(): number {
    if (this.testMode) {
      return 0
    }

    const referenceTime = this.getReferenceTime()
    const offsetSeconds = this.getOffsetSeconds()

    const targetTime = DateTime.fromISO(referenceTime).plus({ seconds: offsetSeconds }).toMillis()
    const now = DateTime.now().toMillis()

    return Math.max(0, Math.round(targetTime - now))
  }
}
