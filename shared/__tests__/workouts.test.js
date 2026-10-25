import { describe, it, expect } from 'vitest'
import {
  EXERCISES, REGIONS, available, canDo, generatePlan, suggestLoad, nextWeight, weekStats, workoutEvent, normalizeWorkouts, exerciseCount,
} from '../workouts.js'

// A shed: bench, barbell with 300 lb, 15 and 30 lb dumbbells, no rack.
const SHED = { have: { bench: true, barbell: true, dumbbells: true }, barbellMax: 300, dumbbellWeights: [15, 30], unit: 'lb', where: 'Shed', goal: 'muscle', minutes: 45 }
const byName = (n) => EXERCISES.find((e) => e.name === n)

describe('workouts', () => {
  it('only offers what the equipment allows', () => {
    const names = available(SHED).map((e) => e.name)
    expect(names).not.toContain('Barbell bench press') // needs a rack
    expect(names).not.toContain('Barbell back squat')
    expect(names).not.toContain('Pull-up')
    expect(names).toEqual(expect.arrayContaining(['Barbell floor press', 'Zercher squat', 'Dumbbell bench press', 'Deadlift', 'Barbell hip thrust']))
    expect(canDo(byName('Push-up'), { have: {} })).toBe(true)
    expect(canDo(byName('Barbell bench press'), { have: { ...SHED.have, rack: true } })).toBe(true)
  })

  it('suggests loads from the dumbbells on hand', () => {
    expect(suggestLoad(byName('Lateral raise'), SHED)).toBe('15 lb')
    expect(suggestLoad(byName('Goblet squat'), SHED)).toBe('30 lb (one dumbbell)')
    expect(suggestLoad(byName('Deadlift'), SHED)).toBe('leave 2 reps in the tank')
    expect(suggestLoad(byName('Bulgarian split squat'), { have: { bench: true } })).toBe('bodyweight')
    expect(suggestLoad(byName('Plank'), SHED)).toBe(null)
  })

  it('generates region plans that fit the setup', () => {
    for (const region of Object.keys(REGIONS)) {
      for (const minutes of [20, 30, 45, 60]) {
        const p = generatePlan({ region, minutes, setup: SHED, seed: minutes * 7 })
        expect(p.exercises.length).toBeGreaterThan(0)
        expect(p.exercises.length).toBeLessThanOrEqual(exerciseCount(minutes))
        expect(new Set(p.exercises.map((x) => x.name)).size).toBe(p.exercises.length)
        for (const x of p.exercises) expect(canDo(byName(x.name), SHED)).toBe(true)
      }
    }
    const chest = generatePlan({ region: 'chest', minutes: 45, setup: SHED, seed: 1 })
    expect(chest.exercises.length).toBe(5)
    expect(byName(chest.exercises[0].name).muscles[0]).toBe('chest')
    expect(chest.exercises.findIndex((x) => byName(x.name).iso)).toBeGreaterThan(0) // compounds first
    expect(chest.tips.join(' ')).toMatch(/No rack/)
    expect(chest.name).toBe('Chest workout')
    const strength = generatePlan({ region: 'legs', goal: 'strength', setup: SHED, seed: 3 })
    expect(strength.exercises[0]).toMatchObject({ sets: 5, reps: '5', rest: '2–3 min' })
    // different seeds vary the pick; the same seed repeats it
    const a = generatePlan({ region: 'full', setup: SHED, seed: 11 }).exercises.map((x) => x.name)
    expect(generatePlan({ region: 'full', setup: SHED, seed: 11 }).exercises.map((x) => x.name)).toEqual(a)
    const seen = new Set(Array.from({ length: 8 }, (_, i) => generatePlan({ region: 'full', setup: SHED, seed: i + 1 }).exercises.map((x) => x.name).join()))
    expect(seen.size).toBeGreaterThan(1)
    // bodyweight only still works
    expect(generatePlan({ region: 'upper', setup: { have: {} }, seed: 2 }).exercises.length).toBeGreaterThan(2)
  })

  it('progresses weights from the log', () => {
    const log = [
      { date: '2026-10-20T18:00:00Z', exercises: [{ name: 'Deadlift', sets: 4, done: 4, weight: '185 lb' }, { name: 'Goblet squat', sets: 4, done: 3, weight: '30 lb' }] },
      { date: '2026-10-22T18:00:00Z', exercises: [{ name: 'Lateral raise', sets: 3, done: 3, weight: '15 lb' }] },
    ]
    expect(nextWeight(log, 'Deadlift', SHED)).toBe('190 lb')
    expect(nextWeight(log, 'Goblet squat', SHED)).toBe('30 lb') // not all sets done → same
    expect(nextWeight(log, 'Lateral raise', SHED)).toBe('30 lb') // next dumbbell up
    expect(nextWeight([{ date: 'x', exercises: [{ name: 'Dumbbell curl', sets: 3, done: 3, weight: '30 lb' }] }], 'Dumbbell curl', SHED)).toMatch(/slow the lowering/)
    expect(nextWeight([{ date: 'x', exercises: [{ name: 'Deadlift', sets: 3, done: 3, weight: '300 lb' }] }], 'Deadlift', SHED)).toBe('300 lb') // capped at what's on hand
    expect(nextWeight(log, 'Push-up', SHED)).toBe(null)
  })

  it('makes calendar events and weekly stats', () => {
    let n = 0
    const plan = { id: 'p1', name: 'Push day', minutes: 40, warmup: 'Walk', exercises: [{ name: 'Barbell floor press', sets: 4, reps: '8–10', weight: '135 lb' }], tips: ['No rack.'] }
    const ev = workoutEvent(plan, { start: new Date(2026, 9, 26, 18, 0), byday: ['MO', 'TH'], calendarId: 'cal_personal', location: 'Shed', makeId: (p) => `${p}${++n}` })
    expect(ev).toMatchObject({ title: '💪 Push day', workout: { planId: 'p1' }, location: 'Shed', recurrence: { freq: 'WEEKLY', byday: ['MO', 'TH'] } })
    expect(new Date(ev.end) - new Date(ev.start)).toBe(40 * 60000)
    expect(ev.description).toContain('• Barbell floor press — 4 × 8–10 @ 135 lb')
    const now = new Date(2026, 9, 25, 12) // Sunday
    expect(weekStats([{ date: new Date(2026, 9, 19, 9).toISOString(), minutes: 30 }, { date: new Date(2026, 9, 24, 9).toISOString(), minutes: 45 }, { date: new Date(2026, 9, 12).toISOString(), minutes: 50 }], now)).toEqual({ workouts: 2, minutes: 75 })
    expect(normalizeWorkouts(null)).toEqual({ setup: null, plans: [], log: [] })
  })
})
