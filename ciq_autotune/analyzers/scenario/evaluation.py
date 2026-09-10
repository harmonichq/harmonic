"""Shared episode geometry, candidate prices, ownership and recurrence (#342).

Event streams in; bounded episodes and owned identities out. Candidate pricing
precedes ownership and never resizes the episode it measured.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from statistics import fmean
from typing import Optional, Sequence

from ...events import CgmReading
from ..eating_sequences import evaluate_sequences, SequenceEvaluation, EligibleSequence
from ..eating_sequence_config import EatingSequenceConfig
from ..scenario_config import ScenarioConfig
from ..classifiers.evidence import EvidenceTier
from .anchors import collect_anchors
from .attribute import Attribution, attribute, split_caused_over_treatments
from .evidence_population import policy_for
from .levers import Lever, Exposure
from .payload import Step, event_ref, window_ref
from .segment import EpisodeAnchors, segment, split_double_humps, split_low_rebounds
from .severity import severity_score, normalized_severity, worst_bg
from . import opportunities

SEQUENCE_LEVERS = frozenset({Lever.HIGH_CARB_SEQUENCE, Lever.REPEAT_EATING})

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
class Candidate:
    attribution: Attribution
    occurrence_id: str
    sequence: Optional[EligibleSequence] = None
    impact: float = 0.0

    @property
    def lever(self):
        return self.attribution.lever

    def to_dict(self):
        return {"lever": self.lever.value, "occurrence_id": self.occurrence_id,
                "impact": self.impact,
                "sequence": self.sequence.to_dict() if self.sequence is not None else None}

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
    candidates: tuple[Candidate, ...] = ()
    occurrence_id: Optional[str] = None

@dataclass(frozen=True)
class Evaluation:
    episodes: tuple[EvaluatedEpisode, ...]
    families: dict
    sequences: SequenceEvaluation
    recurrence_counts: dict
    candidate_impacts: dict
    competing_levers: frozenset
    attributed: tuple[AttributedOccurrence, ...]

def bounded_episode(index, group, attr, cgm, *, next_start=None,
                    next_lever_start=None, scenario_config=ScenarioConfig()):
    """Resolve geometry before comparing owners, including leverless groups."""
    start, end = group.start, group.end
    if next_start is not None:
        end = min(end, next_start)
    ctx = _slice(cgm, start - timedelta(minutes=scenario_config.engine_context_pad_min),
                 end + timedelta(minutes=scenario_config.engine_context_pad_min))
    if attr.lever is Lever.OVER_TREATED_LOW and attr.rebound_end is not None:
        terminal = attr.rebound_end
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

def _sequence_candidates(episode, sequences):
    if episode.outcome_t is None or episode.severity <= 0:
        return ()
    out = []
    for lever in (Lever.HIGH_CARB_SEQUENCE, Lever.REPEAT_EATING):
        detector = (sequences.report.high_carb_sequence if lever is Lever.HIGH_CARB_SEQUENCE
                    else sequences.report.repeat_eating_amplifier)
        for row in sequences.populations.get(lever.value, ()):
            if not row.candidate or not row.start <= episode.outcome_t < row.end:
                continue
            step = Step(row.t, detector.finding.summary, EvidenceTier.INFERRED,
                        cited_event_refs=[event_ref(b.t) for b in row.sequence.members],
                        cited_window=window_ref(row.start, row.end),
                        citation={"operation": f"scenario.attribution.{lever.value}",
                                  "tier": "inferred", "facts": {"sequence_id": row.id,
                                  "period": row.period, "outcome_at": event_ref(episode.outcome_t)}})
            attr = Attribution(lever, "eating sequence", row.t, [step])
            out.append(Candidate(attr, row.id, row))
    return tuple(out)

def evaluate(bolus, cgm, basal=(), *, isf=None, scenario_config=ScenarioConfig(),
             low_answers=(), carb_entries=(), window_start=None, window_end=None):
    """Evaluate all consumers' source-window events once per invocation."""
    times = [e.t for e in (*bolus, *cgm, *basal)]
    end = window_end or max(times, default=datetime.min)
    start = window_start or min(times, default=end)
    bolus, cgm, basal, carb_entries = (_slice(rows, start, end)
                                      for rows in (bolus, cgm, basal, carb_entries))
    sequences = evaluate_sequences(bolus, cgm, carb_entries, window_start=start,
                                   window_end=end, config=EatingSequenceConfig())
    groups, families = _context(bolus, cgm, basal, isf, scenario_config, low_answers)
    attrs = []
    for group in groups:
        lo = group.start - timedelta(minutes=scenario_config.engine_context_pad_min)
        # Preserve the tally's classifier reach. The next group bounds burden,
        # not the evidence each classifier is allowed to inspect.
        hi = group.end + timedelta(minutes=scenario_config.engine_context_pad_min)
        attrs.append(attribute(group, _slice(cgm, lo, hi), _slice(bolus, lo, hi),
                               _slice(basal, lo, hi), isf=isf,
                               scenario_config=scenario_config, low_answers=low_answers))
    # Ordinary bounds establish whether a formerly leverless group can own a
    # sequence. It then clamps an earlier rebound in the same pre-pass.
    bearing = [a.lever is not None for a in attrs]
    for i, (group, attr) in enumerate(zip(groups, attrs)):
        if not bearing[i] and any(sequences.populations.values()):
            provisional = bounded_episode(i, group, attr, cgm,
                next_start=groups[i + 1].start if i + 1 < len(groups) else None,
                scenario_config=scenario_config)
            bearing[i] = bool(_sequence_candidates(provisional, sequences))
    episodes = []
    impacts = {}
    competing = set()
    for i, (group, attr) in enumerate(zip(groups, attrs)):
        ep = bounded_episode(i, group, attr, cgm,
            next_start=groups[i + 1].start if i + 1 < len(groups) else None,
            next_lever_start=next((g.start for j, g in enumerate(groups) if j > i and bearing[j]), None),
            scenario_config=scenario_config)
        candidates = [Candidate(match, policy_for(match.lever).occurrence_for_episode(
            ep.id, bolus, match.trigger_t, scenario_config=scenario_config))
            for match in attr.matches]
        seq_candidates = _sequence_candidates(ep, sequences)
        candidates.extend(seq_candidates)
        if seq_candidates:
            competing.update(c.lever for c in seq_candidates)
        for candidate in candidates:
            population = impacts.setdefault(candidate.lever, {})
            population[candidate.occurrence_id] = max(population.get(candidate.occurrence_id, 0), ep.severity)
        episodes.append(replace(ep, candidates=tuple(candidates)))
    prices = {lever: fmean(normalized_severity(s, scenario_config=scenario_config) for s in rows.values())
              for lever, rows in impacts.items()}
    owned = []
    for ep in episodes:
        candidates = tuple(replace(c, impact=prices[c.lever]) for c in ep.candidates)
        attr = ep.attribution
        winner = None
        if any(c.sequence is not None for c in candidates):
            # Stable max retains chronological classifier order on ordinary ties;
            # Repeat eating wins an exact tie with High-carb sequence only.
            winner = max(candidates, key=lambda c: c.impact)
            if winner.lever is Lever.HIGH_CARB_SEQUENCE:
                winner = next((c for c in candidates if c.lever is Lever.REPEAT_EATING
                               and c.impact == winner.impact), winner)
            attr = replace(winner.attribution, anchor_verdicts=attr.anchor_verdicts, steps=winner.attribution.steps + [
                c.attribution.steps[0] for c in candidates if c is not winner])
        elif attr.lever is not None:
            winner = next(c for c in candidates if c.lever is attr.lever)
        owned.append(replace(ep, attribution=attr, candidates=candidates,
                             occurrence_id=winner.occurrence_id if winner else None))
    counts = {lever: len(policy_for(lever).recurrence_population(
        families, bolus, scenario_config=scenario_config,
        sequence_populations=sequences.populations)) for lever in Lever}
    recurrences = tuple(_recurrence(ep, families, bolus, scenario_config) for ep in owned
                        if ep.attribution.lever is not None)
    return Evaluation(tuple(owned), families, sequences, counts, prices,
                      frozenset(competing), recurrences)

def _recurrence(ep, families, bolus, scenario_config):
    attr = ep.attribution
    policy = policy_for(attr.lever)
    if attr.lever in SEQUENCE_LEVERS:
        selected = next(c.sequence for c in ep.candidates if c.lever is attr.lever)
        return AttributedOccurrence(attr.lever, ep.id, ep.occurrence_id, None, None, selected.t)
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
    if policy.recurrence_family is None:
        population = policy.recurrence_population(families, bolus, scenario_config=scenario_config)
        matches = [item for item in population if policy.occurrence_id(item) == ep.occurrence_id]
        if len(matches) == 1:
            owned = matches[0].t
    elif family is policy.recurrence_family and len(matches) == 1:
        owned = matches[0].anchor_t
    return AttributedOccurrence(attr.lever, ep.id, ep.occurrence_id, family, key, owned,
                                None if owned is not None else "unassociated_recurrence_anchor")
