"""Reproduce #461: Late bolus claims a meal whose glucose stayed in range.

Synthetic only. Run:

    uv run python docs/scope/461-late-bolus-outcome.repro.py         # items 1-3
    uv run python docs/scope/461-late-bolus-outcome.repro.py --qa    # item 4

1. The committed ``behavioral-late-bolus`` QA case: the Pattern sentence, and each
   claimed meal's Late bolus verdict beside its Post-meal arc peak.
2. A 30-day store of 14 meals that climb to 160 at the bolus, read 165 once and
   fall to 80: what Highs after meals, the Late bolus Finding and its Cause row serve.
3. The control: the same climb with a post-bolus peak of 240.
4. ``--qa``: every committed QA case, listing each meal whose Late bolus verdict
   matched and whose arc peak (truncated at the next separate meal, ADR 470) is at
   or under 180 — the verdicts ADR 461 turns calm.

Every value is manufactured here; nothing reads a real store.
"""

from __future__ import annotations

import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ciq_autotune import outcomes_trend  # noqa: E402
from ciq_autotune.analyzers.scenario import build_scenarios  # noqa: E402
from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns  # noqa: E402
from ciq_autotune.explore_exposures import build_exposures  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402
from scripts.qa_e2e_cases import (  # noqa: E402
    QA_CASES, _materialize_behavioral_background, materialize_case,
)

FMT = "%Y-%m-%d %H:%M:%S"
GRACE = timedelta(minutes=30)
FLOOR_G = 10.0


def meal_starts(bolus):
    """ADR 470's grouping, spiked: the first carb bolus of each meal."""
    starts = []
    for b in sorted((b for b in bolus if b.carbs is not None and b.carbs >= FLOOR_G),
                    key=lambda b: (b.t, b.seq_num or 0)):
        if not starts or b.t > starts[-1].t + GRACE:
            starts.append(b)
    return starts


def claimed(store, lever="late_bolus"):
    exposures = build_exposures(store)
    scenarios = build_scenarios(store).to_dict()
    patterns = {p["key"]: p for p in build_outcome_patterns({}, exposures, scenarios)}
    meals = exposures["exposures"]["meals"]["occurrences"]
    starts = [b.t for b in meal_starts(store.bolus_events())]
    times = [datetime.fromisoformat(m["t"]) for m in meals]
    arcs = outcomes_trend.meal_arcs(times, store.cgm_readings(), ctx_meal_times=starts)
    rows = []
    for meal, arc in zip(meals, arcs):
        verdict = next((v for v in meal["verdicts"] if v["classifier"] == lever), None)
        rows.append((meal["t"], meal["attributed_levers"], verdict, arc.peak))
    return patterns, scenarios, rows


def bolus(seq, t, insulin=4.5, carbs=45.0):
    return {"seq_num": seq, "request_time": t.strftime(FMT),
            "description": "Synthetic meal bolus", "completion": "Completed",
            "insulin": insulin, "requested_insulin": insulin, "carbs": carbs,
            "carb_ratio": 10.0, "isf": 40.0, "target_bg": 110.0}


def late_store(store, post_peak):
    """14 noon meals: a 2 mg/dL/min climb to 160 at the bolus, then ``post_peak``."""
    first = _materialize_behavioral_background(store, span_days=30)
    lane = datetime.combine(first, datetime.min.time())
    for day in range(2, 30, 2):
        noon = lane + timedelta(days=day, hours=12)
        climb = [120.0, 130.0, 140.0, 150.0, 160.0]  # -20 .. 0 min
        after = ([165.0, 150.0, 130.0, 110.0, 95.0, 85.0, 80.0] if post_peak <= 165
                 else [180.0, 210.0, post_peak, 220.0, 190.0, 160.0, 130.0, 110.0, 95.0, 80.0])
        values = climb + after
        store.upsert_cgm([{
            "EventDateTime": (noon + timedelta(minutes=5 * (i - 4))).strftime(FMT),
            "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV",
        } for i, bg in enumerate(values)])
        store.upsert_bolus([bolus(400_000 + day, noon)])


def report_store(label, recipe):
    from ciq_autotune.findings_projection import prepare_findings_projection
    from ciq_autotune.window_membership import WindowQuery

    database = tempfile.NamedTemporaryFile(suffix=".sqlite")
    with Store.open(database.name) as store:
        recipe(store)
        patterns, scenarios, rows = claimed(store)
        exposures = build_exposures(store)
        projection = prepare_findings_projection(
            analysis={}, exposures=exposures, scenarios=scenarios,
        ).project(WindowQuery.whole_day(), None)
    database.close()
    highs = patterns["highs_after_meals"]
    late = next((p for p in scenarios["patterns"] + scenarios["low_confidence"]
                 if p["lever"] == "late_bolus"), None)
    cause = next((r for r in projection["rows"] if r.get("id") == "finding:late_bolus"), None)
    fired = [r for r in rows if r[2] and r[2]["matched"]]
    print(label)
    print(f"  Highs after meals {highs['k']} of {highs['n']}, action {highs['action']}, "
          f"seriousness {highs['seriousness']}")
    if late:
        print(f"  Late bolus confidence k {late['confidence']['k']} n {late['confidence']['n']} "
              f"effect {late['confidence'].get('effect')} priority {late['priority']}")
    if cause:
        print(f"  Late bolus cause row count sentences {cause.get('count_sentences')}")
    print(f"  Late bolus fired on {len(fired)} meals; arc peaks "
          f"{sorted({r[3] for r in fired})}")


def qa_case_report():
    case = next(c for c in QA_CASES if c.name == "behavioral-late-bolus")
    database = tempfile.NamedTemporaryFile(suffix=".sqlite")
    with Store.open(database.name) as store:
        materialize_case(store, case)
        patterns, _scenarios, rows = claimed(store)
    database.close()
    highs = patterns["highs_after_meals"]
    print(f"1. behavioral-late-bolus: Highs after meals {highs['k']} of {highs['n']}")
    for t, levers, verdict, peak in rows:
        print(f"    {t} levers {levers} late_bolus matched {verdict and verdict['matched']} "
              f"({verdict and verdict['silence_reason']}), arc peak {peak}")


def qa_scan():
    moved = 0
    for case in QA_CASES:
        database = tempfile.NamedTemporaryFile(suffix=".sqlite")
        with Store.open(database.name) as store:
            materialize_case(store, case)
            _patterns, _scenarios, rows = claimed(store)
        database.close()
        flips = [(t, peak) for t, _levers, verdict, peak in rows
                 if verdict and verdict["matched"] and (peak is None or peak <= 180)]
        if flips:
            moved += 1
            print(f"  {case.name}: {flips}")
    print(f"QA cases: {len(QA_CASES)}; cases with a Late bolus verdict ADR 461 turns calm: {moved}")


def main():
    if "--qa" in sys.argv:
        qa_scan()
        return
    qa_case_report()
    report_store("2. 14 in-range late meals", lambda s: late_store(s, 165.0))
    report_store("3. control: the same climb, post-bolus peak 240", lambda s: late_store(s, 240.0))


if __name__ == "__main__":
    main()
