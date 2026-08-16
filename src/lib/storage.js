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

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    writeStore(key, state)
  }, [key, state])

  return [state, setState]
}

// A per-widget scoped store: each widget instance gets its own key space so
// two Notes widgets don't clobber each other.
export function useWidgetState(widgetId, initial) {
  return usePersistentState(`widget:${widgetId}`, initial)
}

// Snapshot every HomeDash key into a plain object (for JSON backup).
export function exportAllData() {
  const data = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX)) {
      try { data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)) } catch { /* skip */ }
    }
  }
  return { version: 1, exportedAt: new Date().toISOString(), data }
}

// Restore a backup produced by exportAllData(). Replaces all HomeDash keys.
export function importAllData(payload) {
  const data = payload?.data
  if (!data || typeof data !== 'object') throw new Error('Invalid backup file')
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX)) localStorage.removeItem(k)
  }
  for (const [k, v] of Object.entries(data)) writeStore(k, v)
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
