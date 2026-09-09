import { describe, expect, it } from 'vitest'
import { csvEscape } from '../src/server/services/csv'
import { formatMinutes, parseDuration } from '../src/server/services/duration'
import {
  extractAdfText,
  extractIssueKey,
  formatWorklogDate,
  JiraError,
} from '../src/server/services/jira'
import {
  parseTimeOnDate,
  resolveTimeEntry,
} from '../src/server/services/time-entry-resolver'

describe('duration contract', () => {
  it.each([
    ['1h 30m', 90],
    ['1.5h', 90],
    ['90m', 90],
    ['0.5m', null],
    ['1x', null],
    ['-1h', null],
    ['', null],
  ])('parses %s', (input, expected) =>
    expect(parseDuration(input)).toBe(expected),
  )
  it.each([
    [0, '0m'],
    [60, '1h'],
    [75, '1h 15m'],
  ] as const)('formats %s', (input, expected) =>
    expect(formatMinutes(input)).toBe(expected),
  )
})

describe('time entry resolution', () => {
  it('prioritizes start/end', () =>
    expect(
      resolveTimeEntry(
        '2026-09-03',
        '2026-09-03T09:00:00',
        '2026-09-03T10:15:00',
        5,
      ).durationMinutes,
    ).toBe(75))
  it('derives an end', () =>
    expect(
      resolveTimeEntry('2026-09-03', '2026-09-03T09:00:00', null, 30).endTime,
    ).toBe('2026-09-03T09:30:00'))
  it('rejects crossing midnight', () =>
    expect(() =>
      resolveTimeEntry('2026-09-03', '2026-09-03T23:45:00', null, 30),
    ).toThrow('does not fall on date'))
  it('validates clocks explicitly', () =>
    expect(() => parseTimeOnDate('2026-09-03', '25:00')).toThrow(
      'Invalid time',
    ))
})

describe('Jira and CSV contracts', () => {
  it('extracts issue keys', () =>
    expect(
      extractIssueKey('https://example.atlassian.net/browse/ABC-123'),
    ).toBe('ABC-123'))
  it('extracts ADF paragraphs', () =>
    expect(
      extractAdfText({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        ],
      }),
    ).toBe('Hello'))
  it('never answers a Jira credential failure with a session 401', () => {
    expect(new JiraError('bad token', 401).responseStatus).toBe(400)
    expect(new JiraError('missing', 404).responseStatus).toBe(404)
  })
  it('formats UTC worklog dates', () =>
    expect(formatWorklogDate(new Date('2026-09-03T10:11:12.345Z'))).toBe(
      '2026-09-03T10:11:12.345+0000',
    ))
  it('escapes CSV', () => expect(csvEscape('a,"b"')).toBe('"a,""b"""'))
  it('quotes CSV fields containing carriage returns', () =>
    expect(csvEscape('a\r\nb')).toBe('"a\r\nb"'))
})
