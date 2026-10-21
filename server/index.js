// CLI entry: `node server/index.js` (used by the Docker image and `npm start`).
//
// Environment:
//   PORT                     default 8787 (the Docker image uses 80)
//   HOST                     default 0.0.0.0
//   DATA_DIR                 default ./data (the Docker image uses /data)
//   STATIC_DIR               default ./dist
//   HOMEDASH_PASSWORD        optional; require sign-in when set
//   HOMEDASH_DOCKER_CONTROL  "true" to allow restarting containers
//   DOCKER_SOCKET            default /var/run/docker.sock
//   HOMEDASH_PUSH_SUBJECT    contact for push services (mailto: or https: URL)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from './app.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const app = await startServer({
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  dataDir: process.env.DATA_DIR || join(root, 'data'),
  staticDir: process.env.STATIC_DIR || join(root, 'dist'),
  password: process.env.HOMEDASH_PASSWORD || '',
  dockerControl: process.env.HOMEDASH_DOCKER_CONTROL === 'true',
  dockerSocket: process.env.DOCKER_SOCKET,
  pushSubject: process.env.HOMEDASH_PUSH_SUBJECT,
  version,
  logger: (level, ...args) => (level === 'error' ? console.error : console.log)(...args),
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await app.close()
    process.exit(0)
  })
}
