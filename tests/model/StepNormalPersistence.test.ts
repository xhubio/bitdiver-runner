import fs from 'node:fs/promises'
import path from 'node:path'
import { EnvironmentRun } from '../../src/model/EnvironmentRun'
import { EnvironmentTestcase } from '../../src/model/EnvironmentTestcase'
import { StepNormal } from '../../src/model/StepNormal'

const VOLATILE = path.join(
  __dirname,
  '..',
  '..',
  'tests',
  'model',
  'volatile',
  'step-normal-persist'
)

class TestStep extends StepNormal {
  async run(): Promise<void> {}
}

function createStep(): TestStep {
  const step = new TestStep({ name: 'test' })
  const tcEnv = new EnvironmentTestcase()
  tcEnv.name = 'TC 1'
  step.environmentTestcase = tcEnv
  step.environmentRun = new EnvironmentRun()
  return step
}

beforeEach(async () => {
  await fs.rm(VOLATILE, { recursive: true, force: true })
})

afterAll(async () => {
  await fs.rm(VOLATILE, { recursive: true, force: true })
})

test('writeVars + loadVars roundtrip', async () => {
  const step = createStep()
  step.tc.map.set('result', { score: 42 })

  await step.writeVars(['result'], VOLATILE)
  step.deleteVars(['result'])
  expect(step.tc.map.has('result')).toBe(false)

  await step.loadVars(['result'], VOLATILE)
  expect(step.tc.map.get('result')).toEqual({ score: 42 })
})

test('exportVars writes and removes', async () => {
  const step = createStep()
  step.tc.map.set('big', [1, 2, 3])

  await step.exportVars(['big'], VOLATILE)
  expect(step.tc.map.has('big')).toBe(false)

  const file = await fs.readFile(path.join(VOLATILE, 'big.json'), 'utf8')
  expect(JSON.parse(file)).toEqual([1, 2, 3])
})

test('loadTempVars auto-cleans in afterRun', async () => {
  // First persist some data
  await fs.mkdir(VOLATILE, { recursive: true })
  await fs.writeFile(path.join(VOLATILE, 'temp.json'), JSON.stringify('temporary'))

  const step = createStep()
  await step.loadTempVars(['temp'], VOLATILE)
  expect(step.tc.map.get('temp')).toBe('temporary')

  // afterRun should clean up
  await step.afterRun()
  expect(step.tc.map.has('temp')).toBe(false)
})
