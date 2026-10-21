import { useEffect, useMemo, useRef, useState } from 'react'
import { useAssistant } from '../context/AssistantContext.jsx'
import { renderMarkdown } from '../lib/markdown.js'

const SUGGESTIONS = [
  'What’s on my calendar this week?',
  'Add “call the dentist” to my tasks for tomorrow',
  'Plan a 30-minute workout every Mon, Wed and Fri at 7am',
  'Which habits haven’t I done today?',
]

const STATUS_ICON = { running: '…', done: '✓', error: '⚠', pending: '?', declined: '✕', undone: '↺' }

function Markdown({ text }) {
  const html = useMemo(() => renderMarkdown(text), [text])
  return <div className="md ai-md" dangerouslySetInnerHTML={{ __html: html }} />
}

function ToolList({ item }) {
  const { undo } = useAssistant()
  const visible = item.tools.filter((t) => t.status !== 'pending')
  if (!visible.length) return null
  return (
    <ul className="ai-tools">
      {visible.map((t) => (
        <li key={t.id} className={`ai-tool ${t.status}`}>
          <span className="ai-tool-icon">{STATUS_ICON[t.status]}</span>
          <span className="ai-tool-text">{t.summary || t.name}</span>
          {t.undo && t.status === 'done' && <button className="ai-undo" onClick={() => undo(item.id, t.id)}>Undo</button>}
        </li>
      ))}
    </ul>
  )
}

function ConfirmCard({ item }) {
  const { decide } = useAssistant()
  const pending = item.tools.filter((t) => t.status === 'pending')
  if (!pending.length) return null
  return (
    <div className="ai-confirm" role="alertdialog" aria-label="Confirm changes">
      <b>{pending.length === 1 ? 'Allow this change?' : `Allow these ${pending.length} changes?`}</b>
      <ul>{pending.map((t) => <li key={t.id}>{t.summary}</li>)}</ul>
      <div className="row">
        <button className="btn sm primary" onClick={() => decide(true)}>Allow</button>
        <button className="btn sm ghost" onClick={() => decide(false)}>Don’t allow</button>
      </div>
    </div>
  )
}

function Message({ item }) {
  const [showThinking, setShowThinking] = useState(false)
  if (item.role === 'user') return <div className="ai-msg user"><div className="ai-bubble">{item.text}</div></div>
  const working = item.status === 'streaming'
  return (
    <div className="ai-msg assistant">
      {item.thinking && (
        <button className="ai-thinking-toggle" onClick={() => setShowThinking((v) => !v)}>
          {working && !item.text ? 'Thinking…' : 'Thought process'} {showThinking ? '▾' : '▸'}
        </button>
      )}
      {showThinking && item.thinking && <div className="ai-thinking">{item.thinking}</div>}
      <ToolList item={item} />
      {item.text ? <Markdown text={item.text} /> : working && !item.thinking && <div className="ai-typing"><span /><span /><span /></div>}
      <ConfirmCard item={item} />
      {item.status === 'stopped' && <div className="faint ai-note">Stopped.</div>}
      {item.error && <div className="err-msg ai-note">{item.error}</div>}
      {item.usage?.model && item.status === 'done' && (
        <div className="faint ai-usage">{item.usage.model}{item.usage.output ? ` · ${(item.usage.input || 0) + item.usage.output} tokens` : ''}</div>
      )}
    </div>
  )
}

export default function AssistantChat({ compact = false, onOpenSettings }) {
  const { items, busy, send, stop, reset, ready, serverReady, config, configError, provider } = useAssistant()
  const [draft, setDraft] = useState('')
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [items])

  function submit(e) {
    e?.preventDefault()
    if (!draft.trim() || busy || !ready) return
    send(draft)
    setDraft('')
    stick.current = true
  }

  let blocker = null
  if (!serverReady) blocker = 'The assistant runs on the HomeDash server — start HomeDash with Docker, the desktop app or npm start.'
  else if (configError) blocker = `Couldn’t load assistant settings: ${configError}`
  else if (config && !ready) blocker = provider === 'claude' ? 'Add an Anthropic API key to start chatting.' : 'Choose a local model to start chatting.'

  return (
    <div className={`ai-chat ${compact ? 'compact' : ''}`}>
      <div className="ai-list" ref={listRef} onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}>
        {!items.length && (
          <div className="ai-empty">
            <div className="ai-empty-title">✨ Ask about your day</div>
            <div className="faint">I can read and update your calendar, tasks, habits, boards and notes.</div>
            {ready && (
              <div className="ai-suggest">
                {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
          </div>
        )}
        {items.map((it) => <Message key={it.id} item={it} />)}
      </div>

      {blocker ? (
        <div className="ai-blocker">
          <span className="faint">{blocker}</span>
          {serverReady && onOpenSettings && <button className="btn sm primary" onClick={onOpenSettings}>Set up</button>}
        </div>
      ) : (
        <form className="ai-composer" onSubmit={submit}>
          <textarea ref={inputRef} className="input ai-input" rows={1} value={draft} placeholder="Ask or tell me to do something…"
            aria-label="Message the assistant" onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }} />
          {busy
            ? <button type="button" className="btn sm" onClick={stop} aria-label="Stop">■ Stop</button>
            : <button type="submit" className="btn sm primary" disabled={!draft.trim()} aria-label="Send">Send</button>}
        </form>
      )}
      {items.length > 0 && !busy && (
        <button className="ai-new" onClick={reset} title="Start a new conversation">New chat</button>
      )}
    </div>
  )
}
