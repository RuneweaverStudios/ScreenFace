const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screenface', {
  requestDesktopStream: (sourceId, resolution) => ipcRenderer.invoke('request-desktop-stream', sourceId, resolution),
  getSources: (opts) => ipcRenderer.invoke('get-sources', opts),
  getFocusedWindow: () => ipcRenderer.invoke('get-focused-window'),
  focusPollingStart: () => ipcRenderer.invoke('focus-polling-start'),
  focusPollingStop: () => ipcRenderer.invoke('focus-polling-stop'),
  onFocusWindowChanged: (cb) => {
    ipcRenderer.on('focus-window-changed', (_, data) => cb(data));
  },
  recordingStarted: () => ipcRenderer.send('recording-started'),
  recordingStopped: () => ipcRenderer.send('recording-stopped'),
  previewShow: () => ipcRenderer.invoke('preview-show'),
  previewHide: () => ipcRenderer.invoke('preview-hide'),
  previewStartCapture: (payload) => ipcRenderer.send('preview-start-capture', payload),
  previewUpdateSettings: (payload) => ipcRenderer.send('preview-update-settings', payload),
  previewFrame: (dataUrl) => ipcRenderer.send('preview-frame', dataUrl),
  previewStopCapture: () => ipcRenderer.send('preview-stop-capture'),
  previewSetBounds: (bounds) => ipcRenderer.invoke('preview-set-bounds', bounds),
  previewGetBounds: () => ipcRenderer.invoke('preview-get-bounds'),
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  writeRecordingChunks: (filePath, chunks) => ipcRenderer.invoke('write-recording-chunks', filePath, chunks),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (partial) => ipcRenderer.invoke('set-settings', partial),
  showFolderDialog: () => ipcRenderer.invoke('show-folder-dialog'),
  listProfiles: () => ipcRenderer.invoke('list-profiles'),
  saveProfile: (name, payload) => ipcRenderer.invoke('save-profile', name, payload),
  loadProfile: (name) => ipcRenderer.invoke('load-profile', name),
  getPreviewPresets: () => ipcRenderer.invoke('get-preview-presets'),
  setPreviewPreset: (index, bounds) => ipcRenderer.invoke('set-preview-preset', index, bounds),
  applyPreviewPreset: (index) => ipcRenderer.invoke('apply-preview-preset', index),
  onApplyPreviewPreset: (cb) => {
    ipcRenderer.on('apply-preview-preset', (_, index) => cb(index));
  },
  getFacecamPresets: () => ipcRenderer.invoke('get-facecam-presets'),
  setFacecamPreset: (index, preset) => ipcRenderer.invoke('set-facecam-preset', index, preset),
  onApplyFacecamPreset: (cb) => {
    ipcRenderer.on('apply-facecam-preset', (_, index) => cb(index));
  },
  onTrayStartRecording: (cb) => {
    ipcRenderer.on('tray-start-recording', (_, payload) => cb(payload));
  },
});
