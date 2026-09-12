// Parses Anki's stored cloze syntax back into the editor's span markup.
// Grammar per rslib/src/cloze.rs: {{c<ordinals>::text[::hint]}} where ordinals
// are digits separated by commas, clozes may nest, and a payload starting with
// "image-occlusion:" is a generated image-occlusion cloze.

const OPEN_CLOZE = /^\{\{c([\d,]+)::/;
const IMAGE_OCCLUSION_PREFIX = "image-occlusion:";

interface TextNode {
    type: "text";
    text: string;
}

interface ClozeNode {
    type: "cloze";
    ordinals: number[];
    hint?: string;
    children: ClozeAstNode[];
}

export type ClozeAstNode = TextNode | ClozeNode;

export interface ParsedCloze {
    html: string;
    warnings: string[];
    hasImageOcclusion: boolean;
}

function parseOrdinals(raw: string): number[] {
    const ordinals = [
        ...new Set(
            raw
                .split(",")
                .map((part) => Number.parseInt(part, 10))
                .filter((n) => Number.isInteger(n) && n > 0),
        ),
    ];
    return ordinals.sort((a, b) => a - b);
}

/// Finds the next position of either an opening or closing cloze marker.
function nextMarker(input: string, from: number): number {
    const open = input.indexOf("{{c", from);
    const close = input.indexOf("}}", from);
    if (open === -1) return close;
    if (close === -1) return open;
    return Math.min(open, close);
}

export function parseClozeAst(input: string): { nodes: ClozeAstNode[]; unbalanced: boolean } {
    const root: ClozeAstNode[] = [];
    const stack: ClozeNode[] = [];
    const childrenOf = () => (stack.length ? stack[stack.length - 1].children : root);

    let i = 0;
    while (i < input.length) {
        if (input.startsWith("{{c", i)) {
            const match = OPEN_CLOZE.exec(input.slice(i));
            const ordinals = match ? parseOrdinals(match[1]) : [];
            if (match && ordinals.length > 0) {
                const node: ClozeNode = { type: "cloze", ordinals, children: [] };
                childrenOf().push(node);
                stack.push(node);
                i += match[0].length;
                continue;
            }
        }

        if (input.startsWith("}}", i) && stack.length > 0) {
            stack.pop();
            i += 2;
            continue;
        }

        // Take a run of plain text up to the next marker.
        let end = nextMarker(input, i + 1);
        if (end === -1) {
            end = input.length;
        }
        let text = input.slice(i, end);

        const open = stack[stack.length - 1];
        if (open && open.hint === undefined && !text.startsWith(IMAGE_OCCLUSION_PREFIX)) {
            const separator = text.indexOf("::");
            if (separator !== -1) {
                open.hint = text.slice(separator + 2);
                text = text.slice(0, separator);
            }
        }
        if (text) {
            childrenOf().push({ type: "text", text });
        }
        i = end;
    }

    return { nodes: root, unbalanced: stack.length > 0 };
}

function escapeAttribute(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function isImageOcclusion(node: ClozeNode): boolean {
    const first = node.children[0];
    return first?.type === "text" && first.text.startsWith(IMAGE_OCCLUSION_PREFIX);
}

/// Converts Anki field text into the editor's HTML, where each blank becomes a
/// span the editor understands. Nested blanks are flattened, since the editor
/// represents a blank as a mark and marks cannot nest inside themselves.
export function ankiToEditorHtml(field: string): ParsedCloze {
    const { nodes, unbalanced } = parseClozeAst(field);
    const warnings: string[] = [];
    let hasImageOcclusion = false;

    if (unbalanced) {
        // Anki drops the text after an unclosed marker, so closing the blank here
        // both keeps the wording and repairs the note when it is exported again.
        warnings.push("A blank was missing its closing braces and has been repaired.");
    }

    const render = (list: ClozeAstNode[], insideCloze: boolean): string =>
        list
            .map((node) => {
                if (node.type === "text") {
                    return node.text;
                }

                if (isImageOcclusion(node)) {
                    hasImageOcclusion = true;
                    return "";
                }

                const inner = render(node.children, true);

                if (insideCloze) {
                    warnings.push("A blank inside another blank was flattened into one blank.");
                    return inner;
                }

                if (node.ordinals.length > 1) {
                    warnings.push(
                        `A blank covering several numbers (${node.ordinals.join(", ")}) now uses ${node.ordinals[0]}.`,
                    );
                }

                const hint = node.hint
                    ? ` data-hint="${escapeAttribute(node.hint)}"`
                    : "";
                return `<span data-cloze="${node.ordinals[0]}"${hint} class="cloze-blank">${inner}</span>`;
            })
            .join("");

    return {
        html: render(nodes, false),
        warnings: [...new Set(warnings)],
        hasImageOcclusion,
    };
}
