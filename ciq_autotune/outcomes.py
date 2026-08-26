"""The Outcome summary — "how am I doing" over a user-selected window (#108/#113).

A second versioned result object, sibling to :class:`~ciq_autotune.result.AnalysisResult`
but with **different semantics**: ``AnalysisResult`` carries analyzer-specific window
semantics (basal slots keep per-slot basal measurement cuts; ISF/I:C measure over
the full requested window while ISF/I:C setting epochs drive caveats/settling);
this is a single flat user-selected window (14 default; 30/90 via the param) with no
trend and no
"vs-previous-period" delta. So it is *not* a field on ``AnalysisResult`` — it is
its own object, its own :data:`SCHEMA_VERSION`, its own CLI + API renderers,
mirroring ``result.py``'s "one versioned result, many renderers" pattern.

Two layers, per ADR 0007:

* **Metrics** — the only genuinely new computation: the 2019 consensus / AGP
  glycemic panel over ``cgm_readings`` (TIR, TBR, TAR, mean glucose, GMI, CV,
  CGM-active %). mg/dL only (v1). The consensus panel wants ≥14 d at ≥70% CGM
  coverage; below that we compute over the *real* span and **label** it with the
  actual day count + coverage % rather than fake a number (the "show the n, never
  blank" culture).

* **Clean rates** — the "wins", **derived, not detected** (ADR 0007). For each
  :class:`~ciq_autotune.analyzers.scenario.levers.Exposure`
  (meals / lows / correction clusters / highs), ``clean_rate = 1 − (attributed
  occurrences / population count)``. It rides the existing #58 Wilson machinery
  (:class:`~ciq_autotune.uncertainty.Confidence`): ``n`` = exposure count, ``k`` =
  attributed occurrences, so a thin population shows a **wide** interval, never a
  blank.
  It reuses the scenario engine's tally-only path
  (:func:`~ciq_autotune.analyzers.scenario.tally_attributions`) — exposure counts +
  lever attribution, **skipping** the expensive per-episode narration / window
  building.

Frozen dataclasses of plain data, JSON-serializable end to end via ``to_dict``.
"""

from __future__ import annotations

import json
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from .analyzers.scenario import (
    Exposure,
    low_prompt_answers,
    tally_attributions,
)
from .analyzers.scenario.evidence_population import policy_for
from .false_low import drop_readings, false_low_spans
from .uncertainty import Confidence

# Bump on any breaking change to the shapes below; a frontend keys off this.
SCHEMA_VERSION = 1

DISCLAIMER = (
    "Advisory only — not medical advice. Glycemic metrics follow the 2019 "
    "consensus (AGP) targets; clean rates are derived complements of the app's "
    "own attributions, shown with their uncertainty. Discuss any change with "
    "your endocrinologist."
)

# 2019 consensus / AGP thresholds (mg/dL). v1 is mg/dL only.
TIR_LOW = 70.0        # in-range floor
TIR_HIGH = 180.0      # in-range ceiling
TBR_L1 = 70.0         # below-range level 1 (<70)
TBR_L2 = 54.0         # below-range level 2 (<54, clinically significant)
TAR_L1 = 180.0        # above-range level 1 (>180)
TAR_L2 = 250.0        # above-range level 2 (>250)

# The CGM's nominal cadence — one reading every 5 minutes → 288/day. CGM-active %
# is observed readings vs. this expected count over the span (issue #113).
CGM_CADENCE_MIN = 5.0
_EXPECTED_PER_DAY = (24 * 60) / CGM_CADENCE_MIN  # 288

# Consensus coverage gate: the AGP panel is only representative with ≥14 days of
# data at ≥70% CGM coverage. Below either bar we still compute the panel over the
# real span but flag it as sub-threshold and label the shortfall (never fake it).
CONSENSUS_MIN_DAYS = 14.0
CONSENSUS_MIN_COVERAGE = 0.70
# The data span is measured from the first reading in the window, which almost
# never lands exactly on the ``now − window`` boundary (egv times aren't grid-
# aligned to it), so a full window's span comes in a hair under the requested
# days — 37 s under 14 d. Tolerate a shortfall of up to one CGM
# interval: within one reading of the full window IS the full window, not a
# missing day. A genuine gap (more than one interval) still falls sub-threshold.
CONSENSUS_SPAN_TOLERANCE_DAYS = CGM_CADENCE_MIN / (24 * 60)  # one 5-min interval


@dataclass(frozen=True)
class GlycemicMetrics:
    """The 2019 consensus / AGP glycemic panel over the window (mg/dL, v1).

    All percentages are 0–100 floats. ``n_readings`` is the count of CGM readings
    with a value behind the panel; ``mean_glucose`` / ``gmi`` / ``cv`` are ``None``
    when there is no data (never a fabricated zero).
    """

    n_readings: int
    tir: Optional[float]        # % 70–180
    tbr_lvl1: Optional[float]   # % <70
    tbr_lvl2: Optional[float]   # % <54
    tar_lvl1: Optional[float]   # % >180
    tar_lvl2: Optional[float]   # % >250
    mean_glucose: Optional[float]
    gmi: Optional[float]        # Glucose Management Indicator (est. A1c-analog, %)
    cv: Optional[float]         # coefficient of variation (%)

    def to_dict(self) -> dict:
        return {
            "n_readings": self.n_readings,
            "tir": self.tir,
            "tbr_lvl1": self.tbr_lvl1,
            "tbr_lvl2": self.tbr_lvl2,
            "tar_lvl1": self.tar_lvl1,
            "tar_lvl2": self.tar_lvl2,
            "mean_glucose": self.mean_glucose,
            "gmi": self.gmi,
            "cv": self.cv,
        }


@dataclass(frozen=True)
class Coverage:
    """How much real data backs the panel, and whether it clears the consensus gate.

    ``days`` is the actual span length (window end − first reading, clamped to the
    selected window); ``cgm_active`` is observed-vs-expected 5-min readings over that
    span (0–100 %). ``consensus`` is true only when the panel clears **both** the
    ≥14-day and ≥70%-coverage bars — otherwise the panel is computed over the real
    span and this labels the shortfall so a renderer shows "12 d @ 61%", not a fake
    representative number.
    """

    days: float
    cgm_active: float           # % of expected 5-min readings actually present
    consensus: bool
    min_days: float = CONSENSUS_MIN_DAYS
    min_coverage: float = CONSENSUS_MIN_COVERAGE

    def to_dict(self) -> dict:
        return {
            "days": round(self.days, 2),
            "cgm_active": round(self.cgm_active, 1),
            "consensus": self.consensus,
            "min_days": self.min_days,
            "min_coverage": round(self.min_coverage * 100, 1),
        }


@dataclass(frozen=True)
class CleanRate:
    """One exposure's derived "win": the fraction of opportunities that drew no
    negative lever (ADR 0007).

    ``exposure`` is the denominator kind (meals / lows / …); ``clean`` is
    ``1 − rate`` where ``rate`` is the Wilson point estimate of ``k`` attributed
    episodes out of ``n`` opportunities. ``confidence`` carries the whole #58
    ``k``-of-``n`` object, so a thin exposure surfaces a wide interval (``clean_lo``
    / ``clean_hi`` are the complement bounds), never a blank. ``clean`` /
    ``clean_lo`` / ``clean_hi`` are 0–1 fractions.
    """

    exposure: str
    n: int                      # exposure count (opportunities)
    attributed: int             # episodes attributed a negative lever (k)
    clean: float                # 1 − rate
    clean_lo: float             # 1 − hi (complement flips the interval)
    clean_hi: float             # 1 − lo
    confidence: Confidence

    @property
    def wide(self) -> bool:
        return self.confidence.wide

    def to_dict(self) -> dict:
        return {
            "exposure": self.exposure,
            "n": self.n,
            "attributed": self.attributed,
            "clean": round(self.clean, 4),
            "clean_lo": round(self.clean_lo, 4),
            "clean_hi": round(self.clean_hi, 4),
            "wide": self.wide,
            "confidence": self.confidence.to_dict(),
        }


@dataclass(frozen=True)
class OutcomeSummary:
    """The whole outcome summary — one flat window, versioned, JSON-serializable."""

    schema_version: int
    generated_at: str
    window_days: int
    span_start: Optional[str]
    span_end: Optional[str]
    metrics: GlycemicMetrics
    coverage: Coverage
    clean_rates: List[CleanRate] = field(default_factory=list)
    disclaimer: str = DISCLAIMER

    def to_dict(self) -> dict:
        return {
            "schema_version": self.schema_version,
            "generated_at": self.generated_at,
            "window_days": self.window_days,
            "span_start": self.span_start,
            "span_end": self.span_end,
            "metrics": self.metrics.to_dict(),
            "coverage": self.coverage.to_dict(),
            "clean_rates": [c.to_dict() for c in self.clean_rates],
            "disclaimer": self.disclaimer,
        }

    def to_json(self, indent: Optional[int] = None) -> str:
        return json.dumps(self.to_dict(), indent=indent)


# --- metrics ---------------------------------------------------------------


def _pct(count: int, total: int) -> Optional[float]:
    return round(100.0 * count / total, 1) if total else None


def compute_metrics(readings) -> GlycemicMetrics:
    """The 2019 consensus / AGP glycemic panel from a sequence of CGM readings.

    ``readings`` are :class:`~ciq_autotune.events.CgmReading` (or anything with a
    ``.bg``); ``None`` bg values are dropped. Pure function of its inputs — no
    store, no clock — so it is fully unit-testable on a synthetic series.
    """
    vals = [float(r.bg) for r in readings if getattr(r, "bg", None) is not None]
    n = len(vals)
    if n == 0:
        return GlycemicMetrics(
            n_readings=0, tir=None, tbr_lvl1=None, tbr_lvl2=None,
            tar_lvl1=None, tar_lvl2=None, mean_glucose=None, gmi=None, cv=None,
        )
    in_range = sum(1 for v in vals if TIR_LOW <= v <= TIR_HIGH)
    below1 = sum(1 for v in vals if v < TBR_L1)
    below2 = sum(1 for v in vals if v < TBR_L2)
    above1 = sum(1 for v in vals if v > TAR_L1)
    above2 = sum(1 for v in vals if v > TAR_L2)
    mean = statistics.fmean(vals)
    # GMI (mg/dL formula, Bergenstal 2018) — an A1c-analog derived from mean glucose.
    gmi = round(3.31 + 0.02392 * mean, 1)
    # CV = SD / mean × 100. Needs ≥2 points for a sample stdev; a single reading has
    # no dispersion, so CV is None (honest — not a fabricated 0).
    cv = round(100.0 * statistics.stdev(vals) / mean, 1) if n >= 2 and mean else None
    return GlycemicMetrics(
        n_readings=n,
        tir=_pct(in_range, n),
        tbr_lvl1=_pct(below1, n),
        tbr_lvl2=_pct(below2, n),
        tar_lvl1=_pct(above1, n),
        tar_lvl2=_pct(above2, n),
        mean_glucose=round(mean, 1),
        gmi=gmi,
        cv=cv,
    )


def compute_coverage(readings, *, span_days: float) -> Coverage:
    """CGM-active % over ``span_days`` and whether the panel clears the consensus gate.

    CGM-active = observed readings / expected 5-min readings over the span. The gate
    needs ≥14 days (within one CGM interval — see
    ``CONSENSUS_SPAN_TOLERANCE_DAYS``) AND ≥70% coverage; below either, ``consensus``
    is False and a renderer labels the real ``days`` / ``cgm_active`` instead of
    implying a representative panel.
    """
    n = sum(1 for r in readings if getattr(r, "bg", None) is not None)
    expected = _EXPECTED_PER_DAY * span_days if span_days > 0 else 0.0
    active = 100.0 * n / expected if expected > 0 else 0.0
    # Cap at 100 — a denser-than-cadence backfill or a slightly short span estimate
    # can nudge the ratio a hair over 1.0; the panel is still "fully covered".
    active = min(active, 100.0)
    consensus = (
        span_days >= CONSENSUS_MIN_DAYS - CONSENSUS_SPAN_TOLERANCE_DAYS
        and active >= CONSENSUS_MIN_COVERAGE * 100
    )
    return Coverage(days=span_days, cgm_active=active, consensus=consensus)


# --- clean rates (ADR 0007) ------------------------------------------------


# Stable render order — meals, lows, correction clusters, highs — regardless of dict
# ordering. Mirrors the Exposure enum declaration.
_EXPOSURE_ORDER = [
    Exposure.MEALS,
    Exposure.LOWS,
    Exposure.CORRECTION_CLUSTERS,
    Exposure.HIGHS,
]


def compute_clean_rates(
    exposure_counts: Dict[Exposure, int],
    attributed_by_lever: Dict,
) -> List[CleanRate]:
    """Derive a :class:`CleanRate` per exposure from the tally-only counts (ADR 0007).

    ``exposure_counts`` (``n`` per exposure) and ``attributed_by_lever`` (``k`` per
    lever) come from :func:`~ciq_autotune.analyzers.scenario.tally_attributions`.
    Attributed occurrences are rolled up through each lever's recurrence-population
    policy. Custom populations use their policy noun to select the matching flat
    account, so Meal bolus fell short is charged to meals rather than highs. Then
    ``clean = 1 − wilson_rate(k, n)`` with the interval flipped
    (``clean_lo = 1 − hi``). Rides #58's Wilson so a thin exposure is wide, never
    blank.
    """
    attributed_by_exposure: Dict[Exposure, int] = {e: 0 for e in _EXPOSURE_ORDER}
    for lever, k in attributed_by_lever.items():
        policy = policy_for(lever)
        exp = policy.recurrence_family or Exposure(policy.recurrence_noun)
        attributed_by_exposure[exp] = attributed_by_exposure.get(exp, 0) + k

    out: List[CleanRate] = []
    for exp in _EXPOSURE_ORDER:
        n = exposure_counts.get(exp, 0)
        k = attributed_by_exposure.get(exp, 0)
        # k can never exceed n by construction (each attributed episode is one
        # opportunity), but clamp defensively so the complement stays in [0, 1].
        k = min(k, n)
        conf = Confidence(n=n, k=k, effect=1.0)
        out.append(
            CleanRate(
                exposure=exp.value,
                n=n,
                attributed=k,
                clean=1.0 - conf.rate,
                clean_lo=1.0 - conf.hi,
                clean_hi=1.0 - conf.lo,
                confidence=conf,
            )
        )
    return out


# --- top-level assembly ----------------------------------------------------


def _span_days(readings, start: datetime, end: datetime) -> float:
    """The real data span (days) inside the window: from the first reading present to
    ``end``, capped at the selected window. Empty data → 0 days."""
    times = [r.t for r in readings if getattr(r, "bg", None) is not None]
    if not times:
        return 0.0
    first = max(min(times), start)
    span = (end - first).total_seconds() / 86400.0
    window = (end - start).total_seconds() / 86400.0
    return max(0.0, min(span, window))


def summarize_outcomes(
    store,
    *,
    window_days: int = 14,
    now: Optional[datetime] = None,
) -> OutcomeSummary:
    """Build the outcome summary for ``store``'s most recent ``window_days`` window.

    The store-facing entry (the API + CLI call this). Reads CGM / bolus / basal over
    the window, computes the objective metrics + coverage from the CGM series, and
    derives the clean rates from the scenario engine's tally-only path (exposure
    counts + lever attribution, no narration). ``now`` defaults to the latest data
    instant (so a static DB summarizes its own tail, not wall-clock "now"); pass it
    for deterministic tests.
    """
    basal = store.basal_events()
    cgm = store.cgm_readings()
    bolus = store.bolus_events()

    times = [e.t for e in basal] + [r.t for r in cgm] + [b.t for b in bolus]
    span_end = max(times) if times else None
    now = now or span_end or datetime.now()
    start = now - timedelta(days=window_days)

    # False-low reading invalidation (adr-381), applied full-response before the clean
    # rate or glycemic panel forms — mirrors outcomes_trend.py so the flat summary and
    # the trend agree on the same data (#532). Not endpoint-filtered: a flagged
    # excursion drops out however late it was flagged. Resolved off the whole span, and
    # after the window bounds above, which stay on the full series — so flagging a low
    # at the tail of the data cannot slide the window the summary reports.
    cgm = drop_readings(cgm, false_low_spans(cgm, store.prompt_responses()))

    w_cgm = [r for r in cgm if start <= r.t <= now]
    w_bolus = [b for b in bolus if start <= b.t <= now]
    w_basal = [e for e in basal if start <= e.t <= now]

    metrics = compute_metrics(w_cgm)
    coverage = compute_coverage(w_cgm, span_days=_span_days(w_cgm, start, now))

    isf = _effective_isf(store, w_bolus, w_basal, w_cgm)
    exposure_counts, attributed = tally_attributions(
        w_bolus, w_cgm, w_basal, isf=isf,
        low_answers=low_prompt_answers(store, start, now),
    )
    clean_rates = compute_clean_rates(exposure_counts, attributed)

    fmt = "%Y-%m-%d %H:%M:%S"
    cgm_times = [r.t for r in w_cgm]
    return OutcomeSummary(
        schema_version=SCHEMA_VERSION,
        generated_at=now.strftime(fmt),
        window_days=window_days,
        span_start=min(cgm_times).strftime(fmt) if cgm_times else None,
        span_end=max(cgm_times).strftime(fmt) if cgm_times else None,
        metrics=metrics,
        coverage=coverage,
        clean_rates=clean_rates,
    )


def _effective_isf(store, bolus, basal, cgm):
    """The effective ISF for carb-undercount, mirroring the scenario engine.

    Each meal supplies its historical Dose-stamped I:C. Best-effort: if the ISF
    analyzer cannot run, return ``None`` and carb-undercount stays unjudged.
    """
    from . import settings as settings_mod
    from .analyzers.isf import analyze_isf

    snaps = store.settings_snapshots()
    if not snaps:
        return None
    try:
        isf_rows = analyze_isf(bolus, basal, cgm, settings_mod.active_schedule(snaps, "isf"))
        return settings_mod.effective_isf(isf_rows, snaps)
    except Exception:
        return None


# --- CLI renderer (mirrors report.py's markdown renderer) -------------------


def _fmt_pct(x: Optional[float]) -> str:
    return f"{x:.1f}%" if x is not None else "—"


def _fmt_num(x: Optional[float], nd: int = 1) -> str:
    return f"{x:.{nd}f}" if x is not None else "—"


def markdown_outcomes(summary: OutcomeSummary) -> str:
    """Render an :class:`OutcomeSummary` as markdown (the CLI ``outcomes`` view).

    One versioned result, two renderers (CLI here, API JSON in ``api.py``) — the
    same pattern ``report.py`` uses over ``AnalysisResult``."""
    s = summary
    m = s.metrics
    c = s.coverage
    out: List[str] = []
    out.append("# Control-IQ Autotune — outcome summary")
    out.append("")
    out.append(f"> **{s.disclaimer}**")
    out.append("")
    out.append(f"- Window: {s.window_days}d · span `{s.span_start}` → `{s.span_end}`")
    out.append(f"- Generated {s.generated_at}")
    out.append("")

    # Coverage gate — always shown, so a sub-threshold panel is honestly labelled.
    if c.consensus:
        out.append(
            f"_Consensus panel: {c.days:.0f} d at {c.cgm_active:.0f}% CGM-active "
            f"(≥{c.min_days:.0f} d, ≥{c.min_coverage * 100:.0f}%)._"
        )
    else:
        out.append(
            f"> ⚠ Below the consensus gate (needs ≥{c.min_days:.0f} d at "
            f"≥{c.min_coverage * 100:.0f}% CGM-active). Computed over the real span: "
            f"**{c.days:.1f} d at {c.cgm_active:.0f}% CGM-active** — read as indicative, "
            "not representative."
        )
    out.append("")

    out.append("## Glycemic metrics (mg/dL)")
    out.append("")
    out.append("| Metric | Value |")
    out.append("|--------|------:|")
    out.append(f"| Time in range (70–180) | {_fmt_pct(m.tir)} |")
    out.append(f"| Time below range (<70) | {_fmt_pct(m.tbr_lvl1)} |")
    out.append(f"| Time below range (<54) | {_fmt_pct(m.tbr_lvl2)} |")
    out.append(f"| Time above range (>180) | {_fmt_pct(m.tar_lvl1)} |")
    out.append(f"| Time above range (>250) | {_fmt_pct(m.tar_lvl2)} |")
    out.append(f"| Mean glucose | {_fmt_num(m.mean_glucose)} |")
    out.append(f"| GMI | {_fmt_pct(m.gmi)} |")
    out.append(f"| CV | {_fmt_pct(m.cv)} |")
    out.append(f"| CGM-active | {c.cgm_active:.0f}% |")
    out.append(f"| Readings | {m.n_readings} |")
    out.append("")

    out.append("## Clean rates — your wins")
    out.append("")
    out.append(
        "_Derived complements of the app's attributions: the fraction of "
        "each opportunity that drew no flagged issue. Thin exposures show a wide "
        "interval, never a blank._"
    )
    out.append("")
    out.append("| Exposure | Clean | 80% CI | n | Flagged |")
    out.append("|----------|------:|--------|--:|--------:|")
    for cr in s.clean_rates:
        flag = " ~wide" if cr.wide else ""
        ci = f"{cr.clean_lo * 100:.0f}–{cr.clean_hi * 100:.0f}%{flag}"
        out.append(
            f"| {cr.exposure.replace('_', ' ')} | {cr.clean * 100:.0f}% | {ci} | "
            f"{cr.n} | {cr.attributed} |"
        )
    out.append("")
    return "\n".join(out)
