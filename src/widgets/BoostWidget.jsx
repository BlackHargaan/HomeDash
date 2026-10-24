import { useEffect, useRef, useState } from 'react'
import { usePersistentState, useWidgetState, uid } from '../lib/storage.js'
import { fireNotification, notifyPermission, requestNotifyPermission } from '../lib/notify.js'
import {
  BOOST_KINDS, BUILT_IN_BOOSTS, CADENCES, EMPTY_BOOSTS, addBoosts, boostPool, nextChange, normalizeBoosts, periodIndex, pickBoost,
} from '../../shared/boosts.js'

const ALL_KINDS = Object.keys(BOOST_KINDS)
const TIP_KINDS = ['strategy', 'insight']

function untilLabel(next, now, cadence) {
  if (cadence === 'day') return 'New one tomorrow'
  const min = Math.max(1, Math.round((next - now) / 60000))
  return min >= 60 ? `New one in ${Math.floor(min / 60)} h ${min % 60} min` : `New one in ${min} min`
}

function download(name, text) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function Boost({ item, fav, onFav, onHide, compact }) {
  const k = BOOST_KINDS[item.kind]
  return (
    <figure className={`boost-card kind-${item.kind} ${compact ? 'compact' : ''}`}>
      <figcaption className="boost-kind"><span aria-hidden="true">{k.icon}</span> {k.label}
        <span className="boost-card-tools">
          <button className={`boost-mini ${fav ? 'fav' : ''}`} onClick={onFav} aria-label={fav ? 'Unfavourite' : 'Favourite'} title="Favourite">{fav ? '♥' : '♡'}</button>
          <button className="boost-mini" onClick={onHide} aria-label="Not for me — skip this one" title="Not for me">⊘</button>
        </span>
      </figcaption>
      <blockquote className="boost-text">{item.text}</blockquote>
      {item.detail && <p className="boost-detail">{item.detail}</p>}
    </figure>
  )
}

export default function BoostWidget({ widget }) {
  const [opts, setOpts] = useWidgetState(widget.id, { cadence: 'hour', kinds: ALL_KINDS, layout: 'pair', favoritesOnly: false, notify: false, nav: null })
  const [rawStore, setStore] = usePersistentState('boosts', EMPTY_BOOSTS)
  const store = normalizeBoosts(rawStore)
  const [editing, setEditing] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [msg, setMsg] = useState('')
  const patch = (p) => setOpts((s) => ({ ...s, ...p }))
  const { cadence = 'hour', kinds = ALL_KINDS, layout = 'pair', favoritesOnly = false, notify = false } = opts

  const period = periodIndex(now, cadence)
  const offset = opts.nav?.period === period ? opts.nav.offset : 0 // ‹ › only last until the next change
  const next = nextChange(now, cadence)

  // Tick every minute for the countdown, and exactly at the next change.
  useEffect(() => {
    const t1 = setInterval(() => setNow(new Date()), 60000)
    const t2 = setTimeout(() => setNow(new Date()), Math.max(1000, next - Date.now() + 500))
    return () => { clearInterval(t1); clearTimeout(t2) }
  }, [next.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps

  // Two slots: a strategy/insight and an uplifting phrase ("pair"), or one
  // slot rotating through every chosen kind ("one").
  const tipKinds = kinds.filter((k) => TIP_KINDS.includes(k))
  const pair = layout === 'pair' && tipKinds.length > 0 && kinds.includes('uplift')
  const slots = pair
    ? [{ kinds: tipKinds, salt: 'tip' }, { kinds: ['uplift'], salt: 'uplift' }]
    : [{ kinds, salt: kinds.join(',') }]
  const items = slots
    .map((s) => pickBoost(boostPool(store, { kinds: s.kinds, favoritesOnly }), period + offset, s.salt))
    .filter(Boolean)

  // Optional notification when a new one rotates in (while HomeDash is open).
  const shownPeriod = useRef(period)
  useEffect(() => {
    if (shownPeriod.current === period) return
    shownPeriod.current = period
    if (!notify || !items.length || notifyPermission() !== 'granted') return
    const first = items[0]
    fireNotification(`${BOOST_KINDS[first.kind].icon} ${BOOST_KINDS[first.kind].label}`, first.text, `boost:${widget.id}:${period}`)
  }, [period]) // eslint-disable-line react-hooks/exhaustive-deps

  const setStoreWith = (fn) => setStore((s) => fn(normalizeBoosts(s)))
  const toggleFav = (id) => setStoreWith((s) => ({ ...s, favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [...s.favorites, id] }))
  const hide = (id) => setStoreWith((s) => ({ ...s, hidden: [...new Set([...s.hidden, id])], favorites: s.favorites.filter((x) => x !== id) }))
  const step = (d) => patch({ nav: { period, offset: offset + d } })

  function copy() {
    const text = items.map((b) => `${b.text}${b.detail ? `\n${b.detail}` : ''}`).join('\n\n')
    navigator.clipboard?.writeText(text)
  }

  if (editing) {
    return <BoostSettings opts={opts} patch={patch} store={store} setStoreWith={setStoreWith} onDone={() => setEditing(false)} msg={msg} setMsg={setMsg} />
  }

  return (
    <div className="boost no-drag">
      <div className="boost-body">
        {items.length ? items.map((b, i) => (
          <Boost key={`${b.id}-${i}`} item={b} compact={items.length > 1 && i > 0} fav={store.favorites.includes(b.id)}
            onFav={() => toggleFav(b.id)} onHide={() => hide(b.id)} />
        )) : (
          <div className="empty-hint">{favoritesOnly ? 'No favourites yet — tap ♡ on the ones that help.' : 'Nothing to show — pick some kinds in ⚙.'}</div>
        )}
      </div>
      <div className="boost-tools">
        <button className="wtool" onClick={() => step(-1)} aria-label="Previous" title="Previous">‹</button>
        <button className="wtool" onClick={() => step(1)} aria-label="Next" title="Next">›</button>
        <button className="wtool" onClick={copy} aria-label="Copy" title="Copy" disabled={!items.length}>⧉</button>
        <span className="boost-next faint">{untilLabel(next, now, cadence)}</span>
        <button className="wtool" onClick={() => setEditing(true)} aria-label="Daily Boost settings" title="Settings">⚙</button>
      </div>
    </div>
  )
}

function BoostSettings({ opts, patch, store, setStoreWith, onDone, msg, setMsg }) {
  const { cadence = 'hour', kinds = ALL_KINDS, layout = 'pair', favoritesOnly = false, notify = false } = opts
  const [draft, setDraft] = useState({ kind: 'strategy', text: '', detail: '' })
  const fileRef = useRef(null)
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  function toggleKind(k) {
    const nextKinds = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]
    if (nextKinds.length) patch({ kinds: ALL_KINDS.filter((x) => nextKinds.includes(x)) })
  }

  async function toggleNotify() {
    if (!notify && (await requestNotifyPermission()) !== 'granted') { flash('Notifications are blocked for this site.'); return }
    patch({ notify: !notify })
  }

  function addOwn(e) {
    e.preventDefault()
    let result
    setStoreWith((s) => { result = addBoosts(s, [draft], { source: 'you', makeId: () => uid('bst') }); return result.store })
    setTimeout(() => {
      if (result?.added.length) { setDraft((d) => ({ ...d, text: '', detail: '' })); flash('Added to the rotation.') } else flash('Already in the collection, or too short.')
    })
  }

  function importFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    f.text().then((t) => {
      let list
      try {
        const j = JSON.parse(t)
        list = Array.isArray(j) ? j : j.boosts || j.custom || j.items
      } catch { /* handled below */ }
      if (!Array.isArray(list)) { flash('That file isn’t a list of boosts.'); return }
      let result
      setStoreWith((s) => { result = addBoosts(s, list, { source: 'import', makeId: () => uid('bst') }); return result.store })
      setTimeout(() => flash(`Imported ${result.added.length}${result.skipped ? `, skipped ${result.skipped}` : ''}.`))
    })
  }

  function exportFile() {
    const mine = store.custom.map(({ kind, text, detail }) => ({ kind, text, ...(detail ? { detail } : {}) }))
    download('daily-boosts.json', JSON.stringify(mine, null, 2) + '\n')
  }

  const own = store.custom
  return (
    <div className="boost no-drag">
      <div className="boost-edit">
        <label className="boost-label">New one</label>
        <div className="chips">
          {Object.entries(CADENCES).map(([v, c]) => (
            <button key={v} className={`chip ${cadence === v ? 'on' : ''}`} onClick={() => patch({ cadence: v })}>{c.label}</button>
          ))}
        </div>

        <label className="boost-label">Show</label>
        <div className="chips">
          {ALL_KINDS.map((k) => (
            <button key={k} className={`chip ${kinds.includes(k) ? 'on' : ''}`} aria-pressed={kinds.includes(k)} onClick={() => toggleKind(k)}>
              {BOOST_KINDS[k].icon} {BOOST_KINDS[k].plural}
            </button>
          ))}
        </div>

        <label className="boost-label">Layout</label>
        <div className="chips">
          <button className={`chip ${layout === 'pair' ? 'on' : ''}`} onClick={() => patch({ layout: 'pair' })}>Tip + uplifting words</button>
          <button className={`chip ${layout === 'one' ? 'on' : ''}`} onClick={() => patch({ layout: 'one' })}>One at a time</button>
        </div>

        <label className="boost-check"><input type="checkbox" checked={favoritesOnly} onChange={() => patch({ favoritesOnly: !favoritesOnly })} /> Only my favourites ({store.favorites.length})</label>
        <label className="boost-check"><input type="checkbox" checked={notify} onChange={toggleNotify} /> Notify me when a new one arrives</label>

        <label className="boost-label">Add your own</label>
        <form className="boost-add" onSubmit={addOwn}>
          <select className="select sm" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} aria-label="Kind">
            {ALL_KINDS.map((k) => <option key={k} value={k}>{BOOST_KINDS[k].label}</option>)}
          </select>
          <input className="input sm" value={draft.text} maxLength={280} onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            placeholder={draft.kind === 'uplift' ? 'Something kind to hear…' : 'The idea, in one line…'} aria-label="Text" />
          {draft.kind !== 'uplift' && (
            <input className="input sm" value={draft.detail} maxLength={500} onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
              placeholder="How or why (optional)" aria-label="Detail" />
          )}
          <button className="btn sm" type="submit" disabled={draft.text.trim().length < 3}>Add</button>
        </form>

        <label className="boost-label">Your collection</label>
        <p className="faint boost-note">
          {BUILT_IN_BOOSTS.length} built in · {own.length} added by you or the assistant{store.hidden.length ? ` · ${store.hidden.length} hidden` : ''}.
          {' '}Ask the assistant to grow it, e.g. “add 10 ADHD strategies for mornings to my Daily Boost”.
        </p>
        {own.length > 0 && (
          <ul className="boost-own">
            {own.map((b) => (
              <li key={b.id}>
                <span aria-hidden="true">{BOOST_KINDS[b.kind].icon}</span>
                <span className="boost-own-text" title={b.detail || ''}>{b.text}</span>
                <button className="svc-del" aria-label={`Delete “${b.text}”`}
                  onClick={() => setStoreWith((s) => ({ ...s, custom: s.custom.filter((x) => x.id !== b.id), favorites: s.favorites.filter((x) => x !== b.id) }))}>✕</button>
              </li>
            ))}
          </ul>
        )}
        <div className="boost-actions">
          {store.hidden.length > 0 && <button className="btn sm" onClick={() => setStoreWith((s) => ({ ...s, hidden: [] }))}>Restore hidden</button>}
          <button className="btn sm" onClick={() => fileRef.current?.click()}>Import JSON</button>
          <button className="btn sm" onClick={exportFile} disabled={!own.length}>Export JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importFile} />
        </div>
        {msg && <p className="boost-msg" role="status">{msg}</p>}
      </div>
      <div className="boost-tools">
        <span className="spacer" />
        <button className="btn sm primary" onClick={onDone}>Done</button>
      </div>
    </div>
  )
}
