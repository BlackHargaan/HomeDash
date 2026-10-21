// Copies the built web app and the HomeDash server into desktop/ so
// electron-builder can package them, and keeps the desktop version in sync with
// the root package.json. Run after `npm run build` at the repo root.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

// The server is an ES module; .mjs keeps it one without a package.json beside it.
rmSync(join(desktop, 'server'), { recursive: true, force: true })
mkdirSync(join(desktop, 'server'), { recursive: true })
// Each server file becomes .mjs, with its relative imports renamed to match.
for (const name of ['app', 'push']) {
  const src = readFileSync(join(root, 'server', `${name}.js`), 'utf8')
  writeFileSync(join(desktop, 'server', `${name}.mjs`), src.replace(/from '\.\/(\w+)\.js'/g, "from './$1.mjs'"))
}

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const pkgFile = join(desktop, 'package.json')
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
if (pkg.version !== rootPkg.version) {
  pkg.version = rootPkg.version
  writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
}
console.log(`Prepared HomeDash desktop v${pkg.version}`)
