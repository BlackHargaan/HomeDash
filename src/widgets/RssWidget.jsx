import { useCallback, useEffect, useRef, useState } from 'react'
import { useWidgetState, uid } from '../lib/storage.js'
import { smartFetch, serverUsable } from '../lib/server.js'
import { parseFeed } from '../lib/feed.js'
import { timeAgo } from '../lib/date.js'

const REFRESH_MS = 15 * 60 * 1000
const MAX_ITEMS = 60
const SUGGESTIONS = [
  ['Hacker News', 'https://hnrss.org/frontpage'],
  ['BBC News', 'https://feeds.bbci.co.uk/news/rss.xml'],
  ['The Verge', 'https://www.theverge.com/rss/index.xml'],
  ['NASA', 'https://www.nasa.gov/feed/'],
]

const INITIAL = { feeds: [], items: [], fetchedAt: null, errors: {}, read: [], showSummary: true }

export default function RssWidget({ widget }) {
  const [state, setState] = useWidgetState(widget.id, INITIAL)
  const { feeds, items, fetchedAt, errors = {}, read = [], showSummary = true } = state
  const [managing, setManaging] = useState(!feeds.length)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const patch = (p) => setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }))

  const feedsRef = useRef(feeds)
  feedsRef.current = feeds

  const refresh = useCallback(async () => {
    const list = feedsRef.current
    if (!list.length) return
    setLoading(true)
    const results = await Promise.allSettled(list.map(async (f) => {
      const res = await smartFetch(f.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return parseFeed(await res.text())
    }))
    const nextErrors = {}
    const merged = []
    const titles = {}
    results.forEach((r, i) => {
      const f = list[i]
      if (r.status === 'rejected') {
        nextErrors[f.id] = r.reason?.message === 'Failed to fetch' && !serverUsable()
          ? 'blocked by the site (needs the HomeDash server)'
          : r.reason?.message || 'failed'
        return
      }
      if (r.value.title && r.value.title !== f.title) titles[f.id] = r.value.title
      for (const it of r.value.items) merged.push({ ...it, id: `${f.id}:${it.id}`, feedId: f.id })
    })
    merged.sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0))
    patch((s) => {
      // Keep the previous items of feeds that failed this time.
      const failed = new Set(Object.keys(nextErrors))
      const kept = s.items.filter((it) => failed.has(it.feedId))
      const all = [...merged, ...kept].sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0))
      return {
        items: all.slice(0, MAX_ITEMS),
        fetchedAt: new Date().toISOString(),
        errors: nextErrors,
        feeds: s.feeds.map((f) => (titles[f.id] && !f.custom ? { ...f, title: titles[f.id] } : f)),
      }
    })
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const feedKey = feeds.map((f) => f.url).join('|')
  useEffect(() => {
    const stale = !fetchedAt || Date.now() - Date.parse(fetchedAt) > REFRESH_MS
    if (stale) refresh()
    const iv = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(iv)
  }, [feedKey, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  function addFeed(raw, title) {
    let u = (raw || '').trim()
    if (!u) return
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    if (feeds.some((f) => f.url === u)) return
    let host = u
    try { host = new URL(u).hostname.replace(/^www\./, '') } catch { /* keep */ }
    patch((s) => ({ feeds: [...s.feeds, { id: uid('feed'), url: u, title: title || host }], fetchedAt: null }))
    setUrl('')
  }

  function removeFeed(id) {
    patch((s) => ({ feeds: s.feeds.filter((f) => f.id !== id), items: s.items.filter((it) => it.feedId !== id) }))
  }

  function markRead(id) {
    if (read.includes(id)) return
    patch((s) => ({ read: [id, ...(s.read || [])].slice(0, 400) }))
  }

  const feedTitle = (id) => feeds.find((f) => f.id === id)?.title || ''
  const unread = items.filter((it) => !read.includes(it.id)).length

  return (
    <div className="rss no-drag">
      <div className="rss-bar">
        <span className="faint">{feeds.length ? `${unread} unread · ${fetchedAt ? 'updated ' + timeAgo(fetchedAt) : 'loading…'}` : 'No feeds yet'}</span>
        <span className="spacer" />
        {items.length > 0 && unread > 0 && (
          <button className="chip" onClick={() => patch((s) => ({ read: [...new Set([...s.items.map((i) => i.id), ...(s.read || [])])].slice(0, 400) }))}>Mark all read</button>
        )}
        <button className="wtool" title="Refresh" aria-label="Refresh feeds" onClick={refresh} disabled={loading || !feeds.length}>{loading ? '…' : '↻'}</button>
        <button className={`wtool ${managing ? 'on' : ''}`} title="Manage feeds" aria-label="Manage feeds" onClick={() => setManaging((m) => !m)}>⚙</button>
      </div>

      {managing && (
        <div className="rss-manage">
          {feeds.map((f) => (
            <div key={f.id} className="rss-feed-row">
              <span className="rss-feed-name" title={f.url}>{f.title}</span>
              {errors[f.id] && <span className="err-msg rss-feed-err" title={errors[f.id]}>⚠ {errors[f.id]}</span>}
              <button className="svc-del" onClick={() => removeFeed(f.id)} aria-label={`Remove ${f.title}`}>✕</button>
            </div>
          ))}
          <form className="row" onSubmit={(e) => { e.preventDefault(); addFeed(url) }}>
            <input className="input sm" placeholder="Feed URL (RSS or Atom)" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Feed URL" />
            <button className="btn sm primary" style={{ flex: '0 0 auto' }} type="submit">Add</button>
          </form>
          <div className="rss-suggest">
            {SUGGESTIONS.filter(([, u]) => !feeds.some((f) => f.url === u)).map(([name, u]) => (
              <button key={u} className="chip" onClick={() => addFeed(u, name)}>＋ {name}</button>
            ))}
          </div>
          <label className="chip-inline faint rss-opt">
            <input type="checkbox" checked={showSummary} onChange={(e) => patch({ showSummary: e.target.checked })} /> Show summaries
          </label>
          {!serverUsable() && <div className="faint rss-note">Tip: most sites block feed requests from a browser. Running HomeDash with its server (Docker or the desktop app) fetches them for you.</div>}
        </div>
      )}

      <div className="rss-list">
        {feeds.length > 0 && !items.length && !loading && !Object.keys(errors).length && <div className="empty-hint">No articles yet.</div>}
        {items.map((it) => (
          <a key={it.id} className={`rss-item ${read.includes(it.id) ? 'read' : ''}`} href={it.link || undefined}
            target="_blank" rel="noopener noreferrer" onClick={() => markRead(it.id)} onAuxClick={() => markRead(it.id)}>
            <span className="rss-title">{it.title}</span>
            {showSummary && it.summary && <span className="rss-summary">{it.summary}</span>}
            <span className="rss-meta faint">{feedTitle(it.feedId)}{it.date ? ` · ${timeAgo(it.date)}` : ''}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
