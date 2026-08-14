import { useEffect, useRef, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { useWidgetState } from '../lib/storage.js'
import { toDateKey } from '../lib/date.js'

const MODES = {
  focus: { label: 'Focus', min: 25 },
  short: { label: 'Short break', min: 5 },
  long: { label: 'Long break', min: 15 },
}

export default function PomodoroWidget({ widget }) {
  const { setPomoStats } = useDashboard()
  const [cfg, setCfg] = useWidgetState(widget.id, { focus: 25, short: 5, long: 15 })
  const [mode, setMode] = useState('focus')
  const [remaining, setRemaining] = useState(cfg.focus * 60)
  const [running, setRunning] = useState(false)
  const [completed, setCompleted] = useState(0)
  const tick = useRef(null)

  const total = (mode === 'focus' ? cfg.focus : mode === 'short' ? cfg.short : cfg.long) * 60

  useEffect(() => {
    setRemaining(total)
    setRunning(false)
  }, [total])

  useEffect(() => {
    if (!running) return
    tick.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(tick.current)
          onComplete()
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(tick.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  function onComplete() {
    setRunning(false)
    try { new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=').play() } catch { /* no-op */ }
    if (mode === 'focus') {
      const next = completed + 1
      setCompleted(next)
      // Record focus session in shared stats.
      setPomoStats((s) => {
        const key = toDateKey(new Date())
        return {
          sessions: (s.sessions || 0) + 1,
          focusMinutes: (s.focusMinutes || 0) + cfg.focus,
          byDay: { ...s.byDay, [key]: (s.byDay?.[key] || 0) + cfg.focus },
        }
      })
      setMode(next % 4 === 0 ? 'long' : 'short')
    } else {
      setMode('focus')
    }
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  const pct = total ? ((total - remaining) / total) * 100 : 0
  const R = 52
  const circ = 2 * Math.PI * R

  return (
    <div className="pomo">
      <div className="pomo-modes no-drag">
        {Object.entries(MODES).map(([k, m]) => (
          <button key={k} className={`chip ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="pomo-ring">
        <svg viewBox="0 0 120 120" width="128" height="128">
          <circle cx="60" cy="60" r={R} className="ring-bg" />
          <circle
            cx="60" cy="60" r={R} className="ring-fg"
            strokeDasharray={circ}
            strokeDashoffset={circ - (pct / 100) * circ}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="pomo-time">
          <div className="pomo-clock">{mm}:{ss}</div>
          <div className="faint">{MODES[mode].label}</div>
        </div>
      </div>

      <div className="pomo-controls no-drag">
        <button className="btn primary" onClick={() => setRunning((r) => !r)}>
          {running ? '⏸ Pause' : '▶ Start'}
        </button>
        <button className="btn ghost" onClick={() => { setRemaining(total); setRunning(false) }}>↺ Reset</button>
      </div>
      <div className="pomo-count faint">🍅 {completed} session{completed === 1 ? '' : 's'} this visit</div>
    </div>
  )
}
