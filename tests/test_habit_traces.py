"""A standalone habit's trace chart, as its case file serves it (ADR 528).

A habit no Pattern owns is queued as its own card, and its case file serves the
same trace chart a Pattern's does (ADR 523): the habit's own episodes and
Typical, its event comparison's comparison episodes, each aligned at its start
over the habit's own comparison window. For a missed meal the episodes are the
rises the habit claims, aligned at their detected onset, against the meals
bolused for, aligned at their bolus.

The QA recipe is synthetic; every expected anchor is the time its case file
already served before the chart existed (the occurrences' comparison anchors
and the comparison cohort's boluses).
"""
import pytest

from ciq_autotune import finding_case_file
from ciq_autotune.analyzers.scenario.levers import Lever
from ciq_autotune.analyzers.scenario.outcome_patterns import _ROSTER

from tests.test_finding_case_file import _analyzer_prepared


@pytest.fixture(scope="module")
def missed_meal():
    from scripts.qa_e2e_cases import QA_CASES, materialize_case

    return _analyzer_prepared(lambda store: materialize_case(
        store, next(case for case in QA_CASES if case.name == "behavioral-missed-meal"),
    ))


def test_a_missed_meal_is_drawn_from_each_rise_against_the_meals_bolused_for(missed_meal):
    case = missed_meal.case("finding:missed_meal", "event", None)
    traces = case["traces"]

    assert (traces["anchor"], traces["window_min"]) == ("meal_start", [-60, 300])
    # The two rises the habit claims, from the onset its comparison draws them at.
    assert traces["pattern"]["anchors"] == ["2024-05-24 13:30:00", "2024-05-25 13:30:00"]
    assert [row["comparison_anchor"]["t"] for row in case["occurrences"] if row["attributed"]] \
        == traces["pattern"]["anchors"]
    # Typical: the meals bolused for, from their bolus, the comparison cohort's own.
    assert traces["typical"]["anchors"] == ["2024-05-26 12:00:00", "2024-05-29 10:00:00"]
    episodes = traces["pattern"]["episodes"]
    assert len(episodes) == 2
    for episode in episodes:
        minutes = [point["minute"] for point in episode]
        assert minutes == sorted(minutes)
        assert -60 <= minutes[0] <= -50 and minutes[-1] <= 300
    # Two of each: no bin has three readings, so neither cohort serves a band.
    assert traces["pattern"]["points"] == []
    assert traces["typical"]["points"] == []
    # The count beside the chart is the same population: the rises it claims.
    assert case["summary"] == {"claimed": 2, "denominator": 6, "noun": "highs"}


def test_the_chart_does_not_depend_on_the_alignment_asked_for(missed_meal):
    event = missed_meal.case("finding:missed_meal", "event", None)["traces"]
    clock = missed_meal.case("finding:missed_meal", "clock", None)["traces"]
    assert clock == event


def test_every_habit_no_pattern_owns_has_a_trace_chart():
    """The Queue queues a habit as its own card exactly when no Pattern owns it
    (guidance.candidates), so each such habit names its chart's start."""
    owned = {lever for _key, _title, levers, *_ in _ROSTER for lever in levers}
    standalone = {lever for lever in Lever if lever.value not in owned}
    assert set(finding_case_file._HABIT_TRACE_CHART) == standalone
