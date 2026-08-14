// Date helpers kept dependency-free and locale-aware where practical.

export const DAY_MS = 24 * 60 * 60 * 1000

export function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

export function toDateKey(d) {
  const x = new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Build the 6x7 grid of days for a month view, including leading/trailing days.
export function monthMatrix(year, month) {
  const first = new Date(year, month, 1)
  const startWeekday = first.getDay() // 0 = Sun
  const gridStart = new Date(year, month, 1 - startWeekday)
  const weeks = []
  for (let w = 0; w < 6; w++) {
    const days = []
    for (let d = 0; d < 7; d++) {
      const cur = new Date(gridStart)
      cur.setDate(gridStart.getDate() + w * 7 + d)
      days.push(cur)
    }
    weeks.push(days)
  }
  return weeks
}

export function weekDays(base) {
  const start = new Date(base)
  start.setDate(base.getDate() - base.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export function fmtMonthYear(d) {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function fmtTime(d) {
  return new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function fmtDateTimeLocal(d) {
  // For <input type="datetime-local"> value binding.
  const x = new Date(d)
  const pad = (n) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
