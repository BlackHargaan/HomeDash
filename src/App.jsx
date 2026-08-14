import { useState } from 'react'
import { useDashboard } from './context/DashboardContext.jsx'
import Grid from './components/Grid.jsx'
import AddWidgetModal from './components/AddWidgetModal.jsx'
import SettingsModal from './components/SettingsModal.jsx'

export default function App() {
  const { editMode, setEditMode } = useDashboard()
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  return (
    <>
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

          <span className="topbar-spacer" />

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
    </>
  )
}
