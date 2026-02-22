const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, session, Tray, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { activeWindow } = require('active-win');
const settings = require('./settings');

let pendingDesktopSourceId = null;
let pendingDesktopResolution = null;

const { getPulseFramesAsync, getIdleIconAsync } = require('./tray-frames');

let mainWindow = null;
let previewWindow = null;
let tray = null;
let focusPollInterval = null;
let trayPulseInterval = null;

const FOCUS_POLL_MS = 1500;
const TRAY_PULSE_MS = 120;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'control.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'control.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createPreviewWindow() {
  if (previewWindow) return;
  previewWindow = new BrowserWindow({
    width: 480,
    height: 270,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preview.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  previewWindow.loadFile(path.join(__dirname, '..', 'renderer', 'preview.html'));
  previewWindow.setAlwaysOnTop(true, 'screen-saver');
  previewWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  previewWindow.setContentProtection(true);
  previewWindow.on('closed', () => { previewWindow = null; });
}

async function setupTray() {
  const icon = await getIdleIconAsync();
  tray = new Tray(icon);
  tray.setToolTip('ScreenFace – Screen Recorder');
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

async function startTrayPulse() {
  if (trayPulseInterval) return;
  const frames = await getPulseFramesAsync();
  let idx = 0;
  trayPulseInterval = setInterval(() => {
    if (tray && frames.length) {
      tray.setImage(frames[idx]);
      idx = (idx + 1) % frames.length;
    }
  }, TRAY_PULSE_MS);
}

async function stopTrayPulse() {
  if (trayPulseInterval) {
    clearInterval(trayPulseInterval);
    trayPulseInterval = null;
  }
  if (tray) {
    const icon = await getIdleIconAsync();
    tray.setImage(icon);
  }
}

function startFocusPolling() {
  if (focusPollInterval) return;
  let lastSourceId = null;
  focusPollInterval = setInterval(async () => {
    try {
      const win = await activeWindow();
      if (!win || !win.title) return;
      const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
      const match = sources.find(s => {
        const name = (s.name || '').trim();
        const title = (win.title || '').trim();
        return name === title || name.includes(title) || title.includes(name);
      });
      if (match && match.id !== lastSourceId) {
        lastSourceId = match.id;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('focus-window-changed', { sourceId: match.id, name: match.name });
        }
        if (previewWindow && !previewWindow.isDestroyed()) {
          previewWindow.webContents.send('focus-window-changed', { sourceId: match.id, name: match.name });
        }
      }
    } catch (_) {
      // active-win can throw; ignore
    }
  }, FOCUS_POLL_MS);
}

function stopFocusPolling() {
  if (focusPollInterval) {
    clearInterval(focusPollInterval);
    focusPollInterval = null;
  }
}

// IPC: set pending desktop source for next getDisplayMedia()
ipcMain.handle('request-desktop-stream', (_, sourceId, resolution) => {
  pendingDesktopSourceId = sourceId;
  pendingDesktopResolution = resolution || null;
});

// IPC: get capture sources
ipcMain.handle('get-sources', async (_, opts = {}) => {
  try {
    const types = opts.types || ['screen', 'window'];
    const size = opts.thumbnailSize || 150;
    const sources = await desktopCapturer.getSources({
      types,
      thumbnailSize: { width: size, height: size },
      fetchWindowIcons: true,
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : null,
      display_id: s.display_id,
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
    }));
  } catch (e) {
    console.error('get-sources failed', e);
    return [];
  }
});

// IPC: get current focused window (for matching to a source)
ipcMain.handle('get-focused-window', async () => {
  try {
    const win = await activeWindow();
    if (!win) return null;
    return { title: win.title, owner: win.owner?.name };
  } catch {
    return null;
  }
});

// IPC: start/stop focus polling
ipcMain.handle('focus-polling-start', () => { startFocusPolling(); });
ipcMain.handle('focus-polling-stop', () => { stopFocusPolling(); });

// IPC: recording state for tray
ipcMain.on('recording-started', () => { startTrayPulse(); });
ipcMain.on('recording-stopped', () => { stopTrayPulse(); });

// IPC: preview window
ipcMain.handle('preview-show', () => { createPreviewWindow(); });
ipcMain.handle('preview-hide', () => {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.close();
    previewWindow = null;
  }
});
ipcMain.handle('preview-set-bounds', (_, bounds) => {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.setBounds(bounds);
  }
});
ipcMain.handle('preview-get-bounds', () => {
  if (previewWindow && !previewWindow.isDestroyed()) {
    return previewWindow.getBounds();
  }
  return null;
});
ipcMain.on('preview-start-capture', (_, payload) => {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.webContents.send('start-capture', payload);
  }
});
ipcMain.on('preview-update-settings', (_, payload) => {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.webContents.send('update-settings', payload);
  }
});
ipcMain.on('preview-frame', (_, dataUrl) => {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.webContents.send('preview-frame', dataUrl);
  }
});
ipcMain.on('preview-stop-capture', () => {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.webContents.send('stop-capture');
  }
});

// Settings & profiles
ipcMain.handle('get-settings', () => settings.getSettings());
ipcMain.handle('set-settings', (_, partial) => settings.setSettings(partial));
ipcMain.handle('show-folder-dialog', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow || undefined, {
    properties: ['openDirectory'],
    title: 'Choose default folder for saved videos',
  });
  return filePaths && filePaths[0] ? filePaths[0] : null;
});
ipcMain.handle('list-profiles', () => settings.listProfiles());
ipcMain.handle('save-profile', (_, name, payload) => settings.saveProfile(name, payload));
ipcMain.handle('load-profile', (_, name) => settings.loadProfile(name));

// IPC: save file (renderer sends blob or buffer via chunk array)
ipcMain.handle('show-save-dialog', async () => {
  const s = await settings.getSettings();
  const ext = (s.outputFormat || 'mp4') === 'mp4' ? 'mp4' : 'webm';
  const defaultName = `ScreenFace-${Date.now()}.${ext}`;
  const defaultPath = s.defaultOutputDir
    ? path.join(s.defaultOutputDir, defaultName)
    : path.join(os.homedir(), defaultName);
  const filters = ext === 'mp4'
    ? [{ name: 'MP4 Video', extensions: ['mp4'] }, { name: 'WebM Video', extensions: ['webm'] }]
    : [{ name: 'WebM Video', extensions: ['webm'] }, { name: 'MP4 Video', extensions: ['mp4'] }];
  const { filePath } = await dialog.showSaveDialog(mainWindow || undefined, {
    defaultPath,
    filters,
  });
  return filePath;
});
ipcMain.handle('write-recording-chunks', async (_, filePath, chunks) => {
  const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
  const isMp4 = filePath && filePath.toLowerCase().endsWith('.mp4');
  if (isMp4) {
    const ffmpegPath = require('ffmpeg-static');
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegPath);
    const tempWebm = path.join(os.tmpdir(), `screenface-${Date.now()}.webm`);
    await fs.writeFile(tempWebm, buffer);
    try {
      await new Promise((resolve, reject) => {
        ffmpeg(tempWebm)
          .outputOptions(['-c:v copy', '-an'])
          .output(filePath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
    } finally {
      await fs.unlink(tempWebm).catch(() => {});
    }
  } else {
    await fs.writeFile(filePath, buffer);
  }
  return true;
});

// Presets (stored in memory; could persist to disk)
let previewPresets = [
  { x: 50, y: 50, width: 480, height: 270 },
  { x: null, y: 50, width: 480, height: 270 },
  { x: 50, y: null, width: 480, height: 270 },
];
let facecamPresets = [
  { xRatio: 0.78, yRatio: 0.72, sizePercent: 18, zoom: 1, shape: 'rect' },
  { xRatio: 0.78, yRatio: 0.06, sizePercent: 18, zoom: 1, shape: 'rect' },
  { xRatio: 0.06, yRatio: 0.72, sizePercent: 18, zoom: 1, shape: 'rect' },
];

ipcMain.handle('get-preview-presets', () => previewPresets);
ipcMain.handle('set-preview-preset', (_, index, bounds) => {
  if (index >= 0 && index < previewPresets.length) {
    previewPresets[index] = { ...bounds };
  }
});
ipcMain.handle('apply-preview-preset', (_, index) => {
  if (index >= 0 && index < previewPresets.length && previewWindow && !previewWindow.isDestroyed()) {
    const p = previewPresets[index];
    const { screen } = require('electron');
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const workArea = display.workArea;
    const x = p.x != null ? p.x : workArea.x + workArea.width - (p.width || 480);
    const y = p.y != null ? p.y : workArea.y + workArea.height - (p.height || 270);
    previewWindow.setBounds({ x, y, width: p.width || 480, height: p.height || 270 });
  }
});

ipcMain.handle('get-facecam-presets', () => facecamPresets);
ipcMain.handle('set-facecam-preset', (_, index, preset) => {
  if (index >= 0 && index < facecamPresets.length) {
    facecamPresets[index] = { ...preset };
  }
});

// Global shortcuts for presets (registered when recording or when main window focused)
function registerPresetShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+1', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('apply-preview-preset', 0);
  });
  globalShortcut.register('CommandOrControl+Shift+2', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('apply-preview-preset', 1);
  });
  globalShortcut.register('CommandOrControl+Shift+3', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('apply-preview-preset', 2);
  });
  globalShortcut.register('CommandOrControl+Alt+1', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('apply-facecam-preset', 0);
  });
  globalShortcut.register('CommandOrControl+Alt+2', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('apply-facecam-preset', 1);
  });
  globalShortcut.register('CommandOrControl+Alt+3', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('apply-facecam-preset', 2);
  });
}

function unregisterPresetShortcuts() {
  globalShortcut.unregisterAll();
}

app.whenReady().then(async () => {
  await settings.ensureProfilesDir();
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const sourceId = pendingDesktopSourceId;
    pendingDesktopSourceId = null;
    pendingDesktopResolution = null;
    if (!sourceId) {
      callback({});
      return;
    }
    desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
      .then(sources => {
        const src = sources.find(s => s.id === sourceId);
        if (src) callback({ video: src });
        else callback({});
      })
      .catch(() => callback({}));
  });

  createMainWindow();
  await setupTray();
  registerPresetShortcuts();
});

app.on('window-all-closed', () => {
  unregisterPresetShortcuts();
  stopFocusPolling();
  stopTrayPulse();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
