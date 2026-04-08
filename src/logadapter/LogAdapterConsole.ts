import { DEFAULT_TIME_FORMAT } from './constants'
import type { LogAdapterInterface } from './interfaceLogAdapter'
import type { LogAdapterOptions } from './interfaceLogAdpaterOptions'
import type { LogMessageInterface } from './interfaceLogMessage'
import { DEFAULT_LOG_LEVEL, getLogLevelName, getLogLevelNumber } from './logLevel'

/**
 * Implements a console logAdapter
 */
export class LogAdapterConsole implements LogAdapterInterface {
  level: number
  timeFormat: string

  constructor(opts: LogAdapterOptions = {}) {
    if (opts.logLevel !== undefined) {
      this.level = getLogLevelNumber(opts.logLevel)
    } else {
      this.level = DEFAULT_LOG_LEVEL
    }

    if (opts.timeFormat !== undefined) {
      this.timeFormat = opts.timeFormat
    } else {
      this.timeFormat = DEFAULT_TIME_FORMAT
    }
  }

  /**
   * Returns the logLevel name as a string
   *
   * @returns The logLevel
   */
  get levelName(): string {
    return getLogLevelName(this.level)
  }

  /**
   * Returns the logLevel as a number
   *
   * @returns  The logLevel
   */
  get levelNumber(): number {
    return this.level
  }

  /**
   * Clears all the existing log entries
   * Placeholder for the implementing loggers
   */
  reset(): Promise<void> {
    return Promise.resolve()
  }

  /**
   * Logs a message.
   * @param logMessage - The message to be logged. @see LogMessageInterface
   */
  async log(logMessage: LogMessageInterface): Promise<void> {
    const newLevelNumber = getLogLevelNumber(logMessage.logLevel)
    const newLevelString = getLogLevelName(newLevelNumber)
    logMessage.logLevel = newLevelString

    if (newLevelNumber >= this.levelNumber) {
      await this._writeLog(logMessage)
    }
  }

  /**
   * This method will do the work. It is called by the log method
   * if the logLevel of the message shows that the message is relavant for logging
   *
   * @param logMessage - The message to be logged. @see LogMessageInterface
   * @returns Promise<void>
   */
  async _writeLog(logMessage: LogMessageInterface): Promise<void> {
    const meta = logMessage.meta

    if (meta.step !== undefined) {
      // this is a step log
      return await this._logStep(logMessage)
    } else if (meta.tc !== undefined) {
      // This is a testcase log
      return await this._logTestcase(logMessage)
    }
    // This is a run log
    return await this._logRun(logMessage)
  }

  /**
   * Logs the data of a run
   *
   * @param logMessage - The message to be logged. @see LogMessageInterface
   * @returns Promise<void>
   */
  _logRun(logMessage: LogMessageInterface): Promise<void> {
    const message = extractMessageString(logMessage)

    if (logMessage.meta.source) {
      const src = logMessage.meta.source
      const tcInfo = src.testcases.length > 0 ? src.testcases.join(', ') : 'unknown'
      const stepInfo = src.stepName ? ` → ${src.stepName}` : ''
      const singleInfo = src.isSingleStep ? ' [SingleStep]' : ''
      // biome-ignore lint/suspicious/noConsole: log adapter outputs to console
      console.log(`Run ${logMessage.logLevel}: ${tcInfo}${stepInfo}${singleInfo}: ${message}`)
    } else {
      // biome-ignore lint/suspicious/noConsole: log adapter outputs to console
      console.log(`Run: ${message}`)
    }
    return Promise.resolve()
  }

  /**
   * Logs the data of a test case
   *
   * @param logMessage - The message to be logged. @see LogMessageInterface
   * @returns Promise<void>
   */
  _logTestcase(logMessage: LogMessageInterface): Promise<void> {
    if (logMessage.meta.tc === undefined) {
      throw new Error('_logTestcase must be provided with meta.tc')
    }
    const testcaseName = logMessage.meta.tc.name
    const message = extractMessageString(logMessage)

    // biome-ignore lint/suspicious/noConsole: log adapter outputs to console
    console.log(
      'Test case: ',
      `${testcaseName}:\n${{ data: message, logLevel: logMessage.logLevel }}`
    )
    return Promise.resolve()
  }

  /**
   * Log the data of a step
   * @param logMessage - The message to be logged. @see LogMessageInterface
   * @returns Promise<void>
   */
  _logStep(logMessage: LogMessageInterface): Promise<void> {
    if (logMessage.meta.tc === undefined || logMessage.meta.step === undefined) {
      throw new Error('_logTestcase must be provided with meta.tc and meta.step')
    }
    const testcaseName = logMessage.meta.tc.name
    const stepName = logMessage.meta.step.name
    const message = extractMessageString(logMessage)

    // biome-ignore lint/suspicious/noConsole: log adapter outputs to console
    console.log('Step: ', `${logMessage.logLevel} ${testcaseName}->${stepName} ${message}`)
    return Promise.resolve()
  }
}

/**
 * Extracts the printable message from the LogMessage object
 * @param logMessage - The message to be logged. @see LogMessageInterface
 * @returns - The printable message string
 */
function extractMessageString(logMessage: LogMessageInterface): string {
  let message = logMessage.data
  if (typeof logMessage.data === 'object') {
    message = JSON.stringify(logMessage.data, null, 2)
  }
  return message
}
