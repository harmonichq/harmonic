"""Suspend instance classifier (#75) — epic #70.

Judges **one** Control-IQ suspend episode: did it precede a real/near low, or
was it routine predictive trimming that never neared a low?

The old ``defensive_suspend`` detector counted every suspend episode following a
meal/correction bolus in the prior 2h as an over-delivery signal without ever
checking whether BG actually approached a low. On real data this over-counted
substantially — only a minority of post-bolus suspends actually reached a
near-low.

The fix is the **real/near-low gate**: a suspend only signals over-delivery when
BG actually reached a near-low nadir (<75 mg/dL) within the suspend window plus
a 45-min post-suspend recovery window. Routine CIQ suspends that never neared a
low are explicitly excluded.

This feeds two levers:

* **meal over-delivery** — a post-meal suspend that drove BG into a near-low.
* **over-treated low** — a suspend episode that preceded (and likely caused) a
  low that the user then over-treated (episode continues into a rebound high).

Pure function, no I/O, no registry — the scenario engine (#70) does the wiring.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Sequence

from ...events import BasalEvent, CgmReading
from ..scenario_config import ScenarioConfig
from .context_gate import (
    _is_suspend,
    _recent_low,
    _recent_suspend_end,
)
from .evidence import EvidenceTier, SilenceReason, Verdict

# Back-compat re-exports: the near-low line and the minimum-suspend-duration now live
# on ``ScenarioConfig`` (``suspend_near_low_mgdl`` / ``suspend_min_duration_min`` — the
# live values the classifier reads). Kept as module aliases because ``narrate`` and the
# suspend tests import them.
NEAR_LOW_MGDL: float = ScenarioConfig().suspend_near_low_mgdl
MIN_SUSPEND_DURATION_MIN: float = ScenarioConfig().suspend_min_duration_min


@dataclass(frozen=True)
class SuspendVerdict(Verdict):
    """A :class:`Verdict` for the suspend classifier.

    * ``matched`` — True iff this suspend episode preceded a real/near low
      (nadir <:data:`NEAR_LOW_MGDL` within the gate window).
    * ``nadir_bg`` — the lowest CGM value seen in the gate window, or ``None``
      when no low was found.
    * ``nadir_t`` — timestamp of that nadir, or ``None``.
    * ``suspend_start`` — start of the suspend episode.
    * ``suspend_end`` — end of the suspend episode.
    * ``suspend_duration_min`` — episode duration in minutes.
    """

    nadir_bg: Optional[float] = None
    nadir_t: Optional[datetime] = None
    suspend_start: Optional[datetime] = None
    suspend_end: Optional[datetime] = None
    suspend_duration_min: Optional[float] = None


def _suspend_episode(
    basal_events: Sequence[BasalEvent],
    anchor: datetime,
    group_gap: timedelta,
) -> Optional[tuple[datetime, datetime]]:
    """Find the most recent suspend episode that contains or ends at/before ``anchor``.

    Returns ``(start, end)`` of the qualifying episode, or ``None`` if the
    ``anchor`` is not within or just after a suspend episode.
    """
    rows = sorted((e for e in basal_events if _is_suspend(e)), key=lambda e: e.t)
    if not rows:
        return None

    # Group consecutive suspend rows into [start, end] episodes.
    episodes: list[tuple[datetime, datetime]] = []
    ep_start = rows[0].t
    ep_end = rows[0].t
    for e in rows[1:]:
        if e.t - ep_end <= group_gap:
            ep_end = e.t
        else:
            episodes.append((ep_start, ep_end))
            ep_start = e.t
            ep_end = e.t
    episodes.append((ep_start, ep_end))

    # Return the most recent episode whose start is at/before anchor.
    result: Optional[tuple[datetime, datetime]] = None
    for start, end in episodes:
        if start <= anchor:
            if result is None or end > result[1]:
                result = (start, end)
    return result


def classify_suspend(
    anchor: datetime,
    cgm_readings: Sequence[CgmReading],
    basal_events: Sequence[BasalEvent] = (),
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> SuspendVerdict:
    """Did the suspend episode anchored at ``anchor`` precede a real/near low?

    Judges a single Control-IQ suspend episode (identified by its anchor — the
    start or any row within the episode):

    1. Find the suspend episode containing ``anchor``.  No episode → **not
       matched** (``NOT_IN_DATA`` — there's no suspend to judge).
    2. Episode duration ≤ ``min_suspend_duration_min`` → **not matched**
       (``OBSERVED`` — trivial trim, excluded per issue #75).
    3. Look for a CGM nadir < ``near_low_mgdl`` within the gate window
       ``[suspend_start, suspend_end + post_suspend_window_min]``:

       * Nadir found → **matched** (``OBSERVED`` — both the suspend row and the
         sub-``near_low_mgdl`` CGM reading are hard facts from the feed).
       * No nadir → **not matched** (``OBSERVED`` — the CGM trace stayed above
         the threshold; the suspend was routine predictive trimming).

    Returns a :class:`SuspendVerdict`. Never checks for a bolus in the preceding
    window — the gate is purely BG-shaped; the scenario engine attributes the
    lever (meal over-delivery vs. over-treated low) from episode context.
    """
    near_low_mgdl = scenario_config.suspend_near_low_mgdl
    post_suspend_window_min = scenario_config.suspend_post_window_min
    min_suspend_duration_min = scenario_config.suspend_min_duration_min
    group_gap = timedelta(minutes=scenario_config.gate_suspend_group_gap_min)
    episode = _suspend_episode(basal_events, anchor, group_gap)

    if episode is None:
        return SuspendVerdict(
            matched=False,
            detail="no Control-IQ suspend episode found at the anchor time",
            evidence_tier=EvidenceTier.NOT_IN_DATA,
            silence_reason=SilenceReason.INSUFFICIENT_DATA,
        )

    suspend_start, suspend_end = episode
    duration_min = (suspend_end - suspend_start).total_seconds() / 60.0

    if duration_min <= min_suspend_duration_min:
        return SuspendVerdict(
            matched=False,
            detail=(
                f"suspend episode was only {duration_min:.0f} min — "
                f"trivial cut (≤{min_suspend_duration_min:.0f} min threshold), "
                "not an over-delivery signal"
            ),
            evidence_tier=EvidenceTier.OBSERVED,
            # A ≤10-min trim is not a meaningful suspend episode — the behavior
            # (a defensive suspend that could signal over-delivery) didn't happen.
            silence_reason=SilenceReason.NO_TRIGGER,
            suspend_start=suspend_start,
            suspend_end=suspend_end,
            suspend_duration_min=duration_min,
        )

    # Gate window: from suspend start through post-suspend recovery window.
    gate_end = suspend_end + timedelta(minutes=post_suspend_window_min)
    nadir_bg, nadir_t = _recent_low(cgm_readings, suspend_start, gate_end, near_low_mgdl)

    if nadir_bg is not None:
        return SuspendVerdict(
            matched=True,
            detail=(
                f"Control-IQ suspended basal for {duration_min:.0f} min and BG "
                f"reached {nadir_bg:.0f} mg/dL — suspend preceded a real/near low"
            ),
            evidence_tier=EvidenceTier.OBSERVED,
            nadir_bg=nadir_bg,
            nadir_t=nadir_t,
            suspend_start=suspend_start,
            suspend_end=suspend_end,
            suspend_duration_min=duration_min,
        )

    return SuspendVerdict(
        matched=False,
        detail=(
            f"Control-IQ suspended basal for {duration_min:.0f} min but BG stayed "
            f"≥{near_low_mgdl:.0f} mg/dL throughout — routine predictive trimming, "
            "not an over-delivery signal"
        ),
        evidence_tier=EvidenceTier.OBSERVED,
        # HORIZON_EXPIRED: the suspend was real, but the near-low outcome it gates on
        # never arrived inside the [start, end + 45 min] window.
        silence_reason=SilenceReason.HORIZON_EXPIRED,
        nadir_bg=None,
        nadir_t=None,
        suspend_start=suspend_start,
        suspend_end=suspend_end,
        suspend_duration_min=duration_min,
    )
