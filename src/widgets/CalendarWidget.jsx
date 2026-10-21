import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { smartFetch } from '../lib/server.js'
import { parseICS, eventsToICS, icsCalendarName } from '../lib/ics.js'
import { expandInRange } from '../lib/recurrence.js'
import { monthMatrix, weekDays, toDateKey, fromDateKey, fmtMonthYear } from '../lib/date.js'
import {
  startOf, endOf, blankEvent, mergeEvents, newCalendar, defaultCalendarId,
  eventColor, isVisible, atMinutes, calendarOf,
} from './calendar/helpers.js'
import MonthView from './calendar/MonthView.jsx'
import TimeGrid from './calendar/TimeGrid.jsx'
import AgendaView from './calendar/AgendaView.jsx'
import EventEditor from './calendar/EventEditor.jsx'
import ImportModal from './calendar/ImportModal.jsx'
import CalendarsMenu from './calendar/CalendarsMenu.jsx'
import CalendarSearch from './calendar/CalendarSearch.jsx'

const VIEWS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['agenda', 'Agenda']]
const FEED_REFRESH_MS = 30 * 60 * 1000

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'Feed' }
}

function viewTitle(view, cursor) {
  if (view === 'agenda') return 'Agenda'
  if (view === 'day') return cursor.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  if (view === 'week') {
    const [a, , , , , , b] = weekDays(cursor)
    const md = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return `${md(a)} – ${a.getMonth() === b.getMonth() ? b.getDate() : md(b)}, ${b.getFullYear()}`
  }
  return fmtMonthYear(cursor)
}

export default function CalendarWidget() {
  const { events, setEvents, tasks, setTasks, calendars, setCalendars } = useDashboard()
  const [cursor, setCursor] = useState(new Date())
  const [view, setView] = useState('month')
  const [editing, setEditing] = useState(null)
  const [popover, setPopover] = useState(null) // 'calendars' | 'search' | 'jump' | null
  const [showImport, setShowImport] = useState(false)
  const [highlightId, setHighlightId] = useState(null)
  const dragItem = useRef(null) // item being dragged between whole days (HTML5 DnD)

  // ---------------------------------------------------------- visible range
  const days = useMemo(() => (view === 'day' ? [startOf(cursor)] : view === 'week' ? weekDays(cursor) : null), [view, cursor])
  const range = useMemo(() => {
    if (days) return { start: startOf(days[0]), end: endOf(days[days.length - 1]) }
    const weeks = monthMatrix(cursor.getFullYear(), cursor.getMonth())
    return { start: startOf(weeks[0][0]), end: endOf(weeks[5][6]) }
  }, [days, cursor])

  // Events (recurrences expanded, hidden calendars skipped) + due tasks by day.
  const byDay = useMemo(() => {
    const map = {}
    for (const e of events) {
      if (!e.start || !isVisible(e, calendars)) continue
      for (const inst of expandInRange(e, range.start, range.end)) {
        const key = toDateKey(new Date(inst.start))
        ;(map[key] ||= []).push({ ...inst, kind: 'event', color: eventColor(inst, calendars) })
      }
    }
    for (const t of tasks) {
      if (!t.due || t.done) continue
      ;(map[t.due] ||= []).push({ id: t.id, title: t.title, kind: 'task', color: 'amber', start: fromDateKey(t.due).toISOString(), allDay: true })
    }
    for (const key of Object.keys(map)) map[key].sort((a, b) => new Date(a.start) - new Date(b.start))
    return map
  }, [events, tasks, calendars, range])

  const counts = useMemo(() => {
    const c = {}
    for (const e of events) { const id = e.calendarId || calendars[0]?.id; c[id] = (c[id] || 0) + 1 }
    return c
  }, [events, calendars])
  const hiddenCount = calendars.filter((c) => c.visible === false).length

  // ---------------------------------------------------------- saving
  // Recurring occurrences honour the chosen scope:
  //  'this' → per-occurrence override on the series master
  //  'all'  → update the master's shared fields (shifting the series if the time changed)
  function saveEvent(ev, scope) {
    if (ev._isOccurrence && ev._master) {
      const master = ev._master
      const fields = {
        title: ev.title, description: ev.description, location: ev.location,
        color: ev.color, allDay: ev.allDay, reminderMinutes: ev.reminderMinutes,
      }
      if (scope === 'this') {
        const override = { ...fields, start: ev.start, end: ev.end }
        setEvents((list) => list.map((e) =>
          e.id === master.id ? { ...e, overrides: { ...(e.overrides || {}), [ev._originalStart]: override } } : e))
      } else {
        const delta = new Date(ev.start).getTime() - new Date(ev._originalStart).getTime()
        setEvents((list) => list.map((e) => {
          if (e.id !== master.id) return e
          const ns = new Date(new Date(e.start).getTime() + delta)
          const ne = e.end ? new Date(new Date(e.end).getTime() + delta) : null
          return { ...e, ...fields, calendarId: ev.calendarId, recurrence: ev.recurrence, start: ns.toISOString(), end: ne ? ne.toISOString() : e.end }
        }))
      }
    } else {
      setEvents((list) => {
        const exists = list.some((e) => e.id === ev.id)
        return exists ? list.map((e) => (e.id === ev.id ? ev : e)) : [...list, ev]
      })
    }
    setEditing(null)
  }

  // 'this' excludes just this occurrence; 'all' (or non-recurring) removes the event.
  function deleteEvent(ev, scope) {
    if (ev._isOccurrence && ev._master && scope === 'this') {
      setEvents((list) => list.map((e) =>
        e.id === ev._master.id ? { ...e, exdates: [...(e.exdates || []), ev._originalStart] } : e))
    } else {
      const id = ev._master ? ev._master.id : (ev.id || ev)
      setEvents((list) => list.filter((e) => e.id !== id))
    }
    setEditing(null)
  }

  function openItem(item) {
    if (item.kind === 'task') return // tasks are edited in the Tasks widget
    if (item.seriesId) {
      const master = events.find((e) => e.id === item.seriesId)
      setEditing({ ...item, _isOccurrence: true, _master: master, _originalStart: item.originalStart })
    } else {
      setEditing(events.find((e) => e.id === item.id) || item)
    }
  }

  const createAt = (day, startMin, endMin) => setEditing(blankEvent(day, defaultCalendarId(calendars), startMin, endMin))

  // Move/resize an event to an exact start/end. Recurring → this occurrence only.
  function retime(item, start, end) {
    if (item.kind === 'task') return
    const s = start.toISOString()
    const e = end.toISOString()
    if (item.seriesId) {
      setEvents((list) => list.map((ev) => (ev.id !== item.seriesId ? ev : {
        ...ev,
        overrides: { ...(ev.overrides || {}), [item.originalStart]: { ...(ev.overrides?.[item.originalStart] || {}), start: s, end: e } },
      })))
    } else {
      setEvents((list) => list.map((ev) => (ev.id === item.id ? { ...ev, start: s, end: e } : ev)))
    }
  }

  // Drop onto a whole day (month cells, all-day row): keep the time of day.
  function reschedule(item, day) {
    if (!item) return
    if (item.kind === 'task') {
      setTasks((list) => list.map((t) => (t.id === item.id ? { ...t, due: toDateKey(day) } : t)))
      return
    }
    const oldStart = new Date(item.start)
    if (toDateKey(day) === toDateKey(oldStart)) return
    const start = atMinutes(day, oldStart.getHours() * 60 + oldStart.getMinutes())
    const dur = item.end ? new Date(item.end) - oldStart : 3600000
    retime(item, start, new Date(start.getTime() + dur))
  }

  // ---------------------------------------------------------- feeds + import
  const fetchFeed = useCallback(async (url) => {
    const res = await smartFetch(url)
    if (!res.ok) throw new Error(`the calendar host answered ${res.status}`)
    const text = await res.text()
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('that address didn’t return a calendar')
    return { name: icsCalendarName(text), events: parseICS(text) }
  }, [])

  // Replace a feed calendar's events with the latest copy. Ids derive from the
  // feed's UIDs so they stay stable across refreshes.
  const applyFeed = useCallback((cal, parsed) => {
    const source = 'url:' + cal.url
    setEvents((list) => [
      ...list.filter((e) => e.calendarId !== cal.id && e.source !== source),
      ...parsed.map((e) => ({ ...e, id: `feed_${cal.id}_${e.uid}`, calendarId: cal.id, color: null, source })),
    ])
  }, [setEvents])

  const refreshFeed = useCallback(async (cal) => {
    try {
      const { events: parsed } = await fetchFeed(cal.url)
      applyFeed(cal, parsed)
      setCalendars((cs) => cs.map((c) => (c.id === cal.id ? { ...c, lastSync: new Date().toISOString(), lastAttempt: Date.now(), syncError: null } : c)))
    } catch (e) {
      setCalendars((cs) => cs.map((c) => (c.id === cal.id ? { ...c, lastAttempt: Date.now(), syncError: e.message } : c)))
    }
  }, [fetchFeed, applyFeed, setCalendars])

  async function subscribe(url) {
    const { name, events: parsed } = await fetchFeed(url)
    let cal = calendars.find((c) => c.url === url)
    if (!cal) {
      cal = newCalendar(name || hostOf(url), calendars, { url })
      setCalendars((cs) => [...cs, cal])
    }
    applyFeed(cal, parsed)
    setCalendars((cs) => cs.map((c) => (c.id === cal.id ? { ...c, lastSync: new Date().toISOString(), lastAttempt: Date.now(), syncError: null } : c)))
    return { ok: parsed.length, name: cal.name }
  }

  function importFile(name, parsed) {
    let cal = calendars.find((c) => !c.url && c.name === name)
    if (!cal) {
      cal = newCalendar(name, calendars)
      setCalendars((cs) => [...cs, cal])
    }
    setEvents((list) => mergeEvents(list, parsed.map((e) => ({ ...e, calendarId: cal.id, color: null }))))
  }

  // Keep subscribed feeds fresh while the calendar is open.
  const calendarsRef = useRef(calendars)
  calendarsRef.current = calendars
  useEffect(() => {
    const run = () => {
      for (const c of calendarsRef.current) {
        if (c.url && (!c.lastAttempt || Date.now() - c.lastAttempt > FEED_REFRESH_MS)) refreshFeed(c)
      }
    }
    run()
    const iv = setInterval(run, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [refreshFeed])

  function deleteCalendar(cal) {
    const n = counts[cal.id] || 0
    if (!confirm(`Delete the “${cal.name}” calendar${n ? ` and its ${n} event${n === 1 ? '' : 's'}` : ''}?`)) return
    const fallback = calendars.find((c) => c.id !== cal.id)
    setEvents((list) => list.filter((e) => (e.calendarId || calendars[0].id) !== cal.id))
    setCalendars((cs) => cs.filter((c) => c.id !== cal.id))
    // Legacy events without a calendarId belong to the first calendar; if that
    // one is deleted they'd silently move, so pin the survivors explicitly.
    if (cal.id === calendars[0].id && fallback) {
      setEvents((list) => list.map((e) => (e.calendarId ? e : { ...e, calendarId: fallback.id })))
    }
  }

  function exportICS() {
    const blob = new Blob([eventsToICS(events)], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'homedash-calendar.ics'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---------------------------------------------------------- navigation
  function shift(dir) {
    setCursor((c) => {
      const n = new Date(c)
      if (view === 'day') n.setDate(c.getDate() + dir)
      else if (view === 'week') n.setDate(c.getDate() + dir * 7)
      else n.setMonth(c.getMonth() + dir)
      return n
    })
  }

  function pickResult(r) {
    setPopover(null)
    // Make sure the result's calendar is visible, then go to its day.
    const ev = r.kind === 'event' ? events.find((e) => e.id === (r.seriesId || r.id)) : null
    const calId = ev ? calendarOf(ev, calendars).id : null
    if (calId) setCalendars((cs) => cs.map((c) => (c.id === calId ? { ...c, visible: true } : c)))
    setCursor(new Date(r.start))
    setView(r.allDay ? 'week' : 'day')
    setHighlightId(r.id)
    setTimeout(() => setHighlightId(null), 2400)
  }

  const closePopover = useCallback(() => setPopover(null), [])

  return (
    <div className="cal no-drag">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="wtool" onClick={() => shift(-1)} aria-label="Previous" disabled={view === 'agenda'}>‹</button>
          <button className="btn sm ghost" onClick={() => setCursor(new Date())}>Today</button>
          <button className="wtool" onClick={() => shift(1)} aria-label="Next" disabled={view === 'agenda'}>›</button>
          <span className="cal-title-wrap">
            <button className="cal-title" onClick={() => setPopover(popover === 'jump' ? null : 'jump')} title="Jump to a date">
              {viewTitle(view, cursor)} <span className="cal-title-caret">▾</span>
            </button>
            {popover === 'jump' && (
              <DateJump value={cursor} onPick={(d) => { setCursor(d); if (view === 'agenda') setView('day'); setPopover(null) }} onClose={closePopover} />
            )}
          </span>
        </div>
        <span className="spacer" />
        <div className="cal-viewtoggle">
          {VIEWS.map(([v, name]) => (
            <button key={v} className={`chip ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>{name}</button>
          ))}
        </div>
        <span className="cal-tools">
          <button className="wtool" title="Search" aria-label="Search" onClick={() => setPopover(popover === 'search' ? null : 'search')}>⌕</button>
          <button className={`wtool ${hiddenCount ? 'has-hidden' : ''}`} title={hiddenCount ? `Calendars (${hiddenCount} hidden)` : 'Calendars'} aria-label="Calendars"
            onClick={() => setPopover(popover === 'calendars' ? null : 'calendars')}>☰</button>
          <button className="wtool" title="Import / Sync" aria-label="Import / Sync" onClick={() => setShowImport(true)}>⇩</button>
          {popover === 'search' && (
            <CalendarSearch events={events} tasks={tasks} calendars={calendars} onPick={pickResult} onClose={closePopover} />
          )}
          {popover === 'calendars' && (
            <CalendarsMenu calendars={calendars} setCalendars={setCalendars} counts={counts}
              onRefresh={refreshFeed} onDelete={deleteCalendar} onClose={closePopover} />
          )}
        </span>
      </div>

      {view === 'month' && (
        <MonthView cursor={cursor} byDay={byDay} onDay={(day) => createAt(day, 9 * 60, 10 * 60)} onItem={openItem}
          dragItem={dragItem} onDrop={reschedule} highlightId={highlightId} />
      )}
      {days && (
        <TimeGrid days={days} byDay={byDay} onItem={openItem} onCreate={createAt} onRetime={retime}
          dragItem={dragItem} onDropDay={reschedule} highlightId={highlightId}
          onDayHeader={(day) => { setCursor(day); setView('day') }} />
      )}
      {view === 'agenda' && (
        <AgendaView events={events} tasks={tasks} calendars={calendars} onItem={openItem} onDay={(day) => { setCursor(day); setView('day') }} />
      )}

      {editing && (
        <EventEditor event={editing} calendars={calendars} onClose={() => setEditing(null)} onSave={saveEvent} onDelete={deleteEvent} />
      )}

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImportFile={importFile} onSubscribe={subscribe} onExport={exportICS} />
      )}
    </div>
  )
}

function DateJump({ value, onPick, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [onClose])
  return (
    <div className="cal-pop cal-jump" ref={ref}>
      <input
        className="input" type="date" autoFocus defaultValue={toDateKey(value)} aria-label="Jump to date"
        onChange={(e) => { if (e.target.value) onPick(fromDateKey(e.target.value)) }}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      />
      <div className="row">
        <button className="chip" onClick={() => onPick(new Date())}>Today</button>
        <button className="chip" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 7); onPick(d) }}>Next week</button>
        <button className="chip" onClick={() => { const d = new Date(); d.setMonth(d.getMonth() + 1, 1); onPick(d) }}>Next month</button>
      </div>
    </div>
  )
}
