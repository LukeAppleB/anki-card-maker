# Card Maker

A simple web app for creating Anki flashcards without learning Anki's editor syntax.

- **Fill-in-the-blank cards** — highlight text and click **Make blank** (blanks show as coloured chips, not `{{c1::…}}` syntax)
- **Question & answer cards** — separate question and answer fields
- **Formatting & images** — bold, italic, lists, colours, paste/drop images
- **Export** — downloads a `.apkg` file you can import into Anki (desktop, AnkiMobile, AnkiDroid)

## Install

The double-clickable app is macOS only. It is created in `~/Applications`. Homebrew and the one-liner install Node.js when the Mac does not already have Node 20.19+ or 22.12+.

### Homebrew

```bash
brew install node && curl -fsSL https://raw.githubusercontent.com/LukeAppleB/anki-card-maker/main/install.sh | bash
```

Install [Homebrew](https://brew.sh) first when `brew` is not already on the Mac:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### One-liner

```bash
curl -fsSL https://raw.githubusercontent.com/LukeAppleB/anki-card-maker/main/install.sh | bash
```

### npm

```bash
git clone https://github.com/LukeAppleB/anki-card-maker.git
cd anki-card-maker
npm install
npm run app:install
```

After the app is installed:

1. Double-click **Card Maker** (a Terminal window opens — that is normal and expected).
2. It opens automatically in the browser at http://localhost:4321.
3. Close the Terminal window when finished, which stops the server.

Clicking it again while it is already running just reopens the browser tab rather than starting a
second copy. Drag the app onto the Dock to keep it within easy reach.

Details worth knowing:

- The built app is copied to `~/Library/Application Support/CardMaker`, so it keeps working even if
  you move or delete this source folder.
- The server listens on `127.0.0.1` only, so it is not reachable from the network.
- The app icon comes from `assets/icon.png`; replace that file and reinstall to change it.
- To use a different port: `CARD_MAKER_PORT=5555 bash install.sh`. With the one-liner: `curl -fsSL https://raw.githubusercontent.com/LukeAppleB/anki-card-maker/main/install.sh | CARD_MAKER_PORT=5555 bash`.
- To preview the install without creating the app: `bash scripts/install-app.sh --dry-run`.

After changing the code, run the install command again (or `npm run app:install` from a checkout) to rebuild and update the installed copy.

To remove it (saved cards are untouched, since they live in the browser):

```bash
curl -fsSL https://raw.githubusercontent.com/LukeAppleB/anki-card-maker/main/install.sh | bash -s -- --uninstall
```

From a checkout: `npm run app:uninstall`.

## Run locally

```bash
cd anki-card-maker
npm install
npm run dev
```

Open the URL shown in the terminal (usually http://localhost:5173). This works on Windows and Linux too. The clickable app install is macOS only.

## Build for hosting

```bash
npm run build
npm run preview   # optional: test the production build locally
```

Upload the `dist/` folder to any static host (GitHub Pages, Cloudflare Pages, Netlify, etc.) and share the URL.

## How to import into Anki

1. Create your cards in Card Maker.
2. Click **Export to Anki** and save the `.apkg` file.
3. **Desktop:** double-click the file, or use *File → Import*.
4. **Mobile:** transfer the file to your device and open it with Anki.

Cards are saved in your browser automatically (IndexedDB). Export again anytime to get an updated deck file.

## Development

```bash
npm run test      # unit tests
npm run check     # typecheck
```

## Project layout

- `src/editor/` — TipTap rich text editor with cloze blank marks
- `src/export/html-to-anki.ts` — converts editor HTML to Anki field format
- `src/export/apkg.ts` — builds the `.apkg` SQLite package
- `src/store.ts` — card data + IndexedDB persistence
- `scripts/serve.mjs` — dependency-free static server
- `scripts/launch.command` — what the app icon runs: starts the server and opens the browser
- `install.sh` — macOS installer used by the Homebrew and curl one-liners
- `scripts/install-app.sh` / `scripts/uninstall.sh` — builds the `.app` bundle and removes it
- `assets/icon.png` — source image for the app icon
