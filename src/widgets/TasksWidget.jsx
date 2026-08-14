import { useMemo, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { uid } from '../lib/storage.js'
import { fromDateKey, isSameDay } from '../lib/date.js'

const PRIORITY = { high: { label: 'High', rank: 0 }, med: { label: 'Med', rank: 1 }, low: { label: 'Low', rank: 2 } }

function dueLabel(due) {
  if (!due) return null
  const d = fromDateKey(due)
  const today = new Date()
  const tomorrow = new Date(Date.now() + 86400000)
  if (isSameDay(d, today)) return { text: 'Today', tone: 'today' }
  if (isSameDay(d, tomorrow)) return { text: 'Tomorrow', tone: '' }
  if (d < today) return { text: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), tone: 'overdue' }
  return { text: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), tone: '' }
}

export default function TasksWidget() {
  const { tasks, setTasks } = useDashboard()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState('med')
  const [filter, setFilter] = useState('active')

  function add(e) {
    e.preventDefault()
    if (!title.trim()) return
    setTasks((t) => [
      ...t,
      { id: uid('t'), title: title.trim(), done: false, due: due || null, priority, createdAt: Date.now() },
    ])
    setTitle('')
    setDue('')
    setPriority('med')
  }

  function toggle(id) {
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, done: !x.done, doneAt: !x.done ? Date.now() : null } : x)))
  }
  function remove(id) {
    setTasks((t) => t.filter((x) => x.id !== id))
  }

  const shown = useMemo(() => {
    let list = tasks
    if (filter === 'active') list = list.filter((t) => !t.done)
    if (filter === 'done') list = list.filter((t) => t.done)
    return [...list].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      const ad = a.due ? fromDateKey(a.due).getTime() : Infinity
      const bd = b.due ? fromDateKey(b.due).getTime() : Infinity
      if (ad !== bd) return ad - bd
      return (PRIORITY[a.priority]?.rank ?? 1) - (PRIORITY[b.priority]?.rank ?? 1)
    })
  }, [tasks, filter])

  const remaining = tasks.filter((t) => !t.done).length

  return (
    <div className="tasks no-drag">
      <form className="task-add" onSubmit={add}>
        <input className="input" placeholder="Add a task…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="task-add-meta">
          <input className="input sm" type="date" value={due} onChange={(e) => setDue(e.target.value)} title="Due date" />
          <select className="select sm" value={priority} onChange={(e) => setPriority(e.target.value)} title="Priority">
            <option value="high">High</option>
            <option value="med">Med</option>
            <option value="low">Low</option>
          </select>
          <button className="btn sm primary" type="submit">Add</button>
        </div>
      </form>

      <div className="task-filters">
        {['active', 'all', 'done'].map((f) => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="spacer" />
        <span className="faint">{remaining} left</span>
      </div>

      <div className="task-list">
        {shown.length === 0 && <div className="empty-hint">Nothing here. Enjoy the calm ☕</div>}
        {shown.map((t) => {
          const dl = dueLabel(t.due)
          return (
            <div key={t.id} className={`task ${t.done ? 'done' : ''}`}>
              <button className={`task-check p-${t.priority}`} onClick={() => toggle(t.id)} aria-label="Toggle done">
                {t.done ? '✓' : ''}
              </button>
              <span className="task-title">{t.title}</span>
              {dl && <span className={`task-due ${dl.tone}`}>{dl.text}</span>}
              <button className="task-del" onClick={() => remove(t.id)} aria-label="Delete">✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
