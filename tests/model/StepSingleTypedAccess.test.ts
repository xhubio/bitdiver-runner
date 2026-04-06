import { EnvironmentRun } from '../../src/model/EnvironmentRun'
import { EnvironmentTestcase } from '../../src/model/EnvironmentTestcase'
import { StepSingle } from '../../src/model/StepSingle'

class TestSingleStep extends StepSingle {
  async run(): Promise<void> {}
}

test('testcases getter combines environments and data', () => {
  const step = new TestSingleStep({ name: 'test' })
  const tc1 = new EnvironmentTestcase()
  tc1.name = 'TC 1'
  const tc2 = new EnvironmentTestcase()
  tc2.name = 'TC 2'

  step.environmentRun = new EnvironmentRun()
  step.environmentTestcase = [tc1, tc2]
  step.data = [{ foo: 'a' }, { foo: 'b' }]

  const result = step.testcases
  expect(result).toHaveLength(2)
  expect(result[0].environment).toBe(tc1)
  expect(result[0].data).toEqual({ foo: 'a' })
  expect(result[1].environment).toBe(tc2)
  expect(result[1].data).toEqual({ foo: 'b' })
})

test('testcases getter handles missing data entries', () => {
  const step = new TestSingleStep({ name: 'test' })
  const tc1 = new EnvironmentTestcase()
  const tc2 = new EnvironmentTestcase()

  step.environmentRun = new EnvironmentRun()
  step.environmentTestcase = [tc1, tc2]
  step.data = [{ some: 'data' }] // only 1 entry for 2 TCs

  const result = step.testcases
  expect(result).toHaveLength(2)
  expect(result[0].data).toEqual({ some: 'data' })
  expect(result[1].data).toBeUndefined()
})

test('testcases getter throws when not initialized', () => {
  const step = new TestSingleStep({ name: 'test' })

  expect(() => step.testcases).toThrow('testcases not set')
})

test('backward compat: environmentTestcase and data arrays still work', () => {
  const step = new TestSingleStep({ name: 'test' })
  const tc1 = new EnvironmentTestcase()
  const tc2 = new EnvironmentTestcase()

  step.environmentRun = new EnvironmentRun()
  step.environmentTestcase = [tc1, tc2]
  step.data = ['d1', 'd2']

  expect(step.environmentTestcase).toEqual([tc1, tc2])
  expect(step.data).toEqual(['d1', 'd2'])

  // And the typed getter works too
  expect(step.testcases[0].environment).toBe(tc1)
  expect(step.testcases[1].data).toBe('d2')
})
