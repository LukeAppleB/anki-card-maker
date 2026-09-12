#!/usr/bin/env node
// Zero-dependency static file server for the built Card Maker app.
// Bound to localhost only so it is never reachable from the network.
import { createReadStream, realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
};

export function contentTypeFor(filePath) {
    return MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/// Maps a request URL onto a file inside root, or null if it escapes root.
export function resolveRequestPath(root, requestUrl) {
    const rootDir = resolve(root);
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
    } catch {
        return null;
    }
    if (pathname.endsWith("/")) {
        pathname += "index.html";
    }
    const candidate = resolve(rootDir, `.${pathname}`);
    if (candidate !== rootDir && !candidate.startsWith(rootDir + sep)) {
        return null;
    }
    return candidate;
}

function cacheControlFor(filePath) {
    // Vite fingerprints files under assets/, so those can be cached indefinitely.
    return filePath.includes(`${sep}assets${sep}`)
        ? "public, max-age=31536000, immutable"
        : "no-cache";
}

async function statFile(filePath) {
    try {
        const info = await stat(filePath);
        return info.isFile() ? info : null;
    } catch {
        return null;
    }
}

export function createStaticServer(root) {
    const rootDir = resolve(root);
    const indexPath = resolve(rootDir, "index.html");

    return createServer(async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405, { allow: "GET, HEAD" }).end();
            return;
        }

        const requested = resolveRequestPath(rootDir, req.url ?? "/");
        if (!requested) {
            res.writeHead(403).end();
            return;
        }

        let filePath = requested;
        let info = await statFile(filePath);
        if (!info && !extname(requested)) {
            filePath = indexPath;
            info = await statFile(filePath);
        }
        if (!info) {
            res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
            return;
        }

        res.writeHead(200, {
            "content-type": contentTypeFor(filePath),
            "content-length": info.size,
            "cache-control": cacheControlFor(filePath),
        });
        if (req.method === "HEAD") {
            res.end();
            return;
        }
        createReadStream(filePath).pipe(res);
    });
}

function parseArgs(argv) {
    const args = { root: "dist", port: 4321 };
    for (let i = 0; i < argv.length; i += 2) {
        if (argv[i] === "--root") args.root = argv[i + 1];
        if (argv[i] === "--port") args.port = Number(argv[i + 1]);
    }
    return args;
}

/// Compares real paths, since import.meta.url resolves symlinks (/tmp -> /private/tmp) but argv does not.
function isMainModule() {
    if (!process.argv[1]) {
        return false;
    }
    try {
        return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
}

if (isMainModule()) {
    const { root, port } = parseArgs(process.argv.slice(2));
    const server = createStaticServer(root);

    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.error(`Port ${port} is already in use. Set CARD_MAKER_PORT and reinstall.`);
        } else {
            console.error(err);
        }
        process.exit(1);
    });

    server.listen(port, "127.0.0.1", () => {
        console.log(`Card Maker serving ${resolve(root)} at http://localhost:${port}`);
    });

    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, () => server.close(() => process.exit(0)));
    }
}
