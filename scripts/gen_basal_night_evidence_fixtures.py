#!/usr/bin/env python3
"""Generate the synthetic basal-night evidence API fixture (#143).

    python3 scripts/gen_basal_night_evidence_fixtures.py
    python3 scripts/gen_basal_night_evidence_fixtures.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import tempfile
from datetime import datetime, timedelta

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from ciq_autotune.api import create_app  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402

OUT = (pathlib.Path(__file__).resolve().parents[1]
       / "frontend" / "__fixtures__" / "basal-night-evidence.json")


def fixture() -> dict:
    """Run the public endpoint over eight invented nights, one excluded by IOB."""
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
        basal, cgm, bolus = [], [], []
        for day in range(1, 9):
            start = datetime(2026, 1, day)
            for minute in range(30):
                t = start + timedelta(minutes=minute)
                basal.append({"seq_num": day * 100 + minute, "time": t.isoformat(" "),
                              "delivery_type": "algorithmDelivery", "duration_mins": 1,
                              "basal_rate": 0.6 if day == 7 else 0.8,
                              "profile_basal_rate": 0.6})
            for minute in range(-60, 31, 5):
                if day == 7 and minute >= 0:
                    continue
                t = start + timedelta(minutes=minute)
                cgm.append({"EventDateTime": t.isoformat(),
                            "Readings (CGM / BGM)": 110 + day,
                            "Description": "EGV"})
            if day == 8:
                bolus.append({"seq_num": 1000, "request_time": start.isoformat(" "),
                              "description": "Bolus", "insulin": 1.0})
        with Store.open(database.name) as store:
            store.upsert_basal(basal)
            store.upsert_cgm(cgm)
            store.upsert_bolus(bolus)
        response = TestClient(create_app(
            db_path=database.name, token=None, enable_fetch_loop=False,
            analysis_incarnation="basal-night-evidence-fixture",
        )).get("/api/diagnose/basal-night-evidence", params={"slot": 0})
        response.raise_for_status()
        return {
            "_generated_by": "scripts/gen_basal_night_evidence_fixtures.py",
            "_note": "Synthetic basal and CGM rows only; generated through the public API.",
            "input": {"basal": basal, "cgm": cgm, "bolus": bolus},
            "expected": response.json(),
        }


# ADR 466: the steady nights either side of a programmed 0.60 (fourteen at 0.45,
# two at 0.54, fourteen at 0.66), and the served status each slot must reach.
SPREAD = [0.45] * 14 + [0.54] * 2 + [0.66] * 14
RECURRING_LOWS_STATUSES = {
    "01:00": "insufficient evidence",
    "03:00": "lower (recurring lows)",
    "05:00": "held (recurring-low gate)",
}


def recurring_lows() -> dict:
    """Serve the basal rows a recurring-lows lower, its unlowed twin and a
    within-threshold hold read (ADR 465, ADR 466), through /api/analyze.

    01:00 and 03:00 deliver the spread nights; 05:00 delivers 0.59. Lows print at
    03:00 and 05:00 on the last two nights.
    """
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
        basal, cgm = [], []
        for day, rate in enumerate(SPREAD):
            start = datetime(2026, 1, 1) + timedelta(days=day)
            for hour, delivered in ((1, rate), (3, rate), (5, 0.59)):
                basal.append({"seq_num": (day + 1) * 10 + hour,
                              "time": (start + timedelta(hours=hour)).isoformat(" "),
                              "delivery_type": "algorithmDelivery", "duration_mins": 30,
                              "basal_rate": delivered, "profile_basal_rate": 0.6})
        for day in range(len(SPREAD)):
            start = datetime(2026, 1, 1) + timedelta(days=day)
            low_night = day >= len(SPREAD) - 2
            # CGM covers each slot's own hour, from half an hour before it.
            for minute in (m for hour in (1, 3, 5) for m in range(hour * 60 - 30, hour * 60 + 31, 5)):
                low = low_night and minute in (180, 185, 190, 300, 305, 310)
                cgm.append({"EventDateTime": (start + timedelta(minutes=minute)).isoformat(),
                            "Readings (CGM / BGM)": 50 if low else 120,
                            "Description": "EGV"})
        with Store.open(database.name) as store:
            store.upsert_basal(basal)
            store.upsert_cgm(cgm)
        response = TestClient(create_app(
            db_path=database.name, token=None, enable_fetch_loop=False,
            analysis_incarnation="basal-night-evidence-fixture",
        )).get("/api/analyze")
        response.raise_for_status()
        rows = {row["label"]: row for row in response.json()["basal"]
                if row["label"] in RECURRING_LOWS_STATUSES}
        for label, status in RECURRING_LOWS_STATUSES.items():
            if rows[label]["safety_status"] != status:
                raise SystemExit(f"{label} serves {rows[label]['safety_status']!r}, not {status!r}")
        return {"input": {"basal": basal, "cgm": cgm},
                "analyze_basal": [rows[label] for label in RECURRING_LOWS_STATUSES]}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps({**fixture(), "recurring_lows": recurring_lows()},
                          indent=2, sort_keys=True) + "\n"
    if args.check:
        if not OUT.exists() or OUT.read_text() != rendered:
            print(f"{OUT.relative_to(OUT.parents[2])} is stale; rerun {pathlib.Path(__file__).name}")
            return 1
        return 0
    OUT.write_text(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
