"""Guardrails between a raw estimate and a number you'd actually consider.

The model says what the data implies; this says how much of that you should move
toward in one pass. Wrong basal causes lows, so every suggestion is clamped:

* never move a block more than ``max_step_frac`` of its current rate at once,
* never leave the absolute ``[abs_min, abs_max]`` sane range,
* treat sub-``noise_floor`` changes as "no change".

Where the current programmed rate is unknown (Control-IQ rarely lets the profile
show through, so most slots have no baseline), the relative cap and noise floor
can't apply — only the absolute range — and the slot is flagged accordingly.

Pure and advisory. Nothing here is a number to apply without an endocrinologist.
"""

from __future__ import annotations

import enum
import math
from dataclasses import dataclass
from typing import Dict, Optional, Sequence

from .uncertainty import Estimate

# A directional recommendation needs at least this many independent days behind
# it before we'll assert a sign (issue #56 guard, owned here). n=1/n=2 slots are
# already `wide`, but the refusal is stated explicitly so it survives any change
# to the `wide` threshold.
_MIN_DIRECTIONAL_DAYS = 3

# A basal direction needs this many informative non-tie nights after nights with
# no as-of programmed rate and exact profile matches are removed. Clearing the
# floor only makes the slot eligible for the family-corrected sign test; it does
# not by itself assert a move. The frontend's `medN < 8` thin marker instead
# describes all clean nights in the visible estimate, so it is not this support
# count. `SlotEstimate.asserts_move` remains the single downstream staging,
# delivery, and priority predicate (#273/#480).
_MIN_SUPPORTED_NIGHTS = 8

# An I:C **block** needs eight units of effective support — whole closed meal runs
# owned by the block plus fractional carb-share ownership of chained runs — before
# it may assert a dosing direction (#518/#117). Deliberately the same number as
# `_MIN_SUPPORTED_NIGHTS` above, and for the same reason: #273 showed that a narrow
# CI at n = 3–7 clears `wide`, reads actionable, and stages — a per-block I:C
# assertion is the same shape of decision as a basal slot's, so it gets the same
# floor.
#
# There IS a real argument that a run is stronger per-unit evidence than a night (a
# closed full-DIA balance sheet versus a slot median), and it is written down here
# precisely so it is not acted on from intuition: this floor may be lowered ONLY on
# held-out backtest evidence (adr-518-ic-meal-run-ledger, decision 12). `IcConfig.min_runs`
# (3) remains the whole-day numeric-pool and settling gate; 8 gates ASSERTION only —
# a block below it still displays its number and band.
_MIN_SUPPORTED_BLOCK_RUNS = 8

# Clean-basal direction tests both raise and lower for every clock slot as one
# fixed family. Benjamini-Hochberg controls the false-discovery rate across that
# family without pretending adjacent half-hour slots are independent (#469/#480).
_BASAL_DIRECTION_FDR = 0.05


def _sign_tails(signs: Sequence[int]) -> "tuple[float, float]":
    """Exact one-sided binomial tails for lower and raise, respectively."""
    if len(signs) < _MIN_SUPPORTED_NIGHTS:
        return 1.0, 1.0
    n = len(signs)
    raises = sum(sign > 0 for sign in signs)
    lower = sum(math.comb(n, i) for i in range(raises + 1)) / (2 ** n)
    raise_ = sum(math.comb(n, i) for i in range(raises, n + 1)) / (2 ** n)
    return lower, raise_


def basal_sign_directions(
    signs_by_slot: Sequence[Sequence[int]],
    *,
    false_discovery_rate: float = _BASAL_DIRECTION_FDR,
) -> Dict[int, int]:
    """Clock slot -> supported direction from per-night clean-basal signs.

    Each non-tie night contributes ``-1`` (delivered below its as-of programmed
    basal) or ``+1`` (above). Ties and nights without an as-of programmed rate
    never enter ``signs_by_slot``. Both directions for every supplied clock slot
    form the fixed multiplicity family; slots below eight informative nights
    receive p=1 and remain in that family.
    """
    hypotheses = []
    for slot, signs in enumerate(signs_by_slot):
        lower, raise_ = _sign_tails(signs)
        hypotheses.extend(((lower, slot, -1), (raise_, slot, 1)))

    if not hypotheses:
        return {}

    cutoff = None
    for rank, (p_value, _, _) in enumerate(sorted(hypotheses), 1):
        if p_value <= false_discovery_rate * rank / len(hypotheses):
            cutoff = p_value
    if cutoff is None:
        return {}

    supported: Dict[int, int] = {}
    for p_value, slot, direction in hypotheses:
        if p_value <= cutoff:
            supported[slot] = direction
    return supported


class Status(enum.Enum):
    """What a slot's recommendation means. The value is the display string, so
    ``str(status)`` renders directly; ``.actionable`` is the single source of
    truth for "does this slot suggest a change worth acting on?\""""

    NO_DATA = "no data"            # model gave no suggestion (thin/blank slot)
    NO_BASELINE = "no baseline"    # suggestion exists but no current rate to step from
    NO_CHANGE = "no change"        # within the noise floor of current
    INSUFFICIENT = "insufficient evidence"  # a direction the data can't support
    RAISE = "raise"
    LOWER = "lower"
    CAPPED_RAISE = "capped (raise)"
    CAPPED_LOWER = "capped (lower)"
    # Harm layer (ADR 0038): a printed-low signal overriding the clean-window verdict.
    HARM_LOWER = "lower (recurring lows)"  # forced one-step downward nudge
    HARM_GATED = "held (recurring-low gate)"  # a raise withheld; held at current

    def __str__(self) -> str:
        return self.value

    @property
    def actionable(self) -> bool:
        return self in _ACTIONABLE


# HARM_LOWER is actionable — it moves the deliverable schedule down and feeds the
# priority tally exactly like a clean LOWER. HARM_GATED is NOT: it only withholds a
# raise, holding at current, so the slot carries its current rate forward.
_ACTIONABLE = frozenset(
    {Status.RAISE, Status.LOWER, Status.CAPPED_RAISE, Status.CAPPED_LOWER,
     Status.HARM_LOWER}
)


@dataclass(frozen=True)
class SafetyConfig:
    max_step_frac: float = 0.20   # +/-20% of current per pass
    abs_min: float = 0.1          # U/h
    abs_max: float = 3.0          # U/h
    noise_floor: float = 0.05     # U/h; smaller moves report as "no change"


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _insufficient(current: float, estimate: Optional[Estimate],
                  min_directional_days: int = _MIN_DIRECTIONAL_DAYS) -> bool:
    """Whether a would-be directional recommendation lacks the evidence to assert
    a sign, per issue #54:

    * the estimate is ``wide`` (thin n or broad CI), OR
    * fewer than ``min_directional_days`` days back it (issue #56 guard), OR
    * ``current`` lies **strictly** inside the open CI ``(lo, hi)`` — the band
      spans current, so even ample data can't establish the direction.

    The interval is **open**: a CI that merely touches current at an endpoint
    survives. Basal does not use this interval rule; it supplies the
    family-corrected per-night sign verdict to :func:`cap` instead.
    """
    if estimate is None:
        return False
    if estimate.wide or estimate.n < min_directional_days:
        return True
    lo, hi = estimate.lo, estimate.hi
    if lo is not None and hi is not None and lo < current < hi:
        return True
    return False


def cap(current: Optional[float], suggested: Optional[float],
        cfg: SafetyConfig,
        estimate: Optional[Estimate] = None,
        min_directional_days: int = _MIN_DIRECTIONAL_DAYS,
        supported_direction: Optional[int] = None,
        ) -> "tuple[Optional[float], Status]":
    """Return (recommended_rate, status) for one slot.

    When ``estimate`` is supplied, a directional result (RAISE/LOWER/CAPPED_*) is
    downgraded to :attr:`Status.INSUFFICIENT` if the estimate can't support a sign
    (see :func:`_insufficient`). The recommended rate is still returned so the
    number and its CI stay visible; we just stop asserting a direction.

    ``supported_direction`` replaces the bootstrap-interval direction rule when
    supplied: ``-1``/``+1`` must agree with the proposed move, while ``0`` holds
    it. Basal supplies the family-corrected per-night sign verdict; other callers
    retain the estimate/CI rule by leaving it as ``None``.
    """
    if suggested is None:
        return None, Status.NO_DATA

    final = _clamp(suggested, cfg.abs_min, cfg.abs_max)

    if current is None:
        # No baseline to step from; absolute range is all we can enforce.
        return round(final, 3), Status.NO_BASELINE

    step_lo = current * (1.0 - cfg.max_step_frac)
    step_hi = current * (1.0 + cfg.max_step_frac)
    capped = _clamp(final, step_lo, step_hi)
    was_capped = abs(capped - final) > 1e-9
    final = capped

    delta = final - current
    if abs(delta) < cfg.noise_floor:
        return current, Status.NO_CHANGE

    direction = 1 if delta > 0 else -1
    if supported_direction is not None:
        insufficient = supported_direction == 0 or supported_direction != direction
    else:
        insufficient = _insufficient(current, estimate, min_directional_days)
    if insufficient:
        return round(final, 3), Status.INSUFFICIENT

    if delta > 0:
        return round(final, 3), (Status.CAPPED_RAISE if was_capped else Status.RAISE)
    return round(final, 3), (Status.CAPPED_LOWER if was_capped else Status.LOWER)


def apply_harm(current: Optional[float], recommended: Optional[float],
               status: Status, cfg: SafetyConfig, *, nudge: bool,
               median: Optional[float] = None,
               ) -> "tuple[Optional[float], Status]":
    """Apply the harm layer (ADR 0038, revised by ADR 412) to one basal slot verdict.

    The clean-window median stays the precision base — this is applied **on top of**
    the ``cap()`` result and only ever pushes toward *less* insulin:

    * **Gate** (always, for a slot that printed an overnight low): a would-be
      *raise* (``RAISE`` / ``CAPPED_RAISE``) is withheld and the slot holds at
      ``current`` (:attr:`Status.HARM_GATED`). A ``LOWER`` / ``NO_CHANGE`` /
      ``INSUFFICIENT`` verdict is left untouched — the gate never *adds* insulin and
      never blocks a cut.
    * **Nudge** (``nudge=True``, when overnight lows recur): magnitude now **defers
      to the clean median** rather than fabricating a full 20% step (ADR 412 retires
      the step math; a forecast showed the full step ping-pongs and compounds while
      the median-deferred target converges). ``median`` is the slot's clean-window
      estimate (``est.value``):

      - **median below current** → :attr:`Status.HARM_LOWER` at
        ``max(median, current * (1 - max_step_frac))`` — a downward move floored at
        one step, so a thin (``n < _MIN_SUPPORTED_NIGHTS``) median may still move the
        slot below its staging gate, but only downward (ADR 283's thin-override
        survives, in the safe direction only);
      - **median at/above current** → :attr:`Status.HARM_GATED`, held at ``current``:
        the recurring-low gate still blocks a raise, but we do not invent a −20% cut
        against a thick median that contradicts it;
      - **no clean median at all** (``median is None`` — e.g. a dawn slot with zero
        clean nights) → today's one full step stands (:attr:`Status.HARM_LOWER` at
        ``current * (1 - max_step_frac)``): nothing to defer to, and recurring lows
        still argue "down".

    With no ``current`` baseline there is no relative step to take, so the verdict is
    returned unchanged (the absolute-range-only slot has no raise to gate anyway).
    """
    if current is None:
        return recommended, status

    if nudge:
        step_floor = _clamp(current * (1.0 - cfg.max_step_frac),
                            cfg.abs_min, cfg.abs_max)
        if median is None:
            # No clean median to defer to — the one full step stands.
            return round(step_floor, 3), Status.HARM_LOWER
        if median < current:
            # Median agrees the slot runs hot: clamp to it, floored at one step.
            target = _clamp(max(median, step_floor), cfg.abs_min, cfg.abs_max)
            return round(target, 3), Status.HARM_LOWER
        # Median at/above current: no fabricated cut, hold as the recurring-low gate.
        return current, Status.HARM_GATED

    # Gate only (single-night low, not recurring): withhold a would-be raise.
    if status in (Status.RAISE, Status.CAPPED_RAISE):
        return current, Status.HARM_GATED
    return recommended, status
