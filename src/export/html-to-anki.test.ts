import { describe, expect, it } from "vitest";
import { extractClozeNumbers, htmlToAnki, stripHtml } from "./html-to-anki";

describe("htmlToAnki", () => {
    it("converts cloze spans to anki syntax", () => {
        const html = '<p>The <span data-cloze="1" class="cloze-blank">capital</span> of France is Paris.</p>';
        const { html: out } = htmlToAnki(html, () => undefined);
        expect(out).toContain("{{c1::capital}}");
        expect(out).not.toContain("data-cloze");
    });

    it("preserves cloze hints on export", () => {
        const html =
            '<p><span data-cloze="1" data-hint="a city" class="cloze-blank">Paris</span></p>';
        const { html: out } = htmlToAnki(html, () => undefined);
        expect(out).toContain("{{c1::Paris::a city}}");
    });

    it("preserves formatting inside blanks", () => {
        const html = '<p><span data-cloze="2" class="cloze-blank"><strong>word</strong></span></p>';
        const { html: out } = htmlToAnki(html, () => undefined);
        expect(out).toContain("{{c2::<strong>word</strong>}}");
    });

    it("rewrites image media references", () => {
        const blob = new Blob(["fake"], { type: "image/png" });
        const html = '<p><img data-media-id="abc-123" src="blob:fake"></p>';
        const { html: out, mediaRefs } = htmlToAnki(html, (id) =>
            id === "abc-123"
                ? { id: "abc-123", filename: "cm-abc-12345.png", blob }
                : undefined,
        );
        expect(out).toContain('src="cm-abc-12345.png"');
        expect(out).not.toContain("data-media-id");
        expect(mediaRefs).toHaveLength(1);
    });

    it("extracts distinct cloze numbers", () => {
        const html =
            '<p><span data-cloze="1">a</span> and <span data-cloze="2">b</span> and <span data-cloze="1">a</span></p>';
        expect(extractClozeNumbers(html)).toEqual([1, 2]);
    });

    it("strips html for sort fields", () => {
        expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
    });
});
