import { StepSingle } from '../../../src/model/index'
import type { StepOptions } from '../../../src/model/interfaceStepOptions'

export class StepSingleRunOnError extends StepSingle {
  constructor(opts: StepOptions) {
    super({
      ...opts,
      needData: false,
      runOnError: true
    })
  }

  async doRun(): Promise<void> {
    return await this.logInfo('Yeah, it runs')
  }
}
