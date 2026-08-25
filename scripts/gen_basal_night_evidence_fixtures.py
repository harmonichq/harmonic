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
                cgm.append({"EventDateTime": t.isoformat(),
                            "Readings (CGM / BGM)": 120, "Description": "EGV"})
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(fixture(), indent=2, sort_keys=True) + "\n"
    if args.check:
        if not OUT.exists() or OUT.read_text() != rendered:
            print(f"{OUT.relative_to(OUT.parents[2])} is stale; rerun {pathlib.Path(__file__).name}")
            return 1
        return 0
    OUT.write_text(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
