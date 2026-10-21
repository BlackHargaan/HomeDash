// Access to the desktop shell (Electron preload bridge). `null` in a browser.
import { useEffect, useState } from 'react'

export const desktop = typeof window !== 'undefined' ? window.homedashDesktop || null : null

// Live update state from the desktop app: { state, version, url, error, progress }
//   state: idle | checking | none | downloading | downloaded | manual | error | unsupported
export function useDesktopUpdate() {
  const [update, setUpdate] = useState(null)
  useEffect(() => {
    if (!desktop) return
    let alive = true
    desktop.info().then((i) => { if (alive) setUpdate(i.update) })
    const off = desktop.onUpdate((u) => setUpdate(u))
    return () => { alive = false; off() }
  }, [])
  return update
}

export const updateReady = (u) => u && (u.state === 'downloaded' || u.state === 'manual')
