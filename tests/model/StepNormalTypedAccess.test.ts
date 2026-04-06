import { EnvironmentRun } from '../../src/model/EnvironmentRun'
import { EnvironmentTestcase } from '../../src/model/EnvironmentTestcase'
import { StepNormal } from '../../src/model/StepNormal'

class TestStep extends StepNormal {
  async run(): Promise<void> {}
}

test('tc getter returns environmentTestcase', () => {
  const step = new TestStep({ name: 'test' })
  const tcEnv = new EnvironmentTestcase()
  tcEnv.name = 'TC 1'
  step.environmentRun = new EnvironmentRun()
  step.environmentTestcase = tcEnv

  expect(step.tc).toBe(tcEnv)
  expect(step.tc.name).toBe('TC 1')
})

test('tc getter throws when not initialized', () => {
  const step = new TestStep({ name: 'test' })

  expect(() => step.tc).toThrow('tc is not set')
})

test('backward compat: environmentTestcase and data still work', () => {
  const step = new TestStep({ name: 'test' })
  const tcEnv = new EnvironmentTestcase()
  step.environmentRun = new EnvironmentRun()
  step.environmentTestcase = tcEnv
  step.data = { foo: 'bar' }

  expect(step.environmentTestcase).toBe(tcEnv)
  expect(step.data).toEqual({ foo: 'bar' })
  expect(step.tc).toBe(tcEnv)
})
