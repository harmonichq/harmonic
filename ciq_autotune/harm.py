"""The harm layer: a printed low, attributed to one estimator, applied as a
**gate + capped downward nudge** — never a precision setter (ADR 0038).

The three tuning estimators (basal / ISF / I:C) each measure **maintenance need**
on clean, in-range, non-suspended data, so by construction each is blind to the
lows it *caused*: a fasting low is suspended and below range, so the basal
clean-window filter never sees it. This module is the missing connection between
"the model *sees* the low" (the scenario low-Levers) and "the model *acts* on it"
(the estimators): it detects printed lows, attributes each to one estimator by the
insulin acting at the nadir, and hands the owning arm a downward-only adjustment.

Design invariants (ADR 0038, CONTEXT.md **Harm signal**):

* **Print-first.** Magnitude comes from the CGM **nadir**, never from a rescue-carb
  entry — ~87 % of these overnight lows carry no carb log, so the layer must not
  depend on one (ADR 0008's "exclusion survives under-logging").
* **Attribution by the owning insulin.** Dominant residual **bolus IOB** at the
  nadir: none/fasting → basal, meal → I:C, correction → ISF. Split-less no-carb
  historical doses are correction evidence only when their context is correction-like;
  otherwise they stay unattributed for tuning rather than being forced onto basal.
* **Safety asymmetry.** The layer may only ever push toward **less** insulin — a
  gate (forbid a *raise*) plus a capped downward nudge. So under-logging or an
  absent low *under*-nudges (leaves the aggressive setting in place) and never
  over-corrects; the conservative failure direction.

Dependency-light and stdlib-only (it imports only :mod:`.events` and
:mod:`.insulin`), so it stays usable without the ``sync`` extra and is trivially
unit-testable.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Callable, Dict, Hashable, List, Optional, Sequence, Tuple

from .events import BolusEvent, CgmReading
from .insulin import ACCOUNTING_DIA_MIN, ACCOUNTING_PEAK_MIN, BolusIob


class HarmArm(enum.Enum):
    """Which estimator a printed low is attributed to (ADR 0038 §3)."""

    BASAL = "basal"   # none / fasting IOB at the nadir
    ISF = "isf"       # correction IOB dominant
    IC = "ic"         # meal IOB dominant
    UNATTRIBUTED = "unattributed"  # bolus-owned, but not trustworthy tuning evidence


class HarmAction(enum.Enum):
    """How a harm verdict changed a scalar recommendation."""

    UNCHANGED = "unchanged"
    GATED = "gated"
    NUDGED = "nudged"


@dataclass(frozen=True)
class HarmConfig:
    """Tunable knobs for the harm layer. Every default is documented here because
    ADR 0038 deliberately left them to implementation (§8).

    * ``low_bg`` — the printed-low line. A CGM nadir strictly below this is a
      printed low. 70 mg/dL matches ``ModelConfig.bg_low`` and the scenario
      engine's ``gate_low_mgdl`` (the LOWS exposure line), so the harm layer and
      the low-Levers count the *same* lows.
    * ``fasting_iob_floor_u`` — bolus IOB at/below which the nadir is **fasting**,
      so the low is attributed to **basal** (no meal/correction insulin acting).
      0.1 U mirrors ``ModelConfig.bolus_clear_u`` — the model's existing "essentially
      no bolus on board" line — so "clean-window fasting" and "harm-layer fasting"
      agree. Above it, the low is a meal/correction low (ISF/I:C arms, deferred).
    * ``overnight_start_min`` / ``overnight_end_min`` — the overnight band the basal
      arm aggregates over, in minutes-of-day. Default [00:00, 06:00): the fasting,
      no-meal stretch where a printed low is basal by construction. Must not cross
      midnight (start < end), so a nadir's calendar date is its night key.
    * ``min_recurrence_nights`` — distinct nights the **band** must print a basal low
      before the layer forces a downward **nudge** (criterion 4). 2 is a deliberately
      conservative floor: one night can be illness or a fluke, two is a pattern. The
      *gate* (forbid a raise, criterion 3) needs no recurrence — a single printed low
      already forbids raising insulin into that slot.
    * ``low_run_gap_min`` — readings below ``low_bg`` more than this apart start a new
      low run (so one continuous excursion yields one nadir, not one per reading).
    * ``correction_like_bg`` — the existing in-range high edge used as the conservative
      "this no-carb / split-less bolus looks correction-like" threshold. Below it, a
      split-less no-carb dose can own the low physiologically but stays unattributed
      for tuning (ADR 0038 §3).
    * ``peak_min`` / ``dia_min`` — the insulin curve for the IOB read at the nadir.
      The **Accounting DIA** (300 min, peak 75), because attribution needs a real IOB
      *quantity*, not the clean-window Gate DIA (ADR 0013 / CONTEXT **Accounting DIA**).
    """

    low_bg: float = 70.0
    fasting_iob_floor_u: float = 0.1
    overnight_start_min: int = 0
    overnight_end_min: int = 6 * 60
    min_recurrence_nights: int = 2
    low_run_gap_min: int = 30
    correction_like_bg: float = 180.0
    peak_min: float = ACCOUNTING_PEAK_MIN
    dia_min: float = ACCOUNTING_DIA_MIN


@dataclass(frozen=True)
class PrintedLow:
    """One printed low: the CGM nadir instant + value, the bolus IOB acting there,
    and the arm it is attributed to. Print-first — never carries a carb entry."""

    t: datetime
    bg: float
    iob_u: float
    arm: HarmArm
    dominant_bolus_t: Optional[datetime] = None
    dominant_bolus_iob_u: Optional[float] = None
    dominant_bolus_carbs: Optional[float] = None
    dominant_bolus_bg: Optional[float] = None
    attribution_reason: str = "fasting"


def _low_runs(
    cgm: Sequence[CgmReading], low_bg: float, gap: timedelta
) -> List[List[Tuple[datetime, float]]]:
    """Group sub-``low_bg`` CGM readings into runs, splitting on a > ``gap`` break.

    Each run is a continuous low excursion; the caller takes one nadir per run so a
    single dip doesn't count as many overlapping lows.
    """
    pts = sorted((r.t, r.bg) for r in cgm if r.bg is not None and r.bg < low_bg)
    runs: List[List[Tuple[datetime, float]]] = []
    for t, bg in pts:
        if runs and t - runs[-1][-1][0] <= gap:
            runs[-1].append((t, bg))
        else:
            runs.append([(t, bg)])
    return runs


def _prior_peak(
    cgm: Sequence[CgmReading], start: datetime, end: datetime
) -> Optional[float]:
    peak: Optional[float] = None
    for r in cgm:
        if r.bg is None:
            continue
        if start <= r.t <= end and (peak is None or r.bg > peak):
            peak = r.bg
    return peak


def _is_correction_like(
    bolus: BolusEvent,
    prior_peak: Optional[float],
    config: HarmConfig,
) -> bool:
    """Whether a no-carb / split-less dominant bolus is trustworthy ISF evidence."""
    if bolus.correction_insulin is not None and bolus.correction_insulin > 0:
        return True
    if bolus.bg is not None and bolus.bg >= config.correction_like_bg:
        return True
    return prior_peak is not None and prior_peak >= config.correction_like_bg


def _attribute_dominant_bolus(
    bolus: BolusEvent,
    prior_peak: Optional[float],
    config: HarmConfig,
) -> Tuple[HarmArm, str]:
    """Map the dominant residual bolus to its owning tuning arm (ADR 0038 §3)."""
    if bolus.carbs is not None and bolus.carbs > 0:
        # A known mixed food+correction bolus belongs to ISF only when the observed
        # shape says it ran high before crashing. Pre-Msg3 history has no reliable
        # food/correction split, so carb-bearing split-less boluses use the same
        # high-context shape rule instead of always falling through to I:C.
        ran_high = (
            (bolus.bg is not None and bolus.bg >= config.correction_like_bg)
            or (prior_peak is not None and prior_peak >= config.correction_like_bg)
        )
        splitless_or_known_correction = (
            bolus.correction_insulin is None or bolus.correction_insulin > 0
        )
        if ran_high and splitless_or_known_correction:
            return HarmArm.ISF, "mixed-bolus-ran-high"
        return HarmArm.IC, "meal-bolus"

    if _is_correction_like(bolus, prior_peak, config):
        return HarmArm.ISF, "correction-like-no-carb-bolus"
    return HarmArm.UNATTRIBUTED, "splitless-no-carb-uncertain"


def find_printed_lows(
    cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    config: HarmConfig = HarmConfig(),
) -> List[PrintedLow]:
    """Every printed low in ``cgm``, print-first, attributed to an arm by the bolus
    IOB acting at its nadir.

    A printed low is the nadir of a run of CGM readings below ``config.low_bg``
    (:func:`_low_runs`). Its bolus IOB is read from the reconstructed bolus-only IOB
    at the Accounting DIA (:class:`~ciq_autotune.insulin.BolusIob`). Attribution uses
    the dominant residual bolus contribution at the nadir, with recency only as a
    tie-break among equal residual doses.
    """
    iob = BolusIob(list(bolus), config.peak_min, config.dia_min)
    out: List[PrintedLow] = []
    for run in _low_runs(cgm, config.low_bg, timedelta(minutes=config.low_run_gap_min)):
        t, bg = min(run, key=lambda p: (p[1], p[0]))  # nadir: lowest, earliest tie-break
        contributions = iob.contributions_at(t)
        iob_u = sum(amt for _, amt in contributions)
        if iob_u <= config.fasting_iob_floor_u or not contributions:
            out.append(PrintedLow(
                t=t, bg=bg, iob_u=iob_u, arm=HarmArm.BASAL,
                attribution_reason="fasting",
            ))
            continue

        dominant, dominant_iob = contributions[0]
        prior_peak = _prior_peak(cgm, dominant.t, t)
        arm, reason = _attribute_dominant_bolus(dominant, prior_peak, config)
        out.append(PrintedLow(
            t=t,
            bg=bg,
            iob_u=iob_u,
            arm=arm,
            dominant_bolus_t=dominant.t,
            dominant_bolus_iob_u=dominant_iob,
            dominant_bolus_carbs=dominant.carbs,
            dominant_bolus_bg=dominant.bg,
            attribution_reason=reason,
        ))
    return out


@dataclass(frozen=True)
class BasalHarm:
    """The basal arm's aggregate verdict over the overnight band.

    * ``gated_slots`` — every band slot that printed a basal low. A *raise* is
      forbidden here even off a single night (criterion 3).
    * ``nudged_slots`` — the subset that also cleared the band-level recurrence bar,
      so the slot is forced **down** one step cap (criterion 4). ``nudged_slots`` is
      empty until the *band* (not any one slot) printed lows on
      ``min_recurrence_nights`` distinct nights — the aggregation criterion 5 asks
      for (real overnight lows spread 3 + 2 + 1 across adjacent slots, so a per-slot
      recurrence bar would miss them; the evidence is pooled across the band, the
      action targets the slots that actually saw a low).
    * ``nights`` — distinct nights with a basal low anywhere in the band.
    * ``slot_nights`` — per-slot distinct-night counts (evidence for the explainer).
    * ``lows`` — the basal-attributed band lows themselves (print-first evidence).
    """

    gated_slots: frozenset = field(default_factory=frozenset)
    nudged_slots: frozenset = field(default_factory=frozenset)
    nights: int = 0
    slot_nights: Dict[int, int] = field(default_factory=dict)
    lows: Tuple[PrintedLow, ...] = ()


@dataclass(frozen=True)
class ArmHarm:
    """Generic per-arm gate/nudge verdict for ISF and I:C rows."""

    arm: HarmArm
    gated_keys: frozenset = field(default_factory=frozenset)
    nudged_keys: frozenset = field(default_factory=frozenset)
    days: int = 0
    key_days: Dict[Hashable, int] = field(default_factory=dict)
    key_lows: Dict[Hashable, Tuple[PrintedLow, ...]] = field(default_factory=dict)
    lows: Tuple[PrintedLow, ...] = ()


@dataclass(frozen=True)
class HarmAdjustment:
    recommended: Optional[float]
    action: HarmAction


def apply_harm_gate_nudge(
    current: Optional[float],
    recommended: Optional[float],
    *,
    max_step_frac: float,
    less_insulin_sign: int,
    nudge: bool,
    ndigits: int,
    abs_min: Optional[float] = None,
    abs_max: Optional[float] = None,
) -> HarmAdjustment:
    """Direction-parameterized harm gate + capped nudge (ADR 0038).

    ``less_insulin_sign`` is ``-1`` when a smaller scalar means less insulin
    (basal rate) and ``+1`` when a larger scalar means less insulin (ISF / I:C).
    The gate withholds only a recommendation that moves toward *more* insulin; the
    nudge always moves one capped step toward *less* insulin.
    """
    if less_insulin_sign not in (-1, 1):
        raise ValueError("less_insulin_sign must be -1 or 1")
    if current is None:
        return HarmAdjustment(recommended, HarmAction.UNCHANGED)
    if nudge:
        target = current * (1.0 + less_insulin_sign * max_step_frac)
        if abs_min is not None:
            target = max(abs_min, target)
        if abs_max is not None:
            target = min(abs_max, target)
        return HarmAdjustment(round(target, ndigits), HarmAction.NUDGED)
    if recommended is None:
        return HarmAdjustment(recommended, HarmAction.UNCHANGED)
    delta = recommended - current
    moving_toward_more_insulin = delta * less_insulin_sign < 0
    if moving_toward_more_insulin:
        return HarmAdjustment(current, HarmAction.GATED)
    return HarmAdjustment(recommended, HarmAction.UNCHANGED)


def arm_harm(
    lows: Sequence[PrintedLow],
    arm: HarmArm,
    key_for_low: Callable[[PrintedLow], Optional[Hashable]],
    *,
    min_recurrence_nights: int,
) -> ArmHarm:
    """Aggregate printed lows for one non-basal arm into row keys.

    A key is usually the single ISF row (``0``) or the I:C segment that owns the
    dominant meal bolus. A single low gates that key; recurrent lows on distinct
    calendar days nudge it.
    """
    key_day_set: Dict[Hashable, set] = {}
    key_lows: Dict[Hashable, List[PrintedLow]] = {}
    kept: List[PrintedLow] = []
    arm_days: set = set()
    for low in lows:
        if low.arm is not arm:
            continue
        key = key_for_low(low)
        if key is None:
            continue
        kept.append(low)
        arm_days.add(low.t.date())
        key_day_set.setdefault(key, set()).add(low.t.date())
        key_lows.setdefault(key, []).append(low)

    gated = frozenset(key_day_set)
    nudged = frozenset(
        key for key, days in key_day_set.items()
        if len(days) >= min_recurrence_nights
    )
    return ArmHarm(
        arm=arm,
        gated_keys=gated,
        nudged_keys=nudged,
        days=len(arm_days),
        key_days={key: len(days) for key, days in key_day_set.items()},
        key_lows={
            key: tuple(sorted(lows_for_key, key=lambda l: l.t))
            for key, lows_for_key in key_lows.items()
        },
        lows=tuple(sorted(kept, key=lambda l: l.t)),
    )


def _low_evidence(low: PrintedLow) -> dict:
    return {
        "t": low.t.isoformat(),
        "bg": low.bg,
        "iob_u": round(low.iob_u, 3),
        "dominant_bolus_t": (
            low.dominant_bolus_t.isoformat() if low.dominant_bolus_t else None
        ),
        "dominant_bolus_iob_u": (
            round(low.dominant_bolus_iob_u, 3)
            if low.dominant_bolus_iob_u is not None else None
        ),
        "dominant_bolus_carbs": low.dominant_bolus_carbs,
        "dominant_bolus_bg": low.dominant_bolus_bg,
        "attribution_reason": low.attribution_reason,
    }


def _harm_evidence_payload(
    *,
    arm: str,
    gated: bool,
    nudged: bool,
    arm_days: int,
    row_days: int,
    lows: Sequence[PrintedLow],
    aliases: Optional[Dict[str, int]] = None,
) -> dict:
    """Shared row-level evidence payload for every harm arm (ADR 0038/0043)."""
    out = {
        "arm": arm,
        "gated": gated,
        "nudged": nudged,
        "arm_days": arm_days,
        "row_days": row_days,
        "lows": [_low_evidence(low) for low in lows],
    }
    if aliases:
        out.update(aliases)
    return out


def arm_harm_evidence(harm: ArmHarm, key: Hashable) -> dict:
    """Shared evidence payload for ISF/I:C harm rows."""
    return _harm_evidence_payload(
        arm=harm.arm.value,
        gated=key in harm.gated_keys,
        nudged=key in harm.nudged_keys,
        arm_days=harm.days,
        row_days=harm.key_days.get(key, 0),
        lows=harm.key_lows.get(key, ()),
    )


def basal_harm_evidence(harm: BasalHarm, slot: int, slot_minutes: int) -> dict:
    """Shared evidence payload for a basal slot.

    ``arm_days`` / ``row_days`` are the canonical ADR 0043 row-level keys. The
    older basal names stay as compatibility aliases for existing explainers.
    """
    slot_lows = [
        low for low in harm.lows
        if (low.t.hour * 60 + low.t.minute) // slot_minutes == slot
    ]
    return _harm_evidence_payload(
        arm="basal",
        gated=slot in harm.gated_slots,
        nudged=slot in harm.nudged_slots,
        arm_days=harm.nights,
        row_days=harm.slot_nights.get(slot, 0),
        lows=slot_lows,
        aliases={
            "band_nights": harm.nights,
            "slot_nights": harm.slot_nights.get(slot, 0),
        },
    )


def _night_key(t: datetime, start_min: int, end_min: int) -> Optional[date]:
    """The night a nadir belongs to, or ``None`` if outside the band.

    The band must not cross midnight (``start_min < end_min``), so a nadir's own
    calendar date is its night key.
    """
    minute = t.hour * 60 + t.minute
    if start_min <= minute < end_min:
        return t.date()
    return None


def _slot_recurs(
    band_nights: set, epoch: Optional[datetime], min_recurrence_nights: int
) -> bool:
    """Whether a slot cleared the band-level recurrence bar, counting only nights
    on/after its basal setting epoch (ADR 412). ``epoch`` ``None`` counts every
    band night (no edit on file), matching the pre-#412 band-pooled behavior."""
    if epoch is None:
        eligible = band_nights
    else:
        eligible = {n for n in band_nights if n >= epoch.date()}
    return len(eligible) >= min_recurrence_nights


def basal_harm(
    cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    slot_minutes: int,
    config: HarmConfig = HarmConfig(),
    lows: Optional[Sequence[PrintedLow]] = None,
    slot_epochs: Optional[Dict[int, datetime]] = None,
) -> BasalHarm:
    """Roll the basal-attributed overnight printed lows into a :class:`BasalHarm`.

    ``lows`` may be supplied (already computed via :func:`find_printed_lows`) to
    avoid rebuilding the IOB curve; otherwise it is computed here.

    ``slot_epochs`` optionally maps a slot to the datetime its current basal rate
    took effect (the same per-slot epoch cut the clean-window estimate uses, ADR
    412 / issue #412). A slot's **nudge** recurrence then counts only band nights
    on/after its epoch, so applying a downward change does not let the pre-change
    lows re-punish that slot with a second cut inside one window. The **gate** is
    unchanged — it still reads every in-window low, epoch or not.
    """
    if config.overnight_start_min >= config.overnight_end_min:
        raise ValueError("overnight band must not cross midnight (start < end)")
    if lows is None:
        lows = find_printed_lows(cgm, bolus, config)
    slot_epochs = slot_epochs or {}

    band_lows: List[PrintedLow] = []
    # slot -> set of distinct nights that slot printed a basal low
    slot_night_set: Dict[int, set] = {}
    band_nights: set = set()
    for low in lows:
        if low.arm is not HarmArm.BASAL:
            continue
        night = _night_key(low.t, config.overnight_start_min, config.overnight_end_min)
        if night is None:
            continue
        band_lows.append(low)
        band_nights.add(night)
        slot = (low.t.hour * 60 + low.t.minute) // slot_minutes
        slot_night_set.setdefault(slot, set()).add(night)

    gated = frozenset(slot_night_set)
    # Nudge recurrence is pooled across the band (criterion 5) but reset per slot at
    # that slot's basal setting epoch: a slot recurs only if enough band nights fall
    # on/after its epoch. With no epochs supplied every slot sees the whole band, so
    # this reduces to the original "band recurred → nudge every gated slot".
    nudged = frozenset(
        slot for slot in gated
        if _slot_recurs(band_nights, slot_epochs.get(slot),
                        config.min_recurrence_nights)
    )
    return BasalHarm(
        gated_slots=gated,
        nudged_slots=nudged,
        nights=len(band_nights),
        slot_nights={s: len(ns) for s, ns in slot_night_set.items()},
        lows=tuple(sorted(band_lows, key=lambda l: l.t)),
    )
