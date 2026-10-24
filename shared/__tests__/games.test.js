import { describe, it, expect } from 'vitest'
import {
  progress, eta, logPlay, setStatus, mergeSteam, suggestNext, staleGames, fmtHours, normName, finishedThisYear, normalizeGames, recentMinutes,
} from '../games.js'

const NOW = new Date(2026, 9, 24, 20, 0)
const g = (o) => ({ id: o.id || o.name, status: 'backlog', added: '2026-09-01T10:00:00.000Z', ...o })

describe('game tracker', () => {
  it('measures progress against time to beat', () => {
    const game = g({ name: 'Hades', steamMin: 600, manualMin: 60, ttb: { main: 22, extra: 45, full: 95 } })
    expect(progress(game)).toMatchObject({ playedH: 11, targetH: 22, pct: 50, leftH: 11 })
    expect(progress({ ...game, goal: 'full' }).targetH).toBe(95)
    expect(progress({ ...game, ttb: { extra: 30 } }).targetH).toBe(30) // falls back
    expect(progress({ ...game, ttb: undefined }).pct).toBe(null)
    expect(progress({ ...game, steamMin: 3000 }).pct).toBe(100)
  })

  it('logs play and estimates what is left at your pace', () => {
    let game = g({ name: 'Celeste', ttb: { main: 8 } })
    game = logPlay(game, 60, new Date(2026, 9, 20, 21))
    game = logPlay(game, 30, new Date(2026, 9, 20, 22)) // same day merges
    game = logPlay(game, 90, new Date(2026, 9, 23, 21))
    expect(game.sessions).toEqual([{ d: '2026-10-20', m: 90 }, { d: '2026-10-23', m: 90 }])
    expect(game.manualMin).toBe(180)
    expect(recentMinutes(game, NOW)).toBe(180)
    const e = eta(game, { sessionMinutes: 60 }, NOW)
    expect(e.leftH).toBe(5)
    expect(e.sessions).toBe(5)
    expect(e.weeks).toBeCloseTo(300 / 180) // started 5 days ago → counts as one week: 180 min/week
    // Over two weeks, the same play is half the pace
    const spread = { ...game, sessions: [{ d: '2026-10-11', m: 90 }, { d: '2026-10-23', m: 90 }] }
    expect(eta(spread, { sessionMinutes: 60 }, NOW).weeks).toBeCloseTo(300 / 90)
    expect(logPlay(game, -30, NOW).manualMin).toBe(150) // undo a mistaken +30
    expect(eta(g({ name: 'x', ttb: { main: 5 } }), undefined, NOW).weeks).toBe(null) // no pace yet
  })

  it('stamps status changes', () => {
    const t = new Date('2026-10-24T10:00:00Z')
    const p = setStatus(g({ name: 'A' }), 'playing', t)
    expect(p).toMatchObject({ status: 'playing', started: t.toISOString() })
    expect(setStatus(p, 'playing', NOW)).toBe(p)
    expect(setStatus(p, 'finished', t).finished).toBe(t.toISOString())
    expect(setStatus(p, 'bogus', t)).toBe(p)
  })

  it('merges Steam playtime, records new play and links by name', () => {
    const items = [
      g({ id: 'a', name: 'Hollow Knight', steamAppId: 367520, steamMin: 300, status: 'playing' }),
      g({ id: 'b', name: 'Portal 2™' }), // added by name → links
      g({ id: 'c', name: 'Not on Steam', manualMin: 30 }),
    ]
    const last = Math.floor(new Date(2026, 9, 23, 21).getTime() / 1000)
    const lib = [
      { appid: 367520, name: 'Hollow Knight', min: 420, min2w: 120, last },
      { appid: 620, name: 'Portal 2', min: 50, min2w: 0, last: 0 },
    ]
    const [a, b, c] = mergeSteam(items, lib, NOW)
    expect(a).toMatchObject({ steamMin: 420, recentMin: 120, sessions: [{ d: '2026-10-23', m: 120 }] })
    expect(a.lastPlayed).toBe(new Date(last * 1000).toISOString())
    expect(b).toMatchObject({ steamAppId: 620, steamMin: 50 })
    expect(b.sessions).toBeUndefined() // first link isn't "new" play
    expect(c).toBe(items[2])
    expect(normName('Portal 2™')).toBe(normName('portal 2'))
  })

  it('suggests the quickest finishes first', () => {
    const items = [
      g({ name: 'Long RPG', ttb: { main: 80 } }),
      g({ name: 'Short indie', ttb: { main: 5 } }),
      g({ name: 'Half done', ttb: { main: 20 }, manualMin: 13 * 60, status: 'paused' }),
      g({ name: 'Unknown', manualMin: 10 }),
      g({ name: 'Playing now', status: 'playing', ttb: { main: 2 } }),
      g({ name: 'Done', status: 'finished', ttb: { main: 1 } }),
    ]
    const s = suggestNext(items, undefined, 4)
    expect(s.map((x) => x.game.name)).toEqual(['Half done', 'Short indie', 'Long RPG', 'Unknown'])
    expect(s[0].reason).toBe('You’re 65% through — about 7 h left')
    expect(s[1].reason).toBe('A short one — about 5 h to beat')
    expect(s[3].reason).toBe('No time-to-beat yet')
  })

  it('spots stale games and counts wins', () => {
    const items = [
      g({ name: 'Old', status: 'playing', lastPlayed: '2026-09-20T10:00:00Z' }),
      g({ name: 'Fresh', status: 'playing', lastPlayed: '2026-10-22T10:00:00Z' }),
      g({ name: 'Never', status: 'playing', started: '2026-10-01T10:00:00Z' }),
      g({ name: 'Snoozed', status: 'playing', lastPlayed: '2026-09-01T10:00:00Z', snoozed: '2026-10-20T10:00:00Z' }),
      g({ name: 'W1', status: 'finished', finished: '2026-03-01T10:00:00Z' }),
      g({ name: 'W0', status: 'finished', finished: '2025-12-01T10:00:00Z' }),
    ]
    expect(staleGames(items, NOW).map((x) => x.name)).toEqual(['Old', 'Never'])
    expect(finishedThisYear(items, NOW)).toBe(1)
  })

  it('formats hours and normalizes stored data', () => {
    expect(fmtHours(0.4)).toBe('24 min')
    expect(fmtHours(3.26)).toBe('3.5 h')
    expect(fmtHours(42.4)).toBe('42 h')
    expect(fmtHours(null)).toBe('?')
    const n = normalizeGames({ items: [{ name: 'ok', status: 'playing' }, { name: 'bad', status: 'nope' }, null], settings: { playingLimit: 2 } })
    expect(n.items).toHaveLength(1)
    expect(n.settings).toEqual({ playingLimit: 2, sessionMinutes: 60, goal: 'main' })
  })
})
