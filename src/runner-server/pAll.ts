/**
 * Executes an array of promise-returning functions with a concurrency limit.
 */
export type PromiseFactory<T> = () => Promise<T>

export async function pAll<T>(
  fns: Array<PromiseFactory<T>>,
  options: { concurrency: number }
): Promise<T[]> {
  const { concurrency } = options
  const results: T[] = []
  const executing = new Set<Promise<void>>()

  for (const fn of fns) {
    const p = fn().then(
      (result) => {
        results.push(result)
        executing.delete(p)
      },
      (error) => {
        executing.delete(p)
        throw error
      }
    )
    executing.add(p)
    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
  return results
}
