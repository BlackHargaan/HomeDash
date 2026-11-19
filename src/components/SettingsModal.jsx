import { useEffect, useRef, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { ACCENTS } from '../widgets/registry.js'
import { UI_STYLES, accentColor } from '../lib/appearance.js'
import { exportAllData, importAllData } from '../lib/storage.js'
import CloudSyncPanel from './CloudSyncPanel.jsx'
import ServerPanel from './ServerPanel.jsx'
import DesktopPanel from './DesktopPanel.jsx'
import { desktop } from '../lib/desktop.js'
import Modal from './Modal.jsx'
import AppearancePanel from './AppearancePanel.jsx'
import TemplateModal from './TemplateModal.jsx'
import NotificationsPanel from './NotificationsPanel.jsx'
import InstallPanel from './InstallPanel.jsx'
import AiPanel from './AiPanel.jsx'

export default function SettingsModal({ onClose, section }) {
  const {
    theme, setTheme, resolvedTheme, uiStyle, setUiStyle, accent, setAccent,
    userName, setUserName, resetBoard,
  } = useDashboard()
  const fileRef = useRef(null)
  const [restoreMsg, setRestoreMsg] = useState(null)
  const [showTemplates, setShowTemplates] = useState(false)

  useEffect(() => {
    if (section) setTimeout(() => document.getElementById(`settings-${section}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60)
  }, [section])

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
      {desktop && <DesktopPanel first />}

      <div className="field">
        <label>Your name (for the greeting)</label>
        <input className="input" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="e.g. Alex" />
      </div>

      <div className="field">
        <label>Style</label>
        <div className="style-picks">
          {Object.entries(UI_STYLES).map(([id, st]) => (
            <button key={id} type="button" className={`style-pick style-pick-${id} ${uiStyle === id ? 'on' : ''}`} aria-pressed={uiStyle === id} onClick={() => setUiStyle(id)}>
              <span className="style-pick-swatch" aria-hidden="true"><i /><i /><i /></span>
              <span className="style-pick-text"><b>{st.label}</b><span>{st.hint}</span></span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Theme</label>
        <div className="row">
          <button className={`chip ${theme === 'dark' ? 'on' : ''}`} onClick={() => setTheme('dark')}>🌙 Dark</button>
          <button className={`chip ${theme === 'light' ? 'on' : ''}`} onClick={() => setTheme('light')}>☀️ Light</button>
          <button className={`chip ${theme === 'system' ? 'on' : ''}`} onClick={() => setTheme('system')} title="Follow your device's light/dark setting">◐ Auto</button>
        </div>
      </div>

      <div className="field">
        <label>Accent color</label>
        <div className="swatches">
          {Object.entries(ACCENTS).map(([name, color]) => (
            <button
              key={name}
              className={`swatch ${accent === name ? 'on' : ''}`}
              style={{ background: accentColor(name, ACCENTS, uiStyle, resolvedTheme) || color }}
              onClick={() => setAccent(name)}
              aria-label={name}
            />
          ))}
        </div>
      </div>

      <AppearancePanel />

      <NotificationsPanel />

      <InstallPanel />

      <AiPanel />

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

      <ServerPanel />

      <CloudSyncPanel />

      <div className="field" style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <label>Board layout</label>
        <p className="faint" style={{ fontSize: 12, margin: '0 0 8px' }}>
          Switch this board to a ready-made layout (Planner, Homelab, Student…), or save it as your own template for new boards.
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setShowTemplates(true)}>▦ Templates…</button>
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
      </div>
      {showTemplates && <TemplateModal mode="apply" onClose={() => setShowTemplates(false)} onDone={() => { setShowTemplates(false); onClose() }} />}
    </Modal>
  )
}
