// Daily Boost: ADHD strategies, reminders of what ADHD is (and isn't), and
// uplifting words, shown on a rotation (every 30 min / hour / 3 hours / day).
//
// The built-in library is below. Your own entries — and the ones the assistant
// adds over time — live in the `boosts` store as plain JSON:
//   { custom: [{ id, kind, text, detail?, source, added }], favorites: [id], hidden: [id] }
// The rotation walks through every entry in a shuffled order before any
// repeats, then reshuffles for the next round.

export const BOOST_KINDS = {
  strategy: { label: 'Strategy', plural: 'Strategies', icon: '🧭' },
  insight: { label: 'Understanding ADHD', plural: 'Understanding ADHD', icon: '🧠' },
  uplift: { label: 'Uplift', plural: 'Uplifting words', icon: '✨' },
}

export const CADENCES = {
  '30m': { label: 'Every 30 min', minutes: 30 },
  hour: { label: 'Hourly', minutes: 60 },
  '3h': { label: 'Every 3 hours', minutes: 180 },
  day: { label: 'Daily', minutes: 1440 },
}

const S = (id, text, detail) => ({ id, kind: 'strategy', text, detail })
const I = (id, text, detail) => ({ id, kind: 'insight', text, detail })
const U = (id, text) => ({ id, kind: 'uplift', text })

export const BUILT_IN_BOOSTS = [
  S('s01', 'Shrink the first step until it’s almost silly.', 'Not “clean the kitchen” — “put one cup in the dishwasher.” Starting is the hardest part; momentum does the rest.'),
  S('s02', 'Make time visible.', 'Put a clock or a visual timer where you can see it. ADHD time is often “now” or “not now” — a countdown turns “later” into something real.'),
  S('s03', 'Body doubling: work alongside someone.', 'A friend on a call, a café, a co-working stream. Another person’s presence makes it easier to start and to stay on task.'),
  S('s04', 'Use the two-minute rule.', 'If it takes less than two minutes, do it now — before it joins the invisible pile.'),
  S('s05', 'Keep important things in sight.', 'Out of sight is out of mind. Clear bins, open shelves, the bill on top of your keys — put reminders where your eyes already go.'),
  S('s06', 'Write it down the moment you think of it.', 'Working memory is a small whiteboard that wipes itself. Capture tasks and ideas somewhere you trust, then let your brain let go.'),
  S('s07', 'Pair boring tasks with something you enjoy.', 'A podcast for the dishes, a favourite drink for paperwork. Adding interest gives your brain the fuel it’s missing.'),
  S('s08', 'Set a timer for 10 minutes and just begin.', 'You’re allowed to stop when it rings. Often you won’t want to.'),
  S('s09', 'Make a launch pad by the door.', 'One spot for keys, wallet, bag and tomorrow’s things. Fewer decisions in the morning, fewer lost items.'),
  S('s10', 'Add buffer time — then a bit more.', 'Estimate how long it’ll take and add half again. Getting ready, finding things and travelling take time too.'),
  S('s11', 'Turn a big task into a checklist.', 'Ticking small boxes gives quick hits of progress and always shows you the very next thing to do.'),
  S('s12', 'Set alarms for transitions, not just appointments.', 'One to start wrapping up, one to get ready, one to leave. Switching tasks takes real effort — give yourself a nudge.'),
  S('s13', 'Create urgency on purpose.', 'Tell someone when you’ll be done, race a timer, set a mini-deadline. Urgency is one of the things that switches the ADHD brain on.'),
  S('s14', 'Save your best hours for your hardest work.', 'Notice when you’re sharpest and protect that window for the demanding stuff. Do the easy things when energy dips.'),
  S('s15', 'Make good habits frictionless.', 'Lay out your gym clothes, keep the water bottle on your desk. The fewer steps, the more likely it happens.'),
  S('s16', 'Add friction to distractions.', 'Log out of the app, put your phone in another room, use a site blocker during focus time.'),
  S('s17', 'Stuck? Change your surroundings.', 'Move to another room, step outside, stand up. A new setting can reset a stuck brain.'),
  S('s18', 'Use “if–then” plans.', '“If it’s 9am, then I open the report.” Deciding in advance means less deciding in the moment.'),
  S('s19', 'Keep one list, not ten.', 'Scattered sticky notes get lost. One trusted place for tasks makes it easier to see what matters.'),
  S('s20', 'Pick three things for today.', 'Not thirty. Three that matter. Anything else is a bonus.'),
  S('s21', 'Move your body to wake up your brain.', 'A short walk, a stretch or a few jumping jacks can help with focus and restlessness.'),
  S('s22', 'Park distracting thoughts for later.', 'Keep a “parking lot” note. When an idea pulls you away, write it down and come back to it at a set time.'),
  S('s23', 'Try sound to help you focus.', 'Some ADHD brains focus better with background sound — instrumental music, brown noise or café chatter. Experiment.'),
  S('s24', 'Make it a game.', 'Beat your last time, score points, finish before the song ends. Novelty and challenge help start the engine.'),
  S('s25', 'Reward the start, not just the finish.', 'A small treat for getting going teaches your brain that starting feels good.'),
  S('s26', 'Check in with HALT: hungry, angry, lonely, tired?', 'These make focus and feelings harder. Sometimes the fix is a snack, a chat or a rest — not more willpower.'),
  S('s27', 'Leave yourself a note before you switch tasks.', 'Write one line about where you stopped and what’s next. Coming back becomes so much easier.'),
  S('s28', 'Name the feeling, then the next step.', '“I’m overwhelmed. The next step is opening the email.” Naming an emotion can take some of its power away.'),
  S('s29', 'Ask for what helps you.', 'Written instructions, deadlines in your calendar, a quieter spot. Asking for support is a skill, not a weakness.'),
  S('s30', 'Protect your sleep.', 'ADHD and sleep trouble often go together, and tired brains have less focus and patience. A wind-down alarm can help.'),
  S('s31', 'Handle mail and messages once.', 'When you open it, decide right then: do it, schedule it, or let it go.'),
  S('s32', 'Batch similar tasks together.', 'Answer messages in one sitting, run errands in one trip. Fewer switches means less effort.'),
  S('s33', 'Set up your space for the next task now.', 'Open the document, put the tools out, fill the water glass. Future you starts with one less step.'),
  S('s34', 'Use a “done” list, not only a to-do list.', 'Write down what you finished today. It’s proof of progress on the days your brain says you did nothing.'),

  I('i01', 'ADHD isn’t a lack of attention — it’s trouble regulating attention.', 'You may hyperfocus on what interests you and struggle to start what doesn’t. That’s the same brain, not a character flaw.'),
  I('i02', 'ADHD affects executive functions.', 'Planning, starting, prioritising, remembering and switching tasks are the brain’s management skills. ADHD makes them harder to use on demand.'),
  I('i03', 'Time blindness is real.', 'Many people with ADHD sense time as “now” and “not now.” Running late or missing deadlines often comes from this — not from not caring.'),
  I('i04', 'Motivation often runs on interest, not importance.', 'Novelty, challenge, urgency and genuine interest switch the ADHD brain on. Knowing a task matters isn’t always enough — and that isn’t laziness.'),
  I('i05', 'A forgetful moment says nothing about your intelligence.', 'Forgetting why you walked into a room is about working memory, a small mental whiteboard. Writing things down is a smart workaround.'),
  I('i06', 'Emotions can feel bigger and faster with ADHD.', 'Emotional regulation is part of ADHD for many people. Strong feelings are valid, and they pass.'),
  I('i07', 'Criticism and rejection can hit especially hard.', 'Many people with ADHD describe intense hurt from criticism or feeling rejected. Noticing it can help you pause before reacting.'),
  I('i08', 'Hyperfocus is part of ADHD too.', 'Getting so absorbed you lose track of time can be a real strength — and can mean missing meals. Alarms help you come up for air.'),
  I('i09', 'ADHD is neurodevelopmental, not a choice.', 'It’s linked to differences in how the brain develops and works, and it often runs in families. It isn’t caused by bad parenting or a lack of effort.'),
  I('i10', 'Lots of adults are diagnosed later in life.', 'Especially people who learned to mask or compensate. A later diagnosis often brings relief: “So that’s why.”'),
  I('i11', 'Struggling with “easy” things doesn’t mean you’re not capable.', 'ADHD often shows up as a gap between what you know you can do and what you can make yourself do on cue. That gap is the condition, not you.'),
  I('i12', 'Task paralysis is a common ADHD experience.', 'Freezing when there’s too much to do or no clear first step happens to many people with ADHD. Smaller steps and outside structure help.'),
  I('i13', 'Restlessness can live inside your head.', 'In adults, hyperactivity often looks like a busy mind, fidgeting, or finding it hard to relax.'),
  I('i14', 'ADHD can affect sleep, meals and routines.', 'Irregular sleep, forgetting to eat and losing track of routines are common. They’re places where support helps, not personal failures.'),
  I('i15', 'Shame doesn’t fix ADHD — support and strategies do.', 'Years of “just try harder” can leave a lot of self-criticism. What actually helps is structure, tools and kindness.'),
  I('i16', 'Treatment and support can make a real difference.', 'Coaching, therapy, medication, accommodations and strategies help many people. What works is personal — a professional can help you find your mix.'),
  I('i17', 'ADHD often comes with strengths.', 'Creativity, curiosity, energy, quick thinking and calm in a crisis are common. ADHD is not only a list of deficits.'),
  I('i18', 'Needing external structure is okay.', 'Calendars, timers, lists and reminders aren’t crutches. They’re ramps that make the building accessible.'),
  I('i19', 'Switching tasks takes extra effort with ADHD.', 'Transitions draw on executive function. Buffer time and clear cues make them easier.'),
  I('i20', 'ADHD procrastination is often about feelings, not time.', 'A task can feel boring, overwhelming or scary. Making it smaller, more interesting or less scary often unlocks it.'),
  I('i21', 'Inconsistency is part of the picture.', 'Being able to do something brilliantly one day and not at all the next is common with ADHD. It doesn’t mean you weren’t trying.'),

  U('u01', 'You’re not lazy. Your brain just needs a different instruction manual.'),
  U('u02', 'Progress, not perfection. A messy start still counts.'),
  U('u03', 'Done is better than perfect.'),
  U('u04', 'You’ve made it through every hard day so far. That’s a perfect record.'),
  U('u05', 'Your worth isn’t measured by your to-do list.'),
  U('u06', 'Small steps are still steps forward.'),
  U('u07', 'You can start again — as many times as you need.'),
  U('u08', 'Be as kind to yourself as you would be to a friend.'),
  U('u09', 'Your brain isn’t broken. It’s wired differently, and different has strengths.'),
  U('u10', 'Rest is part of the work, not a reward for finishing it.'),
  U('u11', 'One thing at a time is enough.'),
  U('u12', 'Forgetting something doesn’t make you a failure. It makes you human.'),
  U('u13', 'The fact that you keep trying matters.'),
  U('u14', 'Today doesn’t have to be perfect to be good.'),
  U('u15', 'Celebrate the tiny wins — they add up.'),
  U('u16', 'You don’t need to feel motivated to begin. Beginning often brings the motivation.'),
  U('u17', 'Your curiosity, creativity and energy are part of you too.'),
  U('u18', 'Asking for help is a strength.'),
  U('u19', 'What you managed today is enough for today.'),
  U('u20', 'You can do hard things — especially in small pieces.'),
  U('u21', 'Your pace is valid.'),
  U('u22', 'Mistakes are information, not verdicts.'),
  U('u23', 'You are so much more than the things you’ve forgotten.'),
  U('u24', 'Breathe. Notice one thing you can do right now. Do just that.'),
  U('u25', 'The best system is the one that works for you.'),
]

export const EMPTY_BOOSTS = { custom: [], favorites: [], hidden: [] }

export function normalizeBoosts(v) {
  const o = v && typeof v === 'object' ? v : {}
  return {
    custom: Array.isArray(o.custom) ? o.custom.filter((b) => b && BOOST_KINDS[b.kind] && typeof b.text === 'string') : [],
    favorites: Array.isArray(o.favorites) ? o.favorites : [],
    hidden: Array.isArray(o.hidden) ? o.hidden : [],
  }
}

export const allBoosts = (store) => [...BUILT_IN_BOOSTS, ...normalizeBoosts(store).custom]

// The entries a widget rotates through: chosen kinds, minus hidden ones
// (or only favourites).
export function boostPool(store, { kinds = Object.keys(BOOST_KINDS), favoritesOnly = false } = {}) {
  const s = normalizeBoosts(store)
  const fav = new Set(s.favorites)
  const hidden = new Set(s.hidden)
  return allBoosts(s).filter((b) => kinds.includes(b.kind) && !hidden.has(b.id) && (!favoritesOnly || fav.has(b.id)))
}

// ---- Rotation

// Periods count in local time, so "daily" turns over at local midnight.
export function periodIndex(date, cadence = 'hour') {
  const minutes = CADENCES[cadence]?.minutes || 60
  const days = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)
  const minuteOfDay = date.getHours() * 60 + date.getMinutes()
  if (minutes >= 1440) return days
  return days * Math.ceil(1440 / minutes) + Math.floor(minuteOfDay / minutes)
}

export function nextChange(date, cadence = 'hour') {
  const minutes = CADENCES[cadence]?.minutes || 60
  const d = new Date(date)
  if (minutes >= 1440) { d.setHours(24, 0, 0, 0); return d }
  const m = d.getHours() * 60 + d.getMinutes()
  const next = (Math.floor(m / minutes) + 1) * minutes
  d.setHours(0, next, 0, 0)
  return d
}

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function shuffled(items, seed) {
  let a = seed || 1
  const rand = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

// Entry number `index` of the endless rotation: each round is a fresh shuffle
// of the whole pool, so nothing repeats until everything has been shown.
export function pickBoost(pool, index, salt = '') {
  if (!pool.length) return null
  const n = pool.length
  const i = ((index % (n * 1e6)) + n * 1e6) % (n * 1e6)
  const round = Math.floor(i / n)
  const order = shuffled([...pool].sort((a, b) => (a.id < b.id ? -1 : 1)), hash(`${salt}:${round}`))
  return order[i % n]
}

// ---- Adding entries (from the widget, an imported JSON file, or the assistant)

const norm = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function cleanBoost(item) {
  if (!item || typeof item !== 'object') return null
  const kind = String(item.kind || '').toLowerCase()
  const text = String(item.text || '').trim().replace(/\s+/g, ' ')
  const detail = item.detail ? String(item.detail).trim().replace(/\s+/g, ' ') : ''
  if (!BOOST_KINDS[kind] || text.length < 3 || text.length > 280 || detail.length > 500) return null
  return { kind, text, ...(detail && kind !== 'uplift' ? { detail } : {}) }
}

// → { store, added: [entries], skipped: number } — duplicates (same words as an
// existing entry) and invalid items are skipped.
export function addBoosts(store, items, { source = 'you', now = new Date(), makeId } = {}) {
  const s = normalizeBoosts(store)
  const seen = new Set(allBoosts(s).map((b) => norm(b.text)))
  const added = []
  let skipped = 0
  items.forEach((raw, i) => {
    const b = cleanBoost(raw)
    if (!b || seen.has(norm(b.text))) { skipped++; return }
    seen.add(norm(b.text))
    added.push({ id: makeId ? makeId() : `c_${now.getTime().toString(36)}_${i}`, ...b, source, added: now.toISOString() })
  })
  return { store: { ...s, custom: [...s.custom, ...added] }, added, skipped }
}
