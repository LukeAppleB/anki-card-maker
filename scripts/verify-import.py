#!/usr/bin/env python3
"""Import tmp/verify.apkg with Anki and assert note/card counts."""

from __future__ import annotations

import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APKG = ROOT / "tmp" / "verify.apkg"


def main() -> None:
    if not APKG.exists():
        print(f"Missing {APKG}. Run: npm run test -- src/export/write-apkg.test.ts", file=sys.stderr)
        sys.exit(1)

    assert zipfile.is_zipfile(APKG), "not a zip file"

    from anki.collection import Collection, ImportAnkiPackageRequest

    with tempfile.TemporaryDirectory() as tmp:
        col = Collection(str(Path(tmp) / "collection.anki2"))
        try:
            options = col._backend.get_import_anki_package_presets()
            request = ImportAnkiPackageRequest(package_path=str(APKG), options=options)
            col.import_anki_package(request)
            notes = col.db.scalar("select count(*) from notes")
            cards = col.db.scalar("select count(*) from cards")
            cloze_model = col.models.by_name("Card Maker – Blanks")
            assert cloze_model is not None, "cloze model missing"
            cloze_flds = col.db.scalar("select flds from notes where mid = ?", cloze_model["id"])
            assert "{{c1::capital}}" in cloze_flds, cloze_flds
            print(f"Imported OK: {notes} notes, {cards} cards")
            assert notes == 2, notes
            assert cards == 2, cards
        finally:
            col.close()


if __name__ == "__main__":
    main()
