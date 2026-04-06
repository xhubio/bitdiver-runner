import {
  LogAdapterMemory,
  type LogMessageInterface,
  type LogMessageSourceInterface
} from '../../src/logadapter/index'
import { Runner } from '../../src/runner-server/index'
import { createRegistry, createSuite } from './helper/helper'

const TIMEOUT = 1000000
const registry = createRegistry()

/**
 * Extends LogAdapterMemory to also capture source info from run-level log messages.
 * The base _logRun stores only { data, logLevel }, so we override it to also
 * record the source field from meta.
 */
class LogAdapterMemoryWithSource extends LogAdapterMemory {
  runLogsWithSource: Array<{
    data: any
    logLevel: string | number
    source?: LogMessageSourceInterface
  }> = []

  async reset(): Promise<void> {
    await super.reset()
    this.runLogsWithSource = []
  }

  async _logRun(logMessage: LogMessageInterface): Promise<void> {
    await super._logRun(logMessage)
    this.runLogsWithSource.push({
      data: logMessage.data,
      logLevel: logMessage.logLevel,
      source: logMessage.meta.source
    })
  }
}

test(
  'Error in normal step: run-level log has source with TC name and step name',
  async () => {
    const logAdapter = new LogAdapterMemoryWithSource()
    logAdapter.level = 0

    const suiteDefinition = createSuite({})

    // TC 2 (index 1), step index 0 is a normal step named "Step normal 1"
    const data = {
      run: {
        action: 'logError',
        value: 'ERROR from normal step'
      }
    }
    suiteDefinition.testcases[1].data[suiteDefinition.steps[0]] = data

    const runner = new Runner({
      id: 'sourceLoggingRunId',
      dataDirectory: '',
      suite: suiteDefinition,
      stepRegistry: registry,
      logAdapter,
      parallelExecution: true
    })

    await runner.run()

    // Find run-level logs that have source info referencing TC 2
    const sourceLog = logAdapter.runLogsWithSource.find((entry) =>
      entry.source?.testcases.includes('TC 2')
    )

    expect(sourceLog).toBeDefined()
    expect(sourceLog?.source?.testcases).toContain('TC 2')
    expect(sourceLog?.source?.stepName).toBe('Step normal 1')
    expect(sourceLog?.source?.isSingleStep).toBe(false)
  },
  TIMEOUT
)

test(
  'Error in single step: run-level log has source with isSingleStep=true',
  async () => {
    const logAdapter = new LogAdapterMemoryWithSource()
    logAdapter.level = 0

    const suiteDefinition = createSuite({})

    // TC 2 (index 1), step index 1 is a single step named "Step single 2"
    const data = {
      run: {
        action: 'logError',
        value: 'ERROR from single step'
      }
    }
    suiteDefinition.testcases[1].data[suiteDefinition.steps[1]] = data

    const runner = new Runner({
      id: 'sourceLoggingSingleRunId',
      dataDirectory: '',
      suite: suiteDefinition,
      stepRegistry: registry,
      logAdapter,
      parallelExecution: true
    })

    await runner.run()

    // Find run-level logs that have source info with isSingleStep=true
    const sourceLog = logAdapter.runLogsWithSource.find(
      (entry) => entry.source !== undefined && entry.source.isSingleStep === true
    )

    expect(sourceLog).toBeDefined()
    expect(sourceLog?.source?.stepName).toBe('Step single 2')
    expect(sourceLog?.source?.isSingleStep).toBe(true)
  },
  TIMEOUT
)
