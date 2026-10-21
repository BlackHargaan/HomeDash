import { useState } from 'react'
import { useServer } from '../context/ServerContext.jsx'

export default function ServerPanel() {
  const { status, health, sync, logout, syncNow } = useServer()
  const [busy, setBusy] = useState(false)
  const run = async (fn) => { setBusy(true); try { await fn() } finally { setBusy(false) } }

  if (status !== 'ready') {
    return (
      <div className="field section-sep">
        <label>HomeDash server</label>
        <span className="faint" style={{ fontSize: 12 }}>
          Not connected — this copy runs entirely in your browser. Run HomeDash with its server
          (the Docker image, <code>npm start</code>, or the desktop app) for automatic sync across
          devices, iCal/RSS fetching and service status checks.
        </span>
      </div>
    )
  }

  return (
    <div className="field section-sep">
      <label>HomeDash server</label>
      <div className="sync-signedin">
        <div>
          <div className="sync-email">🖥️ Connected · v{health.version}</div>
          <div className="faint" style={{ fontSize: 12 }}>
            {sync.state === 'syncing' && 'Syncing…'}
            {sync.state === 'synced' && `Synced${sync.lastSync ? ' · ' + new Date(sync.lastSync).toLocaleTimeString() : ''}`}
            {sync.state === 'error' && <span className="err-msg">{sync.error || 'Sync error'}</span>}
            {sync.state === 'idle' && 'Ready'}
            {' · '}{health.auth ? 'Password protected' : 'No password set'}
          </div>
        </div>
        <div className="row" style={{ flex: '0 0 auto' }}>
          <button className="btn sm" onClick={() => run(syncNow)} disabled={busy}>↻ Sync now</button>
          {health.auth && <button className="btn sm ghost" onClick={() => run(logout)} disabled={busy}>Sign out</button>}
        </div>
      </div>
      <span className="faint" style={{ fontSize: 12 }}>
        Your dashboard is saved on the server and kept in sync across every browser that opens it.
        {!health.auth && ' Set HOMEDASH_PASSWORD before exposing this server outside your home network.'}
      </span>
    </div>
  )
}
