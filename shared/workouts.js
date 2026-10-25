// Workouts: plans by body region that fit the equipment you actually have.
//
// Stored under the `workouts` key:
//   { setup: Setup | null, plans: [Plan], log: [Session] }
//   Setup   = { have: { bench, barbell, rack, dumbbells, kettlebell, pullupBar, bands }, barbellMax,
//               dumbbellWeights: [n], kettlebellWeights: [n], unit: 'lb'|'kg', where, goal, minutes }
//   Plan    = { id, name, region, goal, minutes, source: 'generated'|'assistant'|'you',
//               warmup, exercises: [{ name, sets, reps, rest, weight?, note? }], tips: [], created }
//   Session = { id, date, planId, planName, region, minutes, exercises: [{ name, sets, done, reps, weight }], note? }
// Scheduled workouts are ordinary calendar events carrying { workout: { planId } }.

export const EQUIPMENT = {
  bench: 'Bench',
  barbell: 'Barbell',
  rack: 'Squat / power rack',
  dumbbells: 'Dumbbells',
  kettlebell: 'Kettlebell',
  pullupBar: 'Pull-up bar',
  bands: 'Resistance bands',
}

export const GOALS = {
  strength: { label: 'Get stronger', compound: [5, '5'], isolation: [3, '8'], restC: '2–3 min', restI: '90 s' },
  muscle: { label: 'Build muscle', compound: [4, '8–10'], isolation: [3, '10–12'], restC: '90 s', restI: '60 s' },
  endurance: { label: 'Endurance & tone', compound: [3, '15'], isolation: [3, '15–20'], restC: '60 s', restI: '45 s' },
}

const LOWER = ['quads', 'hamstrings', 'glutes']
export const REGIONS = {
  chest: { label: 'Chest', muscles: ['chest', 'chest', 'triceps'] },
  back: { label: 'Back', muscles: ['back', 'back', 'biceps'] },
  shoulders: { label: 'Shoulders', muscles: ['shoulders', 'shoulders', 'back'] },
  arms: { label: 'Arms', muscles: ['biceps', 'triceps'] },
  legs: { label: 'Legs & glutes', muscles: [...LOWER, 'calves'] },
  core: { label: 'Core', muscles: ['core'] },
  push: { label: 'Push', muscles: ['chest', 'shoulders', 'triceps'] },
  pull: { label: 'Pull', muscles: ['back', 'biceps', 'back'] },
  upper: { label: 'Upper body', muscles: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
  full: { label: 'Full body', muscles: ['quads', 'chest', 'back', 'hamstrings', 'shoulders', 'core'] },
}

// needs: equipment all required ('bodyweight' needs nothing). load: which weights apply.
// iso: isolation move (lighter, more reps). hold: timed.
// pattern: movement family — a plan uses each family once while it has other options.
const PATTERN = Object.fromEntries(Object.entries({
  'h-press': ['bb-bench', 'bb-floor-press', 'db-bench', 'db-floor-press'],
  'pushup': ['pushup', 'decline-pushup', 'diamond-pushup'],
  'deadlift': ['deadlift'],
  'rdl': ['rdl', 'db-rdl', 'kb-swing'],
  'row': ['bb-row', 'pendlay-row', 'db-row'],
  'shrug': ['bb-shrug', 'db-shrug'],
  'v-press': ['ohp', 'db-press', 'arnold-press', 'pike-pushup'],
  'curl': ['bb-curl', 'db-curl', 'hammer-curl', 'concentration-curl'],
  'tri-ext': ['skull-crusher', 'oh-extension'],
  'tri-bw': ['bench-dip'],
  'squat': ['back-squat', 'front-squat', 'zercher-squat', 'goblet-squat'],
  'single-leg': ['bulgarian', 'step-up', 'reverse-lunge'],
  'bridge': ['hip-thrust', 'glute-bridge'],
  'plank': ['plank', 'side-plank'],
}).flatMap(([family, ids]) => ids.map((id) => [id, family])))
const X = (id, name, muscles, needs, load, cue, extra = {}) => ({ id, name, muscles, needs, load, cue, pattern: PATTERN[id] || id, ...extra })
export const EXERCISES = [
  // chest
  X('bb-bench', 'Barbell bench press', ['chest', 'triceps', 'shoulders'], ['barbell', 'bench', 'rack'], 'barbell', 'Use the rack’s safeties or a spotter.'),
  X('bb-floor-press', 'Barbell floor press', ['chest', 'triceps'], ['barbell'], 'barbell', 'No rack needed: sit with the bar over your hips, lie back and press. Elbows touch the floor each rep.'),
  X('db-bench', 'Dumbbell bench press', ['chest', 'triceps', 'shoulders'], ['dumbbells', 'bench'], 'dumbbell', 'Kick the dumbbells up from your knees as you lie back.'),
  X('db-floor-press', 'Dumbbell floor press', ['chest', 'triceps'], ['dumbbells'], 'dumbbell', 'Pause with elbows on the floor, then press.'),
  X('db-fly', 'Dumbbell fly', ['chest'], ['dumbbells', 'bench'], 'dumbbell', 'Soft elbows; lower until you feel a stretch, not further.', { iso: true }),
  X('pushup', 'Push-up', ['chest', 'triceps', 'shoulders'], [], 'bodyweight', 'Body in one line; chest to a fist’s height off the floor.', { reps: '2 short of max' }),
  X('decline-pushup', 'Decline push-up (feet on bench)', ['chest', 'shoulders'], ['bench'], 'bodyweight', 'Harder than a regular push-up — great when weights run out.'),
  X('db-pullover', 'Dumbbell pullover', ['chest', 'back'], ['dumbbells', 'bench'], 'dumbbell', 'Lie across the bench; lower the dumbbell behind your head with slightly bent arms.', { iso: true }),
  // back
  X('deadlift', 'Deadlift', ['back', 'hamstrings', 'glutes'], ['barbell'], 'barbell', 'Bar over mid-foot, flat back, push the floor away.'),
  X('bb-row', 'Barbell bent-over row', ['back', 'biceps'], ['barbell'], 'barbell', 'Hinge to about 45°, pull to your lower ribs.'),
  X('pendlay-row', 'Pendlay row', ['back'], ['barbell'], 'barbell', 'Each rep starts from the floor; explosive pull, controlled lower.'),
  X('db-row', 'One-arm dumbbell row', ['back', 'biceps'], ['dumbbells', 'bench'], 'dumbbell', 'Hand and knee on the bench; pull the dumbbell to your hip.'),
  X('pullup', 'Pull-up', ['back', 'biceps'], ['pullupBar'], 'bodyweight', 'Full hang to chin over bar. Use a band if you need help.', { reps: '1 short of max' }),
  X('band-pull-apart', 'Band pull-apart', ['back', 'shoulders'], ['bands'], 'band', 'Arms straight, squeeze shoulder blades together.', { iso: true }),
  X('bb-shrug', 'Barbell shrug', ['back'], ['barbell'], 'barbell', 'Shoulders straight up to your ears, pause, lower slowly.', { iso: true }),
  X('db-shrug', 'Dumbbell shrug', ['back'], ['dumbbells'], 'dumbbell', 'Hold the top for a second.', { iso: true }),
  X('superman', 'Superman hold', ['back', 'core'], [], 'bodyweight', 'Lift arms and legs off the floor and hold.', { iso: true, hold: true }),
  // shoulders
  X('ohp', 'Barbell overhead press', ['shoulders', 'triceps'], ['barbell'], 'barbell', 'No rack: clean the bar from the floor to your shoulders first. Squeeze glutes, press straight up.'),
  X('landmine-press', 'Landmine press', ['shoulders', 'chest'], ['barbell'], 'barbell', 'Wedge one end of the bar into a corner (protect the wall with a towel) and press the other end up.'),
  X('db-press', 'Dumbbell shoulder press', ['shoulders', 'triceps'], ['dumbbells'], 'dumbbell', 'Seated on the bench or standing; don’t arch your lower back.'),
  X('arnold-press', 'Arnold press', ['shoulders'], ['dumbbells'], 'dumbbell', 'Start palms facing you, rotate as you press.'),
  X('lateral-raise', 'Lateral raise', ['shoulders'], ['dumbbells'], 'dumbbell', 'Lead with your elbows, stop at shoulder height.', { iso: true }),
  X('rear-fly', 'Bent-over rear-delt fly', ['shoulders', 'back'], ['dumbbells'], 'dumbbell', 'Hinge forward, open arms wide like wings.', { iso: true }),
  X('pike-pushup', 'Pike push-up', ['shoulders', 'triceps'], [], 'bodyweight', 'Hips high, lower the top of your head toward the floor.'),
  // arms
  X('bb-curl', 'Barbell curl', ['biceps'], ['barbell'], 'barbell', 'Elbows pinned to your sides; no swinging.', { iso: true }),
  X('db-curl', 'Dumbbell curl', ['biceps'], ['dumbbells'], 'dumbbell', 'Twist your pinky up at the top.', { iso: true }),
  X('hammer-curl', 'Hammer curl', ['biceps'], ['dumbbells'], 'dumbbell', 'Palms facing each other.', { iso: true }),
  X('concentration-curl', 'Concentration curl', ['biceps'], ['dumbbells', 'bench'], 'dumbbell', 'Seated, elbow braced on your inner thigh.', { iso: true }),
  X('skull-crusher', 'Skull crusher', ['triceps'], ['barbell', 'bench'], 'barbell', 'Light weight — lower the bar to your forehead, elbows pointing up.', { iso: true }),
  X('close-floor-press', 'Close-grip floor press', ['triceps', 'chest'], ['barbell'], 'barbell', 'Hands shoulder-width; elbows tucked.'),
  X('oh-extension', 'Overhead dumbbell triceps extension', ['triceps'], ['dumbbells'], 'dumbbell', 'Hold one dumbbell with both hands behind your head.', { iso: true }),
  X('bench-dip', 'Bench dip', ['triceps'], ['bench'], 'bodyweight', 'Hands on the bench edge, lower until elbows reach 90°.', { iso: true }),
  X('diamond-pushup', 'Diamond push-up', ['triceps', 'chest'], [], 'bodyweight', 'Hands together under your chest.', { iso: true }),
  // legs & glutes
  X('back-squat', 'Barbell back squat', ['quads', 'glutes'], ['barbell', 'rack'], 'barbell', 'Set the safeties just below your bottom position.'),
  X('front-squat', 'Front squat', ['quads', 'glutes', 'core'], ['barbell'], 'barbell', 'No rack: clean the bar to your shoulders from the floor. Keep the weight moderate.'),
  X('zercher-squat', 'Zercher squat', ['quads', 'glutes', 'core'], ['barbell'], 'barbell', 'No rack: deadlift the bar, rest it on your thighs, hook it in the crook of your elbows and stand.'),
  X('goblet-squat', 'Goblet squat', ['quads', 'glutes'], ['dumbbells'], 'dumbbell', 'Hold one dumbbell at your chest; sit between your heels.'),
  X('rdl', 'Romanian deadlift', ['hamstrings', 'glutes'], ['barbell'], 'barbell', 'Soft knees, push hips back until you feel your hamstrings, then stand.'),
  X('db-rdl', 'Dumbbell Romanian deadlift', ['hamstrings', 'glutes'], ['dumbbells'], 'dumbbell', 'Dumbbells slide down the front of your thighs.'),
  X('bulgarian', 'Bulgarian split squat', ['quads', 'glutes'], ['bench'], 'dumbbell', 'Back foot on the bench; hold dumbbells if you have them.', { optionalLoad: true }),
  X('step-up', 'Step-up onto bench', ['quads', 'glutes'], ['bench'], 'dumbbell', 'Drive through the heel on the bench; control the way down.', { optionalLoad: true }),
  X('reverse-lunge', 'Reverse lunge', ['quads', 'glutes'], [], 'dumbbell', 'Step back, both knees to 90°. Hold dumbbells for more.', { optionalLoad: true }),
  X('hip-thrust', 'Barbell hip thrust', ['glutes', 'hamstrings'], ['barbell', 'bench'], 'barbell', 'Shoulders on the bench, bar over your hips (pad it), drive up and squeeze.'),
  X('glute-bridge', 'Glute bridge', ['glutes'], [], 'bodyweight', 'Squeeze at the top for two seconds.', { iso: true }),
  X('calf-raise', 'Single-leg calf raise', ['calves'], [], 'dumbbell', 'On a step if you have one; full stretch at the bottom. Hold a dumbbell for more.', { iso: true, optionalLoad: true }),
  X('kb-swing', 'Kettlebell swing', ['hamstrings', 'glutes'], ['kettlebell'], 'kettlebell', 'Hinge, snap your hips; arms just guide the bell.'),
  // core
  X('plank', 'Plank', ['core'], [], 'bodyweight', 'Squeeze glutes and brace like someone’s about to poke your stomach.', { iso: true, hold: true }),
  X('side-plank', 'Side plank', ['core'], [], 'bodyweight', 'Each side. Hips high.', { iso: true, hold: true }),
  X('dead-bug', 'Dead bug', ['core'], [], 'bodyweight', 'Lower back pressed into the floor the whole time.', { iso: true }),
  X('leg-raise', 'Lying leg raise', ['core'], ['bench'], 'bodyweight', 'Hold the bench behind your head; lower slowly.', { iso: true }),
  X('russian-twist', 'Russian twist', ['core'], ['dumbbells'], 'dumbbell', 'Lean back slightly, rotate from your ribs.', { iso: true }),
  X('suitcase-hold', 'Suitcase hold / carry', ['core', 'back'], ['dumbbells'], 'dumbbell', 'Heaviest dumbbell in one hand; stand tall without leaning. Walk if there’s room.', { iso: true, hold: true }),
  X('bb-rollout', 'Barbell rollout', ['core'], ['barbell'], 'bodyweight', 'From your knees, roll a loaded bar (round plates) forward and back. Advanced — go short at first.', { iso: true }),
]

export const DEFAULT_SETUP = {
  have: {}, barbellMax: 0, dumbbellWeights: [], kettlebellWeights: [], unit: 'lb', where: '', goal: 'muscle', minutes: 45,
}

export function normalizeWorkouts(v) {
  const o = v && typeof v === 'object' ? v : {}
  return {
    setup: o.setup ? { ...DEFAULT_SETUP, ...o.setup, have: { ...(o.setup.have || {}) } } : null,
    plans: Array.isArray(o.plans) ? o.plans.filter((p) => p && p.name && Array.isArray(p.exercises)) : [],
    log: Array.isArray(o.log) ? o.log : [],
  }
}

export function canDo(ex, setup) {
  const have = setup?.have || {}
  return ex.needs.every((n) => have[n])
}

export const available = (setup) => EXERCISES.filter((e) => canDo(e, setup))

const nums = (list) => [...new Set((list || []).map(Number).filter((n) => n > 0))].sort((a, b) => a - b)

// A sensible starting load from what's on hand: isolation moves get the
// lightest dumbbells, big lifts the heaviest.
export function suggestLoad(ex, setup) {
  const u = setup?.unit || 'lb'
  if (ex.load === 'dumbbell' && setup?.have?.dumbbells) {
    const w = nums(setup.dumbbellWeights)
    if (!w.length) return ex.optionalLoad ? 'bodyweight' : null
    const pick = ex.iso ? w[0] : w[w.length - 1]
    return `${pick} ${u}${ex.id === 'goblet-squat' || ex.id === 'oh-extension' ? ' (one dumbbell)' : ''}`
  }
  if (ex.load === 'kettlebell' && setup?.have?.kettlebell) {
    const w = nums(setup.kettlebellWeights)
    return w.length ? `${w[w.length - 1]} ${u}` : null
  }
  if (ex.load === 'barbell') return 'leave 2 reps in the tank'
  if (ex.optionalLoad) return 'bodyweight'
  return null
}

function seeded(seed) {
  let a = seed >>> 0 || 1
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export const exerciseCount = (minutes) => (minutes <= 20 ? 3 : minutes <= 30 ? 4 : minutes <= 45 ? 5 : 6)

function prescribe(ex, goal) {
  const g = GOALS[goal] || GOALS.muscle
  if (ex.hold) return { sets: 3, reps: goal === 'strength' ? '20–30 s' : '30–45 s', rest: '45 s' }
  if (ex.reps) return { sets: 3, reps: ex.reps, rest: g.restI }
  const [sets, reps] = ex.iso ? g.isolation : g.compound
  return { sets, reps, rest: ex.iso ? g.restI : g.restC }
}

// Build a plan for a region from the exercises your equipment allows:
// compound lifts first, then isolation, covering the region's muscles in turn.
export function generatePlan({ region = 'full', minutes, goal, setup, seed = Date.now(), name } = {}) {
  const s = { ...DEFAULT_SETUP, ...(setup || {}) }
  minutes = minutes || s.minutes || 45
  goal = goal || s.goal || 'muscle'
  const r = REGIONS[region] || REGIONS.full
  const rand = seeded(seed)
  // Loaded lifts win over bodyweight ones when you have the gear; the
  // random part varies the plan each time.
  const pool = available(s).map((e) => ({ e, k: rand() + (e.load === 'bodyweight' || (e.optionalLoad && !s.have.dumbbells) ? 0.6 : 0) }))
  const n = exerciseCount(minutes)
  const picked = []
  const used = new Set()
  const families = new Set()
  const wants = [...r.muscles]
  // Each pass walks the region's muscles; first pass takes compounds only.
  for (let pass = 0; picked.length < n && pass < 4; pass++) {
    for (const m of wants) {
      if (picked.length >= n) break
      const options = pool
        .filter(({ e }) => !used.has(e.id) && e.muscles[0] === m && (pass > 0 || !e.iso) && (pass > 1 || !families.has(e.pattern)))
        .sort((a, b) => a.k - b.k)
      const choice = options[0] || (pass > 1 ? pool.filter(({ e }) => !used.has(e.id) && e.muscles.includes(m)).sort((a, b) => a.k - b.k)[0] : null)
      if (choice) { picked.push(choice.e); used.add(choice.e.id); families.add(choice.e.pattern) }
    }
  }
  // Big lifts first.
  const order = (e) => (e.iso ? 2 : e.load === 'bodyweight' ? 1 : 0)
  picked.sort((a, b) => order(a) - order(b))
  const exercises = picked.map((e) => {
    const load = suggestLoad(e, s)
    return { name: e.name, ...prescribe(e, goal), ...(load ? { weight: load } : {}), note: e.cue, exerciseId: e.id }
  })
  const tips = []
  const dbs = nums(s.dumbbellWeights)
  if (exercises.some((x) => /dumbbell|Goblet|Bulgarian|Step-up|lunge/i.test(x.name)) && dbs.length && dbs[dbs.length - 1] <= 35) {
    tips.push(`Your heaviest dumbbells are ${dbs[dbs.length - 1]} ${s.unit}. If a set feels easy, slow the lowering to 3 seconds, pause at the bottom, or work one side at a time.`)
  }
  if (s.have.barbell && !s.have.rack && picked.some((e) => e.load === 'barbell')) {
    tips.push('No rack: every barbell lift here starts from the floor. Stay well within what you can lift without a spotter, and never press heavy over your face.')
  }
  return {
    name: name || `${r.label} workout`,
    region, goal, minutes,
    warmup: '5 minutes of easy movement (brisk walk, jumping jacks, arm circles), then 1–2 light sets of the first exercise.',
    exercises, tips,
  }
}

// ---- History & progress

export function lastSessionOf(log, exerciseName) {
  for (let i = log.length - 1; i >= 0; i--) {
    const hit = log[i].exercises?.find((x) => x.name === exerciseName && x.weight)
    if (hit) return { ...hit, date: log[i].date }
  }
  return null
}

// What to load next time: same weight, or a bit more if every set was done.
export function nextWeight(log, exerciseName, setup) {
  const last = lastSessionOf(log, exerciseName)
  if (!last) return null
  const n = parseFloat(last.weight)
  if (!n || !(last.done >= last.sets)) return last.weight
  const ex = EXERCISES.find((e) => e.name === exerciseName)
  const unit = setup?.unit || 'lb'
  if (ex?.load === 'barbell') {
    const step = unit === 'kg' ? 2.5 : 5
    const max = Number(setup?.barbellMax) || Infinity
    return `${Math.min(max, n + step)} ${unit}`
  }
  if (ex?.load === 'dumbbell') {
    const up = nums(setup?.dumbbellWeights).find((w) => w > n)
    return up ? `${up} ${unit}` : `${n} ${unit} — slow the lowering for more challenge`
  }
  return last.weight
}

export function weekStats(log, now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)) // Monday
  const week = log.filter((s) => new Date(s.date) >= start)
  return { workouts: week.length, minutes: week.reduce((a, s) => a + (s.minutes || 0), 0) }
}

// ---- Calendar

export function planText(plan) {
  const lines = plan.exercises.map((x) => `• ${x.name} — ${x.sets} × ${x.reps}${x.weight ? ` @ ${x.weight}` : ''}`)
  return [plan.warmup ? `Warm-up: ${plan.warmup}` : null, ...lines, ...(plan.tips || []).map((t) => `Tip: ${t}`)].filter(Boolean).join('\n')
}

// A calendar event for a plan; `byday` (["MO","TH"]) makes it weekly.
export function workoutEvent(plan, { start, byday, calendarId, location, makeId }) {
  const s = new Date(start)
  const end = new Date(s.getTime() + (plan.minutes || 45) * 60000)
  const ev = {
    id: makeId('evt'), uid: makeId('uid'), title: `💪 ${plan.name}`, description: planText(plan), location: location || '',
    start: s.toISOString(), end: end.toISOString(), allDay: false, color: null, calendarId, source: 'local',
    reminderMinutes: 15, workout: { planId: plan.id },
  }
  if (byday?.length) { ev.recurrence = { freq: 'WEEKLY', interval: 1, byday }; ev.exdates = [] }
  return ev
}
