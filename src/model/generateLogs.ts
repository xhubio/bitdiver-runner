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
  const {
    environmentRun,
    environmentTestcase,
    logAdapter,
    messageObj,
    logLevelString,
    step,
    source
  } = request

  // The base data object
  let data: any = {}

  if (messageObj instanceof Error) {
    data = {
      message: messageObj.message,
      stack: messageObj.stack
    }
  } else if (typeof messageObj === 'string') {
    data = { message: messageObj }
  } else {
    data = messageObj
  }

  const logMessage: LogMessageInterface = {
    data,
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
  const promises = []
  if (environmentTestcase !== undefined) {
    // ----------------------------------------------
    // For a normal step the log will be written just once
    // ----------------------------------------------
    if (!Array.isArray(environmentTestcase)) {
      logMessage.meta.tc = {
        tcCountAll: environmentTestcase.countAll,
        tcCountCurrent: environmentTestcase.countCurrent,
        id: environmentTestcase.id,
        name: environmentTestcase.name
      }
      promises.push(logAdapter.log(logMessage))
    } else {
      // ----------------------------------------------
      // Single step with multiple testcases.
      //
      // For error/fatal levels we write a single run-level entry whose
      // `source.testcases` lists every affected testcase — a SingleStep
      // failure isn't a per-testcase event.
      //
      // For info/debug/warning we keep a log per testcase so the per-TC
      // view still shows the step's lifecycle output.
      // ----------------------------------------------
      const collapseToRunLevel =
        logLevelString === 'error' || logLevelString === 'fatal'

      if (collapseToRunLevel) {
        logMessage.meta.source = {
          ...(logMessage.meta.source ?? {}),
          testcases: environmentTestcase.map((tc) => tc.name),
          stepName: step?.name ?? logMessage.meta.source?.stepName,
          isSingleStep: true
        }
        promises.push(logAdapter.log(logMessage))
      } else {
        for (const tcEnv of environmentTestcase) {
          logMessage.meta.tc = {
            tcCountAll: tcEnv.countAll,
            tcCountCurrent: tcEnv.countCurrent,
            id: tcEnv.id,
            name: tcEnv.name
          }
          promises.push(logAdapter.log(logMessage))
        }
      }
    }
  } else {
    promises.push(logAdapter.log(logMessage))
  }

  await Promise.all(promises)
}
