// Rich-text (WYSIWYG) page editor for the Notebook widget, in the spirit of
// Notion / Google Docs: type normally, "/" for blocks, select text to format,
// Markdown-style shortcuts (#, -, [], >, ```) convert as you type.
// Loaded lazily — the editor engine (TipTap/ProseMirror) only downloads when a
// Notebook is on screen. Content is stored as Markdown.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { SlashCommand, createSlashStore } from './slash.js'

const SAVE_DELAY = 300
const toMarkdown = (editor) => editor.getMarkdown().replace(/\s+$/, '')
// Module-level so the BubbleMenu props stay identical between renders.
const BUBBLE_OPTIONS = { placement: 'top', offset: 8 }
const showBubble = ({ editor, state }) => !state.selection.empty && editor.isEditable && !editor.isActive('codeBlock')

function SlashMenu({ store }) {
  const [s, setS] = useState(store.get())
  const listRef = useRef(null)
  useEffect(() => store.subscribe(setS), [store])
  useEffect(() => { listRef.current?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }) }, [s.index])
  if (!s.open || !s.rect) return null
  const top = Math.min(s.rect.bottom + 6, window.innerHeight - 290)
  const left = Math.min(s.rect.left, window.innerWidth - 260)
  return createPortal(
    <div className="nbe-slash" style={{ top, left }} ref={listRef} role="listbox" aria-label="Insert block">
      {s.items.length ? s.items.map((it, i) => (
        <button key={it.id} className={`nbe-slash-item ${i === s.index ? 'sel' : ''}`} role="option" aria-selected={i === s.index}
          onMouseDown={(e) => { e.preventDefault(); s.command?.(it) }} onMouseEnter={() => store.set({ index: i })}>
          <span className="nbe-slash-icon">{it.icon}</span>
          <span className="nbe-slash-text"><b>{it.label}</b><span>{it.hint}</span></span>
        </button>
      )) : <div className="nbe-slash-empty">No matching blocks</div>}
    </div>,
    document.body,
  )
}

function FormatBar({ editor, linking, setLinking }) {
  const [url, setUrl] = useState(() => editor.getAttributes('link').href || '')
  useEffect(() => { if (linking) setUrl(editor.getAttributes('link').href || '') }, [linking, editor])
  const btn = (label, title, active, run, cls = '') => (
    <button type="button" className={`nbe-fmt ${active ? 'on' : ''} ${cls}`} title={title} aria-label={title}
      onMouseDown={(e) => e.preventDefault()} onClick={run}>{label}</button>
  )
  const c = () => editor.chain().focus()
  // Only the toolbar re-renders as the selection moves, not the whole editor.
  const on = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      block: ed.isActive('heading', { level: 1 }) ? 'h1' : ed.isActive('heading', { level: 2 }) ? 'h2' : ed.isActive('heading', { level: 3 }) ? 'h3' : 'p',
      bold: ed.isActive('bold'), italic: ed.isActive('italic'), underline: ed.isActive('underline'), strike: ed.isActive('strike'),
      code: ed.isActive('code'), link: ed.isActive('link'), taskList: ed.isActive('taskList'),
    }),
  })
  const block = on.block

  function applyLink(e) {
    e.preventDefault()
    let href = url.trim()
    if (!href) c().unsetLink().run()
    else {
      if (!/^(https?:|mailto:)/i.test(href)) href = 'https://' + href
      c().extendMarkRange('link').setLink({ href }).run()
    }
    setLinking(false)
  }

  if (linking) {
    return (
      <form className="nbe-bubble nbe-linkform" onSubmit={applyLink}>
        <input autoFocus className="nbe-link-input" placeholder="Paste a link…" value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setLinking(false); editor.commands.focus() } }} />
        <button className="nbe-fmt" type="submit" title="Apply link">↵</button>
      </form>
    )
  }
  return (
    <div className="nbe-bubble">
      <select className="nbe-blocksel" value={block} title="Turn into" aria-label="Turn into"
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'p') c().setParagraph().run()
          else c().setHeading({ level: Number(v[1]) }).run()
        }}>
        <option value="p">Text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span className="nbe-sep" />
      {btn('B', 'Bold (Ctrl+B)', on.bold, () => c().toggleBold().run(), 'b')}
      {btn('I', 'Italic (Ctrl+I)', on.italic, () => c().toggleItalic().run(), 'i')}
      {btn('U', 'Underline (Ctrl+U)', on.underline, () => c().toggleUnderline().run(), 'u')}
      {btn('S', 'Strikethrough', on.strike, () => c().toggleStrike().run(), 's')}
      {btn('</>', 'Inline code', on.code, () => c().toggleCode().run(), 'code')}
      <span className="nbe-sep" />
      {btn('🔗', 'Link (Ctrl+K)', on.link, () => setLinking(true))}
      {btn('☑', 'To-do list', on.taskList, () => c().toggleTaskList().run())}
    </div>
  )
}

export default function NotebookEditor({ pageId, markdown, onChange, onReady, placeholder = 'Type “/” for commands…', autoFocus = false }) {
  const [linking, setLinking] = useState(false)
  const store = useMemo(() => createSlashStore(), [])
  const lastEmitted = useRef(markdown)
  const saveTimer = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === 'heading' ? `Heading ${node.attrs.level}` : placeholder),
        includeChildren: false,
      }),
      Markdown,
      SlashCommand.configure({ store }),
    ],
    content: markdown || '',
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: { class: 'nbe-content', spellcheck: 'true' },
      // Links open with Ctrl/⌘+click, like Docs; a plain click places the cursor.
      handleClick: (view, pos, event) => {
        const a = event.target.closest?.('a[href]')
        if (a && (event.metaKey || event.ctrlKey)) { window.open(a.href, '_blank', 'noopener'); return true }
        return false
      },
    },
    onUpdate: ({ editor: ed }) => {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const md = toMarkdown(ed)
        lastEmitted.current = md
        onChangeRef.current(md)
      }, SAVE_DELAY)
    },
  }, [pageId])

  // Flush a pending save when switching pages or unmounting.
  useEffect(() => () => {
    if (saveTimer.current && editor && !editor.isDestroyed) {
      clearTimeout(saveTimer.current)
      const md = toMarkdown(editor)
      if (md !== lastEmitted.current) onChangeRef.current(md)
    }
  }, [editor])

  // Changes from elsewhere (the AI assistant, another device) replace the
  // content — unless they're just our own save coming back.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (markdown === lastEmitted.current) return
    if (toMarkdown(editor) === markdown) { lastEmitted.current = markdown; return }
    lastEmitted.current = markdown
    editor.commands.setContent(markdown || '', { contentType: 'markdown', emitUpdate: false })
  }, [markdown, editor])

  useEffect(() => { if (editor) onReady?.(editor) }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!editor) return
    const close = () => setLinking(false)
    editor.on('selectionUpdate', close)
    return () => editor.off('selectionUpdate', close)
  }, [editor])

  if (!editor) return null
  return (
    <div className="nbe" onKeyDown={(e) => {
      // Ctrl/⌘+K on selected text adds a link (instead of opening the command palette).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !editor.state.selection.empty) {
        e.preventDefault(); e.stopPropagation(); setLinking(true)
      }
    }}>
      <BubbleMenu editor={editor} options={BUBBLE_OPTIONS} shouldShow={showBubble}>
        <FormatBar editor={editor} linking={linking} setLinking={setLinking} />
      </BubbleMenu>
      <EditorContent editor={editor} />
      <SlashMenu store={store} />
    </div>
  )
}
