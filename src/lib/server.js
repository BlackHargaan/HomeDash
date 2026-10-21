// Client side of the optional HomeDash server (see /server). The app works
// without it (static hosting, `npm run dev`); when /api/health answers, the app
// switches on server sync and routes cross-origin fetches through the proxy.

let probe = null
let current = null // last health result, for smartFetch

export function probeServer({ fresh = false } = {}) {
  if (!probe || fresh) {
    probe = fetch('/api/health', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? r.json() : null))
      // Static hosts answer /api/health with index.html (SPA fallback) → not JSON.
      .then((h) => (h && h.ok && h.name === 'homedash' ? h : null))
      .catch(() => null)
      .then((h) => { current = h; return h })
  }
  return probe
}

export function serverUsable(h = current) {
  return !!h && (!h.auth || h.authed)
}

async function api(path, init = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    body: init.body !== undefined && typeof init.body !== 'string' ? JSON.stringify(init.body) : init.body,
  })
  if (res.status === 404 && path === '/api/state') return null
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return body
}

export const serverApi = {
  login: (password) => api('/api/login', { method: 'POST', body: { password } }),
  logout: () => api('/api/logout', { method: 'POST' }),
  getState: () => api('/api/state'),
  putState: (data) => api('/api/state', { method: 'PUT', body: { data } }),
  status: (targets) => api('/api/status', { method: 'POST', body: { targets } }),
  containers: () => api('/api/docker/containers'),
  restart: (id) => api(`/api/docker/containers/${encodeURIComponent(id)}/restart`, { method: 'POST' }),
}

// fetch() that goes through the server's proxy when one is available, so feeds
// and APIs that don't send CORS headers (e.g. Google Calendar iCal URLs) work.
export async function smartFetch(url, init) {
  const h = await probeServer()
  if (serverUsable(h)) {
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { credentials: 'same-origin' })
    if (res.status === 502 || res.status === 413 || res.status === 400) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Proxy error ${res.status}`)
    }
    return res
  }
  return fetch(url, init)
}
