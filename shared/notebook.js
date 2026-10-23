// Notebook pages: { id, title, icon, text, updated } where `text` is the page
// body as Markdown (the editor is WYSIWYG; Markdown is only the storage
// format, which also keeps pages readable for the AI assistant and MCP).
//
// Older pages had no separate title — their first "# Heading" line was the
// title. normalizePage() lifts it out so both shapes read the same.

export const DEFAULT_ICON = '📄'

export function splitTitle(markdown) {
  const text = String(markdown || '')
  const m = text.match(/^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/)
  if (!m) return { title: '', body: text }
  return { title: m[1].trim(), body: text.slice(m[0].length).replace(/^\s*\n/, '') }
}

export function normalizePage(p) {
  if (!p) return null
  if (typeof p.title === 'string') return { icon: DEFAULT_ICON, ...p, text: p.text || '' }
  const { title, body } = splitTitle(p.text)
  return { ...p, title, icon: p.icon || DEFAULT_ICON, text: body }
}

export const pageTitle = (p) => (normalizePage(p)?.title || '').trim() || 'Untitled'

// The page as one Markdown document (title as a heading), for export/copy.
export function pageMarkdown(p) {
  const n = normalizePage(p)
  return `# ${n.title || 'Untitled'}\n\n${n.text}`.trimEnd() + '\n'
}

// Move page `id` so it sits before `beforeId` (or at the end when null).
export function movePage(pages, id, beforeId) {
  if (id === beforeId) return pages
  const page = pages.find((p) => p.id === id)
  if (!page) return pages
  const rest = pages.filter((p) => p.id !== id)
  const at = beforeId == null ? -1 : rest.findIndex((p) => p.id === beforeId)
  return at < 0 ? [...rest, page] : [...rest.slice(0, at), page, ...rest.slice(at)]
}
