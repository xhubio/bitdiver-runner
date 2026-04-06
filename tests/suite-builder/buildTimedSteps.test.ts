import { describe, expect, test } from 'vitest'
import { buildTimedSteps } from '../../src/suite-builder/buildTimedSteps'
import type { ParsedFileName } from '../../src/suite-builder/types'

const mapping: Record<string, string> = {
  'ri-fahrt-v1': 'SendRiFahrtV1Time',
  'bi-basis-fahrt-v3': 'SendBiBasisFahrtV3Time'
}

function makeFile(
  time: number,
  type: string,
  testcaseName: string,
  fileName: string
): ParsedFileName {
  return {
    time,
    type,
    fileName,
    testcaseName,
    relativePath: `${testcaseName}/${fileName}`
  }
}

describe('buildTimedSteps', () => {
  test('empty input returns empty array', () => {
    const result = buildTimedSteps([], mapping)
    expect(result).toHaveLength(0)
  })

  test('skips unmapped types', () => {
    const files: ParsedFileName[] = [
      makeFile(10, 'unknown-type', 'TC_01', '10_unknown-type_x.json')
    ]
    const result = buildTimedSteps(files, mapping)
    expect(result).toHaveLength(0)
  })

  test('creates unique step names like "SendRiFahrtV1Time 120"', () => {
    const files: ParsedFileName[] = [
      makeFile(120, 'ri-fahrt-v1', 'TC_01', '120_ri-fahrt-v1_abc.json')
    ]
    const result = buildTimedSteps(files, mapping)
    expect(result).toHaveLength(1)
    expect(result[0].definition.name).toBe('SendRiFahrtV1Time 120')
    expect(result[0].definition.id).toBe('SendRiFahrtV1Time')
  })

  test('sorts by time ascending', () => {
    const files: ParsedFileName[] = [
      makeFile(300, 'ri-fahrt-v1', 'TC_01', '300_ri-fahrt-v1_a.json'),
      makeFile(1, 'ri-fahrt-v1', 'TC_01', '1_ri-fahrt-v1_b.json'),
      makeFile(60, 'ri-fahrt-v1', 'TC_01', '60_ri-fahrt-v1_c.json')
    ]
    const result = buildTimedSteps(files, mapping)
    const times = result.map((e) => e.definition.name)
    expect(times).toEqual(['SendRiFahrtV1Time 1', 'SendRiFahrtV1Time 60', 'SendRiFahrtV1Time 300'])
  })

  test('groups by time then type with deterministic type ordering', () => {
    const files: ParsedFileName[] = [
      makeFile(1, 'ri-fahrt-v1', 'TC_01', '1_ri-fahrt-v1_a.json'),
      makeFile(1, 'bi-basis-fahrt-v3', 'TC_01', '1_bi-basis-fahrt-v3_b.json')
    ]
    const result = buildTimedSteps(files, mapping)
    // Both at time 1, types sorted alphabetically: bi-basis... < ri-fahrt...
    expect(result).toHaveLength(2)
    expect(result[0].definition.name).toBe('SendBiBasisFahrtV3Time 1')
    expect(result[1].definition.name).toBe('SendRiFahrtV1Time 1')
  })

  test('collects files per testcase in data', () => {
    const files: ParsedFileName[] = [
      makeFile(120, 'ri-fahrt-v1', 'TC_01', '120_ri-fahrt-v1_train1.json'),
      makeFile(120, 'ri-fahrt-v1', 'TC_02', '120_ri-fahrt-v1_train2.json')
    ]
    const result = buildTimedSteps(files, mapping)
    expect(result).toHaveLength(1)

    const entry = result[0]
    const data = entry.data as Record<string, { offsetTime: number; files: string[] }>
    expect(data.TC_01).toBeDefined()
    expect(data.TC_01.offsetTime).toBe(120)
    expect(data.TC_01.files).toEqual(['TC_01/120_ri-fahrt-v1_train1.json'])

    expect(data.TC_02).toBeDefined()
    expect(data.TC_02.offsetTime).toBe(120)
    expect(data.TC_02.files).toEqual(['TC_02/120_ri-fahrt-v1_train2.json'])
  })

  test('multiple files for same testcase at same time+type are grouped', () => {
    const files: ParsedFileName[] = [
      makeFile(60, 'ri-fahrt-v1', 'TC_01', '60_ri-fahrt-v1_train1.json'),
      makeFile(60, 'ri-fahrt-v1', 'TC_01', '60_ri-fahrt-v1_train2.json')
    ]
    const result = buildTimedSteps(files, mapping)
    expect(result).toHaveLength(1)
    const grouped = result[0].data as Record<string, { offsetTime: number; files: string[] }>
    expect(grouped.TC_01.files).toHaveLength(2)
  })

  test('description is empty string', () => {
    const files: ParsedFileName[] = [makeFile(10, 'ri-fahrt-v1', 'TC_01', '10_ri-fahrt-v1_x.json')]
    const result = buildTimedSteps(files, mapping)
    expect(result[0].definition.description).toBe('')
  })
})
