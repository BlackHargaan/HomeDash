import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dragProps, dropProps } from './dnd.js'
import { isSameDay, toDateKey, fmtTime, WEEKDAY_SHORT } from '../../lib/date.js'
import { layoutDay, snap, clamp, atMinutes, minutesOf, MINUTES_PER_DAY, SNAP_MINUTES } from './helpers.js'

const HOUR_PX = 44
const PX = HOUR_PX / 60 // per minute
const MOVE_THRESHOLD = 4 // px before a press becomes a drag

const label = (min) => fmtTime(atMinutes(new Date(), min))
const hourLabel = (h) => atMinutes(new Date(), h * 60).toLocaleTimeString(undefined, { hour: 'numeric' })

// Hourly grid for Day (1 column) and Week (7 columns) views.
//   • drag an event to change its time (and day, in week view)
//   • drag its bottom edge to change how long it lasts
//   • drag across empty space to create an event for that span (click = 1 hour)
export default function TimeGrid({ days, byDay, onItem, onCreate, onRetime, dragItem, onDropDay, onDayHeader, highlightId }) {
  const scrollRef = useRef(null)
  const colsRef = useRef(null)
  const dragRef = useRef(null)
  const lastPointer = useRef('mouse')
  const [drag, setDrag] = useState(null)
  const [scrollbar, setScrollbar] = useState(0)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Start the view at 7am — or an hour before now when today is on screen.
  const firstKey = toDateKey(days[0])
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const showsToday = days.some((d) => isSameDay(d, new Date()))
    el.scrollTop = (showsToday ? Math.max(0, new Date().getHours() - 1) : 7) * HOUR_PX
    setScrollbar(el.offsetWidth - el.clientWidth)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, days.length])

  // Bring a highlighted event (e.g. picked from search) into view.
  useEffect(() => {
    if (!highlightId) return
    const el = scrollRef.current?.querySelector('.tg-ev.flash')
    if (el) scrollRef.current.scrollTop = Math.max(0, el.offsetTop - HOUR_PX)
  }, [highlightId, firstKey])

  const columns = useMemo(() => days.map((day) => {
    const items = byDay[toDateKey(day)] || []
    return { day, allDay: items.filter((i) => i.allDay), timed: layoutDay(items.filter((i) => !i.allDay), day) }
  }), [days, byDay])

  function slotAt(e) {
    const r = colsRef.current.getBoundingClientRect()
    const dayIdx = clamp(Math.floor(((e.clientX - r.left) / r.width) * days.length), 0, days.length - 1)
    const minutes = clamp((e.clientY - r.top) / PX, 0, MINUTES_PER_DAY)
    return { dayIdx, minutes }
  }

  function begin(e, mode, box, dayIdx) {
    lastPointer.current = e.pointerType
    if (e.button !== 0) return
    // On touch, empty space scrolls; a tap creates via onClick instead.
    if (mode === 'create' && e.pointerType === 'touch') return
    e.stopPropagation()
    e.preventDefault()
    const p = slotAt(e)
    const realDur = box ? Math.max(SNAP_MINUTES, (new Date(box.item.end || box.item.start) - new Date(box.item.start)) / 60000) : 60
    const anchor = Math.floor(p.minutes / SNAP_MINUTES) * SNAP_MINUTES
    const s = {
      mode, item: box?.item, box, realDur, anchor,
      originX: e.clientX, originY: e.clientY, originMin: p.minutes, originDay: dayIdx,
      dayIdx, start: box ? box.start : anchor, end: box ? box.end : anchor + SNAP_MINUTES, moved: false,
    }
    s.onMove = (ev) => move(ev)
    s.onUp = (ev) => end(ev)
    dragRef.current = s
    window.addEventListener('pointermove', s.onMove)
    window.addEventListener('pointerup', s.onUp)
    window.addEventListener('pointercancel', s.onUp)
  }

  function move(e) {
    const s = dragRef.current
    if (!s) return
    if (!s.moved && Math.hypot(e.clientX - s.originX, e.clientY - s.originY) < MOVE_THRESHOLD) return
    s.moved = true
    const p = slotAt(e)
    if (s.mode === 'move') {
      const start = clamp(snap(s.box.start + (p.minutes - s.originMin)), 0, MINUTES_PER_DAY - SNAP_MINUTES)
      s.start = start
      s.end = Math.min(start + s.realDur, MINUTES_PER_DAY)
      s.dayIdx = p.dayIdx
    } else if (s.mode === 'resize') {
      s.end = clamp(snap(p.minutes), s.start + SNAP_MINUTES, MINUTES_PER_DAY)
    } else {
      const b = snap(p.minutes)
      s.start = Math.min(s.anchor, b)
      s.end = Math.max(Math.max(s.anchor, b), s.start + SNAP_MINUTES)
      s.dayIdx = s.originDay
    }
    setDrag({ ...s })
  }

  function end(e) {
    const s = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!s) return
    window.removeEventListener('pointermove', s.onMove)
    window.removeEventListener('pointerup', s.onUp)
    window.removeEventListener('pointercancel', s.onUp)
    if (e.type === 'pointercancel') return
    if (s.mode === 'move') {
      if (!s.moved) return onItem(s.item)
      const day = days[s.dayIdx]
      const start = atMinutes(day, s.start)
      onRetime(s.item, start, new Date(start.getTime() + s.realDur * 60000))
    } else if (s.mode === 'resize') {
      if (!s.moved) return onItem(s.item)
      const day = days[s.originDay]
      const start = new Date(s.item.start)
      onRetime(s.item, start, atMinutes(day, s.end))
    } else {
      const day = days[s.originDay]
      if (s.moved) onCreate(day, s.start, s.end)
      else onCreate(day, s.anchor, s.anchor + 60)
    }
  }

  // Touch: tap on empty space creates a one-hour event at that slot.
  function tapCreate(e, dayIdx) {
    if (lastPointer.current !== 'touch') return
    const p = slotAt(e)
    const start = Math.floor(p.minutes / SNAP_MINUTES) * SNAP_MINUTES
    onCreate(days[dayIdx], start, start + 60)
  }

  const cols = days.length
  const gridCols = { gridTemplateColumns: `var(--tg-gutter) repeat(${cols}, minmax(0, 1fr))` }
  const pad = { paddingRight: scrollbar }
  const showPreview = drag && (drag.moved || drag.mode === 'create')

  return (
    <div className={`tg ${cols === 1 ? 'tg-day' : 'tg-week'} ${drag ? 'tg-dragging' : ''}`}>
      <div className="tg-head" style={{ ...gridCols, ...pad }}>
        <div />
        {days.map((day) => (
          <button key={toDateKey(day)} className={`tg-dayhead ${isSameDay(day, now) ? 'today' : ''}`} onClick={() => onDayHeader(day)}
            title={cols > 1 ? 'Open this day' : undefined}>
            <span className="dow">{WEEKDAY_SHORT[day.getDay()]}</span>
            <span className="dnum">{day.getDate()}</span>
          </button>
        ))}
      </div>

      <div className="tg-allday" style={{ ...gridCols, ...pad }}>
        <div className="tg-gutter-label">all-day</div>
        {columns.map(({ day, allDay }) => (
          <div key={toDateKey(day)} className="tg-allday-cell" {...dropProps(day, dragItem, onDropDay)}>
            {allDay.map((it) => (
              <button key={it.id} className={`cal-pill c-${it.color} ${it.kind === 'task' ? 'is-task' : ''} ${highlightId === it.id ? 'flash' : ''}`}
                onClick={() => onItem(it)} title={it.title} {...dragProps(it, dragItem)}>
                {it.kind === 'task' && '✓ '}{it.title}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-body" style={{ height: MINUTES_PER_DAY * PX }}>
          <div className="tg-gutter">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span key={h} className="tg-hour" style={{ top: h * HOUR_PX }}>{hourLabel(h)}</span>
            ))}
          </div>
          <div className="tg-cols" ref={colsRef} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {columns.map(({ day, timed }, dayIdx) => (
              <div
                key={toDateKey(day)}
                className={`tg-col ${isSameDay(day, now) ? 'today' : ''}`}
                style={{ backgroundSize: `100% ${HOUR_PX}px` }}
                onPointerDown={(e) => begin(e, 'create', null, dayIdx)}
                onClick={(e) => tapCreate(e, dayIdx)}
              >
                {timed.map((b) => {
                  const it = b.item
                  const height = (b.end - b.start) * PX
                  const dragging = drag?.moved && drag.item?.id === it.id
                  return (
                    <div
                      key={it.id}
                      className={`tg-ev c-${it.color} ${dragging ? 'ghost' : ''} ${height < 30 ? 'short' : ''} ${highlightId === it.id ? 'flash' : ''}`}
                      style={{
                        top: b.start * PX,
                        height: height - 2,
                        left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / b.lanes}% - 4px)`,
                      }}
                      onPointerDown={(e) => begin(e, 'move', b, dayIdx)}
                      onClick={(e) => e.stopPropagation()}
                      title={`${it.title}\n${fmtTime(it.start)} – ${fmtTime(it.end || it.start)}${it.location ? '\n📍 ' + it.location : ''}`}
                    >
                      <div className="tg-ev-title">{it.title}{it.recurringInstance && <span className="pill-recur"> ↻</span>}</div>
                      {height >= 30 && <div className="tg-ev-time">{fmtTime(it.start)} – {fmtTime(it.end || it.start)}</div>}
                      <div className="tg-ev-resize" onPointerDown={(e) => begin(e, 'resize', b, dayIdx)} />
                    </div>
                  )
                })}

                {showPreview && drag.dayIdx === dayIdx && (
                  <div className={`tg-ev preview c-${drag.item?.color || 'indigo'}`}
                    style={{ top: drag.start * PX, height: (drag.end - drag.start) * PX - 2, left: 2, right: 2, width: 'auto' }}>
                    <div className="tg-ev-title">{drag.item?.title || 'New event'}</div>
                    <div className="tg-ev-time">{label(drag.start)} – {label(drag.end)}</div>
                  </div>
                )}

                {isSameDay(day, now) && <div className="tg-now" style={{ top: minutesOf(now) * PX }} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
