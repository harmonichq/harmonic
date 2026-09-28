"""Deep public projection contract for ADR 79 Finding case files."""

from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timedelta
import json
import tempfile
import threading
import time

import pytest

from ciq_autotune import event_comparison, finding_case_file, findings_projection, outcomes_trend
from ciq_autotune.analyzers.meals import group_meals
from ciq_autotune.analyzers.scenario.levers import Exposure, Lever, exposure, title
from ciq_autotune.analyzers.scenario.evidence_population import policy_for
from ciq_autotune.analyzers.scenario import evidence_population
from ciq_autotune.analyzers.scenario.opportunities import Opportunity
from ciq_autotune.events import BasalEvent, BolusEvent, CarbEntry, CgmReading
from ciq_autotune.finding_case_file import (
    InconsistentProjection, Member, PreparedCases, wrap,
)
from ciq_autotune.window_membership import WindowQuery
from ciq_autotune.store import Store


def _meal_opportunity(bolus):
    """A one-bolus meals opportunity, formed as ``build_opportunities`` forms one."""
    (meal,) = group_meals([bolus])
    return Opportunity(Exposure.MEALS, (bolus.seq_num,), bolus.t, "meal",
                       members=meal.members, meal=meal)


def _opportunity(lever, *, anchor=None):
    anchor = anchor or datetime(2026, 8, 1, 12, 30)
    family = exposure(lever)
    if family is Exposure.MEALS:
        return _meal_opportunity(BolusEvent(t=anchor, insulin=4, carbs=40, seq_num=11))
    if family is Exposure.LOWS:
        return Opportunity(family, (anchor - timedelta(minutes=20),
                                    anchor + timedelta(minutes=10), anchor),
                           anchor, "low", 62)
    if family is Exposure.CORRECTION_CLUSTERS:
        first = BolusEvent(t=anchor - timedelta(hours=3), insulin=2, seq_num=21)
        second = BolusEvent(t=anchor, insulin=2, seq_num=22)
        return Opportunity(family, (21, 22), anchor, "correction", members=(first, second))
    return Opportunity(family, (anchor - timedelta(minutes=40),
                                anchor + timedelta(minutes=10), anchor),
                       anchor, "high", 280, reach_start=anchor - timedelta(minutes=30))


def _findings(lever, episodes=1, extra_rows=()):
    row = {"id": f"finding:{lever.value}", "register": "finding", "kind": "habit",
           "title": lever.value, "lever": lever.value, "episodes": episodes,
           "appearances": [], "evidence": [], "verdict_counts": {},
           "verdict_counts_by_family": {}}
    return {"schema": "diagnose-findings-v1", "window": WindowQuery().to_dict(),
            "findings_window": {}, "rows": [*extra_rows, row], "counts": {},
            "chip_counts": {}, "uncaused_highs": {"count": 0, "text": None}}


def _pattern_row(key, members, *, k, n, rate_levers, chart=True):
    subject = f"pattern:{key}"
    return {
        "id": subject, "register": "finding", "kind": "pattern",
        "title": key.replace("_", " ").title(),
        "appearances": None, "episodes": None,
        "pattern_chart": ({"key": key, "window": WindowQuery.whole_day().to_dict()}
                          if chart else None),
        "pattern": {
            "key": key, "subject": subject,
            "title": key.replace("_", " ").title(),
            "members": [
                {"subject": f"habit:{lever.value}", "kind": "habit",
                 "admitted": True}
                for lever in members
            ],
            "rate_levers": [f"habit:{lever.value}" for lever in rate_levers],
            "k": k, "n": n,
        },
    }


def _pattern_findings(key, members, *, k, n, rate_levers, chart=True):
    subject = f"pattern:{key}"
    rows = [_pattern_row(key, members, k=k, n=n, rate_levers=rate_levers, chart=chart)]
    for lever in members:
        row = _findings(lever)["rows"][0]
        row["claimed_by"] = subject
        rows.append(row)
    return {
        "schema": "diagnose-findings-v1", "window": WindowQuery().to_dict(),
        "findings_window": {}, "rows": rows, "counts": {}, "chip_counts": {},
        "uncaused_highs": {"count": 0, "text": None},
    }


def _prepared(lever, members=None, claimed=None, *, query=None, findings=None,
              withheld=frozenset(), exposures=None, scenarios=None):
    opportunity = _opportunity(lever)
    members = tuple(members or (Member(opportunity, opportunity.anchor_t, "fired"),))
    claimed = frozenset({members[0].id}) if claimed is None else claimed
    times = {opportunity.anchor_t + timedelta(minutes=minute)
             for minute in (-60, -5, 0, 5, 120, 300)}
    if lever is Lever.MISSED_MEAL:
        times.add(opportunity.reach_start)
    bolus = tuple(opportunity.members)
    if lever is Lever.MEAL_BOLUS_SHORT:
        bolus += (BolusEvent(t=opportunity.reach_start - timedelta(minutes=60),
                             insulin=4, carbs=40, completion="Completed", seq_num=99),)
    cgm = tuple(CgmReading(t=t, bg=120 + (t - opportunity.anchor_t).total_seconds() / 60,
                           type="EGV") for t in sorted(times))
    return PreparedCases(
        "fp_" + "1" * 32, 0, query or WindowQuery.whole_day(),
        findings or _findings(lever),
        {lever: (len(claimed), len(members))},
        {item: members if item is lever else () for item in Lever},
        {item: claimed if item is lever else frozenset() for item in Lever},
        {item: () for item in Lever},
        withheld, cgm, (), bolus, (), time.monotonic() + 60,
        exposures=exposures, scenarios=scenarios,
    )


def _analyzer_prepared_meal_bolus_short():
    from tests.test_meal_bolus_short_attribution import (
        DOUBLE_HIGH_BOLUS, DOUBLE_HIGH_CGM, _seed, next_day,
    )

    return _analyzer_prepared(lambda store: _seed(
        store,
        DOUBLE_HIGH_BOLUS + next_day(DOUBLE_HIGH_BOLUS),
        DOUBLE_HIGH_CGM + next_day(DOUBLE_HIGH_CGM),
    ))


def _analyzer_prepared(recipe):
    """Case files from a synthetic store run through the real analyzer and producers."""
    from ciq_autotune.analyze import analyze
    from ciq_autotune.analyzers.scenario import build_scenarios
    from ciq_autotune.explore_exposures import build_exposures

    database = tempfile.NamedTemporaryFile(suffix=".sqlite")
    with Store.open(database.name) as store:
        recipe(store)
        prepared = finding_case_file.prepare(
            store,
            query=WindowQuery.whole_day(),
            version=0,
            analysis=analyze(
                store,
                pool_agreeing_basal_regimes=True,
                carb_entries=store.carb_entries(),
                prompt_responses=store.prompt_responses(),
            ).to_dict(),
            exposures=build_exposures(store),
            scenarios=build_scenarios(store).to_dict(),
        )
    database.close()
    return prepared


_LANE = datetime(2024, 5, 1)  # the QA catalog's manufactured lane starts here
_FMT = "%Y-%m-%d %H:%M:%S"
# Every meal `_meal_facts_recipe` writes: its anchor, then its bolus's dose and carbs.
_RECIPE_MEALS = {
    "2024-05-06 08:00:00": (4.0, 40.0), "2024-05-06 09:30:00": (4.0, 40.0),
    "2024-05-11 12:00:00": (20.0, 200.0), "2024-05-12 12:00:00": (20.0, 200.0),
    "2024-05-24 12:05:00": (6.0, 30.0), "2024-05-25 12:05:00": (6.0, 30.0),
    "2024-05-26 12:05:00": (9.0, 45.0), "2024-05-27 12:05:00": (12.0, 60.0),
    "2024-05-28 12:05:00": (6.0, 30.0), "2024-05-29 12:05:00": (9.0, 45.0),
}


def _synthetic_bolus(seq, t, insulin, carbs, carb_ratio, completion="Completed"):
    return {"seq_num": seq, "request_time": t.strftime(_FMT),
            "description": "Synthetic bolus", "completion": completion,
            "insulin": insulin, "requested_insulin": insulin, "carbs": carbs,
            "carb_ratio": carb_ratio, "isf": 40.0, "target_bg": 110.0}


def _synthetic_rise(store, day):
    """A climb from 110 to 350 over the 150 minutes after noon, then the flat lane."""
    store.upsert_cgm([{
        "EventDateTime": (day + timedelta(hours=12, minutes=5 * step)).strftime(_FMT),
        "Readings (CGM / BGM)": 110.0 + 8.0 * step, "Description": "Synthetic EGV",
    } for step in range(31)])


def _meal_facts_recipe(store):
    """N synthetic meals on one manufactured lane, each judged by the real analyzer.

    The QA catalog's six carb-undercount meals admit Carb undercount, so Highs after
    meals publishes a chartable roster; two noon meals that Meal bolus short claims,
    each followed by a correction (the pair is also one correction cluster); two
    unannounced noon rises that Missed / unannounced meal claims; and two meals ninety
    minutes apart, so the first one's nadir window does not qualify.
    """
    from scripts.qa_e2e_cases import _materialize_behavioral_carb_undercount

    _materialize_behavioral_carb_undercount(store)
    for index, offset in enumerate((10, 11)):
        day = _LANE + timedelta(days=offset)
        _synthetic_rise(store, day)
        store.upsert_bolus([
            _synthetic_bolus(500_000 + 10 * index, day + timedelta(hours=12), 20.0, 200.0, 2.0),
            _synthetic_bolus(500_001 + 10 * index, day + timedelta(hours=13, minutes=10),
                             2.0, None, None),
        ])
    for offset in (14, 15):
        _synthetic_rise(store, _LANE + timedelta(days=offset))
    day = _LANE + timedelta(days=5)
    store.upsert_bolus([
        _synthetic_bolus(600_000, day + timedelta(hours=8), 4.0, 40.0, 10.0),
        _synthetic_bolus(600_001, day + timedelta(hours=9, minutes=30), 4.0, 40.0, 10.0),
    ])


def _edge_facts_recipe(store):
    """One day on the lane: a completed meal at noon under a gentle climb, a carb-tagged
    bolus that never completed thirty minutes later, a dip the reader confirmed as a
    false low, and a correction pair whose two doses differ."""
    from scripts.qa_e2e_cases import _materialize_behavioral_background

    _materialize_behavioral_background(store, span_days=2)
    day = _LANE + timedelta(days=1)
    store.upsert_cgm([{
        "EventDateTime": (day + timedelta(hours=12, minutes=5 * step)).strftime(_FMT),
        "Readings (CGM / BGM)": 120.0 + 5.0 * min(step, 10), "Description": "Synthetic EGV",
    } for step in range(19)])
    store.upsert_cgm([{
        "EventDateTime": (day + timedelta(hours=14, minutes=5 * step)).strftime(_FMT),
        "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV",
    } for step, bg in enumerate((110.0, 90.0, 60.0, 50.0, 50.0, 80.0, 120.0))])
    dip = day + timedelta(hours=14, minutes=15)
    store.record_prompt_response(detector="low", anchor_t=dip, answer="false-low",
                                 answered_at=dip)
    store.upsert_bolus([
        _synthetic_bolus(700_000, day + timedelta(hours=12), 4.0, 40.0, 10.0),
        _synthetic_bolus(700_001, day + timedelta(hours=12, minutes=30), 2.0, 40.0, 10.0,
                         completion="Cancelled"),
        _synthetic_bolus(700_002, day + timedelta(hours=16), 1.5, None, None),
        _synthetic_bolus(700_003, day + timedelta(hours=16, minutes=30), 2.5, None, None),
    ])


@pytest.fixture(scope="module")
def meal_facts():
    return _analyzer_prepared(_meal_facts_recipe)


@pytest.fixture(scope="module")
def correction_stacking():
    from scripts.qa_e2e_cases import QA_CASES, materialize_case

    return _analyzer_prepared(lambda store: materialize_case(
        store, next(case for case in QA_CASES if case.name == "behavioral-correction-stacking"),
    ))


@pytest.fixture(scope="module")
def pattern_near_tie():
    from scripts.qa_e2e_cases import QA_CASES, materialize_case

    return _analyzer_prepared(lambda store: materialize_case(
        store, next(case for case in QA_CASES if case.name == "pattern-near-tie"),
    ))


@pytest.mark.parametrize("lever", [lever for lever in Lever
                                   if policy_for(lever).recurrence_noun != "sequences"])
def test_all_eight_levers_publish_one_exact_case_file_population(lever):
    prepared = _prepared(lever)
    case = prepared.case(f"finding:{lever.value}", "event", None)

    policy = policy_for(lever)
    assert set(case) == {"schema", "projection_id", "finding", "window", "family",
                         "summary", "verdict_counts", "occurrences", "projection",
                         "selection", "population", "cross_population"}
    assert case["schema"] == "diagnose-finding-case-file-v1"
    assert case["family"] == case["population"] == policy.recurrence_noun
    expected_noun = (policy.recurrence_noun if policy.recurrence_family is None
                     else finding_case_file._noun(policy.recurrence_family))
    assert case["summary"]["noun"] == expected_noun
    assert case["cross_population"] is policy.cross_population
    assert case["summary"]["claimed"] == 1
    assert case["summary"]["denominator"] == len(case["occurrences"]) == 1
    assert sum(case["verdict_counts"].values()) == 1
    assert case["projection"]["alignment"] == "event"
    assert case["projection"]["clock"] is None
    expected_cohorts = ["matched", "nearly_matched", "comparison"]
    assert [cohort["key"] for cohort in case["projection"]["cohorts"]] == expected_cohorts
    assert case["projection"]["comparison"]["name"] == policy.comparison_name
    counts = case["projection"]["counts"]
    assert set(counts) == {"matched", "nearly_matched", "comparison", "outside_comparison"}
    in_comparison = counts["matched"] + counts["nearly_matched"] + (
        0 if policy.cross_population else counts["comparison"])
    assert in_comparison + counts["outside_comparison"] == 1
    assert [cohort["band_verdict"] for cohort in case["projection"]["cohorts"]] == [
        None if policy.cross_population else "fired", "near_miss", None,
    ]
    # ADR 468: a cohort naming a band state serves exactly it; a same-population
    # comparison serves its members' distinct verdicts in band order; every other
    # cohort serves none.
    matched, near, comparison = case["projection"]["cohorts"]
    verdict_of = {row["id"]: row["verdict"] for row in case["occurrences"]}
    held = {verdict_of[occurrence_id] for occurrence_id in comparison["occurrence_ids"]}
    assert matched["band_states"] == ([] if policy.cross_population else ["fired"])
    assert near["band_states"] == ["near_miss"]
    assert comparison["band_states"] == ([] if policy.cross_population else [
        state for state in ("fired", "near_miss", "clean", "outranked", "no_data")
        if state in held])
    assert case["selection"] == {"state": "none", "requested_id": None, "detail": None}


@pytest.mark.parametrize(("lever", "family", "noun", "denominator", "comparison_name",
                          "cross_population"), [
    (Lever.CARB_UNDERCOUNT, "meals", "meals", 1, "Other meal opportunities", False),
    (Lever.LATE_BOLUS, "meals", "meals", 1, "Other meal opportunities", False),
    (Lever.MEAL_OVER_DELIVERY, "meals", "meals", 1, "Other meal opportunities", False),
    (Lever.OVER_TREATED_LOW, "lows", "lows", 1, "Other low excursions", False),
    (Lever.CORRECTION_ON_IOB, "lows", "lows", 1, "Other low excursions", False),
    (Lever.CORRECTION_STACKING, "correction_clusters", "correction clusters", 1,
     "Other back-to-back correction pairs", False),
    (Lever.MISSED_MEAL, "highs", "highs", 1, "Completed carb-bolus meals", True),
    (Lever.MEAL_BOLUS_SHORT, "meals", "meals", 2,
     "Other completed carb-bolus meals", False),
])
def test_served_case_shape_matches_the_eight_lever_audit_table(
    lever, family, noun, denominator, comparison_name, cross_population,
):
    prepared = (
        _analyzer_prepared_meal_bolus_short()
        if lever is Lever.MEAL_BOLUS_SHORT else _prepared(lever)
    )
    case = prepared.case(f"finding:{lever.value}", "event", None)

    assert (case["family"], case["summary"]["noun"],
            case["summary"]["denominator"],
            case["projection"]["comparison"]["name"],
            case["cross_population"]) == (
                family, noun, denominator, comparison_name, cross_population,
            )


def test_event_comparison_consumes_the_policy_membership_predicate():
    lever = Lever.LATE_BOLUS
    first = _opportunity(lever)
    second_anchor = first.anchor_t + timedelta(hours=3)
    second_bolus = BolusEvent(
        t=second_anchor, insulin=4, carbs=40, seq_num=12,
        completion="Completed",
    )
    second = _meal_opportunity(second_bolus)
    members = (
        Member(first, first.anchor_t, "fired"),
        Member(second, second.anchor_t, "clean"),
    )
    original = policy_for(lever)
    policy = replace(
        original,
        comparison_members=lambda item, *, scenario_config: False,
    )

    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setitem(evidence_population._POLICIES, lever, policy)
        case = _prepared(
            lever, members=members, claimed=frozenset({members[0].id}),
        ).case(f"finding:{lever.value}", "event", None)

    assert case["projection"]["counts"]["comparison"] == 0


def test_case_file_consumes_the_authoritative_verdict_order(monkeypatch):
    reordered = tuple(reversed(findings_projection.FINDING_VERDICTS))
    monkeypatch.setattr(findings_projection, "FINDING_VERDICTS", reordered)

    case = _prepared(Lever.LATE_BOLUS).case("finding:late_bolus", "event", None)
    _, authoritative_counts, _ = findings_projection._lever_evidence(
        Lever.LATE_BOLUS.value, ["meals"], {"meals": []},
    )

    assert tuple(authoritative_counts) == reordered
    assert tuple(case["verdict_counts"]) == reordered
    assert tuple(cohort["key"] for cohort in case["projection"]["cohorts"]) == (
        "matched", "nearly_matched", "comparison",
    )


def test_case_file_consumes_the_authoritative_diagnose_window(monkeypatch):
    observed = []
    monkeypatch.setattr(findings_projection, "DIAGNOSE_SOURCE_WINDOW_DAYS", 17)

    class Projection:
        _scenarios = {}

        @staticmethod
        def project(query, selected_id=None, *, analysis_generation="standalone:0"):
            assert selected_id is None
            assert analysis_generation == "standalone:0"
            return {"rows": []}

    def fake_projection(*, analysis, exposures, scenarios):
        observed.append(("queue", findings_projection.DIAGNOSE_SOURCE_WINDOW_DAYS))
        return Projection()

    def fake_population(store, basal, cgm, bolus, *, window_days):
        observed.append(("population", window_days))
        return ({lever: () for lever in Lever},
                {lever: frozenset() for lever in Lever},
                {lever: () for lever in Lever}, frozenset())

    class Connection:
        @staticmethod
        def execute(statement):
            assert statement == "BEGIN"

        @staticmethod
        def rollback():
            pass

    class Store:
        conn = Connection()
        basal_events = cgm_readings = bolus_events = carb_entries = prompt_responses = lambda self: []

    monkeypatch.setattr(findings_projection, "prepare_findings_projection", fake_projection)
    monkeypatch.setattr(finding_case_file, "_population", fake_population)
    prepared = finding_case_file.prepare(
        Store(), query=WindowQuery.whole_day(), version=0,
        analysis={}, exposures={}, scenarios={},
    )

    assert observed == [("queue", 17), ("population", 17)]
    assert finding_case_file.wrap(prepared)["coordinates"]["source_window_days"] == 17


def test_preparation_reads_one_sqlite_generation_across_constituent_reads():
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
        with Store.open(database.name) as seed:
            seed.upsert_basal([{
                "seq_num": 1, "time": "2026-08-01 12:00:00",
                "delivery_type": "profile", "basal_rate": 1.0,
                "profile_basal_rate": 1.0,
            }])
            seed.upsert_cgm([{
                "EventDateTime": "2026-08-01 12:00:00",
                "Readings (CGM / BGM)": 120, "Description": "EGV",
            }])

        writer_errors = []
        writer_finished = threading.Event()

        def write_next_generation():
            try:
                with Store.open(database.name) as writer:
                    writer.upsert_cgm([{
                        "EventDateTime": "2026-08-01 12:05:00",
                        "Readings (CGM / BGM)": 125, "Description": "EGV",
                    }])
            except Exception as error:  # pragma: no cover - asserted below
                writer_errors.append(error)
            finally:
                writer_finished.set()

        with Store.open_queryonly(database.name) as reader:
            class InterleavedStore:
                conn = reader.conn

                def __getattr__(self, name):
                    return getattr(reader, name)

                def basal_events(self, *args, **kwargs):
                    rows = reader.basal_events(*args, **kwargs)
                    writer = threading.Thread(target=write_next_generation)
                    writer.start()
                    assert writer_finished.wait(2), "WAL writer blocked by read snapshot"
                    writer.join(2)
                    return rows

            prepared = finding_case_file.prepare(
                InterleavedStore(), query=WindowQuery.whole_day(), version=0,
                analysis={}, exposures={}, scenarios={},
            )

        assert writer_errors == []
        assert [row.bg for row in prepared.cgm] == [120]
        with Store.open_queryonly(database.name) as latest:
            assert [row.bg for row in latest.cgm_readings()] == [120, 125]


@pytest.mark.parametrize("lever,view", [
    (Lever.LATE_BOLUS, "meals"),
    (Lever.OVER_TREATED_LOW, "lows"),
])
def test_meal_and_low_event_facts_come_from_legacy_authority(monkeypatch, lever, view):
    changed = dict(event_comparison.VIEW_CONFIG[view])
    changed.update({"anchor_kind": "mutated_anchor", "anchor_label": "Mutated anchor",
                    "window": [-5, 10]})
    monkeypatch.setitem(event_comparison.VIEW_CONFIG, view, changed)

    case = _prepared(lever).case(f"finding:{lever.value}", "event", None)

    assert case["occurrences"][0]["anchor"]["label"] == "Mutated anchor"
    assert case["projection"]["anchor"] == {
        "kind": "mutated_anchor", "label": "Mutated anchor",
    }
    assert case["projection"]["window_min"] == list(policy_for(lever).comparison_window)


def test_factor_specific_event_horizons_and_far_pair_selected_evidence():
    expected = {
        Lever.CARB_UNDERCOUNT: [-60, 300],
        Lever.LATE_BOLUS: [-60, 300],
        Lever.MEAL_OVER_DELIVERY: [-60, 300],
        Lever.OVER_TREATED_LOW: [-60, 120],
        Lever.CORRECTION_ON_IOB: [-60, 120],
        Lever.CORRECTION_STACKING: [-120, 180],
        Lever.MISSED_MEAL: [-60, 300],
        Lever.MEAL_BOLUS_SHORT: [-60, 300],
    }
    for lever, window in expected.items():
        prepared = _prepared(lever)
        member = prepared.members[lever][0]
        case = prepared.case(f"finding:{lever.value}", "event", member.id)
        assert case["projection"]["window_min"] == window
        assert case["selection"]["state"] == "selected"
        detail = case["selection"]["detail"]
        assert set(detail) == {"id", "date", "anchor", "verdict", "outcome", "glucose",
                               "markers", "source_corrections", "day_target",
                               "reason", "comparison_cohort"}
        if lever is Lever.CORRECTION_STACKING:
            assert [row["seq_num"] for row in detail["source_corrections"]] == [21, 22]
            assert detail["source_corrections"][0]["t"] == "2026-08-01 09:30:00"
        else:
            assert detail["source_corrections"] == []


def test_event_selection_names_its_own_cohort_and_clock_selection_names_none():
    for lever in Lever:
        if policy_for(lever).recurrence_noun == "sequences":
            continue
        prepared = _prepared(lever)
        member = prepared.members[lever][0]
        case = prepared.case(f"finding:{lever.value}", "event", member.id)
        detail = case["selection"]["detail"]
        assert [cohort["key"] for cohort in case["projection"]["cohorts"]
                if detail["id"] in cohort["occurrence_ids"]] == [detail["comparison_cohort"]]
        clock = prepared.case(f"finding:{lever.value}", "clock", member.id)
        assert clock["selection"]["state"] == "selected"
        assert "comparison_cohort" not in clock["selection"]["detail"]


def test_claimed_can_be_strictly_less_than_fired_and_clock_counts_only_claims():
    lever = Lever.LATE_BOLUS
    first = _opportunity(lever)
    second = _meal_opportunity(BolusEvent(t=first.anchor_t + timedelta(hours=1),
                                          insulin=3, carbs=30, seq_num=12))
    members = (Member(first, first.anchor_t, "fired"),
               Member(second, second.anchor_t, "fired"))
    prepared = _prepared(lever, members, frozenset({members[0].id}),
                         findings=_findings(lever, episodes=1))
    case = prepared.case("finding:late_bolus", "clock", None)
    assert case["summary"] == {"claimed": 1, "denominator": 2, "noun": "meals"}
    assert case["verdict_counts"]["fired"] == 2
    assert case["projection"]["clock"]["total"] == 1
    assert sum(bucket["n"] for bucket in case["projection"]["clock"]["buckets"]) == 1


def test_rebound_relative_membership_uses_linked_high_outcome_in_wrapping_window():
    lever = Lever.OVER_TREATED_LOW
    low = _opportunity(lever, anchor=datetime(2026, 8, 1, 22, 30))
    member = Member(low, datetime(2026, 8, 2, 0, 30), "fired")
    prepared = _prepared(lever, (member,), frozenset({member.id}),
                         query=WindowQuery.clock(23 * 60, 60))
    case = prepared.case("finding:over_treated_low", "clock", None)
    assert case["summary"]["denominator"] == 1
    assert case["projection"]["clock"]["buckets"][0]["occurrence_ids"] == [member.id]


def test_named_field_wrapper_preserves_unknown_row_and_top_level_selection():
    lever = Lever.LATE_BOLUS
    unknown = {"id": "future:row", "register": "future", "nested": {"bytes": [1, 2]}}
    findings = _findings(lever, extra_rows=(unknown,))
    findings["selection"] = {"sentinel": ["unchanged"]}
    findings["rows"][1].update({
        "priority": 42,
        "tier": "worth_a_look",
        "chips": ["lows", "meals"],
        "future_policy": {"opaque": [1, {"two": 2}]},
    })
    original = deepcopy(findings)
    prepared = _prepared(lever, findings=findings)
    payload = wrap(prepared)
    assert payload["findings"] == original
    assert payload["rendered_rows"][0] == unknown
    behavioral = payload["rendered_rows"][1]
    assert behavioral["evidence"] is None
    assert behavioral["case_header"] == payload["behavioral_case_headers"][behavioral["id"]]
    changed_fields = {
        key for key in set(original["rows"][1]) | set(behavioral)
        if original["rows"][1].get(key) != behavioral.get(key)
    }
    allowed_changes = {
        "appearances", "episodes", "evidence", "verdict_counts",
        "verdict_counts_by_family", "event_chart", "case_header", "headline",
    }
    assert changed_fields <= allowed_changes
    assert allowed_changes - {"episodes"} <= changed_fields
    for key in set(original["rows"][1]) - allowed_changes:
        before = json.dumps(original["rows"][1][key], separators=(",", ":")).encode()
        after = json.dumps(behavioral[key], separators=(",", ":")).encode()
        assert after == before
    assert json.dumps(payload["findings"]["selection"]).encode() == json.dumps(
        original["selection"]
    ).encode()
    assert findings == original


def test_two_family_rendered_row_leads_with_the_case_file_and_says_so():
    lever = Lever.LATE_BOLUS
    findings = _findings(lever)
    row = findings["rows"][0]
    row["tier"] = "worth_a_look"
    # The projection sorts appearances by family name, so the case file's own
    # family arrives second on any finding claimed in two families.
    row["appearances"] = [
        {"family": "correction_clusters", "noun": "correction clusters", "n": 2, "m": 2},
        {"family": "meals", "noun": "meals", "n": 3, "m": 20},
    ]
    row["headline"] = findings_projection._finding_headline(row)
    prepared = _prepared(lever, findings=findings)
    summary = prepared.case(row["id"], "clock", None)["summary"]
    projected = deepcopy(row["appearances"])
    payload = wrap(prepared)
    rendered = payload["rendered_rows"][0]
    assert rendered["appearances"] == [
        {"family": "meals", "noun": summary["noun"],
         "n": summary["claimed"], "m": summary["denominator"]},
        {"family": "correction_clusters", "noun": "correction clusters", "n": 2, "m": 2},
    ]
    assert rendered["headline"] == (
        f"Ranks among this window's findings. Showed up in {summary['claimed']} of "
        f"{summary['denominator']} {summary['noun']} in this window."
    )
    assert payload["findings"]["rows"][0]["appearances"] == projected


def test_noncanonical_attribution_is_withheld_instead_of_rendered():
    lever = Lever.CORRECTION_ON_IOB
    prepared = _prepared(lever, withheld=frozenset({lever}))
    payload = wrap(prepared)
    assert payload["rendered_rows"] == []
    assert payload["withheld_findings"] == [{
        "finding_id": "finding:correction_on_iob",
        "code": "uninspectable_attribution",
        "message": "Canonical association is unavailable.",
    }]


def test_well_formed_absent_selection_is_unavailable_without_changing_population():
    prepared = _prepared(Lever.MISSED_MEAL)
    case = prepared.case("finding:missed_meal", "event", "o_" + "f" * 32)
    assert case["summary"]["denominator"] == 1
    assert case["selection"] == {"state": "unavailable", "requested_id": "o_" + "f" * 32,
                                 "detail": None}


def test_whole_day_pattern_recurrence_mismatch_fails_closed():
    prepared = _prepared(Lever.LATE_BOLUS)
    prepared.recurrence[Lever.LATE_BOLUS] = (1, 2)
    with pytest.raises(InconsistentProjection):
        prepared.case("finding:late_bolus", "event", None)


def test_pattern_case_uses_one_exposure_population_and_existing_member_states():
    first = _opportunity(Lever.CARB_UNDERCOUNT)
    second = _opportunity(
        Lever.CARB_UNDERCOUNT, anchor=first.anchor_t + timedelta(hours=2),
    )
    third = _opportunity(
        Lever.CARB_UNDERCOUNT, anchor=first.anchor_t + timedelta(hours=4),
    )
    ids = tuple(f"o_{index:032x}" for index in range(1, 4))
    carb = tuple(Member(opportunity, opportunity.anchor_t, verdict, occurrence_id)
                 for opportunity, verdict, occurrence_id in zip(
                     (first, second, third), ("fired", "outranked", "near_miss"), ids,
                 ))
    late = tuple(Member(opportunity, opportunity.anchor_t, verdict, occurrence_id)
                 for opportunity, verdict, occurrence_id in zip(
                     (first, second, third), ("outranked", "fired", "clean"), ids,
                 ))
    findings = _pattern_findings(
        "highs_after_meals", (Lever.CARB_UNDERCOUNT, Lever.LATE_BOLUS),
        k=2, n=3, rate_levers=(Lever.CARB_UNDERCOUNT, Lever.LATE_BOLUS),
    )
    prepared = _prepared(
        Lever.CARB_UNDERCOUNT, carb, frozenset({carb[0].id}), findings=findings,
        exposures={"exposures": {"meals": {"n": 3, "occurrences": [
            {"ep_id": f"ep-{index}", "t": member.outcome_t.strftime("%Y-%m-%d %H:%M:%S"),
             "date": member.outcome_t.date().isoformat(), "kind": "meal",
             "bg": None, "insulin": 4, "carbs": 40, "attributed": index < 2,
             "attributed_levers": (["carb_undercount", "late_bolus"][index:index + 1]
                                     if index < 2 else []),
             "cause_lever": ("carb_undercount", "late_bolus", None)[index],
             "verdicts": ([{"classifier": "carb_undercount", "matched": False,
                             "silence_reason": "under_threshold"}]
                          if index == 2 else [])}
            for index, member in enumerate(carb)
        ]}}},
    )
    prepared.members[Lever.LATE_BOLUS] = late
    prepared.associations[Lever.LATE_BOLUS] = frozenset({late[1].id})

    case = prepared.case("pattern:highs_after_meals", "event", None)
    clock = prepared.case("pattern:highs_after_meals", "clock", None)

    assert case["finding"] == {
        "id": "pattern:highs_after_meals", "lever": "highs_after_meals",
        "subject": "pattern:highs_after_meals", "title": "Highs After Meals",
    }
    assert case["family"] == case["population"] == case["summary"]["noun"] == "meals"
    assert case["summary"] == {"claimed": 2, "denominator": 3, "noun": "meals"}
    assert [(row["member"], row["verdict"]) for row in case["occurrences"]] == [
        ("habit:carb_undercount", "fired"),
        ("habit:late_bolus", "fired"),
        ("clean", "near_miss"),
    ]
    assert sum(case["verdict_counts"].values()) == 3
    assert clock["projection"]["alignment"] == "clock"
    assert clock["projection"]["clock"]["total"] == 2
    for key in ("finding", "family", "summary", "verdict_counts", "occurrences"):
        assert clock[key] == case[key]
    # A meal row serves its bolus, never a glucose; with no judged series here there
    # is no arc reading to serve.
    assert [({key: row["anchor"][key] for key in ("bg", "insulin", "carbs")}, row["outcome"])
            for row in case["occurrences"]] == [
        ({"bg": None, "insulin": 4, "carbs": 40}, None)] * 3
    selected = prepared.case("pattern:highs_after_meals", "clock", clock["occurrences"][0]["id"])
    assert selected["selection"]["state"] == "selected"
    assert selected["selection"]["detail"]["id"] == clock["occurrences"][0]["id"]
    assert selected["selection"]["detail"]["anchor"] == clock["occurrences"][0]["anchor"]
    assert "comparison_cohort" not in selected["selection"]["detail"]
    unclaimed = prepared.case("pattern:highs_after_meals", "clock",
                              clock["occurrences"][2]["id"])["selection"]["detail"]
    assert unclaimed["reason"] == {"cause": None, "habits": [
        {"lever": "carb_undercount", "title": title(Lever.CARB_UNDERCOUNT),
         "verdict": "near_miss", "detail": None},
        {"lever": "late_bolus", "title": title(Lever.LATE_BOLUS),
         "verdict": "no_data", "detail": None},
    ]}
    assert prepared.case("finding:carb_undercount", "event", None) is not None
    assert prepared.case("finding:late_bolus", "event", None) is not None


_MEAL_STATES = {
    "claimed": {"matched": True, "silence_reason": None},
    "near_miss": {"matched": False, "silence_reason": "under_threshold"},
    "no_data": {"matched": False, "silence_reason": "insufficient_data"},
    "calm": {"matched": False, "silence_reason": "no_trigger"},
}


def _pattern_meal_case(states):
    """A Highs after meals event case file over one synthetic meal per state."""
    first = _opportunity(Lever.CARB_UNDERCOUNT)
    stamps = [(first.anchor_t + timedelta(hours=3 * index)).strftime("%Y-%m-%d %H:%M:%S")
              for index in range(len(states))]
    claimed = sum(state == "claimed" for state in states)
    findings = _pattern_findings(
        "highs_after_meals", (Lever.CARB_UNDERCOUNT,), k=claimed, n=len(states),
        rate_levers=(Lever.CARB_UNDERCOUNT,),
    )
    prepared = _prepared(
        Lever.CARB_UNDERCOUNT, findings=findings,
        exposures={"exposures": {"meals": {"n": len(states), "occurrences": [
            {"ep_id": f"ep-{index}", "t": stamp, "date": stamp[:10], "kind": "meal",
             "bg": 120, "attributed": state == "claimed",
             "attributed_levers": ["carb_undercount"] if state == "claimed" else [],
             "cause_lever": "carb_undercount" if state == "claimed" else None,
             "verdicts": [{"classifier": "carb_undercount", **_MEAL_STATES[state]}]}
            for index, (state, stamp) in enumerate(zip(states, stamps))
        ]}}},
    )
    return prepared.case("pattern:highs_after_meals", "event", None)


def test_pattern_comparison_leaves_nothing_outside_its_own_population():
    case = _pattern_meal_case(("claimed", "calm", "no_data"))
    counts = case["projection"]["counts"]

    assert case["summary"]["denominator"] == 3
    assert counts["matched"] + counts["nearly_matched"] + counts["comparison"] == 3
    # The comparison is drawn from the case file's own meals, so its three cohorts
    # partition them and nothing is outside it; the no-data meal is a comparison
    # member, not a leftover.
    assert counts.get("outside_comparison", counts.get("not_comparable")) == 0
    assert "not_comparable" not in counts
    no_data = next(row["id"] for row in case["occurrences"] if row["verdict"] == "no_data")
    assert no_data in case["projection"]["cohorts"][2]["occurrence_ids"]
    # ADR 468: the comparison group serves the band states it holds, so its 2
    # reconciles with the band's Does not meet and not comparable.
    assert [cohort["band_states"] for cohort in case["projection"]["cohorts"]] == [
        ["fired"], ["near_miss"], ["clean", "no_data"],
    ]


def test_same_population_cohorts_name_the_band_state_they_hold():
    case = _pattern_meal_case(("claimed", "claimed", "claimed", "near_miss", "no_data", "calm"))
    counts = case["projection"]["counts"]

    assert [(cohort["key"], cohort["name"], cohort["band_verdict"], cohort["routed_count"])
            for cohort in case["projection"]["cohorts"]] == [
        ("matched", "Matched", "fired", 3),
        ("nearly_matched", "Nearly matched", "near_miss", 1),
        ("comparison", "Other meal opportunities", None, 2),
    ]
    assert (case["verdict_counts"]["fired"], case["verdict_counts"]["near_miss"]) == (3, 1)
    assert [cohort["band_states"] for cohort in case["projection"]["cohorts"]] == [
        ["fired"], ["near_miss"], ["clean", "no_data"],
    ]
    assert counts == {"matched": 3, "nearly_matched": 1, "comparison": 2,
                      "outside_comparison": 0}


def _meal_row(stamp, cause, claimants, matched):
    """One synthetic meal Occurrence judged by both meal rate levers."""
    return {
        "ep_id": f"ep-{stamp[11:13]}", "t": stamp, "date": stamp[:10], "kind": "meal",
        "bg": 120, "attributed": cause is not None, "attributed_levers": list(claimants),
        "cause_lever": cause,
        "cause_title": cause,
        "verdicts": [{"classifier": lever, "matched": lever in matched,
                      "silence_reason": None if lever in matched else "no_trigger"}
                     for lever in ("carb_undercount", "late_bolus")],
    }


def test_a_meal_two_rate_levers_claim_is_credited_once_to_the_first():
    """ADR 424: the Pattern's count, its case file's per-meal member and each folded
    cause's share come from one credit rule over one population, so a meal two rate
    levers claim is counted once, for the first in rate-lever order."""
    stamps = [(datetime(2026, 8, 1, 8) + timedelta(hours=4 * index))
              .strftime("%Y-%m-%d %H:%M:%S") for index in range(3)]
    exposures = {"window": {}, "exposures": {"meals": {"n": 3, "occurrences": [
        # Late bolus drove this meal and lists itself first, but Carb undercount comes
        # first in the Pattern's rate levers, so the meal is credited to it.
        _meal_row(stamps[0], "late_bolus", ("late_bolus", "carb_undercount"),
                  {"late_bolus", "carb_undercount"}),
        _meal_row(stamps[1], "late_bolus", ("late_bolus",), {"late_bolus"}),
        _meal_row(stamps[2], "carb_undercount", ("carb_undercount",), {"carb_undercount"}),
    ]}}}
    scenarios = {"patterns": [
        {"lever": lever, "priority": price,
         "confidence": {"k": 2, "n": 3, "lo": .2, "hi": .9},
         "guidance": {"action_id": f"habit:{lever}", "seriousness": "high"}}
        for lever, price in (("carb_undercount", 40), ("late_bolus", 30))
    ], "low_confidence": []}
    findings = findings_projection.prepare_findings_projection(
        analysis={"window_days": 30}, exposures=exposures, scenarios=scenarios,
    ).project(WindowQuery.whole_day())
    rows = {row["id"]: row for row in findings["rows"]}
    pattern = rows["pattern:highs_after_meals"]["pattern"]

    case = _prepared(Lever.CARB_UNDERCOUNT, findings=findings, exposures=exposures).case(
        "pattern:highs_after_meals", "event", None,
    )

    assert (pattern["k"], pattern["n"]) == (3, 3)
    assert case["summary"]["claimed"] == pattern["k"]
    assert [row["member"] for row in case["occurrences"]] == [
        "habit:carb_undercount", "habit:late_bolus", "habit:carb_undercount",
    ]
    shares = {lever: (rows[f"finding:{lever}"].get("fold_sentences") or [{}])[0]
              for lever in ("carb_undercount", "late_bolus")}
    assert {lever: (share.get("scope"), share.get("count"), share.get("denominator"))
            for lever, share in shares.items()} == {
        "carb_undercount": ("pattern", 2, 3), "late_bolus": ("pattern", 1, 3),
    }
    assert sum(share["count"] for share in shares.values()) == pattern["k"]
    # Each cause keeps its own count; only the Pattern's share is credited once.
    assert [rows[f"finding:{lever}"]["appearances"][0]["n"]
            for lever in ("carb_undercount", "late_bolus")] == [1, 2]


def test_outranked_meals_stay_outside_the_patterns_claimed_count():
    """ADR 424: a meal a member habit matched without a rate lever's claim, or whose
    episode another lever drove, reads outranked and is not attributed to the
    Pattern, so the header's not-attributed count is right as served."""
    stamps = [(datetime(2026, 8, 1, 12, 30) + timedelta(hours=3 * index))
              .strftime("%Y-%m-%d %H:%M:%S") for index in range(3)]
    occurrences = [
        # Carb undercount claims this meal.
        _meal_row(stamps[0], "carb_undercount", ("carb_undercount",), {"carb_undercount"}),
        # Late bolus matched, but this meal did not drive its episode.
        _meal_row(stamps[1], None, (), {"late_bolus"}),
        # Meal over-delivery drove this meal's episode.
        _meal_row(stamps[2], "meal_over_delivery", ("meal_over_delivery",), set()),
    ]
    findings = _pattern_findings(
        "highs_after_meals", (Lever.CARB_UNDERCOUNT, Lever.LATE_BOLUS), k=1, n=3,
        rate_levers=(Lever.CARB_UNDERCOUNT, Lever.LATE_BOLUS, Lever.MEAL_BOLUS_SHORT),
    )
    case = _prepared(
        Lever.CARB_UNDERCOUNT, findings=findings,
        exposures={"exposures": {"meals": {"n": 3, "occurrences": occurrences}}},
    ).case("pattern:highs_after_meals", "event", None)
    summary, counts = case["summary"], case["verdict_counts"]

    assert [(row["verdict"], row["member"]) for row in case["occurrences"]] == [
        ("fired", "habit:carb_undercount"), ("outranked", "clean"), ("outranked", "clean"),
    ]
    assert summary["claimed"] == counts["fired"] == 1
    assert summary["denominator"] - summary["claimed"] == (
        counts["outranked"] + counts["near_miss"] + counts["no_data"] + counts["clean"]
    ) == 2


def test_circular_pattern_projection_and_case_share_explicit_population():
    def meal(ep_id, stamp, outcome_minute, lever=None):
        return {
            "ep_id": ep_id, "t": stamp, "date": stamp[:10], "kind": "meal",
            "label": "Meal", "bg": None, "insulin": 4.0, "carbs": 40.0, "worst_bg": 220,
            "state": "fired" if lever else "clean", "attributed": lever is not None,
            "attributed_levers": [lever] if lever else [], "cause_lever": lever,
            "cause_title": lever.replace("_", " ").title() if lever else None,
            "text": "Synthetic bounded episode evidence.", "verdicts": [],
            "outcome_minute": outcome_minute,
        }

    occurrences = [
        meal("included-at-start", "2026-08-01 22:00:00", 23 * 60 + 30,
             "carb_undercount"),
        meal("included-after-midnight", "2026-08-01 23:30:00", 0, "late_bolus"),
        meal("excluded-at-end", "2026-08-01 23:45:00", 60, "carb_undercount"),
        meal("excluded-before-start", "2026-08-02 00:15:00", 23 * 60 + 29),
    ]
    exposures = {"exposures": {"meals": {
        "n": 4, "attributed": 3, "clean": 1, "uncaused": 1,
        "levers": ["carb_undercount", "late_bolus"],
        "by_cause": {"Carb Undercount": 2, "Late Bolus": 1},
        "occurrences": occurrences,
    }}}
    scenarios = {"patterns": [
        {
            "lever": lever, "priority": priority,
            "confidence": {"k": 12, "n": 20, "lo": 0.39, "hi": 0.78},
            "guidance": {"action_id": lever, "seriousness": "moderate"},
        }
        for lever, priority in (("carb_undercount", 40), ("late_bolus", 35))
    ], "low_confidence": [], "episodes": {}}
    query = WindowQuery.clock(23 * 60 + 30, 60)

    with Store.open(":memory:") as store:
        prepared = finding_case_file.prepare(
            store, query=query, version=0, analysis={"window_days": 30},
            exposures=exposures, scenarios=scenarios,
            analysis_generation="circular-pattern:0",
        )

    row = next(row for row in prepared.findings["rows"]
               if row["id"] == "pattern:highs_after_meals")
    assert (row["pattern"]["k"], row["pattern"]["n"]) == (2, 2)
    case = prepared.case("pattern:highs_after_meals", "clock", None)
    assert case["summary"] == {"claimed": 2, "denominator": 2, "noun": "meals"}
    assert [item["anchor"]["t"] for item in case["occurrences"]] == [
        "2026-08-01 22:00:00", "2026-08-01 23:30:00",
    ]
    selected = prepared.case(
        "pattern:highs_after_meals", "clock", case["occurrences"][1]["id"],
    )
    assert selected["selection"]["state"] == "selected"
    assert selected["selection"]["detail"]["anchor"]["t"] == "2026-08-01 23:30:00"
    assert {key: selected["selection"]["detail"]["anchor"][key]
            for key in ("bg", "insulin", "carbs")} == {"bg": None, "insulin": 4.0, "carbs": 40.0}


def test_pattern_case_is_chartless_without_a_served_habit_or_population():
    setting_only = _pattern_findings(
        "overnight_lows_no_iob", (), k=1, n=8, rate_levers=(),
        chart=False,
    )
    prepared = _prepared(Lever.CARB_UNDERCOUNT, findings=setting_only)
    assert prepared.case("pattern:overnight_lows_no_iob", "event", None) is None
    assert prepared.case("pattern:overnight_lows_no_iob", "clock", None) is None

    memberless = _pattern_findings(
        "highs_after_meals", (), k=1, n=1,
        rate_levers=(Lever.CARB_UNDERCOUNT, Lever.LATE_BOLUS), chart=False,
    )
    prepared.findings = memberless
    assert prepared.case("pattern:highs_after_meals", "event", None) is None

    empty = _pattern_findings(
        "highs_after_meals", (Lever.CARB_UNDERCOUNT,), k=0, n=0,
        rate_levers=(Lever.CARB_UNDERCOUNT,), chart=False,
    )
    prepared.findings = empty
    assert prepared.case("pattern:highs_after_meals", "event", None) is None


def test_wrap_keeps_pattern_headline_and_drops_only_uninspectable_claimed_member():
    lever = Lever.CARB_UNDERCOUNT
    findings = _pattern_findings(
        "highs_after_meals", (lever,), k=1, n=1, rate_levers=(lever,),
    )
    findings["rows"][0]["headline"] = "Highs After Meals in 1 of 1 meals"
    member = _opportunity(lever)
    prepared = _prepared(
        lever, findings=findings, withheld=frozenset({lever}),
        exposures={"exposures": {"meals": {"n": 1, "occurrences": [{
            "ep_id": "ep-1", "t": member.anchor_t.strftime("%Y-%m-%d %H:%M:%S"),
            "date": member.anchor_t.date().isoformat(), "kind": "meal",
            "bg": None, "insulin": 4, "carbs": 40,
            "attributed": True, "attributed_levers": [lever.value],
            "cause_lever": lever.value, "verdicts": [],
        }]}}},
    )

    payload = wrap(prepared)

    pattern = payload["rendered_rows"][0]
    assert [row["id"] for row in payload["rendered_rows"]] == [
        "pattern:highs_after_meals",
    ]
    assert pattern["headline"] == "Highs After Meals in 1 of 1 meals"
    assert pattern["appearances"] is None and pattern["episodes"] is None
    assert pattern["pattern_chart"]["key"] == "highs_after_meals"
    assert "event_chart" not in pattern["case_header"]
    assert payload["withheld_findings"][0]["finding_id"] == "finding:carb_undercount"


def test_wrap_passes_through_a_chartless_pattern_unchanged():
    member_lever = Lever.CORRECTION_ON_IOB
    rate_lever = Lever.CORRECTION_STACKING
    findings = _pattern_findings(
        "lows_after_correcting_highs", (member_lever,), k=1, n=1,
        rate_levers=(rate_lever,),
    )
    findings["rows"][0]["pattern_chart"] = None
    prepared = _prepared(member_lever, findings=findings)

    payload = wrap(prepared)

    pattern = payload["rendered_rows"][0]
    assert pattern == findings["rows"][0]
    assert "case_header" not in pattern
    assert pattern["id"] not in payload["behavioral_case_headers"]
    assert payload["rendered_rows"][1]["id"] == "finding:correction_on_iob"
    assert payload["rendered_rows"][1]["case_header"]["finding_id"] == (
        "finding:correction_on_iob"
    )


def test_selected_high_retains_upstream_suspend_evidence():
    prepared = _prepared(Lever.MISSED_MEAL)
    anchor = prepared.members[Lever.MISSED_MEAL][0].opportunity.anchor_t
    prepared.basal = (BasalEvent(
        t=anchor - timedelta(minutes=60), delivery_type="suspended",
        basal_rate=0, profile_basal_rate=0.8,
    ),)
    prepared.carbs = (CarbEntry(
        t=anchor - timedelta(minutes=20), grams=15, certainty="exact", source="manual",
    ),)
    occurrence_id = prepared.members[Lever.MISSED_MEAL][0].id
    case = prepared.case("finding:missed_meal", "event", occurrence_id)
    suspend = next(marker for marker in case["selection"]["detail"]["markers"]
                   if marker["kind"] == "suspend")
    assert suspend["minute"] == -30
    assert suspend["profile_basal_rate"] == 0.8
    rescue = next(marker for marker in case["selection"]["detail"]["markers"]
                  if marker["kind"] == "rescue_carb")
    assert rescue["minute"] == 10
    assert rescue["grams"] == 15


def test_missed_meal_comparison_uses_attribution_winners_and_completed_meals():
    first = _opportunity(Lever.MISSED_MEAL)
    second = _opportunity(Lever.MISSED_MEAL, anchor=first.anchor_t + timedelta(hours=2))
    # A classifier match can be fired while attribution awards the High to a
    # different Lever; only the claimed winner belongs in this comparison.
    members = (Member(first, first.anchor_t, "fired"),
               Member(second, second.anchor_t, "fired"))
    prepared = _prepared(Lever.MISSED_MEAL, members, frozenset({members[0].id}))
    announced = BolusEvent(t=first.anchor_t - timedelta(hours=1), insulin=4, carbs=40,
                           completion="Completed", seq_num=99)
    cancelled = BolusEvent(t=first.anchor_t - timedelta(hours=2), insulin=4, carbs=40,
                           completion="Cancelled", seq_num=98)
    zero_insulin = BolusEvent(t=first.anchor_t - timedelta(hours=3), insulin=0, carbs=40,
                              completion="Completed", seq_num=97)
    future = BolusEvent(t=first.anchor_t + timedelta(days=2), insulin=4, carbs=40,
                        completion="Completed", seq_num=96)
    prepared.bolus = (announced, cancelled, zero_insulin, future)
    prepared.cgm = tuple(
        CgmReading(t, 100, "EGV")
        for anchor in (first.reach_start, announced.t)
        for t in (anchor - timedelta(minutes=60), anchor, anchor + timedelta(minutes=300))
    )

    case = prepared.case("finding:missed_meal", "event", None)
    missed, near, baseline = case["projection"]["cohorts"]

    assert missed["occurrence_ids"] == [members[0].id]
    assert near["routed_count"] == 0
    assert baseline["routed_count"] == 1
    assert baseline["occurrence_ids"][0].startswith("m_")
    # The second High fired without the attribution win, so it is in no cohort.
    assert case["projection"]["counts"] == {
        "matched": 1, "nearly_matched": 0, "comparison": 1,
        "outside_comparison": 1,
    }
    assert missed["points"][0]["minute"] == -60
    assert missed["points"][-1]["minute"] == 300
    assert baseline["points"][0]["n"] == 1
    assert missed["points"][0]["n"] == 1
    selected = prepared.case("finding:missed_meal", "event", baseline["occurrence_ids"][0])
    assert selected["selection"]["state"] == "selected"
    assert selected["selection"]["detail"]["comparison_cohort"] == "comparison"


def test_missed_meal_selection_uses_truthful_onset_bg_and_cross_midnight_date():
    peak = datetime(2026, 8, 2, 0, 30)
    opportunity = _opportunity(Lever.MISSED_MEAL, anchor=peak)
    opportunity = Opportunity(
        opportunity.family, opportunity.source_key, opportunity.anchor_t,
        opportunity.anchor_kind, 280, reach_start=datetime(2026, 8, 1, 23, 45),
    )
    member = Member(opportunity, peak, "fired")
    prepared = _prepared(Lever.MISSED_MEAL, (member,), frozenset({member.id}))
    prepared.cgm = (
        CgmReading(datetime(2026, 8, 1, 23, 45), 145, "EGV"),
        CgmReading(peak, 280, "EGV"),
    )

    case = prepared.case("finding:missed_meal", "event", member.id)
    roster_row = case["occurrences"][0]
    detail = case["selection"]["detail"]

    assert roster_row["date"] == "2026-08-02"
    assert roster_row["anchor"]["bg"] == 280
    assert roster_row["comparison_anchor"]["bg"] == 145
    assert detail["anchor"] == roster_row["comparison_anchor"]
    assert detail["date"] == detail["day_target"]["date"] == "2026-08-01"
    assert next(point for point in detail["glucose"] if point["minute"] == 0)["bg"] == 145


def test_missed_meal_comparison_explicitly_serves_an_empty_attributed_cohort():
    prepared = _prepared(Lever.MISSED_MEAL, claimed=frozenset(),
                         findings=_findings(Lever.MISSED_MEAL, episodes=0))
    prepared.members[Lever.MISSED_MEAL] = (
        Member(prepared.members[Lever.MISSED_MEAL][0].opportunity,
               prepared.members[Lever.MISSED_MEAL][0].outcome_t, "outranked"),
    )
    prepared.recurrence[Lever.MISSED_MEAL] = (0, 1)

    case = prepared.case("finding:missed_meal", "event", None)

    assert case["projection"]["cohorts"][0]["routed_count"] == 0
    assert case["projection"]["counts"]["outside_comparison"] == 1


def _six_missed_meal_highs():
    """Six synthetic Highs: two attributed to Missed / unannounced meal, one near
    miss and three others, beside one announced completed carb-bolus meal."""
    first = _opportunity(Lever.MISSED_MEAL)
    highs = [_opportunity(Lever.MISSED_MEAL, anchor=first.anchor_t + timedelta(hours=8 * index))
             for index in range(6)]
    members = tuple(Member(high, high.anchor_t, verdict) for high, verdict in zip(
        highs, ("fired", "fired", "near_miss", "outranked", "no_data", "clean")))
    prepared = _prepared(Lever.MISSED_MEAL, members,
                         frozenset(member.id for member in members[:2]),
                         findings=_findings(Lever.MISSED_MEAL, episodes=2))
    announced = BolusEvent(t=first.anchor_t - timedelta(hours=2), insulin=4, carbs=40,
                           completion="Completed", seq_num=99)
    prepared.bolus = (announced,)
    prepared.cgm = tuple(sorted(
        (CgmReading(anchor + timedelta(minutes=minute), 100 + minute / 10, "EGV")
         for anchor in [high.reach_start for high in highs] + [announced.t]
         for minute in (-60, 0, 300)),
        key=lambda row: row.t,
    ))
    return prepared


def test_missed_meal_counts_its_highs_outside_the_announced_comparison():
    case = _six_missed_meal_highs().case("finding:missed_meal", "event", None)
    counts = case["projection"]["counts"]

    assert case["summary"] == {"claimed": 2, "denominator": 6, "noun": "highs"}
    assert counts == {"matched": 2, "nearly_matched": 1, "comparison": 1,
                      "outside_comparison": 3}
    assert counts["outside_comparison"] == (
        case["summary"]["denominator"] - counts["matched"] - counts["nearly_matched"])
    # Its attributed Matched cohort is a subset of the Meets criteria Highs, so it
    # names no band state; Nearly matched is exactly the Borderline Highs.
    assert [(cohort["key"], cohort["band_verdict"])
            for cohort in case["projection"]["cohorts"]] == [
        ("matched", None), ("nearly_matched", "near_miss"), ("comparison", None),
    ]
    # ADR 468: a cross-population comparison holds no roster Occurrence, so it
    # serves no band state; neither does the attributed Matched subset.
    assert [cohort["band_states"] for cohort in case["projection"]["cohorts"]] == [
        [], ["near_miss"], [],
    ]


def test_pattern_member_associations_are_evidence_only():
    lever = Lever.CARB_UNDERCOUNT
    findings = _pattern_findings("highs_after_meals", [lever], k=0, n=1,
                                 rate_levers=[lever])
    source = {"t": "2026-08-01 12:30:00", "kind": "meal",
              "bg": None, "insulin": 4, "carbs": 40,
              "cause_lever": None, "attributed_levers": [], "verdicts": [],
              "member_associations": ["habit:carb_undercount"]}
    prepared = _prepared(lever, findings=findings,
                         exposures={"exposures": {"meals": {"occurrences": [source]}}})
    case = prepared.case("pattern:highs_after_meals", "clock", None)
    assert case["summary"] == {"claimed": 0, "denominator": 1, "noun": "meals"}
    assert case["occurrences"][0]["member"] == "clean"
    assert case["occurrences"][0]["member_associations"] == ["habit:carb_undercount"]
    assert case["occurrences"][0]["anchor"] == {
        "t": "2026-08-01 12:30:00", "kind": "meal", "label": "Completed carb bolus",
        "bg": None, "insulin": 4, "carbs": 40}


@pytest.mark.parametrize("lever", ["high_carb_sequence", "repeat_eating"])
@pytest.mark.parametrize("covered", [False, True])
def test_sequence_preparation_and_pattern_case_share_producer_counts(lever, covered):
    from tests.test_findings_projection import sequence_products, seed_sequence_store
    from ciq_autotune.analyzers.scenario import build_scenarios
    from ciq_autotune.explore_exposures import build_exposures
    from ciq_autotune.analyzers.eating_sequences import build_eating_sequence_report, report_dict
    projection, (bolus, cgm, _, _) = sequence_products(lever, covered=covered)
    with Store.open(":memory:") as store:
        seed_sequence_store(store, bolus, cgm)
        scenarios = build_scenarios(store, window_days=30).to_dict()
        exposures = build_exposures(store, window_days=30)
        prepared = finding_case_file.prepare(
            store, query=WindowQuery.whole_day(), version=0, analysis=projection._analysis,
            exposures=exposures, scenarios=scenarios, analysis_generation="sequence:0",
        )
        report = report_dict(build_eating_sequence_report(store, window_days=30))
    body = wrap(prepared)
    assert not any(r["finding_id"] == f"finding:{lever}" for r in body["withheld_findings"])
    cause = prepared.case(f"finding:{lever}", "event", None)
    assert cause["summary"]["claimed"] == 8
    assert cause["summary"]["denominator"] == (40 if lever == "high_carb_sequence" else 16)
    assert cause["analysis_generation"] == body["findings"]["analysis_generation"] == "sequence:0"
    assert cause["projection"]["report"] == body["eating_sequence_report"] == report
    assert cause["projection"]["kind"] == "eating-sequence"
    if lever == "repeat_eating":
        assert "response" not in cause["projection"]
    selected_id = next(r["id"] for r in cause["occurrences"] if r["attributed"])
    selected = prepared.case(f"finding:{lever}", "event", selected_id)
    assert selected["selection"]["state"] == "selected"
    assert selected["selection"]["detail"]["sequence"]["member_event_ids"]
    assert selected["selection"]["detail"]["episodes"]
    parent_row = next(r for r in body["rendered_rows"] if r["id"] == "pattern:highs_after_meals")
    parent = prepared.case(parent_row["id"], "clock", None)
    assert parent["summary"]["claimed"] == parent_row["pattern"]["k"]
    assert parent["summary"]["denominator"] == parent_row["pattern"]["n"]
    assert parent["population"] == "meals"
    associated = [r for r in parent["occurrences"] if f"habit:{lever}" in r.get("member_associations", [])]
    assert bool(associated) == covered
    assert all(r["member"] != f"habit:{lever}" for r in parent["occurrences"])
    assert len(parent["occurrences"]) == len(exposures["exposures"]["meals"]["occurrences"])


def test_high_carb_sequence_case_serves_the_retained_response_evidence():
    from tests.test_findings_projection import sequence_products, seed_sequence_store
    from ciq_autotune.analyzers.scenario import build_scenarios
    from ciq_autotune.explore_exposures import build_exposures
    projection, (bolus, cgm, _, _) = sequence_products("high_carb_sequence")
    with Store.open(":memory:") as store:
        seed_sequence_store(store, bolus, cgm)
        prepared = finding_case_file.prepare(
            store, query=WindowQuery.whole_day(), version=0, analysis=projection._analysis,
            exposures=build_exposures(store), scenarios=build_scenarios(store).to_dict(),
            analysis_generation="sequence:0",
        )

    case = prepared.case("finding:high_carb_sequence", "event", None)

    response = case["projection"]["response"]
    assert response["schema"] == "high-carb-sequence-response-v1"
    assert response["alignment"] == "event"
    assert response["anchor"] == {"kind": "sequence_end", "label": "End of eating sequence"}
    assert response["window_min"] == [0, 360]
    assert response["scope"] == "pooled"
    assert response["period"] == "post_6h"
    assert response["source_window"] == prepared.sequence_report["window"]
    assert response["summary"] == prepared.sequence_report["high_carb_sequence"]["finding"]["summary"]
    assert response["comparisons"] == [
        item for item in prepared.sequence_report["high_carb_sequence"]["comparisons"]
        if item["scope"] == response["scope"]
    ]
    assert [item["period"] for item in response["comparisons"]] == [
        "in_sequence", "post_4h", "post_6h",
    ]
    assert response["comparison"] == {"name": "Other sequences", "state": "available"}
    assert [(cohort["key"], cohort["name"], cohort["routed_count"])
            for cohort in response["cohorts"]] == [
                ("matched", "Highest-carb fifth", 8),
                ("comparison", "Other sequences", 32),
            ]
    selected_id = response["cohorts"][0]["occurrence_ids"][0]
    selected = prepared.case("finding:high_carb_sequence", "event", selected_id)
    detail = selected["selection"]["detail"]
    assert selected["analysis_generation"] == "sequence:0"
    assert detail["comparison_cohort"] == "matched"
    assert detail["glucose"]
    assert response["cohorts"][0]["points"][0]["minute"] == 0
    assert response["cohorts"][0]["points"][-1]["minute"] == 355
    assert all(response["window_min"][0] <= point["minute"] < response["window_min"][1]
               for point in detail["glucose"])
    row = next(row for row in wrap(prepared)["findings"]["rows"]
               if row["id"] == "finding:high_carb_sequence")
    assert row["headline"] == "Glucose after high-carb eating"
    assert "%" in response["summary"] and "n = 8 vs 32" in response["summary"]


def test_high_carb_response_rejects_missing_or_incoherent_retained_metadata():
    from tests.test_findings_projection import sequence_products, seed_sequence_store
    from ciq_autotune.analyzers.scenario import build_scenarios
    from ciq_autotune.explore_exposures import build_exposures
    projection, (bolus, cgm, _, _) = sequence_products("high_carb_sequence")
    with Store.open(":memory:") as store:
        seed_sequence_store(store, bolus, cgm)
        prepared = finding_case_file.prepare(
            store, query=WindowQuery.whole_day(), version=0, analysis=projection._analysis,
            exposures=build_exposures(store), scenarios=build_scenarios(store).to_dict(),
        )

    for mutation in (
        lambda candidate: candidate["response"].clear(),
        lambda candidate: candidate["response"].pop("scope"),
        lambda candidate: candidate["response"].__setitem__(
            "comparisons", candidate["response"]["comparisons"][:2]),
        lambda candidate: candidate["response"].__setitem__("source_window", None),
        lambda candidate: candidate["response"]["comparisons"][0].__setitem__(
            "period", "post_4h"),
        lambda candidate: candidate["population"][0].pop("candidate"),
    ):
        malformed = deepcopy(prepared)
        candidate = malformed.exposures["sequence_evidence"]["high_carb_sequence"]
        mutation(candidate)
        with pytest.raises(InconsistentProjection, match="inconsistent_projection"):
            malformed.case("finding:high_carb_sequence", "event", None)


def test_high_carb_response_rejects_a_report_from_another_manufactured_generation():
    from ciq_autotune.analyzers.eating_sequences import build_eating_sequence_report, report_dict
    from tests.test_findings_projection import sequence_products, seed_sequence_store
    from ciq_autotune.analyzers.scenario import build_scenarios
    from ciq_autotune.explore_exposures import build_exposures
    projection, (bolus, cgm, _, _) = sequence_products("high_carb_sequence")
    _, (later_bolus, later_cgm, later_log, _) = sequence_products(
        "high_carb_sequence", covered=True)
    with Store.open(":memory:") as later_store:
        seed_sequence_store(later_store, later_bolus, later_cgm, later_log)
        later_report = report_dict(build_eating_sequence_report(later_store, window_days=30))
    with Store.open(":memory:") as store:
        seed_sequence_store(store, bolus, cgm)
        prepared = finding_case_file.prepare(
            store, query=WindowQuery.whole_day(), version=0, analysis=projection._analysis,
            exposures=build_exposures(store), scenarios=build_scenarios(store).to_dict(),
            analysis_generation="sequence:later", sequence_report=later_report,
        )

    with pytest.raises(InconsistentProjection, match="inconsistent_projection"):
        prepared.case("finding:high_carb_sequence", "event", None)


def test_in_sequence_response_uses_real_intervals_end_anchor_and_outward_axis():
    from ciq_autotune.analyze import analyze
    from ciq_autotune.analyzers.eating_sequence_config import EatingSequenceConfig
    from ciq_autotune.analyzers.eating_sequences import evaluate_sequences
    from ciq_autotune.analyzers.scenario import build_scenarios
    from ciq_autotune.explore_exposures import build_exposures
    from tests.eating_sequence_streams import sequence_episode_stream
    from tests.test_findings_projection import seed_sequence_store
    bolus, cgm, log, _ = sequence_episode_stream("high_carb_sequence")
    bolus.append(BolusEvent(
        bolus[-1].t + timedelta(minutes=31), carbs=1, insulin=.5, seq_num=99999,
    ))
    bolus.sort(key=lambda item: item.t)
    initial = evaluate_sequences(
        bolus, cgm, log, window_start=cgm[0].t, window_end=cgm[-1].t,
        config=EatingSequenceConfig(),
    )
    candidate_ends = {
        item.sequence.end
        for item in initial.populations["high_carb_sequence"] if item.candidate
    }
    cgm = [
        replace(reading, bg=270.0)
        if any(end <= reading.t < end + timedelta(minutes=25) for end in candidate_ends)
        else reading
        for reading in cgm
    ]
    with Store.open(":memory:") as store:
        seed_sequence_store(store, bolus, cgm, log)
        prepared = finding_case_file.prepare(
            store, query=WindowQuery.whole_day(), version=0,
            analysis=analyze(
                store, window_days=30, pool_agreeing_basal_regimes=True,
            ).to_dict(),
            exposures=build_exposures(store, window_days=30),
            scenarios=build_scenarios(store, window_days=30).to_dict(),
        )

    response = prepared.case("finding:high_carb_sequence", "event", None)["projection"]["response"]

    assert response["period"] == "in_sequence"
    assert response["anchor"] == {"kind": "sequence_end", "label": "End of eating sequence"}
    assert response["window_min"] == [-35, 5]
    assert response["cohorts"][0]["points"][1] == {
        "minute": -30, "n": 1, "support": "withheld",
        "median": None, "p25": None, "p75": None,
    }
    assert all(point["minute"] <= 0 for cohort in response["cohorts"]
               for point in cohort["points"])


def test_high_carb_response_excludes_confirmed_false_low_observations(monkeypatch):
    from ciq_autotune.analyzers.eating_sequence_config import EatingSequenceConfig
    from ciq_autotune.analyzers.eating_sequences import evaluate_sequences
    from tests.test_findings_projection import sequence_products, seed_sequence_store
    from ciq_autotune.analyzers.scenario import build_scenarios
    from ciq_autotune.explore_exposures import build_exposures
    projection, (bolus, cgm, _, _) = sequence_products("high_carb_sequence")
    evaluated = evaluate_sequences(
        bolus, cgm, (), window_start=cgm[0].t, window_end=cgm[-1].t,
        config=EatingSequenceConfig(),
    )
    source = next(item for item in evaluated.populations["high_carb_sequence"]
                  if item.candidate)
    excluded = next(row for row in cgm
                    if row.t == source.sequence.end + timedelta(minutes=10))
    records = lambda *_: [{"start": excluded.t, "end": excluded.t}]
    monkeypatch.setattr("ciq_autotune.explore_exposures.false_low_span_records", records)
    monkeypatch.setattr("ciq_autotune.finding_case_file.false_low_span_records", records)
    with Store.open(":memory:") as store:
        seed_sequence_store(store, bolus, cgm)
        prepared = finding_case_file.prepare(
            store, query=WindowQuery.whole_day(), version=0, analysis=projection._analysis,
            exposures=build_exposures(store), scenarios=build_scenarios(store).to_dict(),
        )

    response = prepared.case(
        "finding:high_carb_sequence", "event", None,
    )["projection"]["response"]
    selected = prepared.case(
        "finding:high_carb_sequence", "event", response["cohorts"][0]["occurrence_ids"][0],
    )

    point = next(point for point in response["cohorts"][0]["points"]
                 if point["minute"] == 10)
    assert point["n"] == 7
    assert all(datetime.fromisoformat(point["t"]) != excluded.t
               for point in selected["selection"]["detail"]["glucose"])


def test_scoped_sequence_roster_does_not_redefine_response_or_selection():
    from tests.test_findings_projection import sequence_products, seed_sequence_store
    from ciq_autotune.analyzers.scenario import build_scenarios
    from ciq_autotune.explore_exposures import build_exposures
    projection, (bolus, cgm, _, _) = sequence_products("high_carb_sequence")
    with Store.open(":memory:") as store:
        seed_sequence_store(store, bolus, cgm)
        prepared = finding_case_file.prepare(
            store, query=WindowQuery.clock(300, 420), version=0,
            analysis=projection._analysis, exposures=build_exposures(store),
            scenarios=build_scenarios(store).to_dict(),
        )

    case = prepared.case("finding:high_carb_sequence", "event", None)
    response = case["projection"]["response"]
    roster_ids = {item["id"] for item in case["occurrences"]}
    outside_id = next(item for cohort in response["cohorts"]
                      for item in cohort["occurrence_ids"] if item not in roster_ids)
    unavailable = prepared.case("finding:high_carb_sequence", "event", outside_id)

    assert len(case["occurrences"]) == 4
    assert sum(cohort["routed_count"] for cohort in response["cohorts"]) == 40
    assert response["source_window"] == prepared.sequence_report["window"]
    assert unavailable["selection"] == {
        "state": "unavailable", "requested_id": outside_id, "detail": None,
    }


def test_case_file_preserves_exposure_classifier_reach():
    from unittest.mock import patch
    from tests.test_eating_sequence_findings import _crossing_reach_stream
    from tests.test_meal_bolus_short_attribution import _seed
    from tests.test_outcomes_trend import _snapshot_with_ic
    from ciq_autotune.explore_exposures import build_exposures
    bolus, cgm, config = _crossing_reach_stream()
    with Store.open(":memory:") as store:
        _seed(store, bolus, cgm)
        store.upsert_settings_snapshot(bolus[0].t.strftime("%Y-%m-%d %H:%M:%S"),
                                       _snapshot_with_ic(40).settings)
        with patch("ciq_autotune.explore_exposures.ScenarioConfig", return_value=config):
            exposures = build_exposures(store)
        with patch("ciq_autotune.finding_case_file.ScenarioConfig", return_value=config):
            prepared = finding_case_file.prepare(
                store, query=WindowQuery.whole_day(), version=0, analysis={},
                exposures=exposures, scenarios={},
            )
    case = prepared.case("finding:carb_undercount", "event", None)
    assert case["summary"]["claimed"] == 1
    assert case["summary"]["denominator"] == 1
    assert case["occurrences"][0]["verdict"] == "fired"


@pytest.mark.parametrize("lever,meal_count", [("high_carb_sequence", 40), ("repeat_eating", 100)])
def test_sequence_habit_preserves_clean_pattern_meal_verdicts(lever, meal_count):
    from tests.test_findings_projection import sequence_products, seed_sequence_store
    projection, (bolus, cgm, _, _) = sequence_products(lever)
    with Store.open(":memory:") as store:
        seed_sequence_store(store, bolus, cgm)
        prepared = finding_case_file.prepare(
            store, query=WindowQuery.whole_day(), version=0,
            analysis=projection._analysis, exposures=projection._exposures,
            scenarios=projection._scenarios,
        )
    cause = prepared.case(f"finding:{lever}", "event", None)
    assert cause["summary"]["claimed"] == 8
    case = prepared.case("pattern:highs_after_meals", "clock", None)

    # Retain the same produced meal population, removing only the new habit
    # from the transport roster to pin the pre-sequence Pattern verdicts.
    baseline = deepcopy(prepared)
    parent = next(row for row in baseline.findings["rows"]
                  if row["id"] == "pattern:highs_after_meals")
    parent["pattern"]["members"] = [member for member in parent["pattern"]["members"]
                                     if member["subject"] != f"habit:{lever}"]
    before = baseline.case("pattern:highs_after_meals", "clock", None)
    assert before["verdict_counts"] == {
        "fired": 0, "outranked": 0, "near_miss": 0, "no_data": 0, "clean": meal_count,
    }
    assert case["occurrences"][0]["verdict"] == "clean"
    assert case["verdict_counts"] == before["verdict_counts"]
    assert case["summary"] == before["summary"] == {
        "claimed": 0, "denominator": meal_count, "noun": "meals",
    }


def _case(prepared, subject, alignment="clock", occ=None):
    if isinstance(subject, Lever):
        return prepared.case(None, alignment, occ, lever=subject)
    return prepared.case(subject, alignment, occ)


# (claimed, denominator, verdict counts in FINDING_VERDICTS order) for every case file
# the facts and reason tests read, measured on these recipes before any row served a
# fact or a reason. Serving them must move none of these accounts.
_MEAL_FACTS_ACCOUNTS = {
    "finding:carb_undercount": (2, 10, (2, 1, 3, 1, 3)),
    "finding:late_bolus": (1, 10, (1, 2, 0, 0, 7)),
    "finding:meal_bolus_short": (2, 10, (2, 0, 0, 0, 8)),
    "finding:missed_meal": (2, 6, (2, 2, 0, 0, 2)),
    "pattern:highs_after_meals": (5, 10, (5, 0, 1, 1, 3)),
    Lever.MEAL_OVER_DELIVERY: (0, 10, (0, 0, 0, 10, 0)),
    Lever.CORRECTION_STACKING: (0, 1, (0, 0, 0, 0, 1)),
}
_CORRECTION_STACKING_ACCOUNTS = {
    "finding:correction_stacking": (2, 7, (2, 0, 1, 0, 4)),
    "finding:missed_meal": (1, 1, (1, 0, 0, 0, 0)),
    "pattern:lows_after_correcting_highs": (2, 2, (2, 0, 0, 0, 0)),
}


def test_case_file_rows_serve_their_anchor_bolus_and_post_meal_arc(
    meal_facts, correction_stacking,
):
    for prepared, accounts in ((meal_facts, _MEAL_FACTS_ACCOUNTS),
                               (correction_stacking, _CORRECTION_STACKING_ACCOUNTS)):
        for subject, (claimed, denominator, counts) in accounts.items():
            case = _case(prepared, subject)
            assert (case["summary"]["claimed"], case["summary"]["denominator"]) == (
                claimed, denominator,
            ), subject
            assert case["verdict_counts"] == dict(zip(findings_projection.FINDING_VERDICTS,
                                                      counts)), subject

    arcs = {}

    def arc_outcome(kind, anchor):
        if not arcs:
            times = sorted(_RECIPE_MEALS)
            arcs.update(zip(times, outcomes_trend.meal_arcs(
                [datetime.strptime(t, _FMT) for t in times], meal_facts.sequence_cgm,
            )))
        arc = arcs[anchor]
        value, t = (arc.peak, arc.peak_t) if kind == "peak" else (arc.nadir, arc.nadir_t)
        return None if value is None else {
            "kind": kind, "bg": value, "t": t.strftime(_FMT),
            "minute": round((t - datetime.strptime(anchor, _FMT)).total_seconds() / 60, 1),
        }

    served = {}
    for subject, kind in (("finding:carb_undercount", "peak"), ("finding:late_bolus", "peak"),
                          ("finding:meal_bolus_short", "peak"),
                          ("pattern:highs_after_meals", "peak"),
                          (Lever.MEAL_OVER_DELIVERY, "nadir")):
        for alignment in ("clock", "event"):
            rows = {row["anchor"]["t"]: row
                    for row in _case(meal_facts, subject, alignment)["occurrences"]}
            assert set(rows) == set(_RECIPE_MEALS)
            for anchor, row in rows.items():
                facts = (row["anchor"]["bg"], row["anchor"].get("insulin"),
                         row["anchor"].get("carbs"))
                assert facts == (None, *_RECIPE_MEALS[anchor]), (subject, anchor)
                assert row.get("outcome", "absent") == arc_outcome(kind, anchor), (
                    subject, anchor,
                )
            served[subject] = {anchor: row.get("outcome") for anchor, row in rows.items()}
    # Read off the synthetic traces, independent of the arc read above.
    assert served["finding:meal_bolus_short"]["2024-05-24 12:05:00"] == {
        "kind": "peak", "bg": 360.0, "t": "2024-05-24 12:30:00", "minute": 25.0}
    assert served["pattern:highs_after_meals"]["2024-05-11 12:00:00"] == {
        "kind": "peak", "bg": 350.0, "t": "2024-05-11 14:30:00", "minute": 150.0}
    assert served["finding:carb_undercount"]["2024-05-06 08:00:00"] == {
        "kind": "peak", "bg": 120.0, "t": "2024-05-06 08:05:00", "minute": 5.0}
    nadirs = served[Lever.MEAL_OVER_DELIVERY]
    assert nadirs["2024-05-24 12:05:00"] == {
        "kind": "nadir", "bg": 120.0, "t": "2024-05-24 12:45:00", "minute": 40.0}
    assert nadirs["2024-05-11 12:00:00"] == {
        "kind": "nadir", "bg": 120.0, "t": "2024-05-11 14:35:00", "minute": 155.0}
    assert nadirs["2024-05-06 08:00:00"] is None  # the next meal lands ninety minutes on

    [cluster] = _case(meal_facts, Lever.CORRECTION_STACKING)["occurrences"]
    clusters = _case(correction_stacking, "finding:correction_stacking")["occurrences"]
    assert [(row["anchor"]["t"], row["anchor"]["bg"], row["anchor"].get("insulin"),
             row["anchor"].get("carbs", "absent"), row.get("outcome", "absent"))
            for row in (cluster, *clusters)] == [
        ("2024-05-12 13:10:00", None, 2.0, None, None),
        *((row["anchor"]["t"], None, 3.0, None, None) for row in clusters),
    ]

    glucose_rows = (_case(meal_facts, "finding:missed_meal")["occurrences"]
                    + _case(correction_stacking,
                            "pattern:lows_after_correcting_highs")["occurrences"])
    assert {row["anchor"]["kind"] for row in glucose_rows} == {"high", "low"}
    for row in glucose_rows:
        assert row["anchor"]["bg"] is not None
        assert [row["anchor"].get(key, "absent") for key in ("insulin", "carbs")] == [None, None]
        assert row.get("outcome", "absent") is None

    event = _case(meal_facts, "finding:missed_meal", "event")
    attributed = [row for row in event["occurrences"] if row["attributed"]]
    assert len(attributed) == 2
    for row in attributed:
        onset = row["comparison_anchor"]
        assert [onset.get(key, "absent") for key in ("insulin", "carbs")] == [None, None]
        detail = _case(meal_facts, "finding:missed_meal", "event", row["id"])["selection"]["detail"]
        assert detail["anchor"] == onset
    comparison = next(cohort for cohort in event["projection"]["cohorts"]
                      if cohort["key"] == "comparison")
    announced = _case(meal_facts, "finding:missed_meal", "event",
                      comparison["occurrence_ids"][0])["selection"]["detail"]
    anchor = announced["anchor"]["t"]
    assert (announced["anchor"].get("insulin"), announced["anchor"].get("carbs")) == (
        _RECIPE_MEALS[anchor])
    assert announced.get("outcome", "absent") == arc_outcome("peak", anchor)
    assert announced.get("reason") == {"cause": None, "habits": []}


_PRECEDENCE = {"fired": 4, "near_miss": 3, "outranked": 2, "no_data": 1, "clean": 0}
# The habit members each served Pattern judges in its own rate family, in roster
# order. Correction stacking is a Lows after correcting highs member, but it is
# judged over correction clusters, so a claimed low carries its cause and no entry.
_PATTERN_HABITS = {
    "pattern:highs_after_meals": ["carb_undercount"],
    "pattern:lows_after_correcting_highs": [],
}


def _recorded_sentence(verdicts, driver, lever, verdict, *, mapped):
    """The classifier sentence an entry may carry: only where the anchor's own recorded
    verdict reads as the entry's verdict (or as fired, on a mapped outranked entry)."""
    own = next((item for item in verdicts if item["classifier"] == lever), None)
    reads = findings_projection._occurrence_verdict(
        {"verdicts": list(verdicts), "cause_lever": driver}, lever,
    )
    agrees = reads == verdict or (mapped and (reads, verdict) == ("fired", "outranked"))
    return own["detail"] if own is not None and agrees else None


# The single-habit and Pattern case files pattern-near-tie serves a claimed row in.
_PATTERN_NEAR_TIE_SUBJECTS = ("finding:carb_undercount", "finding:over_treated_low",
                              "pattern:highs_after_meals")
# The claimed rows, per store and case file, whose claimant's recorded sentence is the
# cause's text, measured on these recipes: each would print that sentence twice.
_SERVED_ONCE = {
    ("meal_facts", "finding:carb_undercount"): 2,
    ("meal_facts", "finding:late_bolus"): 1,
    ("meal_facts", "finding:missed_meal"): 2,
    ("meal_facts", "pattern:highs_after_meals"): 2,
    ("correction_stacking", "finding:correction_stacking"): 2,
    ("correction_stacking", "finding:missed_meal"): 1,
    ("pattern_near_tie", "finding:carb_undercount"): 3,
    ("pattern_near_tie", "finding:over_treated_low"): 1,
    ("pattern_near_tie", "pattern:highs_after_meals"): 3,
}


def test_every_selected_reason_agrees_with_its_row(meal_facts, correction_stacking,
                                                    pattern_near_tie):
    subjects = ([("meal_facts", meal_facts, subject) for subject in _MEAL_FACTS_ACCOUNTS]
                + [("correction_stacking", correction_stacking, subject)
                   for subject in _CORRECTION_STACKING_ACCOUNTS]
                + [("pattern_near_tie", pattern_near_tie, subject)
                   for subject in _PATTERN_NEAR_TIE_SUBJECTS])
    sentences, once = 0, {}
    for store, prepared, subject in subjects:
        clock = _case(prepared, subject)
        claimed = {occurrence_id for bucket in clock["projection"]["clock"]["buckets"]
                   for occurrence_id in bucket["occurrence_ids"]}
        pattern = isinstance(subject, str) and subject.startswith("pattern:")
        lever = (subject if isinstance(subject, Lever) else
                 None if pattern else Lever(subject.removeprefix("finding:")))
        exposures = (prepared.pattern_exposures if pattern else prepared.exposures)["exposures"]
        for row in clock["occurrences"]:
            detail = _case(prepared, subject, "clock", row["id"])["selection"]["detail"]
            reason = detail.get("reason")
            assert reason is not None and set(reason) == {"cause", "habits"}, (subject, row)
            if clock["family"] == "correction_clusters":
                member = next(item for item in prepared.members[lever] if item.id == row["id"])
                verdicts, driver, text = member.recorded, member.driver, None
                assert len(verdicts) == 1
            else:
                source = next(item for item in exposures[{"meal": "meals", "low": "lows",
                                                          "high": "highs"}[row["anchor"]["kind"]]]
                              ["occurrences"] if item["t"] == row["anchor"]["t"])
                verdicts, driver, text = source["verdicts"], source["cause_lever"], source["text"]
            if row["id"] in claimed:
                claimant = row["member"].removeprefix("habit:") if pattern else lever.value
                assert row["verdict"] == "fired"
                assert {key: reason["cause"][key] for key in ("lever", "title")} == {
                    "lever": claimant, "title": title(Lever(claimant))}
                if pattern:
                    assert reason["cause"]["text"] == (text if driver == claimant else "")
                else:
                    assert reason["cause"]["text"]
                    if driver == claimant:
                        assert reason["cause"]["text"] == text
            else:
                assert reason["cause"] is None, (subject, row)
            entries = [(entry["lever"], entry["verdict"]) for entry in reason["habits"]]
            if pattern:
                assert [name for name, _ in entries] == _PATTERN_HABITS[subject]
                if row["id"] in claimed:
                    assert all(verdict == "fired" for name, verdict in entries if name == claimant)
                else:
                    assert row["verdict"] == max([verdict for _, verdict in entries] or ["clean"],
                                                 key=_PRECEDENCE.get)
            else:
                assert entries == [(lever.value, row["verdict"])]
            # Each sentence is served once (ADR 454): no habit entry repeats the cause.
            if reason["cause"] is not None:
                assert reason["cause"]["text"] not in [entry["detail"] for entry in reason["habits"]], (
                    subject, row["anchor"]["t"], reason)
            for entry in reason["habits"]:
                assert entry["title"] == title(Lever(entry["lever"]))
                recorded = _recorded_sentence(
                    verdicts, driver, entry["lever"], entry["verdict"],
                    mapped=pattern and row["id"] not in claimed,
                )
                # The claimant's sentence that is the cause's text is served there alone.
                repeats = (reason["cause"] is not None
                           and entry["lever"] == reason["cause"]["lever"]
                           and recorded == reason["cause"]["text"])
                assert entry["detail"] == (None if repeats else recorded), (
                    subject, row["anchor"]["t"], entry)
                sentences += entry["detail"] is not None
                once[store, subject] = once.get((store, subject), 0) + repeats
    assert sentences > 0
    # The rule reached every claimed row that would have repeated its sentence.
    assert {key: count for key, count in once.items() if count} == _SERVED_ONCE
    # The Correction stacking verdict `_population` computes is what judges a cluster:
    # every matched or nearly matched one serves the classifier's own sentence once, a
    # claimed cluster as its cause's text and a nearly matched one on its entry.
    for row in _case(correction_stacking, "finding:correction_stacking")["occurrences"]:
        reason = _case(correction_stacking, "finding:correction_stacking", "clock",
                       row["id"])["selection"]["detail"]["reason"]
        [entry] = reason["habits"]
        if row["verdict"] == "fired":
            assert reason["cause"]["text"] and entry["detail"] is None, row
        elif row["verdict"] == "near_miss":
            assert entry["detail"], row


def test_meal_claimed_by_meal_bolus_short_inside_highs_after_meals(meal_facts):
    case = _case(meal_facts, "pattern:highs_after_meals")
    row = next(item for item in case["occurrences"]
               if item["anchor"]["t"] == "2024-05-11 12:00:00")
    assert (row["member"], row["verdict"]) == ("habit:meal_bolus_short", "fired")
    source = next(item for item in meal_facts.pattern_exposures["exposures"]["meals"]
                  ["occurrences"] if item["t"] == row["anchor"]["t"])
    # Meal bolus short is judged at the rise, so the meal's own episode has no driver.
    assert (source["cause_lever"], source["attributed_levers"]) == (None, ["meal_bolus_short"])
    sentence = {item["classifier"]: item["detail"] for item in source["verdicts"]}
    detail = _case(meal_facts, "pattern:highs_after_meals", "clock",
                   row["id"])["selection"]["detail"]
    assert detail["reason"] == {
        "cause": {"lever": "meal_bolus_short", "title": title(Lever.MEAL_BOLUS_SHORT),
                  "text": ""},
        "habits": [
            {"lever": "carb_undercount", "title": title(Lever.CARB_UNDERCOUNT),
             "verdict": "near_miss", "detail": sentence["carb_undercount"]},
        ],
    }
    assert sentence["carb_undercount"]
    assert detail["anchor"] == row["anchor"] and detail["outcome"] == row["outcome"]


def test_a_cancelled_bolus_inside_the_grace_joins_its_meal_and_a_cluster_reads_its_second_dose():
    prepared = _analyzer_prepared(_edge_facts_recipe)

    # ADR 470: the bolus that never completed lands exactly 30 minutes after the noon
    # meal, inside the inclusive grace, so it is part of that meal. The meal counts its
    # completed carbs once and every dose delivered, lists as one row, and its arc
    # reads past the cancelled leg rather than ending at it.
    noon = ("2024-05-02 12:00:00", 6.0, 40.0)
    peak = {"kind": "peak", "bg": 170.0, "t": "2024-05-02 12:50:00", "minute": 50.0}
    for lever in (Lever.MEAL_BOLUS_SHORT, Lever.CARB_UNDERCOUNT):
        [meal] = _case(prepared, lever)["occurrences"]
        assert (meal["anchor"]["t"], meal["anchor"].get("insulin"),
                meal["anchor"].get("carbs")) == noon
        assert meal.get("outcome") == peak
    # The nadir reads the readings the analyzer judged, so the confirmed false low
    # after the meal is never its Arc nadir.
    [meal] = _case(prepared, Lever.MEAL_OVER_DELIVERY)["occurrences"]
    assert meal.get("outcome") == {"kind": "nadir", "bg": 120.0, "t": "2024-05-02 13:35:00",
                                   "minute": 95.0}
    [cluster] = _case(prepared, Lever.CORRECTION_STACKING)["occurrences"]
    assert (cluster["anchor"]["t"], cluster["anchor"].get("insulin"),
            cluster["anchor"].get("carbs", "absent")) == ("2024-05-02 16:30:00", 2.5, None)
    detail = _case(prepared, Lever.CORRECTION_STACKING, "clock", cluster["id"])["selection"]["detail"]
    assert [row["insulin"] for row in detail["source_corrections"]] == [1.5, 2.5]


def test_a_split_meal_is_one_row_with_its_summed_dose_and_the_peak_past_its_top_up():
    """ADR 470: a top-up ten minutes after the meal joins it, so the Highs after meals
    case file lists one row per meal, and that row's Arc peak reads past the top-up."""
    from tests.test_outcome_patterns import write_split_meals

    prepared = _analyzer_prepared(lambda store: write_split_meals(store, gap=10))
    case = prepared.case("pattern:highs_after_meals", "event", None)

    assert case["summary"] == {"claimed": 14, "denominator": 14, "noun": "meals"}
    assert len(case["occurrences"]) == 14
    assert {(row["anchor"]["t"][11:], row["anchor"]["insulin"], row["anchor"]["carbs"])
            for row in case["occurrences"]} == {("12:00:00", 6.5, 65.0)}
    assert {(row["outcome"]["kind"], row["outcome"]["bg"], row["outcome"]["minute"])
            for row in case["occurrences"]} == {("peak", 360.0, 125.0)}


def test_every_meal_counted_as_running_high_prints_a_peak_above_the_line():
    """ADR 461: a fired Highs after meals row is a meal that ran above 180, and the
    Arc peak it prints is the reading its verdict judged."""
    from tests.test_outcome_patterns import write_late_meals, write_split_meals

    for label, recipe in (
        ("split meals", lambda store: write_split_meals(store, gap=10)),
        ("late meals with a top-up", lambda store: write_late_meals(
            store, post_peak=240.0, top_up=True)),
        ("late meals that stayed in range", lambda store: write_late_meals(
            store, post_peak=165.0)),
    ):
        case = _analyzer_prepared(recipe).case("pattern:highs_after_meals", "event", None)
        # A store where no meal ran high serves no Highs after meals case at all.
        fired = [row for row in (case or {"occurrences": []})["occurrences"]
                 if row["verdict"] == "fired"]
        assert all(row["outcome"]["bg"] > 180 for row in fired), (
            label, [row["outcome"] for row in fired])


def test_a_reason_never_shows_a_sentence_its_row_contradicts():
    lever = Lever.LATE_BOLUS
    first = _opportunity(lever)
    second_anchor = first.anchor_t + timedelta(hours=3)
    second = _meal_opportunity(BolusEvent(t=second_anchor, insulin=4, carbs=40, seq_num=12))
    calm = {"classifier": "late_bolus", "matched": False, "silence_reason": "no_trigger",
            "detail": "Synthetic calm sentence."}
    near = {"classifier": "late_bolus", "matched": False,
            "silence_reason": "under_threshold", "detail": "Synthetic near sentence."}
    # Fired by association while its own recorded verdict reads calm.
    members = (Member(first, first.anchor_t, "fired", recorded=(calm,),
                      claim_text="Synthetic claim narrative."),
               Member(second, second_anchor, "near_miss", recorded=(near,)))
    prepared = _prepared(lever, members, frozenset({members[0].id}))

    def reason(prepared, member):
        return prepared.case("finding:late_bolus", "clock",
                             member.id)["selection"]["detail"]["reason"]

    entry = {"lever": "late_bolus", "title": title(lever)}
    assert reason(prepared, members[0]) == {
        "cause": {**entry, "text": "Synthetic claim narrative."},
        "habits": [{**entry, "verdict": "fired", "detail": None}]}
    assert reason(prepared, members[1]) == {
        "cause": None,
        "habits": [{**entry, "verdict": "near_miss", "detail": "Synthetic near sentence."}]}
    # A Member built with the defaults still explains a claimed, fired row.
    plain = _prepared(lever)
    assert reason(plain, plain.members[lever][0]) == {
        "cause": {**entry, "text": ""},
        "habits": [{**entry, "verdict": "fired", "detail": None}]}


def test_a_pattern_cause_carries_only_its_claimants_own_narrative():
    findings = _pattern_findings(
        "highs_after_meals", (Lever.CARB_UNDERCOUNT,), k=2, n=2,
        rate_levers=(Lever.CARB_UNDERCOUNT, Lever.MEAL_BOLUS_SHORT),
    )

    def meal(stamp, cause, claims, text, *, matched):
        return {"ep_id": f"ep-{stamp}", "t": stamp, "date": stamp[:10], "kind": "meal",
                "bg": None, "insulin": 4.0, "carbs": 40.0, "attributed": cause is not None,
                "attributed_levers": claims, "cause_lever": cause, "text": text,
                "verdicts": [{"classifier": "carb_undercount", "matched": matched,
                              "silence_reason": None if matched else "no_trigger",
                              "detail": f"Synthetic sentence at {stamp[11:16]}."}]}

    prepared = _prepared(Lever.CARB_UNDERCOUNT, findings=findings, exposures={
        "exposures": {"meals": {"n": 3, "occurrences": [
            meal("2026-08-01 12:30:00", "carb_undercount", ["carb_undercount"],
                 "Synthetic carb-undercount narrative.", matched=True),
            # Another lever drove this meal's episode; Meal bolus short claims it.
            meal("2026-08-01 18:30:00", "meal_over_delivery",
                 ["meal_over_delivery", "meal_bolus_short"],
                 "Synthetic over-delivery narrative.", matched=False),
            # Carb undercount matched, but no rate lever claims the meal: outranked.
            meal("2026-08-02 12:30:00", "meal_over_delivery", ["meal_over_delivery"],
                 "Synthetic over-delivery narrative.", matched=True),
        ]}}})
    case = prepared.case("pattern:highs_after_meals", "clock", None)
    reasons = [prepared.case("pattern:highs_after_meals", "clock",
                             row["id"])["selection"]["detail"]["reason"]
               for row in case["occurrences"]]

    assert [(row["member"], row["verdict"]) for row in case["occurrences"]] == [
        ("habit:carb_undercount", "fired"), ("habit:meal_bolus_short", "fired"),
        ("clean", "outranked")]
    assert [item["cause"] for item in reasons] == [
        {"lever": "carb_undercount", "title": title(Lever.CARB_UNDERCOUNT),
         "text": "Synthetic carb-undercount narrative."},
        {"lever": "meal_bolus_short", "title": title(Lever.MEAL_BOLUS_SHORT), "text": ""},
        None,
    ]
    entry = {"lever": "carb_undercount", "title": title(Lever.CARB_UNDERCOUNT)}
    assert [item["habits"] for item in reasons] == [
        [{**entry, "verdict": "fired", "detail": "Synthetic sentence at 12:30."}],
        [{**entry, "verdict": "outranked", "detail": "Synthetic sentence at 18:30."}],
        [{**entry, "verdict": "outranked", "detail": "Synthetic sentence at 12:30."}],
    ]


def test_an_announced_meal_serves_its_bolus_and_no_glucose_the_analyzer_did_not_compute():
    first = _opportunity(Lever.MISSED_MEAL)
    member = Member(first, first.anchor_t, "fired")
    prepared = _prepared(Lever.MISSED_MEAL, (member,), frozenset({member.id}))
    # The pump calculator recorded a glucose on the bolus itself.
    announced = BolusEvent(t=first.anchor_t - timedelta(hours=1), insulin=4, carbs=40, bg=183,
                           completion="Completed", seq_num=99)
    prepared.bolus = (announced,)
    prepared.cgm = tuple(
        CgmReading(t, 100, "EGV")
        for anchor in (first.reach_start, announced.t)
        for t in (anchor - timedelta(minutes=60), anchor, anchor + timedelta(minutes=300))
    )
    baseline = prepared.case("finding:missed_meal", "event", None)["projection"]["cohorts"][2]
    detail = prepared.case("finding:missed_meal", "event",
                           baseline["occurrence_ids"][0])["selection"]["detail"]

    assert detail["verdict"] == "comparison"
    assert {key: detail["anchor"][key] for key in ("kind", "bg", "insulin", "carbs")} == {
        "kind": "completed_carb_bolus", "bg": None, "insulin": 4, "carbs": 40}
