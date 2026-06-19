const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startPatch: () => ipcRenderer.invoke('start-patch'),
  onPatchStatus: (callback) => ipcRenderer.on('patch-status', (_event, value) => callback(value)),
  closeApp: () => ipcRenderer.send('close-app'),
  minimizeApp: () => ipcRenderer.send('minimize-app')
});
