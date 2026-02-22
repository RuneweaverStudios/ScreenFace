# ScreenFace

**Screen recording with smart window switching, optional facecam, and MP4/WebM export.**  
Professional install wizard and one-liner installers for **macOS** and **Windows**.

---

## Description

ScreenFace is an Electron desktop app that records your screen and/or a selected window, with optional camera overlay (facecam), mouse-area zoom, and follow-focused-window switching. Recordings can be saved as **MP4** (default, converted from WebM) or **WebM**, with quality presets and a configurable default save folder. Settings and layouts can be saved as **profiles**.

**Features:**

- Capture full screen or a specific window
- **Follow focused window** — automatically switch source when you change active app
- **Auto zoom to mouse** — optional zoom region that follows the cursor
- **Facecam** — draggable camera overlay (rectangle or circle), size/zoom, position presets
- **Live preview** — always-on-top popout preview (excluded from recording)
- **Presets** — save/apply preview and facecam positions (buttons 1/2/3, hotkeys)
- **Audio & EQ** — volume and EQ profile (Flat / Voice / Music) in advanced settings
- **Video output** — default save folder, MP4 or WebM, quality (Optimize / Balanced / Smaller file)
- **Setting profiles** — save and load full configuration by name
- **Tray** — system tray icon with pulsing red indicator when recording
- **Hotkeys** — Ctrl+Shift+1/2/3 (preview position), Ctrl+Alt+1/2/3 (facecam position)

---

## Installation

### Install wizard (recommended)

1. Go to [Releases](https://github.com/RuneweaverStudios/ScreenFace/releases).
2. Download the installer for your OS:
   - **macOS**: `ScreenFace-x.x.x.dmg` → open and drag to **Applications**.
   - **Windows**: `ScreenFace Setup x.x.x.exe` → run and follow the wizard (license, install path, shortcuts).
3. Launch **ScreenFace** from Applications (Mac) or Start menu / desktop (Windows).

Detailed steps (permissions, first run): **[docs/INSTALL.md](docs/INSTALL.md)**.

### One-liner installers

Replace `RuneweaverStudios/ScreenFace` with your actual GitHub repo (e.g. `myorg/ScreenFace`). Requires at least one published release with a `.dmg` (Mac) or `.exe` (Windows).

**macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/RuneweaverStudios/ScreenFace/main/install/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/RuneweaverStudios/ScreenFace/main/install/install.ps1 | iex
```

See **[docs/INSTALL.md](docs/INSTALL.md)** for versioned installs and options.

---

## Usage

1. **Start ScreenFace** — control window and tray icon appear.
2. **Select source** — choose a screen or window from the dropdown.
3. **Resolution** — pick 720p / 1080p / 1440p / 4K.
4. **Options** — enable *Follow focused window*, *Auto zoom to mouse*, and/or *Include camera (facecam)* as needed.
5. **Facecam** — if enabled, use *Edit facecam* to drag position; set shape (rect/circle), size, zoom; use presets 1/2/3 (Shift+click to save).
6. **Preview** — click *Show preview window* for an always-on-top composed preview (move it off the area you record).
7. **Record** — *Start recording*; stop with *Stop recording*. Save dialog uses your default folder and format (MP4/WebM).
8. **Advanced** — expand *Advanced settings* for audio volume/EQ, video output folder/format/quality, and setting profiles.

**Hotkeys:**  
Preview position: **Ctrl+Shift+1 / 2 / 3** — Facecam position: **Ctrl+Alt+1 / 2 / 3**

---

## Building from source

**Requirements:** Node.js 18+, npm.

```bash
git clone https://github.com/RuneweaverStudios/ScreenFace.git
cd ScreenFace
npm install
npm start          # run in development
npm run build:mac  # build macOS .dmg (and .zip)
npm run build:win  # build Windows .exe (NSIS installer)
npm run build      # build for current platform
```

Installers are produced in `dist/`. To publish a release, upload the `.dmg` and `.exe` (and optionally `.zip`) to GitHub Releases, then the one-liner scripts can target that release.

---

## GitHub repository setup

1. **Create a new repo** on GitHub (e.g. `ScreenFace`), leave it empty (no README/license).
2. **Set repository description** (optional): use the line in [.github/DESCRIPTION.txt](.github/DESCRIPTION.txt):  
   *Screen recording app with smart window switching, optional facecam, and MP4/WebM export. Install wizard + one-liner install for Mac & Windows.*
3. **Replace placeholder** in this repo: replace `RuneweaverStudios/ScreenFace` in:
   - `README.md` (this file)
   - `docs/INSTALL.md`
   - `install/install.sh`
   - `install/install.ps1`
   with your actual repo (e.g. `myorg/ScreenFace`).
4. **Push to the new repo:**

   ```bash
   cd /path/to/ScreenFace
   git init
   git add .
   git commit -m "Initial commit: ScreenFace with install wizard and one-liner installers"
   git remote add origin https://github.com/RuneweaverStudios/ScreenFace.git
   git branch -M main
   git push -u origin main
   ```

5. **Publish a release** (e.g. v1.0.0) and attach the built `.dmg` and `.exe` so the one-liner installers work.

---

## License

MIT — see [LICENSE](LICENSE).
