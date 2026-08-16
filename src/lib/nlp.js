// Tiny natural-language event parser. Turns strings like
// "Lunch with Sam tomorrow 1pm" or "Standup monday at 9:30am" into a draft
// event { title, start, end, allDay }. Intentionally lightweight — it covers
// the common relative-day + time phrasings, not full date grammar.
import { uid } from './storage.js'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_ABBR = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 }

function nextWeekday(from, target, forceNext) {
  const d = new Date(from)
  let delta = (target - d.getDay() + 7) % 7
  if (delta === 0) delta = 7 // a named weekday always means a future day, not today
  if (forceNext) delta += 7 // "next <weekday>" → the following week's occurrence
  d.setDate(d.getDate() + delta)
  return d
}

export function parseNaturalEvent(input, now = new Date()) {
  if (!input || !input.trim()) return null
  let text = input.trim()
  let working = ' ' + text.toLowerCase() + ' '
  const remove = [] // substrings to strip from the title

  // ---- Date ----
  let date = null
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)

  const inDays = working.match(/\bin (\d+) days?\b/)
  const nextWd = working.match(/\bnext (sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/)
  const bareWd = working.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/)

  if (/\btomorrow\b|\btmrw\b/.test(working)) {
    date = new Date(dayStart); date.setDate(date.getDate() + 1)
    remove.push('tomorrow', 'tmrw')
  } else if (/\btoday\b|\btonight\b/.test(working)) {
    date = new Date(dayStart)
    remove.push('today', 'tonight')
  } else if (inDays) {
    date = new Date(dayStart); date.setDate(date.getDate() + Number(inDays[1]))
    remove.push(inDays[0].trim())
  } else if (nextWd) {
    const t = WEEKDAYS.indexOf(nextWd[1]) >= 0 ? WEEKDAYS.indexOf(nextWd[1]) : WEEKDAY_ABBR[nextWd[1]]
    date = nextWeekday(dayStart, t, true)
    remove.push(nextWd[0].trim())
  } else if (bareWd) {
    const t = WEEKDAYS.indexOf(bareWd[1]) >= 0 ? WEEKDAYS.indexOf(bareWd[1]) : WEEKDAY_ABBR[bareWd[1]]
    date = nextWeekday(dayStart, t, false)
    remove.push(bareWd[1])
  }

  // ---- Time ----
  let hasTime = false
  let hours = 9, minutes = 0
  const ampm = working.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
  const h24 = working.match(/\b(\d{1,2}):(\d{2})\b/)
  const atH = working.match(/\bat (\d{1,2})\b/)
  const noon = /\bnoon\b/.test(working)
  const midnight = /\bmidnight\b/.test(working)

  if (ampm) {
    hours = Number(ampm[1]) % 12
    if (ampm[3] === 'pm') hours += 12
    minutes = ampm[2] ? Number(ampm[2]) : 0
    hasTime = true
    remove.push(ampm[0].trim())
  } else if (h24) {
    hours = Number(h24[1]); minutes = Number(h24[2]); hasTime = true
    remove.push(h24[0].trim())
  } else if (atH) {
    let h = Number(atH[1])
    if (h < 8) h += 12 // "at 3" → 3pm, a friendlier default
    hours = h; hasTime = true
    remove.push(atH[0].trim())
  } else if (noon) { hours = 12; minutes = 0; hasTime = true; remove.push('noon') }
  else if (midnight) { hours = 0; minutes = 0; hasTime = true; remove.push('midnight') }

  if (!date && hasTime) date = new Date(dayStart) // a time but no day → today

  if (!date) {
    // No date and no time at all: not enough to be an event.
    return { title: cleanTitle(text, []), start: null, end: null, allDay: true, incomplete: true }
  }

  const start = new Date(date)
  if (hasTime) start.setHours(hours, minutes, 0, 0)
  const end = new Date(start.getTime() + (hasTime ? 60 * 60 * 1000 : 0))

  return {
    id: uid('evt'), uid: uid('uid'),
    title: cleanTitle(text, remove) || 'New event',
    description: '', location: '',
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: !hasTime,
    color: 'indigo', source: 'local',
    recurrence: null, exdates: [],
    reminderMinutes: hasTime ? 10 : null,
  }
}

function cleanTitle(text, removed) {
  let t = ' ' + text + ' '
  for (const r of removed) {
    t = t.replace(new RegExp('\\b' + escapeRe(r) + '\\b', 'ig'), ' ')
  }
  // Drop dangling connector words left behind (on/at/this/next).
  t = t.replace(/\b(on|at|this|next)\b\s*$/i, ' ').replace(/^\s*(on|at)\b/i, ' ')
  return t.replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase())
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
