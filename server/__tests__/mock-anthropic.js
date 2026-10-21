// A stand-in for the Anthropic Messages API that streams scripted turns the
// way the real API does (SSE events), for tests of the AI relay.
import http from 'node:http'

// respond(body, req) → { blocks: [{ type: 'text', text } | { type: 'thinking', thinking } | { type: 'tool_use', name, input }], stop_reason }
export async function startMockAnthropic(respond) {
  const requests = []
  let n = 0
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', async () => {
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
      requests.push({ url: req.url, headers: req.headers, body })
      const key = req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
      requests.at(-1).key = key
      if (key === 'sk-ant-bad-key-0000000000') {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }))
        return
      }
      const turn = await respond(body, req)
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
      ev('message_start', { message: { id: `msg_${++n}`, type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 0 } } })
      turn.blocks.forEach((b, index) => {
        if (b.type === 'text') {
          ev('content_block_start', { index, content_block: { type: 'text', text: '' } })
          for (const part of b.text.match(/.{1,12}/gs) || ['']) ev('content_block_delta', { index, delta: { type: 'text_delta', text: part } })
        } else if (b.type === 'thinking') {
          ev('content_block_start', { index, content_block: { type: 'thinking', thinking: '', signature: '' } })
          ev('content_block_delta', { index, delta: { type: 'thinking_delta', thinking: b.thinking } })
          ev('content_block_delta', { index, delta: { type: 'signature_delta', signature: 'sig_mock' } })
        } else if (b.type === 'tool_use') {
          ev('content_block_start', { index, content_block: { type: 'tool_use', id: b.id || `toolu_${n}_${index}`, name: b.name, input: {} } })
          const json = JSON.stringify(b.input)
          for (const part of json.match(/.{1,10}/gs)) ev('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: part } })
        }
        ev('content_block_stop', { index })
      })
      ev('message_delta', { delta: { stop_reason: turn.stop_reason || 'end_turn', stop_sequence: null }, usage: { output_tokens: 42 } })
      ev('message_stop', {})
      res.end()
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((r) => server.close(r)) }
}

// Read an SSE response into [{ event, data }].
export async function readSse(res) {
  const text = await res.text()
  return text.split('\n\n').filter((b) => b.startsWith('event:')).map((b) => {
    const [e, d] = b.split('\n')
    return { event: e.slice(7), data: JSON.parse(d.slice(6)) }
  })
}
