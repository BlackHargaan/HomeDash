import { describe, it, expect } from 'vitest'
import {
  BUILT_IN_BOOSTS, BOOST_KINDS, boostPool, periodIndex, nextChange, pickBoost, addBoosts, cleanBoost, normalizeBoosts,
} from '../boosts.js'

describe('daily boosts', () => {
  it('has a well-formed built-in library', () => {
    const ids = new Set(BUILT_IN_BOOSTS.map((b) => b.id))
    expect(ids.size).toBe(BUILT_IN_BOOSTS.length)
    for (const b of BUILT_IN_BOOSTS) {
      expect(BOOST_KINDS[b.kind]).toBeTruthy()
      expect(cleanBoost(b)).toBeTruthy()
    }
    for (const kind of Object.keys(BOOST_KINDS)) expect(BUILT_IN_BOOSTS.filter((b) => b.kind === kind).length).toBeGreaterThan(15)
  })

  it('counts periods in local time', () => {
    const at = (h, m = 0) => new Date(2026, 9, 24, h, m)
    expect(periodIndex(at(9, 10), 'hour')).toBe(periodIndex(at(9, 59), 'hour'))
    expect(periodIndex(at(10), 'hour')).toBe(periodIndex(at(9), 'hour') + 1)
    expect(periodIndex(at(9, 29), '30m') + 1).toBe(periodIndex(at(9, 30), '30m'))
    expect(periodIndex(at(23, 59), 'day')).toBe(periodIndex(at(0, 0), 'day'))
    expect(periodIndex(new Date(2026, 9, 25, 0, 0), 'day')).toBe(periodIndex(at(12), 'day') + 1)
    // the last 3-hour block of one day is followed by the first of the next
    expect(periodIndex(new Date(2026, 9, 25, 0, 0), '3h')).toBe(periodIndex(at(22), '3h') + 1)
    expect(nextChange(at(9, 10), 'hour')).toEqual(at(10))
    expect(nextChange(at(9, 10), '30m')).toEqual(at(9, 30))
    expect(nextChange(at(9, 10), 'day')).toEqual(new Date(2026, 9, 25, 0, 0))
  })

  it('shows every entry once before repeating', () => {
    const pool = boostPool(null, { kinds: ['uplift'] })
    const n = pool.length
    const round1 = Array.from({ length: n }, (_, i) => pickBoost(pool, 1000 * n + i).id)
    expect(new Set(round1).size).toBe(n)
    const round2 = Array.from({ length: n }, (_, i) => pickBoost(pool, 1001 * n + i).id)
    expect(round2).not.toEqual(round1) // reshuffled each round
    expect(pickBoost(pool, 5)).toEqual(pickBoost(pool, 5)) // deterministic
    expect(pickBoost(pool, -3)).toBeTruthy()
    expect(pickBoost([], 3)).toBe(null)
  })

  it('filters by kind, hidden and favourites', () => {
    const store = { favorites: ['s01', 'u02'], hidden: ['s02'] }
    expect(boostPool(store, { kinds: ['strategy'] }).some((b) => b.id === 's02')).toBe(false)
    expect(boostPool(store, { favoritesOnly: true }).map((b) => b.id)).toEqual(['s01', 'u02'])
    expect(boostPool(store, { kinds: ['insight'] }).every((b) => b.kind === 'insight')).toBe(true)
  })

  it('adds entries, skipping duplicates and junk', () => {
    let n = 0
    const r = addBoosts(null, [
      { kind: 'strategy', text: 'Try the Pomodoro method.', detail: '25 minutes on, 5 off.' },
      { kind: 'uplift', text: 'Done is better than perfect!' }, // already built in
      { kind: 'uplift', text: 'You showed up today.', detail: 'dropped for uplifts' },
      { kind: 'nope', text: 'Unknown kind' },
      { kind: 'strategy', text: 'try the pomodoro METHOD' }, // duplicate within the batch
      { kind: 'insight', text: '' },
    ], { source: 'assistant', makeId: () => `c${++n}` })
    expect(r.added.map((b) => b.text)).toEqual(['Try the Pomodoro method.', 'You showed up today.'])
    expect(r.added[1].detail).toBeUndefined()
    expect(r.added[0]).toMatchObject({ id: 'c1', source: 'assistant' })
    expect(r.skipped).toBe(4)
    expect(normalizeBoosts(r.store).custom).toHaveLength(2)
    expect(boostPool(r.store, { kinds: ['strategy'] }).some((b) => b.id === 'c1')).toBe(true)
  })
})
