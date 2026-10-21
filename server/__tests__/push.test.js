import { describe, it, expect, afterEach } from 'vitest'
import crypto from 'node:crypto'
import http from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encryptPayload, generateVapidKeys, vapidAuthorization, vapidPublicKey, validSubscription } from '../push.js'
import { startServer } from '../app.js'

const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest()

// A browser-side subscription: its ECDH key pair and auth secret.
function makeBrowser() {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  const auth = crypto.randomBytes(16)
  return { ecdh, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') }, auth }
}

// What the browser does on receipt (RFC 8291 §3, receiver side).
function decrypt(body, browser) {
  const salt = body.subarray(0, 16)
  const rs = body.readUInt32BE(16)
  const idlen = body[20]
  const asPublic = body.subarray(21, 21 + idlen)
  const data = body.subarray(21 + idlen)
  const shared = browser.ecdh.computeSecret(asPublic)
  const uaPublic = browser.ecdh.getPublicKey()
  const ikm = hmac(hmac(browser.auth, shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]))
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16)
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12)
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(data.subarray(data.length - 16))
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()])
  expect(plain[plain.length - 1]).toBe(2) // last-record delimiter
  expect(rs).toBe(4096)
  return plain.subarray(0, plain.length - 1).toString('utf8')
}

describe('web push crypto', () => {
  it('encrypts so the subscriber can decrypt (aes128gcm)', () => {
    const browser = makeBrowser()
    const body = encryptPayload(JSON.stringify({ title: 'Hi ☕' }), browser.keys)
    expect(JSON.parse(decrypt(body, browser))).toEqual({ title: 'Hi ☕' })
    // fresh salt + ephemeral key every time
    expect(encryptPayload('x', browser.keys).subarray(0, 16).equals(encryptPayload('x', browser.keys).subarray(0, 16))).toBe(false)
  })

  it('signs a VAPID JWT the push service can verify', () => {
    const { jwk } = generateVapidKeys()
    const header = vapidAuthorization('https://push.example.com/send/abc', jwk, 'mailto:me@example.com', Date.UTC(2026, 0, 1))
    const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)
    expect(m).toBeTruthy()
    expect(m[4]).toBe(vapidPublicKey(jwk))
    const claims = JSON.parse(Buffer.from(m[2], 'base64url'))
    expect(claims).toMatchObject({ aud: 'https://push.example.com', sub: 'mailto:me@example.com', exp: Date.UTC(2026, 0, 1) / 1000 + 43200 })
    const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' })
    const ok = crypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url'))
    expect(ok).toBe(true)
    expect(Buffer.from(vapidPublicKey(jwk), 'base64url')).toHaveLength(65)
  })

  it('validates subscriptions', () => {
    const b = makeBrowser()
    expect(validSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: b.keys })).toBe(true)
    expect(validSubscription({ endpoint: 'http://127.0.0.1/x', keys: b.keys })).toBe(false)
    expect(validSubscription({ endpoint: 'http://127.0.0.1/x', keys: b.keys }, { allowHttp: true })).toBe(true)
    expect(validSubscription({ endpoint: 'https://x.test/', keys: { p256dh: 'abc', auth: 'def' } })).toBe(false)
    expect(validSubscription(null)).toBe(false)
  })
})

describe('push API + scheduler', () => {
  let app, pushService
  afterEach(async () => { await app?.close(); await new Promise((r) => (pushService ? pushService.close(r) : r())) })

  it('delivers due reminders once, to every device, and forgets expired subscriptions', async () => {
    const received = []
    let gone = false
    pushService = http.createServer((req, res) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        received.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) })
        res.writeHead(gone && req.url === '/dev2' ? 410 : 201).end()
      })
    })
    await new Promise((r) => pushService.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${pushService.address().port}`

    app = await startServer({ port: 0, host: '127.0.0.1', dataDir: mkdtempSync(join(tmpdir(), 'hd-push-')), allowInsecurePush: true })
    const api = (path, method = 'GET', body) => fetch(`http://127.0.0.1:${app.port}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json() }))

    const info = await api('/api/push')
    expect(Buffer.from(info.body.publicKey, 'base64url')).toHaveLength(65)
    expect(info.body.devices).toBe(0)

    const one = makeBrowser()
    const two = makeBrowser()
    expect((await api('/api/push/subscribe', 'POST', { subscription: { endpoint: `${base}/dev1`, keys: one.keys }, label: 'Phone' })).body.devices).toBe(1)
    expect((await api('/api/push/subscribe', 'POST', { subscription: { endpoint: `${base}/dev2`, keys: two.keys } })).body.devices).toBe(2)
    expect((await api('/api/push/subscribe', 'POST', { subscription: { endpoint: 'nope' } })).status).toBe(400)
    expect((await api(`/api/push?endpoint=${encodeURIComponent(base + '/dev1')}`)).body.subscribed).toBe(true)

    const now = Date.now()
    const items = [
      { key: 'e:1', at: now + 60_000, until: now + 120_000, title: 'Later', body: 'not yet' },
      { key: 'e:2', at: now - 1000, until: now + 60_000, title: 'Standup', body: 'Starts at 10:00 (in 10 min)', tag: 'e:2' },
      { key: 'e:old', at: now - 7200_000, until: now - 3600_000, title: 'Past' },
    ]
    expect((await api('/api/push/schedule', 'PUT', { items })).body.scheduled).toBe(2)
    await app.push.tick(now)
    // setSchedule also ticks; either way each device gets exactly one message.
    await app.push.tick(now + 1000)
    const msgs = received.filter((m) => m.path === '/dev1')
    expect(msgs).toHaveLength(1)
    expect(msgs[0].headers['content-encoding']).toBe('aes128gcm')
    expect(msgs[0].headers.authorization).toMatch(/^vapid t=.+, k=/)
    expect(msgs[0].headers.ttl).toBeTruthy()
    expect(JSON.parse(decrypt(msgs[0].body, one))).toEqual({ title: 'Standup', body: 'Starts at 10:00 (in 10 min)', tag: 'e:2', url: '/' })
    expect(JSON.parse(decrypt(received.find((m) => m.path === '/dev2').body, two)).title).toBe('Standup')

    // The later reminder fires when its time comes; the push service now says dev2 is gone.
    gone = true
    await app.push.tick(now + 61_000)
    expect(received.filter((m) => m.path === '/dev1')).toHaveLength(2)
    expect((await api('/api/push')).body.devices).toBe(1)

    const test = await api('/api/push/test', 'POST', { endpoint: `${base}/dev1` })
    expect(test.body.results).toEqual([{ endpoint: `${base}/dev1`, status: 201, ok: true }])
    expect((await api('/api/push/unsubscribe', 'POST', { endpoint: `${base}/dev1` })).body.devices).toBe(0)
    expect((await api('/api/push/test', 'POST', { endpoint: `${base}/dev1` })).status).toBe(404)
  })

  it('keeps the VAPID key across restarts and requires sign-in when a password is set', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'hd-push-'))
    app = await startServer({ port: 0, host: '127.0.0.1', dataDir })
    const k1 = (await (await fetch(`http://127.0.0.1:${app.port}/api/push`)).json()).publicKey
    await app.close()
    app = await startServer({ port: 0, host: '127.0.0.1', dataDir, password: 'pw' })
    expect((await fetch(`http://127.0.0.1:${app.port}/api/push`)).status).toBe(401)
    expect(app.push.publicKey).toBe(k1)
  })
})
