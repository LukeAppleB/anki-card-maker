#!/usr/bin/env bash
# Installs the Card Maker macOS app into ~/Applications.
#
#   curl -fsSL https://raw.githubusercontent.com/LukeAppleB/anki-card-maker/main/install.sh | bash
#   bash install.sh
#   curl -fsSL https://raw.githubusercontent.com/LukeAppleB/anki-card-maker/main/install.sh | bash -s -- --uninstall
set -euo pipefail

REPO_URL="https://github.com/LukeAppleB/anki-card-maker.git"
RAW_UNINSTALL="https://raw.githubusercontent.com/LukeAppleB/anki-card-maker/main/scripts/uninstall.sh"
REF="${CARD_MAKER_REF:-main}"

# Vite requires ^20.19.0 || >=22.12.0
NODE_VERSION_CHECK='const [maj, min] = process.versions.node.split(".").map(Number);
process.exit((maj > 22 || (maj === 22 && min >= 12) || (maj === 20 && min >= 19)) ? 0 : 1)'

usage() {
    cat <<'EOF'
Usage: install.sh [--uninstall]

Installs Card Maker as a double-clickable macOS app in ~/Applications.
Node.js is installed with Homebrew when it is missing or too old.
EOF
}

UNINSTALL=0
for arg in "$@"; do
    case "$arg" in
        --uninstall) UNINSTALL=1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $arg" >&2; exit 2 ;;
    esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This installer is for macOS. Clone the repo and run: npm install && npm run dev" >&2
    exit 1
fi

# When the script is executed from a checkout, install that copy.
# A piped `curl | bash` has no script path, so it clones main instead.
SOURCE=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -f "$SCRIPT_DIR/package.json" && -f "$SCRIPT_DIR/scripts/install-app.sh" ]]; then
        SOURCE="$SCRIPT_DIR"
    fi
fi

load_brew() {
    if command -v brew >/dev/null 2>&1; then
        return 0
    fi
    local candidate
    for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        if [[ -x "$candidate" ]]; then
            # shellcheck disable=SC1090
            eval "$("$candidate" shellenv)"
            return 0
        fi
    done
    return 1
}

node_ok() {
    command -v node >/dev/null 2>&1 && node -e "$NODE_VERSION_CHECK"
}

ensure_node() {
    load_brew || true
    if node_ok; then
        return
    fi
    if ! command -v brew >/dev/null 2>&1; then
        echo "Node.js 20.19+ or 22.12+ was not found, and Homebrew is not installed." >&2
        echo "Install Homebrew from https://brew.sh, then run this again." >&2
        exit 1
    fi
    if command -v node >/dev/null 2>&1; then
        echo "==> Node.js $(node -v) is older than 20.19 / 22.12. Updating it with Homebrew"
        HOMEBREW_NO_AUTO_UPDATE=1 brew upgrade node || HOMEBREW_NO_AUTO_UPDATE=1 brew install node
    else
        echo "==> Installing Node.js with Homebrew"
        HOMEBREW_NO_AUTO_UPDATE=1 brew install node
    fi
    export PATH="$(brew --prefix)/bin:$PATH"
    hash -r
    if ! node_ok; then
        echo "Node.js is still too old ($(node -v 2>/dev/null || echo "not found"))." >&2
        exit 1
    fi
}

run_uninstall() {
    if [[ -n "$SOURCE" && -f "$SOURCE/scripts/uninstall.sh" ]]; then
        bash "$SOURCE/scripts/uninstall.sh"
        return
    fi
    local tmp
    tmp="$(mktemp)"
    curl -fsSL "$RAW_UNINSTALL" -o "$tmp"
    bash "$tmp"
    rm -f "$tmp"
}

if [[ "$UNINSTALL" == "1" ]]; then
    run_uninstall
    exit 0
fi

ensure_node

CLONE_DIR=""
cleanup() {
    if [[ -n "$CLONE_DIR" ]]; then
        rm -rf "$CLONE_DIR"
    fi
}
trap cleanup EXIT

if [[ -z "$SOURCE" ]]; then
    if ! command -v git >/dev/null 2>&1; then
        echo "==> Installing git with Homebrew"
        HOMEBREW_NO_AUTO_UPDATE=1 brew install git
    fi
    CLONE_DIR="$(mktemp -d)"
    echo "==> Downloading Card Maker"
    git clone --depth 1 --branch "$REF" "$REPO_URL" "$CLONE_DIR"
    SOURCE="$CLONE_DIR"
fi

echo "==> Installing dependencies"
(
    cd "$SOURCE"
    npm ci --no-audit --no-fund
)

echo "==> Installing the Card Maker app"
bash "$SOURCE/scripts/install-app.sh"
