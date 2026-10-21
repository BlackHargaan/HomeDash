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
import AssistantPanel from './components/AssistantPanel.jsx'
import { useAssistant } from './context/AssistantContext.jsx'

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
  const [settingsSection, setSettingsSection] = useState(null)
  const assistant = useAssistant()
  const openAssistant = (text) => {
    assistant.setPanelOpen(true)
    if (text) assistant.send(text)
  }
  const openSettings = (section = null) => { setSettingsSection(section); setShowSettings(true) }

  // Widgets can ask for a settings section (e.g. the Assistant's "Set up").
  useEffect(() => {
    const onOpen = (e) => openSettings(e.detail?.section)
    window.addEventListener('homedash:open-settings', onOpen)
    return () => window.removeEventListener('homedash:open-settings', onOpen)
  }, [])

  // Home-screen shortcuts from the web app manifest: /?action=add-widget|settings
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const action = params.get('action')
    if (!action) return
    if (action === 'add-widget') setShowAdd(true)
    if (action === 'settings') setShowSettings(true)
    params.delete('action')
    const q = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : '') + window.location.hash)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowPalette((v) => !v)
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        assistant.setPanelOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [assistant.setPanelOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  if (server.status === 'checking') return <div className="boot-splash" />
  if (server.status === 'locked') return <LoginScreen />

  return (
    <>
      <Reminders />
      <div className="wallpaper" />
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <img className="brand-logo" src="/icons/icon.svg" alt="" width="42" height="42" />
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
          <button className="btn ghost sm ai-launch" onClick={() => assistant.setPanelOpen(true)} title="Assistant (⌘J)" aria-label="Open assistant">
            ✨
          </button>
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
      {showSettings && <SettingsModal section={settingsSection} onClose={() => { setShowSettings(false); setSettingsSection(null) }} />}
      <AssistantPanel onOpenSettings={() => openSettings('ai')} />
      {showPalette && (
        <CommandPalette
          onClose={() => setShowPalette(false)}
          onAddWidget={() => setShowAdd(true)}
          onSettings={() => setShowSettings(true)}
          onAsk={openAssistant}
        />
      )}
    </>
  )
}
