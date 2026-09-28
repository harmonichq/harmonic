"""Reproduce #470: a same-meal top-up carb bolus counts as a second meal.

Synthetic only. Builds fresh temp stores through the real producers and prints what
the meal counters serve for one meal a day, bolused as a first carb bolus plus a
top-up carb bolus at a gap. Run:

    uv run python docs/scope/470-meal-identity.repro.py

Every value below is manufactured here; nothing reads a real store.
"""

from __future__ import annotations

import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ciq_autotune.analyzers.scenario import build_scenarios  # noqa: E402
from ciq_autotune.analyzers.scenario.opportunities import build_opportunities  # noqa: E402
from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns  # noqa: E402
from ciq_autotune.event_comparison import completed_carb_boluses  # noqa: E402
from ciq_autotune.explore_exposures import build_exposures  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402
from scripts.qa_e2e_cases import _materialize_behavioral_background  # noqa: E402

FMT = "%Y-%m-%d %H:%M:%S"
DAYS = 14
LANE = datetime(2024, 5, 3)


def bolus(seq, t, insulin, carbs):
    return {"seq_num": seq, "request_time": t.strftime(FMT),
            "description": "Synthetic meal bolus", "completion": "Completed",
            "insulin": insulin, "requested_insulin": insulin, "carbs": carbs,
            "carb_ratio": 10.0, "isf": 40.0, "target_bg": 110.0}


def trace(store, noon, peak):
    """Flat 110, a 2 mg/dL/min climb from the bolus to ``peak``, then a fall."""
    rows, bg, t, climbing = [], 110.0, noon - timedelta(minutes=30), True
    while t <= noon + timedelta(hours=5):
        if t > noon:
            bg = min(peak, bg + 10.0) if climbing else max(110.0, bg - 5.0)
            if bg >= peak:
                climbing = False
        rows.append({"EventDateTime": t.strftime(FMT), "Readings (CGM / BGM)": bg,
                     "Description": "Synthetic EGV"})
        t += timedelta(minutes=5)
    store.upsert_cgm(rows)


def build(store, gap, peak=360.0, one_dose=False):
    _materialize_behavioral_background(store, span_days=30)
    for day in range(DAYS):
        noon = LANE + timedelta(days=day, hours=12)
        trace(store, noon, peak)
        if one_dose:
            store.upsert_bolus([bolus(200_000 + day, noon, 6.5, 65.0)])
            continue
        rows = [bolus(200_000 + day, noon, 4.5, 45.0)]
        if gap is not None:
            rows.append(bolus(300_000 + day, noon + timedelta(minutes=gap), 2.0, 20.0))
        store.upsert_bolus(rows)


def run(label, **shape):
    database = tempfile.NamedTemporaryFile(suffix=".sqlite")
    with Store.open(database.name) as store:
        build(store, **shape)
        bolus_events = store.bolus_events()
        opportunities = build_opportunities(
            bolus_events, store.cgm_readings(), store.basal_events())
        exposures = build_exposures(store)
        scenarios = build_scenarios(store).to_dict()
        patterns = {p["key"]: p for p in build_outcome_patterns({}, exposures, scenarios)}
        meals = exposures["exposures"]["meals"]
        cu = next((p for p in scenarios["patterns"] + scenarios["low_confidence"]
                   if p["lever"] == "carb_undercount"), None)
        first = sorted(meals["occurrences"], key=lambda o: o["t"])[:2]
        highs = patterns["highs_after_meals"]
        print(f"{label}")
        print(f"  meal opportunities {len(opportunities[next(iter(opportunities))])}, "
              f"completed carb boluses {len(completed_carb_boluses(bolus_events))}, "
              f"meals family n {meals['n']}")
        print(f"  Highs after meals {highs['k']} of {highs['n']}; carb undercount recurrence "
              f"{cu['confidence']['k'] if cu else 0} of {cu['confidence']['n'] if cu else '-'}")
        for occ in first:
            print(f"    occurrence {occ['t']} carbs {occ['carbs']} insulin {occ['insulin']} "
                  f"levers {occ['attributed_levers']}")
    database.close()


def case_file(label, **shape):
    """The Highs after meals case file through ``finding_case_file.prepare``."""
    from ciq_autotune import finding_case_file
    from ciq_autotune.analyze import analyze
    from ciq_autotune.window_membership import WindowQuery

    database = tempfile.NamedTemporaryFile(suffix=".sqlite")
    with Store.open(database.name) as store:
        build(store, **shape)
        prepared = finding_case_file.prepare(
            store, query=WindowQuery.whole_day(), version=0,
            analysis=analyze(store, pool_agreeing_basal_regimes=True,
                             carb_entries=store.carb_entries(),
                             prompt_responses=store.prompt_responses()).to_dict(),
            exposures=build_exposures(store), scenarios=build_scenarios(store).to_dict(),
        )
        case = prepared.case("pattern:highs_after_meals", "event", None)
    database.close()
    print(f"{label}: case file {case['summary']}, {len(case['occurrences'])} rows")
    for row in sorted(case["occurrences"], key=lambda r: r["anchor"]["t"])[:2]:
        print(f"    {row['anchor']['t']} {row['verdict']} {row['member']} "
              f"carbs {row['anchor']['carbs']} outcome {row['outcome']}")


def qa_scan():
    """Every committed QA case: carb boluses at or over the meal floor that sit within
    the 30-minute grace of an earlier one — the pairs ADR 470 merges into one meal."""
    from scripts.qa_e2e_cases import QA_CASES, materialize_case

    moved = 0
    for case in QA_CASES:
        database = tempfile.NamedTemporaryFile(suffix=".sqlite")
        with Store.open(database.name) as store:
            materialize_case(store, case)
            meals = sorted((b for b in store.bolus_events()
                            if b.carbs is not None and b.carbs >= 10.0),
                           key=lambda b: (b.t, b.seq_num or 0))
        database.close()
        pairs = [(a.t.strftime(FMT), b.t.strftime(FMT)) for a, b in zip(meals, meals[1:])
                 if b.t - a.t <= timedelta(minutes=30)]
        if pairs:
            moved += 1
            print(f"  {case.name}: {pairs}")
    print(f"QA cases: {len(QA_CASES)}; cases holding a same-meal pair: {moved}")


def main():
    if "--qa" in sys.argv:
        qa_scan()
        return
    for gap in (None, 5, 10, 20, 30, 35):
        run(f"top-up at {'none' if gap is None else f'+{gap} min'}", gap=gap)
    run("top-up at +10 min, peak 210", gap=10, peak=210.0)
    run("one 65 g / 6.5 U dose, peak 210", gap=None, peak=210.0, one_dose=True)
    case_file("top-up at +10 min", gap=10)


if __name__ == "__main__":
    main()
