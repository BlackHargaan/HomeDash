// AI chat relay for the in-app Assistant.
//
// The server holds the provider settings (the Anthropic API key never leaves
// it) and streams each model turn to the browser as Server-Sent Events. It is
// stateless: the browser keeps the conversation in the provider's own message
// format, sends it with every turn, and runs the dashboard tools itself — on
// its live data — then sends the results back as the next turn.
//
//   POST /api/ai/chat { provider, history, input }
//     input = { type: 'user', text, context } | { type: 'tool_results', results: [{ id, name, content, isError }] }
//   → SSE: thinking / text / tool / reset / done { appended, toolCalls, stopReason, usage } / error
import Anthropic from '@anthropic-ai/sdk'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { toolDefinitions, SYSTEM_PROMPT } from '../shared/dashboard-tools.js'

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'most capable', fallback: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'faster, about half the cost', fallback: true },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'fastest and cheapest', fallback: false },
]
const EFFORTS = ['low', 'medium', 'high']
const DEFAULTS = {
  provider: 'claude',
  claude: { apiKey: '', model: 'claude-opus-5-5', effort: 'medium' },
  ollama: { url: process.env.HOMEDASH_OLLAMA_URL || 'http://localhost:11434', model: '' },
}
const MAX_TOKENS = 64000
const MAX_JSON_RETRIES = 2

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400, expose: true })

export async function createAi({ dataDir, log = () => {}, anthropicOptions = {} }) {
  const file = join(dataDir, 'ai.json')
  let config = await readFile(file, 'utf8').then(JSON.parse).catch(() => ({}))
  config = {
    provider: config.provider || DEFAULTS.provider,
    claude: { ...DEFAULTS.claude, ...(config.claude || {}) },
    ollama: { ...DEFAULTS.ollama, ...(config.ollama || {}) },
  }

  async function save() {
    const tmp = file + '.tmp'
    await writeFile(tmp, JSON.stringify(config), { mode: 0o600 })
    await rename(tmp, file)
  }

  const envKey = () => process.env.ANTHROPIC_API_KEY || ''
  const claudeKey = () => config.claude.apiKey || envKey()

  // What the browser may see — never the key itself.
  function publicConfig() {
    const key = claudeKey()
    return {
      provider: config.provider,
      claude: {
        configured: !!key,
        keySource: config.claude.apiKey ? 'settings' : envKey() ? 'environment' : null,
        keyHint: key ? `…${key.slice(-4)}` : null,
        model: config.claude.model,
        effort: config.claude.effort,
        models: CLAUDE_MODELS,
      },
      ollama: { url: config.ollama.url, model: config.ollama.model, configured: !!config.ollama.model },
    }
  }

  async function updateConfig(patch = {}) {
    if (patch.provider !== undefined) {
      if (!['claude', 'ollama'].includes(patch.provider)) throw badRequest('provider must be "claude" or "ollama"')
      config.provider = patch.provider
    }
    const c = patch.claude || {}
    if (c.apiKey !== undefined) {
      const k = String(c.apiKey).trim()
      if (k && !/^sk-ant-[\w-]{10,}$/.test(k)) throw badRequest('That doesn’t look like an Anthropic API key (it starts with sk-ant-)')
      config.claude.apiKey = k
    }
    if (c.model !== undefined) {
      if (!CLAUDE_MODELS.some((m) => m.id === c.model)) throw badRequest('Unknown Claude model')
      config.claude.model = c.model
    }
    if (c.effort !== undefined) {
      if (!EFFORTS.includes(c.effort)) throw badRequest('effort must be low, medium or high')
      config.claude.effort = c.effort
    }
    const o = patch.ollama || {}
    if (o.url !== undefined) {
      const u = String(o.url).trim().replace(/\/+$/, '')
      if (u && !/^https?:\/\/[^\s]+$/i.test(u)) throw badRequest('Ollama address must start with http:// or https://')
      config.ollama.url = u || DEFAULTS.ollama.url
    }
    if (o.model !== undefined) config.ollama.model = String(o.model).trim().slice(0, 200)
    await save()
    return publicConfig()
  }

  async function ollamaModels() {
    const res = await fetch(`${config.ollama.url}/api/tags`, { signal: AbortSignal.timeout(5000) }).catch((e) => {
      throw Object.assign(new Error(`Can’t reach Ollama at ${config.ollama.url} (${e.cause?.code || e.message})`), { statusCode: 502, expose: true })
    })
    if (!res.ok) throw Object.assign(new Error(`Ollama answered ${res.status}`), { statusCode: 502, expose: true })
    const body = await res.json()
    return { models: (body.models || []).map((m) => m.name) }
  }

  // ------------------------------------------------------------ SSE plumbing

  function openStream(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // let reverse proxies pass tokens through immediately
    })
    const controller = new AbortController()
    res.on('close', () => controller.abort())
    const send = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
    const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': keep-alive\n\n') }, 15000)
    const end = () => { clearInterval(heartbeat); if (!res.writableEnded) res.end() }
    return { send, end, signal: controller.signal }
  }

  async function chat(req, res, body) {
    const provider = body?.provider || config.provider
    const history = Array.isArray(body?.history) ? body.history : null
    const input = body?.input
    if (!history) throw badRequest('Expected history: []')
    if (!input || !['user', 'tool_results'].includes(input.type)) throw badRequest('Expected input of type "user" or "tool_results"')
    if (input.type === 'user' && !String(input.text || '').trim()) throw badRequest('Message is empty')
    if (input.type === 'tool_results' && !Array.isArray(input.results)) throw badRequest('Expected results: []')
    if (provider === 'claude' && !claudeKey()) throw badRequest('Add an Anthropic API key in Settings → AI assistant first')
    if (provider === 'ollama' && !config.ollama.model) throw badRequest('Pick an Ollama model in Settings → AI assistant first')
    if (!['claude', 'ollama'].includes(provider)) throw badRequest('Unknown provider')

    const stream = openStream(req, res)
    try {
      if (provider === 'claude') await chatClaude(history, input, stream)
      else await chatOllama(history, input, stream)
    } catch (e) {
      if (!stream.signal.aborted) {
        log('error', 'ai chat', e?.message || e)
        stream.send('error', { message: describeError(e) })
      }
    } finally {
      stream.end()
    }
  }

  // ------------------------------------------------------------ Claude

  function claudeTools() {
    // Streamed requests with client tools: let large inputs (note text) stream
    // as generated. The browser validates every input before running a tool.
    return toolDefinitions().map(({ name, description, input_schema }) => ({ name, description, input_schema, eager_input_streaming: true }))
  }

  async function chatClaude(history, input, { send, signal }) {
    const client = new Anthropic({ apiKey: claudeKey(), ...anthropicOptions })
    const model = config.claude.model
    const supportsFallback = CLAUDE_MODELS.find((m) => m.id === model)?.fallback
    const toolResults = (results) => (results || []).map((r) => ({
      type: 'tool_result', tool_use_id: String(r.id), content: String(r.content ?? ''), ...(r.isError ? { is_error: true } : {}),
    }))
    // A user message may first carry results still owed from an interrupted turn.
    const newMessage = input.type === 'user'
      ? {
          role: 'user',
          content: [
            ...toolResults(input.results),
            ...[{ type: 'text', text: String(input.context || '') }, { type: 'text', text: String(input.text) }].filter((b) => b.text),
          ],
        }
      : { role: 'user', content: toolResults(input.results) }
    const params = {
      model,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: claudeTools(),
      messages: [...history, newMessage],
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: config.claude.effort },
      cache_control: { type: 'ephemeral' }, // also cache the growing conversation
      // A safety-classifier decline is retried server-side on the model
      // Anthropic recommends for that category, instead of failing the turn.
      ...(supportsFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    }

    let message
    for (let attempt = 0; ; attempt++) {
      const stream = client.beta.messages.stream(params, { signal })
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'thinking') send('thinking', { delta: '' })
            if (event.content_block.type === 'tool_use') send('tool', { name: event.content_block.name })
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') send('text', { delta: event.delta.text })
            else if (event.delta.type === 'thinking_delta') send('thinking', { delta: event.delta.thinking })
          }
        }
        message = await stream.finalMessage()
        break
      } catch (err) {
        // With eager input streaming, a tool input the SDK can't parse at all
        // rejects here; re-issue the turn. API errors are real failures.
        if (err instanceof Anthropic.APIError || signal.aborted || attempt >= MAX_JSON_RETRIES) throw err
        log('info', 'ai: unparseable tool input, re-issuing the turn')
        send('reset', {})
      }
    }

    const usage = { input: message.usage?.input_tokens, output: message.usage?.output_tokens, cacheRead: message.usage?.cache_read_input_tokens, model: message.model }
    // Tool results must stay in the history even if this turn is discarded.
    const keepInput = input.type === 'tool_results' || input.results?.length
      ? [{ role: 'user', content: newMessage.content.filter((b) => b.type === 'tool_result') }]
      : []

    if (message.stop_reason === 'refusal') {
      // Discard the partial turn; tool results must stay so the history remains valid.
      send('done', { appended: keepInput, toolCalls: [], stopReason: 'refusal', usage })
      return
    }
    const toolCalls = message.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input }))
    if (message.stop_reason === 'max_tokens' && toolCalls.length) {
      send('done', { appended: keepInput, toolCalls: [], stopReason: 'max_tokens', usage })
      return
    }
    send('done', {
      appended: [newMessage, { role: 'assistant', content: message.content }],
      toolCalls: message.stop_reason === 'tool_use' ? toolCalls : [],
      stopReason: message.stop_reason,
      usage,
    })
  }

  // ------------------------------------------------------------ Ollama (local models)

  async function chatOllama(history, input, { send, signal }) {
    const toolMessages = (results) => (results || []).map((r) => ({ role: 'tool', tool_name: String(r.name || ''), content: String(r.content ?? '') }))
    const newMessages = input.type === 'user'
      ? [...toolMessages(input.results), { role: 'user', content: [input.context, input.text].filter(Boolean).join('\n') }]
      : toolMessages(input.results)
    const res = await fetch(`${config.ollama.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: config.ollama.model,
        stream: true,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history, ...newMessages],
        tools: toolDefinitions().map(({ name, description, input_schema }) => ({ type: 'function', function: { name, description, parameters: input_schema } })),
      }),
    }).catch((e) => {
      if (signal.aborted) throw e
      throw new Error(`Can’t reach Ollama at ${config.ollama.url} (${e.cause?.code || e.message})`)
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Ollama: ${(() => { try { return JSON.parse(text).error } catch { return text.slice(0, 200) } })() || `HTTP ${res.status}`}`)
    }

    let content = ''
    const calls = []
    let stats = {}
    const decoder = new TextDecoder()
    let buf = ''
    const handle = (line) => {
      if (!line.trim()) return
      const chunk = JSON.parse(line)
      if (chunk.error) throw new Error(`Ollama: ${chunk.error}`)
      const m = chunk.message || {}
      if (m.thinking) send('thinking', { delta: m.thinking })
      if (m.content) { content += m.content; send('text', { delta: m.content }) }
      for (const c of m.tool_calls || []) {
        calls.push(c)
        send('tool', { name: c.function?.name })
      }
      if (chunk.done) stats = { input: chunk.prompt_eval_count, output: chunk.eval_count, model: chunk.model }
    }
    for await (const part of res.body) {
      buf += decoder.decode(part, { stream: true })
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, nl)); buf = buf.slice(nl + 1) }
    }
    handle(buf)

    const assistant = { role: 'assistant', content }
    if (calls.length) assistant.tool_calls = calls
    const toolCalls = calls.map((c, i) => {
      let args = c.function?.arguments ?? {}
      if (typeof args === 'string') { try { args = JSON.parse(args) } catch { args = { __invalid: args } } }
      return { id: `call_${Date.now().toString(36)}_${i}`, name: c.function?.name, input: args }
    })
    send('done', { appended: [...newMessages, assistant], toolCalls, stopReason: calls.length ? 'tool_use' : 'end_turn', usage: stats })
  }

  return { publicConfig, updateConfig, ollamaModels, chat }
}

function describeError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'Anthropic rejected the API key — check it in Settings → AI assistant.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'This API key isn’t allowed to use that model.'
  if (e instanceof Anthropic.RateLimitError) return 'Anthropic’s rate limit was hit — wait a moment and try again.'
  if (e instanceof Anthropic.BadRequestError) return `Anthropic couldn’t process the request: ${e.message}`
  if (e instanceof Anthropic.APIConnectionError) return 'Couldn’t reach Anthropic — check the server’s internet connection.'
  if (e instanceof Anthropic.APIError) return `Anthropic error ${e.status ?? ''}: ${e.message}`.trim()
  return e?.message || 'Something went wrong'
}
