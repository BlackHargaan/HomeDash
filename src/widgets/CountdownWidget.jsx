import { useEffect, useState } from 'react'
import { useWidgetState } from '../lib/storage.js'
import { useDashboard } from '../context/DashboardContext.jsx'

const DAY = 86400000

export default function CountdownWidget({ widget }) {
  const { updateWidget } = useDashboard()
  const [cfg, setCfg] = useWidgetState(widget.id, { title: '', target: '', emoji: '🎯' })
  const [draft, setDraft] = useState(cfg)
  const [now, setNow] = useState(Date.now())
  const editing = !cfg.target

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  function save(e) {
    e.preventDefault()
    if (!draft.target) return
    setCfg(draft)
    if (draft.title) updateWidget(widget.id, { title: draft.title })
  }

  if (editing) {
    return (
      <form className="cd-setup no-drag" onSubmit={save}>
        <div className="field">
          <label>What are you counting to?</label>
          <input className="input" placeholder="e.g. Vacation 🏖️" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
        </div>
        <div className="row">
          <div className="field" style={{ flex: 3 }}>
            <label>Date</label>
            <input className="input" type="date" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Emoji</label>
            <input className="input" value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} />
          </div>
        </div>
        <button className="btn primary sm" type="submit">Start countdown</button>
      </form>
    )
  }

  const target = new Date(cfg.target + 'T00:00:00').getTime()
  const diff = target - now
  const past = diff < 0
  const abs = Math.abs(diff)
  const days = Math.floor(abs / DAY)
  const hours = Math.floor((abs % DAY) / 3600000)
  const mins = Math.floor((abs % 3600000) / 60000)
  const secs = Math.floor((abs % 60000) / 1000)

  return (
    <div className="cd no-drag">
      <div className="cd-emoji">{cfg.emoji || '🎯'}</div>
      <div className="cd-num">{days}</div>
      <div className="cd-unit">day{days === 1 ? '' : 's'} {past ? 'ago' : 'to go'}</div>
      <div className="cd-sub faint">{String(hours).padStart(2, '0')}:{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</div>
      <div className="cd-title">{cfg.title || new Date(target).toLocaleDateString()}</div>
      <button className="cd-edit wtool" title="Edit" onClick={() => setCfg({ ...cfg, target: '' })}>✎</button>
    </div>
  )
}
