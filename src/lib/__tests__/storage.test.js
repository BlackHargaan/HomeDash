import { beforeEach, describe, expect, it } from 'vitest'
import { readStore, writeStore, exportAllData, importAllData } from '../storage.js'

// Minimal in-memory localStorage for the node test environment.
function installLocalStorage() {
  const map = new Map()
  globalThis.localStorage = {
    get length() { return map.size },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  }
}

beforeEach(installLocalStorage)

describe('readStore / writeStore', () => {
  it('round-trips JSON under the homedash: prefix', () => {
    writeStore('tasks', [{ id: 1 }])
    expect(localStorage.getItem('homedash:tasks')).toBe('[{"id":1}]')
    expect(readStore('tasks', [])).toEqual([{ id: 1 }])
  })

  it('falls back on missing or corrupt values', () => {
    expect(readStore('missing', 'dflt')).toBe('dflt')
    localStorage.setItem('homedash:bad', '{not json')
    expect(readStore('bad', 42)).toBe(42)
  })
})

describe('backup / restore', () => {
  it('exports app data but never sync credentials', () => {
    writeStore('tasks', ['a'])
    writeStore('sync:session', { access_token: 'SECRET' })
    localStorage.setItem('other-app:key', '"ignored"')
    const { data, version } = exportAllData()
    expect(version).toBe(1)
    expect(data).toEqual({ tasks: ['a'] })
  })

  it('restore replaces app data and keeps device-local sync keys', () => {
    writeStore('tasks', ['old'])
    writeStore('notes-only-here', 'x')
    writeStore('sync:session', { access_token: 'KEEP' })
    importAllData({ data: { tasks: ['new'], 'sync:session': { access_token: 'EVIL' } } })
    expect(readStore('tasks')).toEqual(['new'])
    expect(readStore('notes-only-here', null)).toBeNull()
    expect(readStore('sync:session')).toEqual({ access_token: 'KEEP' })
  })

  it('rejects files that are not HomeDash backups', () => {
    expect(() => importAllData({ nope: true })).toThrow()
  })
})
