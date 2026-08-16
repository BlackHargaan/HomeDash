import { useMemo, useRef, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { uid } from '../lib/storage.js'
import { parseICS, eventsToICS } from '../lib/ics.js'
import { expandInRange, describeRecurrence, SIMPLE_FREQS } from '../lib/recurrence.js'
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
  }
}

export default function CalendarWidget() {
  const { events, setEvents, tasks } = useDashboard()
  const [cursor, setCursor] = useState(new Date())
  const [view, setView] = useState('month')
  const [editing, setEditing] = useState(null) // event object or null
  const [showImport, setShowImport] = useState(false)
  const fileRef = useRef(null)

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

  function saveEvent(ev) {
    setEvents((list) => {
      const exists = list.some((e) => e.id === ev.id)
      return exists ? list.map((e) => (e.id === ev.id ? ev : e)) : [...list, ev]
    })
    setEditing(null)
  }
  function deleteEvent(id) {
    setEvents((list) => list.filter((e) => e.id !== id))
    setEditing(null)
  }

  function openDay(day) {
    setEditing(blankEvent(day))
  }
  function openItem(item) {
    if (item.kind === 'task') return // tasks are edited in the Tasks widget
    // A recurring occurrence points back to its series master via seriesId.
    const masterId = item.seriesId || item.id
    setEditing(events.find((e) => e.id === masterId) || item)
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
          <button className="wtool" onClick={() => shift(setCursor, view, 1)} aria-label="Next">›</button>
          <span className="cal-title">{monthTitle}</span>
        </div>
        <span className="spacer" />
        <div className="cal-viewtoggle">
          <button className={`chip ${view === 'month' ? 'on' : ''}`} onClick={() => setView('month')}>Month</button>
          <button className={`chip ${view === 'week' ? 'on' : ''}`} onClick={() => setView('week')}>Week</button>
        </div>
        <button className="wtool" title="Import / Sync" onClick={() => setShowImport(true)}>⇩</button>
      </div>

      {view === 'month'
        ? <MonthView cursor={cursor} byDay={byDay} onDay={openDay} onItem={openItem} />
        : <WeekView cursor={cursor} byDay={byDay} onDay={openDay} onItem={openItem} />}

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

/* ---------------- Month view ---------------- */
function MonthView({ cursor, byDay, onDay, onItem }) {
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
                >
                  <div className="cal-daynum">{day.getDate()}</div>
                  <div className="cal-events">
                    {items.slice(0, 3).map((it) => (
                      <button
                        key={it.id}
                        className={`cal-pill c-${it.color} ${it.kind === 'task' ? 'is-task' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onItem(it) }}
                        title={it.title}
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
function WeekView({ cursor, byDay, onDay, onItem }) {
  const days = weekDays(cursor)
  const today = new Date()
  return (
    <div className="cal-weekview">
      {days.map((day) => {
        const key = toDateKey(day)
        const items = byDay[key] || []
        const isToday = isSameDay(day, today)
        return (
          <div key={key} className={`cal-daycol ${isToday ? 'today' : ''}`}>
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
                >
                  {it.kind === 'task' ? '✓ ' : !it.allDay ? `${fmtTime(it.start)} · ` : ''}
                  {it.title}
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

/* ---------------- Event editor ---------------- */
function EventEditor({ event, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    ...event,
    startLocal: fmtDateTimeLocal(event.start),
    endLocal: event.end ? fmtDateTimeLocal(event.end) : fmtDateTimeLocal(new Date(new Date(event.start).getTime() + 3600000)),
    repeat: event.recurrence?.freq || 'none',
  })
  const isNew = !event.title
  const richRule = event.recurrence && (event.recurrence.byday?.length || event.recurrence.count || event.recurrence.until || event.recurrence.interval > 1)

  function set(patch) { setForm((f) => ({ ...f, ...patch })) }

  function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
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
    onSave({
      id: form.id, uid: form.uid, title: form.title.trim(),
      description: form.description, location: form.location,
      start: start.toISOString(),
      end: (end > start ? end : new Date(start.getTime() + 3600000)).toISOString(),
      allDay: form.allDay, color: form.color, source: form.source || 'local',
      recurrence, exdates: form.exdates || [],
    })
  }

  return (
    <Modal
      title={isNew ? 'New event' : 'Edit event'}
      onClose={onClose}
      footer={
        <>
          {!isNew && <button className="btn danger ghost" onClick={() => onDelete(form.id)}>Delete</button>}
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Save</button>
        </>
      }
    >
      <form onSubmit={submit}>
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
          {!isNew && form.repeat !== 'none' && (
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
