import { useEffect, useState } from 'react'
import { desktop, useDesktopUpdate } from '../lib/desktop.js'

const PLATFORM = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }

// Settings → Desktop app. Only rendered inside the desktop app.
export default function DesktopPanel({ first = false }) {
  const update = useDesktopUpdate()
  const [info, setInfo] = useState(null)
  const [mode, setMode] = useState('standalone')
  const [serverUrl, setServerUrl] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    desktop.info().then((i) => {
      setInfo(i)
      setMode(i.settings.mode)
      setServerUrl(i.settings.serverUrl || '')
    })
  }, [])

  if (!info) return null

  const dirty = mode !== info.settings.mode || (mode === 'server' && serverUrl.trim() !== (info.settings.serverUrl || ''))

  async function apply() {
    setError(null)
    setSaving(true)
    try {
      const settings = await desktop.setSettings({ mode, serverUrl })
      setInfo({ ...info, settings }) // the app reloads itself if the target changed
    } catch (e) {
      setError(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setSaving(false)
    }
  }

  async function toggleTray(e) {
    const settings = await desktop.setSettings({ closeToTray: e.target.checked })
    setInfo({ ...info, settings })
  }
  async function toggleLogin(e) {
    const enabled = await desktop.setLoginItem(e.target.checked)
    setInfo({ ...info, loginItem: enabled })
  }

  const u = update || {}
  const updateLine = {
    idle: null,
    checking: 'Checking for updates…',
    none: 'You’re on the latest version.',
    downloading: `Downloading v${u.version}… ${u.progress ? u.progress + '%' : ''}`,
    downloaded: `Version ${u.version} is ready to install.`,
    manual: `Version ${u.version} is available.`,
    error: `Update check failed: ${u.error}`,
    unsupported: u.error,
  }[u.state || 'idle']

  return (
    <div className={`field ${first ? 'desk-first' : 'section-sep'}`}>
      <label>Desktop app</label>
      <div className="desk-version">
        <span>HomeDash <b>v{info.version}</b> for {PLATFORM[info.platform] || info.platform}</span>
        {u.state === 'downloaded' ? (
          <button className="btn sm primary" onClick={() => desktop.installUpdate()}>Restart &amp; update</button>
        ) : u.state === 'manual' ? (
          <button className="btn sm primary" onClick={() => desktop.installUpdate()}>Download v{u.version}</button>
        ) : (
          <button className="btn sm" onClick={() => desktop.checkForUpdates()} disabled={u.state === 'checking' || u.state === 'downloading'}>
            ↻ Check for updates
          </button>
        )}
      </div>
      {updateLine && <span className={`faint ${u.state === 'error' ? 'err-msg' : ''}`} style={{ fontSize: 12 }}>{updateLine}</span>}
      {u.state === 'manual' && info.platform === 'darwin' && (
        <span className="faint" style={{ fontSize: 12 }}>macOS builds aren’t signed yet, so updates are a quick download: open the .dmg and drag HomeDash into Applications.</span>
      )}

      <div className="desk-modes">
        <label className={`desk-mode ${mode === 'standalone' ? 'on' : ''}`}>
          <input type="radio" name="desk-mode" checked={mode === 'standalone'} onChange={() => setMode('standalone')} />
          <span>
            <b>Standalone</b>
            <span className="faint">Everything runs and is stored on this computer.</span>
          </span>
        </label>
        <label className={`desk-mode ${mode === 'server' ? 'on' : ''}`}>
          <input type="radio" name="desk-mode" checked={mode === 'server'} onChange={() => setMode('server')} />
          <span>
            <b>Connect to my server</b>
            <span className="faint">Open your self-hosted HomeDash, so desktop and web share the same data.</span>
          </span>
        </label>
      </div>
      {mode === 'server' && (
        <input className="input" placeholder="http://192.168.1.10:8080" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
      )}
      {error && <span className="err-msg">{error}</span>}
      {dirty && (
        <button className="btn sm primary" style={{ alignSelf: 'flex-start' }} onClick={apply} disabled={saving}>
          {saving ? 'Switching…' : mode === 'server' ? 'Connect' : 'Switch to standalone'}
        </button>
      )}
      {dirty && mode === 'server' && info.settings.mode === 'standalone' && (
        <span className="faint" style={{ fontSize: 12 }}>
          Your standalone data stays on this computer; switching back later brings it back.
        </span>
      )}

      <label className="chip-inline" style={{ fontSize: 13 }}>
        <input type="checkbox" checked={info.settings.closeToTray} onChange={toggleTray} />
        Keep running in the tray when the window is closed (reminders keep working)
      </label>
      {info.loginItem !== null && (
        <label className="chip-inline" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={!!info.loginItem} onChange={toggleLogin} />
          Open HomeDash when I sign in to {PLATFORM[info.platform]}
        </label>
      )}
    </div>
  )
}
