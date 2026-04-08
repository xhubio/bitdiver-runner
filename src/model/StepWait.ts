import { StepSingle } from './StepSingle'

/**
 * A single step that waits for a configurable duration.
 * Useful for adding delays between phases (e.g. waiting for data propagation).
 *
 * Step data: `{ seconds: number }`
 *
 * In testMode, the wait is skipped.
 *
 * @example
 * ```yaml
 * # In suite config:
 * setup:
 *   - SendData
 *   - step: Wait
 *     seconds: 30
 *   - CheckResults
 * ```
 */
export class StepWait extends StepSingle {
  async run(): Promise<void> {
    // All testcases have the same data — use the first one
    const seconds = (this.data?.[0] as { seconds?: number } | undefined)?.seconds ?? 0

    if (seconds <= 0) {
      return
    }

    if (this.testMode) {
      await this.logInfo(`Wait ${String(seconds)}s (skipped in test mode)`)
      return
    }

    await this.logInfo(`Waiting ${String(seconds)}s...`)
    await new Promise<void>((resolve) => {
      setTimeout(resolve, seconds * 1000)
    })
    await this.logInfo('Wait complete')
  }
}
