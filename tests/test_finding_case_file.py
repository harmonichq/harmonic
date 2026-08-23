"""Deep public projection contract for ADR 79 Finding case files."""

from copy import deepcopy
from datetime import datetime, timedelta
import json
import tempfile
import threading
import time

import pytest

from ciq_autotune import event_comparison, finding_case_file, findings_projection
from ciq_autotune.analyzers.scenario.levers import Exposure, Lever, exposure
from ciq_autotune.analyzers.scenario.opportunities import Opportunity
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading
from ciq_autotune.finding_case_file import (
    InconsistentProjection, Member, PreparedCases, wrap,
)
from ciq_autotune.window_membership import WindowQuery
from ciq_autotune.store import Store


def _opportunity(lever, *, anchor=None):
    anchor = anchor or datetime(2026, 8, 1, 12, 30)
    family = exposure(lever)
    if family is Exposure.MEALS:
        meal = BolusEvent(t=anchor, insulin=4, carbs=40, seq_num=11)
        return Opportunity(family, (11,), anchor, "meal", members=(meal,))
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


def _prepared(lever, members=None, claimed=None, *, query=None, findings=None,
              withheld=frozenset()):
    opportunity = _opportunity(lever)
    members = tuple(members or (Member(opportunity, opportunity.anchor_t, "fired"),))
    claimed = claimed or frozenset({members[0].id})
    cgm = tuple(CgmReading(t=opportunity.anchor_t + timedelta(minutes=minute),
                           bg=120 + minute, type="EGV")
                for minute in (-60, -5, 0, 5, 120, 300))
    return PreparedCases(
        "fp_" + "1" * 32, 0, query or WindowQuery.whole_day(),
        findings or _findings(lever),
        {lever: (len(claimed), len(members))},
        {item: members if item is lever else () for item in Lever},
        {item: claimed if item is lever else frozenset() for item in Lever},
        {item: () for item in Lever},
        withheld, cgm, (), tuple(opportunity.members), (), time.monotonic() + 60,
    )


@pytest.mark.parametrize("lever", list(Lever))
def test_all_eight_levers_publish_one_exact_case_file_population(lever):
    prepared = _prepared(lever)
    case = prepared.case(f"finding:{lever.value}", "event", None)

    assert set(case) == {"schema", "projection_id", "finding", "window", "family",
                         "summary", "verdict_counts", "occurrences", "projection",
                         "selection"}
    assert case["schema"] == "diagnose-finding-case-file-v1"
    assert case["summary"]["claimed"] == 1
    assert case["summary"]["denominator"] == len(case["occurrences"]) == 1
    assert sum(case["verdict_counts"].values()) == 1
    assert case["projection"]["alignment"] == "event"
    assert case["projection"]["clock"] is None
    assert [cohort["key"] for cohort in case["projection"]["cohorts"]] == [
        "fired", "outranked", "near_miss", "no_data", "clean",
    ]
    assert case["selection"] == {"state": "none", "requested_id": None, "detail": None}


def test_case_file_consumes_the_authoritative_verdict_order(monkeypatch):
    reordered = tuple(reversed(findings_projection.FINDING_VERDICTS))
    monkeypatch.setattr(findings_projection, "FINDING_VERDICTS", reordered)

    case = _prepared(Lever.LATE_BOLUS).case("finding:late_bolus", "event", None)
    _, authoritative_counts, _ = findings_projection._lever_evidence(
        Lever.LATE_BOLUS.value, ["meals"], {"meals": []},
    )

    assert tuple(authoritative_counts) == reordered
    assert tuple(case["verdict_counts"]) == reordered
    assert tuple(cohort["key"] for cohort in case["projection"]["cohorts"]) == reordered


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

    def fake_projection(store, *, window_days):
        observed.append(("queue", window_days))
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
        basal_events = cgm_readings = bolus_events = carb_entries = lambda self: []

    monkeypatch.setattr(findings_projection, "prepare_findings_projection", fake_projection)
    monkeypatch.setattr(finding_case_file, "_population", fake_population)
    prepared = finding_case_file.prepare(
        Store(), query=WindowQuery.whole_day(), version=0,
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
    assert case["projection"]["window_min"] == [-5, 10]


def test_factor_specific_event_horizons_and_far_pair_selected_evidence():
    expected = {
        Lever.CARB_UNDERCOUNT: [-60, 300],
        Lever.LATE_BOLUS: [-60, 300],
        Lever.MEAL_OVER_DELIVERY: [-60, 300],
        Lever.OVER_TREATED_LOW: [-300, 120],
        Lever.CORRECTION_ON_IOB: [-300, 120],
        Lever.CORRECTION_STACKING: [-90, 240],
        Lever.MISSED_MEAL: [-180, 0],
        Lever.MEAL_BOLUS_SHORT: [-180, 150],
    }
    for lever, window in expected.items():
        prepared = _prepared(lever)
        member = prepared.members[lever][0]
        case = prepared.case(f"finding:{lever.value}", "event", member.id)
        assert case["projection"]["window_min"] == window
        assert case["selection"]["state"] == "selected"
        detail = case["selection"]["detail"]
        assert set(detail) == {"id", "date", "anchor", "verdict", "glucose",
                               "markers", "source_corrections", "day_target"}
        if lever is Lever.CORRECTION_STACKING:
            assert [row["seq_num"] for row in detail["source_corrections"]] == [21, 22]
            assert detail["source_corrections"][0]["t"] == "2026-08-01 09:30:00"
        else:
            assert detail["source_corrections"] == []


def test_claimed_can_be_strictly_less_than_fired_and_clock_counts_only_claims():
    lever = Lever.LATE_BOLUS
    first = _opportunity(lever)
    second = Opportunity(Exposure.MEALS, (12,), first.anchor_t + timedelta(hours=1),
                         "meal", members=(BolusEvent(t=first.anchor_t + timedelta(hours=1),
                                                     insulin=3, carbs=30, seq_num=12),))
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
        "verdict_counts_by_family", "event_chart", "case_header",
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


def test_selected_high_retains_upstream_suspend_evidence():
    prepared = _prepared(Lever.MISSED_MEAL)
    anchor = prepared.members[Lever.MISSED_MEAL][0].opportunity.anchor_t
    prepared.basal = (BasalEvent(
        t=anchor - timedelta(minutes=60), delivery_type="suspended",
        basal_rate=0, profile_basal_rate=0.8,
    ),)
    occurrence_id = prepared.members[Lever.MISSED_MEAL][0].id
    case = prepared.case("finding:missed_meal", "event", occurrence_id)
    suspend = next(marker for marker in case["selection"]["detail"]["markers"]
                   if marker["kind"] == "suspend")
    assert suspend["minute"] == -60
    assert suspend["profile_basal_rate"] == 0.8
