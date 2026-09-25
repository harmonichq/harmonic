"""#469 spike: the served queue follows the one urgency ranking.

Synthetic data only. Run from the repository root, after #467's spike rule:

    uv run python docs/scope/469-queue-rank.spike.py            # fixture windows
    uv run python docs/scope/469-queue-rank.spike.py --qa       # every QA case
    uv run python docs/scope/469-queue-rank.spike.py --json OUT # spiked fixture windows

ADR 469's server rules, applied after ``FindingsProjection.project`` by one
post-processing pass (tiers only ever relabel priced rows, so every served
headline is unchanged):

1. A Pattern admitted through ``setting_staging`` is anchored to the first
   served, priced, asserting row of its setting's parameter in queue order. It
   sorts directly after that row, and its own claimed causes directly after it.
2. Among unpriced ranked-head rows, asserting rows sort before findings.
3. Tiers are bands of the one ranking: the leading run of priced asserting
   rows is ``next_in_line``; every later priced row is ``worth_a_look``; an
   anchored Pattern takes its anchor's tier; claimed causes keep today's rule.
4. ``rank_note``: "Ranked with its setting" on an anchored Pattern; "Ranked on
   all N days" on an unanchored, unclaimed, priced Pattern or Cause row in a
   scoped window; otherwise none.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

_spec = importlib.util.spec_from_file_location(
    "spike467", ROOT / "docs" / "scope" / "467-scoped-pattern-membership.spike.py")
spike467 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(spike467)

import ciq_autotune.findings_projection as projection_module  # noqa: E402
from ciq_autotune.window_membership import DAY_MINUTES, WindowQuery  # noqa: E402

_original_project = projection_module.FindingsProjection.project


def _setting_parameter(pattern: dict):
    if pattern.get("admission_route") != "setting_staging":
        return None
    member = next((m for m in pattern.get("members") or () if m["kind"] == "setting"), None)
    return member["subject"].split(":", 1)[1] if member else None


def _base_key(row):
    span = row.get("span") or {}
    return (
        projection_module._REGISTER_RANK[row["register"]],
        0 if row["priority"] is not None else (1 if row["register"] == "assert" else 2),
        -(row["priority"] or 0),
        -(row["episodes"] or 0),
        span.get("start_min", DAY_MINUTES),
        row["title"] or "",
    )


def _sort_key(row, by_id):
    parent = row.get("anchored_by") or row.get("claimed_by")
    if parent and parent in by_id:
        return _sort_key(by_id[parent], by_id) + (1, *_base_key(row))
    return _base_key(row) + (0,)


def project(self, query, selected_id=None, *, analysis_generation="standalone:0"):
    body = _original_project(self, query, selected_id,
                             analysis_generation=analysis_generation)
    rows = body["rows"]
    by_id = {row["id"]: row for row in rows}
    for row in rows:
        row["anchored_by"] = None
    for row in rows:
        parameter = row["kind"] == "pattern" and _setting_parameter(row["pattern"])
        if not parameter:
            continue
        candidates = [
            other for other in rows
            if other.get("parameter") == parameter and other["register"] == "assert"
            and other["priority"] is not None
        ]
        if candidates:
            row["anchored_by"] = min(candidates, key=lambda r: _sort_key(r, by_id))["id"]
    rows.sort(key=lambda r: _sort_key(r, by_id))
    leading = True
    for row in rows:
        if row["priority"] is None:
            row["tier"] = "noted"
        elif row.get("claimed_by") or row.get("anchored_by"):
            continue
        elif leading and row["register"] == "assert":
            row["tier"] = "next_in_line"
        else:
            leading = False
            row["tier"] = "worth_a_look"
    for row in rows:
        if row.get("anchored_by") and row["priority"] is not None:
            row["tier"] = by_id[row["anchored_by"]]["tier"]
    days = self._analysis.get("window_days")
    for row in rows:
        row["rank_note"] = None
        if row.get("anchored_by"):
            row["rank_note"] = "Ranked with its setting"
        elif (query.scoped and row["priority"] is not None and not row.get("claimed_by")
              and row["kind"] in ("pattern", "habit")):
            row["rank_note"] = f"Ranked on all {days} days"
    return body


def install():
    spike467.install()
    projection_module.FindingsProjection.project = project


def _print(label, body):
    print(label)
    for row in body["rows"]:
        if row["register"] in ("held", "blind", "history"):
            continue
        count = " · ".join(s["sentence"] for s in row["count_sentences"] or ())
        parts = [f"  {row['id']:<36}", f"priority {row['priority']}", f"tier {row['tier']}"]
        if row.get("anchored_by"):
            parts.append(f"anchored_by {row['anchored_by']}")
        if row.get("claimed_by"):
            parts.append(f"claimed_by {row['claimed_by']}")
        if row.get("rank_note"):
            parts.append(f"note {row['rank_note']!r}")
        if count:
            parts.append(f"[{count}]")
        print("  ".join(parts))


def fixture_windows():
    from gen_findings_projection_fixtures import (
        WINDOWS, analysis, direction_only_isf_rows, exposures, projection, scenarios,
    )
    prepared = projection()
    windows = {name: prepared.project(
        WindowQuery.whole_day() if bounds is None else WindowQuery.clock(*bounds),
        analysis_generation="spike:0") for name, bounds in WINDOWS.items()}
    windows["drawn"] = prepared.project(WindowQuery.clock(720, 900),
                                        analysis_generation="spike:0")
    direction_only = projection_module.prepare_findings_projection(
        analysis=analysis(isf=direction_only_isf_rows()),
        exposures=exposures(), scenarios=scenarios(),
    ).project(WindowQuery.whole_day(), analysis_generation="spike:0")
    return windows, direction_only


if __name__ == "__main__":
    install()
    if "--qa" in sys.argv:
        spike467.qa_cases()
    else:
        windows, direction_only = fixture_windows()
        if "--json" in sys.argv:
            out = Path(sys.argv[sys.argv.index("--json") + 1])
            out.write_text(json.dumps({"windows": windows,
                                       "direction_only_global": direction_only}))
            print(f"wrote {out}")
        else:
            for name in ("global", "afternoon", "drawn", "low_block", "overnight"):
                _print(f"windows.{name}", windows[name])
            _print("direction_only_windows.global", direction_only)
