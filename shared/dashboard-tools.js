// Dashboard actions an AI can take — shared by the in-app Assistant (runs in
// the browser on live data) and the MCP endpoint (runs on the server's stored
// copy). Every action works on a plain snapshot of the dashboard keys (the
// same shape as a backup's `data`) and returns the keys it changed, so the
// caller decides how to apply them.
//
// Times: inputs like "2026-10-23T15:00" are local wall-clock time; outputs use
// the same format. In the browser "local" is the user's zone; the server sets
// TZ to the zone the dashboard last reported (`timezone` key).
import { collectOccurrences, describeRecurrence } from './recurrence.js'
import { toDateKey, fromDateKey } from './date.js'
import { WIDGET_TYPES } from './registry.js'
import { validate } from './schema.js'
import { normalizePage, splitTitle, DEFAULT_ICON, pageRows, parentOf, ancestorsOf, childrenOf } from './notebook.js'

export const uid = (prefix = 'id') => `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`

const HOME_BOARD = 'board_home'
const DEFAULT_CALENDARS = [{ id: 'cal_personal', name: 'Personal', color: 'indigo', visible: true }]
const MAX_EVENTS = 150
const MAX_RANGE_DAYS = 400
const PRIORITIES = ['low', 'med', 'high']
const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

class ToolError extends Error {}
const fail = (msg) => { throw new ToolError(msg) }

// ------------------------------------------------------------ time helpers

const pad = (n) => String(n).padStart(2, '0')
export function fmtLocal(d) {
  const x = new Date(d)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`
}
const fmtDay = (d) => `${WEEKDAY[new Date(d).getDay()]} ${toDateKey(new Date(d))}`

export function parseWhen(value, field = 'time') {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} is required`)
  const s = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { date: fromDateKey(s), dateOnly: true }
  const local = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (local) {
    const d = fromDateKey(local[1])
    d.setHours(Number(local[2]), Number(local[3]), Number(local[4] || 0), 0)
    return { date: d, dateOnly: false }
  }
  const t = Date.parse(s)
  if (Number.isNaN(t)) fail(`${field} "${value}" is not a date — use YYYY-MM-DD or YYYY-MM-DDTHH:mm`)
  return { date: new Date(t), dateOnly: false }
}

const dateKeyOf = (value, field) => {
  const { date } = parseWhen(value, field)
  return toDateKey(date)
}

// ------------------------------------------------------------ data access

function workspace(data) {
  const state = { ...(data || {}) }
  const changes = {}
  const get = (key, fallback) => (state[key] === undefined ? fallback : state[key])
  const set = (key, value) => { state[key] = value; changes[key] = value }
  return { state, changes, get, set }
}

const boardsOf = (ws) => ws.get('boards', [{ id: HOME_BOARD, name: 'Home', icon: '🏠' }])
const calendarsOf = (ws) => ws.get('calendars', DEFAULT_CALENDARS)

function allWidgets(ws) {
  const byBoard = ws.get('widgetsByBoard', {})
  const out = []
  for (const b of boardsOf(ws)) {
    for (const w of byBoard[b.id] || []) out.push({ board: b, widget: w })
  }
  return out
}

const widgetTitle = (w) => w.settings?.title || WIDGET_TYPES[w.type]?.name || w.type

function findWidget(ws, type, widgetId, what) {
  const list = allWidgets(ws).filter((x) => x.widget.type === type)
  if (widgetId) {
    const hit = list.find((x) => x.widget.id === widgetId)
    if (!hit) fail(`No ${what} widget with id ${widgetId}. Available: ${list.map((x) => `${x.widget.id} (${widgetTitle(x.widget)})`).join(', ') || 'none'}`)
    return hit
  }
  if (!list.length) fail(`There is no ${what} widget yet — add one with add_widget (type "${type}") first.`)
  if (list.length > 1) fail(`There are ${list.length} ${what} widgets; pass widgetId. Options: ${list.map((x) => `${x.widget.id} (${widgetTitle(x.widget)} on ${x.board.name})`).join(', ')}`)
  return list[0]
}

function resolveCalendar(ws, name) {
  const cals = calendarsOf(ws)
  if (!name) {
    const cal = cals.find((c) => !c.url) || cals[0]
    return cal
  }
  const n = String(name).toLowerCase()
  const cal = cals.find((c) => c.id === name || c.name.toLowerCase() === n)
  if (!cal) fail(`No calendar named "${name}". Calendars: ${cals.map((c) => c.name).join(', ')}`)
  if (cal.url) fail(`"${cal.name}" is a subscribed feed and is read-only.`)
  return cal
}

const calendarName = (ws, ev) => {
  const cals = calendarsOf(ws)
  return (cals.find((c) => c.id === ev.calendarId) || cals[0])?.name || 'Personal'
}

// "evt_x__1729..." (an occurrence from list_events) → { seriesId, originalStart }
function splitEventId(id) {
  const m = String(id).match(/^(.*)__(\d{10,})$/)
  return m ? { seriesId: m[1], originalStart: new Date(Number(m[2])).toISOString() } : { seriesId: String(id), originalStart: null }
}

function findEvent(ws, id) {
  const { seriesId, originalStart } = splitEventId(id)
  const ev = ws.get('events', []).find((e) => e.id === seriesId)
  if (!ev) fail(`No event with id ${id}. Use list_events to find it.`)
  if (ev.source && String(ev.source).startsWith('url:')) fail(`"${ev.title}" comes from a subscribed calendar feed and can't be changed here.`)
  return { ev, originalStart }
}

function recurrenceFrom(repeat, start) {
  if (!repeat) return null
  const rule = { freq: repeat.freq, interval: repeat.interval || 1 }
  if (repeat.count) rule.count = repeat.count
  if (repeat.until) rule.until = parseWhen(repeat.until, 'repeat.until').date.toISOString()
  if (repeat.byday?.length) rule.byday = repeat.byday
  else if (repeat.freq === 'WEEKLY') rule.byday = [DOW[start.getDay()]]
  return rule
}

function eventOut(ws, e) {
  const out = {
    id: e.id,
    title: e.title,
    start: e.allDay ? toDateKey(new Date(e.start)) : fmtLocal(e.start),
    end: e.end ? (e.allDay ? toDateKey(new Date(e.end)) : fmtLocal(e.end)) : null,
    day: fmtDay(e.start),
    allDay: !!e.allDay,
    calendar: calendarName(ws, e),
  }
  if (e.location) out.location = e.location
  if (e.description) out.description = e.description.slice(0, 300)
  if (e.recurringInstance || e.recurrence) {
    out.recurring = describeRecurrence(e.recurrence) || 'repeats'
    if (e.seriesId) out.seriesId = e.seriesId
  }
  if (typeof e.reminderMinutes === 'number') out.reminderMinutes = e.reminderMinutes
  if (e.source && String(e.source).startsWith('url:')) out.readOnly = true
  return out
}

function streak(log, today = new Date()) {
  let n = 0
  const cursor = new Date(today)
  if (!log[toDateKey(cursor)]) cursor.setDate(cursor.getDate() - 1)
  while (log[toDateKey(cursor)]) { n++; cursor.setDate(cursor.getDate() - 1) }
  return n
}

function findHabit(ws, ref) {
  const habits = ws.get('habits', [])
  const n = String(ref).toLowerCase()
  const h = habits.find((x) => x.id === ref) || habits.find((x) => x.name.toLowerCase() === n) ||
    habits.find((x) => x.name.toLowerCase().includes(n))
  if (!h) fail(`No habit "${ref}". Habits: ${habits.map((x) => x.name).join(', ') || 'none yet'}`)
  return h
}

const DEFAULT_KANBAN = () => ({ columns: [
  { id: uid('col'), title: 'To do', cards: [] },
  { id: uid('col'), title: 'Doing', cards: [] },
  { id: uid('col'), title: 'Done', cards: [] },
] })

function kanbanState(ws, widgetId) {
  const st = ws.get(`widget:${widgetId}`, null)
  return st && Array.isArray(st.columns) ? st : DEFAULT_KANBAN()
}

function findColumn(board, ref) {
  const n = String(ref).toLowerCase()
  const col = board.columns.find((c) => c.id === ref) || board.columns.find((c) => c.title.toLowerCase() === n)
  if (!col) fail(`No column "${ref}". Columns: ${board.columns.map((c) => c.title).join(', ')}`)
  return col
}

// Append Markdown to a page: list items continue a list the page ends with;
// anything else starts a new paragraph.
const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s/
function appendMarkdown(body, addition) {
  const prev = String(body || '').replace(/\s+$/, '')
  if (!prev) return addition
  const lastLine = prev.split('\n').at(-1)
  const joiner = LIST_LINE.test(lastLine) && LIST_LINE.test(addition) ? '\n' : '\n\n'
  return prev + joiner + addition
}

// Plain-text first line, for Notes widget previews.
const firstLine = (text) => {
  const line = String(text || '').split('\n').find((l) => l.trim())
  return line ? line.replace(/^#+\s*/, '').replace(/[*_`~[\]]/g, '').trim().slice(0, 60) || 'Untitled' : 'Untitled'
}

// ------------------------------------------------------------ schemas

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })
const WHEN = 'Local date "YYYY-MM-DD" or local date-time "YYYY-MM-DDTHH:mm".'

const REPEAT = obj({
  freq: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] },
  interval: { type: 'integer', minimum: 1, maximum: 99, description: 'Every N periods (default 1).' },
  count: { type: 'integer', minimum: 1, maximum: 999, description: 'Stop after this many occurrences.' },
  until: str('Last date, YYYY-MM-DD.'),
  byday: { type: 'array', items: { type: 'string', enum: DOW }, maxItems: 7, description: 'For WEEKLY: days such as ["MO","WE"].' },
}, ['freq'])

const EVENT_FIELDS = {
  title: str('Event title.', { maxLength: 200 }),
  start: str(`Start. ${WHEN} A date alone makes an all-day event.`),
  end: str(`End. ${WHEN} Defaults to one hour after start (or the same day for all-day events).`),
  allDay: { type: 'boolean' },
  location: str('Optional place.', { maxLength: 200 }),
  description: str('Optional notes.', { maxLength: 4000 }),
  calendar: str('Calendar name (see get_overview). Defaults to the first editable calendar.'),
  reminderMinutes: { type: ['integer', 'null'], minimum: 0, maximum: 10080, description: 'Notify this many minutes before (null = no reminder). Default 10 for timed events.' },
}

// name → { description, input_schema, readOnly, destructive(input), run(ws, input, ctx) }
const TOOLS = {}
const tool = (name, def) => { TOOLS[name] = { name, readOnly: false, destructive: () => false, ...def } }

// ------------------------------------------------------------ overview

tool('get_overview', {
  readOnly: true,
  description: 'Current date/time, the boards and their widgets, the calendars, and counts. Call this first when you need ids or names.',
  input_schema: obj({}),
  run(ws, _input, ctx) {
    const byBoard = ws.get('widgetsByBoard', {})
    const now = ctx.now
    return {
      now: fmtLocal(now), today: fmtDay(now), timezone: ws.get('timezone', null) || undefined,
      boards: boardsOf(ws).map((b) => ({
        id: b.id, name: b.name,
        widgets: (byBoard[b.id] || []).map((w) => ({ id: w.id, type: w.type, title: widgetTitle(w) })),
      })),
      calendars: calendarsOf(ws).map((c) => ({ name: c.name, readOnly: !!c.url, hidden: c.visible === false })),
      counts: {
        events: ws.get('events', []).length,
        openTasks: ws.get('tasks', []).filter((t) => !t.done).length,
        habits: ws.get('habits', []).length,
      },
      addableWidgetTypes: Object.entries(WIDGET_TYPES).map(([type, m]) => `${type} (${m.name})`),
    }
  },
})

// ------------------------------------------------------------ events

tool('list_events', {
  readOnly: true,
  description: 'Events between two dates, recurring events expanded into occurrences. Each occurrence of a recurring event has its own id — pass that id to update_event/delete_event to change just that occurrence.',
  input_schema: obj({
    from: str(`Range start. ${WHEN}`),
    to: str(`Range end (inclusive). ${WHEN}`),
    query: str('Optional text to match in title, location or notes.'),
  }, ['from', 'to']),
  run(ws, input) {
    const from = parseWhen(input.from, 'from').date
    const toP = parseWhen(input.to, 'to')
    const to = new Date(toP.date)
    if (toP.dateOnly) to.setHours(23, 59, 59, 999)
    if (to < from) fail('"to" is before "from"')
    if ((to - from) / 86400000 > MAX_RANGE_DAYS) fail(`Ask for at most ${MAX_RANGE_DAYS} days at a time`)
    const q = input.query?.trim().toLowerCase()
    let list = collectOccurrences(ws.get('events', []), from, to)
    if (q) list = list.filter((e) => [e.title, e.location, e.description].some((f) => f && String(f).toLowerCase().includes(q)))
    return { events: list.slice(0, MAX_EVENTS).map((e) => eventOut(ws, e)), truncated: list.length > MAX_EVENTS || undefined }
  },
})

tool('create_event', {
  description: 'Add an event to the calendar. Use repeat for recurring events.',
  input_schema: obj({ ...EVENT_FIELDS, repeat: REPEAT }, ['title', 'start']),
  run(ws, input) {
    const s = parseWhen(input.start, 'start')
    const allDay = input.allDay ?? s.dateOnly
    const start = new Date(s.date)
    if (allDay) start.setHours(0, 0, 0, 0)
    let end
    if (input.end) {
      const e = parseWhen(input.end, 'end')
      end = new Date(e.date)
      if (allDay) end.setHours(23, 59, 0, 0)
    } else {
      end = allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59) : new Date(start.getTime() + 3600000)
    }
    if (end < start) fail('end is before start')
    const cal = resolveCalendar(ws, input.calendar)
    const ev = {
      id: uid('evt'), uid: uid('uid'), title: input.title.trim() || 'Untitled', description: input.description || '', location: input.location || '',
      start: start.toISOString(), end: end.toISOString(), allDay,
      color: null, calendarId: cal.id, source: 'local',
      reminderMinutes: input.reminderMinutes !== undefined ? input.reminderMinutes : allDay ? null : 10,
    }
    const rec = recurrenceFrom(input.repeat, start)
    if (rec) { ev.recurrence = rec; ev.exdates = [] }
    ws.set('events', [...ws.get('events', []), ev])
    return { created: eventOut(ws, ev), summary: `Added “${ev.title}” on ${fmtDay(start)}${allDay ? '' : ' at ' + fmtLocal(start).slice(11)}${rec ? ` (${describeRecurrence(rec)})` : ''}` }
  },
})

tool('update_event', {
  description: 'Change an event. For a recurring event, pass an occurrence id from list_events with scope "this" to change one occurrence, or scope "all" to change the whole series (time changes shift every occurrence).',
  input_schema: obj({
    id: str('Event id (or occurrence id) from list_events.'),
    scope: { type: 'string', enum: ['this', 'all'], description: 'For recurring events. Default: "this" for an occurrence id, otherwise "all".' },
    ...EVENT_FIELDS,
  }, ['id']),
  run(ws, input) {
    const { ev, originalStart } = findEvent(ws, input.id)
    const scope = input.scope || (originalStart ? 'this' : 'all')
    const patch = {}
    for (const k of ['title', 'location', 'description', 'allDay', 'reminderMinutes']) if (input[k] !== undefined) patch[k] = input[k]
    if (input.calendar !== undefined) patch.calendarId = resolveCalendar(ws, input.calendar).id
    const events = ws.get('events', [])

    if (ev.recurrence && scope === 'this') {
      if (!originalStart) fail('Pass an occurrence id from list_events to change a single occurrence (or use scope "all").')
      if (patch.calendarId) fail('A single occurrence can’t move to another calendar — use scope "all".')
      const prev = ev.overrides?.[originalStart] || {}
      const baseStart = new Date(prev.start || originalStart)
      const dur = ev.end ? new Date(ev.end) - new Date(ev.start) : 3600000
      const baseEnd = new Date(prev.end || baseStart.getTime() + dur)
      const start = input.start ? parseWhen(input.start, 'start').date : baseStart
      const end = input.end ? parseWhen(input.end, 'end').date : new Date(start.getTime() + (baseEnd - baseStart))
      if (end < start) fail('end is before start')
      const override = { ...prev, ...patch, start: start.toISOString(), end: end.toISOString() }
      ws.set('events', events.map((e) => (e.id === ev.id ? { ...e, overrides: { ...(e.overrides || {}), [originalStart]: override } } : e)))
      return { updated: eventOut(ws, { ...ev, ...override, recurringInstance: true, seriesId: ev.id }), summary: `Changed one “${ev.title}” occurrence (${fmtDay(start)})` }
    }

    let next = { ...ev, ...patch }
    if (input.start || input.end) {
      // Times given for an occurrence of a series are relative to that
      // occurrence: the whole series shifts by the same amount.
      const oldStart = new Date(ev.start)
      const oldDur = ev.end ? new Date(ev.end) - oldStart : 3600000
      const anchor = ev.recurrence && originalStart ? new Date(originalStart) : oldStart
      const newAnchor = input.start ? parseWhen(input.start, 'start').date : anchor
      const dur = input.end ? parseWhen(input.end, 'end').date - newAnchor : oldDur
      if (dur < 0) fail('end is before start')
      const start = new Date(oldStart.getTime() + (newAnchor - anchor))
      next = { ...next, start: start.toISOString(), end: new Date(start.getTime() + dur).toISOString() }
    }
    if (input.repeat !== undefined) next.recurrence = recurrenceFrom(input.repeat, new Date(next.start))
    ws.set('events', events.map((e) => (e.id === ev.id ? next : e)))
    return { updated: eventOut(ws, next), summary: `Updated “${next.title}”${ev.recurrence ? ' (whole series)' : ''}` }
  },
})
TOOLS.update_event.input_schema.properties.repeat = { ...REPEAT, type: ['object', 'null'], description: 'New repeat rule, or null to stop repeating (scope "all").' }

tool('delete_event', {
  description: 'Delete an event. For a recurring event, an occurrence id with scope "this" removes just that occurrence; scope "all" removes the whole series.',
  input_schema: obj({
    id: str('Event id (or occurrence id) from list_events.'),
    scope: { type: 'string', enum: ['this', 'all'] },
  }, ['id']),
  destructive: () => true,
  run(ws, input) {
    const { ev, originalStart } = findEvent(ws, input.id)
    const scope = input.scope || (originalStart ? 'this' : 'all')
    const events = ws.get('events', [])
    if (ev.recurrence && scope === 'this') {
      if (!originalStart) fail('Pass an occurrence id from list_events (or use scope "all").')
      ws.set('events', events.map((e) => (e.id === ev.id ? { ...e, exdates: [...(e.exdates || []), originalStart] } : e)))
      return { deleted: 'occurrence', summary: `Removed one “${ev.title}” occurrence (${fmtDay(originalStart)})` }
    }
    ws.set('events', events.filter((e) => e.id !== ev.id))
    return { deleted: ev.recurrence ? 'series' : 'event', summary: `Deleted “${ev.title}”${ev.recurrence ? ' (all occurrences)' : ''}` }
  },
})

// ------------------------------------------------------------ tasks

const taskOut = (t) => ({ id: t.id, title: t.title, due: t.due || null, priority: t.priority || 'med', done: !!t.done })

tool('list_tasks', {
  readOnly: true,
  description: 'Tasks from the Tasks widget, soonest due first.',
  input_schema: obj({
    status: { type: 'string', enum: ['open', 'done', 'all'], description: 'Default "open".' },
    query: str('Optional text to match in the title.'),
  }),
  run(ws, input) {
    const status = input.status || 'open'
    const q = input.query?.trim().toLowerCase()
    const list = ws.get('tasks', [])
      .filter((t) => status === 'all' || (status === 'done' ? t.done : !t.done))
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
    return { tasks: list.slice(0, 200).map(taskOut), truncated: list.length > 200 || undefined }
  },
})

tool('create_task', {
  description: 'Add a task.',
  input_schema: obj({
    title: str('What needs doing.', { maxLength: 300 }),
    due: str('Due date, YYYY-MM-DD.'),
    priority: { type: 'string', enum: PRIORITIES, description: 'Default "med".' },
  }, ['title']),
  run(ws, input) {
    const t = { id: uid('t'), title: input.title.trim(), done: false, due: input.due ? dateKeyOf(input.due, 'due') : null, priority: input.priority || 'med', createdAt: Date.now() }
    if (!t.title) fail('title is empty')
    ws.set('tasks', [...ws.get('tasks', []), t])
    return { created: taskOut(t), summary: `Added task “${t.title}”${t.due ? ` (due ${t.due})` : ''}` }
  },
})

tool('update_task', {
  description: 'Change a task: rename, set or clear the due date, change priority, or mark done/undone.',
  input_schema: obj({
    id: str('Task id from list_tasks.'),
    title: str('New title.', { maxLength: 300 }),
    due: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null to clear.' },
    priority: { type: 'string', enum: PRIORITIES },
    done: { type: 'boolean' },
  }, ['id']),
  run(ws, input) {
    const tasks = ws.get('tasks', [])
    const t = tasks.find((x) => x.id === input.id)
    if (!t) fail(`No task with id ${input.id}. Use list_tasks.`)
    const next = { ...t }
    if (input.title !== undefined) next.title = input.title.trim() || t.title
    if (input.due !== undefined) next.due = input.due ? dateKeyOf(input.due, 'due') : null
    if (input.priority !== undefined) next.priority = input.priority
    if (input.done !== undefined) { next.done = input.done; next.doneAt = input.done ? Date.now() : null }
    ws.set('tasks', tasks.map((x) => (x.id === t.id ? next : x)))
    const what = input.done === true ? 'Completed' : input.done === false ? 'Reopened' : 'Updated'
    return { updated: taskOut(next), summary: `${what} task “${next.title}”` }
  },
})

tool('delete_task', {
  description: 'Delete a task (to finish one, use update_task with done: true instead).',
  input_schema: obj({ id: str('Task id from list_tasks.') }, ['id']),
  destructive: () => true,
  run(ws, input) {
    const tasks = ws.get('tasks', [])
    const t = tasks.find((x) => x.id === input.id)
    if (!t) fail(`No task with id ${input.id}.`)
    ws.set('tasks', tasks.filter((x) => x.id !== t.id))
    return { deleted: t.id, summary: `Deleted task “${t.title}”` }
  },
})

// ------------------------------------------------------------ habits

tool('list_habits', {
  readOnly: true,
  description: 'Habits with today’s status, current streak and the last 7 days.',
  input_schema: obj({}),
  run(ws, _input, ctx) {
    const today = ctx.now
    return {
      habits: ws.get('habits', []).map((h) => {
        const log = h.log || {}
        const last7 = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(today); d.setDate(d.getDate() - (6 - i))
          return log[toDateKey(d)] ? '✓' : '·'
        }).join('')
        return { id: h.id, name: h.name, doneToday: !!log[toDateKey(today)], streak: streak(log, today), last7 }
      }),
    }
  },
})

tool('create_habit', {
  description: 'Start tracking a new daily habit.',
  input_schema: obj({ name: str('Habit name, e.g. "Read 20 min".', { maxLength: 100 }) }, ['name']),
  run(ws, input) {
    const name = input.name.trim()
    if (!name) fail('name is empty')
    const h = { id: uid('h'), name, log: {} }
    ws.set('habits', [...ws.get('habits', []), h])
    return { created: { id: h.id, name }, summary: `Started tracking “${name}”` }
  },
})

tool('set_habit_done', {
  description: 'Mark a habit done (or not done) for a day.',
  input_schema: obj({
    habit: str('Habit id or name.'),
    date: str('YYYY-MM-DD. Default today.'),
    done: { type: 'boolean' },
  }, ['habit', 'done']),
  run(ws, input, ctx) {
    const h = findHabit(ws, input.habit)
    const key = input.date ? dateKeyOf(input.date, 'date') : toDateKey(ctx.now)
    const log = { ...(h.log || {}) }
    if (input.done) log[key] = true
    else delete log[key]
    ws.set('habits', ws.get('habits', []).map((x) => (x.id === h.id ? { ...x, log } : x)))
    return { habit: h.name, date: key, done: input.done, streak: streak(log, ctx.now), summary: `${input.done ? 'Checked off' : 'Unchecked'} “${h.name}” for ${key}` }
  },
})

// ------------------------------------------------------------ kanban

tool('list_kanban', {
  readOnly: true,
  description: 'Kanban boards (one per Kanban widget) with their columns and cards.',
  input_schema: obj({}),
  run(ws) {
    return {
      boards: allWidgets(ws).filter((x) => x.widget.type === 'kanban').map(({ board, widget }) => ({
        widgetId: widget.id, title: widgetTitle(widget), dashboard: board.name,
        columns: kanbanState(ws, widget.id).columns.map((c) => ({ id: c.id, title: c.title, cards: c.cards.map((k) => ({ id: k.id, text: k.text })) })),
      })),
    }
  },
})

tool('add_kanban_card', {
  description: 'Add a card to a Kanban column.',
  input_schema: obj({
    text: str('Card text.', { maxLength: 500 }),
    column: str('Column name or id (default: the first column).'),
    widgetId: str('Which Kanban widget, if there is more than one.'),
  }, ['text']),
  run(ws, input) {
    const { widget } = findWidget(ws, 'kanban', input.widgetId, 'Kanban')
    const board = kanbanState(ws, widget.id)
    const col = input.column ? findColumn(board, input.column) : board.columns[0]
    if (!col) fail('That board has no columns')
    const card = { id: uid('card'), text: input.text.trim() }
    ws.set(`widget:${widget.id}`, { ...board, columns: board.columns.map((c) => (c.id === col.id ? { ...c, cards: [...c.cards, card] } : c)) })
    return { created: card, column: col.title, summary: `Added card “${card.text}” to ${col.title}` }
  },
})

function findCard(ws, cardId, widgetId) {
  for (const { widget } of allWidgets(ws).filter((x) => x.widget.type === 'kanban' && (!widgetId || x.widget.id === widgetId))) {
    const board = kanbanState(ws, widget.id)
    for (const col of board.columns) {
      const card = col.cards.find((k) => k.id === cardId)
      if (card) return { widget, board, col, card }
    }
  }
  fail(`No card with id ${cardId}. Use list_kanban.`)
}

tool('move_kanban_card', {
  description: 'Move a Kanban card to another column (e.g. to "Done").',
  input_schema: obj({ cardId: str('Card id from list_kanban.'), column: str('Target column name or id.') }, ['cardId', 'column']),
  run(ws, input) {
    const { widget, board, col, card } = findCard(ws, input.cardId)
    const target = findColumn(board, input.column)
    const columns = board.columns.map((c) => {
      let cards = c.cards.filter((k) => k.id !== card.id)
      if (c.id === target.id) cards = [...cards, card]
      return { ...c, cards }
    })
    ws.set(`widget:${widget.id}`, { ...board, columns })
    return { moved: card.id, from: col.title, to: target.title, summary: `Moved “${card.text}” to ${target.title}` }
  },
})

tool('delete_kanban_card', {
  description: 'Delete a Kanban card.',
  input_schema: obj({ cardId: str('Card id from list_kanban.') }, ['cardId']),
  destructive: () => true,
  run(ws, input) {
    const { widget, board, card } = findCard(ws, input.cardId)
    ws.set(`widget:${widget.id}`, { ...board, columns: board.columns.map((c) => ({ ...c, cards: c.cards.filter((k) => k.id !== card.id) })) })
    return { deleted: card.id, summary: `Deleted card “${card.text}”` }
  },
})

// ------------------------------------------------------------ notes

tool('list_notes', {
  readOnly: true,
  description: 'Notebook pages (titles, icons, and where each sits: pages can have sub-pages) and Notes widgets with short previews.',
  input_schema: obj({}),
  run(ws) {
    const out = []
    for (const { board, widget } of allWidgets(ws)) {
      if (widget.type === 'notebook') {
        const pages = (ws.get(`widget:${widget.id}`, null)?.pages || []).map(normalizePage)
        for (const { page: p } of pageRows(pages, { all: true })) {
          const path = ancestorsOf(pages, p.id).map((a) => a.title || 'Untitled')
          out.push({
            widgetId: widget.id, pageId: p.id, notebook: widgetTitle(widget), dashboard: board.name, title: p.title || 'Untitled', icon: p.icon,
            ...(path.length ? { parentId: parentOf(pages, p), path: path.join(' / ') } : {}),
            updated: p.updated ? fmtLocal(p.updated) : null, length: p.text.length,
          })
        }
      } else if (widget.type === 'notes') {
        const text = ws.get(`widget:${widget.id}`, '')
        out.push({ widgetId: widget.id, note: widgetTitle(widget), title: firstLine(text), dashboard: board.name, preview: String(text).slice(0, 160), length: String(text).length })
      }
    }
    return { notes: out }
  },
})

function noteTarget(ws, widgetId) {
  if (widgetId) {
    const hit = allWidgets(ws).find((x) => x.widget.id === widgetId && (x.widget.type === 'notebook' || x.widget.type === 'notes'))
    if (!hit) fail(`No Notebook or Notes widget with id ${widgetId}. Use list_notes.`)
    return hit.widget
  }
  return findWidget(ws, 'notebook', null, 'Notebook').widget
}

tool('read_note', {
  readOnly: true,
  description: 'Full content of a Notebook page (its title, and the body as Markdown) or a Notes widget.',
  input_schema: obj({ widgetId: str('From list_notes.'), pageId: str('Notebook page id from list_notes.') }, ['widgetId']),
  run(ws, input) {
    const w = noteTarget(ws, input.widgetId)
    if (w.type === 'notes') return { text: String(ws.get(`widget:${w.id}`, '')) }
    const pages = (ws.get(`widget:${w.id}`, null)?.pages || []).map(normalizePage)
    const p = pages.find((x) => x.id === input.pageId) || (!input.pageId && pages[0])
    if (!p) fail(`No page ${input.pageId}. Use list_notes.`)
    const subPages = childrenOf(pages, p.id).map((c) => ({ pageId: c.id, title: c.title || 'Untitled' }))
    return { pageId: p.id, title: p.title || 'Untitled', icon: p.icon, parentId: parentOf(pages, p), ...(subPages.length ? { subPages } : {}), text: p.text }
  },
})

tool('write_note', {
  description: 'Write into the Notebook: create a page, append to a page, or replace a page’s body. Write the body as Markdown — the notebook shows it as formatted rich text (headings, **bold**, lists, "- [ ] to-dos", > quotes, tables are not supported). Also works on a Notes widget (append/replace).',
  input_schema: obj({
    mode: { type: 'string', enum: ['create', 'append', 'replace'] },
    text: str('Page body as Markdown.', { maxLength: 20000 }),
    title: str('Page title (create, or rename on replace).', { maxLength: 120 }),
    icon: str('One emoji for the page (create).', { maxLength: 8 }),
    widgetId: str('Notebook or Notes widget id (default: the only Notebook).'),
    pageId: str('Page to append to or replace (Notebook).'),
    parentId: str('Create the page as a sub-page of this page (Notebook, create).'),
  }, ['mode', 'text']),
  destructive: (input) => input.mode === 'replace',
  run(ws, input) {
    const w = noteTarget(ws, input.widgetId)
    const key = `widget:${w.id}`
    const now = new Date().toISOString()
    if (w.type === 'notes') {
      if (input.mode === 'create') fail('A Notes widget holds one note — use append or replace.')
      const prev = String(ws.get(key, ''))
      ws.set(key, input.mode === 'append' && prev ? `${prev.replace(/\s+$/, '')}\n${input.text}` : input.text)
      return { summary: `${input.mode === 'append' ? 'Added to' : 'Rewrote'} ${widgetTitle(w)}` }
    }
    const st = ws.get(key, null) || { pages: [] }
    const pages = (st.pages || []).map(normalizePage)
    if (input.mode === 'create') {
      // A leading "# Heading" becomes the title when none is given.
      const split = input.title ? { title: input.title, body: input.text } : splitTitle(input.text)
      const page = { id: uid('pg'), title: split.title.trim() || 'Untitled', icon: input.icon || DEFAULT_ICON, text: split.body, updated: now }
      if (input.parentId) {
        const parent = pages.find((p) => p.id === input.parentId)
        if (!parent) fail(`No page ${input.parentId} to put the sub-page under. Use list_notes.`)
        // Last under its parent, and make sure the parent is open in the sidebar.
        page.parent = parent.id
        ws.set(key, { ...st, pages: [...pages.map((p) => (p.id === parent.id && p.collapsed ? { ...p, collapsed: false } : p)), page], current: page.id })
        return { created: { pageId: page.id, title: page.title, parentId: parent.id }, summary: `Created page “${page.title}” in “${parent.title || 'Untitled'}”` }
      }
      ws.set(key, { ...st, pages: [page, ...pages], current: page.id })
      return { created: { pageId: page.id, title: page.title }, summary: `Created page “${page.title}”` }
    }
    const page = pages.find((p) => p.id === input.pageId) || (!input.pageId && pages.length === 1 ? pages[0] : null)
    if (!page) fail(input.pageId ? `No page ${input.pageId}.` : 'Pass pageId (see list_notes), or use mode "create".')
    const text = input.mode === 'append' ? appendMarkdown(page.text, input.text) : input.text
    const title = input.mode === 'replace' && input.title ? input.title.trim() : page.title
    ws.set(key, { ...st, pages: pages.map((p) => (p.id === page.id ? { ...p, title, text, updated: now } : p)) })
    return { pageId: page.id, summary: `${input.mode === 'append' ? 'Added to' : 'Rewrote'} “${title || 'Untitled'}”` }
  },
})

// ------------------------------------------------------------ bookmarks & widgets

tool('add_bookmark', {
  description: 'Save a link in a Bookmark Groups widget (the group is created if needed).',
  input_schema: obj({
    url: str('http(s) address.'),
    title: str('Label (default: the site name).', { maxLength: 200 }),
    group: str('Group name (default: the first group).', { maxLength: 80 }),
    widgetId: str('Which Bookmark Groups widget, if there is more than one.'),
  }, ['url']),
  run(ws, input) {
    let url = input.url.trim()
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    let host
    try { host = new URL(url).hostname.replace(/^www\./, '') } catch { fail(`"${input.url}" is not a web address`) }
    const { widget } = findWidget(ws, 'bookmarks', input.widgetId, 'Bookmark Groups')
    const groups = ws.get(`widget:${widget.id}`, null) || []
    const gname = input.group?.trim()
    let group = gname ? groups.find((g) => g.name.toLowerCase() === gname.toLowerCase()) : groups[0]
    const link = { id: uid('bm'), title: input.title?.trim() || host, url }
    let next
    if (!group) {
      group = { id: uid('bg'), name: gname || 'Saved', links: [link] }
      next = [...groups, group]
    } else {
      next = groups.map((g) => (g.id === group.id ? { ...g, collapsed: false, links: [...g.links, link] } : g))
    }
    ws.set(`widget:${widget.id}`, next)
    return { created: link, group: group.name, summary: `Bookmarked ${link.title} in ${group.name}` }
  },
})

tool('add_widget', {
  description: 'Add a widget to a board (at the bottom). See get_overview for the types.',
  input_schema: obj({
    type: { type: 'string', enum: Object.keys(WIDGET_TYPES) },
    board: str('Board name or id (default: the first board).'),
    title: str('Optional custom title.', { maxLength: 80 }),
  }, ['type']),
  run(ws, input) {
    const boards = boardsOf(ws)
    const n = input.board?.toLowerCase()
    const board = input.board ? boards.find((b) => b.id === input.board || b.name.toLowerCase() === n) : boards[0]
    if (!board) fail(`No board "${input.board}". Boards: ${boards.map((b) => b.name).join(', ')}`)
    const meta = WIDGET_TYPES[input.type]
    const byBoard = ws.get('widgetsByBoard', {})
    const list = byBoard[board.id] || []
    if (meta.singleton && list.some((w) => w.type === input.type)) fail(`${meta.name} is already on ${board.name} (only one allowed per board).`)
    const maxY = list.reduce((acc, w) => Math.max(acc, (w.layout?.y || 0) + (w.layout?.h || 2)), 0)
    const w = { id: uid('w'), type: input.type, settings: input.title ? { title: input.title } : {}, layout: { x: 0, y: maxY, w: meta.layout.w, h: meta.layout.h } }
    ws.set('widgetsByBoard', { ...byBoard, [board.id]: [...list, w] })
    return { created: { id: w.id, type: w.type, board: board.name }, summary: `Added ${input.title || meta.name} to ${board.name}` }
  },
})

tool('remove_widget', {
  description: 'Remove a widget from its board. Its own content (e.g. a notebook) is deleted with it; shared data like events and tasks is kept.',
  input_schema: obj({ widgetId: str('Widget id from get_overview.') }, ['widgetId']),
  destructive: () => true,
  run(ws, input) {
    const hit = allWidgets(ws).find((x) => x.widget.id === input.widgetId)
    if (!hit) fail(`No widget with id ${input.widgetId}.`)
    const byBoard = ws.get('widgetsByBoard', {})
    ws.set('widgetsByBoard', { ...byBoard, [hit.board.id]: byBoard[hit.board.id].filter((w) => w.id !== input.widgetId) })
    return { removed: input.widgetId, summary: `Removed ${widgetTitle(hit.widget)} from ${hit.board.name}` }
  },
})

// ------------------------------------------------------------ public API

export const TOOL_NAMES = Object.keys(TOOLS)

// Definitions for model APIs: [{ name, description, input_schema, readOnly }]
export function toolDefinitions({ readOnly = false } = {}) {
  return Object.values(TOOLS)
    .filter((t) => !readOnly || t.readOnly)
    .map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema, readOnly: t.readOnly }))
}

export const isReadOnlyTool = (name) => !!TOOLS[name]?.readOnly

// Does this call need the user's OK first? (deletes, overwrites)
export function needsConfirmation(name, input) {
  const t = TOOLS[name]
  return !!t && !t.readOnly && !!t.destructive(input || {})
}

// Run one tool against a snapshot.
// → { ok: true, result, summary, changes } | { ok: false, error }
export function runTool(name, input, { data, now = new Date(), readOnly = false } = {}) {
  const t = TOOLS[name]
  if (!t) return { ok: false, error: `Unknown tool ${name}` }
  if (readOnly && !t.readOnly) return { ok: false, error: `${name} changes the dashboard, but this connection is read-only.` }
  const err = validate(t.input_schema, input ?? {})
  if (err) return { ok: false, error: `Invalid input: ${err}` }
  const ws = workspace(data)
  try {
    const out = t.run(ws, input || {}, { now: new Date(now) })
    const { summary, ...result } = out || {}
    return { ok: true, result, summary: summary || null, changes: ws.changes }
  } catch (e) {
    if (e instanceof ToolError) return { ok: false, error: e.message }
    return { ok: false, error: `Something went wrong running ${name}: ${e.message}` }
  }
}

export const SYSTEM_PROMPT = `You are the assistant built into HomeDash, the user's personal dashboard (calendar, tasks, habits, kanban boards, notebook, bookmarks and widgets).

You can read and change their dashboard with the tools. Look things up rather than guessing ids: list_events, list_tasks, list_habits, list_kanban, list_notes, or get_overview for boards, widgets and calendars. When asked to do something, do it with the tools and then confirm briefly what changed. If a request is ambiguous in a way that matters (which of two events, which day), ask one short question instead of acting.

Times are the user's local time. Write and read them as "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD" for all-day/dates); each message starts with the current local date and time. Resolve relative dates ("tomorrow", "next Friday") from that.

Deleting or overwriting asks the user for approval in the app; if they decline, accept it and don't retry. Keep answers short and friendly, use Markdown lists for schedules, and never invent events, tasks or notes that the tools didn't return.`

// The first line of every user turn: lets the model resolve "tomorrow" etc.
export function contextLine(now = new Date(), timeZone) {
  return `[Now: ${WEEKDAY[now.getDay()]} ${fmtLocal(now).replace('T', ' ')}${timeZone ? ` (${timeZone})` : ''}]`
}
