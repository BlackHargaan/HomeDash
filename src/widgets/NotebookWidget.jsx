import { useMemo, useState } from 'react'
import { useWidgetState, uid } from '../lib/storage.js'
import { renderMarkdown, toggleTask, titleOf } from '../lib/markdown.js'
import { timeAgo } from '../lib/date.js'

const WELCOME = `# Notebook

Write in **Markdown**, then switch to *Preview*.

- [ ] Click a checkbox in preview to tick it off
- [x] Pages are listed in the menu above
- Links work too: https://commonmark.org/help/

> Tip: double-click the preview to start editing.`

const newPage = (text = '') => ({ id: uid('pg'), text, updated: new Date().toISOString() })

export default function NotebookWidget({ widget }) {
  const [state, setState] = useWidgetState(widget.id, () => {
    const first = newPage(WELCOME)
    return { pages: [first], current: first.id }
  })
  const { pages } = state
  const page = pages.find((p) => p.id === state.current) || pages[0]
  const [mode, setMode] = useState(page && page.text === WELCOME ? 'preview' : 'edit')
  const html = useMemo(() => (mode === 'preview' ? renderMarkdown(page?.text || '') : ''), [mode, page?.text])

  const setText = (text) => setState((s) => ({
    ...s, pages: s.pages.map((p) => (p.id === page.id ? { ...p, text, updated: new Date().toISOString() } : p)),
  }))

  function add() {
    const p = newPage('# ')
    setState((s) => ({ pages: [p, ...s.pages], current: p.id }))
    setMode('edit')
  }

  function remove() {
    if (page.text.trim() && !confirm(`Delete “${titleOf(page.text)}”?`)) return
    setState((s) => {
      const rest = s.pages.filter((p) => p.id !== page.id)
      const list = rest.length ? rest : [newPage('')]
      return { pages: list, current: list[0].id }
    })
  }

  function onPreviewClick(e) {
    const box = e.target.closest('input[type=checkbox][data-line]')
    if (box) { e.preventDefault(); setText(toggleTask(page.text, Number(box.dataset.line))) }
  }

  const sorted = [...pages].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))

  return (
    <div className="nb no-drag">
      <div className="nb-bar">
        <select className="select sm nb-pages" value={page.id} onChange={(e) => setState((s) => ({ ...s, current: e.target.value }))} aria-label="Page">
          {sorted.map((p) => <option key={p.id} value={p.id}>{titleOf(p.text)}</option>)}
        </select>
        <button className="wtool" onClick={add} title="New page" aria-label="New page">＋</button>
        <button className="wtool del" onClick={remove} title="Delete page" aria-label="Delete page">🗑</button>
        <span className="spacer" />
        <div className="nb-mode">
          <button className={`chip ${mode === 'edit' ? 'on' : ''}`} onClick={() => setMode('edit')}>Edit</button>
          <button className={`chip ${mode === 'preview' ? 'on' : ''}`} onClick={() => setMode('preview')}>Preview</button>
        </div>
      </div>
      {mode === 'edit' ? (
        <textarea className="notes-area nb-editor" value={page.text} onChange={(e) => setText(e.target.value)} autoFocus
          placeholder="# Title&#10;&#10;Write markdown…" spellCheck
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); setMode('preview') } }} />
      ) : (
        <div className="nb-preview md" onClick={onPreviewClick} onDoubleClick={(e) => { if (!e.target.closest('a,input')) setMode('edit') }}
          dangerouslySetInnerHTML={{ __html: html || '<p class="faint">Empty page — double-click to write.</p>' }} />
      )}
      <div className="notes-foot faint">{pages.length} page{pages.length === 1 ? '' : 's'} · edited {timeAgo(page.updated)}{mode === 'edit' ? ' · Ctrl+Enter to preview' : ''}</div>
    </div>
  )
}
