import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react'
import { usePersistentState, readStore, writeStore, uid } from '../lib/storage.js'
import { WIDGET_TYPES, widgetMeta } from '../widgets/registry.js'
import { DEFAULT_CALENDARS } from '../widgets/calendar/helpers.js'
import { fontStack, PAPER_FONTS, resolveTheme } from '../lib/appearance.js'
import { instantiate, templateById, templateFromWidgets } from '../lib/templates.js'

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
  return instantiate(templateById('productivity'))
}

export function DashboardProvider({ children }) {
  const [theme, setTheme] = usePersistentState('theme', 'dark') // 'dark' | 'light' | 'system'
  const [uiStyle, setUiStyle] = usePersistentState('uiStyle', 'glass') // 'glass' | 'paper'
  const [prefersDark, setPrefersDark] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches)
  const resolvedTheme = resolveTheme(theme, prefersDark)
  const [accent, setAccent] = usePersistentState('accent', 'indigo')
  const [wallpaper, setWallpaper] = usePersistentState('wallpaper', 'aurora')
  const [userName, setUserName] = usePersistentState('userName', '')
  const [notifyEnabled, setNotifyEnabled] = usePersistentState('notify', false)
  const [density, setDensity] = usePersistentState('density', 'cozy')
  const [font, setFont] = usePersistentState('font', 'default')
  // Uploaded (data: URL) or linked wallpaper image, used when wallpaper === 'image'.
  const [wallpaperImage, setWallpaperImage] = usePersistentState('wallpaperImage', '')
  const [wallpaperDim, setWallpaperDim] = usePersistentState('wallpaperDim', 35)
  const [wallpaperBlur, setWallpaperBlur] = usePersistentState('wallpaperBlur', 0)
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
  const [calendars, setCalendars] = usePersistentState('calendars', DEFAULT_CALENDARS)
  const [tasks, setTasks] = usePersistentState('tasks', [])
  const [habits, setHabits] = usePersistentState('habits', [])
  const [pomoStats, setPomoStats] = usePersistentState('pomoStats', { sessions: 0, focusMinutes: 0, byDay: {} })

  // Follow the OS light/dark setting while the theme is "system".
  useEffect(() => {
    if (theme !== 'system' || typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => setPrefersDark(e.matches)
    setPrefersDark(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = resolvedTheme
    root.dataset.style = uiStyle
    root.dataset.accent = accent
    root.dataset.wallpaper = wallpaper === 'image' && !wallpaperImage ? 'aurora' : wallpaper
    root.dataset.density = density
    // Paper brings its own typeface unless another font was picked.
    root.style.setProperty('--font', uiStyle === 'paper' && font === 'default' ? PAPER_FONTS.sans : fontStack(font))
    // Browser / phone chrome matches the page background.
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#0b0f1a')
  }, [resolvedTheme, uiStyle, accent, wallpaper, wallpaperImage, density, font])

  // Let the server (MCP, push) know the user's time zone.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && readStore('timezone', null) !== tz) writeStore('timezone', tz)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (wallpaperImage) root.style.setProperty('--wp-image', `url("${wallpaperImage.replace(/"/g, '%22')}")`)
    else root.style.removeProperty('--wp-image')
    root.style.setProperty('--wp-dim', String(Math.min(90, Math.max(0, wallpaperDim)) / 100))
    root.style.setProperty('--wp-blur', `${Math.min(30, Math.max(0, wallpaperBlur))}px`)
  }, [wallpaperImage, wallpaperDim, wallpaperBlur])

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
    (name = 'New board', icon = '🗂️', boardWidgets = []) => {
      const id = uid('board')
      setBoards((prev) => [...prev, { id, name, icon }])
      setWidgetsByBoard((prev) => ({ ...prev, [id]: boardWidgets }))
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

  // ---- Layout templates ----
  const [userTemplates, setUserTemplates] = usePersistentState('templates', [])

  const applyTemplate = useCallback(
    (id) => {
      const tpl = templateById(id, userTemplates)
      if (tpl) setWidgets(instantiate(tpl))
    },
    [userTemplates, setWidgets],
  )

  const saveTemplate = useCallback(
    (name, icon) => {
      const tpl = templateFromWidgets(name, icon, widgets)
      setUserTemplates((prev) => [...prev, tpl])
      return tpl
    },
    [widgets, setUserTemplates],
  )

  const deleteTemplate = useCallback(
    (id) => setUserTemplates((prev) => prev.filter((t) => t.id !== id)),
    [setUserTemplates],
  )

  const value = {
    theme, setTheme, resolvedTheme,
    uiStyle, setUiStyle,
    accent, setAccent,
    wallpaper, setWallpaper,
    userName, setUserName,
    notifyEnabled, setNotifyEnabled,
    density, setDensity,
    font, setFont,
    wallpaperImage, setWallpaperImage,
    wallpaperDim, setWallpaperDim,
    wallpaperBlur, setWallpaperBlur,
    widgets, setWidgets,
    editMode, setEditMode,
    addWidget, removeWidget, updateWidget, applyLayout, resetBoard,
    existingTypes,
    types: WIDGET_TYPES,
    // boards
    boards, activeBoardId: boardId, switchBoard, addBoard, renameBoard, removeBoard,
    userTemplates, applyTemplate, saveTemplate, deleteTemplate,
    // shared stores
    events, setEvents,
    calendars, setCalendars,
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
