/**
 * Defines one single testcase in the suite
 */
export interface TestcaseDefinitionInterface {
  /** The name of the testcase */
  name: string

  /** String tags for filtering results */
  tags?: string[]

  /** A description of this testcase */
  description?: string

  /**
   * Sparse data map: stepName → data. Only steps with data are listed.
   * Steps absent from this map receive null data.
   */
  data: { [stepName: string]: any }
}
