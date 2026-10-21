import { useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { WIDGET_CATEGORIES } from '../widgets/registry.js'
import Modal from './Modal.jsx'

export default function AddWidgetModal({ onClose }) {
  const { types, addWidget, existingTypes } = useDashboard()
  const [query, setQuery] = useState('')

  function pick(type) {
    addWidget(type)
    onClose()
  }

  const q = query.trim().toLowerCase()
  const matches = (type) => {
    const meta = types[type]
    return meta && (!q || `${meta.name} ${meta.description}`.toLowerCase().includes(q))
  }
  // Anything not placed in a category still shows up, at the end.
  const listed = new Set(WIDGET_CATEGORIES.flatMap(([, list]) => list))
  const sections = [...WIDGET_CATEGORIES, ['More', Object.keys(types).filter((t) => !listed.has(t))]]
    .map(([name, list]) => [name, list.filter(matches)])
    .filter(([, list]) => list.length)

  return (
    <Modal title="Add a widget" onClose={onClose} wide>
      <input className="input catalog-search" placeholder="Filter widgets…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter' && sections.length === 1 && sections[0][1].length === 1) pick(sections[0][1][0]) }} />
      {!sections.length && <div className="empty-hint">No widget matches “{query}”.</div>}
      {sections.map(([name, list]) => (
        <section key={name} className="catalog-section">
          <h3 className="catalog-heading">{name}</h3>
          <div className="catalog">
            {list.map((type) => {
              const meta = types[type]
              const disabled = meta.singleton && existingTypes.has(type)
              return (
                <button key={type} className="catalog-card" onClick={() => pick(type)} disabled={disabled}>
                  <div className="cicon">{meta.icon}</div>
                  <div className="cname">{meta.name}</div>
                  <div className="cdesc">{meta.description}</div>
                  {disabled && <div className="badge">Already added</div>}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </Modal>
  )
}
