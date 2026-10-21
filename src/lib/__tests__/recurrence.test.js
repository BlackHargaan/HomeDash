import { describe, expect, it } from 'vitest'
import { expandInRange, collectOccurrences, parseRRule } from '../recurrence.js'

const AUG_START = new Date('2026-08-01T00:00:00Z')
const AUG_END = new Date('2026-08-31T23:59:59Z')
const days = (list) => list.map((o) => o.start.slice(0, 10))

function weekly(extra = {}) {
  return {
    id: 'm1', title: 'Standup',
    start: '2026-08-03T09:00:00.000Z', end: '2026-08-03T09:30:00.000Z',
    recurrence: { freq: 'WEEKLY', interval: 1 },
    ...extra,
  }
}

describe('expandInRange', () => {
  it('returns non-recurring events unchanged', () => {
    const e = { id: 'x', start: '2026-08-05T10:00:00.000Z' }
    expect(expandInRange(e, AUG_START, AUG_END)).toEqual([e])
  })

  it('expands weekly by-day rules, honouring EXDATE and UNTIL', () => {
    const e = weekly({
      recurrence: { freq: 'WEEKLY', interval: 1, byday: ['MO', 'WE', 'FR'], until: '2026-08-20T00:00:00.000Z' },
      exdates: ['2026-08-05T09:00:00.000Z'],
    })
    expect(days(expandInRange(e, AUG_START, AUG_END))).toEqual([
      '2026-08-03', '2026-08-07', '2026-08-10', '2026-08-12', '2026-08-14', '2026-08-17', '2026-08-19',
    ])
  })

  it('stops after COUNT occurrences', () => {
    const e = { id: 'd', start: '2026-08-10T12:00:00.000Z', recurrence: { freq: 'DAILY', count: 5 } }
    expect(days(expandInRange(e, AUG_START, AUG_END))).toEqual([
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
    ])
  })

  it('preserves event duration on each occurrence', () => {
    const [first] = expandInRange(weekly(), AUG_START, AUG_END)
    expect(new Date(first.end) - new Date(first.start)).toBe(30 * 60 * 1000)
    expect(first.seriesId).toBe('m1')
    expect(first.originalStart).toBe('2026-08-03T09:00:00.000Z')
  })

  it('applies per-occurrence overrides and deletions', () => {
    const e = weekly({
      exdates: ['2026-08-10T09:00:00.000Z'],
      overrides: {
        '2026-08-17T09:00:00.000Z': { title: 'Moved', start: '2026-08-18T14:00:00.000Z', end: '2026-08-18T14:30:00.000Z' },
        '2026-08-24T09:00:00.000Z': { deleted: true },
      },
    })
    const occ = expandInRange(e, AUG_START, AUG_END)
    expect(days(occ)).toEqual(['2026-08-03', '2026-08-18', '2026-08-31'])
    const moved = occ[1]
    expect(moved.title).toBe('Moved')
    expect(moved.edited).toBe(true)
    expect(moved.originalStart).toBe('2026-08-17T09:00:00.000Z')
  })

  it('only materialises occurrences inside the window', () => {
    const e = weekly()
    const occ = expandInRange(e, new Date('2026-08-09T00:00:00Z'), new Date('2026-08-16T00:00:00Z'))
    expect(days(occ)).toEqual(['2026-08-10'])
  })
})

describe('collectOccurrences', () => {
  it('merges and sorts several events', () => {
    const occ = collectOccurrences([
      { id: 'b', start: '2026-08-20T10:00:00.000Z' },
      { id: 'a', start: '2026-08-02T10:00:00.000Z' },
    ], AUG_START, AUG_END)
    expect(occ.map((o) => o.id)).toEqual(['a', 'b'])
  })
})

describe('parseRRule', () => {
  it('parses interval and strips ordinal BYDAY prefixes', () => {
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=2;BYDAY=1MO')).toMatchObject({ freq: 'MONTHLY', interval: 2, byday: ['MO'] })
  })
  it('returns null without FREQ', () => {
    expect(parseRRule('INTERVAL=2')).toBeNull()
  })
})

describe('collectOccurrences window', () => {
  it('keeps only one-off events that overlap the window', () => {
    const d = (day, h) => new Date(2026, 9, day, h).toISOString()
    const events = [
      { id: 'a', title: 'In', start: d(21, 10), end: d(21, 11) },
      { id: 'b', title: 'Later', start: d(28, 10), end: d(28, 11) },
      { id: 'c', title: 'Spans', start: d(20, 22), end: d(21, 1) },
    ]
    const out = collectOccurrences(events, new Date(2026, 9, 21, 0), new Date(2026, 9, 21, 23, 59))
    expect(out.map((e) => e.title)).toEqual(['Spans', 'In'])
  })
})
