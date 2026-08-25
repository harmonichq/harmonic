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


def _preparation():
    peak = datetime(2026, 1, 3, 12)
    short_rise = Opportunity(Exposure.HIGHS, ("short-rise",), peak, "high", 260,
                             reach_start=peak - timedelta(minutes=15))
    long_peak = peak + timedelta(days=1)
    long_rise = Opportunity(Exposure.HIGHS, ("long-rise",), long_peak, "high", 275,
                            reach_start=long_peak - timedelta(minutes=120))
    outranked_peak = peak + timedelta(days=2)
    outranked = Opportunity(Exposure.HIGHS, ("outranked",), outranked_peak,
                             "high", 250,
                             reach_start=outranked_peak - timedelta(minutes=75))
    members = (Member(short_rise, short_rise.anchor_t, "fired"),
               Member(long_rise, long_rise.anchor_t, "fired"),
               Member(outranked, outranked.anchor_t, "outranked"))
    announced = BolusEvent(peak - timedelta(hours=2), insulin=4, carbs=40,
                           completion="Completed", seq_num=10)
    cancelled = BolusEvent(peak - timedelta(hours=3), insulin=4, carbs=40,
                           completion="Cancelled", seq_num=11)
    zero_insulin = BolusEvent(peak - timedelta(hours=4), insulin=0, carbs=40,
                              completion="Completed", seq_num=12)
    cgm = []
    for opportunity in (short_rise, long_rise, outranked):
        onset = opportunity.reach_start
        cgm.extend((
            CgmReading(onset - timedelta(minutes=60), 105, "synthetic"),
            CgmReading(onset, 110, "synthetic"),
            CgmReading(opportunity.anchor_t, opportunity.anchor_bg, "synthetic"),
            CgmReading(onset + timedelta(minutes=300), 145, "synthetic"),
        ))
    cgm.extend(CgmReading(announced.t + timedelta(minutes=minute), 115 + minute / 10,
                          "synthetic") for minute in (-60, 0, 300))
    findings = {"rows": [{"id": "finding:missed_meal", "episodes": 2}]}
    claimed = frozenset(member.id for member in members[:2])
    return PreparedCases(
        "fp_" + "1" * 32, 178, WindowQuery.whole_day(), findings,
        {Lever.MISSED_MEAL: (2, 3)},
        {lever: members if lever is Lever.MISSED_MEAL else () for lever in Lever},
        {lever: claimed if lever is Lever.MISSED_MEAL else frozenset()
         for lever in Lever},
        {lever: () for lever in Lever}, frozenset(),
        tuple(sorted(cgm, key=lambda row: row.t)), (),
        (announced, cancelled, zero_insulin),
        (CarbEntry(short_rise.reach_start + timedelta(minutes=10),
                   15, "exact", "manual"),),
        time.monotonic() + 60,
    )


def payload():
    prepared = _preparation()
    members = prepared.members[Lever.MISSED_MEAL]
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
