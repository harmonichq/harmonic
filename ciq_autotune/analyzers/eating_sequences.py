"""The separately versioned aggregate eating-sequence report contract (#274).

This module records only aggregate evidence for later detectors.  It neither
constructs sequences from events nor participates in tuning, Plan, or safety.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Mapping, Optional, Sequence

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
