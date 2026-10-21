// HomeDash server: serves the built app and a small JSON API.
//
//   GET  /api/health                 server info + auth state (always public)
//   POST /api/login  {password}      sets a session cookie
//   POST /api/logout
//   GET  /api/state                  the stored dashboard snapshot
//   PUT  /api/state  {data}          replace it (last write wins)
//   GET  /api/proxy?url=…            fetch an http(s) URL server-side (no CORS)
//   POST /api/status {targets}       reachability + latency for each URL
//   GET  /api/docker/containers      container list (needs the Docker socket)
//   POST /api/docker/containers/:id/restart   (needs dockerControl)
//   GET  /api/push[?endpoint=…]      VAPID public key + subscription info
//   POST /api/push/subscribe {subscription, label}
//   POST /api/push/unsubscribe {endpoint}
//   PUT  /api/push/schedule {items}  reminders to push when they come due
//   POST /api/push/test {endpoint}   send a test notification
//   GET/PUT /api/ai/config           AI assistant settings (the API key is write-only)
//   POST /api/ai/chat                one assistant turn, streamed as Server-Sent Events
//   GET  /api/ai/ollama/models       models available on the configured Ollama
//   GET/POST /api/mcp/tokens, DELETE /api/mcp/tokens/:id   MCP access tokens
//   POST /mcp                        MCP endpoint (bearer token, not the cookie)
//
// Only Node built-ins plus the Anthropic SDK (for the AI assistant), so the
// same module runs inside the Docker image and the desktop app.
import http from 'node:http'
import https from 'node:https'
import crypto from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { createPushService } from './push.js'
import { createAi } from './ai.js'
import { createMcp } from './mcp.js'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
}

const MAX_BODY = 10 * 1024 * 1024 // dashboard snapshots
const PROXY_MAX = 5 * 1024 * 1024
const PROXY_TIMEOUT = 10_000
const STATUS_TIMEOUT = 5_000
const MAX_STATUS_TARGETS = 50
const COOKIE = 'hd_session'

export async function startServer(opts = {}) {
  const port = opts.port ?? 8787
  const host = opts.host ?? '0.0.0.0'
  const dataDir = resolve(opts.dataDir ?? './data')
  const staticDir = opts.staticDir ? resolve(opts.staticDir) : null
  const password = opts.password || ''
  const dockerSocket = opts.dockerSocket ?? '/var/run/docker.sock'
  const dockerControl = !!opts.dockerControl
  const version = opts.version || '0.0.0'
  const log = opts.logger ?? (() => {})
  const pushSubject = opts.pushSubject || 'https://github.com/BlackHargaan/HomeDash'

  await mkdir(dataDir, { recursive: true })
  const secret = await loadSecret(dataDir)
  const store = createStore(dataDir)
  const push = await createPushService({ dataDir, subject: pushSubject, log, allowHttp: !!opts.allowInsecurePush })
  const ai = await createAi({ dataDir, log, anthropicOptions: opts.anthropicOptions })
  const mcp = await createMcp({ dataDir, store, version, log })
  // Deterministic per (server secret, password): changing the password signs
  // everyone out.
  const sessionToken = password ? hmac(secret, `session:${password}`) : null
  const failures = new Map() // ip -> { count, until }

  const isAuthed = (req) => {
    if (!password) return true
    const token = parseCookies(req.headers.cookie)[COOKIE]
    return !!token && safeEqual(token, sessionToken)
  }

  async function handleApi(req, res, url) {
    const path = url.pathname
    const method = req.method

    if (path === '/api/health' && method === 'GET') {
      return json(res, 200, {
        ok: true,
        name: 'homedash',
        version,
        auth: !!password,
        authed: isAuthed(req),
        docker: { available: existsSync(dockerSocket), control: dockerControl },
        features: ['push', 'ai', 'mcp'],
      })
    }

    if (path === '/api/login' && method === 'POST') {
      if (!password) return json(res, 200, { ok: true })
      const ip = req.socket.remoteAddress || '?'
      const f = failures.get(ip)
      if (f && f.until > Date.now()) return json(res, 429, { error: 'Too many attempts. Try again in a minute.' })
      const body = await readJson(req)
      const given = typeof body?.password === 'string' ? body.password : ''
      if (!safeEqual(hmac(secret, `pw:${given}`), hmac(secret, `pw:${password}`))) {
        const count = (f?.count || 0) + 1
        failures.set(ip, { count, until: count >= 5 ? Date.now() + 60_000 : 0 })
        return json(res, 401, { error: 'Wrong password' })
      }
      failures.delete(ip)
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
      res.setHeader('Set-Cookie', `${COOKIE}=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}${secure}`)
      return json(res, 200, { ok: true })
    }

    if (path === '/api/logout' && method === 'POST') {
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
      return json(res, 200, { ok: true })
    }

    // Everything below requires a session when a password is configured.
    if (!isAuthed(req)) return json(res, 401, { error: 'Sign in required' })

    if (path === '/api/state') {
      if (method === 'GET') {
        const state = await store.get()
        return state ? json(res, 200, state) : json(res, 404, { error: 'No saved state yet' })
      }
      if (method === 'PUT') {
        const body = await readJson(req)
        if (!body || typeof body.data !== 'object' || body.data === null || Array.isArray(body.data)) {
          return json(res, 400, { error: 'Expected { data: {...} }' })
        }
        const saved = await store.put(body.data)
        return json(res, 200, { updated_at: saved.updated_at })
      }
    }

    if (path === '/api/proxy' && method === 'GET') {
      const target = parseHttpUrl(url.searchParams.get('url'))
      if (!target) return json(res, 400, { error: 'url must be an http(s) URL' })
      return proxy(target, res)
    }

    if (path === '/api/status' && method === 'POST') {
      const body = await readJson(req)
      const targets = Array.isArray(body?.targets) ? body.targets.slice(0, MAX_STATUS_TARGETS) : null
      if (!targets) return json(res, 400, { error: 'Expected { targets: [{ url, insecure? }] }' })
      const results = await Promise.all(targets.map((t) => checkStatus(typeof t === 'string' ? { url: t } : t)))
      return json(res, 200, { results })
    }

    if (path === '/api/docker/containers' && method === 'GET') {
      if (!existsSync(dockerSocket)) return json(res, 503, { error: 'Docker socket not mounted' })
      const r = await dockerRequest(dockerSocket, 'GET', '/containers/json?all=1')
      if (r.status !== 200) return json(res, 502, { error: `Docker API returned ${r.status}` })
      const list = JSON.parse(r.body).map((c) => ({
        id: c.Id.slice(0, 12),
        name: (c.Names?.[0] || '').replace(/^\//, ''),
        image: c.Image,
        state: c.State,
        status: c.Status,
      }))
      return json(res, 200, { containers: list, control: dockerControl })
    }

    const restart = path.match(/^\/api\/docker\/containers\/([a-zA-Z0-9_.-]{1,128})\/restart$/)
    if (restart && method === 'POST') {
      if (!dockerControl) return json(res, 403, { error: 'Container control is disabled (set HOMEDASH_DOCKER_CONTROL=true)' })
      if (!existsSync(dockerSocket)) return json(res, 503, { error: 'Docker socket not mounted' })
      const r = await dockerRequest(dockerSocket, 'POST', `/containers/${restart[1]}/restart?t=10`)
      if (r.status === 204) return json(res, 200, { ok: true })
      return json(res, 502, { error: `Docker API returned ${r.status}` })
    }

    if (path === '/api/push' && method === 'GET') {
      return json(res, 200, push.info(url.searchParams.get('endpoint') || undefined))
    }
    if (path === '/api/push/subscribe' && method === 'POST') {
      const body = await readJson(req)
      return json(res, 200, await push.subscribe(body?.subscription, body?.label))
    }
    if (path === '/api/push/unsubscribe' && method === 'POST') {
      const body = await readJson(req)
      return json(res, 200, await push.unsubscribe(String(body?.endpoint || '')))
    }
    if (path === '/api/push/schedule' && method === 'PUT') {
      const body = await readJson(req)
      return json(res, 200, await push.setSchedule(body?.items))
    }
    if (path === '/api/push/test' && method === 'POST') {
      const body = await readJson(req)
      return json(res, 200, await push.test(body?.endpoint ? String(body.endpoint) : undefined))
    }

    if (path === '/api/ai/config') {
      if (method === 'GET') return json(res, 200, ai.publicConfig())
      if (method === 'PUT') return json(res, 200, await ai.updateConfig((await readJson(req)) || {}))
    }
    if (path === '/api/ai/chat' && method === 'POST') return ai.chat(req, res, await readJson(req))
    if (path === '/api/ai/ollama/models' && method === 'GET') return json(res, 200, await ai.ollamaModels())

    if (path === '/api/mcp/tokens') {
      if (method === 'GET') return json(res, 200, { tokens: mcp.listTokens() })
      if (method === 'POST') return json(res, 200, await mcp.createToken((await readJson(req)) || {}))
    }
    const revoke = path.match(/^\/api\/mcp\/tokens\/([a-f0-9]{6,32})$/)
    if (revoke && method === 'DELETE') return json(res, 200, await mcp.revokeToken(revoke[1]))

    return json(res, 404, { error: 'Not found' })
  }

  async function handleStatic(req, res, url) {
    if (!staticDir || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404).end()
      return
    }
    let rel
    try { rel = decodeURIComponent(url.pathname) } catch { res.writeHead(400).end(); return }
    let file = resolve(join(staticDir, rel))
    if (file !== staticDir && !file.startsWith(staticDir + sep)) { res.writeHead(403).end(); return }
    let info = await stat(file).catch(() => null)
    if (info?.isDirectory()) { file = join(file, 'index.html'); info = await stat(file).catch(() => null) }
    const isAsset = url.pathname.startsWith('/assets/')
    if (!info) {
      if (isAsset) { res.writeHead(404).end(); return }
      // SPA fallback.
      file = join(staticDir, 'index.html')
      info = await stat(file).catch(() => null)
      if (!info) { res.writeHead(404).end(); return }
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    if (req.method === 'HEAD') { res.end(); return }
    createReadStream(file).pipe(res)
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    try {
      if (url.pathname === '/mcp') await mcp.handle(req, res, readJson)
      else if (url.pathname.startsWith('/api/')) await handleApi(req, res, url)
      else await handleStatic(req, res, url)
    } catch (err) {
      log('error', err)
      if (!res.headersSent) json(res, err.statusCode || 500, { error: err.expose ? err.message : 'Internal error' })
      else res.end()
    }
  })

  await new Promise((ok, fail) => {
    server.once('error', fail)
    server.listen(port, host, () => { server.off('error', fail); ok() })
  })
  const actualPort = server.address().port
  log('info', `HomeDash ${version} listening on ${host}:${actualPort} (data: ${dataDir}${password ? ', password on' : ''})`)

  return {
    server,
    port: actualPort,
    push,
    close: () => { push.stop(); return new Promise((ok) => server.close(() => ok())) },
  }
}

// ---------------------------------------------------------------- storage

function createStore(dataDir) {
  const file = join(dataDir, 'state.json')
  let chain = Promise.resolve()
  let last = null

  async function get() {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'))
      last = parsed.updated_at
      return parsed
    } catch (e) {
      if (e.code === 'ENOENT') return null
      throw e
    }
  }

  function put(data) {
    // Serialise writes and write atomically (tmp + rename).
    chain = chain.then(async () => {
      let ts = new Date()
      // Guarantee strictly increasing timestamps so clients can compare them.
      if (last && ts <= new Date(last)) ts = new Date(new Date(last).getTime() + 1)
      const record = { data, updated_at: ts.toISOString() }
      const tmp = `${file}.${process.pid}.tmp`
      await writeFile(tmp, JSON.stringify(record))
      await rename(tmp, file)
      last = record.updated_at
      return record
    })
    return chain
  }

  return { get, put }
}

async function loadSecret(dataDir) {
  const file = join(dataDir, 'secret')
  try {
    return (await readFile(file, 'utf8')).trim()
  } catch {
    const s = crypto.randomBytes(32).toString('hex')
    await writeFile(file, s, { mode: 0o600 })
    return s
  }
}

// ---------------------------------------------------------------- proxy + status

function parseHttpUrl(raw) {
  if (!raw) return null
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

async function proxy(target, res) {
  let upstream
  try {
    upstream = await fetch(target, {
      redirect: 'follow',
      signal: AbortSignal.timeout(PROXY_TIMEOUT),
      headers: { 'User-Agent': 'HomeDash/1 (+self-hosted dashboard)', Accept: '*/*' },
    })
  } catch (e) {
    return json(res, 502, { error: `Could not reach ${target.host}: ${e.cause?.code || e.name}` })
  }
  const declared = Number(upstream.headers.get('content-length') || 0)
  if (declared > PROXY_MAX) return json(res, 413, { error: 'Response too large' })

  const chunks = []
  let size = 0
  const reader = upstream.body?.getReader()
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > PROXY_MAX) {
        reader.cancel().catch(() => {})
        return json(res, 413, { error: 'Response too large' })
      }
      chunks.push(value)
    }
  }
  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Proxied-Url': target.href,
  })
  res.end(Buffer.concat(chunks))
}

// Time-to-first-response for a URL. Any HTTP response below 500 counts as "up"
// (401/403 still means the service is running). `insecure` skips TLS
// verification for self-signed homelab certificates.
export function checkStatus({ url, insecure = false }) {
  const target = parseHttpUrl(url)
  if (!target) return Promise.resolve({ url, up: false, error: 'Invalid URL' })
  const lib = target.protocol === 'https:' ? https : http
  const started = process.hrtime.bigint()
  return new Promise((done) => {
    const req = lib.request(target, {
      method: 'GET',
      timeout: STATUS_TIMEOUT,
      rejectUnauthorized: !insecure,
      headers: { 'User-Agent': 'HomeDash/1 status check' },
    }, (resp) => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6
      resp.destroy()
      done({ url, up: resp.statusCode < 500, status: resp.statusCode, ms: Math.round(ms) })
    })
    req.on('timeout', () => req.destroy(Object.assign(new Error('Timed out'), { code: 'TIMEOUT' })))
    req.on('error', (e) => done({ url, up: false, error: e.code || e.message }))
    req.end()
  })
}

function dockerRequest(socketPath, method, path) {
  return new Promise((done, fail) => {
    const req = http.request({ socketPath, method, path, timeout: 10_000 }, (resp) => {
      let body = ''
      resp.setEncoding('utf8')
      resp.on('data', (c) => { body += c })
      resp.on('end', () => done({ status: resp.statusCode, body }))
    })
    req.on('timeout', () => req.destroy(new Error('Docker API timed out')))
    req.on('error', fail)
    req.end()
  })
}

// ---------------------------------------------------------------- helpers

function json(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

function readJson(req) {
  return new Promise((done, fail) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        req.destroy()
        fail(Object.assign(new Error('Request body too large'), { statusCode: 413, expose: true }))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) return done(null)
      try { done(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch {
        fail(Object.assign(new Error('Invalid JSON'), { statusCode: 400, expose: true }))
      }
    })
    req.on('error', fail)
  })
}

function parseCookies(header = '') {
  const out = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest('hex')
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}
