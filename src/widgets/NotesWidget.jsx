import { useWidgetState } from '../lib/storage.js'

export default function NotesWidget({ widget }) {
  const [text, setText] = useWidgetState(widget.id, '')

  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <div className="notes no-drag">
      <textarea
        className="notes-area"
        placeholder="Jot something down…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="notes-foot faint">{words} word{words === 1 ? '' : 's'}</div>
    </div>
  )
}
