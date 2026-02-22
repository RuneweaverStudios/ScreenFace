# ScreenFace — Installation guide

This guide covers installing ScreenFace on **macOS** and **Windows** using the install wizard (downloadable installers) or the one-liner installers.

---

## Requirements

- **macOS**: 10.15 (Catalina) or later, 64-bit
- **Windows**: Windows 10/11, 64-bit
- **Permissions**: Screen recording (and camera/microphone if you use facecam)

---

## Option 1: Install wizard (recommended)

Download the installer for your OS from [Releases](https://github.com/RuneweaverStudios/ScreenFace/releases) and run it.

### macOS

1. Download **ScreenFace-x.x.x.dmg** (or the latest `.dmg`) from Releases.
2. Double-click the DMG to open it.
3. Drag **ScreenFace** to **Applications**.
4. Eject the disk image. ScreenFace appears in your Applications folder.
5. First run: if macOS blocks the app (“unidentified developer”), open **System Settings → Privacy & Security** and choose **Open Anyway** for ScreenFace.

### Windows

1. Download **ScreenFace Setup x.x.x.exe** (or the latest `.exe`) from Releases.
2. Run the installer. The **Install Wizard** will guide you through:
   - **Welcome** — Click Next.
   - **License** — Accept the MIT license and click Next.
   - **Install location** — Choose where to install (or keep default) and click Next.
   - **Shortcuts** — Choose desktop and/or Start menu shortcut, then Next.
   - **Install** — Click Install, then Finish.
3. Start ScreenFace from the Start menu or desktop shortcut.

---

## Option 2: One-liner installers

Use these after you have published at least one release (with a `.dmg` on macOS or `.exe` on Windows) and have set `GITHUB_REPO` or replaced `RuneweaverStudios/ScreenFace` in the script with your actual repo (e.g. `myorg/ScreenFace`).

### macOS (Terminal)

```bash
curl -fsSL https://raw.githubusercontent.com/RuneweaverStudios/ScreenFace/main/install/install.sh | bash
```

Install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/RuneweaverStudios/ScreenFace/main/install/install.sh | bash -s -- v1.0.0
```

This downloads the latest (or specified) release DMG, mounts it, copies ScreenFace to `/Applications`, and cleans up.

### Windows (PowerShell)

Run PowerShell as needed (e.g. “Run as Administrator” not required for user install):

```powershell
irm https://raw.githubusercontent.com/RuneweaverStudios/ScreenFace/main/install/install.ps1 | iex
```

Install a specific version:

```powershell
irm https://raw.githubusercontent.com/RuneweaverStudios/ScreenFace/main/install/install.ps1 | iex -ArgumentList "v1.0.0"
```

This downloads the latest (or specified) Windows installer and runs it; follow the on-screen wizard.

---

## Building installers from source

To produce the same installers locally:

```bash
git clone https://github.com/RuneweaverStudios/ScreenFace.git
cd ScreenFace
npm install
npm run build:mac    # → dist/*.dmg (macOS)
npm run build:win   # → dist/*.exe (Windows)
```

Output is in the `dist/` directory. See [README](../README.md#building-from-source) for more build options.
