import { useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { uid } from '../lib/storage.js'
import { toDateKey, DAY_MS, WEEKDAY_SHORT } from '../lib/date.js'

function last7() {
  const days = []
  for (let i = 6; i >= 0; i--) {
    days.push(new Date(Date.now() - i * DAY_MS))
  }
  return days
}

function streak(log) {
  let s = 0
  let cursor = new Date()
  // Allow today to be incomplete without breaking a prior streak.
  if (!log[toDateKey(cursor)]) cursor = new Date(Date.now() - DAY_MS)
  while (log[toDateKey(cursor)]) {
    s++
    cursor = new Date(cursor.getTime() - DAY_MS)
  }
  return s
}

export default function HabitsWidget() {
  const { habits, setHabits } = useDashboard()
  const [name, setName] = useState('')
  const days = last7()

  function add(e) {
    e.preventDefault()
    if (!name.trim()) return
    setHabits((h) => [...h, { id: uid('h'), name: name.trim(), log: {} }])
    setName('')
  }

  function toggle(id, dateKey) {
    setHabits((hs) =>
      hs.map((h) => {
        if (h.id !== id) return h
        const log = { ...h.log }
        if (log[dateKey]) delete log[dateKey]
        else log[dateKey] = true
        return { ...h, log }
      }),
    )
  }

  function remove(id) {
    setHabits((hs) => hs.filter((h) => h.id !== id))
  }

  return (
    <div className="habits no-drag">
      <div className="habit-daylabels">
        <span className="habit-name-col" />
        {days.map((d) => (
          <span key={d.toISOString()} className="habit-daylabel">
            {WEEKDAY_SHORT[d.getDay()][0]}
          </span>
        ))}
        <span className="habit-streak-col" />
      </div>

      {habits.length === 0 && <div className="empty-hint">No habits yet. Add one below 👇</div>}

      {habits.map((h) => (
        <div key={h.id} className="habit-row">
          <span className="habit-name" title={h.name} onClick={() => remove(h.id)}>{h.name}</span>
          {days.map((d) => {
            const key = toDateKey(d)
            const done = !!h.log[key]
            const isToday = key === toDateKey(new Date())
            return (
              <button
                key={key}
                className={`habit-cell ${done ? 'done' : ''} ${isToday ? 'today' : ''}`}
                onClick={() => toggle(h.id, key)}
                aria-label={`${h.name} ${key}`}
              >
                {done ? '✓' : ''}
              </button>
            )
          })}
          <span className="habit-streak" title="Current streak">🔥 {streak(h.log)}</span>
        </div>
      ))}

      <form className="habit-add" onSubmit={add}>
        <input className="input" placeholder="New habit… e.g. Read 20 min" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn sm primary" type="submit">Add</button>
      </form>
    </div>
  )
}
