import { z } from 'zod'
import type { SuiteDefinitionInterface } from '../interfaceSuiteDefinition'

const stepDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string()
})

const testcaseDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  data: z.record(z.string(), z.unknown())
})

const suiteDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  steps: z.array(z.string()),
  stepDefinitions: z.record(z.string(), stepDefinitionSchema),
  testcases: z.array(testcaseDefinitionSchema),
  executionMode: z.enum(['batch', 'normal'])
})

export function validate(value: unknown): SuiteDefinitionInterface {
  const result = suiteDefinitionSchema.safeParse(value)
  if (result.success) {
    return result.data as SuiteDefinitionInterface
  }
  const errors = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
  throw new Error(JSON.stringify(errors, null, 2))
}
