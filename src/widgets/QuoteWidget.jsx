import { useState } from 'react'
import { useWidgetState } from '../lib/storage.js'
import { QUOTES, quoteForDay, dayIndex } from '../lib/quotes.js'

// "Quote text — Author" per line (author optional).
function parseMine(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(.*?)\s+[—–-]{1,2}\s+(.+)$/)
    return { text: (m ? m[1] : l).replace(/^["“]|["”]$/g, ''), author: m ? m[2] : '' }
  })
}

export default function QuoteWidget({ widget }) {
  const [state, setState] = useWidgetState(widget.id, { source: 'builtin', mine: '', favorites: [], day: null, offset: 0 })
  const { source = 'builtin', mine = '', favorites = [] } = state
  const [editing, setEditing] = useState(false)
  const today = dayIndex()
  const offset = state.day === today ? state.offset : 0 // "next" only lasts for the day
  const patch = (p) => setState((s) => ({ ...s, ...p }))

  const list = source === 'mine' ? parseMine(mine)
    : source === 'favorites' ? favorites
      : source === 'both' ? [...QUOTES, ...parseMine(mine)]
        : QUOTES
  const q = quoteForDay(list, new Date(), offset)
  const isFav = q && favorites.some((f) => f.text === q.text)

  function toggleFav() {
    if (!q) return
    patch({ favorites: isFav ? favorites.filter((f) => f.text !== q.text) : [...favorites, q] })
  }

  return (
    <div className="quote no-drag">
      {editing ? (
        <div className="quote-edit">
          <label className="faint quote-label">Show</label>
          <div className="quote-sources">
            {[['builtin', 'Built-in'], ['mine', 'My quotes'], ['both', 'Both'], ['favorites', 'Favorites']].map(([v, l]) => (
              <button key={v} className={`chip ${source === v ? 'on' : ''}`} onClick={() => patch({ source: v })}>{l}</button>
            ))}
          </div>
          <label className="faint quote-label">My quotes — one per line, “Quote — Author”</label>
          <textarea className="input quote-mine" rows={5} value={mine} onChange={(e) => patch({ mine: e.target.value })}
            placeholder="Stay hungry, stay foolish. — Whole Earth Catalog" />
          <button className="btn sm primary" onClick={() => setEditing(false)}>Done</button>
        </div>
      ) : q ? (
        <figure className="quote-body">
          <blockquote className="quote-text">“{q.text}”</blockquote>
          {q.author && <figcaption className="quote-author">— {q.author}</figcaption>}
        </figure>
      ) : (
        <div className="empty-hint">{source === 'favorites' ? 'No favorites yet — tap ♡ on a quote you like.' : 'Add some quotes with ⚙.'}</div>
      )}
      {!editing && (
        <div className="quote-tools">
          <button className="wtool" onClick={() => patch({ day: today, offset: offset - 1 })} aria-label="Previous quote" title="Previous">‹</button>
          <button className="wtool" onClick={() => patch({ day: today, offset: offset + 1 })} aria-label="Next quote" title="Next">›</button>
          <button className={`wtool ${isFav ? 'fav' : ''}`} onClick={toggleFav} aria-label={isFav ? 'Unfavorite' : 'Favorite'} title="Favorite" disabled={!q}>{isFav ? '♥' : '♡'}</button>
          <button className="wtool" onClick={() => q && navigator.clipboard?.writeText(`“${q.text}”${q.author ? ' — ' + q.author : ''}`)} aria-label="Copy quote" title="Copy" disabled={!q}>⧉</button>
          <span className="spacer" />
          <button className="wtool" onClick={() => setEditing(true)} aria-label="Quote settings" title="Settings">⚙</button>
        </div>
      )}
    </div>
  )
}
