import { describe, it, expect } from 'vitest'
import { parseFeed, textOf } from '../feed.js'
import { evaluate, calculate, convert, formatNumber } from '../calc.js'
import { renderMarkdown, renderInline, toggleTask, titleOf } from '../markdown.js'
import { parseBookmarksHtml } from '../bookmarks.js'
import { describeEvent, activityByDay } from '../github.js'
import { QUOTES, quoteForDay } from '../quotes.js'

describe('feed parser', () => {
  it('parses RSS 2.0 with CDATA, entities and guid links', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>My &amp; Blog</title>
      <item><title><![CDATA[Hello <b>world</b>]]></title><link>https://a.test/1</link>
        <pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Some &amp;amp; text&lt;/p&gt;</description></item>
      <item><title>Second</title><guid>https://a.test/2</guid></item>
    </channel></rss>`
    const f = parseFeed(xml)
    expect(f.title).toBe('My & Blog')
    expect(f.items).toHaveLength(2)
    expect(f.items[0]).toMatchObject({ title: 'Hello world', link: 'https://a.test/1', date: '2026-10-20T10:00:00.000Z', summary: 'Some & text' })
    expect(f.items[1].link).toBe('https://a.test/2')
  })

  it('parses Atom with alternate links', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title type="text">Atom feed</title>
      <link href="https://site.test/"/>
      <entry><title>Entry one</title><id>tag:1</id>
        <link rel="edit" href="https://site.test/edit/1"/><link rel="alternate" href="https://site.test/1"/>
        <updated>2026-10-19T08:30:00Z</updated><summary>Short</summary></entry></feed>`
    const f = parseFeed(xml)
    expect(f.title).toBe('Atom feed')
    expect(f.items[0]).toMatchObject({ id: 'tag:1', title: 'Entry one', link: 'https://site.test/1', summary: 'Short' })
  })

  it('parses RSS 1.0 / RDF and rejects non-feeds', () => {
    const xml = `<rdf:RDF><channel><title>RDF</title></channel>
      <item rdf:about="https://r.test/x"><title>X</title><dc:date>2026-01-02T00:00:00Z</dc:date></item></rdf:RDF>`
    expect(parseFeed(xml).items[0]).toMatchObject({ link: 'https://r.test/x', date: '2026-01-02T00:00:00.000Z' })
    expect(() => parseFeed('<html><body>nope</body></html>')).toThrow()
  })

  it('textOf strips scripts and tags', () => {
    expect(textOf('a<script>alert(1)</script> <i>b</i>')).toBe('a b')
  })
})

describe('calculator', () => {
  it('follows precedence, powers and functions', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14)
    expect(evaluate('(2 + 3) * 4')).toBe(20)
    expect(evaluate('2^3^2')).toBe(512)
    expect(evaluate('-2^2')).toBe(-4)
    expect(evaluate('sqrt(16) + abs(-3)')).toBe(7)
    expect(evaluate('max(1, 5, 3)')).toBe(5)
    expect(evaluate('2pi')).toBeCloseTo(Math.PI * 2)
    expect(evaluate('5!')).toBe(120)
    expect(evaluate('10 mod 3')).toBe(1)
    expect(evaluate('3 × 4 ÷ 2')).toBe(6)
  })

  it('handles percentages and ans', () => {
    expect(evaluate('15% of 80')).toBeCloseTo(12)
    expect(evaluate('200 * 10%')).toBeCloseTo(20)
    expect(calculate('ans / 2', { ans: 10 }).value).toBe(5)
  })

  it('reports readable errors', () => {
    expect(() => evaluate('1 / 0')).toThrow(/zero/)
    expect(() => evaluate('2 +')).toThrow()
    expect(() => evaluate('foo(2)')).toThrow(/Unknown/)
    expect(() => evaluate('alert("x")')).toThrow()
  })

  it('converts units', () => {
    expect(convert(1, 'mi', 'km')).toBeCloseTo(1.609344)
    expect(convert(212, 'f', 'c')).toBeCloseTo(100)
    expect(convert(0, '°C', 'kelvin')).toBeCloseTo(273.15)
    expect(convert(1, 'GiB', 'MB')).toBeCloseTo(1073.741824)
    expect(convert(1, 'cup', 'ml')).toBeCloseTo(236.588, 2)
    expect(convert(60, 'mph', 'km/h')).toBeCloseTo(96.56, 1)
    expect(() => convert(1, 'kg', 'm')).toThrow(/mass to length/)
    expect(calculate('5 km to mi').text).toBe('3.1068559612 mi')
    expect(calculate('2 * 3 feet in inches').value).toBeCloseTo(72)
    expect(calculate('1.5 hours to min').value).toBe(90)
    expect(() => calculate('5 km to parsecs')).toThrow(/Unknown unit/)
  })

  it('formats numbers', () => {
    expect(formatNumber(1234567.5)).toBe('1,234,567.5')
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(1e20)).toBe('1e+20')
  })
})

describe('markdown', () => {
  it('renders common blocks', () => {
    const html = renderMarkdown('# Title\n\nHello **bold** and *it* and `x<y`\n\n- a\n  - nested\n- b\n\n1. one\n\n> quoted\n\n---\n\n```\n<tag>\n```')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>it</em>')
    expect(html).toContain('<code>x&lt;y</code>')
    expect(html).toMatch(/<ul>\n<li>a\n<ul>\n<li>nested\n<\/li><\/ul>\n<\/li>\n<li>b/)
    expect(html).toContain('<ol>')
    expect(html).toContain('<blockquote><p>quoted</p></blockquote>')
    expect(html).toContain('<hr>')
    expect(html).toContain('<pre><code>&lt;tag&gt;</code></pre>')
  })

  it('escapes HTML and blocks unsafe links', () => {
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).not.toContain('<img')
    expect(renderInline('[x](javascript:alert(1))')).not.toContain('href')
    expect(renderInline('[site](https://a.test/?q=1&b=2)')).toContain('href="https://a.test/?q=1&amp;b=2"')
    expect(renderInline('see https://a.test/x')).toContain('<a href="https://a.test/x"')
  })

  it('renders and toggles task items', () => {
    const src = '# List\n- [ ] milk\n- [x] eggs'
    const html = renderMarkdown(src)
    expect(html).toContain('<input type="checkbox" data-line="1">')
    expect(html).toContain('data-line="2" checked')
    expect(toggleTask(src, 1)).toBe('# List\n- [x] milk\n- [x] eggs')
    expect(toggleTask(src, 2)).toBe('# List\n- [ ] milk\n- [ ] eggs')
    expect(titleOf(src)).toBe('List')
    expect(titleOf('')).toBe('Untitled')
  })
})

describe('bookmarks import', () => {
  it('groups links by folder path', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
      <DT><H3 ADD_DATE="1">Bookmarks bar</H3>
      <DL><p>
        <DT><A HREF="https://news.test/">News &amp; more</A>
        <DT><H3>Dev</H3>
        <DL><p><DT><A HREF="https://git.test/">Git</A><DT><A HREF="javascript:void(0)">bookmarklet</A></DL><p>
      </DL><p>
      <DT><A HREF="https://loose.test/">Loose</A>
    </DL>`
    expect(parseBookmarksHtml(html)).toEqual([
      { name: 'Bookmarks bar', links: [{ title: 'News & more', url: 'https://news.test/' }] },
      { name: 'Bookmarks bar / Dev', links: [{ title: 'Git', url: 'https://git.test/' }] },
      { name: 'Imported', links: [{ title: 'Loose', url: 'https://loose.test/' }] },
    ])
  })
})

describe('github events', () => {
  it('describes common events', () => {
    const push = describeEvent({ id: '1', type: 'PushEvent', repo: { name: 'me/app' }, created_at: '2026-10-20T00:00:00Z',
      payload: { size: 3, ref: 'refs/heads/main', commits: [{ message: 'a' }, { message: 'Fix bug\n\nbody' }] } })
    expect(push).toMatchObject({ text: 'Pushed 3 commits to main', detail: 'Fix bug', url: 'https://github.com/me/app' })
    const pr = describeEvent({ id: '2', type: 'PullRequestEvent', repo: { name: 'me/app' },
      payload: { action: 'closed', pull_request: { number: 7, merged: true, title: 'Feature', html_url: 'https://github.com/me/app/pull/7' } } })
    expect(pr).toMatchObject({ text: 'Merged PR #7', detail: 'Feature', url: 'https://github.com/me/app/pull/7' })
    expect(describeEvent({ id: '3', type: 'WatchEvent', repo: { name: 'x/y' }, payload: {} }).text).toBe('Starred')
    expect(describeEvent({ id: '4', type: 'GollumEvent', repo: { name: 'x/y' } }).text).toBe('Gollum')
  })

  it('counts activity per day', () => {
    const now = new Date(2026, 9, 21, 15)
    const days = activityByDay([
      { type: 'PushEvent', payload: { size: 2 }, created_at: new Date(2026, 9, 21, 9).toISOString() },
      { type: 'WatchEvent', created_at: new Date(2026, 9, 20, 9).toISOString() },
      { type: 'WatchEvent', created_at: new Date(2026, 8, 1).toISOString() },
    ], 7, now)
    expect(days).toHaveLength(7)
    expect(days.map((d) => d.count)).toEqual([0, 0, 0, 0, 0, 1, 2])
  })
})

describe('quotes', () => {
  it('is stable within a day and changes across days', () => {
    const a = quoteForDay(QUOTES, new Date(2026, 9, 21, 8))
    expect(quoteForDay(QUOTES, new Date(2026, 9, 21, 22))).toBe(a)
    const week = new Set(Array.from({ length: 7 }, (_, k) => quoteForDay(QUOTES, new Date(2026, 9, 21 + k))))
    expect(week.size).toBe(7)
    expect(quoteForDay(QUOTES, new Date(2026, 9, 21), 1)).not.toBe(a)
    expect(quoteForDay([], new Date())).toBeNull()
  })
})

describe('search bar', async () => {
  const { ENGINES, resolveSearch, asUrl } = await import('../search.js')
  it('uses the selected engine, bangs and direct URLs', () => {
    expect(resolveSearch('cats & dogs', ENGINES, 'ddg')).toBe('https://duckduckgo.com/?q=cats%20%26%20dogs')
    expect(resolveSearch('!yt lofi beats', ENGINES, 'google')).toBe('https://www.youtube.com/results?search_query=lofi%20beats')
    expect(resolveSearch('react hooks !gh', ENGINES, 'google')).toBe('https://github.com/search?q=react%20hooks')
    expect(resolveSearch('!nope x', ENGINES, 'google')).toBe('https://www.google.com/search?q=!nope%20x')
    expect(resolveSearch('example.com/path', ENGINES, 'google')).toBe('https://example.com/path')
    expect(asUrl('192.168.1.10:8123')).toBe('http://192.168.1.10:8123')
    expect(asUrl('localhost:3000')).toBe('http://localhost:3000')
    expect(asUrl('hello world')).toBeNull()
    expect(asUrl('node.js')).toBeNull()
    expect(asUrl('nodejs.org')).toBe('https://nodejs.org')
  })
})
