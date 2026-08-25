"""Estimate + confidence interval — the unit every analyzer reports in (F4).

The roadmap retires hard confidence-blanking: instead of dropping a thin slot,
every number ships as an :class:`Estimate` carrying its point value, a confidence
interval, and the sample size behind it (ROADMAP §8). Thin data shows up as a
*wide* interval and an ``n`` you can see, not a blank.

Intervals come from a percentile **bootstrap** — distribution-free, works the
same for a median (basal per-slot) or a mean (ISF correction-response), and
honestly widens as the samples spread or thin out. The resampling RNG is seeded,
so an estimate is a pure function of its inputs (the API contract and its tests
depend on that).

Stdlib only: ``statistics`` and ``random``.
"""

from __future__ import annotations

import random
import statistics
from dataclasses import dataclass
from typing import Callable, Dict, Hashable, List, Optional, Sequence, Tuple

# Default interval mass. 80%, not 95%: this is an advisory instrument, and a
# tighter band keeps thin-data intervals readable rather than spanning the world.
DEFAULT_CONFIDENCE = 0.8

# A CI whose half-width exceeds this fraction of the point estimate is "wide" —
# a cue for renderers to flag the number as soft. Also true for n < 3.
_WIDE_REL_HALFWIDTH = 0.25
_WIDE_MIN_N = 3

# A clustered estimate resamples whole clusters (e.g. fasting nights), so its band
# reflects the number of *clusters*, not the pooled step count. Below this floor
# there is no between-cluster spread to resample: the band collapses to a point and
# would otherwise read as maximally confident off a single night. Fewer than this
# many distinct clusters is soft, regardless of step count or the degenerate width.
_WIDE_MIN_CLUSTERS = 2

_BOOTSTRAP_ITERS = 1000
_SEED = 12345

# z for a two-sided interval at DEFAULT_CONFIDENCE: Φ⁻¹((1+0.80)/2) = Φ⁻¹(0.90).
# Hard-coded (stdlib has no inverse-normal) so a Wilson interval and a bootstrap
# CI carry the same 80% mass — a "soft" finding and a "soft" parameter mean the
# same thing to the frontend.
_FINDING_Z = 1.2816

# Score thresholds mapping a finding's lower-bound-weighted effect to a severity
# label. Judged on the Wilson lower bound (not the point rate) so thin data can't
# earn "high". Illustrative — calibrate against real users (see issue #58).
_SEVERITY_THRESHOLDS = ((0.33, "high"), (0.12, "medium"), (0.04, "low"))


@dataclass(frozen=True)
class Estimate:
    """A point estimate with a confidence interval and the n behind it."""

    value: Optional[float]
    lo: Optional[float]
    hi: Optional[float]
    n: int
    confidence: float = DEFAULT_CONFIDENCE
    method: str = "none"
    # Distinct clusters behind a *clustered* estimate (e.g. fasting nights, #177).
    # ``None`` for non-clustered estimates, whose softness the cluster floor does
    # not apply to — so existing call sites are unaffected.
    n_clusters: Optional[int] = None

    @property
    def wide(self) -> bool:
        """Whether this estimate should be read as soft (thin n, few clusters, or
        broad CI)."""
        if self.value is None or self.n == 0:
            return True
        if self.n < _WIDE_MIN_N:
            return True
        # A clustered estimate built from too few clusters is soft even when its
        # (degenerate) band is narrow and its step count is high — one night is not
        # independent evidence (#185).
        if self.n_clusters is not None and self.n_clusters < _WIDE_MIN_CLUSTERS:
            return True
        if self.lo is None or self.hi is None:
            return True
        half = (self.hi - self.lo) / 2.0
        ref = abs(self.value) if self.value else 1.0
        return half > _WIDE_REL_HALFWIDTH * ref

    def to_dict(self) -> dict:
        out = {
            "value": self.value,
            "lo": self.lo,
            "hi": self.hi,
            "n": self.n,
            "confidence": self.confidence,
            "method": self.method,
            "wide": self.wide,
        }
        if self.n_clusters is not None:
            out["n_clusters"] = self.n_clusters
        return out


def wilson(k: int, n: int, z: float = _FINDING_Z) -> Tuple[float, float, float]:
    """Wilson score interval for a Bernoulli rate ``k`` of ``n`` at z-level ``z``.

    Returns ``(p, lo, hi)`` — point rate and the two-sided interval bounds. Unlike
    the naive normal interval it stays inside ``[0, 1]`` and degrades honestly:
    ``0.5@n=4 → ~[0.23, 0.77]`` (wide) vs ``0.5@n=200 → ~[0.46, 0.55]`` (tight).
    An empty denominator has no rate, so it reads as maximally uncertain
    ``(0.0, 0.0, 1.0)`` — the finding analog of a valueless :class:`Estimate`.
    """
    if n == 0:
        return 0.0, 0.0, 1.0
    p = k / n
    d = 1 + z * z / n
    center = (p + z * z / (2 * n)) / d
    hw = (z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)) / d
    return p, center - hw, center + hw


def finding_severity(score: float) -> str:
    """Map a finding's ``score`` (lower-bound rate × effect) to a severity label."""
    for threshold, label in _SEVERITY_THRESHOLDS:
        if score >= threshold:
            return label
    return "info"


@dataclass(frozen=True)
class Confidence:
    """The Finding-side analog of :class:`Estimate`: a Wilson-scored Bernoulli rate.

    Every behavioral finding reduces to ``k`` events out of ``n`` opportunities
    (a rate ``p`` with a Wilson interval ``[lo, hi]``) times an ``effect`` size in
    ``[0, 1]`` (how bad each occurrence is). ``severity`` is judged on
    ``score = lo * effect`` — the interval's *lower* bound, so thin data can't earn
    a high severity — not on the point rate. ``wide`` shares :class:`Estimate`'s
    semantics (thin ``n`` or broad interval) so soft findings and soft parameters
    mean the same thing to a renderer.
    """

    n: int
    k: int
    effect: float
    confidence: float = DEFAULT_CONFIDENCE

    @property
    def rate(self) -> float:
        return wilson(self.k, self.n, _z(self.confidence))[0]

    @property
    def lo(self) -> float:
        return wilson(self.k, self.n, _z(self.confidence))[1]

    @property
    def hi(self) -> float:
        return wilson(self.k, self.n, _z(self.confidence))[2]

    @property
    def score(self) -> float:
        """Lower-bound rate × effect — the quantity severity is judged on."""
        return self.lo * self.effect

    @property
    def severity(self) -> str:
        return finding_severity(self.score)

    @property
    def wide(self) -> bool:
        """Soft when ``n`` is thin or the Wilson interval is broad — mirrors
        :attr:`Estimate.wide` so the flag means the same thing for findings."""
        if self.n == 0 or self.n < _WIDE_MIN_N:
            return True
        half = (self.hi - self.lo) / 2.0
        ref = self.rate if self.rate else 1.0
        return half > _WIDE_REL_HALFWIDTH * ref

    def to_dict(self) -> dict:
        return {
            "rate": round(self.rate, 4),
            "lo": round(self.lo, 4),
            "hi": round(self.hi, 4),
            "n": self.n,
            "k": self.k,
            "effect": round(self.effect, 4),
            "score": round(self.score, 4),
            "wide": self.wide,
            "confidence": self.confidence,
        }


def _z(confidence: float) -> float:
    """z for a two-sided interval at ``confidence``. Only ``DEFAULT_CONFIDENCE``
    is used in practice; other levels fall back to the same z (stdlib has no
    inverse-normal) rather than fabricating a wrong one."""
    return _FINDING_Z


def _bootstrap_ci(samples: Sequence[float], statistic: Callable[[Sequence[float]], float],
                  confidence: float) -> "tuple[float, float]":
    """Percentile bootstrap CI for ``statistic`` at ``confidence`` mass.

    A single sample has no spread to resample, so its interval collapses to the
    point — honest (n=1 ``wide`` still flags it) rather than a fabricated band.
    """
    n = len(samples)
    if n == 1:
        v = float(samples[0])
        return v, v
    rng = random.Random(_SEED)
    stats = []
    for _ in range(_BOOTSTRAP_ITERS):
        resample = [samples[rng.randrange(n)] for _ in range(n)]
        stats.append(statistic(resample))
    stats.sort()
    tail = (1.0 - confidence) / 2.0
    lo = stats[max(0, int(tail * _BOOTSTRAP_ITERS))]
    hi = stats[min(_BOOTSTRAP_ITERS - 1, int((1.0 - tail) * _BOOTSTRAP_ITERS))]
    return round(lo, 4), round(hi, 4)


def _estimate(samples: Sequence[float], statistic: Callable[[Sequence[float]], float],
              method: str, confidence: float) -> Estimate:
    xs = [float(x) for x in samples]
    if not xs:
        return Estimate(value=None, lo=None, hi=None, n=0, confidence=confidence, method="none")
    point = round(statistic(xs), 4)
    lo, hi = _bootstrap_ci(xs, statistic, confidence)
    return Estimate(value=point, lo=lo, hi=hi, n=len(xs), confidence=confidence, method=method)


def estimate_median(samples: Sequence[float],
                    confidence: float = DEFAULT_CONFIDENCE) -> Estimate:
    """Median point estimate with a bootstrap CI (basal per-slot rate)."""
    return _estimate(samples, statistics.median, "bootstrap-median", confidence)


def estimate_mean(samples: Sequence[float],
                  confidence: float = DEFAULT_CONFIDENCE) -> Estimate:
    """Mean point estimate with a bootstrap CI (ISF correction-response)."""
    return _estimate(samples, statistics.fmean, "bootstrap-mean", confidence)


def _ols_slope(pairs: Sequence[Tuple[float, float]]) -> float:
    """Least-squares slope of ``y`` on ``x`` for ``(x, y)`` pairs.

    Raises :class:`ZeroDivisionError` when ``x`` has no spread (an undefined
    slope) — the paired bootstrap below skips such degenerate resamples.
    """
    n = len(pairs)
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    sxx = sum((p[0] - mx) ** 2 for p in pairs)
    if sxx == 0:
        raise ZeroDivisionError("no variance in x")
    sxy = sum((p[0] - mx) * (p[1] - my) for p in pairs)
    return sxy / sxx


def _bootstrap_ci_pairs(pairs: Sequence[Tuple[float, float]],
                        statistic: Callable[[Sequence[Tuple[float, float]]], float],
                        confidence: float) -> "tuple[Optional[float], Optional[float]]":
    """Percentile bootstrap CI for a statistic over ``(x, y)`` pairs.

    Resamples whole pairs (so the x/y coupling is preserved) and drops any
    degenerate resample the statistic can't be computed on."""
    n = len(pairs)
    rng = random.Random(_SEED)
    stats: List[float] = []
    for _ in range(_BOOTSTRAP_ITERS):
        resample = [pairs[rng.randrange(n)] for _ in range(n)]
        try:
            stats.append(statistic(resample))
        except ZeroDivisionError:
            continue
    if not stats:
        return None, None
    stats.sort()
    tail = (1.0 - confidence) / 2.0
    lo = stats[max(0, int(tail * len(stats)))]
    hi = stats[min(len(stats) - 1, int((1.0 - tail) * len(stats)))]
    return round(lo, 4), round(hi, 4)


def _pooled_ratio(pairs: Sequence[Tuple[float, float]]) -> float:
    """Ratio of summed numerators to summed denominators, ``Σnum / Σden``.

    A carb-weighted I:C: ``Σcarbs / Σinsulin`` rather than the mean of per-meal
    ``carbs/insulin`` ratios. The mean-of-ratios overweights small meals and is
    biased high (Jensen's inequality on ``1/x``); the pooled ratio is the
    unbiased whole-dataset estimator. Raises :class:`ZeroDivisionError` when the
    denominators sum to zero (a degenerate resample the bootstrap skips).
    """
    den = sum(p[1] for p in pairs)
    if den == 0:
        raise ZeroDivisionError("denominators sum to zero")
    return sum(p[0] for p in pairs) / den


def estimate_pooled_ratio(pairs: Sequence[Tuple[float, float]],
                          confidence: float = DEFAULT_CONFIDENCE) -> Estimate:
    """Carb-weighted ``Σnum / Σden`` point estimate with a paired-bootstrap CI.

    ``pairs`` are ``(numerator, denominator)`` — for I:C, ``(carbs, insulin)``.
    Unlike :func:`estimate_mean` over per-meal ratios this pools the meals, so it
    is unbiased and lets the CI ``wide`` flag key off genuine dispersion rather
    than the mean-of-ratios inflation. Needs at least one pair with a non-zero
    denominator; otherwise a valueless (n-carrying) :class:`Estimate`.
    """
    pts = [(float(x), float(y)) for x, y in pairs]
    if not pts:
        return Estimate(value=None, lo=None, hi=None, n=0,
                        confidence=confidence, method="none")
    try:
        point = round(_pooled_ratio(pts), 4)
    except ZeroDivisionError:
        return Estimate(value=None, lo=None, hi=None, n=len(pts),
                        confidence=confidence, method="none")
    lo, hi = _bootstrap_ci_pairs(pts, _pooled_ratio, confidence)
    return Estimate(value=point, lo=lo, hi=hi, n=len(pts),
                    confidence=confidence, method="bootstrap-pooled-ratio")


def _bootstrap_ci_clusters(clusters: Sequence[Sequence[Tuple[float, float]]],
                           statistic: Callable[[Sequence[Tuple[float, float]]], float],
                           confidence: float) -> "tuple[Optional[float], Optional[float]]":
    """Percentile bootstrap CI that resamples whole *clusters* with replacement.

    Each iteration draws ``len(clusters)`` clusters (a cluster = all ``(x, y)``
    pairs of one night) with replacement and pools their pairs before computing
    the statistic — so correlated within-night steps enter or leave together and
    the band reflects the number of nights, not the number of steps. Degenerate
    resamples the statistic can't be computed on (no x-spread) are dropped, same
    as :func:`_bootstrap_ci_pairs`. A single cluster has no between-cluster spread
    to resample, so every resample is identical and the interval collapses to the
    point — honest (an n<3 estimate still flags ``wide``) rather than fabricated.
    """
    m = len(clusters)
    rng = random.Random(_SEED)
    stats: List[float] = []
    for _ in range(_BOOTSTRAP_ITERS):
        resample: List[Tuple[float, float]] = []
        for _ in range(m):
            resample.extend(clusters[rng.randrange(m)])
        try:
            stats.append(statistic(resample))
        except ZeroDivisionError:
            continue
    if not stats:
        return None, None
    stats.sort()
    tail = (1.0 - confidence) / 2.0
    lo = stats[max(0, int(tail * len(stats)))]
    hi = stats[min(len(stats) - 1, int((1.0 - tail) * len(stats)))]
    return round(lo, 4), round(hi, 4)


def estimate_pooled_ratio_clustered(
        pairs_by_cluster: Sequence[Sequence[Tuple[float, float]]],
        confidence: float = DEFAULT_CONFIDENCE) -> Estimate:
    """Pooled ``Σnum / Σden`` with a CI that resamples whole *clusters* (I:C, #518).

    ``pairs_by_cluster`` groups ``(numerator, denominator)`` pairs by the unit of
    independent evidence — for I:C, one meal run's ``(carbs, insulin)``. Same point
    estimate as :func:`estimate_pooled_ratio` over the flattened pairs; the band
    comes from :func:`_bootstrap_ci_clusters`, so a run's meals enter or leave a
    resample together. Meals inside one run share a starting BG, a single outcome
    read and one CIQ response, and treating them as independent understates the 80%
    interval by 1.6–1.8× on real data — the same correlated-sample error
    :func:`estimate_slope_clustered` fixes for fasting nights.

    Unlike that one, ``n`` is the number of **clusters**, not pooled pairs: a run is
    one closed balance sheet (a night is many 5-min steps), so runs are the unit the
    estimate is measured in, the unit ``wide``'s ``n < 3`` floor should judge, and
    the unit every downstream count and countdown speaks. Empty clusters are dropped.
    """
    clusters = [[(float(x), float(y)) for x, y in cluster]
                for cluster in pairs_by_cluster]
    clusters = [cluster for cluster in clusters if cluster]
    pts = [pair for cluster in clusters for pair in cluster]
    if not pts:
        return Estimate(value=None, lo=None, hi=None, n=0,
                        confidence=confidence, method="none")
    try:
        point = round(_pooled_ratio(pts), 4)
    except ZeroDivisionError:
        return Estimate(value=None, lo=None, hi=None, n=len(clusters),
                        confidence=confidence, method="none")
    lo, hi = _bootstrap_ci_clusters(clusters, _pooled_ratio, confidence)
    return Estimate(value=point, lo=lo, hi=hi, n=len(clusters),
                    n_clusters=len(clusters), confidence=confidence,
                    method="bootstrap-pooled-ratio-clustered")


def estimate_slope(pairs: Sequence[Tuple[float, float]],
                   confidence: float = DEFAULT_CONFIDENCE) -> Estimate:
    """OLS slope of ``y`` on ``x`` with a paired percentile-bootstrap CI.

    The ISF deviation model regresses 5-min ΔBG on the insulin that acted in the
    step; ``ISF = -slope`` (see :func:`ciq_autotune.analyzers.isf.analyze_isf`).
    A slope needs at least two points and some spread in ``x`` — otherwise the
    estimate is a valueless (n-carrying) :class:`Estimate`, same as an empty mean.
    """
    pts = [(float(x), float(y)) for x, y in pairs]
    if len(pts) < 2:
        return Estimate(value=None, lo=None, hi=None, n=len(pts),
                        confidence=confidence, method="none")
    try:
        point = round(_ols_slope(pts), 4)
    except ZeroDivisionError:
        return Estimate(value=None, lo=None, hi=None, n=len(pts),
                        confidence=confidence, method="none")
    lo, hi = _bootstrap_ci_pairs(pts, _ols_slope, confidence)
    return Estimate(value=point, lo=lo, hi=hi, n=len(pts),
                    confidence=confidence, method="bootstrap-slope")


def estimate_slope_clustered(pairs: Sequence[Tuple[float, float]],
                             cluster_ids: Sequence[Hashable],
                             confidence: float = DEFAULT_CONFIDENCE) -> Estimate:
    """OLS slope with a *cluster* percentile-bootstrap CI (fasting-ISF, #177).

    Same point estimate as :func:`estimate_slope` — the plain OLS slope over every
    step — but the CI resamples whole clusters instead of individual pairs.
    ``cluster_ids`` is parallel to ``pairs``: pairs sharing an id belong to one
    night, and a night's steps always resample together. This stops thousands of
    correlated same-night 5-min steps from reading as independent evidence, which
    otherwise halves an honest band. ``n`` stays the step count (the estimate still
    ran over every step); a single cluster collapses the band to the point.
    """
    pts = [(float(x), float(y)) for x, y in pairs]
    if len(pts) < 2:
        return Estimate(value=None, lo=None, hi=None, n=len(pts),
                        confidence=confidence, method="none")
    try:
        point = round(_ols_slope(pts), 4)
    except ZeroDivisionError:
        return Estimate(value=None, lo=None, hi=None, n=len(pts),
                        confidence=confidence, method="none")
    groups: Dict[Hashable, List[Tuple[float, float]]] = {}
    for pair, cid in zip(pts, cluster_ids):
        groups.setdefault(cid, []).append(pair)
    lo, hi = _bootstrap_ci_clusters(list(groups.values()), _ols_slope, confidence)
    return Estimate(value=point, lo=lo, hi=hi, n=len(pts), n_clusters=len(groups),
                    confidence=confidence, method="bootstrap-slope-clustered")
