import type {
  LogAdapterInterface,
  LogMessageInterface,
  LogMessageSourceInterface
} from '../logadapter/index'
import type { EnvironmentRun } from './EnvironmentRun'
import type { EnvironmentTestcase } from './EnvironmentTestcase'
import type { StepBase } from './StepBase'
import type { StepNormal } from './StepNormal'
import type { StepSingle } from './StepSingle'

interface GenerateLogsRequest {
  /** The run environment */
  environmentRun: EnvironmentRun

  /** The test case environment. Or for SingleSteps an array of test case environments */
  environmentTestcase?: EnvironmentTestcase | EnvironmentTestcase[]

  /** The log adapter to use */
  logAdapter: LogAdapterInterface

  /** The message to log */
  messageObj: any

  /** The log level as string */
  logLevelString: string

  /** If this is a step log, the step instance object */
  step?: StepNormal | StepSingle | StepBase

  /** Source context for run-level logs */
  source?: LogMessageSourceInterface
}

/**
 * This function generates the log message as needed by the logadapter
 * and calls it. This method is extracted from the step because of reuse
 * in the runner
 * @param request - The request as defined in @see GenerateLogsRequest
 */
export async function generateLogs(request: GenerateLogsRequest): Promise<void> {
  const { logAdapter, environmentTestcase } = request
  const logMessage = buildBaseLogMessage(request)
  const promises: Array<Promise<unknown>> = []

  if (environmentTestcase === undefined) {
    promises.push(logAdapter.log(logMessage))
  } else if (!Array.isArray(environmentTestcase)) {
    attachTcMeta(logMessage, environmentTestcase)
    promises.push(logAdapter.log(logMessage))
  } else {
    emitForTestcaseArray(logMessage, environmentTestcase, request, logAdapter, promises)
  }

  await Promise.all(promises)
}

/** Build the base LogMessage shared by every emit path. */
function buildBaseLogMessage(request: GenerateLogsRequest): LogMessageInterface {
  const { environmentRun, messageObj, logLevelString, step, source } = request

  const logMessage: LogMessageInterface = {
    data: normalizeMessageData(messageObj),
    logLevel: logLevelString,
    meta: {
      run: {
        id: environmentRun.id,
        name: environmentRun.name,
        start: environmentRun.startTime
      },
      logTime: Date.now()
    }
  }

  if (source !== undefined) {
    logMessage.meta.source = source
  }
  if (step !== undefined) {
    logMessage.meta.step = {
      stepCountAll: step.countAll,
      stepCountCurrent: step.countCurrent,
      id: step.stepInstanceId,
      name: step.name,
      type: step.type
    }
  }

  return logMessage
}

/** Normalise an arbitrary message (string / Error / object) into the data shape. */
function normalizeMessageData(messageObj: unknown): any {
  if (messageObj instanceof Error) {
    return { message: messageObj.message, stack: messageObj.stack }
  }
  if (typeof messageObj === 'string') {
    return { message: messageObj }
  }
  return messageObj
}

/** Attach testcase metadata to the log message. */
function attachTcMeta(logMessage: LogMessageInterface, tc: EnvironmentTestcase): void {
  logMessage.meta.tc = {
    tcCountAll: tc.countAll,
    tcCountCurrent: tc.countCurrent,
    id: tc.id,
    name: tc.name
  }
}

/**
 * SingleStep with multiple testcases.
 *
 * For error/fatal levels: one run-level entry whose `source.testcases`
 * lists every affected testcase — a SingleStep failure isn't a per-TC
 * event.
 *
 * For info/debug/warning: one log per testcase so the per-TC view still
 * shows the step's lifecycle output.
 */
function emitForTestcaseArray(
  logMessage: LogMessageInterface,
  tcs: EnvironmentTestcase[],
  request: GenerateLogsRequest,
  logAdapter: LogAdapterInterface,
  promises: Array<Promise<unknown>>
): void {
  const collapseToRunLevel =
    request.logLevelString === 'error' || request.logLevelString === 'fatal'

  if (collapseToRunLevel) {
    logMessage.meta.source = {
      ...(logMessage.meta.source ?? {}),
      testcases: tcs.map((tc) => tc.name),
      stepName: request.step?.name ?? logMessage.meta.source?.stepName,
      isSingleStep: true
    }
    promises.push(logAdapter.log(logMessage))
    return
  }

  for (const tc of tcs) {
    attachTcMeta(logMessage, tc)
    promises.push(logAdapter.log(logMessage))
  }
}
