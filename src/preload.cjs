const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('verbatim', {
  status: () => ipcRenderer.invoke('status'),
  settings: value => ipcRenderer.invoke('settings', value),
  download: () => ipcRenderer.invoke('download'),
  begin: () => ipcRenderer.invoke('begin'),
  recordingReady: () => ipcRenderer.invoke('recording-ready'),
  transcribe: wav => ipcRenderer.invoke('transcribe', wav),
  retry: () => ipcRenderer.invoke('retry'),
  cancel: () => ipcRenderer.invoke('cancel'),
  copy: () => ipcRenderer.invoke('copy'),
  clear: () => ipcRenderer.invoke('clear'),
  accessibility: () => ipcRenderer.invoke('accessibility'),
  onEvent: callback => {
    const listener = (_, message) => callback(message);
    ipcRenderer.on('app-event', listener);
    return () => ipcRenderer.removeListener('app-event', listener);
  }
});
