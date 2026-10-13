#!/usr/bin/env python3
"""Generate the component library's fixtures and its word allowlist (#483).

Two committed outputs, one generator, one ``--check``:

* ``frontend/ui/__fixtures__/ui-fixtures.json`` holds the served answers the
  stories render. They come from the public HTTP API, in process, over a scratch
  copy of the synthetic QA showcase (``mockups/qa-e2e.synthetic/harmonic.sqlite``)
  with the fetch loop off. Nothing is served on a port and nothing is fetched.
  The one invented input is a failed sync attempt, written into the scratch
  copy through ``Store.record_fetch_result`` so the Settings alert badge has a
  served ``last_error`` to read. The showcase itself is never written.
* ``frontend/ui/__fixtures__/ui-allowlist.json`` is every word a story may
  display. It is built from the glossary (§1.5) and the tab names (§1.1) of
  ``docs/design/recommendations-redesign.md``, plus the engine titles in the
  fixture above, plus the window unit from §4.2.

    uv run python scripts/gen_ui_fixtures.py          # rewrite in place
    uv run python scripts/gen_ui_fixtures.py --check  # CI-style drift check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import shutil
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from ciq_autotune.api import create_app  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402

SHOWCASE = ROOT / "mockups" / "qa-e2e.synthetic" / "harmonic.sqlite"
DESIGN = ROOT / "docs" / "design" / "recommendations-redesign.md"
OUT_DIR = ROOT / "frontend" / "ui" / "__fixtures__"
FIXTURES = OUT_DIR / "ui-fixtures.json"
ALLOWLIST = OUT_DIR / "ui-allowlist.json"
GENERATED_BY = "scripts/gen_ui_fixtures.py"

WINDOWS = (14, 30, 90)
# The invented failed attempt: one minute after the showcase's last reading.
FAILED_ATTEMPT_AT = "2024-07-01 00:00:00"
FAILED_ERROR = "synthetic sync failure"
# §4.2 SegmentedControl: "14 / 30 / 90 d". The only unit batch 1 displays.
UNITS = ("d",)

WORD = re.compile(r"[A-Za-z][A-Za-z'’-]*")


def _get(client: TestClient, path: str, **params) -> object:
    response = client.get(path, params=params or None)
    response.raise_for_status()
    return response.json()


def fixtures() -> dict:
    """Read every endpoint batch 1 renders, through the public API."""
    with tempfile.TemporaryDirectory() as scratch:
        database = pathlib.Path(scratch) / "harmonic.sqlite"
        shutil.copyfile(SHOWCASE, database)
        client = TestClient(create_app(
            db_path=str(database), token=None, enable_fetch_loop=False,
            analysis_incarnation="ui-fixtures",
        ))
        status_ok = _get(client, "/api/status")
        outcomes = {str(w): _get(client, "/api/outcomes", window=w) for w in WINDOWS}
        prompts = _get(client, "/api/prompts")
        guidance = _get(client, "/api/guidance")
        with Store.open(str(database)) as store:
            store.record_fetch_result(attempted_at=FAILED_ATTEMPT_AT, ok=False,
                                      error=FAILED_ERROR)
        status_failed = _get(client, "/api/status")
    return {
        "_generated_by": GENERATED_BY,
        "_note": ("Synthetic only: served by the public API, in process, over a "
                  "scratch copy of the synthetic QA showcase. status.failed adds "
                  "one invented failed sync attempt to that copy."),
        "status": {"ok": status_ok, "failed": status_failed},
        "prompts": prompts,
        "outcomes": {
            key: {field: answer[field] for field in
                  ("window_days", "span_start", "span_end", "coverage", "metrics")}
            for key, answer in outcomes.items()
        },
        "guidance": {
            "candidates": [
                {field: candidate[field] for field in ("subject", "kind", "title", "priority")}
                for candidate in guidance["candidates"]
            ],
        },
    }


def _table_first_column(section: str) -> list[str]:
    """The bold first-column cells of the first table in ``section``."""
    cells = []
    for line in section.splitlines():
        match = re.match(r"\|\s*\*\*(.+?)\*\*\s*\|", line)
        if match:
            cells.append(match.group(1))
    return cells


def _section(text: str, heading: str) -> str:
    start = text.index(heading)
    end = text.find("\n### ", start + len(heading))
    return text[start:end if end != -1 else len(text)]


def allowlist(data: dict) -> dict:
    text = DESIGN.read_text()
    sources = {
        "glossary §1.5": _table_first_column(_section(text, "### 1.5 Glossary")),
        "tabs §1.1": _table_first_column(_section(text, "### 1.1 Tabs")),
        "engine titles": [c["title"] for c in data["guidance"]["candidates"]],
        "units §4.2": list(UNITS),
    }
    # The metric row is one cell listing every metric, comma-separated; the
    # answer and result rows are slash-separated. Words are what is checked.
    words = sorted({word.lower() for cells in sources.values()
                    for cell in cells for word in WORD.findall(cell)})
    return {
        "_generated_by": GENERATED_BY,
        "_note": ("Every word a component story may display: the redesign "
                  "glossary, its tab names, the engine titles served in "
                  "ui-fixtures.json, and the window unit."),
        "words": words,
    }


def render(document: dict) -> str:
    return json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = fixtures()
    outputs = {FIXTURES: render(data), ALLOWLIST: render(allowlist(data))}
    if args.check:
        stale = [path for path, body in outputs.items()
                 if not path.exists() or path.read_text() != body]
        for path in stale:
            print(f"{path.relative_to(ROOT)} is stale; rerun {pathlib.Path(__file__).name}")
        return 1 if stale else 0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for path, body in outputs.items():
        path.write_text(body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
