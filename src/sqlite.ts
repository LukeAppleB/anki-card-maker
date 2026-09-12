import type { SqlJsStatic } from "sql.js/dist/sql-wasm.js";

let sqlInitPromise: Promise<SqlJsStatic> | null = null;

async function loadWasmBinary(): Promise<ArrayBuffer> {
    const wasmUrl = `${import.meta.env.BASE_URL}sql-wasm.wasm`;
    const response = await fetch(wasmUrl);
    if (!response.ok) {
        throw new Error(`Failed to load sql.js wasm from ${wasmUrl}`);
    }
    return response.arrayBuffer();
}

/// Loaded on demand so that the app still starts if SQLite fails to load.
export async function getSql(): Promise<SqlJsStatic> {
    if (!sqlInitPromise) {
        sqlInitPromise = (async () => {
            const [{ default: initSqlJs }, wasmBinary] = await Promise.all([
                import("sql.js/dist/sql-wasm.js"),
                loadWasmBinary(),
            ]);
            return initSqlJs({ wasmBinary });
        })();
    }
    return sqlInitPromise;
}
