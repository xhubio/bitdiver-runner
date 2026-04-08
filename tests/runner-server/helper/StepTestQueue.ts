import { StepBase } from '../../../src/model/index'

export class StepTestQueue extends StepBase {
  name: string
  tcName: string
  console = false

  constructor(opts: { name: string; tcName: string; console?: boolean }) {
    super(opts)
    this.name = opts.name
    this.tcName = opts.tcName
    this.console = opts.console ?? false
  }

  logInfo(msg: string): Promise<void> {
    this.logMe(
      `Step: ${this.name} -> TC: ${this.tcName} at ${new Date()} method: 'logInfo' \t ${msg}`
    )
    return Promise.resolve()
  }

  /**
   * This method will be called when the step starts.
   */
  start(): Promise<void> {
    this.logMe(`Step: ${this.name} -> TC: ${this.tcName} at ${new Date()} method: 'start'`)
    return Promise.resolve()
  }

  /**
   * This method will be called just before the run method
   */
  beforeRun(): Promise<void> {
    this.logMe(`Step: ${this.name} -> TC: ${this.tcName} at ${new Date()} method: 'beforeRun'`)
    return Promise.resolve()
  }

  /**
   * This method will be called just before the run method
   */
  async run(): Promise<void> {
    await new Promise<void>((resolve) => {
      const time = 4000
      setTimeout(() => {
        this.logMe(`Step: ${this.name} -> TC: ${this.tcName} at ${new Date()} method: 'run'`)
        resolve()
      }, time)
    })
  }

  /**
   * This method will be called just after the run is finished
   */
  afterRun(): Promise<void> {
    this.logMe(`Step: ${this.name} -> TC: ${this.tcName} at ${new Date()} method: 'afterRun'`)
    return Promise.resolve()
  }

  /**
   * This method will be called when the step is finished
   */
  end(): Promise<void> {
    this.logMe(`Step: ${this.name} -> TC: ${this.tcName} at ${new Date()} method: 'end'`)
    return Promise.resolve()
  }

  logMe(msg: string): void {
    if (this.console) {
      // biome-ignore lint/suspicious/noConsole: test helper outputs to console when configured
      console.log(msg)
    }
  }
}
