import { mount, unmount } from "svelte";
import { describe, expect, it } from "vitest";
import App from "./App.svelte";

describe("App", () => {
    it("renders the shell on first load", async () => {
        const target = document.createElement("div");
        document.body.append(target);

        const app = mount(App, { target });
        try {
            expect(target.querySelector("h1")?.textContent).toBe("Card Maker");
            const buttons = [...target.querySelectorAll("button")].map((b) => b.textContent?.trim());
            expect(buttons).toContain("+ Fill-in-the-blank");
            expect(buttons).toContain("+ Question & Answer");
            expect(target.textContent).toContain("Export to Anki");
            expect(target.textContent).toContain("Import deck");
        } finally {
            unmount(app);
            target.remove();
        }
    });
});
