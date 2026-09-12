/// <reference types="vitest/config" />
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [svelte()],
    optimizeDeps: {
        // sql.js ships UMD/CommonJS, so it must be pre-bundled to get a default export.
        include: ["sql.js/dist/sql-wasm.js"],
    },
    // Component tests need Svelte's client build rather than its SSR build.
    resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
    test: {
        environment: "jsdom",
        include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
        setupFiles: ["./vitest.setup.ts"],
    },
});
