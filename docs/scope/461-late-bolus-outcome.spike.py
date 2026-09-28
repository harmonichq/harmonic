"""Spike ADR 461 on the two behavioral QA cases it moves (synthetic only).

Wraps the real Late bolus classifier with ADR 461's rule — a match stands only when
the meal's Arc peak (the highest reading in (bolus, bolus + 3 h], cut at the next
meal's first bolus under ADR 470's grace) is above 180 — and reads each case's
served verdict tallies four ways: today, today with the reshaped traces task 86
writes, under the rule, and under the rule with those traces. The wrapper returns
``no_trigger`` as a stand-in for the new calm ``stayed_in_range``; both are calm,
so tallies agree.

    uv run python docs/scope/461-late-bolus-outcome.spike.py
"""

from __future__ import annotations

import sys
import tempfile
from dataclasses import replace
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ciq_autotune import event_comparison  # noqa: E402
from ciq_autotune.analyzers import classifiers  # noqa: E402
from ciq_autotune.analyzers.classifiers import late_bolus  # noqa: E402
from ciq_autotune.analyzers.classifiers.evidence import SilenceReason  # noqa: E402
from ciq_autotune.analyzers.scenario import attribute  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402
from scripts.qa_e2e_cases import QA_CASES, execute_case, materialize_case  # noqa: E402

FMT = "%Y-%m-%d %H:%M:%S"
ORIGINAL = late_bolus.classify_late_bolus
# The reshaped late rise: the same pre-bolus climb, a post-bolus peak of 195 —
# above the range line, below Carb undercount's 200 runaway bar.
RISE_195 = (100, 110, 120, 130, 140, 150, 165, 180, 195, 190, 175, 160, 140)
# Today's late rise, whose post-bolus peak is exactly 180: the in-range band.
RISE_180 = (100, 110, 120, 130, 140, 150, 160, 170, 180, 175, 165, 150, 135)


def next_meal_start(meal_t, bolus):
    starts = []
    for b in sorted((b for b in bolus if b.carbs is not None and b.carbs >= 10.0),
                    key=lambda b: (b.t, b.seq_num or 0)):
        if not starts or b.t > starts[-1] + timedelta(minutes=30):
            starts.append(b.t)
    return next((t for t in starts if t > meal_t), None)


def ruled(meal, cgm_readings, basal_events=(), bolus_events=(), **kwargs):
    verdict = ORIGINAL(meal, cgm_readings, basal_events, bolus_events, **kwargs)
    if not verdict.matched:
        return verdict
    end = meal.t + timedelta(minutes=180)
    following = next_meal_start(meal.t, bolus_events)
    if following is not None and following < end:
        end = following
    peak = max((r.bg for r in cgm_readings if r.bg is not None and meal.t < r.t <= end),
               default=None)
    if peak is not None and peak > 180:
        return verdict
    return replace(verdict, matched=False, silence_reason=SilenceReason.NO_TRIGGER,
                   detail="stayed in range (spike stand-in)")


def apply_rule(on):
    fn = ruled if on else ORIGINAL
    for module in (late_bolus, classifiers, attribute, event_comparison):
        module.classify_late_bolus = fn


def overwrite(store, day, values, *, bolus=None):
    start = datetime(2024, 5, 1) + timedelta(days=day, hours=11, minutes=40)
    store.upsert_cgm([{"EventDateTime": (start + timedelta(minutes=5 * i)).strftime(FMT),
                       "Readings (CGM / BGM)": v, "Description": "Synthetic EGV"}
                      for i, v in enumerate(values)])
    if bolus is not None:
        store.upsert_bolus([{**bolus, "request_time": (start + timedelta(minutes=25)).strftime(FMT)}])


def reshape(store, name):
    if name == "behavioral-late-bolus":
        overwrite(store, 23, RISE_195)
        overwrite(store, 24, RISE_195)
        overwrite(store, 22, RISE_180, bolus={
            "seq_num": 110_022, "description": "Synthetic meal bolus", "completion": "Completed",
            "insulin": 9.0, "requested_insulin": 9.0, "carbs": 45.0, "carb_ratio": 5.0,
            "isf": 40.0, "target_bg": 110.0})
    else:
        overwrite(store, 25, RISE_195)


def tallies(name, *, rule, reshaped):
    apply_rule(rule)
    case = next(c for c in QA_CASES if c.name == name)
    database = tempfile.NamedTemporaryFile(suffix=".sqlite")
    with Store.open(database.name) as store:
        materialize_case(store, case)
        if reshaped:
            reshape(store, name)
        execution = execute_case(store, case)
    database.close()
    rows = {r["id"]: r for r in execution.findings["whole_day"]["rows"]}
    out = {}
    for lever in ("late_bolus", "carb_undercount"):
        row = rows.get(f"finding:{lever}")
        counts = (row or {}).get("verdict_counts_by_family", {}).get("meals")
        out[lever] = (" / ".join(str(counts[k]) for k in
                                 ("fired", "outranked", "near_miss", "no_data", "clean"))
                      if counts else "no row")
    highs = next(p for p in execution.outcome_patterns if p["key"] == "highs_after_meals")
    out["highs_after_meals"] = f"{highs['k']} of {highs['n']}"
    return out


def main():
    for name in ("behavioral-late-bolus", "behavioral-carb-undercount"):
        print(name)
        for label, rule, reshaped in (("today", False, False),
                                      ("today, reshaped traces", False, True),
                                      ("rule, today's traces", True, False),
                                      ("rule, reshaped traces", True, True)):
            print(f"  {label}: {tallies(name, rule=rule, reshaped=reshaped)}")
    apply_rule(False)


if __name__ == "__main__":
    main()
