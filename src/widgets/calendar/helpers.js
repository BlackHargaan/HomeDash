// Pure calendar helpers (no React) — unit-tested in __tests__/calendar.test.js.
import { uid } from '../../lib/storage.js'
import { collectOccurrences } from '../../lib/recurrence.js'
import { fromDateKey } from '../../lib/date.js'
import { EVENT_COLORS } from '../registry.js'

export const DEFAULT_CALENDAR_ID = 'cal_personal'
export const DEFAULT_CALENDARS = [{ id: DEFAULT_CALENDAR_ID, name: 'Personal', color: 'indigo', visible: true }]

export const MINUTES_PER_DAY = 24 * 60
export const SNAP_MINUTES = 15

export function startOf(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export function endOf(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }

// ------------------------------------------------------------ calendars

// Events created before calendars existed have no calendarId → the first
// calendar (Personal). A dangling id (deleted calendar) falls back the same way.
export function calendarOf(ev, calendars) {
  const id = ev?.calendarId || DEFAULT_CALENDAR_ID
  return calendars.find((c) => c.id === id) || calendars[0] || DEFAULT_CALENDARS[0]
}

// An explicit event color wins; otherwise the event takes its calendar's color.
export function eventColor(ev, calendars) {
  if (ev?.color && ev.color !== 'calendar') return ev.color
  return calendarOf(ev, calendars).color || 'indigo'
}

export function isVisible(ev, calendars) {
  return calendarOf(ev, calendars).visible !== false
}

// The calendar new events go into: the first one that isn't a read-only feed.
export function defaultCalendarId(calendars) {
  return (calendars.find((c) => !c.url) || calendars[0] || DEFAULT_CALENDARS[0]).id
}

// A color not yet used by another calendar, cycling if all are taken.
export function nextCalendarColor(calendars) {
  const used = new Set(calendars.map((c) => c.color))
  return EVENT_COLORS.find((c) => !used.has(c)) || EVENT_COLORS[calendars.length % EVENT_COLORS.length]
}

export function newCalendar(name, calendars, extra = {}) {
  return { id: uid('cal'), name: name || 'Calendar', color: nextCalendarColor(calendars), visible: true, ...extra }
}

// ------------------------------------------------------------ events

export function blankEvent(day, calendarId, startMin = 9 * 60, endMin = startMin + 60) {
  const start = atMinutes(day, startMin)
  const end = atMinutes(day, Math.max(endMin, startMin + SNAP_MINUTES))
  return {
    id: uid('evt'), uid: uid('uid'), title: '', description: '', location: '',
    start: start.toISOString(), end: end.toISOString(), allDay: false,
    color: null, calendarId, source: 'local', reminderMinutes: 10,
  }
}

// Merge by UID so re-importing the same calendar updates rather than duplicates.
export function mergeEvents(existing, incoming) {
  const byUid = new Map(existing.map((e) => [e.uid, e]))
  for (const e of incoming) byUid.set(e.uid, { ...byUid.get(e.uid), ...e })
  return Array.from(byUid.values())
}

// ------------------------------------------------------------ time grid math

export function minutesOf(date) {
  const d = new Date(date)
  return d.getHours() * 60 + d.getMinutes()
}

export function atMinutes(day, minutes) {
  const d = startOf(day)
  d.setMinutes(Math.round(minutes))
  return d
}

export function snap(minutes, step = SNAP_MINUTES) {
  return Math.round(minutes / step) * step
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

// Lay out one day's timed events into side-by-side lanes where they overlap.
// Returns [{ item, start, end, lane, lanes }] with start/end in minutes since
// midnight, clipped to the day. Events shorter than 15 min get 15 min of room.
export function layoutDay(items, day) {
  const dayStart = startOf(day).getTime()
  const dayEnd = dayStart + MINUTES_PER_DAY * 60000
  const boxes = items
    .map((item) => {
      const s = Math.max(new Date(item.start).getTime(), dayStart)
      const rawEnd = item.end ? new Date(item.end).getTime() : s + 3600000
      const e = Math.min(Math.max(rawEnd, s + SNAP_MINUTES * 60000), dayEnd)
      return { item, start: (s - dayStart) / 60000, end: (e - dayStart) / 60000 }
    })
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))

  const out = []
  let cluster = []
  let clusterEnd = -1
  const flush = () => {
    const laneEnds = []
    for (const b of cluster) {
      let lane = laneEnds.findIndex((end) => end <= b.start)
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.end) } else laneEnds[lane] = b.end
      b.lane = lane
    }
    for (const b of cluster) out.push({ ...b, lanes: laneEnds.length })
    cluster = []
  }
  for (const b of boxes) {
    if (cluster.length && b.start >= clusterEnd) flush()
    cluster.push(b)
    clusterEnd = Math.max(clusterEnd, b.end)
  }
  if (cluster.length) flush()
  return out
}

// ------------------------------------------------------------ search

// Matches event title/location/notes (recurrences expanded over ±1 year) and
// open task titles. Upcoming results first (soonest first), then past ones
// (most recent first).
export function searchCalendar({ events, tasks, calendars, query, now = new Date(), limit = 30 }) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hit = (...fields) => fields.some((f) => f && String(f).toLowerCase().includes(q))
  const from = new Date(now.getTime() - 365 * 86400000)
  const to = new Date(now.getTime() + 365 * 86400000)

  const matchingEvents = events.filter((e) => hit(e.title, e.location, e.description) ||
    Object.values(e.overrides || {}).some((o) => hit(o.title, o.location, o.description)))
  const results = collectOccurrences(matchingEvents, from, to)
    .filter((o) => hit(o.title, o.location, o.description))
    .map((o) => ({ ...o, kind: 'event', color: eventColor(o, calendars), calendar: calendarOf(o, calendars).name }))
  for (const t of tasks) {
    if (t.done || !t.due || !hit(t.title)) continue
    results.push({ id: t.id, title: t.title, kind: 'task', color: 'amber', allDay: true, start: fromDateKey(t.due).toISOString(), calendar: 'Task' })
  }
  const nowMs = now.getTime()
  const upcoming = results.filter((r) => new Date(r.end || r.start).getTime() >= nowMs)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
  const past = results.filter((r) => new Date(r.end || r.start).getTime() < nowMs)
    .sort((a, b) => new Date(b.start) - new Date(a.start))
  return [...upcoming, ...past].slice(0, limit)
}
