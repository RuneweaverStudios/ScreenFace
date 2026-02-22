/**
 * Persist app settings and named profiles in userData.
 * Settings: defaultOutputDir, outputFormat, quality, audioVolume, audioEqProfile.
 * Profiles: named snapshots of full UI state (resolution, facecam, output, audio, etc.).
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;

const SETTINGS_FILENAME = 'settings.json';
const PROFILES_DIR = 'profiles';

const DEFAULTS = {
  defaultOutputDir: '',
  outputFormat: 'mp4',
  quality: 'quality',
  audioVolume: 100,
  audioEqProfile: 'flat',
};

let _settings = null;
let _userDataPath = null;
let _profilesPath = null;

function getUserDataPath() {
  if (!_userDataPath) _userDataPath = app.getPath('userData');
  return _userDataPath;
}

function getProfilesDir() {
  if (!_profilesPath) _profilesPath = path.join(getUserDataPath(), PROFILES_DIR);
  return _profilesPath;
}

function getSettingsPath() {
  return path.join(getUserDataPath(), SETTINGS_FILENAME);
}

async function ensureProfilesDir() {
  const dir = getProfilesDir();
  await fs.mkdir(dir, { recursive: true });
}

async function loadSettings() {
  if (_settings) return _settings;
  try {
    const p = getSettingsPath();
    const raw = await fs.readFile(p, 'utf8');
    _settings = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    _settings = { ...DEFAULTS };
  }
  return _settings;
}

async function saveSettings(partial) {
  const s = await loadSettings();
  Object.assign(s, partial);
  await fs.writeFile(getSettingsPath(), JSON.stringify(s, null, 2), 'utf8');
  return s;
}

async function getSettings() {
  return loadSettings();
}

async function setSettings(partial) {
  return saveSettings(partial);
}

async function listProfiles() {
  await ensureProfilesDir();
  const dir = getProfilesDir();
  const names = await fs.readdir(dir);
  const json = names.filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/, ''));
  return json.sort();
}

async function saveProfile(name, payload) {
  await ensureProfilesDir();
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'profile';
  const file = path.join(getProfilesDir(), `${safe}.json`);
  await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
  return true;
}

async function loadProfile(name) {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const file = path.join(getProfilesDir(), `${safe}.json`);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = {
  getSettings,
  setSettings,
  ensureProfilesDir,
  listProfiles,
  saveProfile,
  loadProfile,
  DEFAULTS,
};
