// Recurrence-rule (RRULE) expansion. Supports the subset that covers the vast
// majority of real-world calendars: FREQ = DAILY | WEEKLY | MONTHLY | YEARLY,
// INTERVAL, COUNT, UNTIL, BYDAY (for weekly), plus EXDATE exclusions.
//
// Expansion is *lazy and range-bounded*: we only materialize the occurrences
// that fall inside the window the calendar is currently showing, so an
// open-ended weekly event costs nothing beyond the visible weeks.

const DOW = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

// Parse a raw "FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2;UNTIL=..." string.
export function parseRRule(raw, parseDate) {
  if (!raw) return null
  const parts = {}
  for (const kv of raw.split(';')) {
    const [k, v] = kv.split('=')
    if (k) parts[k.toUpperCase()] = v
  }
  if (!parts.FREQ) return null
  const rule = { freq: parts.FREQ.toUpperCase(), interval: parts.INTERVAL ? Number(parts.INTERVAL) : 1 }
  if (parts.COUNT) rule.count = Number(parts.COUNT)
  if (parts.UNTIL && parseDate) {
    const d = parseDate(parts.UNTIL)
    if (d) rule.until = d.toISOString()
  }
  if (parts.BYDAY) rule.byday = parts.BYDAY.split(',').map((c) => c.replace(/^[+-]?\d+/, '').toUpperCase())
  return rule
}

function addInterval(date, freq, interval) {
  const d = new Date(date)
  if (freq === 'DAILY') d.setDate(d.getDate() + interval)
  else if (freq === 'WEEKLY') d.setDate(d.getDate() + 7 * interval)
  else if (freq === 'MONTHLY') d.setMonth(d.getMonth() + interval)
  else if (freq === 'YEARLY') d.setFullYear(d.getFullYear() + interval)
  else return null
  return d
}

const HARD_CAP = 3660 // ~10 years of daily occurrences: a safety valve only.

// Returns an array of occurrence instances of `event` whose start falls within
// [rangeStart, rangeEnd]. Non-recurring events return [event] unchanged.
export function expandInRange(event, rangeStart, rangeEnd) {
  const rec = event.recurrence
  if (!rec || !rec.freq) return [event]

  const base = new Date(event.start)
  const dur = event.end ? new Date(event.end).getTime() - base.getTime() : 0
  const until = rec.until ? new Date(rec.until) : null
  const maxCount = rec.count || Infinity
  const interval = rec.interval || 1
  const excluded = new Set((event.exdates || []).map((d) => new Date(d).getTime()))

  const overrides = event.overrides || {} // { [originalStartISO]: patch | {deleted:true} }

  const out = []
  let generated = 0 // counts toward COUNT (RFC: exclusions still count)

  const consider = (occ) => {
    if (generated >= maxCount) return false
    if (until && occ > until) return false
    generated++
    const originalStart = occ.toISOString()
    if (excluded.has(occ.getTime())) return true // deleted-this-occurrence / EXDATE
    const override = overrides[originalStart]
    if (override?.deleted) return true
    // The instant an override may relocate the event to — used for range test.
    const shownStart = override?.start ? new Date(override.start) : occ
    if (shownStart >= rangeStart && shownStart <= rangeEnd) {
      out.push({
        ...event,
        ...(override || {}),
        id: `${event.id}__${occ.getTime()}`,
        start: (override?.start ? new Date(override.start) : occ).toISOString(),
        end: (override?.end ? new Date(override.end) : new Date(occ.getTime() + dur)).toISOString(),
        recurringInstance: true,
        seriesId: event.id,
        originalStart,
        edited: !!override,
      })
    }
    return true
  }

  if (rec.freq === 'WEEKLY' && rec.byday && rec.byday.length) {
    const days = rec.byday.map((c) => DOW[c]).filter((n) => n != null).sort((a, b) => a - b)
    if (!days.length) days.push(base.getDay())
    // Anchor to the Sunday of the base event's week.
    let weekStart = new Date(base)
    weekStart.setDate(base.getDate() - base.getDay())
    weekStart.setHours(0, 0, 0, 0)
    let guard = 0
    while (guard++ < HARD_CAP) {
      let anyBeforeEnd = false
      for (const dow of days) {
        const occ = new Date(weekStart)
        occ.setDate(weekStart.getDate() + dow)
        occ.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), 0)
        if (occ < base) continue // skip days earlier in the first week than DTSTART
        if (occ <= rangeEnd) anyBeforeEnd = true
        if (!consider(occ)) return out
      }
      if (weekStart > rangeEnd && !anyBeforeEnd) break
      weekStart.setDate(weekStart.getDate() + 7 * interval)
    }
    return out
  }

  // DAILY / WEEKLY (no BYDAY) / MONTHLY / YEARLY
  let occ = new Date(base)
  let guard = 0
  while (occ && guard++ < HARD_CAP) {
    if (occ > rangeEnd) break
    if (!consider(occ)) break
    occ = addInterval(occ, rec.freq, interval)
  }
  return out
}

// Expand a whole event list within [start, end] and return occurrences sorted
// chronologically. Shared by the Agenda view and the Today panel.
export function collectOccurrences(events, start, end) {
  const out = []
  for (const e of events) {
    if (!e.start) continue
    for (const inst of expandInRange(e, start, end)) out.push(inst)
  }
  return out.sort((a, b) => new Date(a.start) - new Date(b.start))
}

// Human-readable summary for the event editor, e.g. "Repeats weekly".
export function describeRecurrence(rec) {
  if (!rec || !rec.freq) return ''
  const f = rec.freq.toLowerCase()
  const label = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[f] || f
  const every = rec.interval > 1 ? `every ${rec.interval} ${label}s` : `${f}`
  return `Repeats ${every}`
}

export const SIMPLE_FREQS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
]
