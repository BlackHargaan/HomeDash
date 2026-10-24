import http from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startServer } from '../app.js'

const KEY = 'ABCDEF0123456789ABCDEF0123456789'
const STEAM_ID = '76561197960287930'
let mock
let base
let tmp
let privateProfile = false
let tokenCalls = 0
const igdbBodies = []

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'homedash-games-'))
  // One fake server standing in for Steam, Twitch and IGDB.
  mock = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (url.pathname.startsWith('/ISteam') || url.pathname.startsWith('/IPlayer')) {
        if (url.searchParams.get('key') !== KEY) return send(403, {})
        if (url.pathname === '/ISteamUser/ResolveVanityURL/v1/') {
          return send(200, { response: url.searchParams.get('vanityurl') === 'gabe' ? { success: 1, steamid: STEAM_ID } : { success: 42 } })
        }
        if (url.pathname === '/ISteamUser/GetPlayerSummaries/v2/') return send(200, { response: { players: [{ personaname: 'Gabe' }] } })
        if (url.pathname === '/IPlayerService/GetOwnedGames/v1/') {
          if (privateProfile) return send(200, { response: {} })
          return send(200, { response: { game_count: 2, games: [
            { appid: 620, name: 'Portal 2', playtime_forever: 610, playtime_2weeks: 45, rtime_last_played: 1760000000 },
            { appid: 367520, name: 'Hollow Knight', playtime_forever: 0 },
          ] } })
        }
      }
      if (url.pathname === '/oauth2/token') {
        tokenCalls++
        return url.searchParams.get('client_secret') === 'good' ? send(200, { access_token: 'tok', expires_in: 5000 }) : send(400, {})
      }
      if (url.pathname.startsWith('/v4/')) {
        if (req.headers.authorization !== 'Bearer tok' || req.headers['client-id'] !== 'cid') return send(401, {})
        igdbBodies.push(`${url.pathname} ${body}`)
        if (url.pathname === '/v4/external_games') return send(200, body.includes('"620"') && body.includes('external_game_source') ? [{ game: 72 }] : [])
        if (url.pathname === '/v4/games') {
          if (body.startsWith('search "Hades')) return send(200, [{ id: 9, name: 'Hades II' }, { id: 8, name: 'Hades' }])
          if (body.startsWith('search')) return send(200, [])
          if (body.includes('where id = 72')) return send(200, [{ id: 72, name: 'Portal 2' }])
        }
        if (url.pathname === '/v4/game_time_to_beats') {
          return send(200, [
            { game_id: 8, hastily: 22 * 3600, normally: 46 * 3600, completely: 95 * 3600, count: 120 },
            { game_id: 9, hastily: 30 * 3600, count: 5 },
            { game_id: 72, hastily: 8.6 * 3600, normally: 13.2 * 3600, completely: 21 * 3600, count: 900 },
          ].filter((t) => body.includes(String(t.game_id))))
        }
      }
      send(404, {})
    })
  })
  await new Promise((r) => mock.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${mock.address().port}`
})

afterAll(async () => {
  await new Promise((r) => mock.close(r))
  await rm(tmp, { recursive: true, force: true })
})

describe('game tracker API', () => {
  it('connects Steam, lists the library and looks up time to beat', async () => {
    const dataDir = await mkdtemp(join(tmp, 'data-'))
    const srv = await startServer({ port: 0, host: '127.0.0.1', dataDir, gamesOptions: { steamBase: base, twitchBase: base, igdbBase: `${base}/v4` } })
    const url = `http://127.0.0.1:${srv.port}`
    const call = async (method, path, body) => {
      const r = await fetch(url + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      return { status: r.status, body: await r.json() }
    }
    try {
      expect((await call('GET', '/api/games/config')).body.steam.configured).toBe(false)
      expect((await call('GET', '/api/games/steam/library')).body.error).toMatch(/Connect your Steam profile/)
      expect((await call('PUT', '/api/games/config', { steam: { apiKey: 'nope' } })).body.error).toMatch(/32 letters/)
      expect((await call('PUT', '/api/games/config', { steam: { apiKey: 'F'.repeat(32), profile: 'gabe' } })).body.error).toMatch(/didn’t accept that API key/)

      let r = await call('PUT', '/api/games/config', { steam: { apiKey: KEY.toLowerCase(), profile: 'https://steamcommunity.com/id/gabe/' } })
      expect(r.status).toBe(200)
      expect(r.body.steam).toEqual({ configured: true, hasKey: true, keyHint: '…6789', steamId: STEAM_ID, persona: 'Gabe' })
      expect(JSON.stringify(r.body)).not.toContain(KEY) // the key never comes back
      expect((await call('PUT', '/api/games/config', { steam: { profile: 'nobody-here' } })).body.error).toMatch(/Couldn’t find a Steam profile called “nobody-here”/)
      r = await call('PUT', '/api/games/config', { steam: { profile: `https://steamcommunity.com/profiles/${STEAM_ID}` } })
      expect(r.body.steam.steamId).toBe(STEAM_ID)

      r = await call('GET', '/api/games/steam/library')
      expect(r.body.games).toEqual([
        { appid: 620, name: 'Portal 2', min: 610, min2w: 45, last: 1760000000 },
        { appid: 367520, name: 'Hollow Knight', min: 0, min2w: 0, last: 0 },
      ])
      privateProfile = true
      expect((await call('GET', '/api/games/steam/library')).body.error).toMatch(/Game details/)
      privateProfile = false

      // IGDB
      expect((await call('POST', '/api/games/ttb', { name: 'Hades' })).body.error).toMatch(/IGDB/)
      expect((await call('PUT', '/api/games/config', { igdb: { clientId: 'cid', clientSecret: 'bad' } })).body.error).toMatch(/didn’t accept/)
      r = await call('PUT', '/api/games/config', { igdb: { clientId: 'cid', clientSecret: 'good' } })
      expect(r.body.igdb).toEqual({ configured: true, clientIdHint: '…cid' })
      r = await call('POST', '/api/games/ttb', { name: 'Hades' })
      expect(r.body.match).toEqual({ igdbId: 8, name: 'Hades', main: 22, extra: 46, full: 95, count: 120 }) // exact name beats the first hit
      r = await call('POST', '/api/games/ttb', { name: 'Portal 2', steamAppId: 620 })
      expect(r.body.match).toMatchObject({ igdbId: 72, name: 'Portal 2', main: 8.5, extra: 13, full: 21 })
      expect((await call('POST', '/api/games/ttb', { name: 'Nothing like this' })).body.match).toBe(null)
      expect(tokenCalls).toBe(2) // bad secret + one good token, reused after
      expect(igdbBodies.some((b) => b.includes('search "Hades"'))).toBe(true)

      const saved = JSON.parse(await readFile(join(dataDir, 'games.json'), 'utf8'))
      expect(saved.steam.apiKey).toBe(KEY)
      const health = await (await fetch(`${url}/api/state`)).text()
      expect(health).not.toContain(KEY)
    } finally {
      await srv.close()
    }
  })
})
