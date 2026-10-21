// HomeDash service worker: makes the app installable and usable offline, and
// shows reminder notifications (pushed by the HomeDash server, or posted by the
// page itself).
//
// Caching: page navigations are network-first (so a new version shows up on the
// next load) with the cached shell as the offline fallback; hashed /assets/ are
// cache-first; the API is never cached.
const CACHE = 'homedash-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
}

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE)
  try {
    const res = await Promise.race([fetch(request), timeout(4000)])
    if (res.ok) cache.put('/', res.clone())
    return res
  } catch {
    return (await cache.match('/')) || Response.error()
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) cache.put(request, res.clone())
  return res
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  const fresh = fetch(request).then((res) => { if (res.ok) cache.put(request, res.clone()); return res }).catch(() => hit)
  return hit || fresh
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') return event.respondWith(networkFirstPage(request))
  if (url.pathname.startsWith('/assets/')) return event.respondWith(cacheFirst(request))
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    return event.respondWith(staleWhileRevalidate(request))
  }
})

function show({ title, body, tag, url }) {
  return self.registration.showNotification(title || 'HomeDash', {
    body: body || '',
    tag: tag || undefined,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: url || '/' },
  })
}

// Server push (see server/push.js). The payload is JSON { title, body, tag, url }.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data?.text() } }
  event.waitUntil(show(data))
})

// The page asks the worker to show notifications so they work on platforms
// (e.g. Android Chrome) where `new Notification()` isn't allowed.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'notify') event.waitUntil(show(event.data))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = wins.find((w) => new URL(w.url).origin === self.location.origin)
    if (existing) return existing.focus()
    return self.clients.openWindow(target)
  })())
})
