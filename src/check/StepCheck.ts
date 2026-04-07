import fs from 'node:fs/promises'
import path from 'node:path'
import { STATUS_ERROR } from '../model/constants'
import { StepNormal } from '../model/StepNormal'
import { runCheck } from './runCheck'
import type { CheckResult, CheckStepData } from './types'

/**
 * Generic step that compares actual test results against expected data.
 *
 * For each check configuration in the step data:
 * 1. Maps actual files to expected files (by filename)
 * 2. Compares each pair using @aikotools/datacompare
 * 3. Writes status and summary files
 * 4. Sets testcase to ERROR if any check fails
 *
 * Step data must contain:
 * - resultDir: where actual results are
 * - dataDir: where expected data is
 * - checks: array of CheckConfig
 *
 * @example
 * ```typescript
 * // Step data in suite:
 * {
 *   "resultDir": "/path/to/results/TC_01",
 *   "dataDir": "/path/to/testdata/TC_01",
 *   "checks": [{
 *     "name": "kafka-events",
 *     "actualDir": "events/kafka",
 *     "expectedDir": "expected/kafka",
 *     "ignorePaths": [{ "path": ["header", "messageId"] }]
 *   }]
 * }
 * ```
 */
export class StepCheck extends StepNormal {
  /** Results of all checks (accessible after run for further processing) */
  results: CheckResult[] = []

  constructor(opts: { name: string }) {
    super({ ...opts, runOnError: true })
  }

  async run(): Promise<void> {
    if (!this.hasData()) {
      await this.logInfo('No check data provided, skipping')
      return
    }

    const stepData = this.data as CheckStepData

    if (!stepData.checks || stepData.checks.length === 0) {
      await this.logInfo('No checks configured, skipping')
      return
    }

    this.results = []
    let hasFailures = false

    for (const checkConfig of stepData.checks) {
      try {
        const result = await runCheck({
          checkConfig,
          resultDir: stepData.resultDir,
          dataDir: stepData.dataDir
        })

        this.results.push(result)

        // Write result files
        const checkResultDir = path.join(stepData.resultDir, checkConfig.name)
        await fs.mkdir(checkResultDir, { recursive: true })

        await fs.writeFile(
          path.join(checkResultDir, 'summary.json'),
          JSON.stringify(result.summary, null, 2)
        )

        await fs.writeFile(
          path.join(checkResultDir, 'mapping.json'),
          JSON.stringify(result.mapping, null, 2)
        )

        if (result.fileStatuses.length > 0) {
          await fs.writeFile(
            path.join(checkResultDir, 'details.json'),
            JSON.stringify(result.fileStatuses, null, 2)
          )
        }

        // Report results
        if (result.summary.failed > 0 || result.summary.missing > 0) {
          hasFailures = true
          await this.logWarning({
            check: checkConfig.name,
            summary: result.summary
          })
        } else {
          await this.logInfo({
            check: checkConfig.name,
            summary: result.summary
          })
        }
      } catch (error) {
        hasFailures = true
        if (error instanceof Error) {
          await this.logError({
            check: checkConfig.name,
            message: error.message,
            stack: error.stack
          })
        } else {
          await this.logError({ check: checkConfig.name, message: String(error) })
        }
      }
    }

    if (hasFailures && this.environmentTestcase) {
      this.environmentTestcase.status = STATUS_ERROR
    }
  }

  /** Check if step has usable data */
  private hasData(): boolean {
    return this.data !== undefined && this.data !== null
  }
}
