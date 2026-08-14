import { useDashboard } from '../context/DashboardContext.jsx'
import { ACCENTS } from '../widgets/registry.js'
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
    userName, setUserName, resetBoard,
  } = useDashboard()

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
