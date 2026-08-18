"""Narrative beats — turn an attributed episode into a multi-beat story (#79).

Attribution (:mod:`.attribute`) emits a :class:`~.payload.Step` only when an anchor
trips an *actionable lever*. On real 30-day data that leaves **27/28 episodes with
a single step**: episodes rarely have multiple actionable levers — they have one
driver plus *descriptive fallout* (a correction that landed, a peak, a nadir) that
the lever classifiers deliberately (and correctly) stay silent about. #64's
step-through UI is degenerate as a result.

This module fills that gap. Given the attributed lever (beat 1) it narrates the
**turning points of the trigger's excursion arc** — a curated causal chain, not a
wall of every event (median 14 events/episode) and not levers-only (the current
failure). It reuses the existing thresholds and honesty tiers; it invents no new
severity, ranking, or exposure signal (narrative-only scope, #79 — ``steps`` is
read by nothing but the payload and tests).

**Trigger-centered arc-bounding (NOT re-segmentation, #80).** The story is bounded
to the excursion that *contains the trigger*, delimited by return-to-**range**
troughs on both sides. A monotonic transit through range (375 → 68) does **not**
bound the arc — only a settled in-range trough does — so a meal that ran away and
then over-corrected into a low reads as one arc. On a double-hump cluster the
trigger sits in the correct hump, so this narrates *that* hump, not hump 1.

**Beat catalog** (reuses existing thresholds):

1. **Trigger** — beat 1, straight from attribution.
2. **Peak** — the arc high, when out of range; suppressed when the trigger text
   already states it (meal drivers say "ran away to 375").
3. **User intervention(s)** — user corrections in the arc (``_is_user_correction``:
   ≥1 U, no carbs, excluding sub-1 U CIQ auto-corrections), aggregated when ≥2.
4. **Suspend fired** — a Control-IQ defensive suspend in the arc.
5. **Nadir** — the arc bottomed ≤ :data:`~...suspend.NEAR_LOW_MGDL` (75): an
   observed value plus an *inferred* causal clause. This is the composed beat that
   narrates "over-corrected a runaway high into a low" without minting a lever.
6. **Resolution** — back in range (observed) or unresolved ("still 312 when it
   ended").

Adjacent identical beats are de-duplicated (an ep-034 overnight-low bug) and the
arc is capped at ~6 beats so a busy episode never becomes a wall.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import List, Optional, Sequence, Tuple

from ...events import BasalEvent, BolusEvent, CgmReading
from ..classifiers.evidence import EvidenceTier
from ..scenario_config import ScenarioConfig
from .anchors import Anchor, AnchorKind, _is_user_correction
from .attribute import Attribution
from .payload import Step, event_ref, event_refs
from .segment import EpisodeAnchors

# The narration target-range edges, the peak-beat / peak-stated tolerance, the beat
# cap, the near-low nadir line, and the low-trigger rebound horizon now live on
# ``ScenarioConfig`` (the ``narrate_*`` and ``suspend_near_low_mgdl`` fields). The
# peak-beat floor is the range-high edge; the rebound horizon (2 h) comfortably covers
# a fast-carb rescue's rise-and-fall (a nadir-then-rebound case).

# The low-anchor trigger labels: their driver step already narrates the nadir, so
# the nadir beat would duplicate it (dedup guard for the ep-034 double-emit).
_LOW_TRIGGERS = frozenset({"low"})


def _hhmm(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _in_range(bg: float, scenario_config: ScenarioConfig = ScenarioConfig()) -> bool:
    return scenario_config.narrate_range_low_mgdl <= bg <= scenario_config.narrate_range_high_mgdl


def _sorted_readings(cgm: Sequence[CgmReading]) -> List[CgmReading]:
    return sorted((r for r in cgm if r.bg is not None), key=lambda r: r.t)


def _nearest_index(rows: List[CgmReading], t: datetime) -> int:
    return min(range(len(rows)), key=lambda i: abs((rows[i].t - t).total_seconds()))


def _is_range_trough(
    rows: List[CgmReading], i: int,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> bool:
    """Is reading ``i`` a settled in-range low point (a return-to-range trough)?

    In range and no higher than its neighbours — a resting turn, not a transit
    through range on the way to somewhere worse.
    """
    bg = rows[i].bg
    if not _in_range(bg, scenario_config):
        return False
    left_ok = i == 0 or bg <= rows[i - 1].bg
    right_ok = i == len(rows) - 1 or bg <= rows[i + 1].bg
    return left_ok and right_ok


def _arc_bounds(
    rows: List[CgmReading],
    trigger_t: datetime,
    ep: EpisodeAnchors,
    *,
    is_low_trigger: bool = False,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Tuple[datetime, datetime, bool]:
    """Bound the trigger's excursion arc by return-to-range troughs both sides.

    Returns ``(arc_start, arc_end, resolved)``. ``resolved`` is True when the arc
    closes on an in-range trough (the excursion came home); False when the data
    runs out first (the episode ended still out of range).

    For a **low** trigger the arc does not close at the first return-to-range after
    the nadir: that trough is where the over-treatment's rebound *begins*. If BG
    climbs back out of range within :data:`_REBOUND_HORIZON` of that trough, the arc
    extends through the rebound excursion to *its* settle (#81). High triggers keep
    the #79 behaviour — the first settled trough closes the arc.
    """
    near_low_mgdl = scenario_config.suspend_near_low_mgdl
    rebound_horizon = timedelta(minutes=scenario_config.narrate_rebound_horizon_min)
    if not rows:
        return ep.start, ep.end, False

    ti = _nearest_index(rows, trigger_t)

    # Left bound: the latest in-range trough at or before the trigger. Walk back
    # until one is found (the calm before the excursion); else the first reading.
    start_i = 0
    for i in range(ti, -1, -1):
        if _is_range_trough(rows, i, scenario_config):
            start_i = i
            break

    # Right bound: the first in-range trough after the excursion has actually left
    # range (so an in-range wobble right at the trigger doesn't close the arc
    # prematurely). If none, the arc is unresolved and runs to the last reading.
    # For a low trigger, keep re-opening the arc while the immediate rebound climbs
    # back out of range within the horizon, closing only on a settled trough that
    # the excursion does *not* leave again (the rebound came home for good).
    end_i = len(rows) - 1
    resolved = False
    left_range = False
    scan = ti
    while scan < len(rows):
        for i in range(scan, len(rows)):
            # A near-low (<= NEAR_LOW_MGDL) counts as leaving range for the purpose
            # of arming the close, even though it is technically >= 70 (#115). A meal
            # over-delivery that dips to a near-low nadir and recovers WITHOUT ever
            # crossing 70 is a real excursion; without this the ``left_range`` gate
            # never trips, the loop falls through to the last reading, and the arc
            # (and its "settled" beat + display window) runs to the ~5 h context pad —
            # a same-day split-episode 7.5 h tail case. Armed here, the existing trough
            # scan closes the arc on the near-low's in-range recovery settle instead.
            if not _in_range(rows[i].bg, scenario_config) or rows[i].bg <= near_low_mgdl:
                left_range = True
            elif left_range and _is_range_trough(rows, i, scenario_config):
                end_i = i
                resolved = True
                break
        else:
            end_i = len(rows) - 1
            resolved = False
            break

        if not is_low_trigger:
            break
        # A low trigger's arc extends through the rebound: if BG leaves range again
        # within the horizon of this trough, that is the over-treatment's fallout —
        # re-open the scan from here and close on the rebound's own settle instead.
        horizon_end = rows[end_i].t + rebound_horizon
        rebound_i = next(
            (j for j in range(end_i + 1, len(rows))
             if rows[j].t <= horizon_end and not _in_range(rows[j].bg, scenario_config)),
            None,
        )
        if rebound_i is None:
            break
        left_range = False
        scan = rebound_i

    return rows[start_i].t, rows[end_i].t, resolved


def _stated_value(text: str, value: float, tol: float) -> bool:
    """Does ``text`` already carry a number within ``tol`` of ``value``?"""
    for m in re.findall(r"\d+(?:\.\d+)?", text):
        if abs(float(m) - value) <= tol:
            return True
    return False


def _extremum(
    rows: List[CgmReading], start: datetime, end: datetime, *, lowest: bool
) -> Optional[Tuple[float, datetime]]:
    span = [r for r in rows if start <= r.t <= end]
    if not span:
        return None
    best = min(span, key=lambda r: r.bg) if lowest else max(span, key=lambda r: r.bg)
    return best.bg, best.t


def _nadir_clause(corrections: List[BolusEvent]) -> str:
    """The inferred causal clause for a nadir (ADR 0003 — hedged, never asserted)."""
    if len(corrections) >= 2:
        return "the stacked corrections likely over-shot, driving it low"
    if len(corrections) == 1:
        units = corrections[0].insulin or 0.0
        return f"the {units:.0f}U correction likely over-shot, driving it low"
    return "insulin on board likely over-shot, driving it low"


def narrate(
    attribution: Attribution,
    ep_anchors: EpisodeAnchors,
    ctx_cgm: Sequence[CgmReading],
    ctx_bolus: Sequence[BolusEvent],
    ctx_basal: Sequence[BasalEvent],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> List[Step]:
    """Narrate an attributed episode as a curated multi-beat story (#79).

    Beat 1 is the attributed trigger; the rest are the turning points of the
    trigger's excursion arc (peak, user interventions, suspend, nadir, resolution),
    trigger-centered and bounded by return-to-range troughs. Narrative-only: this
    never touches severity, ranking, exposure, or #77 membership.
    """
    if not attribution.steps:
        return []

    peak_beat_mgdl = scenario_config.narrate_range_high_mgdl
    peak_stated_tol = scenario_config.narrate_peak_stated_tol
    near_low_mgdl = scenario_config.suspend_near_low_mgdl
    range_low_mgdl = scenario_config.narrate_range_low_mgdl
    range_high_mgdl = scenario_config.narrate_range_high_mgdl

    trigger_step = attribution.steps[0]
    trigger_t = attribution.trigger_t
    is_low_trigger = attribution.trigger in _LOW_TRIGGERS
    # A split-off low (#155): its over-treatment is a separate high-moment, so this
    # low-moment's story must not chase the rebound — it closes at the recovery dip
    # where the crash first came home to range (the high-moment owns the climb).
    is_split_low = is_low_trigger and any(
        a.kind is AnchorKind.LOW and a.over_treatment_split_off
        for a in ep_anchors.anchors
    )
    rows = _sorted_readings(ctx_cgm)
    _left, arc_end, resolved = _arc_bounds(
        rows, trigger_t, ep_anchors,
        is_low_trigger=is_low_trigger and not is_split_low,
        scenario_config=scenario_config,
    )
    if is_split_low:
        dip = next((r for r in rows if r.t > trigger_t and _in_range(r.bg, scenario_config)), None)
        if dip is not None:
            arc_end, resolved = dip.t, True
    # Consequence beats are *forward* of the trigger — the arc's left bound only
    # serves trigger-centering (a prior hump's corrections/peak are before the
    # trigger and so are naturally excluded). Never narrate pre-trigger fallout.
    arc_start = trigger_t

    # (t, step) so the story can be re-sorted into wall-clock order at the end.
    beats: List[Tuple[datetime, Step]] = [(trigger_t, trigger_step)]

    is_correction_trigger = attribution.trigger == "correction cluster"

    # --- Peak (observed) — suppress when the trigger already states it. ---------
    peak = _extremum(rows, arc_start, arc_end, lowest=False)
    if peak is not None:
        peak_bg, peak_t = peak
        if peak_bg >= peak_beat_mgdl and not _stated_value(
            trigger_step.text, peak_bg, peak_stated_tol
        ):
            beats.append((
                peak_t,
                Step(t=peak_t, text=f"BG peaked at {peak_bg:.0f} mg/dL",
                     evidence_tier=EvidenceTier.OBSERVED,
                     cited_event_refs=[event_ref(peak_t)]),
            ))

    # --- User intervention(s) (observed) — aggregate when ≥2. ------------------
    corrections = sorted(
        (b for b in ctx_bolus
         if _is_user_correction(b, scenario_config=scenario_config)
         and arc_start <= b.t <= arc_end),
        key=lambda b: b.t,
    )
    if corrections and not is_correction_trigger:
        if len(corrections) == 1:
            c = corrections[0]
            units = c.insulin or 0.0
            beats.append((
                c.t,
                Step(t=c.t,
                     text=f"{units:.0f}U correction at {_hhmm(c.t)}",
                     evidence_tier=EvidenceTier.OBSERVED,
                     cited_event_refs=[event_ref(c.t)]),
            ))
        else:
            total = sum(c.insulin or 0.0 for c in corrections)
            beats.append((
                corrections[0].t,
                Step(t=corrections[0].t,
                     text=(f"corrected {len(corrections)}×, ~{total:.0f}U total, "
                           "chasing it down"),
                     evidence_tier=EvidenceTier.OBSERVED,
                     cited_event_refs=event_refs([c.t for c in corrections])),
            ))

    # --- Suspend fired (observed) — a distinctive device beat. -----------------
    # Cites the interval as the zero-rate ``basal`` rows spanning it (#82's suspend
    # contract): the join keys the ``window.basal`` rows already carry, so the
    # frontend highlights exactly this run without re-detecting it.
    for a in ep_anchors.anchors:
        if a.kind is AnchorKind.SUSPEND and arc_start <= a.t <= arc_end:
            text = "Control-IQ suspended basal"
            end = a.end if a.end is not None else a.t
            if a.end is not None:
                mins = (a.end - a.t).total_seconds() / 60.0
                if mins >= 1:
                    text = f"Control-IQ suspended basal for {mins:.0f} min"
            refs = [b.t for b in ctx_basal
                    if b.basal_rate == 0 and a.t <= b.t <= end]
            if not refs:
                refs = [a.t]
            beats.append((a.t, Step(t=a.t, text=text,
                                    evidence_tier=EvidenceTier.OBSERVED,
                                    cited_event_refs=event_refs(refs))))
            break

    # --- Nadir (observed value + inferred causal clause) — the composed beat. ---
    # Skipped when the trigger is itself a low: its driver step already narrates it.
    nadir_t: Optional[datetime] = None
    if not is_low_trigger:
        nadir = _extremum(rows, arc_start, arc_end, lowest=True)
        if nadir is not None:
            nadir_bg, n_t = nadir
            if nadir_bg <= near_low_mgdl:
                nadir_t = n_t
                before = [c for c in corrections if c.t <= n_t]
                clause = _nadir_clause(before)
                beats.append((
                    n_t,
                    Step(t=n_t,
                         text=f"BG bottomed at {nadir_bg:.0f} mg/dL — {clause}",
                         evidence_tier=EvidenceTier.INFERRED,
                         cited_event_refs=[event_ref(n_t)]),
                ))

    # --- Resolution (observed) — back to range, or unresolved. -----------------
    # Skipped when the arc closes on the nadir reading itself (the nadir beat, a
    # near-low that is technically in range, already ends the story).
    span = [r for r in rows if arc_start <= r.t <= arc_end]
    if span and span[-1].t != nadir_t:
        last = span[-1]
        if resolved and _in_range(last.bg, scenario_config):
            text = f"back in range ({last.bg:.0f} mg/dL) by {_hhmm(last.t)}"
        elif last.bg > range_high_mgdl:
            text = f"still high at {last.bg:.0f} mg/dL when it ended"
        elif last.bg < range_low_mgdl:
            text = f"still low at {last.bg:.0f} mg/dL when it ended"
        else:
            text = f"settled at {last.bg:.0f} mg/dL"
        beats.append((last.t, Step(t=last.t, text=text,
                                   evidence_tier=EvidenceTier.OBSERVED)))

    beats.sort(key=lambda tb: tb[0])
    steps = _dedup_and_cap([s for _t, s in beats], scenario_config=scenario_config)
    return steps


def _dedup_and_cap(
    steps: List[Step], *, scenario_config: ScenarioConfig = ScenarioConfig()
) -> List[Step]:
    """Drop adjacent identical beats (ep-034) and cap at ``narrate_max_beats``.

    The cap keeps the trigger (first) and resolution (last) and trims the
    least-load-bearing middle beats — peak before interventions before suspend —
    so the spine of the story survives.
    """
    max_beats = scenario_config.narrate_max_beats
    deduped: List[Step] = []
    for s in steps:
        if deduped and deduped[-1].text == s.text:
            continue
        deduped.append(s)

    if len(deduped) <= max_beats:
        return deduped

    head, tail = deduped[0], deduped[-1]
    middle = deduped[1:-1]
    # Trim from the front of the middle (peak first) until we fit.
    keep = max_beats - 2
    middle = middle[len(middle) - keep:] if keep > 0 else []
    return [head, *middle, tail]
