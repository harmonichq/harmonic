"""Episode segmentation — cluster anchors into episodes (#70 §1).

An **episode** is a contiguous cluster of anchors that belong to the same story:
a meal and the low its over-dose caused; a low, its rescue, and the rebound high.
The extent rule, validated on a real 21-day CIQ dataset:

* cluster anchors separated by no more than a **~75–90 min gap** (default 90);
* a well-separated next anchor **caps** the prior episode (it starts a new one);
* a **~5 h max-duration hard cap** splits a cluster that would otherwise run away
  (the dead-site safety net).

Return-to-baseline and IOB-clear extents were **rejected** (#70): in-range
plateaus are too sparse for this user (~4.7 anchors/day), so those rules blob into
10–31 h episodes. Gap-clustering reproduces every hand-picked episode with 0
episodes >4 h and ~5/day.

**Double-hump splitting (#80).** Gap-clustering + the 5 h cap sometimes *over*-merge:
two distinct excursions (e.g. a meal that ran away and recovered, then a *separate*
later meal that ran away) get stapled into one episode when the trough between them
is under the 90-min gap. Attribution is one-lever-per-episode, so the first
excursion's driver is silently dropped. :func:`split_double_humps` runs as a
post-pass and splits an over-merged cluster **at a return-to-range trough that lies
between two distinct anchor groups** — a divider *within* a cluster. This is not the
rejected baseline-ending rule (#70): it never *ends* an episode at a trough, it only
cuts an already-clustered blob where the CGM genuinely came home to range between
two independent stories, giving each excursion its own anchors/trigger/attribution.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional, Sequence, Tuple

from ...events import BolusEvent, CgmReading
from ..scenario_config import ScenarioConfig
from .anchors import Anchor, AnchorKind

# The gap / duration caps, in-range band edges, rebound horizon, and the three
# settled-recovery levelness knobs now live on ``ScenarioConfig`` (the ``segment_*``
# fields). ``segment_recovery_max_slope`` (0.2) is the #153 retune that preserves the
# #149 invariant: a slow monotonic rebound climbs at ≥0.35 mg/dL/min through range
# and never levels, while a settled recovery plateau sits at |slope| ≤0.11 and caps
# the scan before the next meal.

# Back-compat re-exports: the episode-duration cap, the over-treated-low rebound bar,
# and the post-nadir scan horizon now live on ``ScenarioConfig`` (``segment_max_duration_min``
# / ``segment_rebound_high_mgdl`` / ``segment_rebound_horizon_min`` — the live values the
# segmenter reads). Kept as module aliases because the scenario-engine tests import them.
MAX_DURATION_MIN = ScenarioConfig().segment_max_duration_min
REBOUND_HIGH_MGDL = ScenarioConfig().segment_rebound_high_mgdl
REBOUND_HORIZON_MIN = ScenarioConfig().segment_rebound_horizon_min


@dataclass(frozen=True)
class EpisodeAnchors:
    """A raw cluster of anchors before attribution — the segmentation output.

    The engine turns each of these into a full ``Episode`` (trigger, lever,
    severity, steps, window). ``start`` / ``end`` bound the cluster in wall-clock.
    """

    anchors: List[Anchor]

    @property
    def start(self) -> datetime:
        # The earliest instant any anchor reaches (a CGM run / suspend reaches back
        # to its onset, not just its extremum).
        return min(a.reach_start for a in self.anchors)

    @property
    def end(self) -> datetime:
        # The latest instant any anchor reaches (run end / suspend end).
        return max(a.reach_end for a in self.anchors)


def segment(
    anchors: Sequence[Anchor],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> List[EpisodeAnchors]:
    """Cluster time-sorted ``anchors`` into episodes by the gap + hard-cap rule.

    A new episode starts when the gap from the running cluster exceeds
    ``max_gap_min``, **or** when adding the anchor would push the cluster's span
    past ``max_duration_min``. The gap is measured between the cluster's current
    *reach-end* and the anchor's *reach-start*, so a continuous CGM excursion whose
    only anchors are its onset and its extremum still clusters as one episode (the
    run spans the whole rise). Anchors are re-sorted by time defensively.
    """
    ordered = sorted(anchors, key=lambda a: a.reach_start)
    max_gap = timedelta(minutes=scenario_config.segment_max_gap_min)
    max_dur = timedelta(minutes=scenario_config.segment_max_duration_min)

    episodes: List[EpisodeAnchors] = []
    current: List[Anchor] = []
    cluster_start: datetime = datetime.min
    cluster_end: datetime = datetime.min
    for a in ordered:
        if not current:
            current = [a]
            cluster_start = a.reach_start
            cluster_end = a.reach_end
            continue
        gap = a.reach_start - cluster_end
        span = a.reach_end - cluster_start
        if gap > max_gap or span > max_dur:
            episodes.append(EpisodeAnchors(anchors=current))
            current = [a]
            cluster_start = a.reach_start
            cluster_end = a.reach_end
        else:
            current.append(a)
            cluster_end = max(cluster_end, a.reach_end)
    if current:
        episodes.append(EpisodeAnchors(anchors=current))
    return episodes


# --- Double-hump splitting (#80) -------------------------------------------------

# Anchor kinds that carry a "story" worth its own attribution — a divider only
# splits between two groups that each contain one of these. A lone CGM low/high that
# is merely the shape of the same excursion should not be torn from its meal.
_STORY_KINDS = frozenset({AnchorKind.MEAL, AnchorKind.CORRECTION, AnchorKind.HIGH})


def _in_range(bg: float, scenario_config: ScenarioConfig = ScenarioConfig()) -> bool:
    return scenario_config.segment_range_low_mgdl <= bg <= scenario_config.segment_range_high_mgdl


def _divider_trough(
    cgm: Sequence[CgmReading],
    left_start: datetime,
    boundary: datetime,
    right_end: datetime,
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Optional[datetime]:
    """The trough dividing two humps, if the CGM genuinely came home between them.

    A genuine divider is a return-to-range trough *between* two independent
    excursions: the left hump peaked out of range and settled back into range, and
    the right hump then climbs back out of range. So we require the trough to be an
    in-range reading that has an out-of-range reading on **both** sides —
    ``left_start .. boundary`` on the left (the first hump left range) and
    ``boundary .. right_end`` on the right (the second hump climbs back out).

    Requiring out-of-range on both sides rejects (a) the *pre-excursion baseline*
    (in range only before BG ever left range) and (b) a lone excursion that transits
    through range on its way to a low (#70 — one hump that crosses the band is not two
    stories). Returns the deepest such trough at/before ``boundary``, or ``None``.
    """
    def in_span(a: datetime, b: datetime) -> List[Tuple[datetime, float]]:
        return sorted(
            (r.t, r.bg) for r in cgm
            if r.bg is not None and a < r.t < b
        )

    left = in_span(left_start, boundary)
    right = in_span(boundary, right_end)
    if not left:
        return None
    # The left hump must have left range, and the right hump must climb back out —
    # otherwise there is no second story to divide off.
    if not any(not _in_range(bg, scenario_config) for _t, bg in left):
        return None
    if not any(not _in_range(bg, scenario_config) for _t, bg in right):
        return None
    # The cut point is the deepest in-range reading on the left hump's *descent* (the
    # settled return to range before the second hump begins).
    in_range = [(bg, t) for t, bg in left if _in_range(bg, scenario_config)]
    if not in_range:
        return None
    _bg, trough_t = min(in_range, key=lambda bt: bt[0])
    return trough_t


def split_double_humps(
    episodes: Sequence[EpisodeAnchors],
    cgm: Sequence[CgmReading],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> List[EpisodeAnchors]:
    """Split over-merged clusters at a return-to-range trough between two humps (#80).

    For each episode with two or more *story* anchors (meal / correction / high),
    look for a return-to-range trough in the CGM *between* consecutive story anchors.
    If BG genuinely left range and came home between them, that trough is a divider:
    the cluster is two independent excursions stapled together, and we cut it there so
    each hump keeps its own anchors (and thus its own trigger + attribution).

    Recurses so a triple-hump splits fully. Episodes with fewer than two story anchors
    (or no return-to-range trough between them) pass through unchanged — this never
    ends an episode at baseline (#70), it only divides an already-clustered blob where
    the data shows two separate stories.
    """
    out: List[EpisodeAnchors] = []
    for ep in episodes:
        out.extend(_split_one(ep, cgm, scenario_config=scenario_config))
    return out


def _split_one(
    ep: EpisodeAnchors, cgm: Sequence[CgmReading],
    *, scenario_config: ScenarioConfig = ScenarioConfig(),
) -> List[EpisodeAnchors]:
    ordered = sorted(ep.anchors, key=lambda a: a.reach_start)
    story_idx = [i for i, a in enumerate(ordered) if a.kind in _STORY_KINDS]
    if len(story_idx) < 2:
        return [ep]

    # Find the first divider between consecutive story anchors: a return-to-range
    # trough where the left hump settled back into range before the right hump (whose
    # excursion runs out to its reach_end) climbs back out.
    for left_pos, right_pos in zip(story_idx, story_idx[1:]):
        left = ordered[left_pos]
        right = ordered[right_pos]
        trough = _divider_trough(
            cgm, left.reach_start, right.t, right.reach_end,
            scenario_config=scenario_config,
        )
        if trough is None:
            continue
        # Cut the cluster at the trough: anchors reaching before it stay left, the
        # rest go right. Split by reach_start so each anchor lands on its own side.
        left_anchors = [a for a in ordered if a.reach_start <= trough]
        right_anchors = [a for a in ordered if a.reach_start > trough]
        if not left_anchors or not right_anchors:
            continue
        # Recurse on the right remainder so a triple-hump splits fully.
        return [EpisodeAnchors(anchors=left_anchors)] + _split_one(
            EpisodeAnchors(anchors=right_anchors), cgm, scenario_config=scenario_config
        )

    return [ep]


# --- Over-treated-low split (#104) ----------------------------------------------


def _settled_dwell(
    rows: Sequence[CgmReading], i: int,
    *, scenario_config: ScenarioConfig = ScenarioConfig(),
) -> bool:
    """Whether ``rows[i]`` begins a settled in-range dwell (#149 / #153).

    A dwell holds level in range for at least :data:`RECOVERY_DWELL_MIN`, every reading
    in ``[RANGE_LOW_MGDL, RANGE_HIGH_MGDL]``, holding **level** — its least-squares slope
    near-zero in either direction (magnitude at/below :data:`RECOVERY_MAX_SLOPE`) and its
    detrended noise within :data:`RECOVERY_DRIFT_MGDL`. That distinguishes a genuine
    recovery plateau — BG has come to rest in range and merely noodles around a level —
    from BG transiting up through range on its way to the rebound peak (which climbs
    steadily) or falling back off a peak (which the scan must pass through, not cap on).

    The slope gate (not a raw min–max band) is the #153 retune: real recovered CGM swings
    ±10-15 mg/dL of Dexcom noise across the dwell, so a band tight enough to reject a slow
    climb also rejects every real plateau — the guard was inert on live data. Sizing the
    discrimination to the *trend* fires on real noise while still holding the #149
    invariant (a slow continuous rebound never plateaus). The full dwell must be present
    in the data (no truncation at the horizon / a gap), or it isn't a confirmed settle.
    """
    start = rows[i]
    dwell = timedelta(minutes=scenario_config.segment_recovery_dwell_min)
    window = [start]
    for r in rows[i + 1:]:
        if r.t - start.t > dwell:
            break
        window.append(r)
    if window[-1].t - start.t < dwell:
        return False                                   # not enough span to confirm
    if any(not _in_range(r.bg, scenario_config) for r in window):
        return False
    slope, intercept = _dwell_trend(window, start.t)
    if abs(slope) > scenario_config.segment_recovery_max_slope:
        return False                                   # still moving — not a level rest
    # Detrended noise: readings must sit within the noise band of the fitted level, or
    # the window is swinging too hard to be a level settle.
    for r in window:
        x = (r.t - start.t).total_seconds() / 60.0
        if abs(r.bg - (slope * x + intercept)) > scenario_config.segment_recovery_drift_mgdl:
            return False
    return True


def _dwell_trend(
    window: Sequence[CgmReading], t0: datetime
) -> Tuple[float, float]:
    """The (slope mg/dL·min⁻¹, intercept) of the least-squares fit of ``window`` vs
    minutes since ``t0``. A single-reading window has no trend (slope 0)."""
    n = len(window)
    xs = [(r.t - t0).total_seconds() / 60.0 for r in window]
    ys = [r.bg for r in window]
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    denom = sum((x - mean_x) ** 2 for x in xs)
    if denom == 0.0:
        return 0.0, mean_y
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom
    return slope, mean_y - slope * mean_x


@dataclass(frozen=True)
class GuardedRebound:
    """The guarded post-nadir scan's result: its rebound peak and its terminal.

    * ``peak`` — the maximum BG within the guarded window, or ``None`` when no reading
      falls in it (the over-treated-low bar is tested against this).
    * ``peak_t`` — the wall-clock instant of that peak reading, or ``None`` when
      ``peak`` is. The #155 over-treated-low split anchors the rebound's high-moment
      here (and bounds the recovery-dip search at it) so the anchor instant comes from
      the *same* scan the peak and terminal do — one source of truth (#149).
    * ``terminal`` — the wall-clock instant the excursion *resolves*: the point where
      the scan settles into a level plateau / re-dips to a new low / breaks on a CGM
      gap (or the last scanned reading when it simply runs to the horizon). This is the
      excursion's true end — well past the peak, out through the multi-hour decline
      back toward range — and is what the engine scores an over-treated low over (#124).
      ``None`` only when ``peak`` is (no reading in the window).

    Both fall out of the *same single scan* so the split (#104), the label (#149), and
    the scored span (#124) are driven by one source of truth and cannot disagree.
    """

    peak: Optional[float]
    terminal: Optional[datetime]
    peak_t: Optional[datetime] = None


def guarded_rebound(
    cgm: Sequence[CgmReading], nadir_t: datetime,
    *,
    stop_at: Optional[datetime] = None,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> GuardedRebound:
    """The guarded post-nadir rebound scan: its peak and terminal (#104 / #149 / #124).

    Scans forward from ``nadir_t`` up to ``segment_rebound_horizon_min``, capped at
    the first continuity break so the peak is tied to the same excursion off the low
    — never a later, unrelated high. The scan ends at the earliest of:

    * ``stop_at`` — a hard boundary for a known new story, currently the next
      substantial carb-tagged meal bolus. Readings up to that instant may still
      describe the low's rebound; readings after it belong to the meal. The terminal
      is capped at ``stop_at`` so episode scoring also stops there;
    * a settled recovery — the first reading where BG re-enters range and then
      dwells level there;
    * a re-dip below range after BG had recovered into range;
    * a CGM gap wider than ``segment_max_gap_min``.

    With no cap the scan runs to the horizon and the terminal is the last scanned
    reading. Returns ``GuardedRebound`` with all fields ``None`` when no reading
    falls in the window.
    """
    horizon_end = nadir_t + timedelta(minutes=scenario_config.segment_rebound_horizon_min)
    if stop_at is not None:
        horizon_end = min(horizon_end, stop_at)
    rows = sorted(
        (r for r in cgm if r.bg is not None and nadir_t < r.t <= horizon_end),
        key=lambda r: r.t,
    )
    if not rows:
        return GuardedRebound(peak=None, terminal=None, peak_t=None)

    peak: Optional[float] = None
    peak_t: Optional[datetime] = None
    prev_t = nadir_t
    recovered = False
    terminal = (
        stop_at if stop_at is not None and stop_at <= horizon_end else rows[-1].t
    )
    for i, r in enumerate(rows):
        if r.t - prev_t > timedelta(minutes=scenario_config.segment_max_gap_min):
            terminal = prev_t                           # dropout — ends at last good reading
            break
        prev_t = r.t
        if r.bg < scenario_config.segment_range_low_mgdl:
            if recovered:
                terminal = r.t                          # re-dip to a new low
                break
        elif _in_range(r.bg, scenario_config):
            recovered = True
            if _settled_dwell(rows, i, scenario_config=scenario_config):
                terminal = r.t                          # level plateau — BG came to rest
                break
        if peak is None or r.bg > peak:
            peak, peak_t = r.bg, r.t
    return GuardedRebound(peak=peak, terminal=terminal, peak_t=peak_t)


def guarded_rebound_peak(
    cgm: Sequence[CgmReading], nadir_t: datetime,
    *, scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Optional[float]:
    """The rebound peak of the guarded post-nadir scan (:func:`guarded_rebound`).

    A thin ``.peak`` accessor for the callers that only need whether/how high the low
    rebounded (:func:`_rebounds`, the split). The terminal is read via
    :func:`guarded_rebound` where the scored span needs it (#124) — one scanner, so
    peak and terminal can never diverge.
    """
    return guarded_rebound(cgm, nadir_t, scenario_config=scenario_config).peak


def recovery_dip(
    cgm: Sequence[CgmReading], nadir_t: datetime, peak_t: datetime,
    *, scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Optional[datetime]:
    """The recovery dip between an over-treated low's crash and its rebound (#155).

    The instant BG *first came home to range* on the climb out of the nadir, before
    the over-correction sent it back out the top — the deepest in-range reading in
    ``(nadir_t, peak_t]``. This is the divider between the two scored moments of a
    split over-treated low: the low-moment's crash ends here, the high-moment's climb
    starts here (disjoint spans, #155 AC4). Mirrors :func:`_divider_trough`'s
    "deepest in-range reading on the ascent" cut, specialized to the low→rebound
    ascent (which has no settled trough — it transits straight up through range).

    Returns ``None`` when the ascent carries no in-range reading (BG leapt from
    sub-range to high with no reading between) — the caller then declines to split.
    """
    in_range = sorted(
        ((r.bg, r.t) for r in cgm
         if r.bg is not None and nadir_t < r.t <= peak_t and _in_range(r.bg, scenario_config)),
        key=lambda bt: (bt[0], bt[1]),
    )
    return in_range[0][1] if in_range else None


def _rebounds(
    cgm: Sequence[CgmReading], nadir_t: datetime,
    *, scenario_config: ScenarioConfig = ScenarioConfig(),
) -> bool:
    """Whether the CGM rebounds to a high within the guarded post-low scan of ``nadir_t``.

    The over-treated-low rebound test (ADR 0005 / #149): the guarded rebound peak off
    ``nadir_t`` (:func:`guarded_rebound_peak`) clears ``segment_rebound_high_mgdl``.
    """
    peak = guarded_rebound_peak(cgm, nadir_t, scenario_config=scenario_config)
    return peak is not None and peak >= scenario_config.segment_rebound_high_mgdl


def announced_meal_owns_low(
    bolus: BolusEvent,
    nadir_t: datetime,
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> bool:
    """Whether a substantial announced meal at the low owns its rebound (ADR 225)."""
    tolerance = timedelta(
        minutes=scenario_config.segment_rebound_pre_nadir_meal_tolerance_min
    )
    return (
        bolus.carbs is not None
        and bolus.carbs >= scenario_config.segment_rebound_stop_meal_min_carbs
        and nadir_t - tolerance <= bolus.t <= nadir_t
    )


def split_low_rebounds(
    episodes: Sequence[EpisodeAnchors], cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    *, scenario_config: ScenarioConfig = ScenarioConfig(),
) -> List[EpisodeAnchors]:
    """Give any rebounding low its own episode so an upstream lever can't absorb it (#104).

    Attribution is one-lever-per-episode, earliest-actionable-wins, so a low that
    rebounds high (an over-treated low) sitting *downstream* of a meal / correction /
    high in the same cluster is demoted to a consequence and never counted — the single
    biggest source of the #104 under-count. Unlike :func:`split_double_humps` this does
    **not** require a return-to-range trough between the two (an over-treated low
    typically falls straight *through* range into the low, then rebounds — no settled
    in-range divider exists): a rebounding low anywhere but the head of its cluster is
    cut off at its low-run onset so it becomes its own episode with its own
    trigger/attribution. A low that is already the cluster's lead anchor is left alone
    (it attributes itself); a non-rebounding low stays with its meal (it is that meal's
    over-delivery, not an over-treated low). The engine's non-overlap bound (#80) then
    clamps the upstream episode's forward reach at the split-off low's start.
    """
    out: List[EpisodeAnchors] = []
    for ep in episodes:
        out.extend(_split_low_one(ep, cgm, bolus, scenario_config=scenario_config))
    return out


def _split_low_one(
    ep: EpisodeAnchors, cgm: Sequence[CgmReading], bolus: Sequence[BolusEvent],
    *, scenario_config: ScenarioConfig = ScenarioConfig(),
) -> List[EpisodeAnchors]:
    ordered = sorted(ep.anchors, key=lambda a: a.reach_start)
    for i, a in enumerate(ordered):
        if i == 0 or a.kind is not AnchorKind.LOW:
            continue                                   # head anchor attributes itself
        if any(announced_meal_owns_low(b, a.t, scenario_config=scenario_config)
               for b in bolus):
            continue                                   # the meal owns this rebound
        if not _rebounds(cgm, a.t, scenario_config=scenario_config):
            continue                                   # a plain low stays with its meal
        left, right = ordered[:i], ordered[i:]
        if not left or not right:
            continue
        # Recurse on the right remainder so a second rebounding low splits off too.
        return [EpisodeAnchors(anchors=left)] + _split_low_one(
            EpisodeAnchors(anchors=right), cgm, bolus,
            scenario_config=scenario_config,
        )
    return [ep]
