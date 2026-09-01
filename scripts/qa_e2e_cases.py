"""Manufactured QA E2E store cases and their production-path expectations.

The catalog is the only owner of the synthetic case recipes.  The generator
materializes the showcase case, while the coverage test materializes each case
in its own temporary store.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from ciq_autotune.analyze import analyze
from ciq_autotune.analyzers.scenario import build_scenarios
from ciq_autotune.explore_exposures import build_exposures
from ciq_autotune.findings_projection import WindowQuery, prepare_findings_projection
from ciq_autotune.ic_history_events import prepare_ic_history_events
from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings


WINDOW_DAYS = 30


@dataclass(frozen=True)
class QaExpectation:
    """The complete rows this case must publish, plus the rows it must omit."""

    asserting_basal_slots: frozenset[str]
    behavioral_rows: frozenset[tuple[str, str, str]]
    finding_titles: frozenset[str]
    history_row_ids: frozenset[str] = frozenset()
    isf_rest_window_count: int = 0
    ic_history_series_count: int = 0


@dataclass(frozen=True)
class QaCase:
    """One named, isolated synthetic source window and its published contract."""

    name: str
    expectation: QaExpectation


@dataclass(frozen=True)
class QaExecution:
    """The published producer results built from one materialized case."""

    analysis: dict
    exposures: dict
    scenarios: dict
    findings: dict
    ic_history: dict


_SHOWCASE = "showcase"
_SETTING_RECOMMENDATION = "setting-recommendation"
_BEHAVIORAL_PRECEDENCE = "behavioral-precedence"
_BEHAVIORAL_ROWS = frozenset({
    ("lows", "2024-06-27 12:10:00", "near_miss"),
    ("correction_clusters", "2024-06-29 20:00:00", "clean"),
    ("lows", "2024-06-26 13:55:00", "fired"),
    ("lows", "2024-06-28 16:10:00", "no_data"),
    ("highs", "2024-06-26 14:35:00", "near_miss"),
    ("lows", "2024-06-28 12:10:00", "clean"),
    ("highs", "2024-06-25 14:00:00", "outranked"),
    ("lows", "2024-06-29 22:00:00", "fired"),
    ("meals", "2024-06-25 12:00:00", "fired"),
    ("correction_clusters", "2024-06-25 13:40:00", "clean"),
    ("meals", "2024-06-29 19:00:00", "no_data"),
})
# SYNTHETIC-FIXTURE: Exact analyzer output for the manufactured dense showcase.
_SHOWCASE_BEHAVIORAL_ROWS = frozenset({
    ("meals", "2024-06-01 08:00:00", "no_data"),
    ("meals", "2024-06-02 08:00:00", "no_data"),
    ("meals", "2024-06-03 08:00:00", "no_data"),
    ("meals", "2024-06-04 08:00:00", "no_data"),
    ("meals", "2024-06-05 08:00:00", "no_data"),
    ("meals", "2024-06-06 08:00:00", "no_data"),
    ("meals", "2024-06-07 08:00:00", "no_data"),
    ("meals", "2024-06-08 08:00:00", "no_data"),
    ("meals", "2024-06-09 08:00:00", "no_data"),
    ("meals", "2024-06-10 08:00:00", "no_data"),
    ("meals", "2024-06-11 08:00:00", "no_data"),
    ("meals", "2024-06-12 08:00:00", "no_data"),
    ("meals", "2024-06-13 08:00:00", "no_data"),
    ("meals", "2024-06-14 08:00:00", "no_data"),
    ("meals", "2024-06-15 08:00:00", "no_data"),
    ("meals", "2024-06-16 08:00:00", "no_data"),
    ("meals", "2024-06-17 08:00:00", "no_data"),
    ("meals", "2024-06-18 08:00:00", "no_data"),
    ("meals", "2024-06-19 08:00:00", "no_data"),
    ("meals", "2024-06-20 08:00:00", "no_data"),
    ("meals", "2024-06-21 08:00:00", "no_data"),
    ("meals", "2024-06-22 08:00:00", "no_data"),
    ("meals", "2024-06-23 08:00:00", "no_data"),
    ("meals", "2024-06-24 08:00:00", "no_data"),
    ("meals", "2024-06-25 08:00:00", "no_data"),
    ("meals", "2024-06-25 12:00:00", "no_data"),
    ("correction_clusters", "2024-06-25 13:40:00", "clean"),
    ("highs", "2024-06-25 14:00:00", "fired"),
    ("meals", "2024-06-26 08:00:00", "no_data"),
    ("lows", "2024-06-26 13:55:00", "fired"),
    ("highs", "2024-06-26 14:35:00", "near_miss"),
    ("meals", "2024-06-27 08:00:00", "no_data"),
    ("lows", "2024-06-27 12:10:00", "near_miss"),
    ("meals", "2024-06-28 08:00:00", "no_data"),
    ("lows", "2024-06-28 12:10:00", "clean"),
    ("lows", "2024-06-28 16:10:00", "no_data"),
    ("meals", "2024-06-29 08:00:00", "no_data"),
    ("meals", "2024-06-29 19:00:00", "no_data"),
    ("correction_clusters", "2024-06-29 20:00:00", "clean"),
    ("lows", "2024-06-29 22:00:00", "fired"),
    ("meals", "2024-06-30 08:00:00", "no_data"),
})

QA_CASES = (
    QaCase(
        _SHOWCASE,
        QaExpectation(
            frozenset({"03:00", "03:30"}),
            _SHOWCASE_BEHAVIORAL_ROWS,
            frozenset({"Basal 03:00 to 04:00 · lower", "Carb ratio All day. Past setting.", "Correction on active insulin", "Meal bolus fell short", "Over-treated low"}),
            frozenset({"ich1_WzAsMTQ0MCwiMTIiXQ"}),
            29,
            14,
        ),
    ),
    QaCase(
        _SETTING_RECOMMENDATION,
        QaExpectation(
            frozenset({"03:00", "03:30"}),
            frozenset(),
            frozenset({"Basal 03:00 to 04:00 · lower"}),
        ),
    ),
    QaCase(
        _BEHAVIORAL_PRECEDENCE,
        QaExpectation(
            frozenset(),
            _BEHAVIORAL_ROWS,
            frozenset({"Carb undercount", "Correction on active insulin", "Over-treated low"}),
        ),
    ),
)


def materialize_case(store, case: QaCase) -> None:
    """Write exactly one case's manufactured input rows into ``store``."""
    if case.name == _SHOWCASE:
        _materialize_showcase_background(store)
        _materialize_behavioral_precedence(store)
    elif case.name == _SETTING_RECOMMENDATION:
        _materialize_setting_recommendation(store)
    elif case.name == _BEHAVIORAL_PRECEDENCE:
        _materialize_behavioral_precedence(store)
    else:
        raise ValueError(f"unknown QA E2E case: {case.name}")


def execute_case(store) -> QaExecution:
    """Run the real fixed-window producer composition for one case store."""
    analysis = analyze(
        store,
        window_days=WINDOW_DAYS,
        pool_agreeing_basal_regimes=True,
        carb_entries=store.carb_entries(),
        prompt_responses=store.prompt_responses(),
    ).to_dict()
    exposures = build_exposures(store, window_days=WINDOW_DAYS)
    scenarios = build_scenarios(store, window_days=WINDOW_DAYS).to_dict()
    prepared = prepare_findings_projection(
        analysis=analysis, exposures=exposures, scenarios=scenarios,
    )
    findings = prepared.project(WindowQuery.whole_day(), analysis_generation="qa:0")
    history_events = prepare_ic_history_events(store, prepared)
    active_history = next(
        (row["id"] for row in prepared.history_catalog if row.get("lifecycle") == "active"),
        None,
    )
    ic_history = (
        history_events.project(active_history, analysis_generation="qa:0")
        if active_history is not None else {"series": []}
    )
    return QaExecution(analysis, exposures, scenarios, findings, ic_history)


def assert_expectation(case: QaCase, execution: QaExecution) -> None:
    """Require every expected collection to equal the case's published set."""
    observed_slots = frozenset(
        row["label"] for row in execution.analysis["basal"] if row["asserts_move"]
    )
    observed_rows = frozenset(
        (family_name, occurrence["t"], occurrence["state"])
        for family_name, family in execution.exposures["exposures"].items()
        for occurrence in family["occurrences"]
    )
    observed_titles = frozenset(row["title"] for row in execution.findings["rows"])
    observed_history_ids = frozenset(
        row["id"] for row in execution.findings["rows"]
        if row["register"] == "history"
    )
    isf_row = next(row for row in execution.analysis["isf"])
    observed_rest_windows = len(isf_row["evidence"]["rest_windows"])
    observed_history_series = len(execution.ic_history["series"])
    assert observed_slots == case.expectation.asserting_basal_slots, observed_slots
    assert observed_rows == case.expectation.behavioral_rows, observed_rows
    assert observed_titles == case.expectation.finding_titles, observed_titles
    assert observed_history_ids == case.expectation.history_row_ids, observed_history_ids
    assert observed_rest_windows == case.expectation.isf_rest_window_count, observed_rest_windows
    assert observed_history_series == case.expectation.ic_history_series_count, observed_history_series


def _settings(carb_ratio: float = 10.0) -> PumpSettings:
    profile = ProfileSettings(
        idp=1,
        name="QA synthetic profile",
        dia_min=180,
        carb_entry=True,
        max_bolus=10.0,
        segments=(ProfileSegment(0, 0.6, 40, carb_ratio, 110),),
    )
    return PumpSettings(active_idp=1, profiles=(profile,))


def _materialize_showcase_background(store) -> None:
    first = date(2024, 6, 1)
    cgm, basal, bolus = [], [], []
    for offset in range(30):
        current = first + timedelta(days=offset)
        for minute in range(0, 24 * 60, 5):
            stamp = f"{current.isoformat()} {minute // 60:02d}:{minute % 60:02d}:00"
            cgm.append({
                "EventDateTime": stamp,
                "Readings (CGM / BGM)": 120.0,
                "Description": "Synthetic EGV",
            })
            basal.append({
                "seq_num": 10_000 + offset * 288 + minute // 5,
                "time": stamp,
                "delivery_type": "algorithmDelivery",
                "duration_mins": 5,
                "basal_rate": 0.48 if 180 <= minute < 240 else 0.6,
                "profile_basal_rate": 0.6,
            })
        ratio = 12.0 if 1 <= offset < 15 else 10.0
        bolus.append({
            "seq_num": 1_000 + offset,
            "request_time": f"{current.isoformat()} 08:00:00",
            "description": "Synthetic meal bolus",
            "completion": "Completed",
            "insulin": 48.0 / ratio,
            "requested_insulin": 48.0 / ratio,
            "carbs": 48.0,
            "carb_ratio": ratio,
        })
    store.upsert_cgm(cgm)
    store.upsert_basal(basal)
    store.upsert_bolus(bolus)
    store.upsert_settings_snapshot("2024-06-02 00:00:00", _settings(12.0))
    store.upsert_settings_snapshot("2024-06-16 00:00:00", _settings())


def _materialize_setting_recommendation(store) -> None:
    first = date(2024, 6, 1)
    cgm, basal = [], []
    for offset in range(12):
        current = first + timedelta(days=offset)
        for minute in range(180, 241, 5):
            stamp = f"{current.isoformat()} {minute // 60:02d}:{minute % 60:02d}:00"
            cgm.append({
                "EventDateTime": stamp,
                "Readings (CGM / BGM)": 120.0,
                "Description": "Synthetic EGV",
            })
        basal.append({
            "seq_num": offset + 1,
            "time": f"{current.isoformat()} 03:00:00",
            "delivery_type": "algorithmDelivery",
            "duration_mins": 60,
            "basal_rate": 0.48,
            "profile_basal_rate": 0.6,
        })
    store.upsert_cgm(cgm)
    store.upsert_basal(basal)
    store.upsert_settings_snapshot(f"{first.isoformat()} 00:00:00", _settings())


def _materialize_behavioral_precedence(store) -> None:
    day = date(2024, 6, 30)
    cgm = []
    bolus = []

    def stamp(current: date, hour: int, minute: int) -> datetime:
        return datetime.combine(current, datetime.min.time()).replace(
            hour=hour, minute=minute
        )

    def trace(current: date, hour: int, minute: int, nadir: float, rebound: float,
              tail: bool = True) -> None:
        start = stamp(current, hour, minute)
        for offset, initial, slope, duration in (
            (0, 100.0, 0.0, 20),
            (20, 100.0, -(100.0 - nadir) / 20, 20),
            (40, nadir, (rebound - nadir) / 40, 40),
        ):
            cgm.extend((start + timedelta(minutes=offset + step), initial + slope * step)
                       for step in range(0, duration + 1, 5))
        if tail:
            cgm.extend((start + timedelta(minutes=80 + step), rebound - 1.5 * step)
                       for step in range(0, 61, 5))

    def ramp(current: date, hour: int, minute: int, initial: float, slope: float,
             duration: int) -> None:
        start = stamp(current, hour, minute)
        cgm.extend((start + timedelta(minutes=offset), initial + slope * offset)
                   for offset in range(0, duration + 1, 5))

    def low_without_rebound(current: date, hour: int, minute: int, nadir: float) -> None:
        start = stamp(current, hour, minute)
        cgm.extend((start + timedelta(minutes=step), 100.0) for step in range(0, 21, 5))
        cgm.extend((start + timedelta(minutes=20 + step),
                    100.0 - (100.0 - nadir) / 20 * step)
                   for step in range(0, 21, 5))

    fired_day, near_day, calm_day, competing_day = (
        day - timedelta(days=4), day - timedelta(days=3),
        day - timedelta(days=2), day - timedelta(days=1),
    )
    outranked_day = day - timedelta(days=5)
    ramp(outranked_day, 9, 0, 110.0, 0.0, 180)
    ramp(outranked_day, 12, 0, 112.0, 0.4, 20)
    ramp(outranked_day, 12, 20, 120.0, 145.0 / 100, 100)
    ramp(outranked_day, 14, 0, 265.0, -115.0 / 120, 120)
    trace(fired_day, 13, 15, 48.0, 260.0)
    trace(near_day, 11, 30, 60.0, 150.0, tail=False)
    trace(calm_day, 11, 30, 60.0, 130.0, tail=False)
    low_without_rebound(calm_day, 15, 30, 60.0)
    ramp(competing_day, 18, 40, 120.0, 0.0, 20)
    ramp(competing_day, 19, 0, 120.0, 1.75, 40)
    ramp(competing_day, 19, 40, 190.0, -1.0, 140)
    cgm.extend(((stamp(competing_day, 22, 5), 100.0),
                (stamp(competing_day, 22, 10), 130.0)))
    bolus.extend(((stamp(outranked_day, 12, 0), 5.0, 60.0, 12.0),
                  (stamp(outranked_day, 13, 40), 2.5, None, None),
                  (stamp(competing_day, 19, 0), 6.0, 40.0, 10.0),
                  (stamp(competing_day, 20, 0), 4.0, None, None)))

    store.upsert_cgm([
        {
            "EventDateTime": when.strftime("%Y-%m-%d %H:%M:%S"),
            "Readings (CGM / BGM)": bg,
            "Description": "Synthetic EGV",
        }
        for when, bg in cgm
    ])
    store.upsert_bolus([
        {
            "seq_num": index,
            "request_time": when.strftime("%Y-%m-%d %H:%M:%S"),
            "description": "Synthetic bolus",
            "completion": "Completed",
            "insulin": insulin,
            "requested_insulin": insulin,
            "carbs": carbs,
            "carb_ratio": carb_ratio,
        }
        for index, (when, insulin, carbs, carb_ratio) in enumerate(bolus, start=1)
    ])
    store.upsert_settings_snapshot(f"{(day - timedelta(days=29)).isoformat()} 00:00:00", _settings())
