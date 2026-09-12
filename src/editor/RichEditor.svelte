<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { Editor } from "@tiptap/core";
    import StarterKit from "@tiptap/starter-kit";
    import Underline from "@tiptap/extension-underline";
    import { TextStyle } from "@tiptap/extension-text-style";
    import { Color } from "@tiptap/extension-color";
    import Highlight from "@tiptap/extension-highlight";
    import Image from "@tiptap/extension-image";
    import { ClozeMark, getMaxClozeNumber } from "./cloze-mark";
    import { saveMedia } from "../store";
    import { makeMediaFilename } from "../export/html-to-anki";

    interface Props {
        content?: string;
        showCloze?: boolean;
        placeholder?: string;
        onchange?: (html: string) => void;
    }

    let {
        content = $bindable("<p></p>"),
        showCloze = false,
        placeholder = "",
        onchange,
    }: Props = $props();

    let element: HTMLDivElement;
    let editor: Editor | undefined;

    export function getEditor(): Editor | undefined {
        return editor;
    }

    async function insertImage(file: File): Promise<void> {
        if (!editor) return;
        const id = crypto.randomUUID();
        const blob = file.type ? file : new Blob([await file.arrayBuffer()], { type: "image/png" });
        const filename = makeMediaFilename(id, blob);
        await saveMedia({ id, blob, filename });
        const url = URL.createObjectURL(blob);
        editor
            .chain()
            .focus()
            .setImage({ src: url, alt: id, title: id })
            .run();
        const img = editor.view.dom.querySelector(`img[title="${id}"]`);
        if (img) {
            img.setAttribute("data-media-id", id);
            img.removeAttribute("title");
        }
    }

    function handleImagePaste(event: ClipboardEvent): boolean {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
            if (item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) {
                    event.preventDefault();
                    void insertImage(file);
                    return true;
                }
            }
        }
        return false;
    }

    function handleDrop(event: DragEvent): void {
        const file = event.dataTransfer?.files?.[0];
        if (file?.type.startsWith("image/")) {
            event.preventDefault();
            void insertImage(file);
        }
    }

    onMount(() => {
        editor = new Editor({
            element,
            extensions: [
                StarterKit,
                Underline,
                TextStyle,
                Color,
                Highlight.configure({ multicolor: true }),
                Image.configure({ inline: true, allowBase64: false }),
                ClozeMark,
            ],
            content,
            editorProps: {
                attributes: {
                    class: "rich-editor-content",
                    "data-placeholder": placeholder,
                },
                handlePaste: (_view, event) => handleImagePaste(event),
                handleDrop: (_view, event) => {
                    handleDrop(event);
                    return event.defaultPrevented;
                },
            },
            onUpdate: ({ editor: ed }) => {
                onchange?.(ed.getHTML());
            },
        });
    });

    onDestroy(() => {
        editor?.destroy();
    });

    $effect(() => {
        if (!editor) return;
        const current = editor.getHTML();
        if (content !== current) {
            editor.commands.setContent(content, { emitUpdate: false });
        }
    });

    export function makeBlank(increment = true): void {
        if (!editor || !showCloze) return;
        const max = getMaxClozeNumber(editor.state.doc);
        const n = increment ? max + 1 : Math.max(1, max);
        editor.chain().focus().setCloze(n).run();
    }

    export function removeBlank(): void {
        editor?.chain().focus().unsetCloze().run();
    }

    export function toggleBold(): void {
        editor?.chain().focus().toggleBold().run();
    }

    export function toggleItalic(): void {
        editor?.chain().focus().toggleItalic().run();
    }

    export function toggleUnderline(): void {
        editor?.chain().focus().toggleUnderline().run();
    }

    export function toggleBulletList(): void {
        editor?.chain().focus().toggleBulletList().run();
    }

    export function setHighlight(color: string): void {
        editor?.chain().focus().toggleHighlight({ color }).run();
    }

    export function setTextColor(color: string): void {
        editor?.chain().focus().setColor(color).run();
    }
</script>

<div class="rich-editor" bind:this={element}></div>

<style>
    .rich-editor {
        border: 1px solid #d0d7de;
        border-radius: 8px;
        min-height: 140px;
        background: #fff;
    }

    :global(.rich-editor-content) {
        padding: 12px 14px;
        min-height: 120px;
        outline: none;
        font-size: 16px;
        line-height: 1.5;
    }

    :global(.rich-editor-content:empty::before) {
        content: attr(data-placeholder);
        color: #8b949e;
        pointer-events: none;
        float: left;
        height: 0;
    }

    :global(.rich-editor-content p) {
        margin: 0 0 0.5em;
    }

    :global(.rich-editor-content img) {
        max-width: 100%;
        height: auto;
        border-radius: 4px;
    }

    :global(.cloze-blank) {
        background: #dbeafe;
        border: 1px solid #3b82f6;
        border-radius: 4px;
        padding: 0 4px;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
        position: relative;
    }

    :global(.cloze-blank::before) {
        content: attr(data-cloze);
        font-size: 10px;
        font-weight: 700;
        color: #1d4ed8;
        background: #eff6ff;
        border-radius: 999px;
        padding: 0 4px;
        margin-right: 4px;
        vertical-align: super;
    }
</style>
