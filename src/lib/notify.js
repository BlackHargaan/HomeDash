// Thin wrapper around the Notification API so the rest of the app doesn't have
// to feature-detect it.
export function notifySupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notifyPermission() {
  return notifySupported() ? Notification.permission : 'unsupported'
}

export async function requestNotifyPermission() {
  if (!notifySupported()) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export function fireNotification(title, body) {
  if (!notifySupported() || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, silent: false })
  } catch {
    /* some browsers require a ServiceWorker for notifications; ignore. */
  }
}
