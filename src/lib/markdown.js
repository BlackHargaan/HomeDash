// Small, safe Markdown → HTML renderer for the Notebook widget. Everything is
// escaped first; only the constructs below produce markup, and links are
// limited to http(s)/mailto so a note can't inject script.
//
// Supported: # headings, paragraphs, **bold**, *italic*, ~~strike~~, `code`,
// ``` fenced blocks ```, > quotes, - / 1. lists (nested by indent), - [ ] task
// items (rendered as checkboxes carrying their source line), ---, [links](url)
// and bare URLs.

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function safeUrl(url) {
  const u = url.trim()
  return /^(https?:\/\/|mailto:)/i.test(u) ? u : null
}

export function renderInline(text) {
  const codes = []
  let s = escapeHtml(text).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000` })
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const href = safeUrl(url.replace(/&amp;/g, '&'))
    return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label
  })
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre, url) =>
    `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`)
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\*)|(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, (m, p1, a, p2, b) => `${p1 ?? p2}<em>${a ?? b}</em>`)
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${codes[+n]}</code>`)
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const TASK = /^\[( |x|X)\]\s+(.*)$/

export function renderMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let para = []
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(renderInline).join('<br>')}</p>`)
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (/^\s*```/.test(line)) {
      flushPara()
      const body = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++])
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`)
      continue
    }
    if (!line.trim()) { flushPara(); continue }

    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (h) { flushPara(); out.push(`<h${h[1].length}>${renderInline(h[2])}</h${h[1].length}>`); continue }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); out.push('<hr>'); continue }

    if (/^\s*>/.test(line)) {
      flushPara()
      const body = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      i--
      out.push(`<blockquote>${renderMarkdown(body.join('\n'))}</blockquote>`)
      continue
    }

    if (LIST_ITEM.test(line)) {
      flushPara()
      const stack = [] // { indent, tag }
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        const [, ws, marker, rest] = lines[i].match(LIST_ITEM)
        const indent = ws.replace(/\t/g, '  ').length
        const tag = /\d/.test(marker) ? 'ol' : 'ul'
        while (stack.length && indent < stack[stack.length - 1].indent) out.push(`</li></${stack.pop().tag}>`)
        const top = stack[stack.length - 1]
        if (!top || indent > top.indent) {
          stack.push({ indent, tag })
          out.push(`<${tag}>`)
        } else {
          out.push('</li>')
        }
        const task = rest.match(TASK)
        if (task) {
          const done = task[1] !== ' '
          out.push(`<li class="md-task${done ? ' done' : ''}"><input type="checkbox" data-line="${i}"${done ? ' checked' : ''}> ${renderInline(task[2])}`)
        } else {
          out.push(`<li>${renderInline(rest)}`)
        }
        i++
      }
      while (stack.length) out.push(`</li></${stack.pop().tag}>`)
      i--
      continue
    }

    para.push(line.trim())
  }
  flushPara()
  return out.join('\n')
}

// Flip the "- [ ]" / "- [x]" checkbox on a given source line.
export function toggleTask(src, lineNo) {
  const lines = src.split('\n')
  const line = lines[lineNo]
  if (line == null) return src
  lines[lineNo] = line.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/, (_, pre, mark) => `${pre}[${mark === ' ' ? 'x' : ' '}]`)
  return lines.join('\n')
}

// First heading or first non-empty line, for page titles in the list.
export function titleOf(src) {
  const line = String(src || '').split('\n').find((l) => l.trim())
  return line ? line.replace(/^#+\s*/, '').replace(/[*_`~[\]]/g, '').trim().slice(0, 60) || 'Untitled' : 'Untitled'
}
