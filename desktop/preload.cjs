// Bridge between the HomeDash web app and the desktop shell. Only these few
// calls are exposed — the page gets no direct access to Node or Electron.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('homedashDesktop', {
  info: () => ipcRenderer.invoke('homedash:info'),
  setSettings: (patch) => ipcRenderer.invoke('homedash:set-settings', patch),
  setLoginItem: (enabled) => ipcRenderer.invoke('homedash:set-login-item', enabled),
  checkForUpdates: () => ipcRenderer.invoke('homedash:check-updates'),
  installUpdate: () => ipcRenderer.invoke('homedash:install-update'),
  onUpdate: (cb) => {
    const handler = (_e, state) => cb(state)
    ipcRenderer.on('homedash:update', handler)
    return () => ipcRenderer.removeListener('homedash:update', handler)
  },
})
