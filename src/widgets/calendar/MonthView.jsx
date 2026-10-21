import { dragProps, dropProps } from './dnd.js'
import { monthMatrix, isSameDay, toDateKey, fmtTime, WEEKDAY_SHORT } from '../../lib/date.js'

export default function MonthView({ cursor, byDay, onDay, onItem, dragItem, onDrop, highlightId }) {
  const weeks = monthMatrix(cursor.getFullYear(), cursor.getMonth())
  const today = new Date()
  return (
    <div className="cal-month">
      <div className="cal-weekhead">
        {WEEKDAY_SHORT.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="cal-weeks">
        {weeks.map((week, wi) => (
          <div key={wi} className="cal-week">
            {week.map((day) => {
              const key = toDateKey(day)
              const items = byDay[key] || []
              const isCur = day.getMonth() === cursor.getMonth()
              const isToday = isSameDay(day, today)
              return (
                <div
                  key={key}
                  className={`cal-cell ${isCur ? '' : 'dim'} ${isToday ? 'today' : ''}`}
                  onClick={() => onDay(day)}
                  {...dropProps(day, dragItem, onDrop)}
                >
                  <div className="cal-daynum">{day.getDate()}</div>
                  <div className="cal-events">
                    {items.slice(0, 3).map((it) => (
                      <button
                        key={it.id}
                        className={`cal-pill c-${it.color} ${it.kind === 'task' ? 'is-task' : ''} ${highlightId === it.id ? 'flash' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onItem(it) }}
                        title={it.title}
                        {...dragProps(it, dragItem)}
                      >
                        {it.kind === 'task' && '✓ '}
                        {!it.allDay && <span className="pill-time">{fmtTime(it.start)}</span>}
                        {it.title}
                        {it.recurringInstance && <span className="pill-recur" title="Recurring"> ↻</span>}
                      </button>
                    ))}
                    {items.length > 3 && <div className="cal-more">+{items.length - 3} more</div>}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
