import { useEffect, useRef } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { collectOccurrences } from '../lib/recurrence.js'
import { readStore, writeStore } from '../lib/storage.js'
import { fireNotification, notifyPermission } from '../lib/notify.js'
import { toDateKey, fmtTime } from '../lib/date.js'

// Headless component: while notifications are enabled, polls every 30s and
// fires a browser notification for (a) timed events entering their reminder
// lead-time window and (b) tasks due today. Fired ids are remembered for the
// day so nothing double-fires across polls or reloads.
export default function Reminders() {
  const { events, tasks, notifyEnabled } = useDashboard()
  const eventsRef = useRef(events)
  const tasksRef = useRef(tasks)
  eventsRef.current = events
  tasksRef.current = tasks

  useEffect(() => {
    if (!notifyEnabled || notifyPermission() !== 'granted') return

    const check = () => {
      const now = Date.now()
      const today = toDateKey(new Date())
      let fired = readStore('reminderFired', { day: today, ids: {} })
      if (fired.day !== today) fired = { day: today, ids: {} }

      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999)

      for (const inst of collectOccurrences(eventsRef.current, dayStart, dayEnd)) {
        if (inst.allDay) continue
        const lead = typeof inst.reminderMinutes === 'number' ? inst.reminderMinutes : null
        if (lead == null) continue
        const startMs = new Date(inst.start).getTime()
        const key = 'e:' + inst.id
        if (now >= startMs - lead * 60000 && now < startMs && !fired.ids[key]) {
          fireNotification(inst.title, lead === 0 ? 'Starting now' : `Starts at ${fmtTime(inst.start)} (in ~${lead} min)`)
          fired.ids[key] = true
        }
      }

      for (const t of tasksRef.current) {
        if (t.done || t.due !== today) continue
        const key = 't:' + t.id
        if (!fired.ids[key]) {
          fireNotification('Task due today', t.title)
          fired.ids[key] = true
        }
      }

      writeStore('reminderFired', fired)
    }

    check()
    const iv = setInterval(check, 30000)
    return () => clearInterval(iv)
  }, [notifyEnabled])

  return null
}
