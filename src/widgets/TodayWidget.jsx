import { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { collectOccurrences } from '../lib/recurrence.js'
import { fromDateKey, toDateKey, fmtTime, isSameDay } from '../lib/date.js'

// A "hero" summary of the day: the next thing on the calendar, the tasks that
// matter, and which habits still need doing. Pulls live from the shared stores.
export default function TodayWidget() {
  const { events, tasks, habits, userName } = useDashboard()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999)

  const todaysEvents = useMemo(
    () => collectOccurrences(events, dayStart, dayEnd),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, toDateKey(now)],
  )
  const upcomingEvents = todaysEvents.filter((e) => e.allDay || new Date(e.end || e.start) >= now)
  const nextEvent = upcomingEvents.find((e) => !e.allDay)
  const allDay = todaysEvents.filter((e) => e.allDay)

  const topTasks = useMemo(() => {
    return tasks
      .filter((t) => !t.done)
      .sort((a, b) => {
        const ad = a.due ? fromDateKey(a.due).getTime() : Infinity
        const bd = b.due ? fromDateKey(b.due).getTime() : Infinity
        return ad - bd
      })
      .slice(0, 4)
  }, [tasks])

  const todayKey = toDateKey(now)
  const habitsDue = habits.filter((h) => !h.log?.[todayKey])

  const hour = now.getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="today-w">
      <div className="today-hero">
        <div className="today-greet">{greet}{userName ? `, ${userName}` : ''}</div>
        <div className="today-date">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      </div>

      <div className="today-block">
        <div className="today-label">Next up</div>
        {nextEvent ? (
          <div className="today-next">
            <span className={`today-dot c-${nextEvent.color}`} />
            <span className="today-next-title">{nextEvent.title}</span>
            <span className="today-next-time">{fmtTime(nextEvent.start)}</span>
          </div>
        ) : (
          <div className="today-empty">No more events today 🎉</div>
        )}
        {allDay.map((e) => (
          <div key={e.id} className="today-next allday">
            <span className={`today-dot c-${e.color}`} />
            <span className="today-next-title">{e.title}</span>
            <span className="today-next-time">All day</span>
          </div>
        ))}
      </div>

      <div className="today-block">
        <div className="today-label">Top tasks {topTasks.length > 0 && <span className="faint">({tasks.filter((t) => !t.done).length} open)</span>}</div>
        {topTasks.length === 0 && <div className="today-empty">Inbox zero ✨</div>}
        {topTasks.map((t) => (
          <div key={t.id} className="today-task">
            <span className={`today-pri p-${t.priority}`} />
            <span className="today-task-title">{t.title}</span>
            {t.due && <span className={`today-due ${isOverdue(t.due) ? 'over' : ''}`}>{dueShort(t.due)}</span>}
          </div>
        ))}
      </div>

      {habits.length > 0 && (
        <div className="today-block">
          <div className="today-label">Habits</div>
          {habitsDue.length === 0 ? (
            <div className="today-empty">All done for today 🔥</div>
          ) : (
            <div className="today-habits">
              {habitsDue.map((h) => (
                <span key={h.id} className="today-habit-chip">{h.name}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function isOverdue(due) {
  return fromDateKey(due) < new Date(new Date().setHours(0, 0, 0, 0))
}
function dueShort(due) {
  const d = fromDateKey(due)
  const today = new Date()
  if (isSameDay(d, today)) return 'Today'
  if (isSameDay(d, new Date(Date.now() + 86400000))) return 'Tmrw'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
