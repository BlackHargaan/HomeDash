import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { probeServer, serverApi, serverUsable } from '../lib/server.js'
import { exportAllData, importAllData, readStore, writeStore } from '../lib/storage.js'

// Detects the optional HomeDash server and, when present, keeps this browser's
// dashboard in sync with the copy stored on the server (last write wins).
//
//   status: 'checking' | 'none' (static hosting) | 'locked' (needs password) | 'ready'

const ServerContext = createContext(null)

const APPLIED_KEY = 'sync:serverAppliedAt' // device-local: never exported/synced
const PUSH_DEBOUNCE = 1500
const POLL_INTERVAL = 20000

// Compare snapshots independent of localStorage key order.
function sameData(a, b) {
  const norm = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]]))
  return norm(a) === norm(b)
}

export function ServerProvider({ children }) {
  const [status, setStatus] = useState('checking')
  const [health, setHealth] = useState(null)
  const [sync, setSync] = useState({ state: 'idle', lastSync: null, error: null })

  const applying = useRef(false)
  const dirty = useRef(false)
  const pushTimer = useRef(null)

  const adopt = useCallback((h) => {
    setHealth(h)
    setStatus(!h ? 'none' : serverUsable(h) ? 'ready' : 'locked')
  }, [])

  useEffect(() => { probeServer().then(adopt) }, [adopt])

  const fail = (e) => {
    if (e.status === 401) { setStatus('locked'); return }
    setSync((s) => ({ ...s, state: 'error', error: e.message }))
  }

  const applyRemote = useCallback((remote) => {
    applying.current = true
    writeStore(APPLIED_KEY, remote.updated_at)
    importAllData({ data: remote.data })
    window.location.reload()
  }, [])

  const push = useCallback(async () => {
    clearTimeout(pushTimer.current)
    setSync((s) => ({ ...s, state: 'syncing' }))
    try {
      const { updated_at } = await serverApi.putState(exportAllData().data)
      writeStore(APPLIED_KEY, updated_at)
      dirty.current = false
      setSync({ state: 'synced', lastSync: Date.now(), error: null })
    } catch (e) { fail(e) }
  }, [])

  // On connect: the server is the source of truth for a browser that has never
  // synced; otherwise take whichever side is newer.
  useEffect(() => {
    if (status !== 'ready') return
    let alive = true
    ;(async () => {
      setSync((s) => ({ ...s, state: 'syncing' }))
      try {
        const remote = await serverApi.getState()
        if (!alive) return
        const applied = readStore(APPLIED_KEY, null)
        if (!remote) return push() // empty server: seed it from this browser
        if (!applied || new Date(remote.updated_at) > new Date(applied)) return applyRemote(remote)
        if (!sameData(remote.data, exportAllData().data)) return push() // unsent local edits
        setSync({ state: 'synced', lastSync: Date.now(), error: null })
      } catch (e) { if (alive) fail(e) }
    })()
    return () => { alive = false }
  }, [status, push, applyRemote])

  // Push shortly after any local change.
  useEffect(() => {
    if (status !== 'ready') return
    const onChange = () => {
      if (applying.current) return
      dirty.current = true
      clearTimeout(pushTimer.current)
      pushTimer.current = setTimeout(push, PUSH_DEBOUNCE)
    }
    // Best-effort flush when the tab is closing mid-debounce.
    const onHide = () => {
      if (!dirty.current) return
      fetch('/api/state', {
        method: 'PUT', keepalive: true, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: exportAllData().data }),
      }).catch(() => {})
    }
    window.addEventListener('homedash:change', onChange)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('homedash:change', onChange)
      window.removeEventListener('pagehide', onHide)
      clearTimeout(pushTimer.current)
    }
  }, [status, push])

  // Pick up changes made on other devices.
  useEffect(() => {
    if (status !== 'ready') return
    const iv = setInterval(async () => {
      if (applying.current || dirty.current || document.hidden) return
      try {
        const remote = await serverApi.getState()
        const applied = readStore(APPLIED_KEY, null)
        if (remote && (!applied || new Date(remote.updated_at) > new Date(applied))) applyRemote(remote)
      } catch (e) { fail(e) }
    }, POLL_INTERVAL)
    return () => clearInterval(iv)
  }, [status, applyRemote])

  const login = useCallback(async (password) => {
    await serverApi.login(password) // throws with a friendly message on failure
    adopt(await probeServer({ fresh: true }))
  }, [adopt])

  const logout = useCallback(async () => {
    await serverApi.logout().catch(() => {})
    adopt(await probeServer({ fresh: true }))
  }, [adopt])

  const value = { status, health, sync, login, logout, syncNow: push }
  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>
}

export function useServer() {
  const ctx = useContext(ServerContext)
  if (!ctx) throw new Error('useServer must be used within ServerProvider')
  return ctx
}
