// Small localStorage-backed persistence layer with a namespaced prefix.
import { useCallback, useEffect, useRef, useState } from 'react'

const PREFIX = 'homedash:'

export function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeStore(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    // Broadcast a change so the cloud-sync layer (if any) can debounce a push.
    // Sync's own bookkeeping keys are excluded to avoid feedback loops.
    if (!key.startsWith('sync:') && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('homedash:change', { detail: { key } }))
    }
  } catch {
    // Quota errors are non-fatal for a dashboard; ignore.
  }
}

// useState mirror that reads once on mount and writes on every change.
// `initial` may be a value or a lazy factory function (resolved only when there
// is nothing stored yet), mirroring React's useState lazy-initializer contract.
export function usePersistentState(key, initial) {
  const [state, setState] = useState(() => {
    const resolved = typeof initial === 'function' ? initial() : initial
    return readStore(key, resolved)
  })
  const first = useRef(true)
  const initialRef = useRef(initial)

  // Changes made outside React (the AI assistant) are picked up live; a
  // removed key falls back to the initial value.
  useEffect(() => {
    const onExternal = (e) => {
      if (!e.detail?.keys?.includes(key)) return
      const raw = localStorage.getItem(PREFIX + key)
      if (raw == null) {
        const init = initialRef.current
        setState(typeof init === 'function' ? init() : init)
        return
      }
      try { setState(JSON.parse(raw)) } catch { /* ignore */ }
    }
    window.addEventListener('homedash:external', onExternal)
    return () => window.removeEventListener('homedash:external', onExternal)
  }, [key])

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    writeStore(key, state)
  }, [key, state])

  return [state, setState]
}

// Apply a set of key → value changes from outside React (undefined removes
// the key) and tell the mounted hooks to reload them. Goes through writeStore,
// so server/cloud sync pushes the change as usual.
export function applyExternalChanges(changes) {
  const keys = Object.keys(changes)
  for (const key of keys) {
    if (changes[key] === undefined) {
      try { localStorage.removeItem(PREFIX + key) } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('homedash:change', { detail: { key } }))
    } else {
      writeStore(key, changes[key])
    }
  }
  window.dispatchEvent(new CustomEvent('homedash:external', { detail: { keys } }))
}

// A per-widget scoped store: each widget instance gets its own key space so
// two Notes widgets don't clobber each other.
export function useWidgetState(widgetId, initial) {
  return usePersistentState(`widget:${widgetId}`, initial)
}

// Device-local keys that must never leave this browser or be overwritten by a
// restore/sync (they hold cloud credentials + sync bookkeeping).
const LOCAL_ONLY = (k) => k.startsWith('sync:')

// Snapshot every syncable HomeDash key into a plain object (for backup / sync).
export function exportAllData() {
  const data = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX) && !LOCAL_ONLY(k.slice(PREFIX.length))) {
      try { data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)) } catch { /* skip */ }
    }
  }
  return { version: 1, exportedAt: new Date().toISOString(), data }
}

// Restore a backup produced by exportAllData(). Replaces syncable HomeDash keys
// but leaves device-local (sync) keys untouched.
export function importAllData(payload) {
  const data = payload?.data
  if (!data || typeof data !== 'object') throw new Error('Invalid backup file')
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX) && !LOCAL_ONLY(k.slice(PREFIX.length))) localStorage.removeItem(k)
  }
  for (const [k, v] of Object.entries(data)) {
    if (!LOCAL_ONLY(k)) writeStore(k, v)
  }
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`
}

// Cross-tab / cross-widget change notifier so widgets can react to shared data
// (e.g. Stats reflecting Tasks) without a global store.
export function useStorageSignal(callback) {
  const cb = useCallback(callback, [callback])
  useEffect(() => {
    const handler = (e) => {
      if (e.key && e.key.startsWith(PREFIX)) cb(e.key.slice(PREFIX.length))
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [cb])
}
