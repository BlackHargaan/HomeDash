import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from '../app.js'
import { startMockAnthropic, readSse } from './mock-anthropic.js'

const KEY = 'sk-ant-test-key-0123456789'
let app, mock, ollama
afterEach(async () => {
  await app?.close(); app = null
  await mock?.close(); mock = null
  await new Promise((r) => (ollama ? ollama.close(r) : r())); ollama = null
})

async function boot(opts = {}) {
  app = await startServer({ port: 0, host: '127.0.0.1', dataDir: mkdtempSync(join(tmpdir(), 'hd-ai-')), ...opts })
  const base = `http://127.0.0.1:${app.port}`
  const call = (path, method = 'GET', body, headers = {}) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined,
  })
  const json = async (...a) => { const r = await call(...a); return { status: r.status, body: await r.json() } }
  return { base, call, json }
}

describe('AI assistant relay', () => {
  it('keeps the key server-side and validates settings', async () => {
    const { json } = await boot()
    let cfg = (await json('/api/ai/config')).body
    expect(cfg.claude).toMatchObject({ configured: false, model: 'claude-opus-5-5', effort: 'medium' })
    expect((await json('/api/ai/config', 'PUT', { claude: { apiKey: 'nope' } })).status).toBe(400)
    expect((await json('/api/ai/config', 'PUT', { claude: { model: 'gpt-4' } })).status).toBe(400)
    cfg = (await json('/api/ai/config', 'PUT', { claude: { apiKey: KEY, model: 'claude-sonnet-5-5', effort: 'low' } })).body
    expect(cfg.claude).toMatchObject({ configured: true, keySource: 'settings', keyHint: '…6789', model: 'claude-sonnet-5-5', effort: 'low' })
    expect(JSON.stringify(cfg)).not.toContain(KEY)
    expect((await json('/api/ai/chat', 'POST', { provider: 'ollama', history: [], input: { type: 'user', text: 'hi' } })).body.error).toMatch(/Ollama model/)
  })

  it('streams a Claude turn with tools, then continues after tool results', async () => {
    mock = await startMockAnthropic((body) => {
      const last = body.messages.at(-1)
      if (last.content.some((b) => b.type === 'tool_result')) return { blocks: [{ type: 'text', text: 'Done — added “Buy milk” for tomorrow.' }] }
      return { blocks: [{ type: 'thinking', thinking: 'Need create_task.' }, { type: 'text', text: 'Adding it.' }, { type: 'tool_use', id: 'toolu_1', name: 'create_task', input: { title: 'Buy milk', due: '2026-10-22' } }], stop_reason: 'tool_use' }
    })
    const { call, json } = await boot({ anthropicOptions: { baseURL: mock.url } })
    await json('/api/ai/config', 'PUT', { claude: { apiKey: KEY } })

    let res = await call('/api/ai/chat', 'POST', { provider: 'claude', history: [], input: { type: 'user', text: 'Remind me to buy milk tomorrow', context: '[Now: Wed 2026-10-21 09:30]' } })
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/)
    let events = await readSse(res)
    expect(events.filter((e) => e.event === 'text').map((e) => e.data.delta).join('')).toBe('Adding it.')
    expect(events.some((e) => e.event === 'thinking' && e.data.delta === 'Need create_task.')).toBe(true)
    expect(events.some((e) => e.event === 'tool' && e.data.name === 'create_task')).toBe(true)
    let done = events.find((e) => e.event === 'done').data
    expect(done.stopReason).toBe('tool_use')
    expect(done.toolCalls).toEqual([{ id: 'toolu_1', name: 'create_task', input: { title: 'Buy milk', due: '2026-10-22' } }])
    expect(done.appended).toHaveLength(2)
    expect(done.appended[0].content.map((b) => b.text)).toEqual(['[Now: Wed 2026-10-21 09:30]', 'Remind me to buy milk tomorrow'])
    expect(done.appended[1].content.find((b) => b.type === 'thinking').signature).toBe('sig_mock')

    // What reached the API
    const sent = mock.requests[0]
    expect(sent.key).toBe(KEY)
    expect(sent.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01')
    expect(sent.body).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: 'medium' } })
    expect(sent.body.tools.find((t) => t.name === 'create_task')).toMatchObject({ eager_input_streaming: true })
    expect(sent.body.system[0].cache_control).toEqual({ type: 'ephemeral' })

    // Second turn: tool results; the history (including thinking) is sent back unchanged.
    const history = done.appended
    res = await call('/api/ai/chat', 'POST', { provider: 'claude', history, input: { type: 'tool_results', results: [{ id: 'toolu_1', name: 'create_task', content: '{"ok":true}' }] } })
    events = await readSse(res)
    done = events.find((e) => e.event === 'done').data
    expect(done).toMatchObject({ stopReason: 'end_turn', toolCalls: [] })
    expect(done.appended[0].content[0]).toEqual({ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"ok":true}' })
    expect(mock.requests[1].body.messages).toHaveLength(3)
    expect(mock.requests[1].body.messages[1].content[0]).toMatchObject({ type: 'thinking', signature: 'sig_mock' })
  })

  it('reports a rejected key as a readable error', async () => {
    mock = await startMockAnthropic(() => ({ blocks: [{ type: 'text', text: 'x' }] }))
    const { call, json } = await boot({ anthropicOptions: { baseURL: mock.url, maxRetries: 0 } })
    await json('/api/ai/config', 'PUT', { claude: { apiKey: 'sk-ant-bad-key-0000000000', model: 'claude-haiku-5-5' } })
    const events = await readSse(await call('/api/ai/chat', 'POST', { history: [], input: { type: 'user', text: 'hi' } }))
    expect(events.at(-1)).toEqual({ event: 'error', data: { message: expect.stringMatching(/rejected the API key/) } })
    expect(mock.requests[0].body.fallbacks).toBeUndefined() // no server-side fallback for Haiku
  })

  it('talks to a local Ollama model with tools', async () => {
    const seen = []
    ollama = http.createServer((req, res) => {
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }, { name: 'llama3.2' }] }))
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks))
        seen.push(body)
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
        const tool = body.messages.at(-1).role === 'tool'
        if (tool) {
          res.write(JSON.stringify({ message: { role: 'assistant', content: 'You have ' }, done: false }) + '\n')
          res.end(JSON.stringify({ message: { role: 'assistant', content: '1 task.' }, done: true, prompt_eval_count: 50, eval_count: 5 }) + '\n')
        } else {
          res.end(JSON.stringify({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'list_tasks', arguments: { status: 'open' } } }] }, done: true }) + '\n')
        }
      })
    })
    await new Promise((r) => ollama.listen(0, '127.0.0.1', r))
    const { call, json } = await boot()
    const url = `http://127.0.0.1:${ollama.address().port}`
    await json('/api/ai/config', 'PUT', { provider: 'ollama', ollama: { url: url + '/', model: 'qwen3:8b' } })
    expect((await json('/api/ai/ollama/models')).body.models).toEqual(['qwen3:8b', 'llama3.2'])

    let events = await readSse(await call('/api/ai/chat', 'POST', { history: [], input: { type: 'user', text: 'what tasks do I have?', context: '[Now]' } }))
    let done = events.find((e) => e.event === 'done').data
    expect(done.toolCalls).toEqual([{ id: expect.stringMatching(/^call_/), name: 'list_tasks', input: { status: 'open' } }])
    expect(seen[0].tools.find((t) => t.function.name === 'list_tasks').function.parameters.type).toBe('object')
    expect(seen[0].messages[0].role).toBe('system')

    events = await readSse(await call('/api/ai/chat', 'POST', { history: done.appended, input: { type: 'tool_results', results: [{ id: done.toolCalls[0].id, name: 'list_tasks', content: '{"tasks":[1]}' }] } }))
    done = events.find((e) => e.event === 'done').data
    expect(events.filter((e) => e.event === 'text').map((e) => e.data.delta).join('')).toBe('You have 1 task.')
    expect(seen[1].messages.at(-1)).toEqual({ role: 'tool', tool_name: 'list_tasks', content: '{"tasks":[1]}' })
    expect(done.appended.at(-1)).toEqual({ role: 'assistant', content: 'You have 1 task.' })
  })
})

describe('MCP endpoint', () => {
  async function rpc(base, token, body, extra = {}) {
    const r = await fetch(base + '/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
      body: JSON.stringify(body),
    })
    return { status: r.status, headers: r.headers, body: r.status === 202 ? null : await r.json() }
  }

  it('lets token holders list and call dashboard tools on the stored dashboard', async () => {
    const { base, json } = await boot({ password: 'pw' })
    // Token management needs the dashboard sign-in.
    expect((await json('/api/mcp/tokens', 'POST', { name: 'x' })).status).toBe(401)
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'pw' }) })
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const authed = (path, method, body) => json(path, method, body, { Cookie: cookie })

    const { body: created } = await authed('/api/mcp/tokens', 'POST', { name: 'Claude Desktop' })
    expect(created.token).toMatch(/^hdmcp_/)
    const { body: ro } = await authed('/api/mcp/tokens', 'POST', { name: 'Reader', readOnly: true })
    const listed = (await authed('/api/mcp/tokens')).body.tokens
    expect(listed.map((t) => t.name)).toEqual(['Claude Desktop', 'Reader'])
    expect(JSON.stringify(listed)).not.toContain(created.token)

    // Seed the stored dashboard as a browser would.
    await authed('/api/state', 'PUT', { data: { tasks: [{ id: 't1', title: 'Pay rent', done: false, due: '2026-10-25', priority: 'high' }], timezone: 'UTC' } })

    expect((await rpc(base, null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).status).toBe(401)
    expect((await rpc(base, 'hdmcp_wrong', { jsonrpc: '2.0', id: 1, method: 'ping' })).status).toBe(401)
    expect((await rpc(base, created.token, { jsonrpc: '2.0', id: 1, method: 'ping' }, { Origin: 'https://evil.example' })).status).toBe(403)

    const init = await rpc(base, created.token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })
    expect(init.body.result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'homedash' }, capabilities: { tools: {} } })
    expect((await rpc(base, created.token, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)

    const tools = (await rpc(base, created.token, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).body.result.tools
    expect(tools.find((t) => t.name === 'create_task')).toMatchObject({ annotations: { readOnlyHint: false, destructiveHint: false } })
    expect(tools.find((t) => t.name === 'delete_task').annotations.destructiveHint).toBe(true)
    expect(tools.find((t) => t.name === 'list_tasks').inputSchema.type).toBe('object')

    const add = await rpc(base, created.token, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_task', arguments: { title: 'Renew passport', due: '2026-11-01' } } })
    expect(add.body.result.isError).toBe(false)
    expect(add.body.result.content[0].text).toMatch(/^Added task “Renew passport” \(due 2026-11-01\)/)
    const state = (await authed('/api/state')).body
    expect(state.data.tasks.map((t) => t.title)).toEqual(['Pay rent', 'Renew passport'])

    const bad = await rpc(base, created.token, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'update_task', arguments: { id: 'nope', done: true } } })
    expect(bad.body.result).toMatchObject({ isError: true, content: [{ type: 'text', text: expect.stringMatching(/No task/) }] })
    expect((await rpc(base, created.token, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope' } })).body.error.code).toBe(-32602)
    expect((await rpc(base, created.token, { jsonrpc: '2.0', id: 6, method: 'resources/list' })).body.error.code).toBe(-32601)

    // Read-only tokens only see and run read tools.
    const roTools = (await rpc(base, ro.token, { jsonrpc: '2.0', id: 7, method: 'tools/list' })).body.result.tools
    expect(roTools.every((t) => t.annotations.readOnlyHint)).toBe(true)
    const denied = await rpc(base, ro.token, { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'create_task', arguments: { title: 'x' } } })
    expect(denied.body.result.isError).toBe(true)
    const read = await rpc(base, ro.token, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'list_tasks', arguments: {} } })
    expect(read.body.result.structuredContent.tasks).toHaveLength(2)

    // Revoked tokens stop working.
    await authed(`/api/mcp/tokens/${created.id}`, 'DELETE')
    expect((await rpc(base, created.token, { jsonrpc: '2.0', id: 10, method: 'ping' })).status).toBe(401)
  })
})
