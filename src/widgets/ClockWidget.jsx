import { useEffect, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'

function greeting(h) {
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function ClockWidget() {
  const { userName } = useDashboard()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const seconds = now.toLocaleTimeString(undefined, { second: '2-digit' }).replace(/\D/g, '')
  const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="clock">
      <div className="clock-time">
        {time}
        <span className="clock-secs">{seconds}</span>
      </div>
      <div className="clock-date">{date}</div>
      <div className="clock-greet">
        {greeting(now.getHours())}{userName ? `, ${userName}` : ''}.
      </div>
    </div>
  )
}
