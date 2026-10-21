import { useEffect, useRef } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { useServer } from '../context/ServerContext.jsx'
import { readStore, writeStore } from '../lib/storage.js'
import { fireNotification, notifyPermission } from '../lib/notify.js'
import { reminderSchedule, dueNow, pruneFired } from '../lib/reminders.js'
import { serverApi } from '../lib/server.js'
import { pushEndpoint } from '../lib/push.js'

const FIRED = 'sync:reminderFired' // device-local: each device notifies for itself
const UPLOAD_DEBOUNCE_MS = 4000
const UPLOAD_EVERY_MS = 6 * 3600 * 1000

// Headless component.
//  • While reminders are on, checks every 30 s and shows a notification for
//    timed events entering their reminder window and tasks due today — unless
//    this device gets them as server pushes instead.
//  • With the HomeDash server, uploads the coming week's reminders so the
//    server can push them to subscribed devices when no tab is open.
export default function Reminders() {
  const { events, tasks, calendars, notifyEnabled } = useDashboard()
  const { status } = useServer()
  const data = useRef({ events, tasks, calendars })
  data.current = { events, tasks, calendars }

  useEffect(() => {
    if (!notifyEnabled || notifyPermission() !== 'granted') return
    const check = () => {
      if (pushEndpoint()) return
      const now = Date.now()
      let fired = pruneFired(readStore(FIRED, {}), now)
      for (const r of dueNow(reminderSchedule({ ...data.current, from: new Date(now), days: 1 }), fired, now)) {
        fireNotification(r.title, r.body, r.tag)
        fired = { ...fired, [r.key]: now }
      }
      writeStore(FIRED, fired)
    }
    check()
    const iv = setInterval(check, 30000)
    return () => clearInterval(iv)
  }, [notifyEnabled])

  useEffect(() => {
    if (status !== 'ready') return
    const upload = () => {
      const items = notifyEnabled ? reminderSchedule({ ...data.current, from: new Date(), days: 7 }) : []
      serverApi.pushSchedule(items).catch(() => { /* older server or offline; try again later */ })
    }
    const t = setTimeout(upload, UPLOAD_DEBOUNCE_MS)
    const iv = setInterval(upload, UPLOAD_EVERY_MS)
    return () => { clearTimeout(t); clearInterval(iv) }
  }, [status, notifyEnabled, events, tasks, calendars])

  return null
}
