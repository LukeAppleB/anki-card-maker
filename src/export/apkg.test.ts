import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import initSqlJs from "sql.js/dist/sql-wasm.js";
import { buildApkg, CLOZE_MODEL_ID, QA_MODEL_ID } from "./apkg";
import type { Card } from "../store";

describe("buildApkg", () => {
    it("builds a valid apkg with qa and cloze notes", async () => {
        const cards: Card[] = [
            {
                id: "11111111-1111-4111-8111-111111111111",
                kind: "qa",
                createdAt: Date.now(),
                fields: {
                    front: "<p>What is 2+2?</p>",
                    back: "<p>4</p>",
                },
            },
            {
                id: "22222222-2222-4222-8222-222222222222",
                kind: "cloze",
                createdAt: Date.now(),
                fields: {
                    text: '<p>The <span data-cloze="1" class="cloze-blank">capital</span> is Paris.</p>',
                    extra: "<p>France</p>",
                },
            },
        ];

        const result = await buildApkg({
            deckName: "Test Deck",
            cards,
            mediaResolver: () => undefined,
        });

        expect(result.noteCount).toBe(2);
        expect(result.cardCount).toBe(2);
        expect(result.filename).toBe("Test Deck.apkg");

        const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
        expect(zip.file("collection.anki2")).toBeTruthy();
        expect(zip.file("media")).toBeTruthy();

        const wasmPath = resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm");
        const SQL = await initSqlJs({ wasmBinary: readFileSync(wasmPath) });
        const dbBytes = await zip.file("collection.anki2")!.async("uint8array");
        const db = new SQL.Database(dbBytes);

        const notes = db.exec("SELECT mid, flds, guid FROM notes");
        expect(notes[0].values).toHaveLength(2);

        const mids = notes[0].values.map((row: unknown[]) => row[0]);
        expect(mids).toContain(QA_MODEL_ID);
        expect(mids).toContain(CLOZE_MODEL_ID);

        const clozeRow = notes[0].values.find((row: unknown[]) => row[0] === CLOZE_MODEL_ID);
        expect(String(clozeRow?.[1])).toContain("{{c1::capital}}");

        const cardsResult = db.exec("SELECT COUNT(*) FROM cards");
        expect(cardsResult[0].values[0][0]).toBe(2);

        db.close();
    });
});
