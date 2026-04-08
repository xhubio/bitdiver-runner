import { ProgressMeterBatch } from './ProgressMeterBatch'

export class ProgressBarConsoleLogBatch extends ProgressMeterBatch {
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
    console.log(`| Failed:                  ${this.testcaseFailed}`)
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
  }

  /**
   * Increments the current step count. Will be called when starting
   * a new step.
   * @param name - The name of the current step
   */
  incStep(name: string): void {
    super.incStep(name)

    // biome-ignore lint/suspicious/noConsole: progress bar outputs to console
    console.log(`${this.currentStep}/${this.stepCount} ${this.lastStepName}`)
  }
}
