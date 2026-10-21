import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtTime } from '../../lib/date.js'
import { searchCalendar } from './helpers.js'

// Search box + results popover. Picking a result jumps the calendar to it.
export default function CalendarSearch({ events, tasks, calendars, onPick, onClose }) {
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const ref = useRef(null)
  const results = useMemo(() => searchCalendar({ events, tasks, calendars, query }), [events, tasks, calendars, query])

  useEffect(() => { setSel(0) }, [query])
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [onClose])

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); onPick(results[sel]) }
  }

  const now = new Date()
  const when = (r) => {
    const d = new Date(r.start)
    const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
    return r.allDay ? date : `${date} · ${fmtTime(d)}`
  }

  return (
    <div className="cal-pop cal-search" ref={ref}>
      <input className="input" placeholder="Search events and tasks…" autoFocus value={query}
        onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} aria-label="Search calendar" />
      {query.trim() && (
        <div className="cal-search-results">
          {results.length === 0 && <div className="empty-hint">No matches in the past or next year.</div>}
          {results.map((r, i) => {
            const past = new Date(r.end || r.start) < now
            return (
              <button key={`${r.kind}-${r.id}`} className={`cal-search-row ${i === sel ? 'sel' : ''} ${past ? 'past' : ''}`}
                onMouseEnter={() => setSel(i)} onClick={() => onPick(r)}>
                <span className={`agenda-dot c-${r.color} ${r.kind === 'task' ? 'is-task' : ''}`} />
                <span className="cal-search-title">{r.title}{r.recurringInstance && <span className="pill-recur"> ↻</span>}</span>
                <span className="cal-search-when faint">{when(r)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
