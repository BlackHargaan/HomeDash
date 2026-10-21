import { useEffect, useRef, useState } from 'react'
import { ACCENTS, EVENT_COLORS } from '../registry.js'
import { newCalendar } from './helpers.js'

function ago(iso) {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}

// Popover listing calendars: show/hide, recolor, rename, delete, add, and
// refresh subscribed feeds.
export default function CalendarsMenu({ calendars, setCalendars, counts, onRefresh, onDelete, onClose }) {
  const ref = useRef(null)
  const [colorFor, setColorFor] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  const patch = (id, p) => setCalendars((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)))

  function add(e) {
    e.preventDefault()
    if (!name.trim()) return
    setCalendars((cs) => [...cs, newCalendar(name.trim(), cs)])
    setName('')
  }

  async function refresh(c) {
    setBusy(c.id)
    try { await onRefresh(c) } finally { setBusy(null) }
  }

  return (
    <div className="cal-pop cal-menu" ref={ref} role="dialog" aria-label="Calendars">
      <div className="cal-pop-head">
        <b>Calendars</b>
        <span className="spacer" />
        <button className="chip" onClick={() => setCalendars((cs) => cs.map((c) => ({ ...c, visible: true })))}>Show all</button>
      </div>
      <div className="cal-menu-list">
        {calendars.map((c) => (
          <div key={c.id} className="cal-menu-row">
            <div className="cal-menu-main">
              <input type="checkbox" checked={c.visible !== false} onChange={(e) => patch(c.id, { visible: e.target.checked })}
                aria-label={`Show ${c.name}`} style={{ accentColor: ACCENTS[c.color] }} />
              <button className="cal-dot" style={{ background: ACCENTS[c.color] }} title="Change color"
                onClick={() => setColorFor(colorFor === c.id ? null : c.id)} aria-label={`Color of ${c.name}`} />
              <span className="cal-menu-name" title="Double-click to rename"
                onDoubleClick={() => { const n = prompt('Rename calendar:', c.name); if (n && n.trim()) patch(c.id, { name: n.trim() }) }}>
                {c.name}
              </span>
              <span className="faint cal-menu-count">{counts[c.id] || 0}</span>
              {c.url && (
                <button className="wtool" title={`Refresh feed (last synced ${ago(c.lastSync)})`} onClick={() => refresh(c)} disabled={busy === c.id}>
                  {busy === c.id ? '…' : '↻'}
                </button>
              )}
              {calendars.length > 1 && (
                <button className="wtool del" title="Delete calendar" onClick={() => onDelete(c)}>✕</button>
              )}
            </div>
            {c.url && (
              <div className={`cal-menu-feed ${c.syncError ? 'err-msg' : 'faint'}`}>
                {c.syncError ? `Sync failed: ${c.syncError}` : `Feed · synced ${ago(c.lastSync)} · refreshes every 30 min`}
              </div>
            )}
            {colorFor === c.id && (
              <div className="swatches cal-menu-swatches">
                {EVENT_COLORS.map((col) => (
                  <button key={col} className={`swatch ${c.color === col ? 'on' : ''}`} style={{ background: ACCENTS[col] }}
                    onClick={() => { patch(c.id, { color: col }); setColorFor(null) }} aria-label={col} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <form className="cal-menu-add" onSubmit={add}>
        <input className="input" placeholder="New calendar (e.g. Work)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn sm primary" type="submit" disabled={!name.trim()}>Add</button>
      </form>
      <div className="faint cal-menu-hint">Subscribe to a feed (Google, iCloud, holidays…) with ⇩ Import &amp; Sync.</div>
    </div>
  )
}
