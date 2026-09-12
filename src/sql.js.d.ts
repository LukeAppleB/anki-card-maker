declare module "sql.js/dist/sql-wasm.js" {
    export interface Database {
        run(sql: string, params?: unknown[]): void;
        export(): Uint8Array;
        exec(sql: string): { columns: string[]; values: unknown[][] }[];
        close(): void;
    }

    export interface SqlJsStatic {
        Database: new (data?: Uint8Array | ArrayLike<number> | null) => Database;
    }

    export interface SqlJsConfig {
        locateFile?: (file: string) => string;
        wasmBinary?: ArrayBuffer | Uint8Array;
    }

    export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
