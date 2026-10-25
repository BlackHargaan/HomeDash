import { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { usePersistentState, useWidgetState, uid } from '../lib/storage.js'
import { collectOccurrences } from '../../shared/recurrence.js'
import {
  EQUIPMENT, EXERCISES, GOALS, REGIONS, DEFAULT_SETUP, normalizeWorkouts, generatePlan, nextWeight, weekStats, workoutEvent,
} from '../../shared/workouts.js'

const DAYS = [['MO', 'M'], ['TU', 'T'], ['WE', 'W'], ['TH', 'T'], ['FR', 'F'], ['SA', 'S'], ['SU', 'S']]
const DAY_OF = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const DAY_NAME = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' }
const dayList = (codes) => DAYS.map(([c]) => c).filter((c) => codes.includes(c)).map((c) => DAY_NAME[c]).join(' & ').replace(/ & (?=.* & )/g, ', ')
// A number like "30 lb" goes in the weight box; guidance ("leave 2 reps in the tank") is only a hint.
const isLoad = (w) => /^\d/.test(String(w || '').trim())
const bodyweightOnly = (name) => { const e = EXERCISES.find((x) => x.name === name); return e?.load === 'bodyweight' }
const LENGTHS = [20, 30, 45, 60]

const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`)
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec % 60)).padStart(2, '0')}`
const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const dayOf = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

// "90 s" → 90, "2–3 min" → 120
function restSeconds(rest) {
  const m = String(rest || '').match(/(\d+(?:\.\d+)?)/)
  if (!m) return 60
  return Math.round(Number(m[1]) * (/min/.test(rest) ? 60 : 1))
}

function PlanList({ plan, compact }) {
  return (
    <ol className={`wk-ex ${compact ? 'compact' : ''}`}>
      {plan.exercises.map((x, i) => (
        <li key={i}>
          <span className="wk-ex-name">{x.name}</span>
          <span className="wk-ex-rx">{x.sets} × {x.reps}{x.weight ? ` · ${x.weight}` : ''}</span>
          {!compact && x.note && <span className="wk-ex-note">{x.note}</span>}
        </li>
      ))}
    </ol>
  )
}

function ScheduleForm({ plan, onSchedule, onCancel }) {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const pad = (n) => String(n).padStart(2, '0')
  const [date, setDate] = useState(`${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`)
  const [time, setTime] = useState('18:00')
  const [days, setDays] = useState([])
  const toggle = (d) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))
  function submit(e) {
    e.preventDefault()
    const start = new Date(`${date}T${time}`)
    if (isNaN(start)) return
    // A weekly series starts on the first chosen day on/after the date.
    if (days.length) while (!days.includes(DAY_OF[start.getDay()])) start.setDate(start.getDate() + 1)
    onSchedule(plan, start, days)
  }
  return (
    <form className="wk-sched" onSubmit={submit}>
      <div className="wk-row">
        <label>Starting<input className="input sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        <label>At<input className="input sm" type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></label>
      </div>
      <div className="wk-row wk-days" role="group" aria-label="Repeat weekly on">
        <span className="faint">Every week on</span>
        {DAYS.map(([code, l]) => (
          <button key={code} type="button" className={`wk-day ${days.includes(code) ? 'on' : ''}`} aria-pressed={days.includes(code)} aria-label={code} onClick={() => toggle(code)}>{l}</button>
        ))}
      </div>
      <div className="wk-row">
        <button className="btn sm primary" type="submit">📅 {days.length ? 'Add weekly to calendar' : 'Add to calendar'}</button>
        <button className="btn sm" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function SetupForm({ setup, onSave, onCancel }) {
  const [s, setS] = useState(() => ({ ...DEFAULT_SETUP, ...(setup || {}), have: { ...(setup?.have || {}) } }))
  const [dbText, setDbText] = useState((setup?.dumbbellWeights || []).join(', '))
  const [kbText, setKbText] = useState((setup?.kettlebellWeights || []).join(', '))
  const toggle = (k) => setS((x) => ({ ...x, have: { ...x.have, [k]: !x.have[k] } }))
  const parse = (t) => [...new Set(t.split(/[,\s]+/).map(Number).filter((n) => n > 0))].sort((a, b) => a - b)
  return (
    <form className="wk-setup" onSubmit={(e) => { e.preventDefault(); onSave({ ...s, dumbbellWeights: parse(dbText), kettlebellWeights: parse(kbText), barbellMax: Number(s.barbellMax) || 0 }) }}>
      <h4 className="wk-h">What do you train with?</h4>
      <p className="wk-hint faint">Plans only use moves your gear allows. Bodyweight moves are always included.</p>
      <div className="chips">
        {Object.entries(EQUIPMENT).map(([k, label]) => (
          <button key={k} type="button" className={`chip ${s.have[k] ? 'on' : ''}`} aria-pressed={!!s.have[k]} onClick={() => toggle(k)}>{label}</button>
        ))}
      </div>
      {s.have.barbell && (
        <label className="wk-field">Barbell + all plates (total {s.unit})
          <input className="input sm" type="number" min="0" inputMode="numeric" value={s.barbellMax || ''} onChange={(e) => setS({ ...s, barbellMax: e.target.value })} placeholder="e.g. 300" />
        </label>
      )}
      {s.have.barbell && !s.have.rack && <p className="wk-hint faint">No rack — got it. Barbell lifts will start from the floor (floor press, Zercher and front squats, rows, deadlifts…).</p>}
      {s.have.dumbbells && (
        <label className="wk-field">Dumbbell weights you have ({s.unit})
          <input className="input sm" value={dbText} onChange={(e) => setDbText(e.target.value)} placeholder="e.g. 15, 30" />
        </label>
      )}
      {s.have.kettlebell && (
        <label className="wk-field">Kettlebell weights ({s.unit})
          <input className="input sm" value={kbText} onChange={(e) => setKbText(e.target.value)} placeholder="e.g. 35" />
        </label>
      )}
      <label className="wk-field">Where do you train? (optional)
        <input className="input sm" value={s.where} maxLength={80} onChange={(e) => setS({ ...s, where: e.target.value })} placeholder="e.g. Shed, garage, living room" />
      </label>
      <h4 className="wk-h">Units</h4>
      <div className="chips">{['lb', 'kg'].map((u) => <button key={u} type="button" className={`chip ${s.unit === u ? 'on' : ''}`} onClick={() => setS({ ...s, unit: u })}>{u}</button>)}</div>
      <h4 className="wk-h">Main goal</h4>
      <div className="chips">{Object.entries(GOALS).map(([k, g]) => <button key={k} type="button" className={`chip ${s.goal === k ? 'on' : ''}`} onClick={() => setS({ ...s, goal: k })}>{g.label}</button>)}</div>
      <h4 className="wk-h">Usual workout length</h4>
      <div className="chips">{LENGTHS.map((m) => <button key={m} type="button" className={`chip ${s.minutes === m ? 'on' : ''}`} onClick={() => setS({ ...s, minutes: m })}>{m} min</button>)}</div>
      <div className="wk-row wk-foot">
        <button className="btn sm primary" type="submit">Save</button>
        {onCancel && <button className="btn sm" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

function Session({ session, setSession, log, setup, onFinish, onCancel }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const restLeft = session.restUntil ? Math.ceil((session.restUntil - now) / 1000) : 0
  useEffect(() => {
    if (session.restUntil && restLeft <= 0) {
      try { navigator.vibrate?.([200, 100, 200]) } catch { /* not supported */ }
      setSession((s) => ({ ...s, restUntil: null }))
    }
  }, [restLeft <= 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const patchEx = (i, p) => setSession((s) => ({ ...s, exercises: s.exercises.map((x, j) => (j === i ? { ...x, ...p } : x)) }))
  function tickSet(i, k) {
    const x = session.exercises[i]
    const done = k < x.done ? k : k + 1 // tap a done set to undo back to it
    patchEx(i, { done })
    if (done > x.done) setSession((s) => ({ ...s, restUntil: Date.now() + restSeconds(x.rest) * 1000 }))
  }
  const elapsed = Math.floor((now - Date.parse(session.started)) / 1000)
  const total = session.exercises.reduce((a, x) => a + x.sets, 0)
  const doneSets = session.exercises.reduce((a, x) => a + Math.min(x.done, x.sets), 0)

  return (
    <div className="wk-session">
      <div className="wk-session-top">
        <div><b>{session.planName}</b><span className="faint"> · {clock(elapsed)} · {doneSets}/{total} sets</span></div>
      </div>
      {restLeft > 0 && (
        <div className="wk-rest" role="timer" aria-live="polite">
          Rest <b>{clock(restLeft)}</b>
          <button className="btn sm" onClick={() => setSession((s) => ({ ...s, restUntil: s.restUntil + 30000 }))}>+30 s</button>
          <button className="btn sm" onClick={() => setSession((s) => ({ ...s, restUntil: null }))}>Skip</button>
        </div>
      )}
      {session.warmup && <p className="wk-hint faint">Warm-up: {session.warmup}</p>}
      <div className="wk-session-list">
        {session.exercises.map((x, i) => {
          const hint = nextWeight(log, x.name, setup)
          const noLoad = bodyweightOnly(x.name) && !x.weight
          return (
            <div key={i} className={`wk-sx ${x.done >= x.sets ? 'done' : ''}`}>
              <div className="wk-sx-head">
                <span className="wk-ex-name">{x.name}</span>
                <span className="wk-ex-rx">{x.sets} × {x.reps}{x.rest ? ` · rest ${x.rest}` : ''}</span>
              </div>
              {x.note && <div className="wk-ex-note">{x.note}</div>}
              <div className="wk-sx-row">
                {!noLoad && (
                  <input className="input sm wk-weight" value={x.weight || ''} onChange={(e) => patchEx(i, { weight: e.target.value })}
                    placeholder={x.guide || 'weight'} title={x.guide || ''} aria-label={`Weight for ${x.name}`} />
                )}
                <div className="wk-sets" role="group" aria-label={`Sets for ${x.name}`}>
                  {Array.from({ length: x.sets }, (_, k) => (
                    <button key={k} className={`wk-set ${k < x.done ? 'on' : ''}`} onClick={() => tickSet(i, k)} aria-pressed={k < x.done} aria-label={`Set ${k + 1}`}>{k < x.done ? '✓' : k + 1}</button>
                  ))}
                </div>
              </div>
              {hint && <div className="wk-ex-note">Next step: {hint}</div>}
            </div>
          )
        })}
      </div>
      <div className="wk-row wk-foot">
        <button className="btn sm primary" onClick={() => onFinish(Math.max(1, Math.round(elapsed / 60)))}>✓ Finish workout</button>
        <button className="btn sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export default function WorkoutsWidget({ widget }) {
  const { events, setEvents, calendars } = useDashboard()
  const [raw, setRaw] = usePersistentState('workouts', { setup: null, plans: [], log: [] })
  const [ui, setUi] = useWidgetState(widget.id, { view: 'today', region: 'full', minutes: null, session: null })
  const [editingSetup, setEditingSetup] = useState(false)
  const [draft, setDraft] = useState(null) // a freshly generated, unsaved plan
  const [scheduling, setScheduling] = useState(null) // plan id (or 'draft')
  const [open, setOpen] = useState(null)
  const [msg, setMsg] = useState('')
  const st = normalizeWorkouts(raw)
  const { setup, plans, log } = st
  const view = ui.view || 'today'
  const patchUi = (p) => setUi((s) => ({ ...s, ...p }))
  const save = (fn) => setRaw((s) => fn(normalizeWorkouts(s)))
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }
  const minutes = ui.minutes || setup?.minutes || 45

  const today = useMemo(() => {
    const a = new Date(); a.setHours(0, 0, 0, 0)
    const b = new Date(a); b.setDate(b.getDate() + 8)
    const occ = collectOccurrences(events.filter((e) => e.workout?.planId), a, b)
    const end = new Date(a); end.setDate(end.getDate() + 1)
    return { todays: occ.filter((e) => new Date(e.start) < end), next: occ.find((e) => new Date(e.start) >= end) }
  }, [events])

  if (!setup || editingSetup) {
    return (
      <div className="wk no-drag">
        <div className="wk-body">
          {!setup && <p className="wk-intro">Workouts by body region, built around the equipment you actually have — with a timer, a log, and your calendar.</p>}
          <SetupForm setup={setup} onCancel={setup ? () => setEditingSetup(false) : null}
            onSave={(s) => { save((x) => ({ ...x, setup: s })); setEditingSetup(false); flash('Saved your setup.') }} />
        </div>
      </div>
    )
  }

  function startPlan(plan) {
    patchUi({
      session: {
        planId: plan.id || null, planName: plan.name, region: plan.region, warmup: plan.warmup, started: new Date().toISOString(), restUntil: null,
        exercises: plan.exercises.map((x) => {
          const next = nextWeight(log, x.name, setup)
          const weight = next ? next.split(' — ')[0] : isLoad(x.weight) ? x.weight : ''
          return { ...x, weight, guide: isLoad(x.weight) ? '' : x.weight || '', done: 0 }
        }),
      },
    })
  }

  function savePlan(plan) {
    const saved = { ...plan, id: plan.id || uid('plan'), source: plan.source || 'generated', created: plan.created || new Date().toISOString() }
    save((x) => ({ ...x, plans: [saved, ...x.plans.filter((p) => p.id !== saved.id)] }))
    return saved
  }

  function schedule(plan, start, days) {
    const saved = plan.id ? plan : savePlan(plan)
    const cal = calendars.find((c) => !c.url) || calendars[0]
    const ev = workoutEvent(saved, { start, byday: days, calendarId: cal?.id, location: setup.where, makeId: uid })
    setEvents((list) => [...list, ev])
    setScheduling(null)
    setDraft(null)
    flash(`Added “${saved.name}” to your calendar — ${dayOf(start)} at ${timeOf(start)}${days.length ? `, then every ${dayList(days)}` : ''}.`)
  }

  function finish(mins) {
    const s = ui.session
    const entry = {
      id: uid('wk'), date: new Date().toISOString(), planId: s.planId, planName: s.planName, region: s.region, minutes: mins,
      exercises: s.exercises.map((x) => ({ name: x.name, sets: x.sets, done: Math.min(x.done, x.sets), reps: x.reps, ...(x.weight ? { weight: x.weight } : {}) })),
    }
    save((x) => ({ ...x, log: [...x.log, entry].slice(-500) }))
    patchUi({ session: null, view: 'today' })
    const wk = weekStats([...log, entry]).workouts
    flash(`💪 Logged! That’s ${wk} workout${wk === 1 ? '' : 's'} this week.`)
  }

  if (ui.session) {
    return (
      <div className="wk no-drag">
        <Session session={ui.session} setSession={(fn) => setUi((u) => ({ ...u, session: typeof fn === 'function' ? fn(u.session) : fn }))}
          log={log} setup={setup} onFinish={finish}
          onCancel={() => { if (confirm('Stop this workout without logging it?')) patchUi({ session: null }) }} />
      </div>
    )
  }

  const stats = weekStats(log)
  const newDraft = (region = ui.region, mins = minutes) => setDraft({ ...generatePlan({ region, minutes: mins, setup, seed: Date.now() }), source: 'generated' })

  return (
    <div className="wk no-drag">
      <div className="wk-top">
        <div className="gt-tabs" role="tablist">
          {[['today', 'Today'], ['plans', `Plans ${plans.length || ''}`], ['history', 'History']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} className={`gt-tab ${view === k ? 'on' : ''}`} onClick={() => patchUi({ view: k })}>{l.trim()}</button>
          ))}
        </div>
        <span className="spacer" />
        <button className="wtool" onClick={() => setEditingSetup(true)} aria-label="Equipment and goals" title="Equipment & goals">⚙</button>
      </div>
      {msg && <p className="gt-msg" role="status">{msg}</p>}

      <div className="wk-body">
        {view === 'today' && (
          <>
            <div className="wk-week">This week: <b>{stats.workouts}</b> workout{stats.workouts === 1 ? '' : 's'}{stats.minutes ? ` · ${fmtMin(stats.minutes)}` : ''}</div>
            {today.todays.map((e) => {
              const plan = plans.find((p) => p.id === e.workout.planId)
              return (
                <div key={e.id} className="wk-today">
                  <div><b>{plan?.name || e.title.replace(/^💪\s*/, '')}</b><span className="faint"> · today {timeOf(e.start)}</span></div>
                  {plan ? <button className="btn sm primary" onClick={() => startPlan(plan)}>▶ Start</button> : <span className="faint">plan deleted</span>}
                </div>
              )
            })}
            {!today.todays.length && today.next && (
              <div className="wk-next faint">Next: {dayOf(today.next.start)} {timeOf(today.next.start)} — {today.next.title.replace(/^💪\s*/, '')}</div>
            )}

            <h4 className="wk-h">Make a workout</h4>
            <div className="chips" role="group" aria-label="Body region">
              {Object.entries(REGIONS).map(([k, r]) => (
                <button key={k} className={`chip ${ui.region === k ? 'on' : ''}`} onClick={() => { patchUi({ region: k }); newDraft(k) }}>{r.label}</button>
              ))}
            </div>
            <div className="chips" role="group" aria-label="Length">
              {LENGTHS.map((m) => <button key={m} className={`chip ${minutes === m ? 'on' : ''}`} onClick={() => { patchUi({ minutes: m }); newDraft(ui.region, m) }}>{m} min</button>)}
            </div>
            {!draft && <button className="btn sm primary wk-make" onClick={() => newDraft()}>Make a {REGIONS[ui.region]?.label.toLowerCase()} workout</button>}
            {draft && (
              <div className="wk-card">
                <div className="wk-card-head"><b>{draft.name}</b><button className="wtool" onClick={() => newDraft()} title="Shuffle — different exercises" aria-label="Shuffle">🔀</button></div>
                <PlanList plan={draft} />
                {draft.tips.map((t, i) => <p key={i} className="wk-tip">💡 {t}</p>)}
                {scheduling === 'draft' ? (
                  <ScheduleForm plan={draft} onSchedule={schedule} onCancel={() => setScheduling(null)} />
                ) : (
                  <div className="wk-row">
                    <button className="btn sm primary" onClick={() => startPlan(draft)}>▶ Start now</button>
                    <button className="btn sm" onClick={() => { savePlan(draft); setDraft(null); flash('Saved to Plans.') }}>Save</button>
                    <button className="btn sm" onClick={() => setScheduling('draft')}>📅 Schedule</button>
                  </div>
                )}
              </div>
            )}
            <p className="wk-hint faint">Want something different? Ask the assistant — e.g. “make me a 30-minute back day for my {setup.where || 'home gym'}” or “plan my week: push, pull, legs”.</p>
          </>
        )}

        {view === 'plans' && (
          <>
            {!plans.length && <div className="empty-hint">No saved plans yet. Make one on Today, or ask the assistant.</div>}
            {plans.map((p) => (
              <div key={p.id} className="wk-card">
                <button className="wk-card-head wk-card-toggle" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                  <b>{p.name}</b>
                  <span className="faint">{REGIONS[p.region]?.label || p.region} · {p.minutes} min{p.source === 'assistant' ? ' · ✨ assistant' : ''}</span>
                </button>
                {open === p.id ? (
                  <>
                    {p.warmup && <p className="wk-hint faint">Warm-up: {p.warmup}</p>}
                    <PlanList plan={p} />
                    {(p.tips || []).map((t, i) => <p key={i} className="wk-tip">💡 {t}</p>)}
                  </>
                ) : <PlanList plan={p} compact />}
                {scheduling === p.id ? (
                  <ScheduleForm plan={p} onSchedule={schedule} onCancel={() => setScheduling(null)} />
                ) : (
                  <div className="wk-row">
                    <button className="btn sm primary" onClick={() => startPlan(p)}>▶ Start</button>
                    <button className="btn sm" onClick={() => setScheduling(p.id)}>📅 Schedule</button>
                    <span className="spacer" />
                    <button className="wtool del" onClick={() => { if (confirm(`Delete “${p.name}”? Sessions already on your calendar stay there.`)) save((x) => ({ ...x, plans: x.plans.filter((y) => y.id !== p.id) })) }} aria-label={`Delete ${p.name}`}>🗑</button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {view === 'history' && (
          <>
            {!log.length && <div className="empty-hint">Finished workouts show up here.</div>}
            {[...log].reverse().slice(0, 60).map((l) => {
              const sets = (l.exercises || []).reduce((a, x) => a + x.sets, 0)
              const done = (l.exercises || []).reduce((a, x) => a + (x.done ?? x.sets), 0)
              return (
                <div key={l.id} className="wk-log">
                  <div className="wk-log-head"><b>{l.planName}</b><span className="faint">{dayOf(l.date)}{l.minutes ? ` · ${fmtMin(l.minutes)}` : ''} · {done}/{sets} sets</span></div>
                  <div className="wk-log-ex faint">{(l.exercises || []).filter((x) => x.weight).map((x) => `${x.name} ${x.weight}`).join(' · ')}</div>
                  {l.note && <div className="wk-log-ex">{l.note}</div>}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
