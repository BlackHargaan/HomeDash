import { useState } from 'react'
import Modal from '../../components/Modal.jsx'
import { describeRecurrence, SIMPLE_FREQS } from '../../lib/recurrence.js'
import { fmtDateTimeLocal } from '../../lib/date.js'
import { EVENT_COLORS, ACCENTS } from '../registry.js'
import { calendarOf } from './helpers.js'

const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '0', label: 'At start time' },
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
]

export default function EventEditor({ event, calendars, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    ...event,
    startLocal: fmtDateTimeLocal(event.start),
    endLocal: event.end ? fmtDateTimeLocal(event.end) : fmtDateTimeLocal(new Date(new Date(event.start).getTime() + 3600000)),
    repeat: event.recurrence?.freq || 'none',
    reminder: typeof event.reminderMinutes === 'number' ? String(event.reminderMinutes) : '',
    calendarId: calendarOf(event, calendars).id,
    color: event.color && event.color !== 'calendar' ? event.color : null,
  })
  const calendarColor = (calendars.find((c) => c.id === form.calendarId) || calendars[0])?.color || 'indigo'
  // Feed calendars are re-written on every refresh, so don't offer them as a target.
  const targets = calendars.filter((c) => !c.url || c.id === form.calendarId)
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
      allDay: form.allDay, color: form.color, calendarId: form.calendarId, source: form.source || 'local',
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
        <div className="row">
          <div className="field">
            <label>Calendar</label>
            <select className="select" value={form.calendarId} onChange={(e) => set({ calendarId: e.target.value })} disabled={isOccurrence}>
              {targets.map((c) => <option key={c.id} value={c.id}>{c.name}{c.url ? ' (feed)' : ''}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Color</label>
          <div className="swatches">
            <button
              type="button"
              className={`swatch swatch-cal ${form.color === null ? 'on' : ''}`}
              style={{ background: ACCENTS[calendarColor] }}
              onClick={() => set({ color: null })}
              title="Use the calendar's color"
              aria-label="Calendar color"
            >⦿</button>
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
