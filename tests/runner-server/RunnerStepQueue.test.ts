import fs from 'node:fs'
import path from 'node:path'

import { getLogAdapterMemory } from '../../src/logadapter/index'
import type { StepBase } from '../../src/model/index'
import { Runner } from '../../src/runner-server/index'
import { createRegistry } from './helper/helper'
import { StepTestQueue } from './helper/StepTestQueue'

const logAdapter = getLogAdapterMemory()
const TIMEOUT = 1000000
const registry = createRegistry()

const FIXTURES = path.join(__dirname, 'fixtures', 'RunnerStepQueue')

test(
  'Test that the steps are executed at the same time',
  async () => {
    const fileNameSuite = path.join(FIXTURES, 'suite_normal.json')

    const suiteDefiniton = JSON.parse(await fs.promises.readFile(fileNameSuite, 'utf8'))
    const runner = new Runner({
      id: 'myGreatId',
      dataDirectory: '',
      suite: suiteDefiniton,
      stepRegistry: registry,
      logAdapter,
      parallelExecution: true
    })

    const methods = ['beforeRun', 'run', 'afterRun']
    const stepInstances = createSteps(5)

    const startTime: number = Date.now()

    // biome-ignore lint/complexity/useLiteralKeys: bracket access needed for protected method
    await runner['_executeStepMethodParallel'](stepInstances, methods)

    const endTime: number = Date.now()
    expect(endTime - startTime).toBeLessThan(6 * 1000)
    expect(endTime - startTime).toBeGreaterThan(4 * 1000)
  },
  TIMEOUT
)

function createSteps(count: number): StepBase[] {
  const steps: StepBase[] = []

  for (let i = 0; i < count; i++) {
    const step = new StepTestQueue({ name: 'Step Name', tcName: `TC_${i + 1}` })
    steps.push(step)
  }
  return steps
}
