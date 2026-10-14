# Card Maker

A simple web app for creating Anki flashcards without learning Anki's editor syntax.

- **Fill-in-the-blank cards** — highlight text and click **Make blank** (blanks show as coloured chips, not `{{c1::…}}` syntax)
- **Question & answer cards** — separate question and answer fields
- **Formatting & images** — bold, italic, lists, colours, paste/drop images
- **Export** — downloads a `.apkg` file you can import into Anki (desktop, AnkiMobile, AnkiDroid)

## Install

On a Mac, open Terminal (⌘Space, type Terminal, press Return) and paste:

Install [Homebrew](https://brew.sh) first when `brew` is missing:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

```bash
brew install node && curl -fsSL https://raw.githubusercontent.com/LukeAppleB/anki-card-maker/main/install.sh | bash
```

Card Maker appears in `~/Applications`. Double-click it — a Terminal window opens, then the app opens in the browser at http://localhost:4321. Close that window when finished. Drag the app onto the Dock to keep it handy.

Other ways:

```bash
curl -fsSL https://raw.githubusercontent.com/LukeAppleB/anki-card-maker/main/install.sh | bash   # one-liner
npm install && npm run app:install   # from a checkout
npm install && npm run dev           # local server at http://localhost:5173
```

Remove the app (saved cards stay in the browser):

```bash
curl -fsSL https://raw.githubusercontent.com/LukeAppleB/anki-card-maker/main/install.sh | bash -s -- --uninstall
```

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
