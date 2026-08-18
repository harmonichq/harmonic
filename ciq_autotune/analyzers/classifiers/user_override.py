"""User-override provenance — enrichment + rate signal, NOT a new detector (#161).

The pump's ``useroverride`` flag records that the user changed the *calculated*
bolus size; the **override gap** (:attr:`BolusEvent.override_gap`) says which way and
how much (ADR 0014). A read-only pass over real data showed overrides are
overwhelmingly **correction-up** — the pump computed near-zero correction because
reconstructed IOB already covered the high, and the user added insulin anyway — and
roughly one in three of those override-ups is followed by a low (ADR 0015). So
overriding *up* and then going low is evidence the correction was **excess, not
deficient**.

This module therefore does exactly two things (ADR 0015 — never a standalone aggregate
detector, never advice to correct harder, never ISF-too-weak evidence):

1. :func:`override_enrichment` — a clause the shipped ``correction_on_iob`` /
   ``correction_stacking`` low attributions append to their message when the driving
   correction was a flagged override of a pump rec of ~0. It sharpens the existing
   verdict; it does **not** create a competing low lever.
2. :func:`count_overrides` — an aggregate ``(behavior, harm)`` count over a window,
   mirroring :func:`~...correction_stacking.count_correction_stacks` (#131), backing the
   Outcomes override-rate tile. Behavior = how often you override the pump up; harm =
   how many of those preceded a low.

``declined_correction`` is captured raw but drives nothing here (0 occurrences in real
data; ADR 0015 §4). Extended boluses and meal down-overrides are excluded from the
directional signal (ADR 0014, guardrail 3) — the exclusion lives in
:attr:`BolusEvent.override_gap` (extended) and the ``_is_user_correction`` gate (meals).
Pure functions, no I/O.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Optional, Sequence, Tuple

from ...events import BasalEvent, BolusEvent, CgmReading
from ..scenario_config import ScenarioConfig
from .context_gate import upstream_cause
from .correction_stacking import _first_low_after, _is_user_correction

# The override-gap floor, the pump-zero-rec line, the harm near-low line, and the
# harm look-ahead now live on ``ScenarioConfig`` (the ``user_override_*`` fields).


def is_override_up(
    b: BolusEvent, *, scenario_config: ScenarioConfig = ScenarioConfig()
) -> bool:
    """Was this a user **override up** — a correction dosed above the pump's rec?

    Direction+magnitude come from :attr:`BolusEvent.override_gap` (positive = above the
    recommendation); the ``user_override`` flag is the authoritative *trigger* when
    present (ADR 0014). So:

    * ``user_override == 0`` — the pump says the user did **not** override -> ``False``,
      even if a small gap survives rounding (trust the flag on *whether*).
    * ``user_override == 1`` or **absent** (``None``: historical row / no Msg2) -> an
      override-up iff the gap clears :data:`OVERRIDE_GAP_FLOOR_U`. The flag-absent
      fallback to the gap mirrors ``is_automatic_bolus``'s provenance-else-heuristic
      pattern and is what lets the signal work on data ingested before #161 wired the
      flag (every real row today).

    Restricted to **user corrections** (``_is_user_correction``) so meal down-overrides
    and Control-IQ automatic boluses never enter the directional signal (ADR 0014/0015,
    guardrail 3); extended boluses are already excluded by ``override_gap`` returning
    ``None``.
    """
    gap = b.override_gap
    if gap is None:
        return False
    if b.user_override == 0:
        return False
    if not _is_user_correction(b, scenario_config=scenario_config):
        return False
    return gap > scenario_config.user_override_gap_floor_u


def override_enrichment(
    b: BolusEvent, *, scenario_config: ScenarioConfig = ScenarioConfig()
) -> Optional[str]:
    """A provenance clause for a low attribution whose driving correction was an override-up.

    Returns a sentence to **append** to a ``correction_on_iob`` / ``correction_stacking``
    matched ``detail`` when ``b`` (the driving correction) was an override-up, sharpening
    "you corrected on IOB" into "you overrode the pump's *no correction needed* call and
    it dropped you" (ADR 0015). ``None`` when ``b`` was not an override-up — the base
    message stands unchanged. Never asserts ISF/basal weakness or advises correcting
    harder (guardrail 1); the data points the other way.
    """
    if not is_override_up(b, scenario_config=scenario_config):
        return None
    gap = b.override_gap
    corr = b.correction_insulin
    if corr is not None and corr < scenario_config.user_override_pump_zero_rec_u:
        return (
            " You overrode the pump’s ‘no correction needed’ call, "
            f"adding +{gap:.1f} U it didn’t ask for."
        )
    return (
        f" You overrode the pump here — it calculated {corr:.1f} U, "
        f"you gave +{gap:.1f} U more."
    )


def count_overrides(
    window_boluses: Sequence[BolusEvent],
    context_cgm: Sequence[CgmReading],
    context_basal: Sequence[BasalEvent] = (),
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Tuple[int, int]:
    """Count ``(behavior, harm)`` correction override-ups in one window (#161).

    Mirrors :func:`~...correction_stacking.count_correction_stacks`'s behavior/harm split
    (#131), backing the Outcomes override-rate tile:

    * **behavior** — how often the user overrode the pump *up* on a correction
      (:func:`is_override_up`), counted regardless of outcome. The recurring habit.
    * **harm** — a *behavior* override the shared context gate did **not** explain as a
      recovery from an upstream low/suspend, **and** a real low (``<= harm_low_mgdl``,
      the near-low line) then followed within ``harm_lookahead_min``. ``harm <= behavior``
      by construction. This is the cost the ADR measured at ~1 in 3.

    Override-ups are enumerated from ``window_boluses`` (so the count can never exceed the
    window's bolus denominator the tile divides by), but the low / recovery-gate context
    is read from the padded ``context_*`` slices so an override near a window edge still
    sees the CGM around it. Pure; no store, no I/O.
    """
    harm_low_mgdl = scenario_config.user_override_harm_low_mgdl
    harm_lookahead_min = scenario_config.user_override_harm_lookahead_min
    behavior = 0
    harm = 0
    for b in window_boluses:
        if not is_override_up(b, scenario_config=scenario_config):
            continue
        behavior += 1
        # Harm mirrors the stacking harm gate: not a recovery from an upstream
        # low/suspend, and a real (near-)low actually followed within the tail.
        if upstream_cause(
            b.t, context_cgm, context_basal, scenario_config=scenario_config
        ).explained:
            continue
        nadir_bg, _ = _first_low_after(
            context_cgm,
            b.t,
            b.t + timedelta(minutes=harm_lookahead_min),
            harm_low_mgdl,
        )
        if nadir_bg is not None:
            harm += 1
    return behavior, harm
