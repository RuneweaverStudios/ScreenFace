const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');
const placeholder = document.getElementById('placeholder');

function setPlaceholder(show, text) {
  if (text) placeholder.textContent = text;
  placeholder.style.display = show ? 'flex' : 'none';
}

function hidePreview() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.style.display = 'block';
  setPlaceholder(true, 'Preview active');
}

async function startCapture(payload) {
  canvas.width = payload?.resolution?.width || 1280;
  canvas.height = payload?.resolution?.height || 720;
  canvas.style.display = 'block';
  setPlaceholder(false);
}

async function updateSettings(payload) {
  if (payload?.resolution) {
    canvas.width = payload.resolution.width || canvas.width;
    canvas.height = payload.resolution.height || canvas.height;
  }
  canvas.style.display = 'block';
  if (payload?.sourceId) setPlaceholder(false);
}

function drawFrameDataUrl(dataUrl) {
  if (!dataUrl) return;
  const img = new Image();
  img.onload = () => {
    canvas.style.display = 'block';
    setPlaceholder(false);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = dataUrl;
}

if (window.screenfacePreview) {
  if (window.screenfacePreview.onStartCapture) {
    window.screenfacePreview.onStartCapture((payload) => {
      startCapture(payload);
    });
  }
  if (window.screenfacePreview.onUpdateSettings) {
    window.screenfacePreview.onUpdateSettings((payload) => {
      updateSettings(payload);
    });
  }
  if (window.screenfacePreview.onFrame) {
    window.screenfacePreview.onFrame((dataUrl) => {
      drawFrameDataUrl(dataUrl);
    });
  }
  if (window.screenfacePreview.onStopCapture) {
    window.screenfacePreview.onStopCapture(() => hidePreview());
  }
}

window.addEventListener('beforeunload', () => {
  hidePreview();
});
