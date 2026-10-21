import { useEffect, useRef, useState } from 'react'
import { useWidgetState, uid } from '../lib/storage.js'
import { ENGINES, resolveSearch } from '../lib/search.js'

export default function SearchWidget({ widget }) {
  const [state, setState] = useWidgetState(widget.id, { engine: 'google', newTab: true, custom: [] })
  const { engine, newTab = true, custom = [] } = state
  const engines = [...ENGINES, ...custom]
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', url: '', bang: '' })
  const inputRef = useRef(null)
  const patch = (p) => setState((s) => ({ ...s, ...p }))

  // "/" anywhere focuses the search box (unless you're typing somewhere else).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = document.activeElement
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (document.querySelector('.modal')) return
      if (document.querySelector('.search-w input') !== inputRef.current) return // first search widget wins
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function submit(e) {
    e.preventDefault()
    if (!q.trim()) return
    window.open(resolveSearch(q, engines, engine), newTab ? '_blank' : '_self', 'noopener')
    setQ('')
  }

  function addEngine(e) {
    e.preventDefault()
    let url = draft.url.trim()
    if (!draft.name.trim() || !url.includes('%s')) return
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    const item = { id: uid('eng'), name: draft.name.trim(), url, bang: draft.bang.trim().replace(/^!/, '').toLowerCase() || undefined }
    patch({ custom: [...custom, item], engine: item.id })
    setDraft({ name: '', url: '', bang: '' })
    setAdding(false)
  }

  const current = engines.find((x) => x.id === engine) || engines[0]

  return (
    <div className="search-w no-drag">
      <form className="search-box" onSubmit={submit}>
        <span className="search-icon">⌕</span>
        <input ref={inputRef} className="search-input" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${current.name} or type a URL   ( / )`} aria-label="Search the web" />
        <button className="btn sm primary" type="submit">Go</button>
      </form>
      <div className="search-engines">
        {engines.map((x) => (
          <button key={x.id} className={`chip ${x.id === current.id ? 'on' : ''}`} onClick={() => patch({ engine: x.id })}
            title={x.bang ? `Shortcut: !${x.bang} your search` : x.name}
            onDoubleClick={() => { if (custom.some((c) => c.id === x.id) && confirm(`Remove ${x.name}?`)) patch({ custom: custom.filter((c) => c.id !== x.id), engine: 'google' }) }}>
            {x.name}
          </button>
        ))}
        <button className="chip" onClick={() => setAdding((a) => !a)} title="Add a custom search engine">＋</button>
      </div>
      {adding && (
        <form className="search-add" onSubmit={addEngine}>
          <div className="row">
            <input className="input sm" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <input className="input sm" placeholder="!bang" style={{ maxWidth: 80 }} value={draft.bang} onChange={(e) => setDraft({ ...draft, bang: e.target.value })} />
          </div>
          <input className="input sm" placeholder="URL with %s, e.g. https://jellyfin.local/search?q=%s" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          <div className="row">
            <button className="btn sm primary" type="submit" disabled={!draft.name.trim() || !draft.url.includes('%s')}>Add engine</button>
            <button className="btn sm ghost" type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}
      <label className="chip-inline faint search-opt">
        <input type="checkbox" checked={newTab} onChange={(e) => patch({ newTab: e.target.checked })} /> Open in a new tab
        <span className="search-tip">· try <code>!yt</code>, <code>!w</code>, <code>!gh</code></span>
      </label>
    </div>
  )
}
