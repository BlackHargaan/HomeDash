import { useMemo, useRef, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { uid } from '../lib/storage.js'
import { parseICS, eventsToICS } from '../lib/ics.js'
import { expandInRange, collectOccurrences, describeRecurrence, SIMPLE_FREQS } from '../lib/recurrence.js'
import { EVENT_COLORS, ACCENTS } from './registry.js'
import Modal from '../components/Modal.jsx'
import {
  monthMatrix, weekDays, isSameDay, toDateKey, fromDateKey,
  fmtMonthYear, fmtTime, fmtDateTimeLocal, WEEKDAY_SHORT,
} from '../lib/date.js'

function startOf(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function endOf(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }

function blankEvent(day) {
  const start = new Date(day)
  start.setHours(9, 0, 0, 0)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return {
    id: uid('evt'), uid: uid('uid'), title: '', description: '', location: '',
    start: start.toISOString(), end: end.toISOString(), allDay: false, color: 'indigo', source: 'local',
    reminderMinutes: 10,
  }
}

const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '0', label: 'At start time' },
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
]

export default function CalendarWidget() {
  const { events, setEvents, tasks, setTasks } = useDashboard()
  const [cursor, setCursor] = useState(new Date())
  const [view, setView] = useState('month')
  const [editing, setEditing] = useState(null) // event object or null
  const [showImport, setShowImport] = useState(false)
  const fileRef = useRef(null)
  const dragItem = useRef(null) // item currently being dragged for reschedule

  // The span of days currently on screen — recurring events are expanded only
  // within this window.
  const range = useMemo(() => {
    if (view === 'week') {
      const days = weekDays(cursor)
      return { start: startOf(days[0]), end: endOf(days[6]) }
    }
    const weeks = monthMatrix(cursor.getFullYear(), cursor.getMonth())
    return { start: startOf(weeks[0][0]), end: endOf(weeks[5][6]) }
  }, [cursor, view])

  // Index events (expanding recurrences) + due-dated tasks by day key.
  const byDay = useMemo(() => {
    const map = {}
    for (const e of events) {
      if (!e.start) continue
      for (const inst of expandInRange(e, range.start, range.end)) {
        const key = toDateKey(new Date(inst.start))
        ;(map[key] ||= []).push({ ...inst, kind: 'event' })
      }
    }
    for (const t of tasks) {
      if (!t.due || t.done) continue
      const key = t.due
      ;(map[key] ||= []).push({ id: t.id, title: t.title, kind: 'task', color: 'amber', start: fromDateKey(t.due).toISOString(), allDay: true })
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.start) - new Date(b.start))
    }
    return map
  }, [events, tasks, range])

  // Save honours the chosen scope for recurring occurrences:
  //  - 'this' → store a per-occurrence override on the series master
  //  - 'all'  → update the master's shared fields (and shift the series if the
  //             time-of-day changed)
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
        // 'all' — shift the whole series by any time delta and update shared fields.
        const delta = new Date(ev.start).getTime() - new Date(ev._originalStart).getTime()
        setEvents((list) => list.map((e) => {
          if (e.id !== master.id) return e
          const ns = new Date(new Date(e.start).getTime() + delta)
          const ne = e.end ? new Date(new Date(e.end).getTime() + delta) : null
          return { ...e, ...fields, recurrence: ev.recurrence, start: ns.toISOString(), end: ne ? ne.toISOString() : e.end }
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

  // Delete: 'this' excludes just this occurrence; 'all' (or non-recurring)
  // removes the whole event.
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

  function openDay(day) {
    setEditing(blankEvent(day))
  }
  function openItem(item) {
    if (item.kind === 'task') return // tasks are edited in the Tasks widget
    if (item.seriesId) {
      // A recurring occurrence: edit the shown instance, but remember the series
      // master + this occurrence's original time so we can scope the save.
      const master = events.find((e) => e.id === item.seriesId)
      setEditing({ ...item, _isOccurrence: true, _master: master, _originalStart: item.originalStart })
    } else {
      setEditing(events.find((e) => e.id === item.id) || item)
    }
  }

  // Drag-to-reschedule: move an item to `day`, keeping its time-of-day.
  function reschedule(item, day) {
    if (!item) return
    if (item.kind === 'task') {
      setTasks((list) => list.map((t) => (t.id === item.id ? { ...t, due: toDateKey(day) } : t)))
      return
    }
    const oldStart = new Date(item.start)
    const newStart = new Date(day)
    newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0)
    if (toDateKey(newStart) === toDateKey(oldStart)) return
    const dur = item.end ? new Date(item.end).getTime() - oldStart.getTime() : 3600000
    const newEnd = new Date(newStart.getTime() + dur)
    if (item.seriesId) {
      // Reschedule just this occurrence (per-occurrence override).
      setEvents((list) => list.map((e) =>
        e.id === item.seriesId
          ? { ...e, overrides: { ...(e.overrides || {}), [item.originalStart]: { ...(e.overrides?.[item.originalStart] || {}), start: newStart.toISOString(), end: newEnd.toISOString() } } }
          : e))
    } else {
      setEvents((list) => list.map((e) =>
        e.id === item.id ? { ...e, start: newStart.toISOString(), end: newEnd.toISOString() } : e))
    }
  }

  function importFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseICS(String(reader.result))
      setEvents((list) => mergeEvents(list, parsed))
    }
    reader.readAsText(file)
    e.target.value = ''
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

  const monthTitle = fmtMonthYear(cursor)

  return (
    <div className="cal no-drag">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="wtool" onClick={() => shift(setCursor, view, -1)} aria-label="Previous">‹</button>
          <button className="btn sm ghost" onClick={() => setCursor(new Date())}>Today</button>
          <button className="wtool" onClick={() => shift(setCursor, view, 1)} aria-label="Next" disabled={view === 'agenda'}>›</button>
          <span className="cal-title">{view === 'agenda' ? 'Agenda' : monthTitle}</span>
        </div>
        <span className="spacer" />
        <div className="cal-viewtoggle">
          <button className={`chip ${view === 'month' ? 'on' : ''}`} onClick={() => setView('month')}>Month</button>
          <button className={`chip ${view === 'week' ? 'on' : ''}`} onClick={() => setView('week')}>Week</button>
          <button className={`chip ${view === 'agenda' ? 'on' : ''}`} onClick={() => setView('agenda')}>Agenda</button>
        </div>
        <button className="wtool" title="Import / Sync" onClick={() => setShowImport(true)}>⇩</button>
      </div>

      {view === 'month' && <MonthView cursor={cursor} byDay={byDay} onDay={openDay} onItem={openItem} dragItem={dragItem} onDrop={reschedule} />}
      {view === 'week' && <WeekView cursor={cursor} byDay={byDay} onDay={openDay} onItem={openItem} dragItem={dragItem} onDrop={reschedule} />}
      {view === 'agenda' && <AgendaView events={events} tasks={tasks} onItem={openItem} onDay={openDay} />}

      <input ref={fileRef} type="file" accept=".ics,text/calendar" hidden onChange={importFile} />

      {editing && (
        <EventEditor
          event={editing}
          onClose={() => setEditing(null)}
          onSave={saveEvent}
          onDelete={deleteEvent}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onFile={() => { setShowImport(false); fileRef.current?.click() }}
          onExport={exportICS}
          onUrlImport={(evts, replaceSource) => {
            setEvents((list) => mergeEvents(replaceSource ? list.filter((e) => e.source !== replaceSource) : list, evts))
          }}
        />
      )}
    </div>
  )
}

function shift(setCursor, view, dir) {
  setCursor((c) => {
    const n = new Date(c)
    if (view === 'week') n.setDate(c.getDate() + dir * 7)
    else n.setMonth(c.getMonth() + dir)
    return n
  })
}

// Merge by UID so re-importing the same calendar updates rather than duplicates.
function mergeEvents(existing, incoming) {
  const byUid = new Map(existing.map((e) => [e.uid, e]))
  for (const e of incoming) byUid.set(e.uid, { ...byUid.get(e.uid), ...e })
  return Array.from(byUid.values())
}

// Shared drag helpers for reschedule-by-dragging.
function dragProps(item, dragItem) {
  return {
    draggable: true,
    onDragStart: (e) => { dragItem.current = item; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', item.title || '') } catch { /* some browsers */ } },
    onDragEnd: () => { dragItem.current = null },
  }
}
function dropProps(day, dragItem, onDrop) {
  return {
    onDragOver: (e) => { if (dragItem.current) { e.preventDefault(); e.currentTarget.classList.add('drop-over') } },
    onDragLeave: (e) => e.currentTarget.classList.remove('drop-over'),
    onDrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('drop-over'); if (dragItem.current) { onDrop(dragItem.current, day) } },
  }
}

/* ---------------- Month view ---------------- */
function MonthView({ cursor, byDay, onDay, onItem, dragItem, onDrop }) {
  const weeks = monthMatrix(cursor.getFullYear(), cursor.getMonth())
  const today = new Date()
  return (
    <div className="cal-month">
      <div className="cal-weekhead">
        {WEEKDAY_SHORT.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="cal-weeks">
        {weeks.map((week, wi) => (
          <div key={wi} className="cal-week">
            {week.map((day) => {
              const key = toDateKey(day)
              const items = byDay[key] || []
              const isCur = day.getMonth() === cursor.getMonth()
              const isToday = isSameDay(day, today)
              return (
                <div
                  key={key}
                  className={`cal-cell ${isCur ? '' : 'dim'} ${isToday ? 'today' : ''}`}
                  onClick={() => onDay(day)}
                  {...dropProps(day, dragItem, onDrop)}
                >
                  <div className="cal-daynum">{day.getDate()}</div>
                  <div className="cal-events">
                    {items.slice(0, 3).map((it) => (
                      <button
                        key={it.id}
                        className={`cal-pill c-${it.color} ${it.kind === 'task' ? 'is-task' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onItem(it) }}
                        title={it.title}
                        {...dragProps(it, dragItem)}
                      >
                        {it.kind === 'task' && '✓ '}
                        {!it.allDay && <span className="pill-time">{fmtTime(it.start)}</span>}
                        {it.title}
                        {it.recurringInstance && <span className="pill-recur" title="Recurring"> ↻</span>}
                      </button>
                    ))}
                    {items.length > 3 && <div className="cal-more">+{items.length - 3} more</div>}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Week view ---------------- */
function WeekView({ cursor, byDay, onDay, onItem, dragItem, onDrop }) {
  const days = weekDays(cursor)
  const today = new Date()
  return (
    <div className="cal-weekview">
      {days.map((day) => {
        const key = toDateKey(day)
        const items = byDay[key] || []
        const isToday = isSameDay(day, today)
        return (
          <div key={key} className={`cal-daycol ${isToday ? 'today' : ''}`} {...dropProps(day, dragItem, onDrop)}>
            <div className="cal-daycol-head" onClick={() => onDay(day)}>
              <span className="dow">{WEEKDAY_SHORT[day.getDay()]}</span>
              <span className="dnum">{day.getDate()}</span>
            </div>
            <div className="cal-daycol-body" onClick={() => onDay(day)}>
              {items.map((it) => (
                <button
                  key={it.id}
                  className={`cal-pill wk c-${it.color} ${it.kind === 'task' ? 'is-task' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onItem(it) }}
                  {...dragProps(it, dragItem)}
                >
                  {it.kind === 'task' ? '✓ ' : !it.allDay ? `${fmtTime(it.start)} · ` : ''}
                  {it.title}
                  {it.recurringInstance && <span className="pill-recur"> ↻</span>}
                </button>
              ))}
              {items.length === 0 && <div className="cal-daycol-empty">+</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Agenda view ---------------- */
function AgendaView({ events, tasks, onItem, onDay }) {
  const now = new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end = new Date(start.getTime() + 60 * 24 * 60 * 60 * 1000) // next 60 days

  const items = useMemo(() => {
    const occ = collectOccurrences(events, start, end).map((e) => ({ ...e, kind: 'event' }))
    const dueTasks = tasks
      .filter((t) => t.due && !t.done)
      .map((t) => ({ id: t.id, title: t.title, kind: 'task', color: 'amber', allDay: true, start: fromDateKey(t.due).toISOString() }))
      .filter((t) => new Date(t.start) >= start && new Date(t.start) <= end)
    return [...occ, ...dueTasks].sort((a, b) => new Date(a.start) - new Date(b.start))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tasks])

  // Group by day key.
  const groups = []
  let lastKey = null
  for (const it of items) {
    const key = toDateKey(new Date(it.start))
    if (key !== lastKey) { groups.push({ key, day: new Date(it.start), items: [] }); lastKey = key }
    groups[groups.length - 1].items.push(it)
  }

  if (groups.length === 0) {
    return <div className="cal-agenda empty"><div className="empty-hint">Nothing scheduled in the next 60 days.</div></div>
  }

  return (
    <div className="cal-agenda">
      {groups.map((g) => {
        const isToday = isSameDay(g.day, now)
        return (
          <div key={g.key} className="agenda-group">
            <div className={`agenda-date ${isToday ? 'today' : ''}`} onClick={() => onDay(g.day)}>
              <span className="agenda-dnum">{g.day.getDate()}</span>
              <span className="agenda-dinfo">
                <span className="agenda-dow">{g.day.toLocaleDateString(undefined, { weekday: 'long' })}</span>
                <span className="agenda-mon faint">{g.day.toLocaleDateString(undefined, { month: 'short', year: g.day.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })}</span>
              </span>
              {isToday && <span className="agenda-todaytag">Today</span>}
            </div>
            <div className="agenda-items">
              {g.items.map((it) => (
                <button key={it.id} className="agenda-item" onClick={() => onItem(it)}>
                  <span className={`agenda-dot c-${it.color} ${it.kind === 'task' ? 'is-task' : ''}`} />
                  <span className="agenda-time">{it.kind === 'task' ? 'Task' : it.allDay ? 'All day' : fmtTime(it.start)}</span>
                  <span className="agenda-title">{it.title}{it.recurringInstance && <span className="pill-recur"> ↻</span>}</span>
                  {it.location && <span className="agenda-loc faint">📍 {it.location}</span>}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Event editor ---------------- */
function EventEditor({ event, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    ...event,
    startLocal: fmtDateTimeLocal(event.start),
    endLocal: event.end ? fmtDateTimeLocal(event.end) : fmtDateTimeLocal(new Date(new Date(event.start).getTime() + 3600000)),
    repeat: event.recurrence?.freq || 'none',
    reminder: typeof event.reminderMinutes === 'number' ? String(event.reminderMinutes) : '',
  })
  const isNew = !event.title
  const isOccurrence = !!event._isOccurrence
  const richRule = event.recurrence && (event.recurrence.byday?.length || event.recurrence.count || event.recurrence.until || event.recurrence.interval > 1)

  function set(patch) { setForm((f) => ({ ...f, ...patch })) }

  function build() {
    const start = new Date(form.startLocal)
    const end = new Date(form.endLocal)
    // Build the recurrence rule. If the frequency is unchanged, keep the
    // original (possibly rich) imported rule; otherwise use a simple one.
    let recurrence = null
    if (form.repeat !== 'none') {
      recurrence = event.recurrence && event.recurrence.freq === form.repeat
        ? event.recurrence
        : { freq: form.repeat, interval: 1 }
    }
    return {
      id: form.id, uid: form.uid, title: form.title.trim(),
      description: form.description, location: form.location,
      start: start.toISOString(),
      end: (end > start ? end : new Date(start.getTime() + 3600000)).toISOString(),
      allDay: form.allDay, color: form.color, source: form.source || 'local',
      recurrence, exdates: form.exdates || [],
      reminderMinutes: form.allDay || form.reminder === '' ? null : Number(form.reminder),
      _isOccurrence: event._isOccurrence, _master: event._master, _originalStart: event._originalStart,
    }
  }

  function submit(e, scope = 'all') {
    e?.preventDefault?.()
    if (!form.title.trim()) return
    onSave(build(), scope)
  }
  const delRef = { id: form.id, _isOccurrence: event._isOccurrence, _master: event._master, _originalStart: event._originalStart }

  return (
    <Modal
      title={isNew ? 'New event' : isOccurrence ? 'Edit occurrence' : 'Edit event'}
      onClose={onClose}
      footer={
        isOccurrence ? (
          <>
            <button className="btn danger ghost sm" onClick={() => onDelete(delRef, 'this')}>Delete this</button>
            <button className="btn danger ghost sm" onClick={() => onDelete(delRef, 'all')}>Delete all</button>
            <span style={{ flex: 1 }} />
            <button className="btn sm" onClick={(e) => submit(e, 'this')}>Save this event</button>
            <button className="btn primary sm" onClick={(e) => submit(e, 'all')}>Save all</button>
          </>
        ) : (
          <>
            {!isNew && <button className="btn danger ghost" onClick={() => onDelete(delRef, 'all')}>Delete</button>}
            <span style={{ flex: 1 }} />
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={(e) => submit(e, 'all')}>Save</button>
          </>
        )
      }
    >
      <form onSubmit={submit}>
        {isOccurrence && (
          <div className="occ-note">↻ One occurrence of a repeating event. “Save this event” changes only this date; “Save all” changes the series.</div>
        )}
        <div className="field">
          <label>Title</label>
          <input className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} autoFocus placeholder="Event title" />
        </div>
        <div className="field">
          <label className="chip-inline">
            <input type="checkbox" checked={form.allDay} onChange={(e) => set({ allDay: e.target.checked })} /> All day
          </label>
        </div>
        <div className="row">
          <div className="field">
            <label>Start</label>
            <input className="input" type="datetime-local" value={form.startLocal} onChange={(e) => set({ startLocal: e.target.value })} />
          </div>
          <div className="field">
            <label>End</label>
            <input className="input" type="datetime-local" value={form.endLocal} onChange={(e) => set({ endLocal: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>Location</label>
          <input className="input" value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="Optional" />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea className="input" value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Optional" />
        </div>
        {!form.allDay && (
          <div className="field">
            <label>Remind me</label>
            <select className="select" value={form.reminder} onChange={(e) => set({ reminder: e.target.value })}>
              {REMINDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label>Repeat</label>
          <select className="select" value={form.repeat} onChange={(e) => set({ repeat: e.target.value })} disabled={richRule}>
            {SIMPLE_FREQS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          {richRule && (
            <span className="faint" style={{ fontSize: 12 }}>
              {describeRecurrence(event.recurrence)} (imported rule kept as-is)
            </span>
          )}
          {!isNew && !isOccurrence && form.repeat !== 'none' && (
            <span className="faint" style={{ fontSize: 12 }}>Editing or deleting affects the whole series.</span>
          )}
        </div>
        <div className="field">
          <label>Color</label>
          <div className="swatches">
            {EVENT_COLORS.map((c) => (
              <button
                type="button" key={c}
                className={`swatch ${form.color === c ? 'on' : ''}`}
                style={{ background: ACCENTS[c] }}
                onClick={() => set({ color: c })}
                aria-label={c}
              />
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}

/* ---------------- Import / Sync modal ---------------- */
function ImportModal({ onClose, onFile, onExport, onUrlImport }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState(null)

  async function syncUrl() {
    if (!url.trim()) return
    setStatus('loading')
    try {
      // Google Calendar "secret iCal address" and any public .ics URL work here,
      // provided the host allows cross-origin requests.
      const res = await fetch(url.trim())
      const text = await res.text()
      const parsed = parseICS(text).map((e) => ({ ...e, source: 'url:' + url.trim() }))
      if (parsed.length === 0) throw new Error('no events')
      onUrlImport(parsed, 'url:' + url.trim())
      setStatus(`ok:${parsed.length}`)
    } catch {
      setStatus('error')
    }
  }

  return (
    <Modal title="Import & Sync" onClose={onClose}>
      <div className="import-section">
        <h3>Upload .ics file</h3>
        <p className="faint">Import events from an exported Google, Apple or Outlook calendar file.</p>
        <button className="btn" onClick={onFile}>📄 Choose .ics file…</button>
      </div>

      <div className="import-section">
        <h3>Sync from URL (Google Calendar)</h3>
        <p className="faint">
          In Google Calendar → Settings → your calendar → “Secret address in iCal format”,
          copy the URL ending in <code>.ics</code> and paste it here. Re-syncing updates events in place.
        </p>
        <div className="row">
          <input className="input" placeholder="https://calendar.google.com/…/basic.ics" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn primary" style={{ flex: '0 0 auto' }} onClick={syncUrl} disabled={status === 'loading'}>
            {status === 'loading' ? 'Syncing…' : 'Sync'}
          </button>
        </div>
        {typeof status === 'string' && status.startsWith('ok') && <p className="ok-msg">✓ Imported {status.split(':')[1]} events.</p>}
        {status === 'error' && <p className="err-msg">Couldn’t fetch. The calendar host may block cross-origin requests — try exporting the .ics file instead.</p>}
      </div>

      <div className="import-section">
        <h3>Export</h3>
        <p className="faint">Download all your HomeDash events as an .ics file.</p>
        <button className="btn" onClick={onExport}>⇧ Export .ics</button>
      </div>
    </Modal>
  )
}
