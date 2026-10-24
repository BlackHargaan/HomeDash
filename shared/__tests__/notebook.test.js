import { describe, it, expect } from 'vitest'
import { splitTitle, normalizePage, pageTitle, pageMarkdown, movePage } from '../notebook.js'

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
})
