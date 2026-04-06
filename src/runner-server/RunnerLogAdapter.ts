import type { LogAdapterInterface, LogMessageInterface } from '../logadapter/index'

/**
 * A LogAdapter wrapper that delegates to the Runner's log() method.
 * This allows the Runner to intercept log messages from steps
 * to update testcase/run status before forwarding to the actual logger.
 */
export class RunnerLogAdapter implements LogAdapterInterface {
  private runner: { log: (logMessage: LogMessageInterface) => Promise<void> }

  constructor(runner: { log: (logMessage: LogMessageInterface) => Promise<void> }) {
    this.runner = runner
  }

  get levelName(): string {
    return 'debug'
  }

  get levelNumber(): number {
    return 0
  }

  async reset(): Promise<void> {
    // Nothing to reset — the runner manages state
  }

  async log(logMessage: LogMessageInterface): Promise<void> {
    await this.runner.log(logMessage)
  }
}
