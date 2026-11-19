import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ACCENTS } from '../widgets/registry.js'
import { CARD_VARIANTS, accentColor } from '../lib/appearance.js'
import { useDashboard } from '../context/DashboardContext.jsx'

// Per-widget look: accent color, card style, tint, and whether the title bar
// shows outside edit mode. Rendered in a portal so small widgets don't clip it.
export default function WidgetStyleMenu({ anchor, style = {}, onChange, onClose }) {
  const { uiStyle, resolvedTheme } = useDashboard()
  const ref = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect()
    const width = 240
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width)) })
  }, [anchor])

  useEffect(() => {
    const onDown = (e) => { if (!ref.current?.contains(e.target) && !anchor.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [anchor, onClose])

  const set = (patch) => onChange({ ...style, ...patch })
  const variant = style.variant || 'glass'

  return createPortal(
    <div ref={ref} className="wstyle-pop" style={{ position: 'fixed', top: pos.top, left: pos.left, right: 'auto' }} role="dialog" aria-label="Widget style">
      <label>Accent</label>
      <div className="swatches">
        <button className={`swatch auto ${!style.accent ? 'on' : ''}`} onClick={() => set({ accent: undefined })} aria-label="Board accent" title="Use the board accent" />
        {Object.entries(ACCENTS).map(([name, color]) => (
          <button key={name} className={`swatch ${style.accent === name ? 'on' : ''}`} style={{ background: accentColor(name, ACCENTS, uiStyle, resolvedTheme) || color }} onClick={() => set({ accent: name })} aria-label={name} />
        ))}
      </div>
      <label>Card</label>
      <div className="chips">
        {Object.entries(CARD_VARIANTS).map(([id, name]) => (
          <button key={id} className={`chip ${variant === id ? 'on' : ''}`} onClick={() => set({ variant: id === 'glass' ? undefined : id })}>{name}</button>
        ))}
      </div>
      <label className="chip-inline"><input type="checkbox" checked={!!style.tinted} onChange={(e) => set({ tinted: e.target.checked || undefined })} /> Tint with accent</label>
      <label className="chip-inline"><input type="checkbox" checked={!!style.hideTitle} onChange={(e) => set({ hideTitle: e.target.checked || undefined })} /> Hide title bar</label>
      <button className="btn sm ghost" onClick={() => onChange({})} disabled={!Object.values(style).some(Boolean)}>Reset style</button>
    </div>,
    document.body,
  )
}
