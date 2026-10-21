import { describe, expect, it } from 'vitest'
import { parseICS, eventsToICS } from '../ics.js'

const GOOGLE_STYLE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'DTSTART;TZID=America/New_York:20260820T090000',
  'DTEND;TZID=America/New_York:20260820T100000',
  'UID:abc123@google.com',
  'SUMMARY:Dentist\\, checkup',
  'LOCATION:123 Main St',
  'DESCRIPTION:Line one\\nLine two',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20260822',
  'DTEND;VALUE=DATE:20260823',
  'UID:allday@google.com',
  'SUMMARY:Workshop',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

describe('parseICS', () => {
  it('parses timed and all-day events (regression: imports used to drop every event)', () => {
    const events = parseICS(GOOGLE_STYLE)
    expect(events).toHaveLength(2)
    const [timed, allDay] = events
    expect(timed.title).toBe('Dentist, checkup')
    expect(timed.description).toBe('Line one\nLine two')
    expect(timed.location).toBe('123 Main St')
    expect(timed.uid).toBe('abc123@google.com')
    expect(timed.allDay).toBe(false)
    expect(typeof timed.start).toBe('string')
    expect(allDay.allDay).toBe(true)
    expect(allDay.title).toBe('Workshop')
  })

  it('unfolds folded lines', () => {
    const text = 'BEGIN:VEVENT\r\nDTSTART:20260101T100000Z\r\nSUMMARY:A very long\r\n  title\r\nEND:VEVENT'
    expect(parseICS(text)[0].title).toBe('A very long title')
  })

  it('reads UTC times correctly', () => {
    const text = 'BEGIN:VEVENT\nDTSTART:20260101T100000Z\nSUMMARY:x\nEND:VEVENT'
    expect(parseICS(text)[0].start).toBe('2026-01-01T10:00:00.000Z')
  })

  it('skips events without a valid DTSTART', () => {
    const text = 'BEGIN:VEVENT\nSUMMARY:no start\nEND:VEVENT'
    expect(parseICS(text)).toHaveLength(0)
  })

  it('captures RRULE and EXDATE', () => {
    const text = [
      'BEGIN:VEVENT',
      'DTSTART:20260803T090000Z',
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20260901T000000Z',
      'EXDATE:20260805T090000Z',
      'SUMMARY:Standup',
      'END:VEVENT',
    ].join('\n')
    const [e] = parseICS(text)
    expect(e.recurrence).toMatchObject({ freq: 'WEEKLY', interval: 1, byday: ['MO', 'WE', 'FR'] })
    expect(e.recurrence.until).toBe('2026-09-01T00:00:00.000Z')
    expect(e.exdates).toEqual(['2026-08-05T09:00:00.000Z'])
  })
})

describe('eventsToICS', () => {
  it('round-trips events including recurrence', () => {
    const original = parseICS([
      'BEGIN:VEVENT',
      'DTSTART:20260810T120000Z',
      'DTEND:20260810T130000Z',
      'RRULE:FREQ=DAILY;COUNT=5',
      'UID:rt@test',
      'SUMMARY:Meds; daily, please',
      'END:VEVENT',
    ].join('\n'))
    const again = parseICS(eventsToICS(original))
    expect(again).toHaveLength(1)
    expect(again[0].title).toBe('Meds; daily, please')
    expect(again[0].start).toBe(original[0].start)
    expect(again[0].recurrence).toMatchObject({ freq: 'DAILY', count: 5 })
  })
})
