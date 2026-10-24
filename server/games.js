// Game Tracker integrations: your Steam library (playtime) and time-to-beat
// estimates from IGDB. Keys stay on the server, like the AI key.
//
//   GET/PUT /api/games/config          { steam: { apiKey, profile }, igdb: { clientId, clientSecret } } (keys write-only)
//   GET     /api/games/steam/library   owned games with playtime
//   POST    /api/games/ttb { name, steamAppId? }   → { match: { name, igdbId, main, extra, full } | null }
//
// Steam: a free Web API key (steamcommunity.com/dev/apikey) and your profile,
// with "Game details" set to public. IGDB (optional): a Twitch developer app's
// client id and secret (dev.twitch.tv/console) — IGDB's time-to-beat data.
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'

const TIMEOUT = 12_000
const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status, expose: true })
const badRequest = (message) => httpError(400, message)
const hint = (s) => (s ? `…${String(s).slice(-4)}` : null)
const norm = (s) => String(s || '').toLowerCase().replace(/[™®©]/g, '').replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const hours = (sec) => (sec ? Math.max(0.5, Math.round((sec / 3600) * 2) / 2) : null)

export async function createGames({ dataDir, log = () => {}, steamBase = 'https://api.steampowered.com', igdbBase = 'https://api.igdb.com/v4', twitchBase = 'https://id.twitch.tv' }) {
  const file = join(dataDir, 'games.json')
  const stored = await readFile(file, 'utf8').then(JSON.parse).catch(() => ({}))
  const config = {
    steam: { apiKey: '', steamId: '', persona: '', ...(stored.steam || {}) },
    igdb: { clientId: '', clientSecret: '', ...(stored.igdb || {}) },
  }
  let igdbToken = null // { value, expires }

  async function save() {
    const tmp = file + '.tmp'
    await writeFile(tmp, JSON.stringify(config), { mode: 0o600 })
    await rename(tmp, file)
  }

  const steamKey = () => config.steam.apiKey || process.env.STEAM_API_KEY || ''
  const igdbCreds = () => ({
    clientId: config.igdb.clientId || process.env.IGDB_CLIENT_ID || '',
    clientSecret: config.igdb.clientSecret || process.env.IGDB_CLIENT_SECRET || '',
  })

  function publicConfig() {
    const ig = igdbCreds()
    return {
      steam: { configured: !!(steamKey() && config.steam.steamId), hasKey: !!steamKey(), keyHint: hint(steamKey()), steamId: config.steam.steamId || null, persona: config.steam.persona || null },
      igdb: { configured: !!(ig.clientId && ig.clientSecret), clientIdHint: hint(ig.clientId) },
    }
  }

  // ---- Steam

  async function steamGet(path, params, key = steamKey()) {
    if (!key) throw badRequest('Add your Steam Web API key first')
    const url = new URL(path, steamBase)
    url.search = new URLSearchParams({ key, format: 'json', ...params }).toString()
    let res
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
    } catch (e) {
      throw httpError(502, `Can’t reach Steam (${e.cause?.code || e.name})`)
    }
    if (res.status === 401 || res.status === 403) throw httpError(400, 'Steam didn’t accept that API key')
    if (!res.ok) throw httpError(502, `Steam answered ${res.status}`)
    return res.json()
  }

  // A 17-digit SteamID64, a profile URL (/profiles/<id> or /id/<name>), or a custom URL name.
  async function resolveProfile(input, key) {
    const s = String(input || '').trim().replace(/\/+$/, '')
    if (!s) throw badRequest('Enter your Steam profile link or ID')
    const id = s.match(/(?:^|\/profiles\/)(7656\d{13})$/)
    if (id) return id[1]
    const vanity = (s.match(/\/id\/([^/?#]+)$/) || [])[1] || (/^[\w-]{2,64}$/.test(s) ? s : null)
    if (!vanity) throw badRequest('That doesn’t look like a Steam profile link or ID')
    const r = await steamGet('/ISteamUser/ResolveVanityURL/v1/', { vanityurl: vanity }, key)
    if (r?.response?.success !== 1 || !r.response.steamid) throw badRequest(`Couldn’t find a Steam profile called “${vanity}”`)
    return r.response.steamid
  }

  async function library() {
    if (!config.steam.steamId) throw badRequest('Connect your Steam profile first')
    const r = await steamGet('/IPlayerService/GetOwnedGames/v1/', { steamid: config.steam.steamId, include_appinfo: '1', include_played_free_games: '1' })
    const games = r?.response?.games
    if (!Array.isArray(games)) throw httpError(400, 'Steam returned no games. In Steam → Profile → Edit Profile → Privacy Settings, set “Game details” to Public.')
    return {
      steamId: config.steam.steamId,
      persona: config.steam.persona || null,
      games: games.map((g) => ({
        appid: g.appid,
        name: g.name || `App ${g.appid}`,
        min: g.playtime_forever || 0,
        min2w: g.playtime_2weeks || 0,
        last: g.rtime_last_played || 0,
      })),
    }
  }

  // ---- IGDB time to beat

  async function igdbAuth() {
    const { clientId, clientSecret } = igdbCreds()
    if (!clientId || !clientSecret) throw badRequest('Add IGDB (Twitch) credentials to look up time to beat')
    if (igdbToken && igdbToken.expires > Date.now() + 60_000) return { clientId, token: igdbToken.value }
    const url = new URL('/oauth2/token', twitchBase)
    url.search = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }).toString()
    let res
    try {
      res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT) })
    } catch (e) {
      throw httpError(502, `Can’t reach Twitch (${e.cause?.code || e.name})`)
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) throw httpError(400, 'Twitch didn’t accept that IGDB client id / secret')
    if (!res.ok) throw httpError(502, `Twitch answered ${res.status}`)
    const j = await res.json()
    igdbToken = { value: j.access_token, expires: Date.now() + (j.expires_in || 3600) * 1000 }
    return { clientId, token: igdbToken.value }
  }

  async function igdb(endpoint, body) {
    const { clientId, token } = await igdbAuth()
    let res
    try {
      res = await fetch(`${igdbBase}/${endpoint}`, {
        method: 'POST',
        headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'text/plain' },
        body,
        signal: AbortSignal.timeout(TIMEOUT),
      })
    } catch (e) {
      throw httpError(502, `Can’t reach IGDB (${e.cause?.code || e.name})`)
    }
    if (res.status === 401) { igdbToken = null; throw httpError(502, 'IGDB rejected the token — try again') }
    if (!res.ok) throw httpError(502, `IGDB answered ${res.status}`)
    return res.json()
  }

  async function timeToBeat({ name, steamAppId } = {}) {
    const title = String(name || '').trim().slice(0, 200)
    if (!title && !steamAppId) throw badRequest('Expected { name }')
    const ids = []
    if (steamAppId && /^\d+$/.test(String(steamAppId))) {
      // Steam is external source 1 (older API versions call the field "category").
      for (const field of ['external_game_source', 'category']) {
        const ext = await igdb('external_games', `fields game; where uid = "${steamAppId}" & ${field} = 1; limit 1;`).catch(() => [])
        if (ext[0]?.game) { ids.push(ext[0].game); break }
      }
    }
    let found = []
    if (title) {
      found = await igdb('games', `search "${title.replace(/["\\]/g, ' ')}"; fields id,name; limit 10;`)
      ids.push(...found.map((g) => g.id))
    }
    if (!ids.length) return { match: null }
    const unique = [...new Set(ids)]
    const times = await igdb('game_time_to_beats', `fields game_id,hastily,normally,completely,count; where game_id = (${unique.join(',')}); limit 50;`)
    const byId = new Map(times.map((t) => [t.game_id, t]))
    const named = new Map(found.map((g) => [g.id, g.name]))
    // Prefer the Steam link, then an exact name match, then the first search hit — with data.
    const order = [...unique].sort((a, b) => {
      const rank = (id) => (id === unique[0] && steamAppId ? 0 : norm(named.get(id)) === norm(title) ? 1 : 2)
      return rank(a) - rank(b)
    })
    const id = order.find((x) => byId.has(x))
    if (id == null) return { match: null }
    const t = byId.get(id)
    let gameName = named.get(id)
    if (!gameName) gameName = (await igdb('games', `fields name; where id = ${id};`).catch(() => []))[0]?.name || title
    return { match: { igdbId: id, name: gameName, main: hours(t.hastily), extra: hours(t.normally), full: hours(t.completely), count: t.count || 0 } }
  }

  async function updateConfig(patch = {}) {
    const s = patch.steam || {}
    if (s.apiKey !== undefined) {
      const k = String(s.apiKey).trim()
      if (k && !/^[A-Fa-f0-9]{32}$/.test(k)) throw badRequest('A Steam Web API key is 32 letters and numbers (0–9, A–F)')
      config.steam.apiKey = k.toUpperCase()
    }
    if (s.profile !== undefined) {
      if (!String(s.profile).trim()) {
        config.steam.steamId = ''
        config.steam.persona = ''
      } else {
        const id = await resolveProfile(s.profile, steamKey())
        const p = await steamGet('/ISteamUser/GetPlayerSummaries/v2/', { steamids: id }).catch(() => null)
        config.steam.steamId = id
        config.steam.persona = p?.response?.players?.[0]?.personaname || ''
      }
    }
    const i = patch.igdb || {}
    if (i.clientId !== undefined) config.igdb.clientId = String(i.clientId).trim()
    if (i.clientSecret !== undefined) config.igdb.clientSecret = String(i.clientSecret).trim()
    if (i.clientId !== undefined || i.clientSecret !== undefined) {
      igdbToken = null
      if (config.igdb.clientId && config.igdb.clientSecret) await igdbAuth() // check them now
    }
    await save()
    log('games config updated')
    return publicConfig()
  }

  return { publicConfig, updateConfig, library, timeToBeat }
}
