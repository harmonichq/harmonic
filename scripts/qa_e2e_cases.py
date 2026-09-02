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

from ciq_autotune.analyze import _BOLUS_LEADIN, analyze
from ciq_autotune.analyzers.scenario import build_scenarios
from ciq_autotune.explore_exposures import build_exposures
from ciq_autotune.findings_projection import WindowQuery, prepare_findings_projection
from ciq_autotune.ic_history_events import prepare_ic_history_events
from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings


WINDOW_DAYS = 30
BASAL_SOURCE_SPAN_DAYS = WINDOW_DAYS + _BOLUS_LEADIN.days + 1
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


def _showcase_recipe(store) -> None:
    _materialize_showcase_background(store)
    _materialize_behavioral_precedence(store)


def _setting_recommendation_recipe(store) -> None:
    _materialize_setting_recommendation(store)


def _behavioral_precedence_recipe(store) -> None:
    _materialize_behavioral_precedence(store)


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
                ("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None),
                ("whole_day", ("ic", "All day")): ExpectedQueueRow("history", None, None),
            },
            frozenset(),
            _SHOWCASE_REST_WINDOWS,
            {"ich1_WzAsMTQ0MCwiMTIiXQ": _showcase_history_series()},
            _SHOWCASE_BEHAVIORAL_ROWS,
            frozenset({"Basal 03:00 to 04:00 · lower", "Carb ratio All day. Past setting.", "Correction on active insulin", "Meal bolus fell short", "Over-treated low"}),
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
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None)},
            frozenset(), frozenset(), {},
            frozenset(),
            frozenset({"Basal 03:00 to 04:00 · lower"}),
        ),
        12,
    ),
    QaCase(
        _BEHAVIORAL_PRECEDENCE,
        _behavioral_precedence_recipe,
        QaExpectation(
            _explicit_rows({}), {}, {}, frozenset(), frozenset(), {},
            _BEHAVIORAL_ROWS,
            frozenset({"Carb undercount", "Correction on active insulin", "Over-treated low"}),
        ),
        5,
    ),
    QaCase(
        "basal-raise",
        partial(_materialize_basal_coverage, clean_rate=0.66),
        QaExpectation(
            _basal_rows({("basal", "03:00"): _BASAL_RAISE}),
            _basal_support("03:00", 30),
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "raise", None)},
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
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None)},
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
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "raise", None)},
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
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None)},
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
                ((180, 240), ("basal", "03:00")): ExpectedQueueRow("held", None, None),
                ((180, 240), ("basal", "03:30")): ExpectedQueueRow("blind", None, None),
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
                ((180, 240), ("basal", "03:00")): ExpectedQueueRow("held", None, None),
                ((180, 240), ("basal", "03:30")): ExpectedQueueRow("blind", None, None),
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
                ((180, 240), ("basal", "00:00")): ExpectedQueueRow("blind", None, None),
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
                ((180, 240), ("basal", "03:00")): ExpectedQueueRow("held", None, None),
                ((180, 240), ("basal", "03:30")): ExpectedQueueRow("blind", None, None),
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
                ((180, 240), ("basal", "03:30")): ExpectedQueueRow("blind", None, None),
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
            {("whole_day", ("basal", "03:00")): ExpectedQueueRow("assert", "lower", None)},
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
            {("whole_day", ("basal", "05:00")): ExpectedQueueRow("assert", "lower", None)},
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
                ((180, 240), ("basal", "03:00")): ExpectedQueueRow("held", None, None),
                ((180, 240), ("basal", "03:30")): ExpectedQueueRow("blind", None, None),
            },
            frozenset({("whole_day", ("basal", "03:00"))}),
            frozenset(), {}, frozenset({
                ("lows", "2024-05-30 03:00:00", "clean"),
                ("lows", "2024-05-31 03:00:00", "clean"),
            }),
            frozenset(),
        ), BASAL_SOURCE_SPAN_DAYS, "basal", ((180, 240),),
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
            if family != case.target_family and _quiet(family, row):
                continue
            key = _analyzer_key(family, row)
            observed_analyzer_rows[key] = _expected_row(family, row)
            observed_support[key] = _support(family, row)
    observed_rows = frozenset(
        (family_name, occurrence["t"], occurrence["state"])
        for family_name, family in execution.exposures["exposures"].items()
        for occurrence in family["occurrences"]
    )
    whole_day = execution.findings["whole_day"]
    observed_titles = frozenset(row["title"] for row in whole_day["rows"])
    observed_queue_rows = {
        (window, key): ExpectedQueueRow(
            row["register"], row.get("direction"), row.get("asserts_move"),
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
