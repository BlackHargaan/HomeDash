import { useMemo, useRef, useState } from 'react'
import { useWidgetState } from '../lib/storage.js'
import { calculate } from '../lib/calc.js'

const EXAMPLES = ['15% of 80', '5 km to mi', '72 f to c', 'sqrt(2)^2', '3 cups to ml', '1.5 GiB to MB']

export default function CalculatorWidget({ widget }) {
  const [history, setHistory] = useWidgetState(widget.id, [])
  const [input, setInput] = useState('')
  const [copied, setCopied] = useState(null)
  const inputRef = useRef(null)
  const ans = history[0]?.value

  const preview = useMemo(() => {
    if (!input.trim()) return null
    try { return { ok: true, ...calculate(input, { ans }) } } catch (e) { return { ok: false, error: e.message } }
  }, [input, ans])

  function submit(e) {
    e.preventDefault()
    if (!preview?.ok) return
    setHistory((h) => [{ expr: input.trim(), text: preview.text, value: preview.value }, ...h].slice(0, 25))
    setInput('')
  }

  async function copy(text, key) {
    try { await navigator.clipboard.writeText(text.replace(/,/g, '')); setCopied(key); setTimeout(() => setCopied(null), 1200) } catch { /* ignore */ }
  }

  function reuse(expr) {
    setInput(expr)
    inputRef.current?.focus()
  }

  return (
    <div className="calc no-drag">
      <form className="calc-box" onSubmit={submit}>
        <input ref={inputRef} className="input calc-input" value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="2 * (3 + 4), 5 km to mi…" aria-label="Expression" autoComplete="off" spellCheck={false}
          onKeyDown={(e) => { if (e.key === 'ArrowUp' && !input && history[0]) { e.preventDefault(); setInput(history[0].expr) } }} />
        <div className={`calc-preview ${preview && !preview.ok ? 'err' : ''}`} aria-live="polite">
          {preview ? (preview.ok ? <>= <b>{preview.text}</b></> : preview.error) : <span className="faint">Type a sum or a conversion · Enter to keep it</span>}
        </div>
      </form>

      {history.length === 0 ? (
        <div className="calc-examples">
          {EXAMPLES.map((ex) => <button key={ex} className="chip" onClick={() => reuse(ex)}>{ex}</button>)}
        </div>
      ) : (
        <div className="calc-history">
          {history.map((h, i) => (
            <div key={i} className="calc-row">
              <button className="calc-expr" onClick={() => reuse(h.expr)} title="Edit again">{h.expr}</button>
              <button className="calc-result" onClick={() => copy(h.text, i)} title="Copy result">{copied === i ? 'Copied' : h.text}</button>
            </div>
          ))}
          <button className="btn sm ghost calc-clear" onClick={() => setHistory([])}>Clear history</button>
        </div>
      )}
      <div className="faint calc-hint">Use <code>ans</code> for the last result · ↑ recalls it</div>
    </div>
  )
}
