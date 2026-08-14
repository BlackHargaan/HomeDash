// Minimal iCalendar (.ics) parser/serializer. Handles the common subset used
// by Google Calendar, Apple Calendar and Outlook exports: VEVENT blocks with
// SUMMARY, DTSTART, DTEND, DESCRIPTION, LOCATION, UID. Timezone handling is
// best-effort — floating and UTC (Z) times are supported; VTIMEZONE offset
// tables are not resolved (the local offset is assumed for naive values).
import { uid } from './storage.js'

function unfold(text) {
  // RFC 5545 line folding: continuation lines start with a space or tab.
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
}

function unescape(val) {
  return val
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function parseIcsDate(value, params) {
  // value forms: 20240115, 20240115T090000, 20240115T090000Z
  const isDateOnly = params.VALUE === 'DATE' || /^\d{8}$/.test(value)
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/)
  if (!m) return { date: null, allDay: false }
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m
  let date
  if (z) {
    date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
  } else {
    date = new Date(+y, +mo - 1, +d, +h, +mi, +s)
  }
  return { date, allDay: isDateOnly }
}

function splitLine(line) {
  const idx = line.indexOf(':')
  if (idx === -1) return null
  const rawKey = line.slice(0, idx)
  const value = line.slice(idx + 1)
  const [name, ...paramParts] = rawKey.split(';')
  const params = {}
  for (const p of paramParts) {
    const eq = p.indexOf('=')
    if (eq !== -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1)
  }
  return { name: name.toUpperCase(), params, value }
}

export function parseICS(text) {
  const lines = unfold(text).split('\n')
  const events = []
  let cur = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur) events.push(finalizeEvent(cur))
      cur = null
      continue
    }
    if (!cur) continue
    const parsed = splitLine(line)
    if (!parsed) continue
    const { name, params, value } = parsed
    switch (name) {
      case 'SUMMARY':
        cur.title = unescape(value)
        break
      case 'DESCRIPTION':
        cur.description = unescape(value)
        break
      case 'LOCATION':
        cur.location = unescape(value)
        break
      case 'UID':
        cur.uid = value
        break
      case 'DTSTART': {
        const { date, allDay } = parseIcsDate(value, params)
        cur.start = date
        cur.allDay = allDay
        break
      }
      case 'DTEND': {
        const { date } = parseIcsDate(value, params)
        cur.end = date
        break
      }
      default:
        break
    }
  }
  return events.filter((e) => e.start instanceof Date && !isNaN(e.start))
}

function finalizeEvent(cur) {
  const start = cur.start
  let end = cur.end
  if (start && !end) {
    end = new Date(start.getTime() + (cur.allDay ? 0 : 60 * 60 * 1000))
  }
  return {
    id: uid('evt'),
    uid: cur.uid || uid('uid'),
    title: cur.title || '(untitled)',
    description: cur.description || '',
    location: cur.location || '',
    start: start ? start.toISOString() : null,
    end: end ? end.toISOString() : null,
    allDay: !!cur.allDay,
    color: 'indigo',
    source: 'import',
  }
}

function icsDate(iso, allDay) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  if (allDay) {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  }
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function esc(val = '') {
  return String(val).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function eventsToICS(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HomeDash//EN', 'CALSCALE:GREGORIAN']
  for (const e of events) {
    if (!e.start) continue
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.uid || e.id}`)
    lines.push(`DTSTAMP:${icsDate(new Date().toISOString(), false)}`)
    lines.push(`${e.allDay ? 'DTSTART;VALUE=DATE' : 'DTSTART'}:${icsDate(e.start, e.allDay)}`)
    if (e.end) lines.push(`${e.allDay ? 'DTEND;VALUE=DATE' : 'DTEND'}:${icsDate(e.end, e.allDay)}`)
    lines.push(`SUMMARY:${esc(e.title)}`)
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`)
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
