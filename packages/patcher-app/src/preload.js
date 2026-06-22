const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startPatch: (channel) => ipcRenderer.invoke('start-patch', channel),
  startUnpatch: () => ipcRenderer.invoke('start-unpatch'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  onPatchStatus: (callback) => ipcRenderer.on('patch-status', (_event, value) => callback(value)),
  closeApp: () => ipcRenderer.send('close-app'),
  minimizeApp: () => ipcRenderer.send('minimize-app')
});
