// Copies the built web app and the HomeDash server into desktop/ so
// electron-builder can package them, and keeps the desktop version in sync with
// the root package.json. Run after `npm run build` at the repo root.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..')
const root = join(desktop, '..')

const dist = join(root, 'dist')
if (!existsSync(join(dist, 'index.html'))) {
  console.error('No web build found — run `npm run build` in the repo root first.')
  process.exit(1)
}

rmSync(join(desktop, 'web'), { recursive: true, force: true })
cpSync(dist, join(desktop, 'web'), { recursive: true })

// Server and shared modules become .mjs (ES modules without a package.json
// beside them), with their relative imports renamed to match.
const toMjs = (src) => src.replace(/from '(\.{1,2}\/[^']+)\.js'/g, "from '$1.mjs'")
for (const dir of ['server', 'shared']) {
  rmSync(join(desktop, dir), { recursive: true, force: true })
  mkdirSync(join(desktop, dir), { recursive: true })
  for (const name of readdirSync(join(root, dir))) {
    if (!name.endsWith('.js') || name === 'index.js') continue
    writeFileSync(join(desktop, dir, name.replace(/\.js$/, '.mjs')), toMjs(readFileSync(join(root, dir, name), 'utf8')))
  }
}

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const pkgFile = join(desktop, 'package.json')
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
if (pkg.version !== rootPkg.version) {
  pkg.version = rootPkg.version
  writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
}
console.log(`Prepared HomeDash desktop v${pkg.version}`)
