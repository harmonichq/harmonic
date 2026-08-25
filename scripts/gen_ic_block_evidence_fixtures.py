#!/usr/bin/env python3
"""Generate synthetic current I:C meal-run evidence (#145)."""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
from datetime import datetime, timedelta

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ciq_autotune.analyzers.ic import IcConfig, analyze_ic_blocks  # noqa: E402
from ciq_autotune.events import BolusEvent, CgmReading  # noqa: E402
from ciq_autotune.ic_block_evidence import prepare_ic_block_evidence  # noqa: E402

OUT = ROOT / "mockups" / "diagnose-workstation.synthetic" / "ic-block-evidence.capture.json"
BASE = datetime(2026, 1, 1)


class _Store:
    def __init__(self, readings):
        self.readings = readings

    def cgm_readings(self, start=None, end=None):
        return [row for row in self.readings
                if (start is None or row.t >= start) and (end is None or row.t <= end)]


def _meal(day, hour, *, carbs=60.0, insulin=12.0, bg=110.0):
    return BolusEvent(t=BASE + timedelta(days=day, hours=hour), insulin=insulin,
                      carbs=carbs, carb_ratio=5.0, bg=bg, completion="Completed")


def _project(events, *, cgm=None):
    blocks, _ = analyze_ic_blocks(events, [(0, 5.0)], config=IcConfig(), observed_days=90,
                                  cgm_readings=cgm, isf_effective=50.0)
    block = blocks[0].to_dict()
    readings = cgm or [
        CgmReading(datetime.fromisoformat(run["t"]) + timedelta(minutes=minute),
                   100 + minute, "synthetic")
        for run in block["evidence"]["runs"] for minute in (-10, 0, 120, 435)
    ]
    return prepare_ic_block_evidence(_Store(readings), {"ic_blocks": [block]}).project(
        block["block_id"], analysis_generation="ic-block-evidence-fixture:0",
    )


def payload():
    cross_midnight = _project([
        item for day in range(9) for item in (_meal(day, 23), _meal(day + 1, 1))
    ])
    events = [_meal(day, 9) for day in range(1, 9)] + [_meal(9, 9, carbs=20, insulin=4,
                                                              bg=300)]
    cgm = [
        CgmReading(event.t + timedelta(minutes=minute),
                   40 if event.insulin == 4 else 110, "synthetic")
        for event in events for minute in (290, 295, 300, 305, 310)
    ]
    directional = _project(events, cgm=cgm)
    below_floor = _project([_meal(day, 9) for day in range(4)])
    return {
        "_generated_by": "scripts/gen_ic_block_evidence_fixtures.py",
        "_note": ("SYNTHETIC. Current I:C blocks and run rosters are real analyzer "
                  "output; CGM curves are deterministic invented evidence."),
        "cases": {"cross_midnight": cross_midnight, "directional_only": directional,
                  "below_floor": below_floor},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(payload(), indent=1, sort_keys=True) + "\n"
    if args.check:
        if (OUT.read_text() if OUT.exists() else "") != rendered:
            print(f"stale fixture: {OUT} — rerun scripts/gen_ic_block_evidence_fixtures.py")
            return 1
        print(f"I:C block-evidence fixture current ({OUT})")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(rendered)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
