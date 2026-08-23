#!/usr/bin/env python3
"""Generate exact synthetic event evidence for retired I:C history.

The catalog comes from the real I:C analyzer used by the findings fixture.  CGM is
an invented deterministic curve spanning each analyzer-published run bound.  This
script is the only writer of the committed capture.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import pathlib
import sys
from datetime import datetime, timedelta

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ciq_autotune.events import CgmReading  # noqa: E402
from ciq_autotune.findings_projection import FindingsProjection  # noqa: E402
from ciq_autotune.ic_history_events import prepare_ic_history_events  # noqa: E402

OUT = ROOT / "mockups" / "diagnose-workstation.synthetic" / "ic-history-events.capture.json"

_FINDINGS_GENERATOR = ROOT / "scripts" / "gen_findings_projection_fixtures.py"
_spec = importlib.util.spec_from_file_location("findings_fixture_generator", _FINDINGS_GENERATOR)
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)
GENERATION = gen.ANALYSIS_GENERATION


class _SyntheticStore:
    def __init__(self, readings):
        self._readings = readings

    def cgm_readings(self, start=None, end=None):
        return [row for row in self._readings
                if (start is None or row.t >= start) and (end is None or row.t <= end)]


def _readings(catalog):
    rows = {}
    for history in catalog:
        for run in history.runs:
            meal = datetime.fromisoformat(run.first_member_at)
            minute = int(run.cgm_start_min)
            while minute <= int(run.cgm_end_min):
                at = meal + timedelta(minutes=minute)
                # Invented repeatable response: a gradual meal rise and return.
                rise = max(0, 95 - abs(minute - 105))
                bg = 102 + round(rise * 0.62) + (minute // 5) % 3
                rows[at] = CgmReading(at, bg, "synthetic")
                minute += 5
    return [rows[at] for at in sorted(rows)]


def payload():
    catalog, _aged, _unavailable = gen.history_catalogs()
    analysis = {"window_days": 30, "ic_history": [row.to_dict() for row in catalog]}
    findings = FindingsProjection(
        analysis, {"exposures": {}}, {"patterns": [], "low_confidence": []})
    readings = _readings(catalog)
    prepared = prepare_ic_history_events(_SyntheticStore(readings), findings)
    history_id = catalog[0].history_id
    selected_run_id = catalog[0].runs[0].run_id
    return {
        "_generated_by": "scripts/gen_ic_history_event_fixtures.py",
        "_note": ("SYNTHETIC. Catalog membership is real analyzer output and the "
                  "CGM curve is deterministic invented evidence. Regenerate with "
                  "`python3 scripts/gen_ic_history_event_fixtures.py`."),
        "inputs": {
            "catalog": analysis["ic_history"],
            "readings": [
                {"t": row.t.isoformat(), "bg": row.bg, "type": row.type}
                for row in readings
            ],
            "analysis_generation": GENERATION,
        },
        "cases": {
            "all_runs": prepared.project(
                history_id, analysis_generation=GENERATION),
            "selected_run": prepared.project(
                history_id, selected_run_id, analysis_generation=GENERATION),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(payload(), indent=1, sort_keys=True) + "\n"
    if args.check:
        current = OUT.read_text() if OUT.exists() else ""
        if current != rendered:
            print(f"stale fixture: {OUT} — rerun scripts/gen_ic_history_event_fixtures.py")
            return 1
        print(f"I:C history-event fixture current ({OUT})")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(rendered)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
