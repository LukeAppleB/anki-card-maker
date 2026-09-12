import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const wasmBytes = readFileSync(resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
const originalFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("sql-wasm.wasm")) {
        return new Response(wasmBytes, { status: 200 });
    }
    return originalFetch(input, init);
};
