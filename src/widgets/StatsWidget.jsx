import { useMemo } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { toDateKey, isSameDay, DAY_MS } from '../lib/date.js'

export default function StatsWidget() {
  const { tasks, habits, events, pomoStats } = useDashboard()

  const stats = useMemo(() => {
    const todayKey = toDateKey(new Date())
    const now = new Date()

    const doneToday = tasks.filter((t) => t.done && t.doneAt && isSameDay(t.doneAt, now)).length
    const openTasks = tasks.filter((t) => !t.done).length

    const habitsToday = habits.filter((h) => h.log?.[todayKey]).length

    const upcoming = events.filter((e) => {
      if (!e.start) return false
      const s = new Date(e.start)
      return s >= now && s < new Date(now.getTime() + 7 * DAY_MS)
    }).length

    const focusToday = pomoStats?.byDay?.[todayKey] || 0

    // 7-day focus sparkline
    const spark = []
    for (let i = 6; i >= 0; i--) {
      const k = toDateKey(new Date(Date.now() - i * DAY_MS))
      spark.push(pomoStats?.byDay?.[k] || 0)
    }

    return { doneToday, openTasks, habitsToday, habitTotal: habits.length, upcoming, focusToday, spark }
  }, [tasks, habits, events, pomoStats])

  const maxSpark = Math.max(1, ...stats.spark)

  return (
    <div className="stats">
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-val">{stats.doneToday}</div>
          <div className="stat-lbl">Done today</div>
        </div>
        <div className="stat-tile">
          <div className="stat-val">{stats.openTasks}</div>
          <div className="stat-lbl">Open tasks</div>
        </div>
        <div className="stat-tile">
          <div className="stat-val">{stats.habitsToday}<span className="faint">/{stats.habitTotal}</span></div>
          <div className="stat-lbl">Habits</div>
        </div>
        <div className="stat-tile">
          <div className="stat-val">{stats.upcoming}</div>
          <div className="stat-lbl">Events / 7d</div>
        </div>
      </div>
      <div className="stat-focus">
        <div className="stat-focus-head">
          <span className="faint">Focus this week</span>
          <span className="stat-focus-today">{stats.focusToday}m today</span>
        </div>
        <div className="sparkline">
          {stats.spark.map((v, i) => (
            <div key={i} className="spark-bar" style={{ height: `${Math.max(6, (v / maxSpark) * 100)}%` }} title={`${v} min`} />
          ))}
        </div>
      </div>
    </div>
  )
}
