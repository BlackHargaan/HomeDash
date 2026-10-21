// Builds the list of reminders due in a window — used both to fire local
// notifications while HomeDash is open and to hand the server a schedule it
// can push from when it isn't.
import { collectOccurrences } from './recurrence.js'
import { fromDateKey, fmtTime, toDateKey } from './date.js'
import { isVisible } from '../widgets/calendar/helpers.js'

export const TASK_REMINDER_HOUR = 9 // tasks due today are announced at 9:00 local time

// → [{ key, at, until, title, body, tag }] with at/until as epoch ms, sorted by `at`.
// A reminder is due from `at` until `until` (the event's start, or the end of
// the task's due day), so a late check still fires it but never after the fact.
export function reminderSchedule({ events = [], tasks = [], calendars, from = new Date(), days = 7 }) {
  const start = new Date(from)
  const end = new Date(start.getTime() + days * 86400000)
  const out = []

  const visible = calendars ? events.filter((e) => isVisible(e, calendars)) : events
  // Look back a little so reminders whose window already opened are included.
  for (const inst of collectOccurrences(visible, new Date(start.getTime() - 3 * 3600000), end)) {
    if (inst.allDay || typeof inst.reminderMinutes !== 'number') continue
    const startMs = new Date(inst.start).getTime()
    if (startMs <= start.getTime()) continue
    const lead = Math.max(0, inst.reminderMinutes)
    const key = `e:${inst.seriesId || inst.id}:${new Date(inst.start).toISOString()}`
    out.push({
      key,
      tag: key,
      at: startMs - lead * 60000,
      until: startMs,
      title: inst.title || 'Event',
      body: lead === 0 ? 'Starting now' : `Starts at ${fmtTime(inst.start)} (in ${lead} min)`,
    })
  }

  for (const t of tasks) {
    if (t.done || !t.due) continue
    const day = fromDateKey(t.due)
    const at = new Date(day); at.setHours(TASK_REMINDER_HOUR, 0, 0, 0)
    const until = new Date(day); until.setHours(23, 59, 59, 999)
    if (until <= start || at >= end) continue
    const key = `t:${t.id}:${t.due}`
    out.push({ key, tag: key, at: at.getTime(), until: until.getTime(), title: 'Task due today', body: t.title })
  }

  return out.sort((a, b) => a.at - b.at)
}

// Items whose window is open right now and that haven't fired yet.
export function dueNow(schedule, fired = {}, now = Date.now()) {
  return schedule.filter((r) => r.at <= now && now < r.until && !fired[r.key])
}

// Drop fired-markers older than two days so the record stays small.
export function pruneFired(fired, now = Date.now()) {
  const out = {}
  for (const [k, ts] of Object.entries(fired || {})) if (now - ts < 2 * 86400000) out[k] = ts
  return out
}

export const todayKey = () => toDateKey(new Date())
