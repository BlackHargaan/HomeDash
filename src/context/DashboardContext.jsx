import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react'
import { usePersistentState, readStore, uid } from '../lib/storage.js'
import { WIDGET_TYPES, widgetMeta } from '../widgets/registry.js'

const DashboardContext = createContext(null)

const HOME_BOARD = 'board_home'

function defaultBoards() {
  return [{ id: HOME_BOARD, name: 'Home', icon: '🏠' }]
}

// Boards each own a widget layout; `events`/`tasks`/`habits` stay global. On
// first run we migrate any pre-boards single "widgets" key onto the Home board.
function loadInitialBoardData() {
  const existing = readStore('widgetsByBoard', null)
  if (existing) return existing
  const legacy = readStore('widgets', null)
  return { [HOME_BOARD]: legacy || defaultWidgets() }
}

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
  const [editMode, setEditMode] = useState(false)

  // Multiple boards. Widgets for every board live in one object keyed by board id.
  const [boards, setBoards] = usePersistentState('boards', defaultBoards)
  const [activeBoardId, setActiveBoardId] = usePersistentState('activeBoard', HOME_BOARD)
  const [widgetsByBoard, setWidgetsByBoard] = usePersistentState('widgetsByBoard', loadInitialBoardData)

  // Guard against a dangling active board id (e.g. after a deletion).
  const boardId = boards.some((b) => b.id === activeBoardId) ? activeBoardId : boards[0]?.id
  const widgets = widgetsByBoard[boardId] || []

  const setWidgets = useCallback(
    (updater) => {
      setWidgetsByBoard((prev) => {
        const cur = prev[boardId] || []
        const next = typeof updater === 'function' ? updater(cur) : updater
        return { ...prev, [boardId]: next }
      })
    },
    [boardId, setWidgetsByBoard],
  )

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

  // ---- Board management ----
  const switchBoard = useCallback((id) => setActiveBoardId(id), [setActiveBoardId])

  const addBoard = useCallback(
    (name = 'New board', icon = '🗂️') => {
      const id = uid('board')
      setBoards((prev) => [...prev, { id, name, icon }])
      setWidgetsByBoard((prev) => ({ ...prev, [id]: [] }))
      setActiveBoardId(id)
      return id
    },
    [setBoards, setWidgetsByBoard, setActiveBoardId],
  )

  const renameBoard = useCallback(
    (id, patch) => setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b))),
    [setBoards],
  )

  const removeBoard = useCallback(
    (id) => {
      setBoards((prev) => {
        if (prev.length <= 1) return prev // never delete the last board
        const next = prev.filter((b) => b.id !== id)
        if (id === activeBoardId) setActiveBoardId(next[0].id)
        return next
      })
      setWidgetsByBoard((prev) => {
        const { [id]: _drop, ...rest } = prev
        return rest
      })
    },
    [setBoards, setWidgetsByBoard, activeBoardId, setActiveBoardId],
  )

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
    // boards
    boards, activeBoardId: boardId, switchBoard, addBoard, renameBoard, removeBoard,
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
