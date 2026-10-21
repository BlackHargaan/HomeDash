import { useCallback, useEffect, useState } from 'react'
import { useWidgetState, uid } from '../lib/storage.js'
import { serverApi, serverUsable } from '../lib/server.js'
import { useServer } from '../context/ServerContext.jsx'

const REFRESH_MS = 60_000

// Node/system error codes → words a person can act on.
const ERRORS = {
  ECONNREFUSED: 'Connection refused',
  ENOTFOUND: 'Host not found',
  EAI_AGAIN: 'DNS lookup failed',
  EHOSTUNREACH: 'Host unreachable',
  ENETUNREACH: 'Network unreachable',
  ECONNRESET: 'Connection reset',
  TIMEOUT: 'Timed out',
  ETIMEDOUT: 'Timed out',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'Self-signed certificate',
  SELF_SIGNED_CERT_IN_CHAIN: 'Self-signed certificate',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Untrusted certificate',
  CERT_HAS_EXPIRED: 'Certificate expired',
  ERR_TLS_CERT_ALTNAME_INVALID: 'Certificate name mismatch',
}
const describe = (r) => (r.error ? ERRORS[r.error] || r.error : `HTTP ${r.status}`)

// Without the server we can only tell "something answered" vs "didn't": an
// opaque no-cors request resolves for any reachable host. No status code.
async function browserCheck(url) {
  const started = performance.now()
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(5000) })
    return { url, up: true, ms: Math.round(performance.now() - started), limited: true }
  } catch (e) {
    return { url, up: false, error: e.name === 'TimeoutError' ? 'Timed out' : 'Unreachable', limited: true }
  }
}

export default function StatusWidget({ widget }) {
  const { status } = useServer()
  const viaServer = status === 'ready' && serverUsable()
  const [services, setServices] = useWidgetState(widget.id, [])
  const [results, setResults] = useState({})
  const [checking, setChecking] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', url: '', insecure: false })

  const check = useCallback(async () => {
    if (!services.length) return
    setChecking(true)
    try {
      const list = viaServer
        ? (await serverApi.status(services.map((s) => ({ url: s.url, insecure: !!s.insecure })))).results
        : await Promise.all(services.map((s) => browserCheck(s.url)))
      const map = {}
      list.forEach((r, i) => { map[services[i].id] = r })
      setResults(map)
    } catch {
      /* keep the previous results */
    } finally {
      setChecking(false)
    }
  }, [services, viaServer])

  useEffect(() => {
    check()
    const iv = setInterval(check, REFRESH_MS)
    return () => clearInterval(iv)
  }, [check])

  function add(e) {
    e.preventDefault()
    let url = draft.url.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url
    let name = draft.name.trim()
    if (!name) { try { name = new URL(url).host } catch { name = url } }
    setServices((s) => [...s, { id: uid('svc'), name, url, insecure: draft.insecure }])
    setDraft({ name: '', url: '', insecure: false })
    setAdding(false)
  }

  const upCount = services.filter((s) => results[s.id]?.up).length

  return (
    <div className="svc no-drag">
      {services.length > 0 && (
        <div className="svc-summary">
          <span className={`svc-pill ${upCount === services.length ? 'ok' : 'bad'}`}>
            {upCount}/{services.length} up
          </span>
          <span className="spacer" />
          <button className="wtool" title="Check now" onClick={check} disabled={checking}>{checking ? '…' : '↻'}</button>
        </div>
      )}

      {services.length === 0 && !adding && (
        <div className="empty-hint">Add the services you run (Plex, Home Assistant, your NAS…) to watch whether they’re up.</div>
      )}

      <div className="svc-list">
        {services.map((s) => {
          const r = results[s.id]
          const state = !r ? 'pending' : r.up ? 'up' : 'down'
          return (
            <div key={s.id} className="svc-row">
              <span className={`svc-dot ${state}`} title={state} />
              <a className="svc-name" href={s.url} target="_blank" rel="noopener noreferrer" title={s.url}>{s.name}</a>
              <span className="svc-meta faint">
                {!r ? '…' : r.up ? `${r.status ? r.status + ' · ' : ''}${r.ms} ms` : describe(r)}
              </span>
              <button className="svc-del" onClick={() => setServices((list) => list.filter((x) => x.id !== s.id))} aria-label={`Remove ${s.name}`}>✕</button>
            </div>
          )
        })}
      </div>

      {adding ? (
        <form className="svc-form" onSubmit={add}>
          <input className="input" placeholder="URL, e.g. http://192.168.1.10:8123" value={draft.url} autoFocus
            onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          <input className="input" placeholder="Name (optional)" value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          {viaServer && (
            <label className="chip-inline faint" style={{ fontSize: 12 }}>
              <input type="checkbox" checked={draft.insecure} onChange={(e) => setDraft({ ...draft, insecure: e.target.checked })} />
              Allow self-signed HTTPS certificate
            </label>
          )}
          <div className="row">
            <button className="btn sm primary" type="submit">Add</button>
            <button className="btn sm ghost" type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn sm ghost svc-add" onClick={() => setAdding(true)}>＋ Add service</button>
      )}

      {!viaServer && services.length > 0 && (
        <div className="faint svc-note">Limited mode: without the HomeDash server, checks can only tell whether something answered.</div>
      )}
    </div>
  )
}
