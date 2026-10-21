import { describe, expect, it } from 'vitest'
import { parseNaturalEvent } from '../nlp.js'

// Sunday 16 Aug 2026, 08:00 local time.
const NOW = new Date(2026, 7, 16, 8, 0, 0)
const parse = (s) => parseNaturalEvent(s, NOW)
const local = (iso) => {
  const d = new Date(iso)
  return { m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), min: d.getMinutes(), dow: d.getDay() }
}

describe('parseNaturalEvent', () => {
  it('handles "tomorrow" + 12h time and cleans the title', () => {
    const e = parse('Lunch with Sam tomorrow 1pm')
    expect(e.title).toBe('Lunch with Sam')
    expect(local(e.start)).toMatchObject({ m: 8, d: 17, h: 13, min: 0 })
    expect(e.allDay).toBe(false)
    expect(e.reminderMinutes).toBe(10)
  })

  it('resolves a bare weekday to the coming one, and "next" to the week after', () => {
    expect(local(parse('Deadline friday').start)).toMatchObject({ d: 21, dow: 5 })
    expect(local(parse('Dentist next friday 2pm').start)).toMatchObject({ d: 28, dow: 5, h: 14 })
  })

  it('parses minutes and 24h times', () => {
    expect(local(parse('Standup monday at 9:30am').start)).toMatchObject({ d: 17, h: 9, min: 30 })
    expect(local(parse('Board meeting wednesday 10:00').start)).toMatchObject({ d: 19, h: 10 })
  })

  it('treats "at N" under 8 as afternoon, and noon as 12', () => {
    expect(local(parse('Gym at 7').start).h).toBe(19)
    expect(local(parse('Coffee noon').start).h).toBe(12)
  })

  it('makes date-only phrases all-day events with no reminder', () => {
    const e = parse('Team offsite in 3 days')
    expect(e.allDay).toBe(true)
    expect(e.reminderMinutes).toBeNull()
    expect(local(e.start).d).toBe(19)
  })

  it('flags input with no date or time as incomplete', () => {
    const e = parse('Just a thought')
    expect(e.incomplete).toBe(true)
    expect(e.start).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(parse('   ')).toBeNull()
  })
})
