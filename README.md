# 🗂️ HomeDash

Your day, organized. A customizable **bento-grid productivity dashboard** for
everyday use — think Homarr/homepage, but built around calendars, tasks, habits
and focus rather than server monitoring.

Everything lives in your browser (localStorage) — no accounts, no backend, no
tracking. Drag, drop and resize widgets into a layout that's yours.

## Features

- **Bento grid** — drag-to-rearrange, resize-from-the-corner widget layout that
  remembers where you put everything. Toggle **Edit** mode to rearrange, add or
  remove widgets.
- **Glassmorphism UI**, dark-first with a light theme, 6 accent colors and 4
  wallpapers.
- **Full calendar** — month & week views, click any day to create events, edit
  colors/times/notes, delete. Tasks with due dates surface on the calendar too.
  - **Import `.ics`** files exported from Google, Apple or Outlook calendars.
  - **Sync from a URL** — paste your Google Calendar *“secret address in iCal
    format”* (`…/basic.ics`) and re-sync any time; events update in place.
  - **Export** all your events back out as `.ics`.
- **Tasks** — due dates, priorities, filters, and a running "left" count.
- **Habit tracker** — 7-day grid with streaks 🔥.
- **Pomodoro** — focus/break cycles with a progress ring; feeds the Stats widget.
- **Clock & date** with a time-aware greeting, **Weather** (free, key-less
  [Open-Meteo](https://open-meteo.com) — search any city or use your location),
  **Notes** scratchpad, and a **Quick Links** launcher with auto favicons.
- **Stats** — at-a-glance tiles (tasks done, habits, upcoming events) plus a
  weekly focus sparkline, aggregated live from your other widgets.

### 🧩 Custom widgets & integrations

Two escape hatches let you extend HomeDash without touching code:

- **Custom Embed** — embed any website or self-hosted service (Grafana, a
  notebook, an internal dashboard) by URL as a sandboxed iframe.
- **Custom Integration** — point at any JSON API, drill into a value with a
  dot-path (e.g. `results[0].count`), add a label/prefix/suffix and a refresh
  interval, and display it as a live tile. Great for home-lab metrics, tickers
  or API counts. *(The endpoint must allow cross-origin requests.)*

Want a brand-new widget **type**? It's a small, well-defined contract — see
[Adding a widget](#adding-a-widget-type) below.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build → dist/
npm run preview  # preview the production build
```

Requires Node 18+.

## Architecture

```
src/
  main.jsx                 # entry — mounts <App> inside <DashboardProvider>
  App.jsx                  # top bar (Add widget / Edit / Settings) + <Grid>
  context/
    DashboardContext.jsx   # theme, layout, widget list, shared data stores
  components/
    Grid.jsx               # react-grid-layout bento grid
    WidgetShell.jsx        # glass card chrome around every widget
    Modal.jsx              # reusable modal
    AddWidgetModal.jsx     # widget catalog
    SettingsModal.jsx      # theme / accent / wallpaper / name / reset
  widgets/
    registry.js            # widget catalog metadata (sizes, names, icons)
    index.js               # type → component map
    *Widget.jsx            # one file per widget
  lib/
    storage.js             # localStorage hooks (usePersistentState, useWidgetState)
    date.js                # calendar/date helpers
    ics.js                 # iCalendar parse + serialize
  styles/
    index.css              # tokens, glass, wallpapers, grid, forms, modal
    widgets.css            # per-widget styles
```

**Data model.** The dashboard layout and per-instance widget settings live in
`localStorage` under the `homedash:` prefix. Cross-widget data (`events`,
`tasks`, `habits`, `pomoStats`) is held in `DashboardContext` so, for example,
the Stats and Calendar widgets can read what the Tasks and Pomodoro widgets
write.

### Adding a widget type

1. Add an entry to `WIDGET_TYPES` in `src/widgets/registry.js` (name, icon,
   description, default grid size; set `singleton: true` for one-per-board
   widgets).
2. Create `src/widgets/MyWidget.jsx` exporting a component that receives
   `{ widget }`. Use `useWidgetState(widget.id, initial)` for per-instance data
   or `useDashboard()` for shared stores.
3. Register it in the `WIDGET_COMPONENTS` map in `src/widgets/index.js`.

That's it — it shows up in the **Add widget** catalog automatically.

## Tech

React 18 · Vite · [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout)
· Open-Meteo. No other runtime dependencies.
