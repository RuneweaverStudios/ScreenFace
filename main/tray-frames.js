const { nativeImage } = require('electron');
const path = require('path');

const SIZE = 22;
const FRAMES = 8;

function createCircleImage(radius, opacity, glow, r, g, b) {
  const size = SIZE;
  const center = size / 2;
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center + 0.5;
      const dy = y - center + 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      let a = 0;
      if (d <= radius + (glow || 0)) {
        const inCircle = d <= radius;
        a = inCircle ? opacity : opacity * 0.4 * (1 - (d - radius) / (glow || 1));
      }
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = Math.round(255 * Math.min(1, a));
    }
  }
  return data;
}

async function rawToPngBuffer(rawRgba, width, height) {
  const Jimp = require('jimp');
  const image = await Jimp.create(width, height);
  image.bitmap.data = Buffer.from(rawRgba);
  return image.getBufferAsync(Jimp.MIME_PNG);
}

async function createPulseFramesAsync() {
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const t = i / FRAMES;
    const opacity = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    const radius = 6 + 1.5 * Math.sin(t * Math.PI * 2);
    const glow = 3 + 2 * Math.sin(t * Math.PI * 2);
    const raw = createCircleImage(radius, opacity, glow, 255, 60, 60);
    const png = await rawToPngBuffer(raw, SIZE, SIZE);
    frames.push(nativeImage.createFromBuffer(png));
  }
  return frames;
}

async function createIdleIconAsync() {
  const raw = createCircleImage(7, 0.9, 0, 120, 120, 120);
  const png = await rawToPngBuffer(raw, SIZE, SIZE);
  return nativeImage.createFromBuffer(png);
}

let cachedPulseFrames = null;
let cachedIdleIcon = null;

async function getPulseFramesAsync() {
  if (!cachedPulseFrames) {
    cachedPulseFrames = await createPulseFramesAsync();
  }
  return cachedPulseFrames;
}

function getPulseFrames() {
  return cachedPulseFrames || [];
}

async function getIdleIconAsync() {
  if (!cachedIdleIcon) {
    cachedIdleIcon = await createIdleIconAsync();
  }
  return cachedIdleIcon;
}

module.exports = {
  getPulseFrames,
  getPulseFramesAsync,
  getIdleIconAsync,
  createCircleImage,
};
