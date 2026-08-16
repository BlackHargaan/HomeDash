import { useRef, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { ACCENTS } from '../widgets/registry.js'
import { exportAllData, importAllData } from '../lib/storage.js'
import { requestNotifyPermission, notifyPermission, notifySupported } from '../lib/notify.js'
import CloudSyncPanel from './CloudSyncPanel.jsx'
import Modal from './Modal.jsx'

const WALLPAPERS = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'mesh', label: 'Mesh' },
  { id: 'grid', label: 'Grid' },
  { id: 'plain', label: 'Plain' },
]

export default function SettingsModal({ onClose }) {
  const {
    theme, setTheme, accent, setAccent, wallpaper, setWallpaper,
    userName, setUserName, resetBoard, notifyEnabled, setNotifyEnabled,
  } = useDashboard()
  const fileRef = useRef(null)
  const [restoreMsg, setRestoreMsg] = useState(null)

  async function toggleNotify() {
    if (notifyEnabled) { setNotifyEnabled(false); return }
    const perm = await requestNotifyPermission()
    setNotifyEnabled(perm === 'granted')
  }

  function backup() {
    const blob = new Blob([JSON.stringify(exportAllData(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `homedash-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function restore(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        importAllData(JSON.parse(String(reader.result)))
        setRestoreMsg('ok')
        setTimeout(() => window.location.reload(), 700)
      } catch {
        setRestoreMsg('error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <Modal
      title="Settings"
      onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Done</button>}
    >
      <div className="field">
        <label>Your name (for the greeting)</label>
        <input className="input" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="e.g. Alex" />
      </div>

      <div className="field">
        <label>Theme</label>
        <div className="row">
          <button className={`chip ${theme === 'dark' ? 'on' : ''}`} onClick={() => setTheme('dark')}>🌙 Dark</button>
          <button className={`chip ${theme === 'light' ? 'on' : ''}`} onClick={() => setTheme('light')}>☀️ Light</button>
        </div>
      </div>

      <div className="field">
        <label>Accent color</label>
        <div className="swatches">
          {Object.entries(ACCENTS).map(([name, color]) => (
            <button
              key={name}
              className={`swatch ${accent === name ? 'on' : ''}`}
              style={{ background: color }}
              onClick={() => setAccent(name)}
              aria-label={name}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <label>Wallpaper</label>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {WALLPAPERS.map((w) => (
            <button key={w.id} className={`chip ${wallpaper === w.id ? 'on' : ''}`} onClick={() => setWallpaper(w.id)}>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Notifications</label>
        {notifySupported() ? (
          <>
            <button className={`chip ${notifyEnabled ? 'on' : ''}`} onClick={toggleNotify} style={{ alignSelf: 'flex-start' }}>
              {notifyEnabled ? '🔔 Reminders on' : '🔕 Enable reminders'}
            </button>
            <span className="faint" style={{ fontSize: 12 }}>
              Get a browser alert before timed events and when tasks are due today.
              {notifyPermission() === 'denied' && ' Notifications are blocked in your browser settings.'}
            </span>
          </>
        ) : (
          <span className="faint" style={{ fontSize: 12 }}>This browser doesn’t support notifications.</span>
        )}
      </div>

      <div className="field" style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <label>Backup &amp; restore</label>
        <p className="faint" style={{ fontSize: 12, margin: '0 0 8px' }}>
          Everything lives in this browser. Export a JSON backup to move HomeDash to another browser or keep it safe.
        </p>
        <div className="row">
          <button className="btn" onClick={backup}>⇧ Export backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⇩ Restore…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={restore} />
        </div>
        {restoreMsg === 'ok' && <span className="ok-msg">✓ Restored — reloading…</span>}
        {restoreMsg === 'error' && <span className="err-msg">That doesn’t look like a HomeDash backup.</span>}
      </div>

      <CloudSyncPanel />

      <div className="field" style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <label>Danger zone</label>
        <button
          className="btn danger ghost"
          onClick={() => {
            if (confirm('Reset the board to the default layout? Your widgets will be rearranged (data like tasks and events is kept).')) {
              resetBoard()
              onClose()
            }
          }}
        >
          ↺ Reset board layout
        </button>
      </div>
    </Modal>
  )
}
