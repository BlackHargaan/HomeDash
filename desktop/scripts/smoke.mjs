// Smoke test for a packaged desktop build: launches the unpacked app with a
// throwaway profile, waits for its built-in server, and checks /api/health and
// that the web app is served. Usage (after `npm run dist:dir`):
//   node scripts/smoke.mjs            (Linux needs a display: xvfb-run node …)
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = join(fileURLToPath(import.meta.url), '..', '..')
const release = join(desktop, 'release')

function findBinary() {
  if (process.platform === 'linux') return join(release, 'linux-unpacked', 'homedash')
  if (process.platform === 'win32') return join(release, 'win-unpacked', 'HomeDash.exe')
  const mac = readdirSync(release).find((d) => d.startsWith('mac'))
  return join(release, mac, 'HomeDash.app', 'Contents', 'MacOS', 'HomeDash')
}

const bin = findBinary()
if (!existsSync(bin)) { console.error(`No build at ${bin} — run npm run dist:dir`); process.exit(1) }

const profile = mkdtempSync(join(tmpdir(), 'homedash-smoke-'))
const child = spawn(bin, ['--no-sandbox', `--user-data-dir=${profile}`], {
  env: { ...process.env, HOMEDASH_DESKTOP_SMOKE: '1', ELECTRON_ENABLE_LOGGING: '1' },
})

let output = ''
const fail = (msg) => { console.error(`SMOKE FAIL: ${msg}\n--- app output ---\n${output}`); child.kill(); process.exit(1) }
const timer = setTimeout(() => fail('timed out waiting for the built-in server'), 45_000)

const onData = async (d) => {
  output += d
  const m = output.match(/listening on 127\.0\.0\.1:(\d+)/)
  if (!m || onData.done) return
  onData.done = true
  const base = `http://127.0.0.1:${m[1]}`
  try {
    const health = await (await fetch(`${base}/api/health`)).json()
    if (health.name !== 'homedash') return fail(`unexpected health: ${JSON.stringify(health)}`)
    const html = await (await fetch(base)).text()
    if (!html.includes('<div id="root">')) return fail('web app not served')
    console.log(`SMOKE OK: HomeDash desktop v${health.version} serving on ${base}`)
    clearTimeout(timer)
    child.kill()
    process.exit(0)
  } catch (e) { fail(e.message) }
}
child.stdout.on('data', onData)
child.stderr.on('data', onData)
child.on('exit', (code) => { if (!onData.done) fail(`app exited early (code ${code})`) })
