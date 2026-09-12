"""Build a deck with real Anki, so the importer can be tested against Anki's own
output rather than only against our exporter.

Usage: python scripts/make-anki-deck.py [out_path]
Requires the `anki` package (see verify-import.py for the venv used in CI notes).
"""

import base64
import os
import shutil
import sys
import tempfile

from anki.collection import Collection, ExportAnkiPackageOptions

# 1x1 red PNG.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="
)


def main() -> int:
    out_path = sys.argv[1] if len(sys.argv) > 1 else "tmp/anki-export.apkg"
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    if os.path.exists(out_path):
        os.remove(out_path)

    workdir = tempfile.mkdtemp(prefix="anki-deck-")
    col = Collection(os.path.join(workdir, "collection.anki2"))
    try:
        deck_id = col.decks.id("Biology 101")

        image_path = os.path.join(workdir, "cell.png")
        with open(image_path, "wb") as handle:
            handle.write(PNG)
        image_name = col.media.add_file(image_path)

        basic = col.models.by_name("Basic")
        note = col.new_note(basic)
        note["Front"] = f'What does this show? <img src="{image_name}">'
        note["Back"] = "A <b>cell</b>"
        col.add_note(note, deck_id)

        cloze = col.models.by_name("Cloze")
        note = col.new_note(cloze)
        note["Text"] = (
            "The {{c1::mitochondrion::organelle}} makes ATP, "
            "and {{c2,3::ribosomes}} make protein."
        )
        note["Back Extra"] = "Cell biology"
        col.add_note(note, deck_id)

        count = col.export_anki_package(
            out_path=out_path,
            options=ExportAnkiPackageOptions(
                with_scheduling=False,
                with_deck_configs=False,
                with_media=True,
                legacy=True,
            ),
            limit=None,
        )
        print(f"wrote {out_path} ({count} notes)")
    finally:
        col.close()
        shutil.rmtree(workdir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
