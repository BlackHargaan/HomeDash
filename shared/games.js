// Game Tracker: a backlog built for actually finishing games.
//
// Stored under the `games` key:
//   { items: [Game], settings: { playingLimit, sessionMinutes, goal } }
//   Game = { id, name, status, steamAppId?, steamMin?, recentMin?, manualMin?,
//            lastPlayed?, sessions: [{ d: 'YYYY-MM-DD', m }], ttb?: { main, extra, full } (hours),
//            ttbSource?, goal?, note?, added, started?, finished? }
// Played time = Steam playtime (synced) + time logged by hand. Each Steam sync
// that finds more playtime records the difference as a session, so pace
// ("about 2 weeks left at your pace") works for Steam and non-Steam games alike.
import { toDateKey } from './date.js'

export const GAME_STATUSES = {
  playing: { label: 'Playing', icon: '🎮' },
  backlog: { label: 'Up next', icon: '📚' },
  paused: { label: 'Paused', icon: '⏸️' },
  finished: { label: 'Finished', icon: '🏆' },
  dropped: { label: 'Let go', icon: '🍃' },
}

export const TTB_GOALS = {
  main: 'Main story',
  extra: 'Main + extras',
  full: 'Completionist',
}

export const DEFAULT_GAME_SETTINGS = { playingLimit: 3, sessionMinutes: 60, goal: 'main' }

export function normalizeGames(v) {
  const o = v && typeof v === 'object' ? v : {}
  return {
    items: Array.isArray(o.items) ? o.items.filter((g) => g && typeof g.name === 'string' && GAME_STATUSES[g.status]) : [],
    settings: { ...DEFAULT_GAME_SETTINGS, ...(o.settings || {}) },
  }
}

export const normName = (s) => String(s || '').toLowerCase()
  .replace(/[™®©]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

export const playedMinutes = (g) => (g.steamMin || 0) + (g.manualMin || 0)

// Hours to beat for the game's goal (falling back to the main story).
export function targetHours(g, settings = DEFAULT_GAME_SETTINGS) {
  const goal = g.goal || settings.goal || 'main'
  const t = g.ttb || {}
  return t[goal] || t.main || t.extra || t.full || null
}

export function progress(g, settings) {
  const playedH = playedMinutes(g) / 60
  const targetH = targetHours(g, settings)
  if (!targetH) return { playedH, targetH: null, pct: null, leftH: null }
  return { playedH, targetH, pct: Math.min(100, Math.round((playedH / targetH) * 100)), leftH: Math.max(0, targetH - playedH) }
}

// Minutes played in the last `days` days (sessions; Steam's two-week figure
// when there's no history yet).
export function recentMinutes(g, now = new Date(), days = 14) {
  const from = new Date(now); from.setDate(from.getDate() - days + 1)
  const fromKey = toDateKey(from)
  const logged = (g.sessions || []).filter((s) => s.d >= fromKey).reduce((a, s) => a + s.m, 0)
  return logged || (days === 14 ? g.recentMin || 0 : 0)
}

// Minutes per week over the last two weeks — or since you started, if that
// was more recently (at least a week, so one long evening doesn't read as a
// whole week's pace... nor a single session as a crawl).
export function weeklyPace(g, now = new Date()) {
  const recent = recentMinutes(g, now)
  if (!recent) return 0
  const from = new Date(now); from.setDate(from.getDate() - 13)
  const fromKey = toDateKey(from)
  const first = (g.sessions || []).map((s) => s.d).filter((d) => d >= fromKey).sort()[0]
  if (!first) return recent / 2 // Steam's two-week figure
  const days = Math.round((new Date(`${toDateKey(now)}T12:00:00`) - new Date(`${first}T12:00:00`)) / 86400000) + 1
  return recent / (Math.min(14, Math.max(7, days)) / 7)
}

// How long until it's done: in sessions, and in weeks at the recent pace.
export function eta(g, settings = DEFAULT_GAME_SETTINGS, now = new Date()) {
  const { leftH } = progress(g, settings)
  if (leftH == null) return null
  const leftMin = leftH * 60
  const perWeek = weeklyPace(g, now)
  return {
    leftH,
    sessions: Math.ceil(leftMin / (settings.sessionMinutes || 60)),
    weeks: perWeek > 0 ? leftMin / perWeek : null,
  }
}

export function daysSince(dateStr, now = new Date()) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return Math.floor((now - d) / 86400000)
}

// ---- Changes (all return a new game / list)

export function logPlay(g, minutes, now = new Date()) {
  const m = Math.round(minutes)
  if (!m) return g
  const d = toDateKey(now)
  const sessions = [...(g.sessions || [])]
  const last = sessions[sessions.length - 1]
  if (last && last.d === d) sessions[sessions.length - 1] = { d, m: Math.max(0, last.m + m) }
  else if (m > 0) sessions.push({ d, m })
  return {
    ...g,
    manualMin: Math.max(0, (g.manualMin || 0) + m),
    sessions: sessions.slice(-120),
    ...(m > 0 ? { lastPlayed: now.toISOString() } : {}),
  }
}

export function setStatus(g, status, now = new Date()) {
  if (!GAME_STATUSES[status] || g.status === status) return g
  const stamp = now.toISOString()
  return {
    ...g,
    status,
    ...(status === 'playing' && !g.started ? { started: stamp } : {}),
    ...(status === 'finished' ? { finished: stamp } : {}),
    ...(status === 'dropped' ? { droppedAt: stamp } : {}),
  }
}

// Fold a Steam library fetch into the tracked games: update playtime, record
// new play as a session, and link games added by name (by hand or by the
// assistant) to their Steam entry.
export function mergeSteam(items, library, now = new Date()) {
  const byApp = new Map(library.map((l) => [l.appid, l]))
  const byName = new Map(library.map((l) => [normName(l.name), l]))
  const linked = new Set(items.map((g) => g.steamAppId).filter(Boolean))
  return items.map((g) => {
    let lib = g.steamAppId ? byApp.get(g.steamAppId) : null
    if (!g.steamAppId) {
      const hit = byName.get(normName(g.name))
      if (hit && !linked.has(hit.appid)) { lib = hit; linked.add(hit.appid) }
    }
    if (!lib) return g
    let next = { ...g, steamAppId: lib.appid, recentMin: lib.min2w || 0 }
    const delta = g.steamMin == null ? 0 : lib.min - g.steamMin
    next.steamMin = lib.min
    if (delta > 0) {
      const d = toDateKey(lib.last ? new Date(lib.last * 1000) : now)
      const sessions = [...(g.sessions || [])]
      const i = sessions.findIndex((s) => s.d === d)
      if (i >= 0) sessions[i] = { d, m: sessions[i].m + delta }
      else sessions.push({ d, m: delta })
      sessions.sort((a, b) => (a.d < b.d ? -1 : 1))
      next.sessions = sessions.slice(-120)
    }
    if (lib.last) {
      const lp = new Date(lib.last * 1000).toISOString()
      if (!g.lastPlayed || lp > g.lastPlayed) next.lastPlayed = lp
    }
    return next
  })
}

// ---- Nudges

const round = (h) => (h >= 10 ? Math.round(h) : Math.round(h * 2) / 2)

export function fmtHours(h) {
  if (h == null) return '?'
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  return `${round(h)} h`
}

// Backlog and paused games ranked by how quickly they could be finished:
// games you've already sunk time into and short games first.
export function suggestNext(items, settings = DEFAULT_GAME_SETTINGS, limit = 3) {
  return items
    .filter((g) => g.status === 'backlog' || g.status === 'paused')
    .map((g) => {
      const p = progress(g, settings)
      let score
      let reason
      if (p.leftH == null) {
        score = 1e6 - playedMinutes(g)
        reason = 'No time-to-beat yet'
      } else {
        score = p.leftH * (p.pct > 0 ? 0.7 : 1)
        if (p.pct >= 50) reason = `You’re ${p.pct}% through — about ${fmtHours(p.leftH)} left`
        else if (p.pct > 0) reason = `Already started — about ${fmtHours(p.leftH)} left`
        else if (p.targetH <= 12) reason = `A short one — about ${fmtHours(p.targetH)} to beat`
        else reason = `About ${fmtHours(p.targetH)} to beat`
      }
      return { game: g, score, reason }
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
}

// "Playing" games you haven't touched in a while.
export function staleGames(items, now = new Date(), days = 14) {
  return items.filter((g) => {
    if (g.status !== 'playing') return false
    // "Keep playing" on the nudge snoozes it (`snoozed`) like a fresh session would.
    const latest = [g.lastPlayed, g.snoozed, g.started, g.added].filter(Boolean).sort().pop()
    const since = daysSince(latest, now)
    return since != null && since >= days
  })
}

export function finishedThisYear(items, now = new Date()) {
  const y = String(now.getFullYear())
  return items.filter((g) => g.status === 'finished' && String(g.finished || '').startsWith(y)).length
}

// Steam's store artwork for an app (wide header image).
export const steamHeader = (appid) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
