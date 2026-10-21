// Browser side of server push reminders: subscribe this device with the
// HomeDash server's VAPID key so reminders arrive even when no HomeDash tab is
// open. Needs the server, a service worker and a secure context (https or
// localhost). The desktop app notifies on its own and doesn't use this.
import { serverApi, serverUsable } from './server.js'
import { swSupported } from './pwa.js'
import { desktop } from './desktop.js'
import { readStore, writeStore } from './storage.js'
import { requestNotifyPermission } from './notify.js'

// Device-local flag (sync:* keys never leave this browser).
const FLAG = 'sync:pushEndpoint'

export function pushUnavailableReason() {
  if (desktop) return 'The desktop app shows reminders itself while it runs (also from the tray).'
  if (typeof window === 'undefined' || !swSupported() || !('PushManager' in window)) return 'This browser doesn’t support push notifications.'
  if (!window.isSecureContext) return 'Push needs HomeDash to be opened over HTTPS (or on localhost).'
  if (!serverUsable()) return 'Push reminders are sent by the HomeDash server — run HomeDash with Docker or `npm start`.'
  return null
}

export const pushEndpoint = () => readStore(FLAG, null)

function keyBytes(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4)
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration() {
  if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('/sw.js')
  return navigator.serviceWorker.ready
}

function deviceLabel() {
  const ua = navigator.userAgent
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : /mac/i.test(ua) ? 'macOS' : /windows/i.test(ua) ? 'Windows' : /linux/i.test(ua) ? 'Linux' : 'Device'
  const br = /edg\//i.test(ua) ? 'Edge' : /firefox/i.test(ua) ? 'Firefox' : /chrome/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Browser'
  return `${br} on ${os}`
}

export async function enablePush() {
  const reason = pushUnavailableReason()
  if (reason) throw new Error(reason)
  if ((await requestNotifyPermission()) !== 'granted') throw new Error('Notifications are blocked for this site in your browser settings.')
  const reg = await registration()
  const { publicKey } = await serverApi.pushInfo()
  let sub = await reg.pushManager.getSubscription()
  // A subscription made with another server's key can't be reused.
  if (sub && sub.options?.applicationServerKey) {
    const current = new Uint8Array(sub.options.applicationServerKey)
    const want = keyBytes(publicKey)
    if (current.length !== want.length || current.some((b, i) => b !== want[i])) { await sub.unsubscribe(); sub = null }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
  await serverApi.pushSubscribe(sub.toJSON(), deviceLabel())
  writeStore(FLAG, sub.endpoint)
  return sub.endpoint
}

export async function disablePush() {
  const endpoint = pushEndpoint()
  writeStore(FLAG, null)
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
  } catch { /* ignore */ }
  if (endpoint) await serverApi.pushUnsubscribe(endpoint).catch(() => {})
}

// Is this device still subscribed on the server? (Clears a stale flag.)
export async function checkPush() {
  const endpoint = pushEndpoint()
  if (!endpoint || pushUnavailableReason()) return false
  try {
    const info = await serverApi.pushInfo(endpoint)
    if (!info.subscribed) writeStore(FLAG, null)
    return !!info.subscribed
  } catch {
    return true // server unreachable right now; keep the setting
  }
}

export const testPush = () => serverApi.pushTest(pushEndpoint())
