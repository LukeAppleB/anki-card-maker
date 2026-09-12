import JSZip from "jszip";
import { CLOZE_MODEL_ID, FIELD_SEP, QA_MODEL_ID } from "../export/apkg";
import { getSql } from "../sqlite";
import type { Card, MediaRecord } from "../store";
import { createCardId } from "../store";
import { ankiToEditorHtml } from "./cloze-parser";

export interface ImportResult {
    deckName: string | null;
    cards: Card[];
    media: MediaRecord[];
    warnings: string[];
    skipped: number;
}

interface Notetype {
    isCloze: boolean;
    fieldCount: number;
    name: string;
}

/// Anki 2.1.50+ writes a compressed, newer-schema collection unless the user
/// asks for backwards compatibility, and we deliberately do not bundle a zstd
/// decoder just for that.
const NEWER_FORMAT_MESSAGE =
    "This deck uses Anki's newer package format, which Card Maker cannot read. " +
    "In Anki, export the deck again with the option that supports older Anki " +
    "versions enabled, then import that file.";

/// Order matters: when Anki exports with backwards compatibility it also writes a
/// stub collection.anki2 whose only note tells old clients to upgrade, so the
/// newest readable collection has to win.
function findCollectionEntry(zip: JSZip): string {
    if (zip.file("collection.anki21b")) {
        throw new Error(NEWER_FORMAT_MESSAGE);
    }
    for (const name of ["collection.anki21", "collection.anki2"]) {
        if (zip.file(name)) {
            return name;
        }
    }
    if (zip.file("meta")) {
        throw new Error(NEWER_FORMAT_MESSAGE);
    }
    throw new Error("This file does not look like an Anki deck (.apkg).");
}

function parseNotetypes(modelsJson: string): Map<string, Notetype> {
    const notetypes = new Map<string, Notetype>();
    const parsed = JSON.parse(modelsJson) as Record<
        string,
        { name?: string; type?: number; flds?: unknown[] }
    >;
    for (const [id, model] of Object.entries(parsed)) {
        notetypes.set(id, {
            isCloze: model.type === 1,
            fieldCount: Array.isArray(model.flds) ? model.flds.length : 2,
            name: model.name ?? "Unknown",
        });
    }
    return notetypes;
}

function pickDeckName(decksJson: string): string | null {
    try {
        const decks = JSON.parse(decksJson) as Record<string, { id?: number; name?: string }>;
        const named = Object.values(decks)
            .map((deck) => deck.name)
            .filter((name): name is string => typeof name === "string" && name !== "Default");
        // Nested decks use "::" (and older packages sometimes used \x1f).
        return named[0]?.split(/::|\x1f/)[0] ?? null;
    } catch {
        return null;
    }
}

async function readMedia(zip: JSZip): Promise<{ media: MediaRecord[]; warning: string | null }> {
    const manifest = zip.file("media");
    if (!manifest) {
        return { media: [], warning: null };
    }

    let mapping: Record<string, string>;
    try {
        mapping = JSON.parse(await manifest.async("string")) as Record<string, string>;
    } catch {
        // Newer packages store this as protobuf rather than JSON.
        return { media: [], warning: "Images in this deck could not be read and were left out." };
    }

    const media: MediaRecord[] = [];
    for (const [index, filename] of Object.entries(mapping)) {
        const entry = zip.file(index);
        if (!entry) continue;
        const blob = await entry.async("blob");
        media.push({ id: createCardId(), filename, blob });
    }
    return { media, warning: null };
}

/// Rewrites <img src="filename"> to the editor's form, which references media by
/// id so the blob can be looked up again later.
function attachMedia(html: string, byFilename: Map<string, MediaRecord>): string {
    if (!html.includes("<img")) {
        return html;
    }
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const img of doc.body.querySelectorAll("img")) {
        const src = img.getAttribute("src");
        if (!src) continue;
        const record = byFilename.get(decodeURIComponent(src));
        if (!record) continue;
        img.setAttribute("data-media-id", record.id);
        img.setAttribute("src", URL.createObjectURL(record.blob));
    }
    return doc.body.innerHTML;
}

function wrapPlain(html: string): string {
    const trimmed = html.trim();
    if (!trimmed) {
        return "";
    }
    // The editor expects block-level content.
    return /^<(p|div|ul|ol|h[1-6]|blockquote|pre)\b/i.test(trimmed) ? trimmed : `<p>${trimmed}</p>`;
}

export async function importApkg(file: Blob): Promise<ImportResult> {
    const zip = await JSZip.loadAsync(file);
    const entryName = findCollectionEntry(zip);
    const bytes = await zip.file(entryName)!.async("uint8array");

    const { media, warning: mediaWarning } = await readMedia(zip);
    const byFilename = new Map(media.map((record) => [record.filename, record]));

    const SQL = await getSql();
    const db = new SQL.Database(bytes);

    const warnings: string[] = [];
    if (mediaWarning) {
        warnings.push(mediaWarning);
    }
    const cards: Card[] = [];
    let skipped = 0;
    let deckName: string | null = null;

    try {
        const colResult = db.exec("SELECT models, decks FROM col");
        const colRow = colResult[0]?.values[0];
        if (!colRow) {
            throw new Error("This deck file is missing its collection data.");
        }
        const notetypes = parseNotetypes(String(colRow[0]));
        deckName = pickDeckName(String(colRow[1]));

        const noteResult = db.exec("SELECT guid, mid, flds FROM notes");
        const rows = noteResult[0]?.values ?? [];

        for (const row of rows) {
            const guid = String(row[0]);
            const notetype = notetypes.get(String(row[1]));
            const fields = String(row[2]).split(FIELD_SEP);

            if (!notetype) {
                skipped++;
                continue;
            }
            if (notetype.fieldCount > 2) {
                warnings.push(
                    `Notes of type "${notetype.name}" have extra fields that Card Maker does not show; only the first two were kept.`,
                );
            }

            // Card Maker notes keep their Anki guid so a later export updates the
            // same note. Other notetypes get a new id: Anki will not update a note
            // whose type has changed, and a reused guid would look like a conflict.
            const mid = Number(row[1]);
            const fromCardMaker = mid === QA_MODEL_ID || mid === CLOZE_MODEL_ID;
            const id = fromCardMaker && guid ? guid : createCardId();
            if (!fromCardMaker) {
                warnings.push(
                    "Cards that were not originally made here will be exported as Card Maker notes. Anki will add them as new cards rather than updating the originals.",
                );
            }

            if (notetype.isCloze) {
                const parsed = ankiToEditorHtml(fields[0] ?? "");
                if (parsed.hasImageOcclusion) {
                    skipped++;
                    warnings.push(
                        "Image occlusion notes were skipped, because editing them here would break them.",
                    );
                    continue;
                }
                warnings.push(...parsed.warnings);
                cards.push({
                    id,
                    kind: "cloze",
                    createdAt: Date.now(),
                    fields: {
                        text: wrapPlain(attachMedia(parsed.html, byFilename)) || "<p></p>",
                        extra: wrapPlain(attachMedia(fields[1] ?? "", byFilename)),
                    },
                });
            } else {
                cards.push({
                    id,
                    kind: "qa",
                    createdAt: Date.now(),
                    fields: {
                        front: wrapPlain(attachMedia(fields[0] ?? "", byFilename)) || "<p></p>",
                        back: wrapPlain(attachMedia(fields[1] ?? "", byFilename)) || "<p></p>",
                    },
                });
            }
        }
    } finally {
        db.close();
    }

    const usedFilenames = new Set<string>();
    for (const card of cards) {
        for (const value of Object.values(card.fields)) {
            for (const record of media) {
                if (value.includes(record.id)) {
                    usedFilenames.add(record.filename);
                }
            }
        }
    }

    return {
        deckName,
        cards,
        media: media.filter((record) => usedFilenames.has(record.filename)),
        warnings: [...new Set(warnings)],
        skipped,
    };
}
