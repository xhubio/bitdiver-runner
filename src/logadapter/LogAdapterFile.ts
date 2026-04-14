import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_TIME_FORMAT_FILE } from './constants'
import { getTimeString } from './getTimeString'
import type { LogAdapterFileOptions } from './interfaceLogAdpaterOptions'
import type { LogMessageInterface, LogMessageMetaInterface } from './interfaceLogMessage'
import { LogAdapterConsole } from './LogAdapterConsole'
import { getLogLevelName } from './logLevel'

/**
 * Implements a logAdapter. The results are written to the file system
 */
export class LogAdapterFile extends LogAdapterConsole {
  targetDir: string

  /* This format is for creating the file names  */
  timeFormatFileName = DEFAULT_TIME_FORMAT_FILE

  constructor(opts: LogAdapterFileOptions = {}) {
    super(opts)
    this.targetDir = opts.targetDir ? opts.targetDir : 'log'
    if (opts.timeFormatFileName !== undefined) {
      this.timeFormatFileName = opts.timeFormatFileName
    }
  }

  /**
   * Logs the data of a run
   * @param logMessage - The logMessage
   */
  async _logRun(logMessage: LogMessageInterface): Promise<void> {
    const targetPath = this._getRunTargetPath(logMessage.meta)
    await this._writeLogFile({ logMessage, targetPath })
  }

  /**
   * Log the data of a test case
   * @param logMessage - The logMessage
   */
  async _logTestcase(logMessage: LogMessageInterface): Promise<void> {
    const targetPath = this._getRunTargetPath(logMessage.meta)

    const tcCountAllLength = String(logMessage.meta.tc?.tcCountAll).length
    const tcNumberStr = String(logMessage.meta.tc?.tcCountCurrent).padStart(tcCountAllLength, '0')
    targetPath.push(`TC_${tcNumberStr}_${logMessage.meta.tc?.name}`)

    await this._writeLogFile({ logMessage, targetPath })
  }

  /**
   * Log the data of a step
   * @param logMessage - The logMessage
   */
  async _logStep(logMessage: LogMessageInterface): Promise<void> {
    const targetPath = this._getRunTargetPath(logMessage.meta)

    const tcCountAllLength = String(logMessage.meta.tc?.tcCountAll).length
    const tcNumberStr = String(logMessage.meta.tc?.tcCountCurrent).padStart(tcCountAllLength, '0')
    targetPath.push(`TC_${tcNumberStr}_${logMessage.meta.tc?.name}`)

    const stringCountLength = String(logMessage.meta.step?.stepCountAll).length
    const stepNumber = String(logMessage.meta.step?.stepCountCurrent).padStart(
      stringCountLength,
      '0'
    )
    targetPath.push(`Step_${stepNumber}_${logMessage.meta.step?.name}`)
    await this._writeLogFile({ logMessage, targetPath })
  }

  /**
   * Create the target Path segments from the run
   * @param meta - The meta information
   * @returns List of path segements
   */
  _getRunTargetPath(meta: LogMessageMetaInterface): string[] {
    const metaRunStartTimeString: string = getTimeString({
      time: meta.run.start,
      format: this.timeFormatFileName
    })

    if (meta.run.name !== undefined && meta.run.name !== '') {
      return [this.targetDir, `Run_${meta.run.name}_${metaRunStartTimeString}`]
    }
    return [this.targetDir, `Run_${metaRunStartTimeString}`]
  }

  /**
   * Writes the log to the target directory
   * @param request - The request as described
   */
  async _writeLogFile(request: {
    logMessage: LogMessageInterface
    targetPath: string[]
  }): Promise<void> {
    const { logMessage, targetPath } = request
    await fs.promises.mkdir(path.join(...targetPath), { recursive: true })

    const metaLogTimeString: string = getTimeString({
      time: logMessage.meta.logTime,
      format: this.timeFormat
    })

    const startTimeString: string = getTimeString({
      time: logMessage.meta.run.start,
      format: this.timeFormat
    })

    const fileTimeString: string = getTimeString({
      time: logMessage.meta.logTime,
      format: this.timeFormatFileName
    })

    const logMessagePrint: any = structuredClone(logMessage)
    logMessagePrint.meta.logTimeString = metaLogTimeString
    logMessagePrint.meta.run.startString = startTimeString

    const fileContent = JSON.stringify(logMessagePrint, null, 2)

    await this._writeFileExclusive({
      targetPath,
      timeStamp: fileTimeString,
      logLevel: getLogLevelName(logMessage.logLevel),
      content: fileContent
    })
  }

  /**
   * Atomically writes `content` to a uniquely-named file in `targetPath`.
   *
   * Uses `fs.open` with the `wx` flag (`O_CREAT | O_EXCL`) so concurrent
   * writers cannot end up targeting the same file. The sequence suffix is
   * incremented on each collision until a free slot is found, then the
   * content is written through the exclusive handle.
   */
  async _writeFileExclusive(request: {
    targetPath: string[]
    timeStamp: string
    logLevel: string
    content: string
  }): Promise<void> {
    const { targetPath, timeStamp, logLevel, content } = request

    let seq = 1
    // Bounded retry cap to avoid an infinite loop on unexpected errors
    const maxAttempts = 10_000
    while (seq <= maxAttempts) {
      // Always include a zero-padded sequence number so files written within
      // the same timestamp sort in the order they were produced.
      const seqStr = String(seq).padStart(2, '0')
      const fileName = path.join(...targetPath, `${timeStamp}_${seqStr}_${logLevel}.json`)

      let handle: fs.promises.FileHandle | undefined
      try {
        handle = await fs.promises.open(fileName, 'wx')
        await handle.writeFile(content)
        return
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
          seq++
          continue
        }
        throw err
      } finally {
        if (handle !== undefined) {
          await handle.close()
        }
      }
    }

    throw new Error(
      `LogAdapterFile: could not find a free file slot after ${String(maxAttempts)} attempts for '${timeStamp}_${logLevel}'`
    )
  }
}
