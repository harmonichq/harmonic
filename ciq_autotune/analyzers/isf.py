"""A2 · ISF analyzer — a single fasting-ISF from an oref-style deviation model.

ISF (Insulin Sensitivity Factor) is how far one unit drops glucose. It is the
*aggressive-110 lever* (ADR 0001): Control-IQ sizes its automatic corrections
from the profile ISF, so a tighter ISF makes it correct harder toward its
built-in 110 target. CIQ never logs the ISF it assumes, so ISF can only be
*inferred* from BG response — a modeling problem, not an observation.

Per ADR 0001 we retired the correction-window filter (it starved to n≈2 on 30
days of real data) for a deviation model over **fasting** data:

* over each 5-min step in a true-fasting window we regress ``ΔBG`` on the insulin
  that *acted* in that step — total (bolus + basal micro-dose) activity via the
  oref curve in :mod:`~ciq_autotune.insulin`;
* ``ΔBG = β0 + β1 · insulin_acted``; **ISF = -β1**. β0 absorbs steady-state
  basal/EGP drift, so the slope isolates insulin's marginal effect.

The result is one honest number with a CI, **not** a per-segment schedule:
daytime ISF is not separately identifiable from this data (the confounder is
meal boluses logged with no carbs at all — oref0-UAM territory, out of scope), so
we measure the one regime that is clean (overnight fasting) and report it alone.

Fasting = inside a **detected rest window** for that night (#109/#110: behavioral
sleep inferred from carb-bolus absence + CGM quiescence, clamped to a nocturnal
envelope — not a fixed clock) **and** no carb-bearing bolus in the prior ~5h. The
rest window *replaces* the old hardcoded 00:00–06:00 clock: it personalizes the
regime for late sleepers / shift workers and excludes unlogged meals more directly
than a clock can (ADR 0001's "bigger prize").

**Lows own the direction (#413).** The pooled regression is leverage-fragile — a
few contaminated high-leverage nights drag its band to the *stronger* side while the
correction-caused lows say weaken. So the card weakens whenever those lows (or
correction-attributed rescue logs) recur past a priced day-rate bar. That weaken is
**direction-only** (#468): the harm evidence is real but it does not size a new ISF —
the half-gap toward the robust **per-night median** binds at the ±20% cap and the
pooled fit disagrees with it, so it survives only as the lever's pricing basis and is
never recommended, staged, or programmed. The measurement channel may assert a
direction only in silence, and then only *strengthen*, and only when the signal held
across two consecutive decision points. A single correction-caused low still gates
any move toward stronger corrections (adr-283/adr-313). Recurrence + the step target
are **night-based** — nights are the Bernoulli/estimator unit, never 5-min steps.

**Silence must be observed (#467).** The rescue log began part-way through the
history, so a window reaching back before it has no rescue rows for want of an
instrument. That is *unknown*, not quiet: the caller passes the window's rescue
coverage (:class:`~ciq_autotune.rescue_evidence.RescueObservation`) and an
under-covered window can never satisfy the strengthen gate.
"""

from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

from ..carbs import (
    CARB_ONSET_DELAY_MIN,
    CARB_TRAILING_GUARD_MIN,
    FAST_CARB_RATE_G_PER_H,
    MEAL_CARB_RATE_G_PER_H,
    CarbsOnBoard,
    carb_doses,
)
from ..events import BasalEvent, BolusEvent, CarbEntry, CgmReading
from ..harm import (
    ArmHarm,
    HarmAction,
    HarmArm,
    HarmConfig,
    PrintedLow,
    apply_harm_gate_nudge,
    arm_harm,
    arm_harm_evidence,
    find_printed_lows,
)
from ..insulin import InsulinActivity, basal_microdoses
from ..rescue_evidence import RescueObservation
from ..rest_window import RestWindow, RestWindowConfig, detect_rest_windows
from ..result import SegmentEstimate
from ..uncertainty import (
    DEFAULT_CONFIDENCE,
    Estimate,
    estimate_slope_clustered,
    wilson,
)


def _env_label(cfg: RestWindowConfig) -> str:
    """The nocturnal envelope as a human ``HH:MM–HH:MM`` string (wraps midnight)."""
    s, e = cfg.env_start_min, cfg.env_end_min
    return f"{s // 60:02d}:{s % 60:02d}–{e // 60:02d}:{e % 60:02d}"


@dataclass(frozen=True)
class IsfConfig:
    # The fasting regime is a per-night **detected rest window** (#109/#110), not a
    # clock: both CGM endpoints of a step must fall inside the same window for that
    # night. ``rest_window`` is the detector's config (nocturnal envelope, edge-trim
    # thresholds, coverage floor); the envelope default 22:00–08:00 is the outer
    # bound the personalized window shifts within.
    rest_window: RestWindowConfig = field(default_factory=RestWindowConfig)
    # Fasting's other half: no carbs on board — but a carb-bearing BOLUS and an
    # unbolused Carb-log entry need different guards (ADR 0011 / #169, corrected
    # against the real-data backtest):
    #   * A carb-bearing bolus is masked for the meal-INSULIN excursion via the flat
    #     ~DIA `carb_lookback_min` below, NOT grams-scaled — its ~5 h post-meal
    #     descent would otherwise collapse the ISF fit (see fasting_steps).
    #   * Only the unbolused Carb-log stream is grams-scaled by static forward-decay
    #     COB (snacks / overnight low treatments have no covering bolus, so only the
    #     carbs contaminate): a small low treatment releases the gate in ~1.5 h.
    carb_onset_min: float = CARB_ONSET_DELAY_MIN
    carb_guard_min: float = CARB_TRAILING_GUARD_MIN
    meal_carb_rate: float = MEAL_CARB_RATE_G_PER_H
    fast_carb_rate: float = FAST_CARB_RATE_G_PER_H
    # Flat ~DIA lookback masking (a) carb-bearing boluses — the meal-insulin
    # excursion guard — and (b) NULL-gram (certainty='unknown') Carb-log entries,
    # which are never decayed (ADR 0011 §2). ~DIA, so meal insulin has cleared.
    carb_lookback_min: int = 300
    # A step is a *consecutive* CGM pair no wider than this (drop sensor gaps).
    max_gap_min: float = 7.0
    # Drop physiologically implausible 5-min jumps (sensor noise / compressions).
    max_step_delta: float = 30.0
    # oref activity curve (rapid analog defaults; peak < dia/2).
    peak_min: float = 75.0
    dia_min: float = 300.0
    # Cap a recommendation's move from programmed.
    max_step_frac: float = 0.20
    # Cap the scatter/drill-down evidence (the estimate always uses every step).
    max_evidence_points: int = 200
    # --- #413 lows-own-the-direction / night-honest recurrence ------------------
    # The correction target CIQ sizes its automatic corrections toward (its built-in
    # 110); "mg/dL over target" in the impact currency is a correction bolus's BG
    # above this. Not user-tuned — it is CIQ's own setpoint.
    correction_target_mgdl: float = 110.0
    # A correction-caused-low (or correction-attributed rescue-log) day-rate whose
    # Wilson lower bound clears this is a *pattern* that owns the weaken direction
    # (#413 §5). Priced, not the old ≥2-days-of-30 constant: ≈4-of-30 clears, ≈3
    # does not, and it scales with window length by construction (the same Wilson the
    # basal recurrence uses, with the covered window as the denominator).
    low_day_rate_floor: float = 0.05
    # The measurement channel uses the same lower-bound floor over per-night side
    # votes. A pooled regression CI never decides direction; it remains display-only.
    night_vote_rate_floor: float = 0.05

    def describe_gate(self) -> Dict:
        """Structured descriptor of ISF's sufficiency gate (#95).

        ISF's gate is a fasting regression over 5-min steps: it produces a number
        only once enough clean fasting steps accrue (there is no per-day breakdown —
        ADR 0001). Deliberately soft: ``unit``/``needed`` are ``None`` so the
        settling state shows "collecting fasting data" with no fabricated countdown.
        Every string here interpolates this config's own constants, so the text
        cannot drift from the gate."""
        return {
            "unit": None,
            "needed": None,
            "soft": True,
            "criteria": [
                f"CGM step inside a detected rest window ({_env_label(self.rest_window)} envelope)",
                f"no carb-bearing bolus in the prior {self.carb_lookback_min // 60} h "
                "and no logged carbs still on board",
            ],
            "label": "collecting fasting data",
        }


@dataclass(frozen=True)
class FastingStep:
    """One clean fasting 5-min step: the insulin that acted and the BG change.

    ``cluster`` is the containing detected rest window's ``date`` — the night this
    step belongs to. Same-night steps are correlated (same site, same evening
    bolus tail, same hormones), so the ISF CI resamples by this key rather than
    treating each 5-min step as independent evidence (#177).
    """

    t: datetime
    insulin_acted: float
    dbg: float
    cluster: date


def _rest_membership(rest_windows: List[RestWindow]):
    """Return ``cluster_of(t0, t1)`` — the containing detected rest window's
    ``date`` when both endpoints fall in the *same* window, else ``None``. Windows
    are disjoint per night, so a single containing window for both endpoints is the
    clean-fasting gate that replaces the clock; its date doubles as the step's
    night cluster key (#177), so callers need not re-derive a night from timestamps.
    """
    windows = sorted(rest_windows, key=lambda w: w.start)
    starts = [w.start for w in windows]

    def containing(t: datetime) -> int:
        # Rightmost window whose start ≤ t; inside iff t also ≤ its end.
        i = bisect_right(starts, t) - 1
        if i >= 0 and windows[i].start <= t <= windows[i].end:
            return i
        return -1

    def cluster_of(t0: datetime, t1: datetime) -> Optional[date]:
        i = containing(t0)
        if i != -1 and containing(t1) == i:
            return windows[i].date
        return None

    return cluster_of


def fasting_steps(bolus_events: List[BolusEvent], basal_events: List[BasalEvent],
                  cgm_readings: List[CgmReading],
                  config: IsfConfig,
                  rest_windows: List[RestWindow],
                  *,
                  carb_entries: Optional[List[CarbEntry]] = None) -> List[FastingStep]:
    """Clean fasting 5-min steps and their (insulin_acted, ΔBG).

    A step counts when both CGM endpoints fall inside the *same* detected
    ``rest_window`` for that night (#110), intersected with the cleanness filters
    (``carb_lookback_min``, ``max_gap_min``, ``max_step_delta``). The rest window
    replaces the old 00:00–06:00 clock; the deviation model is unchanged.
    """
    cfg = config
    doses: List[Tuple[datetime, float]] = [
        (b.t, float(b.insulin)) for b in bolus_events if b.insulin and b.insulin > 0
    ]
    doses += basal_microdoses(basal_events)
    activity = InsulinActivity(doses, cfg.peak_min, cfg.dia_min)

    # Carbs invalidate the "fasting" claim, but a carb-bearing BOLUS and an
    # unbolused Carb-log entry need different guards (ADR 0011 / #169, corrected
    # after a real-data backtest):
    #
    #  * A carb-bearing bolus (ADR 0003: Tandem carries carbs only on boluses) must
    #    be masked for the meal-INSULIN excursion, not just carb absorption. The
    #    bolus covers the meal, so its insulin acts ~DIA (~5 h) and BG spends that
    #    whole time resolving the excursion — a regime the fasting deviation model
    #    must not see: its steep post-meal descent reads as false insulin potency and
    #    collapses ISF. So bolus carbs keep the flat ~DIA `carb_lookback_min`, NOT
    #    short carb-COB. (This is the same redundancy the basal filter names — bolus
    #    carbs clear before the insulin that covered them — so grams-scaling them
    #    buys nothing and here would drop the excursion guard. Measured: feeding
    #    bolus carbs into COB dragged fasting ISF sharply lower on real data by
    #    admitting ~1,500 post-meal-descent minutes.)
    #
    #  * An unbolused Carb-log entry (#125/#127 — snacks, overnight low treatments)
    #    has NO covering bolus and so NO insulin excursion; only the carbs themselves
    #    contaminate. Those are grams-scaled via static forward-decay COB: a small
    #    low treatment releases the fasting gate in ~1.5 h instead of a flat 5 h.
    #    NULL-gram ('unknown') entries are never decayed (ADR 0011 §2) — carb_doses
    #    drops them — and keep the flat lookback with the boluses below.
    cob = CarbsOnBoard(
        carb_doses(carb_entries,
                   meal_rate=cfg.meal_carb_rate, fast_rate=cfg.fast_carb_rate),
        cfg.carb_onset_min,
    )
    flat_carb_times = sorted(
        [b.t for b in bolus_events if b.carbs and b.carbs > 0]
        + [c.t for c in (carb_entries or []) if c.grams is None]
    )

    cgm = sorted((r.t, r.bg) for r in cgm_readings if r.bg is not None)
    gap = timedelta(minutes=cfg.max_gap_min)
    lookback = timedelta(minutes=cfg.carb_lookback_min)
    cluster_of = _rest_membership(rest_windows)

    out: List[FastingStep] = []
    ci = 0
    for (t0, bg0), (t1, bg1) in zip(cgm, cgm[1:]):
        if not (timedelta(0) < t1 - t0 <= gap):
            continue
        cluster = cluster_of(t0, t1)
        if cluster is None:
            continue
        dbg = bg1 - bg0
        if abs(dbg) > cfg.max_step_delta:
            continue
        # Grams-scaled: unbolused Carb-log COB must have cleared for the guard by t1.
        # The 5-min step ≤ guard, so clearance at t1 also covers t0.
        if not cob.cleared_since(t1, cfg.carb_guard_min):
            continue
        # Flat ~DIA guard: any carb-bearing bolus or NULL-gram entry in
        # [t0 - lookback, t1] means a meal excursion is (or was) in play.
        guard_lo = t0 - lookback
        while ci < len(flat_carb_times) and flat_carb_times[ci] < guard_lo:
            ci += 1
        if ci < len(flat_carb_times) and flat_carb_times[ci] <= t1:
            continue
        out.append(FastingStep(t=t0, insulin_acted=activity.acted(t0, t1), dbg=dbg,
                               cluster=cluster))
    return out


def _programmed_fasting_isf(isf_segments: List[Tuple[int, float]],
                            cfg: IsfConfig) -> Optional[float]:
    """The programmed ISF over the nocturnal envelope (median of overlapping segments).

    The pump schedule is still per-segment; the rest region spans more than one and
    wraps midnight. We compare our single measured value against the programmed ISF
    in force overnight — the median of the segments overlapping the envelope's
    evening side ``[env_start, 24:00)`` **or** its morning side ``[00:00, env_end)``.
    Uses the envelope (not each night's trimmed window) since it is the stable outer
    bound of the regime the programmed ISF must cover.
    """
    env_s = cfg.rest_window.env_start_min
    env_e = cfg.rest_window.env_end_min
    segs = sorted(isf_segments)
    if not segs:
        return None

    def in_envelope(start: int, end: int) -> bool:
        # Overlaps the evening side [env_s, 1440) or the morning side [0, env_e).
        return (start < 24 * 60 and end > env_s) or (start < env_e and end > 0)

    covering: List[float] = []
    for i, (start, isf) in enumerate(segs):
        end = segs[i + 1][0] if i + 1 < len(segs) else 24 * 60
        if isf is not None and in_envelope(start, end):
            covering.append(float(isf))
    if not covering:
        return None
    covering.sort()
    return covering[len(covering) // 2]


def _fit(pairs: List[Tuple[float, float]]) -> Tuple[Optional[float], Optional[float]]:
    """Intercept (β0) and R² of the ΔBG-on-insulin_acted fit, for the evidence."""
    n = len(pairs)
    if n < 2:
        return None, None
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    sxx = sum((p[0] - mx) ** 2 for p in pairs)
    ss_tot = sum((p[1] - my) ** 2 for p in pairs)
    if sxx == 0 or ss_tot == 0:
        return None, None
    slope = sum((p[0] - mx) * (p[1] - my) for p in pairs) / sxx
    intercept = my - slope * mx
    ss_res = sum((p[1] - (intercept + slope * p[0])) ** 2 for p in pairs)
    return round(intercept, 3), round(1 - ss_res / ss_tot, 3)


def _night_isf(pairs: List[Tuple[float, float]]) -> Optional[float]:
    """ISF (= -slope) of one night's ΔBG-on-insulin_acted fit, or ``None`` if the
    night carries no usable spread (< 2 steps or no insulin variation).

    **Extreme fits are expected and are kept — do not add a conditioning gate here**
    (adr-493). A short rest window sitting on a flat part of the insulin decay has
    almost no leverage, so CGM noise over a tiny denominator can read ±hundreds; on
    the reference snapshot one night fit -500 against a programmed 45. Those nights
    are not corrupt, and the reduction over nights is a median plus a k-of-n vote,
    which weight them once each. Two candidate gates changed **zero** decisions over
    a 45-day replay, and gating would *tighten* the pooled band — which unblocks
    stronger-correction advice. Read adr-493 before revisiting."""
    n = len(pairs)
    if n < 2:
        return None
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    sxx = sum((p[0] - mx) ** 2 for p in pairs)
    if sxx == 0:
        return None
    slope = sum((p[0] - mx) * (p[1] - my) for p in pairs) / sxx
    return -slope


def _night_fits(steps: List[FastingStep]) -> List[Tuple[date, float]]:
    """Per-night ISF fits (one fit per fasting night), date-sorted.

    The pooled regression's ~2,000 5-min steps are not 2,000 observations — the CI
    already clusters by night (#177). #413 makes the *recommendation* night-honest
    too: fit each night on its own and reduce over nights (the Bernoulli/estimator
    unit), never over 5-min steps. Nights with no usable spread are dropped (they
    cast no vote and enter no median). Individual nights can fit *negative* (BG rose
    while insulin acted) — kept, so the median is an honest robust center."""
    by_night: Dict[date, List[Tuple[float, float]]] = {}
    for s in steps:
        by_night.setdefault(s.cluster, []).append((s.insulin_acted, s.dbg))
    fits: List[Tuple[date, float]] = []
    for night in sorted(by_night):
        isf = _night_isf(by_night[night])
        if isf is not None:
            fits.append((night, isf))
    return fits


def _median(values: List[float]) -> Optional[float]:
    if not values:
        return None
    s = sorted(values)
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2.0


def _is_correction_bolus(b: BolusEvent, target: float) -> bool:
    """Whether a delivered bolus carried a correction the profile ISF sized.

    A known correction split (``correction_insulin > 0``) counts outright; failing a
    split, a no-carb dose delivered above target is a correction by context. Meal
    boluses (carbs on board) are excluded — their dose is the I:C lever's currency."""
    if b.insulin is None or b.insulin <= 0:
        return False
    if b.correction_insulin is not None and b.correction_insulin > 0:
        return True
    return ((b.carbs is None or b.carbs <= 0)
            and b.bg is not None and b.bg > target)


def _correction_stats(bolus_events: Sequence[BolusEvent], covered_days: int,
                      cfg: IsfConfig) -> Tuple[float, float]:
    """``(corrections_per_day, median mg/dL over target)`` from the window itself.

    The impact currency's frequency and representative correction size are read from
    the real corrections in-window (#413 §4) rather than the old provisional
    constants (3.0/day, 50 mg/dL) — on the reference snapshot they read 4.2/day and
    76 mg/dL."""
    corrections = [b for b in bolus_events
                   if _is_correction_bolus(b, cfg.correction_target_mgdl)]
    per_day = (len(corrections) / covered_days) if covered_days > 0 else 0.0
    overs = [b.bg - cfg.correction_target_mgdl for b in corrections
             if b.bg is not None and b.bg > cfg.correction_target_mgdl]
    return per_day, (_median(overs) or 0.0)


def _side_votes(fits: List[Tuple[date, float]], programmed: float,
                direction: int) -> Tuple[int, int]:
    """``(k, n)`` per-night votes on ``direction`` (+1 weaker / -1 stronger).

    A night votes for *weaker* when its own ISF fit reads above programmed (less
    sensitive than programmed), for *stronger* when below. The k-of-n Wilson over
    these votes is the measurement channel's recurrence — the same shape basal's
    recurrence uses, with nights as the Bernoulli unit rather than 5-min steps."""
    n = len(fits)
    k = sum(1 for _, isf in fits if (isf - programmed) * direction > 0)
    return k, n


def _half_gap(programmed: float, target: float, cfg: IsfConfig) -> float:
    """Move half the gap from ``programmed`` toward ``target``, capped ±``max_step_frac``.

    Half-gap converges toward a robust target instead of ratcheting a blind full
    step (#413 §3): next window it re-aims rather than over-shooting. The ±20% cap is
    the same guard the old direct move carried; on the reference snapshot it binds
    (45 → night-median 58 wants 51.5, capped to 54)."""
    rec = programmed + 0.5 * (target - programmed)
    lo = programmed * (1.0 - cfg.max_step_frac)
    hi = programmed * (1.0 + cfg.max_step_frac)
    return round(min(max(rec, lo), hi), 1)


@dataclass(frozen=True)
class IsfChannels:
    """The night-honest + harm evidence the ISF direction is decided from (#413)."""

    night_fits: List[Tuple[date, float]]
    night_median: Optional[float]
    corr_low_days: int          # distinct ISF-attributed printed-low days in-window
    rescue_days: int            # distinct correction-attributed rescue-log days
    covered_days: int           # the day-rate denominator (window length)
    # Whether the rescue log was already recording across this whole window (#467).
    # ``False`` means part of the window predates the log, so ``rescue_days == 0`` is
    # *unknown*, not silence — it cannot support a strengthen. Defaults ``True`` so a
    # caller that supplies no observation coverage reads exactly as it did pre-#467.
    rescue_observed: bool = True
    # The observed-day count behind that predicate, carried for the payload (a count
    # over the window, never a rate over rescues — ADR 0012 / adr-166). ``None`` when
    # the caller supplied no coverage.
    rescue_observed_days: Optional[int] = None


def _day_rate_recurs(days: int, covered: int, cfg: IsfConfig) -> bool:
    """Whether ``days``-of-``covered`` clears the priced day-rate bar (#413 §5)."""
    if covered <= 0 or days <= 0:
        return False
    return wilson(days, covered)[1] > cfg.low_day_rate_floor


def _strengthen_signal(programmed: Optional[float], est: Estimate,
                       ch: IsfChannels, cfg: IsfConfig) -> bool:
    """Whether this one decision window independently supports stronger ISF.

    ``ch.rescue_observed`` is part of the silence test, not a side note (#467): over a
    window the rescue log was not yet recording, ``rescue_days == 0`` is unknown rather
    than quiet, and unknown may never license a stronger correction. Gating it here
    also stops an unobserved window from handing a strengthen signal *forward* as the
    next window's prior decision point.
    """
    if (programmed is None or est.wide or ch.night_median is None
            or ch.corr_low_days > 0 or ch.rescue_days > 0
            or not ch.rescue_observed
            or ch.night_median >= programmed):
        return False
    k, n = _side_votes(ch.night_fits, programmed, direction=-1)
    return n > 0 and wilson(k, n)[1] > cfg.night_vote_rate_floor


def _recommend(programmed: Optional[float], est: Estimate, ch: IsfChannels,
               cfg: IsfConfig, *, prior_strengthen_signal: bool = False
               ) -> Tuple[Optional[float], str, Optional[str], Optional[float]]:
    """Advisory ISF move — **lows own the direction** (#413).

    Returns ``(recommended, annotation, direction, priced_target)`` where ``direction``
    is ``"weaken"`` / ``"strengthen"`` / ``None`` and ``priced_target`` is an
    **internal, never-surfaced** value used only to price the tuning lever's impact
    currency (#468) — see the weaken branch.

    * **Weaken** whenever correction-caused printed lows (or correction-attributed
      rescue logs) recur past the priced day-rate bar. This is **direction-only**
      (#468): the harm evidence supports easing corrections, but it does not identify
      a trustworthy new ISF, so ``recommended`` stays ``None`` and nothing can be
      staged or programmed. The half-gap toward the per-night median survives as
      ``priced_target`` purely so the lever's ranking keeps its existing currency.
    * **Strengthen** only in *observed* silence: zero correction-caused lows *and* zero
      rescue logs in-window, over a window the rescue log was recording across (#467),
      and the measurement held on two consecutive decision points. Transplanting #410's
      "band excludes programmed ⇒ direction" verbatim was killed in the grill — on this
      very snapshot it hands a user with recurring correction lows a *stronger*-correction
      card.
    * Otherwise **no direction**: the fasting data confirms the programmed value, or a
      single-window exclusion (noise) produces no card.
    """
    measured = est.value
    median = ch.night_median
    if programmed is None:
        val = median if median is not None else measured
        if val is None:
            return (None, "not enough fasting data yet", None, None)
        return (round(val, 1), "measured; no set value to compare", None, None)

    # Lows own the direction: the weaken bar is checked first, so recurring
    # correction-caused lows weaken even when the fasting measurement is thin — the
    # target must come from a supporting night median; a manufactured fallback would
    # turn harm evidence into an invented dose recommendation.
    weaken = (_day_rate_recurs(ch.corr_low_days, ch.covered_days, cfg)
              or _day_rate_recurs(ch.rescue_days, ch.covered_days, cfg))
    if not weaken and measured is None and median is None:
        return (None, "not enough fasting data yet", None, None)
    if weaken:
        if median is None or median <= programmed:
            ann = ("corrections keep overshooting into lows, so more overnight data "
                   "is needed before a new number")
            priced = None
        else:
            ann = ("corrections keep overshooting into lows, so the correction "
                   "factor eases weaker")
            # #468: the half-gap toward the night median binds at the ±20% cap on the
            # reference data (36 → 43.2 is the cap, not a measurement), and the pooled
            # fit disagrees with it — so it is not a number we may recommend. It stays
            # here as the lever's pricing basis only: never `recommended`, never
            # stageable, never programmable.
            priced = _half_gap(programmed, median, cfg)
        # When the pooled overnight fit disagrees with the lows' direction (its band
        # sits entirely on the *stronger* side of programmed), say so plainly: the
        # fit is leverage-fragile and the lows carry the decision (#413 §7).
        if (est.value is not None and est.hi is not None
                and est.hi < programmed):
            ann += (" (the overnight reading points the other way, but it is "
                    "unsteady and the lows carry the decision)")
        return None, ann, "weaken", priced

    # No weaken pattern. Any single correction-caused low (or rescue log) still gates
    # a move toward stronger corrections (adr-283/adr-313 invariant) — so strengthen
    # requires genuine silence.
    if ch.corr_low_days > 0 or ch.rescue_days > 0:
        if (est.lo is not None and est.hi is not None
                and est.lo <= programmed <= est.hi):
            return None, "fasting data agrees with the set factor", None, None
        return None, "a correction low is on record", None, None

    # No lows and no rescues on record — but part of this window predates the rescue
    # log, so that quiet is *unknown*, not silence (#467). Same shape as the gate above:
    # a confirming band still reads as confirming, and nothing goes stronger.
    if not ch.rescue_observed:
        if (est.lo is not None and est.hi is not None
                and est.lo <= programmed <= est.hi):
            return None, "fasting data agrees with the set factor", None, None
        return None, "rescue-carb history doesn't cover this window", None, None

    # Silence. The measurement may now assert — but only strengthen, and only when it
    # is not soft and the signal held on two consecutive decision points.
    if est.wide or median is None:
        if (est.lo is not None and est.hi is not None
                and est.lo <= programmed <= est.hi):
            return None, "fasting data agrees with the set factor", None, None
        return None, "not enough fasting nights yet", None, None
    if _strengthen_signal(programmed, est, ch, cfg) and prior_strengthen_signal:
        rec = _half_gap(programmed, median, cfg)
        ann = ("overnight you look more sensitive to insulin than the set value, "
               "so corrections can run a little stronger")
        return rec, ann, "strengthen", None
    if (not ch.night_fits and est.lo is not None and est.hi is not None
            and est.lo <= programmed <= est.hi):
        return None, "fasting data agrees with the set factor", None, None
    # A single-window band exclusion that did not hold across two decision points is
    # noise — no card.
    return None, "reading differs but hasn't held twice", None, None


_EV_FMT = "%Y-%m-%d %H:%M:%S"


def _evidence(steps: List[FastingStep], est: Estimate, programmed: Optional[float],
              cfg: IsfConfig, rest_windows: List[RestWindow]) -> Dict:
    intercept, r2 = _fit([(s.insulin_acted, s.dbg) for s in steps])
    # Even-sample the cloud so the scatter + drill-down stay readable; the
    # estimate itself already ran over every step.
    if len(steps) > cfg.max_evidence_points:
        stride = len(steps) / cfg.max_evidence_points
        sampled = [steps[int(i * stride)] for i in range(cfg.max_evidence_points)]
    else:
        sampled = steps
    return {
        "n_steps": est.n,
        "r_squared": r2,
        "slope": round(-est.value, 4) if est.value is not None else None,
        "intercept": intercept,
        "programmed": programmed,
        # The Daily-report highlight for ISF is the fasting regime as a band. Under
        # #110 that regime is a **per-night detected rest window**, not one fixed
        # clock — so the payload carries every window (ISO start/end, which cross
        # midnight) and the day chart shades whichever overlaps the rendered day.
        "rest_windows": [
            {"date": w.date.isoformat(),
             "start": w.start.strftime(_EV_FMT),
             "end": w.end.strftime(_EV_FMT)}
            for w in sorted(rest_windows, key=lambda w: w.start)
        ],
        # Human sublabel for the ISF chip/modal — the source is now the detected
        # rest window (personalized per night) within the nocturnal envelope.
        "fast_window": f"detected rest window ({_env_label(cfg.rest_window)} envelope)",
        # Points feed only the ΔBG-vs-insulin-acted scatter — deliberately *no*
        # per-step `t`: a fasting ISF is a regression over hundreds of 5-min
        # micro-slices, so unlike basal clean-days / I:C meals there is no
        # discrete moment worth a "jump to it" drill-down (#20).
        "points": [{"insulin_acted": round(s.insulin_acted, 4),
                    "dbg": round(s.dbg, 2)}
                   for s in sampled],
    }


def analyze_isf(
    bolus_events: List[BolusEvent],
    basal_events: List[BasalEvent],
    cgm_readings: List[CgmReading],
    isf_segments: List[Tuple[int, float]],
    *,
    config: IsfConfig = IsfConfig(),
    carb_entries: Optional[List[CarbEntry]] = None,  # exclusion signal (#125/#127)
    rest_windows: Optional[List[RestWindow]] = None,
    harm_config: Optional[HarmConfig] = None,
    harm_lows: Optional[Sequence[PrintedLow]] = None,
    window_days: Optional[int] = None,
    correction_rescue_days: int = 0,
    prior_strengthen_signal: bool = False,
    rescue_observation: Optional[RescueObservation] = None,
) -> List[SegmentEstimate]:
    """A single fasting ISF measured vs programmed, with a CI and an advisory move.

    Per ADR 0001 this returns **one** estimate, not a per-segment schedule —
    delivered as a one-row ``List[SegmentEstimate]`` (``start_min=0``) to keep the
    result schema stable. ``isf_segments`` is the programmed ISF schedule, used
    only to pick the programmed value the fasting window is compared against.

    The fasting regime is a per-night **detected rest window** (#110). By default
    ``analyze_isf`` derives them *internally* via
    :func:`~ciq_autotune.rest_window.detect_rest_windows` off the ``cgm`` + ``bolus``
    streams it already loads — so both call sites (``analyze`` and the outcomes
    carb-undercount classifier) get the retrofit with no signature change. Callers
    may pass ``rest_windows`` to inject a precomputed set (e.g. to share one detect
    pass or for deterministic tests).

    ``rescue_observation`` (#467) is how much of this window the manual rescue log was
    actually recording, built by the caller from the log's own creation times
    (:func:`~ciq_autotune.rescue_evidence.observe`). A window reaching back before the
    log existed reads ``rescue_days == 0`` for want of an instrument, not for want of
    rescues — so it may not be read as the silence a strengthen requires. ``None`` (the
    default) means the caller supplied no coverage and the window is taken as observed,
    keeping the pure-analyzer callers unchanged.
    """
    cfg = config
    if rest_windows is None:
        rest_windows = detect_rest_windows(cgm_readings, bolus_events,
                                           config=cfg.rest_window)
    steps = fasting_steps(bolus_events, basal_events, cgm_readings, cfg,
                          rest_windows, carb_entries=carb_entries)
    # ISF = -slope of ΔBG on insulin_acted; negate the slope estimate (flipping
    # and swapping its CI bounds) so the reported number is in ISF units. The CI
    # resamples whole nights (each step's containing rest window), not individual
    # 5-min steps, so correlated same-night steps don't read as independent
    # evidence and shrink the band by half (#177).
    slope = estimate_slope_clustered([(s.insulin_acted, s.dbg) for s in steps],
                                     [s.cluster for s in steps],
                                     DEFAULT_CONFIDENCE)
    est = Estimate(
        value=None if slope.value is None else round(-slope.value, 4),
        lo=None if slope.hi is None else round(-slope.hi, 4),
        hi=None if slope.lo is None else round(-slope.lo, 4),
        n=slope.n,
        n_clusters=slope.n_clusters,
        confidence=slope.confidence,
        method="bootstrap-ols-isf-clustered" if slope.value is not None else "none",
    )
    programmed = _programmed_fasting_isf(isf_segments, cfg)

    # --- night-honest measurement channel (#413 §2) -----------------------------
    fits = _night_fits(steps)
    night_median = _median([isf for _, isf in fits])
    # The day-rate denominator: the covered window. Prefer the caller's window length
    # (analyze() passes 30); otherwise fall back to the distinct days CGM covers.
    covered_days = window_days if window_days is not None else len(
        {r.t.date() for r in cgm_readings if r.bg is not None}) or 1

    # --- harm channel: correction-caused printed lows (attribution by IOB) -------
    harm_arm: Optional[ArmHarm] = None
    corr_low_days = 0
    if harm_config is not None:
        lows = (harm_lows if harm_lows is not None
                else find_printed_lows(cgm_readings, bolus_events, harm_config))
        harm_arm = arm_harm(
            lows, HarmArm.ISF, lambda _low: 0,
            min_recurrence_nights=harm_config.min_recurrence_nights,
        )
        corr_low_days = harm_arm.key_days.get(0, 0)

    channels = IsfChannels(
        night_fits=fits,
        night_median=night_median,
        corr_low_days=corr_low_days,
        rescue_days=correction_rescue_days,
        covered_days=covered_days,
        rescue_observed=(rescue_observation is None
                         or rescue_observation.fully_observed),
        rescue_observed_days=(rescue_observation.observed_days
                              if rescue_observation is not None else None),
    )
    strengthen_signal = _strengthen_signal(programmed, est, channels, cfg)
    rec, ann, direction, priced_target = _recommend(
        programmed, est, channels, cfg,
        prior_strengthen_signal=prior_strengthen_signal,
    )
    evidence = _evidence(steps, est, programmed, cfg, rest_windows)

    # The harm layer's ISF arm is now gate-only (#413 §6): the full-step nudge is
    # retired — the ranked card owns direction and step — but a single correction-
    # caused low still gates any move toward *stronger* corrections (adr-283/adr-313).
    if harm_arm is not None and 0 in harm_arm.gated_keys:
        adj = apply_harm_gate_nudge(
            programmed, rec, max_step_frac=cfg.max_step_frac,
            less_insulin_sign=1, nudge=False, ndigits=1,
        )
        if adj.action is HarmAction.GATED:
            rec, direction, priced_target = adj.recommended, None, None
            ann = "a correction low is on record"
        evidence["harm"] = arm_harm_evidence(harm_arm, 0)

    # Night-honest recurrence + the impact currency's window-grounded inputs, stashed
    # for the priority builder (which owns the Wilson roll-up, #413 §4).
    side_dir = 1 if direction == "weaken" else -1 if direction == "strengthen" else 0
    side_k, side_n = (_side_votes(fits, programmed, side_dir)
                      if (side_dir and programmed is not None) else (0, len(fits)))
    per_day, median_over = _correction_stats(bolus_events, covered_days, cfg)
    evidence.update({
        "direction": direction,
        "strengthen_signal": strengthen_signal,
        "night_median": round(night_median, 1) if night_median is not None else None,
        "night_fits": [{"date": d.isoformat(), "isf": round(isf, 1)}
                       for d, isf in fits],
        "recurrence_channels": {
            "corr_low_days": corr_low_days,
            "rescue_days": correction_rescue_days,
            "covered_days": covered_days,
            # How many of those covered days the rescue log was recording (#467) — the
            # honest coverage behind `rescue_days`, a count, never a rate.
            "rescue_observed_days": channels.rescue_observed_days,
            "rescue_observed": channels.rescue_observed,
            "side_k": side_k,
            "side_n": side_n,
            "measurement_asserts": direction is not None
                and corr_low_days == 0 and correction_rescue_days == 0
                and channels.rescue_observed,
        },
        "impact_inputs": {
            "corrections_per_day": round(per_day, 3),
            "median_mgdl_over_target": round(median_over, 1),
            "covered_days": covered_days,
            # Pricing-only (#468). A harm-owned weaken is direction-only — it has no
            # `recommended` — but its ranking must not collapse to zero, so the lever
            # prices the capped move it *would* have made from here. Never rendered,
            # never stageable, never a schedule value.
            "priced_target": priced_target,
        },
    })
    if rescue_observation is not None:
        # The four rescue-evidence states plus the observed-day coverage this card's
        # rescue channel actually ran over (#467).
        evidence["rescue_evidence"] = rescue_observation.to_dict()

    return [SegmentEstimate(
        start_min=0,
        label="Fasting",
        parameter="isf",
        current=programmed,
        estimate=est,
        recommended=rec,
        annotation=ann,
        evidence=evidence,
    )]
