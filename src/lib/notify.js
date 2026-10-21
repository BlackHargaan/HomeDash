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

// `tag` collapses duplicates (e.g. the same reminder from the page and from a
// server push). Prefer the service worker when one controls the page: it also
// works where `new Notification()` is disallowed (Android Chrome).
export function fireNotification(title, body, tag) {
  if (!notifySupported() || Notification.permission !== 'granted') return
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'notify', title, body, tag })
    return
  }
  try {
    new Notification(title, { body, tag, silent: false })
  } catch {
    /* some browsers require a ServiceWorker for notifications; ignore. */
  }
}
