#!/usr/bin/env bash
# ScreenFace one-liner installer for macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/RuneweaverStudios/ScreenFace/main/install/install.sh | bash
# Or:    curl -fsSL https://raw.githubusercontent.com/RuneweaverStudios/ScreenFace/main/install/install.sh | bash -s -- v1.0.0

set -e
GITHUB_REPO="${GITHUB_REPO:-RuneweaverStudios/ScreenFace}"
VERSION="${1:-latest}"
API_URL="https://api.github.com/repos/${GITHUB_REPO}/releases"
if [ "$VERSION" = "latest" ]; then
  RELEASE_JSON=$(curl -fsSL "${API_URL}/latest")
else
  RELEASE_JSON=$(curl -fsSL "${API_URL}/tags/${VERSION}")
fi
DMG_URL=$(echo "$RELEASE_JSON" | grep -o '"browser_download_url": "[^"]*\.dmg"' | head -1 | sed 's/.*: "\(.*\)".*/\1/')
if [ -z "$DMG_URL" ]; then
  echo "No .dmg found for version: $VERSION"
  exit 1
fi
echo "Downloading ScreenFace..."
TMP_DMG=$(mktemp -t screenface-XXXXXX.dmg)
curl -fsSL -o "$TMP_DMG" "$DMG_URL"
echo "Mounting installer..."
MOUNT=$(hdiutil attach -nobrowse -quiet "$TMP_DMG" | tail -1 | awk '{print $3}')
APP_SRC=$(find "$MOUNT" -maxdepth 1 -name "*.app" -type d | head -1)
if [ -z "$APP_SRC" ]; then
  hdiutil detach "$MOUNT" -quiet 2>/dev/null || true
  rm -f "$TMP_DMG"
  echo "No .app found in DMG."
  exit 1
fi
echo "Installing to /Applications..."
rm -rf /Applications/ScreenFace.app
cp -R "$APP_SRC" /Applications/ScreenFace.app
hdiutil detach "$MOUNT" -quiet 2>/dev/null || true
rm -f "$TMP_DMG"
echo "ScreenFace installed to /Applications/ScreenFace.app"
echo "Open from Applications or run: open -a ScreenFace"
