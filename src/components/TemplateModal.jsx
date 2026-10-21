import { useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { BUILTIN_TEMPLATES, instantiate } from '../lib/templates.js'
import { widgetMeta } from '../widgets/registry.js'
import Modal from './Modal.jsx'

const BLANK = { id: 'blank', name: 'Blank', icon: '⬜', description: 'Start empty and add widgets yourself.', widgets: [] }
const ICONS = ['🗂️', '💼', '🏠', '🖥️', '🎓', '📰', '✨', '🎯', '🧪', '🎮']

// Miniature of a template's grid, scaled to the card.
export function TemplatePreview({ template }) {
  const items = instantiate(template)
  const rows = Math.max(6, ...items.map((w) => w.layout.y + w.layout.h))
  return (
    <div className="tpl-preview" aria-hidden="true">
      {items.map((w) => (
        <span key={w.id} className="tpl-box" style={{
          left: `${(w.layout.x / 12) * 100}%`, width: `${(w.layout.w / 12) * 100}%`,
          top: `${(w.layout.y / rows) * 100}%`, height: `${(w.layout.h / rows) * 100}%`,
        }}>{widgetMeta(w.type)?.icon}</span>
      ))}
    </div>
  )
}

// mode "new": create a board from a template. mode "apply": replace the
// current board's layout, or save it as a template of your own.
export default function TemplateModal({ mode = 'new', onClose, onDone = onClose }) {
  const { addBoard, applyTemplate, saveTemplate, deleteTemplate, userTemplates, widgets, boards, activeBoardId } = useDashboard()
  const [picked, setPicked] = useState(mode === 'new' ? 'blank' : 'productivity')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🗂️')
  const [saved, setSaved] = useState(null)
  const all = [...(mode === 'new' ? [BLANK] : []), ...BUILTIN_TEMPLATES, ...userTemplates]
  const tpl = all.find((t) => t.id === picked) || all[0]
  const board = boards.find((b) => b.id === activeBoardId)

  function confirmPick() {
    if (mode === 'new') {
      addBoard(name.trim() || (tpl.id === 'blank' ? 'New board' : tpl.name), icon, instantiate(tpl))
      onDone()
    } else {
      if (widgets.length && !confirm(`Replace the widgets on “${board?.name}” with the ${tpl.name} layout? Tasks, events and other shared data are kept.`)) return
      applyTemplate(tpl.id)
      onDone()
    }
  }

  function saveCurrent() {
    const n = prompt('Name this template:', `${board?.name || 'My'} layout`)
    if (!n || !n.trim()) return
    const t = saveTemplate(n.trim(), board?.icon)
    setPicked(t.id)
    setSaved(t.name)
  }

  return (
    <Modal
      title={mode === 'new' ? 'New board' : 'Board templates'}
      onClose={onClose}
      wide
      footer={(
        <>
          {mode === 'apply' && (
            <button className="btn ghost" onClick={saveCurrent} disabled={!widgets.length} title="Save this board's layout as a template">☆ Save current board as template</button>
          )}
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={confirmPick}>{mode === 'new' ? 'Create board' : `Apply ${tpl.name}`}</button>
        </>
      )}
    >
      {mode === 'new' && (
        <div className="row tpl-name-row">
          <div className="tpl-icons">
            {ICONS.map((i) => <button key={i} className={`chip ${icon === i ? 'on' : ''}`} onClick={() => setIcon(i)} aria-label={`Icon ${i}`}>{i}</button>)}
          </div>
          <input className="input" placeholder={tpl.id === 'blank' ? 'Board name' : tpl.name} value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Board name"
            onKeyDown={(e) => { if (e.key === 'Enter') confirmPick() }} />
        </div>
      )}
      {saved && <p className="ok-msg">✓ Saved “{saved}”. It now appears in this list and when you create a board.</p>}
      <div className="tpl-grid">
        {all.map((t) => {
          const mine = userTemplates.some((u) => u.id === t.id)
          return (
            <div key={t.id} className={`tpl-card ${picked === t.id ? 'on' : ''}`} role="button" tabIndex={0}
              onClick={() => setPicked(t.id)} onDoubleClick={() => { setPicked(t.id); confirmPick() }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(t.id) } }}>
              <TemplatePreview template={t} />
              <div className="tpl-name">{t.icon} {t.name}{mine && <span className="tpl-mine">yours</span>}</div>
              <div className="tpl-desc">{t.description}</div>
              {mine && (
                <button className="link-del tpl-del" aria-label={`Delete template ${t.name}`}
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Delete the “${t.name}” template?`)) { deleteTemplate(t.id); if (picked === t.id) setPicked(all[0].id) } }}>✕</button>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
