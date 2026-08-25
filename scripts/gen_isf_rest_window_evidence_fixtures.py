#!/usr/bin/env python3
"""Generate the synthetic ISF rest-window evidence capture."""

import argparse
import json
import pathlib
import sys
from datetime import datetime, timedelta

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ciq_autotune.events import BasalEvent, CgmReading  # noqa: E402
from ciq_autotune.isf_rest_window_evidence import prepare_isf_rest_window_evidence  # noqa: E402

OUT = ROOT / "mockups" / "diagnose-workstation.synthetic" / "isf-rest-window-evidence.capture.json"


class Store:
    def __init__(self):
        self.cgm, self.basal = [], []
        for night in range(2):
            start = datetime(2026, 6, 1 + night, 22)
            for point in range(121):
                at = start + timedelta(minutes=5 * point)
                self.cgm.append(CgmReading(at, 110, "synthetic"))
                self.basal.append(BasalEvent(at, "algorithmDelivery", 5, .8, .8))
    def latest_cgm_or_basal_timestamp(self): return max(row.t for row in self.cgm)
    def cgm_readings(self, start=None, end=None):
        return [row for row in self.cgm if (start is None or start <= row.t)
                and (end is None or row.t <= end)]
    def basal_events(self, start=None, end=None):
        return [row for row in self.basal if (start is None or start <= row.t)
                and (end is None or row.t <= end)]
    def bolus_events(self, start=None, end=None): return []
    def carb_entries(self, start=None, end=None): return []


def payload():
    prepared = prepare_isf_rest_window_evidence(Store(), {"isf": []}, window_days=30)
    return {"_generated_by": "scripts/gen_isf_rest_window_evidence_fixtures.py",
            "_note": "SYNTHETIC. Generated analyzer-owned rest-window evidence.",
            "payload": prepared.project()}


def main():
    check = argparse.ArgumentParser()
    check.add_argument("--check", action="store_true")
    args = check.parse_args()
    rendered = json.dumps(payload(), indent=1, sort_keys=True) + "\n"
    if args.check:
        if not OUT.exists() or OUT.read_text() != rendered:
            print(f"stale fixture: {OUT} — rerun scripts/gen_isf_rest_window_evidence_fixtures.py")
            return 1
        print(f"ISF rest-window evidence fixture current ({OUT})")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(rendered)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
