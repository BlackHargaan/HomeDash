import { useCallback, useEffect, useState } from 'react'
import { useWidgetState } from '../lib/storage.js'

// A configurable "integration tile": fetch a JSON endpoint, drill into it with a
// dot-path, and display the value with an optional label/prefix/suffix. Refreshes
// on an interval. Great for home-lab metrics, crypto/stock tickers, API counts, etc.
function drill(obj, path) {
  if (!path) return obj
  return path.split('.').reduce((acc, key) => {
    if (acc == null) return undefined
    const arrMatch = key.match(/^(\w*)\[(\d+)\]$/)
    if (arrMatch) {
      const base = arrMatch[1] ? acc[arrMatch[1]] : acc
      return base?.[Number(arrMatch[2])]
    }
    return acc[key]
  }, obj)
}

export default function IframeStatWidget({ widget }) {
  const [cfg, setCfg] = useWidgetState(widget.id, {
    url: '', path: '', label: '', prefix: '', suffix: '', refreshSec: 300, icon: '⚙️',
  })
  const [draft, setDraft] = useState(cfg)
  const [value, setValue] = useState(null)
  const [status, setStatus] = useState('idle')
  const editing = !cfg.url

  const load = useCallback(async () => {
    if (!cfg.url) return
    setStatus('loading')
    try {
      const r = await fetch(cfg.url)
      const j = await r.json()
      const v = drill(j, cfg.path)
      setValue(typeof v === 'object' ? JSON.stringify(v) : String(v))
      setStatus('ok')
    } catch {
      setStatus('error')
    }
  }, [cfg.url, cfg.path])

  useEffect(() => {
    if (!cfg.url) return
    load()
    const sec = Math.max(15, Number(cfg.refreshSec) || 300)
    const t = setInterval(load, sec * 1000)
    return () => clearInterval(t)
  }, [cfg.url, cfg.refreshSec, load])

  function save(e) {
    e.preventDefault()
    if (!draft.url.trim()) return
    setCfg({ ...draft, url: draft.url.trim() })
  }

  if (editing) {
    return (
      <form className="istat-setup no-drag" onSubmit={save}>
        <div className="field">
          <label>JSON API URL</label>
          <input className="input" placeholder="https://api.example.com/data" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} autoFocus />
        </div>
        <div className="field">
          <label>Value path (dot notation)</label>
          <input className="input" placeholder="e.g. data.temperature or results[0].count" value={draft.path} onChange={(e) => setDraft({ ...draft, path: e.target.value })} />
        </div>
        <div className="row">
          <div className="field"><label>Label</label><input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></div>
          <div className="field"><label>Icon</label><input className="input" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} /></div>
        </div>
        <div className="row">
          <div className="field"><label>Prefix</label><input className="input" placeholder="$" value={draft.prefix} onChange={(e) => setDraft({ ...draft, prefix: e.target.value })} /></div>
          <div className="field"><label>Suffix</label><input className="input" placeholder="°C" value={draft.suffix} onChange={(e) => setDraft({ ...draft, suffix: e.target.value })} /></div>
          <div className="field"><label>Refresh (s)</label><input className="input" type="number" value={draft.refreshSec} onChange={(e) => setDraft({ ...draft, refreshSec: e.target.value })} /></div>
        </div>
        <button className="btn primary sm" type="submit">Save integration</button>
        <p className="faint" style={{ marginTop: 8, fontSize: 12 }}>The endpoint must allow cross-origin (CORS) requests.</p>
      </form>
    )
  }

  return (
    <div className="istat no-drag">
      <div className="istat-icon">{cfg.icon || '⚙️'}</div>
      <div className="istat-value">
        {status === 'error' ? '—' : status === 'loading' && value == null ? '…' : `${cfg.prefix}${value}${cfg.suffix}`}
      </div>
      <div className="istat-label">{cfg.label || 'Integration'}</div>
      <div className="istat-tools">
        <button className="wtool" onClick={load} title="Refresh">↻</button>
        <button className="wtool" onClick={() => setCfg({ ...cfg, url: '' })} title="Edit">✎</button>
      </div>
      {status === 'error' && <div className="faint istat-err">Fetch failed (CORS?)</div>}
    </div>
  )
}
