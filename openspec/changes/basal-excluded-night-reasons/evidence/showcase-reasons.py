#!/usr/bin/env python3
"""Per-slot excluded-night reasons on the synthetic QA showcase, by the spike's rule.

Base-only evidence for #434, like reason-precedence-spike.py beside it: it imports
that spike, which reads today's clean-window internals. It opens the committed
synthetic showcase read-only and analyzes its whole history with the per-slot
basal setting cuts and pooling on. The served 30-day payload stays authoritative.

    uv run python openspec/changes/basal-excluded-night-reasons/evidence/showcase-reasons.py
"""

from __future__ import annotations

import importlib.util
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from ciq_autotune.analyzers.basal import analyze_basal  # noqa: E402
from ciq_autotune.epochs import basal_slot_epochs  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402

_SPEC = importlib.util.spec_from_file_location(
    "reason_precedence_spike", pathlib.Path(__file__).with_name("reason-precedence-spike.py"))
spike = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(spike)


def main() -> int:
    with Store.open_readonly(str(ROOT / "mockups/qa-e2e.synthetic/harmonic.sqlite")) as store:
        basal, cgm = store.basal_events(), store.cgm_readings()
        bolus, pump, carbs = store.bolus_events(), store.pump_events(), store.carb_entries()
    cuts = {s: t for s, t in basal_slot_epochs(basal, 30).items() if t is not None}
    rows = [row.to_dict() for row in analyze_basal(
        basal, cgm, bolus, pump, carb_entries=carbs, slot_starts=cuts,
        pool_agreeing_regimes=True)]
    with_excluded = 0
    for row in rows:
        counts = spike.reasons(basal, cgm, bolus, pump, carbs, cuts, row["slot"], row)
        assert sum(counts.values()) == row["evidence"]["excluded_night_count"], row["label"]
        if row["evidence"]["excluded_night_count"]:
            with_excluded += 1
            print(row["label"], row["evidence"]["excluded_night_count"],
                  " ".join(f"{key}={value}" for key, value in counts.items() if value))
    print(f"{with_excluded} of {len(rows)} slots exclude nights; every slot's reasons sum to its count")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
