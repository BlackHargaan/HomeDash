import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePersistentState, useWidgetState, uid } from '../lib/storage.js'
import { probeServer, serverApi, serverUsable } from '../lib/server.js'
import { timeAgo } from '../lib/date.js'
import {
  GAME_STATUSES, TTB_GOALS, normalizeGames, normName, playedMinutes, progress, eta, logPlay, setStatus, mergeSteam,
  suggestNext, staleGames, finishedThisYear, fmtHours, daysSince, steamHeader,
} from '../../shared/games.js'

const SYNC_EVERY = 30 * 60 * 1000

function Cover({ game }) {
  const [broken, setBroken] = useState(false)
  if (!game.steamAppId || broken) return <div className="gt-cover gt-cover-blank" aria-hidden="true">🎮</div>
  return <img className="gt-cover" src={steamHeader(game.steamAppId)} alt="" loading="lazy" onError={() => setBroken(true)} />
}

function Bar({ pct }) {
  return (
    <div className="gt-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0}>
      <div className="gt-bar-fill" style={{ width: `${pct ?? 0}%` }} />
    </div>
  )
}

// "today", "yesterday", "3 days ago", "2 weeks ago", "on Mar 4"
function ago(iso, now = new Date()) {
  const d = daysSince(iso, now)
  if (d == null) return ''
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 14) return `${d} days ago`
  if (d < 60) return `${Math.round(d / 7)} weeks ago`
  return `on ${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

const syncedAgo = (iso) => { const t = timeAgo(iso); return t === 'just now' ? t : `${t} ago` }

function weeksLabel(w) {
  if (w == null) return null
  if (w < 1) return 'under a week at your pace'
  if (w < 8) return `~${Math.round(w)} week${Math.round(w) === 1 ? '' : 's'} at your pace`
  return `~${Math.round(w / 4.3)} months at your pace`
}

// Time-to-beat editor: three numbers, IGDB lookup when it's set up.
function TtbEditor({ game, canLookUp, onSave, onClose }) {
  const [v, setV] = useState({ main: game.ttb?.main || '', extra: game.ttb?.extra || '', full: game.ttb?.full || '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  async function lookUp() {
    setBusy(true); setMsg('')
    try {
      const { match } = await serverApi.timeToBeat(game.name, game.steamAppId)
      if (!match) setMsg('No time-to-beat data found for this one.')
      else { setV({ main: match.main || '', extra: match.extra || '', full: match.full || '' }); setMsg(`From IGDB: “${match.name}”`) }
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  function save(e) {
    e.preventDefault()
    const ttb = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)]).filter(([, x]) => x > 0))
    onSave(Object.keys(ttb).length ? ttb : null, msg.startsWith('From IGDB') ? 'igdb' : 'you')
  }
  return (
    <form className="gt-ttb" onSubmit={save}>
      <div className="gt-ttb-row">
        {Object.entries(TTB_GOALS).map(([k, label]) => (
          <label key={k}><span>{label}</span>
            <input className="input sm" type="number" min="0" step="0.5" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} aria-label={`${label} hours`} placeholder="h" />
          </label>
        ))}
      </div>
      <div className="gt-ttb-row">
        <button className="btn sm primary" type="submit">Save</button>
        {canLookUp && <button className="btn sm" type="button" onClick={lookUp} disabled={busy}>{busy ? 'Looking up…' : 'Look up'}</button>}
        <button className="btn sm" type="button" onClick={onClose}>Cancel</button>
      </div>
      {msg && <p className="gt-msg">{msg}</p>}
      {!canLookUp && <p className="gt-hint faint">Tip: check HowLongToBeat, or ask the assistant to fill in times for your games.</p>}
    </form>
  )
}

function GameCard({ game, settings, now, canLookUp, onUpdate, onStatus, onRemove, expanded }) {
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const p = progress(game, settings)
  const e = eta(game, settings, now)
  const goal = game.goal || settings.goal
  const last = game.lastPlayed ? daysSince(game.lastPlayed, now) : null
  return (
    <article className={`gt-card ${expanded ? '' : 'compact'}`}>
      <div className="gt-card-main">
        <Cover game={game} />
        <div className="gt-card-text">
          <div className="gt-name" title={game.name}>{game.name}</div>
          {p.pct != null ? (
            <>
              <Bar pct={p.pct} />
              <div className="gt-meta"><b>{fmtHours(p.playedH)}</b> of {fmtHours(p.targetH)}{goal !== 'main' && game.ttb?.[goal] ? ` (${TTB_GOALS[goal].toLowerCase()})` : ''} · {p.pct}%
                {game.ttbSource === 'assistant' && <span className="gt-est" title="Estimated by the assistant — tap ⋯ to correct"> est.</span>}
              </div>
            </>
          ) : (
            <div className="gt-meta"><b>{fmtHours(playedMinutes(game) / 60)}</b> played · <button className="gt-link" onClick={() => setEditing(true)}>add time to beat</button></div>
          )}
        </div>
      </div>
      {expanded && (
        <>
          {e && p.leftH > 0 && (
            <div className="gt-eta">≈ {fmtHours(e.leftH)} left · {e.sessions} session{e.sessions === 1 ? '' : 's'}{e.weeks != null ? ` · ${weeksLabel(e.weeks)}` : ''}</div>
          )}
          {p.pct === 100 && <div className="gt-eta">You’ve reached the usual time to beat — the credits might be close!</div>}
          <div className="gt-actions">
            {!game.steamAppId && (
              <>
                <button className="btn sm" onClick={() => onUpdate(logPlay(game, 30, new Date()))} title="Log 30 minutes">+30m</button>
                <button className="btn sm" onClick={() => onUpdate(logPlay(game, 60, new Date()))} title="Log an hour">+1h</button>
              </>
            )}
            <span className="gt-last faint">{last == null ? 'Not played yet' : `Played ${ago(game.lastPlayed, now)}`}</span>
            <button className="btn sm gt-finish" onClick={() => onStatus(game, 'finished')}>🏆 Finished</button>
            <div className="gt-anchor">
              <button className="wtool" onClick={() => setMenu(!menu)} aria-label={`More for ${game.name}`} aria-expanded={menu}>⋯</button>
              {menu && (
                <Menu onClose={() => setMenu(false)}>
                  <button onClick={() => { setMenu(false); onStatus(game, 'paused') }}>⏸️ Pause</button>
                  <button onClick={() => { setMenu(false); onStatus(game, 'backlog') }}>📚 Back to Up next</button>
                  <button onClick={() => { setMenu(false); onStatus(game, 'dropped') }}>🍃 Let it go</button>
                  <hr />
                  <button onClick={() => { setMenu(false); setEditing(true) }}>⏱ Time to beat…</button>
                  {Object.entries(TTB_GOALS).map(([k, label]) => (
                    <button key={k} className={goal === k ? 'on' : ''} onClick={() => { setMenu(false); onUpdate({ ...game, goal: k }) }}>Done = {label.toLowerCase()}</button>
                  ))}
                  {!game.steamAppId && <button onClick={() => { setMenu(false); onUpdate(logPlay(game, -30, new Date())) }}>−30m (fix a mistake)</button>}
                  <hr />
                  <button className="danger" onClick={() => { setMenu(false); onRemove(game) }}>Remove from tracker</button>
                </Menu>
              )}
            </div>
          </div>
        </>
      )}
      {editing && (
        <TtbEditor game={game} canLookUp={canLookUp} onClose={() => setEditing(false)}
          onSave={(ttb, source) => { onUpdate({ ...game, ttb: ttb || undefined, ttbSource: ttb ? source : undefined }); setEditing(false) }} />
      )}
    </article>
  )
}

function Menu({ onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [onClose])
  return <div ref={ref} className="gt-menu">{children}</div>
}

export default function GamesWidget({ widget }) {
  const [raw, setRaw] = usePersistentState('games', { items: [], settings: {} })
  const [lib, setLib] = usePersistentState('sync:steamLibrary', null) // this device's cache of the Steam library
  const [view, setView] = useWidgetState(widget.id, 'playing')
  const [panel, setPanel] = useState(null) // 'add' | 'settings' | null
  const [server, setServer] = useState(null) // games config from the server, or false without one
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const [party, setParty] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const st = normalizeGames(raw)
  const { items, settings } = st

  const save = useCallback((fn) => setRaw((s) => { const n = normalizeGames(s); return { ...n, items: fn(n.items) } }), [setRaw])
  const updateGame = (g) => save((list) => list.map((x) => (x.id === g.id ? g : x)))
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const loadConfig = useCallback(async () => {
    const h = await probeServer()
    if (!serverUsable(h)) { setServer(false); return }
    setServer(await serverApi.gamesConfig().catch(() => false))
  }, [])
  useEffect(() => { loadConfig() }, [loadConfig])

  const syncSteam = useCallback(async ({ quiet = false } = {}) => {
    setSyncing(true)
    try {
      const r = await serverApi.steamLibrary()
      setLib({ at: new Date().toISOString(), persona: r.persona, games: r.games })
      save((list) => mergeSteam(list, r.games, new Date()))
      if (!quiet) flash(`Synced ${r.games.length} Steam games.`)
    } catch (e) {
      if (!quiet) flash(e.message)
    }
    setSyncing(false)
  }, [save, setLib])

  // Keep playtime fresh: on load and every half hour while the widget is open.
  const steamOn = !!server?.steam?.configured
  useEffect(() => {
    if (!steamOn) return
    const stale = !lib?.at || Date.now() - Date.parse(lib.at) > SYNC_EVERY
    if (stale) syncSteam({ quiet: true })
    const t = setInterval(() => syncSteam({ quiet: true }), SYNC_EVERY)
    return () => clearInterval(t)
  }, [steamOn]) // eslint-disable-line react-hooks/exhaustive-deps

  const playing = items.filter((g) => g.status === 'playing')
  const upNext = items.filter((g) => g.status === 'backlog' || g.status === 'paused')
  const done = items.filter((g) => g.status === 'finished')
  const dropped = items.filter((g) => g.status === 'dropped')
  const suggestions = suggestNext(items, settings)
  const quiet = staleGames(items, now)
  const canLookUp = !!server?.igdb?.configured

  function changeStatus(game, status) {
    if (status === 'playing' && game.status !== 'playing' && playing.length >= settings.playingLimit) {
      const ok = confirm(`You’re already playing ${playing.length} game${playing.length === 1 ? '' : 's'} (your limit is ${settings.playingLimit}).\n\nFinishing or pausing one first gives you the best shot at the credits. Start “${game.name}” anyway?`)
      if (!ok) return
    }
    if (status === 'finished') {
      const count = finishedThisYear(items, now) + 1
      setParty({ name: game.name, count })
      setTimeout(() => setParty(null), 5000)
    }
    updateGame(setStatus(game, status, new Date()))
  }

  function remove(game) {
    if (!confirm(`Remove “${game.name}” from the tracker? (To stop playing without losing it, use “Let it go”.)`)) return
    save((list) => list.filter((x) => x.id !== game.id))
  }

  async function addGame({ name, steamAppId, steamMin, last, status }) {
    if (items.some((g) => (steamAppId && g.steamAppId === steamAppId) || normName(g.name) === normName(name))) { flash(`“${name}” is already in the tracker.`); return }
    let game = { id: uid('game'), name, status: 'backlog', added: new Date().toISOString(), ...(steamAppId ? { steamAppId, steamMin: steamMin || 0 } : {}), ...(last ? { lastPlayed: new Date(last * 1000).toISOString() } : {}) }
    if (status === 'playing') {
      if (playing.length >= settings.playingLimit && !confirm(`You’re already playing ${playing.length} (limit ${settings.playingLimit}). Add “${name}” as Playing anyway?`)) status = 'backlog'
      game = setStatus(game, status, new Date())
    }
    save((list) => [game, ...list])
    setPanel(null)
    setView(game.status === 'playing' ? 'playing' : 'next')
    if (canLookUp) {
      try {
        const { match } = await serverApi.timeToBeat(name, steamAppId)
        if (match) save((list) => list.map((x) => (x.id === game.id && !x.ttb ? { ...x, ttb: { main: match.main, extra: match.extra, full: match.full }, ttbSource: 'igdb' } : x)))
      } catch { /* time to beat can be added later */ }
    }
  }

  if (panel === 'add') {
    return <AddPanel lib={lib} items={items} steamOn={steamOn} onAdd={addGame} onClose={() => setPanel(null)} />
  }
  if (panel === 'settings') {
    return <SettingsPanel server={server} settings={settings} lib={lib} onSettings={(p) => setRaw((s) => { const n = normalizeGames(s); return { ...n, settings: { ...n.settings, ...p } } })}
      onConfig={async (patch) => { const c = await serverApi.saveGamesConfig(patch); setServer(c); return c }}
      onSync={() => syncSteam()} syncing={syncing} onClose={() => setPanel(null)} msg={msg} />
  }

  const tabs = [['playing', 'Playing', playing.length], ['next', 'Up next', upNext.length], ['done', 'Done', done.length]]
  return (
    <div className="gt no-drag">
      <div className="gt-top">
        <div className="gt-tabs" role="tablist">
          {tabs.map(([k, label, n]) => (
            <button key={k} role="tab" aria-selected={view === k} className={`gt-tab ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>
              {label}<span className="gt-count">{k === 'playing' ? `${n}/${settings.playingLimit}` : n}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        {steamOn && <button className={`wtool ${syncing ? 'spin' : ''}`} onClick={() => syncSteam()} aria-label="Sync Steam" title={lib?.at ? `Steam synced ${syncedAgo(lib.at)}` : 'Sync Steam'} disabled={syncing}>↻</button>}
        <button className="wtool" onClick={() => setPanel('add')} aria-label="Add a game" title="Add a game">＋</button>
        <button className="wtool" onClick={() => setPanel('settings')} aria-label="Game Tracker settings" title="Settings">⚙</button>
      </div>
      {msg && <p className="gt-msg" role="status">{msg}</p>}

      <div className="gt-body">
        {party && (
          <div className="gt-party" role="status">
            <div className="gt-party-burst" aria-hidden="true">🏆</div>
            <b>You finished {party.name}!</b>
            <span>That’s {party.count} game{party.count === 1 ? '' : 's'} finished this year.</span>
          </div>
        )}

        {view === 'playing' && (
          <>
            {quiet.map((g) => (
              <div key={g.id} className="gt-nudge">
                <span>Still playing <b>{g.name}</b>? {g.lastPlayed ? `Last played ${ago(g.lastPlayed, now)}.` : 'Not played yet.'}</span>
                <div className="gt-nudge-actions">
                  <button className="btn sm" onClick={() => updateGame({ ...g, snoozed: new Date().toISOString() })}>Keep</button>
                  <button className="btn sm" onClick={() => changeStatus(g, 'paused')}>Pause</button>
                  <button className="btn sm" onClick={() => changeStatus(g, 'dropped')}>Let go</button>
                </div>
              </div>
            ))}
            {playing.map((g) => (
              <GameCard key={g.id} game={g} settings={settings} now={now} canLookUp={canLookUp} expanded
                onUpdate={updateGame} onStatus={changeStatus} onRemove={remove} />
            ))}
            {playing.length < settings.playingLimit && suggestions.length > 0 && (
              <section className="gt-suggest">
                <h4>{playing.length ? 'Room for one more — quickest finishes' : 'Pick something to play — quickest finishes first'}</h4>
                {suggestions.slice(0, playing.length ? 1 : 3).map(({ game, reason }) => (
                  <div key={game.id} className="gt-row">
                    <Cover game={game} />
                    <div className="gt-row-text"><b>{game.name}</b><span className="faint">{reason}</span></div>
                    <button className="btn sm primary" onClick={() => changeStatus(game, 'playing')}>▶ Play</button>
                  </div>
                ))}
              </section>
            )}
            {!items.length && (
              <div className="gt-empty">
                <p>Track what you’re playing against how long it takes to beat — and actually see the credits.</p>
                <button className="btn sm primary" onClick={() => setPanel('add')}>＋ Add a game</button>
                {server && !steamOn && <button className="btn sm" onClick={() => setPanel('settings')}>Connect Steam</button>}
              </div>
            )}
          </>
        )}

        {view === 'next' && (
          <>
            {!upNext.length && <div className="empty-hint">Nothing up next. Add games with ＋.</div>}
            {[...suggestions.map((s) => s.game), ...upNext.filter((g) => !suggestions.some((s) => s.game.id === g.id))].map((g, i) => {
              const s = suggestions.find((x) => x.game.id === g.id)
              const p = progress(g, settings)
              return (
                <div key={g.id} className={`gt-row ${i < suggestions.length ? 'pick' : ''}`}>
                  <Cover game={g} />
                  <div className="gt-row-text">
                    <b>{g.name}{g.status === 'paused' && <span className="gt-chip">paused</span>}</b>
                    <span className="faint">{s ? s.reason : p.targetH ? `About ${fmtHours(p.targetH)} to beat` : `${fmtHours(playedMinutes(g) / 60)} played`}</span>
                  </div>
                  <button className="btn sm" onClick={() => changeStatus(g, 'playing')}>▶ Play</button>
                  <div className="gt-anchor"><RowMenu game={g} onStatus={changeStatus} onRemove={remove} onUpdate={updateGame} canLookUp={canLookUp} /></div>
                </div>
              )
            })}
          </>
        )}

        {view === 'done' && (
          <>
            <div className="gt-trophies">🏆 <b>{finishedThisYear(items, now)}</b> finished this year · {done.length} all time</div>
            {[...done].sort((a, b) => String(b.finished).localeCompare(String(a.finished))).map((g) => (
              <div key={g.id} className="gt-row">
                <Cover game={g} />
                <div className="gt-row-text"><b>{g.name}</b><span className="faint">{fmtHours(playedMinutes(g) / 60)} · finished {g.finished ? new Date(g.finished).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span></div>
              </div>
            ))}
            {dropped.length > 0 && (
              <details className="gt-dropped">
                <summary>🍃 Let go ({dropped.length}) — no guilt, they’re here if you change your mind</summary>
                {dropped.map((g) => (
                  <div key={g.id} className="gt-row">
                    <div className="gt-row-text"><b>{g.name}</b><span className="faint">{fmtHours(playedMinutes(g) / 60)} played</span></div>
                    <button className="btn sm" onClick={() => changeStatus(g, 'backlog')}>Back to Up next</button>
                  </div>
                ))}
              </details>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function RowMenu({ game, onStatus, onRemove, onUpdate, canLookUp }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  return (
    <>
      <button className="wtool" onClick={() => setOpen(!open)} aria-label={`More for ${game.name}`}>⋯</button>
      {open && (
        <Menu onClose={() => setOpen(false)}>
          <button onClick={() => { setOpen(false); setEditing(true) }}>⏱ Time to beat…</button>
          {game.status !== 'paused' && <button onClick={() => { setOpen(false); onStatus(game, 'paused') }}>⏸️ Mark paused</button>}
          <button onClick={() => { setOpen(false); onStatus(game, 'finished') }}>🏆 Already finished</button>
          <button onClick={() => { setOpen(false); onStatus(game, 'dropped') }}>🍃 Let it go</button>
          <hr />
          <button className="danger" onClick={() => { setOpen(false); onRemove(game) }}>Remove from tracker</button>
        </Menu>
      )}
      {editing && (
        <div className="gt-pop">
          <div className="gt-pop-title">{game.name}</div>
          <TtbEditor game={game} canLookUp={canLookUp} onClose={() => setEditing(false)}
            onSave={(ttb, source) => { onUpdate({ ...game, ttb: ttb || undefined, ttbSource: ttb ? source : undefined }); setEditing(false) }} />
        </div>
      )}
    </>
  )
}

function AddPanel({ lib, items, steamOn, onAdd, onClose }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('backlog')
  const tracked = useMemo(() => new Set(items.map((g) => g.steamAppId).filter(Boolean)), [items])
  const results = useMemo(() => {
    const games = lib?.games || []
    const n = normName(q)
    const list = n ? games.filter((g) => normName(g.name).includes(n)) : [...games].sort((a, b) => (b.last || 0) - (a.last || 0))
    return list.slice(0, 40)
  }, [lib, q])
  return (
    <div className="gt no-drag">
      <div className="gt-top">
        <input className="input sm gt-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={lib?.games ? `Search your ${lib.games.length} Steam games, or type any title…` : 'Game title…'}
          aria-label="Game title" onKeyDown={(e) => { if (e.key === 'Enter' && q.trim() && !results.length) onAdd({ name: q.trim(), status }) }} />
        <button className="btn sm" onClick={onClose}>Close</button>
      </div>
      <div className="gt-add-to">Add to:
        {['backlog', 'playing'].map((s) => (
          <button key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{GAME_STATUSES[s].icon} {GAME_STATUSES[s].label}</button>
        ))}
      </div>
      <div className="gt-body">
        {!q.trim() && results.length > 0 && <h4 className="gt-h">Recently played on Steam</h4>}
        {results.map((g) => (
          <button key={g.appid} className="gt-row gt-row-btn" disabled={tracked.has(g.appid)} onClick={() => onAdd({ name: g.name, steamAppId: g.appid, steamMin: g.min, last: g.last, status })}>
            <Cover game={{ steamAppId: g.appid }} />
            <div className="gt-row-text"><b>{g.name}</b><span className="faint">{tracked.has(g.appid) ? '✓ In your tracker' : g.min ? `${fmtHours(g.min / 60)} played` : 'Never played'}</span></div>
          </button>
        ))}
        {q.trim() && (
          <button className="gt-row gt-row-btn" onClick={() => onAdd({ name: q.trim(), status })}>
            <div className="gt-cover gt-cover-blank" aria-hidden="true">＋</div>
            <div className="gt-row-text"><b>Add “{q.trim()}”</b><span className="faint">{steamOn ? 'Not from Steam — log time by hand' : 'Log play time by hand'}</span></div>
          </button>
        )}
        {!lib?.games && !q.trim() && <p className="gt-hint faint">Type a title to add it. Connect Steam in ⚙ to pick from your library with playtime filled in.</p>}
      </div>
    </div>
  )
}

function SettingsPanel({ server, settings, lib, onSettings, onConfig, onSync, syncing, onClose, msg }) {
  const [steam, setSteam] = useState({ apiKey: '', profile: '' })
  const [igdb, setIgdb] = useState({ clientId: '', clientSecret: '' })
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  async function submit(e, what, patch) {
    e.preventDefault()
    setBusy(what); setNote('')
    try {
      const c = await onConfig(patch)
      setNote(what === 'steam' ? (c.steam.configured ? `Connected${c.steam.persona ? ` as ${c.steam.persona}` : ''}.` : 'Saved.') : 'IGDB connected — time to beat will fill in when you add games.')
      if (what === 'steam') { setSteam({ apiKey: '', profile: '' }); if (c.steam.configured) onSync() }
      else setIgdb({ clientId: '', clientSecret: '' })
    } catch (err) { setNote(err.message) }
    setBusy('')
  }
  const s = server?.steam
  return (
    <div className="gt no-drag">
      <div className="gt-body gt-settings">
        <h4 className="gt-h">Playing at once</h4>
        <p className="gt-hint faint">A small number helps you finish what you start.</p>
        <div className="chips">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={`chip ${settings.playingLimit === n ? 'on' : ''}`} onClick={() => onSettings({ playingLimit: n })}>{n}</button>)}</div>
        <h4 className="gt-h">A play session is about</h4>
        <div className="chips">{[30, 60, 90, 120].map((m) => <button key={m} className={`chip ${settings.sessionMinutes === m ? 'on' : ''}`} onClick={() => onSettings({ sessionMinutes: m })}>{m < 60 ? `${m} min` : `${m / 60} h`}</button>)}</div>
        <h4 className="gt-h">“Finished” means</h4>
        <div className="chips">{Object.entries(TTB_GOALS).map(([k, l]) => <button key={k} className={`chip ${settings.goal === k ? 'on' : ''}`} onClick={() => onSettings({ goal: k })}>{l}</button>)}</div>

        <h4 className="gt-h">Steam</h4>
        {server === false ? (
          <p className="gt-hint faint">Steam sync needs the HomeDash server or desktop app. You can still add games and log time by hand.</p>
        ) : (
          <>
            <p className="gt-hint faint">
              {s?.configured ? <>Connected{s.persona ? <> as <b>{s.persona}</b></> : ''} · key {s.keyHint}{lib?.at ? ` · synced ${syncedAgo(lib.at)}` : ''}. </> : 'Pulls in your library and playtime. '}
              Get a free key at <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener noreferrer">steamcommunity.com/dev/apikey</a>, and set
              {' '}<i>Game details</i> to Public in your Steam privacy settings.
            </p>
            <form className="gt-form" onSubmit={(e) => submit(e, 'steam', { steam: { ...(steam.apiKey ? { apiKey: steam.apiKey } : {}), ...(steam.profile ? { profile: steam.profile } : {}) } })}>
              <input className="input sm" value={steam.apiKey} onChange={(e) => setSteam({ ...steam, apiKey: e.target.value })} placeholder={s?.hasKey ? `Web API key (saved ${s.keyHint})` : 'Steam Web API key'} aria-label="Steam Web API key" autoComplete="off" />
              <input className="input sm" value={steam.profile} onChange={(e) => setSteam({ ...steam, profile: e.target.value })} placeholder={s?.steamId ? `Profile (${s.steamId})` : 'Profile link, custom URL name or SteamID'} aria-label="Steam profile" />
              <div className="gt-ttb-row">
                <button className="btn sm primary" type="submit" disabled={busy === 'steam' || (!steam.apiKey && !steam.profile)}>{busy === 'steam' ? 'Connecting…' : s?.configured ? 'Update' : 'Connect'}</button>
                {s?.configured && <button className="btn sm" type="button" onClick={onSync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</button>}
              </div>
            </form>

            <h4 className="gt-h">Time to beat (optional)</h4>
            <p className="gt-hint faint">
              {server?.igdb?.configured ? `IGDB connected (client ${server.igdb.clientIdHint}). ` : ''}
              Looks up main story, extras and completionist times from IGDB. Create a free app at
              {' '}<a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noopener noreferrer">dev.twitch.tv/console</a> and paste its client ID and secret. Or skip this and ask the assistant to fill in times.
            </p>
            <form className="gt-form" onSubmit={(e) => submit(e, 'igdb', { igdb })}>
              <input className="input sm" value={igdb.clientId} onChange={(e) => setIgdb({ ...igdb, clientId: e.target.value })} placeholder="Client ID" aria-label="IGDB client ID" autoComplete="off" />
              <input className="input sm" type="password" value={igdb.clientSecret} onChange={(e) => setIgdb({ ...igdb, clientSecret: e.target.value })} placeholder="Client secret" aria-label="IGDB client secret" autoComplete="off" />
              <div className="gt-ttb-row"><button className="btn sm primary" type="submit" disabled={busy === 'igdb' || !igdb.clientId || !igdb.clientSecret}>{busy === 'igdb' ? 'Checking…' : 'Save'}</button></div>
            </form>
          </>
        )}
        {(note || msg) && <p className="gt-msg" role="status">{note || msg}</p>}
      </div>
      <div className="gt-foot"><span className="spacer" /><button className="btn sm primary" onClick={onClose}>Done</button></div>
    </div>
  )
}
