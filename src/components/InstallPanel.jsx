import { useState } from 'react'
import { useInstallState, promptInstall } from '../lib/pwa.js'
import { desktop } from '../lib/desktop.js'

// "Install HomeDash" — the browser's own install flow where there is one,
// instructions where there isn't (iOS, Firefox).
export default function InstallPanel() {
  const { canInstall, installed, ios } = useInstallState()
  const [declined, setDeclined] = useState(false)
  if (desktop) return null

  return (
    <div className="field">
      <label>Install app</label>
      {installed ? (
        <span className="ok-msg" style={{ marginTop: 0 }}>✓ HomeDash is installed on this device.</span>
      ) : canInstall ? (
        <>
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={async () => setDeclined((await promptInstall()) === 'dismissed')}>
            ⬇ Install HomeDash
          </button>
          <span className="faint" style={{ fontSize: 12 }}>
            Opens in its own window with an app icon, starts faster and works offline.{declined && ' You can install it later from here.'}
          </span>
        </>
      ) : (
        <span className="faint" style={{ fontSize: 12 }}>
          {ios
            ? 'On iPhone/iPad: tap Share, then “Add to Home Screen”. Push reminders then work too (iOS 16.4+).'
            : window.isSecureContext
              ? 'Use your browser’s menu → “Install HomeDash…” (Chrome, Edge) or “Add to Home screen” (Android). Firefox on desktop doesn’t install web apps.'
              : 'Installing needs HTTPS (or localhost). Put HomeDash behind a reverse proxy with a certificate, e.g. Caddy, Nginx Proxy Manager or Traefik.'}
        </span>
      )}
    </div>
  )
}
