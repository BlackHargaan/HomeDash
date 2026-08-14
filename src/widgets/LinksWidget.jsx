import { useState } from 'react'
import { useWidgetState, uid } from '../lib/storage.js'

const DEFAULTS = [
  { id: uid('l'), label: 'Gmail', url: 'https://mail.google.com', icon: '✉️' },
  { id: uid('l'), label: 'Calendar', url: 'https://calendar.google.com', icon: '📅' },
  { id: uid('l'), label: 'GitHub', url: 'https://github.com', icon: '🐙' },
  { id: uid('l'), label: 'YouTube', url: 'https://youtube.com', icon: '▶️' },
]

function faviconFor(url) {
  try {
    const u = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`
  } catch {
    return null
  }
}

export default function LinksWidget({ widget }) {
  const [links, setLinks] = useWidgetState(widget.id, DEFAULTS)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ label: '', url: '', icon: '' })

  function add(e) {
    e.preventDefault()
    let url = draft.url.trim()
    if (!url) return
    if (!/^https?:\/\//.test(url)) url = 'https://' + url
    setLinks((l) => [...l, { id: uid('l'), label: draft.label.trim() || new URL(url).hostname, url, icon: draft.icon.trim() }])
    setDraft({ label: '', url: '', icon: '' })
    setAdding(false)
  }

  function remove(id) {
    setLinks((l) => l.filter((x) => x.id !== id))
  }

  return (
    <div className="links no-drag">
      <div className="links-grid">
        {links.map((l) => (
          <div key={l.id} className="link-cell">
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="link-tile" title={l.url}>
              <span className="link-icon">
                {l.icon ? l.icon : <img src={faviconFor(l.url)} alt="" width={26} height={26} onError={(e) => (e.target.style.display = 'none')} />}
              </span>
              <span className="link-label">{l.label}</span>
            </a>
            <button className="link-del" onClick={() => remove(l.id)} title="Remove" aria-label="Remove link">✕</button>
          </div>
        ))}
        {!adding && (
          <button className="link-tile add" onClick={() => setAdding(true)}>
            <span className="link-icon">＋</span>
            <span className="link-label">Add</span>
          </button>
        )}
      </div>

      {adding && (
        <form className="link-form" onSubmit={add}>
          <div className="row">
            <input className="input" placeholder="URL" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} autoFocus />
          </div>
          <div className="row">
            <input className="input" placeholder="Label (optional)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            <input className="input" placeholder="Emoji" style={{ maxWidth: 70 }} value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
          </div>
          <div className="row">
            <button type="submit" className="btn sm primary">Add</button>
            <button type="button" className="btn sm ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}
