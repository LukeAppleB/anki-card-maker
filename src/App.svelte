<script lang="ts">
    import { onMount } from "svelte";
    import RichEditor from "./editor/RichEditor.svelte";
    import {
        type Card,
        type ClozeFields,
        type QAFields,
        cardPreview,
        createEmptyCard,
        loadMedia,
        loadState,
        saveState,
        type MediaRecord,
    } from "./store";
    import { buildApkg } from "./export/apkg";

    let deckName = $state("My Deck");
    let cards = $state<Card[]>([]);
    let selectedId = $state<string | null>(null);
    let exportMessage = $state("");
    let exporting = $state(false);

    let mainEditor = $state<RichEditor | undefined>(undefined);
    let secondaryEditor = $state<RichEditor | undefined>(undefined);

    const selectedCard = $derived(cards.find((c) => c.id === selectedId) ?? null);

    onMount(async () => {
        const state = await loadState();
        deckName = state.deckName;
        cards = state.cards;
        selectedId = cards[0]?.id ?? null;
    });

    async function persist(): Promise<void> {
        await saveState({ deckName, cards });
    }

    function selectCard(id: string): void {
        selectedId = id;
    }

    function addCard(kind: "cloze" | "qa"): void {
        const card = createEmptyCard(kind);
        cards = [...cards, card];
        selectedId = card.id;
        void persist();
    }

    function deleteSelected(): void {
        if (!selectedId) return;
        const idx = cards.findIndex((c) => c.id === selectedId);
        cards = cards.filter((c) => c.id !== selectedId);
        selectedId = cards[Math.min(idx, cards.length - 1)]?.id ?? null;
        void persist();
    }

    function updateField(field: string, html: string): void {
        if (!selectedCard) return;
        cards = cards.map((c) => {
            if (c.id !== selectedCard.id) return c;
            return { ...c, fields: { ...c.fields, [field]: html } };
        });
        void persist();
    }

    function mediaResolver(id: string): MediaRecord | undefined {
        // synchronous resolver can't load async media; export uses async loader below
        return undefined;
    }

    async function exportDeck(): Promise<void> {
        if (!cards.length) {
            exportMessage = "Add at least one card before exporting.";
            return;
        }
        exporting = true;
        exportMessage = "";
        try {
            const mediaCache = new Map<string, MediaRecord>();
            const resolver = (id: string) => {
                return mediaCache.get(id);
            };

            for (const card of cards) {
                const htmlParts =
                    card.kind === "cloze"
                        ? [(card.fields as ClozeFields).text, (card.fields as ClozeFields).extra]
                        : [(card.fields as QAFields).front, (card.fields as QAFields).back];
                for (const html of htmlParts) {
                    const doc = new DOMParser().parseFromString(html, "text/html");
                    for (const img of doc.querySelectorAll("img[data-media-id]")) {
                        const id = img.getAttribute("data-media-id");
                        if (!id || mediaCache.has(id)) continue;
                        const record = await loadMedia(id);
                        if (record) {
                            mediaCache.set(id, record);
                        }
                    }
                }
            }

            const result = await buildApkg({
                deckName,
                cards,
                mediaResolver: (id) => {
                    const cached = mediaCache.get(id);
                    if (cached) return cached;
                    return undefined;
                },
            });

            const url = URL.createObjectURL(result.blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = result.filename;
            a.click();
            URL.revokeObjectURL(url);

            exportMessage = `Exported ${result.noteCount} notes (${result.cardCount} cards). Double-click the file to import into Anki.`;
        } catch (err) {
            exportMessage = `Export failed: ${err instanceof Error ? err.message : String(err)}`;
        } finally {
            exporting = false;
        }
    }

    function handleKeydown(event: KeyboardEvent): void {
        if (!selectedCard || selectedCard.kind !== "cloze") return;
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "b") {
            event.preventDefault();
            mainEditor?.makeBlank(true);
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<main class="app">
    <header class="header">
        <div class="brand">
            <h1>Card Maker</h1>
            <p class="subtitle">Make flashcards without Anki syntax — export when ready.</p>
        </div>
        <div class="header-actions">
            <label class="deck-label">
                Deck name
                <input
                    type="text"
                    bind:value={deckName}
                    onchange={() => void persist()}
                    placeholder="My Deck"
                />
            </label>
            <button class="primary" onclick={() => void exportDeck()} disabled={exporting}>
                {exporting ? "Exporting…" : "Export to Anki"}
            </button>
        </div>
    </header>

    {#if exportMessage}
        <div class="export-banner" class:error={exportMessage.startsWith("Export failed")}>
            {exportMessage}
        </div>
    {/if}

    <div class="layout">
        <aside class="sidebar">
            <div class="sidebar-actions">
                <button onclick={() => addCard("cloze")}>+ Fill-in-the-blank</button>
                <button onclick={() => addCard("qa")}>+ Question &amp; Answer</button>
            </div>

            {#if cards.length === 0}
                <p class="empty">No cards yet. Create one above.</p>
            {:else}
                <ul class="card-list">
                    {#each cards as card (card.id)}
                        <li>
                            <button
                                class="card-item"
                                class:selected={card.id === selectedId}
                                onclick={() => selectCard(card.id)}
                            >
                                <span class="badge">{card.kind === "cloze" ? "Blank" : "Q&A"}</span>
                                <span class="preview">{cardPreview(card)}</span>
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}
        </aside>

        <section class="editor-panel">
            {#if selectedCard}
                <div class="panel-header">
                    <h2>{selectedCard.kind === "cloze" ? "Fill-in-the-blank" : "Question & Answer"}</h2>
                    <button class="danger" onclick={deleteSelected}>Delete card</button>
                </div>

                <div class="toolbar">
                    {#if selectedCard.kind === "cloze"}
                        <button onclick={() => mainEditor?.makeBlank(true)} title="Make blank (Ctrl+Shift+B)">
                            Make blank
                        </button>
                        <button onclick={() => mainEditor?.makeBlank(false)} title="Same blank number as last">
                            Same blank
                        </button>
                        <button onclick={() => mainEditor?.removeBlank()}>Remove blank</button>
                        <span class="sep"></span>
                    {/if}
                    <button onclick={() => mainEditor?.toggleBold()}><strong>B</strong></button>
                    <button onclick={() => mainEditor?.toggleItalic()}><em>I</em></button>
                    <button onclick={() => mainEditor?.toggleUnderline()}><u>U</u></button>
                    <button onclick={() => mainEditor?.toggleBulletList()}>• List</button>
                    <button onclick={() => mainEditor?.setHighlight("#fef08a")}>Highlight</button>
                    <button onclick={() => mainEditor?.setTextColor("#dc2626")}>Red</button>
                </div>

                {#key selectedCard.id}
                    {#if selectedCard.kind === "cloze"}
                        {@const fields = selectedCard.fields as ClozeFields}
                        <p class="field-label">Sentence (select words, then click Make blank)</p>
                        <RichEditor
                            bind:this={mainEditor}
                            content={fields.text}
                            showCloze={true}
                            placeholder="Type a sentence, highlight a word, and click Make blank…"
                            onchange={(html) => updateField("text", html)}
                        />

                        <p class="field-label">Extra info (shown with the answer)</p>
                        <RichEditor
                            bind:this={secondaryEditor}
                            content={fields.extra}
                            placeholder="Optional hint or explanation…"
                            onchange={(html) => updateField("extra", html)}
                        />
                    {:else}
                        {@const fields = selectedCard.fields as QAFields}
                        <p class="field-label">Question</p>
                        <RichEditor
                            bind:this={mainEditor}
                            content={fields.front}
                            placeholder="What is…?"
                            onchange={(html) => updateField("front", html)}
                        />

                        <p class="field-label">Answer</p>
                        <RichEditor
                            bind:this={secondaryEditor}
                            content={fields.back}
                            placeholder="The answer…"
                            onchange={(html) => updateField("back", html)}
                        />
                    {/if}
                {/key}

                <p class="hint">
                    Paste or drop images into any field. When you're done, click <strong>Export to Anki</strong>,
                    then double-click the downloaded file to import it.
                </p>
            {:else}
                <div class="empty-editor">
                    <h2>Welcome</h2>
                    <p>Create a fill-in-the-blank or question &amp; answer card to get started.</p>
                </div>
            {/if}
        </section>
    </div>
</main>

<style>
    :global(body) {
        margin: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f8fa;
        color: #1f2328;
    }

    .app {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        padding: 20px 24px;
        background: #fff;
        border-bottom: 1px solid #d0d7de;
    }

    .brand h1 {
        margin: 0;
        font-size: 1.5rem;
    }

    .subtitle {
        margin: 4px 0 0;
        color: #656d76;
        font-size: 0.95rem;
    }

    .header-actions {
        display: flex;
        align-items: flex-end;
        gap: 12px;
        flex-wrap: wrap;
    }

    .deck-label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.85rem;
        color: #656d76;
    }

    .deck-label input {
        padding: 8px 10px;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        min-width: 200px;
        font-size: 1rem;
    }

    .primary {
        background: #0969da;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 10px 16px;
        font-size: 1rem;
        cursor: pointer;
    }

    .primary:disabled {
        opacity: 0.6;
        cursor: wait;
    }

    .export-banner {
        margin: 0 24px;
        padding: 10px 14px;
        background: #ddf4ff;
        border: 1px solid #54aeff;
        border-radius: 6px;
        font-size: 0.95rem;
    }

    .export-banner.error {
        background: #ffebe9;
        border-color: #ff8182;
    }

    .layout {
        display: grid;
        grid-template-columns: 280px 1fr;
        gap: 0;
        flex: 1;
        min-height: 0;
    }

    .sidebar {
        background: #fff;
        border-right: 1px solid #d0d7de;
        padding: 16px;
        overflow-y: auto;
    }

    .sidebar-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
    }

    .sidebar-actions button,
    .toolbar button,
    .danger {
        border: 1px solid #d0d7de;
        background: #f6f8fa;
        border-radius: 6px;
        padding: 8px 10px;
        cursor: pointer;
        font-size: 0.9rem;
    }

    .sidebar-actions button:hover,
    .toolbar button:hover {
        background: #eef1f4;
    }

    .card-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .card-item {
        width: 100%;
        text-align: left;
        border: 1px solid #d0d7de;
        border-radius: 8px;
        padding: 10px;
        background: #fff;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .card-item.selected {
        border-color: #0969da;
        background: #f0f6ff;
    }

    .badge {
        font-size: 0.75rem;
        font-weight: 600;
        color: #0969da;
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }

    .preview {
        font-size: 0.9rem;
        color: #424a53;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .editor-panel {
        padding: 20px 24px;
        overflow-y: auto;
    }

    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }

    .panel-header h2 {
        margin: 0;
        font-size: 1.2rem;
    }

    .danger {
        color: #cf222e;
        border-color: #ff8182;
        background: #fff;
    }

    .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 12px;
        align-items: center;
    }

    .sep {
        width: 1px;
        height: 24px;
        background: #d0d7de;
        margin: 0 4px;
    }

    .field-label {
        display: block;
        font-size: 0.9rem;
        font-weight: 600;
        margin: 12px 0 6px;
        color: #424a53;
    }

    .hint {
        margin-top: 16px;
        color: #656d76;
        font-size: 0.9rem;
    }

    .empty,
    .empty-editor {
        color: #656d76;
        padding: 24px 0;
    }

    .empty-editor h2 {
        margin-top: 0;
    }

    @media (max-width: 800px) {
        .layout {
            grid-template-columns: 1fr;
        }

        .header {
            flex-direction: column;
        }
    }
</style>
