import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        cloze: {
            setCloze: (n: number) => ReturnType;
            unsetCloze: () => ReturnType;
        };
    }
}

export function getMaxClozeNumber(doc: { descendants: (fn: (node: unknown) => boolean | void) => void }): number {
    let max = 0;
    doc.descendants((node) => {
        const marks = (node as { marks?: { type: { name: string }; attrs: { n?: number } }[] }).marks ?? [];
        for (const mark of marks) {
            if (mark.type.name === "cloze" && mark.attrs.n) {
                max = Math.max(max, Number(mark.attrs.n));
            }
        }
    });
    return max;
}

export const ClozeMark = Mark.create({
    name: "cloze",
    inclusive: false,

    addAttributes() {
        return {
            n: {
                default: 1,
                parseHTML: (element) => Number(element.getAttribute("data-cloze") ?? 1),
                renderHTML: (attributes) => ({
                    "data-cloze": String(attributes.n),
                    class: "cloze-blank",
                }),
            },
        };
    },

    parseHTML() {
        return [{ tag: "span[data-cloze]" }];
    },

    renderHTML({ HTMLAttributes }) {
        return ["span", mergeAttributes(HTMLAttributes), 0];
    },

    addCommands() {
        return {
            setCloze:
                (n: number) =>
                ({ commands }) =>
                    commands.setMark(this.name, { n }),
            unsetCloze:
                () =>
                ({ commands }) =>
                    commands.unsetMark(this.name),
        };
    },
});
