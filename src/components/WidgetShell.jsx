import { useDashboard } from '../context/DashboardContext.jsx'
import { widgetMeta } from '../widgets/registry.js'

// Chrome around every widget: glass card, drag handle, title and edit tools.
// `title` / `icon` can be overridden per instance (e.g. a named Notes widget).
export default function WidgetShell({ widget, children, title, icon, actions }) {
  const { editMode, removeWidget } = useDashboard()
  const meta = widgetMeta(widget.type)
  const displayTitle = title || widget.settings?.title || meta?.name || 'Widget'
  const displayIcon = icon || meta?.icon || '▫️'

  return (
    <div className={`widget glass ${editMode ? 'is-edit' : ''}`}>
      <div className="widget-head">
        <span className={`wtitle ${editMode ? 'drag-handle' : ''}`}>
          <span className="wicon">{displayIcon}</span>
          {displayTitle}
        </span>
        <span className="spacer" />
        {actions}
        <span className="widget-tools">
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
    </div>
  )
}
