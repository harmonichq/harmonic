"""The shared **context gate** — the foundation primitive of the classifier layer.

Every instance classifier that judges a pre-bolus (or pre-behavior) glucose rise
has the same blind spot: a rise can be a *real* meal climb, or it can be the tail
of an **observable upstream event** — a recent CGM low that was rescued (a rescue
carb overshoot, invisible on Tandem Source per ADR 0003, but its low/recovery
*shape* is not), or a Control-IQ **defensive-suspend** episode whose basal cut is
now unwinding into a recovery rise. The old ``not_pre_bolusing`` detector had no
notion of *why* BG was rising, so it counted these recoveries as "you bolused
late." (On real data that over-flagged a rescue-rebound case: a low bottomed out
after a defensive suspend, was treated, and overshot; the meal bolus given at
eating time was accused of being late into the rescue rebound.)

This module factors that "is there an observable upstream cause?" judgment out as
one importable primitive so #71 (late bolus) and #72–#76 reuse it instead of each
re-implementing it. It gates on the **observable** low/suspend, never on trying to
see the carbs.

The judgment is a hard fact — a low reading or a suspend row is in the feed — so a
positive gate is :data:`~ciq_autotune.analyzers.classifiers.evidence.EvidenceTier.OBSERVED`.
Naming the *mechanism* ("rescue carbs drove the rebound") is a shape inference and
belongs to the calling classifier as ``INFERRED``; the gate only reports the
observable trigger it found.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional, Sequence

from ...events import BasalEvent, CgmReading
from ..scenario_config import ScenarioConfig

# The Control-IQ defensive zero-temp ``delivery_type`` string (mirrors
# ``behavioral.CIQ_SUSPEND_TYPE`` and ``tandemsource_map._RATE_SOURCE`` source 0).
# Duplicated here on purpose: the classifier layer must not import the ex-detector
# module ``analyzers.behavioral``, which the scenario-engine epic (#70) deletes.
# (A data-schema string, not a tunable threshold — stays a module constant.)
CIQ_SUSPEND_TYPE = "algorithmDelivery (control-iq suspension)"

# The gate low line (``gate_low_mgdl``), lookback window (``gate_lookback_min``), and
# suspend group-gap (``gate_suspend_group_gap_min``) now live on ``ScenarioConfig``.


class UpstreamCause(str, Enum):
    """Which observable upstream event the gate found (if any)."""

    NONE = "none"
    RECENT_LOW = "recent_low"
    DEFENSIVE_SUSPEND = "defensive_suspend"
    BOTH = "both"


@dataclass(frozen=True)
class GateResult:
    """What the context gate found in the lookback window before an instant.

    * ``explained`` — is there an observable upstream cause that could explain a
      rise at the anchor time? (``cause is not UpstreamCause.NONE``.)
    * ``cause`` — which observable event(s): a recent low, a defensive suspend, or
      both.
    * ``nadir_bg`` — the lowest CGM value seen in the window, if any low was found
      (the nadir value). ``None`` when no low.
    * ``nadir_t`` — when that nadir occurred.
    * ``suspend_end_t`` — the end of the most recent qualifying suspend episode, if
      any (the point recovery would start unwinding from). ``None`` when none.
    * ``detail`` — a ready-to-use plain-English line naming the observable cause,
      or an empty string when nothing was found.

    The gate reports only what is *observed*; a caller that wants to name the
    mechanism ("likely rescue carbs") does so as its own ``INFERRED`` step.
    """

    explained: bool
    cause: UpstreamCause
    nadir_bg: Optional[float] = None
    nadir_t: Optional[datetime] = None
    suspend_end_t: Optional[datetime] = None
    detail: str = ""


def _is_suspend(e: BasalEvent) -> bool:
    """Whether a basal row is a Control-IQ defensive zero-temp.

    Two signatures, either sufficient (mirrors ``behavioral._is_suspend`` / issue
    #62): the explicit CIQ-suspension ``delivery_type``, or a delivered rate of 0
    while the programmed profile rate is positive.
    """
    if e.delivery_type == CIQ_SUSPEND_TYPE:
        return True
    return (
        e.basal_rate == 0
        and e.profile_basal_rate is not None
        and e.profile_basal_rate > 0
    )


def _recent_low(
    readings: Sequence[CgmReading], window_start: datetime, anchor: datetime, low_mgdl: float
):
    """The nadir CGM reading in ``[window_start, anchor]`` at/under ``low_mgdl``.

    Returns ``(nadir_bg, nadir_t)`` or ``(None, None)``. A recovery rise trails the
    nadir, so a low anywhere in the window — not just the instant before — counts.
    """
    nadir_bg: Optional[float] = None
    nadir_t: Optional[datetime] = None
    for r in readings:
        if r.bg is None:
            continue
        if window_start <= r.t <= anchor and r.bg <= low_mgdl:
            if nadir_bg is None or r.bg < nadir_bg:
                nadir_bg = r.bg
                nadir_t = r.t
    return nadir_bg, nadir_t


def _recent_suspend_end(
    basal_events: Sequence[BasalEvent],
    window_start: datetime,
    anchor: datetime,
    group_gap: timedelta,
) -> Optional[datetime]:
    """End time of the most recent defensive-suspend episode ending in the window.

    Suspend rows are grouped into episodes (adjacent rows within ``group_gap`` are
    one). An episode qualifies if it *ends* in ``[window_start, anchor]`` — a long
    suspend that began before the window but is still unwinding into a recovery
    rise at the anchor still gates. Returns the latest such episode's end, or
    ``None``.
    """
    rows = sorted((e for e in basal_events if _is_suspend(e)), key=lambda e: e.t)
    if not rows:
        return None
    # Group consecutive suspend rows into [start, end] episodes.
    episodes: List[List[datetime]] = []
    for e in rows:
        if episodes and e.t - episodes[-1][1] <= group_gap:
            episodes[-1][1] = e.t
        else:
            episodes.append([e.t, e.t])
    latest_end: Optional[datetime] = None
    for _start, end in episodes:
        if window_start <= end <= anchor:
            if latest_end is None or end > latest_end:
                latest_end = end
    return latest_end


def upstream_cause(
    anchor: datetime,
    cgm_readings: Sequence[CgmReading],
    basal_events: Sequence[BasalEvent] = (),
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> GateResult:
    """Does an *observable* upstream event explain a rise at ``anchor``?

    The shared context gate. Scans the ``gate_lookback_min`` window before ``anchor``
    for either signature of a non-meal cause of a glucose rise:

    * a **recent CGM low** — any reading at/under ``gate_low_mgdl`` (a rescued low whose
      overshoot is now bleeding upward), and/or
    * a **defensive-suspend episode** — a Control-IQ zero-temp that ended in the
      window and is now unwinding into a recovery rise.

    Returns a :class:`GateResult`. When something is found, ``explained`` is True
    and ``cause`` names it; the finding is a hard fact (``OBSERVED`` — the low
    reading / suspend row is in the feed). Rescue carbs themselves are invisible
    (ADR 0003), so this gates on the low/suspend, never on the carbs.

    Reused by the late-bolus classifier (#71) and every later classifier
    (#72–#76) that must not mistake a recovery rise for a behavior.
    """
    lookback_min = scenario_config.gate_lookback_min
    low_mgdl = scenario_config.gate_low_mgdl
    suspend_group_gap_min = scenario_config.gate_suspend_group_gap_min
    window_start = anchor - timedelta(minutes=lookback_min)

    nadir_bg, nadir_t = _recent_low(cgm_readings, window_start, anchor, low_mgdl)
    suspend_end_t = _recent_suspend_end(
        basal_events, window_start, anchor, timedelta(minutes=suspend_group_gap_min)
    )

    has_low = nadir_bg is not None
    has_suspend = suspend_end_t is not None

    if has_low and has_suspend:
        cause = UpstreamCause.BOTH
    elif has_low:
        cause = UpstreamCause.RECENT_LOW
    elif has_suspend:
        cause = UpstreamCause.DEFENSIVE_SUSPEND
    else:
        cause = UpstreamCause.NONE

    parts: List[str] = []
    if has_low:
        parts.append(f"BG bottomed at {nadir_bg:.0f} mg/dL")
    if has_suspend:
        parts.append("Control-IQ suspended basal defensively")
    detail = (
        f"{' and '.join(parts)} in the prior {lookback_min:.0f} min — the rise is "
        "a recovery, not a from-flat meal climb"
        if parts
        else ""
    )

    return GateResult(
        explained=cause is not UpstreamCause.NONE,
        cause=cause,
        nadir_bg=nadir_bg,
        nadir_t=nadir_t,
        suspend_end_t=suspend_end_t,
        detail=detail,
    )
