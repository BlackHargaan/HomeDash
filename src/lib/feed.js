// RSS 2.0 / RSS 1.0 (RDF) / Atom parser. Regex-based on purpose: it runs in
// the browser and in Node tests alike, and feeds only need a handful of fields.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

// Text content of an element body: CDATA kept verbatim, entities decoded,
// any embedded HTML reduced to plain text.
export function textOf(raw) {
  if (raw == null) return ''
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  s = decodeEntities(s) // undo the feed's own escaping (titles often carry escaped HTML)
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
  return decodeEntities(s).replace(/\s+/g, ' ').trim()
}

function tag(block, names) {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')
    const m = block.match(re)
    if (m) return m[1]
  }
  return null
}

function attr(tagText, name) {
  const m = tagText.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
  return m ? decodeEntities(m[2] ?? m[3]) : null
}

function atomLink(block) {
  const links = block.match(/<link\b[^>]*>/gi) || []
  let fallback = null
  for (const l of links) {
    const href = attr(l, 'href')
    if (!href) continue
    const rel = attr(l, 'rel')
    if (!rel || rel === 'alternate') return href
    fallback ||= href
  }
  return fallback
}

function parseDate(s) {
  if (!s) return null
  const d = new Date(textOf(s))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

export function parseFeed(xml) {
  if (typeof xml !== 'string' || !/<(rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error('not an RSS or Atom feed')
  const isAtom = /<feed\b/i.test(xml) && !/<rss\b/i.test(xml)
  const blocks = xml.match(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi) || []

  // Channel-level title: whatever precedes the first item/entry.
  const head = blocks.length ? xml.slice(0, xml.indexOf(blocks[0])) : xml
  const title = textOf(tag(head, ['title']))

  const items = blocks.map((b) => {
    const itemTitle = textOf(tag(b, ['title'])) || '(untitled)'
    let link = isAtom ? atomLink(b) : textOf(tag(b, ['link']))
    if (!link && !isAtom) {
      const guid = b.match(/<guid\b([^>]*)>([\s\S]*?)<\/guid>/i)
      if (guid && !/isPermaLink\s*=\s*["']false/i.test(guid[1])) link = textOf(guid[2])
    }
    if (!link) {
      const rdf = b.match(/<item\b[^>]*rdf:about\s*=\s*"([^"]+)"/i)
      if (rdf) link = rdf[1]
    }
    const date = parseDate(tag(b, ['pubDate', 'published', 'updated', 'dc:date', 'dc:created']))
    const summary = clip(textOf(tag(b, ['description', 'summary', 'content', 'content:encoded'])), 220)
    const id = textOf(tag(b, ['guid', 'id'])) || link || itemTitle
    return { id, title: itemTitle, link: link || '', date, summary }
  })
  return { title, items }
}
