// HomeDash as an MCP server, so AI apps (Claude Desktop, Claude Code, other
// MCP clients) can read and update the dashboard.
//
// Transport: MCP "Streamable HTTP" at POST /mcp, answering with plain JSON
// (no server-initiated streams). Each client authenticates with a bearer
// token created in Settings → AI; tokens can be read-only. The tools are the
// same dashboard actions the in-app Assistant uses (shared/dashboard-tools.js),
// applied to the dashboard copy stored on the server; open HomeDash tabs pick
// the change up on their next sync.
import crypto from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { toolDefinitions, runTool, needsConfirmation } from '../shared/dashboard-tools.js'

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const MAX_TOKENS = 20
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

const TITLES = {
  get_overview: 'Dashboard overview', list_events: 'List calendar events', create_event: 'Create event',
  update_event: 'Update event', delete_event: 'Delete event', list_tasks: 'List tasks', create_task: 'Create task',
  update_task: 'Update task', delete_task: 'Delete task', list_habits: 'List habits', create_habit: 'Create habit',
  set_habit_done: 'Check off habit', list_kanban: 'List kanban boards', add_kanban_card: 'Add kanban card',
  move_kanban_card: 'Move kanban card', delete_kanban_card: 'Delete kanban card', list_notes: 'List notes',
  read_note: 'Read note', write_note: 'Write note', add_bookmark: 'Add bookmark', add_widget: 'Add widget',
  remove_widget: 'Remove widget',
}

const INSTRUCTIONS = 'HomeDash is the user’s personal dashboard: calendar, tasks, habits, kanban boards, notebook and bookmarks. ' +
  'Times are the user’s local wall-clock time as "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD"); call get_overview for the current date and time. ' +
  'Look items up with the list_* tools before changing them, and confirm with the user before deleting anything.'

export async function createMcp({ dataDir, store, version = '0.0.0', log = () => {} }) {
  const file = join(dataDir, 'mcp.json')
  let tokens = await readFile(file, 'utf8').then((t) => JSON.parse(t).tokens || []).catch(() => [])

  async function save() {
    const tmp = file + '.tmp'
    await writeFile(tmp, JSON.stringify({ tokens }), { mode: 0o600 })
    await rename(tmp, file)
  }

  const publicToken = ({ hash: _h, ...t }) => t

  // ------------------------------------------------------------ token management (cookie-authenticated API)

  const listTokens = () => tokens.map(publicToken)

  async function createToken({ name, readOnly } = {}) {
    if (tokens.length >= MAX_TOKENS) throw Object.assign(new Error('Too many tokens — revoke an old one first'), { statusCode: 400, expose: true })
    const secret = 'hdmcp_' + crypto.randomBytes(24).toString('base64url')
    const entry = {
      id: crypto.randomBytes(6).toString('hex'),
      name: String(name || 'MCP client').trim().slice(0, 60) || 'MCP client',
      readOnly: !!readOnly,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      hint: secret.slice(-4),
      hash: sha256(secret),
    }
    tokens = [...tokens, entry]
    await save()
    return { ...publicToken(entry), token: secret } // the only time the secret is shown
  }

  async function revokeToken(id) {
    const before = tokens.length
    tokens = tokens.filter((t) => t.id !== id)
    if (tokens.length !== before) await save()
    return { ok: true }
  }

  function authenticate(req) {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i)
    if (!m) return null
    const hash = sha256(m[1])
    const t = tokens.find((x) => crypto.timingSafeEqual(Buffer.from(x.hash), Buffer.from(hash)))
    if (t) {
      const now = Date.now()
      if (!t.lastUsed || now - Date.parse(t.lastUsed) > 60_000) { t.lastUsed = new Date(now).toISOString(); save().catch(() => {}) }
    }
    return t || null
  }

  // ------------------------------------------------------------ running tools on the stored dashboard

  let queue = Promise.resolve()
  function callTool(name, args, readOnly) {
    const run = queue.then(async () => {
      const stored = await store.get()
      const data = stored?.data || {}
      // Evaluate local times in the user's zone (the server may run in UTC).
      if (typeof data.timezone === 'string' && validZone(data.timezone)) process.env.TZ = data.timezone
      const r = runTool(name, args, { data, now: new Date(), readOnly })
      if (r.ok && Object.keys(r.changes).length) await store.put({ ...data, ...r.changes })
      return r
    })
    queue = run.catch(() => {})
    return run
  }

  function mcpTools(readOnly) {
    return toolDefinitions({ readOnly }).map((t) => ({
      name: t.name,
      title: TITLES[t.name],
      description: t.description,
      inputSchema: t.input_schema,
      annotations: {
        title: TITLES[t.name],
        readOnlyHint: t.readOnly,
        destructiveHint: !t.readOnly && needsConfirmation(t.name, t.name === 'write_note' ? { mode: 'replace' } : {}),
        openWorldHint: false,
      },
    }))
  }

  // ------------------------------------------------------------ JSON-RPC

  async function dispatch(msg, token, session) {
    const { id, method, params } = msg
    const isRequest = id !== undefined && id !== null
    const reply = (result) => (isRequest ? { jsonrpc: '2.0', id, result } : null)
    const error = (code, message) => (isRequest ? { jsonrpc: '2.0', id, error: { code, message } } : null)

    if (msg.jsonrpc !== '2.0' || typeof method !== 'string') return isRequest ? error(-32600, 'Invalid Request') : null
    switch (method) {
      case 'initialize': {
        const wanted = params?.protocolVersion
        session.protocolVersion = PROTOCOL_VERSIONS.includes(wanted) ? wanted : PROTOCOL_VERSIONS[0]
        return reply({
          protocolVersion: session.protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'homedash', title: 'HomeDash', version },
          instructions: INSTRUCTIONS,
        })
      }
      case 'ping':
        return reply({})
      case 'tools/list':
        return reply({ tools: mcpTools(token.readOnly) })
      case 'tools/call': {
        const name = params?.name
        if (typeof name !== 'string') return error(-32602, 'Missing tool name')
        if (!toolDefinitions().some((t) => t.name === name)) return error(-32602, `Unknown tool: ${name}`)
        const r = await callTool(name, params.arguments || {}, token.readOnly)
        log('info', `mcp: ${token.name} called ${name}${r.ok ? '' : ' (error)'}`)
        if (!r.ok) return reply({ content: [{ type: 'text', text: r.error }], isError: true })
        const text = (r.summary ? r.summary + '\n\n' : '') + JSON.stringify(r.result, null, 2)
        return reply({ content: [{ type: 'text', text }], structuredContent: r.result, isError: false })
      }
      default:
        if (method.startsWith('notifications/')) return null
        return error(-32601, `Method not found: ${method}`)
    }
  }

  // POST /mcp (GET/DELETE: no server-initiated stream or sessions)
  async function handle(req, res, readBody) {
    const origin = req.headers.origin
    if (origin) {
      // DNS-rebinding guard: browsers may only call from this same host.
      let ok = false
      try { ok = new URL(origin).host === req.headers.host } catch { /* bad origin */ }
      if (!ok) return send(res, 403, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Origin not allowed' } })
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' }).end()
      return
    }
    const token = authenticate(req)
    if (!token) {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer realm="HomeDash MCP"', 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Missing or invalid token — create one in HomeDash Settings → AI assistant' } }))
      return
    }
    let body
    try { body = await readBody(req) } catch (e) {
      return send(res, e.statusCode || 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: e.message } })
    }
    if (body == null) return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    const session = {}
    const msgs = Array.isArray(body) ? body : [body]
    const replies = []
    for (const m of msgs) {
      const r = await dispatch(m || {}, token, session)
      if (r) replies.push(r)
    }
    if (!replies.length) { res.writeHead(202).end(); return }
    const headers = session.protocolVersion ? { 'MCP-Protocol-Version': session.protocolVersion } : {}
    send(res, 200, Array.isArray(body) ? replies : replies[0], headers)
  }

  return { handle, listTokens, createToken, revokeToken }
}

function validZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

function send(res, status, body, headers = {}) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store', ...headers })
  res.end(text)
}
