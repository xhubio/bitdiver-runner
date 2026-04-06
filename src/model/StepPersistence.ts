import fs from 'node:fs/promises'
import path from 'node:path'
import type { EnvironmentTestcase } from './EnvironmentTestcase'

/**
 * Persistence helpers for step environment variables.
 * These are standalone functions that can be used by both StepNormal and StepSingle.
 *
 * Environment variables live in `EnvironmentTestcase.map` during a run.
 * These helpers persist them to disk (to free memory or for post-run analysis)
 * and load them back when needed.
 */

/**
 * Write environment variables to disk as JSON files.
 * Does NOT remove them from memory — use `exportVars` for that.
 */
export async function writeVars(
  tcEnv: EnvironmentTestcase,
  varNames: string[],
  dir: string
): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  for (const varName of varNames) {
    const data = tcEnv.map.get(varName)
    const filePath = path.join(dir, `${varName}.json`)
    if (typeof data === 'string') {
      await fs.writeFile(filePath, data)
    } else {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    }
  }
}

/**
 * Load environment variables from disk into the testcase environment map.
 * @returns true if all variables were loaded successfully
 */
export async function loadVars(
  tcEnv: EnvironmentTestcase,
  varNames: string[],
  dir: string,
  opts: { ignoreMissing?: boolean } = {}
): Promise<boolean> {
  let success = true
  for (const varName of varNames) {
    const filePath = path.join(dir, `${varName}.json`)
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      try {
        tcEnv.map.set(varName, JSON.parse(raw))
      } catch {
        tcEnv.map.set(varName, raw)
      }
    } catch {
      success = false
      if (!opts.ignoreMissing) {
        throw new Error(`Failed to load variable '${varName}' from '${filePath}'`)
      }
    }
  }
  return success
}

/**
 * Remove environment variables from memory.
 */
export function deleteVars(tcEnv: EnvironmentTestcase, varNames: string[]): void {
  for (const varName of varNames) {
    tcEnv.map.delete(varName)
  }
}

/**
 * Export environment variables: write to disk, then remove from memory.
 * Useful for freeing memory on large data while keeping it accessible for post-run checks.
 */
export async function exportVars(
  tcEnv: EnvironmentTestcase,
  varNames: string[],
  dir: string
): Promise<void> {
  await writeVars(tcEnv, varNames, dir)
  deleteVars(tcEnv, varNames)
}
