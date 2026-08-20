# 🗂️ HomeDash

Your day, organized. A customizable **bento-grid productivity dashboard** for
everyday use — think Homarr/homepage, but built around calendars, tasks, habits
and focus rather than server monitoring.

Everything lives in your browser (localStorage) — no accounts, no backend, no
tracking. Drag, drop and resize widgets into a layout that's yours.

## Features

- **Multiple dashboards** — keep separate boards (e.g. *Home* and *Work*) as
  tabs; each has its own layout, while your tasks/events/habits stay shared.
- **Bento grid** — drag-to-rearrange, resize-from-the-corner widget layout that
  remembers where you put everything. Toggle **Edit** mode to rearrange, rename,
  add or remove widgets.
- **Responsive** — the desktop grid gives way to an auto-arranging content-flow
  layout on tablets and phones (multi-column → single column), and widget
  contents scale to their own width via CSS container queries.
- **⌘K command palette** — switch boards, add widgets, quick-add a task, create
  an event from natural language, toggle theme, and more.
- **Glassmorphism UI**, dark-first with a light theme, 6 accent colors and 4
  wallpapers.
- **Full calendar** — month, week & agenda views; click any day to create
  events, edit colors/times/notes, delete. Tasks with due dates surface here too.
  - **Recurring events** — daily/weekly/monthly/yearly repeats with intervals,
    counts, end dates, weekly by-day rules and exception dates. Imported rules
    are honored; new events get a simple **Repeat** picker.
  - **Reminders** — get a browser notification a chosen time before an event
    (and when tasks are due today).
  - **Import `.ics`** files from Google, Apple or Outlook, **sync from a URL**
    (your Google Calendar *“secret iCal address”*), and **export** back to `.ics`.
  - **Natural-language add** — “Lunch with Sam tomorrow 1pm” becomes an event.
- **Tasks** — due dates, priorities, filters, and a running "left" count.
- **Today panel** — next event, top tasks and habits due, at a glance.
- **Habit tracker** — 7-day grid with streaks 🔥.
- **Pomodoro** — focus/break cycles with a progress ring; feeds the Stats widget.
- **Clock & date** with a time-aware greeting, **Weather** (free, key-less
  [Open-Meteo](https://open-meteo.com) — current + hourly + daily), **World
  clocks**, a **Countdown** to any date, a **Notes** scratchpad, and a **Quick
  Links** launcher with auto favicons.
- **Stats** — at-a-glance tiles (tasks done, habits, upcoming events) plus a
  weekly focus sparkline, aggregated live from your other widgets.

### 💾 Backup & cloud sync

Everything lives in your browser by default. You can **export/import a JSON
backup** anytime, and optionally turn on **cross-device cloud sync** with your
own free [Supabase](https://supabase.com) project — paste your Project URL and
anon key in Settings, run the one-time SQL it shows you, and sign in. Sync is
last-write-wins with automatic background push/pull; auth tokens never leave the
device or enter the synced data.

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

## Self-hosting with Docker

HomeDash builds to static files, so the image is a tiny nginx container (no
Node at runtime). Data lives in each visitor's browser — the container is
stateless, so there are no volumes to manage.

**Docker Compose** (recommended):

```bash
docker compose up -d --build
```

Then open **http://localhost:8080**. Change the host port by editing the
`ports` mapping in `docker-compose.yml` (e.g. `- "3000:80"`).

**Plain Docker:**

```bash
docker build -t homedash .
docker run -d --name homedash -p 8080:80 --restart unless-stopped homedash
```

The image is a multi-stage build (`node:20-alpine` to build → `nginx:alpine`
to serve) with gzip, long-lived caching for hashed assets, an SPA fallback and
a container healthcheck. Put it behind your reverse proxy (Traefik, Caddy,
nginx-proxy, etc.) for TLS and a hostname, just like Homarr/homepage.

> Weather and (optional) cloud sync are called from the browser, so the
> container itself needs no API keys or outbound configuration.

### Deploying in Portainer

Portainer's Stack **web editor can't build from a `Dockerfile`** (there's no
build context), so use one of these:

**Option A — pull the pre-built image (recommended).**
The included GitHub Action (`.github/workflows/docker-publish.yml`) publishes an
image to GHCR on every push to `main`. Make the package public once (GitHub →
your profile → Packages → `homedash` → Package settings → change visibility to
Public), then in Portainer create a **Stack → Web editor** and paste:

```yaml
services:
  homedash:
    image: ghcr.io/blackhargaan/homedash:latest
    container_name: homedash
    ports:
      - "8080:80"
    restart: unless-stopped
```

Deploy, then browse to `http://<host>:8080`. To update later, use Portainer's
**Recreate** (with "Re-pull image") or add a watchtower/Portainer webhook.
If you keep the GHCR package private, add a registry in Portainer first
(**Registries → Add → Custom**, `ghcr.io`, your GitHub username + a PAT with
`read:packages`).

**Option B — let Portainer build from Git (no registry).**
Create a **Stack → Repository**, point it at this repo's URL, set the compose
path to `docker-compose.yml`, and deploy. Portainer clones the repo and builds
the image on the host using the `Dockerfile`.

## Architecture

```
src/
  main.jsx                 # entry — mounts <App> inside <DashboardProvider>
  App.jsx                  # top bar (Add widget / Edit / Settings) + <Grid>
  context/
    DashboardContext.jsx   # theme, boards, layouts, shared data stores
    SyncContext.jsx        # Supabase cloud-sync state machine (push/pull)
  components/
    Grid.jsx               # react-grid-layout bento grid
    WidgetShell.jsx        # glass card chrome around every widget
    BoardTabs.jsx          # multi-dashboard tabs
    CommandPalette.jsx     # ⌘K launcher
    Reminders.jsx          # headless notification runner
    Modal.jsx              # reusable modal
    AddWidgetModal.jsx     # widget catalog
    SettingsModal.jsx      # theme / notifications / backup / cloud sync
    CloudSyncPanel.jsx     # Supabase config + sign in
  widgets/
    registry.js            # widget catalog metadata (sizes, names, icons)
    index.js               # type → component map
    *Widget.jsx            # one file per widget
  lib/
    storage.js             # localStorage hooks + backup/restore + change events
    date.js                # calendar/date helpers
    ics.js                 # iCalendar parse + serialize (incl. RRULE/EXDATE)
    recurrence.js          # RRULE expansion (range-bounded)
    nlp.js                 # natural-language event parsing
    notify.js              # Notification API wrapper
    supabase.js            # Supabase auth + state REST client (no SDK)
  styles/
    index.css              # tokens, glass, wallpapers, grid, tabs, palette
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
