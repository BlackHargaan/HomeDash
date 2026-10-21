// Browser side of the AI assistant: settings/token API calls, a reader for
// the server's SSE stream, and the tool-execution step that applies the
// assistant's dashboard actions to live data (with undo).
import { exportAllData, applyExternalChanges } from './storage.js'
import { runTool, needsConfirmation, isReadOnlyTool } from '../../shared/dashboard-tools.js'

async function api(path, init = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

export const aiApi = {
  config: () => api('/api/ai/config'),
  saveConfig: (patch) => api('/api/ai/config', { method: 'PUT', body: patch }),
  ollamaModels: () => api('/api/ai/ollama/models'),
  tokens: () => api('/api/mcp/tokens'),
  createToken: (name, readOnly) => api('/api/mcp/tokens', { method: 'POST', body: { name, readOnly } }),
  revokeToken: (id) => api(`/api/mcp/tokens/${id}`, { method: 'DELETE' }),
}

// One assistant turn. Calls onEvent(event, data) for each streamed event and
// resolves with the final `done` payload.
export async function streamTurn({ provider, history, input, onEvent, signal }) {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ provider, history, input }),
    signal,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `The assistant isn’t available (HTTP ${res.status})`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let done = null
  for (;;) {
    const { value, done: end } = await reader.read()
    if (end) break
    buf += decoder.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const ev = block.match(/^event: (.+)$/m)?.[1]
      const data = block.match(/^data: (.+)$/m)?.[1]
      if (!ev || !data) continue
      const payload = JSON.parse(data)
      if (ev === 'error') throw new Error(payload.message)
      if (ev === 'done') done = payload
      else onEvent?.(ev, payload)
    }
  }
  if (!done) throw new Error('The connection to the assistant was interrupted')
  return done
}

const IMPERATIVE = {
  Added: 'Add', Deleted: 'Delete', Removed: 'Remove', Rewrote: 'Rewrite', Updated: 'Update', Moved: 'Move',
  Created: 'Create', Completed: 'Complete', Reopened: 'Reopen', Changed: 'Change', 'Checked off': 'Check off',
  Unchecked: 'Uncheck', Bookmarked: 'Bookmark', 'Started tracking': 'Start tracking', 'Added to': 'Add to',
}

// Try a tool on the current data without applying it, and describe what it
// would do (for confirmation cards): "Deleted X" → "Delete X".
export function previewTool(name, input) {
  const r = runTool(name, input, { data: exportAllData().data })
  if (!r.ok) return `Can’t do this: ${r.error}`
  const text = r.summary || name
  const verb = Object.keys(IMPERATIVE).sort((a, b) => b.length - a.length).find((v) => text.startsWith(v + ' '))
  return verb ? IMPERATIVE[verb] + text.slice(verb.length) : text
}

// Run a tool against live data and apply its changes.
// → { content (for the model), ok, summary, undo: { key: previousValue } | null }
export function executeTool(name, input) {
  const data = exportAllData().data
  const r = runTool(name, input, { data })
  if (!r.ok) return { ok: false, summary: r.error, content: JSON.stringify({ error: r.error }), undo: null }
  const keys = Object.keys(r.changes)
  let undo = null
  if (keys.length) {
    undo = Object.fromEntries(keys.map((k) => [k, data[k]]))
    applyExternalChanges(r.changes)
  }
  return { ok: true, summary: r.summary, content: JSON.stringify({ ok: true, ...r.result }), undo }
}

export function undoChanges(undo) {
  if (undo) applyExternalChanges(undo)
}

export { needsConfirmation, isReadOnlyTool }

export const TOOL_LABELS = {
  get_overview: 'Looked at your dashboard', list_events: 'Checked your calendar', list_tasks: 'Checked your tasks',
  list_habits: 'Checked your habits', list_kanban: 'Checked your boards', list_notes: 'Looked through your notes', read_note: 'Read a note',
}
