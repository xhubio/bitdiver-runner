import { StepBase } from '../../../src/model/index'
import type { StepOptions } from '../../../src/model/interfaceStepOptions'

export class StepRunOnError extends StepBase {
  constructor(opts: StepOptions) {
    super({ ...opts, needData: false, runOnError: true })
  }

  async doRun(): Promise<void> {
    return await this.logInfo('Yeah, it runs')
  }
}
