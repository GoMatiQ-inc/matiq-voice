const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('recordingControl', {
  stop: () => ipcRenderer.send('hud-action', 'stop'), cancel: () => ipcRenderer.send('hud-action', 'cancel'),
  onState: fn => ipcRenderer.on('hud-state', (_, value) => fn(value)),
  onMeter: fn => ipcRenderer.on('hud-meter', (_, value) => fn(value))
});
