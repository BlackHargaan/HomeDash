import http from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { startServer, checkStatus } from '../app.js'

let tmp
let upstream // a fake "internet" for proxy/status tests
let upstreamUrl

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'homedash-test-'))
  upstream = http.createServer((req, res) => {
    if (req.url === '/feed.ics') {
      res.writeHead(200, { 'Content-Type': 'text/calendar' })
      return res.end('BEGIN:VCALENDAR\r\nEND:VCALENDAR')
    }
    if (req.url === '/big') {
      res.writeHead(200)
      return res.end(Buffer.alloc(6 * 1024 * 1024))
    }
    if (req.url === '/locked') { res.writeHead(401); return res.end() }
    if (req.url === '/broken') { res.writeHead(503); return res.end() }
    res.writeHead(200); res.end('ok')
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  upstreamUrl = `http://127.0.0.1:${upstream.address().port}`
})

afterAll(async () => {
  await new Promise((r) => upstream.close(r))
  await rm(tmp, { recursive: true, force: true })
})

const running = []
afterEach(async () => { while (running.length) await running.pop().close() })

async function boot(opts = {}) {
  const dataDir = await mkdtemp(join(tmp, 'data-'))
  const app = await startServer({ port: 0, host: '127.0.0.1', dataDir, version: '9.9.9', ...opts })
  running.push(app)
  const base = `http://127.0.0.1:${app.port}`
  const call = (path, init = {}) => fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    body: init.body && typeof init.body !== 'string' ? JSON.stringify(init.body) : init.body,
  })
  return { app, base, call, dataDir }
}

describe('health', () => {
  it('reports version and auth state', async () => {
    const { call } = await boot()
    const h = await (await call('/api/health')).json()
    expect(h).toMatchObject({ ok: true, name: 'homedash', version: '9.9.9', auth: false, authed: true })
  })
})

describe('state', () => {
  it('404s before anything is saved, then round-trips with increasing timestamps', async () => {
    const { call } = await boot()
    expect((await call('/api/state')).status).toBe(404)
    const a = await (await call('/api/state', { method: 'PUT', body: { data: { tasks: [1] } } })).json()
    const b = await (await call('/api/state', { method: 'PUT', body: { data: { tasks: [1, 2] } } })).json()
    expect(new Date(b.updated_at) > new Date(a.updated_at)).toBe(true)
    const got = await (await call('/api/state')).json()
    expect(got).toEqual({ data: { tasks: [1, 2] }, updated_at: b.updated_at })
  })

  it('persists across restarts', async () => {
    const first = await boot()
    await first.call('/api/state', { method: 'PUT', body: { data: { notes: 'hi' } } })
    await first.app.close(); running.pop()
    const app = await startServer({ port: 0, host: '127.0.0.1', dataDir: first.dataDir })
    running.push(app)
    const got = await (await fetch(`http://127.0.0.1:${app.port}/api/state`)).json()
    expect(got.data).toEqual({ notes: 'hi' })
  })

  it('rejects malformed bodies', async () => {
    const { call } = await boot()
    expect((await call('/api/state', { method: 'PUT', body: { data: [1] } })).status).toBe(400)
    expect((await call('/api/state', { method: 'PUT', body: '{nope' })).status).toBe(400)
  })
})

describe('password', () => {
  it('locks the API until signed in, and the cookie unlocks it', async () => {
    const { call } = await boot({ password: 'hunter2' })
    const h = await (await call('/api/health')).json()
    expect(h).toMatchObject({ auth: true, authed: false })
    expect((await call('/api/state')).status).toBe(401)
    expect((await call('/api/proxy?url=' + encodeURIComponent(upstreamUrl))).status).toBe(401)

    expect((await call('/api/login', { method: 'POST', body: { password: 'wrong' } })).status).toBe(401)
    const ok = await call('/api/login', { method: 'POST', body: { password: 'hunter2' } })
    expect(ok.status).toBe(200)
    const cookie = ok.headers.get('set-cookie').split(';')[0]
    expect(cookie).toMatch(/^hd_session=/)

    const authed = await (await call('/api/health', { headers: { cookie } })).json()
    expect(authed.authed).toBe(true)
    expect((await call('/api/state', { headers: { cookie } })).status).toBe(404) // allowed, just empty
  })

  it('rate-limits repeated wrong passwords', async () => {
    const { call } = await boot({ password: 'pw' })
    for (let i = 0; i < 5; i++) await call('/api/login', { method: 'POST', body: { password: 'x' } })
    expect((await call('/api/login', { method: 'POST', body: { password: 'pw' } })).status).toBe(429)
  })
})

describe('proxy', () => {
  it('fetches http(s) URLs and passes the content type through', async () => {
    const { call } = await boot()
    const r = await call('/api/proxy?url=' + encodeURIComponent(upstreamUrl + '/feed.ics'))
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('text/calendar')
    expect(await r.text()).toContain('BEGIN:VCALENDAR')
  })

  it('refuses non-http schemes and oversized responses', async () => {
    const { call } = await boot()
    expect((await call('/api/proxy?url=' + encodeURIComponent('file:///etc/passwd'))).status).toBe(400)
    expect((await call('/api/proxy')).status).toBe(400)
    expect((await call('/api/proxy?url=' + encodeURIComponent(upstreamUrl + '/big'))).status).toBe(413)
  })

  it('reports unreachable hosts as 502', async () => {
    const { call } = await boot()
    expect((await call('/api/proxy?url=' + encodeURIComponent('http://127.0.0.1:1/'))).status).toBe(502)
  })
})

describe('status checks', () => {
  it('treats <500 as up (incl. 401) and 5xx / connection errors as down', async () => {
    const { call } = await boot()
    const { results } = await (await call('/api/status', {
      method: 'POST',
      body: { targets: [upstreamUrl, upstreamUrl + '/locked', upstreamUrl + '/broken', 'http://127.0.0.1:1/', 'nope'] },
    })).json()
    expect(results.map((r) => r.up)).toEqual([true, true, false, false, false])
    expect(results[0].status).toBe(200)
    expect(typeof results[0].ms).toBe('number')
    expect(results[3].error).toBe('ECONNREFUSED')
  })

  it('checkStatus is usable directly', async () => {
    expect((await checkStatus({ url: upstreamUrl })).up).toBe(true)
  })
})

describe('docker', () => {
  it('explains when the socket is not mounted, and blocks control unless enabled', async () => {
    const { call } = await boot({ dockerSocket: join(tmp, 'no.sock') })
    expect((await call('/api/docker/containers')).status).toBe(503)
    expect((await call('/api/docker/containers/abc/restart', { method: 'POST' })).status).toBe(403)
  })

  it('lists containers through a Docker-compatible socket', async () => {
    const sock = join(tmp, `docker-${Date.now()}.sock`)
    const fake = http.createServer((req, res) => {
      if (req.url.startsWith('/containers/json')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify([{ Id: 'a'.repeat(64), Names: ['/homedash'], Image: 'ghcr.io/x/homedash', State: 'running', Status: 'Up 2 hours' }]))
      }
      if (req.method === 'POST' && req.url.includes('/restart')) { res.writeHead(204); return res.end() }
      res.writeHead(404); res.end()
    })
    await new Promise((r) => fake.listen(sock, r))
    try {
      const { call } = await boot({ dockerSocket: sock, dockerControl: true })
      const { containers } = await (await call('/api/docker/containers')).json()
      expect(containers).toEqual([{ id: 'aaaaaaaaaaaa', name: 'homedash', image: 'ghcr.io/x/homedash', state: 'running', status: 'Up 2 hours' }])
      expect((await call('/api/docker/containers/aaaaaaaaaaaa/restart', { method: 'POST' })).status).toBe(200)
    } finally {
      await new Promise((r) => fake.close(r))
    }
  })
})

describe('static files', () => {
  it('serves the app with SPA fallback, caches assets and blocks traversal', async () => {
    const dist = join(tmp, 'dist')
    await mkdir(join(dist, 'assets'), { recursive: true })
    await writeFile(join(dist, 'index.html'), '<html>app</html>')
    await writeFile(join(dist, 'assets', 'app-123.js'), 'console.log(1)')
    const { base } = await boot({ staticDir: dist })

    const root = await fetch(base + '/')
    expect(await root.text()).toBe('<html>app</html>')
    expect(root.headers.get('cache-control')).toBe('no-cache')

    const asset = await fetch(base + '/assets/app-123.js')
    expect(asset.headers.get('cache-control')).toContain('immutable')
    expect(asset.headers.get('content-type')).toContain('javascript')

    expect(await (await fetch(base + '/some/deep/route')).text()).toBe('<html>app</html>')
    expect((await fetch(base + '/assets/missing.js')).status).toBe(404)
    // fetch() normalises "..", so send raw paths to really attempt traversal.
    const raw = (path) => new Promise((r) => http.get(base + '/', { path }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => r({ status: res.statusCode, body }))
    }))
    // Literal ".." is resolved by URL parsing → stays inside the app (SPA fallback).
    const literal = await raw('/../../etc/passwd')
    expect(literal.body).toBe('<html>app</html>')
    // Encoded slashes survive URL parsing and are caught by the root check.
    expect((await raw('/..%2f..%2fetc%2fpasswd')).status).toBe(403)
    expect((await raw('/assets/..%2f..%2f..%2fetc%2fpasswd')).status).toBe(403)
    expect((await fetch(base + '/api/unknown')).status).toBe(404)
  })
})
