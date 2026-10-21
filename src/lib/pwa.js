// Installable-app plumbing: service worker registration and the browser's
// install prompt, exposed as a small hook.
import { useEffect, useState } from 'react'
import { desktop } from './desktop.js'

export const swSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator

export function registerServiceWorker() {
  // The desktop app ships its own copy of the web app; dev builds change too
  // often for a cache to help.
  if (!swSupported() || import.meta.env.DEV || desktop) return
  const go = () => navigator.serviceWorker.register('/sw.js').catch(() => { /* not a secure context, etc. */ })
  if (document.readyState === 'complete') go()
  else window.addEventListener('load', go, { once: true })
}

export function isStandalone() {
  return typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
}

export const isIOS = () => typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

// beforeinstallprompt can fire before React mounts, so capture it at load.
let deferred = null
let installed = false
const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn())
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit() })
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; emit() })
}

export async function promptInstall() {
  if (!deferred) return 'unavailable'
  deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  emit()
  return outcome
}

export function useInstallState() {
  const read = () => ({ canInstall: !!deferred, installed: installed || isStandalone(), ios: isIOS() })
  const [state, setState] = useState(read)
  useEffect(() => {
    const fn = () => setState(read())
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  return state
}
