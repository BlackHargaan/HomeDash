import { useMemo } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { flowHeight, FLOW_WIDE } from '../widgets/registry.js'
import { WIDGET_COMPONENTS } from '../widgets/index.js'
import WidgetShell from './WidgetShell.jsx'

// Tablet / phone layout: instead of the fixed-height desktop grid, widgets flow
// into a responsive auto-arranging grid at their natural content height, in the
// same reading order as the desktop board (top-to-bottom, left-to-right).
export default function FlowLayout() {
  const { widgets } = useDashboard()

  const ordered = useMemo(
    () =>
      [...widgets].sort((a, b) => {
        const ay = a.layout?.y ?? 0, by = b.layout?.y ?? 0
        if (ay !== by) return ay - by
        return (a.layout?.x ?? 0) - (b.layout?.x ?? 0)
      }),
    [widgets],
  )

  return (
    <div className="flow">
      {ordered.map((w) => {
        const Comp = WIDGET_COMPONENTS[w.type]
        return (
          <div
            key={w.id}
            className={`flow-item ${FLOW_WIDE.has(w.type) ? 'wide' : ''}`}
            style={{ height: flowHeight(w.type) }}
          >
            <WidgetShell widget={w}>
              {Comp ? <Comp widget={w} /> : <div className="muted">Unknown widget: {w.type}</div>}
            </WidgetShell>
          </div>
        )
      })}
    </div>
  )
}
