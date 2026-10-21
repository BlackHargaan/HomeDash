// HomeDash desktop app (Electron main process).
//
// Two modes:
//   standalone — runs the HomeDash server (../server/app.js) inside the app on
//                127.0.0.1, storing data in the app's user-data folder.
//   server     — opens your self-hosted HomeDash (e.g. the Portainer instance),
//                so desktop and web share the same data.
//
// Updates: Windows (NSIS) and Linux (AppImage) update in place via
// electron-updater + GitHub Releases. Unsigned macOS builds can't self-update,
// so on macOS we check the latest GitHub release and offer the download page.
import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import updaterPkg from 'electron-updater'

const { autoUpdater } = updaterPkg
const here = dirname(fileURLToPath(import.meta.url))
const REPO = { owner: 'BlackHargaan', repo: 'HomeDash' }
// A fixed port keeps the page origin (and so the browser storage) stable
// between launches. If it's taken, the next few ports are tried.
const PREFERRED_PORT = 47321

// Packaged: web app + server are copied into the app by scripts/prepare.mjs.
// Development (`npm start` in desktop/): use the repo's dist/ and server/.
const WEB_DIR = app.isPackaged ? join(here, 'web') : join(here, '..', 'dist')
const SERVER_MODULE = app.isPackaged ? join(here, 'server', 'app.mjs') : join(here, '..', 'server', 'app.js')

// ------------------------------------------------------------- settings

const settingsFile = () => join(app.getPath('userData'), 'settings.json')
const DEFAULTS = { mode: 'standalone', serverUrl: '', closeToTray: true }

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(readFileSync(settingsFile(), 'utf8')) } } catch { return { ...DEFAULTS } }
}
function saveSettings(s) {
  mkdirSync(dirname(settingsFile()), { recursive: true })
  writeFileSync(settingsFile(), JSON.stringify(s, null, 2))
}

let settings
let win = null
let tray = null
let localServer = null
let quitting = false
const update = { state: 'idle', version: null, url: null, error: null, progress: null }

// ------------------------------------------------------------- server

async function ensureLocalServer() {
  if (localServer) return localServer
  const { startServer } = await import(pathToFileURL(SERVER_MODULE).href)
  const dataDir = join(app.getPath('userData'), 'data')
  let lastErr
  for (let port = PREFERRED_PORT; port < PREFERRED_PORT + 10; port++) {
    try {
      localServer = await startServer({
        port, host: '127.0.0.1', dataDir, staticDir: WEB_DIR, version: app.getVersion(),
        logger: (level, ...a) => (level === 'error' ? console.error : console.log)('[server]', ...a),
      })
      return localServer
    } catch (e) {
      lastErr = e
      if (e.code !== 'EADDRINUSE') break
    }
  }
  throw lastErr
}

function normaliseServerUrl(raw) {
  let s = String(raw || '').trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s
  try {
    const u = new URL(s)
    return u.origin + u.pathname.replace(/\/+$/, '')
  } catch { return null }
}

async function targetUrl() {
  if (settings.mode === 'server') {
    const url = normaliseServerUrl(settings.serverUrl)
    if (url) return url
  }
  const s = await ensureLocalServer()
  return `http://127.0.0.1:${s.port}`
}

// ------------------------------------------------------------- window

function iconPath(name) {
  return join(here, 'icons', name)
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 380,
    minHeight: 500,
    title: 'HomeDash',
    backgroundColor: '#0b0f1a',
    icon: iconPath('icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) win.show() })

  // Open external links in the user's browser, not in the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const current = win.webContents.getURL()
    if (current && new URL(url).origin !== new URL(current).origin) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })

  win.webContents.on('did-fail-load', async (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return // -3 = aborted (e.g. a reload)
    if (settings.mode !== 'server') return
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Server unreachable',
      message: `Couldn't reach your HomeDash server`,
      detail: `${url}\n${desc} (${code})\n\nCheck that it's running and the address is right, or switch back to standalone mode (data stored on this computer).`,
      buttons: ['Retry', 'Use standalone mode', 'Quit'],
      defaultId: 0,
      cancelId: 0,
    })
    if (response === 0) win.loadURL(await targetUrl())
    else if (response === 1) { settings = { ...settings, mode: 'standalone' }; saveSettings(settings); win.loadURL(await targetUrl()) }
    else { quitting = true; app.quit() }
  })

  win.on('close', (e) => {
    if (!quitting && settings.closeToTray && tray) {
      e.preventDefault()
      win.hide()
    }
  })

  win.loadURL(await targetUrl())
}

function showWindow() {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createTray() {
  try {
    const img = nativeImage.createFromPath(iconPath(process.platform === 'darwin' ? 'tray-mac.png' : 'tray.png'))
    tray = new Tray(img)
  } catch (e) {
    console.warn('Tray unavailable:', e.message)
    tray = null
    return
  }
  tray.setToolTip('HomeDash')
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open HomeDash', click: showWindow },
    { type: 'separator' },
    { label: update.state === 'downloaded' ? `Restart to update to v${update.version}` : 'Check for updates', click: () => (update.state === 'downloaded' ? installUpdate() : checkForUpdates(true)) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit() } },
  ])
  tray.setContextMenu(menu())
  tray.on('click', showWindow)
  tray.refreshMenu = () => tray.setContextMenu(menu())
}

// ------------------------------------------------------------- updates

function setUpdate(patch) {
  Object.assign(update, patch)
  win?.webContents.send('homedash:update', { ...update })
  tray?.refreshMenu?.()
}

const isNewer = (a, b) => {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  return false
}

const selfUpdating = () => app.isPackaged && process.platform !== 'darwin' &&
  (process.platform !== 'linux' || !!process.env.APPIMAGE)

// "Nothing published yet" isn't an error — it just means there's no newer version.
const NO_RELEASES = /No published versions|Unable to find latest version|HttpError: 404|status 404/i

async function checkForUpdates(userInitiated = false) {
  if (!app.isPackaged) {
    setUpdate({ state: 'unsupported', error: 'Updates are available in installed builds.' })
    return
  }
  if (update.state === 'downloading' || update.state === 'downloaded') return
  setUpdate({ state: 'checking', error: null })
  try {
    if (selfUpdating()) {
      await autoUpdater.checkForUpdates() // events below drive the state
    } else {
      // macOS (unsigned) and non-AppImage Linux: compare with the latest release.
      // HOMEDASH_RELEASES_API lets tests point this at a fake release feed.
      const api = process.env.HOMEDASH_RELEASES_API || `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/releases/latest`
      const res = await fetch(api, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'HomeDash-desktop' } })
      if (res.status === 404) { setUpdate({ state: 'none' }); return } // no releases published yet
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
      const rel = await res.json()
      if (isNewer(rel.tag_name, app.getVersion())) setUpdate({ state: 'manual', version: rel.tag_name.replace(/^v/, ''), url: rel.html_url })
      else setUpdate({ state: 'none' })
    }
  } catch (e) {
    if (NO_RELEASES.test(e?.message || '')) { setUpdate({ state: 'none', error: null }); return }
    setUpdate({ state: 'error', error: e.message })
    if (userInitiated) dialog.showMessageBox(win, { type: 'error', message: 'Update check failed', detail: e.message })
  }
}

function installUpdate() {
  if (update.state === 'downloaded') {
    quitting = true
    autoUpdater.quitAndInstall()
  } else if (update.state === 'manual' && update.url) {
    shell.openExternal(update.url)
  }
}

autoUpdater.autoDownload = true
autoUpdater.on('update-available', (info) => setUpdate({ state: 'downloading', version: info.version, progress: 0 }))
autoUpdater.on('update-not-available', () => setUpdate({ state: 'none' }))
autoUpdater.on('download-progress', (p) => setUpdate({ progress: Math.round(p.percent) }))
autoUpdater.on('update-downloaded', (info) => setUpdate({ state: 'downloaded', version: info.version, progress: 100 }))
autoUpdater.on('error', (e) => {
  const msg = e?.message || String(e)
  setUpdate(NO_RELEASES.test(msg) ? { state: 'none', error: null } : { state: 'error', error: msg })
})

// ------------------------------------------------------------- IPC

ipcMain.handle('homedash:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  packaged: app.isPackaged,
  selfUpdating: selfUpdating(),
  settings,
  update: { ...update },
  loginItem: process.platform === 'linux' ? null : app.getLoginItemSettings().openAtLogin,
}))

ipcMain.handle('homedash:set-settings', async (_e, patch) => {
  const next = { ...settings }
  if (patch && (patch.mode === 'standalone' || patch.mode === 'server')) next.mode = patch.mode
  if (patch && typeof patch.serverUrl === 'string') {
    const url = patch.serverUrl.trim() ? normaliseServerUrl(patch.serverUrl) : ''
    if (url === null) throw new Error('That doesn’t look like a web address')
    next.serverUrl = url
  }
  if (patch && typeof patch.closeToTray === 'boolean') next.closeToTray = patch.closeToTray
  if (next.mode === 'server' && !next.serverUrl) throw new Error('Enter your server’s address first')
  const reload = next.mode !== settings.mode || (next.mode === 'server' && next.serverUrl !== settings.serverUrl)
  settings = next
  saveSettings(settings)
  if (reload) setTimeout(async () => win?.loadURL(await targetUrl()), 50)
  return settings
})

ipcMain.handle('homedash:set-login-item', (_e, enabled) => {
  if (process.platform === 'linux') return null
  app.setLoginItemSettings({ openAtLogin: !!enabled, args: ['--hidden'] })
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('homedash:check-updates', () => checkForUpdates(true))
ipcMain.handle('homedash:install-update', () => installUpdate())

// ------------------------------------------------------------- lifecycle

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  app.whenReady().then(async () => {
    settings = loadSettings()
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
      { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    ]) : null)
    createTray()
    try {
      await createWindow()
    } catch (e) {
      dialog.showErrorBox('HomeDash failed to start', String(e?.stack || e))
      app.exit(1)
      return
    }
    // Check shortly after start, then every 6 hours.
    setTimeout(() => checkForUpdates(false), 10_000)
    setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000)
  })

  app.on('activate', showWindow) // macOS dock click
  app.on('before-quit', () => { quitting = true })
  app.on('window-all-closed', () => { if (!tray || process.platform !== 'darwin') app.quit() })
  app.on('will-quit', () => { localServer?.close() })
}

// Exposed for the smoke test (HOMEDASH_DESKTOP_SMOKE=1 prints the URL).
if (process.env.HOMEDASH_DESKTOP_SMOKE) {
  app.whenReady().then(() => setTimeout(async () => console.log('SMOKE_URL', win?.webContents.getURL()), 4000))
}
