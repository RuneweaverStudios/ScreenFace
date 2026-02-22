const livePreviewCanvas = document.getElementById('livePreviewCanvas');
const livePreviewStage = document.getElementById('livePreviewStage');
const facecamOverlay = document.getElementById('facecamOverlay');
const sourceSelect = document.getElementById('sourceSelect');
const resolutionSelect = document.getElementById('resolutionSelect');
const followFocused = document.getElementById('followFocused');
const autoZoomMouse = document.getElementById('autoZoomMouse');
const includeCamera = document.getElementById('includeCamera');
const btnPreview = document.getElementById('btnPreview');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnEditFacecam = document.getElementById('btnEditFacecam');
const facecamEditorStatus = document.getElementById('facecamEditorStatus');
const facecamShape = document.getElementById('facecamShape');
const facecamSize = document.getElementById('facecamSize');
const facecamSizeValue = document.getElementById('facecamSizeValue');
const facecamZoom = document.getElementById('facecamZoom');
const facecamZoomValue = document.getElementById('facecamZoomValue');
const audioVolume = document.getElementById('audioVolume');
const audioVolumeValue = document.getElementById('audioVolumeValue');
const audioEqProfile = document.getElementById('audioEqProfile');
const outputFolderPath = document.getElementById('outputFolderPath');
const btnBrowseFolder = document.getElementById('btnBrowseFolder');
const outputFormat = document.getElementById('outputFormat');
const outputQuality = document.getElementById('outputQuality');
const btnSaveProfile = document.getElementById('btnSaveProfile');
const profileSelect = document.getElementById('profileSelect');
const btnAdvancedToggle = document.getElementById('btnAdvancedToggle');
const advancedPanel = document.getElementById('advancedPanel');

const QUALITY_BITRATE = { quality: 8000000, balanced: 5000000, size: 2000000 };

let compositor = null;
let previewVisible = false;
let activeFacecamPresetIndex = 0;
let facecamEditorEnabled = false;
let draggingFacecam = false;
let draggingFacecamOverlay = false;
let overlayDragOffset = { x: 0, y: 0 };
let audioOnlyRecorder = null;
let audioOnlyChunks = [];
let audioOnlyStream = null;

function pushPreviewSettings() {
  if (!previewVisible || !window.screenface || !window.screenface.previewUpdateSettings) return;
  const res = getResolution();
  window.screenface.previewUpdateSettings({
    sourceId: sourceSelect.value || null,
    resolution: { width: res.width, height: res.height },
    includeCamera: includeCamera.checked,
    autoZoomMouse: autoZoomMouse.checked,
    followFocused: followFocused.checked,
  });
}

function getResolution() {
  const v = resolutionSelect.value;
  const [w, h] = v.split('x').map(Number);
  return { width: w, height: h };
}

async function loadSources() {
  const sources = await window.screenface.getSources({ types: ['screen', 'window'], thumbnailSize: 150 });
  sourceSelect.innerHTML = '<option value="">Select screen or window…</option>';
  for (const s of sources) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name || s.id;
    sourceSelect.appendChild(opt);
  }
  if (!sourceSelect.value && sources.length > 0) {
    sourceSelect.value = sources[0].id;
  }
}

function getQualityBitrate() {
  return QUALITY_BITRATE[outputQuality?.value || 'quality'] || 8000000;
}

function buildCompositorOptions(overrides = {}) {
  const res = getResolution();
  return {
    sourceId: overrides.sourceId !== undefined ? overrides.sourceId : sourceSelect.value,
    width: res.width,
    height: res.height,
    followFocused: overrides.followFocused !== undefined ? overrides.followFocused : followFocused.checked,
    autoZoomMouse: overrides.autoZoomMouse !== undefined ? overrides.autoZoomMouse : autoZoomMouse.checked,
    includeCamera: overrides.includeCamera !== undefined ? overrides.includeCamera : includeCamera.checked,
    previewOpen: previewVisible,
    videoBitsPerSecond: getQualityBitrate(),
    recordingMode: overrides.recordingMode || 'screen',
    onRecordingStarted: () => {
      window.screenface.recordingStarted();
      btnStart.disabled = true;
      btnStop.disabled = false;
    },
    onRecordingStopped: () => {
      window.screenface.recordingStopped();
      btnStart.disabled = false;
      btnStop.disabled = true;
    },
    onCameraError: (err) => {
      const msg = err && (err.message || err.name) ? String(err.message || err.name) : 'Camera access failed';
      alert('Camera error: ' + msg + '. Grant camera permission in System Settings (macOS) or allow when prompted.');
    },
  };
}

async function ensurePreviewCompositor() {
  const sourceId = sourceSelect.value;
  if (!sourceId) return;
  if (!compositor) {
    compositor = new Compositor(buildCompositorOptions());
    compositor.setLivePreviewCanvas(livePreviewCanvas);
    compositor.applyFacecamPreset(activeFacecamPresetIndex);
    applyFacecamControlsToCompositor();
    await refreshFacecamGuides();
  }
  await compositor.startPreview();
}

sourceSelect.addEventListener('change', async () => {
  const id = sourceSelect.value;
  if (!id) {
    if (compositor) compositor.setDesktopSourceId(null);
    pushPreviewSettings();
    return;
  }
  if (compositor) compositor.setDesktopSourceId(id);
  if (previewVisible) await ensurePreviewCompositor();
  pushPreviewSettings();
});

resolutionSelect.addEventListener('change', () => {
  const res = getResolution();
  if (compositor) compositor.setResolution(res.width, res.height);
  pushPreviewSettings();
  persistOutputAndAudio();
});

outputQuality.addEventListener('change', () => {
  const bps = getQualityBitrate();
  if (compositor) compositor.setVideoBitsPerSecond(bps);
  persistOutputAndAudio();
});

followFocused.addEventListener('change', () => {
  if (compositor) compositor.setFollowFocused(followFocused.checked);
  pushPreviewSettings();
});

autoZoomMouse.addEventListener('change', () => {
  if (compositor) compositor.setAutoZoomMouse(autoZoomMouse.checked);
  pushPreviewSettings();
});

includeCamera.addEventListener('change', () => {
  if (compositor) compositor.setIncludeCamera(includeCamera.checked);
  if (includeCamera.checked) {
    if (sourceSelect.value) {
      ensurePreviewCompositor().then(() => startFacecamOverlay());
    } else {
      startFacecamOverlay();
    }
  } else {
    stopFacecamOverlay();
  }
  pushPreviewSettings();
});

function updateFacecamUiLabels() {
  facecamSizeValue.textContent = `${facecamSize.value}%`;
  facecamZoomValue.textContent = `${Number(facecamZoom.value).toFixed(1)}x`;
}

function applyFacecamOverlayShape() {
  const isCircle = facecamShape.value === 'circle';
  facecamOverlay.classList.toggle('circle', isCircle);
}

function applyFacecamOverlayZoom() {
  // Overlay is a guide only; zoom is applied in compositor camera crop.
}

function getStageRect() {
  return livePreviewStage.getBoundingClientRect();
}

function getOverlaySizePx() {
  const stageRect = getStageRect();
  const minSide = Math.min(stageRect.width, stageRect.height);
  return Math.max(64, (minSide * (Number(facecamSize.value) || 18)) / 100);
}

function applyFacecamOverlaySize() {
  const size = getOverlaySizePx();
  facecamOverlay.style.width = `${size}px`;
  facecamOverlay.style.height = `${size}px`;
}

function syncOverlayFromPreset() {
  if (!compositor) return;
  const stageRect = getStageRect();
  if (!stageRect.width || !stageRect.height) return;
  const layout = compositor.getFacecamLayoutForDimensions(stageRect.width, stageRect.height);
  facecamOverlay.style.left = `${layout.x}px`;
  facecamOverlay.style.top = `${layout.y}px`;
  facecamOverlay.style.width = `${layout.size}px`;
  facecamOverlay.style.height = `${layout.size}px`;
}

function syncPresetFromOverlay() {
  if (!compositor) return;
  const stageRect = getStageRect();
  const ovRect = facecamOverlay.getBoundingClientRect();
  if (!stageRect.width || !stageRect.height) return;
  const x = ovRect.left - stageRect.left;
  const y = ovRect.top - stageRect.top;
  const size = ovRect.width;
  compositor.setFacecamPositionRatio(x / stageRect.width, y / stageRect.height);
  compositor.setFacecamSizePercent((size / Math.min(stageRect.width, stageRect.height)) * 100);
}

async function stopFacecamOverlay() {
  facecamOverlay.style.display = 'none';
}

async function startFacecamOverlay() {
  applyFacecamOverlayShape();
  applyFacecamOverlaySize();
  applyFacecamOverlayZoom();
  if (compositor) {
    syncOverlayFromPreset();
  }

  facecamOverlay.style.display = 'block';
  facecamOverlay.style.cursor = 'grab';
}

function applyFacecamControlsToCompositor() {
  if (!compositor) return;
  compositor.setFacecamShape(facecamShape.value);
  compositor.setFacecamSizePercent(Number(facecamSize.value));
  compositor.setFacecamZoom(Number(facecamZoom.value));
  compositor.setFacecamEditorEnabled(facecamEditorEnabled);
}

async function refreshFacecamGuides() {
  if (!compositor) return;
  const presets = await window.screenface.getFacecamPresets();
  compositor.setFacecamPresetGuides(presets);
}

btnEditFacecam.addEventListener('click', () => {
  facecamEditorEnabled = !facecamEditorEnabled;
  btnEditFacecam.textContent = facecamEditorEnabled ? 'Stop editing facecam' : 'Edit facecam';
  facecamEditorStatus.textContent = facecamEditorEnabled ? 'Editor on: drag facecam in live preview' : 'Editor off';
  facecamEditorStatus.style.color = facecamEditorEnabled ? '#22d3ee' : '#a1a1aa';
  livePreviewCanvas.style.cursor = facecamEditorEnabled ? 'grab' : 'default';
  if (compositor) compositor.setFacecamEditorEnabled(facecamEditorEnabled);
});

facecamShape.addEventListener('change', () => {
  if (compositor) compositor.setFacecamShape(facecamShape.value);
  applyFacecamOverlayShape();
});

facecamSize.addEventListener('input', () => {
  updateFacecamUiLabels();
  if (compositor) compositor.setFacecamSizePercent(Number(facecamSize.value));
  applyFacecamOverlaySize();
  syncPresetFromOverlay();
});

facecamZoom.addEventListener('input', () => {
  updateFacecamUiLabels();
  if (compositor) compositor.setFacecamZoom(Number(facecamZoom.value));
  applyFacecamOverlayZoom();
});

const btnTestCamera = document.getElementById('btnTestCamera');
const cameraStatus = document.getElementById('cameraStatus');
const cameraTestPreview = document.getElementById('cameraTestPreview');
let cameraTestStream = null;
btnTestCamera.addEventListener('click', async () => {
  if (cameraTestStream) {
    cameraTestStream.getTracks().forEach((t) => t.stop());
    cameraTestStream = null;
    cameraTestPreview.srcObject = null;
    cameraTestPreview.style.display = 'none';
    cameraStatus.textContent = 'Camera test stopped';
    cameraStatus.style.color = '#a1a1aa';
    btnTestCamera.textContent = 'Test camera';
    return;
  }

  cameraStatus.textContent = 'Requesting camera…';
  try {
    cameraTestStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
      audio: false,
    });
    cameraTestPreview.srcObject = cameraTestStream;
    cameraTestPreview.style.display = 'block';
    await cameraTestPreview.play();
    cameraStatus.textContent = 'Camera OK (live preview)';
    cameraStatus.style.color = '#22c55e';
    btnTestCamera.textContent = 'Stop camera test';
  } catch (e) {
    cameraStatus.textContent = 'Camera failed: ' + (e.message || e.name || 'Permission denied');
    cameraStatus.style.color = '#ef4444';
  }
});

btnPreview.addEventListener('click', async () => {
  if (!previewVisible) {
    await window.screenface.previewShow();
    previewVisible = true;
    btnPreview.textContent = 'Hide preview window';
    if (compositor) compositor.setPreviewWindowOpen(true);
    await ensurePreviewCompositor();
    if (includeCamera.checked) await startFacecamOverlay();
    if (!sourceSelect.value) {
      await loadSources();
      if (sourceSelect.value) await ensurePreviewCompositor();
    }
    pushPreviewSettings();
  } else {
    await window.screenface.previewHide();
    previewVisible = false;
    btnPreview.textContent = 'Show preview window';
    if (compositor) compositor.setPreviewWindowOpen(false);
    if (compositor && !compositor.isRecordingActive()) {
      await compositor.stopPreview();
      compositor = null;
    }
    await stopFacecamOverlay();
  }
});

btnStart.addEventListener('click', async () => {
  const sourceId = sourceSelect.value;
  if (!sourceId) {
    alert('Please select a capture source first.');
    return;
  }
  if (cameraTestStream) {
    cameraTestStream.getTracks().forEach((t) => t.stop());
    cameraTestStream = null;
    cameraTestPreview.srcObject = null;
    cameraTestPreview.style.display = 'none';
    btnTestCamera.textContent = 'Test camera';
  }
  await ensurePreviewCompositor();
  if (!compositor) {
    alert('Unable to initialize preview. Select a source and try again.');
    return;
  }
  await compositor.startRecording();
  if (includeCamera.checked) {
    await startFacecamOverlay();
  }
  btnStart.disabled = true;
  btnStop.disabled = false;
  pushPreviewSettings();
});

btnStop.addEventListener('click', async () => {
  if (audioOnlyRecorder && audioOnlyRecorder.state !== 'inactive') {
    audioOnlyRecorder.stop();
    return;
  }
  if (compositor) {
    await compositor.stopRecording();
  }
  if (!includeCamera.checked) {
    await stopFacecamOverlay();
  }
});

async function startTrayRecordingScreen() {
  if (compositor && compositor.isRecordingActive()) return;
  if (audioOnlyRecorder && audioOnlyRecorder.state === 'recording') return;
  await loadSources();
  if (!sourceSelect.value) {
    const sources = await window.screenface.getSources({ types: ['screen'], thumbnailSize: 0 });
    const first = sources.find((s) => s.id);
    if (first) sourceSelect.value = first.id;
  }
  if (!sourceSelect.value) {
    alert('No screen source available. Click the tray icon and choose Settings, then select a capture source.');
    return;
  }
  includeCamera.checked = false;
  if (compositor) {
    await compositor.stopPreview();
    compositor = null;
  }
  compositor = new Compositor(buildCompositorOptions({ includeCamera: false, recordingMode: 'screen' }));
  compositor.setLivePreviewCanvas(livePreviewCanvas);
  compositor.applyFacecamPreset(activeFacecamPresetIndex);
  applyFacecamControlsToCompositor();
  try {
    await compositor.startRecording();
  } catch (e) {
    compositor = null;
    alert('Screen recording failed: ' + (e.message || e.name || 'Select a source in Settings.'));
    return;
  }
  pushPreviewSettings();
}

async function startTrayRecordingWebcam() {
  if (compositor && compositor.isRecordingActive()) return;
  if (audioOnlyRecorder && audioOnlyRecorder.state === 'recording') return;
  if (compositor) {
    await compositor.stopPreview();
    compositor = null;
  }
  const opts = buildCompositorOptions({ recordingMode: 'webcam', includeCamera: true, sourceId: '', followFocused: false, autoZoomMouse: false });
  compositor = new Compositor(opts);
  compositor.setLivePreviewCanvas(livePreviewCanvas);
  try {
    await compositor.startRecording();
  } catch (e) {
    compositor = null;
    alert('Webcam recording failed: ' + (e.message || e.name || 'Check camera permission.'));
    return;
  }
  pushPreviewSettings();
}

async function startTrayRecordingAudio() {
  if (compositor && compositor.isRecordingActive()) return;
  if (audioOnlyRecorder && audioOnlyRecorder.state === 'recording') return;
  try {
    audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    alert('Microphone access failed: ' + (e.message || e.name || 'Grant microphone permission.'));
    return;
  }
  audioOnlyChunks = [];
  const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
  audioOnlyRecorder = new MediaRecorder(audioOnlyStream, { mimeType: mime, audioBitsPerSecond: 128000 });
  audioOnlyRecorder.ondataavailable = (e) => { if (e.data.size) audioOnlyChunks.push(e.data); };
  audioOnlyRecorder.onstop = async () => {
    const stream = audioOnlyStream;
    audioOnlyStream = null;
    audioOnlyRecorder = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    window.screenface.recordingStopped();
    btnStart.disabled = false;
    btnStop.disabled = true;
    const chunks = audioOnlyChunks;
    audioOnlyChunks = [];
    const arr = await Promise.all(chunks.map((c) => c.arrayBuffer().then((ab) => Array.from(new Uint8Array(ab)))));
    const filePath = await window.screenface.showSaveDialog();
    if (filePath) window.screenface.writeRecordingChunks(filePath, arr);
  };
  audioOnlyRecorder.start(1000);
  window.screenface.recordingStarted();
  btnStart.disabled = true;
  btnStop.disabled = false;
}

window.screenface.onTrayStartRecording((payload) => {
  const mode = payload && payload.mode;
  if (mode === 'screen') startTrayRecordingScreen();
  else if (mode === 'webcam') startTrayRecordingWebcam();
  else if (mode === 'audio') startTrayRecordingAudio();
});

window.screenface.onFocusWindowChanged(({ sourceId }) => {
  if (!followFocused.checked || !compositor) return;
  compositor.setDesktopSourceId(sourceId);
});

window.screenface.onApplyPreviewPreset((index) => {
  window.screenface.applyPreviewPreset(index);
});

window.screenface.onApplyFacecamPreset((index) => {
  activeFacecamPresetIndex = index;
  if (compositor) {
    compositor.applyFacecamPreset(index);
    compositor.highlightFacecamPreset(index);
    syncOverlayFromPreset();
  }
});

document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', async (event) => {
    const type = btn.dataset.presetType;
    const index = parseInt(btn.dataset.index, 10);
    if (type === 'preview') {
      if (event.shiftKey) {
        const bounds = await window.screenface.previewGetBounds();
        if (bounds) {
          await window.screenface.setPreviewPreset(index, bounds);
          cameraStatus.textContent = `Saved preview preset ${index + 1}`;
          cameraStatus.style.color = '#a1a1aa';
        }
      } else {
        await window.screenface.applyPreviewPreset(index);
      }
    } else if (type === 'facecam') {
      if (event.shiftKey) {
        const preset = compositor && compositor.facecamPreset
          ? { ...compositor.facecamPreset }
          : { xRatio: 0.78, yRatio: 0.72, sizePercent: 18, zoom: 1, shape: 'rect' };
        await window.screenface.setFacecamPreset(index, preset);
        cameraStatus.textContent = `Saved facecam preset ${index + 1}`;
        cameraStatus.style.color = '#a1a1aa';
        await refreshFacecamGuides();
      } else {
        activeFacecamPresetIndex = index;
        if (compositor) {
          compositor.applyFacecamPreset(index);
          compositor.highlightFacecamPreset(index);
          syncOverlayFromPreset();
        }
      }
    }
  });
});

livePreviewCanvas.addEventListener('mousedown', (event) => {
  if (!compositor || !facecamEditorEnabled) return;
  draggingFacecam = compositor.beginFacecamDragFromPreview(event.offsetX, event.offsetY);
  if (draggingFacecam) {
    livePreviewCanvas.style.cursor = 'grabbing';
  }
});

livePreviewCanvas.addEventListener('mousemove', (event) => {
  if (!compositor || !draggingFacecam) return;
  compositor.updateFacecamDragFromPreview(event.offsetX, event.offsetY);
});

window.addEventListener('mouseup', async () => {
  if (!compositor || !draggingFacecam) return;
  draggingFacecam = false;
  compositor.endFacecamDrag();
  livePreviewCanvas.style.cursor = facecamEditorEnabled ? 'grab' : 'default';
  await refreshFacecamGuides();
});

facecamOverlay.addEventListener('mousedown', (event) => {
  if (!includeCamera.checked) return;
  draggingFacecamOverlay = true;
  const ovRect = facecamOverlay.getBoundingClientRect();
  overlayDragOffset = {
    x: event.clientX - ovRect.left,
    y: event.clientY - ovRect.top,
  };
  facecamOverlay.style.cursor = 'grabbing';
  event.preventDefault();
});

window.addEventListener('mousemove', (event) => {
  if (!draggingFacecamOverlay) return;
  const stageRect = getStageRect();
  const ovRect = facecamOverlay.getBoundingClientRect();
  const maxX = stageRect.width - ovRect.width;
  const maxY = stageRect.height - ovRect.height;
  const left = Math.max(0, Math.min(maxX, event.clientX - stageRect.left - overlayDragOffset.x));
  const top = Math.max(0, Math.min(maxY, event.clientY - stageRect.top - overlayDragOffset.y));
  facecamOverlay.style.left = `${left}px`;
  facecamOverlay.style.top = `${top}px`;
  syncPresetFromOverlay();
});

window.addEventListener('mouseup', () => {
  if (!draggingFacecamOverlay) return;
  draggingFacecamOverlay = false;
  facecamOverlay.style.cursor = 'grab';
});

function applySettingsToUI(s) {
  if (!s) return;
  if (s.defaultOutputDir != null) {
    outputFolderPath.textContent = s.defaultOutputDir || 'Not set';
  }
  if (s.outputFormat != null) {
    outputFormat.value = s.outputFormat || 'mp4';
  }
  if (s.quality != null) {
    outputQuality.value = s.quality || 'quality';
  }
  if (s.audioVolume != null) {
    audioVolume.value = s.audioVolume;
    audioVolumeValue.textContent = s.audioVolume + '%';
  }
  if (s.audioEqProfile != null) {
    audioEqProfile.value = s.audioEqProfile || 'flat';
  }
}

function persistOutputAndAudio() {
  if (!window.screenface || !window.screenface.setSettings) return;
  window.screenface.setSettings({
    outputFormat: outputFormat.value,
    quality: outputQuality.value,
    audioVolume: Number(audioVolume.value),
    audioEqProfile: audioEqProfile.value,
  });
}

async function loadSettingsAndApply() {
  if (!window.screenface || !window.screenface.getSettings) return;
  const s = await window.screenface.getSettings();
  applySettingsToUI(s);
  if (compositor) compositor.setVideoBitsPerSecond(getQualityBitrate());
}

async function refreshProfileList() {
  if (!window.screenface || !window.screenface.listProfiles) return;
  const list = await window.screenface.listProfiles();
  const current = profileSelect.value;
  profileSelect.innerHTML = '<option value="">—</option>';
  list.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    profileSelect.appendChild(opt);
  });
  if (list.includes(current)) profileSelect.value = current;
}

btnBrowseFolder.addEventListener('click', async () => {
  const path = await window.screenface.showFolderDialog();
  if (path) {
    await window.screenface.setSettings({ defaultOutputDir: path });
    outputFolderPath.textContent = path;
  }
});

audioVolume.addEventListener('input', () => {
  audioVolumeValue.textContent = audioVolume.value + '%';
  persistOutputAndAudio();
});
audioEqProfile.addEventListener('change', persistOutputAndAudio);
outputFormat.addEventListener('change', persistOutputAndAudio);

btnSaveProfile.addEventListener('click', async () => {
  const name = window.prompt('Profile name', 'My profile');
  if (!name || !name.trim()) return;
  const s = await window.screenface.getSettings();
  const preset = compositor && compositor.facecamPreset
    ? { ...compositor.facecamPreset }
    : { xRatio: 0.78, yRatio: 0.72, sizePercent: 18, zoom: 1, shape: 'rect' };
  const payload = {
    sourceId: sourceSelect.value,
    resolution: resolutionSelect.value,
    followFocused: followFocused.checked,
    autoZoomMouse: autoZoomMouse.checked,
    includeCamera: includeCamera.checked,
    facecamShape: facecamShape.value,
    facecamSize: Number(facecamSize.value),
    facecamZoom: Number(facecamZoom.value),
    facecamPreset: preset,
    defaultOutputDir: s.defaultOutputDir || '',
    outputFormat: outputFormat.value,
    quality: outputQuality.value,
    audioVolume: Number(audioVolume.value),
    audioEqProfile: audioEqProfile.value,
  };
  await window.screenface.saveProfile(name.trim(), payload);
  await refreshProfileList();
  profileSelect.value = name.trim();
  if (cameraStatus) {
    cameraStatus.textContent = 'Profile saved: ' + name.trim();
    cameraStatus.style.color = '#22c55e';
  }
});

profileSelect.addEventListener('change', async () => {
  const name = profileSelect.value;
  if (!name) return;
  const payload = await window.screenface.loadProfile(name);
  if (!payload) return;
  if (payload.sourceId != null) sourceSelect.value = payload.sourceId;
  if (payload.resolution != null) resolutionSelect.value = payload.resolution;
  if (payload.followFocused != null) followFocused.checked = payload.followFocused;
  if (payload.autoZoomMouse != null) autoZoomMouse.checked = payload.autoZoomMouse;
  if (payload.includeCamera != null) includeCamera.checked = payload.includeCamera;
  if (payload.facecamShape != null) facecamShape.value = payload.facecamShape;
  if (payload.facecamSize != null) {
    facecamSize.value = payload.facecamSize;
    updateFacecamUiLabels();
  }
  if (payload.facecamZoom != null) {
    facecamZoom.value = payload.facecamZoom;
    updateFacecamUiLabels();
  }
  if (payload.facecamPreset && compositor) {
    compositor.setFacecamPositionRatio(payload.facecamPreset.xRatio, payload.facecamPreset.yRatio);
    compositor.setFacecamSizePercent(payload.facecamPreset.sizePercent);
    compositor.setFacecamZoom(payload.facecamPreset.zoom);
    compositor.setFacecamShape(payload.facecamPreset.shape || 'rect');
  }
  applySettingsToUI({
    defaultOutputDir: payload.defaultOutputDir,
    outputFormat: payload.outputFormat,
    quality: payload.quality,
    audioVolume: payload.audioVolume,
    audioEqProfile: payload.audioEqProfile,
  });
  if (payload.defaultOutputDir) outputFolderPath.textContent = payload.defaultOutputDir;
  else outputFolderPath.textContent = 'Not set';
  await window.screenface.setSettings({
    defaultOutputDir: payload.defaultOutputDir || '',
    outputFormat: payload.outputFormat,
    quality: payload.quality,
    audioVolume: payload.audioVolume,
    audioEqProfile: payload.audioEqProfile,
  });
  if (compositor) {
    compositor.setResolution(...(payload.resolution || '1920x1080').split('x').map(Number));
    compositor.setVideoBitsPerSecond(getQualityBitrate());
    applyFacecamControlsToCompositor();
    syncOverlayFromPreset();
  }
  if (sourceSelect.value) {
    if (compositor) compositor.setDesktopSourceId(sourceSelect.value);
    pushPreviewSettings();
  }
});

updateFacecamUiLabels();
applyFacecamOverlayShape();
applyFacecamOverlayZoom();
function setAdvancedPanelOpen(open) {
  const isOpen = !!open;
  if (advancedPanel) {
    advancedPanel.classList.toggle('open', isOpen);
  }
  if (btnAdvancedToggle) {
    btnAdvancedToggle.classList.toggle('open', isOpen);
    btnAdvancedToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
  try {
    localStorage.setItem('screenface-advanced-open', isOpen ? '1' : '0');
  } catch (_) {}
}

if (btnAdvancedToggle && advancedPanel) {
  btnAdvancedToggle.addEventListener('click', () => {
    setAdvancedPanelOpen(!advancedPanel.classList.contains('open'));
  });
  try {
    const saved = localStorage.getItem('screenface-advanced-open');
    setAdvancedPanelOpen(saved === '1');
  } catch (_) {
    setAdvancedPanelOpen(false);
  }
}

loadSources();
loadSettingsAndApply();
refreshProfileList();
