/**
 * Compositor: captures desktop (and optional camera), draws to canvas, records via MediaRecorder.
 * Sends composite stream to preview window via IPC (or we use a second canvas stream).
 * Desktop stream is obtained with Electron's getUserMedia + chromeMediaSourceId.
 */

const FPS = 30;
const FACECAM_SIZE = 240;
const MOUSE_ZOOM_RADIUS = 200;
const MOUSE_ZOOM_SCALE = 2;
const DEFAULT_FACECAM = {
  xRatio: 0.78,
  yRatio: 0.72,
  sizePercent: 18,
  zoom: 1.0,
  shape: 'rect',
};

class Compositor {
  constructor(opts) {
    this.sourceId = opts.sourceId;
    this.width = opts.width || 1920;
    this.height = opts.height || 1080;
    this.followFocused = opts.followFocused || false;
    this.autoZoomMouse = opts.autoZoomMouse || false;
    this.includeCamera = opts.includeCamera || false;
    this.previewOpen = opts.previewOpen || false;
    this.onRecordingStarted = opts.onRecordingStarted || (() => {});
    this.onRecordingStopped = opts.onRecordingStopped || (() => {});
    this.onCameraError = opts.onCameraError || (() => {});
    this.videoBitsPerSecond = opts.videoBitsPerSecond != null ? opts.videoBitsPerSecond : 8000000;
    this.recordingMode = opts.recordingMode || 'screen'; // 'screen' | 'webcam'

    this.canvas = null;
    this.desktopStream = null;
    this.cameraStream = null;
    this.mediaRecorder = null;
    this.recordingChunks = [];
    this.livePreviewCanvas = null;
    this.livePreviewCtx = null;
    this.rafId = null;
    this.isInitialized = false;
    this.isRecording = false;
    this.lastPreviewPushMs = 0;
    this.facecamPreset = { ...DEFAULT_FACECAM };
    this.facecamPresetGuides = [];
    this.facecamEditorEnabled = false;
    this.dragState = null;
    this.activeFacecamPresetIndex = 0;
    this.highlightedPresetIndex = null;
    this.highlightUntil = 0;
    this.mouseX = 0.5;
    this.mouseY = 0.5;
    this.smoothMouseX = 0.5;
    this.smoothMouseY = 0.5;
  }

  setLivePreviewCanvas(canvasEl) {
    this.livePreviewCanvas = canvasEl;
    this.livePreviewCtx = canvasEl ? canvasEl.getContext('2d') : null;
  }

  setDesktopSourceId(sourceId) {
    this.sourceId = sourceId;
    this._replaceDesktopStream();
  }

  setResolution(width, height) {
    this.width = width;
    this.height = height;
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  setFollowFocused(enabled) {
    this.followFocused = !!enabled;
    if (enabled && window.screenface) {
      window.screenface.focusPollingStart();
    } else if (window.screenface) {
      window.screenface.focusPollingStop();
    }
  }

  setAutoZoomMouse(enabled) {
    this.autoZoomMouse = !!enabled;
  }

  setIncludeCamera(enabled) {
    this.includeCamera = !!enabled;
    if (enabled && !this.cameraStream) {
      this._getCameraStream();
    } else if (!enabled && this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
  }

  setPreviewWindowOpen(open) {
    this.previewOpen = !!open;
  }

  setVideoBitsPerSecond(bps) {
    this.videoBitsPerSecond = bps;
  }

  setRecordingMode(mode) {
    this.recordingMode = mode === 'webcam' ? 'webcam' : 'screen';
  }

  isRecordingActive() {
    return this.isRecording;
  }

  setFacecamEditorEnabled(enabled) {
    this.facecamEditorEnabled = !!enabled;
  }

  setFacecamZoom(zoom) {
    const z = Number(zoom);
    this.facecamPreset.zoom = Number.isFinite(z) ? Math.max(1, Math.min(3, z)) : 1;
  }

  setFacecamSizePercent(sizePercent) {
    const s = Number(sizePercent);
    this.facecamPreset.sizePercent = Number.isFinite(s) ? Math.max(8, Math.min(45, s)) : DEFAULT_FACECAM.sizePercent;
  }

  setFacecamShape(shape) {
    this.facecamPreset.shape = shape === 'circle' ? 'circle' : 'rect';
  }

  setFacecamPositionRatio(xRatio, yRatio) {
    this.facecamPreset.xRatio = Math.max(0, Math.min(1, Number(xRatio) || 0));
    this.facecamPreset.yRatio = Math.max(0, Math.min(1, Number(yRatio) || 0));
  }

  setFacecamPresetGuides(guides) {
    this.facecamPresetGuides = Array.isArray(guides) ? guides.map((g) => this._normalizeFacecamPreset(g)) : [];
  }

  highlightFacecamPreset(index, ms = 1200) {
    this.highlightedPresetIndex = index;
    this.highlightUntil = Date.now() + ms;
  }

  getFacecamPreset() {
    return { ...this.facecamPreset };
  }

  getFacecamLayoutForDimensions(width, height) {
    return this._getFacecamLayout(width, height);
  }

  async getFacecamOverlayStream() {
    if (!this.cameraStream) {
      await this._getCameraStream();
    }
    if (!this.cameraStream) return null;
    const track = this.cameraStream.getVideoTracks()[0];
    if (!track) return null;
    return new MediaStream([track.clone()]);
  }

  applyFacecamPreset(index) {
    if (!window.screenface) return;
    window.screenface.getFacecamPresets().then(presets => {
      if (presets[index]) {
        this.facecamPreset = this._normalizeFacecamPreset(presets[index]);
        this.activeFacecamPresetIndex = index;
        this.highlightFacecamPreset(index);
      }
    });
  }

  _normalizeFacecamPreset(preset) {
    if (!preset) return { ...DEFAULT_FACECAM };
    if (typeof preset.xRatio === 'number' && typeof preset.yRatio === 'number') {
      return {
        xRatio: Math.max(0, Math.min(1, preset.xRatio)),
        yRatio: Math.max(0, Math.min(1, preset.yRatio)),
        sizePercent: typeof preset.sizePercent === 'number' ? Math.max(8, Math.min(45, preset.sizePercent)) : DEFAULT_FACECAM.sizePercent,
        zoom: typeof preset.zoom === 'number' ? Math.max(1, Math.min(3, preset.zoom)) : DEFAULT_FACECAM.zoom,
        shape: preset.shape === 'circle' ? 'circle' : 'rect',
      };
    }

    // Backward compatibility with legacy corner presets.
    const baseW = 1920;
    const baseH = 1080;
    const sizePx = FACECAM_SIZE;
    let xPx = 16;
    let yPx = 16;
    if (preset.corner === 'top-right') {
      xPx = baseW - sizePx - (preset.x || 16);
      yPx = preset.y || 16;
    } else if (preset.corner === 'bottom-right') {
      xPx = baseW - sizePx - (preset.x || 16);
      yPx = baseH - sizePx - (preset.y || 16);
    } else if (preset.corner === 'bottom-left') {
      xPx = preset.x || 16;
      yPx = baseH - sizePx - (preset.y || 16);
    } else {
      xPx = preset.x || 16;
      yPx = preset.y || 16;
    }
    return {
      xRatio: Math.max(0, Math.min(1, xPx / baseW)),
      yRatio: Math.max(0, Math.min(1, yPx / baseH)),
      sizePercent: DEFAULT_FACECAM.sizePercent,
      zoom: DEFAULT_FACECAM.zoom,
      shape: DEFAULT_FACECAM.shape,
    };
  }

  _getFacecamLayout(w, h, preset = this.facecamPreset) {
    const size = Math.max(64, Math.min(Math.min(w, h) * 0.9, (Math.min(w, h) * (preset.sizePercent || DEFAULT_FACECAM.sizePercent)) / 100));
    const x = Math.max(0, Math.min(w - size, (preset.xRatio || 0) * w));
    const y = Math.max(0, Math.min(h - size, (preset.yRatio || 0) * h));
    return { x, y, size };
  }

  _setFacecamFromOutputPosition(x, y, size, w, h) {
    if (!w || !h) return;
    const clampedX = Math.max(0, Math.min(w - size, x));
    const clampedY = Math.max(0, Math.min(h - size, y));
    this.facecamPreset.xRatio = clampedX / w;
    this.facecamPreset.yRatio = clampedY / h;
  }

  _previewToOutput(px, py) {
    if (!this.livePreviewCanvas || !this.canvas) return { x: px, y: py };
    const scaleX = this.canvas.width / this.livePreviewCanvas.width;
    const scaleY = this.canvas.height / this.livePreviewCanvas.height;
    return { x: px * scaleX, y: py * scaleY };
  }

  beginFacecamDragFromPreview(px, py) {
    if (!this.facecamEditorEnabled || !this.canvas) return false;
    const { x, y } = this._previewToOutput(px, py);
    const layout = this._getFacecamLayout(this.canvas.width, this.canvas.height);
    const inside = x >= layout.x && x <= layout.x + layout.size && y >= layout.y && y <= layout.y + layout.size;
    if (!inside) return false;
    this.dragState = { dx: x - layout.x, dy: y - layout.y };
    return true;
  }

  updateFacecamDragFromPreview(px, py) {
    if (!this.dragState || !this.canvas) return;
    const { x, y } = this._previewToOutput(px, py);
    const layout = this._getFacecamLayout(this.canvas.width, this.canvas.height);
    this._setFacecamFromOutputPosition(
      x - this.dragState.dx,
      y - this.dragState.dy,
      layout.size,
      this.canvas.width,
      this.canvas.height
    );
  }

  endFacecamDrag() {
    this.dragState = null;
  }

  async _getDesktopStream() {
    if (!this.sourceId) return null;
    try {
      if (window.screenface && window.screenface.requestDesktopStream) {
        window.screenface.requestDesktopStream(this.sourceId, { width: this.width, height: this.height });
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: this.width, height: this.height, frameRate: FPS },
        audio: false,
      });
      return stream;
    } catch (e) {
      console.error('getDisplayMedia failed', e);
      return null;
    }
  }

  async _replaceDesktopStream() {
    if (!this.desktopStream) return;
    const old = this.desktopStream;
    this.desktopStream = await this._getDesktopStream();
    if (this.desktopStream) {
      old.getTracks().forEach(t => t.stop());
    } else {
      this.desktopStream = old;
    }
  }

  async _getCameraStream() {
    try {
      // Prefer ideal dimensions so any camera can be used; fallback to video: true
      const hasMediaDevices = navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
      if (!hasMediaDevices) {
        throw new Error('Camera API not available');
      }
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: FACECAM_SIZE },
          height: { ideal: FACECAM_SIZE },
          facingMode: 'user',
        },
        audio: false,
      });
    } catch (e) {
      console.error('getUserMedia camera failed', e);
      if (this.onCameraError) this.onCameraError(e);
    }
  }

  _drawFrame() {
    if (!this.canvas || !this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const isWebcamOnly = this.recordingMode === 'webcam';

    if (isWebcamOnly && this.cameraStream) {
      const cam = this._cameraVideoEl || (this._cameraVideoEl = this._makeVideoEl(this.cameraStream));
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(0, 0, w, h);
      if (cam.readyState >= 2 && cam.videoWidth > 0 && cam.videoHeight > 0) {
        const scale = Math.max(w / cam.videoWidth, h / cam.videoHeight);
        const sw = cam.videoWidth * scale;
        const sh = cam.videoHeight * scale;
        const sx = (w - sw) / 2;
        const sy = (h - sh) / 2;
        this.ctx.drawImage(cam, 0, 0, cam.videoWidth, cam.videoHeight, sx, sy, sw, sh);
      }
      if (this.livePreviewCanvas && this.livePreviewCtx) {
        this.livePreviewCtx.clearRect(0, 0, this.livePreviewCanvas.width, this.livePreviewCanvas.height);
        this.livePreviewCtx.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, 0, 0, this.livePreviewCanvas.width, this.livePreviewCanvas.height);
      }
      if (this.previewOpen && window.screenface && window.screenface.previewFrame) {
        const now = Date.now();
        if (now - this.lastPreviewPushMs > 120) {
          this.lastPreviewPushMs = now;
          try {
            this.livePreviewCtx ? window.screenface.previewFrame(this.canvas.toDataURL('image/jpeg', 0.65)) : null;
          } catch (_) {}
        }
      }
      this.rafId = requestAnimationFrame(() => this._drawFrame());
      return;
    }

    const vid = this.desktopStream && this.desktopStream.getVideoTracks()[0];
    const video = vid ? (this._desktopVideoEl || (this._desktopVideoEl = this._makeVideoEl(this.desktopStream))) : null;

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, w, h);

    if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      if (this.autoZoomMouse) {
        this.smoothMouseX += (this.mouseX - this.smoothMouseX) * 0.08;
        this.smoothMouseY += (this.mouseY - this.smoothMouseY) * 0.08;
        const cx = this.smoothMouseX * video.videoWidth;
        const cy = this.smoothMouseY * video.videoHeight;
        const r = MOUSE_ZOOM_RADIUS;
        const scale = MOUSE_ZOOM_SCALE;
        const sx = Math.max(0, Math.min(video.videoWidth - (r * 2) / scale, cx - r / scale));
        const sy = Math.max(0, Math.min(video.videoHeight - (r * 2) / scale, cy - r / scale));
        const sw = (r * 2) / scale;
        const sh = (r * 2) / scale;
        this.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
      } else {
        this.ctx.drawImage(video, 0, 0, w, h);
      }
    }

    if (this.includeCamera && this.cameraStream) {
      const cam = this._cameraVideoEl || (this._cameraVideoEl = this._makeVideoEl(this.cameraStream));
      if (cam.readyState >= 2) {
        const { x, y, size } = this._getFacecamLayout(w, h);
        const z = Math.max(1, Math.min(3, this.facecamPreset.zoom || 1));
        const sw = cam.videoWidth / z;
        const sh = cam.videoHeight / z;
        const sx = (cam.videoWidth - sw) / 2;
        const sy = (cam.videoHeight - sh) / 2;

        if (this.facecamPreset.shape === 'circle') {
          this.ctx.save();
          this.ctx.beginPath();
          this.ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
          this.ctx.closePath();
          this.ctx.clip();
          this.ctx.drawImage(cam, sx, sy, sw, sh, x, y, size, size);
          this.ctx.restore();
          this.ctx.strokeStyle = '#f1f5f9';
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
          this.ctx.stroke();
        } else {
          this.ctx.drawImage(cam, sx, sy, sw, sh, x, y, size, size);
          this.ctx.strokeStyle = '#f1f5f9';
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(x, y, size, size);
        }
      }
    }

    if (!this.includeCamera || !this.cameraStream) {
      const inactive = this._getFacecamLayout(w, h);
      this.ctx.save();
      this.ctx.setLineDash([6, 4]);
      this.ctx.strokeStyle = 'rgba(244, 114, 182, 0.95)';
      this.ctx.lineWidth = 2;
      if (this.facecamPreset.shape === 'circle') {
        this.ctx.beginPath();
        this.ctx.arc(inactive.x + inactive.size / 2, inactive.y + inactive.size / 2, inactive.size / 2, 0, Math.PI * 2);
        this.ctx.stroke();
      } else {
        this.ctx.strokeRect(inactive.x, inactive.y, inactive.size, inactive.size);
      }
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = 'rgba(15,23,42,0.72)';
      this.ctx.fillRect(inactive.x + 6, inactive.y + 6, 78, 18);
      this.ctx.fillStyle = '#f8fafc';
      this.ctx.font = '12px system-ui';
      this.ctx.fillText('Facecam off', inactive.x + 12, inactive.y + 19);
      this.ctx.restore();
    }

    if (this.includeCamera && this.facecamEditorEnabled) {
      this._drawFacecamGuides(this.ctx, w, h);
    }

    if (this.livePreviewCanvas && this.livePreviewCtx) {
      const targetW = this.livePreviewCanvas.width;
      const targetH = this.livePreviewCanvas.height;
      this.livePreviewCtx.clearRect(0, 0, targetW, targetH);
      this.livePreviewCtx.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, 0, 0, targetW, targetH);
    }

    if (this.previewOpen && window.screenface && window.screenface.previewFrame) {
      const now = Date.now();
      if (now - this.lastPreviewPushMs > 120) {
        this.lastPreviewPushMs = now;
        try {
          const frame = this.canvas.toDataURL('image/jpeg', 0.65);
          window.screenface.previewFrame(frame);
        } catch (_) {
          // ignore occasional frame encoding errors
        }
      }
    }

    this.rafId = requestAnimationFrame(() => this._drawFrame());
  }

  _drawFacecamGuides(ctx, w, h) {
    const active = this._getFacecamLayout(w, h);
    const now = Date.now();
    const hasHighlight = this.highlightedPresetIndex != null && now < this.highlightUntil;

    this.facecamPresetGuides.slice(0, 3).forEach((preset, idx) => {
      const g = this._getFacecamLayout(w, h, preset);
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = hasHighlight && this.highlightedPresetIndex === idx ? '#f59e0b' : 'rgba(148,163,184,0.8)';
      ctx.lineWidth = hasHighlight && this.highlightedPresetIndex === idx ? 3 : 1.5;
      if ((preset.shape || this.facecamPreset.shape) === 'circle') {
        ctx.beginPath();
        ctx.arc(g.x + g.size / 2, g.y + g.size / 2, g.size / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(g.x, g.y, g.size, g.size);
      }
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(15,23,42,0.75)';
      ctx.fillRect(g.x + 4, g.y + 4, 18, 16);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '11px system-ui';
      ctx.fillText(String(idx + 1), g.x + 10, g.y + 16);
      ctx.restore();
    });

    ctx.save();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    if (this.facecamPreset.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(active.x + active.size / 2, active.y + active.size / 2, active.size / 2, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(active.x, active.y, active.size, active.size);
    }
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(active.x + active.size - 8, active.y + active.size - 8, 8, 8);
    ctx.restore();
  }

  _makeVideoEl(stream) {
    const v = document.createElement('video');
    v.srcObject = stream;
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.setAttribute('playsinline', '');
    v.style.cssText = 'position:absolute;left:-9999px;width:320px;height:240px;opacity:0;pointer-events:none;';
    document.body.appendChild(v);
    v.play().catch(() => {});
    return v;
  }

  async _initializePipeline() {
    if (this.isInitialized) return;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');
    this.canvas.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(this.canvas);

    const isWebcamOnly = this.recordingMode === 'webcam';
    if (!isWebcamOnly) {
      this.desktopStream = await this._getDesktopStream();
      if (!this.desktopStream) {
        throw new Error('Could not get desktop stream. Select a source and try again.');
      }
    } else {
      this.desktopStream = null;
    }

    if (this.includeCamera || isWebcamOnly) {
      await this._getCameraStream();
    }
    if (isWebcamOnly && !this.cameraStream) {
      throw new Error('Could not get camera. Grant camera permission and try again.');
    }

    if (!isWebcamOnly && this.followFocused && window.screenface) {
      window.screenface.focusPollingStart();
    }

    if (this.desktopStream) this._desktopVideoEl = this._makeVideoEl(this.desktopStream);
    if (this.cameraStream) this._cameraVideoEl = this._makeVideoEl(this.cameraStream);

    if (!isWebcamOnly) this._setupMouseTracking();
    this._drawFrame();

    if (this.previewOpen && window.screenface && window.screenface.previewStartCapture) {
      window.screenface.previewStartCapture({
        sourceId: this.sourceId,
        resolution: { width: this.width, height: this.height },
        includeCamera: this.includeCamera,
        autoZoomMouse: this.autoZoomMouse,
        followFocused: this.followFocused,
      });
    }
    this.isInitialized = true;
  }

  async startPreview() {
    await this._initializePipeline();
  }

  async startRecording() {
    await this._initializePipeline();
    if (this.isRecording) return;
    const outStream = this.canvas.captureStream(FPS);
    this.recordingChunks = [];
    const mime = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
      ? 'video/webm; codecs=vp9'
      : 'video/webm';
    this.mediaRecorder = new MediaRecorder(outStream, {
      mimeType: mime,
      videoBitsPerSecond: this.videoBitsPerSecond,
    });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size) this.recordingChunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => this._onRecordingStopped();
    this.mediaRecorder.start(1000);
    this.isRecording = true;
    this.onRecordingStarted();
  }

  // Backward compatibility for existing calls.
  async start() {
    await this.startRecording();
  }

  _setupMouseTracking() {
    const update = (e) => {
      const el = this.livePreviewCanvas || this.canvas;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width && rect.height) {
        this.mouseX = (e.clientX - rect.left) / rect.width;
        this.mouseY = (e.clientY - rect.top) / rect.height;
      }
    };
    window.addEventListener('mousemove', update);
    this._mouseCleanup = () => window.removeEventListener('mousemove', update);
  }

  async stopRecording() {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
    this.mediaRecorder.stop();
  }

  async stopPreview() {
    if (this.isRecording) {
      await this.stopRecording();
    }
    if (this._mouseCleanup) this._mouseCleanup();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.livePreviewCanvas && this.livePreviewCtx) {
      this.livePreviewCtx.clearRect(0, 0, this.livePreviewCanvas.width, this.livePreviewCanvas.height);
    }
    if (this._desktopVideoEl && this._desktopVideoEl.parentNode) {
      this._desktopVideoEl.parentNode.removeChild(this._desktopVideoEl);
    }
    if (this._cameraVideoEl && this._cameraVideoEl.parentNode) {
      this._cameraVideoEl.parentNode.removeChild(this._cameraVideoEl);
    }
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    if (this.desktopStream) {
      this.desktopStream.getTracks().forEach(t => t.stop());
      this.desktopStream = null;
    }
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    this._desktopVideoEl = null;
    this._cameraVideoEl = null;
    this.mediaRecorder = null;
    this.isInitialized = false;
    this.isRecording = false;
    if (this.followFocused && window.screenface) {
      window.screenface.focusPollingStop();
    }
    if (window.screenface && window.screenface.previewStopCapture) {
      window.screenface.previewStopCapture();
    }
  }

  async _onRecordingStopped() {
    this.isRecording = false;
    this.mediaRecorder = null;

    const chunks = this.recordingChunks;
    this.recordingChunks = [];
    this.onRecordingStopped();

    const arr = await Promise.all(chunks.map((c) => c.arrayBuffer().then((ab) => Array.from(new Uint8Array(ab)))));
    window.screenface.showSaveDialog().then((filePath) => {
      if (!filePath) return;
      window.screenface.writeRecordingChunks(filePath, arr);
    });
  }
}

// Export for use in control.js
if (typeof window !== 'undefined') {
  window.Compositor = Compositor;
}
