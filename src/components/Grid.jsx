import { useRef } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout'
import { useDashboard } from '../context/DashboardContext.jsx'
import { widgetMeta } from '../widgets/registry.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import { WIDGET_COMPONENTS } from '../widgets/index.js'
import WidgetShell from './WidgetShell.jsx'
import FlowLayout from './FlowLayout.jsx'

const SizedGrid = WidthProvider(GridLayout)

// Below this width the fixed-height desktop grid gives way to the content-flow
// layout (see FlowLayout). Kept in sync with the CSS breakpoints.
const DESKTOP_MIN = 1080

export default function Grid() {
  const compact = useMediaQuery(`(max-width: ${DESKTOP_MIN - 1}px)`)
  if (compact) return <FlowLayout />
  return <BentoGrid />
}

function BentoGrid() {
  const { widgets, editMode, applyLayout } = useDashboard()
  // A ref keeps the initial render honest even before the first change event.
  const first = useRef(true)

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
    <SizedGrid
      className={`layout ${editMode ? 'edit' : ''}`}
      layout={layout}
      cols={12}
      rowHeight={68}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      isDraggable={editMode}
      isResizable={editMode}
      draggableHandle=".drag-handle"
      draggableCancel="input,textarea,button,select,a,.no-drag"
      compactType="vertical"
      onLayoutChange={(current) => {
        // Ignore the very first synthetic layout emit; persist real edits after.
        if (first.current) { first.current = false; return }
        applyLayout(current)
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
    </SizedGrid>
  )
}
