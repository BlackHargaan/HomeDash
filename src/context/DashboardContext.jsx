import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react'
import { usePersistentState, uid } from '../lib/storage.js'
import { WIDGET_TYPES, widgetMeta } from '../widgets/registry.js'

const DashboardContext = createContext(null)

// The default board a first-time visitor sees.
function defaultWidgets() {
  const mk = (type, x, y) => {
    const m = widgetMeta(type).layout
    return {
      id: uid('w'),
      type,
      settings: {},
      layout: { x, y, w: m.w, h: m.h },
    }
  }
  return [
    mk('clock', 0, 0),
    mk('weather', 3, 0),
    mk('stats', 9, 0),
    mk('calendar', 0, 3),
    mk('tasks', 6, 3),
    mk('pomodoro', 9, 3),
    mk('habits', 0, 11),
    mk('links', 4, 11),
    mk('notes', 8, 11),
  ]
}

export function DashboardProvider({ children }) {
  const [theme, setTheme] = usePersistentState('theme', 'dark')
  const [accent, setAccent] = usePersistentState('accent', 'indigo')
  const [wallpaper, setWallpaper] = usePersistentState('wallpaper', 'aurora')
  const [userName, setUserName] = usePersistentState('userName', '')
  const [widgets, setWidgets] = usePersistentState('widgets', defaultWidgets)
  const [editMode, setEditMode] = useState(false)

  // Shared data stores — multiple widgets (and Stats) read/write these.
  const [events, setEvents] = usePersistentState('events', [])
  const [tasks, setTasks] = usePersistentState('tasks', [])
  const [habits, setHabits] = usePersistentState('habits', [])
  const [pomoStats, setPomoStats] = usePersistentState('pomoStats', { sessions: 0, focusMinutes: 0, byDay: {} })

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.accent = accent
    root.dataset.wallpaper = wallpaper
  }, [theme, accent, wallpaper])

  const addWidget = useCallback(
    (type, settings = {}) => {
      const meta = widgetMeta(type)
      if (!meta) return
      const id = uid('w')
      setWidgets((prev) => {
        if (meta.singleton && prev.some((w) => w.type === type)) return prev
        // Drop new widget at the bottom of the current board.
        const maxY = prev.reduce((acc, w) => Math.max(acc, (w.layout?.y || 0) + (w.layout?.h || 2)), 0)
        return [
          ...prev,
          { id, type, settings, layout: { x: 0, y: maxY, w: meta.layout.w, h: meta.layout.h } },
        ]
      })
      return id
    },
    [setWidgets],
  )

  const removeWidget = useCallback(
    (id) => setWidgets((prev) => prev.filter((w) => w.id !== id)),
    [setWidgets],
  )

  const updateWidget = useCallback(
    (id, patch) =>
      setWidgets((prev) =>
        prev.map((w) => (w.id === id ? { ...w, settings: { ...w.settings, ...patch } } : w)),
      ),
    [setWidgets],
  )

  const applyLayout = useCallback(
    (rglLayout) => {
      setWidgets((prev) =>
        prev.map((w) => {
          const l = rglLayout.find((li) => li.i === w.id)
          return l ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : w
        }),
      )
    },
    [setWidgets],
  )

  const resetBoard = useCallback(() => setWidgets(defaultWidgets()), [setWidgets])

  const existingTypes = useMemo(() => new Set(widgets.map((w) => w.type)), [widgets])

  const value = {
    theme, setTheme,
    accent, setAccent,
    wallpaper, setWallpaper,
    userName, setUserName,
    widgets, setWidgets,
    editMode, setEditMode,
    addWidget, removeWidget, updateWidget, applyLayout, resetBoard,
    existingTypes,
    types: WIDGET_TYPES,
    // shared stores
    events, setEvents,
    tasks, setTasks,
    habits, setHabits,
    pomoStats, setPomoStats,
  }

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider')
  return ctx
}
