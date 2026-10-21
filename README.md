# 🗂️ HomeDash

Your day, organized. A customizable **bento-grid productivity dashboard** for
everyday use — think Homarr/homepage, but built around calendars, tasks, habits
and focus rather than server monitoring.

Drag, drop and resize widgets into a layout that's yours. Run it as a plain
static site (everything stays in your browser), or with its small built-in
server — in Docker or on your PC — for sync across devices, calendar/RSS
fetching and homelab service checks. No accounts, no tracking.

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
- **Make it yours** (Settings → Appearance):
  - **Upload your own wallpaper** (or paste an image URL), with dim and blur
    sliders. Images are shrunk to ~1920px so they sync with everything else.
  - **Density** — Compact, Cozy or Roomy spacing — and a choice of **fonts**
    (Default, Rounded, Humanist, Serif, Mono; system fonts, nothing to download).
  - **Per-widget style** — in Edit mode, the 🎨 button on any widget sets its own
    accent color, card look (Glass, Solid, Clear, Outline), an accent tint, or
    hides its title bar.
- **Layout templates** — start a new board (＋) from Productivity, Planner,
  Homelab, Student, News & reading or Minimal, apply one to the current board,
  or save any board as your own template (Settings → Board layout).
- **Installable app (PWA)** — install HomeDash from the browser (Chrome/Edge:
  menu → *Install HomeDash*; Android: *Add to Home screen*; iPhone: Share → *Add
  to Home Screen*). It opens in its own window and loads offline. Needs HTTPS or
  localhost.
- **Full calendar** — day, week, month & agenda views; click any day to create
  events, edit colors/times/notes, delete. Tasks with due dates surface here too.
  - **Hourly day/week grid** — drag an event to move it, drag its bottom edge to
    change how long it lasts, or drag across empty time to create one.
  - **Multiple calendars** — Personal, Work, subscribed feeds… each with its own
    color, a show/hide toggle, rename and delete (☰ menu).
  - **Search** (⌕) across past and upcoming events and tasks, and **jump to any
    date** by clicking the title.
  - **Recurring events** — daily/weekly/monthly/yearly repeats with intervals,
    counts, end dates, weekly by-day rules and exception dates. Imported rules
    are honored; new events get a simple **Repeat** picker.
  - **Reminders** — a notification a chosen time before an event, and at 9:00
    for tasks due that day. With the HomeDash server, turn on **Push to this
    device** (Settings → Notifications) and the server sends them even when no
    HomeDash tab is open — ideal on a phone with HomeDash installed. Push needs
    HTTPS (or localhost) and a browser with Web Push (Chrome, Edge, Firefox,
    Safari 16.4+ on an installed app).
  - **Import `.ics`** files from Google, Apple or Outlook into their own
    calendar, **subscribe to a feed URL** (your Google Calendar *“secret iCal
    address”*, refreshed every 30 min), and **export** back to `.ics`.
  - **Natural-language add** — “Lunch with Sam tomorrow 1pm” becomes an event.
- **Tasks** — due dates, priorities, filters, and a running "left" count.
- **Search bar** — Google, DuckDuckGo, YouTube, Wikipedia, GitHub… or your own
  engine; `!yt cats`-style shortcuts, URLs open directly, press <kbd>/</kbd> to focus.
- **Calculator & converter** — safe maths (`2 * (3 + 4)^2`, `15% of 80`, `ans / 2`)
  and unit conversions (`5 km to mi`, `72 f to c`, `3 cups to ml`, `1.5 GiB to MB`).
- **RSS reader** — RSS and Atom feeds merged newest-first, with unread tracking.
  Feeds are fetched through the HomeDash server when it's running (most sites
  block browser requests).
- **Bookmark groups** — collapsible groups, drag links between them, and import
  the `bookmarks.html` your browser exports.
- **Notebook** — multiple Markdown pages with preview and clickable checklists.
- **Quote of the day** — a new quote daily, favorites, or your own collection.
- **GitHub activity** — recent public pushes, PRs, issues and stars for any user,
  with a 14-day activity strip.
- **Today panel** — next event, top tasks and habits due, at a glance.
- **Habit tracker** — 7-day grid with streaks 🔥.
- **Pomodoro** — focus/break cycles with a progress ring; feeds the Stats widget.
- **Clock & date** with a time-aware greeting, **Weather** (free, key-less
  [Open-Meteo](https://open-meteo.com) — current + hourly + daily), **World
  clocks**, a **Countdown** to any date, a **Notes** scratchpad, and a **Quick
  Links** launcher with auto favicons.
- **Stats** — at-a-glance tiles (tasks done, habits, upcoming events) plus a
  weekly focus sparkline, aggregated live from your other widgets.
- **Kanban board** — drag cards across To do / Doing / Done.
- **Service Status** — watch your homelab services: up/down, HTTP status and
  response time (self-signed HTTPS supported).
- **Docker** — your containers and their state, with optional restart buttons.

### 💾 Sync & backup

- **With the HomeDash server** (Docker image, `npm start`, or the Windows
  launcher), your dashboard is saved on the server and every browser that opens
  it stays in sync automatically — nothing to configure. A browser that has
  never synced takes the server's copy; after that, the newest change wins.
- **Without the server**, data lives in your browser. You can still turn on
  cross-device sync with your own free [Supabase](https://supabase.com) project
  (Settings → Cloud sync). Supabase sync pauses automatically when the server is
  syncing, so the two never fight.
- **Export/import a JSON backup** anytime from Settings. Sync credentials never
  leave the device or enter backups.

### 🧩 Custom widgets & integrations

Two escape hatches let you extend HomeDash without touching code:

- **Custom Embed** — embed any website or self-hosted service (Grafana, a
  notebook, an internal dashboard) by URL as a sandboxed iframe.
- **Custom Integration** — point at any JSON API, drill into a value with a
  dot-path (e.g. `results[0].count`), add a label/prefix/suffix and a refresh
  interval, and display it as a live tile. Great for home-lab metrics, tickers
  or API counts. *(With the server, any URL works; without it, the endpoint
  must allow cross-origin requests.)*

Want a brand-new widget **type**? It's a small, well-defined contract — see
[Adding a widget](#adding-a-widget-type) below.

## Getting started

```bash
npm install
npm start        # build, then run the HomeDash server (http://localhost:8787)
npm run dev      # Vite dev server with hot reload (http://localhost:5173)
npm run server   # just the server (serves the last build from dist/)
npm test         # run the unit tests (Vitest)
```

`npm run dev` works on its own in browser-only mode. To develop against the
server too, run `npm run server` in a second terminal — Vite forwards `/api` to
it. Server data is stored in `./data` (git-ignored).

Every pull request runs the tests and a production build in GitHub Actions
(`.github/workflows/ci.yml`).

Requires Node 18+.

**Windows quick start:** double-click **`install-and-run.bat`** — it installs
dependencies on first run, builds the app, starts the HomeDash server and opens
`http://localhost:8787`. Data is saved in the `data` folder next to it.
(Node.js must be installed first.)

## Desktop apps (Windows, macOS, Linux)

Download the installer for your system from the
[latest release](https://github.com/BlackHargaan/HomeDash/releases/latest):

| System | File | First launch |
|---|---|---|
| Windows | `HomeDash-x.y.z-win-x64.exe` | SmartScreen may warn (the app isn't code-signed yet): **More info → Run anyway**. |
| macOS | `HomeDash-x.y.z-mac-arm64.dmg` (Apple Silicon) or `…-mac-x64.dmg` (Intel) | Drag to Applications, then **right-click → Open** the first time. |
| Linux | `HomeDash-x.y.z-linux-x86_64.AppImage` | `chmod +x` it, then run. |

**Two modes** (Settings → Desktop app):

- **Standalone** (default) — the HomeDash server runs inside the app and stores
  everything on that computer. Sync, the iCal/RSS proxy and status checks all
  work, no setup.
- **Connect to my server** — opens your self-hosted HomeDash (e.g.
  `http://192.168.1.10:8080`), so desktop and web share the same data.
  Switching back to standalone brings your local data back.

The app keeps running in the tray when you close the window, so reminders keep
firing (turn this off in Settings), and can open at sign-in on Windows/macOS.

**Updates:** HomeDash checks for new releases on start and every 6 hours; an
**⬆ Update** badge appears when one is ready. On Windows and Linux (AppImage),
**Restart & update** installs it in place. macOS builds aren't signed yet, so
there the button opens the download page instead.

**Publishing a release** (maintainers): bump nothing by hand. Either open
**Actions → Desktop release → Run workflow** and enter a version like `v0.2.0`
(the tag is created for you), or push a tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

`.github/workflows/release.yml` sets the version from the tag, builds on
Windows, macOS and Linux runners, and attaches the installers plus update
metadata to the GitHub Release. To develop the desktop app locally:
`cd desktop && npm install && npm start`.

## Self-hosting with Docker

The image runs the HomeDash server (`node:20-alpine`, no npm dependencies at
runtime). It serves the app and the API, and stores your dashboard in `/data` —
**mount a named volume there** so it survives updates.

**Docker Compose** (recommended):

```bash
docker compose up -d --build
```

Then open **http://localhost:8080**. Change the host port by editing the
`ports` mapping in `docker-compose.yml` (e.g. `- "3000:80"`).

**Plain Docker:**

```bash
docker build -t homedash .
docker run -d --name homedash -p 8080:80 -v homedash-data:/data \
  --restart unless-stopped homedash
```

Put it behind your reverse proxy (Traefik, Caddy, nginx-proxy, etc.) for TLS and
a hostname, just like Homarr/homepage.

**Environment variables (all optional):**

| Variable | Effect |
|---|---|
| `HOMEDASH_PASSWORD` | Require a password to open the dashboard. **Set this before exposing HomeDash outside your home network** — the server's fetch proxy and status checks can reach anything on your LAN. |
| `HOMEDASH_DOCKER_CONTROL=true` | Allow restart buttons in the Docker widget. |
| `HOMEDASH_PUSH_SUBJECT` | Contact the push services see for your server (`mailto:you@example.com` or a URL). Optional. |
| `PORT`, `DATA_DIR`, `DOCKER_SOCKET` | Override the listen port (80 in the image), data folder (`/data`) or socket path. |

**Docker widget:** mount the socket read-only —
`/var/run/docker.sock:/var/run/docker.sock:ro` — to list containers. Restart
buttons additionally need `HOMEDASH_DOCKER_CONTROL=true` and a writable socket
(drop `:ro`). Mounting the socket gives HomeDash full control of Docker, so only
do it if you want that widget.

**API:** `/api/health`, `/api/state` (sync), `/api/proxy?url=` (server-side
fetch), `/api/status` (reachability checks), `/api/docker/*`, `/api/push/*`
(Web Push reminders — VAPID keys are generated on first run and kept in the data
folder). See `server/app.js` and `server/push.js`.

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
    volumes:
      - homedash-data:/data
      # - /var/run/docker.sock:/var/run/docker.sock:ro   # Docker widget
    environment:
      - TZ=UTC
      # - HOMEDASH_PASSWORD=change-me
    restart: unless-stopped

volumes:
  homedash-data:
```

> **Upgrading from an earlier image?** Add the `volumes:` lines above. Without a
> named volume your server copy is lost on each re-create — your browsers still
> hold their data and will re-seed it, but the volume makes the server copy
> permanent.

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
desktop/
  main.mjs                 # Electron main: window, tray, built-in server, updates
  preload.cjs              # the small bridge the web app uses (window.homedashDesktop)
  scripts/                 # prepare (copy app + server in), smoke test
server/
  app.js                   # HomeDash server: static app + /api (no dependencies)
  index.js                 # CLI entry, reads env vars
src/
  main.jsx                 # entry — mounts <App> inside the providers
  App.jsx                  # top bar (Add widget / Edit / Settings) + <Grid>
  context/
    DashboardContext.jsx   # theme, boards, layouts, shared data stores
    ServerContext.jsx      # server detection, sign-in state, server sync
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
    ServerPanel.jsx        # server connection status in Settings
    LoginScreen.jsx        # password gate when HOMEDASH_PASSWORD is set
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
    server.js              # HomeDash server API client + smartFetch (proxy)
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
