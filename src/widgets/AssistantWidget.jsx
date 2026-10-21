import AssistantChat from '../components/AssistantChat.jsx'

// The ✨ panel's conversation, docked on the board.
export default function AssistantWidget() {
  return (
    <div className="no-drag" style={{ height: '100%' }}>
      <AssistantChat compact onOpenSettings={() => window.dispatchEvent(new CustomEvent('homedash:open-settings', { detail: { section: 'ai' } }))} />
    </div>
  )
}
