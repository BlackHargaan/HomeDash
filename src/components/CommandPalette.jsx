import { useEffect, useMemo, useRef, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { uid } from '../lib/storage.js'

// ⌘K / Ctrl-K launcher: fuzzy-filter a list of actions, or drop into a small
// input sub-mode for "New task" / "New board".
export default function CommandPalette({ onClose, onAddWidget, onSettings }) {
  const dash = useDashboard()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState(null) // null | { kind, label, placeholder, run }
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [mode])

  const commands = useMemo(() => {
    const list = [
      {
        id: 'new-task', icon: '✅', label: 'New task', hint: 'Add a to-do',
        run: () => setMode({
          kind: 'task', label: 'New task', placeholder: 'What needs doing?',
          run: (val) => { dash.setTasks((t) => [...t, { id: uid('t'), title: val, done: false, due: null, priority: 'med', createdAt: Date.now() }]); onClose() },
        }),
      },
      {
        id: 'add-widget', icon: '➕', label: 'Add widget…', hint: 'Open the widget catalog',
        run: () => { onClose(); onAddWidget() },
      },
      {
        id: 'new-board', icon: '🗂️', label: 'New board', hint: 'Create a dashboard',
        run: () => setMode({
          kind: 'board', label: 'New board', placeholder: 'Board name (e.g. Work)',
          run: (val) => { dash.addBoard(val); onClose() },
        }),
      },
      {
        id: 'toggle-theme', icon: dash.theme === 'dark' ? '☀️' : '🌙',
        label: `Switch to ${dash.theme === 'dark' ? 'light' : 'dark'} theme`, hint: 'Appearance',
        run: () => { dash.setTheme(dash.theme === 'dark' ? 'light' : 'dark'); onClose() },
      },
      {
        id: 'toggle-edit', icon: '✎', label: dash.editMode ? 'Done editing layout' : 'Edit layout', hint: 'Rearrange widgets',
        run: () => { dash.setEditMode((e) => !e); onClose() },
      },
      {
        id: 'settings', icon: '⚙️', label: 'Open settings', hint: 'Theme, backup, name',
        run: () => { onClose(); onSettings() },
      },
    ]
    // One "switch board" command per non-active board.
    for (const b of dash.boards) {
      if (b.id === dash.activeBoardId) continue
      list.push({
        id: 'board-' + b.id, icon: b.icon, label: `Go to ${b.name}`, hint: 'Board',
        run: () => { dash.switchBoard(b.id); onClose() },
      })
    }
    return list
  }, [dash, onAddWidget, onSettings, onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => { setSel(0) }, [query])

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); mode ? setMode(null) : onClose(); return }
    if (mode) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[sel]?.run() }
  }

  return (
    <div className="modal-scrim palette-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" onKeyDown={onKey}>
        {mode ? (
          <form
            className="palette-input-wrap"
            onSubmit={(e) => { e.preventDefault(); const v = inputRef.current.value.trim(); if (v) mode.run(v) }}
          >
            <span className="palette-mode-badge">{mode.label}</span>
            <input ref={inputRef} className="palette-input" placeholder={mode.placeholder} />
          </form>
        ) : (
          <>
            <div className="palette-input-wrap">
              <span className="palette-search-icon">⌘</span>
              <input
                ref={inputRef}
                className="palette-input"
                placeholder="Type a command…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="palette-list">
              {filtered.length === 0 && <div className="palette-empty">No commands match “{query}”.</div>}
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  className={`palette-item ${i === sel ? 'sel' : ''}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => c.run()}
                >
                  <span className="palette-item-icon">{c.icon}</span>
                  <span className="palette-item-label">{c.label}</span>
                  <span className="palette-item-hint faint">{c.hint}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
