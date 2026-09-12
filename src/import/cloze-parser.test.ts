import { describe, expect, it } from "vitest";
import { ankiToEditorHtml } from "./cloze-parser";

describe("ankiToEditorHtml", () => {
    it("converts a simple blank into a span", () => {
        const result = ankiToEditorHtml("The capital is {{c1::Paris}}.");
        expect(result.html).toBe(
            'The capital is <span data-cloze="1" class="cloze-blank">Paris</span>.',
        );
        expect(result.warnings).toEqual([]);
    });

    it("keeps markup inside a blank", () => {
        const result = ankiToEditorHtml("{{c2::<strong>bold</strong> text}}");
        expect(result.html).toBe(
            '<span data-cloze="2" class="cloze-blank"><strong>bold</strong> text</span>',
        );
    });

    it("preserves hints", () => {
        const result = ankiToEditorHtml("{{c1::Paris::a city}}");
        expect(result.html).toBe(
            '<span data-cloze="1" data-hint="a city" class="cloze-blank">Paris</span>',
        );
    });

    it("escapes quotes in hints", () => {
        const result = ankiToEditorHtml('{{c1::x::say "hi"}}');
        expect(result.html).toContain('data-hint="say &quot;hi&quot;"');
    });

    it("uses the first number of a multi-ordinal blank and warns", () => {
        const result = ankiToEditorHtml("{{c2,1::both}}");
        expect(result.html).toBe('<span data-cloze="1" class="cloze-blank">both</span>');
        expect(result.warnings.join(" ")).toContain("several numbers");
    });

    it("flattens nested blanks", () => {
        const result = ankiToEditorHtml("{{c1::outer {{c2::inner}} end}}");
        expect(result.html).toBe(
            '<span data-cloze="1" class="cloze-blank">outer inner end</span>',
        );
        expect(result.warnings.join(" ")).toContain("inside another blank");
    });

    it("handles several blanks in one field", () => {
        const result = ankiToEditorHtml("{{c1::a}} and {{c2::b}}");
        expect(result.html).toBe(
            '<span data-cloze="1" class="cloze-blank">a</span> and' +
                ' <span data-cloze="2" class="cloze-blank">b</span>',
        );
    });

    it("repairs an unclosed blank instead of losing the text", () => {
        const result = ankiToEditorHtml("broken {{c1::text");
        expect(result.html).toBe('broken <span data-cloze="1" class="cloze-blank">text</span>');
        expect(result.warnings.join(" ")).toContain("closing braces");
    });

    it("leaves braces that are not blanks alone", () => {
        const result = ankiToEditorHtml("use {{Field}} or {{cx::y}}");
        expect(result.html).toBe("use {{Field}} or {{cx::y}}");
    });

    it("flags image occlusion notes", () => {
        const result = ankiToEditorHtml('{{c1::image-occlusion:rect:left=10:top=20}}');
        expect(result.hasImageOcclusion).toBe(true);
    });

    it("does not read a hint out of an image occlusion payload", () => {
        const result = ankiToEditorHtml("{{c1::image-occlusion:rect:left=10::oops}}");
        expect(result.hasImageOcclusion).toBe(true);
        expect(result.html).toBe("");
    });

    it("passes plain text through untouched", () => {
        expect(ankiToEditorHtml("<p>no blanks</p>").html).toBe("<p>no blanks</p>");
    });
});
