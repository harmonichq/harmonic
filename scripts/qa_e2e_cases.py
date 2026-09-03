"""Manufactured QA E2E store cases and their production-path expectations.

The catalog is the only owner of the synthetic case recipes.  The generator
materializes the showcase case, while the coverage test materializes each case
in its own temporary store.
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from functools import partial
from typing import Callable, Literal, TypeAlias

from ciq_autotune.analyze import _BOLUS_LEADIN, _ISF_DECISION_INTERVAL, analyze
from ciq_autotune.analyzers.ic import BLOCK_WINDOW_DAYS
from ciq_autotune.analyzers.scenario import build_scenarios
from ciq_autotune.events import CarbEntry
from ciq_autotune.explore_exposures import build_exposures
from ciq_autotune.findings_projection import (
    FINDING_VERDICTS,
    WindowQuery,
    prepare_findings_projection,
)
from ciq_autotune.ic_history_events import prepare_ic_history_events
from ciq_autotune.insulin import InsulinActivity
from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings


WINDOW_DAYS = 30
BASAL_SOURCE_SPAN_DAYS = WINDOW_DAYS + _BOLUS_LEADIN.days + 1
ISF_SOURCE_SPAN_DAYS = (
    WINDOW_DAYS + _ISF_DECISION_INTERVAL.days + _BOLUS_LEADIN.days + 1
)
IC_SOURCE_SPAN_DAYS = BLOCK_WINDOW_DAYS + 1
AnalyzerFamily: TypeAlias = Literal["basal", "isf", "ic"]
AnalyzerRowKey: TypeAlias = tuple[AnalyzerFamily, str]
WindowKey: TypeAlias = Literal["whole_day"] | tuple[int, int]


@dataclass(frozen=True)
class ExpectedBasalRow:
    safety_status: str | None = None
    direction: str | None = None
    asserts_move: bool = False
    omitted: frozenset[str] = frozenset()


@dataclass(frozen=True)
class ExpectedIsfRow:
    direction: str | None = None
    asserts_move: bool = False
    omitted: frozenset[str] = frozenset()


@dataclass(frozen=True)
class ExpectedIcRow:
    state: str | None = None
    direction: str | None = None
    held_reason: str | None = None
    asserts_move: bool = False
    days_observed: int | None = None
    omitted: frozenset[str] = frozenset()


ExpectedAnalyzerRow: TypeAlias = ExpectedBasalRow | ExpectedIsfRow | ExpectedIcRow


@dataclass(frozen=True)
class ExpectedAnalyzerRows(Mapping[AnalyzerRowKey, ExpectedAnalyzerRow]):
    """A literal family default plus literal named overrides."""

    row_keys: tuple[AnalyzerRowKey, ...]
    default: ExpectedAnalyzerRow | None = None
    overrides: Mapping[AnalyzerRowKey, ExpectedAnalyzerRow] = field(default_factory=dict)

    def __getitem__(self, key: AnalyzerRowKey) -> ExpectedAnalyzerRow:
        if key not in self.row_keys:
            raise KeyError(key)
        if key in self.overrides:
            return self.overrides[key]
        if self.default is None:
            raise KeyError(key)
        return self.default

    def __iter__(self) -> Iterator[AnalyzerRowKey]:
        return iter(self.row_keys)

    def __len__(self) -> int:
        return len(self.row_keys)


@dataclass(frozen=True)
class ExpectedSupport:
    directional_support_count: int | None = None
    n_steps: int | None = None
    n_runs: int | None = None
    effective_run_count: float | None = None


@dataclass(frozen=True)
class ExpectedQueueRow:
    register: str
    direction: str | None
    asserts_move: bool | None
    headline: str | None


@dataclass(frozen=True)
class ExpectedVerdictTally:
    denominator: int
    counts: Mapping[str, int]


@dataclass(frozen=True)
class QaExpectation:
    """The complete rows this case must publish, plus the rows it must omit."""

    analyzer_rows: Mapping[AnalyzerRowKey, ExpectedAnalyzerRow]
    support: Mapping[AnalyzerRowKey, ExpectedSupport]
    queue_rows: Mapping[tuple[WindowKey, AnalyzerRowKey], ExpectedQueueRow]
    queue_absences: frozenset[tuple[WindowKey, AnalyzerRowKey]]
    rest_windows: frozenset[tuple[str, str, str]]
    history_series: Mapping[str, tuple[dict, ...]]
    behavioral_rows: frozenset[tuple[str, str, str]]
    finding_titles: frozenset[str]
    verdict_tallies: Mapping[tuple[str, str], ExpectedVerdictTally] = field(
        default_factory=dict,
    )
    uncaused_highs: int = 0


@dataclass(frozen=True)
class QaCase:
    """One named, isolated synthetic source window and its published contract."""

    name: str
    recipe: Callable[[object], None]
    expectation: QaExpectation
    source_span_days: int
    target_family: AnalyzerFamily | None = None
    scoped_windows: tuple[tuple[int, int], ...] = ()


@dataclass(frozen=True)
class QaExecution:
    """The published producer results built from one materialized case."""

    analysis: dict
    exposures: dict
    scenarios: dict
    findings: Mapping[WindowKey, dict]
    ic_history: Mapping[str, dict]


_SHOWCASE = "showcase"
_SETTING_RECOMMENDATION = "setting-recommendation"
_BEHAVIORAL_PRECEDENCE = "behavioral-precedence"
_BASAL_SLOT_KEYS = tuple(
    ("basal", f"{minute // 60:02d}:{minute % 60:02d}")
    for minute in range(0, 24 * 60, 30)
)
_BASAL_NO_DATA = ExpectedBasalRow(
    safety_status="no data", omitted=frozenset({"recommended"}),
)
_BASAL_RAISE = ExpectedBasalRow(
    safety_status="raise", direction="raise", asserts_move=True,
)
_BASAL_LOWER = ExpectedBasalRow(
    safety_status="lower", direction="lower", asserts_move=True,
)
_BASAL_CAPPED_RAISE = ExpectedBasalRow(
    safety_status="capped (raise)", direction="raise", asserts_move=True,
)
_BASAL_CAPPED_LOWER = ExpectedBasalRow(
    safety_status="capped (lower)", direction="lower", asserts_move=True,
)
_BASAL_INSUFFICIENT = ExpectedBasalRow(safety_status="insufficient evidence")
_BASAL_NO_BASELINE = ExpectedBasalRow(
    safety_status="no baseline", omitted=frozenset({"current"}),
)
_BASAL_NO_CHANGE = ExpectedBasalRow(safety_status="no change")
_BASAL_HARM_LOWER = ExpectedBasalRow(
    safety_status="lower (recurring lows)", direction="lower", asserts_move=True,
)
_BASAL_HARM_GATED = ExpectedBasalRow(safety_status="held (recurring-low gate)")
_ISF_STRENGTHEN = ExpectedIsfRow(
    direction="strengthen", asserts_move=True, omitted=frozenset({"block_id"}),
)
_ISF_DIRECTION_ONLY_WEAKEN = ExpectedIsfRow(
    direction="weaken",
    omitted=frozenset({"block_id", "recommended"}),
)
_ISF_HELD = ExpectedIsfRow(
    omitted=frozenset({"block_id", "recommended"}),
)
_IC_COLLECTING = ExpectedIcRow(state="collecting", days_observed=29)
_IC_RAISE = ExpectedIcRow(
    state="numeric", direction="raise", asserts_move=True, days_observed=90,
    omitted=frozenset({"days_needed"}),
)
_IC_LOWER = ExpectedIcRow(
    state="numeric", direction="lower", asserts_move=True, days_observed=90,
    omitted=frozenset({"days_needed"}),
)
_IC_HELD = ExpectedIcRow(
    state="numeric", held_reason="pre-empted low; held at current",
    omitted=frozenset({"days_needed", "days_observed"}),
)
_IC_QUIET = ExpectedIcRow(
    state="below-floor",
    omitted=frozenset({"days_needed", "days_observed"}),
)
_IC_HISTORY_CURRENT = ExpectedIcRow(
    state="numeric", omitted=frozenset({"days_needed", "days_observed"}),
)


def _showcase_recipe(store) -> None:
    _materialize_showcase_background(store)
    _materialize_behavioral_precedence(store)


def _setting_recommendation_recipe(store) -> None:
    _materialize_setting_recommendation(store)


def _behavioral_precedence_recipe(store) -> None:
    _materialize_behavioral_precedence(store)


def _materialize_behavioral_background(store, *, span_days: int) -> date:
    """Write a dense, flat manufactured lane ending before July 2025."""
    first = date(2024, 5, 1)
    cgm = []
    for offset in range(span_days):
        current = first + timedelta(days=offset)
        for minute in range(0, 24 * 60, 5):
            stamp = f"{current.isoformat()} {minute // 60:02d}:{minute % 60:02d}:00"
            cgm.append({
                "EventDateTime": stamp,
                "Readings (CGM / BGM)": 120.0,
                "Description": "Synthetic EGV",
            })
    store.upsert_cgm(cgm)
    store.upsert_settings_snapshot(f"{first.isoformat()} 00:00:00", _settings(5.0))
    return first


def _materialize_behavioral_carb_undercount(store) -> None:
    """Write every reachable carb-undercount verdict band across six meals."""
    first = _materialize_behavioral_background(store, span_days=30)
    bolus = []
    cgm = []
    basal = []

    def add_trace(offset: int, values: tuple[float, ...], *, carbs: float,
                  insulin: float, carb_ratio: float | None) -> None:
        start = datetime.combine(first + timedelta(days=offset), datetime.min.time())
        start = start.replace(hour=11, minute=40)
        cgm.extend((start + timedelta(minutes=5 * index), value)
                   for index, value in enumerate(values))
        meal_at = start + timedelta(minutes=25)
        basal.extend({
            "seq_num": 100_000 + offset * 100 + index,
            "time": (start + timedelta(minutes=5 * index)).strftime(
                "%Y-%m-%d %H:%M:%S"
            ),
            "delivery_type": "algorithmDelivery",
            "duration_mins": 5,
            "basal_rate": 0.6,
            "profile_basal_rate": 0.6,
        } for index in range(19))
        bolus.append({
            "seq_num": 90_000 + offset,
            "request_time": meal_at.strftime("%Y-%m-%d %H:%M:%S"),
            "description": "Synthetic meal bolus",
            "completion": "Completed",
            "insulin": insulin,
            "requested_insulin": insulin,
            "carbs": carbs,
            "carb_ratio": carb_ratio,
            "isf": 32.0,
            "target_bg": 110.0,
        })

    runaway = (145, 145, 145, 145, 145, 145, 170, 220, 280, 330, 360, 355, 340)
    add_trace(23, runaway, carbs=30.0, insulin=6.0, carb_ratio=5.0)
    add_trace(24, runaway, carbs=30.0, insulin=6.0, carb_ratio=5.0)
    add_trace(
        25,
        (100, 110, 120, 130, 140, 150, 160, 170, 180, 175, 165, 150, 135),
        carbs=45.0,
        insulin=9.0,
        carb_ratio=5.0,
    )
    add_trace(
        26,
        (120, 120, 120, 120, 120, 120, 140, 175, 210, 230, 220, 200, 175),
        carbs=60.0,
        insulin=12.0,
        carb_ratio=5.0,
    )
    add_trace(
        27,
        (120, 120, 120, 120, 120, 120, 130, 140, 150, 145, 135, 125, 120),
        carbs=30.0,
        insulin=6.0,
        carb_ratio=None,
    )
    add_trace(
        28,
        (110, 110, 110, 110, 110, 110, 120, 135, 150, 145, 130, 120, 115),
        carbs=45.0,
        insulin=9.0,
        carb_ratio=5.0,
    )
    store.upsert_cgm([
        {
            "EventDateTime": when.strftime("%Y-%m-%d %H:%M:%S"),
            "Readings (CGM / BGM)": bg,
            "Description": "Synthetic EGV",
        }
        for when, bg in cgm
    ])
    store.upsert_basal(basal)
    store.upsert_bolus(bolus)


def _materialize_behavioral_late_bolus(store) -> None:
    """Write every reachable late-bolus verdict band across six meals."""
    first = _materialize_behavioral_background(store, span_days=30)
    bolus = []
    cgm = []

    def add_trace(offset: int, values: tuple[float, ...], *, hour: int = 11,
                  minute: int = 40, meal_offset: int = 25,
                  carbs: float = 45.0, insulin: float = 9.0) -> None:
        start = datetime.combine(first + timedelta(days=offset), datetime.min.time())
        start = start.replace(hour=hour, minute=minute)
        cgm.extend((start + timedelta(minutes=5 * index), value)
                   for index, value in enumerate(values))
        meal_at = start + timedelta(minutes=meal_offset)
        bolus.append({
            "seq_num": 110_000 + offset,
            "request_time": meal_at.strftime("%Y-%m-%d %H:%M:%S"),
            "description": "Synthetic meal bolus",
            "completion": "Completed",
            "insulin": insulin,
            "requested_insulin": insulin,
            "carbs": carbs,
            "carb_ratio": 5.0,
            "isf": 40.0,
            "target_bg": 110.0,
        })

    add_trace(0, (120, 130, 140, 150), hour=0, minute=0, meal_offset=0)
    rising = (100, 110, 120, 130, 140, 150, 160, 170, 180, 175, 165, 150, 135)
    add_trace(23, rising)
    add_trace(24, rising)
    add_trace(
        25,
        (145, 145, 145, 145, 145, 145, 170, 220, 280, 330, 360, 355, 340),
        carbs=30.0,
        insulin=6.0,
    )
    add_trace(26, (65, 75, 85, 95, 105, 115, 130, 145, 150, 145, 135, 125))
    add_trace(27, (110, 110, 110, 110, 110, 110, 120, 135, 150, 145, 130, 120))
    store.upsert_cgm([
        {
            "EventDateTime": when.strftime("%Y-%m-%d %H:%M:%S"),
            "Readings (CGM / BGM)": bg,
            "Description": "Synthetic EGV",
        }
        for when, bg in cgm
    ])
    store.upsert_bolus(bolus)


def _materialize_behavioral_uncaused_highs(store) -> None:
    """Write two clean high Occurrences with one wholly unexplained Episode."""
    day = date(2024, 5, 2)
    base = datetime.combine(day, datetime.min.time())
    corners = (
        (360, 110.0), (480, 112.0), (500, 220.0), (570, 255.0),
        (600, 200.0), (605, 230.0), (645, 265.0), (690, 200.0),
    )
    cgm = [(base - timedelta(days=1), 110.0)]
    for (start_min, start_bg), (end_min, end_bg) in zip(corners, corners[1:]):
        steps = (end_min - start_min) // 5
        cgm.extend((
            base + timedelta(minutes=start_min + 5 * step),
            start_bg + (end_bg - start_bg) * step / steps,
        ) for step in range(steps))
    cgm.extend(((base + timedelta(minutes=corners[-1][0]), corners[-1][1]),
                (base + timedelta(hours=23, minutes=59), 110.0)))
    store.upsert_cgm([
        {
            "EventDateTime": when.strftime("%Y-%m-%d %H:%M:%S"),
            "Readings (CGM / BGM)": bg,
            "Description": "Synthetic EGV",
        }
        for when, bg in cgm
    ])


def _materialize_behavioral_compression_low(store, *, answer: str) -> None:
    """Write one compression-shaped low and its manufactured prompt answer."""
    first = datetime(2024, 5, 1)
    day = first + timedelta(days=1)
    readings = [(first, 110.0), (day.replace(hour=23, minute=59), 110.0)]
    readings.extend(
        (day + timedelta(minutes=minute), bg)
        for minute, bg in (
            (0, 110), (60, 110), (120, 110), (150, 108), (155, 95),
            (160, 80), (165, 66), (170, 55), (175, 49), (185, 47),
            (190, 47), (195, 70), (200, 110), (205, 150), (210, 186),
            (215, 150), (220, 130), (225, 118), (230, 112), (240, 110),
            (300, 110), (360, 110),
        )
    )
    store.upsert_cgm([
        {
            "EventDateTime": when.strftime("%Y-%m-%d %H:%M:%S"),
            "Readings (CGM / BGM)": bg,
            "Description": "Synthetic EGV",
        }
        for when, bg in readings
    ])
    anchor = day.replace(hour=3, minute=5)
    store.record_prompt_response(
        detector="low", anchor_t=anchor, answer=answer, answered_at=anchor,
    )


def _materialize_behavioral_lone_correction(store) -> None:
    day = datetime(2024, 5, 1)
    store.upsert_cgm([
        {
            "EventDateTime": (day + timedelta(minutes=minute)).strftime(
                "%Y-%m-%d %H:%M:%S"
            ),
            "Readings (CGM / BGM)": 120.0,
            "Description": "Synthetic EGV",
        }
        for minute in range(0, 24 * 60, 5)
    ])
    store.upsert_bolus([{
        "seq_num": 130_000,
        "request_time": "2024-05-01 12:00:00",
        "description": "Synthetic correction",
        "completion": "Completed",
        "insulin": 2.0,
        "requested_insulin": 2.0,
        "carbs": None,
        "isf": 40.0,
        "target_bg": 110.0,
    }])


def _materialize_behavioral_meals_start_high(store) -> None:
    first = _materialize_behavioral_background(store, span_days=8)
    cgm = []
    meals = []
    for offset in range(8):
        current = first + timedelta(days=offset)
        start = datetime.combine(current, datetime.min.time()).replace(
            hour=11, minute=20,
        )
        cgm.extend((start + timedelta(minutes=5 * step), 150.0)
                   for step in range(69))
        meal_at = start + timedelta(minutes=40)
        meals.append({
            "seq_num": 140_000 + offset,
            "request_time": meal_at.strftime("%Y-%m-%d %H:%M:%S"),
            "description": "Synthetic meal bolus",
            "completion": "Completed",
            "insulin": 6.0,
            "requested_insulin": 6.0,
            "carbs": 60.0,
            "carb_ratio": 10.0,
            "isf": 40.0,
            "target_bg": 110.0,
        })
    store.upsert_cgm([
        {
            "EventDateTime": when.strftime("%Y-%m-%d %H:%M:%S"),
            "Readings (CGM / BGM)": bg,
            "Description": "Synthetic EGV",
        }
        for when, bg in cgm
    ])
    store.upsert_bolus(meals)


def _materialize_behavioral_ic_finding(store, *, correction_burden: bool) -> None:
    """Write eight closed meal ledgers for one pooled I:C finding."""
    first = _materialize_behavioral_background(store, span_days=8)
    cgm = []
    bolus = []
    doses = (2.0, 3.0, 4.0, 5.0, 8.0, 10.0, 12.0, 15.0)
    for offset in range(8):
        current = first + timedelta(days=offset)
        start = datetime.combine(current, datetime.min.time()).replace(
            hour=11, minute=20,
        )
        cgm.extend((start + timedelta(minutes=5 * step), 110.0)
                   for step in range(69))
        meal_at = start + timedelta(minutes=40)
        dose = 6.0 if correction_burden else doses[offset]
        bolus.append({
            "seq_num": 150_000 + offset * 2,
            "request_time": meal_at.strftime("%Y-%m-%d %H:%M:%S"),
            "description": "Synthetic meal bolus",
            "completion": "Completed",
            "insulin": dose,
            "requested_insulin": dose,
            "carbs": 60.0,
            "carb_ratio": 10.0,
            "isf": 40.0,
            "target_bg": 110.0,
            "bolus_options": 0,
        })
        if correction_burden:
            correction_at = meal_at + timedelta(hours=2)
            bolus.append({
                "seq_num": 150_001 + offset * 2,
                "request_time": correction_at.strftime("%Y-%m-%d %H:%M:%S"),
                "description": "Synthetic user correction",
                "completion": "Completed",
                "insulin": 2.0,
                "requested_insulin": 2.0,
                "carbs": None,
                "isf": 40.0,
                "target_bg": 110.0,
                "bolus_options": 0,
            })
    store.upsert_cgm([
        {
            "EventDateTime": when.strftime("%Y-%m-%d %H:%M:%S"),
            "Readings (CGM / BGM)": bg,
            "Description": "Synthetic EGV",
        }
        for when, bg in cgm
    ])
    store.upsert_bolus(bolus)


def _materialize_behavioral_meal_over_delivery(store) -> None:
    first = _materialize_behavioral_background(store, span_days=30)
    cgm = []
    bolus = []
    basal = []

    def add_meal(offset: int, *, suspend_rows: int = 0,
                 values: tuple[float, ...] = (120,) * 25,
                 carbs: float = 50.0, dose: float = 5.0) -> None:
        day = datetime.combine(first + timedelta(days=offset), datetime.min.time())
        meal_at = day.replace(hour=12)
        cgm.extend((meal_at - timedelta(minutes=30) + timedelta(minutes=5 * i), bg)
                   for i, bg in enumerate(values))
        bolus.append({
            "seq_num": 160_000 + offset, "request_time": meal_at.strftime("%F %T"),
            "description": "Synthetic meal bolus", "completion": "Completed",
            "insulin": dose, "requested_insulin": dose, "carbs": carbs,
            "carb_ratio": 10.0, "isf": 40.0, "target_bg": 110.0,
        })
        basal.extend({
            "seq_num": 170_000 + offset * 100 + i,
            "time": (meal_at + timedelta(minutes=5 * i)).strftime("%F %T"),
            "delivery_type": "algorithmDelivery (control-iq suspension)",
            "duration_mins": 5, "basal_rate": 0.0, "profile_basal_rate": 0.9,
        } for i in range(suspend_rows))

    falling = (120,) * 17 + (110, 103, 96, 89, 82, 75, 68, 68)
    add_meal(23, suspend_rows=12, values=falling)
    add_meal(24, suspend_rows=12, values=falling)
    add_meal(25, suspend_rows=3,
             values=(145,) * 7 + (170, 220, 280, 330, 360, 350, 330),
             carbs=30.0, dose=3.0)
    add_meal(26, suspend_rows=4)
    add_meal(27)
    add_meal(28, suspend_rows=3, values=(120,) * 25)
    store.upsert_cgm([{
        "EventDateTime": when.strftime("%F %T"),
        "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV",
    } for when, bg in cgm])
    store.upsert_bolus(bolus)
    store.upsert_basal(basal)


def _materialize_behavioral_correction_stacking(store) -> None:
    first = _materialize_behavioral_background(store, span_days=30)
    cgm = []
    bolus = []

    def trace(offset: int, start_min: int, values: tuple[float, ...]) -> None:
        day = datetime.combine(first + timedelta(days=offset), datetime.min.time())
        cgm.extend((day + timedelta(minutes=start_min + 5 * i), value)
                   for i, value in enumerate(values))

    def pair(offset: int, first_min: int, second_min: int) -> None:
        day = datetime.combine(first + timedelta(days=offset), datetime.min.time())
        for index, minute in enumerate((first_min, second_min)):
            bolus.append({
                "seq_num": 180_000 + offset * 10 + index,
                "request_time": (day + timedelta(minutes=minute)).strftime("%F %T"),
                "description": "Synthetic user correction", "completion": "Completed",
                "insulin": 3.0, "requested_insulin": 3.0, "carbs": None,
                "isf": 40.0, "target_bg": 110.0,
            })

    falling = tuple(160.0 - 4.0 * i for i in range(26))
    for offset in (23, 24):
        trace(offset, 14 * 60, falling)
        pair(offset, 14 * 60 + 10, 14 * 60 + 40)
    trace(25, 10 * 60, tuple(160.0 - min(48.0, i) for i in range(49)))
    pair(25, 10 * 60 + 10, 10 * 60 + 40)
    trace(26, 19 * 60, tuple(145.0 + 10.0 * i for i in range(25)))
    pair(26, 19 * 60 + 30, 20 * 60 + 10)
    store.upsert_cgm([{
        "EventDateTime": when.strftime("%F %T"),
        "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV",
    } for when, bg in cgm])
    store.upsert_bolus(bolus)


def _materialize_behavioral_over_treated_low(store) -> None:
    first = _materialize_behavioral_background(store, span_days=30)
    cgm = []
    bolus = []

    def segment(offset: int, start_min: int, values: tuple[float, ...]) -> None:
        day = datetime.combine(first + timedelta(days=offset), datetime.min.time())
        cgm.extend((day + timedelta(minutes=start_min + 5 * i), value)
                   for i, value in enumerate(values))

    def rebound(offset: int, start_min: int, nadir: float, peak: float) -> None:
        down = tuple(100.0 - (100.0 - nadir) * i / 4 for i in range(5))
        up = tuple(nadir + (peak - nadir) * i / 8 for i in range(1, 9))
        segment(offset, start_min, (100.0,) * 5 + down[1:] + up)

    rebound(22, 13 * 60 + 15, 48.0, 260.0)
    rebound(23, 13 * 60 + 15, 48.0, 260.0)
    rebound(24, 11 * 60 + 30, 60.0, 150.0)
    rebound(25, 11 * 60 + 30, 60.0, 130.0)
    segment(26, 15 * 60 + 30,
            (100.0, 100.0, 100.0, 100.0, 100.0, 90.0, 80.0, 70.0, 60.0))
    segment(27, 19 * 60 + 40, (238.0, 234.75, 231.5, 228.25, 225.0))
    segment(27, 20 * 60 + 5,
            tuple(221.0 - 7.25 * i for i in range(24)))
    segment(27, 22 * 60 + 5, (60.0,) * 13)
    day = datetime.combine(first + timedelta(days=27), datetime.min.time())
    for seq, minute, insulin, carbs in (
        (190_000, 19 * 60, 7.4, 52.0),
        (190_001, 20 * 60, 4.2, None),
    ):
        bolus.append({
            "seq_num": seq, "request_time": (day + timedelta(minutes=minute)).strftime("%F %T"),
            "description": "Synthetic bolus", "completion": "Completed",
            "insulin": insulin, "requested_insulin": insulin, "carbs": carbs,
            "carb_ratio": 10.0 if carbs else None, "isf": 40.0, "target_bg": 110.0,
        })
    store.upsert_cgm([{
        "EventDateTime": when.strftime("%F %T"),
        "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV",
    } for when, bg in cgm])
    store.upsert_bolus(bolus)


def _materialize_behavioral_correction_on_iob(store) -> None:
    first = _materialize_behavioral_background(store, span_days=30)
    cgm = []
    bolus = []
    basal = []

    def segment(offset: int, start_min: int, values: tuple[float, ...]) -> None:
        day = datetime.combine(first + timedelta(days=offset), datetime.min.time())
        cgm.extend((day + timedelta(minutes=start_min + 5 * i), value)
                   for i, value in enumerate(values))

    def dose(offset: int, minute: int, seq: int, insulin: float,
             carbs: float | None) -> None:
        day = datetime.combine(first + timedelta(days=offset), datetime.min.time())
        bolus.append({
            "seq_num": seq, "request_time": (day + timedelta(minutes=minute)).strftime("%F %T"),
            "description": "Synthetic bolus", "completion": "Completed",
            "insulin": insulin, "requested_insulin": insulin, "carbs": carbs,
            "carb_ratio": 10.0 if carbs else None, "isf": 40.0, "target_bg": 110.0,
        })

    for offset in (23, 24):
        segment(offset, 19 * 60 + 40, (238.0, 234.75, 231.5, 228.25, 225.0))
        segment(offset, 20 * 60 + 5, tuple(221.0 - 7.25 * i for i in range(24)))
        segment(offset, 22 * 60 + 5, (60.0,) * 13)
        dose(offset, 19 * 60, 200_000 + offset * 10, 7.4, 52.0)
        dose(offset, 20 * 60, 200_001 + offset * 10, 4.2, None)
    down = tuple(100.0 - 10.0 * i for i in range(5))
    up = tuple(60.0 + 25.0 * i for i in range(1, 9))
    segment(25, 13 * 60 + 15, (100.0,) * 5 + down[1:] + up)
    segment(26, 19 * 60 + 40, (238.0, 234.75, 231.5, 228.25, 225.0))
    segment(26, 20 * 60 + 5, tuple(221.0 - 7.25 * i for i in range(24)))
    segment(26, 22 * 60 + 5, (60.0,) * 13)
    dose(26, 19 * 60, 200_260, 7.4, 52.0)
    dose(26, 20 * 60, 200_261, 4.2, None)
    suspend_day = datetime.combine(first + timedelta(days=26), datetime.min.time())
    basal.extend({
        "seq_num": 210_000 + i,
        "time": (suspend_day + timedelta(minutes=19 * 60 + 15 + 5 * i)).strftime("%F %T"),
        "delivery_type": "algorithmDelivery (control-iq suspension)",
        "duration_mins": 5, "basal_rate": 0.0, "profile_basal_rate": 0.9,
    } for i in range(6))
    segment(27, 15 * 60 + 30,
            (100.0, 100.0, 100.0, 100.0, 100.0, 90.0, 80.0, 70.0, 60.0))
    segment(27, 16 * 60 + 15, (60.0,) * 13)
    store.upsert_cgm([{
        "EventDateTime": when.strftime("%F %T"),
        "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV",
    } for when, bg in cgm])
    store.upsert_bolus(bolus)
    store.upsert_basal(basal)


def _materialize_behavioral_high_verdicts(store, *, meal_short: bool) -> None:
    first = _materialize_behavioral_background(store, span_days=30)
    cgm = []
    bolus = []
    basal = []

    def trace(offset: int, values: tuple[float, ...], start_min: int = 12 * 60) -> None:
        day = datetime.combine(first + timedelta(days=offset), datetime.min.time())
        cgm.extend((day + timedelta(minutes=start_min + 5 * i), value)
                   for i, value in enumerate(values))

    def dose(offset: int, minute: int, seq: int, *, meal: bool) -> None:
        day = datetime.combine(first + timedelta(days=offset), datetime.min.time())
        bolus.append({
            "seq_num": seq, "request_time": (day + timedelta(minutes=minute)).strftime("%F %T"),
            "description": "Synthetic bolus", "completion": "Completed",
            "insulin": 20.0 if meal else 2.0,
            "requested_insulin": 20.0 if meal else 2.0,
            "carbs": 200.0 if meal else None,
            "carb_ratio": 2.0 if meal else None, "isf": 40.0, "target_bg": 110.0,
        })

    rising = tuple(110.0 + 8.0 * i for i in range(31))
    if meal_short:
        for offset in (23, 24):
            trace(offset, rising)
            dose(offset, 12 * 60, 220_000 + offset * 10, meal=True)
            dose(offset, 13 * 60 + 10, 220_001 + offset * 10, meal=False)
        trace(25, rising)
        trace(26, rising)
        dose(26, 12 * 60, 220_260, meal=True)
    else:
        trace(23, rising)
        trace(24, rising)
        trace(25, rising)
        dose(25, 12 * 60, 220_250, meal=True)
        dose(25, 13 * 60 + 10, 220_251, meal=False)
        trace(26, rising)
        suspend_day = datetime.combine(first + timedelta(days=26), datetime.min.time())
        basal.extend({
            "seq_num": 230_000 + i,
            "time": (suspend_day + timedelta(minutes=12 * 60 + 30 + 5 * i)).strftime("%F %T"),
            "delivery_type": "algorithmDelivery (control-iq suspension)",
            "duration_mins": 5, "basal_rate": 0.0, "profile_basal_rate": 0.9,
        } for i in range(6))
    trace(1, (250.0,), start_min=3 * 60)
    trace(28, tuple(120.0 + 4.0 * i for i in range(49)), start_min=10 * 60)
    dose(28, 10 * 60, 220_280, meal=True)
    dose(28, 11 * 60 + 10, 220_281, meal=False)
    # Remove overnight context so the first high anchor exercises no-data silence.
    store.conn.execute(
        "DELETE FROM cgm_readings WHERE t >= ? AND t <= ?",
        ("2024-05-02 02:00:00", "2024-05-02 04:00:00"),
    )
    store.upsert_cgm([{
        "EventDateTime": when.strftime("%F %T"),
        "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV",
    } for when, bg in cgm])
    store.upsert_bolus(bolus)
    store.upsert_basal(basal)


def _materialize_behavioral_missed_meal(store) -> None:
    _materialize_behavioral_high_verdicts(store, meal_short=False)


def _materialize_behavioral_meal_bolus_short(store) -> None:
    _materialize_behavioral_high_verdicts(store, meal_short=True)


def _materialize_behavioral_carb_log_fasting_exclusion(store) -> None:
    first = _materialize_behavioral_background(store, span_days=2)
    logged_at = datetime.combine(first + timedelta(days=1), datetime.min.time()).replace(
        hour=3,
    )
    store.upsert_carb_entry(CarbEntry(
        t=logged_at, grams=20.0, certainty="estimate", source="manual",
        note="Synthetic fasting exclusion", created_at=logged_at,
    ))


def _materialize_behavioral_preempted_detector(store) -> None:
    first = _materialize_behavioral_background(store, span_days=2)
    day = datetime.combine(first + timedelta(days=1), datetime.min.time())
    cgm = []

    def ramp(minute: int, initial: float, slope: float, duration: int) -> None:
        cgm.extend((day + timedelta(minutes=minute + offset), initial + slope * offset)
                   for offset in range(0, duration + 1, 5))

    ramp(9 * 60, 110.0, 0.0, 180)
    ramp(12 * 60, 112.0, 0.4, 20)
    ramp(12 * 60 + 20, 120.0, 1.45, 100)
    ramp(14 * 60, 265.0, -115.0 / 120, 120)
    store.upsert_cgm([{
        "EventDateTime": when.strftime("%F %T"),
        "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV",
    } for when, bg in cgm])
    store.upsert_bolus([{
        "seq_num": 240_000 + index,
        "request_time": (day + timedelta(minutes=minute)).strftime("%F %T"),
        "description": "Synthetic bolus", "completion": "Completed",
        "insulin": insulin, "requested_insulin": insulin, "carbs": carbs,
        "carb_ratio": ratio, "isf": 40.0, "target_bg": 110.0,
    } for index, (minute, insulin, carbs, ratio) in enumerate((
        (12 * 60, 5.0, 60.0, 12.0),
        (13 * 60 + 40, 2.5, None, None),
    ))])


def _materialize_basal_coverage(
    store, *, clean_rate: float | None, informative_nights: int = 30,
    programmed_rate: float | None = 0.6, recurring_lows: bool = False,
    low_minute: int = 180, suspended: bool = False, include_settings: bool = True,
) -> None:
    """Write one manufactured basal-family-span observation lane."""
    first = date(2024, 5, 1)
    last = first + timedelta(days=BASAL_SOURCE_SPAN_DAYS - 1)
    cgm = [
        {
            "EventDateTime": f"{first.isoformat()} 23:59:00",
            "Readings (CGM / BGM)": 240.0,
            "Description": "Synthetic EGV",
        },
        {
            "EventDateTime": f"{last.isoformat()} 23:59:00",
            "Readings (CGM / BGM)": 240.0,
            "Description": "Synthetic EGV",
        },
    ]
    basal = []
    for offset in range(
        BASAL_SOURCE_SPAN_DAYS - informative_nights, BASAL_SOURCE_SPAN_DAYS,
    ):
        current = first + timedelta(days=offset)
        for minute in range(120, 241, 5):
            cgm.append({
                "EventDateTime": (
                    f"{current.isoformat()} {minute // 60:02d}:{minute % 60:02d}:00"
                ),
                "Readings (CGM / BGM)": 120.0,
                "Description": "Synthetic EGV",
            })
        if clean_rate is not None:
            basal.append({
                "seq_num": 20_000 + offset,
                "time": f"{current.isoformat()} 03:00:00",
                "delivery_type": "algorithmDelivery",
                "duration_mins": 30,
                "basal_rate": clean_rate,
                "profile_basal_rate": programmed_rate,
            })
    if recurring_lows:
        for index, offset in enumerate((29, 30)):
            current = first + timedelta(days=offset)
            if suspended:
                basal.append({
                    "seq_num": 30_000 + index,
                    "time": (
                        f"{current.isoformat()} {low_minute // 60:02d}:"
                        f"{low_minute % 60:02d}:00"
                    ),
                    "delivery_type": "algorithmDelivery (control-iq suspension)",
                    "duration_mins": 30,
                    "basal_rate": 0.0,
                    "profile_basal_rate": programmed_rate,
                })
            for step in (0, 5, 10):
                minute = low_minute + step
                cgm.append({
                    "EventDateTime": (
                        f"{current.isoformat()} {minute // 60:02d}:"
                        f"{minute % 60:02d}:00"
                    ),
                    "Readings (CGM / BGM)": 50.0,
                    "Description": "Synthetic EGV",
                })
    store.upsert_cgm(cgm)
    store.upsert_basal(basal)
    if include_settings:
        store.upsert_settings_snapshot(f"{first.isoformat()} 00:00:00", _settings())


_ISF_CORRECTION_PLANS = (
    ((1, 0, 0.75),),
    ((1, 30, 1.0),),
    ((2, 0, 1.25),),
    ((2, 30, 1.5),),
    ((3, 0, 1.75),),
    ((3, 30, 2.0),),
    ((4, 0, 2.25),),
    ((4, 30, 2.5),),
)

# SYNTHETIC-FIXTURE: Exact detected rest windows for manufactured ISF nights.
_ISF_REST_WINDOWS = frozenset({
    ("2024-05-10", "2024-05-10 22:00:00", "2024-05-11 08:00:00"),
    ("2024-05-11", "2024-05-11 22:00:00", "2024-05-12 08:00:00"),
    ("2024-05-12", "2024-05-12 22:00:00", "2024-05-13 08:00:00"),
    ("2024-05-13", "2024-05-13 22:00:00", "2024-05-14 08:00:00"),
    ("2024-05-14", "2024-05-14 22:00:00", "2024-05-15 08:00:00"),
    ("2024-05-15", "2024-05-15 22:00:00", "2024-05-16 08:00:00"),
    ("2024-05-16", "2024-05-16 22:00:00", "2024-05-17 08:00:00"),
    ("2024-05-17", "2024-05-17 22:00:00", "2024-05-18 08:00:00"),
    ("2024-05-18", "2024-05-18 22:00:00", "2024-05-19 08:00:00"),
    ("2024-05-19", "2024-05-19 22:00:00", "2024-05-20 08:00:00"),
    ("2024-05-20", "2024-05-20 22:00:00", "2024-05-21 08:00:00"),
    ("2024-05-21", "2024-05-21 22:00:00", "2024-05-22 08:00:00"),
    ("2024-05-22", "2024-05-22 22:00:00", "2024-05-23 08:00:00"),
    ("2024-05-23", "2024-05-23 22:00:00", "2024-05-24 08:00:00"),
    ("2024-05-24", "2024-05-24 22:00:00", "2024-05-25 08:00:00"),
    ("2024-05-25", "2024-05-25 22:00:00", "2024-05-26 08:00:00"),
    ("2024-05-26", "2024-05-26 22:00:00", "2024-05-27 08:00:00"),
    ("2024-05-27", "2024-05-27 22:00:00", "2024-05-28 08:00:00"),
    ("2024-05-28", "2024-05-28 22:00:00", "2024-05-29 08:00:00"),
    ("2024-05-29", "2024-05-29 22:00:00", "2024-05-30 08:00:00"),
    ("2024-05-30", "2024-05-30 22:00:00", "2024-05-31 08:00:00"),
    ("2024-05-31", "2024-05-31 22:00:00", "2024-06-01 08:00:00"),
    ("2024-06-01", "2024-06-01 22:00:00", "2024-06-02 08:00:00"),
    ("2024-06-02", "2024-06-02 22:00:00", "2024-06-03 08:00:00"),
    ("2024-06-03", "2024-06-03 22:00:00", "2024-06-04 08:00:00"),
    ("2024-06-04", "2024-06-04 22:00:00", "2024-06-05 08:00:00"),
    ("2024-06-05", "2024-06-05 22:00:00", "2024-06-06 08:00:00"),
    ("2024-06-06", "2024-06-06 22:00:00", "2024-06-07 08:00:00"),
    ("2024-06-07", "2024-06-07 22:00:00", "2024-06-08 08:00:00"),
})

# SYNTHETIC-FIXTURE: Exact correction occurrences from manufactured ISF nights.
_ISF_CORRECTION_ROWS = frozenset({
    ("correction_clusters", "2024-05-10 23:30:00", "clean"),
    ("correction_clusters", "2024-05-12 00:00:00", "clean"),
    ("correction_clusters", "2024-05-13 00:30:00", "clean"),
    ("correction_clusters", "2024-05-14 01:00:00", "clean"),
    ("correction_clusters", "2024-05-15 01:30:00", "clean"),
    ("correction_clusters", "2024-05-16 02:00:00", "clean"),
    ("correction_clusters", "2024-05-17 02:30:00", "clean"),
    ("correction_clusters", "2024-05-18 23:30:00", "clean"),
    ("correction_clusters", "2024-05-20 00:00:00", "clean"),
    ("correction_clusters", "2024-05-21 00:30:00", "clean"),
    ("correction_clusters", "2024-05-22 01:00:00", "clean"),
    ("correction_clusters", "2024-05-23 01:30:00", "clean"),
    ("correction_clusters", "2024-05-24 02:00:00", "clean"),
    ("correction_clusters", "2024-05-25 02:30:00", "clean"),
    ("correction_clusters", "2024-05-26 23:30:00", "clean"),
    ("correction_clusters", "2024-05-28 00:00:00", "clean"),
    ("correction_clusters", "2024-05-29 00:30:00", "clean"),
    ("correction_clusters", "2024-05-30 01:00:00", "clean"),
    ("correction_clusters", "2024-05-31 01:30:00", "clean"),
    ("correction_clusters", "2024-06-01 02:00:00", "clean"),
    ("correction_clusters", "2024-06-02 02:30:00", "clean"),
    ("correction_clusters", "2024-06-03 23:30:00", "clean"),
    ("correction_clusters", "2024-06-05 00:00:00", "clean"),
    ("correction_clusters", "2024-06-06 00:30:00", "clean"),
    ("correction_clusters", "2024-06-07 01:00:00", "clean"),
    ("correction_clusters", "2024-06-08 01:30:00", "clean"),
})

_IC_EIGHT_MEAL_ROWS = frozenset({
    ("meals", "2024-05-17 09:00:00", "no_data"),
    ("meals", "2024-05-18 09:00:00", "no_data"),
    ("meals", "2024-05-19 09:00:00", "no_data"),
    ("meals", "2024-05-20 09:00:00", "no_data"),
    ("meals", "2024-05-21 09:00:00", "no_data"),
    ("meals", "2024-05-22 09:00:00", "no_data"),
    ("meals", "2024-05-23 09:00:00", "no_data"),
    ("meals", "2024-05-24 09:00:00", "no_data"),
})

_IC_NINE_MEAL_ROWS = frozenset({
    ("meals", "2024-05-16 09:00:00", "no_data"),
    ("meals", "2024-05-17 09:00:00", "no_data"),
    ("meals", "2024-05-18 09:00:00", "no_data"),
    ("meals", "2024-05-19 09:00:00", "no_data"),
    ("meals", "2024-05-20 09:00:00", "no_data"),
    ("meals", "2024-05-21 09:00:00", "no_data"),
    ("meals", "2024-05-22 09:00:00", "no_data"),
    ("meals", "2024-05-23 09:00:00", "no_data"),
    ("meals", "2024-05-24 09:00:00", "no_data"),
})

_IC_SEVEN_MEAL_ROWS = frozenset({
    ("meals", "2024-05-18 09:00:00", "no_data"),
    ("meals", "2024-05-19 09:00:00", "no_data"),
    ("meals", "2024-05-20 09:00:00", "no_data"),
    ("meals", "2024-05-21 09:00:00", "no_data"),
    ("meals", "2024-05-22 09:00:00", "no_data"),
    ("meals", "2024-05-23 09:00:00", "no_data"),
    ("meals", "2024-05-24 09:00:00", "no_data"),
})

_IC_COLLECTING_MEAL_ROWS = frozenset({
    ("meals", "2024-03-17 09:00:00", "no_data"),
    ("meals", "2024-03-18 09:00:00", "no_data"),
    ("meals", "2024-03-19 09:00:00", "no_data"),
    ("meals", "2024-03-20 09:00:00", "no_data"),
    ("meals", "2024-03-21 09:00:00", "no_data"),
    ("meals", "2024-03-22 09:00:00", "no_data"),
    ("meals", "2024-03-23 09:00:00", "no_data"),
    ("meals", "2024-03-24 09:00:00", "no_data"),
})

_IC_HISTORY_MEAL_ROWS = frozenset({
    ("meals", "2024-05-02 09:00:00", "no_data"),
    ("meals", "2024-05-03 09:00:00", "no_data"),
    ("meals", "2024-05-04 09:00:00", "no_data"),
    ("meals", "2024-05-05 09:00:00", "no_data"),
    ("meals", "2024-05-12 09:00:00", "no_data"),
    ("meals", "2024-05-13 09:00:00", "no_data"),
    ("meals", "2024-05-14 09:00:00", "no_data"),
    ("meals", "2024-05-15 09:00:00", "no_data"),
    ("meals", "2024-05-16 09:00:00", "no_data"),
    ("meals", "2024-05-17 09:00:00", "no_data"),
    ("meals", "2024-05-18 09:00:00", "no_data"),
    ("meals", "2024-05-19 09:00:00", "no_data"),
})

_IC_HISTORY_SERIES = ({
    "run_id": "icr1_WyIyMDI0LTA1LTAyVDA5OjAwOjAwIl0",
    "first_member_at": "2024-05-02T09:00:00",
    "last_member_at": "2024-05-02T09:00:00",
    "member_offsets_min": [0.0], "cgm_start_min": -10.0,
    "cgm_end_min": 315.0, "outcome_min": 300.0,
    "meal_at": "2024-05-02T09:00:00", "points": [],
}, {
    "run_id": "icr1_WyIyMDI0LTA1LTAzVDA5OjAwOjAwIl0",
    "first_member_at": "2024-05-03T09:00:00",
    "last_member_at": "2024-05-03T09:00:00",
    "member_offsets_min": [0.0], "cgm_start_min": -10.0,
    "cgm_end_min": 315.0, "outcome_min": 300.0,
    "meal_at": "2024-05-03T09:00:00", "points": [],
}, {
    "run_id": "icr1_WyIyMDI0LTA1LTA0VDA5OjAwOjAwIl0",
    "first_member_at": "2024-05-04T09:00:00",
    "last_member_at": "2024-05-04T09:00:00",
    "member_offsets_min": [0.0], "cgm_start_min": -10.0,
    "cgm_end_min": 315.0, "outcome_min": 300.0,
    "meal_at": "2024-05-04T09:00:00", "points": [],
}, {
    "run_id": "icr1_WyIyMDI0LTA1LTA1VDA5OjAwOjAwIl0",
    "first_member_at": "2024-05-05T09:00:00",
    "last_member_at": "2024-05-05T09:00:00",
    "member_offsets_min": [0.0], "cgm_start_min": -10.0,
    "cgm_end_min": 315.0, "outcome_min": 300.0,
    "meal_at": "2024-05-05T09:00:00", "points": [],
})


def _materialize_isf_coverage(
    store, *, true_isf: float, rescue_offsets: tuple[int, ...] = (),
) -> None:
    """Write two analyzer-visible ISF decision windows over manufactured nights."""
    first = date(2024, 5, 1)
    cgm, bolus = [], []
    seq_num = 40_000
    for offset in range(ISF_SOURCE_SPAN_DAYS - 1):
        current = first + timedelta(days=offset)
        start = datetime.combine(current, datetime.min.time()).replace(hour=22)
        plan = _ISF_CORRECTION_PLANS[offset % len(_ISF_CORRECTION_PLANS)]
        correction_times = [
            (start + timedelta(hours=hour, minutes=minute), units)
            for hour, minute, units in plan
        ]
        activity = InsulinActivity(
            correction_times, 75, 300,
        )
        bg = 140.0
        times = [start + timedelta(minutes=5 * step) for step in range(97)]
        cgm.append({
            "EventDateTime": times[0].strftime("%Y-%m-%d %H:%M:%S"),
            "Readings (CGM / BGM)": round(bg, 1),
            "Description": "Synthetic EGV",
        })
        for left, right in zip(times, times[1:]):
            bg = bg - true_isf * activity.acted(left, right) + 0.4
            cgm.append({
                "EventDateTime": right.strftime("%Y-%m-%d %H:%M:%S"),
                "Readings (CGM / BGM)": round(bg, 1),
                "Description": "Synthetic EGV",
            })
        for when, units in correction_times:
            bolus.append({
                "seq_num": seq_num,
                "request_time": when.strftime("%Y-%m-%d %H:%M:%S"),
                "description": "Synthetic fasting correction",
                "completion": "Completed",
                "insulin": units,
                "requested_insulin": units,
                "isf": 40.0,
            })
            seq_num += 1
    last = first + timedelta(days=ISF_SOURCE_SPAN_DAYS - 1)
    cgm.append({
        "EventDateTime": f"{last.isoformat()} 23:59:00",
        "Readings (CGM / BGM)": 170.0,
        "Description": "Synthetic EGV",
    })
    store.upsert_cgm(cgm)
    store.upsert_bolus(bolus)
    store.upsert_settings_snapshot(f"{first.isoformat()} 00:00:00", _settings())
    observed_at = datetime.combine(first, datetime.min.time())
    store.record_prompt_response(
        detector="low", anchor_t=observed_at, answer="no", answered_at=observed_at,
    )
    for offset in rescue_offsets:
        current = first + timedelta(days=offset)
        plan = _ISF_CORRECTION_PLANS[offset % len(_ISF_CORRECTION_PLANS)]
        rescue_at = (
            datetime.combine(current, datetime.min.time()).replace(hour=22)
            + timedelta(hours=plan[0][0], minutes=plan[0][1] + 120)
        )
        store.upsert_carb_entry(CarbEntry(
            t=rescue_at, grams=16.0, certainty="estimate", source="manual",
            note="Synthetic correction rescue", created_at=rescue_at,
        ))


def _materialize_ic_coverage(
    store, *, measured_ratio: float, run_count: int = 8,
    source_span_days: int = IC_SOURCE_SPAN_DAYS, rescue_hold: bool = False,
) -> None:
    """Write one manufactured all-day I:C meal-run lane."""
    first = date(2024, 3, 1)
    last = first + timedelta(days=source_span_days - 1)
    cgm = [
        {
            "EventDateTime": f"{first.isoformat()} 00:00:00",
            "Readings (CGM / BGM)": 120.0,
            "Description": "Synthetic EGV",
        },
        {
            "EventDateTime": f"{last.isoformat()} 23:59:00",
            "Readings (CGM / BGM)": 120.0,
            "Description": "Synthetic EGV",
        },
    ]
    meals = []
    for index in range(run_count):
        current = last - timedelta(days=run_count + 5 - index)
        meals.append({
            "seq_num": 60_000 + index,
            "request_time": f"{current.isoformat()} 09:00:00",
            "description": "Synthetic closed meal run",
            "completion": "Completed",
            "insulin": 60.0 / measured_ratio,
            "requested_insulin": 60.0 / measured_ratio,
            "carbs": 60.0,
            "carb_ratio": 10.0,
            "isf": 40.0,
            "target_bg": 110.0,
        })
    store.upsert_cgm(cgm)
    store.upsert_bolus(meals)
    store.upsert_settings_snapshot(f"{first.isoformat()} 00:00:00", _settings())
    if rescue_hold:
        rescue_at = datetime.fromisoformat(meals[2]["request_time"]) + timedelta(hours=2)
        store.upsert_carb_entry(CarbEntry(
            t=rescue_at, grams=16.0, certainty="estimate", source="manual",
            note="Synthetic pre-empted low rescue", created_at=rescue_at,
        ))


def _materialize_ic_history_register(store) -> None:
    """Write one active retired I:C identity beside a quiet current block."""
    first = date(2024, 3, 1)
    last = first + timedelta(days=IC_SOURCE_SPAN_DAYS - 1)
    changed = last - timedelta(days=20)
    store.upsert_cgm([
        {
            "EventDateTime": f"{first.isoformat()} 00:00:00",
            "Readings (CGM / BGM)": 120.0,
            "Description": "Synthetic EGV",
        },
        {
            "EventDateTime": f"{last.isoformat()} 23:59:00",
            "Readings (CGM / BGM)": 120.0,
            "Description": "Synthetic EGV",
        },
    ])
    meals = []
    for index in range(4):
        current = changed - timedelta(days=8 - index)
        meals.append({
            "seq_num": 70_000 + index,
            "request_time": f"{current.isoformat()} 09:00:00",
            "description": "Synthetic retired-ratio meal run",
            "completion": "Completed",
            "insulin": 5.0,
            "requested_insulin": 5.0,
            "carbs": 60.0,
            "carb_ratio": 12.0,
            "isf": 40.0,
            "target_bg": 110.0,
        })
    for index in range(8):
        current = changed + timedelta(days=2 + index)
        meals.append({
            "seq_num": 70_100 + index,
            "request_time": f"{current.isoformat()} 09:00:00",
            "description": "Synthetic current-ratio meal run",
            "completion": "Completed",
            "insulin": 6.0,
            "requested_insulin": 6.0,
            "carbs": 60.0,
            "carb_ratio": 10.0,
            "isf": 40.0,
            "target_bg": 110.0,
        })
    store.upsert_bolus(meals)
    store.upsert_settings_snapshot(f"{first.isoformat()} 00:00:00", _settings(12.0))
    store.upsert_settings_snapshot(f"{changed.isoformat()} 00:00:00", _settings())


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

_SHOWCASE_REST_WINDOWS = frozenset(
    (
        current.isoformat(),
        f"{current.isoformat()} 22:00:00",
        f"{(current + timedelta(days=1)).isoformat()} 08:00:00",
    )
    for current in (date(2024, 6, 1) + timedelta(days=offset) for offset in range(29))
)

_BEHAVIORAL_30_DAY_REST_WINDOWS = frozenset(
    (
        current.isoformat(),
        f"{current.isoformat()} 22:00:00",
        f"{(current + timedelta(days=1)).isoformat()} 08:00:00",
    )
    for current in (date(2024, 5, 1) + timedelta(days=offset) for offset in range(29))
)
_BEHAVIORAL_8_DAY_REST_WINDOWS = frozenset(
    (
        current.isoformat(),
        f"{current.isoformat()} 22:00:00",
        f"{(current + timedelta(days=1)).isoformat()} 08:00:00",
    )
    for current in (date(2024, 5, 1) + timedelta(days=offset) for offset in range(7))
)
_BEHAVIORAL_8_MEAL_ROWS = frozenset(
    ("meals", f"2024-05-{day:02d} 12:00:00", "no_data")
    for day in range(1, 9)
)
_BEHAVIORAL_8_CORRECTION_ROWS = frozenset(
    ("correction_clusters", f"2024-05-{day:02d} 14:00:00", "clean")
    for day in range(1, 9)
)


def _verdict_tally(
    denominator: int, *, fired: int, outranked: int, near_miss: int,
    no_data: int, clean: int,
) -> ExpectedVerdictTally:
    return ExpectedVerdictTally(denominator, {
        "fired": fired,
        "outranked": outranked,
        "near_miss": near_miss,
        "no_data": no_data,
        "clean": clean,
    })

_SHOWCASE_HISTORY_RUN_IDS = (
    "icr1_WyIyMDI0LTA2LTAyVDA4OjAwOjAwIl0",
    "icr1_WyIyMDI0LTA2LTAzVDA4OjAwOjAwIl0",
    "icr1_WyIyMDI0LTA2LTA0VDA4OjAwOjAwIl0",
    "icr1_WyIyMDI0LTA2LTA1VDA4OjAwOjAwIl0",
    "icr1_WyIyMDI0LTA2LTA2VDA4OjAwOjAwIl0",
    "icr1_WyIyMDI0LTA2LTA3VDA4OjAwOjAwIl0",
    "icr1_WyIyMDI0LTA2LTA4VDA4OjAwOjAwIl0",
    "icr1_WyIyMDI0LTA2LTA5VDA4OjAwOjAwIl0",
    "icr1_WyIyMDI0LTA2LTEwVDA4OjAwOjAwIl0",
    "icr1_WyIyMDI0LTA2LTExVDA4OjAwOjAwIl0",
    "icr1_WyIyMDI0LTA2LTEyVDA4OjAwOjAwIl0",
    "icr1_WyIyMDI0LTA2LTEzVDA4OjAwOjAwIl0",
    "icr1_WyIyMDI0LTA2LTE0VDA4OjAwOjAwIl0",
    "icr1_WyIyMDI0LTA2LTE1VDA4OjAwOjAwIl0",
)


def _showcase_history_series() -> tuple[dict, ...]:
    points = [{"minute": float(minute), "bg": 120.0} for minute in range(-10, 316, 5)]
    rows = []
    for index, offset in enumerate(range(2, 16)):
        stamp = f"2024-06-{offset:02d}T08:00:00"
        rows.append({
            "run_id": _SHOWCASE_HISTORY_RUN_IDS[index],
            "first_member_at": stamp,
            "last_member_at": stamp,
            "member_offsets_min": [0.0],
            "cgm_start_min": -10.0,
            "cgm_end_min": 315.0,
            "outcome_min": 300.0,
            "meal_at": stamp,
            "points": points if offset < 15 else points[:-1],
        })
    return tuple(rows)


def _explicit_rows(
    rows: Mapping[AnalyzerRowKey, ExpectedAnalyzerRow],
) -> ExpectedAnalyzerRows:
    return ExpectedAnalyzerRows(tuple(rows), overrides=rows)


def _basal_rows(
    overrides: Mapping[AnalyzerRowKey, ExpectedAnalyzerRow],
    default: ExpectedAnalyzerRow = _BASAL_NO_DATA,
) -> ExpectedAnalyzerRows:
    return ExpectedAnalyzerRows(_BASAL_SLOT_KEYS, default, overrides)


def _isf_rows(default: ExpectedIsfRow) -> ExpectedAnalyzerRows:
    return ExpectedAnalyzerRows((("isf", "Fasting"),), default)


def _ic_rows(default: ExpectedIcRow) -> ExpectedAnalyzerRows:
    return ExpectedAnalyzerRows((("ic", "All day"),), default)


def _basal_support(target: str, count: int) -> Mapping[AnalyzerRowKey, ExpectedSupport]:
    return {
        key: ExpectedSupport(directional_support_count=count if key == ("basal", target) else 0)
        for key in _BASAL_SLOT_KEYS
    }

QA_CASES = (
    QaCase(
        _SHOWCASE,
        _showcase_recipe,
        QaExpectation(
            _explicit_rows({
                ("basal", "03:00"): _BASAL_LOWER,
                ("basal", "03:30"): _BASAL_LOWER,
            }),
            {
                ("basal", "03:00"): ExpectedSupport(directional_support_count=30),
                ("basal", "03:30"): ExpectedSupport(directional_support_count=30),
            },
            {
                ("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None, 'Delivered below the programmed rate across 30 steady nights. One cautious step down is supported at this time.'),
                ("whole_day", ("ic", "All day")): ExpectedQueueRow("history", None, None, 'Measured 12 g/U across 14 meal runs while 12 was programmed, until 2024-06-16. Programmed now: 10.'),
            },
            frozenset(),
            _SHOWCASE_REST_WINDOWS,
            {"ich1_WzAsMTQ0MCwiMTIiXQ": _showcase_history_series()},
            _SHOWCASE_BEHAVIORAL_ROWS,
            frozenset({"Basal 03:00 to 04:00 · lower", "Carb ratio All day. Past setting.", "Correction on active insulin", "Meal bolus fell short", "Over-treated low"}),
            {
                ("over_treated_low", "lows"): _verdict_tally(
                    5, fired=1, outranked=1, near_miss=1, no_data=1, clean=1,
                ),
                ("correction_on_iob", "lows"): _verdict_tally(
                    5, fired=1, outranked=1, near_miss=0, no_data=0, clean=3,
                ),
                ("meal_bolus_short", "highs"): _verdict_tally(
                    2, fired=1, outranked=0, near_miss=1, no_data=0, clean=0,
                ),
            },
        ),
        30,
    ),
    QaCase(
        _SETTING_RECOMMENDATION,
        _setting_recommendation_recipe,
        QaExpectation(
            _explicit_rows({
                ("basal", "03:00"): _BASAL_LOWER,
                ("basal", "03:30"): _BASAL_LOWER,
            }),
            {
                ("basal", "03:00"): ExpectedSupport(directional_support_count=12),
                ("basal", "03:30"): ExpectedSupport(directional_support_count=12),
            },
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None, 'Delivered below the programmed rate across 12 steady nights. One cautious step down is supported at this time.')},
            frozenset(), frozenset(), {},
            frozenset(),
            frozenset({"Basal 03:00 to 04:00 · lower"}),
            {},
        ),
        12,
    ),
    QaCase(
        _BEHAVIORAL_PRECEDENCE,
        _behavioral_precedence_recipe,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(), frozenset(), {},
            _BEHAVIORAL_ROWS,
            frozenset({
                "Carb undercount", "Correction on active insulin",
                "Over-treated low", "meals-start-high",
            }),
            {
                ("over_treated_low", "lows"): _verdict_tally(
                    5, fired=1, outranked=1, near_miss=1, no_data=1, clean=1,
                ),
                ("carb_undercount", "meals"): _verdict_tally(
                    2, fired=1, outranked=0, near_miss=0, no_data=0, clean=1,
                ),
                ("correction_on_iob", "lows"): _verdict_tally(
                    5, fired=1, outranked=1, near_miss=0, no_data=0, clean=3,
                ),
            },
        ),
        5,
    ),
    QaCase(
        "basal-raise",
        partial(_materialize_basal_coverage, clean_rate=0.66),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_RAISE}),
            _basal_support("03:00", 30),
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "raise", None, 'Delivered 0.66 U/h across 30 steady nights against 0.60 programmed. One cautious step up is supported at this time.')},
            frozenset(), frozenset(), {}, frozenset(),
            frozenset({"Basal 03:00 · raise"}),
        ),
        BASAL_SOURCE_SPAN_DAYS,
        "basal",
    ),
    QaCase(
        "basal-lower",
        partial(_materialize_basal_coverage, clean_rate=0.54),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_LOWER}),
            _basal_support("03:00", 30),
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None, 'Delivered 0.54 U/h across 30 steady nights against 0.60 programmed. One cautious step down is supported at this time.')},
            frozenset(), frozenset(), {}, frozenset(),
            frozenset({"Basal 03:00 · lower"}),
        ), BASAL_SOURCE_SPAN_DAYS, "basal",
    ),
    QaCase(
        "basal-capped-raise",
        partial(_materialize_basal_coverage, clean_rate=0.8),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_CAPPED_RAISE}),
            _basal_support("03:00", 30),
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "raise", None, 'Delivered 0.80 U/h across 30 steady nights against 0.60 programmed. A step up, limited to 20% above the set rate.')},
            frozenset(), frozenset(), {}, frozenset(),
            frozenset({"Basal 03:00 · raise"}),
        ), BASAL_SOURCE_SPAN_DAYS, "basal",
    ),
    QaCase(
        "basal-capped-lower",
        partial(_materialize_basal_coverage, clean_rate=0.4),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_CAPPED_LOWER}),
            _basal_support("03:00", 30),
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None, 'Delivered 0.40 U/h across 30 steady nights against 0.60 programmed. A step down, limited to 20% below the set rate.')},
            frozenset(), frozenset(), {}, frozenset(),
            frozenset({"Basal 03:00 · lower"}),
        ), BASAL_SOURCE_SPAN_DAYS, "basal",
    ),
    QaCase(
        "basal-insufficient-seven-night",
        partial(_materialize_basal_coverage, clean_rate=0.48, informative_nights=7),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_INSUFFICIENT}),
            _basal_support("03:00", 7),
            {
                ((180, 240), ("basal", "03:00")): ExpectedQueueRow("held", None, None, 'Delivered 0.48 U/h across 7 steady nights against 0.60 programmed. Not enough nights of steady data yet to point one way.'),
                ((180, 240), ("basal", "03:30")): ExpectedQueueRow("blind", None, None, 'No steady nights delivered against the programmed rate here, so nothing to say either way.'),
            },
            frozenset({("whole_day", ("basal", "03:00"))}),
            frozenset(), {}, frozenset(), frozenset(),
        ), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "basal-insufficient-unsupported-sign",
        partial(_materialize_basal_coverage, clean_rate=0.48, informative_nights=8),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_INSUFFICIENT}),
            _basal_support("03:00", 8),
            {
                ((180, 240), ("basal", "03:00")): ExpectedQueueRow("held", None, None, 'Delivered 0.48 U/h across 8 steady nights against 0.60 programmed. Not enough nights of steady data yet to point one way.'),
                ((180, 240), ("basal", "03:30")): ExpectedQueueRow("blind", None, None, 'No steady nights delivered against the programmed rate here, so nothing to say either way.'),
            },
            frozenset({("whole_day", ("basal", "03:00"))}),
            frozenset(), {}, frozenset(), frozenset(),
        ), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "basal-blind",
        partial(_materialize_basal_coverage, clean_rate=None, informative_nights=0),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_NO_DATA}),
            _basal_support("03:00", 0),
            {
                ((180, 240), ("basal", "00:00")): ExpectedQueueRow("blind", None, None, 'No steady nights delivered against the programmed rate here, so nothing to say either way.'),
            },
            frozenset({
                ("whole_day", ("basal", "03:00")),
                ((180, 240), ("basal", "03:00")),
            }),
            frozenset(), {}, frozenset(), frozenset(),
        ), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "basal-no-baseline",
        partial(
            _materialize_basal_coverage, clean_rate=0.48,
            programmed_rate=None, include_settings=False,
        ),
        QaExpectation(
            _basal_rows(
                {("basal", "03:00"): _BASAL_NO_BASELINE},
                ExpectedBasalRow(
                    safety_status="no data",
                    omitted=frozenset({"current", "recommended"}),
                ),
            ),
            _basal_support("03:00", 0),
            {
                ((180, 240), ("basal", "03:00")): ExpectedQueueRow("held", None, None, '30 steady nights delivered so far. No set rate to step from, so only the measured range is shown.'),
                ((180, 240), ("basal", "03:30")): ExpectedQueueRow("blind", None, None, 'No steady nights delivered against the programmed rate here, so nothing to say either way.'),
            },
            frozenset({("whole_day", ("basal", "03:00"))}),
            frozenset(), {}, frozenset(), frozenset(),
        ), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "basal-no-change",
        partial(_materialize_basal_coverage, clean_rate=0.6),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_NO_CHANGE}),
            _basal_support("03:00", 0), {
                ((180, 240), ("basal", "03:30")): ExpectedQueueRow("blind", None, None, 'No steady nights delivered against the programmed rate here, so nothing to say either way.'),
            },
            frozenset({
                ("whole_day", ("basal", "03:00")),
                ((180, 240), ("basal", "03:00")),
            }),
            frozenset(), {}, frozenset(), frozenset(),
        ), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "basal-recurring-low-lower",
        partial(
            _materialize_basal_coverage, clean_rate=0.54, recurring_lows=True,
        ),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_HARM_LOWER}),
            _basal_support("03:00", 30),
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None, 'Delivered 0.54 U/h across 30 steady nights against 0.60 programmed. Lows keep happening at this hour, so the rate steps down toward the measured rate (20% at most).')},
            frozenset(), frozenset(), {}, frozenset({
                ("lows", "2024-05-30 03:00:00", "clean"),
                ("lows", "2024-05-31 03:00:00", "clean"),
            }),
            frozenset({"Basal 03:00 · lower"}),
        ), BASAL_SOURCE_SPAN_DAYS, "basal",
    ),
    QaCase(
        "basal-recurring-low-no-clean-median",
        partial(
            _materialize_basal_coverage, clean_rate=None, informative_nights=0,
            recurring_lows=True, low_minute=300, suspended=True,
        ),
        QaExpectation(
            _basal_rows({("basal", "05:00"): _BASAL_HARM_LOWER}),
            _basal_support("05:00", 0),
            {("whole_day", ("basal", "05:00")): ExpectedQueueRow("assert", "lower", None, 'Delivered below the programmed rate across 0 steady nights. Lows keep happening at this hour, so the rate steps down toward the measured rate (20% at most).')},
            frozenset(), frozenset(), {}, frozenset({
                ("lows", "2024-05-30 05:00:00", "clean"),
                ("lows", "2024-05-31 05:00:00", "clean"),
            }),
            frozenset({"Basal 05:00 · lower"}),
        ), BASAL_SOURCE_SPAN_DAYS, "basal",
    ),
    QaCase(
        "basal-recurring-low-gate",
        partial(
            _materialize_basal_coverage, clean_rate=0.66, recurring_lows=True,
        ),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_HARM_GATED}),
            _basal_support("03:00", 30),
            {
                ((180, 240), ("basal", "03:00")): ExpectedQueueRow("held", None, None, 'Delivered 0.66 U/h across 30 steady nights against 0.60 programmed. A low printed at this hour, so a step up is withheld and the rate stays as it is.'),
                ((180, 240), ("basal", "03:30")): ExpectedQueueRow("blind", None, None, 'No steady nights delivered against the programmed rate here, so nothing to say either way.'),
            },
            frozenset({("whole_day", ("basal", "03:00"))}),
            frozenset(), {}, frozenset({
                ("lows", "2024-05-30 03:00:00", "clean"),
                ("lows", "2024-05-31 03:00:00", "clean"),
            }),
            frozenset(),
        ), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "isf-strengthen",
        partial(_materialize_isf_coverage, true_isf=24.0),
        QaExpectation(
            _isf_rows(_ISF_STRENGTHEN),
            {("isf", "Fasting"): ExpectedSupport(n_steps=2784)},
            {
                ("whole_day", ("isf", "Fasting")): ExpectedQueueRow("assert", "strengthen", True, "This slot doesn't have enough evidence to recommend a change either way."),
            },
            frozenset(), _ISF_REST_WINDOWS, {}, _ISF_CORRECTION_ROWS,
            frozenset({"ISF · strengthen"}),
        ),
        ISF_SOURCE_SPAN_DAYS,
        "isf",
    ),
    QaCase(
        "isf-direction-only-weaken",
        partial(
            _materialize_isf_coverage, true_isf=24.0,
            rescue_offsets=(12, 18, 24, 30),
        ),
        QaExpectation(
            _isf_rows(_ISF_DIRECTION_ONLY_WEAKEN),
            {("isf", "Fasting"): ExpectedSupport(n_steps=2716)},
            {
                ("whole_day", ("isf", "Fasting")): ExpectedQueueRow("assert", "weaken", False, "This slot doesn't have enough evidence to recommend a change either way."),
            },
            frozenset(), _ISF_REST_WINDOWS, {}, _ISF_CORRECTION_ROWS,
            frozenset({"ISF · weaken"}),
        ),
        ISF_SOURCE_SPAN_DAYS,
        "isf",
    ),
    QaCase(
        "isf-held",
        partial(_materialize_isf_coverage, true_isf=24.0, rescue_offsets=(24,)),
        QaExpectation(
            _isf_rows(_ISF_HELD),
            {("isf", "Fasting"): ExpectedSupport(n_steps=2767)},
            {}, frozenset({("whole_day", ("isf", "Fasting"))}),
            _ISF_REST_WINDOWS, {}, _ISF_CORRECTION_ROWS, frozenset(),
        ),
        ISF_SOURCE_SPAN_DAYS,
        "isf",
    ),
    QaCase(
        "ic-collecting",
        partial(
            _materialize_ic_coverage, measured_ratio=12.0,
            source_span_days=30,
        ),
        QaExpectation(
            _ic_rows(_IC_COLLECTING),
            {
                ("ic", "All day"):
                    ExpectedSupport(n_runs=8, effective_run_count=8.0),
            },
            {
                ((0, 720), ("basal", "00:00")): ExpectedQueueRow("blind", None, None, 'No steady nights delivered against the programmed rate here, so nothing to say either way.'),
            },
            frozenset({
                ("whole_day", ("ic", "All day")),
                ((0, 720), ("ic", "All day")),
            }),
            frozenset(), {}, _IC_COLLECTING_MEAL_ROWS, frozenset(),
        ),
        30,
        "ic",
        ((0, 720),),
    ),
    QaCase(
        "ic-raise",
        partial(_materialize_ic_coverage, measured_ratio=12.0),
        QaExpectation(
            _ic_rows(_IC_RAISE),
            {
                ("ic", "All day"):
                    ExpectedSupport(n_runs=8, effective_run_count=8.0),
            },
            {
                ("whole_day", ("ic", "All day")): ExpectedQueueRow("assert", "raise", None, 'Measured 12 g/U across 8 meal runs against 10 programmed. Meals look slightly over-covered relative to programmed I:C.'),
            },
            frozenset(), frozenset(), {}, _IC_EIGHT_MEAL_ROWS,
            frozenset({"I:C 00:00 to 24:00 · raise"}),
        ),
        IC_SOURCE_SPAN_DAYS,
        "ic",
    ),
    QaCase(
        "ic-lower",
        partial(_materialize_ic_coverage, measured_ratio=8.0),
        QaExpectation(
            _ic_rows(_IC_LOWER),
            {
                ("ic", "All day"):
                    ExpectedSupport(n_runs=8, effective_run_count=8.0),
            },
            {
                ("whole_day", ("ic", "All day")): ExpectedQueueRow("assert", "lower", None, 'Measured 8 g/U across 8 meal runs against 10 programmed. Post-meal corrections imply meals are under-covered — a tighter (smaller) I:C would dose more per carb.'),
            },
            frozenset(), frozenset(), {}, _IC_EIGHT_MEAL_ROWS,
            frozenset({"I:C 00:00 to 24:00 · lower"}),
        ),
        IC_SOURCE_SPAN_DAYS,
        "ic",
    ),
    QaCase(
        "ic-capped-raise",
        partial(_materialize_ic_coverage, measured_ratio=20.0),
        QaExpectation(
            _ic_rows(_IC_RAISE),
            {
                ("ic", "All day"):
                    ExpectedSupport(n_runs=8, effective_run_count=8.0),
            },
            {
                ("whole_day", ("ic", "All day")): ExpectedQueueRow("assert", "raise", None, 'Measured 20 g/U across 8 meal runs against 10 programmed. Meals look slightly over-covered relative to programmed I:C.'),
            },
            frozenset(), frozenset(), {}, _IC_EIGHT_MEAL_ROWS,
            frozenset({"I:C 00:00 to 24:00 · raise"}),
        ),
        IC_SOURCE_SPAN_DAYS,
        "ic",
    ),
    QaCase(
        "ic-capped-lower",
        partial(_materialize_ic_coverage, measured_ratio=4.0),
        QaExpectation(
            _ic_rows(_IC_LOWER),
            {
                ("ic", "All day"):
                    ExpectedSupport(n_runs=8, effective_run_count=8.0),
            },
            {
                ("whole_day", ("ic", "All day")): ExpectedQueueRow("assert", "lower", None, 'Measured 4 g/U across 8 meal runs against 10 programmed. Post-meal corrections imply meals are under-covered — a tighter (smaller) I:C would dose more per carb.'),
            },
            frozenset(), frozenset(), {}, _IC_EIGHT_MEAL_ROWS,
            frozenset({"I:C 00:00 to 24:00 · lower"}),
        ),
        IC_SOURCE_SPAN_DAYS,
        "ic",
    ),
    QaCase(
        "ic-held",
        partial(
            _materialize_ic_coverage, measured_ratio=8.0, run_count=9,
            rescue_hold=True,
        ),
        QaExpectation(
            _ic_rows(_IC_HELD),
            {
                ("ic", "All day"):
                    ExpectedSupport(n_runs=8, effective_run_count=8.0),
            },
            {
                ((0, 720), ("ic", "All day")): ExpectedQueueRow("held", None, None, 'Measured 8 g/U across 8 meal runs against 10 programmed. Held at current: pre-empted low.'),
                ((0, 720), ("basal", "00:00")): ExpectedQueueRow("blind", None, None, 'No steady nights delivered against the programmed rate here, so nothing to say either way.'),
            },
            frozenset({("whole_day", ("ic", "All day"))}),
            frozenset(), {}, _IC_NINE_MEAL_ROWS, frozenset(),
        ),
        IC_SOURCE_SPAN_DAYS,
        "ic",
        ((0, 720),),
    ),
    QaCase(
        "ic-quiet-seven-run",
        partial(_materialize_ic_coverage, measured_ratio=12.0, run_count=7),
        QaExpectation(
            _ic_rows(_IC_QUIET),
            {
                ("ic", "All day"):
                    ExpectedSupport(n_runs=7, effective_run_count=7.0),
            },
            {
                ((0, 720), ("basal", "00:00")): ExpectedQueueRow("blind", None, None, 'No steady nights delivered against the programmed rate here, so nothing to say either way.'),
            },
            frozenset({
                ("whole_day", ("ic", "All day")),
                ((0, 720), ("ic", "All day")),
            }),
            frozenset(), {}, _IC_SEVEN_MEAL_ROWS, frozenset(),
        ),
        IC_SOURCE_SPAN_DAYS,
        "ic",
        ((0, 720),),
    ),
    QaCase(
        "ic-history-register",
        _materialize_ic_history_register,
        QaExpectation(
            _ic_rows(_IC_HISTORY_CURRENT),
            {
                ("ic", "All day"):
                    ExpectedSupport(n_runs=8, effective_run_count=8.0),
            },
            {
                ("whole_day", ("ic", "All day")): ExpectedQueueRow("history", None, None, 'Measured 12 g/U across 4 meal runs while 12 was programmed, until 2024-05-10. Programmed now: 10.'),
            },
            frozenset(), frozenset(),
            {"ich1_WzAsMTQ0MCwiMTIiXQ": _IC_HISTORY_SERIES},
            _IC_HISTORY_MEAL_ROWS,
            frozenset({"Carb ratio All day. Past setting."}),
        ),
        IC_SOURCE_SPAN_DAYS,
        "ic",
    ),
    QaCase(
        "behavioral-carb-undercount",
        _materialize_behavioral_carb_undercount,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, {},
            frozenset({
                ("meals", "2024-05-24 12:05:00", "fired"),
                ("meals", "2024-05-25 12:05:00", "fired"),
                ("meals", "2024-05-26 12:05:00", "fired"),
                ("meals", "2024-05-27 12:05:00", "near_miss"),
                ("meals", "2024-05-28 12:05:00", "no_data"),
                ("meals", "2024-05-29 12:05:00", "no_data"),
                ("highs", "2024-05-24 12:30:00", "near_miss"),
                ("highs", "2024-05-25 12:30:00", "near_miss"),
            }),
            frozenset({"Carb undercount", "Late bolus", "meals-start-high"}),
            {
                ("carb_undercount", "meals"): _verdict_tally(
                    6, fired=2, outranked=1, near_miss=1, no_data=1, clean=1,
                ),
                ("late_bolus", "meals"): _verdict_tally(
                    6, fired=1, outranked=2, near_miss=0, no_data=0, clean=3,
                ),
            },
            2,
        ),
        30,
    ),
    QaCase(
        "behavioral-late-bolus",
        _materialize_behavioral_late_bolus,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, {},
            frozenset({
                ("lows", "2024-05-27 11:40:00", "clean"),
                ("meals", "2024-05-01 00:00:00", "no_data"),
                ("meals", "2024-05-24 12:05:00", "fired"),
                ("meals", "2024-05-25 12:05:00", "fired"),
                ("meals", "2024-05-26 12:05:00", "fired"),
                ("meals", "2024-05-27 12:05:00", "near_miss"),
                ("meals", "2024-05-28 12:05:00", "no_data"),
                ("highs", "2024-05-26 12:30:00", "near_miss"),
            }),
            frozenset({"Late bolus", "Carb undercount", "meals-start-high"}),
            {
                ("late_bolus", "meals"): _verdict_tally(
                    6, fired=2, outranked=1, near_miss=1, no_data=1, clean=1,
                ),
                ("carb_undercount", "meals"): _verdict_tally(
                    6, fired=1, outranked=2, near_miss=0, no_data=0, clean=3,
                ),
            },
            1,
        ),
        30,
    ),
    QaCase(
        "behavioral-uncaused-highs",
        _materialize_behavioral_uncaused_highs,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(), frozenset(), {},
            frozenset({
                ("highs", "2024-05-02 09:30:00", "clean"),
                ("highs", "2024-05-02 10:45:00", "clean"),
            }),
            frozenset(), {}, uncaused_highs=2,
        ),
        2,
    ),
    QaCase(
        "behavioral-false-low-suppressed",
        partial(_materialize_behavioral_compression_low, answer="false-low"),
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(), frozenset(), {},
            frozenset(), frozenset(),
        ),
        2,
    ),
    QaCase(
        "behavioral-low-no-suppressed",
        partial(_materialize_behavioral_compression_low, answer="no"),
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(), frozenset(), {},
            frozenset({
                ("lows", "2024-05-02 03:05:00", "clean"),
            }), frozenset(),
        ),
        2,
    ),
    QaCase(
        "behavioral-lone-correction-clean",
        _materialize_behavioral_lone_correction,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(), frozenset(), {},
            frozenset({
                ("correction_clusters", "2024-05-01 12:00:00", "clean"),
            }), frozenset(),
        ),
        1,
    ),
    QaCase(
        "behavioral-meals-start-high",
        _materialize_behavioral_meals_start_high,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_8_DAY_REST_WINDOWS, {},
            frozenset({
                ("meals", "2024-05-01 12:00:00", "no_data"),
                ("meals", "2024-05-02 12:00:00", "no_data"),
                ("meals", "2024-05-03 12:00:00", "no_data"),
                ("meals", "2024-05-04 12:00:00", "no_data"),
                ("meals", "2024-05-05 12:00:00", "no_data"),
                ("meals", "2024-05-06 12:00:00", "no_data"),
                ("meals", "2024-05-07 12:00:00", "no_data"),
                ("meals", "2024-05-08 12:00:00", "no_data"),
            }),
            frozenset({"meals-start-high"}),
        ),
        8,
    ),
    QaCase(
        "behavioral-carb-counting",
        partial(_materialize_behavioral_ic_finding, correction_burden=False),
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_8_DAY_REST_WINDOWS, {}, _BEHAVIORAL_8_MEAL_ROWS,
            frozenset({"carb-counting"}),
        ),
        8,
    ),
    QaCase(
        "behavioral-post-meal-correction-burden",
        partial(_materialize_behavioral_ic_finding, correction_burden=True),
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_8_DAY_REST_WINDOWS, {},
            _BEHAVIORAL_8_MEAL_ROWS | _BEHAVIORAL_8_CORRECTION_ROWS,
            frozenset({"post-meal-correction-burden"}),
        ),
        8,
    ),
    QaCase(
        "behavioral-meal-over-delivery",
        _materialize_behavioral_meal_over_delivery,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, {},
            frozenset({
                ("lows", "2024-05-24 13:25:00", "clean"),
                ("lows", "2024-05-25 13:25:00", "clean"),
                ("meals", "2024-05-24 12:00:00", "fired"),
                ("meals", "2024-05-25 12:00:00", "fired"),
                ("meals", "2024-05-26 12:00:00", "fired"),
                ("meals", "2024-05-27 12:00:00", "near_miss"),
                ("meals", "2024-05-28 12:00:00", "no_data"),
                ("meals", "2024-05-29 12:00:00", "clean"),
                ("highs", "2024-05-26 12:25:00", "near_miss"),
            }),
            frozenset({
                "Meal over-delivery", "Carb undercount", "meals-start-high",
            }),
            {
                ("meal_over_delivery", "meals"): _verdict_tally(
                    6, fired=2, outranked=1, near_miss=1, no_data=1, clean=1,
                ),
                ("carb_undercount", "meals"): _verdict_tally(
                    6, fired=1, outranked=2, near_miss=0, no_data=0, clean=3,
                ),
            },
            1,
        ),
        30,
    ),
    QaCase(
        "behavioral-correction-stacking",
        _materialize_behavioral_correction_stacking,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, {},
            frozenset({
                ("correction_clusters", "2024-05-24 14:10:00", "clean"),
                ("correction_clusters", "2024-05-24 14:40:00", "fired"),
                ("lows", "2024-05-24 16:05:00", "no_data"),
                ("correction_clusters", "2024-05-25 14:10:00", "clean"),
                ("correction_clusters", "2024-05-25 14:40:00", "fired"),
                ("lows", "2024-05-25 16:05:00", "no_data"),
                ("correction_clusters", "2024-05-26 10:10:00", "clean"),
                ("correction_clusters", "2024-05-26 10:40:00", "near_miss"),
                ("correction_clusters", "2024-05-27 19:30:00", "clean"),
                ("correction_clusters", "2024-05-27 20:10:00", "clean"),
                ("highs", "2024-05-27 21:00:00", "fired"),
            }),
            frozenset({"Correction stacking", "Missed / unannounced meal"}),
            {
                ("correction_stacking", "correction_clusters"): _verdict_tally(
                    8, fired=2, outranked=0, near_miss=1, no_data=4, clean=1,
                ),
                ("missed_meal", "highs"): _verdict_tally(
                    1, fired=1, outranked=0, near_miss=0, no_data=0, clean=0,
                ),
            },
        ),
        30,
    ),
    QaCase(
        "behavioral-over-treated-low",
        _materialize_behavioral_over_treated_low,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, {},
            frozenset({
                ("lows", "2024-05-23 13:55:00", "fired"),
                ("lows", "2024-05-24 13:55:00", "fired"),
                ("lows", "2024-05-25 12:10:00", "near_miss"),
                ("lows", "2024-05-26 12:10:00", "clean"),
                ("lows", "2024-05-27 16:10:00", "no_data"),
                ("lows", "2024-05-28 22:00:00", "fired"),
                ("meals", "2024-05-28 19:00:00", "no_data"),
                ("highs", "2024-05-23 14:35:00", "near_miss"),
                ("highs", "2024-05-24 14:35:00", "near_miss"),
                ("correction_clusters", "2024-05-28 20:00:00", "clean"),
            }),
            frozenset({"Over-treated low", "Correction on active insulin"}),
            {
                ("over_treated_low", "lows"): _verdict_tally(
                    6, fired=2, outranked=1, near_miss=1, no_data=1, clean=1,
                ),
                ("correction_on_iob", "lows"): _verdict_tally(
                    6, fired=1, outranked=2, near_miss=0, no_data=0, clean=3,
                ),
            },
        ),
        30,
    ),
    QaCase(
        "behavioral-correction-on-iob",
        _materialize_behavioral_correction_on_iob,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, {}, frozenset({
                ("lows", "2024-05-24 22:00:00", "fired"),
                ("lows", "2024-05-25 22:00:00", "fired"),
                ("lows", "2024-05-26 13:55:00", "fired"),
                ("lows", "2024-05-27 22:00:00", "near_miss"),
                ("lows", "2024-05-28 16:10:00", "clean"),
                ("meals", "2024-05-24 19:00:00", "no_data"),
                ("meals", "2024-05-25 19:00:00", "no_data"),
                ("meals", "2024-05-27 19:00:00", "near_miss"),
                ("highs", "2024-05-26 14:35:00", "near_miss"),
                ("correction_clusters", "2024-05-24 20:00:00", "clean"),
                ("correction_clusters", "2024-05-25 20:00:00", "clean"),
                ("correction_clusters", "2024-05-27 20:00:00", "clean"),
            }), frozenset({"Correction on active insulin", "Over-treated low"}),
            {
                ("correction_on_iob", "lows"): _verdict_tally(
                    5, fired=2, outranked=1, near_miss=1, no_data=0, clean=1,
                ),
                ("over_treated_low", "lows"): _verdict_tally(
                    5, fired=1, outranked=2, near_miss=0, no_data=0, clean=2,
                ),
            },
        ),
        30,
    ),
    QaCase(
        "behavioral-missed-meal",
        _materialize_behavioral_missed_meal,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, {}, frozenset({
                ("meals", "2024-05-26 12:00:00", "near_miss"),
                ("meals", "2024-05-29 10:00:00", "near_miss"),
                ("highs", "2024-05-02 03:00:00", "no_data"),
                ("highs", "2024-05-24 14:30:00", "fired"),
                ("highs", "2024-05-25 14:30:00", "fired"),
                ("highs", "2024-05-26 14:30:00", "fired"),
                ("highs", "2024-05-27 14:30:00", "near_miss"),
                ("highs", "2024-05-29 14:00:00", "clean"),
                ("correction_clusters", "2024-05-26 13:10:00", "clean"),
                ("correction_clusters", "2024-05-29 11:10:00", "clean"),
            }), frozenset({
                "Missed / unannounced meal", "Meal bolus fell short", "meals-start-high",
            }), {
                ("missed_meal", "highs"): _verdict_tally(
                    6, fired=2, outranked=1, near_miss=1, no_data=1, clean=1,
                ),
                ("meal_bolus_short", "highs"): _verdict_tally(
                    6, fired=1, outranked=2, near_miss=1, no_data=1, clean=1,
                ),
            }, 3,
        ),
        30,
    ),
    QaCase(
        "behavioral-meal-bolus-short",
        _materialize_behavioral_meal_bolus_short,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, {}, frozenset({
                ("meals", "2024-05-24 12:00:00", "near_miss"),
                ("meals", "2024-05-25 12:00:00", "near_miss"),
                ("meals", "2024-05-27 12:00:00", "near_miss"),
                ("meals", "2024-05-29 10:00:00", "near_miss"),
                ("highs", "2024-05-02 03:00:00", "no_data"),
                ("highs", "2024-05-24 14:30:00", "fired"),
                ("highs", "2024-05-25 14:30:00", "fired"),
                ("highs", "2024-05-26 14:30:00", "fired"),
                ("highs", "2024-05-27 14:30:00", "near_miss"),
                ("highs", "2024-05-29 14:00:00", "clean"),
                ("correction_clusters", "2024-05-24 13:10:00", "clean"),
                ("correction_clusters", "2024-05-25 13:10:00", "clean"),
                ("correction_clusters", "2024-05-29 11:10:00", "clean"),
            }), frozenset({"Meal bolus fell short", "Missed / unannounced meal"}), {
                ("meal_bolus_short", "highs"): _verdict_tally(
                    6, fired=2, outranked=1, near_miss=1, no_data=1, clean=1,
                ),
                ("missed_meal", "highs"): _verdict_tally(
                    6, fired=1, outranked=2, near_miss=0, no_data=1, clean=2,
                ),
            }, 3,
        ),
        30,
    ),
    QaCase(
        "behavioral-carb-log-fasting-exclusion",
        _materialize_behavioral_carb_log_fasting_exclusion,
        QaExpectation(
            _isf_rows(ExpectedIsfRow(omitted=frozenset({"block_id", "recommended"}))),
            {("isf", "Fasting"): ExpectedSupport(n_steps=102)},
            {}, frozenset(),
            frozenset({
                ("2024-05-01", "2024-05-01 22:00:00", "2024-05-02 08:00:00"),
            }),
            {}, frozenset(), frozenset(),
        ),
        2,
    ),
    QaCase(
        "behavioral-preempted-detector",
        _materialize_behavioral_preempted_detector,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            frozenset({
                ("2024-05-01", "2024-05-01 22:00:00", "2024-05-02 08:00:00"),
            }),
            {}, frozenset({
                ("meals", "2024-05-02 12:00:00", "fired"),
                ("highs", "2024-05-02 14:00:00", "outranked"),
                ("correction_clusters", "2024-05-02 13:40:00", "clean"),
            }), frozenset({"Carb undercount", "meals-start-high"}), {
                ("carb_undercount", "meals"): _verdict_tally(
                    1, fired=1, outranked=0, near_miss=0, no_data=0, clean=0,
                ),
            },
        ),
        2,
    ),
)


def materialize_case(store, case: QaCase) -> None:
    """Write exactly one case's manufactured input rows into ``store``."""
    case.recipe(store)


def execute_case(store, case: QaCase | None = None) -> QaExecution:
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
    findings: dict[WindowKey, dict] = {
        "whole_day": prepared.project(
            WindowQuery.whole_day(), analysis_generation="qa:0",
        ),
    }
    findings.update({
        window: prepared.project(
            WindowQuery.clock(*window), analysis_generation="qa:0",
        )
        for window in (() if case is None else case.scoped_windows)
    })
    history_events = prepare_ic_history_events(store, prepared)
    ic_history = {
        row["id"]: history_events.project(row["id"], analysis_generation="qa:0")
        for row in prepared.history_catalog if row.get("lifecycle") == "active"
    }
    return QaExecution(analysis, exposures, scenarios, findings, ic_history)


def _analyzer_key(family: AnalyzerFamily, row: dict) -> AnalyzerRowKey:
    return family, row["label"]


_OMISSION_FIELDS = {
    "basal": frozenset({
        "slot", "label", "current", "estimate", "recommended", "annotation",
        "days", "evidence",
    }),
    "isf": frozenset({
        "block_id", "current", "estimate", "label", "parameter", "recommended",
        "start_min", "annotation", "evidence",
    }),
    "ic": frozenset({
        "block_id", "current_values", "days_needed", "end_min", "estimate", "evidence",
        "harm", "impact_u_day", "label", "member_start_mins", "n_meals", "n_runs",
        "priority", "recommended", "recurrence", "recurrence_channel", "regime",
        "start_min", "annotation", "days_observed",
    }),
}


def _expected_row(family: AnalyzerFamily, row: dict) -> ExpectedAnalyzerRow:
    omitted = frozenset(
        field_name for field_name in _OMISSION_FIELDS[family]
        if row.get(field_name) is None
    )
    if family == "basal":
        return ExpectedBasalRow(
            safety_status=row.get("safety_status"),
            direction=row.get("direction"),
            asserts_move=bool(row.get("asserts_move")),
            omitted=omitted,
        )
    if family == "isf":
        return ExpectedIsfRow(
            direction=(row.get("evidence") or {}).get("direction"),
            asserts_move=bool(row.get("asserts_move")),
            omitted=omitted,
        )
    return ExpectedIcRow(
        direction=row.get("direction"),
        asserts_move=bool(row.get("asserts_move")),
        state=row.get("state"),
        held_reason=row.get("held_reason"),
        days_observed=row.get("days_observed"),
        omitted=omitted,
    )


def _quiet(family: AnalyzerFamily, row: dict) -> bool:
    if family == "basal":
        return row.get("safety_status") in {"no change", "no data", None}
    if family == "isf":
        return (
            not row.get("asserts_move")
            and not (row.get("evidence") or {}).get("direction")
        )
    return (
        row.get("state") in {"collecting", "below-floor", "unmeasured-alone"}
        or (
            row.get("state") == "numeric"
            and not row.get("asserts_move")
            and not row.get("held_reason")
        )
    )


def _support(family: AnalyzerFamily, row: dict) -> ExpectedSupport:
    evidence = row.get("evidence") or {}
    if family == "basal":
        return ExpectedSupport(
            directional_support_count=evidence.get("directional_support_count"),
        )
    if family == "isf":
        return ExpectedSupport(n_steps=evidence.get("n_steps"))
    return ExpectedSupport(
        n_runs=row.get("n_runs"),
        effective_run_count=(evidence.get("eligibility") or {}).get("effective_run_count"),
    )


def _queue_key(row: dict) -> AnalyzerRowKey | None:
    parameter = row.get("parameter")
    if parameter == "basal_rate":
        minute = row["span"]["start_min"]
        return "basal", f"{minute // 60:02d}:{minute % 60:02d}"
    if parameter == "isf":
        return "isf", row["label"]
    if parameter == "carb_ratio":
        return "ic", row["label"]
    return None


def assert_expectation(case: QaCase, execution: QaExecution) -> None:
    """Require every expected collection to equal the case's published set."""
    observed_analyzer_rows = {}
    observed_support = {}
    payloads = (("basal", "basal"), ("isf", "isf"), ("ic", "ic_blocks"))
    for family, payload_name in payloads:
        for row in execution.analysis[payload_name]:
            key = _analyzer_key(family, row)
            if (family != case.target_family and _quiet(family, row)
                    and key not in case.expectation.analyzer_rows):
                continue
            observed_analyzer_rows[key] = _expected_row(family, row)
            observed_support[key] = _support(family, row)
    observed_rows = frozenset(
        (family_name, occurrence["t"], occurrence["state"])
        for family_name, family in execution.exposures["exposures"].items()
        for occurrence in family["occurrences"]
    )
    whole_day = execution.findings["whole_day"]
    observed_titles = frozenset(
        [row["title"] for row in whole_day["rows"]]
        + [row["detector"] for row in execution.analysis["behavioral"]]
    )
    observed_queue_rows = {
        (window, key): ExpectedQueueRow(
            row["register"], row.get("direction"), row.get("asserts_move"),
            row.get("headline"),
        )
        for window, projection in execution.findings.items()
        for row in projection["rows"]
        if (key := _queue_key(row)) is not None
    }
    isf_row = next(
        (row for row in execution.analysis["isf"] if row["label"] == "Fasting"),
        None,
    )
    assert isf_row is not None, "missing Fasting ISF analyzer row"
    observed_rest_windows = frozenset(
        (row["date"], row["start"], row["end"])
        for row in isf_row["evidence"]["rest_windows"]
    )
    observed_history_series = {
        identity: tuple(payload["series"])
        for identity, payload in execution.ic_history.items()
    }
    finding_rows = {
        row["lever"]: row
        for row in whole_day["rows"]
        if row.get("lever") is not None
    }
    observed_tally_keys = {
        (lever, family)
        for lever, row in finding_rows.items()
        for family in row["verdict_counts_by_family"]
    }
    assert observed_tally_keys == set(case.expectation.verdict_tallies), (
        observed_tally_keys
    )
    for key, expected in case.expectation.verdict_tallies.items():
        lever, family = key
        assert tuple(expected.counts) == FINDING_VERDICTS, expected.counts
        assert all(
            type(value) is int and value >= 0
            for value in expected.counts.values()
        ), expected.counts
        assert sum(expected.counts.values()) == expected.denominator, expected
        assert expected.denominator == execution.exposures["exposures"][family]["n"]
        row = finding_rows[lever]
        assert row["verdict_counts_by_family"][family] == dict(expected.counts)
        aggregate = {
            verdict: sum(
                counts[verdict]
                for counts in row["verdict_counts_by_family"].values()
            )
            for verdict in FINDING_VERDICTS
        }
        assert row["verdict_counts"] == aggregate
    assert observed_analyzer_rows == dict(
        case.expectation.analyzer_rows
    ), observed_analyzer_rows
    assert observed_support == dict(case.expectation.support), observed_support
    assert observed_queue_rows == case.expectation.queue_rows, observed_queue_rows
    for absent in case.expectation.queue_absences:
        assert absent not in observed_queue_rows, absent
    assert observed_rows == case.expectation.behavioral_rows, observed_rows
    assert observed_titles == case.expectation.finding_titles, observed_titles
    assert observed_rest_windows == case.expectation.rest_windows, observed_rest_windows
    assert observed_history_series == case.expectation.history_series, observed_history_series
    assert whole_day["uncaused_highs"]["count"] == case.expectation.uncaused_highs


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
