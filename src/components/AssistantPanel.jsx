import { useEffect } from 'react'
import { useAssistant } from '../context/AssistantContext.jsx'
import AssistantChat from './AssistantChat.jsx'

// Slide-over chat, opened from the ✨ button, ⌘J or the command palette.
export default function AssistantPanel({ onOpenSettings }) {
  const { panelOpen, setPanelOpen } = useAssistant()

  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setPanelOpen(false) }
    window.addEventListener('keydown', onKey)
    // Focus the composer when the panel opens.
    setTimeout(() => document.querySelector('.ai-panel .ai-input')?.focus(), 50)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen, setPanelOpen])

  if (!panelOpen) return null
  return (
    <>
      <div className="ai-scrim" onClick={() => setPanelOpen(false)} />
      <aside className="ai-panel glass" role="dialog" aria-label="Assistant">
        <header className="ai-panel-head">
          <b>✨ Assistant</b>
          <span className="spacer" />
          <button className="wtool" onClick={() => setPanelOpen(false)} aria-label="Close assistant">✕</button>
        </header>
        <AssistantChat onOpenSettings={() => { setPanelOpen(false); onOpenSettings?.() }} />
      </aside>
    </>
  )
}
