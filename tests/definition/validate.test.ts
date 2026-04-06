import fs from 'node:fs'
import path from 'node:path'
import { type SuiteDefinitionInterface, validate } from '../../src/definition/index'

const FIXTURES = path.join(__dirname, 'fixtures')

test('validate', async () => {
  const fileName = path.join(FIXTURES, 'suite_normal.json')
  const fileContent = JSON.parse(await fs.promises.readFile(fileName, 'utf8'))

  const suite: SuiteDefinitionInterface = validate(fileContent)
  expect(suite).toBeDefined()
})
