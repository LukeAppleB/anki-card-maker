import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildApkg } from "../export/apkg";
import { htmlToAnki } from "../export/html-to-anki";
import { isClozeFields, type Card, type ClozeFields, type QAFields } from "../store";
import { importApkg } from "./apkg";

const CARDS: Card[] = [
    {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "qa",
        createdAt: 1,
        fields: { front: "<p>What is 2+2?</p>", back: "<p><strong>4</strong></p>" },
    },
    {
        id: "22222222-2222-4222-8222-222222222222",
        kind: "cloze",
        createdAt: 2,
        fields: {
            text: '<p>The <span data-cloze="1" class="cloze-blank">capital</span> of France is <span data-cloze="2" class="cloze-blank">Paris</span>.</p>',
            extra: "<p>Geography</p>",
        },
    },
];

async function exportThenImport(cards: Card[]) {
    const built = await buildApkg({ deckName: "Round Trip", cards, mediaResolver: () => undefined });
    return importApkg(built.blob);
}

describe("importApkg", () => {
    it("restores cards exported by Card Maker", async () => {
        const result = await exportThenImport(CARDS);

        expect(result.warnings).toEqual([]);
        expect(result.skipped).toBe(0);
        expect(result.deckName).toBe("Round Trip");
        expect(result.cards).toHaveLength(2);

        const qa = result.cards.find((card) => card.kind === "qa");
        expect(qa?.id).toBe(CARDS[0].id);
        expect((qa?.fields as QAFields).front).toBe("<p>What is 2+2?</p>");
        expect((qa?.fields as QAFields).back).toBe("<p><strong>4</strong></p>");

        const cloze = result.cards.find((card) => card.kind === "cloze");
        expect(cloze?.id).toBe(CARDS[1].id);
        expect((cloze?.fields as ClozeFields).text).toBe((CARDS[1].fields as ClozeFields).text);
        expect((cloze?.fields as ClozeFields).extra).toBe("<p>Geography</p>");
    });

    it("survives a second round trip unchanged", async () => {
        const once = await exportThenImport(CARDS);
        const twice = await exportThenImport(once.cards);

        const sortById = (cards: Card[]) => [...cards].sort((a, b) => a.id.localeCompare(b.id));
        expect(sortById(twice.cards).map((c) => ({ id: c.id, kind: c.kind, fields: c.fields }))).toEqual(
            sortById(once.cards).map((c) => ({ id: c.id, kind: c.kind, fields: c.fields })),
        );
    });

    it("keeps ids stable so re-exporting updates the same Anki notes", async () => {
        const result = await exportThenImport(CARDS);
        const rebuilt = await buildApkg({
            deckName: "Round Trip",
            cards: result.cards,
            mediaResolver: () => undefined,
        });
        const zip = await JSZip.loadAsync(await rebuilt.blob.arrayBuffer());
        expect(zip.file("collection.anki2")).toBeTruthy();
        expect(result.cards.map((card) => card.id).sort()).toEqual(
            CARDS.map((card) => card.id).sort(),
        );
    });

    it("carries a cloze hint through export and back", async () => {
        const withHint: Card[] = [
            {
                id: "33333333-3333-4333-8333-333333333333",
                kind: "cloze",
                createdAt: 3,
                fields: {
                    text: '<p><span data-cloze="1" data-hint="a city" class="cloze-blank">Paris</span></p>',
                    extra: "",
                },
            },
        ];

        const exported = htmlToAnki((withHint[0].fields as ClozeFields).text, () => undefined);
        expect(exported.html).toContain("{{c1::Paris::a city}}");

        const result = await exportThenImport(withHint);
        const fields = result.cards[0].fields;
        expect(isClozeFields(fields) && fields.text).toContain('data-hint="a city"');
    });

    it("restores images and links them to stored media", async () => {
        const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
        const cards: Card[] = [
            {
                id: "44444444-4444-4444-8444-444444444444",
                kind: "qa",
                createdAt: 4,
                fields: {
                    front: '<p><img src="blob:stale" data-media-id="media-1"></p>',
                    back: "<p>answer</p>",
                },
            },
        ];

        const built = await buildApkg({
            deckName: "With Image",
            cards,
            mediaResolver: (id) =>
                id === "media-1" ? { id, filename: "cm-media-1.png", blob } : undefined,
        });

        const result = await importApkg(built.blob);
        expect(result.media).toHaveLength(1);
        expect(result.media[0].filename).toBe("cm-media-1.png");

        const front = (result.cards[0].fields as QAFields).front;
        expect(front).toContain(`data-media-id="${result.media[0].id}"`);
        // The old, dead object URL must not survive the round trip.
        expect(front).not.toContain("blob:stale");
    });

    it("rejects Anki's newer package format with an actionable message", async () => {
        const zip = new JSZip();
        zip.file("meta", new Uint8Array([1]));
        zip.file("collection.anki21b", new Uint8Array([1]));
        const blob = await zip.generateAsync({ type: "blob" });

        await expect(importApkg(blob)).rejects.toThrow(/older Anki versions/);
    });

    it("rejects files that are not decks", async () => {
        const zip = new JSZip();
        zip.file("notes.txt", "hello");
        const blob = await zip.generateAsync({ type: "blob" });

        await expect(importApkg(blob)).rejects.toThrow(/does not look like an Anki deck/);
    });
});
