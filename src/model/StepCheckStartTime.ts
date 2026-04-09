import { REFERENCE_TIME_KEY } from './StepDetermineStartTime'
import { StepSingle } from './StepSingle'

/**
 * A single step that verifies the reference time set by
 * {@link StepDetermineStartTime} has not been exceeded yet.
 *
 * Reads `referenceTime` (milliseconds since epoch) from `environmentRun.map`
 * and compares it to `Date.now()`:
 *
 * - `diff > 0` (on schedule): logs INFO with the remaining wait time and
 *   blocks until the reference time is reached.
 * - `diff <= 0` (overrun): logs FATAL with the amount of overrun in
 *   milliseconds. The Runner treats FATAL as abort condition — the run is
 *   stopped so the user can adjust `offsetSeconds` / `delaySeconds`.
 *
 * In testMode the waiting is skipped but the overrun check still runs.
 *
 * @example
 * ```yaml
 * setup:
 *   - step: DetermineStartTime
 *     offsetSeconds: 40
 *     delaySeconds: 0.3
 *   - C
 *   - D
 *   - CheckStartTime
 * ```
 */
export class StepCheckStartTime extends StepSingle {
  needData = false

  async run(): Promise<void> {
    if (this.environmentRun === undefined) {
      throw new Error(`Step '${this.name}': environmentRun is undefined.`)
    }
    const referenceTime = this.environmentRun.map.get(REFERENCE_TIME_KEY) as number | undefined

    if (referenceTime === undefined) {
      await this.logError({
        message: 'No referenceTime set — DetermineStartTime must run before CheckStartTime'
      })
      return
    }

    const diff = referenceTime - Date.now()

    if (diff > 0) {
      await this.logInfo({
        message: 'On schedule, waiting until start time',
        waitMs: diff,
        referenceTime: new Date(referenceTime).toISOString()
      })
      if (!this.testMode) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, diff)
        })
      }
      return
    }

    await this.logFatal({
      message: 'Start time overrun — increase offsetSeconds or delaySeconds on DetermineStartTime',
      overrunMs: -diff,
      referenceTime: new Date(referenceTime).toISOString()
    })
  }
}
