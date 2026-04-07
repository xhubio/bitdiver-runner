import type { ZodObject, ZodRawShape } from 'zod'
import { deepMerge, loadConfig } from '../config/index'
import { StepSingle } from './StepSingle'

/**
 * Data expected per testcase for this step.
 * At minimum, a config file path. All testcases typically provide the same data.
 */
export interface SetupConfigData {
  /** Path to the JSON config file */
  configFile: string

  /** Prefix for environment variable overrides (default: 'CUSTOM') */
  envPrefix?: string
}

/**
 * Generic step that loads configuration and writes it into the run environment.
 *
 * This is typically the first step in a suite. It:
 * 1. Loads config from a JSON file
 * 2. Applies environment variable overrides (with configurable prefix)
 * 3. Validates against a Zod schema
 * 4. Writes each top-level key into `environmentRun.map`
 * 5. Deep-merges with existing values on conflict
 * 6. Logs the masked config for debugging
 *
 * Subclasses must implement `getConfigSchema()` to define what the config looks like.
 * Optionally override `getSecrets()` to mask sensitive fields in logs.
 *
 * @example
 * ```typescript
 * import { z } from 'zod'
 * import { StepSetupConfig } from '@bitdiver/core'
 *
 * const mySchema = z.object({
 *   kafka: z.object({
 *     brokers: z.string(),
 *     password: z.string()
 *   }),
 *   targetEnvironment: z.string().default('tu2')
 * })
 *
 * class SetupMyEnvironment extends StepSetupConfig<typeof mySchema.shape> {
 *   getConfigSchema() { return mySchema }
 *   getSecrets() { return ['kafka.password'] }
 * }
 * ```
 */
export abstract class StepSetupConfig<T extends ZodRawShape = ZodRawShape> extends StepSingle {
  needData = true

  /**
   * Return the Zod schema that defines the config structure.
   * This is the single source of truth for config validation and typing.
   */
  abstract getConfigSchema(): ZodObject<T>

  /**
   * Return dot-paths of secret fields to mask in log output.
   * Override this in subclasses. Default: no secrets.
   *
   * @example ['kafka.password', 'git.token']
   */
  getSecrets(): string[] {
    return []
  }

  async run(): Promise<void> {
    if (!this.data || this.data.length === 0) {
      await this.logInfo('No config data provided, skipping setup')
      return
    }

    // All testcases have the same config data — use the first one
    const stepData = this.data[0] as SetupConfigData | undefined
    if (!stepData?.configFile) {
      await this.logInfo('No configFile in step data, skipping setup')
      return
    }

    const envPrefix = stepData.envPrefix ?? 'CUSTOM'
    const schema = this.getConfigSchema()
    const secrets = this.getSecrets()

    // Load and validate config
    const result = await loadConfig({
      schema,
      file: stepData.configFile,
      envPrefix,
      secrets
    })

    // Write each top-level key into the run environment map
    const configObj = result.config as Record<string, unknown>
    for (const [key, value] of Object.entries(configObj)) {
      const existing = this.environmentRun?.map.get(key)
      if (existing === undefined) {
        this.environmentRun?.map.set(key, value)
      } else if (
        typeof existing === 'object' &&
        existing !== null &&
        !Array.isArray(existing) &&
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        // Deep-merge objects
        this.environmentRun?.map.set(
          key,
          deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>)
        )
      } else {
        // Overwrite scalar/array values
        this.environmentRun?.map.set(key, value)
      }
    }

    await this.logInfo({ message: 'Config loaded', config: result.toString() })
  }
}
