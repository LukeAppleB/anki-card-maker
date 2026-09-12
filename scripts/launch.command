#!/usr/bin/env bash
# Double-clickable launcher for Card Maker. Opens in Terminal, starts the local
# server, and opens the browser. Closing this window stops Card Maker.
set -uo pipefail

APP_DIR="$HOME/Library/Application Support/CardMaker"
PORT=4321
NODE_BIN=""

# install-app.sh writes the port and the absolute node path here, because apps
# launched from Finder do not always inherit a useful PATH.
if [[ -f "$APP_DIR/config.sh" ]]; then
    # shellcheck disable=SC1091
    source "$APP_DIR/config.sh"
fi

PORT="${CARD_MAKER_PORT:-$PORT}"
URL="http://localhost:$PORT"

echo "======================================"
echo "            Card Maker"
echo "======================================"
echo

if curl -fsS -o /dev/null "$URL/" 2>/dev/null; then
    echo "Card Maker is already running. Opening it now..."
    open "$URL"
    echo
    echo "You can close this window."
    exit 0
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
    NODE_BIN="$(command -v node || true)"
fi
for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    [[ -n "$NODE_BIN" && -x "$NODE_BIN" ]] && break
    [[ -x "$candidate" ]] && NODE_BIN="$candidate"
done

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
    echo "Card Maker could not start because Node.js is missing."
    echo "Install it from https://nodejs.org and then try again."
    echo
    read -r -p "Press return to close this window."
    exit 1
fi

if [[ ! -f "$APP_DIR/serve.mjs" || ! -d "$APP_DIR/dist" ]]; then
    echo "Card Maker is not installed correctly ($APP_DIR is missing files)."
    echo "Re-run: npm run app:install"
    echo
    read -r -p "Press return to close this window."
    exit 1
fi

echo "Starting Card Maker..."
"$NODE_BIN" "$APP_DIR/serve.mjs" --root "$APP_DIR/dist" --port "$PORT" &
SERVER_PID=$!

STOPPED=0
cleanup() {
    [[ "$STOPPED" == "1" ]] && return
    STOPPED=1
    echo
    echo "Stopping Card Maker..."
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
    echo "Card Maker has stopped."
}
trap cleanup EXIT INT TERM

READY=0
for _ in $(seq 1 40); do
    if curl -fsS -o /dev/null "$URL/" 2>/dev/null; then
        READY=1
        break
    fi
    # Stop waiting if the server process has already given up.
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 0.25
done

if [[ "$READY" != "1" ]]; then
    echo
    echo "Card Maker failed to start. Please show this window to Luke."
    read -r -p "Press return to close this window."
    exit 1
fi

open "$URL"

echo
echo "Card Maker is open in your browser at $URL"
echo
echo "Leave this window open while you work."
echo "To stop Card Maker, close this window or press Control-C."
echo

wait "$SERVER_PID"
