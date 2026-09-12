import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Card } from "../store";
import { buildApkg } from "./apkg";

const sampleCards: Card[] = [
    {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "qa",
        createdAt: Date.now(),
        fields: { front: "<p>What is 2+2?</p>", back: "<p>4</p>" },
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

describe("write apkg for anki verification", () => {
    it("writes tmp/verify.apkg", async () => {
        const result = await buildApkg({
            deckName: "Verify Deck",
            cards: sampleCards,
            mediaResolver: () => undefined,
        });
        const outDir = resolve(process.cwd(), "tmp");
        mkdirSync(outDir, { recursive: true });
        const outPath = resolve(outDir, "verify.apkg");
        writeFileSync(outPath, Buffer.from(await result.blob.arrayBuffer()));
        expect(result.noteCount).toBe(2);
        expect(result.cardCount).toBe(2);

        // Anki only updates a matching note when the incoming modification
        // time is newer, so the edited package must not share the same second.
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 1100));

        const edited = sampleCards.map((card) =>
            card.kind === "cloze"
                ? {
                      ...card,
                      fields: {
                          text: '<p>The <span data-cloze="1" class="cloze-blank">city</span> is Paris.</p>',
                          extra: "<p>France</p>",
                      },
                  }
                : {
                      ...card,
                      fields: { front: "<p>What is 2+2?</p>", back: "<p>four</p>" },
                  },
        );
        const editedResult = await buildApkg({
            deckName: "Verify Deck",
            cards: edited,
            mediaResolver: () => undefined,
        });
        writeFileSync(
            resolve(outDir, "verify-edited.apkg"),
            Buffer.from(await editedResult.blob.arrayBuffer()),
        );
        expect(editedResult.noteCount).toBe(2);
    });
});
