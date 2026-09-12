import { spawn } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPTS_DIR = __dirname;

/// Builds a throwaway HOME that looks like a finished `npm run app:install`,
/// with `open` stubbed so no browser window appears during the test.
async function createFakeInstall(port: number) {
    const home = await mkdtemp(join(tmpdir(), "card-maker-home-"));
    const appDir = join(home, "Library", "Application Support", "CardMaker");
    await mkdir(join(appDir, "dist"), { recursive: true });
    await cp(resolve(SCRIPTS_DIR, "serve.mjs"), join(appDir, "serve.mjs"));
    await cp(resolve(SCRIPTS_DIR, "launch.command"), join(appDir, "launch.command"));
    await chmod(join(appDir, "launch.command"), 0o755);
    await writeFile(join(appDir, "dist", "index.html"), "<!doctype html><title>Card Maker</title>");
    await writeFile(join(appDir, "config.sh"), `NODE_BIN="${process.execPath}"\nPORT=${port}\n`);

    const stubBin = join(home, "stubbin");
    const openLog = join(home, "open-calls.log");
    await mkdir(stubBin, { recursive: true });
    await writeFile(join(stubBin, "open"), `#!/bin/bash\necho "$*" >> "${openLog}"\n`);
    await chmod(join(stubBin, "open"), 0o755);

    return { home, appDir, stubBin, openLog };
}

function runLauncher(install: Awaited<ReturnType<typeof createFakeInstall>>) {
    return spawn("bash", [join(install.appDir, "launch.command")], {
        env: {
            ...process.env,
            HOME: install.home,
            PATH: `${install.stubBin}:${process.env.PATH ?? ""}`,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function waitForOutput(child: ReturnType<typeof spawn>, needle: string, timeoutMs = 15_000) {
    return new Promise<string>((done, fail) => {
        let output = "";
        const timer = setTimeout(
            () => fail(new Error(`never saw "${needle}". Output was:\n${output}`)),
            timeoutMs,
        );
        const onChunk = (chunk: Buffer) => {
            output += chunk.toString();
            if (output.includes(needle)) {
                clearTimeout(timer);
                done(output);
            }
        };
        child.stdout?.on("data", onChunk);
        child.stderr?.on("data", onChunk);
    });
}

describe("launch.command", () => {
    it("starts the server and opens the browser", async () => {
        const port = 4600 + Math.floor(Math.random() * 90);
        const install = await createFakeInstall(port);
        const child = runLauncher(install);

        try {
            await waitForOutput(child, "Card Maker is open in your browser");

            const response = await fetch(`http://127.0.0.1:${port}/`);
            expect(response.status).toBe(200);
            expect(await response.text()).toContain("Card Maker");

            // The launcher should have pointed the browser at the local server.
            expect(await readFile(install.openLog, "utf8")).toContain(`http://localhost:${port}`);
        } finally {
            child.kill("SIGTERM");
        }
    }, 30_000);

    it("reuses an already running instance instead of starting a second one", async () => {
        const port = 4700 + Math.floor(Math.random() * 90);
        const install = await createFakeInstall(port);
        const first = runLauncher(install);

        try {
            await waitForOutput(first, "Card Maker is open in your browser");

            const second = runLauncher(install);
            const output = await new Promise<string>((done, fail) => {
                let text = "";
                second.stdout?.on("data", (chunk: Buffer) => (text += chunk.toString()));
                second.on("exit", () => done(text));
                second.on("error", fail);
            });

            expect(output).toContain("already running");
        } finally {
            first.kill("SIGTERM");
        }
    }, 30_000);

    it("explains itself and exits when the install is incomplete", async () => {
        const port = 4800 + Math.floor(Math.random() * 90);
        const install = await createFakeInstall(port);
        // Simulate a half-installed copy: config present, app files gone.
        await writeFile(join(install.appDir, "serve.mjs"), "");
        const child = spawn("bash", [join(install.appDir, "launch.command")], {
            env: {
                ...process.env,
                HOME: install.home,
                PATH: `${install.stubBin}:${process.env.PATH ?? ""}`,
                CARD_MAKER_PORT: String(port),
            },
            stdio: ["ignore", "pipe", "pipe"],
        });

        try {
            const output = await waitForOutput(child, "failed to start");
            expect(output).toContain("failed to start");
        } finally {
            child.kill("SIGTERM");
        }
    }, 30_000);
});
