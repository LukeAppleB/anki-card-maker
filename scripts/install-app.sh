#!/usr/bin/env bash
# Builds Card Maker and creates a double-clickable "Card Maker.app" in ~/Applications.
# Clicking it opens a Terminal window, starts the local server and opens the browser.
# Usage: bash scripts/install-app.sh [--dry-run]
set -euo pipefail

PORT="${CARD_MAKER_PORT:-4321}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/CardMaker"
APP_BUNDLE="${CARD_MAKER_APP_DIR:-$HOME/Applications}/Card Maker.app"
DRY_RUN=0

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        *) echo "Unknown option: $arg" >&2; exit 2 ;;
    esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This installer is for macOS. See the README for other systems." >&2
    exit 1
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
    echo "Node.js was not found. Install it from https://nodejs.org and run this again." >&2
    exit 1
fi

echo "==> Building the app"
cd "$REPO_DIR"
npm run build

echo "==> Installing files to $APP_SUPPORT"
mkdir -p "$APP_SUPPORT"
rm -rf "$APP_SUPPORT/dist"
cp -R "$REPO_DIR/dist" "$APP_SUPPORT/dist"
cp "$REPO_DIR/scripts/serve.mjs" "$APP_SUPPORT/serve.mjs"
cp "$REPO_DIR/scripts/launch.command" "$APP_SUPPORT/launch.command"
chmod +x "$APP_SUPPORT/launch.command"

# Recorded so the launcher works even when Finder gives it a bare PATH.
cat > "$APP_SUPPORT/config.sh" <<CONFIG
NODE_BIN="$NODE_BIN"
PORT=$PORT
CONFIG

echo "==> Building the icon"
ICNS_OUT="$APP_SUPPORT/CardMaker.icns"
ICON_SRC="$REPO_DIR/assets/icon.png"
if [[ -f "$ICON_SRC" ]]; then
    ICONSET="$(mktemp -d)/CardMaker.iconset"
    mkdir -p "$ICONSET"
    # -s format png matters: iconutil rejects an iconset holding non-PNG data.
    for size in 16 32 128 256 512; do
        sips -s format png -z "$size" "$size" "$ICON_SRC" \
            --out "$ICONSET/icon_${size}x${size}.png" >/dev/null 2>&1
        sips -s format png -z "$((size * 2))" "$((size * 2))" "$ICON_SRC" \
            --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null 2>&1
    done
    iconutil -c icns "$ICONSET" -o "$ICNS_OUT"
else
    echo "    (no assets/icon.png found, the app will use the default icon)"
fi

echo "==> Creating $APP_BUNDLE"
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"

cat > "$APP_BUNDLE/Contents/MacOS/CardMaker" <<'LAUNCHER'
#!/bin/bash
# Opens the Card Maker launcher in a Terminal window.
exec /usr/bin/open -a Terminal "$HOME/Library/Application Support/CardMaker/launch.command"
LAUNCHER
chmod +x "$APP_BUNDLE/Contents/MacOS/CardMaker"

if [[ -f "$ICNS_OUT" ]]; then
    cp "$ICNS_OUT" "$APP_BUNDLE/Contents/Resources/CardMaker.icns"
fi

cat > "$APP_BUNDLE/Contents/Info.plist" <<'PLIST_XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>Card Maker</string>
	<key>CFBundleDisplayName</key>
	<string>Card Maker</string>
	<key>CFBundleIdentifier</key>
	<string>com.cardmaker.launcher</string>
	<key>CFBundleExecutable</key>
	<string>CardMaker</string>
	<key>CFBundleIconFile</key>
	<string>CardMaker</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleShortVersionString</key>
	<string>1.0</string>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>LSMinimumSystemVersion</key>
	<string>11.0</string>
	<key>LSUIElement</key>
	<true/>
	<key>NSHighResolutionCapable</key>
	<true/>
</dict>
</plist>
PLIST_XML

plutil -lint "$APP_BUNDLE/Contents/Info.plist" >/dev/null

# Nudge Finder so the new icon and name show up straight away.
touch "$APP_BUNDLE"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
[[ -x "$LSREGISTER" ]] && "$LSREGISTER" -f "$APP_BUNDLE" >/dev/null 2>&1 || true

if [[ "$DRY_RUN" == "1" ]]; then
    echo
    echo "Dry run complete."
    echo "App bundle: $APP_BUNDLE"
    exit 0
fi

echo
echo "Done. 'Card Maker' is in $(dirname "$APP_BUNDLE")."
echo
echo "Tell her:"
echo "  1. Double-click Card Maker to start it (a Terminal window opens, that is normal)."
echo "  2. It opens in the browser at http://localhost:$PORT"
echo "  3. Close the Terminal window when finished."
echo
echo "To keep it handy, drag Card Maker from $(dirname "$APP_BUNDLE") onto the Dock."
