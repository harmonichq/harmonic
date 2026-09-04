"""The separately versioned aggregate eating-sequence report contract (#274).

This module records only aggregate evidence for later detectors.  It neither
constructs sequences from events nor participates in tuning, Plan, or safety.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from math import ceil
from statistics import median, pstdev
from typing import Mapping, Optional, Sequence

from ..events import BolusEvent, CarbEntry, CgmReading
from .eating_sequence_config import EatingSequenceConfig


REPORT_SCHEMA = "eating-sequence-report-v1"
_PERIODS = ("in_sequence", "post_4h", "post_6h")
_SCOPES = ("pooled", "evening")


@dataclass(frozen=True)
class SourceWindow:
    """The only source-window values an aggregate report may serialize."""

    start: str
    end: str
    days: int

    def to_dict(self) -> dict:
        return {"start": self.start, "end": self.end, "days": self.days}


@dataclass(frozen=True)
class SequenceItem:
    """One caller-owned constructed sequence for empirical cohort assignment."""

    carb_total: float
    sequence_start: object


@dataclass(frozen=True)
class QuintileAssignmentRow:
    """One sequence's stable, served 1-based empirical quintile."""

    item: SequenceItem
    quintile: int


@dataclass(frozen=True)
class QuintileAssignment:
    """Source-window quintile assignment and its four user-relative boundaries."""

    rows: tuple[QuintileAssignmentRow, ...]
    boundaries_g: tuple[Optional[float], Optional[float], Optional[float], Optional[float]]


@dataclass(frozen=True)
class MetricRow:
    """One qualifying sequence's already-calculated interval metrics."""

    tir_pct: float
    mean_mgdl: float
    sd_mgdl: float
    peak_mgdl: float


@dataclass(frozen=True)
class IntervalAggregate:
    """Median metrics for qualifying sequences in one report bucket."""

    status: str
    n: int
    tir_pct: Optional[float]
    mean_mgdl: Optional[float]
    sd_mgdl: Optional[float]
    peak_mgdl: Optional[float]

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "n": self.n,
            "tir_pct": self.tir_pct,
            "mean_mgdl": self.mean_mgdl,
            "sd_mgdl": self.sd_mgdl,
            "peak_mgdl": self.peak_mgdl,
        }


@dataclass(frozen=True)
class QuintileRow:
    """All three interval aggregates for one empirical carb quintile."""

    quintile: int
    sequence_n: int
    in_sequence: IntervalAggregate
    post_4h: IntervalAggregate
    post_6h: IntervalAggregate

    def to_dict(self) -> dict:
        return {
            "quintile": self.quintile,
            "sequence_n": self.sequence_n,
            **_period_dict(self),
        }


@dataclass(frozen=True)
class MatrixRow:
    """All three interval aggregates for one quintile and window-count band."""

    carb_quintile: int
    window_count_band: str
    in_sequence: IntervalAggregate
    post_4h: IntervalAggregate
    post_6h: IntervalAggregate

    def to_dict(self) -> dict:
        return {
            "carb_quintile": self.carb_quintile,
            "window_count_band": self.window_count_band,
            **_period_dict(self),
        }


@dataclass(frozen=True)
class HighCarbComparisonRow:
    """A Q5-minus-Q1–Q4 comparison for one scope and interval."""

    scope: str
    period: str
    status: str
    reference_n: int
    high_n: int
    tir_difference_pct_points: Optional[float]
    mean_difference_mgdl: Optional[float]
    sd_difference_mgdl: Optional[float]
    reference_cohort: str = "Q1-Q4"
    high_cohort: str = "Q5"

    def to_dict(self) -> dict:
        return {
            "scope": self.scope,
            "period": self.period,
            "reference_cohort": self.reference_cohort,
            "high_cohort": self.high_cohort,
            **_comparison_dict(self),
        }


@dataclass(frozen=True)
class RepeatComparisonRow:
    """A 3+-minus-1 window-count comparison for one quintile and interval."""

    carb_quintile: int
    period: str
    status: str
    reference_n: int
    repeat_n: int
    tir_difference_pct_points: Optional[float]
    mean_difference_mgdl: Optional[float]
    sd_difference_mgdl: Optional[float]
    reference_band: str = "1"
    repeat_band: str = "3+"

    def to_dict(self) -> dict:
        return {
            "carb_quintile": self.carb_quintile,
            "period": self.period,
            "reference_band": self.reference_band,
            "repeat_band": self.repeat_band,
            "status": self.status,
            "reference_n": self.reference_n,
            "repeat_n": self.repeat_n,
            "tir_difference_pct_points": self.tir_difference_pct_points,
            "mean_difference_mgdl": self.mean_difference_mgdl,
            "sd_difference_mgdl": self.sd_difference_mgdl,
        }


@dataclass(frozen=True)
class QuintileScope:
    """Pooled or evening cohort rows sharing source-window boundaries."""

    boundaries_g: tuple[Optional[float], Optional[float], Optional[float], Optional[float]]
    rows: tuple[QuintileRow, ...]

    def to_dict(self) -> dict:
        return {"boundaries_g": list(self.boundaries_g),
                "rows": [row.to_dict() for row in self.rows]}


@dataclass(frozen=True)
class HighCarbFinding:
    """The optional aggregate-only summary for a high-carb association."""

    summary: str
    scope: str
    period: str

    def to_dict(self) -> dict:
        return {"summary": self.summary, "scope": self.scope, "period": self.period}


@dataclass(frozen=True)
class HighCarbSequenceReport:
    """Q5-versus-Q1–Q4 aggregate evidence, without a setting recommendation."""

    status: str
    finding: Optional[HighCarbFinding]
    pooled: QuintileScope
    evening: QuintileScope
    comparisons: tuple[HighCarbComparisonRow, ...]
    exclusions: Mapping[str, int]

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "finding": self.finding.to_dict() if self.finding is not None else None,
            "scopes": {"pooled": self.pooled.to_dict(), "evening": self.evening.to_dict()},
            "comparisons": [row.to_dict() for row in self.comparisons],
            "exclusions": dict(self.exclusions),
        }


@dataclass(frozen=True)
class RepeatEatingFinding:
    """The optional aggregate-only summary for repeated eating evidence."""

    summary: str
    carb_quintile: int
    period: str

    def to_dict(self) -> dict:
        return {
            "summary": self.summary,
            "carb_quintile": self.carb_quintile,
            "period": self.period,
        }


@dataclass(frozen=True)
class RepeatEatingAmplifierReport:
    """Repeated-window aggregate evidence, without a setting recommendation."""

    status: str
    finding: Optional[RepeatEatingFinding]
    matrix: tuple[MatrixRow, ...]
    comparisons: tuple[RepeatComparisonRow, ...]
    exclusions: Mapping[str, int]

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "finding": self.finding.to_dict() if self.finding is not None else None,
            "matrix": [row.to_dict() for row in self.matrix],
            "comparisons": [row.to_dict() for row in self.comparisons],
            "exclusions": dict(self.exclusions),
        }


@dataclass(frozen=True)
class EatingSequenceReport:
    """Complete aggregate-only report, separately versioned from ``AnalysisResult``."""

    window: SourceWindow
    config: EatingSequenceConfig
    high_carb_sequence: HighCarbSequenceReport
    repeat_eating_amplifier: RepeatEatingAmplifierReport

    def to_dict(self) -> dict:
        return {
            "schema": REPORT_SCHEMA,
            "window": self.window.to_dict(),
            "definitions": _definitions_dict(self.config),
            "high_carb_sequence": self.high_carb_sequence.to_dict(),
            "repeat_eating_amplifier": self.repeat_eating_amplifier.to_dict(),
        }


def assign_quintiles(items: Sequence[SequenceItem], *, config: EatingSequenceConfig) -> QuintileAssignment:
    """Assign caller-owned sequences to stable, served Q1–Q5 cohorts.

    The calculation uses 0-based ranks internally; returned ``quintile`` values are
    1-based for the public report.  Tied carb totals retain every sequence and sort
    by its comparable ``sequence_start`` key.
    """
    ordered = sorted(items, key=lambda item: (item.carb_total, item.sequence_start))
    n = len(ordered)
    if not n:
        return QuintileAssignment((), (None, None, None, None))
    rows = tuple(
        QuintileAssignmentRow(item=item, quintile=min(config.quintile_count - 1,
                                                       index * config.quintile_count // n) + 1)
        for index, item in enumerate(ordered)
    )
    boundaries = tuple(
        (ordered[left].carb_total + ordered[min(left + 1, n - 1)].carb_total) / 2
        for q in range(config.quintile_count - 1)
        for left in [((q + 1) * n + config.quintile_count - 1) // config.quintile_count - 1]
    )
    return QuintileAssignment(rows, boundaries)  # type: ignore[arg-type]


def aggregate_interval(metric_rows: Sequence[MetricRow], *, config: EatingSequenceConfig) -> IntervalAggregate:
    """Aggregate qualifying sequences by metric median, never pooled readings."""
    n = len(metric_rows)
    if n < config.minimum_bucket_n:
        return IntervalAggregate("insufficient", n, None, None, None, None)
    return IntervalAggregate(
        "supported", n,
        median(row.tir_pct for row in metric_rows),
        median(row.mean_mgdl for row in metric_rows),
        median(row.sd_mgdl for row in metric_rows),
        median(row.peak_mgdl for row in metric_rows),
    )


def empty_report(window: SourceWindow, *, config: EatingSequenceConfig | None = None) -> EatingSequenceReport:
    """Return the complete all-insufficient report for an empty source window."""
    config = config or EatingSequenceConfig()
    aggregate = IntervalAggregate("insufficient", 0, None, None, None, None)
    quintile_rows = tuple(
        QuintileRow(quintile, 0, aggregate, aggregate, aggregate)
        for quintile in range(1, config.quintile_count + 1)
    )
    scope = QuintileScope((None, None, None, None), quintile_rows)
    exclusions = {"cgm_coverage": 0, "carb_log_contamination": 0, "next_sequence_overlap": 0}
    high_comparisons = tuple(
        HighCarbComparisonRow(scope_name, period, "insufficient", 0, 0, None, None, None)
        for scope_name in _SCOPES for period in _PERIODS
    )
    matrix = tuple(
        MatrixRow(quintile, band, aggregate, aggregate, aggregate)
        for quintile in range(1, config.quintile_count + 1)
        for band in config.window_count_bands
    )
    repeat_comparisons = tuple(
        RepeatComparisonRow(quintile, period, "insufficient", 0, 0, None, None, None)
        for quintile in range(1, config.quintile_count + 1)
        for period in _PERIODS
    )
    return EatingSequenceReport(
        window, config,
        HighCarbSequenceReport("insufficient", None, scope, scope, high_comparisons, exclusions),
        RepeatEatingAmplifierReport("insufficient", None, matrix, repeat_comparisons, exclusions),
    )


def report_dict(report: EatingSequenceReport) -> dict:
    """Serialize an eating-sequence report to plain JSON-compatible data."""
    return report.to_dict()


to_dict = report_dict


@dataclass(frozen=True)
class _Sequence:
    start: datetime
    end: datetime
    carbs: float
    window_count: int


def build_report(
    boluses: Sequence[BolusEvent], cgm: Sequence[CgmReading], carb_log: Sequence[CarbEntry], *,
    window_start: datetime, window_end: datetime, config: EatingSequenceConfig,
) -> EatingSequenceReport:
    """Build the aggregate-only detector report from complete window-local streams."""
    window = SourceWindow(window_start.isoformat(), window_end.isoformat(),
                          (window_end - window_start).days)
    sequences = _sequences(
        [event for event in boluses if window_start <= event.t <= window_end], config)
    if not sequences:
        return empty_report(window, config=config)
    assignment = assign_quintiles(
        [SequenceItem(sequence.carbs, sequence.start) for sequence in sequences], config=config)
    quintiles = {row.item.sequence_start: row.quintile for row in assignment.rows}
    metrics, exclusions = _metrics(sequences, cgm, carb_log, config)
    scopes = {
        "pooled": sequences,
        "evening": [
            sequence for sequence in sequences
            if config.evening_start_hour <= sequence.start.hour < config.evening_end_hour
        ],
    }
    scope_reports = {
        scope: _scope_report(items, assignment.boundaries_g, quintiles, metrics, config)
        for scope, items in scopes.items()
    }
    comparisons = tuple(
        _comparison(scope, period, scopes[scope], quintiles, metrics, config)
        for scope in _SCOPES for period in _PERIODS
    )
    finding = _finding(comparisons, scopes, quintiles, metrics, config)
    status = "supported" if finding is not None else "insufficient"
    high = HighCarbSequenceReport(status, finding, scope_reports["pooled"],
                                  scope_reports["evening"], comparisons, exclusions)
    empty = empty_report(window, config=config).repeat_eating_amplifier
    return EatingSequenceReport(window, config, high, empty)


def build_eating_sequence_report(store, *, window_days: int = 30,
                                  now: Optional[datetime] = None) -> EatingSequenceReport:
    """Read the shared Scenario bounds, then delegate to the pure event entry."""
    basal = store.basal_events()
    cgm = store.cgm_readings()
    boluses = store.bolus_events()
    carb_log = store.carb_entries()
    times = [event.t for event in basal] + [event.t for event in cgm]
    end = now or (max(times) if times else None) or datetime.now()
    start = end - timedelta(days=window_days)
    within = lambda events: [event for event in events if start <= event.t <= end]
    return build_report(within(boluses), within(cgm), within(carb_log),
                        window_start=start, window_end=end, config=EatingSequenceConfig())


def _sequences(boluses: Sequence[BolusEvent], config: EatingSequenceConfig) -> list[_Sequence]:
    meals = sorted((event for event in boluses if event.carbs is not None and event.carbs > 0),
                   key=lambda event: event.t)
    windows = []
    for event in meals:
        if not windows or event.t - windows[-1][1] > timedelta(minutes=config.window_merge_minutes):
            windows.append([event.t, event.t, event.carbs])
        else:
            windows[-1][1], windows[-1][2] = event.t, windows[-1][2] + event.carbs
    built = []
    for first, last, carbs in windows:
        if not built or first - built[-1][1] > timedelta(hours=config.sequence_gap_hours):
            built.append([first, last, carbs, 1])
        else:
            built[-1][1], built[-1][2], built[-1][3] = last, built[-1][2] + carbs, built[-1][3] + 1
    return [_Sequence(*item) for item in built]


def _metrics(sequences, cgm, carb_log, config):
    values = {}
    exclusions = {
        "cgm_coverage": 0,
        "carb_log_contamination": 0,
        "next_sequence_overlap": 0,
    }
    for index, sequence in enumerate(sequences):
        for period, start, end in _intervals(sequence, config):
            if period != "in_sequence" and index + 1 < len(sequences) and sequences[index + 1].start < end:
                exclusions["next_sequence_overlap"] += 1
                continue
            if any(start <= entry.t < end for entry in carb_log):
                exclusions["carb_log_contamination"] += 1
                continue
            readings = [
                reading.bg for reading in cgm
                if start <= reading.t < end and reading.bg is not None
            ]
            slots = {
                int((reading.t - start).total_seconds() // 300)
                for reading in cgm if start <= reading.t < end
            }
            if len(slots) / ceil((end - start).total_seconds() / 300) < config.cgm_coverage_floor:
                exclusions["cgm_coverage"] += 1
                continue
            if readings:
                values[(sequence.start, period)] = MetricRow(
                    100 * sum(config.tir_low_mgdl <= value <= config.tir_high_mgdl
                              for value in readings) / len(readings),
                    sum(readings) / len(readings), pstdev(readings), max(readings))
    return values, exclusions


def _intervals(sequence, config):
    yield "in_sequence", sequence.start, sequence.end + timedelta(minutes=config.in_sequence_tail_minutes)
    for hours in config.post_horizons_hours:
        yield f"post_{hours}h", sequence.end, sequence.end + timedelta(hours=hours)


def _scope_report(sequences, boundaries, quintiles, metrics, config):
    rows = []
    for quintile in range(1, config.quintile_count + 1):
        members = [s for s in sequences if quintiles[s.start] == quintile]
        aggregates = [
            aggregate_interval(
                [metrics[(s.start, period)] for s in members if (s.start, period) in metrics],
                config=config,
            )
            for period in _PERIODS
        ]
        rows.append(QuintileRow(quintile, len(members), *aggregates))
    return QuintileScope(boundaries, tuple(rows))


def _comparison(scope, period, sequences, quintiles, metrics, config):
    reference = [metrics[(s.start, period)] for s in sequences
                 if quintiles[s.start] < config.quintile_count and (s.start, period) in metrics]
    high = [metrics[(s.start, period)] for s in sequences
            if quintiles[s.start] == config.quintile_count and (s.start, period) in metrics]
    reference_aggregate = aggregate_interval(reference, config=config)
    high_aggregate = aggregate_interval(high, config=config)
    if reference_aggregate.status != "supported" or high_aggregate.status != "supported":
        return HighCarbComparisonRow(scope, period, "insufficient", len(reference), len(high),
                                     None, None, None)
    return HighCarbComparisonRow(
        scope, period, "supported", len(reference), len(high),
        high_aggregate.tir_pct - reference_aggregate.tir_pct,
        high_aggregate.mean_mgdl - reference_aggregate.mean_mgdl,
        high_aggregate.sd_mgdl - reference_aggregate.sd_mgdl,
    )


def _finding(comparisons, scopes, quintiles, metrics, config):
    pooled = {(row.period): row for row in comparisons if row.scope == "pooled"}
    candidates = [row for row in comparisons if row.status == "supported" and (
        row.scope == "pooled" or pooled[row.period].status == "supported")]
    tir = [row for row in candidates if row.tir_difference_pct_points < 0]
    sd = [row for row in candidates if row.sd_difference_mgdl > 0]
    if tir:
        chosen = min(tir, key=lambda row: (row.tir_difference_pct_points,
                                           _PERIODS.index(row.period), row.scope != "pooled"))
        metric = "tir"
    elif sd:
        chosen = max(sd, key=lambda row: (row.sd_difference_mgdl,
                                          -_PERIODS.index(row.period), row.scope == "pooled"))
        metric = "sd"
    else:
        return None
    scope_sequences = scopes[chosen.scope]
    ref_metrics = [
        metrics[(s.start, chosen.period)] for s in scope_sequences
        if quintiles[s.start] < config.quintile_count and (s.start, chosen.period) in metrics
    ]
    high_metrics = [
        metrics[(s.start, chosen.period)] for s in scope_sequences
        if quintiles[s.start] == config.quintile_count and (s.start, chosen.period) in metrics
    ]
    reference = aggregate_interval(ref_metrics, config=config)
    high = aggregate_interval(high_metrics, config=config)
    period_label = {
        "in_sequence": "in-sequence interval",
        "post_4h": "four-hour post-sequence interval",
        "post_6h": "six-hour post-sequence interval",
    }[chosen.period]
    if metric == "tir":
        summary = (f"In {chosen.scope} sequences, the highest-carb fifth spent {high.tir_pct}% of the "
                   f"{period_label} in range against {reference.tir_pct}% for the rest "
                   f"(n = {chosen.high_n} vs {chosen.reference_n})")
    else:
        summary = (f"In {chosen.scope} sequences, the highest-carb fifth's {period_label} glucose spread "
                   f"was {high.sd_mgdl} mg/dL against {reference.sd_mgdl} mg/dL for the rest "
                   f"(n = {chosen.high_n} vs {chosen.reference_n})")
    return HighCarbFinding(summary, chosen.scope, chosen.period)


def _period_dict(row: object) -> dict:
    return {period: getattr(row, period).to_dict() for period in _PERIODS}


def _comparison_dict(row: HighCarbComparisonRow) -> dict:
    return {
        "status": row.status,
        "reference_n": row.reference_n,
        "high_n": row.high_n,
        "tir_difference_pct_points": row.tir_difference_pct_points,
        "mean_difference_mgdl": row.mean_difference_mgdl,
        "sd_difference_mgdl": row.sd_difference_mgdl,
    }


def _definitions_dict(config: EatingSequenceConfig) -> dict:
    return {
        "window_merge_minutes": config.window_merge_minutes,
        "sequence_gap_hours": config.sequence_gap_hours,
        "in_sequence_tail_minutes": config.in_sequence_tail_minutes,
        "post_horizons_hours": list(config.post_horizons_hours),
        "tir_range_mgdl": [config.tir_low_mgdl, config.tir_high_mgdl],
        "cgm_coverage_floor": config.cgm_coverage_floor,
        "minimum_bucket_n": config.minimum_bucket_n,
        "evening_hours": [config.evening_start_hour, config.evening_end_hour],
    }
