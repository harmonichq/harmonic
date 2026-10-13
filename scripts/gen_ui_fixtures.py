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
* Its ``queue`` block holds the Queue components' answers (findings,
  guidance, analyze, trials, focus), trimmed to the fields they read, from the
  showcase and from the named QA case stores listed in ``QUEUE_STORES``. Each
  case store is materialised into a scratch directory by
  ``scripts/gen_qa_e2e_db.py``'s own ``generate`` and never committed. Every
  store is chosen for one state a story renders, and ``QUEUE_STORES`` asserts
  that the engine still serves that state, so a story never shows a state the
  data no longer has.
* ``frontend/ui/__fixtures__/ui-allowlist.json`` is every word a story may
  display. It is built from the glossary (§1.5) and the tab names (§1.1) of
  ``docs/design/recommendations-redesign.md``, plus the engine titles, nouns
  and units in the fixture above, plus the window unit and the "of" of a
  magnitude from §4.2.

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

sys.path.insert(0, str(ROOT / "scripts"))
from gen_qa_e2e_db import generate as generate_case  # noqa: E402
from qa_e2e_cases import QA_CASES  # noqa: E402

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
# §4.2 SegmentedControl: "14 / 30 / 90 d", and QueueRow's magnitude "9 of 71 lows".
UNITS = ("d",)
CONNECTIVES = ("of",)

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
                  "scratch copy of the synthetic QA showcase and over named QA "
                  "case stores generated into scratch. status.failed adds one "
                  "invented failed sync attempt to the showcase copy."),
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
        "queue": queue_stores(),
    }


def _pattern_row(store: dict, key: str) -> dict:
    return next(r for r in store["findings"]["rows"] if r["id"] == f"pattern:{key}")


def _shares(store: dict, key: str) -> list[int]:
    return [s["count"] for r in store["findings"]["rows"] if r.get("claimed_by") == f"pattern:{key}"
            for s in r["fold_sentences"] or () if s["scope"] == "pattern"]


def _wide(store: dict, key: str):
    return next(c for c in store["guidance"]["candidates"]
                if c["subject"] == f"pattern:{key}")["support"].get("wide")


def _counted(store: dict, key: str) -> bool:
    return bool(_pattern_row(store, key)["count_sentences"])


def _basal_row(store: dict, start: int) -> dict:
    return next(r for r in store["findings"]["rows"]
                if r["kind"] == "setting" and r.get("parameter") == "basal_rate"
                and r["span"]["start_min"] == start)


def _nights(store: dict, label: str) -> list[float]:
    slot = next(b for b in store["analyze"]["basal"] if b["label"] == label)
    return [night["delivered_rate"] for night in slot["evidence"]["night_roster"]]


# Each store backs the story states named beside it; the check is what the
# engine must still serve for those states to be real.
QUEUE_STORES = {
    "showcase": (  # SettingCard range collapsed; EvidenceChart zero variance
        lambda s: (_basal_row(s, 180)["members"][0]["estimate"]["lo"]
                   == _basal_row(s, 180)["members"][0]["estimate"]["hi"]
                   and len(set(_nights(s, "03:00"))) == 1)),
    "behavioral-carb-undercount": (  # multi-cause (the engine also serves it Wide)
        lambda s: _counted(s, "highs_after_meals") and len(_shares(s, "highs_after_meals")) >= 2),
    "behavioral-split-meal": (  # single cause, not Wide
        lambda s: _counted(s, "highs_after_meals") and len(_shares(s, "highs_after_meals")) == 1
        and _wide(s, "highs_after_meals") is False),
    "behavioral-correction-stacking": (  # Wide
        lambda s: _counted(s, "lows_after_correcting_highs")
        and _wide(s, "lows_after_correcting_highs") is True),
    "basal-recurring-low-spread": (  # no attributed cause; SettingCard and EvidenceChart default
        lambda s: _counted(s, "overnight_lows_no_iob") and not _shares(s, "overnight_lows_no_iob")
        and _pattern_row(s, "overnight_lows_no_iob")["count_sentences"][0]["count"] > 0
        and len(set(_nights(s, "03:00"))) > 1),
    "c3-focus": (  # pinned: an active Focus on the pattern's habit
        lambda s: any(f["status"] == "active" and f["pattern_key"] == "highs_after_meals"
                      for f in s["focus"]["focuses"])),
    "c3-trial": (  # SettingCard matured into a Trial
        lambda s: any(t["parameter"] == "basal_rate" and t["slot"] == "03:00"
                      and t["state"] == "complete" for t in s["trials"]["trials"])),
}

ROW_FIELDS = ("id", "kind", "title", "chips", "claimed_by", "lever", "parameter",
              "count_sentences", "fold_sentences", "span", "members")


def _queue_store(database: pathlib.Path) -> dict:
    """The Queue components' answers from one store, trimmed to what they read."""
    client = TestClient(create_app(
        db_path=str(database), token=None, enable_fetch_loop=False,
        analysis_incarnation="ui-fixtures",
    ))
    findings = _get(client, "/api/diagnose/findings")
    guidance = _get(client, "/api/guidance")
    analyze = _get(client, "/api/analyze")
    trials = _get(client, "/api/verify/trials")
    focus = _get(client, "/api/focus")
    return {
        "findings": {
            "outcome_patterns": [
                {field: p[field] for field in ("key", "subject", "title", "k", "n", "wilson")}
                for p in findings["outcome_patterns"]
            ],
            "rows": [
                {field: r.get(field) for field in ROW_FIELDS}
                for r in findings["rows"]
                if r["kind"] == "pattern" or r.get("claimed_by")
                or (r["kind"] == "setting" and r.get("parameter") == "basal_rate" and r.get("members"))
            ],
        },
        "guidance": {
            "candidates": [
                {"subject": c["subject"], "kind": c["kind"], "title": c["title"],
                 "units": c["units"], "support": {"wide": c["support"].get("wide")}}
                for c in guidance["candidates"]
            ],
        },
        "analyze": {
            "basal": [
                {**{field: b[field] for field in
                    ("slot", "label", "current", "recommended", "estimate", "days")},
                 "evidence": {"night_roster": [
                     {field: night[field] for field in ("date", "delivered_rate", "programmed_rate")}
                     for night in b["evidence"]["night_roster"]
                 ]}}
                for b in analyze["basal"] if b.get("asserts_move")
            ],
        },
        "trials": {
            "trials": [
                {field: t[field] for field in
                 ("id", "parameter", "slot", "changed_at", "before", "after", "state", "maturing")}
                for t in trials["trials"]
            ],
        },
        "focus": {
            "focuses": [
                {field: f[field] for field in ("id", "lever", "pattern_key", "status")}
                for f in focus["focuses"]
            ],
        },
    }


def queue_stores() -> dict:
    stores = {}
    with tempfile.TemporaryDirectory() as scratch:
        for name, holds in QUEUE_STORES.items():
            database = pathlib.Path(scratch) / f"{name}.sqlite"
            if name == "showcase":
                shutil.copyfile(SHOWCASE, database)
            else:
                generate_case(database, next(case for case in QA_CASES if case.name == name))
            store = _queue_store(database)
            if not holds(store):
                raise SystemExit(f"QA store {name!r} no longer serves the state its stories render")
            stores[name] = store
    return stores


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
    stores = data["queue"].values()
    rows = [r for store in stores for r in store["findings"]["rows"]]
    sentences = [s for r in rows for s in (r["count_sentences"] or []) + (r["fold_sentences"] or [])]
    sources = {
        "glossary §1.5": _table_first_column(_section(text, "### 1.5 Glossary")),
        "tabs §1.1": _table_first_column(_section(text, "### 1.1 Tabs")),
        "engine titles": [c["title"] for c in data["guidance"]["candidates"]]
        + [c["title"] for store in stores for c in store["guidance"]["candidates"]]
        + [r["title"] for r in rows if r.get("claimed_by")],
        "engine nouns": [s["noun"] for s in sentences],
        "engine units": [c["units"] for store in stores for c in store["guidance"]["candidates"]
                         if c["units"]],
        "units §4.2": list(UNITS),
        "connectives §4.2": list(CONNECTIVES),
    }
    # The metric row is one cell listing every metric, comma-separated; the
    # answer and result rows are slash-separated. Words are what is checked.
    words = sorted({word.lower() for cells in sources.values()
                    for cell in cells for word in WORD.findall(cell)})
    return {
        "_generated_by": GENERATED_BY,
        "_note": ("Every word a component story may display: the redesign "
                  "glossary, its tab names, the engine titles, nouns and units "
                  "served in ui-fixtures.json, the window unit and the \"of\" "
                  "of a magnitude."),
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
