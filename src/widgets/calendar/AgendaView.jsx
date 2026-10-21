import { useMemo } from 'react'
import { collectOccurrences } from '../../lib/recurrence.js'
import { isSameDay, toDateKey, fromDateKey, fmtTime } from '../../lib/date.js'
import { eventColor, isVisible } from './helpers.js'

export default function AgendaView({ events, tasks, calendars, onItem, onDay }) {
  const now = new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end = new Date(start.getTime() + 60 * 24 * 60 * 60 * 1000) // next 60 days

  const items = useMemo(() => {
    const occ = collectOccurrences(events.filter((e) => isVisible(e, calendars)), start, end)
      .map((e) => ({ ...e, kind: 'event', color: eventColor(e, calendars) }))
    const dueTasks = tasks
      .filter((t) => t.due && !t.done)
      .map((t) => ({ id: t.id, title: t.title, kind: 'task', color: 'amber', allDay: true, start: fromDateKey(t.due).toISOString() }))
      .filter((t) => new Date(t.start) >= start && new Date(t.start) <= end)
    return [...occ, ...dueTasks].sort((a, b) => new Date(a.start) - new Date(b.start))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tasks, calendars])

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
