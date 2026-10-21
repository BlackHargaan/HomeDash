import { describe, it, expect } from 'vitest'
import { BUILTIN_TEMPLATES, instantiate, templateFromWidgets, templateById } from '../templates.js'
import { widgetMeta } from '../../widgets/registry.js'

const overlaps = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('layout templates', () => {
  for (const t of BUILTIN_TEMPLATES) {
    it(`${t.name}: valid, in bounds, no overlaps, respects minimum sizes`, () => {
      const ws = instantiate(t)
      expect(ws).toHaveLength(t.widgets.length)
      const types = new Set()
      for (const w of ws) {
        const meta = widgetMeta(w.type)
        expect(meta, w.type).toBeTruthy()
        if (meta.singleton) { expect(types.has(w.type), `duplicate singleton ${w.type}`).toBe(false); types.add(w.type) }
        expect(w.layout.x + w.layout.w).toBeLessThanOrEqual(12)
        expect(w.layout.w).toBeGreaterThanOrEqual(meta.layout.minW)
        expect(w.layout.h).toBeGreaterThanOrEqual(meta.layout.minH)
      }
      for (let i = 0; i < ws.length; i++) {
        for (let j = i + 1; j < ws.length; j++) {
          expect(overlaps(ws[i].layout, ws[j].layout), `${ws[i].type} overlaps ${ws[j].type}`).toBe(false)
        }
      }
    })
  }

  it('creates fresh ids every time', () => {
    const a = instantiate(BUILTIN_TEMPLATES[0])
    const b = instantiate(BUILTIN_TEMPLATES[0])
    expect(a[0].id).not.toBe(b[0].id)
  })

  it('round-trips a board into a template keeping only title and style', () => {
    const board = [
      { id: 'w1', type: 'notes', settings: { title: 'Ideas', style: { accent: 'rose' }, secret: 'x' }, layout: { x: 0, y: 0, w: 4, h: 5 } },
      { id: 'w2', type: 'clock', settings: {}, layout: { x: 4, y: 0, w: 3, h: 3 } },
      { id: 'w3', type: 'gone', settings: {}, layout: { x: 0, y: 5, w: 3, h: 3 } },
    ]
    const tpl = templateFromWidgets('Mine', '⭐', board)
    expect(templateById(tpl.id, [tpl])).toBe(tpl)
    const ws = instantiate(tpl)
    expect(ws.map((w) => w.type)).toEqual(['notes', 'clock'])
    expect(ws[0].settings).toEqual({ title: 'Ideas', style: { accent: 'rose' } })
    expect(ws[0].layout).toEqual({ x: 0, y: 0, w: 4, h: 5 })
    expect(ws[0].id).not.toBe('w1')
  })
})
