# Card Maker

A simple web app for creating Anki flashcards without learning Anki's editor syntax.

- **Fill-in-the-blank cards** — highlight text and click **Make blank** (blanks show as coloured chips, not `{{c1::…}}` syntax)
- **Question & answer cards** — separate question and answer fields
- **Formatting & images** — bold, italic, lists, colours, paste/drop images
- **Export** — downloads a `.apkg` file you can import into Anki (desktop, AnkiMobile, AnkiDroid)

## Run locally

```bash
cd card-maker
npm install
npm run dev
```

Open the URL shown in the terminal (usually http://localhost:5173).

## Install as a clickable app (macOS)

This creates a **Card Maker** app in `~/Applications` with its own icon. Double-clicking it opens a
Terminal window, starts the local server and opens Card Maker in the browser. Requires
[Node.js](https://nodejs.org) on the machine.

```bash
cd card-maker
npm install
npm run app:install
```

What she does after that:

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
- To use a different port: `CARD_MAKER_PORT=5555 npm run app:install`.
- To preview the install without creating the app: `bash scripts/install-app.sh --dry-run`.

After changing the code, re-run `npm run app:install` to rebuild and update the installed copy.

To remove it (saved cards are untouched, since they live in the browser):

```bash
npm run app:uninstall
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
- `scripts/install-app.sh` / `scripts/uninstall.sh` — builds the `.app` bundle and removes it
- `assets/icon.png` — source image for the app icon
