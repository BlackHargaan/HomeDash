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
import Icon from './components/Icon.jsx'
import AssistantPanel from './components/AssistantPanel.jsx'
import { useAssistant } from './context/AssistantContext.jsx'

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

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
  const [scrolled, setScrolled] = useState(false)
  const assistant = useAssistant()
  const openAssistant = (text) => {
    assistant.setPanelOpen(true)
    if (text) assistant.send(text)
  }
  const openSettings = (section = null) => { setSettingsSection(section); setShowSettings(true) }

  // The sticky top bar firms up once the page scrolls under it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
        <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
          <div className="brand">
            <img className="brand-logo" src="/icons/icon.svg" alt="" width="36" height="36" />
            <div className="brand-text">
              <h1>HomeDash</h1>
              <p className="sub">Your day, organized.</p>
            </div>
          </div>

          <BoardTabs />

          <button className="tb-search" onClick={() => setShowPalette(true)} title="Search, commands and the assistant">
            <Icon name="search" size={16} />
            <span className="tb-search-text">Search or ask…</span>
            <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>

          <div className="tb-actions">
            {updateReady(desktopUpdate) && (
              <button className="tb-pill accent" onClick={() => setShowSettings(true)} title={`HomeDash ${desktopUpdate.version} is available`}>
                <Icon name="update" size={15} /> <span>Update</span>
              </button>
            )}
            {badge && (
              <button className={`tb-btn sync ${badge.state}`} onClick={() => setShowSettings(true)} title={`${badge.label}: ${badge.state}`} aria-label={`${badge.label}: ${badge.state}`}>
                <Icon name={badge.state === 'error' ? 'cloudOff' : badge.state === 'syncing' ? 'refresh' : 'cloudCheck'} />
              </button>
            )}
            <button className="tb-btn tb-search-icon" onClick={() => setShowPalette(true)} title={`Search (${isMac ? '⌘' : 'Ctrl+'}K)`} aria-label="Search and commands">
              <Icon name="search" />
            </button>
            <button className="tb-btn ai" onClick={() => assistant.setPanelOpen(true)} title={`Assistant (${isMac ? '⌘' : 'Ctrl+'}J)`} aria-label="Open assistant">
              <Icon name="sparkles" />
            </button>
            <button className={`tb-btn ${editMode ? 'on' : ''}`} onClick={() => setEditMode((e) => !e)} title={editMode ? 'Done editing' : 'Rearrange & resize widgets'} aria-label={editMode ? 'Done editing' : 'Edit layout'} aria-pressed={editMode}>
              <Icon name={editMode ? 'check' : 'edit'} />
            </button>
            <button className="tb-btn" onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings">
              <Icon name="settings" />
            </button>
            <span className="tb-divider" />
            <button className="tb-pill primary" onClick={() => setShowAdd(true)} title="Add widget" aria-label="Add widget">
              <Icon name="plus" size={16} /> <span>Add widget</span>
            </button>
          </div>
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
