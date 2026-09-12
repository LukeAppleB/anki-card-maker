#!/usr/bin/env python3
"""Import a Card Maker deck into Anki, then a later export of the same notes,
and confirm Anki updates those notes instead of duplicating them."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIRST = ROOT / "tmp" / "verify.apkg"
SECOND = ROOT / "tmp" / "verify-edited.apkg"


def import_package(col, path: Path) -> None:
    from anki.collection import ImportAnkiPackageRequest

    options = col._backend.get_import_anki_package_presets()
    col.import_anki_package(ImportAnkiPackageRequest(package_path=str(path), options=options))


def main() -> None:
    for path in (FIRST, SECOND):
        if not path.exists():
            print(f"Missing {path}. Run: npm run test -- src/export/write-apkg.test.ts", file=sys.stderr)
            sys.exit(1)

    from anki.collection import Collection

    with tempfile.TemporaryDirectory() as tmp:
        col = Collection(str(Path(tmp) / "collection.anki2"))
        try:
            import_package(col, FIRST)
            notes_after_first = col.db.scalar("select count(*) from notes")
            assert notes_after_first == 2, notes_after_first

            cloze_model = col.models.by_name("Card Maker – Blanks")
            assert cloze_model is not None
            first_flds = col.db.scalar("select flds from notes where mid = ?", cloze_model["id"])
            assert "{{c1::capital}}" in first_flds, first_flds

            guids = {row[0] for row in col.db.execute("select guid from notes")}
            assert "11111111-1111-4111-8111-111111111111" in guids
            assert "22222222-2222-4222-8222-222222222222" in guids

            import_package(col, SECOND)
            notes_after_second = col.db.scalar("select count(*) from notes")
            assert notes_after_second == 2, notes_after_second

            edited_flds = col.db.scalar("select flds from notes where mid = ?", cloze_model["id"])
            assert "{{c1::city}}" in edited_flds, edited_flds
            assert "{{c1::capital}}" not in edited_flds, edited_flds

            qa_model = col.models.by_name("Card Maker – Q&A")
            qa_flds = col.db.scalar("select flds from notes where mid = ?", qa_model["id"])
            assert "four" in qa_flds, qa_flds

            print("Round-trip OK: Anki updated the same 2 notes")
        finally:
            col.close()


if __name__ == "__main__":
    main()
