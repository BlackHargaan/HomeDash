import { describe, it, expect } from 'vitest'
import { splitTitle, normalizePage, pageTitle, pageMarkdown, movePage, pageRows, placePage, descendantIds, ancestorsOf } from '../notebook.js'

describe('notebook pages', () => {
  it('lifts a leading heading out as the title', () => {
    expect(splitTitle('# Groceries\n- [ ] milk')).toEqual({ title: 'Groceries', body: '- [ ] milk' })
    expect(splitTitle('# Trip\n\nPack bags')).toEqual({ title: 'Trip', body: 'Pack bags' })
    expect(splitTitle('Just text')).toEqual({ title: '', body: 'Just text' })
    expect(splitTitle('## Sub heading\nx').title).toBe('')
  })

  it('normalizes old and new page shapes', () => {
    expect(normalizePage({ id: 'a', text: '# Old\nbody', updated: 'x' })).toEqual({ id: 'a', title: 'Old', icon: '📄', text: 'body', updated: 'x' })
    const fresh = { id: 'b', title: 'New', icon: '💡', text: '# Not a title\nbody' }
    expect(normalizePage(fresh)).toEqual(fresh) // a heading in the body stays in the body
    expect(pageTitle({ id: 'c', title: '  ', text: '' })).toBe('Untitled')
    expect(pageMarkdown(fresh)).toBe('# New\n\n# Not a title\nbody\n')
  })

  it('reorders pages', () => {
    const ps = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
    const ids = (list) => list.map((p) => p.id).join('')
    expect(ids(movePage(ps, 'd', 'a'))).toBe('dabc')
    expect(ids(movePage(ps, 'a', 'c'))).toBe('bacd')
    expect(ids(movePage(ps, 'b', null))).toBe('acdb')
    expect(movePage(ps, 'b', 'b')).toBe(ps)
    expect(movePage(ps, 'zz', 'a')).toBe(ps)
  })

  describe('sub-pages', () => {
    // a ─ b ─ c
    //   └ d
    // e        (f points at a deleted parent → top level)
    const tree = [
      { id: 'a' }, { id: 'b', parent: 'a' }, { id: 'c', parent: 'b' }, { id: 'd', parent: 'a' },
      { id: 'e' }, { id: 'f', parent: 'gone' },
    ]
    const rows = (ps, opts) => pageRows(ps, opts).map((r) => `${'-'.repeat(r.depth)}${r.page.id}${r.hasChildren ? '+' : ''}`).join(' ')

    it('lists pages depth first', () => {
      expect(rows(tree)).toBe('a+ -b+ --c -d e f')
      const collapsed = tree.map((p) => (p.id === 'b' ? { ...p, collapsed: true } : p))
      expect(rows(collapsed)).toBe('a+ -b+ -d e f')
      expect(rows(collapsed, { all: true })).toBe('a+ -b+ --c -d e f')
    })

    it('finds ancestors and descendants', () => {
      expect([...descendantIds(tree, 'a')].sort()).toEqual(['b', 'c', 'd'])
      expect(ancestorsOf(tree, 'c').map((p) => p.id)).toEqual(['a', 'b'])
      expect(ancestorsOf(tree, 'f')).toEqual([])
    })

    it('moves pages between parents, never into themselves', () => {
      expect(rows(placePage(tree, 'e', 'b'))).toBe('a+ -b+ --c --e -d f')
      expect(rows(placePage(tree, 'd', null, 'a'))).toBe('d a+ -b+ --c e f')
      expect(rows(placePage(tree, 'c', 'a', 'b'))).toBe('a+ -c -b -d e f')
      expect(placePage(tree, 'a', 'c')).toBe(tree)
      expect(placePage(tree, 'a', 'a')).toBe(tree)
    })
  })
})
