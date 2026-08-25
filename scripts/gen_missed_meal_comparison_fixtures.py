#!/usr/bin/env python3
"""Generate the synthetic missed-vs-announced meal comparison fixture (#178)."""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
from datetime import datetime, timedelta

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ciq_autotune.analyzers.scenario.levers import Exposure, Lever  # noqa: E402
from ciq_autotune.analyzers.scenario.opportunities import Opportunity  # noqa: E402
from ciq_autotune.events import BolusEvent, CarbEntry, CgmReading  # noqa: E402
from ciq_autotune.finding_case_file import Member, PreparedCases  # noqa: E402
from ciq_autotune.window_membership import WindowQuery  # noqa: E402

OUT = ROOT / "frontend" / "__fixtures__" / "missed-meal-comparison.json"


def payload():
    peak = datetime(2026, 1, 3, 12)
    fired = Opportunity(Exposure.HIGHS, ("fired",), peak, "high", 260,
                         reach_start=peak - timedelta(minutes=45))
    outranked = Opportunity(Exposure.HIGHS, ("outranked",), peak + timedelta(hours=4),
                             "high", 250, reach_start=peak + timedelta(hours=2, minutes=45))
    members = (Member(fired, fired.anchor_t, "fired"),
               Member(outranked, outranked.anchor_t, "outranked"))
    announced = BolusEvent(peak - timedelta(hours=2), insulin=4, carbs=40,
                           completion="Completed", seq_num=10)
    cancelled = BolusEvent(peak - timedelta(hours=3), insulin=4, carbs=40,
                           completion="Cancelled", seq_num=11)
    zero_insulin = BolusEvent(peak - timedelta(hours=4), insulin=0, carbs=40,
                              completion="Completed", seq_num=12)
    cgm = tuple(CgmReading(anchor + timedelta(minutes=minute), 110 + minute / 10, "synthetic")
                for anchor in (fired.reach_start, outranked.reach_start, announced.t)
                for minute in (-60, 0, 300))
    findings = {"rows": [{"id": "finding:missed_meal", "episodes": 1}]}
    prepared = PreparedCases(
        "fp_" + "1" * 32, 178, WindowQuery.whole_day(), findings,
        {Lever.MISSED_MEAL: (1, 2)},
        {lever: members if lever is Lever.MISSED_MEAL else () for lever in Lever},
        {lever: frozenset({members[0].id}) if lever is Lever.MISSED_MEAL else frozenset()
         for lever in Lever},
        {lever: () for lever in Lever}, frozenset(), cgm, (),
        (announced, cancelled, zero_insulin),
        (CarbEntry(fired.reach_start + timedelta(minutes=10), 15, "exact", "manual"),),
        time.monotonic() + 60,
    )
    case = prepared.case("finding:missed_meal", "event", None)
    announced_id = case["projection"]["cohorts"][1]["occurrence_ids"][0]
    return {
        "_generated_by": "scripts/gen_missed_meal_comparison_fixtures.py",
        "_note": "SYNTHETIC. Fixed invented Highs and boluses; no personal data.",
        "payload": case,
        "selected_missed": prepared.case("finding:missed_meal", "event", members[0].id),
        "selected_announced": prepared.case("finding:missed_meal", "event", announced_id),
        "clock_after_announced": prepared.case(
            "finding:missed_meal", "clock", announced_id,
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(payload(), indent=1, sort_keys=True) + "\n"
    if args.check:
        if (OUT.read_text() if OUT.exists() else "") != rendered:
            print(f"stale fixture: {OUT} — rerun scripts/gen_missed_meal_comparison_fixtures.py")
            return 1
        print(f"missed-meal comparison fixture current ({OUT})")
        return 0
    OUT.write_text(rendered)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
