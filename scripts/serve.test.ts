import { spawn } from "node:child_process";
import { request } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error - plain JS module shared with the LaunchAgent, no types needed
import { contentTypeFor, createStaticServer, resolveRequestPath } from "./serve.mjs";

describe("resolveRequestPath", () => {
    const root = "/srv/app";

    it("serves index.html for directory requests", () => {
        expect(resolveRequestPath(root, "/")).toBe("/srv/app/index.html");
    });

    it("keeps asset requests inside the root", () => {
        expect(resolveRequestPath(root, "/assets/index.js")).toBe("/srv/app/assets/index.js");
    });

    it("ignores query strings", () => {
        expect(resolveRequestPath(root, "/index.html?v=2")).toBe("/srv/app/index.html");
    });

    it("refuses to escape the root", () => {
        for (const attempt of ["/../../etc/passwd", "/..%2f..%2fetc%2fpasswd", "/assets/../../../etc/passwd"]) {
            const resolved = resolveRequestPath(root, attempt);
            expect(resolved === null || resolved.startsWith("/srv/app/")).toBe(true);
            expect(resolved).not.toBe("/etc/passwd");
        }
    });
});

describe("contentTypeFor", () => {
    it("serves wasm with the correct type", () => {
        expect(contentTypeFor("/app/sql.wasm")).toBe("application/wasm");
    });

    it("falls back for unknown extensions", () => {
        expect(contentTypeFor("/app/data.bin")).toBe("application/octet-stream");
    });
});

/// Sends a path verbatim, unlike fetch() which normalises ".." away client-side.
function rawGet(port: number, path: string): Promise<{ status: number; body: string }> {
    return new Promise((done, fail) => {
        const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => done({ status: res.statusCode ?? 0, body }));
        });
        req.on("error", fail);
        req.end();
    });
}

describe("static server", () => {
    let server: ReturnType<typeof createStaticServer>;
    let origin: string;
    let port: number;

    beforeAll(async () => {
        const parent = await mkdtemp(join(tmpdir(), "card-maker-serve-"));
        const root = join(parent, "dist");
        await mkdir(root);
        await writeFile(join(root, "index.html"), "<!doctype html><title>Card Maker</title>");
        await writeFile(join(root, "demo.wasm"), Buffer.from([0, 97, 115, 109]));
        await writeFile(join(parent, "secret.txt"), "TOP_SECRET_TOKEN");

        server = createStaticServer(root);
        await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
        port = (server.address() as AddressInfo).port;
        origin = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
        await new Promise<void>((done) => server.close(() => done()));
    });

    it("serves the app shell", async () => {
        const response = await fetch(`${origin}/`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/html");
        expect(await response.text()).toContain("Card Maker");
    });

    it("serves wasm with the right content type", async () => {
        const response = await fetch(`${origin}/demo.wasm`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/wasm");
    });

    it("404s a missing asset", async () => {
        expect((await fetch(`${origin}/assets/nope.js`)).status).toBe(404);
    });

    it("does not serve files outside the root", async () => {
        for (const attempt of ["/../secret.txt", "/..%2fsecret.txt", "/assets/../../secret.txt"]) {
            const response = await rawGet(port, attempt);
            expect(response.body).not.toContain("TOP_SECRET_TOKEN");
        }
    });

    it("rejects non-GET methods", async () => {
        const response = await fetch(`${origin}/`, { method: "POST" });
        expect(response.status).toBe(405);
    });
});

describe("serve.mjs as a launchd entry point", () => {
    // The LaunchAgent runs this file by absolute path from a copied install directory,
    // so it has to actually start listening when spawned that way.
    it("starts listening when spawned as a script", async () => {
        const root = await mkdtemp(join(tmpdir(), "card-maker-spawn-"));
        await writeFile(join(root, "index.html"), "<!doctype html><title>Spawned</title>");
        const port = 4000 + Math.floor(Math.random() * 900);

        const child = spawn(
            process.execPath,
            [resolve(__dirname, "serve.mjs"), "--root", root, "--port", String(port)],
            { stdio: ["ignore", "pipe", "pipe"] },
        );

        try {
            await new Promise<void>((done, fail) => {
                const timer = setTimeout(() => fail(new Error("server never reported readiness")), 10_000);
                child.stdout.on("data", (chunk: Buffer) => {
                    if (chunk.toString().includes(`http://localhost:${port}`)) {
                        clearTimeout(timer);
                        done();
                    }
                });
                child.on("exit", (code) => {
                    clearTimeout(timer);
                    fail(new Error(`server exited early with code ${code}`));
                });
            });

            const response = await fetch(`http://127.0.0.1:${port}/`);
            expect(response.status).toBe(200);
            expect(await response.text()).toContain("Spawned");
        } finally {
            child.kill();
        }
    }, 20_000);
});
