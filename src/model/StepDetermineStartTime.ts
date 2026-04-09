import { StepSingle } from './StepSingle'

/** The key under which the reference time is stored in environmentRun.map */
export const REFERENCE_TIME_KEY = 'referenceTime'

/**
 * A single step that calculates a future reference time for timed steps.
 *
 * The reference time is calculated as:
 *   now + offsetSeconds + (activeTestcaseCount * delaySeconds)
 *
 * This gives subsequent setup steps a time budget to consume. A
 * {@link StepCheckStartTime} step placed before the timed block verifies that
 * the budget was not exceeded.
 *
 * The result is written to `environmentRun.map` under the key `referenceTime`
 * (milliseconds since epoch). The Runner reads this value when executing
 * timed steps.
 *
 * Step data: `{ offsetSeconds?: number, delaySeconds?: number }`
 *
 * In the Normal execution mode the step runs once per testcase, so the
 * reference time is recalculated for every testcase. In Batch mode the step
 * runs once for all testcases together.
 *
 * @example
 * ```yaml
 * setup:
 *   - A
 *   - B
 *   - step: DetermineStartTime
 *     offsetSeconds: 40
 *     delaySeconds: 0.3
 *   - C
 *   - CheckStartTime
 * ```
 */
export class StepDetermineStartTime extends StepSingle {
  needData = false

  async run(): Promise<void> {
    const params =
      (this.data?.[0] as { offsetSeconds?: number; delaySeconds?: number } | undefined) ?? {}
    const offsetSeconds = params.offsetSeconds ?? 0
    const delaySeconds = params.delaySeconds ?? 0
    const activeCount = this.environmentTestcase?.length ?? 0

    const referenceTime = Date.now() + offsetSeconds * 1000 + activeCount * delaySeconds * 1000

    if (this.environmentRun === undefined) {
      throw new Error(`Step '${this.name}': environmentRun is undefined.`)
    }
    this.environmentRun.map.set(REFERENCE_TIME_KEY, referenceTime)

    await this.logInfo({
      message: 'Start time determined',
      referenceTime: new Date(referenceTime).toISOString(),
      offsetSeconds,
      delaySeconds,
      activeCount
    })
  }
}
