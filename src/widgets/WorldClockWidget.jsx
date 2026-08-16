import { useEffect, useState } from 'react'
import { useWidgetState, uid } from '../lib/storage.js'

const PRESETS = [
  ['San Francisco', 'America/Los_Angeles'],
  ['New York', 'America/New_York'],
  ['London', 'Europe/London'],
  ['Paris', 'Europe/Paris'],
  ['Dubai', 'Asia/Dubai'],
  ['Mumbai', 'Asia/Kolkata'],
  ['Singapore', 'Asia/Singapore'],
  ['Tokyo', 'Asia/Tokyo'],
  ['Sydney', 'Australia/Sydney'],
  ['Auckland', 'Pacific/Auckland'],
  ['São Paulo', 'America/Sao_Paulo'],
  ['UTC', 'UTC'],
]

const DEFAULTS = [
  { id: uid('z'), label: 'London', tz: 'Europe/London' },
  { id: uid('z'), label: 'New York', tz: 'America/New_York' },
  { id: uid('z'), label: 'Tokyo', tz: 'Asia/Tokyo' },
]

function partsFor(tz, now) {
  try {
    const time = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(now)
    const day = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', day: 'numeric' }).format(now)
    // Rough day/night flag from the hour in that zone.
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now))
    return { time, day, night: hour < 6 || hour >= 19 }
  } catch {
    return { time: '—', day: '', night: false }
  }
}

export default function WorldClockWidget({ widget }) {
  const [zones, setZones] = useWidgetState(widget.id, DEFAULTS)
  const [now, setNow] = useState(new Date())
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  function add(tz, label) {
    setZones((z) => [...z, { id: uid('z'), label, tz }])
    setAdding(false)
  }
  function remove(id) {
    setZones((z) => z.filter((x) => x.id !== id))
  }

  return (
    <div className="wc no-drag">
      {zones.map((z) => {
        const p = partsFor(z.tz, now)
        return (
          <div key={z.id} className="wc-row">
            <span className="wc-icon">{p.night ? '🌙' : '☀️'}</span>
            <div className="wc-place">
              <div className="wc-label">{z.label}</div>
              <div className="wc-day faint">{p.day}</div>
            </div>
            <div className="wc-time">{p.time}</div>
            <button className="wc-del" onClick={() => remove(z.id)} aria-label="Remove">✕</button>
          </div>
        )
      })}

      {adding ? (
        <select
          className="select sm"
          autoFocus
          defaultValue=""
          onChange={(e) => {
            const preset = PRESETS.find((p) => p[1] === e.target.value)
            if (preset) add(preset[1], preset[0])
          }}
          onBlur={() => setAdding(false)}
        >
          <option value="" disabled>Choose a city…</option>
          {PRESETS.map(([label, tz]) => (
            <option key={tz} value={tz}>{label}</option>
          ))}
        </select>
      ) : (
        <button className="btn sm ghost wc-add" onClick={() => setAdding(true)}>＋ Add city</button>
      )}
    </div>
  )
}
