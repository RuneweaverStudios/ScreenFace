const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screenfacePreview', {
  setBounds: (bounds) => ipcRenderer.invoke('preview-set-bounds', bounds),
  getBounds: () => ipcRenderer.invoke('preview-get-bounds'),
  requestDesktopStream: (sourceId, resolution) => ipcRenderer.invoke('request-desktop-stream', sourceId, resolution),
  onStartCapture: (cb) => {
    ipcRenderer.on('start-capture', (_, payload) => cb(payload));
  },
  onUpdateSettings: (cb) => {
    ipcRenderer.on('update-settings', (_, payload) => cb(payload));
  },
  onFocusWindowChanged: (cb) => {
    ipcRenderer.on('focus-window-changed', (_, data) => cb(data));
  },
  onFrame: (cb) => {
    ipcRenderer.on('preview-frame', (_, dataUrl) => cb(dataUrl));
  },
  onStopCapture: (cb) => {
    ipcRenderer.on('stop-capture', () => cb());
  },
});
