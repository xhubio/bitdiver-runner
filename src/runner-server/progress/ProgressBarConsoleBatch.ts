import ProgressBar from 'ts-progress'

import { ProgressMeterBatch } from './ProgressMeterBatch'

export class ProgressBarConsoleBatch extends ProgressMeterBatch {
  progressBar?: any

  _printHeader(): void {
    // biome-ignore lint/suspicious/noConsole: progress bar outputs to console
    console.log('------------------------------------------------')
    // biome-ignore lint/suspicious/noConsole: progress bar outputs to console
    console.log(`| Execute suite:           ${this.name}`)
    // biome-ignore lint/suspicious/noConsole: progress bar outputs to console
    console.log(`| Total step count:        ${this.stepCount}`)
    // biome-ignore lint/suspicious/noConsole: progress bar outputs to console
    console.log(`| Total test case count:   ${this.testcaseCount}`)
    // biome-ignore lint/suspicious/noConsole: progress bar outputs to console
    console.log('------------------------------------------------')
  }

  _printFooter(): void {
    // biome-ignore lint/suspicious/noConsole: progress bar outputs to console
    console.log('------------------------------------------------')
    // biome-ignore lint/suspicious/noConsole: progress bar outputs to console
    console.log(`| Result for suite:        ${this.name}`)
    // biome-ignore lint/suspicious/noConsole: progress bar outputs to console
    console.log(`| Steps:                   ${this.currentStep}/${this.stepCount}`)
    // biome-ignore lint/suspicious/noConsole: progress bar outputs to console
    console.log(`| Testcase:                ${this.currentTestcase}/${this.testcaseCount}`)
    // biome-ignore lint/suspicious/noConsole: progress bar outputs to console
    console.log(`| Last step:               ${this.lastStepName}`)
    // biome-ignore lint/suspicious/noConsole: progress bar outputs to console
    console.log(`| Last test case:          ${this.lastTestcaseName}`)
    // biome-ignore lint/suspicious/noConsole: progress bar outputs to console
    console.log('------------------------------------------------')
  }

  done(): void {
    super.done()
    this._printFooter()
  }

  init(request: { testcaseCount: number; stepCount: number; name?: string }): void {
    super.init(request)

    this._printHeader()

    this.progressBar = ProgressBar.create({
      total: this.stepCount,
      pattern:
        'Step progress:  {bar} | {current}/{total} | Remaining: {remaining} | Elapsed: {elapsed} | Memory: {memory} ',
      textColor: 'green',
      updateFrequency: 100
    })
  }

  /**
   * Increments the current step count. Will be called when starting
   * a new step.
   * @param name - The name of the current step
   */
  incStep(name: string): void {
    super.incStep(name)
    this.progressBar.update()
  }
}
