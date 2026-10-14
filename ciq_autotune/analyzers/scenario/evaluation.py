"""Shared episode geometry, ownership and recurrence (#342).

Event streams in; bounded episodes and owned identities out.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from typing import Optional, Sequence

from ...events import CgmReading
from ..scenario_config import ScenarioConfig
from .anchors import collect_anchors
from .attribute import (
    Attribution,
    _next_meal_bolus_t,
    attribute,
    high_moment_rebound,
    split_caused_over_treatments,
)
from .evidence_population import policy_for
from .levers import Lever, Exposure
from .segment import EpisodeAnchors, segment, split_double_humps, split_low_rebounds
from .severity import severity_score, worst_bg
from . import opportunities

def _slice(events, start, end):
    return [e for e in events if start <= e.t <= end]

@dataclass(frozen=True)
class AttributedOccurrence:
    """An attributed episode and its policy-owned recurrence anchor (#387).

    Episode ids belong to this input walk, not to durable history. Unassociated
    drivers remain in the legacy tally but cannot establish comparison ownership.
    """

    lever: Lever
    episode_id: str
    recurrence_id: str
    driver_family: Optional[Exposure]
    driver_source_key: Optional[tuple]
    anchor_t: Optional[datetime]
    unavailable_reason: Optional[str] = None


def _context(bolus_events, cgm_readings, basal_events, isf, scenario_config, low_answers):
    anchors = collect_anchors(
        bolus_events, cgm_readings, basal_events, scenario_config=scenario_config
    )
    ep_anchor_groups = split_caused_over_treatments(
        split_low_rebounds(
            split_double_humps(
                segment(anchors, scenario_config=scenario_config),
                cgm_readings, scenario_config=scenario_config,
            ),
            cgm_readings, bolus_events, scenario_config=scenario_config,
        ),
        cgm_readings, bolus_events, basal_events,
        isf=isf,
        scenario_config=scenario_config,
        low_answers=low_answers,
    )
    families = opportunities.build_opportunities(
        bolus_events, cgm_readings, basal_events, scenario_config=scenario_config,
    )
    return ep_anchor_groups, families


def _resolve_end(
    start: datetime,
    end: datetime,
    ctx_cgm: Sequence[CgmReading],
    *,
    limit: Optional[datetime] = None,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> datetime:
    """The episode's effective end — extended to the excursion's resolution (#78/#80).

    If the CGM at ``end`` is still out of range (the episode was cut off at its peak
    by the 5 h cap / the last anchor's reach) OR the window is degenerate (``start ==
    end`` with no in-window CGM), walk forward from ``end`` to the first return-to-
    range reading, up to :data:`_RESOLVE_HORIZON_MIN`. This keeps severity/worst_bg
    from being computed over a truncated or empty span. Never returns earlier than
    ``end``.

    ``limit`` (the next episode's start) hard-bounds the forward walk so a cut-off-at-
    peak extension can never run into its neighbour — the extension stops at return-to-
    range OR ``limit``, whichever comes first (the non-overlap invariant, #80).
    """
    rows = sorted(
        (r for r in ctx_cgm if r.bg is not None and start <= r.t), key=lambda r: r.t
    )
    if not rows:
        return end

    range_low = scenario_config.segment_range_low_mgdl
    range_high = scenario_config.segment_range_high_mgdl
    in_window = [r for r in rows if r.t <= end]
    degenerate = not in_window                     # empty span (zero-duration anchor)
    cut_off = bool(in_window) and not (
        range_low <= in_window[-1].bg <= range_high
    )
    if not (degenerate or cut_off):
        return end

    horizon = end + timedelta(minutes=scenario_config.engine_resolve_horizon_min)
    if limit is not None:
        horizon = min(horizon, limit)              # never extend into the neighbour
    resolved: Optional[datetime] = None
    for r in rows:
        if r.t <= end:
            continue
        if r.t > horizon:
            break
        resolved = r.t                             # keep extending across the arc
        if range_low <= r.bg <= range_high:
            break                                  # came home to range — stop here
    if resolved is None:
        return end
    return max(end, resolved)


@dataclass(frozen=True)
class EvaluatedEpisode:
    id: str
    anchors: EpisodeAnchors
    start: datetime
    end: datetime
    attribution: Attribution
    severity: float
    worst_bg: Optional[float]
    outcome_t: Optional[datetime]
    occurrence_id: Optional[str] = None

@dataclass(frozen=True)
class Evaluation:
    episodes: tuple[EvaluatedEpisode, ...]
    families: dict
    recurrence_counts: dict
    attributed: tuple[AttributedOccurrence, ...]

def bounded_episode(index, group, attr, cgm, *, next_start=None,
                    next_lever_start=None, owned_end=None, scenario_config=ScenarioConfig()):
    """Resolve geometry before comparing owners, including leverless groups.

    ``owned_end`` is where the last High run an over-treated low owns stops counting
    on the low (ADR 422); its scored span reaches the later of that and the guarded
    terminal, still clamped at the next lever-bearing episode.
    """
    start, end = group.start, group.end
    if next_start is not None:
        end = min(end, next_start)
    ctx = _slice(cgm, start - timedelta(minutes=scenario_config.engine_context_pad_min),
                 end + timedelta(minutes=scenario_config.engine_context_pad_min))
    if attr.lever is Lever.OVER_TREATED_LOW and attr.rebound_end is not None:
        terminal = attr.rebound_end if owned_end is None else max(attr.rebound_end, owned_end)
        if next_lever_start is not None:
            terminal = min(terminal, next_lever_start)
        end = max(end, terminal)
    else:
        end = _resolve_end(start, end, ctx, limit=next_start, scenario_config=scenario_config)
    measured = _slice(cgm, start, end)
    worst = worst_bg(measured, start, end, scenario_config=scenario_config)
    witness = min((r.t for r in measured if worst is not None and r.bg == worst), default=None)
    return EvaluatedEpisode(f"ep-{index:03d}", group, start, end, attr,
                            severity_score(measured, start, end, scenario_config=scenario_config),
                            worst, witness)

def evaluate(bolus, cgm, basal=(), *, isf=None, scenario_config=ScenarioConfig(),
             low_answers=(), window_start=None, window_end=None,
             bound_classifier_context=True):
    """Evaluate source-window events once, preserving the caller's context contract.

    ``assemble`` bounds classifier context at the next group before padding
    (True). ``tally_attributions`` and ``build_exposures`` inspect the raw group's
    padded end (False), preserving each caller's base reach. The legacy
    attributed-occurrence/recurrence helpers also use False. Standalone model-view
    uses the bounded default; exposure model-view consumes its supplied evaluation.
    Every caller uses this same walk without reclassifying the returned episodes.
    """
    times = [e.t for e in (*bolus, *cgm, *basal)]
    end = window_end or max(times, default=datetime.min)
    start = window_start or min(times, default=end)
    bolus, cgm, basal = (_slice(rows, start, end) for rows in (bolus, cgm, basal))
    groups, families = _context(bolus, cgm, basal, isf, scenario_config, low_answers)
    # A fired over-treated low owns every real High its guarded rebound reaches, in
    # its own episode or a later one (ADR 422). Episodes are walked in order and a
    # rebounding low heads its own, so its rebound is known before any High it can
    # own. A #155 High-moment carries its rebound on its anchor: that one is known
    # before the walk, because its real High can sit in the earlier low-moment.
    known = [high_moment_rebound(a) for group in groups for a in group.anchors
             if a.rebound_nadir_bg is not None]
    attrs = []
    for index, group in enumerate(groups):
        lo = group.start - timedelta(minutes=scenario_config.engine_context_pad_min)
        context_end = group.end
        if bound_classifier_context and index + 1 < len(groups):
            context_end = min(context_end, groups[index + 1].start)
        hi = context_end + timedelta(minutes=scenario_config.engine_context_pad_min)
        attr = attribute(group, _slice(cgm, lo, hi), _slice(bolus, lo, hi),
                         _slice(basal, lo, hi), isf=isf,
                         scenario_config=scenario_config, low_answers=low_answers,
                         known_rebounds=tuple(known))
        attrs.append(attr)
        known.extend(owner for owner in attr.fired_rebounds if owner not in known)
    owned_end = _owned_ends(attrs, bolus, scenario_config)
    bearing = [a.lever is not None for a in attrs]
    owned = []
    for i, (group, attr) in enumerate(zip(groups, attrs)):
        ep = bounded_episode(i, group, attr, cgm,
            next_start=groups[i + 1].start if i + 1 < len(groups) else None,
            next_lever_start=next((g.start for j, g in enumerate(groups) if j > i and bearing[j]), None),
            owned_end=owned_end.get(i), scenario_config=scenario_config)
        owned.append(replace(ep, occurrence_id=ep.id if attr.lever is not None else None))
    counts = {lever: len(policy_for(lever).recurrence_population(
        families, scenario_config=scenario_config)) for lever in Lever}
    recurrences = tuple(_recurrence(ep, families) for ep in owned
                        if ep.attribution.lever is not None)
    return Evaluation(tuple(owned), families, counts, recurrences)

def _owned_ends(attrs, bolus, scenario_config):
    """Per owning episode index, where its owned High runs stop counting (ADR 422).

    Each owned High run counts on the episode that fired its owner until the run
    ends, but never past the guarded scan's meal-bolus stop: what follows the next
    substantial meal bolus after the nadir belongs to the meal.
    """
    owner_episode = {owner: i for i, attr in enumerate(attrs)
                     for owner in attr.fired_rebounds}
    ends = {}
    for attr in attrs:
        for high, owner in attr.owned_highs:
            stop = _next_meal_bolus_t(bolus, owner.nadir_t, scenario_config=scenario_config)
            run_end = high.reach_end if stop is None else min(high.reach_end, stop)
            i = owner_episode[owner]
            ends[i] = max(ends.get(i, run_end), run_end)
    return ends


def _recurrence(ep, families):
    attr = ep.attribution
    policy = policy_for(attr.lever)
    driver = attr.driver_anchor
    family, key = opportunities.canonical_anchor_key(driver) if driver is not None else (None, None)
    if attr.correction_pair is not None:
        family, key = Exposure.CORRECTION_CLUSTERS, attr.correction_pair
    elif (attr.lever is Lever.OVER_TREATED_LOW and driver is not None
          and driver.rebound_nadir_t is not None):
        matches = [item for item in families[Exposure.LOWS] if item.anchor_t == driver.rebound_nadir_t]
        family, key = Exposure.LOWS, matches[0].source_key if len(matches) == 1 else None
    matches = [item for item in families.get(family, ()) if item.source_key == key]
    owned = None
    if family is policy.recurrence_family and len(matches) == 1:
        owned = matches[0].anchor_t
    return AttributedOccurrence(attr.lever, ep.id, ep.occurrence_id, family, key, owned,
                                None if owned is not None else "unassociated_recurrence_anchor")
