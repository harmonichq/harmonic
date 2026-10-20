"""Manufactured QA E2E store cases and their production-path expectations.

The catalog is the only owner of the synthetic case recipes.  The generator
materializes the showcase case, while the coverage test materializes each case
in its own temporary store.
"""

from __future__ import annotations

import random

from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from functools import partial
from typing import Callable, Literal, TypeAlias

from ciq_autotune.analyze import _BOLUS_LEADIN, _ISF_DECISION_INTERVAL, analyze
from ciq_autotune.analyzers.ic import _CIQ_SUSPEND_TYPE, BLOCK_WINDOW_DAYS
from ciq_autotune.analyzers.isf import IsfConfig
from ciq_autotune.analyzers.scenario import build_scenarios
from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns
from ciq_autotune.events import CarbEntry
from ciq_autotune.explore_exposures import build_exposures
from ciq_autotune.findings_projection import (
    FINDING_VERDICTS,
    WindowQuery,
    prepare_findings_projection,
)
from ciq_autotune.insulin import InsulinActivity, basal_microdoses
from ciq_autotune.rest_window import RestWindowConfig
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
    behavioral_rows: frozenset[tuple[str, str, str]]
    finding_titles: frozenset[str]
    outcome_patterns: tuple[dict, ...] = field(kw_only=True)
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
    outcome_patterns: tuple[dict, ...]


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
    _materialize_showcase_month_shoulder(store)
    _materialize_showcase_background(store)
    _materialize_behavioral_precedence(store)


def _setting_recommendation_recipe(store) -> None:
    _materialize_setting_recommendation(store)


def _behavioral_precedence_recipe(store) -> None:
    _materialize_behavioral_precedence(store)


def _pattern_near_tie_recipe(store) -> None:
    _materialize_basal_coverage(store, clean_rate=0.48)
    _materialize_isf_coverage(store, true_isf=48.0)
    _materialize_behavioral_correction_on_iob(store, meal_runs_away=True)


def _pattern_collapse_recipe(store) -> None:
    _materialize_behavioral_over_treated_low(store)


def _pattern_correction_fold_recipe(store) -> None:
    """Both correction habits admitted, so Lows after correcting highs stays a Pattern
    and Correction stacking folds under it from its own correction-cluster family
    (ADR 424). The correction-on-IOB days move ten days earlier so the two recipes'
    traces never overlap.
    """
    _materialize_behavioral_correction_stacking(store)
    _materialize_behavioral_correction_on_iob(store, shift=-10, background=False)


def _pattern_correction_collapse_recipe(store) -> None:
    """Correction on active insulin is the one admitted habit, so Lows after
    correcting highs is served as it, while a single stacked pair of corrections,
    too few for Correction stacking to be admitted, falls into a low of its own. The
    Pattern counts that low too; the habit's own count does not.
    """
    _materialize_behavioral_correction_on_iob(store)
    day = datetime.combine(date(2024, 5, 14), datetime.min.time())
    store.upsert_cgm([{
        "EventDateTime": (day + timedelta(minutes=14 * 60 + 5 * i)).strftime("%F %T"),
        "Readings (CGM / BGM)": 160.0 - 4.0 * i, "Description": "Synthetic EGV",
    } for i in range(26)])
    store.upsert_bolus([{
        "seq_num": 180_130 + index,
        "request_time": (day + timedelta(minutes=minute)).strftime("%F %T"),
        "description": "Synthetic user correction", "completion": "Completed",
        "insulin": 3.0, "requested_insulin": 3.0, "carbs": None,
        "isf": 40.0, "target_bg": 110.0,
    } for index, minute in enumerate((14 * 60 + 10, 14 * 60 + 40))])


def _pattern_meal_two_causes_recipe(store) -> None:
    """Highs after meals with two admitted causes whose roster, count and severity
    orders differ (ADR 593): Carb undercount, first in the roster, claims four
    runaway meals; Late bolus claims three meals whose late climb holds just under
    the runaway bar for two hours, each a longer high than any runaway's.
    Fourteen flat breakfasts make the Pattern ready.
    """
    first = _materialize_behavioral_background(store, span_days=30)
    bolus, cgm = [], []

    def add_meal(offset: int, hour: int, minute: int, values, *, carbs: float,
                 insulin: float) -> None:
        start = datetime.combine(first + timedelta(days=offset), datetime.min.time())
        start = start.replace(hour=hour, minute=minute)
        cgm.extend((start + timedelta(minutes=5 * index), value)
                   for index, value in enumerate(values))
        bolus.append({
            "seq_num": 593_000 + offset,
            "request_time": (start + timedelta(minutes=25)).strftime("%Y-%m-%d %H:%M:%S"),
            "description": "Synthetic meal bolus", "completion": "Completed",
            "insulin": insulin, "requested_insulin": insulin, "carbs": carbs,
            "carb_ratio": 5.0, "isf": 40.0, "target_bg": 110.0,
        })

    for offset in range(2, 16):
        add_meal(offset, 7, 40, (120,) * 13, carbs=45.0, insulin=9.0)
    # The late climb reaches 195 and holds 198, under Carb undercount's 200 runaway
    # bar, for two hours before falling.
    late_hold = _LATE_RISE_195[:9] + (198,) * 24 + (185, 170, 150, 130, 120)
    for offset in range(16, 19):
        add_meal(offset, 11, 40, late_hold, carbs=45.0, insulin=9.0)
    runaway = (145, 145, 145, 145, 145, 145, 170, 220, 280, 330, 360, 355, 340)
    for offset in range(23, 27):
        add_meal(offset, 11, 40, runaway, carbs=30.0, insulin=6.0)
    store.upsert_cgm([{
        "EventDateTime": when.strftime("%Y-%m-%d %H:%M:%S"),
        "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV",
    } for when, bg in cgm])
    store.upsert_bolus(bolus)


def _materialize_pattern_focus_meals(store, *, days=8, meals_per_day=3,
                                     measured=True) -> None:
    """Manufacture two four-day arms with twelve meal opportunities apiece."""
    first = _materialize_behavioral_background(store, span_days=days)
    store.upsert_bolus([{
        "seq_num": 390_000 + day * 3 + index,
        "request_time": str(datetime.combine(first, datetime.min.time())
                            + timedelta(days=day, hours=hour)),
        "description": "Synthetic meal bolus", "completion": "Completed",
        "insulin": 4.0, "requested_insulin": 4.0, "carbs": 40.0,
        "carb_ratio": 10.0, "isf": 40.0, "target_bg": 110.0,
    } for day in range(days) for index, hour in enumerate((6, 12, 18)[:meals_per_day])])
    if not measured:
        # Keep the source period observable while removing meal measurements.
        with store.conn:
            store.conn.execute("DELETE FROM cgm_readings WHERE substr(t, 12, 2) != '00'")


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
                "Readings (CGM / BGM)": _LANE_BASELINE,
                "Description": _LANE_EGV,
            })
    store.upsert_cgm(cgm)
    _materialize_automatic_corrections(store, first=first, days=span_days)
    store.upsert_settings_snapshot(f"{first.isoformat()} 00:00:00", _settings(5.0))
    return first


# A manufactured flat observation lane. Its readings inside the nocturnal rest
# envelope are not flat: _respond_fasting_lane makes them answer the insulin that
# acted, at the programmed sensitivity, so the fasting ISF fit measures a real
# number instead of a 0 slope over a 120 mg/dL wall.
_LANE_EGV = "Synthetic lane EGV"
_LANE_BASELINE = 120.0
_LANE_ISF = 40.0  # the _settings() programmed ISF: the lane's true sensitivity
_LANE_NOISE_SD = 0.5


def _materialize_automatic_corrections(store, *, first: date, days: int) -> None:
    """Two seeded Control-IQ automatic corrections early each lane morning.

    They are the fasting insulin a lane night carries of its own, so the fasting
    fit measures the lane's sensitivity rather than one story's evening tail. They
    sit between 04:00 and 05:00: after the 01:00 and 03:00 basal slots the basal
    recipes read have cleared of bolus insulin, after the evening stories' lows,
    and an hour before the earliest manufactured meal. The pump tags them
    automatic, so no habit counts them as a user correction.
    """
    rng = random.Random(first.toordinal())
    store.upsert_bolus([{
        "seq_num": 880_000 + offset * 10 + index,
        "request_time": str(datetime.combine(first + timedelta(days=offset),
                                             datetime.min.time())
                            + timedelta(minutes=minute)),
        "description": "Synthetic automatic correction", "completion": "Completed",
        "insulin": units, "requested_insulin": units, "bolus_options": 3,
        "isf": _LANE_ISF, "target_bg": 110.0,
    } for offset in range(days)
      for index, minute in enumerate((rng.randrange(240, 270, 5),
                                      rng.randrange(270, 300, 5)))
      for units in (round(rng.uniform(0.2, 0.5), 2),)])


def _respond_fasting_lane(store) -> None:
    """Make every lane night move with insulin the way the ISF analyzer models it.

    On each night's 5-minute grid across the rest envelope, glucose moves by one
    constant endogenous drift minus ``_LANE_ISF`` times the insulin that acted in
    the step, and each reading carries seeded sensor noise. The drift is the
    lane's mean insulin effect, so a night on steady basal stays level.

    A night starts at baseline at its first reading. The lane answers delivered
    basal and every uncovered bolus given since it last started; a carb-bearing
    bolus is covered by its carbs. A recipe's own reading
    on the grid is left alone, and the lane resumes at baseline after it: the
    recipe drew what its doses did, so a dose given before the lane resumed is the
    recipe's and is not applied a second time.

    Idempotent: every night is recomputed from its baseline and only a changed
    reading is written, so a recipe calls this before it records follow-ups and
    ``materialize_case`` calls it again at the end.
    """
    envelope = RestWindowConfig()
    isf = IsfConfig()
    readings = {r.t: r for r in store.cgm_readings()}
    nights = sorted({
        (r.t - timedelta(days=1)).date()
        if r.t.hour * 60 + r.t.minute <= envelope.env_end_min else r.t.date()
        for r in readings.values()
        if r.type == _LANE_EGV and (
            r.t.hour * 60 + r.t.minute >= envelope.env_start_min
            or r.t.hour * 60 + r.t.minute <= envelope.env_end_min
        )
    })
    if not nights:
        return
    basal = InsulinActivity(basal_microdoses(store.basal_events()),
                            isf.peak_min, isf.dia_min)
    boluses = [(b.t, float(b.insulin)) for b in store.bolus_events()
               if b.insulin and b.insulin > 0 and not b.carbs]
    steps = (24 * 60 - envelope.env_start_min + envelope.env_end_min) // 5
    nightly = []
    for night in nights:
        grid = [
            datetime.combine(night, datetime.min.time())
            + timedelta(minutes=envelope.env_start_min + 5 * k)
            for k in range(steps + 1)
        ]
        overlay = [
            t in readings and readings[t].type != _LANE_EGV for t in grid
        ]
        first = next(k for k, t in enumerate(grid) if t in readings)
        acted, since = [], grid[first]
        stretch = InsulinActivity([d for d in boluses if d[0] >= since],
                                  isf.peak_min, isf.dia_min)
        for k, (t0, t1) in enumerate(zip(grid, grid[1:])):
            if overlay[k] and not overlay[k + 1]:
                since = t1
                stretch = InsulinActivity([d for d in boluses if d[0] >= since],
                                          isf.peak_min, isf.dia_min)
            acted.append(basal.acted(t0, t1) + stretch.acted(t0, t1))
        nightly.append((night, grid, overlay, acted, first))
    drift = _LANE_ISF * (
        sum(sum(acted[first:]) for *_, acted, first in nightly)
        / sum(steps - first for *_, first in nightly)
    )
    writes = []
    for night, grid, overlay, acted, first in nightly:
        rng = random.Random(night.toordinal())
        bg = _LANE_BASELINE
        for k, t in enumerate(grid):
            noise = rng.gauss(0.0, _LANE_NOISE_SD)
            if k > first:
                bg = (_LANE_BASELINE if overlay[k - 1]
                      else bg + drift - _LANE_ISF * acted[k - 1])
            reading = readings.get(t)
            if reading is None or overlay[k]:
                continue
            value = round(bg + noise, 1)
            if reading.bg != value:
                writes.append({
                    "EventDateTime": t.strftime("%F %T"),
                    "Readings (CGM / BGM)": value, "Description": _LANE_EGV,
                })
    if writes:
        store.upsert_cgm(writes)


# A late meal climb whose post-bolus peak is 195: above the 180 range line and under
# Carb undercount's 200 runaway bar (ADR 461).
_LATE_RISE_195 = (100, 110, 120, 130, 140, 150, 165, 180, 195, 190, 175, 160, 140)


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
    # The late rise peaks at 195 after the bolus: above the range line, so Late
    # bolus claims it (ADR 461), and under Carb undercount's 200 runaway bar.
    add_trace(
        25,
        _LATE_RISE_195,
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
    """Write every reachable late-bolus verdict band across seven meals."""
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
    # The same late climb peaking at exactly 180 after the bolus: in range (ADR 461).
    add_trace(22, (100, 110, 120, 130, 140, 150, 160, 170, 180, 175, 165, 150, 135))
    add_trace(23, _LATE_RISE_195)
    add_trace(24, _LATE_RISE_195)
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


def _materialize_behavioral_split_meal(store) -> None:
    """Write twelve noon meals bolused as a first bolus plus a 20 g top-up.

    The top-up lands 10 minutes after the first bolus on six days, exactly 30 on
    three (the inclusive edge of the same-meal grace) and 35 on three (just
    outside it). Each meal climbs 2 mg/dL/min from the first bolus to 360."""
    first = _materialize_behavioral_background(store, span_days=30)
    bolus = []
    cgm = []

    def meal_bolus(seq_num: int, at: datetime, *, insulin: float, carbs: float) -> dict:
        return {
            "seq_num": seq_num,
            "request_time": at.strftime("%Y-%m-%d %H:%M:%S"),
            "description": "Synthetic meal bolus",
            "completion": "Completed",
            "insulin": insulin,
            "requested_insulin": insulin,
            "carbs": carbs,
            "carb_ratio": 10.0,
            "isf": 40.0,
            "target_bg": 110.0,
        }

    gaps = (10,) * 6 + (30,) * 3 + (35,) * 3
    for offset, gap in enumerate(gaps, start=2):
        noon = datetime.combine(first + timedelta(days=offset), datetime.min.time())
        noon = noon.replace(hour=12)
        bg, climbing = 110.0, True
        for index in range(-6, 61):
            if index > 0:
                bg = min(360.0, bg + 10.0) if climbing else max(110.0, bg - 5.0)
                climbing = climbing and bg < 360.0
            cgm.append((noon + timedelta(minutes=5 * index), bg))
        bolus.append(meal_bolus(130_000 + offset, noon, insulin=4.5, carbs=45.0))
        bolus.append(meal_bolus(131_000 + offset, noon + timedelta(minutes=gap),
                                insulin=2.0, carbs=20.0))
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
    # The missed meal's corrections finish acting before the night: the lane
    # cannot see the unlogged carbs that answered them.
    trace(26, 15 * 60, tuple(145.0 + 10.0 * i for i in range(25)))
    pair(26, 15 * 60 + 30, 16 * 60 + 10)
    store.upsert_cgm([{
        "EventDateTime": when.strftime("%F %T"),
        "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV",
    } for when, bg in cgm])
    store.upsert_bolus(bolus)


# The 19:00 meal's climb to the 20:00 correction, and that correction's fall into
# the low: a 195 peak stays under Carb undercount's 200 runaway bar, so the low
# belongs to the correction on active insulin, not to the meal's carb count.
_EVENING_MEAL_PEAK = (195.0, 191.75, 188.5, 185.25, 182.0)
_EVENING_CORRECTION_FALL = tuple(178.0 - 5.4 * i for i in range(24))
# The same evening run away to 238: past that bar, the meal's carb count owns it.
_RUNAWAY_MEAL_PEAK = (238.0, 234.75, 231.5, 228.25, 225.0)
_RUNAWAY_CORRECTION_FALL = tuple(221.0 - 7.25 * i for i in range(24))


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
    segment(27, 19 * 60 + 40, _EVENING_MEAL_PEAK)
    segment(27, 20 * 60 + 5,
            _EVENING_CORRECTION_FALL)
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


def _materialize_behavioral_over_treated_near_low(store) -> None:
    """The over-treated-low story plus one dip to 72 mg/dL that rebounds to 244 (#553).

    The dip never reaches 70, so it is no low: nothing claims it, and the habit's row,
    its case file and its price all count the same sub-70 lows.
    """
    _materialize_behavioral_over_treated_low(store)
    day = datetime.combine(date(2024, 5, 1) + timedelta(days=20), datetime.min.time())
    down = tuple(100.0 - (100.0 - 72.0) * i / 4 for i in range(5))
    up = tuple(72.0 + (244.0 - 72.0) * i / 8 for i in range(1, 9))
    values = (100.0,) * 5 + down[1:] + up
    store.upsert_cgm([{
        "EventDateTime": (day + timedelta(minutes=13 * 60 + 15 + 5 * i)).strftime("%F %T"),
        "Readings (CGM / BGM)": value, "Description": "Synthetic EGV",
    } for i, value in enumerate(values)])


def _materialize_behavioral_over_treated_rebound_ownership(store) -> None:
    """Write two Highs an over-treated low's rebound owns and one it does not (#422).

    Both owned Highs split off their low's Episode: each crosses 250 mg/dL more than
    90 minutes after a 55 mg/dL low and inside its guarded rebound. One climbs as a
    rising rebound; the other creeps across 250 too slowly to judge and holds past the
    rebound horizon. The control High, days later, is an unbolused rise with no low.
    """
    first = _materialize_behavioral_background(store, span_days=30)
    cgm = []

    def trace(offset: int, start_min: int,
              corners: tuple[tuple[int, float], ...]) -> None:
        day = datetime.combine(first + timedelta(days=offset), datetime.min.time())
        for (m0, bg0), (m1, bg1) in zip(corners, corners[1:]):
            cgm.extend((day + timedelta(minutes=start_min + minute),
                        round(bg0 + (bg1 - bg0) * (minute - m0) / (m1 - m0), 2))
                       for minute in range(m0, m1, 5))
        last_min, last_bg = corners[-1]
        cgm.append((day + timedelta(minutes=start_min + last_min), last_bg))

    trace(22, 13 * 60, ((0, 110.0), (30, 110.0), (60, 55.0), (180, 270.0),
                        (240, 180.0), (300, 144.0)))
    trace(23, 13 * 60, ((0, 110.0), (30, 110.0), (60, 55.0), (140, 235.0),
                        (215, 265.0), (270, 265.0), (330, 150.0), (390, 120.0)))
    trace(26, 12 * 60, ((0, 120.0), (20, 120.0), (80, 290.0), (140, 200.0),
                        (200, 130.0)))
    store.upsert_cgm([{
        "EventDateTime": when.strftime("%F %T"),
        "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV",
    } for when, bg in cgm])


def _materialize_behavioral_correction_on_iob(store, *, shift: int = 0,
                                              background: bool = True,
                                              meal_runs_away: bool = False) -> None:
    """Correction on active insulin on days 23-27, or ``shift`` days from there.

    ``background=False`` composes it onto a store whose background another recipe
    already wrote, which a second background would overwrite. ``meal_runs_away``
    lifts the 19:00 meals past Carb undercount's runaway bar, so the carb count
    owns those evenings and outranks the correction.
    """
    peak, fall = ((_RUNAWAY_MEAL_PEAK, _RUNAWAY_CORRECTION_FALL) if meal_runs_away
                  else (_EVENING_MEAL_PEAK, _EVENING_CORRECTION_FALL))
    first = (_materialize_behavioral_background(store, span_days=30) if background
             else date(2024, 5, 1)) + timedelta(days=shift)
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
        segment(offset, 19 * 60 + 40, peak)
        segment(offset, 20 * 60 + 5, fall)
        segment(offset, 22 * 60 + 5, (60.0,) * 13)
        dose(offset, 19 * 60, 200_000 + (offset + shift) * 10, 7.4, 52.0)
        dose(offset, 20 * 60, 200_001 + (offset + shift) * 10, 4.2, None)
    down = tuple(100.0 - 10.0 * i for i in range(5))
    up = tuple(60.0 + 25.0 * i for i in range(1, 9))
    segment(25, 13 * 60 + 15, (100.0,) * 5 + down[1:] + up)
    segment(26, 19 * 60 + 40, peak)
    segment(26, 20 * 60 + 5, fall)
    segment(26, 22 * 60 + 5, (60.0,) * 13)
    dose(26, 19 * 60, 200_260 + shift * 10, 7.4, 52.0)
    dose(26, 20 * 60, 200_261 + shift * 10, 4.2, None)
    suspend_day = datetime.combine(first + timedelta(days=26), datetime.min.time())
    basal.extend({
        "seq_num": 210_000 + shift * 10 + i,
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


def _materialize_behavioral_missed_meal(store) -> None:
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
    clean_rates: Sequence[float] | None = None,
) -> None:
    """Write one manufactured basal-family-span observation lane.

    ``clean_rates`` gives one delivered rate per informative night, in order;
    ``None`` delivers ``clean_rate`` on every night.
    """
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
    offsets = range(
        BASAL_SOURCE_SPAN_DAYS - informative_nights, BASAL_SOURCE_SPAN_DAYS,
    )
    rates = [clean_rate] * len(offsets) if clean_rates is None else clean_rates
    for offset, rate in zip(offsets, rates, strict=True):
        current = first + timedelta(days=offset)
        for minute in range(120, 241, 5):
            cgm.append({
                "EventDateTime": (
                    f"{current.isoformat()} {minute // 60:02d}:{minute % 60:02d}:00"
                ),
                "Readings (CGM / BGM)": _LANE_BASELINE,
                "Description": _LANE_EGV,
            })
        if rate is not None:
            basal.append({
                "seq_num": 20_000 + offset,
                "time": f"{current.isoformat()} 03:00:00",
                "delivery_type": "algorithmDelivery",
                "duration_mins": 30,
                "basal_rate": rate,
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


def _materialize_basal_verdict_gallery(store) -> None:
    """One lane holding every served verdict at once — #413 S113's fixture.

    Four slots get their own treatment (raise, lower, hold, and a slot with
    too few nights to assert a direction); every other slot gets no basal
    delivery at all, so it reads as no data. CGM covers 00:00-03:00 every
    night in play so each treated slot's own clean-window check passes.
    """
    first = date(2024, 5, 1)
    last = first + timedelta(days=BASAL_SOURCE_SPAN_DAYS - 1)
    cgm = [
        {"EventDateTime": f"{first.isoformat()} 23:59:00", "Readings (CGM / BGM)": 240.0,
         "Description": "Synthetic EGV"},
        {"EventDateTime": f"{last.isoformat()} 23:59:00", "Readings (CGM / BGM)": 240.0,
         "Description": "Synthetic EGV"},
    ]
    basal = []
    # (start minute, delivered rate, informative nights). Programmed is 0.6
    # everywhere (one flat settings segment) and the safety cap is +/-20% of
    # that (0.48-0.72), so 0.70/0.50 assert an UNCAPPED raise/lower, 0.60
    # holds, and 0.70 at only 5 nights would assert the same raise but for
    # the eight-night support floor (safety._MIN_SUPPORTED_NIGHTS).
    targets = ((0, 0.70, 30), (30, 0.50, 30), (60, 0.60, 30), (90, 0.70, 5))
    max_nights = max(nights for _, _, nights in targets)
    for offset in range(BASAL_SOURCE_SPAN_DAYS - max_nights, BASAL_SOURCE_SPAN_DAYS):
        current = first + timedelta(days=offset)
        for minute in range(0, 181, 5):
            cgm.append({
                "EventDateTime": f"{current.isoformat()} {minute // 60:02d}:{minute % 60:02d}:00",
                "Readings (CGM / BGM)": 120.0,
                "Description": "Synthetic EGV",
            })
        for index, (start_minute, clean_rate, nights) in enumerate(targets):
            if offset < BASAL_SOURCE_SPAN_DAYS - nights:
                continue
            basal.append({
                "seq_num": 20_000 + index * 1000 + offset,
                "time": f"{current.isoformat()} {start_minute // 60:02d}:{start_minute % 60:02d}:00",
                "delivery_type": "algorithmDelivery",
                "duration_mins": 30,
                "basal_rate": clean_rate,
                "profile_basal_rate": 0.6,
            })
    store.upsert_cgm(cgm)
    store.upsert_basal(basal)
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


def _materialize_isf_coverage(
    store, *, true_isf: float, rescue_offsets: tuple[int, ...] = (),
    noise_sd: float = 0.0,
) -> None:
    """Write two analyzer-visible ISF decision windows over manufactured nights.

    ``noise_sd`` adds seeded Gaussian sensor noise (mg/dL) to every reading
    after the first of each night, so the fasting range has real width; ``0``
    writes the exact curve.
    """
    first = date(2024, 5, 1)
    cgm, bolus = [], []
    rng = random.Random(489)
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
            noise = rng.gauss(0.0, noise_sd) if noise_sd else 0.0
            cgm.append({
                "EventDateTime": right.strftime("%Y-%m-%d %H:%M:%S"),
                "Readings (CGM / BGM)": round(bg + noise, 1),
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


_IC_BLOCK_EVIDENCE_FIRST = date(2024, 3, 1)
_IC_BLOCK_EVIDENCE_LAST = _IC_BLOCK_EVIDENCE_FIRST + timedelta(days=IC_SOURCE_SPAN_DAYS - 1)
_IC_BLOCK_EVIDENCE_ISF = 50.0
# Two carb-ratio blocks (00:00-12:00, 12:00-24:00); the current pair a snapshot
# rolls into 20 days after the store opens, so runs dosed in the first 20 days
# are dosed under the earlier (retired) pair instead.
_IC_BLOCK_EVIDENCE_CURRENT = ((0, 5.0), (720, 6.0))
_IC_BLOCK_EVIDENCE_EARLIER = ((0, 6.0), (720, 7.0))


def _ic_block_evidence_settings(segments: tuple[tuple[int, float], ...]) -> PumpSettings:
    return PumpSettings(active_idp=1, profiles=(ProfileSettings(
        idp=1, name="QA carb-ratio block-evidence profile", dia_min=300,
        carb_entry=True, max_bolus=15.0,
        segments=tuple(
            ProfileSegment(start, 0.8, int(_IC_BLOCK_EVIDENCE_ISF), ratio, 110)
            for start, ratio in segments
        ),
    ),))


def _ic_block_evidence_meal(
    day: int, hour: int, *, carbs: float = 60.0, insulin: float = 12.0,
    ratio: float = 5.0,
) -> dict:
    when = (datetime.combine(_IC_BLOCK_EVIDENCE_FIRST, datetime.min.time())
            + timedelta(days=day, hours=hour))
    return {
        "seq_num": None, "request_time": str(when), "description": "Synthetic meal",
        "completion": "Completed", "insulin": insulin, "requested_insulin": insulin,
        "carbs": carbs, "carb_ratio": ratio, "isf": _IC_BLOCK_EVIDENCE_ISF,
        "target_bg": 110.0,
    }


def _ic_block_evidence_trace(anchor: datetime, shape, until: int = 330) -> list[dict]:
    return [
        {"EventDateTime": str(anchor + timedelta(minutes=minute)),
         "Readings (CGM / BGM)": shape(minute), "Description": "Synthetic EGV"}
        for minute in range(-60, until + 1, 5)
    ]


def _ic_block_evidence_ran_high(minute: int) -> float:
    if minute <= -30:
        return 120.0
    if minute <= 30:
        return 120.0 + 2.0 * (minute + 30)
    if minute <= 150:
        return 360.0 - 2.0 * (minute - 30)
    return 120.0


def _ic_block_evidence_in_range(_minute: int) -> float:
    return 120.0


def _ic_block_evidence_spike_then_low(minute: int) -> float:
    """A two-meal chain from its first bolus: rises into it, peaks at 300, then a
    low at +210 while Control-IQ suspends under the second meal."""
    if minute <= -30:
        return 120.0
    if minute <= 30:
        return 120.0 + 3.0 * (minute + 30)
    if minute <= 100:
        return 300.0 - 190.0 * (minute - 30) / 70.0
    if minute <= 195:
        return 110.0
    if minute <= 210:
        return 110.0 - 2.8 * (minute - 195)
    if minute <= 270:
        return 68.0 + 0.7 * (minute - 210)
    return 110.0


def _ic_block_evidence_directional_low(minute: int) -> float:
    """Crashes and stays low through the full-DIA outcome read (directional-only)."""
    if minute <= -30:
        return 130.0
    if minute <= 30:
        return 130.0 + 1.0 * (minute + 30)
    if minute <= 150:
        return 160.0 - 1.0 * (minute - 30)
    return 40.0


def _ic_block_evidence_suspends(anchor: datetime, rows: int = 12) -> list[dict]:
    return [
        {"seq_num": None, "time": str(anchor + timedelta(minutes=15 + 5 * step)),
         "delivery_type": _CIQ_SUSPEND_TYPE, "duration_mins": 5, "basal_rate": 0.0,
         "profile_basal_rate": 0.9}
        for step in range(rows)
    ]


def _materialize_ic_block_evidence(store) -> None:
    """Two programmed carb-ratio blocks with every served pool_reason (#464).

    Block 0 (Morning, 00:00-12:00) asserts a raise from: 15 lone whole runs (half
    ran high, half in range), 10 runs chained across the midday boundary and
    shared with block 1 (``counted-by-share``), 3 runs dosed under the earlier
    (retired) pair before the snapshot rolls (``earlier-ratio-or-uncurrent-chain``),
    one meal whose corrected outcome floors its own denominator
    (``directional-only``), one meal whose full-DIA outcome read falls in a CGM
    gap (``no-outcome-read``), and one meal preceded by a tiny (<10 g) carb bolus
    that leaves >=0.5 U of unresolved meal-action IOB (``prior-action-not-separable``).
    Two of the pooled chains spike then print a low attributed to their first
    meal, on separate days, so the block's harm row carries two lows.
    """
    bolus: list[dict] = []
    cgm: list[dict] = []
    basal: list[dict] = []
    next_seq = [900_000]

    def add_bolus(row: dict) -> None:
        row["seq_num"] = next_seq[0]
        next_seq[0] += 1
        bolus.append(row)

    def at(day: int, hour: int, minute: int = 0) -> datetime:
        return (datetime.combine(_IC_BLOCK_EVIDENCE_FIRST, datetime.min.time())
                + timedelta(days=day, hours=hour, minutes=minute))

    cgm.append({
        "EventDateTime": f"{_IC_BLOCK_EVIDENCE_FIRST.isoformat()} 00:00:00",
        "Readings (CGM / BGM)": 120.0, "Description": "Synthetic EGV",
    })
    cgm.append({
        "EventDateTime": f"{_IC_BLOCK_EVIDENCE_LAST.isoformat()} 23:59:00",
        "Readings (CGM / BGM)": 120.0, "Description": "Synthetic EGV",
    })

    # Anchor every scenario day near the tail of the 91-day span.
    off = IC_SOURCE_SPAN_DAYS - 1 - 52

    # Three runs dosed under the earlier (retired) pair, before the snapshot
    # 20 days in rolls the profile to the current pair.
    for offset in range(12, 15):
        day = off + offset
        add_bolus(_ic_block_evidence_meal(day, 9, carbs=60.0, insulin=10.0, ratio=6.0))
        cgm.extend(_ic_block_evidence_trace(at(day, 9), _ic_block_evidence_in_range))

    # A lone meal that floors its own denominator (directional-only).
    day = off + 20
    add_bolus(_ic_block_evidence_meal(day, 3, carbs=10.0, insulin=1.0, ratio=10.0))
    cgm.extend(_ic_block_evidence_trace(at(day, 3), _ic_block_evidence_directional_low))

    # A lone meal whose full-DIA outcome read falls in a CGM gap (no-outcome-read).
    day = off + 21
    add_bolus(_ic_block_evidence_meal(day, 3, carbs=60.0, insulin=12.0, ratio=5.0))
    anchor = at(day, 3)
    cgm.extend({
        "EventDateTime": str(anchor + timedelta(minutes=minute)),
        "Readings (CGM / BGM)": 120.0, "Description": "Synthetic EGV",
    } for minute in list(range(-60, 240, 5)) + list(range(340, 451, 5)))

    # A tiny (<10 g) carb bolus 150 min before an otherwise-ordinary lone meal
    # leaves unresolved meal-action IOB, so the meal is prior-action-not-separable.
    day = off + 22
    add_bolus({
        "seq_num": None, "request_time": str(at(day, 6, 30)),
        "description": "Synthetic snack", "completion": "Completed",
        "insulin": 3.0, "requested_insulin": 3.0, "carbs": 4.0, "carb_ratio": 5.0,
        "isf": _IC_BLOCK_EVIDENCE_ISF, "target_bg": 110.0,
    })
    add_bolus(_ic_block_evidence_meal(day, 9, carbs=60.0, insulin=12.0, ratio=5.0))
    cgm.extend(_ic_block_evidence_trace(at(day, 9), _ic_block_evidence_in_range))

    # 12 lone whole runs, half ran high, half in range (counted-whole).
    for offset in range(25, 37):
        day = off + offset
        add_bolus(_ic_block_evidence_meal(day, 9, carbs=60.0, insulin=12.0, ratio=5.0))
        shape = (_ic_block_evidence_ran_high if offset % 2
                 else _ic_block_evidence_in_range)
        cgm.extend(_ic_block_evidence_trace(at(day, 9), shape))

    # Two pooled chains that spike then print a low attributed to their first
    # meal, on separate days.
    for offset in (37, 38):
        day = off + offset
        add_bolus(_ic_block_evidence_meal(day, 9, carbs=60.0, insulin=12.0, ratio=5.0))
        add_bolus(_ic_block_evidence_meal(day, 11, carbs=50.0, insulin=10.0, ratio=5.0))
        cgm.extend(_ic_block_evidence_trace(
            at(day, 9), _ic_block_evidence_spike_then_low, until=450,
        ))
        basal.extend(_ic_block_evidence_suspends(at(day, 11)))

    # 10 runs chained across the midday boundary, shared between both blocks.
    for offset in range(40, 50):
        day = off + offset
        add_bolus(_ic_block_evidence_meal(day, 11, carbs=40.0, insulin=8.0, ratio=5.0))
        add_bolus(_ic_block_evidence_meal(day, 13, carbs=60.0, insulin=10.0, ratio=6.0))
        cgm.extend(_ic_block_evidence_trace(at(day, 11), _ic_block_evidence_in_range))
        shape = (_ic_block_evidence_ran_high if offset % 2
                 else _ic_block_evidence_in_range)
        cgm.extend(_ic_block_evidence_trace(at(day, 13), shape))

    # A closing lone whole run.
    day = off + 52
    add_bolus(_ic_block_evidence_meal(day, 9, carbs=55.0, insulin=11.0, ratio=5.0))
    cgm.extend(_ic_block_evidence_trace(at(day, 9), _ic_block_evidence_in_range))

    for index, row in enumerate(basal, start=1):
        row["seq_num"] = 901_000 + index
    store.upsert_cgm(cgm)
    store.upsert_bolus(bolus)
    if basal:
        store.upsert_basal(basal)
    store.upsert_settings_snapshot(
        f"{_IC_BLOCK_EVIDENCE_FIRST.isoformat()} 00:00:00",
        _ic_block_evidence_settings(_IC_BLOCK_EVIDENCE_EARLIER),
    )
    store.upsert_settings_snapshot(
        f"{(_IC_BLOCK_EVIDENCE_FIRST + timedelta(days=20)).isoformat()} 00:00:00",
        _ic_block_evidence_settings(_IC_BLOCK_EVIDENCE_CURRENT),
    )


# Dose-stamped ISF conversion (ADR 563): a two-segment ISF schedule beside two
# carb-ratio blocks of the same hours. The first capture lands ten days in; the
# second, forty days later, strengthens the morning ISF from 30 to 40.
DOSE_ISF_FIRST = date(2024, 3, 1)
DOSE_ISF_LAST = DOSE_ISF_FIRST + timedelta(days=IC_SOURCE_SPAN_DAYS - 1)
DOSE_ISF_FIRST_CAPTURE_DAY = 10
DOSE_ISF_SECOND_CAPTURE_DAY = 50
DOSE_ISF_EARLIER = ((0, 30), (720, 60))
DOSE_ISF_LATER = ((0, 40), (720, 60))
DOSE_ISF_CARB_RATIOS = ((0, 5.0), (720, 6.0))
# Every meal starts at 120 and is read at full DIA at 180: 60 mg/dL of travel.
DOSE_ISF_TRAVEL = 60.0


def _dose_isf_settings(isf_schedule: tuple[tuple[int, int], ...]) -> PumpSettings:
    return PumpSettings(active_idp=1, profiles=(ProfileSettings(
        idp=1, name="QA dose-stamped ISF profile", dia_min=300,
        carb_entry=True, max_bolus=15.0,
        segments=tuple(
            ProfileSegment(start, 0.8, isf, ratio, 110)
            for (start, isf), (_, ratio) in zip(isf_schedule, DOSE_ISF_CARB_RATIOS)
        ),
    ),))


def _dose_isf_ran_high(minute: int) -> float:
    if minute <= 0:
        return 120.0
    if minute <= 60:
        return 120.0 + 2.0 * minute
    if minute <= 180:
        return 240.0 - 0.5 * (minute - 60)
    return 120.0 + DOSE_ISF_TRAVEL


# (day, hour, stamped ISF or None). Morning meals sit in the 00:00 ISF segment and
# carb-ratio block, evening meals in the 12:00 ones.
DOSE_ISF_MEALS = (
    # Unstamped, before the first capture: no ISF, so not converted.
    *((day, 9, None) for day in (3, 5, 7)),
    # Under the first capture: stamped with its segment, and unstamped after it.
    *((day, 9, 30) for day in (12, 14, 16, 18, 20, 22)),
    *((day, 9, None) for day in (24, 26, 28)),
    *((day, 18, 60) for day in (12, 14, 16, 18, 20, 22)),
    *((day, 18, None) for day in (24, 26, 28)),
    # Under the second capture: the morning stamp follows the strengthened ISF.
    *((day, 9, 40) for day in (52, 54, 56, 58, 60, 62)),
    *((day, 9, None) for day in (64, 66, 68)),
    *((day, 18, 60) for day in (52, 54, 56, 58, 60)),
)


def _materialize_ic_dose_stamped_isf(store) -> None:
    """Each meal run converts its glucose travel with its own ISF (ADR 563).

    Stamped meals in each ISF segment; an ISF changed mid-window by a second
    capture, with stamps that change with it; unstamped meals after a capture,
    which take the segment in force at their time in the latest capture at or
    before them; and unstamped meals before the first capture, left unconverted.
    """
    def at(day: int, hour: int) -> datetime:
        return (datetime.combine(DOSE_ISF_FIRST, datetime.min.time())
                + timedelta(days=day, hours=hour))

    cgm = [
        {"EventDateTime": f"{DOSE_ISF_FIRST.isoformat()} 00:00:00",
         "Readings (CGM / BGM)": 120.0, "Description": "Synthetic EGV"},
        {"EventDateTime": f"{DOSE_ISF_LAST.isoformat()} 23:59:00",
         "Readings (CGM / BGM)": 120.0, "Description": "Synthetic EGV"},
    ]
    bolus = []
    for index, (day, hour, isf) in enumerate(DOSE_ISF_MEALS):
        ratio = dict(DOSE_ISF_CARB_RATIOS)[0 if hour < 12 else 720]
        bolus.append({
            "seq_num": 910_000 + index, "request_time": str(at(day, hour)),
            "description": "Synthetic meal", "completion": "Completed",
            "insulin": round(60.0 / ratio, 4), "requested_insulin": round(60.0 / ratio, 4),
            "carbs": 60.0, "carb_ratio": ratio, "isf": isf, "target_bg": 110.0,
        })
        cgm.extend(_ic_block_evidence_trace(at(day, hour), _dose_isf_ran_high))
    store.upsert_cgm(cgm)
    store.upsert_bolus(bolus)
    store.upsert_settings_snapshot(
        f"{(DOSE_ISF_FIRST + timedelta(days=DOSE_ISF_FIRST_CAPTURE_DAY)).isoformat()} 00:00:00",
        _dose_isf_settings(DOSE_ISF_EARLIER),
    )
    store.upsert_settings_snapshot(
        f"{(DOSE_ISF_FIRST + timedelta(days=DOSE_ISF_SECOND_CAPTURE_DAY)).isoformat()} 00:00:00",
        _dose_isf_settings(DOSE_ISF_LATER),
    )


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
        "pattern-focus-meals", _materialize_pattern_focus_meals,
        QaExpectation(analyzer_rows={},
                      support={},
                      queue_rows={},
                      queue_absences=frozenset(),
                      rest_windows=frozenset({('2024-05-01', '2024-05-01 22:00:00', '2024-05-02 06:00:00'),
                                              ('2024-05-02', '2024-05-02 22:00:00', '2024-05-03 06:00:00'),
                                              ('2024-05-03', '2024-05-03 22:00:00', '2024-05-04 06:00:00'),
                                              ('2024-05-04', '2024-05-04 22:00:00', '2024-05-05 06:00:00'),
                                              ('2024-05-05', '2024-05-05 22:00:00', '2024-05-06 06:00:00'),
                                              ('2024-05-06', '2024-05-06 22:00:00', '2024-05-07 06:00:00'),
                                              ('2024-05-07',
                                               '2024-05-07 22:00:00',
                                               '2024-05-08 06:00:00')}),
                      behavioral_rows=frozenset({('meals', '2024-05-01 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-01 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-01 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-02 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-02 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-02 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-03 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-03 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-03 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-04 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-04 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-04 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-05 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-05 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-05 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-06 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-06 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-06 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-07 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-07 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-07 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-08 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-08 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-08 18:00:00', 'no_data')}),
                      finding_titles=frozenset({'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals',
                                                'meals-start-high'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 24,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.0641},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 24, 'gate': 12, 'verdict': 'ready'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 24,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.0641},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 24, 'gate': 12, 'verdict': 'ready'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0),
        8,
    ),
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
                ("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None, 'One cautious step down is supported at this time. Delivered below the programmed rate across 30 steady nights.'),
            },
            frozenset(),
            _SHOWCASE_REST_WINDOWS,
            frozenset({('correction_clusters', '2024-06-29 20:00:00', 'clean'), ('highs', '2024-06-25 14:00:00', 'clean'), ('highs', '2024-06-26 14:35:00', 'near_miss'), ('lows', '2024-06-26 13:55:00', 'fired'), ('lows', '2024-06-27 12:10:00', 'near_miss'), ('lows', '2024-06-28 12:10:00', 'clean'), ('lows', '2024-06-28 16:10:00', 'no_data'), ('lows', '2024-06-29 22:00:00', 'fired'), ('meals', '2024-06-01 08:00:00', 'no_data'), ('meals', '2024-06-02 08:00:00', 'no_data'), ('meals', '2024-06-03 08:00:00', 'no_data'), ('meals', '2024-06-04 08:00:00', 'no_data'), ('meals', '2024-06-05 08:00:00', 'no_data'), ('meals', '2024-06-06 08:00:00', 'no_data'), ('meals', '2024-06-07 08:00:00', 'no_data'), ('meals', '2024-06-08 08:00:00', 'no_data'), ('meals', '2024-06-09 08:00:00', 'no_data'), ('meals', '2024-06-10 08:00:00', 'no_data'), ('meals', '2024-06-11 08:00:00', 'no_data'), ('meals', '2024-06-12 08:00:00', 'no_data'), ('meals', '2024-06-13 08:00:00', 'no_data'), ('meals', '2024-06-14 08:00:00', 'no_data'), ('meals', '2024-06-15 08:00:00', 'no_data'), ('meals', '2024-06-16 08:00:00', 'no_data'), ('meals', '2024-06-17 08:00:00', 'no_data'), ('meals', '2024-06-18 08:00:00', 'no_data'), ('meals', '2024-06-19 08:00:00', 'no_data'), ('meals', '2024-06-20 08:00:00', 'no_data'), ('meals', '2024-06-21 08:00:00', 'no_data'), ('meals', '2024-06-22 08:00:00', 'no_data'), ('meals', '2024-06-23 08:00:00', 'no_data'), ('meals', '2024-06-24 08:00:00', 'no_data'), ('meals', '2024-06-25 08:00:00', 'no_data'), ('meals', '2024-06-25 12:00:00', 'fired'), ('meals', '2024-06-26 08:00:00', 'no_data'), ('meals', '2024-06-27 08:00:00', 'no_data'), ('meals', '2024-06-28 08:00:00', 'no_data'), ('meals', '2024-06-29 08:00:00', 'no_data'), ('meals', '2024-06-29 19:00:00', 'no_data'), ('meals', '2024-06-30 08:00:00', 'no_data')}),
            frozenset({'Basal 03:00 to 04:00 · lower', 'Carb undercount', 'Correction on active insulin', 'Highs after meals', 'Lows after correcting highs', 'Lows after meals', 'Over-treated low', 'meals-start-high'}),
            {('over_treated_low', 'lows'): ExpectedVerdictTally(denominator=5,
                                                                counts={'fired': 1,
                                                                        'outranked': 1,
                                                                        'near_miss': 1,
                                                                        'no_data': 1,
                                                                        'clean': 1}),
             ('carb_undercount', 'meals'): ExpectedVerdictTally(denominator=32,
                                                                counts={'fired': 1,
                                                                        'outranked': 0,
                                                                        'near_miss': 0,
                                                                        'no_data': 0,
                                                                        'clean': 31}),
             ('correction_on_iob', 'lows'): ExpectedVerdictTally(denominator=5,
                                                                 counts={'fired': 1,
                                                                         'outranked': 1,
                                                                         'near_miss': 0,
                                                                         'no_data': 0,
                                                                         'clean': 3})},
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': 'recurring_low', 'seriousness_segments': [{'start_min': 0, 'end_min': 1440, 'seriousness': 'recurring_low'}], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 32, 'k': 1, 'rate': 0.0312, 'wilson': {'lo': 0.0094, 'hi': 0.0989}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 32, 'gate': 12, 'verdict': 'ready'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': 'recurring_low', 'seriousness_segments': [{'start_min': 0, 'end_min': 1440, 'seriousness': 'recurring_low'}], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 32, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.0488}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 32, 'gate': 12, 'verdict': 'ready'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [{'subject': 'habit:over_treated_low', 'kind': 'habit', 'k': 1, 'price': 22, 'admitted': True, 'producer': 'scenario', 'lo': 0.0619, 'hi': 0.4865, 'seriousness': 'low', 'action': 'habit:over_treated_low', 'admission_basis': 'lower_bound'}], 'rate_levers': ['habit:over_treated_low'], 'n': 5, 'k': 1, 'rate': 0.2, 'wilson': {'lo': 0.0619, 'hi': 0.4865}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 5, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 22, 'admission_route': 'habit_threshold', 'collapse': 'collapse_to_member', 'action': 'habit:over_treated_low', 'seriousness': 'low', 'member_set_fingerprint': 'a0de7500243ef646'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 5, 'k': 1, 'rate': 0.2, 'wilson': {'lo': 0.0619, 'hi': 0.4865}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 5, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}), uncaused_highs=0),
        # May 20 to June 30. The dense thirty-day window the analyzers read is
        # still June 1-30 exactly; the five earlier CGM-only days and the empty
        # week between them are the month bound the v2 Day desk's month stepper
        # needs (_materialize_showcase_month_shoulder), and every expectation
        # above is unchanged by them.
        42,
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
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None, 'One cautious step down is supported at this time. Delivered below the programmed rate across 12 steady nights.')},
            frozenset(), frozenset(), frozenset(),
            frozenset({'Basal 03:00 to 04:00 · lower', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            {},
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        12,
    ),
    QaCase(
        _BEHAVIORAL_PRECEDENCE,
        _behavioral_precedence_recipe,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(), frozenset(), frozenset({('correction_clusters', '2024-06-29 20:00:00', 'clean'), ('highs', '2024-06-25 14:00:00', 'clean'), ('highs', '2024-06-26 14:35:00', 'near_miss'), ('lows', '2024-06-26 13:55:00', 'fired'), ('lows', '2024-06-27 12:10:00', 'near_miss'), ('lows', '2024-06-28 12:10:00', 'clean'), ('lows', '2024-06-28 16:10:00', 'no_data'), ('lows', '2024-06-29 22:00:00', 'fired'), ('meals', '2024-06-25 12:00:00', 'fired'), ('meals', '2024-06-29 19:00:00', 'no_data')}),
            frozenset({'Carb undercount', 'Correction on active insulin', 'Highs after meals', 'Lows after correcting highs', 'Lows after meals', 'Over-treated low', 'meals-start-high'}),
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
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 2, 'k': 1, 'rate': 0.5, 'wilson': {'lo': 0.1642, 'hi': 0.8358}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [{'subject': 'habit:over_treated_low', 'kind': 'habit', 'k': 1, 'price': 22, 'admitted': True, 'producer': 'scenario', 'lo': 0.0619, 'hi': 0.4865, 'seriousness': 'low', 'action': 'habit:over_treated_low', 'admission_basis': 'lower_bound'}], 'rate_levers': ['habit:over_treated_low'], 'n': 5, 'k': 1, 'rate': 0.2, 'wilson': {'lo': 0.0619, 'hi': 0.4865}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 5, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 22, 'admission_route': 'habit_threshold', 'collapse': 'collapse_to_member', 'action': 'habit:over_treated_low', 'seriousness': 'low', 'member_set_fingerprint': 'a0de7500243ef646'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 5, 'k': 1, 'rate': 0.2, 'wilson': {'lo': 0.0619, 'hi': 0.4865}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 5, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        5,
    ),
    QaCase(
        "basal-raise",
        partial(_materialize_basal_coverage, clean_rate=0.66),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_RAISE}),
            _basal_support("03:00", 30),
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "raise", None, 'One cautious step up is supported at this time. Delivered 0.66 U/h across 30 steady nights against 0.60 programmed.')},
            frozenset(), frozenset(), frozenset(),
            frozenset({'Basal 03:00 · raise', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        BASAL_SOURCE_SPAN_DAYS,
        "basal",
    ),
    QaCase(
        "basal-lower",
        partial(_materialize_basal_coverage, clean_rate=0.54),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_LOWER}),
            _basal_support("03:00", 30),
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None, 'One cautious step down is supported at this time. Delivered 0.54 U/h across 30 steady nights against 0.60 programmed.')},
            frozenset(), frozenset(), frozenset(),
            frozenset({'Basal 03:00 · lower', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal",
    ),
    QaCase(
        "basal-capped-raise",
        partial(_materialize_basal_coverage, clean_rate=0.8),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_CAPPED_RAISE}),
            _basal_support("03:00", 30),
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "raise", None, 'A step up, limited to 20% above the set rate. Delivered 0.80 U/h across 30 steady nights against 0.60 programmed.')},
            frozenset(), frozenset(), frozenset(),
            frozenset({'Basal 03:00 · raise', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal",
    ),
    QaCase(
        "basal-capped-lower",
        partial(_materialize_basal_coverage, clean_rate=0.4),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_CAPPED_LOWER}),
            _basal_support("03:00", 30),
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None, 'A step down, limited to 20% below the set rate. Delivered 0.40 U/h across 30 steady nights against 0.60 programmed.')},
            frozenset(), frozenset(), frozenset(),
            frozenset({'Basal 03:00 · lower', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal",
    ),
    QaCase(
        "basal-insufficient-seven-night",
        partial(_materialize_basal_coverage, clean_rate=0.48, informative_nights=7),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_INSUFFICIENT}),
            _basal_support("03:00", 7),
            {
            },
            frozenset({("whole_day", ("basal", "03:00"))}),
            frozenset(), frozenset(), frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "basal-insufficient-unsupported-sign",
        partial(_materialize_basal_coverage, clean_rate=0.48, informative_nights=8),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_INSUFFICIENT}),
            _basal_support("03:00", 8),
            {
            },
            frozenset({("whole_day", ("basal", "03:00"))}),
            frozenset(), frozenset(), frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "basal-verdict-gallery",
        _materialize_basal_verdict_gallery,
        QaExpectation(
            _basal_rows({
                ("basal", "00:00"): _BASAL_RAISE,
                ("basal", "00:30"): _BASAL_LOWER,
                ("basal", "01:00"): _BASAL_NO_CHANGE,
                ("basal", "01:30"): _BASAL_INSUFFICIENT,
            }),
            {
                key: ExpectedSupport(directional_support_count={
                    ("basal", "00:00"): 30, ("basal", "00:30"): 30,
                    ("basal", "01:00"): 0, ("basal", "01:30"): 5,
                }.get(key, 0))
                for key in _BASAL_SLOT_KEYS
            },
            {
                ("whole_day", ("basal", "00:00")): ExpectedQueueRow("assert", "raise", None, 'One cautious step up is supported at this time. Delivered 0.70 U/h across 30 steady nights against 0.60 programmed.'),
                ("whole_day", ("basal", "00:30")): ExpectedQueueRow("assert", "lower", None, 'One cautious step down is supported at this time. Delivered 0.50 U/h across 30 steady nights against 0.60 programmed.'),
                ((0, 120), ("basal", "00:00")): ExpectedQueueRow("assert", "raise", None, 'One cautious step up is supported at this time. Delivered 0.70 U/h across 30 steady nights against 0.60 programmed.'),
                ((0, 120), ("basal", "00:30")): ExpectedQueueRow("assert", "lower", None, 'One cautious step down is supported at this time. Delivered 0.50 U/h across 30 steady nights against 0.60 programmed.'),
            },
            frozenset({
                ("whole_day", ("basal", "01:00")),
                ("whole_day", ("basal", "01:30")),
                ((0, 120), ("basal", "01:00")),
            }),
            frozenset(), frozenset(),
            frozenset({'Basal 00:00 · raise', 'Basal 00:30 · lower', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}),
        ),
        BASAL_SOURCE_SPAN_DAYS, "basal", ((0, 120),),
    ),
    QaCase(
        "basal-blind",
        partial(_materialize_basal_coverage, clean_rate=None, informative_nights=0),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_NO_DATA}),
            _basal_support("03:00", 0),
            {
            },
            frozenset({
                ("whole_day", ("basal", "03:00")),
                ((180, 240), ("basal", "03:00")),
            }),
            frozenset(), frozenset(), frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
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
            },
            frozenset({("whole_day", ("basal", "03:00"))}),
            frozenset(), frozenset(), frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "basal-no-change",
        partial(_materialize_basal_coverage, clean_rate=0.6),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_NO_CHANGE}),
            _basal_support("03:00", 0), {
            },
            frozenset({
                ("whole_day", ("basal", "03:00")),
                ((180, 240), ("basal", "03:00")),
            }),
            frozenset(), frozenset(), frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "basal-recurring-low-lower",
        partial(
            _materialize_basal_coverage, clean_rate=0.54, recurring_lows=True,
        ),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_HARM_LOWER}),
            _basal_support("03:00", 30),
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None, 'Lows keep happening overnight, so the rate steps down toward the measured rate (20% at most). Delivered 0.54 U/h across 30 steady nights against 0.60 programmed.')},
            frozenset(), frozenset(), frozenset({
                ("lows", "2024-05-30 03:00:00", "clean"),
                ("lows", "2024-05-31 03:00:00", "clean"),
            }),
            frozenset({'Basal 03:00 · lower', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal",
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
            {("whole_day", ("basal", "05:00")): ExpectedQueueRow("assert", "lower", None, 'Lows keep happening overnight, so the rate steps down toward the measured rate (20% at most). Delivered below the programmed rate across 0 steady nights.')},
            frozenset(), frozenset(), frozenset({
                ("lows", "2024-05-30 05:00:00", "clean"),
                ("lows", "2024-05-31 05:00:00", "clean"),
            }),
            frozenset({'Basal 05:00 · lower', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal",
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
            },
            frozenset({("whole_day", ("basal", "03:00"))}),
            frozenset(), frozenset({
                ("lows", "2024-05-30 03:00:00", "clean"),
                ("lows", "2024-05-31 03:00:00", "clean"),
            }),
            frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "basal-recurring-low-within-floor",
        partial(
            _materialize_basal_coverage, clean_rate=0.59, recurring_lows=True,
        ),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_HARM_GATED}),
            _basal_support("03:00", 30),
            {
            },
            frozenset({("whole_day", ("basal", "03:00"))}),
            frozenset(), frozenset({
                ("lows", "2024-05-30 03:00:00", "clean"),
                ("lows", "2024-05-31 03:00:00", "clean"),
            }),
            frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "basal-recurring-low-spread",
        partial(
            _materialize_basal_coverage, clean_rate=None, recurring_lows=True,
            clean_rates=[0.45] * 14 + [0.54] * 2 + [0.66] * 14,
        ),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_HARM_GATED}),
            _basal_support("03:00", 30),
            {
            },
            frozenset({("whole_day", ("basal", "03:00"))}),
            frozenset(), frozenset({
                ("lows", "2024-05-30 03:00:00", "clean"),
                ("lows", "2024-05-31 03:00:00", "clean"),
            }),
            frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "basal-range-hold",
        partial(
            _materialize_basal_coverage, clean_rate=None,
            clean_rates=[0.6] * 14 + [0.66] * 16,
        ),
        QaExpectation(
            _basal_rows({('basal', '03:00'): _BASAL_INSUFFICIENT}),
            _basal_support("03:00", 16),
            {
            },
            frozenset({("whole_day", ("basal", "03:00"))}),
            frozenset(), frozenset([]),
            frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
    ),
    QaCase(
        "isf-strengthen",
        partial(_materialize_isf_coverage, true_isf=24.0),
        QaExpectation(
            _isf_rows(_ISF_STRENGTHEN),
            {("isf", "Fasting"): ExpectedSupport(n_steps=2784)},
            {
                ("whole_day", ("isf", "Fasting")): ExpectedQueueRow("assert", "strengthen", True, "Overnight you look more sensitive to insulin than the set value, so corrections can run a little stronger. Measured 1 U : 24.0 mg/dL across 29 fasting nights against 1 U : 40 mg/dL programmed."),
            },
            frozenset(), _ISF_REST_WINDOWS, _ISF_CORRECTION_ROWS,
            frozenset({'Correction factor · strengthen', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
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
                ("whole_day", ("isf", "Fasting")): ExpectedQueueRow("assert", "weaken", False, "Fasting data points toward stronger corrections, but recurring correction-linked lows call for weaker corrections. Measured 1 U : 24.0 mg/dL across 29 fasting nights against 1 U : 40 mg/dL programmed."),
            },
            frozenset(), _ISF_REST_WINDOWS, _ISF_CORRECTION_ROWS,
            frozenset({'Correction factor · weaken', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
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
            _ISF_REST_WINDOWS, _ISF_CORRECTION_ROWS, frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        ISF_SOURCE_SPAN_DAYS,
        "isf",
    ),
    QaCase(
        "isf-range-hold",
        partial(_materialize_isf_coverage, true_isf=40.4, noise_sd=8.0),
        QaExpectation(
            _isf_rows(_ISF_HELD),
            {("isf", "Fasting"): ExpectedSupport(n_steps=2765)},
            {}, frozenset({("whole_day", ("isf", "Fasting"))}),
            frozenset({('2024-06-07', '2024-06-07 22:00:00', '2024-06-08 08:00:00'), ('2024-05-11', '2024-05-11 22:00:00', '2024-05-12 08:00:00'), ('2024-05-16', '2024-05-16 22:00:00', '2024-05-17 08:00:00'), ('2024-05-12', '2024-05-12 22:00:00', '2024-05-13 08:00:00'), ('2024-05-19', '2024-05-19 22:00:00', '2024-05-20 08:00:00'), ('2024-05-14', '2024-05-14 22:00:00', '2024-05-15 08:00:00'), ('2024-05-21', '2024-05-21 22:00:00', '2024-05-22 08:00:00'), ('2024-05-29', '2024-05-29 22:00:00', '2024-05-30 08:00:00'), ('2024-05-17', '2024-05-17 22:00:00', '2024-05-18 08:00:00'), ('2024-05-20', '2024-05-20 22:00:00', '2024-05-21 08:00:00'), ('2024-05-31', '2024-05-31 22:00:00', '2024-06-01 08:00:00'), ('2024-06-05', '2024-06-05 22:20:00', '2024-06-06 08:00:00'), ('2024-05-27', '2024-05-27 22:00:00', '2024-05-28 08:00:00'), ('2024-05-15', '2024-05-15 22:00:00', '2024-05-16 08:00:00'), ('2024-05-28', '2024-05-28 22:00:00', '2024-05-29 08:00:00'), ('2024-05-13', '2024-05-13 22:00:00', '2024-05-14 08:00:00'), ('2024-06-04', '2024-06-04 22:00:00', '2024-06-05 08:00:00'), ('2024-05-24', '2024-05-24 22:00:00', '2024-05-25 08:00:00'), ('2024-05-26', '2024-05-26 22:00:00', '2024-05-27 08:00:00'), ('2024-05-30', '2024-05-30 22:00:00', '2024-05-31 08:00:00'), ('2024-05-22', '2024-05-22 22:00:00', '2024-05-23 08:00:00'), ('2024-06-03', '2024-06-03 22:00:00', '2024-06-04 08:00:00'), ('2024-05-10', '2024-05-10 22:00:00', '2024-05-11 08:00:00'), ('2024-05-18', '2024-05-18 22:00:00', '2024-05-19 08:00:00'), ('2024-05-25', '2024-05-25 22:00:00', '2024-05-26 08:00:00'), ('2024-05-23', '2024-05-23 22:00:00', '2024-05-24 08:00:00'), ('2024-06-01', '2024-06-01 22:00:00', '2024-06-02 08:00:00'), ('2024-06-02', '2024-06-02 22:10:00', '2024-06-03 08:00:00'), ('2024-06-06', '2024-06-06 22:00:00', '2024-06-07 08:00:00')}), frozenset({('correction_clusters', '2024-05-12 00:00:00', 'clean'), ('correction_clusters', '2024-05-13 00:30:00', 'clean'), ('correction_clusters', '2024-05-14 01:00:00', 'clean'), ('correction_clusters', '2024-05-15 01:30:00', 'clean'), ('correction_clusters', '2024-05-16 02:00:00', 'clean'), ('correction_clusters', '2024-05-17 02:30:00', 'clean'), ('correction_clusters', '2024-05-18 23:30:00', 'clean'), ('correction_clusters', '2024-05-20 00:00:00', 'clean'), ('correction_clusters', '2024-05-21 00:30:00', 'clean'), ('correction_clusters', '2024-05-22 01:00:00', 'clean'), ('correction_clusters', '2024-05-23 01:30:00', 'clean'), ('correction_clusters', '2024-05-24 02:00:00', 'clean'), ('correction_clusters', '2024-05-25 02:30:00', 'clean'), ('correction_clusters', '2024-05-26 23:30:00', 'clean'), ('correction_clusters', '2024-05-28 00:00:00', 'clean'), ('correction_clusters', '2024-05-29 00:30:00', 'clean'), ('correction_clusters', '2024-05-30 01:00:00', 'clean'), ('correction_clusters', '2024-05-31 01:30:00', 'clean'), ('correction_clusters', '2024-06-01 02:00:00', 'clean'), ('correction_clusters', '2024-06-02 02:30:00', 'clean'), ('correction_clusters', '2024-06-03 23:30:00', 'clean'), ('correction_clusters', '2024-06-05 00:00:00', 'clean'), ('correction_clusters', '2024-06-06 00:30:00', 'clean'), ('correction_clusters', '2024-06-07 01:00:00', 'clean'), ('correction_clusters', '2024-06-08 01:30:00', 'clean'), ('lows', '2024-05-17 05:20:00', 'clean')}),
            frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 1, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.6216}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 1, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 1, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.6216}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 1, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
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
            },
            frozenset({
                ("whole_day", ("ic", "All day")),
                ((0, 720), ("ic", "All day")),
            }),
            frozenset(), _IC_COLLECTING_MEAL_ROWS, frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
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
                ("whole_day", ("ic", "All day")): ExpectedQueueRow("assert", "raise", None, 'Meals look slightly over-covered relative to the programmed carb ratio. Measured 12 g/U across 8 meal runs against 10 programmed.'),
            },
            frozenset(), frozenset(), _IC_EIGHT_MEAL_ROWS,
            frozenset({'Carb ratio 00:00 to 24:00 · raise', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 8, 'price': 63, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 8, 'price': 63, 'admitted': True, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': 'carb_ratio'}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 63, 'admission_route': 'setting_staging', 'collapse': 'remain_pattern', 'action': 'carb_ratio', 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
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
                ("whole_day", ("ic", "All day")): ExpectedQueueRow("assert", "lower", None, 'Post-meal corrections imply meals are under-covered, so a tighter (smaller) carb ratio would dose more per carb. Measured 8 g/U across 8 meal runs against 10 programmed.'),
            },
            frozenset(), frozenset(), _IC_EIGHT_MEAL_ROWS,
            frozenset({'Carb ratio 00:00 to 24:00 · lower', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 8, 'price': 57, 'admitted': True, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': 'carb_ratio'}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 57, 'admission_route': 'setting_staging', 'collapse': 'remain_pattern', 'action': 'carb_ratio', 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 8, 'price': 57, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
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
                ("whole_day", ("ic", "All day")): ExpectedQueueRow("assert", "raise", None, 'Meals look slightly over-covered relative to the programmed carb ratio. Measured 20 g/U across 8 meal runs against 10 programmed.'),
            },
            frozenset(), frozenset(), _IC_EIGHT_MEAL_ROWS,
            frozenset({'Carb ratio 00:00 to 24:00 · raise', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 8, 'price': 87, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 8, 'price': 87, 'admitted': True, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': 'carb_ratio'}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 87, 'admission_route': 'setting_staging', 'collapse': 'remain_pattern', 'action': 'carb_ratio', 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
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
                ("whole_day", ("ic", "All day")): ExpectedQueueRow("assert", "lower", None, 'Post-meal corrections imply meals are under-covered, so a tighter (smaller) carb ratio would dose more per carb. Measured 4 g/U across 8 meal runs against 10 programmed.'),
            },
            frozenset(), frozenset(), _IC_EIGHT_MEAL_ROWS,
            frozenset({'Carb ratio 00:00 to 24:00 · lower', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 8, 'price': 61, 'admitted': True, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': 'carb_ratio'}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 61, 'admission_route': 'setting_staging', 'collapse': 'remain_pattern', 'action': 'carb_ratio', 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 8, 'price': 61, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
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
            },
            frozenset({("whole_day", ("ic", "All day"))}),
            frozenset(), _IC_NINE_MEAL_ROWS, frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 9, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1543}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 9, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 9, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1543}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 9, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
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
            },
            frozenset({
                ("whole_day", ("ic", "All day")),
                ((0, 720), ("ic", "All day")),
            }),
            frozenset(), _IC_SEVEN_MEAL_ROWS, frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 7, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.19}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 7, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 7, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.19}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 7, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
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
            },
            frozenset(), frozenset(),
            _IC_HISTORY_MEAL_ROWS,
            frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 12, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1204}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 12, 'gate': 12, 'verdict': 'ready'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 12, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1204}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 12, 'gate': 12, 'verdict': 'ready'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        IC_SOURCE_SPAN_DAYS,
        "ic",
    ),
    QaCase(
        "ic-block-evidence",
        _materialize_ic_block_evidence,
        QaExpectation(
            _explicit_rows({
                ("ic", "Morning"): ExpectedIcRow(
                    state="numeric", direction="raise", asserts_move=True,
                    days_observed=90, omitted=frozenset({"days_needed"}),
                ),
            }),
            {
                ("ic", "Morning"):
                    ExpectedSupport(n_runs=19, effective_run_count=19.0),
            },
            {
                ("whole_day", ("ic", "Morning")): ExpectedQueueRow("assert", "raise", None, 'Meals look slightly over-covered relative to the programmed carb ratio. Measured 5.3 g/U across 19 meal runs against 5 programmed.'),
            },
            frozenset(), frozenset(), frozenset({('highs', '2024-05-03 09:35:00', 'clean'), ('highs', '2024-05-05 09:35:00', 'clean'), ('highs', '2024-05-07 09:35:00', 'clean'), ('highs', '2024-05-09 09:35:00', 'clean'), ('highs', '2024-05-11 09:35:00', 'clean'), ('highs', '2024-05-13 09:35:00', 'clean'), ('highs', '2024-05-15 09:30:00', 'clean'), ('highs', '2024-05-16 09:30:00', 'clean'), ('highs', '2024-05-19 13:35:00', 'clean'), ('highs', '2024-05-21 13:35:00', 'clean'), ('highs', '2024-05-23 13:35:00', 'clean'), ('highs', '2024-05-25 13:35:00', 'clean'), ('highs', '2024-05-27 13:35:00', 'clean'), ('lows', '2024-05-15 12:30:00', 'clean'), ('lows', '2024-05-16 12:30:00', 'clean'), ('meals', '2024-05-03 09:00:00', 'fired'), ('meals', '2024-05-04 09:00:00', 'no_data'), ('meals', '2024-05-05 09:00:00', 'fired'), ('meals', '2024-05-06 09:00:00', 'no_data'), ('meals', '2024-05-07 09:00:00', 'fired'), ('meals', '2024-05-08 09:00:00', 'no_data'), ('meals', '2024-05-09 09:00:00', 'fired'), ('meals', '2024-05-10 09:00:00', 'no_data'), ('meals', '2024-05-11 09:00:00', 'fired'), ('meals', '2024-05-12 09:00:00', 'no_data'), ('meals', '2024-05-13 09:00:00', 'fired'), ('meals', '2024-05-14 09:00:00', 'no_data'), ('meals', '2024-05-15 09:00:00', 'fired'), ('meals', '2024-05-15 11:00:00', 'fired'), ('meals', '2024-05-16 09:00:00', 'fired'), ('meals', '2024-05-16 11:00:00', 'fired'), ('meals', '2024-05-18 11:00:00', 'no_data'), ('meals', '2024-05-18 13:00:00', 'no_data'), ('meals', '2024-05-19 11:00:00', 'no_data'), ('meals', '2024-05-19 13:00:00', 'fired'), ('meals', '2024-05-20 11:00:00', 'no_data'), ('meals', '2024-05-20 13:00:00', 'no_data'), ('meals', '2024-05-21 11:00:00', 'no_data'), ('meals', '2024-05-21 13:00:00', 'fired'), ('meals', '2024-05-22 11:00:00', 'no_data'), ('meals', '2024-05-22 13:00:00', 'no_data'), ('meals', '2024-05-23 11:00:00', 'no_data'), ('meals', '2024-05-23 13:00:00', 'fired'), ('meals', '2024-05-24 11:00:00', 'no_data'), ('meals', '2024-05-24 13:00:00', 'no_data'), ('meals', '2024-05-25 11:00:00', 'no_data'), ('meals', '2024-05-25 13:00:00', 'fired'), ('meals', '2024-05-26 11:00:00', 'no_data'), ('meals', '2024-05-26 13:00:00', 'no_data'), ('meals', '2024-05-27 11:00:00', 'no_data'), ('meals', '2024-05-27 13:00:00', 'fired'), ('meals', '2024-05-30 09:00:00', 'no_data')}),
            frozenset({'Carb ratio 00:00 to 12:00 · raise', 'Highs after meals', 'Highs after treating lows', 'Late bolus', 'Lows after correcting highs', 'Lows after meals', 'Meal over-delivery', 'meals-start-high'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'habit:late_bolus', 'kind': 'habit', 'k': 13, 'price': 49, 'admitted': True, 'producer': 'scenario', 'lo': 0.259, 'hi': 0.4563, 'seriousness': 'medium', 'action': 'habit:late_bolus', 'admission_basis': 'lower_bound'}, {'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 18, 'price': 60, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 37, 'k': 13, 'rate': 0.3514, 'wilson': {'lo': 0.259, 'hi': 0.4563}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 37, 'gate': 12, 'verdict': 'ready'}, 'settled_price': 49, 'admission_route': 'habit_threshold', 'collapse': 'remain_pattern', 'action': 'habit:late_bolus', 'seriousness': 'medium', 'member_set_fingerprint': '7b70fc1df4bdda74'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'habit:meal_over_delivery', 'kind': 'habit', 'k': 2, 'price': 3, 'admitted': True, 'producer': 'scenario', 'lo': 0.0227, 'hi': 0.1233, 'seriousness': 'info', 'action': 'habit:meal_over_delivery', 'admission_basis': 'low_confidence'}, {'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 18, 'price': 60, 'admitted': True, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': 'recurring_low', 'seriousness_segments': [{'start_min': 0, 'end_min': 720, 'seriousness': 'recurring_low'}], 'action': 'carb_ratio'}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 37, 'k': 2, 'rate': 0.0541, 'wilson': {'lo': 0.0227, 'hi': 0.1233}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 37, 'gate': 12, 'verdict': 'ready'}, 'settled_price': 60, 'admission_route': 'setting_staging', 'collapse': 'remain_pattern', 'action': 'carb_ratio', 'seriousness': 'recurring_low', 'member_set_fingerprint': '928d6592af5b448a'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}),
            verdict_tallies={
                ('late_bolus', 'meals'): ExpectedVerdictTally(
                    denominator=37,
                    counts={'fired': 13, 'outranked': 2, 'near_miss': 0, 'no_data': 0, 'clean': 22},
                ),
                ('meal_over_delivery', 'meals'): ExpectedVerdictTally(
                    denominator=37,
                    counts={'fired': 2, 'outranked': 0, 'near_miss': 0, 'no_data': 35, 'clean': 0},
                ),
            },
        ),
        IC_SOURCE_SPAN_DAYS,
    ),
    QaCase(
        "behavioral-carb-undercount",
        _materialize_behavioral_carb_undercount,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, frozenset({('highs', '2024-05-24 12:30:00', 'clean'),
                       ('highs', '2024-05-25 12:30:00', 'clean'),
                       ('meals', '2024-05-24 12:05:00', 'fired'),
                       ('meals', '2024-05-25 12:05:00', 'fired'),
                       ('meals', '2024-05-26 12:05:00', 'fired'),
                       ('meals', '2024-05-27 12:05:00', 'near_miss'),
                       ('meals', '2024-05-28 12:05:00', 'no_data'),
                       ('meals', '2024-05-29 12:05:00', 'no_data')}),
            frozenset({'Carb undercount', 'Highs after meals', 'Highs after treating lows', 'Late bolus', 'Lows after correcting highs', 'Lows after meals', 'meals-start-high'}),
            {
                ("carb_undercount", "meals"): _verdict_tally(
                    6, fired=2, outranked=1, near_miss=1, no_data=1, clean=1,
                ),
                ("late_bolus", "meals"): _verdict_tally(
                    6, fired=1, outranked=2, near_miss=0, no_data=0, clean=3,
                ),
            },
            2,
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'habit:carb_undercount', 'kind': 'habit', 'k': 2, 'price': 22, 'admitted': True, 'producer': 'scenario', 'lo': 0.1477, 'hi': 0.5906, 'seriousness': 'low', 'action': 'habit:carb_undercount', 'admission_basis': 'lower_bound'}, {'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 6, 'k': 3, 'rate': 0.5, 'wilson': {'lo': 0.2682, 'hi': 0.7318}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 6, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 22, 'admission_route': 'habit_threshold', 'collapse': 'remain_pattern', 'action': 'habit:carb_undercount', 'seriousness': 'low', 'member_set_fingerprint': '3dbae730bfb75717'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 6, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.2149}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 6, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        30,
    ),
    QaCase(
        "behavioral-late-bolus",
        _materialize_behavioral_late_bolus,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, frozenset({('highs', '2024-05-26 12:30:00', 'clean'),
                       ('lows', '2024-05-27 11:40:00', 'clean'),
                       ('meals', '2024-05-01 00:00:00', 'no_data'),
                       ('meals', '2024-05-23 12:05:00', 'no_data'),
                       ('meals', '2024-05-24 12:05:00', 'fired'),
                       ('meals', '2024-05-25 12:05:00', 'fired'),
                       ('meals', '2024-05-26 12:05:00', 'fired'),
                       ('meals', '2024-05-27 12:05:00', 'near_miss'),
                       ('meals', '2024-05-28 12:05:00', 'no_data')}),
            frozenset({'Carb undercount', 'Highs after meals', 'Highs after treating lows', 'Late bolus', 'Lows after correcting highs', 'Lows after meals', 'meals-start-high'}),
            {
                ("late_bolus", "meals"): _verdict_tally(
                    7, fired=2, outranked=1, near_miss=1, no_data=1, clean=2,
                ),
                ("carb_undercount", "meals"): _verdict_tally(
                    7, fired=1, outranked=2, near_miss=0, no_data=0, clean=4,
                ),
            },
            1,
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'habit:late_bolus', 'kind': 'habit', 'k': 2, 'price': 7, 'admitted': True, 'producer': 'scenario', 'lo': 0.1253, 'hi': 0.5275, 'seriousness': 'info', 'action': 'habit:late_bolus', 'admission_basis': 'low_confidence'}, {'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 7, 'k': 3, 'rate': 0.4286, 'wilson': {'lo': 0.226, 'hi': 0.6583}, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 7, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 7, 'admission_route': 'habit_threshold', 'collapse': 'remain_pattern', 'action': 'habit:late_bolus', 'seriousness': 'info', 'member_set_fingerprint': '7b70fc1df4bdda74'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 7, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.19}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 7, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 1, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.6216}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 1, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 1, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.6216}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 1, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        30,
    ),
    QaCase(
        "behavioral-split-meal",
        _materialize_behavioral_split_meal,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, frozenset({('highs', '2024-05-03 14:05:00', 'clean'),
                       ('highs', '2024-05-04 14:05:00', 'clean'),
                       ('highs', '2024-05-05 14:05:00', 'clean'),
                       ('highs', '2024-05-06 14:05:00', 'clean'),
                       ('highs', '2024-05-07 14:05:00', 'clean'),
                       ('highs', '2024-05-08 14:05:00', 'clean'),
                       ('highs', '2024-05-09 14:05:00', 'clean'),
                       ('highs', '2024-05-10 14:05:00', 'clean'),
                       ('highs', '2024-05-11 14:05:00', 'clean'),
                       ('highs', '2024-05-12 14:05:00', 'clean'),
                       ('highs', '2024-05-13 14:05:00', 'clean'),
                       ('highs', '2024-05-14 14:05:00', 'clean'),
                       ('meals', '2024-05-03 12:00:00', 'fired'),
                       ('meals', '2024-05-04 12:00:00', 'fired'),
                       ('meals', '2024-05-05 12:00:00', 'fired'),
                       ('meals', '2024-05-06 12:00:00', 'fired'),
                       ('meals', '2024-05-07 12:00:00', 'fired'),
                       ('meals', '2024-05-08 12:00:00', 'fired'),
                       ('meals', '2024-05-09 12:00:00', 'fired'),
                       ('meals', '2024-05-10 12:00:00', 'fired'),
                       ('meals', '2024-05-11 12:00:00', 'fired'),
                       ('meals', '2024-05-12 12:00:00', 'no_data'),
                       ('meals', '2024-05-12 12:35:00', 'fired'),
                       ('meals', '2024-05-13 12:00:00', 'no_data'),
                       ('meals', '2024-05-13 12:35:00', 'fired'),
                       ('meals', '2024-05-14 12:00:00', 'no_data'),
                       ('meals', '2024-05-14 12:35:00', 'fired')}),
            frozenset({'Carb undercount', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals', 'meals-start-high'}),
            {
                ("carb_undercount", "meals"): _verdict_tally(
                    15, fired=12, outranked=0, near_miss=0, no_data=0, clean=3,
                ),
            },
            9,
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'habit:carb_undercount', 'kind': 'habit', 'k': 12, 'price': 61, 'admitted': True, 'producer': 'scenario', 'lo': 0.6413, 'hi': 0.8995, 'seriousness': 'high', 'action': 'habit:carb_undercount', 'admission_basis': 'lower_bound'}, {'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 15, 'k': 12, 'rate': 0.8, 'wilson': {'lo': 0.6413, 'hi': 0.8995}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 15, 'gate': 12, 'verdict': 'ready'}, 'settled_price': 61, 'admission_route': 'habit_threshold', 'collapse': 'remain_pattern', 'action': 'habit:carb_undercount', 'seriousness': 'high', 'member_set_fingerprint': '3dbae730bfb75717'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 15, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.0987}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 15, 'gate': 12, 'verdict': 'ready'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        30,
    ),
    QaCase(
        "behavioral-uncaused-highs",
        _materialize_behavioral_uncaused_highs,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(), frozenset(), frozenset({
                ("highs", "2024-05-02 09:30:00", "clean"),
                ("highs", "2024-05-02 10:45:00", "clean"),
            }),
            frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}), {}, uncaused_highs=2,
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        2,
    ),
    QaCase(
        "behavioral-false-low-suppressed",
        partial(_materialize_behavioral_compression_low, answer="false-low"),
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(), frozenset(), frozenset(), frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        2,
    ),
    QaCase(
        "behavioral-low-no-suppressed",
        partial(_materialize_behavioral_compression_low, answer="no"),
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(), frozenset(), frozenset({
                ("lows", "2024-05-02 03:05:00", "clean"),
            }), frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 1, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.6216}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 1, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 1, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.6216}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 1, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        2,
    ),
    QaCase(
        "behavioral-lone-correction-clean",
        _materialize_behavioral_lone_correction,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(), frozenset(), frozenset(), frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        1,
    ),
    QaCase(
        "behavioral-meals-start-high",
        _materialize_behavioral_meals_start_high,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_8_DAY_REST_WINDOWS, frozenset({
                ("meals", "2024-05-01 12:00:00", "no_data"),
                ("meals", "2024-05-02 12:00:00", "no_data"),
                ("meals", "2024-05-03 12:00:00", "no_data"),
                ("meals", "2024-05-04 12:00:00", "no_data"),
                ("meals", "2024-05-05 12:00:00", "no_data"),
                ("meals", "2024-05-06 12:00:00", "no_data"),
                ("meals", "2024-05-07 12:00:00", "no_data"),
                ("meals", "2024-05-08 12:00:00", "no_data"),
            }),
            frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals', 'meals-start-high'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        8,
    ),
    QaCase(
        "behavioral-carb-counting",
        partial(_materialize_behavioral_ic_finding, correction_burden=False),
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_8_DAY_REST_WINDOWS, _BEHAVIORAL_8_MEAL_ROWS,
            frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals', 'carb-counting'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        8,
    ),
    QaCase(
        "behavioral-post-meal-correction-burden",
        partial(_materialize_behavioral_ic_finding, correction_burden=True),
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_8_DAY_REST_WINDOWS, frozenset({('correction_clusters', '2024-05-02 14:00:00', 'clean'), ('correction_clusters', '2024-05-03 14:00:00', 'clean'), ('correction_clusters', '2024-05-04 14:00:00', 'clean'), ('correction_clusters', '2024-05-05 14:00:00', 'clean'), ('correction_clusters', '2024-05-06 14:00:00', 'clean'), ('correction_clusters', '2024-05-07 14:00:00', 'clean'), ('correction_clusters', '2024-05-08 14:00:00', 'clean'), ('meals', '2024-05-01 12:00:00', 'no_data'), ('meals', '2024-05-02 12:00:00', 'no_data'), ('meals', '2024-05-03 12:00:00', 'no_data'), ('meals', '2024-05-04 12:00:00', 'no_data'), ('meals', '2024-05-05 12:00:00', 'no_data'), ('meals', '2024-05-06 12:00:00', 'no_data'), ('meals', '2024-05-07 12:00:00', 'no_data'), ('meals', '2024-05-08 12:00:00', 'no_data')}),
            frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals', 'post-meal-correction-burden'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 8, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.1703}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        8,
    ),
    QaCase(
        "behavioral-meal-over-delivery",
        _materialize_behavioral_meal_over_delivery,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, frozenset({
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
            frozenset({'Carb undercount', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals', 'Meal over-delivery', 'meals-start-high'}),
            {
                ("meal_over_delivery", "meals"): _verdict_tally(
                    6, fired=2, outranked=1, near_miss=1, no_data=1, clean=1,
                ),
                ("carb_undercount", "meals"): _verdict_tally(
                    6, fired=1, outranked=2, near_miss=0, no_data=0, clean=3,
                ),
            },
            1,
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': 'recurring_low', 'seriousness_segments': [{'start_min': 0, 'end_min': 1440, 'seriousness': 'recurring_low'}], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 6, 'k': 1, 'rate': 0.1667, 'wilson': {'lo': 0.0513, 'hi': 0.4253}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 6, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'habit:meal_over_delivery', 'kind': 'habit', 'k': 2, 'price': 8, 'admitted': True, 'producer': 'scenario', 'lo': 0.1477, 'hi': 0.5906, 'seriousness': 'info', 'action': 'habit:meal_over_delivery', 'admission_basis': 'low_confidence'}, {'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': 'recurring_low', 'seriousness_segments': [{'start_min': 0, 'end_min': 1440, 'seriousness': 'recurring_low'}], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 6, 'k': 2, 'rate': 0.3333, 'wilson': {'lo': 0.1477, 'hi': 0.5906}, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 6, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 8, 'admission_route': 'habit_threshold', 'collapse': 'remain_pattern', 'action': 'habit:meal_over_delivery', 'seriousness': 'info', 'member_set_fingerprint': '928d6592af5b448a'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        30,
    ),
    QaCase(
        "behavioral-correction-stacking",
        _materialize_behavioral_correction_stacking,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, frozenset({('correction_clusters', '2024-05-24 14:40:00', 'fired'), ('correction_clusters', '2024-05-25 14:10:00', 'clean'), ('correction_clusters', '2024-05-25 14:40:00', 'fired'), ('correction_clusters', '2024-05-26 10:10:00', 'clean'), ('correction_clusters', '2024-05-26 10:40:00', 'near_miss'), ('correction_clusters', '2024-05-27 15:30:00', 'clean'), ('correction_clusters', '2024-05-27 16:10:00', 'clean'), ('highs', '2024-05-27 17:00:00', 'fired'), ('lows', '2024-05-24 16:05:00', 'no_data'), ('lows', '2024-05-25 16:05:00', 'no_data')}),
            frozenset({'Correction stacking', 'Highs after meals', 'Highs after treating lows', 'Lows after meals', 'Missed / unannounced meal'}),
            {('correction_stacking', 'correction_clusters'): _verdict_tally(7, fired=2, outranked=0, near_miss=1, no_data=3, clean=1), ('missed_meal', 'highs'): _verdict_tally(1, fired=1, outranked=0, near_miss=0, no_data=0, clean=0)},
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [{'subject': 'habit:correction_stacking', 'kind': 'habit', 'k': 2, 'price': 16, 'admitted': True, 'producer': 'scenario', 'lo': 0.1253, 'hi': 0.5275, 'seriousness': 'info', 'action': 'habit:correction_stacking', 'admission_basis': 'low_confidence'}], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 2, 'k': 2, 'rate': 1.0, 'wilson': {'lo': 0.5491, 'hi': 1.0}, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 16, 'admission_route': 'habit_threshold', 'collapse': 'collapse_to_member', 'action': 'habit:correction_stacking', 'seriousness': 'info', 'member_set_fingerprint': 'f9ecb8ff827a7ae9'})),
        30,
    ),
    QaCase(
        "behavioral-over-treated-low",
        _materialize_behavioral_over_treated_low,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, frozenset({('highs', '2024-05-23 14:35:00', 'near_miss'), ('highs', '2024-05-24 14:35:00', 'near_miss'), ('lows', '2024-05-23 13:55:00', 'fired'), ('lows', '2024-05-24 13:55:00', 'fired'), ('lows', '2024-05-25 12:10:00', 'near_miss'), ('lows', '2024-05-26 12:10:00', 'clean'), ('lows', '2024-05-27 16:10:00', 'no_data'), ('lows', '2024-05-28 22:00:00', 'fired'), ('meals', '2024-05-28 19:00:00', 'no_data')}),
            frozenset({'Correction on active insulin', 'Highs after meals', 'Lows after correcting highs', 'Lows after meals', 'Over-treated low', 'meals-start-high'}),
            {
                ("over_treated_low", "lows"): _verdict_tally(
                    6, fired=2, outranked=1, near_miss=1, no_data=1, clean=1,
                ),
                ("correction_on_iob", "lows"): _verdict_tally(
                    6, fired=1, outranked=2, near_miss=0, no_data=0, clean=3,
                ),
            },
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 1, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.6216}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 1, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 1, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.6216}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 1, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [{'subject': 'habit:over_treated_low', 'kind': 'habit', 'k': 2, 'price': 28, 'admitted': True, 'producer': 'scenario', 'lo': 0.1477, 'hi': 0.5906, 'seriousness': 'low', 'action': 'habit:over_treated_low', 'admission_basis': 'lower_bound'}], 'rate_levers': ['habit:over_treated_low'], 'n': 6, 'k': 2, 'rate': 0.3333, 'wilson': {'lo': 0.1477, 'hi': 0.5906}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 6, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 28, 'admission_route': 'habit_threshold', 'collapse': 'collapse_to_member', 'action': 'habit:over_treated_low', 'seriousness': 'low', 'member_set_fingerprint': 'a0de7500243ef646'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 6, 'k': 1, 'rate': 0.1667, 'wilson': {'lo': 0.0513, 'hi': 0.4253}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 6, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        30,
    ),
    QaCase(
        "behavioral-over-treated-rebound-ownership",
        _materialize_behavioral_over_treated_rebound_ownership,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, frozenset({
                ("highs", "2024-05-23 16:00:00", "near_miss"),
                ("highs", "2024-05-24 16:35:00", "clean"),
                ("highs", "2024-05-27 13:20:00", "fired"),
                ("lows", "2024-05-23 14:00:00", "fired"),
                ("lows", "2024-05-24 14:00:00", "fired"),
            }),
            frozenset({'Highs after meals', 'Lows after correcting highs', 'Lows after meals', 'Missed / unannounced meal', 'Over-treated low'}),
            {
                ("over_treated_low", "lows"): _verdict_tally(
                    2, fired=2, outranked=0, near_miss=0, no_data=0, clean=0,
                ),
                ("missed_meal", "highs"): _verdict_tally(
                    3, fired=1, outranked=0, near_miss=1, no_data=0, clean=1,
                ),
            },
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [{'subject': 'habit:over_treated_low', 'kind': 'habit', 'k': 2, 'price': 71, 'admitted': True, 'producer': 'scenario', 'lo': 0.5491, 'hi': 1.0, 'seriousness': 'high', 'action': 'habit:over_treated_low', 'admission_basis': 'low_confidence'}], 'rate_levers': ['habit:over_treated_low'], 'n': 2, 'k': 2, 'rate': 1.0, 'wilson': {'lo': 0.5491, 'hi': 1.0}, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 71, 'admission_route': 'habit_threshold', 'collapse': 'collapse_to_member', 'action': 'habit:over_treated_low', 'seriousness': 'high', 'member_set_fingerprint': 'a0de7500243ef646'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}),
            uncaused_highs=0,
        ),
        30,
    ),
    QaCase(
        "behavioral-correction-on-iob",
        _materialize_behavioral_correction_on_iob,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, frozenset({('correction_clusters', '2024-05-25 20:00:00', 'clean'), ('correction_clusters', '2024-05-27 20:00:00', 'clean'), ('highs', '2024-05-26 14:35:00', 'near_miss'), ('lows', '2024-05-24 22:00:00', 'fired'), ('lows', '2024-05-25 22:00:00', 'fired'), ('lows', '2024-05-26 13:55:00', 'fired'), ('lows', '2024-05-27 22:00:00', 'near_miss'), ('lows', '2024-05-28 16:10:00', 'clean'), ('meals', '2024-05-24 19:00:00', 'no_data'), ('meals', '2024-05-25 19:00:00', 'no_data'), ('meals', '2024-05-27 19:00:00', 'near_miss')}), frozenset({'Correction on active insulin', 'Highs after meals', 'Lows after meals', 'Over-treated low', 'meals-start-high'}),
            {
                ("correction_on_iob", "lows"): _verdict_tally(
                    5, fired=2, outranked=1, near_miss=1, no_data=0, clean=1,
                ),
                ("over_treated_low", "lows"): _verdict_tally(
                    5, fired=1, outranked=2, near_miss=0, no_data=0, clean=2,
                ),
            },
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 3, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.3538}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 3, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 3, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.3538}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 3, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [{'subject': 'habit:over_treated_low', 'kind': 'habit', 'k': 1, 'price': 15, 'admitted': True, 'producer': 'scenario', 'lo': 0.0619, 'hi': 0.4865, 'seriousness': 'info', 'action': 'habit:over_treated_low', 'admission_basis': 'low_confidence'}], 'rate_levers': ['habit:over_treated_low'], 'n': 5, 'k': 1, 'rate': 0.2, 'wilson': {'lo': 0.0619, 'hi': 0.4865}, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 5, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 15, 'admission_route': 'habit_threshold', 'collapse': 'collapse_to_member', 'action': 'habit:over_treated_low', 'seriousness': 'info', 'member_set_fingerprint': 'a0de7500243ef646'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [{'subject': 'habit:correction_on_iob', 'kind': 'habit', 'k': 2, 'price': 35, 'admitted': True, 'producer': 'scenario', 'lo': 0.1799, 'hi': 0.6696, 'seriousness': 'medium', 'action': 'habit:correction_on_iob', 'admission_basis': 'lower_bound'}], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 5, 'k': 2, 'rate': 0.4, 'wilson': {'lo': 0.1799, 'hi': 0.6696}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 5, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 35, 'admission_route': 'habit_threshold', 'collapse': 'collapse_to_member', 'action': 'habit:correction_on_iob', 'seriousness': 'medium', 'member_set_fingerprint': 'a125e00c457f148f'})),
        30,
    ),
    QaCase(
        "behavioral-missed-meal",
        _materialize_behavioral_missed_meal,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, frozenset({('correction_clusters', '2024-05-29 11:10:00', 'clean'), ('highs', '2024-05-02 03:00:00', 'no_data'), ('highs', '2024-05-24 14:30:00', 'fired'), ('highs', '2024-05-25 14:30:00', 'fired'), ('highs', '2024-05-26 14:30:00', 'clean'), ('highs', '2024-05-27 14:30:00', 'near_miss'), ('highs', '2024-05-29 14:00:00', 'clean'), ('meals', '2024-05-26 12:00:00', 'near_miss'), ('meals', '2024-05-29 10:00:00', 'near_miss')}), frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals', 'Missed / unannounced meal', 'meals-start-high'}), {('missed_meal', 'highs'): ExpectedVerdictTally(denominator=6,
                                                                                                                                                                                                                                                                                                       counts={'fired': 2,
                                                                                                                                                                                                                                                                                                               'outranked': 0,
                                                                                                                                                                                                                                                                                                               'near_miss': 1,
                                                                                                                                                                                                                                                                                                               'no_data': 1,
                                                                                                                                                                                                                                                                                                               'clean': 2})}, 4,
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 2, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.4509}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 2, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
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
            frozenset(), frozenset({'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
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
            frozenset({('highs', '2024-05-02 14:00:00', 'clean'), ('meals', '2024-05-02 12:00:00', 'fired')}), frozenset({'Carb undercount', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals', 'meals-start-high'}), {
                ("carb_undercount", "meals"): _verdict_tally(
                    1, fired=1, outranked=0, near_miss=0, no_data=0, clean=0,
                ),
            },
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 1, 'k': 1, 'rate': 1.0, 'wilson': {'lo': 0.3784, 'hi': 1.0}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 1, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 1, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.6216}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 1, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'})),
        2,
    ),
    QaCase(
        "pattern-near-tie",
        _pattern_near_tie_recipe,
        QaExpectation(analyzer_rows=ExpectedAnalyzerRows(row_keys=(('basal', '03:00'),), default=None, overrides={('basal', '03:00'): ExpectedBasalRow(safety_status='lower', direction='lower', asserts_move=True, omitted=frozenset())}), support={('basal', '03:00'): ExpectedSupport(directional_support_count=12, n_steps=None, n_runs=None, effective_run_count=None)}, queue_rows={('whole_day', ('basal', '03:00')): ExpectedQueueRow(register='assert', direction='lower', asserts_move=None, headline='One cautious step down is supported at this time. Delivered 0.48 U/h across 12 steady nights against 0.60 programmed.')}, queue_absences=frozenset(), rest_windows=frozenset({('2024-05-31', '2024-05-31 22:00:00', '2024-06-01 08:00:00'), ('2024-05-21', '2024-05-21 22:00:00', '2024-05-22 08:00:00'), ('2024-06-02', '2024-06-02 22:00:00', '2024-06-03 08:00:00'), ('2024-05-18', '2024-05-18 22:00:00', '2024-05-19 08:00:00'), ('2024-05-19', '2024-05-19 22:00:00', '2024-05-20 08:00:00'), ('2024-06-05', '2024-06-05 22:00:00', '2024-06-06 08:00:00'), ('2024-05-26', '2024-05-26 22:00:00', '2024-05-27 08:00:00'), ('2024-05-30', '2024-05-30 22:00:00', '2024-05-31 08:00:00'), ('2024-05-11', '2024-05-11 22:00:00', '2024-05-12 08:00:00'), ('2024-06-03', '2024-06-03 22:00:00', '2024-06-04 08:00:00'), ('2024-05-12', '2024-05-12 22:00:00', '2024-05-13 08:00:00'), ('2024-05-10', '2024-05-10 22:00:00', '2024-05-11 08:00:00'), ('2024-05-27', '2024-05-27 22:00:00', '2024-05-28 08:00:00'), ('2024-05-16', '2024-05-16 22:00:00', '2024-05-17 08:00:00'), ('2024-05-24', '2024-05-24 22:00:00', '2024-05-25 08:00:00'), ('2024-05-28', '2024-05-28 22:00:00', '2024-05-29 08:00:00'), ('2024-05-25', '2024-05-25 22:00:00', '2024-05-26 08:00:00'), ('2024-05-20', '2024-05-20 22:00:00', '2024-05-21 08:00:00'), ('2024-06-04', '2024-06-04 22:00:00', '2024-06-05 08:00:00'), ('2024-06-01', '2024-06-01 22:00:00', '2024-06-02 08:00:00'), ('2024-05-22', '2024-05-22 22:00:00', '2024-05-23 08:00:00'), ('2024-05-13', '2024-05-13 22:00:00', '2024-05-14 08:00:00'), ('2024-05-17', '2024-05-17 22:00:00', '2024-05-18 08:00:00'), ('2024-05-14', '2024-05-14 22:00:00', '2024-05-15 08:00:00'), ('2024-06-07', '2024-06-07 22:00:00', '2024-06-08 08:00:00'), ('2024-05-15', '2024-05-15 22:00:00', '2024-05-16 08:00:00'), ('2024-05-23', '2024-05-23 22:00:00', '2024-05-24 08:00:00'), ('2024-06-06', '2024-06-06 22:00:00', '2024-06-07 08:00:00'), ('2024-05-29', '2024-05-29 22:00:00', '2024-05-30 08:00:00')}), behavioral_rows=frozenset({('correction_clusters', '2024-05-12 00:00:00', 'clean'), ('correction_clusters', '2024-05-13 00:30:00', 'clean'), ('correction_clusters', '2024-05-14 01:00:00', 'clean'), ('correction_clusters', '2024-05-15 01:30:00', 'clean'), ('correction_clusters', '2024-05-16 02:00:00', 'clean'), ('correction_clusters', '2024-05-17 02:30:00', 'clean'), ('correction_clusters', '2024-05-18 23:30:00', 'clean'), ('correction_clusters', '2024-05-20 00:00:00', 'clean'), ('correction_clusters', '2024-05-21 00:30:00', 'clean'), ('correction_clusters', '2024-05-22 01:00:00', 'clean'), ('correction_clusters', '2024-05-23 01:30:00', 'clean'), ('correction_clusters', '2024-05-24 02:00:00', 'clean'), ('correction_clusters', '2024-05-24 20:00:00', 'clean'), ('correction_clusters', '2024-05-25 02:30:00', 'clean'), ('correction_clusters', '2024-05-25 20:00:00', 'clean'), ('correction_clusters', '2024-05-26 23:30:00', 'clean'), ('correction_clusters', '2024-05-27 20:00:00', 'clean'), ('correction_clusters', '2024-05-28 00:00:00', 'clean'), ('correction_clusters', '2024-05-29 00:30:00', 'clean'), ('correction_clusters', '2024-05-30 01:00:00', 'clean'), ('correction_clusters', '2024-05-31 01:30:00', 'clean'), ('correction_clusters', '2024-06-01 02:00:00', 'clean'), ('correction_clusters', '2024-06-02 02:30:00', 'clean'), ('correction_clusters', '2024-06-03 23:30:00', 'clean'), ('correction_clusters', '2024-06-05 00:00:00', 'clean'), ('correction_clusters', '2024-06-06 00:30:00', 'clean'), ('correction_clusters', '2024-06-07 01:00:00', 'clean'), ('correction_clusters', '2024-06-08 01:30:00', 'clean'), ('highs', '2024-05-26 14:35:00', 'near_miss'), ('lows', '2024-05-24 22:00:00', 'outranked'), ('lows', '2024-05-25 07:10:00', 'clean'), ('lows', '2024-05-25 22:00:00', 'outranked'), ('lows', '2024-05-26 13:55:00', 'fired'), ('lows', '2024-05-27 22:00:00', 'near_miss'), ('lows', '2024-05-28 16:10:00', 'clean'), ('lows', '2024-06-02 06:00:00', 'no_data'), ('meals', '2024-05-24 19:00:00', 'fired'), ('meals', '2024-05-25 19:00:00', 'fired'), ('meals', '2024-05-27 19:00:00', 'fired')}), finding_titles=frozenset({'Basal 03:00 · lower', 'Carb undercount', 'Highs after meals', 'Lows after correcting highs', 'Lows after meals', 'Over-treated low', 'meals-start-high'}), outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'habit:carb_undercount', 'kind': 'habit', 'k': 3, 'price': 72, 'admitted': True, 'producer': 'scenario', 'lo': 0.6462, 'hi': 1.0, 'seriousness': 'high', 'action': 'habit:carb_undercount', 'admission_basis': 'lower_bound'}, {'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 3, 'k': 3, 'rate': 1.0, 'wilson': {'lo': 0.6462, 'hi': 1.0}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 3, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 72, 'admission_route': 'habit_threshold', 'collapse': 'remain_pattern', 'action': 'habit:carb_undercount', 'seriousness': 'high', 'member_set_fingerprint': '3dbae730bfb75717'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 3, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.3538}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 3, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [{'subject': 'habit:over_treated_low', 'kind': 'habit', 'k': 1, 'price': 13, 'admitted': True, 'producer': 'scenario', 'lo': 0.0438, 'hi': 0.3777, 'seriousness': 'info', 'action': 'habit:over_treated_low', 'admission_basis': 'low_confidence'}], 'rate_levers': ['habit:over_treated_low'], 'n': 7, 'k': 1, 'rate': 0.1429, 'wilson': {'lo': 0.0438, 'hi': 0.3777}, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 7, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 13, 'admission_route': 'habit_threshold', 'collapse': 'collapse_to_member', 'action': 'habit:over_treated_low', 'seriousness': 'info', 'member_set_fingerprint': 'a0de7500243ef646'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 7, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.19}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 7, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}), verdict_tallies={('carb_undercount', 'meals'): _verdict_tally(3, fired=3, outranked=0, near_miss=0, no_data=0, clean=0), ('over_treated_low', 'lows'): _verdict_tally(7, fired=1, outranked=0, near_miss=0, no_data=1, clean=5)}, uncaused_highs=0),
        39,
    ),
    QaCase(
        "pattern-collapse",
        _pattern_collapse_recipe,
        QaExpectation(analyzer_rows=ExpectedAnalyzerRows(row_keys=(), default=None, overrides={}), support={}, queue_rows={}, queue_absences=frozenset(), rest_windows=frozenset({('2024-05-21', '2024-05-21 22:00:00', '2024-05-22 08:00:00'), ('2024-05-18', '2024-05-18 22:00:00', '2024-05-19 08:00:00'), ('2024-05-19', '2024-05-19 22:00:00', '2024-05-20 08:00:00'), ('2024-05-08', '2024-05-08 22:00:00', '2024-05-09 08:00:00'), ('2024-05-26', '2024-05-26 22:00:00', '2024-05-27 08:00:00'), ('2024-05-11', '2024-05-11 22:00:00', '2024-05-12 08:00:00'), ('2024-05-02', '2024-05-02 22:00:00', '2024-05-03 08:00:00'), ('2024-05-12', '2024-05-12 22:00:00', '2024-05-13 08:00:00'), ('2024-05-10', '2024-05-10 22:00:00', '2024-05-11 08:00:00'), ('2024-05-27', '2024-05-27 22:00:00', '2024-05-28 08:00:00'), ('2024-05-16', '2024-05-16 22:00:00', '2024-05-17 08:00:00'), ('2024-05-24', '2024-05-24 22:00:00', '2024-05-25 08:00:00'), ('2024-05-28', '2024-05-28 22:00:00', '2024-05-29 08:00:00'), ('2024-05-05', '2024-05-05 22:00:00', '2024-05-06 08:00:00'), ('2024-05-25', '2024-05-25 22:00:00', '2024-05-26 08:00:00'), ('2024-05-20', '2024-05-20 22:00:00', '2024-05-21 08:00:00'), ('2024-05-09', '2024-05-09 22:00:00', '2024-05-10 08:00:00'), ('2024-05-06', '2024-05-06 22:00:00', '2024-05-07 08:00:00'), ('2024-05-22', '2024-05-22 22:00:00', '2024-05-23 08:00:00'), ('2024-05-13', '2024-05-13 22:00:00', '2024-05-14 08:00:00'), ('2024-05-17', '2024-05-17 22:00:00', '2024-05-18 08:00:00'), ('2024-05-14', '2024-05-14 22:00:00', '2024-05-15 08:00:00'), ('2024-05-03', '2024-05-03 22:00:00', '2024-05-04 08:00:00'), ('2024-05-07', '2024-05-07 22:00:00', '2024-05-08 08:00:00'), ('2024-05-01', '2024-05-01 22:00:00', '2024-05-02 08:00:00'), ('2024-05-15', '2024-05-15 22:00:00', '2024-05-16 08:00:00'), ('2024-05-04', '2024-05-04 22:00:00', '2024-05-05 08:00:00'), ('2024-05-23', '2024-05-23 22:00:00', '2024-05-24 08:00:00'), ('2024-05-29', '2024-05-29 22:00:00', '2024-05-30 08:00:00')}), behavioral_rows=frozenset({('highs', '2024-05-23 14:35:00', 'near_miss'), ('highs', '2024-05-24 14:35:00', 'near_miss'), ('lows', '2024-05-23 13:55:00', 'fired'), ('lows', '2024-05-24 13:55:00', 'fired'), ('lows', '2024-05-25 12:10:00', 'near_miss'), ('lows', '2024-05-26 12:10:00', 'clean'), ('lows', '2024-05-27 16:10:00', 'no_data'), ('lows', '2024-05-28 22:00:00', 'fired'), ('meals', '2024-05-28 19:00:00', 'no_data')}), finding_titles=frozenset({'Correction on active insulin', 'Highs after meals', 'Lows after correcting highs', 'Lows after meals', 'Over-treated low', 'meals-start-high'}), outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 1, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.6216}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 1, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 1, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.6216}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 1, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [{'subject': 'habit:over_treated_low', 'kind': 'habit', 'k': 2, 'price': 28, 'admitted': True, 'producer': 'scenario', 'lo': 0.1477, 'hi': 0.5906, 'seriousness': 'low', 'action': 'habit:over_treated_low', 'admission_basis': 'lower_bound'}], 'rate_levers': ['habit:over_treated_low'], 'n': 6, 'k': 2, 'rate': 0.3333, 'wilson': {'lo': 0.1477, 'hi': 0.5906}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 6, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 28, 'admission_route': 'habit_threshold', 'collapse': 'collapse_to_member', 'action': 'habit:over_treated_low', 'seriousness': 'low', 'member_set_fingerprint': 'a0de7500243ef646'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 6, 'k': 1, 'rate': 0.1667, 'wilson': {'lo': 0.0513, 'hi': 0.4253}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 6, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}), verdict_tallies={('over_treated_low', 'lows'): ExpectedVerdictTally(denominator=6, counts={'fired': 2, 'outranked': 1, 'near_miss': 1, 'no_data': 1, 'clean': 1}), ('correction_on_iob', 'lows'): ExpectedVerdictTally(denominator=6, counts={'fired': 1, 'outranked': 2, 'near_miss': 0, 'no_data': 0, 'clean': 3})}, uncaused_highs=0),
        30,
    ),
    QaCase(
        "pattern-correction-fold",
        _pattern_correction_fold_recipe,
        QaExpectation(analyzer_rows=ExpectedAnalyzerRows(row_keys=(), default=None, overrides={}), support={}, queue_rows={}, queue_absences=frozenset(), rest_windows=frozenset({('2024-05-01', '2024-05-01 22:00:00', '2024-05-02 08:00:00'), ('2024-05-02', '2024-05-02 22:00:00', '2024-05-03 08:00:00'), ('2024-05-03', '2024-05-03 22:00:00', '2024-05-04 08:00:00'), ('2024-05-04', '2024-05-04 22:00:00', '2024-05-05 08:00:00'), ('2024-05-05', '2024-05-05 22:00:00', '2024-05-06 08:00:00'), ('2024-05-06', '2024-05-06 22:00:00', '2024-05-07 08:00:00'), ('2024-05-07', '2024-05-07 22:00:00', '2024-05-08 08:00:00'), ('2024-05-08', '2024-05-08 22:00:00', '2024-05-09 08:00:00'), ('2024-05-09', '2024-05-09 22:00:00', '2024-05-10 08:00:00'), ('2024-05-10', '2024-05-10 22:00:00', '2024-05-11 08:00:00'), ('2024-05-11', '2024-05-11 22:00:00', '2024-05-12 08:00:00'), ('2024-05-12', '2024-05-12 22:00:00', '2024-05-13 08:00:00'), ('2024-05-13', '2024-05-13 22:00:00', '2024-05-14 08:00:00'), ('2024-05-14', '2024-05-14 22:00:00', '2024-05-15 08:00:00'), ('2024-05-15', '2024-05-15 22:00:00', '2024-05-16 08:00:00'), ('2024-05-16', '2024-05-16 22:00:00', '2024-05-17 08:00:00'), ('2024-05-17', '2024-05-17 22:00:00', '2024-05-18 08:00:00'), ('2024-05-18', '2024-05-18 22:00:00', '2024-05-19 08:00:00'), ('2024-05-19', '2024-05-19 22:00:00', '2024-05-20 08:00:00'), ('2024-05-20', '2024-05-20 22:00:00', '2024-05-21 08:00:00'), ('2024-05-21', '2024-05-21 22:00:00', '2024-05-22 08:00:00'), ('2024-05-22', '2024-05-22 22:00:00', '2024-05-23 08:00:00'), ('2024-05-23', '2024-05-23 22:00:00', '2024-05-24 08:00:00'), ('2024-05-24', '2024-05-24 22:00:00', '2024-05-25 08:00:00'), ('2024-05-25', '2024-05-25 22:00:00', '2024-05-26 08:00:00'), ('2024-05-26', '2024-05-26 22:00:00', '2024-05-27 08:00:00'), ('2024-05-27', '2024-05-27 22:00:00', '2024-05-28 08:00:00'), ('2024-05-28', '2024-05-28 22:00:00', '2024-05-29 08:00:00'), ('2024-05-29', '2024-05-29 22:00:00', '2024-05-30 08:00:00')}), behavioral_rows=frozenset({('correction_clusters', '2024-05-15 20:00:00', 'clean'), ('correction_clusters', '2024-05-17 20:00:00', 'clean'), ('correction_clusters', '2024-05-24 14:10:00', 'clean'), ('correction_clusters', '2024-05-24 14:40:00', 'fired'), ('correction_clusters', '2024-05-25 14:10:00', 'clean'), ('correction_clusters', '2024-05-25 14:40:00', 'fired'), ('correction_clusters', '2024-05-26 10:10:00', 'clean'), ('correction_clusters', '2024-05-26 10:40:00', 'near_miss'), ('correction_clusters', '2024-05-27 15:30:00', 'clean'), ('correction_clusters', '2024-05-27 16:10:00', 'clean'), ('highs', '2024-05-16 14:35:00', 'near_miss'), ('highs', '2024-05-27 17:00:00', 'fired'), ('lows', '2024-05-14 22:00:00', 'fired'), ('lows', '2024-05-15 22:00:00', 'fired'), ('lows', '2024-05-16 13:55:00', 'fired'), ('lows', '2024-05-17 22:00:00', 'near_miss'), ('lows', '2024-05-18 16:10:00', 'clean'), ('lows', '2024-05-24 16:05:00', 'no_data'), ('lows', '2024-05-25 16:05:00', 'no_data'), ('meals', '2024-05-14 19:00:00', 'no_data'), ('meals', '2024-05-15 19:00:00', 'no_data'), ('meals', '2024-05-17 19:00:00', 'near_miss')}), finding_titles=frozenset({'Correction on active insulin', 'Correction stacking', 'Highs after meals', 'Lows after correcting highs', 'Lows after meals', 'Missed / unannounced meal', 'Over-treated low', 'meals-start-high'}), outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 3, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.3538}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 3, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 3, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.3538}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 3, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [{'subject': 'habit:over_treated_low', 'kind': 'habit', 'k': 1, 'price': 13, 'admitted': True, 'producer': 'scenario', 'lo': 0.0438, 'hi': 0.3777, 'seriousness': 'info', 'action': 'habit:over_treated_low', 'admission_basis': 'low_confidence'}], 'rate_levers': ['habit:over_treated_low'], 'n': 7, 'k': 1, 'rate': 0.1429, 'wilson': {'lo': 0.0438, 'hi': 0.3777}, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 7, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 13, 'admission_route': 'habit_threshold', 'collapse': 'collapse_to_member', 'action': 'habit:over_treated_low', 'seriousness': 'info', 'member_set_fingerprint': 'a0de7500243ef646'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [{'subject': 'habit:correction_stacking', 'kind': 'habit', 'k': 2, 'price': 14, 'admitted': True, 'producer': 'scenario', 'lo': 0.0862, 'hi': 0.3984, 'seriousness': 'info', 'action': 'habit:correction_stacking', 'admission_basis': 'low_confidence'}, {'subject': 'habit:correction_on_iob', 'kind': 'habit', 'k': 2, 'price': 29, 'admitted': True, 'producer': 'scenario', 'lo': 0.1253, 'hi': 0.5275, 'seriousness': 'low', 'action': 'habit:correction_on_iob', 'admission_basis': 'lower_bound'}], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 7, 'k': 4, 'rate': 0.5714, 'wilson': {'lo': 0.3417, 'hi': 0.774}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 7, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 29, 'admission_route': 'habit_threshold', 'collapse': 'remain_pattern', 'action': 'habit:correction_on_iob', 'seriousness': 'low', 'member_set_fingerprint': '162200fbb393e175'}), verdict_tallies={('correction_on_iob', 'lows'): _verdict_tally(7, fired=2, outranked=1, near_miss=1, no_data=0, clean=3), ('correction_stacking', 'correction_clusters'): _verdict_tally(10, fired=2, outranked=0, near_miss=1, no_data=6, clean=1), ('missed_meal', 'highs'): _verdict_tally(2, fired=1, outranked=0, near_miss=1, no_data=0, clean=0), ('over_treated_low', 'lows'): _verdict_tally(7, fired=1, outranked=2, near_miss=0, no_data=2, clean=2)}, uncaused_highs=0),
        30,
    ),
    QaCase(
        'pattern-correction-collapse',
        _pattern_correction_collapse_recipe,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, frozenset({('correction_clusters', '2024-05-14 14:40:00', 'fired'), ('correction_clusters', '2024-05-24 20:00:00', 'clean'), ('correction_clusters', '2024-05-25 20:00:00', 'clean'), ('correction_clusters', '2024-05-27 20:00:00', 'clean'), ('highs', '2024-05-26 14:35:00', 'near_miss'), ('lows', '2024-05-14 16:05:00', 'no_data'), ('lows', '2024-05-24 22:00:00', 'fired'), ('lows', '2024-05-25 22:00:00', 'fired'), ('lows', '2024-05-26 13:55:00', 'fired'), ('lows', '2024-05-27 22:00:00', 'near_miss'), ('lows', '2024-05-28 16:10:00', 'clean'), ('meals', '2024-05-24 19:00:00', 'no_data'), ('meals', '2024-05-25 19:00:00', 'no_data'), ('meals', '2024-05-27 19:00:00', 'near_miss')}), frozenset({'Over-treated low', 'Correction stacking', 'meals-start-high', 'Correction on active insulin', 'Highs after meals', 'Lows after meals'}),
            {('correction_on_iob', 'lows'): _verdict_tally(6, fired=2, outranked=1, near_miss=1, no_data=0, clean=2), ('correction_stacking', 'correction_clusters'): _verdict_tally(4, fired=1, outranked=0, near_miss=0, no_data=3, clean=0), ('over_treated_low', 'lows'): _verdict_tally(6, fired=1, outranked=2, near_miss=0, no_data=1, clean=2)},
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 3, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.3538}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 3, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 3, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.3538}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 3, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [{'subject': 'habit:over_treated_low', 'kind': 'habit', 'k': 1, 'price': 14, 'admitted': True, 'producer': 'scenario', 'lo': 0.0513, 'hi': 0.4253, 'seriousness': 'info', 'action': 'habit:over_treated_low', 'admission_basis': 'low_confidence'}], 'rate_levers': ['habit:over_treated_low'], 'n': 6, 'k': 1, 'rate': 0.1667, 'wilson': {'lo': 0.0513, 'hi': 0.4253}, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 6, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 14, 'admission_route': 'habit_threshold', 'collapse': 'collapse_to_member', 'action': 'habit:over_treated_low', 'seriousness': 'info', 'member_set_fingerprint': 'a0de7500243ef646'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [{'subject': 'habit:correction_on_iob', 'kind': 'habit', 'k': 2, 'price': 32, 'admitted': True, 'producer': 'scenario', 'lo': 0.1477, 'hi': 0.5906, 'seriousness': 'low', 'action': 'habit:correction_on_iob', 'admission_basis': 'lower_bound'}], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 6, 'k': 3, 'rate': 0.5, 'wilson': {'lo': 0.2682, 'hi': 0.7318}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 6, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 32, 'admission_route': 'habit_threshold', 'collapse': 'collapse_to_member', 'action': 'habit:correction_on_iob', 'seriousness': 'low', 'member_set_fingerprint': 'a125e00c457f148f'})),
        30,
    ),

)


def materialize_case(store, case: QaCase) -> None:
    """Write exactly one case's manufactured input rows into ``store``."""
    case.recipe(store)
    _respond_fasting_lane(store)


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
    outcome_patterns = tuple(build_outcome_patterns(analysis, exposures, scenarios))
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
    return QaExecution(analysis, exposures, scenarios, findings, outcome_patterns)


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
    if not case.expectation.outcome_patterns:
        raise AssertionError(f"{case.name}: missing literal outcome_patterns expectation")
    if execution.outcome_patterns != case.expectation.outcome_patterns:
        raise AssertionError(f"{case.name}: outcome_patterns differ")
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
    assert (execution.exposures["exposures"]["highs"]["uncaused"]
            == case.expectation.uncaused_highs)


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


def _materialize_showcase_month_shoulder(store) -> None:
    """Five recorded days in the PREVIOUS calendar month, and nothing else.

    #389 needs the showcase's recorded range to cross a month bound, because the
    v2 Day desk's month stepper is only exercisable when one side of it is live
    and the other is at a bound (HV2-13). The showcase's own 30 days are June
    2024 exactly, so both steppers sit at a bound and the control cannot be
    pressed at all.

    These days carry CGM ONLY — no basal, no bolus, no settings snapshot — and
    they stop on May 24, leaving May 25-31 empty. That gap is the point: the
    analysis window reaches back 30 days from the latest instant (June 30), so
    it stops in the empty stretch and every existing analyzer row, support count
    and queue string is untouched. They are recorded days for the navigator and
    invisible to the model.
    """
    cgm = []
    first = date(2024, 5, 20)
    for offset in range(5):
        current = first + timedelta(days=offset)
        for minute in range(0, 24 * 60, 5):
            cgm.append({
                "EventDateTime": f"{current.isoformat()} {minute // 60:02d}:{minute % 60:02d}:00",
                "Readings (CGM / BGM)": 120.0,
                "Description": "Synthetic EGV",
            })
    store.upsert_cgm(cgm)


def _materialize_showcase_background(store) -> None:
    first = date(2024, 6, 1)
    cgm, basal, bolus = [], [], []
    for offset in range(30):
        current = first + timedelta(days=offset)
        for minute in range(0, 24 * 60, 5):
            stamp = f"{current.isoformat()} {minute // 60:02d}:{minute % 60:02d}:00"
            cgm.append({
                "EventDateTime": stamp,
                "Readings (CGM / BGM)": _LANE_BASELINE,
                "Description": _LANE_EGV,
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
    _materialize_automatic_corrections(store, first=first, days=30)
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

# #389 c3: lifecycle recipes compose manufactured source rows through the same
# Store and comparison owners as ingestion. No browser fixture invents a verdict.
def _c3_pin(store, *, pattern='highs_after_meals', lever='late_bolus', at='2024-05-05 00:00:00'):
    from ciq_autotune.follow_up_comparison import capture_comparison_context
    with store.follow_up_transaction():
        focus = store.pin_focus(lever, at, pattern_key=pattern)
        return store.save_follow_up_record({
            'kind': 'focus', 'version': '386:1', **focus,
            'comparison_context': capture_comparison_context(store,
                at=datetime.fromisoformat(at), input_revision=store.input_data_revision()),
        })


def _c3_switch(store, at, parameter, value):
    from dataclasses import replace
    settings = store.settings_snapshots()[-1].settings
    profile = settings.active()
    # The switch changes only 03:00–03:30. A retained Trial's inspection must
    # keep these coordinates even when another concern leads today's Findings.
    segments = tuple(replace(profile.segments[0], start_min=start,
        **({parameter: value} if start == 180 else {})) for start in (0, 180, 210))
    profile = replace(profile, idp=max(p.idp for p in settings.profiles) + 1, segments=segments)
    store.upsert_settings_snapshot(at, replace(settings, active_idp=profile.idp,
        profiles=(*settings.profiles, profile)))


def _materialize_c3_focus(store):
    from ciq_autotune.watched_change import reconcile_ingested_follow_up
    _materialize_pattern_focus_meals(store)
    _respond_fasting_lane(store)
    _c3_pin(store)
    reconcile_ingested_follow_up(store)


def _materialize_c3_trial(store, *, finished=False, preempted=False):
    from ciq_autotune.watched_change import reconcile_follow_up, reconcile_ingested_follow_up, capture_ending
    _materialize_behavioral_background(store, span_days=30)
    _materialize_basal_coverage(store, clean_rate=0.48)
    # A stronger current concern in a different slot makes S36's original-slot
    # proof independent of today's first-ranked concern.
    store.upsert_basal([{'seq_num': 490_000 + day, 'time': str(datetime(2024, 5, 1, 1) + timedelta(days=day)),
        'delivery_type': 'algorithmDelivery', 'duration_mins': 30, 'basal_rate': 0.36,
        'profile_basal_rate': 0.6} for day in range(30)])
    _respond_fasting_lane(store)
    if preempted:
        manual = _c3_pin(store, at='2024-05-03 00:00:00')
        with store.follow_up_transaction():
            capture_ending(store, manual, kind='manual', effective_at=datetime(2024, 5, 4),
                recorded_at=datetime(2024, 5, 4), data_cutoff=datetime(2024, 5, 4), conclusion='Synthetic manual ending.')
        _c3_pin(store, pattern=None, lever='overnight_drift', at='2024-05-05 00:00:00')
        with store.follow_up_transaction():
            reconcile_follow_up(store, now=datetime(2024, 5, 5, 1), recorded_at=datetime(2024, 5, 5, 1))
        _c3_pin(store, at='2024-05-14 00:00:00')
    _c3_switch(store, '2024-05-15 00:00:00', 'basal_rate', 0.54)
    with store.follow_up_transaction():
        reconcile_follow_up(store, now=datetime(2024, 5, 15), recorded_at=datetime(2024, 5, 15))
    reconcile_ingested_follow_up(store)
    if finished:
        with store.follow_up_transaction():
            identity = store.follow_up_frontier()['trial_id']
            capture_ending(store, store.follow_up_record('trial', identity), kind='user_finished',
                effective_at=datetime(2024, 5, 18), recorded_at=datetime(2024, 5, 18),
                data_cutoff=datetime(2024, 5, 18), conclusion='Synthetic observation: no clear answer.')
        _c3_switch(store, '2024-05-20 00:00:00', 'basal_rate', 0.5)
        reconcile_ingested_follow_up(store)


# The knobs a release before #503 and #553 had that the configuration has since
# retired, at their last defaults: #503's seven meal-bolus-short knobs and #553's
# 75 mg/dL near-low anchor line. Every Trial and Focus such a release retained
# carries them in its saved scenario configuration (#554).
_EARLIER_KNOBS = {
    'meal_bolus_short_rise_slope_mgdl_min': 1.0, 'meal_bolus_short_slope_lookback_min': 20,
    'meal_bolus_short_digestion_lookback_min': 150, 'meal_bolus_short_min_carbs': 10.0,
    'meal_bolus_short_correction_horizon_min': 180.0, 'meal_bolus_short_correction_floor_u': 1.0,
    'meal_bolus_short_dose_split_grace_min': 30.0, 'anchor_near_low_mgdl': 75.0,
}
# The knob #553 added since: such a release's configuration has none.
_LATER_KNOBS = ('preempted_printed_low_mgdl',)


def _materialize_c3_ic_trial(store):
    """A carb ratio Trial six days in (#554): a lunch every day of the month, the
    11:00–14:00 carb ratio strengthened on 25 May, and the Trial retained by a
    release before #503 and #553, its saved configuration that release's: the
    knobs it had, and none it lacked."""
    from dataclasses import replace
    from unittest.mock import patch
    import ciq_autotune.follow_up_comparison as comparison
    from ciq_autotune.watched_change import reconcile_follow_up, reconcile_ingested_follow_up
    first = _materialize_behavioral_background(store, span_days=30)
    store.upsert_bolus([{
        'seq_num': 395_000 + day,
        'request_time': str(datetime.combine(first, datetime.min.time()) + timedelta(days=day, hours=12)),
        'description': 'Synthetic meal bolus', 'completion': 'Completed',
        'insulin': 8.0, 'requested_insulin': 8.0, 'carbs': 40.0,
        'carb_ratio': 5.0, 'isf': 40.0, 'target_bg': 110.0,
    } for day in range(30)])
    # The lane answers its insulin before the reconcile, as c3-trial's does, so
    # the frontier is current when the case is read.
    _respond_fasting_lane(store)
    settings = store.settings_snapshots()[-1].settings
    profile = settings.active()
    segments = tuple(replace(profile.segments[0], start_min=start, **({'carb_ratio': 4.4} if start == 660 else {}))
                     for start in (0, 660, 840))
    store.upsert_settings_snapshot('2024-05-25 00:00:00', replace(settings, profiles=(
        replace(profile, segments=segments),)))
    current = comparison._execution

    def earlier_release():
        execution = current()
        knobs = {name: value for name, value in execution['configuration'].items() if name not in _LATER_KNOBS}
        return {**execution, 'configuration': {**knobs, **_EARLIER_KNOBS}}

    # A retained context is written once, so the Trial is retained as that
    # release retained it.
    with patch.object(comparison, '_execution', earlier_release), store.follow_up_transaction():
        reconcile_follow_up(store, now=datetime(2024, 5, 25), recorded_at=datetime(2024, 5, 25))
    reconcile_ingested_follow_up(store)


def _materialize_c3_pin(store):
    _materialize_behavioral_background(store, span_days=30)
    # Twelve independent manufactured lows with rebound, one per date. The
    # exposure producer and Pattern owner decide count, membership and admission.
    cgm = []
    values = (100.,) * 5 + (87., 74., 61., 48.) + tuple(48. + 26.5 * i for i in range(1, 9))
    for offset in range(15, 27):
        start = datetime(2024, 5, 1, 13, 15) + timedelta(days=offset)
        cgm.extend({'EventDateTime': str(start + timedelta(minutes=5 * i)),
            'Readings (CGM / BGM)': value, 'Description': 'Synthetic EGV'}
            for i, value in enumerate(values))
    store.upsert_cgm(cgm)


# Literal public-producer expectations captured for the c3 lifecycle recipes.
QA_CASES += (
    QaCase('c3-focus', _materialize_c3_focus,
        QaExpectation(analyzer_rows={},
                      support={},
                      queue_rows={},
                      queue_absences=frozenset(),
                      rest_windows=frozenset({('2024-05-01', '2024-05-01 22:00:00', '2024-05-02 06:00:00'),
                                              ('2024-05-02', '2024-05-02 22:00:00', '2024-05-03 06:00:00'),
                                              ('2024-05-03', '2024-05-03 22:00:00', '2024-05-04 06:00:00'),
                                              ('2024-05-04', '2024-05-04 22:00:00', '2024-05-05 06:00:00'),
                                              ('2024-05-05', '2024-05-05 22:00:00', '2024-05-06 06:00:00'),
                                              ('2024-05-06', '2024-05-06 22:00:00', '2024-05-07 06:00:00'),
                                              ('2024-05-07', '2024-05-07 22:00:00', '2024-05-08 06:00:00')}),
                      behavioral_rows=frozenset({('meals', '2024-05-01 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-01 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-01 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-02 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-02 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-02 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-03 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-03 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-03 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-04 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-04 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-04 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-05 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-05 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-05 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-06 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-06 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-06 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-07 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-07 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-07 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-08 06:00:00', 'no_data'),
                                                 ('meals', '2024-05-08 12:00:00', 'no_data'),
                                                 ('meals', '2024-05-08 18:00:00', 'no_data')}),
                      finding_titles=frozenset({'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals',
                                                'meals-start-high'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 24,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.0641},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 24, 'gate': 12, 'verdict': 'ready'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 24,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.0641},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 24, 'gate': 12, 'verdict': 'ready'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0), 8),
    QaCase('c3-trial', _materialize_c3_trial,
        QaExpectation(analyzer_rows={('basal', '01:00'): ExpectedBasalRow(safety_status='capped (lower)',
                                                                          direction='lower',
                                                                          asserts_move=True,
                                                                          omitted=frozenset()),
                                     ('basal', '03:00'): ExpectedBasalRow(safety_status='lower',
                                                                          direction='lower',
                                                                          asserts_move=True,
                                                                          omitted=frozenset())},
                      support={('basal', '01:00'): ExpectedSupport(directional_support_count=28,
                                                                   n_steps=None,
                                                                   n_runs=None,
                                                                   effective_run_count=None),
                               ('basal', '03:00'): ExpectedSupport(directional_support_count=30,
                                                                   n_steps=None,
                                                                   n_runs=None,
                                                                   effective_run_count=None)},
                      queue_rows={('whole_day', ('basal', '01:00')): ExpectedQueueRow(register='assert',
                                                                                      direction='lower',
                                                                                      asserts_move=None,
                                                                                      headline='A step down, limited '
                                                                                               'to 20% below the set '
                                                                                               'rate. Delivered 0.36 '
                                                                                               'U/h across 28 steady '
                                                                                               'nights against 0.60 '
                                                                                               'programmed.'),
                                  ('whole_day', ('basal', '03:00')): ExpectedQueueRow(register='assert',
                                                                                      direction='lower',
                                                                                      asserts_move=None,
                                                                                      headline='One cautious step '
                                                                                               'down is supported at '
                                                                                               'this time. Delivered '
                                                                                               '0.48 U/h across 30 '
                                                                                               'steady nights '
                                                                                               'against 0.54 '
                                                                                               'programmed.')},
                      queue_absences=frozenset(),
                      rest_windows=frozenset({('2024-05-03', '2024-05-03 22:00:00', '2024-05-04 08:00:00'),
                                              ('2024-05-04', '2024-05-04 22:00:00', '2024-05-05 08:00:00'),
                                              ('2024-05-05', '2024-05-05 22:00:00', '2024-05-06 08:00:00'),
                                              ('2024-05-06', '2024-05-06 22:00:00', '2024-05-07 08:00:00'),
                                              ('2024-05-07', '2024-05-07 22:00:00', '2024-05-08 08:00:00'),
                                              ('2024-05-08', '2024-05-08 22:00:00', '2024-05-09 08:00:00'),
                                              ('2024-05-09', '2024-05-09 22:00:00', '2024-05-10 08:00:00'),
                                              ('2024-05-10', '2024-05-10 22:00:00', '2024-05-11 08:00:00'),
                                              ('2024-05-11', '2024-05-11 22:00:00', '2024-05-12 08:00:00'),
                                              ('2024-05-12', '2024-05-12 22:00:00', '2024-05-13 08:00:00'),
                                              ('2024-05-13', '2024-05-13 22:00:00', '2024-05-14 08:00:00'),
                                              ('2024-05-14', '2024-05-14 22:00:00', '2024-05-15 08:00:00'),
                                              ('2024-05-15', '2024-05-15 22:00:00', '2024-05-16 08:00:00'),
                                              ('2024-05-16', '2024-05-16 22:00:00', '2024-05-17 08:00:00'),
                                              ('2024-05-17', '2024-05-17 22:00:00', '2024-05-18 08:00:00'),
                                              ('2024-05-18', '2024-05-18 22:00:00', '2024-05-19 08:00:00'),
                                              ('2024-05-19', '2024-05-19 22:00:00', '2024-05-20 08:00:00'),
                                              ('2024-05-20', '2024-05-20 22:00:00', '2024-05-21 08:00:00'),
                                              ('2024-05-21', '2024-05-21 22:00:00', '2024-05-22 08:00:00'),
                                              ('2024-05-22', '2024-05-22 22:00:00', '2024-05-23 08:00:00'),
                                              ('2024-05-23', '2024-05-23 22:00:00', '2024-05-24 08:00:00'),
                                              ('2024-05-24', '2024-05-24 22:00:00', '2024-05-25 08:00:00'),
                                              ('2024-05-25', '2024-05-25 22:00:00', '2024-05-26 08:00:00'),
                                              ('2024-05-26', '2024-05-26 22:00:00', '2024-05-27 08:00:00'),
                                              ('2024-05-27', '2024-05-27 22:00:00', '2024-05-28 08:00:00'),
                                              ('2024-05-28', '2024-05-28 22:00:00', '2024-05-29 08:00:00'),
                                              ('2024-05-29', '2024-05-29 22:00:00', '2024-05-30 08:00:00')}),
                      behavioral_rows=frozenset(),
                      finding_titles=frozenset({'Basal 01:00 · lower',
                                                'Basal 03:00 · lower',
                                                'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0), 32),
    QaCase('c3-history', partial(_materialize_c3_trial, finished=True),
        QaExpectation(analyzer_rows={('basal', '01:00'): ExpectedBasalRow(safety_status='capped (lower)',
                                                                          direction='lower',
                                                                          asserts_move=True,
                                                                          omitted=frozenset())},
                      support={('basal', '01:00'): ExpectedSupport(directional_support_count=28,
                                                                   n_steps=None,
                                                                   n_runs=None,
                                                                   effective_run_count=None)},
                      queue_rows={('whole_day', ('basal', '01:00')): ExpectedQueueRow(register='assert',
                                                                                      direction='lower',
                                                                                      asserts_move=None,
                                                                                      headline='A step down, limited '
                                                                                               'to 20% below the set '
                                                                                               'rate. Delivered 0.36 '
                                                                                               'U/h across 28 steady '
                                                                                               'nights against 0.60 '
                                                                                               'programmed.')},
                      queue_absences=frozenset(),
                      rest_windows=frozenset({('2024-05-03', '2024-05-03 22:00:00', '2024-05-04 08:00:00'),
                                              ('2024-05-04', '2024-05-04 22:00:00', '2024-05-05 08:00:00'),
                                              ('2024-05-05', '2024-05-05 22:00:00', '2024-05-06 08:00:00'),
                                              ('2024-05-06', '2024-05-06 22:00:00', '2024-05-07 08:00:00'),
                                              ('2024-05-07', '2024-05-07 22:00:00', '2024-05-08 08:00:00'),
                                              ('2024-05-08', '2024-05-08 22:00:00', '2024-05-09 08:00:00'),
                                              ('2024-05-09', '2024-05-09 22:00:00', '2024-05-10 08:00:00'),
                                              ('2024-05-10', '2024-05-10 22:00:00', '2024-05-11 08:00:00'),
                                              ('2024-05-11', '2024-05-11 22:00:00', '2024-05-12 08:00:00'),
                                              ('2024-05-12', '2024-05-12 22:00:00', '2024-05-13 08:00:00'),
                                              ('2024-05-13', '2024-05-13 22:00:00', '2024-05-14 08:00:00'),
                                              ('2024-05-14', '2024-05-14 22:00:00', '2024-05-15 08:00:00'),
                                              ('2024-05-15', '2024-05-15 22:00:00', '2024-05-16 08:00:00'),
                                              ('2024-05-16', '2024-05-16 22:00:00', '2024-05-17 08:00:00'),
                                              ('2024-05-17', '2024-05-17 22:00:00', '2024-05-18 08:00:00'),
                                              ('2024-05-18', '2024-05-18 22:00:00', '2024-05-19 08:00:00'),
                                              ('2024-05-19', '2024-05-19 22:00:00', '2024-05-20 08:00:00'),
                                              ('2024-05-20', '2024-05-20 22:00:00', '2024-05-21 08:00:00'),
                                              ('2024-05-21', '2024-05-21 22:00:00', '2024-05-22 08:00:00'),
                                              ('2024-05-22', '2024-05-22 22:00:00', '2024-05-23 08:00:00'),
                                              ('2024-05-23', '2024-05-23 22:00:00', '2024-05-24 08:00:00'),
                                              ('2024-05-24', '2024-05-24 22:00:00', '2024-05-25 08:00:00'),
                                              ('2024-05-25', '2024-05-25 22:00:00', '2024-05-26 08:00:00'),
                                              ('2024-05-26', '2024-05-26 22:00:00', '2024-05-27 08:00:00'),
                                              ('2024-05-27', '2024-05-27 22:00:00', '2024-05-28 08:00:00'),
                                              ('2024-05-28', '2024-05-28 22:00:00', '2024-05-29 08:00:00'),
                                              ('2024-05-29', '2024-05-29 22:00:00', '2024-05-30 08:00:00')}),
                      behavioral_rows=frozenset(),
                      finding_titles=frozenset({'Basal 01:00 · lower',
                                                'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0), 32),
    QaCase('c3-preempted', partial(_materialize_c3_trial, preempted=True),
        QaExpectation(analyzer_rows={('basal', '01:00'): ExpectedBasalRow(safety_status='capped (lower)',
                                                                          direction='lower',
                                                                          asserts_move=True,
                                                                          omitted=frozenset()),
                                     ('basal', '03:00'): ExpectedBasalRow(safety_status='lower',
                                                                          direction='lower',
                                                                          asserts_move=True,
                                                                          omitted=frozenset())},
                      support={('basal', '01:00'): ExpectedSupport(directional_support_count=28,
                                                                   n_steps=None,
                                                                   n_runs=None,
                                                                   effective_run_count=None),
                               ('basal', '03:00'): ExpectedSupport(directional_support_count=30,
                                                                   n_steps=None,
                                                                   n_runs=None,
                                                                   effective_run_count=None)},
                      queue_rows={('whole_day', ('basal', '01:00')): ExpectedQueueRow(register='assert',
                                                                                      direction='lower',
                                                                                      asserts_move=None,
                                                                                      headline='A step down, limited '
                                                                                               'to 20% below the set '
                                                                                               'rate. Delivered 0.36 '
                                                                                               'U/h across 28 steady '
                                                                                               'nights against 0.60 '
                                                                                               'programmed.'),
                                  ('whole_day', ('basal', '03:00')): ExpectedQueueRow(register='assert',
                                                                                      direction='lower',
                                                                                      asserts_move=None,
                                                                                      headline='One cautious step '
                                                                                               'down is supported at '
                                                                                               'this time. Delivered '
                                                                                               '0.48 U/h across 30 '
                                                                                               'steady nights '
                                                                                               'against 0.54 '
                                                                                               'programmed.')},
                      queue_absences=frozenset(),
                      rest_windows=frozenset({('2024-05-03', '2024-05-03 22:00:00', '2024-05-04 08:00:00'),
                                              ('2024-05-04', '2024-05-04 22:00:00', '2024-05-05 08:00:00'),
                                              ('2024-05-05', '2024-05-05 22:00:00', '2024-05-06 08:00:00'),
                                              ('2024-05-06', '2024-05-06 22:00:00', '2024-05-07 08:00:00'),
                                              ('2024-05-07', '2024-05-07 22:00:00', '2024-05-08 08:00:00'),
                                              ('2024-05-08', '2024-05-08 22:00:00', '2024-05-09 08:00:00'),
                                              ('2024-05-09', '2024-05-09 22:00:00', '2024-05-10 08:00:00'),
                                              ('2024-05-10', '2024-05-10 22:00:00', '2024-05-11 08:00:00'),
                                              ('2024-05-11', '2024-05-11 22:00:00', '2024-05-12 08:00:00'),
                                              ('2024-05-12', '2024-05-12 22:00:00', '2024-05-13 08:00:00'),
                                              ('2024-05-13', '2024-05-13 22:00:00', '2024-05-14 08:00:00'),
                                              ('2024-05-14', '2024-05-14 22:00:00', '2024-05-15 08:00:00'),
                                              ('2024-05-15', '2024-05-15 22:00:00', '2024-05-16 08:00:00'),
                                              ('2024-05-16', '2024-05-16 22:00:00', '2024-05-17 08:00:00'),
                                              ('2024-05-17', '2024-05-17 22:00:00', '2024-05-18 08:00:00'),
                                              ('2024-05-18', '2024-05-18 22:00:00', '2024-05-19 08:00:00'),
                                              ('2024-05-19', '2024-05-19 22:00:00', '2024-05-20 08:00:00'),
                                              ('2024-05-20', '2024-05-20 22:00:00', '2024-05-21 08:00:00'),
                                              ('2024-05-21', '2024-05-21 22:00:00', '2024-05-22 08:00:00'),
                                              ('2024-05-22', '2024-05-22 22:00:00', '2024-05-23 08:00:00'),
                                              ('2024-05-23', '2024-05-23 22:00:00', '2024-05-24 08:00:00'),
                                              ('2024-05-24', '2024-05-24 22:00:00', '2024-05-25 08:00:00'),
                                              ('2024-05-25', '2024-05-25 22:00:00', '2024-05-26 08:00:00'),
                                              ('2024-05-26', '2024-05-26 22:00:00', '2024-05-27 08:00:00'),
                                              ('2024-05-27', '2024-05-27 22:00:00', '2024-05-28 08:00:00'),
                                              ('2024-05-28', '2024-05-28 22:00:00', '2024-05-29 08:00:00'),
                                              ('2024-05-29', '2024-05-29 22:00:00', '2024-05-30 08:00:00')}),
                      behavioral_rows=frozenset(),
                      finding_titles=frozenset({'Basal 01:00 · lower',
                                                'Basal 03:00 · lower',
                                                'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0), 32),
    QaCase('c3-pin', _materialize_c3_pin,
        QaExpectation(analyzer_rows={},
                      support={},
                      queue_rows={},
                      queue_absences=frozenset(),
                      rest_windows=frozenset({('2024-05-01', '2024-05-01 22:00:00', '2024-05-02 08:00:00'),
                                              ('2024-05-02', '2024-05-02 22:00:00', '2024-05-03 08:00:00'),
                                              ('2024-05-03', '2024-05-03 22:00:00', '2024-05-04 08:00:00'),
                                              ('2024-05-04', '2024-05-04 22:00:00', '2024-05-05 08:00:00'),
                                              ('2024-05-05', '2024-05-05 22:00:00', '2024-05-06 08:00:00'),
                                              ('2024-05-06', '2024-05-06 22:00:00', '2024-05-07 08:00:00'),
                                              ('2024-05-07', '2024-05-07 22:00:00', '2024-05-08 08:00:00'),
                                              ('2024-05-08', '2024-05-08 22:00:00', '2024-05-09 08:00:00'),
                                              ('2024-05-09', '2024-05-09 22:00:00', '2024-05-10 08:00:00'),
                                              ('2024-05-10', '2024-05-10 22:00:00', '2024-05-11 08:00:00'),
                                              ('2024-05-11', '2024-05-11 22:00:00', '2024-05-12 08:00:00'),
                                              ('2024-05-12', '2024-05-12 22:00:00', '2024-05-13 08:00:00'),
                                              ('2024-05-13', '2024-05-13 22:00:00', '2024-05-14 08:00:00'),
                                              ('2024-05-14', '2024-05-14 22:00:00', '2024-05-15 08:00:00'),
                                              ('2024-05-15', '2024-05-15 22:00:00', '2024-05-16 08:00:00'),
                                              ('2024-05-16', '2024-05-16 22:00:00', '2024-05-17 08:00:00'),
                                              ('2024-05-17', '2024-05-17 22:00:00', '2024-05-18 08:00:00'),
                                              ('2024-05-18', '2024-05-18 22:00:00', '2024-05-19 08:00:00'),
                                              ('2024-05-19', '2024-05-19 22:00:00', '2024-05-20 08:00:00'),
                                              ('2024-05-20', '2024-05-20 22:00:00', '2024-05-21 08:00:00'),
                                              ('2024-05-21', '2024-05-21 22:00:00', '2024-05-22 08:00:00'),
                                              ('2024-05-22', '2024-05-22 22:00:00', '2024-05-23 08:00:00'),
                                              ('2024-05-23', '2024-05-23 22:00:00', '2024-05-24 08:00:00'),
                                              ('2024-05-24', '2024-05-24 22:00:00', '2024-05-25 08:00:00'),
                                              ('2024-05-25', '2024-05-25 22:00:00', '2024-05-26 08:00:00'),
                                              ('2024-05-26', '2024-05-26 22:00:00', '2024-05-27 08:00:00'),
                                              ('2024-05-27', '2024-05-27 22:00:00', '2024-05-28 08:00:00'),
                                              ('2024-05-28', '2024-05-28 22:00:00', '2024-05-29 08:00:00'),
                                              ('2024-05-29', '2024-05-29 22:00:00', '2024-05-30 08:00:00')}),
                      behavioral_rows=frozenset({('highs', '2024-05-16 14:35:00', 'near_miss'),
                                                 ('highs', '2024-05-17 14:35:00', 'near_miss'),
                                                 ('highs', '2024-05-18 14:35:00', 'near_miss'),
                                                 ('highs', '2024-05-19 14:35:00', 'near_miss'),
                                                 ('highs', '2024-05-20 14:35:00', 'near_miss'),
                                                 ('highs', '2024-05-21 14:35:00', 'near_miss'),
                                                 ('highs', '2024-05-22 14:35:00', 'near_miss'),
                                                 ('highs', '2024-05-23 14:35:00', 'near_miss'),
                                                 ('highs', '2024-05-24 14:35:00', 'near_miss'),
                                                 ('highs', '2024-05-25 14:35:00', 'near_miss'),
                                                 ('highs', '2024-05-26 14:35:00', 'near_miss'),
                                                 ('highs', '2024-05-27 14:35:00', 'near_miss'),
                                                 ('lows', '2024-05-16 13:55:00', 'fired'),
                                                 ('lows', '2024-05-17 13:55:00', 'fired'),
                                                 ('lows', '2024-05-18 13:55:00', 'fired'),
                                                 ('lows', '2024-05-19 13:55:00', 'fired'),
                                                 ('lows', '2024-05-20 13:55:00', 'fired'),
                                                 ('lows', '2024-05-21 13:55:00', 'fired'),
                                                 ('lows', '2024-05-22 13:55:00', 'fired'),
                                                 ('lows', '2024-05-23 13:55:00', 'fired'),
                                                 ('lows', '2024-05-24 13:55:00', 'fired'),
                                                 ('lows', '2024-05-25 13:55:00', 'fired'),
                                                 ('lows', '2024-05-26 13:55:00', 'fired'),
                                                 ('lows', '2024-05-27 13:55:00', 'fired')}),
                      finding_titles=frozenset({'Highs after meals',
                                                'Lows after correcting highs',
                                                'Lows after meals',
                                                'Over-treated low'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [{'subject': 'habit:over_treated_low',
                                                      'kind': 'habit',
                                                      'k': 12,
                                                      'price': 70,
                                                      'admitted': True,
                                                      'producer': 'scenario',
                                                      'lo': 0.8796,
                                                      'hi': 1.0,
                                                      'seriousness': 'high',
                                                      'action': 'habit:over_treated_low',
                                                      'admission_basis': 'lower_bound'}],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 12,
                                         'k': 12,
                                         'rate': 1.0,
                                         'wilson': {'lo': 0.8796, 'hi': 1.0},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 12, 'gate': 12, 'verdict': 'ready'},
                                         'settled_price': 70,
                                         'admission_route': 'habit_threshold',
                                         'collapse': 'collapse_to_member',
                                         'action': 'habit:over_treated_low',
                                         'seriousness': 'high',
                                         'member_set_fingerprint': 'a0de7500243ef646'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 12,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.1204},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 12, 'gate': 12, 'verdict': 'ready'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={('over_treated_low', 'lows'): ExpectedVerdictTally(denominator=12,
                                                                                          counts={'fired': 12,
                                                                                                  'outranked': 0,
                                                                                                  'near_miss': 0,
                                                                                                  'no_data': 0,
                                                                                                  'clean': 0})},
                      uncaused_highs=0), 30),
    # #554: the maturing carb ratio Trial a release before #503 and #553 retained. Its
    # flat lane queues nothing; Changes reads its comparison.
    QaCase('c3-ic-trial', _materialize_c3_ic_trial,
        QaExpectation(analyzer_rows={},
                      support={},
                      queue_rows={},
                      queue_absences=frozenset(),
                      rest_windows=_BEHAVIORAL_30_DAY_REST_WINDOWS,
                      behavioral_rows=frozenset(("meals", f"2024-05-{day:02d} 12:00:00", "no_data")
                                                for day in range(1, 31)),
                      finding_titles=frozenset({'Highs after meals', 'Highs after treating lows',
                                                'Lows after correcting highs', 'Lows after meals',
                                                'meals-start-high'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 30,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.0519},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 30, 'gate': 12, 'verdict': 'ready'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 30,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.0519},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 30, 'gate': 12, 'verdict': 'ready'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0), 30),
)


def _materialize_c4_setting(store, *, parameter, late_read=False):
    """A real retained setting watch on flat manufactured source observations.

    ``late_read`` writes one unchanged pump read after the watch window before
    the one reconcile (#462), so the record's retained context reads a pump read
    later than its ending and that ending saves ``context_after_ending``.
    """
    from dataclasses import replace
    from ciq_autotune.watched_change import reconcile_ingested_follow_up
    _materialize_behavioral_background(store, span_days=62)
    _materialize_basal_coverage(store, clean_rate=0.48)
    settings = store.settings_snapshots()[-1].settings
    profile = settings.active()
    values = {'carb_ratio': 6.0} if parameter == 'carb_ratio' else {'isf': 44.0}
    if parameter == 'profile':
        values = {'carb_ratio': 6.0, 'isf': 44.0, 'basal_rate': 0.54}
    profile = replace(profile, idp=2, segments=tuple(replace(s, **values) for s in profile.segments))
    store.upsert_settings_snapshot('2024-06-01 00:00:00', replace(settings,
        active_idp=2, profiles=(*settings.profiles, profile)))
    if parameter == 'carb_ratio':
        # The same closed-meal shape as _materialize_ic_coverage, on each arm.
        store.upsert_bolus([{
            'seq_num': 610_000 + arm * 100 + day,
            'request_time': str(datetime(2024, month, 10 + day, 9)),
            'description': 'Synthetic closed meal run', 'completion': 'Completed',
            'insulin': 60.0 / ratio, 'requested_insulin': 60.0 / ratio,
            'carbs': 60.0, 'carb_ratio': ratio, 'isf': 40.0, 'target_bg': 110.0,
        } for arm, (month, ratio) in enumerate(((5, 5.0), (6, 6.0))) for day in range(8)])
    _respond_fasting_lane(store)
    if late_read:
        store.upsert_settings_snapshot('2024-06-30 12:00:00', store.settings_snapshots()[-1].settings)
    reconcile_ingested_follow_up(store)


def _materialize_c4_missing(store):
    """Retained basal watch with no after-arm CGM, never a fabricated zero."""
    from ciq_autotune.watched_change import reconcile_ingested_follow_up
    _materialize_c3_trial(store)
    store.conn.execute("DELETE FROM cgm_readings WHERE t >= ? AND time(t) >= '03:00:00' AND time(t) < '03:30:00'", ('2024-05-15 00:00:00',))
    store.conn.commit()
    reconcile_ingested_follow_up(store)


def _materialize_c4_history(store):
    """Historical I:C input plus retained Trial and preempted Focus records."""
    from ciq_autotune.watched_change import reconcile_ingested_follow_up
    _materialize_ic_history_register(store)
    _materialize_basal_coverage(store, clean_rate=0.48, informative_nights=30, include_settings=False)
    _respond_fasting_lane(store)
    changed = date(2024, 3, 1) + timedelta(days=IC_SOURCE_SPAN_DAYS - 21)
    _c3_pin(store, at=f'{changed - timedelta(days=1)} 00:00:00')
    reconcile_ingested_follow_up(store)


def _materialize_edit_chain(store):
    """Four retained per-slot basal Trial records (#414 ADR): three within a day
    of each other (one pair at exactly one day) chain into one Edit, and a fourth
    a week before the first stays its own Edit. Every record sits inside its
    watch window at the case's data tail (06-01 23:59), so the ending rule
    (ADR 442) leaves all four open — this recipe exhibits the Edit-chaining
    read, not a resolved watch."""
    from ciq_autotune.watched_change import reconcile_ingested_follow_up
    _materialize_basal_coverage(store, clean_rate=0.48, informative_nights=30, include_settings=False)
    _respond_fasting_lane(store)
    with store.follow_up_transaction():
        for changed_at, before, after in (
            ('2024-05-22 00:00:00', 0.5, 0.52),
            ('2024-05-23 00:00:00', 0.52, 0.54),  # exactly one day after the first
            ('2024-05-24 00:00:00', 0.54, 0.56),  # exactly one day after the second
            ('2024-05-15 00:00:00', 0.48, 0.5),   # a week before the chain: its own Edit
        ):
            stamp = datetime.fromisoformat(changed_at).strftime('%Y%m%d%H%M%S')
            store.save_follow_up_record({
                'kind': 'trial', 'id': f'basal_rate-01-00-{stamp}', 'version': '386:1',
                'parameter': 'basal_rate', 'slot': '01:00',
                'changed_at': changed_at, 'before': before, 'after': after,
                'first_observed_at': changed_at,
                'observed_context': {'version': '386:1', 'state': 'unavailable',
                                     'reason': 'not_recorded'},
            })
    reconcile_ingested_follow_up(store)

# Literal expectations captured through execute_case for amendment 1.
QA_CASES += (
    QaCase('c4-ic', partial(_materialize_c4_setting, parameter='carb_ratio'),
        QaExpectation(analyzer_rows={},
                      support={},
                      queue_rows={},
                      queue_absences=frozenset(),
                      rest_windows=frozenset({('2024-06-01', '2024-06-01 22:00:00', '2024-06-02 08:00:00'),
                                              ('2024-06-02', '2024-06-02 22:00:00', '2024-06-03 08:00:00'),
                                              ('2024-06-03', '2024-06-03 22:00:00', '2024-06-04 08:00:00'),
                                              ('2024-06-04', '2024-06-04 22:00:00', '2024-06-05 08:00:00'),
                                              ('2024-06-05', '2024-06-05 22:00:00', '2024-06-06 08:00:00'),
                                              ('2024-06-06', '2024-06-06 22:00:00', '2024-06-07 08:00:00'),
                                              ('2024-06-07', '2024-06-07 22:00:00', '2024-06-08 08:00:00'),
                                              ('2024-06-08', '2024-06-08 22:00:00', '2024-06-09 08:00:00'),
                                              ('2024-06-09', '2024-06-09 22:00:00', '2024-06-10 08:00:00'),
                                              ('2024-06-10', '2024-06-10 22:00:00', '2024-06-11 08:00:00'),
                                              ('2024-06-11', '2024-06-11 22:00:00', '2024-06-12 08:00:00'),
                                              ('2024-06-12', '2024-06-12 22:00:00', '2024-06-13 08:00:00'),
                                              ('2024-06-13', '2024-06-13 22:00:00', '2024-06-14 08:00:00'),
                                              ('2024-06-14', '2024-06-14 22:00:00', '2024-06-15 08:00:00'),
                                              ('2024-06-15', '2024-06-15 22:00:00', '2024-06-16 08:00:00'),
                                              ('2024-06-16', '2024-06-16 22:00:00', '2024-06-17 08:00:00'),
                                              ('2024-06-17', '2024-06-17 22:00:00', '2024-06-18 08:00:00'),
                                              ('2024-06-18', '2024-06-18 22:00:00', '2024-06-19 08:00:00'),
                                              ('2024-06-19', '2024-06-19 22:00:00', '2024-06-20 08:00:00'),
                                              ('2024-06-20', '2024-06-20 22:00:00', '2024-06-21 08:00:00'),
                                              ('2024-06-21', '2024-06-21 22:00:00', '2024-06-22 08:00:00'),
                                              ('2024-06-22', '2024-06-22 22:00:00', '2024-06-23 08:00:00'),
                                              ('2024-06-23', '2024-06-23 22:00:00', '2024-06-24 08:00:00'),
                                              ('2024-06-24', '2024-06-24 22:00:00', '2024-06-25 08:00:00'),
                                              ('2024-06-25', '2024-06-25 22:00:00', '2024-06-26 08:00:00'),
                                              ('2024-06-26', '2024-06-26 22:00:00', '2024-06-27 08:00:00'),
                                              ('2024-06-27', '2024-06-27 22:00:00', '2024-06-28 08:00:00'),
                                              ('2024-06-28', '2024-06-28 22:00:00', '2024-06-29 08:00:00'),
                                              ('2024-06-29', '2024-06-29 22:00:00', '2024-06-30 08:00:00'),
                                              ('2024-06-30', '2024-06-30 22:00:00', '2024-07-01 08:00:00')}),
                      behavioral_rows=frozenset({('meals', '2024-06-10 09:00:00', 'no_data'),
                                                 ('meals', '2024-06-11 09:00:00', 'no_data'),
                                                 ('meals', '2024-06-12 09:00:00', 'no_data'),
                                                 ('meals', '2024-06-13 09:00:00', 'no_data'),
                                                 ('meals', '2024-06-14 09:00:00', 'no_data'),
                                                 ('meals', '2024-06-15 09:00:00', 'no_data'),
                                                 ('meals', '2024-06-16 09:00:00', 'no_data'),
                                                 ('meals', '2024-06-17 09:00:00', 'no_data')}),
                      finding_titles=frozenset({'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals',
                                                'meals-start-high'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 8,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.1703},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 8,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.1703},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0), 62),
    QaCase('c4-isf', partial(_materialize_c4_setting, parameter='isf'),
        QaExpectation(analyzer_rows={},
                      support={},
                      queue_rows={},
                      queue_absences=frozenset(),
                      rest_windows=frozenset({('2024-06-01', '2024-06-01 22:00:00', '2024-06-02 08:00:00'),
                                              ('2024-06-02', '2024-06-02 22:00:00', '2024-06-03 08:00:00'),
                                              ('2024-06-03', '2024-06-03 22:00:00', '2024-06-04 08:00:00'),
                                              ('2024-06-04', '2024-06-04 22:00:00', '2024-06-05 08:00:00'),
                                              ('2024-06-05', '2024-06-05 22:00:00', '2024-06-06 08:00:00'),
                                              ('2024-06-06', '2024-06-06 22:00:00', '2024-06-07 08:00:00'),
                                              ('2024-06-07', '2024-06-07 22:00:00', '2024-06-08 08:00:00'),
                                              ('2024-06-08', '2024-06-08 22:00:00', '2024-06-09 08:00:00'),
                                              ('2024-06-09', '2024-06-09 22:00:00', '2024-06-10 08:00:00'),
                                              ('2024-06-10', '2024-06-10 22:00:00', '2024-06-11 08:00:00'),
                                              ('2024-06-11', '2024-06-11 22:00:00', '2024-06-12 08:00:00'),
                                              ('2024-06-12', '2024-06-12 22:00:00', '2024-06-13 08:00:00'),
                                              ('2024-06-13', '2024-06-13 22:00:00', '2024-06-14 08:00:00'),
                                              ('2024-06-14', '2024-06-14 22:00:00', '2024-06-15 08:00:00'),
                                              ('2024-06-15', '2024-06-15 22:00:00', '2024-06-16 08:00:00'),
                                              ('2024-06-16', '2024-06-16 22:00:00', '2024-06-17 08:00:00'),
                                              ('2024-06-17', '2024-06-17 22:00:00', '2024-06-18 08:00:00'),
                                              ('2024-06-18', '2024-06-18 22:00:00', '2024-06-19 08:00:00'),
                                              ('2024-06-19', '2024-06-19 22:00:00', '2024-06-20 08:00:00'),
                                              ('2024-06-20', '2024-06-20 22:00:00', '2024-06-21 08:00:00'),
                                              ('2024-06-21', '2024-06-21 22:00:00', '2024-06-22 08:00:00'),
                                              ('2024-06-22', '2024-06-22 22:00:00', '2024-06-23 08:00:00'),
                                              ('2024-06-23', '2024-06-23 22:00:00', '2024-06-24 08:00:00'),
                                              ('2024-06-24', '2024-06-24 22:00:00', '2024-06-25 08:00:00'),
                                              ('2024-06-25', '2024-06-25 22:00:00', '2024-06-26 08:00:00'),
                                              ('2024-06-26', '2024-06-26 22:00:00', '2024-06-27 08:00:00'),
                                              ('2024-06-27', '2024-06-27 22:00:00', '2024-06-28 08:00:00'),
                                              ('2024-06-28', '2024-06-28 22:00:00', '2024-06-29 08:00:00'),
                                              ('2024-06-29', '2024-06-29 22:00:00', '2024-06-30 08:00:00'),
                                              ('2024-06-30', '2024-06-30 22:00:00', '2024-07-01 08:00:00')}),
                      behavioral_rows=frozenset(),
                      finding_titles=frozenset({'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0), 62),
    QaCase('c4-profile', partial(_materialize_c4_setting, parameter='profile'),
        QaExpectation(analyzer_rows={},
                      support={},
                      queue_rows={},
                      queue_absences=frozenset(),
                      rest_windows=frozenset({('2024-06-01', '2024-06-01 22:00:00', '2024-06-02 08:00:00'),
                                              ('2024-06-02', '2024-06-02 22:00:00', '2024-06-03 08:00:00'),
                                              ('2024-06-03', '2024-06-03 22:00:00', '2024-06-04 08:00:00'),
                                              ('2024-06-04', '2024-06-04 22:00:00', '2024-06-05 08:00:00'),
                                              ('2024-06-05', '2024-06-05 22:00:00', '2024-06-06 08:00:00'),
                                              ('2024-06-06', '2024-06-06 22:00:00', '2024-06-07 08:00:00'),
                                              ('2024-06-07', '2024-06-07 22:00:00', '2024-06-08 08:00:00'),
                                              ('2024-06-08', '2024-06-08 22:00:00', '2024-06-09 08:00:00'),
                                              ('2024-06-09', '2024-06-09 22:00:00', '2024-06-10 08:00:00'),
                                              ('2024-06-10', '2024-06-10 22:00:00', '2024-06-11 08:00:00'),
                                              ('2024-06-11', '2024-06-11 22:00:00', '2024-06-12 08:00:00'),
                                              ('2024-06-12', '2024-06-12 22:00:00', '2024-06-13 08:00:00'),
                                              ('2024-06-13', '2024-06-13 22:00:00', '2024-06-14 08:00:00'),
                                              ('2024-06-14', '2024-06-14 22:00:00', '2024-06-15 08:00:00'),
                                              ('2024-06-15', '2024-06-15 22:00:00', '2024-06-16 08:00:00'),
                                              ('2024-06-16', '2024-06-16 22:00:00', '2024-06-17 08:00:00'),
                                              ('2024-06-17', '2024-06-17 22:00:00', '2024-06-18 08:00:00'),
                                              ('2024-06-18', '2024-06-18 22:00:00', '2024-06-19 08:00:00'),
                                              ('2024-06-19', '2024-06-19 22:00:00', '2024-06-20 08:00:00'),
                                              ('2024-06-20', '2024-06-20 22:00:00', '2024-06-21 08:00:00'),
                                              ('2024-06-21', '2024-06-21 22:00:00', '2024-06-22 08:00:00'),
                                              ('2024-06-22', '2024-06-22 22:00:00', '2024-06-23 08:00:00'),
                                              ('2024-06-23', '2024-06-23 22:00:00', '2024-06-24 08:00:00'),
                                              ('2024-06-24', '2024-06-24 22:00:00', '2024-06-25 08:00:00'),
                                              ('2024-06-25', '2024-06-25 22:00:00', '2024-06-26 08:00:00'),
                                              ('2024-06-26', '2024-06-26 22:00:00', '2024-06-27 08:00:00'),
                                              ('2024-06-27', '2024-06-27 22:00:00', '2024-06-28 08:00:00'),
                                              ('2024-06-28', '2024-06-28 22:00:00', '2024-06-29 08:00:00'),
                                              ('2024-06-29', '2024-06-29 22:00:00', '2024-06-30 08:00:00'),
                                              ('2024-06-30', '2024-06-30 22:00:00', '2024-07-01 08:00:00')}),
                      behavioral_rows=frozenset(),
                      finding_titles=frozenset({'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0), 62),
    QaCase('c4-missing', _materialize_c4_missing,
        QaExpectation(analyzer_rows={('basal', '01:00'): ExpectedBasalRow(safety_status='capped (lower)',
                                                                          direction='lower',
                                                                          asserts_move=True,
                                                                          omitted=frozenset()),
                                     ('basal', '03:00'): ExpectedBasalRow(safety_status='lower',
                                                                          direction='lower',
                                                                          asserts_move=True,
                                                                          omitted=frozenset())},
                      support={('basal', '01:00'): ExpectedSupport(directional_support_count=28,
                                                                   n_steps=None,
                                                                   n_runs=None,
                                                                   effective_run_count=None),
                               ('basal', '03:00'): ExpectedSupport(directional_support_count=30,
                                                                   n_steps=None,
                                                                   n_runs=None,
                                                                   effective_run_count=None)},
                      queue_rows={('whole_day', ('basal', '01:00')): ExpectedQueueRow(register='assert',
                                                                                      direction='lower',
                                                                                      asserts_move=None,
                                                                                      headline='A step down, limited '
                                                                                               'to 20% below the set '
                                                                                               'rate. Delivered 0.36 '
                                                                                               'U/h across 28 steady '
                                                                                               'nights against 0.60 '
                                                                                               'programmed.'),
                                  ('whole_day', ('basal', '03:00')): ExpectedQueueRow(register='assert',
                                                                                      direction='lower',
                                                                                      asserts_move=None,
                                                                                      headline='One cautious step '
                                                                                               'down is supported at '
                                                                                               'this time. Delivered '
                                                                                               '0.48 U/h across 30 '
                                                                                               'steady nights '
                                                                                               'against 0.54 '
                                                                                               'programmed.')},
                      queue_absences=frozenset(),
                      rest_windows=frozenset({('2024-05-03', '2024-05-03 22:00:00', '2024-05-04 08:00:00'),
                                              ('2024-05-04', '2024-05-04 22:00:00', '2024-05-05 08:00:00'),
                                              ('2024-05-05', '2024-05-05 22:00:00', '2024-05-06 08:00:00'),
                                              ('2024-05-06', '2024-05-06 22:00:00', '2024-05-07 08:00:00'),
                                              ('2024-05-07', '2024-05-07 22:00:00', '2024-05-08 08:00:00'),
                                              ('2024-05-08', '2024-05-08 22:00:00', '2024-05-09 08:00:00'),
                                              ('2024-05-09', '2024-05-09 22:00:00', '2024-05-10 08:00:00'),
                                              ('2024-05-10', '2024-05-10 22:00:00', '2024-05-11 08:00:00'),
                                              ('2024-05-11', '2024-05-11 22:00:00', '2024-05-12 08:00:00'),
                                              ('2024-05-12', '2024-05-12 22:00:00', '2024-05-13 08:00:00'),
                                              ('2024-05-13', '2024-05-13 22:00:00', '2024-05-14 08:00:00'),
                                              ('2024-05-14', '2024-05-14 22:00:00', '2024-05-15 08:00:00'),
                                              ('2024-05-15', '2024-05-15 22:00:00', '2024-05-16 08:00:00'),
                                              ('2024-05-16', '2024-05-16 22:00:00', '2024-05-17 08:00:00'),
                                              ('2024-05-17', '2024-05-17 22:00:00', '2024-05-18 08:00:00'),
                                              ('2024-05-18', '2024-05-18 22:00:00', '2024-05-19 08:00:00'),
                                              ('2024-05-19', '2024-05-19 22:00:00', '2024-05-20 08:00:00'),
                                              ('2024-05-20', '2024-05-20 22:00:00', '2024-05-21 08:00:00'),
                                              ('2024-05-21', '2024-05-21 22:00:00', '2024-05-22 08:00:00'),
                                              ('2024-05-22', '2024-05-22 22:00:00', '2024-05-23 08:00:00'),
                                              ('2024-05-23', '2024-05-23 22:00:00', '2024-05-24 08:00:00'),
                                              ('2024-05-24', '2024-05-24 22:00:00', '2024-05-25 08:00:00'),
                                              ('2024-05-25', '2024-05-25 22:00:00', '2024-05-26 08:00:00'),
                                              ('2024-05-26', '2024-05-26 22:00:00', '2024-05-27 08:00:00'),
                                              ('2024-05-27', '2024-05-27 22:00:00', '2024-05-28 08:00:00'),
                                              ('2024-05-28', '2024-05-28 22:00:00', '2024-05-29 08:00:00'),
                                              ('2024-05-29', '2024-05-29 22:00:00', '2024-05-30 08:00:00')}),
                      behavioral_rows=frozenset(),
                      finding_titles=frozenset({'Basal 01:00 · lower',
                                                'Basal 03:00 · lower',
                                                'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0), 32),
    QaCase('c4-history', _materialize_c4_history,
        QaExpectation(analyzer_rows={('basal', '03:00'): ExpectedBasalRow(safety_status='lower',
                                                                          direction='lower',
                                                                          asserts_move=True,
                                                                          omitted=frozenset())},
                      support={('basal', '03:00'): ExpectedSupport(directional_support_count=30,
                                                                   n_steps=None,
                                                                   n_runs=None,
                                                                   effective_run_count=None)},
                      queue_rows={('whole_day', ('basal', '03:00')): ExpectedQueueRow(register='assert',
                                                                                      direction='lower',
                                                                                      asserts_move=None,
                                                                                      headline='One cautious step '
                                                                                               'down is supported at '
                                                                                               'this time. Delivered '
                                                                                               '0.48 U/h across 30 '
                                                                                               'steady nights '
                                                                                               'against 0.60 '
                                                                                               'programmed.')},
                      queue_absences=frozenset(),
                      rest_windows=frozenset(),
                      behavioral_rows=frozenset({('meals', '2024-05-03 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-04 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-05 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-12 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-13 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-14 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-15 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-16 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-17 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-18 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-19 09:00:00', 'no_data')}),
                      finding_titles=frozenset({'Basal 03:00 · lower',
                                                'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 11,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.1299},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 11, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 11,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.1299},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 11, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0), 93),
)

# #414 1.4: the Edit-chaining recipe. Same plain basal background as c4-history's
# own basal leg (no I:C history register, no Focus pin) plus four directly-saved
# RETAINED trial records exercising ADR 414's chaining rule — literal expectations
# captured through execute_case, transcribed byte-for-byte from the dumped output.
QA_CASES += (
    QaCase('edit-chain', _materialize_edit_chain,
        QaExpectation(analyzer_rows={('basal', '03:00'): ExpectedBasalRow(safety_status='lower',
                                                                          direction='lower',
                                                                          asserts_move=True,
                                                                          omitted=frozenset())},
                      support={('basal', '03:00'): ExpectedSupport(directional_support_count=30,
                                                                   n_steps=None,
                                                                   n_runs=None,
                                                                   effective_run_count=None)},
                      queue_rows={('whole_day', ('basal', '03:00')): ExpectedQueueRow(register='assert',
                                                                                      direction='lower',
                                                                                      asserts_move=None,
                                                                                      headline='One cautious step '
                                                                                               'down is supported at '
                                                                                               'this time. Delivered '
                                                                                               '0.48 U/h across 30 '
                                                                                               'steady nights '
                                                                                               'against 0.60 '
                                                                                               'programmed.')},
                      queue_absences=frozenset(),
                      rest_windows=frozenset(),
                      behavioral_rows=frozenset(),
                      finding_titles=frozenset({'Basal 03:00 · lower',
                                                'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0), BASAL_SOURCE_SPAN_DAYS),
)

# #459 (ADR 459 point 6): a stageable basal slot and a stageable carb ratio at
# once, so a stage press on one can replace the other setting. It composes the
# basal-lower and ic-lower recipes, stretching the carb-ratio source span to end
# on the basal lane's last day so both lanes read one window. Literal
# expectations captured through execute_case and transcribed from its dump.
_BASAL_AND_CARB_RATIO_SPAN_DAYS = (
    date(2024, 5, 1) + timedelta(days=BASAL_SOURCE_SPAN_DAYS - 1) - date(2024, 3, 1)
).days + 1


def _materialize_basal_and_carb_ratio_lower(store) -> None:
    _materialize_basal_coverage(store, clean_rate=0.54)
    _materialize_ic_coverage(
        store, measured_ratio=8.0, source_span_days=_BASAL_AND_CARB_RATIO_SPAN_DAYS,
    )

QA_CASES += (
    QaCase('basal-and-carb-ratio-lower', _materialize_basal_and_carb_ratio_lower,
        QaExpectation(analyzer_rows={('basal', '03:00'): ExpectedBasalRow(safety_status='lower',
                                                                          direction='lower',
                                                                          asserts_move=True,
                                                                          omitted=frozenset()),
                                     ('ic', 'All day'): ExpectedIcRow(state='numeric',
                                                                      direction='lower',
                                                                      held_reason=None,
                                                                      asserts_move=True,
                                                                      days_observed=90,
                                                                      omitted=frozenset({'days_needed'}))},
                      support={('basal', '03:00'): ExpectedSupport(directional_support_count=30,
                                                                   n_steps=None,
                                                                   n_runs=None,
                                                                   effective_run_count=None),
                               ('ic', 'All day'): ExpectedSupport(directional_support_count=None,
                                                                  n_steps=None,
                                                                  n_runs=8,
                                                                  effective_run_count=8.0)},
                      queue_rows={('whole_day', ('basal', '03:00')): ExpectedQueueRow(register='assert',
                                                                                      direction='lower',
                                                                                      asserts_move=None,
                                                                                      headline='One cautious step '
                                                                                               'down is supported at '
                                                                                               'this time. Delivered '
                                                                                               '0.54 U/h across 30 '
                                                                                               'steady nights '
                                                                                               'against 0.60 '
                                                                                               'programmed.'),
                                  ('whole_day', ('ic', 'All day')): ExpectedQueueRow(register='assert',
                                                                                     direction='lower',
                                                                                     asserts_move=None,
                                                                                     headline='Post-meal corrections '
                                                                                              'imply meals are '
                                                                                              'under-covered, so a '
                                                                                              'tighter (smaller) '
                                                                                              'carb ratio would dose '
                                                                                              'more per carb. '
                                                                                              'Measured 8 g/U across '
                                                                                              '8 meal runs against '
                                                                                              '10 programmed.')},
                      queue_absences=frozenset(),
                      rest_windows=frozenset(),
                      behavioral_rows=frozenset({('meals', '2024-05-19 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-20 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-21 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-22 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-23 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-24 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-25 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-26 09:00:00', 'no_data')}),
                      finding_titles=frozenset({'Basal 03:00 · lower',
                                                'Carb ratio 00:00 to 24:00 · lower',
                                                'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 8,
                                                      'price': 91,
                                                      'admitted': True,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': 'carb_ratio'}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 8,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.1703},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 91,
                                         'admission_route': 'setting_staging',
                                         'collapse': 'remain_pattern',
                                         'action': 'carb_ratio',
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 8,
                                                      'price': 91,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 8,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.1703},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 8, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0), _BASAL_AND_CARB_RATIO_SPAN_DAYS),
)

# #530 (ADR 530): two carb-ratio blocks moving opposite ways at once — a
# strengthening morning (measured below its programmed ratio) and a weakening
# evening (measured above its own) — so each meal Pattern carries only the move
# its direction fits. The same closed-meal shape as _materialize_ic_coverage, on
# each block. Literal expectations captured through execute_case and transcribed
# from its dump.
def _materialize_ic_split_directions(store) -> None:
    first = date(2024, 3, 1)
    last = first + timedelta(days=IC_SOURCE_SPAN_DAYS - 1)
    store.upsert_cgm([
        {
            "EventDateTime": f"{day.isoformat()} {clock}",
            "Readings (CGM / BGM)": 120.0,
            "Description": "Synthetic EGV",
        }
        for day, clock in ((first, "00:00:00"), (last, "23:59:00"))
    ])
    store.upsert_bolus([
        {
            "seq_num": 62_000 + block * 100 + index,
            "request_time": f"{(last - timedelta(days=13 - index)).isoformat()} {hour:02d}:00:00",
            "description": "Synthetic closed meal run",
            "completion": "Completed",
            "insulin": 60.0 / measured,
            "requested_insulin": 60.0 / measured,
            "carbs": 60.0,
            "carb_ratio": programmed,
            "isf": 40.0,
            "target_bg": 110.0,
        }
        for block, (hour, programmed, measured) in enumerate(((9, 10.0, 8.0), (18, 12.0, 15.0)))
        for index in range(8)
    ])
    profile = ProfileSettings(
        idp=1, name="QA synthetic profile", dia_min=180, carb_entry=True, max_bolus=10.0,
        segments=(ProfileSegment(0, 0.6, 40, 10.0, 110), ProfileSegment(720, 0.6, 40, 12.0, 110)),
    )
    store.upsert_settings_snapshot(
        f"{first.isoformat()} 00:00:00", PumpSettings(active_idp=1, profiles=(profile,)),
    )

QA_CASES += (
    QaCase('ic-split-directions', _materialize_ic_split_directions,
        QaExpectation(analyzer_rows={('ic', 'Morning'): ExpectedIcRow(state='numeric',
                                                                      direction='lower',
                                                                      held_reason=None,
                                                                      asserts_move=True,
                                                                      days_observed=90,
                                                                      omitted=frozenset({'days_needed'})),
                                     ('ic', 'Evening'): ExpectedIcRow(state='numeric',
                                                                      direction='raise',
                                                                      held_reason=None,
                                                                      asserts_move=True,
                                                                      days_observed=90,
                                                                      omitted=frozenset({'days_needed'}))},
                      support={('ic', 'Morning'): ExpectedSupport(directional_support_count=None,
                                                                  n_steps=None,
                                                                  n_runs=8,
                                                                  effective_run_count=8.0),
                               ('ic', 'Evening'): ExpectedSupport(directional_support_count=None,
                                                                  n_steps=None,
                                                                  n_runs=8,
                                                                  effective_run_count=8.0)},
                      queue_rows={('whole_day', ('ic', 'Morning')): ExpectedQueueRow(register='assert',
                                                                                     direction='lower',
                                                                                     asserts_move=None,
                                                                                     headline='Post-meal '
                                                                                              'corrections '
                                                                                              'imply meals '
                                                                                              'are '
                                                                                              'under-covered, '
                                                                                              'so a tighter '
                                                                                              '(smaller) '
                                                                                              'carb ratio '
                                                                                              'would dose '
                                                                                              'more per '
                                                                                              'carb. '
                                                                                              'Measured 8 '
                                                                                              'g/U across 8 '
                                                                                              'meal runs '
                                                                                              'against 10 '
                                                                                              'programmed.'),
                                  ('whole_day', ('ic', 'Evening')): ExpectedQueueRow(register='assert',
                                                                                     direction='raise',
                                                                                     asserts_move=None,
                                                                                     headline='Meals look '
                                                                                              'slightly '
                                                                                              'over-covered '
                                                                                              'relative to '
                                                                                              'the '
                                                                                              'programmed '
                                                                                              'carb ratio. '
                                                                                              'Measured 15 '
                                                                                              'g/U across 8 '
                                                                                              'meal runs '
                                                                                              'against 12 '
                                                                                              'programmed.')},
                      queue_absences=frozenset(),
                      rest_windows=frozenset(),
                      behavioral_rows=frozenset({('meals', '2024-05-17 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-17 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-18 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-18 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-19 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-19 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-20 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-20 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-21 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-21 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-22 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-22 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-23 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-23 18:00:00', 'no_data'),
                                                 ('meals', '2024-05-24 09:00:00', 'no_data'),
                                                 ('meals', '2024-05-24 18:00:00', 'no_data')}),
                      finding_titles=frozenset({'Carb ratio 00:00 to 12:00 · lower',
                                                'Carb ratio 12:00 to 24:00 · raise',
                                                'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 8,
                                                      'price': 63,
                                                      'admitted': True,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': 'carb_ratio'}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 16,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.0931},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 16, 'gate': 12, 'verdict': 'ready'},
                                         'settled_price': 63,
                                         'admission_route': 'setting_staging',
                                         'collapse': 'remain_pattern',
                                         'action': 'carb_ratio',
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 8,
                                                      'price': 63,
                                                      'admitted': True,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': 'carb_ratio'}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 16,
                                         'k': 0,
                                         'rate': 0.0,
                                         'wilson': {'lo': 0.0, 'hi': 0.0931},
                                         'wide': False,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 16, 'gate': 12, 'verdict': 'ready'},
                                         'settled_price': 63,
                                         'admission_route': 'setting_staging',
                                         'collapse': 'remain_pattern',
                                         'action': 'carb_ratio',
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking',
                                                         'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0),
        IC_SOURCE_SPAN_DAYS),
)

# #462 (ADR 462): c4-isf's recipe plus one unchanged pump read after its watch
# window, written before its one reconcile, so its ending saves
# context_after_ending. Literal expectations captured through execute_case and
# transcribed from its dump, which equals c4-isf's.
QA_CASES += (
    QaCase('c4-isf-late-read', partial(_materialize_c4_setting, parameter='isf', late_read=True),
        QaExpectation(analyzer_rows={},
                      support={},
                      queue_rows={},
                      queue_absences=frozenset(),
                      rest_windows=frozenset({('2024-06-01', '2024-06-01 22:00:00', '2024-06-02 08:00:00'),
                                              ('2024-06-02', '2024-06-02 22:00:00', '2024-06-03 08:00:00'),
                                              ('2024-06-03', '2024-06-03 22:00:00', '2024-06-04 08:00:00'),
                                              ('2024-06-04', '2024-06-04 22:00:00', '2024-06-05 08:00:00'),
                                              ('2024-06-05', '2024-06-05 22:00:00', '2024-06-06 08:00:00'),
                                              ('2024-06-06', '2024-06-06 22:00:00', '2024-06-07 08:00:00'),
                                              ('2024-06-07', '2024-06-07 22:00:00', '2024-06-08 08:00:00'),
                                              ('2024-06-08', '2024-06-08 22:00:00', '2024-06-09 08:00:00'),
                                              ('2024-06-09', '2024-06-09 22:00:00', '2024-06-10 08:00:00'),
                                              ('2024-06-10', '2024-06-10 22:00:00', '2024-06-11 08:00:00'),
                                              ('2024-06-11', '2024-06-11 22:00:00', '2024-06-12 08:00:00'),
                                              ('2024-06-12', '2024-06-12 22:00:00', '2024-06-13 08:00:00'),
                                              ('2024-06-13', '2024-06-13 22:00:00', '2024-06-14 08:00:00'),
                                              ('2024-06-14', '2024-06-14 22:00:00', '2024-06-15 08:00:00'),
                                              ('2024-06-15', '2024-06-15 22:00:00', '2024-06-16 08:00:00'),
                                              ('2024-06-16', '2024-06-16 22:00:00', '2024-06-17 08:00:00'),
                                              ('2024-06-17', '2024-06-17 22:00:00', '2024-06-18 08:00:00'),
                                              ('2024-06-18', '2024-06-18 22:00:00', '2024-06-19 08:00:00'),
                                              ('2024-06-19', '2024-06-19 22:00:00', '2024-06-20 08:00:00'),
                                              ('2024-06-20', '2024-06-20 22:00:00', '2024-06-21 08:00:00'),
                                              ('2024-06-21', '2024-06-21 22:00:00', '2024-06-22 08:00:00'),
                                              ('2024-06-22', '2024-06-22 22:00:00', '2024-06-23 08:00:00'),
                                              ('2024-06-23', '2024-06-23 22:00:00', '2024-06-24 08:00:00'),
                                              ('2024-06-24', '2024-06-24 22:00:00', '2024-06-25 08:00:00'),
                                              ('2024-06-25', '2024-06-25 22:00:00', '2024-06-26 08:00:00'),
                                              ('2024-06-26', '2024-06-26 22:00:00', '2024-06-27 08:00:00'),
                                              ('2024-06-27', '2024-06-27 22:00:00', '2024-06-28 08:00:00'),
                                              ('2024-06-28', '2024-06-28 22:00:00', '2024-06-29 08:00:00'),
                                              ('2024-06-29', '2024-06-29 22:00:00', '2024-06-30 08:00:00'),
                                              ('2024-06-30', '2024-06-30 22:00:00', '2024-07-01 08:00:00')}),
                      behavioral_rows=frozenset(),
                      finding_titles=frozenset({'Highs after meals',
                                                'Highs after treating lows',
                                                'Lows after correcting highs',
                                                'Lows after meals'}),
                      outcome_patterns=({'key': 'highs_after_meals',
                                         'title': 'Highs after meals',
                                         'subject': 'pattern:highs_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'lows_after_meals',
                                         'title': 'Lows after meals',
                                         'subject': 'pattern:lows_after_meals',
                                         'members': [{'subject': 'setting:carb_ratio',
                                                      'kind': 'setting',
                                                      'k': 0,
                                                      'price': 0,
                                                      'admitted': False,
                                                      'producer': 'tuning_levers',
                                                      'lo': None,
                                                      'hi': None,
                                                      'seriousness': None,
                                                      'seriousness_segments': [],
                                                      'action': None}],
                                         'rate_levers': ['habit:meal_over_delivery'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': '13141e472c40a768'},
                                        {'key': 'highs_after_treating_lows',
                                         'title': 'Highs after treating lows',
                                         'subject': 'pattern:highs_after_treating_lows',
                                         'members': [],
                                         'rate_levers': ['habit:over_treated_low'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                        {'key': 'lows_after_correcting_highs',
                                         'title': 'Lows after correcting highs',
                                         'subject': 'pattern:lows_after_correcting_highs',
                                         'members': [],
                                         'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'],
                                         'n': 0,
                                         'k': 0,
                                         'rate': None,
                                         'wilson': None,
                                         'wide': True,
                                         'rate_producer': 'exposures',
                                         'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                         'settled_price': 0,
                                         'admission_route': 'none',
                                         'collapse': 'remain_pattern',
                                         'action': None,
                                         'seriousness': None,
                                         'member_set_fingerprint': 'e3b0c44298fc1c14'}),
                      verdict_tallies={},
                      uncaused_highs=0), 62),
)


# #510: a basal change seen only in delivery history. The programmed rate inside
# one block falls from 0.9 to 0.7 units an hour on the dense basal feed, and no settings read
# brackets the change: the one read predates it. The rest of the day stays at
# 0.6 units an hour. CGM is 120 mg/dL every five minutes, except 62 mg/dL inside the low
# minutes on every night before the change, so the lows it targets sit late in
# its block. A lane is ``(slots, first delivery of the new rate at the block's
# first slot, low minutes, the read's basal segments)``.
_DELIVERY_BLOCK_FIRST = date(2024, 5, 1)
_DELIVERY_BLOCK_DAYS = 35
_DELIVERY_SMALL_HOURS = (tuple(range(4, 10)), datetime(2024, 5, 21, 2), (240, 300),
                         ((0, 0.6), (120, 0.9), (300, 0.6)))  # 02:00–05:00
_DELIVERY_ACROSS_MIDNIGHT = ((44, 45, 46, 47, 0, 1, 2, 3), datetime(2024, 5, 20, 22), (60, 120),
                             ((0, 0.9), (120, 0.6), (1320, 0.9)))  # 22:00–02:00
_DELIVERY_WHOLE_DAY = (tuple(range(48)), datetime(2024, 5, 21), (240, 300), ((0, 0.9),))


def _materialize_delivery_basal_block(store, lane=_DELIVERY_SMALL_HOURS) -> None:
    """Five-minute CGM and one programmed-rate delivery row per slot per day."""
    slots, changed, (low_start, low_end), segments = lane
    cgm, basal = [], []
    for day in range(_DELIVERY_BLOCK_DAYS):
        midnight = datetime.combine(_DELIVERY_BLOCK_FIRST + timedelta(days=day), datetime.min.time())
        for slot in range(48):
            at = midnight + timedelta(minutes=30 * slot)
            rate = 0.6
            if slot in slots:
                rate = 0.7 if at >= changed else 0.9
            basal.append({
                "seq_num": 710_000 + day * 48 + slot, "time": str(at),
                "delivery_type": "profileDelivery", "duration_mins": 30,
                "basal_rate": rate, "profile_basal_rate": rate,
            })
        for minute in range(0, 1440, 5):
            at = midnight + timedelta(minutes=minute)
            low = at < changed and low_start <= minute < low_end
            cgm.append({
                "EventDateTime": str(at), "Readings (CGM / BGM)": 62.0 if low else 120.0,
                "Description": "Synthetic EGV",
            })
    store.upsert_cgm(cgm)
    store.upsert_basal(basal)
    store.upsert_settings_snapshot(f"{_DELIVERY_BLOCK_FIRST} 00:00:00", PumpSettings(active_idp=1, profiles=(
        ProfileSettings(idp=1, name="QA synthetic profile", dia_min=180, carb_entry=True, max_bolus=10.0,
                        segments=tuple(ProfileSegment(start, rate, 40, 10.0, 110)
                                       for start, rate in segments)),)))


def _materialize_delivery_basal_block_trial(store, lane=_DELIVERY_SMALL_HOURS) -> None:
    from ciq_autotune.watched_change import reconcile_ingested_follow_up
    _materialize_delivery_basal_block(store, lane)
    reconcile_ingested_follow_up(store)


def _materialize_delivery_basal_legacy(store, *, finished: bool = True) -> None:
    """The same change as an install upgraded from per-slot Trials holds it.

    Before #510 a delivery-only basal change was saved as one Trial record per
    slot, each dated at its own slot's first delivery of the new rate and
    carrying no block, and the reconcile admitted the newest, 04:30, as the
    active Trial. With ``finished`` the person finished that one and the other
    five stayed open; without it all six are open. The six records and that
    admission are written here as that build wrote them, then one reconcile
    runs under the grouping rule.
    """
    from ciq_autotune.follow_up_comparison import capture_comparison_context
    from ciq_autotune.watched_change import capture_ending, reconcile_ingested_follow_up
    _materialize_delivery_basal_block(store)
    recorded_at = datetime(2024, 6, 4, 12)
    with store.follow_up_transaction():
        revision = store.input_data_revision()
        context = capture_comparison_context(store, at=recorded_at, input_revision=revision)
        newest = None
        slots, first, _, _ = _DELIVERY_SMALL_HOURS
        for slot in slots:
            changed = first + timedelta(minutes=30 * (slot - slots[0]))
            label = f"{slot // 2:02d}:{30 * (slot % 2):02d}"
            identity = f"basal_rate-{label.replace(':', '-')}-{changed.strftime('%Y%m%d%H%M%S')}"
            newest = store.save_follow_up_record({
                "kind": "trial", "id": identity, "version": "386:1",
                "parameter": "basal_rate", "slot": label, "changed_at": str(changed),
                "before": 0.9, "after": 0.7, "block": None, "members": None,
                "first_observed_at": str(recorded_at),
                "observed_context": {"version": "386:1", "state": "unavailable",
                                     "reason": "not_recorded"},
                "comparison_context": context,
            })
        store.advance_follow_up_frontier(newest["id"], newest["changed_at"],
                                         reconciled_input_revision=store.input_data_revision())
        if finished:
            capture_ending(store, newest, kind="user_finished", effective_at=recorded_at,
                           recorded_at=recorded_at, data_cutoff=recorded_at,
                           conclusion="Synthetic observation: the early-morning lows stopped.")
    reconcile_ingested_follow_up(store)


_DELIVERY_BLOCK_EXPECTATION = QaExpectation(analyzer_rows={('basal', '02:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '02:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '03:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '03:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '04:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '04:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset())},
              support={('basal', '02:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '02:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '03:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '03:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '04:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '04:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None)},
              queue_rows={},
              queue_absences=frozenset(),
              rest_windows=frozenset({('2024-05-05', '2024-05-05 22:00:00', '2024-05-06 08:00:00'),
                                      ('2024-05-06', '2024-05-06 22:00:00', '2024-05-07 08:00:00'),
                                      ('2024-05-07', '2024-05-07 22:00:00', '2024-05-08 08:00:00'),
                                      ('2024-05-08', '2024-05-08 22:00:00', '2024-05-09 08:00:00'),
                                      ('2024-05-09', '2024-05-09 22:00:00', '2024-05-10 08:00:00'),
                                      ('2024-05-10', '2024-05-10 22:00:00', '2024-05-11 08:00:00'),
                                      ('2024-05-11', '2024-05-11 22:00:00', '2024-05-12 08:00:00'),
                                      ('2024-05-12', '2024-05-12 22:00:00', '2024-05-13 08:00:00'),
                                      ('2024-05-13', '2024-05-13 22:00:00', '2024-05-14 08:00:00'),
                                      ('2024-05-14', '2024-05-14 22:00:00', '2024-05-15 08:00:00'),
                                      ('2024-05-15', '2024-05-15 22:00:00', '2024-05-16 08:00:00'),
                                      ('2024-05-16', '2024-05-16 22:00:00', '2024-05-17 08:00:00'),
                                      ('2024-05-17', '2024-05-17 22:00:00', '2024-05-18 08:00:00'),
                                      ('2024-05-18', '2024-05-18 22:00:00', '2024-05-19 08:00:00'),
                                      ('2024-05-19', '2024-05-19 22:00:00', '2024-05-20 08:00:00'),
                                      ('2024-05-20', '2024-05-20 22:00:00', '2024-05-21 08:00:00'),
                                      ('2024-05-21', '2024-05-21 22:00:00', '2024-05-22 08:00:00'),
                                      ('2024-05-22', '2024-05-22 22:00:00', '2024-05-23 08:00:00'),
                                      ('2024-05-23', '2024-05-23 22:00:00', '2024-05-24 08:00:00'),
                                      ('2024-05-24', '2024-05-24 22:00:00', '2024-05-25 08:00:00'),
                                      ('2024-05-25', '2024-05-25 22:00:00', '2024-05-26 08:00:00'),
                                      ('2024-05-26', '2024-05-26 22:00:00', '2024-05-27 08:00:00'),
                                      ('2024-05-27', '2024-05-27 22:00:00', '2024-05-28 08:00:00'),
                                      ('2024-05-28', '2024-05-28 22:00:00', '2024-05-29 08:00:00'),
                                      ('2024-05-29', '2024-05-29 22:00:00', '2024-05-30 08:00:00'),
                                      ('2024-05-30', '2024-05-30 22:00:00', '2024-05-31 08:00:00'),
                                      ('2024-05-31', '2024-05-31 22:00:00', '2024-06-01 08:00:00'),
                                      ('2024-06-01', '2024-06-01 22:00:00', '2024-06-02 08:00:00'),
                                      ('2024-06-02', '2024-06-02 22:00:00', '2024-06-03 08:00:00'),
                                      ('2024-06-03',
                                       '2024-06-03 22:00:00',
                                       '2024-06-04 08:00:00')}),
              behavioral_rows=frozenset({('lows', '2024-05-06 04:00:00', 'clean'),
                                         ('lows', '2024-05-07 04:00:00', 'clean'),
                                         ('lows', '2024-05-08 04:00:00', 'clean'),
                                         ('lows', '2024-05-09 04:00:00', 'clean'),
                                         ('lows', '2024-05-10 04:00:00', 'clean'),
                                         ('lows', '2024-05-11 04:00:00', 'clean'),
                                         ('lows', '2024-05-12 04:00:00', 'clean'),
                                         ('lows', '2024-05-13 04:00:00', 'clean'),
                                         ('lows', '2024-05-14 04:00:00', 'clean'),
                                         ('lows', '2024-05-15 04:00:00', 'clean'),
                                         ('lows', '2024-05-16 04:00:00', 'clean'),
                                         ('lows', '2024-05-17 04:00:00', 'clean'),
                                         ('lows', '2024-05-18 04:00:00', 'clean'),
                                         ('lows', '2024-05-19 04:00:00', 'clean'),
                                         ('lows', '2024-05-20 04:00:00', 'clean')}),
              finding_titles=frozenset({'Highs after meals',
                                        'Highs after treating lows',
                                        'Lows after correcting highs',
                                        'Lows after meals'}),
              outcome_patterns=({'key': 'highs_after_meals',
                                 'title': 'Highs after meals',
                                 'subject': 'pattern:highs_after_meals',
                                 'members': [{'subject': 'setting:carb_ratio',
                                              'kind': 'setting',
                                              'k': 0,
                                              'price': 0,
                                              'admitted': False,
                                              'producer': 'tuning_levers',
                                              'lo': None,
                                              'hi': None,
                                              'seriousness': None,
                                              'seriousness_segments': [],
                                              'action': None}],
                                 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                 'n': 0,
                                 'k': 0,
                                 'rate': None,
                                 'wilson': None,
                                 'wide': True,
                                 'rate_producer': 'exposures',
                                 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                 'settled_price': 0,
                                 'admission_route': 'none',
                                 'collapse': 'remain_pattern',
                                 'action': None,
                                 'seriousness': None,
                                 'member_set_fingerprint': '13141e472c40a768'},
                                {'key': 'lows_after_meals',
                                 'title': 'Lows after meals',
                                 'subject': 'pattern:lows_after_meals',
                                 'members': [{'subject': 'setting:carb_ratio',
                                              'kind': 'setting',
                                              'k': 0,
                                              'price': 0,
                                              'admitted': False,
                                              'producer': 'tuning_levers',
                                              'lo': None,
                                              'hi': None,
                                              'seriousness': None,
                                              'seriousness_segments': [],
                                              'action': None}],
                                 'rate_levers': ['habit:meal_over_delivery'],
                                 'n': 0,
                                 'k': 0,
                                 'rate': None,
                                 'wilson': None,
                                 'wide': True,
                                 'rate_producer': 'exposures',
                                 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                 'settled_price': 0,
                                 'admission_route': 'none',
                                 'collapse': 'remain_pattern',
                                 'action': None,
                                 'seriousness': None,
                                 'member_set_fingerprint': '13141e472c40a768'},
                                {'key': 'highs_after_treating_lows',
                                 'title': 'Highs after treating lows',
                                 'subject': 'pattern:highs_after_treating_lows',
                                 'members': [],
                                 'rate_levers': ['habit:over_treated_low'],
                                 'n': 15,
                                 'k': 0,
                                 'rate': 0.0,
                                 'wilson': {'lo': 0.0, 'hi': 0.0987},
                                 'wide': False,
                                 'rate_producer': 'exposures',
                                 'readiness': {'count': 15, 'gate': 12, 'verdict': 'ready'},
                                 'settled_price': 0,
                                 'admission_route': 'none',
                                 'collapse': 'remain_pattern',
                                 'action': None,
                                 'seriousness': None,
                                 'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                {'key': 'lows_after_correcting_highs',
                                 'title': 'Lows after correcting highs',
                                 'subject': 'pattern:lows_after_correcting_highs',
                                 'members': [],
                                 'rate_levers': ['habit:correction_stacking',
                                                 'habit:correction_on_iob'],
                                 'n': 15,
                                 'k': 0,
                                 'rate': 0.0,
                                 'wilson': {'lo': 0.0, 'hi': 0.0987},
                                 'wide': False,
                                 'rate_producer': 'exposures',
                                 'readiness': {'count': 15, 'gate': 12, 'verdict': 'ready'},
                                 'settled_price': 0,
                                 'admission_route': 'none',
                                 'collapse': 'remain_pattern',
                                 'action': None,
                                 'seriousness': None,
                                 'member_set_fingerprint': 'e3b0c44298fc1c14'}),
              verdict_tallies={},
              uncaused_highs=0)

_DELIVERY_ACROSS_MIDNIGHT_EXPECTATION = QaExpectation(analyzer_rows={('basal', '00:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '00:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '01:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '01:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '22:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '22:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '23:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '23:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset())},
              support={('basal', '00:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '00:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '01:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '01:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '22:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '22:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '23:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '23:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None)},
              queue_rows={},
              queue_absences=frozenset(),
              rest_windows=frozenset({('2024-05-05', '2024-05-05 22:00:00', '2024-05-06 08:00:00'),
                                      ('2024-05-06', '2024-05-06 22:00:00', '2024-05-07 08:00:00'),
                                      ('2024-05-07', '2024-05-07 22:00:00', '2024-05-08 08:00:00'),
                                      ('2024-05-08', '2024-05-08 22:00:00', '2024-05-09 08:00:00'),
                                      ('2024-05-09', '2024-05-09 22:00:00', '2024-05-10 08:00:00'),
                                      ('2024-05-10', '2024-05-10 22:00:00', '2024-05-11 08:00:00'),
                                      ('2024-05-11', '2024-05-11 22:00:00', '2024-05-12 08:00:00'),
                                      ('2024-05-12', '2024-05-12 22:00:00', '2024-05-13 08:00:00'),
                                      ('2024-05-13', '2024-05-13 22:00:00', '2024-05-14 08:00:00'),
                                      ('2024-05-14', '2024-05-14 22:00:00', '2024-05-15 08:00:00'),
                                      ('2024-05-15', '2024-05-15 22:00:00', '2024-05-16 08:00:00'),
                                      ('2024-05-16', '2024-05-16 22:00:00', '2024-05-17 08:00:00'),
                                      ('2024-05-17', '2024-05-17 22:00:00', '2024-05-18 08:00:00'),
                                      ('2024-05-18', '2024-05-18 22:00:00', '2024-05-19 08:00:00'),
                                      ('2024-05-19', '2024-05-19 22:00:00', '2024-05-20 08:00:00'),
                                      ('2024-05-20', '2024-05-20 22:00:00', '2024-05-21 08:00:00'),
                                      ('2024-05-21', '2024-05-21 22:00:00', '2024-05-22 08:00:00'),
                                      ('2024-05-22', '2024-05-22 22:00:00', '2024-05-23 08:00:00'),
                                      ('2024-05-23', '2024-05-23 22:00:00', '2024-05-24 08:00:00'),
                                      ('2024-05-24', '2024-05-24 22:00:00', '2024-05-25 08:00:00'),
                                      ('2024-05-25', '2024-05-25 22:00:00', '2024-05-26 08:00:00'),
                                      ('2024-05-26', '2024-05-26 22:00:00', '2024-05-27 08:00:00'),
                                      ('2024-05-27', '2024-05-27 22:00:00', '2024-05-28 08:00:00'),
                                      ('2024-05-28', '2024-05-28 22:00:00', '2024-05-29 08:00:00'),
                                      ('2024-05-29', '2024-05-29 22:00:00', '2024-05-30 08:00:00'),
                                      ('2024-05-30', '2024-05-30 22:00:00', '2024-05-31 08:00:00'),
                                      ('2024-05-31', '2024-05-31 22:00:00', '2024-06-01 08:00:00'),
                                      ('2024-06-01', '2024-06-01 22:00:00', '2024-06-02 08:00:00'),
                                      ('2024-06-02', '2024-06-02 22:00:00', '2024-06-03 08:00:00'),
                                      ('2024-06-03',
                                       '2024-06-03 22:00:00',
                                       '2024-06-04 08:00:00')}),
              behavioral_rows=frozenset({('lows', '2024-05-06 01:00:00', 'clean'),
                                         ('lows', '2024-05-07 01:00:00', 'clean'),
                                         ('lows', '2024-05-08 01:00:00', 'clean'),
                                         ('lows', '2024-05-09 01:00:00', 'clean'),
                                         ('lows', '2024-05-10 01:00:00', 'clean'),
                                         ('lows', '2024-05-11 01:00:00', 'clean'),
                                         ('lows', '2024-05-12 01:00:00', 'clean'),
                                         ('lows', '2024-05-13 01:00:00', 'clean'),
                                         ('lows', '2024-05-14 01:00:00', 'clean'),
                                         ('lows', '2024-05-15 01:00:00', 'clean'),
                                         ('lows', '2024-05-16 01:00:00', 'clean'),
                                         ('lows', '2024-05-17 01:00:00', 'clean'),
                                         ('lows', '2024-05-18 01:00:00', 'clean'),
                                         ('lows', '2024-05-19 01:00:00', 'clean'),
                                         ('lows', '2024-05-20 01:00:00', 'clean')}),
              finding_titles=frozenset({'Highs after meals',
                                        'Highs after treating lows',
                                        'Lows after correcting highs',
                                        'Lows after meals'}),
              outcome_patterns=({'key': 'highs_after_meals',
                                 'title': 'Highs after meals',
                                 'subject': 'pattern:highs_after_meals',
                                 'members': [{'subject': 'setting:carb_ratio',
                                              'kind': 'setting',
                                              'k': 0,
                                              'price': 0,
                                              'admitted': False,
                                              'producer': 'tuning_levers',
                                              'lo': None,
                                              'hi': None,
                                              'seriousness': None,
                                              'seriousness_segments': [],
                                              'action': None}],
                                 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                 'n': 0,
                                 'k': 0,
                                 'rate': None,
                                 'wilson': None,
                                 'wide': True,
                                 'rate_producer': 'exposures',
                                 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                 'settled_price': 0,
                                 'admission_route': 'none',
                                 'collapse': 'remain_pattern',
                                 'action': None,
                                 'seriousness': None,
                                 'member_set_fingerprint': '13141e472c40a768'},
                                {'key': 'lows_after_meals',
                                 'title': 'Lows after meals',
                                 'subject': 'pattern:lows_after_meals',
                                 'members': [{'subject': 'setting:carb_ratio',
                                              'kind': 'setting',
                                              'k': 0,
                                              'price': 0,
                                              'admitted': False,
                                              'producer': 'tuning_levers',
                                              'lo': None,
                                              'hi': None,
                                              'seriousness': None,
                                              'seriousness_segments': [],
                                              'action': None}],
                                 'rate_levers': ['habit:meal_over_delivery'],
                                 'n': 0,
                                 'k': 0,
                                 'rate': None,
                                 'wilson': None,
                                 'wide': True,
                                 'rate_producer': 'exposures',
                                 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                 'settled_price': 0,
                                 'admission_route': 'none',
                                 'collapse': 'remain_pattern',
                                 'action': None,
                                 'seriousness': None,
                                 'member_set_fingerprint': '13141e472c40a768'},
                                {'key': 'highs_after_treating_lows',
                                 'title': 'Highs after treating lows',
                                 'subject': 'pattern:highs_after_treating_lows',
                                 'members': [],
                                 'rate_levers': ['habit:over_treated_low'],
                                 'n': 15,
                                 'k': 0,
                                 'rate': 0.0,
                                 'wilson': {'lo': 0.0, 'hi': 0.0987},
                                 'wide': False,
                                 'rate_producer': 'exposures',
                                 'readiness': {'count': 15, 'gate': 12, 'verdict': 'ready'},
                                 'settled_price': 0,
                                 'admission_route': 'none',
                                 'collapse': 'remain_pattern',
                                 'action': None,
                                 'seriousness': None,
                                 'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                {'key': 'lows_after_correcting_highs',
                                 'title': 'Lows after correcting highs',
                                 'subject': 'pattern:lows_after_correcting_highs',
                                 'members': [],
                                 'rate_levers': ['habit:correction_stacking',
                                                 'habit:correction_on_iob'],
                                 'n': 15,
                                 'k': 0,
                                 'rate': 0.0,
                                 'wilson': {'lo': 0.0, 'hi': 0.0987},
                                 'wide': False,
                                 'rate_producer': 'exposures',
                                 'readiness': {'count': 15, 'gate': 12, 'verdict': 'ready'},
                                 'settled_price': 0,
                                 'admission_route': 'none',
                                 'collapse': 'remain_pattern',
                                 'action': None,
                                 'seriousness': None,
                                 'member_set_fingerprint': 'e3b0c44298fc1c14'}),
              verdict_tallies={},
              uncaused_highs=0)

_DELIVERY_WHOLE_DAY_EXPECTATION = QaExpectation(analyzer_rows={('basal', '00:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '00:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '01:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '01:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '02:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '02:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '03:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '03:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '04:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '04:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '05:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '05:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '06:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '06:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '07:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '07:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '08:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '08:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '09:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '09:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '10:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '10:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '11:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '11:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '12:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '12:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '13:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '13:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '14:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '14:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '15:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '15:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '16:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '16:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '17:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '17:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '18:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '18:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '19:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '19:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '20:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '20:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '21:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '21:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '22:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '22:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '23:00'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset()),
                             ('basal', '23:30'): ExpectedBasalRow(safety_status='insufficient '
                                                                                'evidence',
                                                                  direction=None,
                                                                  asserts_move=False,
                                                                  omitted=frozenset())},
              support={('basal', '00:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '00:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '01:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '01:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '02:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '02:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '03:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '03:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '04:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '04:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '05:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '05:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '06:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '06:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '07:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '07:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '08:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '08:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '09:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '09:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '10:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '10:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '11:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '11:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '12:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '12:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '13:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '13:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '14:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '14:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '15:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '15:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '16:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '16:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '17:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '17:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '18:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '18:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '19:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '19:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '20:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '20:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '21:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '21:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '22:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '22:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '23:00'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None),
                       ('basal', '23:30'): ExpectedSupport(directional_support_count=0,
                                                           n_steps=None,
                                                           n_runs=None,
                                                           effective_run_count=None)},
              queue_rows={},
              queue_absences=frozenset(),
              rest_windows=frozenset({('2024-05-05', '2024-05-05 22:00:00', '2024-05-06 08:00:00'),
                                      ('2024-05-06', '2024-05-06 22:00:00', '2024-05-07 08:00:00'),
                                      ('2024-05-07', '2024-05-07 22:00:00', '2024-05-08 08:00:00'),
                                      ('2024-05-08', '2024-05-08 22:00:00', '2024-05-09 08:00:00'),
                                      ('2024-05-09', '2024-05-09 22:00:00', '2024-05-10 08:00:00'),
                                      ('2024-05-10', '2024-05-10 22:00:00', '2024-05-11 08:00:00'),
                                      ('2024-05-11', '2024-05-11 22:00:00', '2024-05-12 08:00:00'),
                                      ('2024-05-12', '2024-05-12 22:00:00', '2024-05-13 08:00:00'),
                                      ('2024-05-13', '2024-05-13 22:00:00', '2024-05-14 08:00:00'),
                                      ('2024-05-14', '2024-05-14 22:00:00', '2024-05-15 08:00:00'),
                                      ('2024-05-15', '2024-05-15 22:00:00', '2024-05-16 08:00:00'),
                                      ('2024-05-16', '2024-05-16 22:00:00', '2024-05-17 08:00:00'),
                                      ('2024-05-17', '2024-05-17 22:00:00', '2024-05-18 08:00:00'),
                                      ('2024-05-18', '2024-05-18 22:00:00', '2024-05-19 08:00:00'),
                                      ('2024-05-19', '2024-05-19 22:00:00', '2024-05-20 08:00:00'),
                                      ('2024-05-20', '2024-05-20 22:00:00', '2024-05-21 08:00:00'),
                                      ('2024-05-21', '2024-05-21 22:00:00', '2024-05-22 08:00:00'),
                                      ('2024-05-22', '2024-05-22 22:00:00', '2024-05-23 08:00:00'),
                                      ('2024-05-23', '2024-05-23 22:00:00', '2024-05-24 08:00:00'),
                                      ('2024-05-24', '2024-05-24 22:00:00', '2024-05-25 08:00:00'),
                                      ('2024-05-25', '2024-05-25 22:00:00', '2024-05-26 08:00:00'),
                                      ('2024-05-26', '2024-05-26 22:00:00', '2024-05-27 08:00:00'),
                                      ('2024-05-27', '2024-05-27 22:00:00', '2024-05-28 08:00:00'),
                                      ('2024-05-28', '2024-05-28 22:00:00', '2024-05-29 08:00:00'),
                                      ('2024-05-29', '2024-05-29 22:00:00', '2024-05-30 08:00:00'),
                                      ('2024-05-30', '2024-05-30 22:00:00', '2024-05-31 08:00:00'),
                                      ('2024-05-31', '2024-05-31 22:00:00', '2024-06-01 08:00:00'),
                                      ('2024-06-01', '2024-06-01 22:00:00', '2024-06-02 08:00:00'),
                                      ('2024-06-02', '2024-06-02 22:00:00', '2024-06-03 08:00:00'),
                                      ('2024-06-03',
                                       '2024-06-03 22:00:00',
                                       '2024-06-04 08:00:00')}),
              behavioral_rows=frozenset({('lows', '2024-05-06 04:00:00', 'clean'),
                                         ('lows', '2024-05-07 04:00:00', 'clean'),
                                         ('lows', '2024-05-08 04:00:00', 'clean'),
                                         ('lows', '2024-05-09 04:00:00', 'clean'),
                                         ('lows', '2024-05-10 04:00:00', 'clean'),
                                         ('lows', '2024-05-11 04:00:00', 'clean'),
                                         ('lows', '2024-05-12 04:00:00', 'clean'),
                                         ('lows', '2024-05-13 04:00:00', 'clean'),
                                         ('lows', '2024-05-14 04:00:00', 'clean'),
                                         ('lows', '2024-05-15 04:00:00', 'clean'),
                                         ('lows', '2024-05-16 04:00:00', 'clean'),
                                         ('lows', '2024-05-17 04:00:00', 'clean'),
                                         ('lows', '2024-05-18 04:00:00', 'clean'),
                                         ('lows', '2024-05-19 04:00:00', 'clean'),
                                         ('lows', '2024-05-20 04:00:00', 'clean')}),
              finding_titles=frozenset({'Highs after meals',
                                        'Highs after treating lows',
                                        'Lows after correcting highs',
                                        'Lows after meals'}),
              outcome_patterns=({'key': 'highs_after_meals',
                                 'title': 'Highs after meals',
                                 'subject': 'pattern:highs_after_meals',
                                 'members': [{'subject': 'setting:carb_ratio',
                                              'kind': 'setting',
                                              'k': 0,
                                              'price': 0,
                                              'admitted': False,
                                              'producer': 'tuning_levers',
                                              'lo': None,
                                              'hi': None,
                                              'seriousness': None,
                                              'seriousness_segments': [],
                                              'action': None}],
                                 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'],
                                 'n': 0,
                                 'k': 0,
                                 'rate': None,
                                 'wilson': None,
                                 'wide': True,
                                 'rate_producer': 'exposures',
                                 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                 'settled_price': 0,
                                 'admission_route': 'none',
                                 'collapse': 'remain_pattern',
                                 'action': None,
                                 'seriousness': None,
                                 'member_set_fingerprint': '13141e472c40a768'},
                                {'key': 'lows_after_meals',
                                 'title': 'Lows after meals',
                                 'subject': 'pattern:lows_after_meals',
                                 'members': [{'subject': 'setting:carb_ratio',
                                              'kind': 'setting',
                                              'k': 0,
                                              'price': 0,
                                              'admitted': False,
                                              'producer': 'tuning_levers',
                                              'lo': None,
                                              'hi': None,
                                              'seriousness': None,
                                              'seriousness_segments': [],
                                              'action': None}],
                                 'rate_levers': ['habit:meal_over_delivery'],
                                 'n': 0,
                                 'k': 0,
                                 'rate': None,
                                 'wilson': None,
                                 'wide': True,
                                 'rate_producer': 'exposures',
                                 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'},
                                 'settled_price': 0,
                                 'admission_route': 'none',
                                 'collapse': 'remain_pattern',
                                 'action': None,
                                 'seriousness': None,
                                 'member_set_fingerprint': '13141e472c40a768'},
                                {'key': 'highs_after_treating_lows',
                                 'title': 'Highs after treating lows',
                                 'subject': 'pattern:highs_after_treating_lows',
                                 'members': [],
                                 'rate_levers': ['habit:over_treated_low'],
                                 'n': 15,
                                 'k': 0,
                                 'rate': 0.0,
                                 'wilson': {'lo': 0.0, 'hi': 0.0987},
                                 'wide': False,
                                 'rate_producer': 'exposures',
                                 'readiness': {'count': 15, 'gate': 12, 'verdict': 'ready'},
                                 'settled_price': 0,
                                 'admission_route': 'none',
                                 'collapse': 'remain_pattern',
                                 'action': None,
                                 'seriousness': None,
                                 'member_set_fingerprint': 'e3b0c44298fc1c14'},
                                {'key': 'lows_after_correcting_highs',
                                 'title': 'Lows after correcting highs',
                                 'subject': 'pattern:lows_after_correcting_highs',
                                 'members': [],
                                 'rate_levers': ['habit:correction_stacking',
                                                 'habit:correction_on_iob'],
                                 'n': 15,
                                 'k': 0,
                                 'rate': 0.0,
                                 'wilson': {'lo': 0.0, 'hi': 0.0987},
                                 'wide': False,
                                 'rate_producer': 'exposures',
                                 'readiness': {'count': 15, 'gate': 12, 'verdict': 'ready'},
                                 'settled_price': 0,
                                 'admission_route': 'none',
                                 'collapse': 'remain_pattern',
                                 'action': None,
                                 'seriousness': None,
                                 'member_set_fingerprint': 'e3b0c44298fc1c14'}),
              verdict_tallies={},
              uncaused_highs=0)

# #510: literal expectations captured through execute_case and transcribed from
# each lane's dump. The block and both legacy cases share one source, so one
# expectation covers all three; their dumps were compared equal.
QA_CASES += (
    QaCase('delivery-basal-block', _materialize_delivery_basal_block_trial,
        _DELIVERY_BLOCK_EXPECTATION, _DELIVERY_BLOCK_DAYS),
    QaCase('delivery-basal-legacy', _materialize_delivery_basal_legacy,
        _DELIVERY_BLOCK_EXPECTATION, _DELIVERY_BLOCK_DAYS),
    QaCase('delivery-basal-legacy-open', partial(_materialize_delivery_basal_legacy, finished=False),
        _DELIVERY_BLOCK_EXPECTATION, _DELIVERY_BLOCK_DAYS),
    QaCase('delivery-basal-across-midnight',
        partial(_materialize_delivery_basal_block_trial, lane=_DELIVERY_ACROSS_MIDNIGHT),
        _DELIVERY_ACROSS_MIDNIGHT_EXPECTATION, _DELIVERY_BLOCK_DAYS),
    QaCase('delivery-basal-whole-day',
        partial(_materialize_delivery_basal_block_trial, lane=_DELIVERY_WHOLE_DAY),
        _DELIVERY_WHOLE_DAY_EXPECTATION, _DELIVERY_BLOCK_DAYS),
)

# #553: one low line. The over-treated-low story plus a 72 mg/dL dip that rebounds to
# 244: no low, so no claim, and every count reads the same sub-70 lows.
QA_CASES += (
    QaCase(
        "behavioral-over-treated-near-low",
        _materialize_behavioral_over_treated_near_low,
        next(case for case in QA_CASES
             if case.name == "behavioral-over-treated-low").expectation,
        30,
    ),
)

# #588 (ADR 563): each carb-ratio meal run converts its glucose travel with its own
# ISF: its stamp, else its segment in the capture as of it, else none.
QA_CASES += (
    QaCase(
        "ic-dose-stamped-isf",
        _materialize_ic_dose_stamped_isf,
        QaExpectation(
            _explicit_rows({
                ("ic", "Morning"): ExpectedIcRow(
                    state="numeric", direction="lower", asserts_move=True,
                    days_observed=90, omitted=frozenset({"days_needed"}),
                ),
                ("ic", "Evening"): ExpectedIcRow(
                    state="numeric", direction="lower", asserts_move=True,
                    days_observed=90, omitted=frozenset({"days_needed"}),
                ),
            }),
            {
                ("ic", "Morning"): ExpectedSupport(n_runs=18, effective_run_count=18.0),
                ("ic", "Evening"): ExpectedSupport(n_runs=14, effective_run_count=14.0),
            },
            {
                ("whole_day", ("ic", "Morning")): ExpectedQueueRow("assert", "lower", None, 'Post-meal corrections imply meals are under-covered, so a tighter (smaller) carb ratio would dose more per carb. Measured 4.4 g/U across 18 meal runs against 5 programmed.'),
                ("whole_day", ("ic", "Evening")): ExpectedQueueRow("assert", "lower", None, 'Post-meal corrections imply meals are under-covered, so a tighter (smaller) carb ratio would dose more per carb. Measured 5.5 g/U across 14 meal runs against 6 programmed.'),
            },
            frozenset(), frozenset(),
            frozenset({('meals', '2024-05-02 09:00:00', 'near_miss'), ('meals', '2024-05-04 09:00:00', 'near_miss'), ('meals', '2024-05-06 09:00:00', 'near_miss'), ('meals', '2024-05-08 09:00:00', 'near_miss')}),
            frozenset({'Carb ratio 00:00 to 12:00 · lower', 'Carb ratio 12:00 to 24:00 · lower', 'Highs after meals', 'Highs after treating lows', 'Lows after correcting highs', 'Lows after meals', 'meals-start-high'}),
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 18, 'price': 49, 'admitted': True, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': 'carb_ratio'}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 4, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.2911}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 4, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 49, 'admission_route': 'setting_staging', 'collapse': 'remain_pattern', 'action': 'carb_ratio', 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 18, 'price': 49, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 4, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.2911}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 4, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}),
        ),
        IC_SOURCE_SPAN_DAYS,
    ),
)

# #593 (ADR 593): Highs after meals with two admitted causes whose roster order,
# count order and severity order differ.
QA_CASES += (
    QaCase(
        "pattern-meal-two-causes",
        _pattern_meal_two_causes_recipe,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(),
            _BEHAVIORAL_30_DAY_REST_WINDOWS, frozenset({('highs', '2024-05-24 12:30:00', 'clean'), ('highs', '2024-05-25 12:30:00', 'clean'), ('highs', '2024-05-26 12:30:00', 'clean'), ('highs', '2024-05-27 12:30:00', 'clean'), ('meals', '2024-05-03 08:05:00', 'no_data'), ('meals', '2024-05-04 08:05:00', 'no_data'), ('meals', '2024-05-05 08:05:00', 'no_data'), ('meals', '2024-05-06 08:05:00', 'no_data'), ('meals', '2024-05-07 08:05:00', 'no_data'), ('meals', '2024-05-08 08:05:00', 'no_data'), ('meals', '2024-05-09 08:05:00', 'no_data'), ('meals', '2024-05-10 08:05:00', 'no_data'), ('meals', '2024-05-11 08:05:00', 'no_data'), ('meals', '2024-05-12 08:05:00', 'no_data'), ('meals', '2024-05-13 08:05:00', 'no_data'), ('meals', '2024-05-14 08:05:00', 'no_data'), ('meals', '2024-05-15 08:05:00', 'no_data'), ('meals', '2024-05-16 08:05:00', 'no_data'), ('meals', '2024-05-17 12:05:00', 'fired'), ('meals', '2024-05-18 12:05:00', 'fired'), ('meals', '2024-05-19 12:05:00', 'fired'), ('meals', '2024-05-24 12:05:00', 'fired'), ('meals', '2024-05-25 12:05:00', 'fired'), ('meals', '2024-05-26 12:05:00', 'fired'), ('meals', '2024-05-27 12:05:00', 'fired')}),
            frozenset({'Carb undercount', 'Highs after meals', 'Highs after treating lows', 'Late bolus', 'Lows after correcting highs', 'Lows after meals', 'meals-start-high'}),
            {
                ("carb_undercount", "meals"): _verdict_tally(
                    21, fired=4, outranked=3, near_miss=0, no_data=0, clean=14,
                ),
                ("late_bolus", "meals"): _verdict_tally(
                    21, fired=3, outranked=4, near_miss=0, no_data=0, clean=14,
                ),
            },
            4,
            outcome_patterns=({'key': 'highs_after_meals', 'title': 'Highs after meals', 'subject': 'pattern:highs_after_meals', 'members': [{'subject': 'habit:carb_undercount', 'kind': 'habit', 'k': 4, 'price': 19, 'admitted': True, 'producer': 'scenario', 'lo': 0.1048, 'hi': 0.321, 'seriousness': 'info', 'action': 'habit:carb_undercount', 'admission_basis': 'low_confidence'}, {'subject': 'habit:late_bolus', 'kind': 'habit', 'k': 3, 'price': 19, 'admitted': True, 'producer': 'scenario', 'lo': 0.071, 'hi': 0.2665, 'seriousness': 'info', 'action': 'habit:late_bolus', 'admission_basis': 'low_confidence'}, {'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:carb_undercount', 'habit:late_bolus'], 'n': 21, 'k': 7, 'rate': 0.3333, 'wilson': {'lo': 0.2179, 'hi': 0.473}, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 21, 'gate': 12, 'verdict': 'ready'}, 'settled_price': 19, 'admission_route': 'habit_threshold', 'collapse': 'remain_pattern', 'action': 'habit:carb_undercount', 'seriousness': 'info', 'member_set_fingerprint': '94bea84f7eec2f3c'}, {'key': 'lows_after_meals', 'title': 'Lows after meals', 'subject': 'pattern:lows_after_meals', 'members': [{'subject': 'setting:carb_ratio', 'kind': 'setting', 'k': 0, 'price': 0, 'admitted': False, 'producer': 'tuning_levers', 'lo': None, 'hi': None, 'seriousness': None, 'seriousness_segments': [], 'action': None}], 'rate_levers': ['habit:meal_over_delivery'], 'n': 21, 'k': 0, 'rate': 0.0, 'wilson': {'lo': 0.0, 'hi': 0.0725}, 'wide': False, 'rate_producer': 'exposures', 'readiness': {'count': 21, 'gate': 12, 'verdict': 'ready'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': '13141e472c40a768'}, {'key': 'highs_after_treating_lows', 'title': 'Highs after treating lows', 'subject': 'pattern:highs_after_treating_lows', 'members': [], 'rate_levers': ['habit:over_treated_low'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}, {'key': 'lows_after_correcting_highs', 'title': 'Lows after correcting highs', 'subject': 'pattern:lows_after_correcting_highs', 'members': [], 'rate_levers': ['habit:correction_stacking', 'habit:correction_on_iob'], 'n': 0, 'k': 0, 'rate': None, 'wilson': None, 'wide': True, 'rate_producer': 'exposures', 'readiness': {'count': 0, 'gate': 12, 'verdict': 'withheld'}, 'settled_price': 0, 'admission_route': 'none', 'collapse': 'remain_pattern', 'action': None, 'seriousness': None, 'member_set_fingerprint': 'e3b0c44298fc1c14'}),
        ),
        30,
    ),
)
