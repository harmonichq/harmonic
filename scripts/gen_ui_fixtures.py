#!/usr/bin/env python3
"""Generate the component library's fixtures and its word allowlist (#483).

Two committed outputs, one generator, one ``--check``:

* ``frontend/ui/__fixtures__/ui-fixtures.json`` holds the served answers the
  stories render. Their source is ``scripts/ui_patient.py``: a seeded synthetic
  Control-IQ wearer whose history is ingested into a scratch SQLite store and
  read back through the public HTTP API, in process, with the fetch loop off.
  Nothing is served on a port, nothing is fetched, and no real data is read.
  Two stores are built from the one wearer:

  - ``wearer`` changes the 03:00 basal on the simulator's Trial day, which the
    engine detects as a Trial. The person also logs a few treated lows in the
    manual carb log and answers one prompt, through ``POST /api/carbs`` and
    ``POST /api/prompts/answer``. Every top-level block (status, prompts,
    outcomes, guidance) is read from this store.
  - ``wearer-pinned`` is the same history without the profile change, with a
    Focus pinned through ``POST /api/focus`` (one change is active at a time,
    so the Trial and the Focus cannot share a store).

  Two more stores serve the Overview states the full history cannot:

  - ``wearer-first-days`` is the same wearer's first five days only, as a sync
    early on would hold: too few days for the glucose profile to support.
  - ``wearer-unsynced`` is a store before its first sync, with no readings, so
    every outcome metric is served as null.

  ``overview`` holds the Overview components' answers by store:
  ``/api/explore/time-of-day`` and ``/api/day-navigator`` for the wearer's
  latest month, and ``/api/outcomes`` for each window where the top-level
  ``outcomes`` (the wearer's) does not already hold it.

  ``status.failed`` adds one invented failed sync attempt, through
  ``Store.record_fetch_result``, so the Settings alert has a served
  ``last_error``. The wall clock every write stamps is pinned to one hour after
  the wearer's last reading, so the output is byte-reproducible.

  ``states`` names, for each story state, the store and the pattern or basal
  block that serves it, chosen by rule from what the engine served. A state
  the stories need that the engine no longer serves fails the generator; a
  state that does not arise naturally is ``null`` and its story is absent.
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
import contextlib
import json
import pathlib
import re
import sys
import tempfile
from datetime import timedelta
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from fastapi.testclient import TestClient  # noqa: E402

import ui_patient  # noqa: E402
from ciq_autotune.api import create_app  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402
from ciq_autotune.watched_change import reconcile_ingested_follow_up  # noqa: E402

DESIGN = ROOT / "docs" / "design" / "recommendations-redesign.md"
OUT_DIR = ROOT / "frontend" / "ui" / "__fixtures__"
FIXTURES = OUT_DIR / "ui-fixtures.json"
ALLOWLIST = OUT_DIR / "ui-allowlist.json"
GENERATED_BY = "scripts/gen_ui_fixtures.py"

WINDOWS = (14, 30, 90)
# The pinned wall clock: one hour after the wearer's last reading.
CLOCK = ui_patient.START + timedelta(days=ui_patient.DAYS, hours=1)
FAILED_ERROR = "synthetic sync failure"
# The person logs the treated lows of the prompt window (the last week) by
# hand, all but the most recent few, which stay as prompts.
PROMPT_WINDOW_DAYS = 7
UNLOGGED_LOWS = 2
# §4.2 SegmentedControl: "14 / 30 / 90 d", and QueueRow's magnitude "9 of 71 lows".
UNITS = ("d",)
CONNECTIVES = ("of",)
# EvidenceChart labels its two marks with the served field each one plots:
# analyze.basal[].current and analyze.basal[].estimate (approved 2026-10-12;
# not yet in glossary §1.5).
MARK_FIELDS = ("current", "estimate")
# §4.2 GlucoseProfile's insufficient-data label, quoted there; "data" is not yet
# in glossary §1.5.
STATE_LABELS = ("No data",)
# §4.2 DayTile: "a weekday and date". The weekday abbreviations are not yet in
# glossary §1.5.
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
# The wearer's first days: fewer than the glucose profile's eight supported days.
FIRST_DAYS = 5
# The day navigator's month: the month of the wearer's last day.
NAVIGATOR_MONTH = (ui_patient.START + timedelta(days=ui_patient.DAYS - 1)).strftime("%Y-%m")

WORD = re.compile(r"[A-Za-z][A-Za-z'’-]*")

# Every module that imported the server's wall clock by name.
_CLOCK_MODULES = ("analyze", "api", "cli", "credentials", "fetch_loop", "pattern_sweep",
                  "pending_prompts", "store", "sync", "watched_change")


def _clock(after=None):
    return max(CLOCK, after + timedelta(seconds=1)) if after else CLOCK


@contextlib.contextmanager
def pinned_clock():
    with contextlib.ExitStack() as stack:
        for module in _CLOCK_MODULES:
            stack.enter_context(patch(f"ciq_autotune.{module}.wall_clock_now", _clock))
        yield


def _get(client: TestClient, path: str, **params) -> object:
    response = client.get(path, params=params or None)
    response.raise_for_status()
    return response.json()


def _post(client: TestClient, path: str, payload: dict) -> object:
    response = client.post(path, json=payload)
    response.raise_for_status()
    return response.json()


def _serve(database: pathlib.Path) -> TestClient:
    return TestClient(create_app(
        db_path=str(database), token=None, enable_fetch_loop=False,
        analysis_incarnation="ui-fixtures",
    ))


def _wearer(scratch: pathlib.Path, name: str, *, trial: bool, days: int = ui_patient.DAYS):
    """Ingest the wearer into a scratch store, as a sync would, and serve it."""
    database = scratch / f"{name}.sqlite"
    with Store.open(str(database)) as store:
        history = ui_patient.materialize(store, trial=trial, days=days)
        reconcile_ingested_follow_up(store)
    client = _serve(database)
    # The person's own writes: the week's treated lows logged by hand, bar the
    # latest few, and one remaining prompt answered.
    window_start = ui_patient.START + timedelta(days=ui_patient.DAYS - PROMPT_WINDOW_DAYS)
    logged = [low for low in history.treated_lows if low[0] >= window_start][:-UNLOGGED_LOWS]
    for at, grams in logged:
        _post(client, "/api/carbs", {"t": at.strftime("%Y-%m-%d %H:%M:%S"), "grams": grams,
                                     "certainty": "estimate", "source": "manual"})
    pending = [p for p in _get(client, "/api/prompts") if p.get("answer") is None]
    if pending:
        _post(client, "/api/prompts/answer", {"detector": pending[0]["detector"],
                                              "anchor_t": pending[0]["anchor_t"], "answer": "no"})
    return database, client


def fixtures() -> dict:
    """Build both wearer stores and read every endpoint the stories render."""
    with pinned_clock(), tempfile.TemporaryDirectory() as scratch:
        scratch = pathlib.Path(scratch)
        database, client = _wearer(scratch, "wearer", trial=True)
        status_ok = _get(client, "/api/status")
        outcomes = {str(w): _get(client, "/api/outcomes", window=w) for w in WINDOWS}
        prompts = _get(client, "/api/prompts")
        guidance = _get(client, "/api/guidance")
        queue = {"wearer": _queue_store(client)}
        with Store.open(str(database)) as store:
            store.record_fetch_result(attempted_at=CLOCK.strftime("%Y-%m-%d %H:%M:%S"),
                                      ok=False, error=FAILED_ERROR)
        status_failed = _get(client, "/api/status")

        overview = {"wearer": {
            "time_of_day": _time_of_day(client),
            "day_navigator": _day_navigator(client),
        }}

        _, pinned = _wearer(scratch, "wearer-pinned", trial=False)
        _pin(pinned)
        queue["wearer-pinned"] = _queue_store(pinned)
        overview["wearer-pinned"] = {"outcomes": _outcomes(pinned)}

        _, first_days = _wearer(scratch, "wearer-first-days", trial=False, days=FIRST_DAYS)
        overview["wearer-first-days"] = {"time_of_day": _time_of_day(first_days)}

        unsynced = scratch / "wearer-unsynced.sqlite"
        with Store.open(str(unsynced)):
            pass
        overview["wearer-unsynced"] = {"outcomes": _outcomes(_serve(unsynced))}
    return {
        "_generated_by": GENERATED_BY,
        "_note": ("Synthetic only: a seeded simulated Control-IQ wearer "
                  "(scripts/ui_patient.py) ingested into scratch stores and served "
                  "by the public API, in process. status.failed adds one invented "
                  "failed sync attempt."),
        "status": {"ok": status_ok, "failed": status_failed},
        "prompts": prompts,
        "outcomes": {key: _outcome(answer) for key, answer in outcomes.items()},
        "guidance": {
            "candidates": [
                {field: candidate[field] for field in ("subject", "kind", "title", "priority")}
                for candidate in guidance["candidates"]
            ],
        },
        "queue": queue,
        "overview": overview,
        "states": states(queue),
    }


def _outcome(answer: dict) -> dict:
    return {field: answer[field] for field in
            ("window_days", "span_start", "span_end", "coverage", "metrics")}


def _outcomes(client: TestClient) -> dict:
    return {str(w): _outcome(_get(client, "/api/outcomes", window=w)) for w in WINDOWS}


def _time_of_day(client: TestClient) -> dict:
    """The glucose profile's answer: the pooled 15-minute bins and meal buckets."""
    answer = _get(client, "/api/explore/time-of-day")
    pooled = answer["pooled"]
    return {
        "window": answer["window"],
        "target_range": answer["target_range"],
        "pooled": pooled and {
            "bin_minutes": pooled["bin_minutes"],
            "bins": [{field: b[field] for field in ("minute", "supported", "median", "p10", "p25", "p75", "p90")}
                     for b in pooled["bins"]],
            "meals": [{field: m[field] for field in ("minute", "count")} for m in pooled["meals"]],
        },
    }


def _day_navigator(client: TestClient) -> dict:
    answer = _get(client, "/api/day-navigator", month=NAVIGATOR_MONTH)
    return {
        "month": answer["month"],
        "days": [{field: d[field] for field in ("iso", "has_data", "lows", "highs", "tir", "curve")}
                 for d in answer["days"]],
    }


def _pin(client: TestClient) -> None:
    """Pin a Focus on the first pattern whose habit the engine lets the person pin."""
    for candidate in _get(client, "/api/guidance")["candidates"]:
        if candidate["kind"] != "pattern":
            continue
        response = client.post("/api/focus", json={
            "pattern_key": candidate["pattern_key"],
            "outcome_window": {"start_min": 0, "end_min": 1440},
        })
        if response.status_code == 200:
            return
    raise SystemExit("the engine lets the wearer pin no pattern")


ROW_FIELDS = ("id", "kind", "title", "chips", "claimed_by", "lever", "parameter",
              "count_sentences", "fold_sentences", "span", "members")


def _queue_store(client: TestClient) -> dict:
    """The Queue components' answers from one store, trimmed to what they read."""
    findings = _get(client, "/api/diagnose/findings")
    guidance = _get(client, "/api/guidance")
    analyze = _get(client, "/api/analyze")
    trials = _get(client, "/api/verify/trials")
    focus = _get(client, "/api/focus")
    return {
        "findings": {
            "outcome_patterns": [
                {**{field: p[field] for field in ("key", "subject", "title", "k", "n", "wilson")},
                 "wide": p.get("wide")}
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
                {"subject": c["subject"], "kind": c["kind"], "title": c["title"], "units": c["units"]}
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


def _patterns(store: dict) -> list[dict]:
    """Counted patterns with their pattern-scope cause shares."""
    out = []
    for row in store["findings"]["rows"]:
        if row["kind"] != "pattern" or not row["count_sentences"]:
            continue
        shares = [s["count"] for r in store["findings"]["rows"] if r.get("claimed_by") == row["id"]
                  for s in r["fold_sentences"] or () if s["scope"] == "pattern"]
        out.append({"key": row["id"].removeprefix("pattern:"),
                    "count": row["count_sentences"][0]["count"], "shares": shares})
    return out


def _clock_label(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def _blocks(store: dict) -> list[dict]:
    """Admitted basal blocks: their start, range, nights and whether a Trial matured there."""
    out = []
    for row in store["findings"]["rows"]:
        if row["kind"] != "setting" or not row.get("members"):
            continue
        start = row["span"]["start_min"]
        slot = next(b for b in store["analyze"]["basal"] if b["slot"] * 30 == start)
        estimate = row["members"][0]["estimate"]
        out.append({
            "start": start,
            "collapsed": estimate["lo"] == estimate["hi"],
            "spread": len({n["delivered_rate"] for n in slot["evidence"]["night_roster"]}) > 1,
            "trial": any(t["parameter"] == "basal_rate" and t["slot"] == _clock_label(start)
                         and t["state"] == "complete" for t in store["trials"]["trials"]),
        })
    return out


def states(queue: dict) -> dict:
    """The store and subject behind each story state, chosen from the served answers."""
    patterns = _patterns(queue["wearer"])
    blocks = _blocks(queue["wearer"])

    def pattern(store, rule):
        found = sorted((p for p in (patterns if store == "wearer" else _patterns(queue[store]))
                        if rule(p)), key=lambda p: -p["count"])
        return {"store": store, "pattern": found[0]["key"]} if found else None

    def block(rule):
        found = [b for b in blocks if rule(b)]
        return {"store": "wearer", "start_min": found[0]["start"]} if found else None

    pinned = next((f["pattern_key"] for f in queue["wearer-pinned"]["focus"]["focuses"]
                   if f["status"] == "active"), None)
    uncertain = next((p["key"] for p in queue["wearer"]["findings"]["outcome_patterns"]
                      if p.get("wide") is True and any(q["key"] == p["key"] for q in patterns)), None)
    found = {
        "multi_cause": pattern("wearer", lambda p: len(p["shares"]) >= 2),
        "single_cause": pattern("wearer", lambda p: len(p["shares"]) == 1),
        "no_cause": pattern("wearer", lambda p: not p["shares"] and p["count"] > 0),
        "pinned": {"store": "wearer-pinned", "pattern": pinned} if pinned else None,
        "setting": block(lambda b: b["spread"] and not b["collapsed"] and not b["trial"]),
        "setting_trial": block(lambda b: b["trial"]),
        # Optional: these arise only if the engine serves them naturally.
        "uncertain": {"store": "wearer", "pattern": uncertain} if uncertain else None,
        "range_collapsed": block(lambda b: b["collapsed"]),
        "zero_variance": block(lambda b: not b["spread"]),
    }
    required = ("multi_cause", "single_cause", "no_cause", "pinned", "setting", "setting_trial")
    missing = [name for name in required if found[name] is None]
    if missing:
        raise SystemExit(f"the simulated wearer no longer serves: {', '.join(missing)}")
    return found


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
        "state labels §4.2": list(STATE_LABELS),
        "weekdays §4.2": list(WEEKDAYS),
        "chart mark fields": [field for field in MARK_FIELDS
                              if all(field in slot for store in stores
                                     for slot in store["analyze"]["basal"])],
    }
    # The metric row is one cell listing every metric, comma-separated; the
    # answer and result rows are slash-separated. Words are what is checked.
    words = sorted({word.lower() for cells in sources.values()
                    for cell in cells for word in WORD.findall(cell)})
    return {
        "_generated_by": GENERATED_BY,
        "_note": ("Every word a component story may display: the redesign "
                  "glossary, its tab names, the engine titles, nouns and units "
                  "served in ui-fixtures.json, the window unit, the \"of\" "
                  "of a magnitude, the served fields the evidence chart's "
                  "marks plot, the glucose profile's \"No data\" and the day "
                  "tile's weekdays."),
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
