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

// ---- Sub-pages
// A page may have a `parent` page id. Pages stay in one flat array; siblings
// keep their array order. A parent that no longer exists counts as top level.

export function parentOf(pages, p) {
  return p.parent && pages.some((x) => x.id === p.parent) ? p.parent : null
}

export const childrenOf = (pages, id) => pages.filter((p) => parentOf(pages, p) === id)

export function descendantIds(pages, id) {
  const out = new Set()
  const walk = (pid) => { for (const c of childrenOf(pages, pid)) if (!out.has(c.id)) { out.add(c.id); walk(c.id) } }
  walk(id)
  return out
}

// Ancestors from the top level down to the direct parent.
export function ancestorsOf(pages, id) {
  const out = []
  const seen = new Set([id])
  let p = pages.find((x) => x.id === id)
  while (p && (p = pages.find((x) => x.id === parentOf(pages, p))) && !seen.has(p.id)) {
    seen.add(p.id)
    out.unshift(p)
  }
  return out
}

// Depth-first rows for the sidebar: { page, depth, hasChildren }. Children
// of collapsed pages are skipped unless `all` is set.
export function pageRows(pages, { all = false } = {}) {
  const rows = []
  const walk = (pid, depth) => {
    for (const page of childrenOf(pages, pid)) {
      const hasChildren = pages.some((x) => parentOf(pages, x) === page.id)
      rows.push({ page, depth, hasChildren })
      if (hasChildren && (all || !page.collapsed)) walk(page.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

// Move page `id` (with its sub-pages) to `parent`, placed before sibling
// `beforeId` (or last). Refuses to move a page into itself or its own sub-pages.
export function placePage(pages, id, parent = null, beforeId = null) {
  if (parent === id || (parent && descendantIds(pages, id).has(parent))) return pages
  const moved = movePage(pages, id, beforeId)
  return moved.map((p) => (p.id === id ? { ...p, parent: parent || null } : p))
}
