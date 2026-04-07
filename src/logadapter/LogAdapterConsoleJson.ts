import { getTimeString } from './getTimeString'
import type { LogMessageInterface } from './interfaceLogMessage'
import { LogAdapterConsole } from './LogAdapterConsole'

/**
 * Implements a Logadaper whoch writes the log as JSON
 */
export class LogAdapterConsoleJson extends LogAdapterConsole {
  /**
   *
   * This method will do the work. It is called by the log method
   * if the logLevel of the message shows that the message is relavant for logging
   * @param logMessage - The message to be logged
   * @returns Promise<void>
   */
  async _writeLog(logMessage: LogMessageInterface): Promise<void> {
    const meta = logMessage.meta
    const data = logMessage.data
    const logLevel = logMessage.logLevel

    const metaLogTimeString: string = getTimeString({
      time: meta.logTime,
      format: this.timeFormat
    })
    const metaRunStartTimeString: string = getTimeString({
      time: meta.run.start,
      format: this.timeFormat
    })

    if (meta.step?.id) {
      const printObject: any = structuredClone({ meta, data, logLevel })
      printObject.meta.logTime = metaLogTimeString
      printObject.meta.run.start = metaRunStartTimeString

      // eslint-disable-next-line no-console
      console.log(JSON.stringify(printObject))
    } else if (meta.tc !== undefined) {
      // Testcase-level log — not printed in JSON adapter (step logs only)
    } else {
      // Run-level log — not printed in JSON adapter (step logs only)
    }
  }
}
