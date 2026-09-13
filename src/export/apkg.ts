import type { Database } from "sql.js/dist/sql-wasm.js";
import JSZip from "jszip";
import { getSql } from "../sqlite";
import type { Card, ClozeFields, QAFields } from "../store";
import {
    extractClozeNumbers,
    htmlToAnki,
    makeMediaFilename,
    stripHtml,
    type MediaRef,
} from "./html-to-anki";

export const QA_MODEL_ID = 1_600_000_001;
export const CLOZE_MODEL_ID = 1_600_000_002;

export const FIELD_SEP = "\x1f";

async function sha1HexAsync(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest("SHA-1", data);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function nowSecs(): number {
    return Math.floor(Date.now() / 1000);
}

function createSchema(db: Database): void {
    db.run(`
        CREATE TABLE col (
            id integer PRIMARY KEY,
            crt integer NOT NULL,
            mod integer NOT NULL,
            scm integer NOT NULL,
            ver integer NOT NULL,
            dty integer NOT NULL,
            usn integer NOT NULL,
            ls integer NOT NULL,
            conf text NOT NULL,
            models text NOT NULL,
            decks text NOT NULL,
            dconf text NOT NULL,
            tags text NOT NULL
        );
        CREATE TABLE notes (
            id integer PRIMARY KEY,
            guid text NOT NULL,
            mid integer NOT NULL,
            mod integer NOT NULL,
            usn integer NOT NULL,
            tags text NOT NULL,
            flds text NOT NULL,
            sfld text NOT NULL,
            csum integer NOT NULL,
            flags integer NOT NULL,
            data text NOT NULL
        );
        CREATE TABLE cards (
            id integer PRIMARY KEY,
            nid integer NOT NULL,
            did integer NOT NULL,
            ord integer NOT NULL,
            mod integer NOT NULL,
            usn integer NOT NULL,
            type integer NOT NULL,
            queue integer NOT NULL,
            due integer NOT NULL,
            ivl integer NOT NULL,
            factor integer NOT NULL,
            reps integer NOT NULL,
            lapses integer NOT NULL,
            left integer NOT NULL,
            odue integer NOT NULL,
            odid integer NOT NULL,
            flags integer NOT NULL,
            data text NOT NULL
        );
        CREATE TABLE revlog (
            id integer PRIMARY KEY,
            cid integer NOT NULL,
            usn integer NOT NULL,
            ease integer NOT NULL,
            ivl integer NOT NULL,
            lastIvl integer NOT NULL,
            factor integer NOT NULL,
            time integer NOT NULL,
            type integer NOT NULL
        );
        CREATE TABLE graves (
            usn integer NOT NULL,
            oid integer NOT NULL,
            type integer NOT NULL
        );
    `);
}

function buildModelsJson(ts: number): string {
    const css = `
.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}
.card p {
  margin: 0.35em 0;
}
.card ul,
.card ol {
  display: inline-block;
  text-align: left;
  margin: 0.4em auto;
  padding-left: 1.4em;
}
.card li {
  margin: 0.15em 0;
}
.cloze {
  font-weight: bold;
  color: blue;
}
`;

    const fieldMeta = {
        font: "Arial",
        media: [],
        rtl: false,
        size: 20,
        sticky: false,
    };

    const models = {
        [String(QA_MODEL_ID)]: {
            id: QA_MODEL_ID,
            name: "Card Maker – Q&A",
            type: 0,
            mod: ts,
            usn: 0,
            sortf: 0,
            did: 1,
            req: [[0, "any", [0]]],
            tags: [],
            vers: [],
            tmpls: [
                {
                    name: "Card 1",
                    ord: 0,
                    qfmt: "{{Front}}",
                    afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
                    bqfmt: "",
                    bafmt: "",
                    did: null,
                    bfont: "",
                    bsize: 0,
                },
            ],
            flds: [
                { name: "Front", ord: 0, ...fieldMeta },
                { name: "Back", ord: 1, ...fieldMeta },
            ],
            css,
            latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
            latexPost: "\\end{document}",
            latexsvg: false,
        },
        [String(CLOZE_MODEL_ID)]: {
            id: CLOZE_MODEL_ID,
            name: "Card Maker – Blanks",
            type: 1,
            mod: ts,
            usn: 0,
            sortf: 0,
            did: 1,
            req: [[0, "all", [0]]],
            tags: [],
            vers: [],
            tmpls: [
                {
                    name: "Cloze",
                    ord: 0,
                    qfmt: "{{cloze:Text}}",
                    afmt: "{{cloze:Text}}<br>{{Extra}}",
                    bqfmt: "",
                    bafmt: "",
                    did: null,
                    bfont: "",
                    bsize: 0,
                },
            ],
            flds: [
                { name: "Text", ord: 0, ...fieldMeta, sticky: true },
                { name: "Extra", ord: 1, ...fieldMeta },
            ],
            css,
            latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
            latexPost: "\\end{document}",
            latexsvg: false,
        },
    };

    return JSON.stringify(models);
}

function buildDecksJson(deckName: string, deckId: number, ts: number): string {
    const deck = {
        id: deckId,
        name: deckName,
        mod: ts,
        usn: 0,
        desc: "Created with Card Maker",
        dyn: 0,
        conf: 1,
        collapsed: false,
        extendNew: 0,
        extendRev: 0,
        newToday: [0, 0],
        revToday: [0, 0],
        lrnToday: [0, 0],
        timeToday: [0, 0],
    };

    const defaultDeck = {
        id: 1,
        name: "Default",
        mod: ts,
        usn: 0,
        desc: "",
        dyn: 0,
        conf: 1,
        collapsed: true,
        extendNew: 0,
        extendRev: 0,
        newToday: [0, 0],
        revToday: [0, 0],
        lrnToday: [0, 0],
        timeToday: [0, 0],
    };

    return JSON.stringify({
        "1": defaultDeck,
        [String(deckId)]: deck,
    });
}

function buildDconfJson(ts: number): string {
    const conf = {
        id: 1,
        name: "Default",
        mod: ts,
        usn: 0,
        maxTaken: 60,
        autoplay: true,
        timer: 0,
        replayq: true,
        new: {
            perDay: 20,
            delays: [1, 10],
            separate: true,
            ints: [1, 4, 0],
            initialFactor: 2500,
            order: 1,
            bury: false,
        },
        rev: {
            perDay: 200,
            ease4: 1.3,
            ivlFct: 1,
            maxIvl: 36500,
            bury: false,
        },
        lapse: {
            leechFails: 8,
            minInt: 1,
            leechAction: 0,
            mult: 0,
            delays: [10],
        },
    };
    return JSON.stringify({ "1": conf });
}

function buildConfJson(): string {
    return JSON.stringify({
        activeDecks: [1],
        addToCur: true,
        collapseTime: 1200,
        curDeck: 1,
        curModel: String(QA_MODEL_ID),
        dueCounts: true,
        estTimes: true,
        newBury: true,
        newSpread: 0,
        nextPos: 1,
        sortBackwards: false,
        sortType: "noteFld",
        timeLim: 0,
    });
}

export interface ExportOptions {
    deckName: string;
    cards: Card[];
    mediaResolver: (id: string) => MediaRef | undefined;
}

export interface ExportResult {
    blob: Blob;
    filename: string;
    noteCount: number;
    cardCount: number;
}

export async function buildApkg(options: ExportOptions): Promise<ExportResult> {
    const SQL = await getSql();
    const db = new SQL.Database();
    createSchema(db);

    const ts = nowSecs();
    const deckId = ts;
    const allMedia = new Map<string, MediaRef>();

    db.run(
        `INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '{}')`,
        [
            ts,
            ts,
            ts,
            buildConfJson(),
            buildModelsJson(ts),
            buildDecksJson(options.deckName, deckId, ts),
            buildDconfJson(ts),
        ],
    );

    let noteId = 1;
    let cardId = 1;
    let cardCount = 0;

    for (const card of options.cards) {
        const mod = ts;
        if (card.kind === "qa") {
            const fields = card.fields as QAFields;
            const front = htmlToAnki(fields.front, options.mediaResolver);
            const back = htmlToAnki(fields.back, options.mediaResolver);
            for (const ref of [...front.mediaRefs, ...back.mediaRefs]) {
                allMedia.set(ref.filename, ref);
            }
            const flds = [front.html, back.html].join(FIELD_SEP);
            const sfld = stripHtml(front.html);
            const csumHex = (await sha1HexAsync(sfld)).slice(0, 8);
            const csum = parseInt(csumHex, 16);

            db.run(
                `INSERT INTO notes VALUES (?, ?, ?, ?, -1, '  ', ?, ?, ?, 0, '')`,
                [noteId, card.id, QA_MODEL_ID, mod, flds, sfld, csum],
            );
            db.run(
                `INSERT INTO cards VALUES (?, ?, ?, 0, ?, -1, 0, 0, 0, 0, 2500, 0, 0, 0, 0, 0, 0, '')`,
                [cardId, noteId, deckId, mod],
            );
            noteId++;
            cardId++;
            cardCount++;
        } else {
            const fields = card.fields as ClozeFields;
            const text = htmlToAnki(fields.text, options.mediaResolver);
            const extra = htmlToAnki(fields.extra, options.mediaResolver);
            for (const ref of [...text.mediaRefs, ...extra.mediaRefs]) {
                allMedia.set(ref.filename, ref);
            }
            const flds = [text.html, extra.html].join(FIELD_SEP);
            const sfld = stripHtml(text.html);
            const csumHex = (await sha1HexAsync(sfld)).slice(0, 8);
            const csum = parseInt(csumHex, 16);

            db.run(
                `INSERT INTO notes VALUES (?, ?, ?, ?, -1, '  ', ?, ?, ?, 0, '')`,
                [noteId, card.id, CLOZE_MODEL_ID, mod, flds, sfld, csum],
            );

            const clozeNumbers = extractClozeNumbers(text.html);
            const ords = clozeNumbers.length ? clozeNumbers.map((n) => n - 1) : [0];

            for (const ord of ords) {
                db.run(
                    `INSERT INTO cards VALUES (?, ?, ?, ?, ?, -1, 0, 0, 0, 0, 2500, 0, 0, 0, 0, 0, 0, '')`,
                    [cardId, noteId, deckId, ord, mod],
                );
                cardId++;
                cardCount++;
            }
            noteId++;
        }
    }

    const zip = new JSZip();
    const dbBytes = db.export();
    zip.file("collection.anki2", dbBytes);

    const mediaMap: Record<string, string> = {};
    let mediaIndex = 0;
    for (const [filename, ref] of allMedia) {
        mediaMap[String(mediaIndex)] = filename;
        const buffer = await ref.blob.arrayBuffer();
        zip.file(String(mediaIndex), buffer);
        mediaIndex++;
    }
    zip.file("media", JSON.stringify(mediaMap));

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const safeName = options.deckName.replace(/[^\w\s-]/g, "").trim() || "My Deck";

    db.close();

    return {
        blob,
        filename: `${safeName}.apkg`,
        noteCount: options.cards.length,
        cardCount,
    };
}

export { sha1HexAsync };
