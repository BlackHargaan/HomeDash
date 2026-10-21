// Web Push for HomeDash reminders, using only Node built-ins.
//
//   • VAPID (RFC 8292): an ES256-signed JWT identifies this server to the
//     browser's push service. The key pair is generated once and kept in
//     DATA_DIR/vapid.json.
//   • Payload encryption (RFC 8291, aes128gcm per RFC 8188), so the push
//     service only ever sees ciphertext.
//   • A scheduler: clients upload the reminders due over the next few days
//     (they own the calendar logic); every 30 s the server pushes whatever has
//     come due to every subscribed device, once.
import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'

const b64url = (buf) => Buffer.from(buf).toString('base64url')
const fromB64url = (s) => Buffer.from(String(s), 'base64url')

const MAX_SUBSCRIPTIONS = 50
const MAX_SCHEDULE = 500
const TICK_MS = 30_000

// ---------------------------------------------------------------- VAPID

export function generateVapidKeys() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return { jwk: privateKey.export({ format: 'jwk' }) }
}

// Uncompressed P-256 point (0x04 || X || Y), base64url — what browsers expect
// as `applicationServerKey`.
export function vapidPublicKey(jwk) {
  return b64url(Buffer.concat([Buffer.from([4]), fromB64url(jwk.x), fromB64url(jwk.y)]))
}

export function vapidAuthorization(endpoint, jwk, subject, now = Date.now()) {
  const aud = new URL(endpoint).origin
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const claims = b64url(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }))
  const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' })
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${vapidPublicKey(jwk)}`
}

// ---------------------------------------------------------------- RFC 8291

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest()

export function encryptPayload(payload, { p256dh, auth }, { salt = crypto.randomBytes(16), ecdh } = {}) {
  const uaPublic = fromB64url(p256dh)
  const authSecret = fromB64url(auth)
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('Invalid subscription keys')

  const local = ecdh || crypto.createECDH('prime256v1')
  if (!ecdh) local.generateKeys()
  const asPublic = local.getPublicKey()
  const shared = local.computeSecret(uaPublic)

  // Combine the ECDH secret with the subscription's auth secret…
  const prkKey = hmac(authSecret, shared)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])])
  const ikm = hmac(prkKey, keyInfo)
  // …then derive the content key and nonce (RFC 8188).
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16)
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12)

  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]) // 0x02 = last record
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()])

  const rs = Buffer.alloc(4)
  rs.writeUInt32BE(4096)
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body])
}

// POST one encrypted message to a subscription's push service.
export function sendPush(subscription, payload, { jwk, subject, ttl = 3600, urgency = 'high', timeoutMs = 15_000 }) {
  const body = encryptPayload(typeof payload === 'string' ? payload : JSON.stringify(payload), subscription.keys)
  const url = new URL(subscription.endpoint)
  const mod = url.protocol === 'http:' ? http : https
  return new Promise((done) => {
    const req = mod.request(url, {
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Content-Length': body.length,
        TTL: String(ttl),
        Urgency: urgency,
        Authorization: vapidAuthorization(subscription.endpoint, jwk, subject),
      },
    }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { if (text.length < 2000) text += c })
      res.on('end', () => done({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, text }))
    })
    req.on('timeout', () => req.destroy(new Error('Push service timed out')))
    req.on('error', (e) => done({ status: 0, ok: false, text: e.message }))
    req.end(body)
  })
}

// ---------------------------------------------------------------- service

export function validSubscription(sub, { allowHttp = false } = {}) {
  if (!sub || typeof sub !== 'object' || typeof sub.endpoint !== 'string') return false
  let url
  try { url = new URL(sub.endpoint) } catch { return false }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) return false
  const k = sub.keys || {}
  try {
    return fromB64url(k.p256dh).length === 65 && fromB64url(k.auth).length >= 16
  } catch {
    return false
  }
}

function cleanItem(r) {
  if (!r || typeof r.key !== 'string') return null
  const at = Number(r.at)
  const until = Number(r.until)
  if (!Number.isFinite(at) || !Number.isFinite(until) || until <= at) return null
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '')
  return { key: r.key.slice(0, 200), at, until, title: str(r.title, 120), body: str(r.body, 240), tag: str(r.tag || r.key, 200) }
}

export async function createPushService({
  dataDir, subject = 'https://github.com/BlackHargaan/HomeDash', log = () => {}, allowHttp = false, autoStart = true,
}) {
  const vapidFile = join(dataDir, 'vapid.json')
  const stateFile = join(dataDir, 'push.json')

  let vapid = await readFile(vapidFile, 'utf8').then(JSON.parse).catch(() => null)
  if (!vapid?.jwk?.d) {
    vapid = generateVapidKeys()
    await writeFile(vapidFile, JSON.stringify(vapid), { mode: 0o600 })
  }
  const publicKey = vapidPublicKey(vapid.jwk)

  let state = await readFile(stateFile, 'utf8').then(JSON.parse).catch(() => null)
  if (!state || typeof state !== 'object') state = {}
  state = { subscriptions: state.subscriptions || [], schedule: state.schedule || [], fired: state.fired || {} }

  let writing = Promise.resolve()
  const save = () => {
    writing = writing.then(async () => {
      const tmp = stateFile + '.tmp'
      await writeFile(tmp, JSON.stringify(state))
      await rename(tmp, stateFile)
    }).catch((e) => log('error', 'push: could not save state', e))
    return writing
  }

  async function deliver(item, subs = state.subscriptions) {
    const payload = { title: item.title, body: item.body, tag: item.tag, url: '/' }
    const results = await Promise.all(subs.map(async (s) => ({ s, r: await sendPush(s, payload, { jwk: vapid.jwk, subject }) })))
    // 404/410: the browser dropped this subscription — forget it.
    const gone = new Set(results.filter(({ r }) => r.status === 404 || r.status === 410).map(({ s }) => s.endpoint))
    if (gone.size) {
      state.subscriptions = state.subscriptions.filter((s) => !gone.has(s.endpoint))
      log('info', `push: removed ${gone.size} expired subscription(s)`)
    }
    for (const { s, r } of results) if (!r.ok && !gone.has(s.endpoint)) log('error', `push: ${new URL(s.endpoint).host} answered ${r.status} ${r.text}`)
    return results.map(({ s, r }) => ({ endpoint: s.endpoint, status: r.status, ok: r.ok }))
  }

  // Ticks run one after another, never overlapping, so nothing is sent twice.
  let queue = Promise.resolve()
  const tick = (now = Date.now()) => {
    const run = queue.then(() => runTick(now))
    queue = run.catch(() => {})
    return run
  }
  async function runTick(now) {
    const due = state.schedule.filter((r) => r.at <= now && now < r.until && !state.fired[r.key])
    if (due.length && state.subscriptions.length) {
      for (const item of due) {
        state.fired[item.key] = now
        await deliver(item)
      }
    } else {
      for (const item of due) state.fired[item.key] = now // nobody to tell; don't replay later
    }
    const before = state.schedule.length
    state.schedule = state.schedule.filter((r) => r.until > now)
    for (const [k, ts] of Object.entries(state.fired)) if (now - ts > 3 * 86400000) delete state.fired[k]
    if (due.length || before !== state.schedule.length) await save()
    return due.length
  }

  let timer = null
  const start = () => {
    if (timer) return
    timer = setInterval(() => { tick().catch((e) => log('error', 'push tick', e)) }, TICK_MS)
    timer.unref?.()
  }
  const stop = () => { clearInterval(timer); timer = null }
  if (autoStart) start()

  return {
    publicKey,
    tick,
    start,
    stop,
    info: (endpoint) => ({
      publicKey,
      devices: state.subscriptions.length,
      subscribed: endpoint ? state.subscriptions.some((s) => s.endpoint === endpoint) : undefined,
      scheduled: state.schedule.length,
    }),
    async subscribe(sub, label) {
      if (!validSubscription(sub, { allowHttp })) throw Object.assign(new Error('Invalid push subscription'), { statusCode: 400, expose: true })
      const entry = {
        endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        label: typeof label === 'string' ? label.slice(0, 80) : '', createdAt: new Date().toISOString(),
      }
      state.subscriptions = [...state.subscriptions.filter((s) => s.endpoint !== sub.endpoint), entry].slice(-MAX_SUBSCRIPTIONS)
      await save()
      return { devices: state.subscriptions.length }
    },
    async unsubscribe(endpoint) {
      const before = state.subscriptions.length
      state.subscriptions = state.subscriptions.filter((s) => s.endpoint !== endpoint)
      if (before !== state.subscriptions.length) await save()
      return { devices: state.subscriptions.length }
    },
    async setSchedule(items, now = Date.now()) {
      if (!Array.isArray(items)) throw Object.assign(new Error('Expected { items: [...] }'), { statusCode: 400, expose: true })
      state.schedule = items.map(cleanItem).filter((r) => r && r.until > now).slice(0, MAX_SCHEDULE)
      await save()
      // Something may already be due (e.g. an event created 5 minutes before it starts).
      tick(now).catch(() => {})
      return { scheduled: state.schedule.length }
    },
    async test(endpoint) {
      const subs = endpoint ? state.subscriptions.filter((s) => s.endpoint === endpoint) : state.subscriptions
      if (!subs.length) throw Object.assign(new Error('This device is not subscribed'), { statusCode: 404, expose: true })
      const results = await deliver({ title: 'HomeDash', body: 'Push reminders are working 🎉', tag: 'homedash-test' }, subs)
      await save()
      return { results }
    },
  }
}
