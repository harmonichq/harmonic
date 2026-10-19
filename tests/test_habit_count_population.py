"""A habit's count is one fact over one population (#550).

The findings answer's row, the habit's case file and its Pattern all count the
habit over the population its guidance is priced on: the engine's recurrence
population for the habit's family (sub-70 lows, highs at or over 250, completed
meals, correction pairs), with each claim on the one opportunity its attribution
is associated with. Each store below is a synthetic QA case on which the row
once counted a wider population than the case file: near-lows, an
over-treated low's rebound highs, and every correction bolus rather than every
correction pair.
"""
import pytest

from ciq_autotune import findings_projection
from ciq_autotune.analyzers.scenario.levers import Lever, exposure

from tests.test_finding_case_file import _analyzer_prepared

CASES = (
    "behavioral-missed-meal",
    "behavioral-correction-stacking",
    "pattern-near-tie",
    "pattern-correction-fold",
    "pattern-correction-collapse",
)


@pytest.fixture(scope="module", params=CASES)
def prepared(request):
    from scripts.qa_e2e_cases import QA_CASES, materialize_case

    case = next(case for case in QA_CASES if case.name == request.param)
    return _analyzer_prepared(lambda store: materialize_case(store, case))


def _sentences(row):
    return [(s["count"], s["denominator"], s["noun"]) for s in row["count_sentences"] or ()]


def _summary(case):
    summary = case["summary"]
    return summary["claimed"], summary["denominator"], summary["noun"]


def test_a_habit_row_prints_its_case_files_count(prepared):
    habits = [row for row in prepared.findings["rows"] if row["kind"] == "habit"]
    assert habits
    for row in habits:
        case = prepared.case(row["id"], "clock", None)
        assert case is not None, row["id"]
        # One sentence: the habit is counted in its own family, never in a second.
        assert _sentences(row) == [_summary(case)], row["id"]


def test_a_pattern_counts_over_its_habits_population(prepared):
    """A Pattern's ``n`` is the one population its rate habits are counted over."""
    for pattern in prepared.findings["outcome_patterns"]:
        family = findings_projection.pattern_rate_family(pattern)
        for subject in pattern["rate_levers"]:
            lever = Lever(subject.removeprefix("habit:"))
            if exposure(lever) is not family:
                continue
            population = prepared.case(None, "clock", None, lever=lever)["summary"]
            assert pattern["n"] == population["denominator"], (pattern["key"], lever)


def test_every_queue_store_prints_one_count_for_a_habit():
    """The UI fixtures carry each admitted standalone habit's row and its case file
    (ADR 528); ``wearer-habit``, the wearer skipping the weekday lunch bolus, is the
    store whose row once counted 26 highs and one correction cluster where its case
    file counted 24 highs."""
    import json
    import pathlib

    fixtures = json.loads((pathlib.Path(__file__).resolve().parents[1] / "frontend" / "ui"
                           / "__fixtures__" / "ui-fixtures.json").read_text())
    checked = []
    for name, store in fixtures["queue"].items():
        for lever, case in (store.get("cases") or {}).items():
            row = next((row for row in store["findings"]["rows"]
                        if row["id"] == f"finding:{lever}"), None)
            if row is None or "summary" not in (case or {}):
                continue
            assert _sentences(row) == [_summary(case)], (name, lever)
            checked.append(name)
    assert "wearer-habit" in checked
