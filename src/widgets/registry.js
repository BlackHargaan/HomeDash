// Widget catalog: metadata only (no component imports) so this file can be
// consumed by the dashboard context without creating an import cycle.
// Grid sizes are in react-grid-layout units (12-column grid, ~70px rows).

export const WIDGET_TYPES = {
  clock: {
    name: 'Clock & Date',
    icon: '🕐',
    description: 'Live time, date and a greeting.',
    layout: { w: 3, h: 3, minW: 2, minH: 2 },
  },
  weather: {
    name: 'Weather',
    icon: '⛅',
    description: 'Current conditions and a short forecast for any city.',
    layout: { w: 3, h: 4, minW: 2, minH: 3 },
  },
  calendar: {
    name: 'Calendar',
    icon: '📅',
    description: 'Full month/week calendar with events, .ics import & sync.',
    layout: { w: 6, h: 8, minW: 4, minH: 6 },
    singleton: true,
  },
  tasks: {
    name: 'Tasks',
    icon: '✅',
    description: 'To-do list with due dates, priorities and filters.',
    layout: { w: 3, h: 8, minW: 2, minH: 4 },
    singleton: true,
  },
  notes: {
    name: 'Notes',
    icon: '📝',
    description: 'A quick scratchpad / sticky note.',
    layout: { w: 3, h: 5, minW: 2, minH: 3 },
  },
  links: {
    name: 'Quick Links',
    icon: '🔗',
    description: 'A grid of shortcuts to your favorite apps & sites.',
    layout: { w: 4, h: 5, minW: 2, minH: 3 },
  },
  habits: {
    name: 'Habit Tracker',
    icon: '🔥',
    description: 'Track daily habits and build streaks.',
    layout: { w: 4, h: 6, minW: 3, minH: 4 },
    singleton: true,
  },
  pomodoro: {
    name: 'Pomodoro',
    icon: '🍅',
    description: 'Focus timer with work/break cycles.',
    layout: { w: 3, h: 5, minW: 2, minH: 4 },
  },
  stats: {
    name: 'Stats',
    icon: '📊',
    description: 'At-a-glance productivity tiles.',
    layout: { w: 3, h: 4, minW: 2, minH: 3 },
  },
  today: {
    name: 'Today',
    icon: '☀️',
    description: "Your next event, top tasks and habits due — today at a glance.",
    layout: { w: 4, h: 6, minW: 3, minH: 4 },
    singleton: true,
  },
  kanban: {
    name: 'Kanban Board',
    icon: '🗃️',
    description: 'Drag cards across To do / Doing / Done columns.',
    layout: { w: 6, h: 7, minW: 4, minH: 4 },
  },
  countdown: {
    name: 'Countdown',
    icon: '⏳',
    description: 'Count down (or up) to any date — trips, launches, birthdays.',
    layout: { w: 3, h: 3, minW: 2, minH: 2 },
  },
  worldclock: {
    name: 'World Clocks',
    icon: '🌍',
    description: 'Live time across multiple cities and time zones.',
    layout: { w: 3, h: 5, minW: 2, minH: 3 },
  },
  embed: {
    name: 'Custom Embed',
    icon: '🧩',
    description: 'Embed any website or self-hosted service by URL (iframe).',
    layout: { w: 4, h: 6, minW: 2, minH: 3 },
  },
  iframeStat: {
    name: 'Custom Integration',
    icon: '⚙️',
    description: 'Pull a value from a JSON API and show it as a live tile.',
    layout: { w: 3, h: 3, minW: 2, minH: 2 },
  },
}

export function widgetMeta(type) {
  return WIDGET_TYPES[type] || null
}

export const ACCENTS = {
  indigo: '#8b93ff',
  violet: '#b98bff',
  cyan: '#5ad4e6',
  emerald: '#4fd1a5',
  amber: '#f6c667',
  rose: '#ff8fab',
}

export const EVENT_COLORS = ['indigo', 'violet', 'cyan', 'emerald', 'amber', 'rose']
