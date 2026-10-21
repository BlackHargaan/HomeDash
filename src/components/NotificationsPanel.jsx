import { useEffect, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { useServer } from '../context/ServerContext.jsx'
import { requestNotifyPermission, notifyPermission, notifySupported } from '../lib/notify.js'
import { pushUnavailableReason, pushEndpoint, enablePush, disablePush, checkPush, testPush } from '../lib/push.js'

export default function NotificationsPanel() {
  const { notifyEnabled, setNotifyEnabled } = useDashboard()
  const { status } = useServer()
  const [pushOn, setPushOn] = useState(!!pushEndpoint())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { ok, text }
  const reason = status === 'checking' ? 'Checking for the HomeDash server…' : pushUnavailableReason()

  useEffect(() => { checkPush().then(setPushOn) }, [status])

  async function toggleNotify() {
    if (notifyEnabled) { setNotifyEnabled(false); return }
    const perm = await requestNotifyPermission()
    setNotifyEnabled(perm === 'granted')
  }

  async function togglePush() {
    setBusy(true)
    setMsg(null)
    try {
      if (pushOn) {
        await disablePush()
        setPushOn(false)
      } else {
        await enablePush()
        setPushOn(true)
        if (!notifyEnabled) setNotifyEnabled(true)
        setMsg({ ok: true, text: 'This device will get reminders even when HomeDash is closed.' })
      }
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'Could not turn on push' })
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setMsg(null)
    try {
      const { results } = await testPush()
      const ok = results.some((r) => r.ok)
      setMsg(ok ? { ok: true, text: 'Test sent — it should pop up in a moment.' } : { ok: false, text: `The push service answered ${results[0]?.status || 'with an error'}.` })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  if (!notifySupported()) {
    return (
      <div className="field">
        <label>Notifications</label>
        <span className="faint" style={{ fontSize: 12 }}>This browser doesn’t support notifications.</span>
      </div>
    )
  }

  return (
    <div className="field">
      <label>Notifications</label>
      <button className={`chip ${notifyEnabled ? 'on' : ''}`} onClick={toggleNotify} style={{ alignSelf: 'flex-start' }}>
        {notifyEnabled ? '🔔 Reminders on' : '🔕 Enable reminders'}
      </button>
      <span className="faint" style={{ fontSize: 12 }}>
        Alerts before timed events and at 9:00 for tasks due that day.
        {notifyPermission() === 'denied' && ' Notifications are blocked in your browser settings.'}
      </span>

      <div className="push-box">
        <div className="row" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 13 }}>Push to this device</b>
            <div className="faint" style={{ fontSize: 12 }}>
              {reason || 'Your HomeDash server sends reminders here even when every HomeDash tab is closed — great on a phone with HomeDash installed.'}
            </div>
          </div>
          {!reason && (
            <button className={`btn sm ${pushOn ? '' : 'primary'}`} onClick={togglePush} disabled={busy} style={{ flex: '0 0 auto' }}>
              {busy ? '…' : pushOn ? 'Turn off' : 'Turn on'}
            </button>
          )}
        </div>
        {!reason && pushOn && <button className="btn sm ghost" onClick={test} disabled={busy} style={{ alignSelf: 'flex-start' }}>Send a test</button>}
        {msg && <span className={msg.ok ? 'ok-msg' : 'err-msg'}>{msg.text}</span>}
      </div>
    </div>
  )
}
