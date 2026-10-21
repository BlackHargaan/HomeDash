import { useRef, useState } from 'react'
import Modal from '../../components/Modal.jsx'
import { serverUsable } from '../../lib/server.js'
import { parseICS, icsCalendarName } from '../../lib/ics.js'

// Import an .ics file into its own calendar, subscribe to a feed URL (kept in
// sync automatically), or export everything.
export default function ImportModal({ onClose, onImportFile, onSubscribe, onExport }) {
  const fileRef = useRef(null)
  const [url, setUrl] = useState('')
  const [feed, setFeed] = useState(null) // 'loading' | { ok: n, name } | { error }
  const [file, setFile] = useState(null)

  function pickFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result)
      const events = parseICS(text)
      const name = icsCalendarName(text) || f.name.replace(/\.ics$/i, '')
      if (!events.length) { setFile({ error: 'No events found in that file' }); return }
      onImportFile(name, events)
      setFile({ ok: events.length, name })
    }
    reader.readAsText(f)
  }

  async function subscribe(e) {
    e?.preventDefault()
    if (!url.trim()) return
    setFeed('loading')
    try {
      setFeed(await onSubscribe(url.trim()))
    } catch (err) {
      setFeed({ error: err.message })
    }
  }

  return (
    <Modal title="Import & Sync" onClose={onClose}>
      <div className="import-section">
        <h3>Subscribe to a calendar feed</h3>
        <p className="faint">
          Google Calendar → Settings → your calendar → “Secret address in iCal format” (or any <code>.ics</code> link:
          iCloud, Outlook, holidays, sports…). It becomes its own calendar and refreshes every 30 minutes.
        </p>
        <form className="row" onSubmit={subscribe}>
          <input className="input" placeholder="https://calendar.google.com/…/basic.ics" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn primary" style={{ flex: '0 0 auto' }} type="submit" disabled={feed === 'loading'}>
            {feed === 'loading' ? 'Syncing…' : 'Subscribe'}
          </button>
        </form>
        {feed?.ok !== undefined && <p className="ok-msg">✓ Added “{feed.name}” with {feed.ok} events.</p>}
        {feed?.error && (
          <p className="err-msg">
            Couldn’t sync: {feed.error}.
            {!serverUsable() && ' Without the HomeDash server, many calendar hosts (including Google) block this request — run HomeDash with its server or the desktop app, or import the .ics file instead.'}
          </p>
        )}
      </div>

      <div className="import-section">
        <h3>Import an .ics file</h3>
        <p className="faint">A one-time copy of an exported Google, Apple or Outlook calendar. It goes into a calendar named after the file.</p>
        <button className="btn" onClick={() => fileRef.current?.click()}>📄 Choose .ics file…</button>
        <input ref={fileRef} type="file" accept=".ics,text/calendar" hidden onChange={pickFile} />
        {file?.ok && <p className="ok-msg">✓ Imported {file.ok} events into “{file.name}”.</p>}
        {file?.error && <p className="err-msg">{file.error}.</p>}
      </div>

      <div className="import-section">
        <h3>Export</h3>
        <p className="faint">Download all your HomeDash events as an .ics file.</p>
        <button className="btn" onClick={onExport}>⇧ Export .ics</button>
      </div>
    </Modal>
  )
}
