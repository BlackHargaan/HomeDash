import { useState } from 'react'
import { useWidgetState } from '../lib/storage.js'
import { useDashboard } from '../context/DashboardContext.jsx'

// A "bring your own integration" widget: embed any URL as an iframe. Useful for
// self-hosted services, dashboards (Grafana), docs, or web apps.
export default function EmbedWidget({ widget }) {
  const { updateWidget } = useDashboard()
  const [cfg, setCfg] = useWidgetState(widget.id, { url: '', title: '' })
  const [draft, setDraft] = useState({ url: cfg.url, title: cfg.title })
  const editing = !cfg.url

  function save(e) {
    e.preventDefault()
    let url = draft.url.trim()
    if (!url) return
    if (!/^https?:\/\//.test(url)) url = 'https://' + url
    setCfg({ url, title: draft.title.trim() })
    if (draft.title.trim()) updateWidget(widget.id, { title: draft.title.trim() })
  }

  if (editing) {
    return (
      <form className="embed-setup no-drag" onSubmit={save}>
        <div className="field">
          <label>Embed URL</label>
          <input className="input" placeholder="https://example.com" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} autoFocus />
        </div>
        <div className="field">
          <label>Title (optional)</label>
          <input className="input" placeholder="My service" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </div>
        <button className="btn primary sm" type="submit">Embed</button>
        <p className="faint" style={{ marginTop: 10, fontSize: 12 }}>
          Note: some sites block being embedded (X-Frame-Options / CSP).
        </p>
      </form>
    )
  }

  return (
    <div className="embed no-drag">
      <iframe
        src={cfg.url}
        title={cfg.title || 'Embed'}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerPolicy="no-referrer"
      />
      <button className="embed-edit" onClick={() => setCfg({ url: '', title: cfg.title })} title="Change URL">✎</button>
    </div>
  )
}
