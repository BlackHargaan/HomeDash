import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { usePersistentState, exportAllData, importAllData, readStore, writeStore } from '../lib/storage.js'
import * as sb from '../lib/supabase.js'

const SyncContext = createContext(null)

const PULL_INTERVAL = 20000
const PUSH_DEBOUNCE = 2500

export function SyncProvider({ children }) {
  const [config, setConfig] = usePersistentState('sync:config', null) // { url, anonKey }
  const [session, setSession] = usePersistentState('sync:session', null) // { access_token, refresh_token, user }
  const [status, setStatus] = useState('idle') // idle | syncing | synced | error | offline
  const [error, setError] = useState(null)
  const [lastSync, setLastSync] = useState(null)

  const sessionRef = useRef(session)
  sessionRef.current = session
  const configRef = useRef(config)
  configRef.current = config
  const applyingRef = useRef(false)
  const pushTimer = useRef(null)

  const configured = !!(config?.url && config?.anonKey)
  const user = session?.user || null

  // Run an authenticated call, refreshing the token once on failure.
  const withSession = useCallback(async (fn) => {
    const cfg = configRef.current
    let s = sessionRef.current
    try {
      return await fn(cfg, s)
    } catch (e) {
      if (s?.refresh_token) {
        try {
          const refreshed = await sb.refreshSession(cfg, s.refresh_token)
          const next = { access_token: refreshed.access_token, refresh_token: refreshed.refresh_token, user: refreshed.user || s.user }
          setSession(next)
          sessionRef.current = next
          return await fn(cfg, next)
        } catch {
          setSession(null)
          throw new Error('Session expired — please sign in again.')
        }
      }
      throw e
    }
  }, [setSession])

  const applyRemote = useCallback((remote) => {
    applyingRef.current = true
    // Persist the applied marker BEFORE reload so we don't re-apply our own state.
    writeStore('sync:appliedAt', remote.updated_at)
    importAllData({ data: remote.data })
    window.location.reload()
  }, [])

  const pull = useCallback(async () => {
    if (!sessionRef.current || applyingRef.current) return
    const remote = await withSession(sb.pullState)
    if (!remote) return null
    const appliedAt = readStore('sync:appliedAt', null)
    if (!appliedAt || new Date(remote.updated_at) > new Date(appliedAt)) {
      applyRemote(remote)
    }
    return remote
  }, [withSession, applyRemote])

  const push = useCallback(async () => {
    if (!sessionRef.current) return
    setStatus('syncing')
    try {
      const res = await withSession((cfg, s) => sb.pushState(cfg, s, exportAllData().data))
      if (res?.updated_at) writeStore('sync:appliedAt', res.updated_at)
      setLastSync(Date.now())
      setStatus('synced')
      setError(null)
    } catch (e) {
      setStatus('error')
      setError(e.message)
    }
  }, [withSession])

  // Debounced push on any dashboard change while signed in.
  useEffect(() => {
    if (!session) return
    const onChange = () => {
      if (applyingRef.current) return
      clearTimeout(pushTimer.current)
      pushTimer.current = setTimeout(() => push(), PUSH_DEBOUNCE)
    }
    window.addEventListener('homedash:change', onChange)
    return () => { window.removeEventListener('homedash:change', onChange); clearTimeout(pushTimer.current) }
  }, [session, push])

  // Periodic pull while signed in.
  useEffect(() => {
    if (!session) { setStatus(configured ? 'idle' : 'idle'); return }
    let alive = true
    const tick = async () => {
      try { if (alive) await pull() } catch (e) { if (alive) { setStatus('error'); setError(e.message) } }
    }
    tick()
    const iv = setInterval(tick, PULL_INTERVAL)
    return () => { alive = false; clearInterval(iv) }
  }, [session, configured, pull])

  // ---- Public actions ----
  const saveConfig = useCallback((url, anonKey) => {
    setConfig({ url: url.trim(), anonKey: anonKey.trim() })
    setError(null)
  }, [setConfig])

  const clearConfig = useCallback(() => { setSession(null); setConfig(null) }, [setConfig, setSession])

  // On first sign-in on a device: remote (if any) is source of truth; else seed it.
  const reconcile = useCallback(async (newSession) => {
    setSession(newSession)
    sessionRef.current = newSession
    setStatus('syncing')
    try {
      const remote = await sb.pullState(configRef.current, newSession)
      if (remote) {
        applyRemote(remote) // reloads
      } else {
        const res = await sb.pushState(configRef.current, newSession, exportAllData().data)
        if (res?.updated_at) writeStore('sync:appliedAt', res.updated_at)
        setStatus('synced'); setLastSync(Date.now())
      }
    } catch (e) {
      setStatus('error'); setError(e.message)
    }
  }, [applyRemote, setSession])

  const doSignIn = useCallback(async (email, password) => {
    setError(null); setStatus('syncing')
    try {
      const s = await sb.signIn(configRef.current, email, password)
      await reconcile({ access_token: s.access_token, refresh_token: s.refresh_token, user: s.user })
      return true
    } catch (e) { setStatus('error'); setError(e.message); return false }
  }, [reconcile])

  const doSignUp = useCallback(async (email, password) => {
    setError(null); setStatus('syncing')
    try {
      const s = await sb.signUp(configRef.current, email, password)
      if (s.access_token) {
        await reconcile({ access_token: s.access_token, refresh_token: s.refresh_token, user: s.user })
      } else {
        // Email-confirmation flow: no session returned yet.
        setStatus('idle')
        setError('Check your email to confirm your account, then sign in.')
      }
      return true
    } catch (e) { setStatus('error'); setError(e.message); return false }
  }, [reconcile])

  const doSignOut = useCallback(async () => {
    if (session) { try { await sb.signOut(configRef.current, session) } catch { /* ignore */ } }
    writeStore('sync:appliedAt', null)
    setSession(null); setStatus('idle')
  }, [session, setSession])

  const value = {
    configured, config, user, status, error, lastSync,
    saveConfig, clearConfig, doSignIn, doSignUp, doSignOut,
    syncNow: push,
  }
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used within SyncProvider')
  return ctx
}
