"""The Pattern card's trace chart, as each Pattern's case file serves it (ADR 523).

Every Pattern's episodes are aligned at their start event and drawn against
Typical, the comparison episodes: a meal Pattern's at the meal's bolus against
its comparison meals; Lows after correcting highs at the correction that led to
each low it counts, against every other lone correction; Highs after treating
lows at the low's nadir, against every other low. The engine serves the
episodes (eight or fewer) and each cohort's 5-minute median and 25-75 band,
withheld in a bin with fewer than three readings; the frontend draws them.

The QA recipes are synthetic; every expected anchor is read off the recipe.
"""
from dataclasses import replace
from datetime import datetime, timedelta

import pytest

from ciq_autotune.analyzers.scenario.levers import Lever
from ciq_autotune.events import BolusEvent, CgmReading

from tests.test_finding_case_file import (
    _analyzer_prepared, _opportunity, _pattern_findings, _prepared,
)

FMT = "%Y-%m-%d %H:%M:%S"


@pytest.fixture(scope="module")
def correction_fold():
    from scripts.qa_e2e_cases import QA_CASES, materialize_case

    return _analyzer_prepared(lambda store: materialize_case(
        store, next(case for case in QA_CASES if case.name == "pattern-correction-fold"),
    ))


def _traces(prepared, key):
    return prepared.case(f"pattern:{key}", "event", None)["traces"]


def _withheld_below_three(points):
    """Only a bin with three or more readings is served, with its median and band."""
    return all(p["n"] >= 3 and None not in (p["median"], p["p25"], p["p75"]) for p in points)


def test_lows_after_correcting_highs_is_drawn_from_each_lows_correction(correction_fold):
    traces = _traces(correction_fold, "lows_after_correcting_highs")

    assert (traces["anchor"], traces["window_min"]) == ("correction", [0, 240])
    # The two lows Correction on active insulin claims, from the 20:00 correction
    # each one followed, and the two Correction stacking reached, from the
    # stacking dose (the pair's second correction).
    assert traces["pattern"]["anchors"] == [
        "2024-05-14 20:00:00", "2024-05-15 20:00:00",
        "2024-05-24 14:40:00", "2024-05-25 14:40:00",
    ]
    # Typical is every other lone correction: the 20:00 correction before the
    # low the Pattern did not count. A correction with another within the
    # stacking window is not lone, so no stacked pair joins it.
    assert traces["typical"]["anchors"] == ["2024-05-17 20:00:00"]
    episodes = traces["pattern"]["episodes"]
    assert len(episodes) == 4
    for episode in episodes:
        minutes = [point["minute"] for point in episode]
        assert minutes == sorted(minutes)
        assert 0 <= minutes[0] <= 10 and minutes[-1] <= 240
    assert _withheld_below_three(traces["pattern"]["points"])
    # One Typical correction: no bin has three readings, so no band is served.
    assert traces["typical"]["points"] == []


def test_the_exposure_feed_names_the_correction_each_counted_low_followed(correction_fold):
    lows = correction_fold.pattern_exposures["exposures"]["lows"]["occurrences"]
    served = {low["t"]: low.get("corrections") for low in lows}
    assert served["2024-05-14 22:00:00"] == {"correction_on_iob": "2024-05-14 20:00:00"}
    assert served["2024-05-24 16:05:00"] == {"correction_stacking": "2024-05-24 14:40:00"}
    # A low nothing claimed from a correction names none.
    assert served["2024-05-17 22:00:00"] is None


def test_highs_after_treating_lows_compares_its_rebounds_with_every_other_low(correction_fold):
    traces = _traces(correction_fold, "highs_after_treating_lows")

    assert (traces["anchor"], traces["window_min"]) == ("nadir", [0, 180])
    assert traces["pattern"]["anchors"] == ["2024-05-16 13:55:00"]
    assert traces["typical"]["anchors"] == [
        "2024-05-14 22:00:00", "2024-05-15 22:00:00", "2024-05-17 22:00:00",
        "2024-05-18 16:10:00", "2024-05-24 16:05:00", "2024-05-25 16:05:00",
    ]
    assert len(traces["pattern"]["episodes"]) == 1
    assert _withheld_below_three(traces["typical"]["points"])
    assert traces["typical"]["points"]


def test_an_episode_missing_its_early_readings_is_left_off(correction_fold):
    start = datetime(2024, 5, 17, 20, 0)
    gapped = replace(correction_fold, cgm=tuple(
        row for row in correction_fold.cgm if not start <= row.t <= start + timedelta(minutes=15)))

    traces = _traces(gapped, "lows_after_correcting_highs")

    assert traces["typical"]["anchors"] == []
    assert len(traces["pattern"]["anchors"]) == 4


def _meal_pattern(claimed, calm):
    """Highs after meals over ``claimed`` claimed and ``calm`` unclaimed meals, six
    hours apart, each with its own 5-minute series from an hour before to five after."""
    first = _opportunity(Lever.CARB_UNDERCOUNT)
    anchors = [first.anchor_t + timedelta(hours=6 * index) for index in range(claimed + calm)]
    states = ["claimed"] * claimed + ["calm"] * calm
    findings = _pattern_findings(
        "highs_after_meals", (Lever.CARB_UNDERCOUNT,), k=claimed, n=len(states),
        rate_levers=(Lever.CARB_UNDERCOUNT,),
    )
    prepared = _prepared(
        Lever.CARB_UNDERCOUNT, findings=findings,
        exposures={"exposures": {"meals": {"n": len(states), "occurrences": [
            {"ep_id": f"ep-{index}", "t": t.strftime(FMT), "date": t.date().isoformat(),
             "kind": "meal", "bg": 120, "attributed": state == "claimed",
             "attributed_levers": ["carb_undercount"] if state == "claimed" else [],
             **({"claim_severity": {"carb_undercount": 600.0}} if state == "claimed" else {}),
             "cause_lever": "carb_undercount" if state == "claimed" else None,
             "verdicts": [{"classifier": "carb_undercount",
                           "matched": state == "claimed",
                           "silence_reason": None if state == "claimed" else "no_trigger"}]}
            for index, (state, t) in enumerate(zip(states, anchors))
        ]}}},
    )
    prepared.cgm = tuple(
        CgmReading(t=t + timedelta(minutes=minute), bg=120 + (60 if state == "claimed" else 0),
                   type="EGV")
        for t, state in zip(anchors, states) for minute in range(-60, 301, 5))
    prepared.bolus = tuple(BolusEvent(t=t, insulin=4, carbs=40, seq_num=100 + index)
                           for index, t in enumerate(anchors))
    return prepared


def test_a_meal_pattern_is_drawn_from_its_bolus_against_its_comparison_meals():
    traces = _traces(_meal_pattern(claimed=3, calm=4), "highs_after_meals")

    assert (traces["anchor"], traces["window_min"]) == ("bolus", [-30, 240])
    assert len(traces["pattern"]["anchors"]) == 3
    assert len(traces["typical"]["anchors"]) == 4
    assert [len(episode) for episode in traces["pattern"]["episodes"]] == [55, 55, 55]
    assert {point["median"] for point in traces["pattern"]["points"]} == {180}
    assert {point["median"] for point in traces["typical"]["points"]} == {120}


def test_more_than_eight_pattern_episodes_are_served_as_their_median_and_band():
    eight = _traces(_meal_pattern(claimed=8, calm=3), "highs_after_meals")
    nine = _traces(_meal_pattern(claimed=9, calm=3), "highs_after_meals")

    assert len(eight["pattern"]["episodes"]) == 8
    assert nine["pattern"]["episodes"] is None
    assert len(nine["pattern"]["anchors"]) == 9
    assert all(point["n"] == 9 and point["median"] == 180 for point in nine["pattern"]["points"])
