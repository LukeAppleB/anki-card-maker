export interface MediaRef {
    id: string;
    filename: string;
    blob: Blob;
}

export interface ConvertResult {
    html: string;
    mediaRefs: MediaRef[];
}

const CLOZE_SELECTOR = "span[data-cloze]";

function extensionFromMime(mime: string): string {
    const map: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/svg+xml": "svg",
    };
    return map[mime] ?? "bin";
}

function collectClozeNumbers(root: ParentNode): number[] {
    const numbers = new Set<number>();
    root.querySelectorAll(CLOZE_SELECTOR).forEach((el) => {
        const n = Number(el.getAttribute("data-cloze"));
        if (!Number.isNaN(n) && n > 0) {
            numbers.add(n);
        }
    });
    return [...numbers].sort((a, b) => a - b);
}

export function extractClozeNumbers(html: string): number[] {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return collectClozeNumbers(doc.body);
}

export function htmlToAnki(
    html: string,
    mediaResolver: (id: string) => MediaRef | undefined,
): ConvertResult {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const mediaRefs: MediaRef[] = [];
    const seen = new Map<string, string>();

    doc.body.querySelectorAll("img").forEach((img) => {
        const mediaId = img.getAttribute("data-media-id");
        if (!mediaId) {
            return;
        }
        let filename = seen.get(mediaId);
        if (!filename) {
            const ref = mediaResolver(mediaId);
            if (!ref) {
                img.remove();
                return;
            }
            filename = ref.filename;
            seen.set(mediaId, filename);
            mediaRefs.push(ref);
        }
        img.setAttribute("src", filename);
        img.removeAttribute("data-media-id");
    });

    let outputHtml = doc.body.innerHTML;
    outputHtml = outputHtml.replace(
        /<span[^>]*\sdata-cloze="(\d+)"[^>]*>([\s\S]*?)<\/span>/gi,
        (_match, n: string, inner: string) => `{{c${n}::${inner}}}`,
    );

    return {
        html: outputHtml,
        mediaRefs,
    };
}

export function makeMediaFilename(id: string, blob: Blob): string {
    const ext = extensionFromMime(blob.type || "application/octet-stream");
    return `cm-${id.slice(0, 8)}.${ext}`;
}

export function stripHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}
