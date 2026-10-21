import { useEffect, useState } from 'react'
import { useAssistant } from '../context/AssistantContext.jsx'
import { aiApi } from '../lib/assistant.js'

const EFFORT = [['low', 'Quick'], ['medium', 'Balanced'], ['high', 'Thorough']]

function Copy({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false)
  return (
    <button className="btn sm ghost" type="button" style={{ flex: "0 0 auto" }} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* ignore */ }
    }}>{done ? 'Copied' : label}</button>
  )
}

export default function AiPanel() {
  const { config, setConfig, serverReady, configError } = useAssistant()
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState(null)
  const [ollamaUrl, setOllamaUrl] = useState('')
  const [models, setModels] = useState(null)
  const [tokens, setTokens] = useState([])
  const [newToken, setNewToken] = useState(null)
  const [tokenName, setTokenName] = useState('Claude Desktop')
  const [readOnly, setReadOnly] = useState(false)

  useEffect(() => { if (config) setOllamaUrl(config.ollama.url) }, [config?.ollama.url]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (serverReady) aiApi.tokens().then((r) => setTokens(r.tokens)).catch(() => {}) }, [serverReady])

  if (!serverReady) {
    return (
      <div className="field" id="settings-ai">
        <label>AI assistant</label>
        <span className="faint" style={{ fontSize: 12 }}>
          The assistant and the MCP connection run on the HomeDash server (Docker, the desktop app or <code>npm start</code>), which keeps your API key off this browser.
        </span>
      </div>
    )
  }
  if (!config) return <div className="field" id="settings-ai"><label>AI assistant</label><span className="faint">{configError || 'Loading…'}</span></div>

  async function save(patch, ok) {
    setMsg(null)
    try {
      setConfig(await aiApi.saveConfig(patch))
      if (ok) setMsg({ ok: true, text: ok })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
  }

  async function loadModels() {
    setMsg(null)
    try {
      await save({ ollama: { url: ollamaUrl } })
      setModels((await aiApi.ollamaModels()).models)
    } catch (e) {
      setModels(null)
      setMsg({ ok: false, text: e.message })
    }
  }

  async function createToken(e) {
    e.preventDefault()
    try {
      const t = await aiApi.createToken(tokenName, readOnly)
      setNewToken(t)
      setTokens((list) => [...list, t])
    } catch (err) { setMsg({ ok: false, text: err.message }) }
  }

  const endpoint = `${window.location.origin}/mcp`
  const { claude, ollama, provider } = config
  const desktopConfig = newToken && JSON.stringify({
    mcpServers: { homedash: { command: 'npx', args: ['-y', 'mcp-remote', endpoint, '--header', `Authorization:Bearer ${newToken.token}`] } },
  }, null, 2)

  return (
    <>
      <div className="field" id="settings-ai" style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <label>AI assistant</label>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className={`chip ${provider === 'claude' ? 'on' : ''}`} onClick={() => save({ provider: 'claude' })}>Claude (Anthropic)</button>
          <button className={`chip ${provider === 'ollama' ? 'on' : ''}`} onClick={() => save({ provider: 'ollama' })}>Local model (Ollama)</button>
        </div>

        {provider === 'claude' ? (
          <div className="ai-settings">
            <span className="faint" style={{ fontSize: 12 }}>
              {claude.configured
                ? <>API key {claude.keyHint} is set{claude.keySource === 'environment' ? ' by the server’s ANTHROPIC_API_KEY' : ''}. Usage is billed to your Anthropic account.</>
                : <>Create a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>. It’s stored on your HomeDash server only.</>}
            </span>
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (key.trim()) save({ claude: { apiKey: key.trim() } }, 'Key saved.').then(() => setKey('')) }}>
              <input className="input sm" type="password" autoComplete="off" placeholder={claude.configured ? 'Replace key (sk-ant-…)' : 'sk-ant-…'} value={key} onChange={(e) => setKey(e.target.value)} aria-label="Anthropic API key" />
              <button className="btn sm primary" type="submit" style={{ flex: '0 0 auto' }} disabled={!key.trim()}>Save key</button>
              {claude.keySource === 'settings' && <button className="btn sm ghost danger" type="button" style={{ flex: '0 0 auto' }} onClick={() => save({ claude: { apiKey: '' } }, 'Key removed.')}>Remove</button>}
            </form>
            <div className="row" style={{ alignItems: 'center' }}>
              <span className="faint ai-set-label">Model</span>
              <select className="select sm" value={claude.model} onChange={(e) => save({ claude: { model: e.target.value } })} aria-label="Claude model">
                {claude.models.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.note}</option>)}
              </select>
            </div>
            <div className="row" style={{ alignItems: 'center' }}>
              <span className="faint ai-set-label">Effort</span>
              <div className="row" style={{ gap: 4 }}>
                {EFFORT.map(([id, label]) => <button key={id} className={`chip ${claude.effort === id ? 'on' : ''}`} onClick={() => save({ claude: { effort: id } })}>{label}</button>)}
              </div>
            </div>
          </div>
        ) : (
          <div className="ai-settings">
            <span className="faint" style={{ fontSize: 12 }}>
              Runs on your own hardware with <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">Ollama</a> — nothing leaves your network. Pick a model that supports tools (e.g. Qwen 3, Llama 3.1+); smaller models may stumble on multi-step changes.
            </span>
            <form className="row" onSubmit={(e) => { e.preventDefault(); loadModels() }}>
              <input className="input sm" value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} placeholder="http://192.168.1.10:11434" aria-label="Ollama address" />
              <button className="btn sm" type="submit" style={{ flex: '0 0 auto' }}>Load models</button>
            </form>
            {(models || ollama.model) && (
              <div className="row" style={{ alignItems: 'center' }}>
                <span className="faint ai-set-label">Model</span>
                <select className="select sm" value={ollama.model} onChange={(e) => save({ ollama: { model: e.target.value } })} aria-label="Ollama model">
                  {!ollama.model && <option value="">Choose…</option>}
                  {[...new Set([...(models || []), ollama.model].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        {msg && <span className={msg.ok ? 'ok-msg' : 'err-msg'}>{msg.text}</span>}
      </div>

      <div className="field">
        <label>Connect AI apps (MCP)</label>
        <span className="faint" style={{ fontSize: 12 }}>
          Let Claude Desktop, Claude Code and other MCP clients read and update this dashboard. Each app gets its own token; read-only tokens can look but not change anything.
        </span>
        <div className="row" style={{ alignItems: 'center' }}>
          <code className="ai-endpoint">{endpoint}</code>
          <Copy text={endpoint} />
        </div>
        <form className="row" onSubmit={createToken} style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input sm" value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Name, e.g. Claude Desktop" aria-label="Token name" />
          <label className="chip-inline faint" style={{ flex: '0 0 auto', fontSize: 12 }}>
            <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} /> Read-only
          </label>
          <button className="btn sm primary" type="submit" style={{ flex: '0 0 auto' }}>Create token</button>
        </form>

        {newToken && (
          <div className="ai-token-new">
            <b>Copy this token now — it won’t be shown again.</b>
            <div className="row" style={{ alignItems: 'center' }}><code className="ai-endpoint">{newToken.token}</code><Copy text={newToken.token} /></div>
            <div className="faint ai-snippet-label">Claude Code</div>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <pre className="ai-snippet">{`claude mcp add --transport http homedash ${endpoint} \\\n  --header "Authorization: Bearer ${newToken.token}"`}</pre>
              <Copy text={`claude mcp add --transport http homedash ${endpoint} --header "Authorization: Bearer ${newToken.token}"`} />
            </div>
            <div className="faint ai-snippet-label">Claude Desktop — add to claude_desktop_config.json (needs Node.js)</div>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <pre className="ai-snippet">{desktopConfig}</pre>
              <Copy text={desktopConfig} />
            </div>
            <button className="btn sm ghost" onClick={() => setNewToken(null)}>Done</button>
          </div>
        )}

        {tokens.length > 0 && (
          <div className="ai-token-list">
            {tokens.map((t) => (
              <div key={t.id} className="svc-row">
                <span className="svc-name" style={{ color: 'var(--text)' }}>{t.name}</span>
                <span className="svc-meta faint">{t.readOnly ? 'read-only · ' : ''}…{t.hint} · {t.lastUsed ? `used ${new Date(t.lastUsed).toLocaleDateString()}` : 'never used'}</span>
                <button className="svc-del" style={{ opacity: 1 }} onClick={async () => {
                  if (!confirm(`Revoke “${t.name}”? Apps using it lose access.`)) return
                  await aiApi.revokeToken(t.id)
                  setTokens((list) => list.filter((x) => x.id !== t.id))
                }} aria-label={`Revoke ${t.name}`}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
