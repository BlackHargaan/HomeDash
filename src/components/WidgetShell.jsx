import { useCallback, useRef, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { widgetMeta, ACCENTS } from '../widgets/registry.js'
import WidgetStyleMenu from './WidgetStyleMenu.jsx'

// Chrome around every widget: glass card, drag handle, title and edit tools.
// `title` / `icon` can be overridden per instance (e.g. a named Notes widget).
export default function WidgetShell({ widget, children, title, icon, actions }) {
  const { editMode, removeWidget, updateWidget } = useDashboard()
  const meta = widgetMeta(widget.type)
  const displayTitle = title || widget.settings?.title || meta?.name || 'Widget'
  const displayIcon = icon || meta?.icon || '▫️'
  const style = widget.settings?.style || {}
  const styleBtn = useRef(null)
  const [styling, setStyling] = useState(false)
  const closeStyling = useCallback(() => setStyling(false), [])
  const accent = ACCENTS[style.accent]
  const cssVars = accent ? { '--accent': accent, '--accent-soft': `color-mix(in srgb, ${accent} 22%, transparent)` } : undefined

  function rename() {
    const next = prompt('Rename this widget:', displayTitle)
    if (next != null) updateWidget(widget.id, { title: next.trim() || undefined })
  }

  return (
    <div
      className={`widget glass ${editMode ? 'is-edit' : ''} ${style.hideTitle ? 'no-title' : ''}`}
      data-variant={style.variant || undefined}
      data-tinted={style.tinted ? 'true' : undefined}
      style={cssVars}
    >
      <div className="widget-head">
        <span className={`wtitle ${editMode ? 'drag-handle' : ''}`}>
          <span className="wicon">{displayIcon}</span>
          {displayTitle}
        </span>
        <span className="spacer" />
        {actions}
        <span className="widget-tools">
          <button ref={styleBtn} className={`wtool ${styling ? 'on' : ''}`} title="Widget style" onClick={() => setStyling((v) => !v)} aria-label="Widget style">🎨</button>
          <button className="wtool" title="Rename widget" onClick={rename} aria-label="Rename widget">✎</button>
          <button
            className="wtool del"
            title="Remove widget"
            onClick={() => removeWidget(widget.id)}
            aria-label="Remove widget"
          >
            ✕
          </button>
        </span>
      </div>
      <div className="widget-body">{children}</div>
      {styling && styleBtn.current && (
        <WidgetStyleMenu anchor={styleBtn.current} style={style} onClose={closeStyling}
          onChange={(next) => updateWidget(widget.id, { style: Object.keys(next).length ? next : undefined })} />
      )}
    </div>
  )
}
