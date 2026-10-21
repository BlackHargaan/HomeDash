// Search-bar helpers: built-in engines, !bang shortcuts and URL detection.

export const ENGINES = [
  { id: 'google', name: 'Google', bang: 'g', url: 'https://www.google.com/search?q=%s' },
  { id: 'ddg', name: 'DuckDuckGo', bang: 'd', url: 'https://duckduckgo.com/?q=%s' },
  { id: 'bing', name: 'Bing', bang: 'b', url: 'https://www.bing.com/search?q=%s' },
  { id: 'brave', name: 'Brave', bang: 'br', url: 'https://search.brave.com/search?q=%s' },
  { id: 'youtube', name: 'YouTube', bang: 'yt', url: 'https://www.youtube.com/results?search_query=%s' },
  { id: 'wiki', name: 'Wikipedia', bang: 'w', url: 'https://en.wikipedia.org/w/index.php?search=%s' },
  { id: 'github', name: 'GitHub', bang: 'gh', url: 'https://github.com/search?q=%s' },
  { id: 'maps', name: 'Maps', bang: 'm', url: 'https://www.google.com/maps/search/%s' },
]

const FILE_EXT = new Set(['js', 'ts', 'jsx', 'tsx', 'json', 'txt', 'html', 'css', 'exe'])

// "example.com", "https://x.y/z", "192.168.1.2:8080" → open directly.
export function asUrl(q) {
  const s = q.trim()
  if (/\s/.test(s)) return null
  if (/^https?:\/\//i.test(s)) return s
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(s)) return 'http://' + s
  const m = s.match(/^[a-z0-9-]+(\.[a-z0-9-]+)*\.([a-z]{2,})(:\d+)?(\/.*)?$/i)
  // "node.js", "notes.txt" are searches, not sites (real TLDs like .sh or .rs still open).
  if (m && (m[3] || m[4] || !FILE_EXT.has(m[2].toLowerCase()))) return 'https://' + s
  return null
}

// "!yt lofi" or "lofi !yt" → that engine; a bare URL opens directly;
// anything else goes to the selected engine.
export function resolveSearch(q, engines, selectedId) {
  let engine = engines.find((e) => e.id === selectedId) || engines[0]
  let term = q.trim()
  const lead = term.match(/^!(\S+)\s+(.+)$/)
  const trail = term.match(/^(.+?)\s+!(\S+)$/)
  const [bang, rest] = lead ? [lead[1], lead[2]] : trail ? [trail[2], trail[1]] : []
  const hit = bang && engines.find((e) => e.bang === bang.toLowerCase())
  if (hit) {
    engine = hit
    term = rest.trim()
  } else {
    const direct = asUrl(term)
    if (direct) return direct
  }
  return engine.url.replace('%s', encodeURIComponent(term))
}
