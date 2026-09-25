"""Observation-only producer probe for the #470 and #461 triage; never changes output.

Put this directory on ``PYTHONPATH`` and name a log file, then run any producer,
drift check or test suite. Every Python process then records, per pytest test (or
per command outside pytest): carb boluses of 10 g or more that sit within 30
minutes of each other (the pairs ADR 470 merges) — ``in_one_store`` counts them
within one bolus list a producer was handed, ``pooled`` across every meal time the
process saw, which can pair two stores' meals by coincidence — and Late bolus matches whose Arc
peak, cut at the next meal under ADR 470, is missing or at most 180 (the verdicts
ADR 461 turns calm)::

    PYTHONPATH=docs/scope/470-meal-identity.probe MEAL_PROBE_LOG=$TMPDIR/probe.jsonl \
        uv run python scripts/gen_eating_sequence_fixtures.py --check

It wraps functions without changing their answers, so every check still passes.
"""
import atexit, json, os, sys
from collections import defaultdict
from datetime import timedelta

LOG = os.environ.get("MEAL_PROBE_LOG")
_times = defaultdict(set)
_exact = defaultdict(int)
_calm = defaultdict(set)


def _test():
    current = os.environ.get("PYTEST_CURRENT_TEST")
    return current.split(" ")[0] if current else " ".join(sys.argv[:2])


def _pairs(times):
    ordered = sorted(times)
    return sum(1 for a, b in zip(ordered, ordered[1:])
               if timedelta(0) <= b - a <= timedelta(minutes=30))


def _note(bolus_events):
    times = {b.t for b in bolus_events
             if getattr(b, "carbs", None) is not None and b.carbs >= 10.0}
    _times[_test()].update(times)
    _exact[_test()] = max(_exact[_test()], _pairs(times))


def _starts(bolus):
    out = []
    for b in sorted((b for b in bolus if b.carbs is not None and b.carbs >= 10.0),
                    key=lambda b: (b.t, b.seq_num or 0)):
        if not out or b.t > out[-1] + timedelta(minutes=30):
            out.append(b.t)
    return out


def _install():
    try:
        from ciq_autotune.analyzers.scenario import anchors, meal_suspend
        from ciq_autotune.analyzers import classifiers
        from ciq_autotune.analyzers.classifiers import late_bolus, carb_undercount
        from ciq_autotune.analyzers.scenario import attribute
        from ciq_autotune import (event_comparison, outcomes_trend, watched_change,
                                  trial_evidence, follow_up_comparison, finding_case_file)
        from ciq_autotune.analyzers.scenario import opportunities
    except Exception as exc:  # pragma: no cover
        print("probe install failed", exc, file=sys.stderr)
        return
    original_collect = anchors.collect_anchors

    def collect(bolus_events, *args, **kwargs):
        _note(bolus_events)
        return original_collect(bolus_events, *args, **kwargs)

    anchors.collect_anchors = collect
    for mod in list(sys.modules.values()):
        if getattr(mod, "collect_anchors", None) is original_collect:
            mod.collect_anchors = collect
    original_is_meal = anchors._is_meal

    def is_meal(b, *args, **kwargs):
        result = original_is_meal(b, *args, **kwargs)
        if result:
            _times[_test()].add(b.t)
        return result

    for mod in (anchors, meal_suspend, opportunities, outcomes_trend, watched_change,
                trial_evidence, follow_up_comparison, finding_case_file):
        if getattr(mod, "_is_meal", None) is original_is_meal:
            mod._is_meal = is_meal
    original_arcs = outcomes_trend.meal_arcs

    def arcs(meal_times, cgm, *, ctx_meal_times=None):
        for t in list(meal_times) + list(ctx_meal_times or ()):
            _times[_test()].add(t)
        return original_arcs(meal_times, cgm, ctx_meal_times=ctx_meal_times)

    outcomes_trend.meal_arcs = arcs
    original_cu = carb_undercount.classify_carb_undercount

    def cu(meal, cgm, basal=(), bolus_events=(), **kwargs):
        _note(bolus_events)
        return original_cu(meal, cgm, basal, bolus_events, **kwargs)

    for mod in (carb_undercount, classifiers, attribute, event_comparison):
        mod.classify_carb_undercount = cu
    original_late = late_bolus.classify_late_bolus

    def late(meal, cgm_readings, basal_events=(), bolus_events=(), **kwargs):
        verdict = original_late(meal, cgm_readings, basal_events, bolus_events, **kwargs)
        _note(bolus_events)
        if verdict.matched:
            end = meal.t + timedelta(minutes=180)
            following = [t for t in _starts(bolus_events) if t > meal.t]
            if following and following[0] < end:
                end = following[0]
            peak = max((r.bg for r in cgm_readings if r.bg is not None and meal.t < r.t <= end),
                       default=None)
            if peak is None or peak <= 180:
                _calm[_test()].add(str(peak))
        return verdict

    for mod in (late_bolus, classifiers, attribute, event_comparison):
        mod.classify_late_bolus = late


_install()


@atexit.register
def _dump():
    if not LOG:
        return
    with open(LOG, "a") as fh:
        for test, times in sorted(_times.items()):
            pooled = _pairs(times)
            if pooled:
                fh.write(json.dumps({"test": test, "kind": "pair", "in_one_store": _exact[test],
                                     "pooled": pooled}) + "\n")
        for test, peaks in sorted(_calm.items()):
            fh.write(json.dumps({"test": test, "kind": "calm", "peaks": sorted(peaks)}) + "\n")
