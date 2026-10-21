// Board layout templates. A template is a list of widget placements on the
// 12-column grid; instantiating one creates fresh widget ids, so widget data
// (notes, bookmarks…) never leaks between boards. Shared data such as events
// and tasks is global anyway.
import { uid } from './storage.js'
import { widgetMeta } from '../widgets/registry.js'

// [type, x, y, w, h]
export const BUILTIN_TEMPLATES = [
  {
    id: 'productivity', name: 'Productivity', icon: '🏠', description: 'The default board: calendar, tasks, habits and focus timer.',
    widgets: [
      ['clock', 0, 0, 3, 4], ['weather', 3, 0, 3, 4], ['stats', 6, 0, 3, 4], ['pomodoro', 9, 0, 3, 5],
      ['calendar', 0, 4, 6, 8], ['tasks', 6, 4, 3, 8], ['habits', 9, 5, 3, 7],
      ['links', 0, 12, 6, 5], ['notes', 6, 12, 6, 5],
    ],
  },
  {
    id: 'planner', name: 'Planner', icon: '📅', description: 'A big calendar with your day, tasks and a kanban board.',
    widgets: [
      ['calendar', 0, 0, 8, 10], ['today', 8, 0, 4, 6], ['tasks', 8, 6, 4, 8],
      ['kanban', 0, 10, 8, 6], ['countdown', 8, 14, 4, 3],
    ],
  },
  {
    id: 'homelab', name: 'Homelab', icon: '🖥️', description: 'Service status, Docker, bookmarks and feeds for your server.',
    widgets: [
      ['search', 0, 0, 8, 2], ['clock', 8, 0, 4, 2],
      ['status', 0, 2, 4, 6], ['docker', 4, 2, 4, 6], ['bookmarks', 8, 2, 4, 6],
      ['rss', 0, 8, 6, 6], ['github', 6, 8, 6, 6],
    ],
  },
  {
    id: 'student', name: 'Student', icon: '🎓', description: 'Classes, assignments, focus sessions and notes.',
    widgets: [
      ['calendar', 0, 0, 6, 8], ['tasks', 6, 0, 3, 8], ['pomodoro', 9, 0, 3, 5], ['quote', 9, 5, 3, 3],
      ['notebook', 0, 8, 6, 6], ['calculator', 6, 8, 3, 6], ['habits', 9, 8, 3, 6],
    ],
  },
  {
    id: 'reading', name: 'News & reading', icon: '📰', description: 'Search, feeds and a notebook for what you find.',
    widgets: [
      ['search', 0, 0, 12, 2], ['rss', 0, 2, 7, 9], ['quote', 7, 2, 5, 3],
      ['notebook', 7, 5, 5, 6], ['bookmarks', 0, 11, 6, 5], ['worldclock', 6, 11, 6, 5],
    ],
  },
  {
    id: 'minimal', name: 'Minimal', icon: '✨', description: 'Just the essentials, centered.',
    widgets: [
      ['clock', 3, 0, 6, 4], ['search', 3, 4, 6, 2], ['today', 3, 6, 6, 6], ['quote', 3, 12, 6, 3],
    ],
  },
]

export function templateById(id, mine = []) {
  return BUILTIN_TEMPLATES.find((t) => t.id === id) || mine.find((t) => t.id === id) || null
}

// Template placements → fresh widget instances (unknown types are skipped).
export function instantiate(template) {
  return (template?.widgets || []).flatMap((entry) => {
    const [type, x, y, w, h, settings] = Array.isArray(entry)
      ? entry
      : [entry.type, entry.layout?.x, entry.layout?.y, entry.layout?.w, entry.layout?.h, entry.settings]
    const meta = widgetMeta(type)
    if (!meta) return []
    return [{
      id: uid('w'),
      type,
      settings: settings ? { ...settings } : {},
      layout: { x: x ?? 0, y: y ?? 0, w: w ?? meta.layout.w, h: h ?? meta.layout.h },
    }]
  })
}

// A board's current widgets → a reusable template (layout + title/style only;
// each widget's own content stays with the original board).
export function templateFromWidgets(name, icon, widgets) {
  return {
    id: uid('tpl'),
    name,
    icon: icon || '⭐',
    description: `${widgets.length} widget${widgets.length === 1 ? '' : 's'}`,
    widgets: widgets.map((w) => {
      const { title, style } = w.settings || {}
      const settings = {}
      if (title) settings.title = title
      if (style) settings.style = style
      return [w.type, w.layout?.x ?? 0, w.layout?.y ?? 0, w.layout?.w, w.layout?.h, Object.keys(settings).length ? settings : undefined]
    }),
  }
}
