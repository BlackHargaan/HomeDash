// Parse the "Netscape bookmark file" that Chrome, Edge, Firefox and Safari all
// export (Bookmarks → Export). Folders become groups named by their path;
// links outside any folder land in "Imported".

import { decodeEntities } from './feed.js'

export function parseBookmarksHtml(html) {
  const groups = new Map()
  const path = []
  let pending = null // folder name waiting for its <DL>
  const re = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<a\b([^>]*)>([\s\S]*?)<\/a>|<dl\b[^>]*>|<\/dl>/gi
  let m
  while ((m = re.exec(html))) {
    const token = m[0]
    if (m[1] != null) {
      pending = decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim() || 'Folder'
    } else if (m[2] != null) {
      const href = m[2].match(/href\s*=\s*"([^"]*)"/i)?.[1]
      if (!href || !/^https?:/i.test(href)) continue
      const title = decodeEntities(m[3].replace(/<[^>]+>/g, '')).trim() || href
      const name = path.filter(Boolean).join(' / ') || 'Imported'
      if (!groups.has(name)) groups.set(name, [])
      groups.get(name).push({ title, url: decodeEntities(href) })
    } else if (/^<dl/i.test(token)) {
      path.push(pending)
      pending = null
    } else {
      path.pop()
    }
  }
  return [...groups].map(([name, links]) => ({ name, links }))
}
