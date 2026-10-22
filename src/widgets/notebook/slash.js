// "/" command menu for the notebook editor (like Notion / Google Docs "@").
// The TipTap suggestion plugin finds "/query" at the cursor; the menu itself
// is a React component that reads this small store.
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'

export const BLOCKS = [
  { id: 'text', label: 'Text', hint: 'Plain paragraph', icon: 'Aa', keywords: 'paragraph p', run: (c) => c.setParagraph() },
  { id: 'h1', label: 'Heading 1', hint: 'Big section heading', icon: 'H1', keywords: 'title h1 #', run: (c) => c.setHeading({ level: 1 }) },
  { id: 'h2', label: 'Heading 2', hint: 'Medium heading', icon: 'H2', keywords: 'subtitle h2 ##', run: (c) => c.setHeading({ level: 2 }) },
  { id: 'h3', label: 'Heading 3', hint: 'Small heading', icon: 'H3', keywords: 'h3 ###', run: (c) => c.setHeading({ level: 3 }) },
  { id: 'todo', label: 'To-do list', hint: 'Track tasks with checkboxes', icon: '☑', keywords: 'task checkbox checklist [] todo', run: (c) => c.toggleTaskList() },
  { id: 'bullet', label: 'Bulleted list', hint: 'A simple list', icon: '•', keywords: 'ul unordered - list', run: (c) => c.toggleBulletList() },
  { id: 'numbered', label: 'Numbered list', hint: 'A list with numbers', icon: '1.', keywords: 'ol ordered 1. list', run: (c) => c.toggleOrderedList() },
  { id: 'quote', label: 'Quote', hint: 'Capture a quote', icon: '❝', keywords: 'blockquote > citation', run: (c) => c.setBlockquote() },
  { id: 'code', label: 'Code', hint: 'A block of code', icon: '</>', keywords: 'codeblock ``` snippet', run: (c) => c.setCodeBlock() },
  { id: 'divider', label: 'Divider', hint: 'Separate sections', icon: '—', keywords: 'hr line rule ---', run: (c) => c.setHorizontalRule() },
  {
    id: 'date', label: 'Today’s date', hint: 'Insert the date', icon: '📅', keywords: 'date today now time',
    run: (c) => c.insertContent(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + ' '),
  },
]

export function filterBlocks(query) {
  const q = query.trim().toLowerCase()
  if (!q) return BLOCKS
  return BLOCKS.filter((b) => b.label.toLowerCase().includes(q) || b.keywords.includes(q))
}

// The menu's state lives outside React so the plugin callbacks can drive it.
export function createSlashStore() {
  let state = { open: false, items: [], index: 0, rect: null, command: null }
  const subs = new Set()
  const set = (patch) => { state = { ...state, ...patch }; subs.forEach((fn) => fn(state)) }
  return {
    get: () => state,
    set,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn) },
  }
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addOptions() {
    return { store: null }
  },
  addProseMirrorPlugins() {
    const store = this.options.store
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        // Only at the start of a block or after a space — not inside URLs like a/b.
        allow: ({ state, range }) => {
          const before = state.doc.textBetween(Math.max(0, range.from - 1), range.from, '\n', '\n')
          return range.from <= 1 || before === '' || /\s/.test(before) || state.doc.resolve(range.from).parentOffset === 0
        },
        items: ({ query }) => filterBlocks(query),
        command: ({ editor, range, props }) => {
          props.run(editor.chain().focus().deleteRange(range)).run()
        },
        render: () => ({
          onStart: (p) => store.set({ open: true, items: p.items, index: 0, rect: p.clientRect?.(), command: p.command }),
          onUpdate: (p) => store.set({ items: p.items, index: 0, rect: p.clientRect?.(), command: p.command }),
          onKeyDown: ({ event }) => {
            const s = store.get()
            if (!s.open) return false
            if (event.key === 'Escape') { store.set({ open: false }); return true }
            if (!s.items.length) return false
            if (event.key === 'ArrowDown') { store.set({ index: (s.index + 1) % s.items.length }); return true }
            if (event.key === 'ArrowUp') { store.set({ index: (s.index - 1 + s.items.length) % s.items.length }); return true }
            if (event.key === 'Enter' || event.key === 'Tab') { s.command?.(s.items[s.index]); return true }
            return false
          },
          onExit: () => store.set({ open: false, items: [], command: null }),
        }),
      }),
    ]
  },
})
