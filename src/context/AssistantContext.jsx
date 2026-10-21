import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useServer } from './ServerContext.jsx'
import { readStore, writeStore, uid } from '../lib/storage.js'
import { aiApi, streamTurn, executeTool, previewTool, undoChanges, needsConfirmation, isReadOnlyTool, TOOL_LABELS } from '../lib/assistant.js'
import { contextLine } from '../../shared/dashboard-tools.js'

// One assistant conversation shared by the Assistant widget and the ✨ panel.
// The browser drives the loop: send a turn → stream the reply → run any
// dashboard tools on live data (asking first for deletes and big batches) →
// send the results back → repeat until the model answers.

const STORE = 'sync:assistant' // device-local: never synced or exported
const MAX_STEPS = 16
const BATCH_CONFIRM = 5 // more write actions than this in one reply → ask first

const AssistantContext = createContext(null)
const empty = () => ({ provider: null, history: [], items: [], owed: [] })

export function AssistantProvider({ children }) {
  const { status } = useServer()
  const [config, setConfig] = useState(null) // public AI config from the server
  const [configError, setConfigError] = useState(null)
  const [convo, setConvo] = useState(() => ({ ...empty(), ...readStore(STORE, {}) }))
  const [busy, setBusy] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const convoRef = useRef(convo)
  convoRef.current = convo
  const abortRef = useRef(null)
  const decisionRef = useRef(null)

  useEffect(() => { writeStore(STORE, { ...convo, items: convo.items.slice(-200) }) }, [convo])

  const refreshConfig = useCallback(async () => {
    if (status !== 'ready') return
    try { setConfig(await aiApi.config()); setConfigError(null) } catch (e) { setConfigError(e.message) }
  }, [status])
  useEffect(() => { refreshConfig() }, [refreshConfig])

  const provider = config?.provider || 'claude'
  const ready = status === 'ready' && !!config && (provider === 'claude' ? config.claude.configured : config.ollama.configured)

  const patchItem = (itemId, fn) => setConvo((c) => ({ ...c, items: c.items.map((it) => (it.id === itemId ? fn(it) : it)) }))
  const patchTool = (itemId, toolId, patch) =>
    patchItem(itemId, (it) => ({ ...it, tools: it.tools.map((t) => (t.id === toolId ? { ...t, ...patch } : t)) }))

  const decide = useCallback((approved) => {
    decisionRef.current?.(approved)
    decisionRef.current = null
  }, [])

  const send = useCallback(async (text) => {
    const message = text.trim()
    if (!message || busy) return
    // A different provider can't continue the other's history.
    let base = convoRef.current
    if (base.provider && base.provider !== provider) base = empty()
    const userItem = { id: uid('m'), role: 'user', text: message }
    const reply = { id: uid('m'), role: 'assistant', text: '', thinking: '', tools: [], status: 'streaming', provider }
    let history = base.history
    let owed = base.owed || []
    setConvo({ provider, history, owed, items: [...base.items, userItem, reply] })
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    let input = { type: 'user', text: message, context: contextLine(new Date(), tz), results: owed.length ? owed : undefined }
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        if (step) patchItem(reply.id, (it) => ({ ...it, text: it.text && !it.text.endsWith('\n\n') ? it.text + '\n\n' : it.text }))
        const turnStart = convoRef.current.items.find((it) => it.id === reply.id)?.text.length ?? 0
        const done = await streamTurn({
          provider, history, input, signal: controller.signal,
          onEvent: (ev, data) => {
            if (ev === 'text') patchItem(reply.id, (it) => ({ ...it, text: it.text + data.delta }))
            else if (ev === 'thinking') patchItem(reply.id, (it) => ({ ...it, thinking: it.thinking + data.delta }))
            else if (ev === 'reset') patchItem(reply.id, (it) => ({ ...it, text: it.text.slice(0, turnStart) }))
          },
        })
        history = [...history, ...done.appended]
        owed = []
        setConvo((c) => ({ ...c, history, owed }))
        patchItem(reply.id, (it) => ({ ...it, usage: done.usage }))

        if (done.stopReason === 'refusal') throw new Error('The assistant declined this request. Try rephrasing it.')
        if (done.stopReason === 'max_tokens') throw new Error('That reply got too long. Try asking for less at once.')
        if (!done.toolCalls.length) break

        // ---- run the requested dashboard actions
        const calls = done.toolCalls.map((c) => ({ ...c, toolId: uid('tool') }))
        const writes = calls.filter((c) => !isReadOnlyTool(c.name))
        const confirmIds = new Set((writes.length > BATCH_CONFIRM ? writes : writes.filter((c) => needsConfirmation(c.name, c.input))).map((c) => c.toolId))
        patchItem(reply.id, (it) => ({
          ...it,
          tools: [...it.tools, ...calls.map((c) => ({
            id: c.toolId, name: c.name, input: c.input,
            status: confirmIds.has(c.toolId) ? 'pending' : 'running',
            summary: confirmIds.has(c.toolId) ? previewTool(c.name, c.input) : TOOL_LABELS[c.name] || null,
          }))],
        }))

        let approved = true
        if (confirmIds.size) {
          approved = await new Promise((resolve) => {
            decisionRef.current = resolve
            controller.signal.addEventListener('abort', () => resolve(false), { once: true })
          })
          patchItem(reply.id, (it) => ({ ...it, tools: it.tools.map((t) => (confirmIds.has(t.id) ? { ...t, status: approved ? 'running' : 'declined' } : t)) }))
        }

        const results = calls.map((c) => {
          if (confirmIds.has(c.toolId) && !approved) {
            return { id: c.id, name: c.name, content: JSON.stringify({ declined: 'The user declined this change. Do not retry it.' }) }
          }
          const r = executeTool(c.name, c.input)
          patchTool(reply.id, c.toolId, {
            status: r.ok ? 'done' : 'error',
            summary: isReadOnlyTool(c.name) && r.ok ? TOOL_LABELS[c.name] || c.name : r.summary,
            undo: r.undo,
          })
          return { id: c.id, name: c.name, content: r.content, isError: !r.ok }
        })
        owed = results // until the next turn acknowledges them
        setConvo((c) => ({ ...c, owed }))
        if (controller.signal.aborted) throw Object.assign(new Error('Stopped'), { name: 'AbortError' })
        input = { type: 'tool_results', results }
      }
      patchItem(reply.id, (it) => ({ ...it, status: 'done' }))
    } catch (e) {
      const stopped = e.name === 'AbortError' || controller.signal.aborted
      patchItem(reply.id, (it) => ({
        ...it,
        status: stopped ? 'stopped' : 'error',
        error: stopped ? null : e.message,
        tools: it.tools.map((t) => (t.status === 'pending' || t.status === 'running' ? { ...t, status: 'declined' } : t)),
      }))
      // If the failed turn carried tool results, they're still owed to the model.
      if (input.type === 'tool_results') setConvo((c) => ({ ...c, owed: input.results }))
    } finally {
      setBusy(false)
      abortRef.current = null
      decisionRef.current = null
    }
  }, [busy, provider])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const undo = useCallback((itemId, toolId) => {
    const item = convoRef.current.items.find((it) => it.id === itemId)
    const tool = item?.tools.find((t) => t.id === toolId)
    if (!tool?.undo) return
    undoChanges(tool.undo)
    patchTool(itemId, toolId, { status: 'undone', undo: null })
  }, [])

  const reset = useCallback(() => {
    if (busy) abortRef.current?.abort()
    setConvo(empty())
  }, [busy])

  const value = {
    config, configError, refreshConfig, setConfig, ready, provider, serverReady: status === 'ready',
    items: convo.items, busy, send, stop, decide, undo, reset,
    panelOpen, setPanelOpen,
  }
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}

export function useAssistant() {
  const ctx = useContext(AssistantContext)
  if (!ctx) throw new Error('useAssistant must be used inside AssistantProvider')
  return ctx
}
