"""False-low exclusion — a *reading-invalidation* signal, distinct from the carb mask.

A user answers the low prompt "Not real (sensor noise / compression low)" (#381) when
a sub-70 excursion was never real glucose — pressure on the sensor while asleep, a
Dexcom compression artifact. Those excursions are physiologically impossible fasting
Vs (a 47 that rebounds +139 in 25 min, no carbs, no insulin), and today each one trips
the harm layer as a genuine BASAL-arm printed low: after two nights it nudges overnight
basal *down* and gates any raise — a fake low actively makes basal less aggressive.

This module turns each stored ``false-low`` answer into an **excursion span** and lets
every tuning path drop the in-span CGM readings *before* they are read. That is the hard
line vs. :func:`~ciq_autotune.carbs.carb_log_exclusion_spans`: the carb log is a
*mask-for-carbs* de-bias — the reading still exists, it just doesn't count as fasting —
whereas a false low must **vanish** from low detection and the LOWS tally entirely (the
reading was never real). So consumers call :func:`drop_readings` (the reading is gone),
never a COB-style guard.

**One definition of the span, computed at read time from the anchor** (mirroring how carb
spans are computed from carb entries — nothing new is persisted; the answer stores only
its anchor, as every other prompt answer does). The span runs from the *start of the
unexplained drop* to *where BG rejoins trend* — not just the sub-70 window — so the fake
rebound (the +139 climb) can't read as a missed meal or distort ISF. The rejoin edge
reuses the scenario engine's :func:`~ciq_autotune.analyzers.scenario.segment.guarded_rebound`
(the same low→rebound boundary logic #104/#149 already reason about) rather than inventing
a second definition; the drop edge walks back to the pre-plunge shoulder.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional, Sequence, Tuple

from .events import CgmReading, parse_t
from .analyzers.scenario_config import ScenarioConfig
# ``guarded_rebound`` is imported lazily inside :func:`excursion_span`: importing the
# scenario ``segment`` module eagerly pulls in the scenario package ``__init__`` →
# ``engine`` (which imports this module), a cycle. The lazy import breaks it.

# The stored answer token (kept decoupled from the button text, per #381: the
# frontend reads "Not real (sensor noise / compression low)"). The detector is the
# same ``low`` prompt the ``carbs`` / ``no`` / ``not-sure`` answers already ride.
FALSE_LOW_ANSWER = "false-low"
FALSE_LOW_DETECTOR = "low"

# Sub-low readings more than this apart start a different low run (mirrors
# HarmConfig.low_run_gap_min, the grouping the harm layer this suppresses uses).
_LOW_RUN_GAP_MIN = 30.0

# How near a stored anchor a sub-low reading must sit to be *its* run. Anchors are
# recorded at the live-recomputed nadir and can drift a reading or two before the
# span is next computed (mirrors pending_prompts.ANCHOR_TOLERANCE).
_ANCHOR_MATCH_MIN = 15.0

# Cap the backward drop-onset walk so a flat, gently-wandering fasting baseline can't
# drag the onset arbitrarily far back into clean data — the excursion is the plunge,
# not the calm hours before it.
_BACK_SCAN_CAP_MIN = 120.0

# The drop-onset walk keeps climbing back up the plunge only while each earlier reading
# is at least this much higher than the one after it (a real descent). Once a step
# flattens below this, we've reached the pre-plunge shoulder — the calm baseline the
# drop fell from — and stop, so the baseline itself is never swallowed. A compression
# low plunges far steeper than this; a gentle fasting wander sits well under it.
_DESCENT_STEP_MGDL = 4.0


def false_low_anchors(prompt_responses: Sequence[dict]) -> List[datetime]:
    """The anchor instants of every stored ``false-low`` answer (unsorted)."""
    out: List[datetime] = []
    for r in prompt_responses:
        if r.get("detector") != FALSE_LOW_DETECTOR or r.get("answer") != FALSE_LOW_ANSWER:
            continue
        anchor = r.get("anchor_t")
        if anchor is None:
            continue
        out.append(anchor if isinstance(anchor, datetime) else parse_t(anchor))
    return out


def excursion_span(
    cgm_sorted: Sequence[CgmReading],
    anchor_t: datetime,
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Optional[Tuple[datetime, datetime]]:
    """The whole flagged excursion (drop onset → rejoin) around ``anchor_t``, or None.

    ``cgm_sorted`` must be time-sorted, ``bg``-non-null readings. Returns ``None`` when no
    sub-low run sits near the anchor (the data changed since the flag) — there is then
    nothing real to suppress.
    """
    low_bg = scenario_config.gate_low_mgdl
    gap = timedelta(minutes=_LOW_RUN_GAP_MIN)
    match_tol = timedelta(minutes=_ANCHOR_MATCH_MIN)

    # The nadir of the sub-low run the anchor belongs to: the lowest sub-low reading
    # in the contiguous run (gap-split) that contains a reading within tolerance of the
    # anchor. Walk out from the nearest sub-low reading to the anchor.
    lows = [(i, r) for i, r in enumerate(cgm_sorted) if r.bg is not None and r.bg < low_bg]
    if not lows:
        return None
    near = min(lows, key=lambda ir: abs((ir[1].t - anchor_t).total_seconds()))
    if abs((near[1].t - anchor_t).total_seconds()) > match_tol.total_seconds():
        return None

    # Grow the run left/right through sub-low readings no more than `gap` apart.
    low_idx = {i for i, _ in lows}
    lo_i = hi_i = near[0]
    while lo_i - 1 in low_idx and cgm_sorted[lo_i].t - cgm_sorted[lo_i - 1].t <= gap:
        lo_i -= 1
    while hi_i + 1 in low_idx and cgm_sorted[hi_i + 1].t - cgm_sorted[hi_i].t <= gap:
        hi_i += 1
    nadir_i = min(range(lo_i, hi_i + 1), key=lambda i: (cgm_sorted[i].bg, cgm_sorted[i].t))
    nadir = cgm_sorted[nadir_i]

    from .analyzers.scenario.segment import guarded_rebound  # lazy: see module note

    onset_t = _drop_onset(cgm_sorted, lo_i, gap)
    rebound = guarded_rebound(cgm_sorted, nadir.t, scenario_config=scenario_config)
    end_t = rebound.terminal or nadir.t
    return (onset_t, max(end_t, nadir.t))


def _drop_onset(cgm_sorted: Sequence[CgmReading], run_start_i: int, gap: timedelta) -> datetime:
    """The pre-plunge shoulder: walk back from the low run's first reading up the
    plunge while it keeps descending steeply, stopping where the step flattens.

    Each backward step is on the descent only while the earlier reading is at least
    :data:`_DESCENT_STEP_MGDL` higher than the one after it; the first flat step is the
    shoulder — the calm baseline the drop fell from — so the baseline is never
    swallowed. Also capped at :data:`_BACK_SCAN_CAP_MIN` and at any continuity break.
    """
    onset_i = run_start_i
    limit = cgm_sorted[run_start_i].t - timedelta(minutes=_BACK_SCAN_CAP_MIN)
    i = run_start_i - 1
    while i >= 0:
        if cgm_sorted[i + 1].t - cgm_sorted[i].t > gap:
            break                                    # CGM gap — stop the walk
        if cgm_sorted[i].t < limit:
            break                                    # too far back
        if cgm_sorted[i].bg - cgm_sorted[onset_i].bg >= _DESCENT_STEP_MGDL:
            onset_i = i                              # earlier reading meaningfully higher
            i -= 1
        else:
            break                                    # step flattened — the shoulder
    return cgm_sorted[onset_i].t


def false_low_spans(
    cgm: Sequence[CgmReading],
    prompt_responses: Sequence[dict],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> List[Tuple[datetime, datetime]]:
    """Merged excursion spans for every stored ``false-low`` answer over ``cgm``."""
    return spans_from_records(
        false_low_span_records(cgm, prompt_responses, scenario_config=scenario_config))


def spans_from_records(
    records: Sequence[dict],
) -> List[Tuple[datetime, datetime]]:
    """Coalesce per-flag :func:`false_low_span_records` into merged ``(start, end)`` spans.

    The merged tuning spans and the per-flag chart records are the same underlying
    excursions — resolving each anchor is the expensive part. A consumer that needs
    both surfaces (the Day model view: greyed records for the chart *and* merged spans
    for the reading drop) computes the records once and derives the spans from them,
    rather than resolving every anchor twice.
    """
    return _merge([(r["start"], r["end"]) for r in records])


def false_low_span_records(
    cgm: Sequence[CgmReading],
    prompt_responses: Sequence[dict],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> List[dict]:
    """Per-flag excursion records for the Day chart: ``[{anchor_t, start, end}, …]``.

    Unlike :func:`false_low_spans` (merged, for the tuning drop) this keeps one record
    per flag, each carrying its ``anchor_t`` so the chart can render the greyed artifact
    **with an inline undo** that clears exactly that answer. Records with no resolvable
    excursion (data changed) are dropped.
    """
    anchors = false_low_anchors(prompt_responses)
    if not anchors:
        return []
    cgm_sorted = sorted((r for r in cgm if r.bg is not None), key=lambda r: r.t)
    if not cgm_sorted:
        return []
    out: List[dict] = []
    for a in anchors:
        span = excursion_span(cgm_sorted, a, scenario_config=scenario_config)
        if span is not None:
            out.append({"anchor_t": a, "start": span[0], "end": span[1]})
    out.sort(key=lambda r: r["start"])
    return out


def _merge(spans: List[Tuple[datetime, datetime]]) -> List[Tuple[datetime, datetime]]:
    """Sort and coalesce overlapping/adjacent spans (mirrors carb_log_exclusion_spans)."""
    if not spans:
        return []
    spans = sorted(spans)
    merged: List[Tuple[datetime, datetime]] = [spans[0]]
    for lo, hi in spans[1:]:
        prev_lo, prev_hi = merged[-1]
        if lo <= prev_hi:
            merged[-1] = (prev_lo, max(prev_hi, hi))
        else:
            merged.append((lo, hi))
    return merged


def in_spans(t: datetime, spans: Sequence[Tuple[datetime, datetime]]) -> bool:
    """Whether instant ``t`` falls inside any excursion span (inclusive)."""
    return any(lo <= t <= hi for lo, hi in spans)


def drop_readings(
    cgm: Sequence[CgmReading], spans: Sequence[Tuple[datetime, datetime]]
):
    """``cgm`` with every in-span reading removed — the reading-invalidation itself.

    This is what makes a false low *vanish* (not merely un-count, as the carb mask
    does): the readings are gone before any low run, fasting step, or LOWS anchor is
    formed. Returns the input unchanged when there are no spans.
    """
    if not spans:
        return list(cgm)
    return [r for r in cgm if not in_spans(r.t, spans)]
