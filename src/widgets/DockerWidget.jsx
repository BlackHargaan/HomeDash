import { useCallback, useEffect, useState } from 'react'
import { useWidgetState } from '../lib/storage.js'
import { serverApi } from '../lib/server.js'
import { useServer } from '../context/ServerContext.jsx'

const REFRESH_MS = 15_000

export default function DockerWidget({ widget }) {
  const { status, health } = useServer()
  const [cfg, setCfg] = useWidgetState(widget.id, { showAll: false })
  const [data, setData] = useState(null) // { containers, control }
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const available = status === 'ready' && health?.docker?.available

  const load = useCallback(async () => {
    try {
      setData(await serverApi.containers())
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    if (!available) return
    load()
    const iv = setInterval(load, REFRESH_MS)
    return () => clearInterval(iv)
  }, [available, load])

  async function restart(c) {
    if (!confirm(`Restart ${c.name}?`)) return
    setBusyId(c.id)
    try { await serverApi.restart(c.id); await load() } catch (e) { setError(e.message) } finally { setBusyId(null) }
  }

  if (status !== 'ready') {
    return <div className="empty-hint no-drag">The Docker widget needs the HomeDash server (the Docker image or desktop app).</div>
  }
  if (!available) {
    return (
      <div className="docker-setup no-drag">
        <p>To see your containers, mount the Docker socket into the HomeDash container:</p>
        <pre className="sync-sql">{`volumes:\n  - /var/run/docker.sock:/var/run/docker.sock:ro`}</pre>
        <p className="faint">This lets HomeDash read Docker’s state. Add <code>HOMEDASH_DOCKER_CONTROL=true</code> (and drop <code>:ro</code>) only if you also want restart buttons — that grants full control of Docker.</p>
      </div>
    )
  }

  const containers = (data?.containers || [])
    .filter((c) => cfg.showAll || c.state === 'running')
    .sort((a, b) => a.name.localeCompare(b.name))
  const running = (data?.containers || []).filter((c) => c.state === 'running').length

  return (
    <div className="docker no-drag">
      <div className="svc-summary">
        <span className="svc-pill ok">{running} running</span>
        {data && <span className="faint" style={{ fontSize: 12 }}>of {data.containers.length}</span>}
        <span className="spacer" />
        <button className={`chip ${cfg.showAll ? 'on' : ''}`} onClick={() => setCfg({ ...cfg, showAll: !cfg.showAll })}>
          {cfg.showAll ? 'All' : 'Running'}
        </button>
        <button className="wtool" title="Refresh" onClick={load}>↻</button>
      </div>
      {error && <div className="err-msg" style={{ fontSize: 12 }}>{error}</div>}
      <div className="svc-list">
        {containers.map((c) => (
          <div key={c.id} className="svc-row">
            <span className={`svc-dot ${c.state === 'running' ? 'up' : c.state === 'restarting' ? 'pending' : 'down'}`} title={c.state} />
            <span className="svc-name" title={c.image}>{c.name}</span>
            <span className="svc-meta faint" title={c.image}>{c.status}</span>
            {data?.control && (
              <button className="wtool" title={`Restart ${c.name}`} onClick={() => restart(c)} disabled={busyId === c.id}>
                {busyId === c.id ? '…' : '⟳'}
              </button>
            )}
          </div>
        ))}
        {data && containers.length === 0 && <div className="empty-hint">No containers to show.</div>}
      </div>
    </div>
  )
}
