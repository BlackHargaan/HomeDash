import { useEffect, useState } from 'react'
import { useDashboard } from './context/DashboardContext.jsx'
import { useSync } from './context/SyncContext.jsx'
import { useServer } from './context/ServerContext.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import { useDesktopUpdate, updateReady } from './lib/desktop.js'
import Grid from './components/Grid.jsx'
import BoardTabs from './components/BoardTabs.jsx'
import AddWidgetModal from './components/AddWidgetModal.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import Reminders from './components/Reminders.jsx'

export default function App() {
  const { editMode, setEditMode } = useDashboard()
  const { user, status } = useSync()
  const server = useServer()
  const desktopUpdate = useDesktopUpdate()
  // Header cloud badge: the self-hosted server takes precedence over Supabase.
  const badge = server.status === 'ready'
    ? { state: server.sync.state, label: 'Server sync' }
    : user ? { state: status, label: 'Cloud sync' } : null
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPalette, setShowPalette] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowPalette((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (server.status === 'checking') return <div className="boot-splash" />
  if (server.status === 'locked') return <LoginScreen />

  return (
    <>
      <Reminders />
      <div className="wallpaper" />
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="brand-logo">🗂️</div>
            <div>
              <h1>HomeDash</h1>
              <p className="sub">Your day, organized.</p>
            </div>
          </div>

          <BoardTabs />

          <span className="topbar-spacer" />

          {updateReady(desktopUpdate) && (
            <button
              className="btn sm update-badge"
              onClick={() => setShowSettings(true)}
              title={`HomeDash ${desktopUpdate.version} is available`}
            >
              ⬆ Update
            </button>
          )}
          {badge && (
            <button
              className="btn ghost sm"
              onClick={() => setShowSettings(true)}
              title={`${badge.label}: ${badge.state}`}
            >
              <span className={`sync-badge ${badge.state}`}>☁</span>
            </button>
          )}
          <button className="btn ghost sm" onClick={() => setShowPalette(true)} title="Command palette (⌘K)">
            <span>⌘</span>K
          </button>
          <button className="btn" onClick={() => setShowAdd(true)}>
            <span>＋</span> Add widget
          </button>
          <button
            className={`btn ${editMode ? 'active' : ''}`}
            onClick={() => setEditMode((e) => !e)}
            title="Rearrange & resize widgets"
          >
            {editMode ? '✓ Done' : '✎ Edit'}
          </button>
          <button className="btn icon" onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings">
            ⚙️
          </button>
        </header>

        <Grid />

        {editMode && (
          <div className="edit-banner">
            Drag widgets by their title bar · resize from the corner · click ✕ to remove
          </div>
        )}
      </div>

      {showAdd && <AddWidgetModal onClose={() => setShowAdd(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showPalette && (
        <CommandPalette
          onClose={() => setShowPalette(false)}
          onAddWidget={() => setShowAdd(true)}
          onSettings={() => setShowSettings(true)}
        />
      )}
    </>
  )
}
