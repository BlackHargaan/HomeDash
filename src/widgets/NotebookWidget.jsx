import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useWidgetState, uid } from '../lib/storage.js'
import { timeAgo } from '../lib/date.js'
import { DEFAULT_ICON, movePage, normalizePage, pageMarkdown, pageTitle } from '../../shared/notebook.js'

// The rich-text editor (TipTap) is a separate chunk, loaded on first use.
const NotebookEditor = lazy(() => import('./notebook/NotebookEditor.jsx'))

const ICONS = ['📄', '📝', '📌', '✅', '💡', '📚', '🗂️', '📅', '🎯', '🚀', '🏠', '🛒', '🍳', '✈️', '💪', '🎵', '🎮', '💼', '💰', '🧪', '🛠️', '🌱', '❤️', '⭐', '🔥', '🧠', '📷', '🐾', '🎁', '📦']

const WELCOME = {
  title: 'Getting started',
  icon: '👋',
  text: `This notebook works like a doc — just start typing.

## The basics
- [ ] Type **/** on a new line to add headings, to-do lists, quotes, code and more
- [ ] Select text to make it **bold**, *italic*, a link…
- [x] Shortcuts work too: \`#\` + space for a heading, \`-\` for a list, \`[]\` for a to-do

> Pages live in the sidebar. The assistant can read and write them for you.`,
}

const newPage = (fields = {}) => ({ id: uid('pg'), title: '', icon: DEFAULT_ICON, text: '', updated: new Date().toISOString(), ...fields })

function download(name, text) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function Popover({ onClose, className, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [onClose])
  return <div ref={ref} className={`nb-pop ${className || ''}`}>{children}</div>
}

export default function NotebookWidget({ widget }) {
  const [state, setState] = useWidgetState(widget.id, () => {
    const first = newPage(WELCOME)
    return { pages: [first], current: first.id }
  })
  const pages = state.pages.map(normalizePage)
  const page = pages.find((p) => p.id === state.current) || pages[0]
  const [menu, setMenu] = useState(null) // 'icon' | 'more' | null
  const [flash, setFlash] = useState('')
  const titleRef = useRef(null)
  const editorRef = useRef(null)
  const focusTitle = useRef(false)

  // Pages written before titles existed carry it as a "# Heading" line — lift it out once.
  useEffect(() => {
    if (state.pages.some((p) => typeof p.title !== 'string')) setState((s) => ({ ...s, pages: s.pages.map(normalizePage) }))
  }, [state.pages, setState])

  useEffect(() => {
    if (focusTitle.current) { focusTitle.current = false; titleRef.current?.focus() }
  }, [page?.id])

  const update = (id, patch) => setState((s) => ({
    ...s,
    pages: s.pages.map((p) => (p.id === id ? { ...normalizePage(p), ...patch, updated: new Date().toISOString() } : p)),
  }))

  // Synchronous focus (TipTap's focus() waits a frame, so fast typing would land in the title).
  function focusBody() {
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) return
    ed.view.focus()
    ed.commands.setTextSelection(1)
  }

  // Reordering: drag pages in the sidebar, Alt+↑/↓ on a focused page, or the ⋯ menu.
  const dragging = useRef(null)
  const [dropAt, setDropAt] = useState(null) // { id, after } — where the dragged page would land
  const reorder = (id, beforeId) => setState((s) => ({ ...s, pages: movePage(s.pages, id, beforeId) }))

  function shift(id, delta) {
    const i = pages.findIndex((p) => p.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= pages.length) return
    // Moving down means landing before the page two below (or at the end).
    reorder(id, delta < 0 ? pages[j].id : pages[j + 1]?.id ?? null)
  }

  function dropOn(e, target) {
    e.preventDefault()
    const id = dragging.current
    dragging.current = null
    setDropAt(null)
    if (!id || !target) return
    const i = pages.findIndex((p) => p.id === target.id)
    reorder(id, target.after ? pages[i + 1]?.id ?? null : target.id)
  }

  const open = (id) => { setMenu(null); setState((s) => ({ ...s, current: id })) }

  function add() {
    const p = newPage()
    focusTitle.current = true
    setMenu(null)
    setState((s) => ({ pages: [p, ...s.pages], current: p.id }))
  }

  function duplicate() {
    const i = pages.findIndex((p) => p.id === page.id)
    const copy = newPage({ title: `${page.title || 'Untitled'} (copy)`, icon: page.icon, text: page.text })
    setMenu(null)
    setState((s) => ({ pages: [...s.pages.slice(0, i + 1), copy, ...s.pages.slice(i + 1)], current: copy.id }))
  }

  function remove() {
    setMenu(null)
    if ((page.text.trim() || page.title.trim()) && !confirm(`Delete “${pageTitle(page)}”?`)) return
    setState((s) => {
      const i = s.pages.findIndex((p) => p.id === page.id)
      const rest = s.pages.filter((p) => p.id !== page.id)
      const list = rest.length ? rest : [newPage()]
      return { pages: list, current: list[Math.min(i, list.length - 1)].id }
    })
  }

  async function copyMarkdown() {
    setMenu(null)
    try { await navigator.clipboard.writeText(pageMarkdown(page)); setFlash('Copied as Markdown') } catch { setFlash('Copy failed') }
    setTimeout(() => setFlash(''), 1800)
  }

  function exportMarkdown() {
    setMenu(null)
    const name = pageTitle(page).replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'page'
    download(`${name}.md`, pageMarkdown(page))
  }

  if (!page) return null

  return (
    <div className="nb no-drag">
      <nav className="nb-side" aria-label="Pages">
        <div className="nb-side-head">
          <span>Pages</span>
          <button className="wtool" onClick={add} title="New page" aria-label="New page">＋</button>
        </div>
        <div className="nb-side-list"
          onDragOver={(e) => { if (dragging.current) e.preventDefault() }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropAt(null) }}
          onDrop={(e) => dropOn(e, dropAt || { id: pages[pages.length - 1].id, after: true })}>
          {pages.map((p) => (
            <button key={p.id} title={pageTitle(p)} draggable
              className={`nb-side-item ${p.id === page.id ? 'on' : ''} ${dropAt?.id === p.id ? (dropAt.after ? 'drop-after' : 'drop-before') : ''}`}
              onClick={() => open(p.id)}
              onKeyDown={(e) => {
                if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
                e.preventDefault()
                const el = e.currentTarget
                shift(p.id, e.key === 'ArrowUp' ? -1 : 1)
                requestAnimationFrame(() => el.focus()) // keep focus on the moved page
              }}
              onDragStart={(e) => {
                dragging.current = p.id
                e.dataTransfer.effectAllowed = 'move'
                // A private type only, so dropping on the editor doesn't paste the title.
                e.dataTransfer.setData('application/x-homedash-page', p.id)
              }}
              onDragEnd={() => { dragging.current = null; setDropAt(null) }}
              onDragOver={(e) => {
                if (!dragging.current) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                const r = e.currentTarget.getBoundingClientRect()
                const after = e.clientY > r.top + r.height / 2
                if (dropAt?.id !== p.id || dropAt.after !== after) setDropAt({ id: p.id, after })
              }}
              onDrop={(e) => dropOn(e, dropAt)}>
              <span className="nb-side-icon">{p.icon}</span>
              <span className={`nb-side-title ${p.title.trim() ? '' : 'faint'}`}>{pageTitle(p)}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="nb-main">
        <div className="nb-top">
          <select className="select sm nb-switch" value={page.id} onChange={(e) => open(e.target.value)} aria-label="Page">
            {pages.map((p) => <option key={p.id} value={p.id}>{p.icon} {pageTitle(p)}</option>)}
          </select>
          <button className="wtool nb-add-narrow" onClick={add} title="New page" aria-label="New page">＋</button>
          <span className="nb-edited faint">{flash || `Edited ${timeAgo(page.updated)}`}</span>
          <div className="nb-anchor">
            <button className="wtool" onClick={() => setMenu(menu === 'more' ? null : 'more')} title="Page options" aria-label="Page options" aria-expanded={menu === 'more'}>⋯</button>
            {menu === 'more' && (
              <Popover className="nb-menu" onClose={() => setMenu(null)}>
                <button onClick={duplicate}>Duplicate</button>
                <button onClick={() => { setMenu(null); shift(page.id, -1) }} disabled={pages[0].id === page.id}>Move up</button>
                <button onClick={() => { setMenu(null); shift(page.id, 1) }} disabled={pages[pages.length - 1].id === page.id}>Move down</button>
                <button onClick={copyMarkdown}>Copy as Markdown</button>
                <button onClick={exportMarkdown}>Export .md</button>
                <hr />
                <button className="danger" onClick={remove}>Delete page</button>
              </Popover>
            )}
          </div>
        </div>

        <div className="nb-doc">
          <div className="nb-head">
            <div className="nb-anchor">
              <button className="nb-icon" onClick={() => setMenu(menu === 'icon' ? null : 'icon')} title="Change icon" aria-label="Change icon">{page.icon}</button>
              {menu === 'icon' && (
                <Popover className="nb-icons" onClose={() => setMenu(null)}>
                  {ICONS.map((ic) => (
                    <button key={ic} className={ic === page.icon ? 'on' : ''} onClick={() => { update(page.id, { icon: ic }); setMenu(null) }}>{ic}</button>
                  ))}
                </Popover>
              )}
            </div>
            <input ref={titleRef} className="nb-title" value={page.title} placeholder="Untitled" aria-label="Page title"
              onChange={(e) => update(page.id, { title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.shiftKey)) { e.preventDefault(); focusBody() }
              }} />
          </div>
          <Suspense fallback={<div className="nbe nbe-loading faint">Loading editor…</div>}>
            <NotebookEditor key={page.id} pageId={page.id} markdown={page.text}
              onReady={(ed) => { editorRef.current = ed }}
              onChange={(text) => update(page.id, { text })} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
