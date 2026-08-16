import { useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'

export default function BoardTabs() {
  const { boards, activeBoardId, switchBoard, addBoard, renameBoard, removeBoard, editMode } = useDashboard()
  const [renaming, setRenaming] = useState(null)
  const [draft, setDraft] = useState('')

  function startRename(b) {
    setRenaming(b.id)
    setDraft(b.name)
  }
  function commitRename(id) {
    if (draft.trim()) renameBoard(id, { name: draft.trim() })
    setRenaming(null)
  }

  return (
    <div className="boardtabs">
      {boards.map((b) => (
        <div key={b.id} className={`boardtab ${b.id === activeBoardId ? 'on' : ''}`}>
          {renaming === b.id ? (
            <input
              className="boardtab-input"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitRename(b.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(b.id); if (e.key === 'Escape') setRenaming(null) }}
            />
          ) : (
            <button
              className="boardtab-btn"
              onClick={() => switchBoard(b.id)}
              onDoubleClick={() => startRename(b)}
              title={editMode ? 'Double-click to rename' : b.name}
            >
              <span className="boardtab-icon">{b.icon}</span>
              <span className="boardtab-name">{b.name}</span>
            </button>
          )}
          {editMode && boards.length > 1 && renaming !== b.id && (
            <button
              className="boardtab-del"
              title="Delete board"
              onClick={() => { if (confirm(`Delete the "${b.name}" board? Its layout is removed (shared data like tasks/events stays).`)) removeBoard(b.id) }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        className="boardtab-add"
        title="New board"
        onClick={() => {
          const name = prompt('Name this board:', 'Work')
          if (name && name.trim()) addBoard(name.trim())
        }}
      >
        ＋
      </button>
    </div>
  )
}
