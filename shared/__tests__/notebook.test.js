import { describe, it, expect } from 'vitest'
import { splitTitle, normalizePage, pageTitle, pageMarkdown } from '../notebook.js'

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
})
