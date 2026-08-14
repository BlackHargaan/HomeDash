import { useRef } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import { useDashboard } from '../context/DashboardContext.jsx'
import { widgetMeta } from '../widgets/registry.js'
import { WIDGET_COMPONENTS } from '../widgets/index.js'
import WidgetShell from './WidgetShell.jsx'

const ResponsiveGrid = WidthProvider(Responsive)

export default function Grid() {
  const { widgets, editMode, applyLayout } = useDashboard()
  const bp = useRef('lg')

  const layout = widgets.map((w) => {
    const meta = widgetMeta(w.type)
    return {
      i: w.id,
      x: w.layout?.x ?? 0,
      y: w.layout?.y ?? 0,
      w: w.layout?.w ?? meta?.layout.w ?? 3,
      h: w.layout?.h ?? meta?.layout.h ?? 3,
      minW: meta?.layout.minW ?? 2,
      minH: meta?.layout.minH ?? 2,
    }
  })

  return (
    <ResponsiveGrid
      className={`layout ${editMode ? 'edit' : ''}`}
      layouts={{ lg: layout }}
      breakpoints={{ lg: 1100, md: 820, sm: 560, xs: 0 }}
      cols={{ lg: 12, md: 8, sm: 4, xs: 2 }}
      rowHeight={68}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      isDraggable={editMode}
      isResizable={editMode}
      draggableHandle=".drag-handle"
      draggableCancel="input,textarea,button,select,a,.no-drag"
      onBreakpointChange={(newBp) => { bp.current = newBp }}
      onLayoutChange={(current) => {
        // Only persist edits made at the primary (lg) breakpoint so narrow
        // auto-reflowed layouts don't overwrite the user's arrangement.
        if (bp.current === 'lg') applyLayout(current)
      }}
    >
      {widgets.map((w) => {
        const Comp = WIDGET_COMPONENTS[w.type]
        return (
          <div key={w.id}>
            <WidgetShell widget={w}>
              {Comp ? <Comp widget={w} /> : <div className="muted">Unknown widget: {w.type}</div>}
            </WidgetShell>
          </div>
        )
      })}
    </ResponsiveGrid>
  )
}
