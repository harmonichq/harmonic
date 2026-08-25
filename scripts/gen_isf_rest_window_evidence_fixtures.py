#!/usr/bin/env python3
"""Generate the synthetic ISF rest-window evidence capture."""

import argparse
import json
import pathlib
import sys
import tempfile
from datetime import datetime, timedelta

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ciq_autotune.analyze import analyze  # noqa: E402
from ciq_autotune.isf_rest_window_evidence import prepare_isf_rest_window_evidence  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402

OUT = ROOT / "mockups" / "diagnose-workstation.synthetic" / "isf-rest-window-evidence.capture.json"


def payload():
    with tempfile.NamedTemporaryFile(suffix=".db") as db:
        cgm, basal = [], []
        for night in range(2):
            start = datetime(2026, 6, 1 + night, 22)
            for point in range(121):
                at = start + timedelta(minutes=5 * point)
                cgm.append({"EventDateTime": at.isoformat(), "Readings (CGM / BGM)": 110,
                            "Description": "EGV"})
                basal.append({"seq_num": int(at.strftime("%Y%m%d%H%M%S")),
                              "time": at.strftime("%Y-%m-%d %H:%M:%S"),
                              "delivery_type": "algorithmDelivery", "duration_mins": 5,
                              "basal_rate": .8, "profile_basal_rate": .8})
        with Store.open(db.name) as store:
            store.upsert_cgm(cgm)
            store.upsert_basal(basal)
        captured = []
        with Store.open_queryonly(db.name) as store:
            analysis = analyze(store, pool_agreeing_basal_regimes=True,
                               carb_entries=store.carb_entries(),
                               prompt_responses=store.prompt_responses(),
                               isf_fasting_evidence_sink=captured.append).to_dict()
        analysis["_isf_rest_window_steps"] = [
            {"insulin_acted": round(step.insulin_acted, 4), "dbg": round(step.dbg, 2),
             "window_id": f"rest:{step.cluster.isoformat()}"}
            for step in captured[0].steps
        ]
        prepared = prepare_isf_rest_window_evidence(analysis)
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
