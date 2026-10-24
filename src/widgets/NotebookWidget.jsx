import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useWidgetState, uid } from '../lib/storage.js'
import { timeAgo } from '../lib/date.js'
import {
  DEFAULT_ICON, ancestorsOf, childrenOf, descendantIds, normalizePage, pageMarkdown, pageRows, pageTitle, parentOf, placePage,
} from '../../shared/notebook.js'

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

  // ---- Page tree: sub-pages, reordering (drag, Alt+arrows, ⋯ menu), collapse.
  const rows = pageRows(pages)
  const parentId = (p) => parentOf(pages, p)
  const siblings = (p) => childrenOf(pages, parentId(p))
  const place = (id, parent, beforeId) => setState((s) => ({ ...s, pages: placePage(s.pages, id, parent, beforeId) }))
  // Expand/collapse and other tree housekeeping don't count as edits.
  const setFlags = (fn) => setState((s) => ({ ...s, pages: s.pages.map((p) => fn(p) ?? p) }))
  const expand = (ids) => setFlags((p) => (ids.includes(p.id) && p.collapsed ? { ...p, collapsed: false } : null))

  function shift(id, delta) {
    const p = pages.find((x) => x.id === id)
    const sibs = siblings(p)
    const i = sibs.findIndex((x) => x.id === id)
    const j = i + delta
    if (j < 0 || j >= sibs.length) return
    // Moving down means landing before the sibling two below (or last).
    place(id, parentId(p), delta < 0 ? sibs[j].id : sibs[j + 1]?.id ?? null)
  }

  // Nest under the sibling above / move out to sit right after the parent.
  function indent(id) {
    const p = pages.find((x) => x.id === id)
    const sibs = siblings(p)
    const prev = sibs[sibs.findIndex((x) => x.id === id) - 1]
    if (!prev) return
    place(id, prev.id, null)
    expand([prev.id])
  }

  function outdent(id) {
    const p = pages.find((x) => x.id === id)
    const parent = pages.find((x) => x.id === parentId(p))
    if (!parent) return
    const sibs = siblings(parent)
    place(id, parentId(parent), sibs[sibs.findIndex((x) => x.id === parent.id) + 1]?.id ?? null)
  }

  const dragging = useRef(null)
  const [dropAt, setDropAt] = useState(null) // { id, pos: 'before' | 'inside' | 'after' }

  // Top of a row: before it; bottom: after it; middle: inside it (as a sub-page).
  // Never onto the dragged page itself or one of its own sub-pages.
  function dropTarget(e, p) {
    const id = dragging.current
    if (!id || id === p.id || descendantIds(pages, id).has(p.id)) return null
    const r = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    return { id: p.id, pos: y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside' }
  }

  function dropOn(e, target) {
    e.preventDefault()
    const id = dragging.current
    dragging.current = null
    setDropAt(null)
    if (!id || !target || target.id === id) return
    const t = pages.find((x) => x.id === target.id)
    const kids = childrenOf(pages, t.id)
    if (target.pos === 'inside') { place(id, t.id, null); expand([t.id]); return }
    if (target.pos === 'before') { place(id, parentId(t), t.id); return }
    // Below an open page with sub-pages, the line sits above its first sub-page.
    if (kids.length && !t.collapsed) { place(id, t.id, kids[0].id); return }
    const sibs = siblings(t)
    place(id, parentId(t), sibs[sibs.findIndex((x) => x.id === t.id) + 1]?.id ?? null)
  }

  function open(id) {
    setMenu(null)
    // Reveal the page in the sidebar if it sits inside a collapsed page.
    expand(ancestorsOf(pages, id).map((p) => p.id))
    setState((s) => ({ ...s, current: id }))
  }

  function add(parent = null) {
    const p = newPage(parent ? { parent } : {})
    focusTitle.current = true
    setMenu(null)
    // A new top-level page goes first; a new sub-page goes last under its parent.
    setState((s) => ({
      pages: parent ? [...s.pages.map((x) => (x.id === parent && x.collapsed ? { ...x, collapsed: false } : x)), p] : [p, ...s.pages],
      current: p.id,
    }))
  }

  function duplicate() {
    const copy = newPage({ title: `${page.title || 'Untitled'} (copy)`, icon: page.icon, text: page.text, parent: parentId(page) })
    const sibs = siblings(page)
    const next = sibs[sibs.findIndex((x) => x.id === page.id) + 1]
    setMenu(null)
    setState((s) => ({ pages: placePage([...s.pages, copy], copy.id, copy.parent, next?.id ?? null), current: copy.id }))
  }

  function remove() {
    setMenu(null)
    const gone = new Set([page.id, ...descendantIds(pages, page.id)])
    const subs = gone.size - 1
    const hasContent = page.text.trim() || page.title.trim() || subs
    const what = subs ? ` and its ${subs} sub-page${subs === 1 ? '' : 's'}` : ''
    if (hasContent && !confirm(`Delete “${pageTitle(page)}”${what}?`)) return
    const up = parentId(page)
    setState((s) => {
      const rest = s.pages.filter((p) => !gone.has(p.id))
      const list = rest.length ? rest : [newPage()]
      return { pages: list, current: up && list.some((p) => p.id === up) ? up : list[0].id }
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
  const crumbs = ancestorsOf(pages, page.id)
  const subPages = childrenOf(pages, page.id)

  return (
    <div className="nb no-drag">
      <nav className="nb-side" aria-label="Pages">
        <div className="nb-side-head">
          <span>Pages</span>
          <button className="wtool" onClick={() => add()} title="New page" aria-label="New page">＋</button>
        </div>
        <div className="nb-side-list" role="tree"
          onDragOver={(e) => { if (dragging.current) e.preventDefault() }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropAt(null) }}
          onDrop={(e) => {
            // Empty space below the list: last top-level page.
            if (e.target === e.currentTarget) {
              e.preventDefault()
              const id = dragging.current
              dragging.current = null
              setDropAt(null)
              if (id) place(id, null, null)
            }
          }}>
          {rows.map(({ page: p, depth, hasChildren }) => (
            <div key={p.id} role="treeitem" aria-level={depth + 1} aria-expanded={hasChildren ? !p.collapsed : undefined}
              aria-selected={p.id === page.id} draggable style={{ '--depth': depth }}
              className={`nb-side-row ${p.id === page.id ? 'on' : ''} ${dropAt?.id === p.id ? `drop-${dropAt.pos}` : ''}`}
              onDragStart={(e) => {
                dragging.current = p.id
                e.dataTransfer.effectAllowed = 'move'
                // A private type only, so dropping on the editor doesn't paste the title.
                e.dataTransfer.setData('application/x-homedash-page', p.id)
              }}
              onDragEnd={() => { dragging.current = null; setDropAt(null) }}
              onDragOver={(e) => {
                if (!dragging.current) return
                e.stopPropagation()
                const target = dropTarget(e, p)
                if (!target) { if (dropAt) setDropAt(null); return }
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dropAt?.id !== p.id || dropAt.pos !== target.pos) setDropAt(target)
              }}
              onDrop={(e) => { e.stopPropagation(); dropOn(e, dropTarget(e, p)) }}>
              {hasChildren ? (
                <button className="nb-side-caret" tabIndex={-1} onClick={() => setFlags((x) => (x.id === p.id ? { ...x, collapsed: !x.collapsed } : null))}
                  aria-label={`${p.collapsed ? 'Expand' : 'Collapse'} ${pageTitle(p)}`}>{p.collapsed ? '▸' : '▾'}</button>
              ) : <span className="nb-side-caret" />}
              <button className="nb-side-item" title={pageTitle(p)} onClick={() => open(p.id)}
                onKeyDown={(e) => {
                  if (!e.altKey) return
                  const act = { ArrowUp: () => shift(p.id, -1), ArrowDown: () => shift(p.id, 1), ArrowRight: () => indent(p.id), ArrowLeft: () => outdent(p.id) }[e.key]
                  if (!act) return
                  e.preventDefault()
                  const id = p.id
                  act()
                  // Keep focus on the moved page (its row may have re-mounted at a new depth).
                  requestAnimationFrame(() => document.querySelector(`[data-page-row="${id}"]`)?.focus())
                }}
                data-page-row={p.id}>
                <span className="nb-side-icon">{p.icon}</span>
                <span className={`nb-side-title ${p.title.trim() ? '' : 'faint'}`}>{pageTitle(p)}</span>
              </button>
              <button className="nb-side-add" onClick={() => add(p.id)} title="Add sub-page" aria-label={`Add sub-page to ${pageTitle(p)}`}>＋</button>
            </div>
          ))}
        </div>
      </nav>

      <div className="nb-main">
        <div className="nb-top">
          <select className="select sm nb-switch" value={page.id} onChange={(e) => open(e.target.value)} aria-label="Page">
            {pageRows(pages, { all: true }).map(({ page: p, depth }) => (
              <option key={p.id} value={p.id}>{'\u00a0\u00a0\u00a0'.repeat(depth)}{p.icon} {pageTitle(p)}</option>
            ))}
          </select>
          <button className="wtool nb-add-narrow" onClick={() => add()} title="New page" aria-label="New page">＋</button>
          <span className="nb-edited faint">{flash || `Edited ${timeAgo(page.updated)}`}</span>
          <div className="nb-anchor">
            <button className="wtool" onClick={() => setMenu(menu === 'more' ? null : 'more')} title="Page options" aria-label="Page options" aria-expanded={menu === 'more'}>⋯</button>
            {menu === 'more' && (
              <Popover className="nb-menu" onClose={() => setMenu(null)}>
                <button onClick={() => add(page.id)}>Add sub-page</button>
                <button onClick={duplicate}>Duplicate</button>
                <hr />
                <button onClick={() => { setMenu(null); shift(page.id, -1) }} disabled={siblings(page)[0]?.id === page.id}>Move up</button>
                <button onClick={() => { setMenu(null); shift(page.id, 1) }} disabled={siblings(page).at(-1)?.id === page.id}>Move down</button>
                <button onClick={() => { setMenu(null); indent(page.id) }} disabled={siblings(page)[0]?.id === page.id}>Nest under page above</button>
                <button onClick={() => { setMenu(null); outdent(page.id) }} disabled={!parentId(page)}>Move out a level</button>
                <hr />
                <button onClick={copyMarkdown}>Copy as Markdown</button>
                <button onClick={exportMarkdown}>Export .md</button>
                <hr />
                <button className="danger" onClick={remove}>Delete page</button>
              </Popover>
            )}
          </div>
        </div>

        <div className="nb-doc">
          {crumbs.length > 0 && (
            <nav className="nb-crumbs" aria-label="Breadcrumb">
              {crumbs.map((p) => (
                <span key={p.id} className="nb-crumb">
                  <button onClick={() => open(p.id)}>{p.icon} {pageTitle(p)}</button>
                  <span className="nb-crumb-sep" aria-hidden="true">/</span>
                </span>
              ))}
            </nav>
          )}
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
          {subPages.length > 0 && (
            <section className="nb-subpages" aria-label="Sub-pages">
              {subPages.map((p) => (
                <button key={p.id} className="nb-subpage" onClick={() => open(p.id)}>
                  <span>{p.icon}</span><span className={p.title.trim() ? '' : 'faint'}>{pageTitle(p)}</span>
                </button>
              ))}
              <button className="nb-subpage add faint" onClick={() => add(page.id)}>＋ Add sub-page</button>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
