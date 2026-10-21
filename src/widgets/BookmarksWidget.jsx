import { useRef, useState } from 'react'
import { useWidgetState, uid } from '../lib/storage.js'
import { parseBookmarksHtml } from '../lib/bookmarks.js'

const DEFAULTS = () => [
  { id: uid('bg'), name: 'Daily', links: [
    { id: uid('bm'), title: 'Gmail', url: 'https://mail.google.com' },
    { id: uid('bm'), title: 'Google Drive', url: 'https://drive.google.com' },
  ] },
  { id: uid('bg'), name: 'Reading', links: [
    { id: uid('bm'), title: 'Hacker News', url: 'https://news.ycombinator.com' },
    { id: uid('bm'), title: 'Wikipedia', url: 'https://en.wikipedia.org' },
  ] },
]

const favicon = (url) => {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32` } catch { return null }
}

export default function BookmarksWidget({ widget }) {
  const [groups, setGroups] = useWidgetState(widget.id, DEFAULTS)
  const [addingTo, setAddingTo] = useState(null)
  const [draft, setDraft] = useState({ title: '', url: '' })
  const [over, setOver] = useState(null)
  const [msg, setMsg] = useState(null)
  const fileRef = useRef(null)
  const dragging = useRef(null) // { groupId, linkId }

  const patchGroup = (id, fn) => setGroups((gs) => gs.map((g) => (g.id === id ? fn(g) : g)))

  function addLink(e, groupId) {
    e.preventDefault()
    let url = draft.url.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    let title = draft.title.trim()
    if (!title) { try { title = new URL(url).hostname.replace(/^www\./, '') } catch { title = url } }
    patchGroup(groupId, (g) => ({ ...g, links: [...g.links, { id: uid('bm'), title, url }] }))
    setDraft({ title: '', url: '' })
    setAddingTo(null)
  }

  function addGroup() {
    const name = prompt('Group name:', 'New group')
    if (name && name.trim()) setGroups((gs) => [...gs, { id: uid('bg'), name: name.trim(), links: [] }])
  }

  function rename(g) {
    const name = prompt('Rename group:', g.name)
    if (name && name.trim()) patchGroup(g.id, (x) => ({ ...x, name: name.trim() }))
  }

  function removeGroup(g) {
    if (g.links.length && !confirm(`Delete “${g.name}” and its ${g.links.length} bookmark${g.links.length === 1 ? '' : 's'}?`)) return
    setGroups((gs) => gs.filter((x) => x.id !== g.id))
  }

  // Drop a dragged link into a group (before `beforeId`, or at the end).
  function drop(groupId, beforeId = null) {
    const d = dragging.current
    dragging.current = null
    setOver(null)
    if (!d || d.linkId === beforeId) return
    setGroups((gs) => {
      const link = gs.find((g) => g.id === d.groupId)?.links.find((l) => l.id === d.linkId)
      if (!link) return gs
      return gs.map((g) => {
        let links = g.links.filter((l) => l.id !== d.linkId)
        if (g.id === groupId) {
          const at = beforeId ? links.findIndex((l) => l.id === beforeId) : -1
          links = at < 0 ? [...links, link] : [...links.slice(0, at), link, ...links.slice(at)]
        }
        return { ...g, links }
      })
    })
  }

  function importFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseBookmarksHtml(String(reader.result))
      if (!parsed.length) { setMsg('No bookmarks found in that file.'); return }
      let added = 0
      setGroups((gs) => {
        const next = gs.map((g) => ({ ...g, links: [...g.links] }))
        for (const pg of parsed) {
          let g = next.find((x) => x.name === pg.name)
          if (!g) { g = { id: uid('bg'), name: pg.name, links: [], collapsed: true }; next.push(g) }
          for (const l of pg.links) {
            if (g.links.some((x) => x.url === l.url)) continue
            g.links.push({ id: uid('bm'), ...l })
            added++
          }
        }
        return next
      })
      setTimeout(() => setMsg(`Imported ${added} bookmark${added === 1 ? '' : 's'}.`))
    }
    reader.readAsText(f)
  }

  return (
    <div className="bm no-drag">
      <div className="bm-groups">
        {groups.map((g) => (
          <section key={g.id} className={`bm-group ${over === g.id ? 'drop-over' : ''}`}
            onDragOver={(e) => { if (dragging.current) { e.preventDefault(); setOver(g.id) } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null) }}
            onDrop={(e) => { e.preventDefault(); drop(g.id) }}>
            <header className="bm-head">
              <button className="bm-toggle" onClick={() => patchGroup(g.id, (x) => ({ ...x, collapsed: !x.collapsed }))} aria-expanded={!g.collapsed}>
                <span className="bm-caret">{g.collapsed ? '▸' : '▾'}</span>
                <span className="bm-name" onDoubleClick={(e) => { e.stopPropagation(); rename(g) }} title="Double-click to rename">{g.name}</span>
                <span className="faint bm-count">{g.links.length}</span>
              </button>
              <span className="bm-tools">
                <button className="wtool" title="Add bookmark" aria-label={`Add bookmark to ${g.name}`}
                  onClick={() => { setAddingTo(addingTo === g.id ? null : g.id); patchGroup(g.id, (x) => ({ ...x, collapsed: false })) }}>＋</button>
                <button className="wtool del" title="Delete group" aria-label={`Delete group ${g.name}`} onClick={() => removeGroup(g)}>✕</button>
              </span>
            </header>
            {!g.collapsed && (
              <div className="bm-links">
                {g.links.map((l) => (
                  <div key={l.id} className="bm-link" draggable
                    onDragStart={(e) => { dragging.current = { groupId: g.id, linkId: l.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/uri-list', l.url) }}
                    onDragEnd={() => { dragging.current = null; setOver(null) }}
                    onDragOver={(e) => { if (dragging.current) e.preventDefault() }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(g.id, l.id) }}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.url} draggable={false}>
                      <img src={favicon(l.url)} alt="" width={16} height={16} loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                      <span>{l.title}</span>
                    </a>
                    <button className="svc-del" onClick={() => patchGroup(g.id, (x) => ({ ...x, links: x.links.filter((y) => y.id !== l.id) }))} aria-label={`Remove ${l.title}`}>✕</button>
                  </div>
                ))}
                {!g.links.length && addingTo !== g.id && <div className="faint bm-empty">Empty — add one with ＋ or drag a bookmark here.</div>}
                {addingTo === g.id && (
                  <form className="bm-form" onSubmit={(e) => addLink(e, g.id)}>
                    <input className="input sm" placeholder="URL" autoFocus value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
                    <input className="input sm" placeholder="Title (optional)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                    <div className="row">
                      <button className="btn sm primary" type="submit">Add</button>
                      <button className="btn sm ghost" type="button" onClick={() => setAddingTo(null)}>Cancel</button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
      <div className="bm-foot">
        <button className="btn sm ghost" onClick={addGroup}>＋ Group</button>
        <button className="btn sm ghost" onClick={() => fileRef.current?.click()} title="Import the bookmarks.html file your browser exports">⇩ Import from browser</button>
        <input ref={fileRef} type="file" accept=".html,.htm,text/html" hidden onChange={importFile} />
        {msg && <span className="faint bm-msg">{msg}</span>}
      </div>
    </div>
  )
}
