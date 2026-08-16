import { useRef, useState } from 'react'
import { useWidgetState, uid } from '../lib/storage.js'

const DEFAULT_BOARD = {
  columns: [
    { id: uid('col'), title: 'To do', cards: [] },
    { id: uid('col'), title: 'Doing', cards: [] },
    { id: uid('col'), title: 'Done', cards: [] },
  ],
}

export default function KanbanWidget({ widget }) {
  const [board, setBoard] = useWidgetState(widget.id, DEFAULT_BOARD)
  const drag = useRef(null) // { fromCol, cardId }

  function addCard(colId, text) {
    if (!text.trim()) return
    setBoard((b) => ({
      ...b,
      columns: b.columns.map((c) => (c.id === colId ? { ...c, cards: [...c.cards, { id: uid('card'), text: text.trim() }] } : c)),
    }))
  }
  function editCard(colId, cardId, text) {
    setBoard((b) => ({
      ...b,
      columns: b.columns.map((c) =>
        c.id === colId ? { ...c, cards: c.cards.map((k) => (k.id === cardId ? { ...k, text } : k)) } : c),
    }))
  }
  function removeCard(colId, cardId) {
    setBoard((b) => ({
      ...b,
      columns: b.columns.map((c) => (c.id === colId ? { ...c, cards: c.cards.filter((k) => k.id !== cardId) } : c)),
    }))
  }
  function moveCard(fromCol, cardId, toCol, beforeCardId) {
    setBoard((b) => {
      const columns = b.columns.map((c) => ({ ...c, cards: [...c.cards] }))
      const from = columns.find((c) => c.id === fromCol)
      const to = columns.find((c) => c.id === toCol)
      if (!from || !to) return b
      const idx = from.cards.findIndex((k) => k.id === cardId)
      if (idx < 0) return b
      const [card] = from.cards.splice(idx, 1)
      if (beforeCardId) {
        const bi = to.cards.findIndex((k) => k.id === beforeCardId)
        to.cards.splice(bi < 0 ? to.cards.length : bi, 0, card)
      } else {
        to.cards.push(card)
      }
      return { ...b, columns }
    })
  }

  function addColumn() {
    const title = prompt('Column name:', 'New')
    if (title && title.trim()) setBoard((b) => ({ ...b, columns: [...b.columns, { id: uid('col'), title: title.trim(), cards: [] }] }))
  }
  function renameColumn(colId, cur) {
    const title = prompt('Rename column:', cur)
    if (title != null && title.trim()) setBoard((b) => ({ ...b, columns: b.columns.map((c) => (c.id === colId ? { ...c, title: title.trim() } : c)) }))
  }
  function removeColumn(colId) {
    setBoard((b) => (b.columns.length <= 1 ? b : { ...b, columns: b.columns.filter((c) => c.id !== colId) }))
  }

  return (
    <div className="kanban no-drag">
      {board.columns.map((col) => (
        <div
          key={col.id}
          className="kb-col"
          onDragOver={(e) => { if (drag.current) { e.preventDefault(); e.currentTarget.classList.add('kb-over') } }}
          onDragLeave={(e) => e.currentTarget.classList.remove('kb-over')}
          onDrop={(e) => {
            e.currentTarget.classList.remove('kb-over')
            if (drag.current) moveCard(drag.current.fromCol, drag.current.cardId, col.id, null)
          }}
        >
          <div className="kb-col-head">
            <span className="kb-col-title" onDoubleClick={() => renameColumn(col.id, col.title)} title="Double-click to rename">{col.title}</span>
            <span className="kb-col-count">{col.cards.length}</span>
            <button className="kb-col-del" title="Delete column" onClick={() => removeColumn(col.id)}>✕</button>
          </div>
          <div className="kb-cards">
            {col.cards.map((card) => (
              <div
                key={card.id}
                className="kb-card"
                draggable
                onDragStart={(e) => { drag.current = { fromCol: col.id, cardId: card.id }; e.dataTransfer.effectAllowed = 'move' }}
                onDragEnd={() => { drag.current = null }}
                onDragOver={(e) => { if (drag.current) e.preventDefault() }}
                onDrop={(e) => {
                  e.stopPropagation()
                  if (drag.current) moveCard(drag.current.fromCol, drag.current.cardId, col.id, card.id)
                }}
                onDoubleClick={() => { const t = prompt('Edit card:', card.text); if (t != null && t.trim()) editCard(col.id, card.id, t.trim()) }}
              >
                <span className="kb-card-text">{card.text}</span>
                <button className="kb-card-del" onClick={() => removeCard(col.id, card.id)} aria-label="Delete card">✕</button>
              </div>
            ))}
          </div>
          <AddCard onAdd={(t) => addCard(col.id, t)} />
        </div>
      ))}
      <button className="kb-addcol" onClick={addColumn} title="Add column">＋</button>
    </div>
  )
}

function AddCard({ onAdd }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  if (!open) return <button className="kb-add" onClick={() => setOpen(true)}>＋ Add card</button>
  return (
    <form
      className="kb-add-form"
      onSubmit={(e) => { e.preventDefault(); onAdd(text); setText(''); setOpen(false) }}
    >
      <textarea
        className="input" rows={2} placeholder="Card text…" value={text} autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAdd(text); setText(''); setOpen(false) } if (e.key === 'Escape') setOpen(false) }}
      />
      <div className="row">
        <button className="btn sm primary" type="submit">Add</button>
        <button className="btn sm ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}
