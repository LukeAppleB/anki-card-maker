#!/usr/bin/env bash
# Removes the Card Maker app, its files, and the old login-item service if present.
# Saved cards live in the browser and are not touched.
set -uo pipefail

LABEL="com.cardmaker.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP_SUPPORT="$HOME/Library/Application Support/CardMaker"
APP_BUNDLE="${CARD_MAKER_APP_DIR:-$HOME/Applications}/Card Maker.app"

# Earlier versions installed a LaunchAgent that started on login.
if [[ -f "$PLIST" ]]; then
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null ||
        launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed the old login-item service."
fi

rm -rf "$APP_BUNDLE"
rm -rf "$APP_SUPPORT"
rm -rf "$HOME/Library/Logs/CardMaker"

echo "Card Maker has been removed. Your cards are still saved in the browser."
