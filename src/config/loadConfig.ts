import fs from 'node:fs/promises'
import type { ZodObject, ZodRawShape, z } from 'zod'

export interface LoadConfigRequest<T extends ZodRawShape> {
  /** Zod schema defining the config structure, types and defaults */
  schema: ZodObject<T>

  /** Optional path to a JSON config file */
  file?: string

  /** Optional inline config object (merged with file, takes precedence) */
  values?: Record<string, unknown>

  /** Prefix for environment variable overrides (e.g. 'FRAMEWORK' → FRAMEWORK_GIT_USER) */
  envPrefix?: string

  /** Dot-paths of secret fields that should be masked in logs (e.g. ['git.password']) */
  secrets?: string[]
}

export interface LoadConfigResult<T extends ZodRawShape> {
  /** The validated and typed config object */
  config: z.infer<ZodObject<T>>

  /** String representation safe for logging (secrets masked) */
  toString: () => string
}

/**
 * Load and validate configuration from multiple sources.
 *
 * Priority (highest wins):
 * 1. Environment variables (with prefix)
 * 2. Inline values
 * 3. JSON file
 * 4. Schema defaults
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   git: z.object({
 *     user: z.string(),
 *     password: z.string()
 *   }),
 *   runner: z.object({
 *     testMode: z.boolean().default(false)
 *   })
 * })
 *
 * const { config } = await loadConfig({
 *   schema,
 *   file: './config.json',
 *   envPrefix: 'FRAMEWORK',
 *   secrets: ['git.password']
 * })
 * // config.git.user is typed as string
 * ```
 */
export async function loadConfig<T extends ZodRawShape>(
  request: LoadConfigRequest<T>
): Promise<LoadConfigResult<T>> {
  const { schema, file, values, envPrefix, secrets = [] } = request

  // Layer 1: Load from file
  let fileData: Record<string, unknown> = {}
  if (file) {
    const raw = await fs.readFile(file, 'utf8')
    fileData = JSON.parse(raw)
  }

  // Layer 2: Merge inline values
  const merged = deepMerge(fileData, values ?? {})

  // Layer 3: Apply environment variable overrides
  if (envPrefix) {
    applyEnvOverrides(merged, envPrefix, schema)
  }

  // Layer 4: Validate with Zod (applies defaults)
  const result = schema.safeParse(merged)
  if (!result.success) {
    const errors = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`Config validation failed:\n${errors.join('\n')}`)
  }

  const config = result.data as z.infer<ZodObject<T>>

  return {
    config,
    toString: () => configToString(config, secrets)
  }
}

/**
 * Apply environment variable overrides to a config object.
 * Walks the Zod schema to discover all leaf paths, then checks
 * for matching env vars with the given prefix.
 *
 * Path `git.data.url` with prefix `FRAMEWORK` → `FRAMEWORK_GIT_DATA_URL`
 */
function applyEnvOverrides(
  target: Record<string, unknown>,
  prefix: string,
  schema: ZodObject<ZodRawShape>
): void {
  const paths = collectPaths(schema)

  for (const dotPath of paths) {
    const envName = `${prefix}_${camelToUpperSnake(dotPath)}`
    const envValue = process.env[envName]

    if (envValue !== undefined) {
      setNestedValue(target, dotPath.split('.'), coerceValue(envValue))
    }
  }
}

/**
 * Collect all leaf paths from a Zod schema.
 * e.g. z.object({ git: z.object({ user: z.string() }) }) → ['git.user']
 */
function collectPaths(schema: ZodObject<ZodRawShape>, prefix: string[] = []): string[] {
  const paths: string[] = []
  const shape = schema.shape

  for (const [key, value] of Object.entries(shape)) {
    const currentPath = [...prefix, key]
    // Unwrap optional, default, nullable wrappers to get to the inner type
    const inner = unwrapZodType(value)

    if (inner._def?.typeName === 'ZodObject') {
      paths.push(...collectPaths(inner as ZodObject<ZodRawShape>, currentPath))
    } else {
      paths.push(currentPath.join('.'))
    }
  }

  return paths
}

/**
 * Unwrap Zod wrappers (optional, default, nullable) to get the inner type.
 */
function unwrapZodType(zodType: any): any {
  let current = zodType
  while (
    current._def?.typeName === 'ZodOptional' ||
    current._def?.typeName === 'ZodDefault' ||
    current._def?.typeName === 'ZodNullable'
  ) {
    current = current._def.innerType
  }
  return current
}

/**
 * Convert a dot-path with camelCase segments to UPPER_SNAKE_CASE.
 * e.g. "database.maxConnections" → "DATABASE_MAX_CONNECTIONS"
 */
function camelToUpperSnake(dotPath: string): string {
  return dotPath
    .replace(/\./g, '_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase()
}

/**
 * Try to coerce an env variable string to a native type.
 * "true"/"false" → boolean, numeric strings → number, else string.
 */
function coerceValue(value: string): string | number | boolean {
  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false
  const num = Number(value)
  if (!Number.isNaN(num) && value.trim() !== '') return num
  return value
}

/**
 * Set a value in a nested object by dot-path segments.
 */
function setNestedValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let current: Record<string, unknown> = obj
  for (let i = 0; i < path.length - 1; i++) {
    if (current[path[i]] === undefined || typeof current[path[i]] !== 'object') {
      current[path[i]] = {}
    }
    current = current[path[i]] as Record<string, unknown>
  }
  current[path[path.length - 1]] = value
}

/**
 * Deep merge source into target. Source values take precedence.
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] !== null &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      )
    } else {
      result[key] = source[key]
    }
  }
  return result
}

/**
 * Create a string representation of the config, masking secret values.
 */
function configToString(config: unknown, secrets: string[]): string {
  const secretSet = new Set(secrets)

  function mask(obj: unknown, path: string[] = []): unknown {
    if (obj === null || obj === undefined) return obj
    if (typeof obj !== 'object') {
      return secretSet.has(path.join('.')) ? '***' : obj
    }
    if (Array.isArray(obj)) return obj.map((item, i) => mask(item, [...path, String(i)]))

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = mask(value, [...path, key])
    }
    return result
  }

  return JSON.stringify(mask(config), null, 2)
}
