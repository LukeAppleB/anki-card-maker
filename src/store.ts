import { get, keys, set } from "idb-keyval";

export type CardKind = "cloze" | "qa";

export interface ClozeFields {
    text: string;
    extra: string;
}

export interface QAFields {
    front: string;
    back: string;
}

export interface Card {
    id: string;
    kind: CardKind;
    fields: ClozeFields | QAFields;
    createdAt: number;
}

export interface AppState {
    deckName: string;
    cards: Card[];
}

export interface MediaRecord {
    id: string;
    blob: Blob;
    filename: string;
}

const STATE_KEY = "card-maker-state";
const MEDIA_PREFIX = "card-maker-media:";

export function createCardId(): string {
    return crypto.randomUUID();
}

export async function loadState(): Promise<AppState> {
    // Storage can be unavailable (private browsing, blocked cookies); start empty rather than fail.
    const saved = await get<AppState>(STATE_KEY).catch(() => undefined);
    if (saved?.cards?.length) {
        return {
            deckName: saved.deckName || "My Deck",
            cards: saved.cards,
        };
    }
    return { deckName: "My Deck", cards: [] };
}

export async function saveState(state: AppState): Promise<void> {
    await set(STATE_KEY, state);
}

export async function saveMedia(record: MediaRecord): Promise<void> {
    await set(`${MEDIA_PREFIX}${record.id}`, record);
}

export async function loadMedia(id: string): Promise<MediaRecord | undefined> {
    return get<MediaRecord>(`${MEDIA_PREFIX}${id}`);
}

export async function loadAllMediaIds(): Promise<string[]> {
    const allKeys = await keys();
    return allKeys
        .filter((key): key is string => typeof key === "string" && key.startsWith(MEDIA_PREFIX))
        .map((key) => key.slice(MEDIA_PREFIX.length));
}

export function isClozeFields(fields: ClozeFields | QAFields): fields is ClozeFields {
    return "text" in fields;
}

export function createEmptyCard(kind: CardKind): Card {
    const id = createCardId();
    if (kind === "cloze") {
        return {
            id,
            kind,
            createdAt: Date.now(),
            fields: { text: "<p></p>", extra: "" },
        };
    }
    return {
        id,
        kind,
        createdAt: Date.now(),
        fields: { front: "<p></p>", back: "<p></p>" },
    };
}

export function cardPreview(card: Card): string {
    const strip = (html: string) =>
        html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (card.kind === "cloze") {
        const fields = card.fields as ClozeFields;
        return strip(fields.text) || "Empty fill-in-the-blank";
    }
    const fields = card.fields as QAFields;
    return strip(fields.front) || "Empty question";
}
