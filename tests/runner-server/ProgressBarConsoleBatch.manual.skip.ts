import { ProgressBarConsoleBatch, Runner } from '../../src/runner-server/index'
import { createRegistry, createSuite } from './helper/helper'

const registry = createRegistry()

const options = {
  parallelExecution: true,
  posTc: 1, // The tc where to store the action
  posStep: 0, // The step where to store the action
  extendedRes: false, // should create extended log result?
  action: 'unknown', // The action of the testcase data
  value: 'unknown' // The value for the action
}

const suiteDefiniton = createSuite({})

const data = {
  run: {
    action: options.action,
    value: options.value
  }
}
suiteDefiniton.testcases[options.posTc].data[options.posStep] = data

const runner = new Runner({
  dataDirectory: '',
  stepRegistry: registry,
  id: '0815',
  suite: suiteDefiniton,
  parallelExecution: options.parallelExecution,
  progressMeterBatch: new ProgressBarConsoleBatch()
})

runner
  .run()
  .then(() => {
    // biome-ignore lint/suspicious/noConsole: manual test script output
    console.log('\n\nFINISHED')
  })
  .catch((err) => {
    // biome-ignore lint/suspicious/noConsole: manual test script output
    console.log('ERROR: ', err)
  })
