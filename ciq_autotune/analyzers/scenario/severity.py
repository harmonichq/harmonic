"""Episode severity — hypo-weighted time-out-of-range (#70 §3).

Severity ranks episodes within a lever (hero selection) and feeds a pattern's
#58 ``effect``. The design decision from the grilling pass: **a 55 outweighs a
250** — a hypo minute costs more than a hyper minute of the same magnitude, and
low glucose is the danger the tool exists to reduce. So severity is a
*hypo-weighted* time-out-of-range integral, with total out-of-range magnitude/area
as the tiebreak baked into the same number (deeper + longer excursions score
higher).

For each CGM reading below ``bg_low`` or above ``bg_high`` we accrue
``depth * weight * minutes``, where ``depth`` is mg/dL past the range edge,
``minutes`` is the gap it represents (capped so a CGM dropout doesn't inflate an
interval), and ``weight`` is :data:`HYPO_WEIGHT` below range vs ``1.0`` above.
The result is an unbounded mg/dL·min score; :func:`normalized_severity` squashes
it into ``[0, 1]`` for the pattern ``effect``.

On top of that time-integral we add a **nadir-depth** term (#151): the single
deepest point below range earns ``(bg_low - nadir) * hypo_weight *
NADIR_DEPTH_MIN_EQUIV`` extra weighted mg/dL·min. The integral alone captures how
*long* BG sat low, but a brief crash to 46 and a lingering 68 that rebound
identically can integrate to near-equal scores — yet a 46 is the far more
dangerous event. Crediting the nadir as if it stood at its depth for a fixed
block of minutes makes depth a first-class ranking signal, so at equal duration /
rebound a deeper nadir always outranks a shallower one. It only sharpens
ranking; it never changes what fires (an over-treated low still fires purely on
its rebound clearing the #112 tiered bar — see ``attribute._low_lever``).
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import List, Optional, Sequence, Tuple

from ...events import CgmReading
from ..scenario_config import ScenarioConfig

# The in-range band edges, hypo weight, per-reading minutes cap, nadir-depth credit,
# and the normalization constant now live on ``ScenarioConfig`` (the ``severity_*``
# fields). ``severity_hypo_weight`` (3×) makes *time near a low* dominate: a 55 held
# 30 min far outscores a brief 250 spike, the intended ranking.


def _readings_in(
    cgm_readings: Sequence[CgmReading], start: datetime, end: datetime
) -> List[Tuple[datetime, float]]:
    return sorted(
        (r.t, r.bg)
        for r in cgm_readings
        if r.bg is not None and start <= r.t <= end
    )


def severity_score(
    cgm_readings: Sequence[CgmReading],
    start: datetime,
    end: datetime,
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> float:
    """Hypo-weighted time-out-of-range over ``[start, end]``, in weighted mg/dL·min.

    Larger = worse. Time spent low is weighted ``severity_hypo_weight`` × time spent
    high of the same magnitude, so a shallow-but-sustained low outranks a brief tall
    spike — the intended #70 ranking. Returns 0.0 when the window is entirely in range
    or has no CGM.
    """
    bg_low = scenario_config.severity_bg_low
    bg_high = scenario_config.severity_bg_high
    hypo_weight = scenario_config.severity_hypo_weight
    max_gap_min = scenario_config.severity_max_gap_min
    nadir_depth_min_equiv = scenario_config.severity_nadir_depth_min_equiv
    pts = _readings_in(cgm_readings, start, end)
    if not pts:
        return 0.0
    score = 0.0
    for i, (t, bg) in enumerate(pts):
        # Minutes this reading stands in for: half the gap to each neighbor, capped.
        prev_gap = (t - pts[i - 1][0]).total_seconds() / 60.0 if i > 0 else max_gap_min
        next_gap = (
            (pts[i + 1][0] - t).total_seconds() / 60.0 if i + 1 < len(pts) else max_gap_min
        )
        minutes = min(max_gap_min, prev_gap) / 2.0 + min(max_gap_min, next_gap) / 2.0
        if bg < bg_low:
            score += (bg_low - bg) * hypo_weight * minutes
        elif bg > bg_high:
            score += (bg - bg_high) * minutes
    # Nadir-depth term (#151): reward how *deep* the low went, not just how long. The
    # deepest below-range point earns a fixed block of equivalent minutes at its depth,
    # so at equal duration/rebound a 46 outranks a 68. Ranking only — firing is
    # unchanged (owned by ``attribute._low_lever``).
    nadir = min(bg for _, bg in pts)
    if nadir < bg_low:
        score += (bg_low - nadir) * hypo_weight * nadir_depth_min_equiv
    return score


def normalized_severity(
    raw: float, *, scenario_config: ScenarioConfig = ScenarioConfig()
) -> float:
    """Squash a raw severity score into ``[0, 1]`` for a pattern's #58 ``effect``.

    A soft exponential saturation: ``1 - exp(-raw / norm)``. Monotonic, never
    saturates hard, and keeps ordinary excursions well below 1 so a genuinely
    severe episode still stands out as a stronger ``effect``.
    """
    if raw <= 0:
        return 0.0
    return 1.0 - math.exp(-raw / scenario_config.severity_norm)


def worst_bg(
    cgm_readings: Sequence[CgmReading], start: datetime, end: datetime,
    *, scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Optional[float]:
    """The most clinically-significant BG in the window for tie-breaking / display.

    The nadir if the episode ever went low (lows dominate), otherwise the peak.
    ``None`` when the window has no CGM.
    """
    pts = _readings_in(cgm_readings, start, end)
    if not pts:
        return None
    bgs = [bg for _, bg in pts]
    low = min(bgs)
    return low if low < scenario_config.severity_bg_low else max(bgs)
