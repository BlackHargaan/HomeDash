import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CALENDARS, calendarOf, eventColor, isVisible, defaultCalendarId, nextCalendarColor,
  blankEvent, layoutDay, snap, atMinutes, minutesOf, searchCalendar,
} from '../helpers.js'

const DAY = new Date(2026, 9, 21) // Wed 21 Oct 2026, local
const at = (h, m = 0, day = DAY) => { const d = new Date(day); d.setHours(h, m, 0, 0); return d.toISOString() }

const CALS = [
  { id: 'cal_personal', name: 'Personal', color: 'indigo', visible: true },
  { id: 'work', name: 'Work', color: 'emerald', visible: false },
  { id: 'feed', name: 'Holidays', color: 'rose', visible: true, url: 'https://x/y.ics' },
]

describe('calendars', () => {
  it('maps legacy events (no calendarId) and dangling ids to the first calendar', () => {
    expect(calendarOf({}, CALS).id).toBe('cal_personal')
    expect(calendarOf({ calendarId: 'gone' }, CALS).id).toBe('cal_personal')
    expect(calendarOf({ calendarId: 'work' }, CALS).name).toBe('Work')
  })

  it('uses an explicit event color, else the calendar color', () => {
    expect(eventColor({ calendarId: 'work', color: 'amber' }, CALS)).toBe('amber')
    expect(eventColor({ calendarId: 'work', color: null }, CALS)).toBe('emerald')
    expect(eventColor({ calendarId: 'work', color: 'calendar' }, CALS)).toBe('emerald')
  })

  it('hides events of hidden calendars', () => {
    expect(isVisible({ calendarId: 'work' }, CALS)).toBe(false)
    expect(isVisible({}, CALS)).toBe(true)
  })

  it('puts new events in the first non-feed calendar and picks unused colors', () => {
    expect(defaultCalendarId([CALS[2], CALS[1]])).toBe('work')
    expect(nextCalendarColor(CALS)).toBe('violet')
    expect(defaultCalendarId([])).toBe(DEFAULT_CALENDARS[0].id)
  })
})

describe('time math', () => {
  it('snaps to 15 minutes and converts minutes ↔ dates', () => {
    expect(snap(52)).toBe(45)
    expect(snap(53)).toBe(60)
    expect(minutesOf(atMinutes(DAY, 14 * 60 + 30))).toBe(870)
  })

  it('creates blank events at a chosen slot with a 15-minute minimum', () => {
    const e = blankEvent(DAY, 'work', 600, 600)
    expect(new Date(e.start).getHours()).toBe(10)
    expect((new Date(e.end) - new Date(e.start)) / 60000).toBe(15)
    expect(e.calendarId).toBe('work')
    expect(e.color).toBeNull()
  })
})

describe('layoutDay', () => {
  const ev = (id, sh, sm, eh, em) => ({ id, start: at(sh, sm), end: at(eh, em) })

  it('stacks non-overlapping events in one lane', () => {
    const out = layoutDay([ev('a', 9, 0, 10, 0), ev('b', 10, 0, 11, 0)], DAY)
    expect(out.map((b) => [b.item.id, b.lane, b.lanes])).toEqual([['a', 0, 1], ['b', 0, 1]])
    expect(out[0]).toMatchObject({ start: 540, end: 600 })
  })

  it('splits overlapping events into lanes and reuses freed lanes', () => {
    const out = layoutDay([ev('a', 9, 0, 11, 0), ev('b', 9, 30, 10, 0), ev('c', 10, 0, 10, 30)], DAY)
    const byId = Object.fromEntries(out.map((b) => [b.item.id, b]))
    expect(byId.a).toMatchObject({ lane: 0, lanes: 2 })
    expect(byId.b).toMatchObject({ lane: 1, lanes: 2 })
    expect(byId.c).toMatchObject({ lane: 1, lanes: 2 }) // b ended at 10:00
  })

  it('clips events that cross midnight and gives tiny events room', () => {
    const late = { id: 'x', start: at(23, 0), end: at(2, 0, new Date(2026, 9, 22)) }
    const tiny = { id: 't', start: at(8, 0), end: at(8, 5) }
    const out = Object.fromEntries(layoutDay([late, tiny], DAY).map((b) => [b.item.id, b]))
    expect(out.x).toMatchObject({ start: 1380, end: 1440 })
    expect(out.t.end - out.t.start).toBe(15)
  })
})

describe('searchCalendar', () => {
  const events = [
    { id: 'p', title: 'Dentist', start: at(9, 0, new Date(2026, 8, 1)), end: at(10, 0, new Date(2026, 8, 1)) },
    { id: 'f', title: 'Dentist follow-up', calendarId: 'work', start: at(9, 0, new Date(2026, 10, 2)), end: at(10, 0, new Date(2026, 10, 2)) },
    { id: 'n', title: 'Gym', location: 'Downtown dental plaza', start: at(18, 0, new Date(2026, 9, 25)), end: at(19, 0, new Date(2026, 9, 25)) },
    { id: 'r', title: 'Standup', start: at(9), end: at(9, 15), recurrence: { freq: 'DAILY', count: 3 } },
  ]
  const tasks = [{ id: 't1', title: 'Call dentist', due: '2026-10-23', done: false }, { id: 't2', title: 'dentist done', due: '2026-10-22', done: true }]

  it('finds titles, locations and tasks; upcoming first, then past', () => {
    const res = searchCalendar({ events, tasks, calendars: CALS, query: 'dent', now: new Date(2026, 9, 21, 12) })
    expect(res.map((r) => r.id)).toEqual(['t1', 'n', 'f', 'p'])
    expect(res.find((r) => r.id === 'f')).toMatchObject({ color: 'emerald', calendar: 'Work' })
  })

  it('expands recurring matches into occurrences', () => {
    const res = searchCalendar({ events, tasks: [], calendars: CALS, query: 'standup', now: new Date(2026, 9, 20) })
    expect(res).toHaveLength(3)
  })

  it('returns nothing for an empty query', () => {
    expect(searchCalendar({ events, tasks, calendars: CALS, query: '  ' })).toEqual([])
  })
})
