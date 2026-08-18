"""Backtest: does the suggested profile actually hold up on unseen days?

Build the suggestion from everything before a cutoff, then score it against the
basal Control-IQ actually delivered during clean windows on the held-out days —
head-to-head with the current programmed profile. If the suggestion predicts
held-out reality with lower error than the current profile, that's real evidence
rather than a nice-looking chart.

Caveat: we can't re-run history through Control-IQ with a new profile, so this
scores against what CIQ *did* deliver, not a true counterfactual. It's
corroboration, not proof.

What gets scored (#84): the **shipped** estimator — the per-day median collapse
of :func:`~ciq_autotune.analyzers.basal.analyze_basal`, reused here verbatim via
:func:`_slot_medians_and_days`, with the same per-slot epoch cut production
applies. The head-to-head baseline is the dense programmed feed
(:func:`~ciq_autotune.analyzers.basal.programmed_basal_by_slot`), the same
``current`` a user sees in ``analyze``. It no longer trains via the legacy
``suggest_basal_profile`` path, which validated an estimator we don't ship.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple

from .analyzers.basal import programmed_basal_by_slot
from .epochs import basal_slot_epochs
from .events import BasalEvent, BolusEvent, CgmReading, PumpEvent
from .insulin import BolusIob
from .model import ModelConfig, clean_samples


@dataclass
class BacktestResult:
    holdout_days: int
    train_days: int
    test_clean_minutes: int
    # Standalone mean-absolute-error vs held-out delivered basal (U/h):
    mae_suggested: Optional[float]
    n_suggested: int
    mae_current: Optional[float]
    n_current: int
    # Fair head-to-head, restricted to minutes where BOTH a suggestion and a
    # known current rate exist:
    mae_suggested_matched: Optional[float]
    mae_current_matched: Optional[float]
    n_matched: int

    @property
    def improvement(self) -> Optional[float]:
        """Current MAE minus suggested MAE on matched minutes (>0 = better)."""
        if self.mae_current_matched is None or self.mae_suggested_matched is None:
            return None
        return self.mae_current_matched - self.mae_suggested_matched


def _distinct_dates(*streams: List) -> List[date]:
    dates = set()
    for stream in streams:
        for r in stream:
            dates.add(r.t.date())
    return sorted(dates)


def _on_dates(stream: List, dates: Set[date]) -> List:
    return [r for r in stream if r.t.date() in dates]


def _with_prior_day(dates: Set[date]) -> Set[date]:
    """``dates`` plus the calendar day before each — so a late bolus carries its
    decaying IOB into the next day's early clean-window check."""
    return set(dates) | {d - timedelta(days=1) for d in dates}


def _mean(xs: List[float]) -> Optional[float]:
    return round(sum(xs) / len(xs), 4) if xs else None


def backtest(
    basal_events: List[BasalEvent],
    cgm_readings: List[CgmReading],
    bolus_events: List[BolusEvent],
    pump_events: List[PumpEvent],
    *,
    holdout_days: int = 2,
    config: ModelConfig = ModelConfig(),
) -> BacktestResult:
    dates = _distinct_dates(basal_events, cgm_readings)
    test_dates = set(dates[-holdout_days:]) if holdout_days > 0 else set()
    train_dates = set(dates) - test_dates

    empty = BacktestResult(holdout_days, len(train_dates), 0,
                           None, 0, None, 0, None, None, 0)
    if not train_dates or not test_dates:
        return empty

    # Train on the earlier days only, using the SHIPPED estimator's per-slot
    # rate — the per-day median collapse `_slot_medians_and_days` shares verbatim
    # with `analyzers.basal.analyze_basal` (keep those two in lockstep; scoring an
    # estimator we no longer ship is the bug #84 fixed). We take the raw per-slot
    # estimate, not a gated suggestion: `analyze_basal` never blanks a slot, it
    # annotates confidence, so every slot with clean days is fair to score.
    train_basal = _on_dates(basal_events, train_dates)
    train_cgm = _on_dates(cgm_readings, train_dates)
    train_bolus = _on_dates(bolus_events, train_dates)
    train_pump = _on_dates(pump_events, train_dates)

    # Per-slot epoch cuts, exactly as production applies them: a slot's samples are
    # trimmed to that slot's own basal epoch (its programmed rate's current run), so
    # an old programmed rate on an untouched slot never leaks into the train median.
    # Computed from the train basal history alone — no held-out data touched.
    slot_starts = basal_slot_epochs(train_basal, config.slot_minutes)

    train_medians = _slot_medians_and_days(
        train_basal, train_cgm, train_bolus, train_pump, config,
        slot_starts=slot_starts,
    )
    suggested: Dict[int, float] = {slot: med for slot, (med, _days) in train_medians.items()}

    # Current baseline: the dense programmed feed the shipped estimator reads
    # (`analyzers.basal.programmed_basal_by_slot`), so the head-to-head compares the
    # SAME numbers a user sees in `analyze` — not the legacy profileDelivery scan.
    current: Dict[int, float] = programmed_basal_by_slot(train_basal, config.slot_minutes)

    # Score against clean delivered basal on the held-out days. Bolus IOB needs
    # boluses from just before the window too, so the decay tail is seen — pass
    # boluses from the test days *and* the day before.
    test_bolus = _on_dates(bolus_events, _with_prior_day(test_dates))
    test_samples = clean_samples(
        _on_dates(basal_events, test_dates),
        _on_dates(cgm_readings, test_dates),
        test_bolus,
        _on_dates(pump_events, test_dates),
        config,
    )

    err_s, err_c = [], []
    err_s_m, err_c_m = [], []
    for smp in test_samples:
        has_s = smp.slot in suggested
        has_c = smp.slot in current
        if has_s:
            err_s.append(abs(suggested[smp.slot] - smp.rate))
        if has_c:
            err_c.append(abs(current[smp.slot] - smp.rate))
        if has_s and has_c:
            err_s_m.append(abs(suggested[smp.slot] - smp.rate))
            err_c_m.append(abs(current[smp.slot] - smp.rate))

    return BacktestResult(
        holdout_days=holdout_days,
        train_days=len(train_dates),
        test_clean_minutes=len(test_samples),
        mae_suggested=_mean(err_s), n_suggested=len(err_s),
        mae_current=_mean(err_c), n_current=len(err_c),
        mae_suggested_matched=_mean(err_s_m),
        mae_current_matched=_mean(err_c_m),
        n_matched=len(err_s_m),
    )


# --- DIA calibration guard --------------------------------------------------
#
# Duration of insulin action (``ModelConfig.insulin_dia_min``) is a coverage
# lever, not an estimate lever: a shorter DIA declares reconstructed bolus IOB
# "gone" sooner, so the clean-window filter (`model.clean_samples`) rejects fewer
# daytime minutes and previously-empty daytime slots fill in. The risk is that a
# *too*-short DIA admits still-acting bolus minutes (contamination), which would
# pull the well-covered slot estimates off their true maintenance rate.
#
# So a DIA change has two separable effects, and a safe DIA is one that buys the
# first without paying the second:
#
#   * coverage  — how many slots reach a usable day count (n >= ``min_days``);
#   * drift     — how far the estimates of slots that were *robustly* covered at
#                 the baseline DIA move when DIA changes. The reference set is the
#                 subtlety: a slot only barely over the coverage bar at baseline
#                 (say n=6) may hold a fluke median, and a shorter DIA legitimately
#                 *corrects* it toward truth with far more support — that is the
#                 coverage win, not contamination. So drift is measured only over
#                 slots that were solidly covered to begin with (n >=
#                 ``robust_min_days``, default 2x the coverage bar); movement THERE
#                 is contamination, because those estimates were already trustworthy.
#
# :func:`dia_sweep` reports both, as functions of DIA, so a looser default can be
# justified (coverage up, robust-slot drift ~0) or rejected (drift climbs) from the
# data. Both median and max drift are reported: the median is the typical move, the
# max catches a single contaminated slot the median would hide.

# Daytime = the slots most starved by a long DIA (bolus tails linger through the
# day, clear overnight). 06:00–22:00 local, in slot units.
_DAYTIME_START_MIN = 6 * 60
_DAYTIME_END_MIN = 22 * 60

# A slot is "covered" once this many distinct clean days support it — the same
# n>=5 bar the issue's coverage evidence uses.
DEFAULT_MIN_DAYS = 5

# Drift is measured only over slots this solidly covered at baseline, so a
# marginal fluke slot correcting toward truth doesn't read as contamination.
DEFAULT_ROBUST_MIN_DAYS = 10

# Drift below this (U/h) is noise, not contamination. Applied to BOTH the median
# and the max robust-slot drift — a single slot over it flags the DIA unsafe.
DEFAULT_SAFE_DRIFT_U = 0.05


def _slot_medians_and_days(
    basal_events: List[BasalEvent],
    cgm_readings: List[CgmReading],
    bolus_events: List[BolusEvent],
    pump_events: List[PumpEvent],
    config: ModelConfig,
    slot_starts: Optional[Dict[int, "datetime"]] = None,
) -> Dict[int, "tuple"]:
    """slot -> (median_of_per_day_medians, distinct_day_count) for one config.

    Mirrors :func:`~ciq_autotune.analyzers.basal.analyze_basal`: collapse each
    (slot, day) to that day's median first (clean minutes within a night are
    autocorrelated), so the day count is the honest support and the slot median
    is a median of independent daily medians. ``slot_starts`` optionally applies
    the same per-slot epoch cut `analyze_basal` uses (drop minutes predating a
    slot's current programmed run); ``None`` (the DIA-sweep path) applies no cut.
    Keep the collapse logic identical to `analyze_basal` — the two must not
    silently diverge (the reason #84 existed).
    """
    samples = clean_samples(basal_events, cgm_readings, bolus_events, pump_events, config)
    starts = slot_starts or {}
    per_slot_day: Dict[int, Dict[object, List[float]]] = {}
    for smp in samples:
        cut = starts.get(smp.slot)
        if cut is not None and smp.t < cut:
            continue  # this minute predates the slot's current programmed rate
        per_slot_day.setdefault(smp.slot, {}).setdefault(smp.t.date(), []).append(smp.rate)
    out: Dict[int, "tuple"] = {}
    for slot, by_day in per_slot_day.items():
        daily = [statistics.median(rs) for rs in by_day.values()]
        out[slot] = (statistics.median(daily), len(daily))
    return out


def _valid_peak(peak: float, dia: float) -> float:
    """Keep ``0 < peak < dia/2`` — the exponential IOB model's constraint.

    The peak (time to peak activity) must sit below half the DIA or
    :func:`~ciq_autotune.insulin.iob_fraction` divides by zero. A short DIA
    physically implies a shorter peak anyway, so when a swept DIA would violate
    the constraint we clamp the peak just under ``dia/2`` rather than skip the
    point. This only ever *lowers* the peak; DIAs comfortably above ``2*peak``
    keep the configured peak unchanged.
    """
    return min(peak, dia * 0.45)


def anchor_drift(
    bolus_events: List[BolusEvent], peak_min: float, dia_min: float
) -> Tuple[Optional[float], int]:
    """Mean absolute error (insulin units) between reconstructed bolus IOB and the
    pump's own reported IOB anchor, over boluses that carry one. Returns
    ``(mae, n_anchored)``; ``(None, 0)`` when no bolus carries an anchor.

    Reuses :class:`~ciq_autotune.insulin.BolusIob` — the single shared exponential
    the model already evaluates at an instant — so there is no second IOB
    implementation to drift out of sync (#162). The pump anchor
    (:attr:`BolusEvent.pump_iob`, from ``LidBolusRequestedMsg1.IOB``) is the IOB
    *going into* the bolus decision, i.e. before this dose lands, so at each
    anchored bolus we evaluate reconstructed IOB at its instant and back out this
    dose's own fresh contribution — a bolus at ``t`` sits at ``iob_fraction(0)=1``,
    contributing exactly its full amount — leaving only the insulin already on
    board. The reconstruction is *bolus-only* while the pump's anchor is *total*
    (bolus+basal) IOB, so a systematic gap is expected: this MEASURES how a given
    DIA tracks the anchor, it does not reconcile the two (acting on the drift is a
    separate, backtest-gated issue).
    """
    iob = BolusIob(bolus_events, peak_min, dia_min)
    errs = []
    for b in bolus_events:
        if b.pump_iob is None:
            continue
        own = float(b.insulin) if b.insulin and b.insulin > 0 else 0.0
        reconstructed = iob.at(b.t) - own  # prior insulin only (exclude this dose)
        errs.append(abs(reconstructed - b.pump_iob))
    if not errs:
        return None, 0
    return round(sum(errs) / len(errs), 4), len(errs)


def _is_daytime(slot: int, slot_minutes: int) -> bool:
    m = slot * slot_minutes
    return _DAYTIME_START_MIN <= m < _DAYTIME_END_MIN


@dataclass
class DiaPoint:
    """One DIA value's coverage and drift, relative to the baseline DIA."""

    dia_min: float
    # Coverage: slots reaching >= min_days distinct clean days.
    covered_slots: int
    daytime_covered_slots: int
    # Drift of the baseline-ROBUSTLY-covered slots' medians, this DIA vs baseline.
    # None at the baseline DIA itself (it is the reference) or if no such slots.
    drift_slots: int                 # size of the robust reference set scored here
    median_abs_drift: Optional[float]
    max_abs_drift: Optional[float]
    drift_exceed_slots: int          # robust slots whose drift tops the safe floor
    safe_drift_u: float              # the floor this point was judged against
    # Convenience: coverage gained vs baseline (daytime slots).
    daytime_coverage_gain: int
    is_baseline: bool = False
    # Pump-anchor drift at THIS DIA (#162): mean |reconstructed bolus IOB − the
    # pump's reported IOB anchor| over the anchored boluses, and how many carried an
    # anchor. `anchor_mae` is None (and `anchor_slots` 0) when no bolus carries one —
    # the state until the store is re-fetched with the #162 ingest. Unlike `drift`,
    # this is measured at EVERY DIA (there is no baseline to diff against — the pump
    # is the reference), so the user reads which DIA best tracks the pump directly.
    anchor_mae: Optional[float] = None
    anchor_slots: int = 0

    @property
    def safe(self) -> Optional[bool]:
        """True when this DIA adds/holds coverage without moving any robustly
        covered estimate beyond the noise floor. None at the baseline (no drift to
        judge). Both the median AND the max must clear the floor — one contaminated
        robust slot is enough to flag the DIA unsafe."""
        if self.max_abs_drift is None:
            return None
        return self.max_abs_drift <= self.safe_drift_u


@dataclass
class DiaSweep:
    """The DIA guard's output: coverage AND estimate-drift as functions of DIA."""

    baseline_dia_min: float
    min_days: int
    robust_min_days: int
    safe_drift_u: float
    robust_slots: int                # size of the robust-at-baseline reference set
    points: List[DiaPoint] = field(default_factory=list)

    @property
    def recommendation(self) -> Optional[float]:
        """The recommended DIA: maximal daytime coverage recovery among the DIAs
        that are safe (no robust-slot contamination) and don't lose coverage vs
        baseline — and, among those tied on coverage, the LONGEST DIA.

        The longest-on-tie rule is deliberate pharmacology: a rapid analog really
        does act ~4-5h, so where two DIAs recover identical coverage with equal
        safety, the longer one is the more defensible clinical claim and the more
        conservative contamination margin. None if no non-baseline DIA clears the
        bar (then keep the baseline)."""
        base = next((p for p in self.points if p.is_baseline), None)
        base_cov = base.daytime_covered_slots if base else 0
        safe = [p for p in self.points
                if not p.is_baseline and p.safe
                and p.daytime_covered_slots >= base_cov]
        if not safe:
            return None
        best = max(safe, key=lambda p: (p.daytime_covered_slots, p.dia_min))
        return best.dia_min


def dia_sweep(
    basal_events: List[BasalEvent],
    cgm_readings: List[CgmReading],
    bolus_events: List[BolusEvent],
    pump_events: List[PumpEvent],
    *,
    dia_values: Optional[List[float]] = None,
    baseline_dia_min: Optional[float] = None,
    min_days: int = DEFAULT_MIN_DAYS,
    robust_min_days: int = DEFAULT_ROBUST_MIN_DAYS,
    safe_drift_u: float = DEFAULT_SAFE_DRIFT_U,
    config: ModelConfig = ModelConfig(),
) -> DiaSweep:
    """Separate the two effects of DIA: coverage gained vs. estimate drift.

    For each DIA in ``dia_values`` (default: a spread around the baseline), rebuild
    the per-slot medians and day counts and report:

    * **coverage** — slots (and daytime slots) reaching ``min_days`` clean days;
    * **drift** — the median/max absolute change of the *baseline-ROBUSTLY-covered*
      (``n >= robust_min_days``) slot medians vs the baseline DIA. Those slots were
      already trustworthy, so movement there is the contamination signal — whereas a
      marginal slot correcting toward truth is the coverage win, not drift.

    The baseline DIA is the reference: ``baseline_dia_min`` (default
    ``config.insulin_dia_min``). Everything else keeps ``config`` fixed and varies
    only ``insulin_dia_min`` (peak is clamped below ``dia/2`` where a short DIA
    forces it), so the sweep isolates DIA.
    """
    baseline = baseline_dia_min if baseline_dia_min is not None else config.insulin_dia_min
    if dia_values is None:
        dia_values = sorted({120.0, 150.0, 180.0, 210.0, 240.0, 300.0, baseline})

    # Baseline pass: the robustly-covered slots and their reference medians (the
    # contamination reference), plus the daytime coverage to measure gain against.
    base_cfg = replace(config, insulin_dia_min=baseline)
    base_slots = _slot_medians_and_days(
        basal_events, cgm_readings, bolus_events, pump_events, base_cfg)
    base_robust = {s: med for s, (med, days) in base_slots.items()
                   if days >= robust_min_days}
    base_daytime = sum(1 for s, (_, days) in base_slots.items()
                       if days >= min_days and _is_daytime(s, config.slot_minutes))

    points: List[DiaPoint] = []
    for dia in dia_values:
        cfg = replace(config, insulin_dia_min=dia,
                      insulin_peak_min=_valid_peak(config.insulin_peak_min, dia))
        slots = _slot_medians_and_days(
            basal_events, cgm_readings, bolus_events, pump_events, cfg)
        covered = [s for s, (_, days) in slots.items() if days >= min_days]
        daytime_covered = [s for s in covered if _is_daytime(s, cfg.slot_minutes)]

        is_base = dia == baseline
        # Drift only over slots robustly covered *at baseline* with an estimate here.
        drifts = [abs(slots[s][0] - ref)
                  for s, ref in base_robust.items() if s in slots]
        median_drift = round(statistics.median(drifts), 4) if drifts else None
        max_drift = round(max(drifts), 4) if drifts else None
        exceed = sum(1 for d in drifts if d > safe_drift_u)
        # Pump-anchor drift at this DIA's own curve (peak clamped as above), over
        # boluses carrying a Msg1.IOB anchor. Measured at every DIA — the pump is
        # the reference, so there is no baseline to exempt.
        anchor_mae, anchor_slots = anchor_drift(
            bolus_events, cfg.insulin_peak_min, cfg.insulin_dia_min)
        points.append(DiaPoint(
            dia_min=dia,
            covered_slots=len(covered),
            daytime_covered_slots=len(daytime_covered),
            drift_slots=len(drifts),
            median_abs_drift=None if is_base else median_drift,
            max_abs_drift=None if is_base else max_drift,
            drift_exceed_slots=0 if is_base else exceed,
            safe_drift_u=safe_drift_u,
            daytime_coverage_gain=len(daytime_covered) - base_daytime,
            is_baseline=is_base,
            anchor_mae=anchor_mae,
            anchor_slots=anchor_slots,
        ))

    points.sort(key=lambda p: p.dia_min)
    return DiaSweep(baseline_dia_min=baseline, min_days=min_days,
                    robust_min_days=robust_min_days, safe_drift_u=safe_drift_u,
                    robust_slots=len(base_robust), points=points)


def render_dia_sweep(sweep: DiaSweep) -> str:
    """Human-readable table of the DIA guard: coverage AND drift vs DIA."""
    lines = [
        f"DIA sweep (baseline {sweep.baseline_dia_min:.0f} min):",
        f"  coverage bar   n>={sweep.min_days} days   "
        f"drift reference  n>={sweep.robust_min_days} days "
        f"({sweep.robust_slots} slots)   "
        f"safe-drift floor {sweep.safe_drift_u:.02f} U/h",
        "",
        "  coverage = slots reaching the coverage bar; drift = |median move| of the",
        "  robustly-covered slots vs baseline (contamination signal). 'over' = robust",
        "  slots past the floor. A safe DIA adds coverage with drift ~0.",
        "  anchor = mean |reconstructed bolus IOB − pump-reported IOB| (U) over the n",
        "  anchored boluses; the DIA with the LOWEST anchor best tracks the pump.",
        "",
        f"  {'DIA':>5}  {'slots':>5}  {'daytime':>7}  {'d.gain':>6}  "
        f"{'drift(med)':>10}  {'drift(max)':>10}  {'over':>4}  "
        f"{'anchor':>8}  {'n':>4}  verdict",
    ]
    for p in sweep.points:
        md = "  baseline " if p.is_baseline else (
            f"{p.median_abs_drift:>10.4f}" if p.median_abs_drift is not None else f"{'—':>10}")
        mx = f"{p.max_abs_drift:>10.4f}" if (not p.is_baseline and p.max_abs_drift is not None) else f"{'—':>10}"
        over = f"{'—':>4}" if p.is_baseline else f"{p.drift_exceed_slots:>4}"
        anchor = f"{p.anchor_mae:>8.4f}" if p.anchor_mae is not None else f"{'—':>8}"
        an = f"{p.anchor_slots:>4}"
        verdict = ("baseline" if p.is_baseline
                   else ("safe" if p.safe else "CONTAMINATED" if p.safe is False else "—"))
        lines.append(
            f"  {p.dia_min:>5.0f}  {p.covered_slots:>5}  {p.daytime_covered_slots:>7}  "
            f"{p.daytime_coverage_gain:>+6}  {md}  {mx}  {over}  "
            f"{anchor}  {an}  {verdict}")
    rec = sweep.recommendation
    lines.append("")
    if rec is not None:
        lines.append(f"Recommended DIA: {rec:.0f} min "
                     "(most daytime coverage recovered with no robust-slot drift past the floor).")
    else:
        lines.append("No shorter DIA clears the guard: keep the baseline.")
    return "\n".join(lines)
