#!/usr/bin/env python3
"""Generate the committed synthetic QA E2E SQLite store."""

from __future__ import annotations

import argparse
import sqlite3
import tempfile
from pathlib import Path

from ciq_autotune.store import Store
from qa_e2e_cases import QA_CASES, QaCase, materialize_case


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "mockups" / "qa-e2e.synthetic" / "harmonic.sqlite"
GENERATED_BY = "scripts/gen_qa_e2e_db.py"
NOTE = "SYNTHETIC. Manufactured QA E2E source rows; no real records."


def generate(output: Path, case: QaCase | None = None) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)
    selected = case or next(case for case in QA_CASES if case.name == "showcase")
    with Store.open(str(output)) as store:
        materialize_case(store, selected)
        with store.conn:
            store.conn.execute(
                "CREATE TABLE synthetic_fixture_provenance (id INTEGER PRIMARY KEY "
                "CHECK (id = 1), _generated_by TEXT NOT NULL, _note TEXT NOT NULL, "
                "synthetic INTEGER NOT NULL CHECK (synthetic = 1))"
            )
            store.conn.execute(
                "INSERT INTO synthetic_fixture_provenance VALUES (1, ?, ?, 1)",
                (
                    GENERATED_BY,
                    NOTE if case is None else f"{NOTE} Case: {selected.name}.",
                ),
            )
    with sqlite3.connect(output) as conn:
        conn.execute("PRAGMA journal_mode = DELETE")
        conn.execute("VACUUM")


def _dump(path: Path) -> str:
    with sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True) as conn:
        return "\n".join(line for line in conn.iterdump()
                         if "input_data_revision" not in line) + "\n"


def check(output: Path) -> bool:
    if not output.is_file():
        print(f"qa-e2e database: missing committed fixture: {output}")
        return False
    with tempfile.TemporaryDirectory() as tmp:
        regenerated = Path(tmp) / output.name
        generate(regenerated)
        current, expected = _dump(output), _dump(regenerated)
    if current != expected:
        print(f"qa-e2e database: committed logical contents differ from generator ({output})")
        return False
    print(f"qa-e2e database: current ({output})")
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=None)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--case", choices=tuple(case.name for case in QA_CASES))
    args = parser.parse_args(argv)
    if args.case is not None and args.out is None:
        parser.error("--case requires an explicit --out scratch path")
    output = (args.out or DEFAULT_OUTPUT).resolve()
    if args.check:
        return 0 if check(output) else 1
    selected = (
        next(case for case in QA_CASES if case.name == args.case)
        if args.case is not None else None
    )
    generate(output, selected)
    print(f"wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
