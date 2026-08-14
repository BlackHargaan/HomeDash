import { useDashboard } from '../context/DashboardContext.jsx'
import Modal from './Modal.jsx'

export default function AddWidgetModal({ onClose }) {
  const { types, addWidget, existingTypes } = useDashboard()

  function pick(type) {
    addWidget(type)
    onClose()
  }

  return (
    <Modal title="Add a widget" onClose={onClose} wide>
      <div className="catalog">
        {Object.entries(types).map(([type, meta]) => {
          const disabled = meta.singleton && existingTypes.has(type)
          return (
            <button
              key={type}
              className="catalog-card"
              onClick={() => pick(type)}
              disabled={disabled}
            >
              <div className="cicon">{meta.icon}</div>
              <div className="cname">{meta.name}</div>
              <div className="cdesc">{meta.description}</div>
              {disabled && <div className="badge">Already added</div>}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
