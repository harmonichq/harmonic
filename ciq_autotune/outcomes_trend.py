"""The Outcomes **trend** — a behavioral + glycemic scorecard across rolling windows (#131).

A third versioned result object, sibling to :class:`~ciq_autotune.outcomes.OutcomeSummary`
but trend-first: where the Outcome summary is one flat window with no movement, this
tiles the data into a sequence of equal ``window_days`` windows (oldest→newest,
index-aligned) and emits, per behavior and per glycemic metric, a **series** across
them — so the frontend can show "am I pre-bolusing better than last window", "have my
overnight lows trended down". It supersedes the snapshot-only framing of #108.

Like :mod:`~ciq_autotune.outcomes` it is **standalone**, NOT a field on
:class:`~ciq_autotune.result.AnalysisResult` (which carries analyzer-specific window
semantics — basal keeps per-slot basal measurement cuts, while ISF/I:C measure
over the full requested window and use ISF/I:C setting epochs for
caveats/settling). Its own
:data:`SCHEMA_VERSION`, its own CLI + API renderers, mirroring ``result.py``'s "one
versioned result, many renderers" pattern.

Two correctness rules this module is built around (issue #131):

* **Fixed ISF.** Every window's behavior attribution is judged against the **constant
  current-profile ISF**, held identical across all windows — never the
  per-window ``analyze_isf`` estimate, which swings ~3× on 14 d and injects a phantom
  ``carb_undercount`` (while starving ``late_bolus``). A behavior trend must reflect
  behavior, not estimator noise. Carb-undercount uses each meal's Dose-stamped I:C;
  an unstamped historical meal stays unknown rather than borrowing today's profile.

* **Honest denominators.** Each behavior keeps its **own** exposure denominator
  (``missed_meal`` on highs, ``correction_stacking`` on correction-pairs) even where
  the locked UI displays it under a different affinity group (Meals / Lows). The
  ``exposure`` field is the true denominator; grouping is the frontend's job.

``correction_stacking`` is special (#131's resolved caveat): its outcome-gated verdict
scores a green "~never" on real data — perfection at a thing done constantly — because
the *harm* it causes is far rarer than the *behavior* it is. So its series carries two
numerators over the shared correction-pairs denominator: ``attributed`` = the
**behavior** count (the row's headline rate) and ``harm`` = the outcome-gated count
(demoted to sub-text). See :func:`~ciq_autotune.analyzers.classifiers.correction_stacking.count_correction_stacks`.

Frozen dataclasses of plain data, JSON-serializable end to end via ``to_dict``.
"""

from __future__ import annotations

import bisect
import json
import math
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Dict, List, Optional, Sequence, Union

if TYPE_CHECKING:  # avoid an import cycle — watched_change calls back into this module
    from .watched_change import FocusView, TrialView

from .analyzers.classifiers.correction_stacking import count_correction_stacks
from .analyzers.classifiers.user_override import count_overrides
from .analyzers.scenario_config import ScenarioConfig
from .analyzers.ic import TARGET_BG, IcConfig, meal_start_bg
from .analyzers.scenario import (
    LEVER_EXPOSURE,
    Lever,
    compute_preempted_lows,
    low_prompt_answers,
    tally_attributions,
)
from .analyzers.scenario.anchors import _is_meal
from .false_low import drop_readings, false_low_spans
from .analyzers.scenario.levers import recommendation, title
from .analyzers.scenario.preempted import is_preempted_low_entry
from .model import _CgmSeries
from .outcomes import TBR_L1, _EXPECTED_PER_DAY, compute_metrics
from .rescue_evidence import (
    eligible_carb_entries,
    first_observation,
    observe,
)
from .rest_window import detect_rest_windows

# Bump on any breaking change to the shapes below; the frontend keys off this.
# v2 (#196): the net-new post-meal spike metric is replaced by the post-meal ARC —
# a paired peak + subsequent-nadir series carried in a new top-level ``arc`` object
# (ADR 0018). The ``spike`` metric row and ``POST_MEAL_SPIKE_HORIZON_MIN`` are gone.
# v3 (#244): a single optional ``watched_change`` object — the active Trial or Focus
# (ADR 0029), or null when nothing is watched. Never a Trial *and* a Focus.
# v4 (#317): ``arc.rescue_context`` adds display-only logged rescue-carb context
# for meal-tail entries, separate from the aggregate ``arc.preempted`` count.
# v5 (#302): a single optional ``pre_meal`` object — the per-window median pre-meal
# starting BG (``bg0``) vs Control-IQ's fixed target, the meals-start-high signal as a
# rolling trend. Mirrors the arc's thin-window gate; a below-gate window emits a gap.
# v6 (#327): ``overnight_lows`` moves the old evening-dose attribution out of the
# behavioral Lever taxonomy and into Verify as an objective per-rest-window outcome.
# v7 (#377): ``overnight_lows.cleared`` — whether the newest window-over-window change
# in the nights-with-a-low day-rate clears the adr-364 day-level significance bar
# (Newcombe interval excludes zero AND two-sided Fisher exact < 0.05). This is the ONE
# outcome carrying binary day-level counts, so it is the only outcome the Verify digest
# can gate on for a "what changed" headline chip (adr-365 §2). Continuous metrics
# (TIR, mean, the arc medians) carry no day-level test and never headline.
# v8 (#392): ``profile_ic`` becomes the active programmed schedule's real min/max
# bounds instead of an invented entry-count median. Meal attribution is independent
# of this display field and uses each meal's Dose-stamped I:C.
# v9 (#467): ``arc.observed_days`` — per window, how many of its days the manual rescue
# log was actually recording. The rescue-dependent series (``arc.preempted`` /
# ``arc.rescue_context``) now also replay observation-aware: an entry counts in a window
# only once it had been *recorded* by that window's endpoint, so a rescue logged
# retrospectively today no longer appears in a window that closed before it existed.
# v10 (#467): ``arc.rescue_evidence`` — per window, the full observation object beside
# ``observed_days``: coverage plus the four rescue-evidence states (confirmed rescue /
# explicit no / not sure / no recorded observation), so each Outcomes window names what
# the rescue log knew, not just how many days it was watching (ADR 467).
SCHEMA_VERSION = 10

# How much context to pad each window slice by when judging correction stacks and the
# post-meal arc, so an anchor near a window edge still sees the boluses/CGM around it.
# Covers the IOB DIA (300 min), the stack low-lookahead (240 min), and the arc nadir
# horizon (360 min) — mirrors ``engine._CONTEXT_PAD_MIN``.
_CONTEXT_PAD_MIN = 300.0

# Post-meal arc windows (ADR 0018), both anchored at the meal bolus and both truncated
# at the next carb-tagged bolus:
#   peak  = max CGM in (bolus, bolus + 3 h]
#   nadir = min CGM in (peak_time, bolus + 6 h]
ARC_PEAK_HORIZON_MIN = 180.0
ARC_NADIR_HORIZON_MIN = 360.0
# A meal whose arc was truncated to under 3 h cannot tell a crash story — it is dropped
# from the NADIR series (its peak half is still valid). The peak series keeps all meals.
ARC_MIN_NADIR_SPAN_MIN = 180.0
# Thin-data gate (ADR 0018 §5): a window needs this many qualifying meals in a series
# before it renders a median; below it the window emits ``None`` (a gap), never a value.
ARC_MIN_MEALS = 5
_DATE_FMT = "%Y-%m-%d"

# The behaviors, in the locked render order (issue #131's "Shape"). Each keeps its own
# honest exposure via ``LEVER_EXPOSURE`` — the affinity regrouping (Meals / Lows) the
# UI does is presentation, not denominator.
_BEHAVIOR_ORDER = [
    Lever.LATE_BOLUS,
    Lever.CARB_UNDERCOUNT,
    Lever.MEAL_OVER_DELIVERY,
    Lever.OVER_TREATED_LOW,
    Lever.CORRECTION_ON_IOB,
    Lever.CORRECTION_STACKING,
    Lever.MISSED_MEAL,
]

# The override-rate tile (#161) is NOT a scenario Lever — it is provenance, not a low
# attribution (ADR 0015), so it carries its own identity here rather than through
# ``LEVER_EXPOSURE`` / ``scenario.levers``. Its denominator is **every bolus** in the
# window (how often, across all your dosing, you override the pump up), and it rides in
# ``lows`` display-affinity like ``correction_stacking`` (an override-up's harm is a
# lows story). ``harm`` = how many of those overrides preceded a low.
OVERRIDE_LEVER = "user_override"
OVERRIDE_TITLE = "Doses above pump calculation"
OVERRIDE_EXPOSURE = "boluses"
# The override tile carries no baked coaching prose (issue #420): its copy is a bounded,
# factual evidence summary the frontend builds from this tile's own payload numbers
# (counts, plus the harm threshold + look-ahead surfaced below). No claim about why the
# pump calculated its correction, and no dosing instruction. Kept empty here so the
# generic ``recommendation`` slot stays honest for the tile.
OVERRIDE_RECOMMENDATION = ""

# Thin-data gate (ADR 0015 §2): the tile stays silent until there is a real handful of
# overrides across the tracked history, mirroring the app's confidence-blanking — no
# n=2 headline. Below this total, the override BehaviorTrend is omitted entirely.
MIN_OVERRIDES_TO_SHOW = 5

# The glycemic metrics, in the locked render order. ``extract`` pulls the per-window
# value off a :class:`~ciq_autotune.outcomes.GlycemicMetrics`; ``spike`` is computed
# separately (post-meal, net-new) and injected. ``polarity`` drives the frontend's
# "green always means better for you" per-row coloring.
@dataclass(frozen=True)
class _MetricSpec:
    key: str
    title: str
    unit: str
    polarity: str
    range: Optional[str]


_METRIC_SPECS = [
    _MetricSpec("tir", "Time in range", "%", "up_good", "70–180"),
    _MetricSpec("tbr", "Time below range", "%", "down_good", "<70"),
    _MetricSpec("mean", "Mean glucose", "mg/dL", "down_good", None),
    _MetricSpec("cv", "Glucose variability (CV)", "%", "down_good", None),
]


# --- the day-level significance bar (adr-364 / adr-365 §2) ------------------
#
# A "what changed" headline may fire only when a two-arm day-rate comparison clears
# BOTH: its 95% Newcombe score interval for the rate difference excludes zero, AND its
# two-sided Fisher exact result is below 0.05 (adr-364's Sunday-lows gate). The interval
# communicates the effect's uncertainty; the exact result avoids a large-sample
# approximation that under-covers at the tens-of-days scale the digest works at. These
# are pure functions of four counts so they are unit-testable against adr-364's six
# kills (the fixtures that must NOT clear).

_NEWCOMBE_Z = 1.959963984540054  # the 95% two-sided normal quantile


def _wilson_bounds(k: int, n: int, z: float = _NEWCOMBE_Z) -> tuple:
    """The Wilson score interval (lower, upper) for a single proportion ``k / n``."""
    if n <= 0:
        return 0.0, 1.0
    p = k / n
    z2 = z * z
    denom = 1.0 + z2 / n
    centre = p + z2 / (2 * n)
    half = z * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))
    return (centre - half) / denom, (centre + half) / denom


def newcombe_diff_interval(k1: int, n1: int, k2: int, n2: int, z: float = _NEWCOMBE_Z) -> tuple:
    """Newcombe's score interval (method 10) for the difference ``p1 − p2``.

    Small-sample-safe where the ordinary normal interval under-covers (adr-364 chose it
    for exactly this reason at 22 Sundays). Returns ``(lower, upper)``.
    """
    if n1 <= 0 or n2 <= 0:
        return -1.0, 1.0
    p1, p2 = k1 / n1, k2 / n2
    l1, u1 = _wilson_bounds(k1, n1, z)
    l2, u2 = _wilson_bounds(k2, n2, z)
    lower = (p1 - p2) - math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2)
    upper = (p1 - p2) + math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)
    return lower, upper


def fisher_exact_two_sided(a: int, b: int, c: int, d: int) -> float:
    """The two-sided Fisher exact p-value for the 2×2 table ``[[a, b], [c, d]]``.

    Sums the hypergeometric probability of every table with the same margins whose
    probability is no greater than the observed table's (the standard two-sided test).
    Pure ``math.comb`` — no SciPy dependency (core stays stdlib-only).
    """
    r1, r2 = a + b, c + d
    c1 = a + c
    n = a + b + c + d
    if n == 0:
        return 1.0

    def hyper(x: int) -> float:
        return (
            math.comb(r1, x) * math.comb(r2, c1 - x) / math.comb(n, c1)
        )

    lo = max(0, c1 - r2)
    hi = min(r1, c1)
    p_obs = hyper(a)
    tol = p_obs * (1 + 1e-7)
    return min(1.0, sum(hyper(x) for x in range(lo, hi + 1) if hyper(x) <= tol))


def day_rate_clears(k1: int, n1: int, k2: int, n2: int) -> bool:
    """Whether two day-rates (``k1/n1`` vs ``k2/n2``) differ at the adr-364 bar.

    True iff the 95% Newcombe interval for the difference excludes zero AND the
    two-sided Fisher exact result is below 0.05. Either arm empty → not cleared.
    """
    if n1 <= 0 or n2 <= 0:
        return False
    lo, hi = newcombe_diff_interval(k1, n1, k2, n2)
    interval_excludes_zero = lo > 0 or hi < 0
    p = fisher_exact_two_sided(k1, n1 - k1, k2, n2 - k2)
    return interval_excludes_zero and p < 0.05


def _overnight_lows_cleared(low_n: Sequence[int], n: Sequence[int]) -> bool:
    """Does the newest window-over-window move in the nights-with-a-low rate clear?

    Scans newest→oldest for the two most-recent windows that actually detected a Rest
    window (``n > 0``) and prices their day-rates against :func:`day_rate_clears`. A
    window with no Rest windows is a gap, skipped — never a fabricated zero-rate arm.
    """
    populated = [i for i in range(len(n)) if n[i] > 0]
    if len(populated) < 2:
        return False
    cur, prior = populated[-1], populated[-2]
    return day_rate_clears(low_n[cur], n[cur], low_n[prior], n[prior])


# --- payload dataclasses ---------------------------------------------------


@dataclass(frozen=True)
class WindowMeta:
    """One rolling window's identity: its date bounds, CGM coverage, and span.

    ``cgm_active`` is a 0–1 fraction of the expected 5-min readings actually present
    over the full ``days``-day span (capped at 1.0) — the honest "how much data backs
    this window" the frontend dims thin windows by. ``start`` / ``end`` are dates.
    """

    start: str
    end: str
    cgm_active: float
    days: float

    def to_dict(self) -> dict:
        return {
            "start": self.start,
            "end": self.end,
            "cgm_active": round(self.cgm_active, 3),
            "days": round(self.days, 1),
        }


@dataclass(frozen=True)
class BehaviorPoint:
    """One window's point on a behavior's trend: ``attributed`` of ``exposure_n``.

    ``problem_rate`` = ``attributed / exposure_n`` (0 when the window had no exposure).
    ``harm`` is populated for the behaviors that carry an outcome-gated sub-count
    (``correction_stacking`` and the ``user_override`` tile) — demoted to sub-text,
    where ``attributed`` carries the headline *behavior* count (issue #131's resolved
    caveat). It is omitted from the dict for every other lever.
    """

    attributed: int
    exposure_n: int
    problem_rate: float
    harm: Optional[int] = None

    def to_dict(self) -> dict:
        d = {
            "attributed": self.attributed,
            "exposure_n": self.exposure_n,
            "problem_rate": round(self.problem_rate, 4),
        }
        if self.harm is not None:
            d["harm"] = self.harm
        return d


@dataclass(frozen=True)
class BehaviorTrend:
    """One behavior lever's full trend: metadata plus a per-window series.

    ``harm_threshold_mgdl`` / ``harm_lookahead_min`` are populated only for the override
    tile (#420), carrying the ``ScenarioConfig`` values its harm gate used so the frontend
    can spell out the evidence summary ("… glucose at or below 80 mg/dL within 5 hours")
    without hardcoding those literals. Both are omitted from the dict for every other lever.
    """

    lever: str
    title: str
    exposure: str
    polarity: str
    recommendation: str
    series: List[BehaviorPoint] = field(default_factory=list)
    harm_threshold_mgdl: Optional[float] = None
    harm_lookahead_min: Optional[float] = None

    def to_dict(self) -> dict:
        d = {
            "lever": self.lever,
            "title": self.title,
            "exposure": self.exposure,
            "polarity": self.polarity,
            "recommendation": self.recommendation,
            "series": [p.to_dict() for p in self.series],
        }
        if self.harm_threshold_mgdl is not None:
            d["harm_threshold_mgdl"] = self.harm_threshold_mgdl
        if self.harm_lookahead_min is not None:
            d["harm_lookahead_min"] = self.harm_lookahead_min
        return d


@dataclass(frozen=True)
class MetricTrend:
    """One glycemic metric's full trend: metadata plus a per-window value series.

    ``series`` values are plain numbers, or ``None`` for a window with no data (never
    a fabricated zero) — the frontend renders a gap, not a false dip.
    """

    key: str
    title: str
    unit: str
    polarity: str
    range: Optional[str]
    series: List[Optional[float]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "title": self.title,
            "unit": self.unit,
            "polarity": self.polarity,
            "range": self.range,
            "series": list(self.series),
        }


@dataclass(frozen=True)
class ArcRescueContext:
    """Display-only logged rescue-carb context for one post-meal arc window.

    This is deliberately a count/object, not a rate and not a denominator-bearing
    metric. It only says logged rescue carbs landed inside the tails of meals that
    make up this arc point; it never changes peak/nadir medians or their ``n`` values.
    """

    count: int = 0
    grams: float = 0.0
    unknown_count: int = 0

    def to_dict(self) -> dict:
        return {
            "count": self.count,
            "grams": round(self.grams, 1),
            "unknown_count": self.unknown_count,
        }


@dataclass(frozen=True)
class ArcTrend:
    """The post-meal arc: two per-window median series on one card (ADR 0018, #196).

    ``peak`` (upper line, want it going down) and ``nadir`` (lower line, want it holding
    up) are **absolute mg/dL** medians, index-aligned to ``windows``, each ``None`` for a
    window with fewer than :data:`ARC_MIN_MEALS` qualifying meals (a gap, never a
    fabricated value). The narrowing gap between the lines is the "flatten the curve"
    signal. The two series carry **different denominators** — the peak half counts all
    carb-tagged meals, the nadir half only meals whose arc spanned ≥ 3 h before
    truncation — so ``n_peak`` and ``n_nadir`` are exposed per window (they can differ).

    ``preempted`` is the per-window aggregate pre-empted-low **count** (ADR 0012) — the
    contextual annotation "N nadirs this window may be higher than the true floor —
    rescue carbs present". It is aggregate-only, never a per-meal flag and never a rate.

    ``rescue_context`` is a separate display-only per-window object: logged rescue-carb
    entries inside the meal tails that formed that window's arc point. It is factual
    point context, not a denominator, not a new rate, and not a modeling input.

    ``observed_days`` is how many of each window's days the rescue log was actually
    recording (#467) — the honest coverage behind the two rescue series above, so a
    window that predates the log reads as *unknown* rather than rescue-free. A per-window
    day **count**, never a rate over rescues and never a per-low ledger (ADR 0012).

    ``rescue_evidence`` is the full per-window observation object beside that count
    (:class:`~ciq_autotune.rescue_evidence.RescueObservation`): the same coverage plus
    the four rescue-evidence states — confirmed rescue, explicit no, not sure, and no
    recorded observation — so each window names what the log knew, not only how many
    days it watched (ADR 467). Still a day count, never a rate and never a per-low ledger.
    """

    title: str
    unit: str
    peak: List[Optional[float]] = field(default_factory=list)
    nadir: List[Optional[float]] = field(default_factory=list)
    n_peak: List[int] = field(default_factory=list)
    n_nadir: List[int] = field(default_factory=list)
    preempted: List[int] = field(default_factory=list)
    rescue_context: List[ArcRescueContext] = field(default_factory=list)
    observed_days: List[int] = field(default_factory=list)
    rescue_evidence: List[dict] = field(default_factory=list)
    min_meals: int = ARC_MIN_MEALS

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "unit": self.unit,
            "peak": list(self.peak),
            "nadir": list(self.nadir),
            "n_peak": list(self.n_peak),
            "n_nadir": list(self.n_nadir),
            "preempted": list(self.preempted),
            "rescue_context": [r.to_dict() for r in self.rescue_context],
            "observed_days": list(self.observed_days),
            "rescue_evidence": [dict(e) for e in self.rescue_evidence],
            "min_meals": self.min_meals,
        }


@dataclass(frozen=True)
class PreMealTrend:
    """The pre-meal starting-BG trend: the meals-start-high signal as a rolling read (#302).

    ``series`` is the per-window **median starting BG** (``bg0``, absolute mg/dL) across
    that window's carb-tagged meals that had a readable start, index-aligned to
    ``windows`` — each ``None`` for a window with fewer than :data:`ARC_MIN_MEALS`
    such meals (a gap, never a fabricated value, mirroring the arc's thin-window gate).
    ``n`` is the per-window count of meals with a known start — the honest denominator,
    which is NOT every meal (a meal with no pre-meal CGM contributes no start). ``target``
    is Control-IQ's fixed setpoint the median is read against; the whole series is a
    standing status read, shown regardless of whether a given window sits above it.
    """

    title: str
    unit: str
    target: float
    series: List[Optional[float]] = field(default_factory=list)
    n: List[int] = field(default_factory=list)
    min_meals: int = ARC_MIN_MEALS

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "unit": self.unit,
            "target": self.target,
            "series": list(self.series),
            "n": list(self.n),
            "min_meals": self.min_meals,
        }


@dataclass(frozen=True)
class OvernightLowTrend:
    """How often a detected Rest window contained a printed sub-70 low.

    This is an objective outcome, not a causal attribution: it says only that BG
    dipped below ``threshold`` during a Rest window. ``low_n`` and ``n`` keep the
    per-window numerator and denominator visible; ``series`` is their percentage,
    or ``None`` when no Rest window was detectable in that reporting window.

    ``cleared`` (v7, #377) is whether the newest window-over-window change in the
    day-rate clears the adr-364 day-level bar — the ONE outcome carrying binary
    day-level counts, so the only one the Verify digest can headline (adr-365 §2).
    """

    title: str
    unit: str
    threshold: float
    series: List[Optional[float]] = field(default_factory=list)
    low_n: List[int] = field(default_factory=list)
    n: List[int] = field(default_factory=list)
    cleared: bool = False

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "unit": self.unit,
            "threshold": self.threshold,
            "series": list(self.series),
            "low_n": list(self.low_n),
            "n": list(self.n),
            "cleared": self.cleared,
        }


@dataclass(frozen=True)
class ProgrammedIcRange:
    """The real bounds of the active programmed I:C schedule (g/U)."""

    min: float
    max: float

    def to_dict(self) -> dict:
        return {"min": self.min, "max": self.max}


@dataclass(frozen=True)
class OutcomesTrend:
    """The whole trend payload — versioned, JSON-serializable, mirrors the capture shape."""

    schema_version: int
    window_days: int
    profile_isf: Optional[float]
    profile_ic: Optional[ProgrammedIcRange]
    windows: List[WindowMeta] = field(default_factory=list)
    behaviors: List[BehaviorTrend] = field(default_factory=list)
    metrics: List[MetricTrend] = field(default_factory=list)
    arc: Optional[ArcTrend] = None
    pre_meal: Optional[PreMealTrend] = None
    overnight_lows: Optional[OvernightLowTrend] = None
    # The single active watched change — a TrialView or FocusView (#244, ADR 0029),
    # or None when nothing is watched. Never both at once (Trial XOR Focus).
    watched_change: Optional["Union[TrialView, FocusView]"] = None

    def to_dict(self) -> dict:
        return {
            "schema_version": self.schema_version,
            "window_days": self.window_days,
            "profile_isf": self.profile_isf,
            "profile_ic": self.profile_ic.to_dict() if self.profile_ic is not None else None,
            "windows": [w.to_dict() for w in self.windows],
            "behaviors": [b.to_dict() for b in self.behaviors],
            "metrics": [m.to_dict() for m in self.metrics],
            "arc": self.arc.to_dict() if self.arc is not None else None,
            "pre_meal": self.pre_meal.to_dict() if self.pre_meal is not None else None,
            "overnight_lows": (
                self.overnight_lows.to_dict() if self.overnight_lows is not None else None
            ),
            "watched_change": (self.watched_change.to_dict()
                               if self.watched_change is not None else None),
        }

    def to_json(self, indent: Optional[int] = None) -> str:
        return json.dumps(self.to_dict(), indent=indent)


# --- post-meal arc (peak + subsequent nadir, ADR 0018) ---------------------


@dataclass(frozen=True)
class _MealArc:
    """One meal's arc: absolute peak/nadir (mg/dL) and whether it earns the nadir series.

    ``peak`` is the max CGM in the (possibly truncated) peak window, ``nadir`` the min in
    the nadir window after the peak; either is ``None`` when the window held no reading.
    ``nadir_qualifies`` is True only when the arc spanned ≥ :data:`ARC_MIN_NADIR_SPAN_MIN`
    before truncation — a shorter arc cannot tell a crash story (ADR 0018 §4) and is kept
    out of the nadir series regardless of whether a reading happened to exist.
    """

    peak: Optional[float]
    nadir: Optional[float]
    nadir_qualifies: bool


def _meal_arc(meal_t: datetime, next_meal_t: Optional[datetime], cgm: Sequence) -> _MealArc:
    """Compute one meal's post-meal arc from ``cgm`` (ADR 0018).

    Peak window is ``(meal_t, meal_t + 3 h]``; nadir window is ``(peak_time, meal_t + 6 h]``.
    Both truncate at ``next_meal_t`` (the next carb-tagged bolus) when it lands earlier —
    a second meal ends the first's arc at that boundary rather than reading into its
    insulin activity. Values are absolute mg/dL, no baseline offset. Pure function of its
    inputs, so it is unit-testable on a synthetic series.
    """
    peak_end = meal_t + timedelta(minutes=ARC_PEAK_HORIZON_MIN)
    if next_meal_t is not None and next_meal_t < peak_end:
        peak_end = next_meal_t
    peak_pts = [(r.t, r.bg) for r in cgm if r.bg is not None and meal_t < r.t <= peak_end]
    if not peak_pts:
        return _MealArc(None, None, False)
    peak_t, peak = max(peak_pts, key=lambda tv: tv[1])

    nadir_end = meal_t + timedelta(minutes=ARC_NADIR_HORIZON_MIN)
    if next_meal_t is not None and next_meal_t < nadir_end:
        nadir_end = next_meal_t
    qualifies = (nadir_end - meal_t) >= timedelta(minutes=ARC_MIN_NADIR_SPAN_MIN)
    nadir_vals = [r.bg for r in cgm if r.bg is not None and peak_t < r.t <= nadir_end]
    nadir = min(nadir_vals) if nadir_vals else None
    return _MealArc(peak=peak, nadir=nadir, nadir_qualifies=qualifies)


def _meal_tail_end(meal_t: datetime, next_meal_t: Optional[datetime]) -> datetime:
    """The post-meal arc tail end for display-only context, matching ADR 0018."""
    tail_end = meal_t + timedelta(minutes=ARC_NADIR_HORIZON_MIN)
    if next_meal_t is not None and next_meal_t < tail_end:
        tail_end = next_meal_t
    return tail_end


def post_meal_arc(meals: Sequence, cgm: Sequence, *, ctx_meals: Optional[Sequence] = None) -> tuple:
    """Median arc peak, median arc nadir, and both counts across ``meals`` (ADR 0018).

    Returns ``(peak_median, nadir_median, n_peak, n_nadir)`` — absolute mg/dL medians
    (rounded), each ``None`` when fewer than :data:`ARC_MIN_MEALS` meals qualify (a gap,
    never a fabricated value). The two halves have **different denominators**: the peak
    series counts every carb-tagged meal with a peak reading; the nadir series only meals
    whose arc spanned ≥ 3 h before truncation (``nadir_qualifies``) and had a nadir
    reading. ``n_peak`` / ``n_nadir`` are the raw qualifying counts (reported even below
    the gate, so the caller can surface how thin each series is).

    ``meals`` are the window's carb-tagged boluses (the aggregation set). ``ctx_meals``
    is the wider context-padded meal slice used only to find each meal's *truncating*
    next bolus — which may sit just past the window edge; it defaults to ``meals``. Pure
    function of its inputs, so it is unit-testable on a synthetic series.
    """
    times = sorted(m.t for m in (ctx_meals if ctx_meals is not None else meals))
    peaks: List[float] = []
    nadirs: List[float] = []
    for m in meals:
        nxt = next((t for t in times if t > m.t), None)
        arc = _meal_arc(m.t, nxt, cgm)
        if arc.peak is not None:
            peaks.append(arc.peak)
        if arc.nadir_qualifies and arc.nadir is not None:
            nadirs.append(arc.nadir)
    peak_med = round(statistics.median(peaks), 1) if len(peaks) >= ARC_MIN_MEALS else None
    nadir_med = round(statistics.median(nadirs), 1) if len(nadirs) >= ARC_MIN_MEALS else None
    return peak_med, nadir_med, len(peaks), len(nadirs)


def post_meal_rescue_context(
    meals: Sequence,
    carb_entries: Sequence,
    cgm_readings: Sequence = (),
    *,
    ctx_meals: Optional[Sequence] = None,
) -> ArcRescueContext:
    """Display-only rescue-carb context for the arc point formed by ``meals``.

    Counts actual logged pre-empted rescue-carb entries whose timestamps fall inside
    any of this window's meal tails: ``(meal_t, min(next_meal_t, meal_t + 6 h)]``.
    The truncating next meal is resolved from the padded ``ctx_meals`` slice, just like
    :func:`post_meal_arc`, so a meal near a window edge owns rescue context in its own
    arc point even if the rescue log lands just after the wall-window boundary.

    The result is display-only. It uses CGM only for ADR 0012's established
    printed-low exclusion; it does not impute lows, does not alter peak/nadir
    medians, and carries no denominator or rate.
    """
    times = sorted(m.t for m in (ctx_meals if ctx_meals is not None else meals))
    tails = []
    for m in sorted(meals, key=lambda b: b.t):
        nxt = next((t for t in times if t > m.t), None)
        tails.append((m.t, _meal_tail_end(m.t, nxt)))

    count = 0
    grams = 0.0
    unknown_count = 0
    for entry in sorted(carb_entries, key=lambda c: c.t):
        if not is_preempted_low_entry(entry, cgm_readings):
            continue
        if not any(start < entry.t <= end for start, end in tails):
            continue
        count += 1
        if entry.grams is None:
            unknown_count += 1
        else:
            grams += float(entry.grams)
    return ArcRescueContext(count=count, grams=grams, unknown_count=unknown_count)


# --- pre-meal starting BG (the meals-start-high signal, trended, #302) ------


def pre_meal_start(meals: Sequence, cgm: Sequence) -> tuple:
    """Median pre-meal starting BG and the count of meals with a readable start.

    Returns ``(median_bg0, n)`` — the median of each meal's ``bg0`` (rounded, absolute
    mg/dL), or ``None`` when fewer than :data:`ARC_MIN_MEALS` meals had a readable start
    (a gap, never a fabricated value; mirrors the post-meal arc's thin-window gate).
    ``n`` is the raw count of meals whose start could be resolved (reported even below
    the gate, so a caller can surface how thin the point is) — the honest denominator,
    NOT every meal: a meal with no ``bg`` on its bolus row and no CGM within
    ``bg0_max_gap_min`` contributes no start.

    ``bg0`` is resolved by :func:`~ciq_autotune.analyzers.ic.meal_start_bg` — the SAME
    resolution the I:C analyzer's meal-burden builder and its meals-start-high finding
    use, so this trend never re-derives a subtly-different pre-meal BG. Pure function of
    its inputs, so it is unit-testable on a synthetic series.
    """
    series = _CgmSeries(cgm, timedelta(minutes=IcConfig().bg0_max_gap_min))
    starts = [bg0 for bg0 in (meal_start_bg(m, series) for m in meals) if bg0 is not None]
    median = round(statistics.median(starts), 1) if len(starts) >= ARC_MIN_MEALS else None
    return median, len(starts)


# --- windowing -------------------------------------------------------------


def _window_bounds(
    now: datetime, earliest: Optional[datetime], window_days: int
) -> List[tuple]:
    """The rolling window bounds, oldest→newest, anchored so the newest ends at ``now``.

    Tiles ``[now − k·window_days, now]`` backward in equal ``window_days`` steps until
    the oldest window's start reaches past ``earliest`` (the first data instant), so
    every window is full-width — a sparsely-covered oldest window shows a low
    ``cgm_active``, it is not shrunk. Returns ``[(start, end), …]`` index-aligned
    oldest→newest. Empty data → one window ending at ``now``.
    """
    step = timedelta(days=window_days)
    if earliest is None or earliest >= now:
        n = 1
    else:
        n = max(1, math.ceil((now - earliest) / step))
    return [(now - step * (n - w), now - step * (n - 1 - w)) for w in range(n)]


def _cgm_active(n_readings: int, days: float) -> float:
    """Observed-vs-expected 5-min CGM coverage over ``days``, as a 0–1 fraction (≤1.0)."""
    expected = _EXPECTED_PER_DAY * days if days > 0 else 0.0
    return min(1.0, n_readings / expected) if expected > 0 else 0.0


# --- top-level assembly ----------------------------------------------------


def summarize_trend(
    store,
    *,
    window_days: int = 14,
    now: Optional[datetime] = None,
    scenario_config: Optional[ScenarioConfig] = None,
) -> OutcomesTrend:
    """Build the Outcomes trend for ``store`` (the API + CLI entry).

    Reads CGM / bolus / basal / settings once, resolves the **fixed** current-profile
    ISF (held constant across every window — the #131 correctness rule), tiles the
    data into equal ``window_days`` windows ending at ``now``, and for each window
    computes the glycemic metrics + post-meal arc over the CGM series and behavior
    attributions via the tally-only scenario path. Carb-undercount uses each meal's
    dose-stamped I:C. ``now`` defaults to the latest data instant (so a static DB
    summarizes its own tail); pass it for deterministic tests.

    **Side effect:** resolving the active watched change (#244) can *drop* a pinned
    Focus when a newly-detected setting change preempts it (ADR 0029 §4) — a persisted
    write, not a pure read. This is deliberate: the preemption is a real state change,
    surfaced wherever the trend is read.
    """
    scenario_config = scenario_config or ScenarioConfig()
    basal = store.basal_events()
    cgm = store.cgm_readings()
    bolus = store.bolus_events()
    snaps = store.settings_snapshots()
    carbs = store.carb_entries()
    # When the rescue log first recorded anything (#467) — resolved once, then each
    # window reports how many of its own days it covers. The log began part-way through
    # the history, so a window before that instant is unknown, not rescue-free.
    prompt_rows = store.prompt_responses()
    rescue_from = first_observation(carbs, prompt_rows)

    times = [e.t for e in basal] + [r.t for r in cgm] + [b.t for b in bolus]
    span_end = max(times) if times else None
    now = now or span_end or datetime.now()
    earliest = min(times) if times else None

    # False-low reading invalidation (adr-381), applied full-response before any window's
    # low count or attribution forms (#467). A `false-low` flag *corrects a claim the CGM
    # shape itself made* — it drops the flagged excursion's readings — so, unlike a rescue
    # answer, it is NOT endpoint-filtered: it applies to every read of that excursion
    # however late it was flagged. Resolved off the whole span (window bounds above stay
    # on the full series) so an invalidated low vanishes from Outcomes exactly as it does
    # from the tuning path, while a late rescue `no` (per-window filtered below) does not.
    cgm = drop_readings(cgm, false_low_spans(cgm, prompt_rows))

    # Fixed ISF for attribution plus the active I:C range for display. Each meal's
    # judgment uses its own dose stamp, never this current-profile display value.
    profile_isf, profile_ic = _profile_settings(snaps)

    bounds = _window_bounds(now, earliest, window_days)
    # Detect each Rest window once over the full history so a reporting-window edge
    # cannot truncate the night. A night belongs to the reporting window containing
    # its Rest-window start.
    rest_windows = detect_rest_windows(cgm, bolus)
    low_times = sorted(r.t for r in cgm if r.bg is not None and r.bg < TBR_L1)
    pad = timedelta(minutes=_CONTEXT_PAD_MIN + ARC_NADIR_HORIZON_MIN)
    # Low-prompt answers (#129) over the whole span; matched to nadirs by time inside
    # each window's tally, so a refuted over-treated low drops from the behavior count.
    # Each rolling window then re-filters them to what it could have known (#467, below).
    answers = low_prompt_answers(store, earliest, now) if earliest else []

    windows: List[WindowMeta] = []
    # Per-lever series accumulators, and per-metric-key series accumulators.
    behavior_series: Dict[Lever, List[BehaviorPoint]] = {lv: [] for lv in _BEHAVIOR_ORDER}
    metric_series: Dict[str, List[Optional[float]]] = {s.key: [] for s in _METRIC_SPECS}
    # The override-rate tile (#161) — its own series, denominated on every bolus in the
    # window, appended as a non-Lever BehaviorTrend after the loop iff it clears the
    # thin-data gate.
    override_series: List[BehaviorPoint] = []
    # Post-meal arc (#196): parallel per-window series — median peak, median nadir, the
    # two (differing) denominators, aggregate pre-empted-low count annotation, and
    # separate display-only logged rescue-carb context for meal-tail entries.
    arc_peak: List[Optional[float]] = []
    arc_nadir: List[Optional[float]] = []
    arc_npeak: List[int] = []
    arc_nnadir: List[int] = []
    arc_preempted: List[int] = []
    arc_rescue_context: List[ArcRescueContext] = []
    arc_observed_days: List[int] = []
    arc_rescue_evidence: List[dict] = []
    # Pre-meal starting-BG (#302): the median bg0 across each window's meals with a
    # readable start, and that count as the honest denominator — the meals-start-high
    # signal as a rolling trend, sharing the arc's thin-window gate.
    pre_meal_series: List[Optional[float]] = []
    pre_meal_n: List[int] = []
    overnight_low_series: List[Optional[float]] = []
    overnight_low_n: List[int] = []
    overnight_rest_n: List[int] = []

    for start, end in bounds:
        w_cgm = [r for r in cgm if start <= r.t <= end]
        w_bolus = [b for b in bolus if start <= b.t <= end]
        w_basal = [e for e in basal if start <= e.t <= end]
        # Context-padded slices for edge-spanning look-back/ahead (IOB, stack low, spike).
        ctx_cgm = [r for r in cgm if start - pad <= r.t <= end + pad]
        ctx_bolus = [b for b in bolus if start - pad <= b.t <= end + pad]
        ctx_basal = [e for e in basal if start - pad <= e.t <= end + pad]
        # Rescue evidence replays observation-aware (#467): only entries already
        # *recorded* by this window's endpoint may count against it, so a rescue entered
        # retrospectively today never appears in a window that closed before it existed.
        # Eligibility keys on the wall endpoint `end` for BOTH slices — the padding is a
        # physiological look-ahead (a meal tail that spills past the wall boundary, #317),
        # not a later observation cut-off, so `end + pad` must not relax the created-at
        # boundary. Event time (`c.t`) still does the window slice and the attribution.
        w_carbs = [c for c in eligible_carb_entries(carbs, end) if start <= c.t <= end]
        ctx_carbs = [c for c in eligible_carb_entries(carbs, end)
                     if start - pad <= c.t <= end + pad]

        days = (end - start).total_seconds() / 86400.0
        n_readings = sum(1 for r in w_cgm if getattr(r, "bg", None) is not None)
        windows.append(
            WindowMeta(
                start=start.strftime(_DATE_FMT),
                end=end.strftime(_DATE_FMT),
                cgm_active=_cgm_active(n_readings, days),
                days=days,
            )
        )

        # Metrics: the AGP panel over the window's CGM.
        m = compute_metrics(w_cgm)
        by_key = {
            "tir": m.tir, "tbr": m.tbr_lvl1, "mean": m.mean_glucose, "cv": m.cv,
        }
        for key, val in by_key.items():
            metric_series[key].append(val)

        # Post-meal arc (#196, ADR 0018): peak + subsequent nadir per carb-tagged meal,
        # trended. Truncation looks at the padded meal slice so a meal near the window
        # edge still sees its next bolus; the aggregation set is this window's meals.
        w_meals = [b for b in w_bolus if _is_meal(b)]
        ctx_meals = [b for b in ctx_bolus if _is_meal(b)]
        peak_med, nadir_med, n_peak, n_nadir = post_meal_arc(
            w_meals, ctx_cgm, ctx_meals=ctx_meals
        )
        arc_peak.append(peak_med)
        arc_nadir.append(nadir_med)
        arc_npeak.append(n_peak)
        arc_nnadir.append(n_nadir)
        # Aggregate pre-empted-low count for the arc's rescue annotation (ADR 0012):
        # rescue carbs that arrested a crash before it printed, so a recorded nadir may
        # sit above the true floor. A count only — never a per-meal flag, never a rate.
        arc_preempted.append(
            compute_preempted_lows(w_carbs, ctx_bolus, ctx_cgm).total
        )
        arc_rescue_context.append(
            post_meal_rescue_context(
                w_meals, ctx_carbs, ctx_cgm, ctx_meals=ctx_meals
            )
        )
        # How much of this window the rescue log was watching, and what it recorded —
        # the coverage behind the two counts above plus the four rescue-evidence states
        # (#467, ADR 467). A count of observed days, never a rate over rescues.
        w_obs = observe(carbs, prompt_rows, start=start, end=end,
                        observed_from=rescue_from)
        arc_observed_days.append(w_obs.observed_days)
        arc_rescue_evidence.append(w_obs.to_dict())

        # Pre-meal starting BG (#302): median bg0 across this window's meals, denominated
        # on meals with a readable start. Padded CGM so a meal near the window's start
        # still finds its pre-meal reading (bg0 sits just before the bolus).
        pm_median, pm_n = pre_meal_start(w_meals, ctx_cgm)
        pre_meal_series.append(pm_median)
        pre_meal_n.append(pm_n)

        # Reporting overnight outcome (#327): one vote per inferred Rest window,
        # regardless of why the low happened. This deliberately does not read scenario
        # attributions or evening boluses; it is a result, not a behavior.
        reporting_rest = [w for w in rest_windows if start <= w.start < end]
        low_n = 0
        for w in reporting_rest:
            i = bisect.bisect_left(low_times, w.start)
            if i < len(low_times) and low_times[i] <= w.end:
                low_n += 1
        rest_n = len(reporting_rest)
        overnight_low_series.append(
            round(100.0 * low_n / rest_n, 1) if rest_n else None
        )
        overnight_low_n.append(low_n)
        overnight_rest_n.append(rest_n)

        # Behaviors: fixed profile ISF plus each meal's historical Dose-stamped I:C.
        # Observation-aware, like the rescue carbs above (#467): a rescue low-prompt
        # answer (carbs / no / not-sure) may reclassify this window's over-treated-low
        # attribution only if it was *recorded* by the window's endpoint — an answer
        # anchored inside the window but logged after it closed did not exist when the
        # window closed. A `false-low` reading invalidation is exempt: it corrects a CGM
        # claim rather than asserting a rescue, so it applies to every read however late
        # it arrives (adr-381, its own settled rule). Answer time still drives the
        # anchor-to-nadir match once eligible.
        w_answers = [a for a in answers
                     if a.answer == "false-low"
                     or (a.answered_at or a.anchor_t) <= end]
        exposure_counts, attributed = tally_attributions(
            w_bolus, w_cgm, w_basal, isf=profile_isf,
            low_answers=w_answers,
        )
        # correction_stacking's two numerators (behavior / harm) over its shared
        # correction-pairs denominator — replaces the engine's outcome-gated tally.
        cs_behavior, cs_harm = count_correction_stacks(
            w_bolus, ctx_bolus, ctx_cgm, ctx_basal
        )
        for lever in _BEHAVIOR_ORDER:
            exp = LEVER_EXPOSURE[lever]
            n = exposure_counts.get(exp, 0)
            if lever is Lever.CORRECTION_STACKING:
                k = min(cs_behavior, n)
                point = BehaviorPoint(
                    attributed=k,
                    exposure_n=n,
                    problem_rate=(k / n) if n else 0.0,
                    harm=min(cs_harm, k),
                )
            else:
                k = min(attributed.get(lever, 0), n)
                point = BehaviorPoint(
                    attributed=k, exposure_n=n, problem_rate=(k / n) if n else 0.0
                )
            behavior_series[lever].append(point)

        # Override-rate tile (#161): behavior/harm override-ups over the window's whole
        # bolus count as the denominator (how often you override the pump up), padded
        # context for the harm low/gate look-ahead. Not a Lever — accumulated separately.
        ov_behavior, ov_harm = count_overrides(
            w_bolus, ctx_cgm, ctx_basal, scenario_config=scenario_config
        )
        ov_n = len(w_bolus)
        override_series.append(
            BehaviorPoint(
                attributed=ov_behavior,
                exposure_n=ov_n,
                problem_rate=(ov_behavior / ov_n) if ov_n else 0.0,
                harm=ov_harm,
            )
        )

    behaviors = [
        BehaviorTrend(
            lever=lever.value,
            title=title(lever),
            exposure=LEVER_EXPOSURE[lever].value,
            polarity="down_good",
            recommendation=recommendation(lever),
            series=behavior_series[lever],
        )
        for lever in _BEHAVIOR_ORDER
    ]
    # Append the override-rate tile iff it clears the thin-data gate (ADR 0015 §2): a
    # real handful of overrides across the tracked history, else stay silent — no n=2
    # headline. Rides in the same BehaviorTrend shape so the frontend renders it
    # generically; its `harm` sub-count is the ~1-in-3 low cost the ADR measured.
    if sum(p.attributed for p in override_series) >= MIN_OVERRIDES_TO_SHOW:
        behaviors.append(
            BehaviorTrend(
                lever=OVERRIDE_LEVER,
                title=OVERRIDE_TITLE,
                exposure=OVERRIDE_EXPOSURE,
                polarity="down_good",
                recommendation=OVERRIDE_RECOMMENDATION,
                series=override_series,
                harm_threshold_mgdl=scenario_config.user_override_harm_low_mgdl,
                harm_lookahead_min=scenario_config.user_override_harm_lookahead_min,
            )
        )
    metrics = [
        MetricTrend(
            key=s.key, title=s.title, unit=s.unit, polarity=s.polarity,
            range=s.range, series=metric_series[s.key],
        )
        for s in _METRIC_SPECS
    ]
    arc = ArcTrend(
        title="Post-meal arc",
        unit="mg/dL",
        peak=arc_peak,
        nadir=arc_nadir,
        n_peak=arc_npeak,
        n_nadir=arc_nnadir,
        preempted=arc_preempted,
        rescue_context=arc_rescue_context,
        observed_days=arc_observed_days,
        rescue_evidence=arc_rescue_evidence,
    )
    pre_meal = PreMealTrend(
        title="Pre-meal starting BG",
        unit="mg/dL",
        target=TARGET_BG,
        series=pre_meal_series,
        n=pre_meal_n,
    )
    overnight_lows = OvernightLowTrend(
        title="Nights with a low",
        unit="%",
        threshold=TBR_L1,
        series=overnight_low_series,
        low_n=overnight_low_n,
        n=overnight_rest_n,
        cleared=_overnight_lows_cleared(overnight_low_n, overnight_rest_n),
    )

    # The single active watched change — a Trial (derived from the setting-change
    # epoch) or the pinned Focus, resolved by the one-active invariant (#244). This
    # may DROP an active Focus if a Trial now preempts it (a persisted state change).
    from .watched_change import active_watched_change
    watched = active_watched_change(store, basal, bolus, snaps,
                                    now=now, window_days=window_days,
                                    cgm_readings=cgm)

    return OutcomesTrend(
        schema_version=SCHEMA_VERSION,
        window_days=window_days,
        profile_isf=profile_isf,
        profile_ic=profile_ic,
        windows=windows,
        behaviors=behaviors,
        metrics=metrics,
        arc=arc,
        pre_meal=pre_meal,
        overnight_lows=overnight_lows,
        watched_change=watched,
    )


def _profile_settings(snaps) -> tuple:
    """The fixed profile ISF plus real bounds of the programmed I:C schedule.

    ISF remains the active schedule median, deliberately not the noisy per-window
    fasting estimate (#131). I:C is display-only: meal judgments use dose stamps.
    """
    from . import settings as settings_mod

    if not snaps:
        return None, None
    isf_sched = [v for _, v in settings_mod.active_schedule(snaps, "isf")]
    profile_isf = float(statistics.median(isf_sched)) if isf_sched else None
    ic_range = settings_mod.programmed_ic_range(snaps)
    profile_ic = ProgrammedIcRange(*ic_range) if ic_range is not None else None
    return profile_isf, profile_ic


# --- CLI renderer (mirrors outcomes.markdown_outcomes) ---------------------


def _fmt_rate(p: BehaviorPoint) -> str:
    return f"{p.problem_rate * 100:4.0f}%" if p.exposure_n else "   ·"


def _fmt_metric(v: Optional[float]) -> str:
    return f"{v:5.0f}" if v is not None else "    ·"


def _delta(series, get) -> str:
    """A `Δ vs prior` chip for the last two windows' values (raw, no polarity flip)."""
    vals = [get(x) for x in series]
    if len(vals) < 2 or vals[-1] is None or vals[-2] is None:
        return "—"
    d = vals[-1] - vals[-2]
    return f"{d:+.0f}"


def _watched_change_lines(wc) -> List[str]:
    """Render the active Trial / Focus (or "nothing watched") for the CLI view."""
    if wc is None:
        return ["_Nothing watched right now._"]
    if getattr(wc, "kind", None) == "trial":
        who = wc.parameter if wc.slot is None else f"{wc.parameter} @ {wc.slot}"
        ba = (f" ({wc.before:g} → {wc.after:g})"
              if wc.before is not None and wc.after is not None else "")
        m = wc.maturing
        phase = (f"maturing ({m.days_elapsed} of {m.days_required} d)"
                 if m.is_maturing else "matured — verdict ready")
        return [
            f"- **Trial** · {who}{ba} changed `{wc.changed_at}`",
            f"- Target metric: {', '.join(wc.target_metrics)} · {phase}",
        ]
    return [
        f"- **Focus** · {wc.title} (`{wc.lever}`) · pinned `{wc.pinned_at}`",
        f"- Outcome metric: {wc.target_metric} · adherence from its clean-rate series",
    ]


def markdown_trend(trend: OutcomesTrend) -> str:
    """Render an :class:`OutcomesTrend` as markdown (the CLI ``outcomes-trend`` view).

    One versioned result, two renderers (CLI here, API JSON in ``api.py``) — the same
    pattern ``outcomes.py`` / ``report.py`` use. Shows the window strip, then each
    behavior's per-window problem-rate trend with its current ``k of n`` and vs-prior
    delta, then the glycemic metric trends — enough to eyeball movement on a real DB.
    """
    t = trend
    w = t.windows
    out: List[str] = []
    out.append("# Control-IQ Autotune — outcomes trend")
    out.append("")
    isf = f"{t.profile_isf:.0f}" if t.profile_isf is not None else "—"
    if t.profile_ic is None:
        ic = "—"
    elif t.profile_ic.min == t.profile_ic.max:
        ic = f"{t.profile_ic.min:.1f}"
    else:
        ic = f"{t.profile_ic.min:.1f}–{t.profile_ic.max:.1f} · varies by time"
    out.append(
        f"- {len(w)} × {t.window_days}d windows · fixed profile ISF {isf} mg/dL/U · "
        f"I:C {ic} g/U"
    )
    if w:
        out.append(f"- Span `{w[0].start}` → `{w[-1].end}` (oldest → newest)")
    out.append("")

    # The single active watched change (#244): a Trial (a setting change under watch)
    # or a Focus (a pinned behavioral lever), or nothing. Never both.
    out.append("## Watched change")
    out.append("")
    out.extend(_watched_change_lines(t.watched_change))
    out.append("")

    # Window strip: dates + CGM-active, so a thin window is visible.
    out.append("## Windows")
    out.append("")
    out.append("| # | Start | End | CGM-active |")
    out.append("|--:|-------|-----|-----------:|")
    for i, wm in enumerate(w, start=1):
        out.append(f"| {i} | {wm.start} | {wm.end} | {wm.cgm_active * 100:.0f}% |")
    out.append("")

    # Behaviors: a per-window problem-rate sequence, current k/n, and vs-prior delta.
    out.append("## Behaviors — problem rate per window (lower is better)")
    out.append("")
    out.append(
        "_Judged against the fixed current-profile ISF and each meal's "
        "Dose-stamped I:C across all windows._"
    )
    out.append("")
    out.append("| Behavior | Exposure | Trend (oldest → newest) | Current | Δ |")
    out.append("|----------|----------|-------------------------|--------:|--:|")
    for b in t.behaviors:
        trend_cells = " ".join(_fmt_rate(p) for p in b.series)
        cur = b.series[-1] if b.series else None
        current = f"{cur.attributed} of {cur.exposure_n}" if cur else "—"
        # Behaviors carrying a harm sub-count (correction_stacking, user_override)
        # show the "→ low" cost alongside the headline behavior count.
        if cur is not None and cur.harm is not None:
            current += f" · {cur.harm} → low"
        delta = _delta(b.series, lambda p: (p.problem_rate * 100) if p.exposure_n else None)
        out.append(
            f"| {b.title} | {b.exposure.replace('_', ' ')} | `{trend_cells}` | "
            f"{current} | {delta}% |"
        )
    out.append("")

    # Glycemic metrics: the raw value series per window.
    out.append("## Glycemic metrics per window")
    out.append("")
    out.append("| Metric | Unit | Trend (oldest → newest) | Current | Δ |")
    out.append("|--------|------|-------------------------|--------:|--:|")
    for mt in t.metrics:
        trend_cells = " ".join(_fmt_metric(v) for v in mt.series)
        cur = mt.series[-1] if mt.series else None
        current = f"{cur:.0f}" if cur is not None else "—"
        delta = _delta(mt.series, lambda v: v)
        rng = f" ({mt.range})" if mt.range else ""
        out.append(
            f"| {mt.title}{rng} | {mt.unit} | `{trend_cells}` | {current} | {delta} |"
        )
    out.append("")

    # Post-meal arc: peak (want down) and nadir (want up) on two rows, plus per-window
    # denominators, the aggregate pre-empted-low annotation, and display-only logged
    # rescue-carb context (#196/#317, ADR 0018).
    a = t.arc
    if a is not None and a.peak:
        out.append("## Post-meal arc (peak wants ↓, nadir wants ↑)")
        out.append("")
        out.append("| Series | Trend (oldest → newest) | Current | n | Δ |")
        out.append("|--------|-------------------------|--------:|--:|--:|")
        peak_cells = " ".join(_fmt_metric(v) for v in a.peak)
        nadir_cells = " ".join(_fmt_metric(v) for v in a.nadir)
        peak_cur = f"{a.peak[-1]:.0f}" if a.peak and a.peak[-1] is not None else "—"
        nadir_cur = f"{a.nadir[-1]:.0f}" if a.nadir and a.nadir[-1] is not None else "—"
        out.append(
            f"| Peak (mg/dL) | `{peak_cells}` | {peak_cur} | {a.n_peak[-1] if a.n_peak else 0} | "
            f"{_delta(a.peak, lambda v: v)} |"
        )
        out.append(
            f"| Nadir (mg/dL) | `{nadir_cells}` | {nadir_cur} | {a.n_nadir[-1] if a.n_nadir else 0} | "
            f"{_delta(a.nadir, lambda v: v)} |"
        )
        out.append("")
        n_pre = a.preempted[-1] if a.preempted else 0
        if n_pre:
            out.append(
                f"_{n_pre} nadir(s) this window may be higher than the true floor — "
                f"rescue carbs present._"
            )
            out.append("")
        rescue = a.rescue_context[-1] if a.rescue_context else ArcRescueContext()
        if rescue.count:
            grams = f", {rescue.grams:.0f} g logged" if rescue.grams else ""
            unknown = (
                f", {rescue.unknown_count} unknown-amount"
                f" entr{'y' if rescue.unknown_count == 1 else 'ies'}"
                if rescue.unknown_count else ""
            )
            out.append(
                f"_Logged rescue carbs inside meal tails this window: "
                f"{rescue.count} entr{'y' if rescue.count == 1 else 'ies'}"
                f"{grams}{unknown}._"
            )
            out.append("")
        # The coverage behind both rescue lines (#467): days this window's rescue log was
        # recording. Only worth saying when it falls short of the window.
        obs = a.observed_days[-1] if a.observed_days else None
        w_days = t.windows[-1].days if t.windows else None
        if obs is not None and w_days is not None and obs < int(w_days):
            out.append(
                f"_Rescue carbs were only being logged for {obs} of this window's "
                f"{int(w_days)} day(s); the rest is unknown, not rescue-free._"
            )
            out.append("")

    # Pre-meal starting BG (#302): median bg0 per window against the fixed target — the
    # meals-start-high signal trended. Coaching, not prescriptive: closer to target is
    # better (pre-bolus timing / a pre-meal correction), never a ratio change.
    pm = t.pre_meal
    if pm is not None and any(v is not None for v in pm.series):
        out.append("## Pre-meal starting BG (want it ↓ toward target)")
        out.append("")
        out.append(f"_Median pre-meal BG per window vs Control-IQ's {pm.target:.0f} target._")
        out.append("")
        out.append("| Series | Trend (oldest → newest) | Current | n | Δ vs target | Δ vs prior |")
        out.append("|--------|-------------------------|--------:|--:|------------:|-----------:|")
        cells = " ".join(_fmt_metric(v) for v in pm.series)
        cur = pm.series[-1] if pm.series else None
        cur_txt = f"{cur:.0f}" if cur is not None else "—"
        n_cur = pm.n[-1] if pm.n else 0
        vs_target = f"{cur - pm.target:+.0f}" if cur is not None else "—"
        out.append(
            f"| Median start (mg/dL) | `{cells}` | {cur_txt} | {n_cur} | {vs_target} | "
            f"{_delta(pm.series, lambda v: v)} |"
        )
        out.append("")

    # Reporting overnight (#327): objective Rest-window outcome, never a causal
    # attribution or behavior recommendation.
    ol = t.overnight_lows
    if ol is not None and any(v is not None for v in ol.series):
        out.append("## Nights with a low (want it ↓)")
        out.append("")
        out.append(
            f"_Share of inferred Rest windows with BG below {ol.threshold:.0f} mg/dL; "
            "this does not assign a cause._"
        )
        out.append("")
        cells = " ".join(f"{v:.0f}%" if v is not None else "·" for v in ol.series)
        cur = ol.series[-1] if ol.series else None
        low_n = ol.low_n[-1] if ol.low_n else 0
        rest_n = ol.n[-1] if ol.n else 0
        current = f"{low_n} of {rest_n} ({cur:.0f}%)" if cur is not None else "—"
        out.append("| Trend (oldest → newest) | Current | Δ vs prior |")
        out.append("|-------------------------|--------:|-----------:|")
        out.append(f"| `{cells}` | {current} | {_delta(ol.series, lambda v: v)}pt |")
        out.append("")
    return "\n".join(out)
