import { describe, it, expect } from 'vitest'
import { reminderSchedule, dueNow, pruneFired, TASK_REMINDER_HOUR } from '../reminders.js'
import { toDateKey } from '../date.js'

const at = (d, h, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x }

describe('reminder schedule', () => {
  const base = new Date(2026, 9, 21, 8, 0)
  const events = [
    { id: 'a', title: 'Standup', start: at(base, 10).toISOString(), end: at(base, 10, 15).toISOString(), reminderMinutes: 10 },
    { id: 'b', title: 'No reminder', start: at(base, 11).toISOString(), reminderMinutes: null },
    { id: 'c', title: 'All day', start: at(base, 0).toISOString(), allDay: true, reminderMinutes: 10 },
    { id: 'd', title: 'Already started', start: at(base, 7).toISOString(), reminderMinutes: 5 },
    { id: 'e', title: 'Hidden', start: at(base, 12).toISOString(), reminderMinutes: 0, calendarId: 'cal_work' },
    { id: 'r', title: 'Gym', start: at(base, 18).toISOString(), reminderMinutes: 30, recurrence: { freq: 'DAILY', interval: 1 } },
  ]
  const tasks = [
    { id: 't1', title: 'Pay rent', due: toDateKey(base) },
    { id: 't2', title: 'Done already', due: toDateKey(base), done: true },
    { id: 't3', title: 'Next month', due: '2026-12-01' },
  ]
  const calendars = [{ id: 'cal_personal', name: 'Personal', visible: true }, { id: 'cal_work', name: 'Work', visible: false }]

  it('includes timed events with reminders, recurring occurrences and tasks due in the window', () => {
    const s = reminderSchedule({ events, tasks, calendars, from: base, days: 2 })
    const titles = s.map((r) => r.title)
    expect(titles).toEqual(['Task due today', 'Standup', 'Gym', 'Gym'])
    const standup = s.find((r) => r.title === 'Standup')
    expect(standup.at).toBe(at(base, 9, 50).getTime())
    expect(standup.until).toBe(at(base, 10).getTime())
    expect(standup.body).toMatch(/in 10 min/)
    const task = s[0]
    expect(new Date(task.at).getHours()).toBe(TASK_REMINDER_HOUR)
    expect(task.body).toBe('Pay rent')
    // keys are unique per occurrence
    expect(new Set(s.map((r) => r.key)).size).toBe(s.length)
  })

  it('reports what is due now and remembers what fired', () => {
    const s = reminderSchedule({ events, tasks, calendars, from: base, days: 1 })
    const now = at(base, 9, 55).getTime()
    const due = dueNow(s, {}, now)
    expect(due.map((r) => r.title)).toEqual(['Task due today', 'Standup'])
    const fired = Object.fromEntries(due.map((r) => [r.key, now]))
    expect(dueNow(s, fired, now + 1000)).toEqual([])
    expect(dueNow(s, {}, at(base, 10, 1).getTime()).map((r) => r.title)).toEqual(['Task due today']) // standup window closed
    expect(Object.keys(pruneFired({ old: now - 3 * 86400000, fresh: now }, now))).toEqual(['fresh'])
  })
})
