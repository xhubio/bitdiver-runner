import { describe, expect, test } from 'vitest'
import { normalizeTimedStepMapping } from '../../src/suite-builder/types'

describe('normalizeTimedStepMapping', () => {
  test('simple string value creates default pattern', () => {
    const entries = normalizeTimedStepMapping({
      'ri-fahrt-v1': 'SendRiFahrtV1Time'
    })

    expect(entries).toHaveLength(1)
    expect(entries[0].key).toBe('ri-fahrt-v1')
    expect(entries[0].stepId).toBe('SendRiFahrtV1Time')

    // Should match: 120_ri-fahrt-v1_abc.json
    expect('120_ri-fahrt-v1_abc.json'.match(entries[0].regex)?.[1]).toBe('120')

    // Should NOT match: data_rifahrt_120.json
    expect('data_rifahrt_120.json'.match(entries[0].regex)).toBeNull()
  })

  test('object value with custom pattern', () => {
    const entries = normalizeTimedStepMapping({
      customFormat: {
        stepId: 'SendCustomTime',
        pattern: 'data_rifahrt_.*_<TIME>\\.json'
      }
    })

    expect(entries).toHaveLength(1)
    expect(entries[0].key).toBe('customFormat')
    expect(entries[0].stepId).toBe('SendCustomTime')

    // Should match: data_rifahrt_abc_300.json
    expect('data_rifahrt_abc_300.json'.match(entries[0].regex)?.[1]).toBe('300')

    // Should NOT match: 120_ri-fahrt-v1_abc.json
    expect('120_ri-fahrt-v1_abc.json'.match(entries[0].regex)).toBeNull()
  })

  test('mixed simple and custom entries', () => {
    const entries = normalizeTimedStepMapping({
      'ri-fahrt-v1': 'SendRiFahrtV1Time',
      custom: {
        stepId: 'SendCustom',
        pattern: 'event_<TIME>_data\\.json'
      }
    })

    expect(entries).toHaveLength(2)

    const simple = entries.find((e) => e.key === 'ri-fahrt-v1')
    const custom = entries.find((e) => e.key === 'custom')

    expect(simple?.stepId).toBe('SendRiFahrtV1Time')
    expect(custom?.stepId).toBe('SendCustom')

    // Custom matches: event_60_data.json
    expect('event_60_data.json'.match(custom!.regex)?.[1]).toBe('60')
  })

  test('empty mapping returns empty array', () => {
    expect(normalizeTimedStepMapping({})).toHaveLength(0)
  })

  test('escapes regex special characters in key for default pattern', () => {
    const entries = normalizeTimedStepMapping({
      'file.type': 'SendFileType'
    })

    // The dot in "file.type" should be escaped
    // Should match: 10_file.type_abc.json
    expect('10_file.type_abc.json'.match(entries[0].regex)?.[1]).toBe('10')

    // Should NOT match: 10_filextype_abc.json (dot is escaped, not wildcard)
    expect('10_filextype_abc.json'.match(entries[0].regex)).toBeNull()
  })
})
