"""The scenario engine — assemble episodes into a ranked, scored pattern payload.

The public face of epic #70's layer 3. It:

1. **segments** the raw timeline into episodes (:mod:`.segment` over
   :mod:`.anchors`);
2. **attributes** a single lever per episode, root-cause-by-time
   (:mod:`.attribute`) — the dedup that collapses co-occurring flags;
3. **groups** episodes into policy-owned occurrences and patterns by lever;
4. **scores** each pattern with #58 :class:`~ciq_autotune.uncertainty.Confidence`
   — ``n`` = recurrence population, ``k`` = unique occurrences that went bad this
   way, ``effect`` = typical hypo-weighted occurrence severity
   (:mod:`.severity`) — selects a **hero** (highest-severity credible episode), and
   **ranks** patterns by aggregate severity (#77);
5. emits the :class:`~.payload.ScenarioReport` (#70 §5): patterns without confident
   rate signal collapse behind the low-confidence expander (unless they are a
   substantial, severe recurring shape) and one-offs are suppressed. ``wide`` rides
   the payload as a tentative-render hint, not a hide.

Two entry points:

* :func:`assemble` — the pure core: event lists in, ``ScenarioReport`` out. All the
  judgment lives here; it takes no store, so it is fully unit-testable.
* :func:`build_scenarios` — the store-facing wrapper the API calls: reads the
  window, sources ``isf`` from the ISF analyzer + settings, builds the episode
  ``window`` payloads via :func:`~...timeline.timeline`,
  and delegates to :func:`assemble`.
"""

from __future__ import annotations

import statistics
from dataclasses import replace
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

from ... import settings
from ...events import BasalEvent, BolusEvent, CarbEntry, CgmReading, parse_t
from ...false_low import drop_readings, false_low_span_records, spans_from_records
from ...model import ModelConfig
from ...rescue_evidence import (
    RescueObservation,
    eligible_carb_entries,
    observe,
)
from ...uncertainty import Confidence
from ..scenario_config import ScenarioConfig
from .anchors import (
    AnchorKind,
    collect_anchors,
)
from .attribute import LowPromptAnswer, attribute, split_caused_over_treatments
from .levers import Exposure, Lever, exposure, recommendation
from .evidence_population import policy_for, recurrence_count
from . import opportunities
from .narrate import narrate
from .preempted import compute_preempted_lows
from .payload import (
    SCENARIO_SCHEMA_VERSION,
    Episode,
    Pattern,
    ScenarioReport,
)
from .segment import (
    segment,
    split_double_humps,
    split_low_rebounds,
)
from .severity import normalized_severity, severity_score, worst_bg

# The engine's aggregation knobs now live on ``ScenarioConfig`` (the ``engine_*``
# fields): the classifier context pad, the display window pad, the cut-off-at-peak
# resolve horizon, the one-off / strong-recurrence occurrence gates + effect floor,
# the score floor, and the trust-floor exposure ``n``. The low re-anchor line is
# ``gate_low_mgdl``; the resolve return-to-range band is ``segment_range_*_mgdl``.
# The ``_STRONG_*`` override headlines a rare-but-dangerous shape (a runaway-meal carb
# undercount) that #58's rate-conservative score would otherwise hide.

_FMT = "%Y-%m-%d %H:%M:%S"


def _fmt(dt: datetime) -> str:
    return dt.strftime(_FMT)


def _slice(events: Sequence, start: datetime, end: datetime) -> list:
    return [e for e in events if start <= e.t <= end]


def _exposure_counts(
    bolus: Sequence[BolusEvent],
    cgm: Sequence[CgmReading],
    basal: Sequence[BasalEvent],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Dict[Exposure, int]:
    """The denominator ``n`` for each exposure kind over the whole window.

    * meals — carb-tagged meal boluses.
    * lows — sub-70 CGM runs (nadir anchors).
    * correction clusters — consecutive user-correction *pairs* (the #58 exposure
      the old correction-stacking detector scored against).
    * highs — >250 CGM runs (peak anchors).
    """
    families = opportunities.build_opportunities(
        bolus, cgm, basal, scenario_config=scenario_config,
    )
    return {family: len(items) for family, items in families.items()}


def _recurrence_counts(bolus, cgm, basal, *, scenario_config=ScenarioConfig()):
    """The policy-owned recurrence denominator for every lever.

    Exposure counts remain available for outcome-family reporting; a lever's
    finding confidence must instead read its own evidence population.
    """
    families = opportunities.build_opportunities(
        bolus, cgm, basal, scenario_config=scenario_config,
    )
    return {
        lever: recurrence_count(
            lever, families, bolus, scenario_config=scenario_config,
        )
        for lever in Lever
    }


def tally_attributions(
    bolus_events: Sequence[BolusEvent],
    cgm_readings: Sequence[CgmReading],
    basal_events: Sequence[BasalEvent] = (),
    *,
    isf: Optional[float] = None,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    low_answers: Sequence[LowPromptAnswer] = (),
) -> Tuple[Dict[Exposure, int], Dict[Lever, int]]:
    """Exposure counts (``n``) and unique occurrence counts (``k``), no narration.

    The **tally-only** path behind the outcome-summary clean rates (ADR 0007,
    #113). It runs the same anchor → segment → split → attribute pipeline
    :func:`assemble` does — so an episode is attributed *exactly one* lever, the
    non-overlap invariant holds, and the counts match what the scenario engine
    would produce — but it **skips** the expensive per-episode work: no
    :func:`~.narrate.narrate`, no severity scoring, no ``window`` / timeline
    payload, no ``Episode`` objects. It returns just the two tallies the clean
    rates need: ``(exposure_counts, attributed_by_lever)``.

    The flat clean-rate consumer assigns each ``k`` to the account named by the
    lever's recurrence policy. Meal bolus fell short is unique-meal counted here;
    ordinary levers retain episode identity.
    """
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
    exposure_counts = _exposure_counts(
        bolus_events, cgm_readings, basal_events, scenario_config=scenario_config
    )

    attributed: Dict[Lever, int] = {}
    seen_occurrences: Dict[Lever, set] = {}
    for ep_anchors in ep_anchor_groups:
        start = ep_anchors.start
        end = ep_anchors.end
        ctx_start = start - timedelta(minutes=scenario_config.engine_context_pad_min)
        ctx_end = end + timedelta(minutes=scenario_config.engine_context_pad_min)
        attr = attribute(
            ep_anchors,
            _slice(cgm_readings, ctx_start, ctx_end),
            _slice(bolus_events, ctx_start, ctx_end),
            _slice(basal_events, ctx_start, ctx_end),
            isf=isf,
            scenario_config=scenario_config,
            low_answers=low_answers,
        )
        if attr.lever is None:
            continue
        if attr.lever is Lever.MEAL_BOLUS_SHORT:
            policy = policy_for(attr.lever)
            occurrence_id = policy.occurrence_for_episode(
                "", bolus_events, attr.steps[0].t,
                scenario_config=scenario_config,
            )
            if occurrence_id in seen_occurrences.setdefault(attr.lever, set()):
                continue
            seen_occurrences[attr.lever].add(occurrence_id)
        attributed[attr.lever] = attributed.get(attr.lever, 0) + 1
    return exposure_counts, attributed


def _lever_bearing_flags(
    ep_anchor_groups: Sequence,
    cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    basal: Sequence[BasalEvent],
    *,
    isf: Optional[float],
    scenario_config: ScenarioConfig = ScenarioConfig(),
    low_answers: Sequence[LowPromptAnswer] = (),
) -> List[bool]:
    """Which groups will attribute a lever — the authoritative non-overlap pre-pass (#124).

    The non-overlap invariant binds only *lever-bearing* episodes (ADR 0010): a group
    that attributes no lever is dropped and owns no danger-time, so it must not clamp a
    neighbour's forward reach. Determining the clamp therefore needs to know which
    groups are lever-bearing *before* the main build runs — so attribute each group once
    here, on its own padded context.

    This is not a fixpoint: attribution's lever/no-lever verdict is stable — widening a
    dropped group's context never resurrects a lever, nor strips one from a group that
    had it — so a single pass classifies every group. The main pass re-attributes under
    the relaxed bound (attribution runs twice per group; it is not the bottleneck).
    """
    flags: List[bool] = []
    for ep_anchors in ep_anchor_groups:
        ctx_start = ep_anchors.start - timedelta(minutes=scenario_config.engine_context_pad_min)
        ctx_end = ep_anchors.end + timedelta(minutes=scenario_config.engine_context_pad_min)
        attr = attribute(
            ep_anchors,
            _slice(cgm, ctx_start, ctx_end),
            _slice(bolus, ctx_start, ctx_end),
            _slice(basal, ctx_start, ctx_end),
            isf=isf,
            scenario_config=scenario_config,
            low_answers=low_answers,
        )
        flags.append(attr.lever is not None)
    return flags


def _next_lever_bearing_start(
    ep_anchor_groups: Sequence, lever_bearing: Sequence[bool], idx: int
) -> Optional[datetime]:
    """The start of the first lever-bearing group after ``idx`` (the non-overlap clamp)."""
    for j in range(idx + 1, len(ep_anchor_groups)):
        if lever_bearing[j]:
            return ep_anchor_groups[j].start
    return None


def _build_episode(
    idx: int,
    ep_anchors,
    cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    basal: Sequence[BasalEvent],
    *,
    isf: Optional[float],
    window_builder,
    next_start: Optional[datetime] = None,
    next_lever_start: Optional[datetime] = None,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    low_answers: Sequence[LowPromptAnswer] = (),
) -> Optional[Tuple[Episode, Lever]]:
    """Attribute + assemble one episode, or ``None`` if it has no actionable lever.

    Hands the classifiers a padded context slice (so their look-back/ahead reach
    outside the tight episode bounds) but bounds severity and the ``window`` payload
    to the episode itself (plus a little display pad).

    ``next_start`` is the start of the following group (episodes are built in start
    order); the resolved end is clamped so it can never reach into that neighbour — the
    non-overlap invariant (#80). A split-off left hump reaches ``t+180`` past its divider
    trough, and a cut-off-at-peak extension walks forward until BG returns to range, so
    without this bound either could re-merge two split episodes' time spans
    (double-counting the same danger-time).

    ``next_lever_start`` is the start of the next *lever-bearing* group. It bounds the
    **over-treated-low** span extension only: a dropped, lever-less group between a low's
    nadir and its rebound owns no danger-time, so it must not truncate the excursion —
    the low extends *through* it to the rebound's resolution, clamped only at a real
    lever-bearing neighbour (#124 / ADR 0010). Every other episode is bounded by
    ``next_start`` exactly as before, so the relaxation moves nothing but the intended
    over-treated lows.
    """
    start = ep_anchors.start
    end = ep_anchors.end
    # A meal's forward reach (t+180, #78) can push the raw cluster end past the next
    # episode's start; cap it there first so severity never straddles the divider.
    if next_start is not None:
        end = min(end, next_start)
    ctx_start = start - timedelta(minutes=scenario_config.engine_context_pad_min)
    ctx_end = end + timedelta(minutes=scenario_config.engine_context_pad_min)
    ctx_cgm = _slice(cgm, ctx_start, ctx_end)
    ctx_bolus = _slice(bolus, ctx_start, ctx_end)
    ctx_basal = _slice(basal, ctx_start, ctx_end)

    attr = attribute(
        ep_anchors, ctx_cgm, ctx_bolus, ctx_basal,
        isf=isf,
        scenario_config=scenario_config,
        low_answers=low_answers,
    )
    if attr.lever is None:
        return None

    # Resolve the episode's true end so severity/worst_bg/window cover the whole
    # excursion, not a truncated slice.
    if attr.lever is Lever.OVER_TREATED_LOW and attr.rebound_end is not None:
        # An over-treated low's span runs nadir → guarded-rebound-scan terminal (the
        # excursion's resolution: the climb past range and the multi-hour decline back
        # down), not the anchor-bounded near-low run that scores ~0 (#124 / ADR 0010).
        # The terminal comes from the same scan the label fired on. It reaches *through*
        # any dropped, lever-less anchor between the nadir and the rebound, clamped only
        # at the next lever-bearing neighbour (so two lever-bearing episodes never
        # overlap); the scan horizon is already baked into ``rebound_end``.
        extended = attr.rebound_end
        if next_lever_start is not None:
            extended = min(extended, next_lever_start)
        end = max(end, extended)
    else:
        # Extend when the episode was cut off at its peak (#80: the arc ended still out
        # of range) so the whole excursion is scored. A degenerate window (start == end,
        # e.g. a zero-duration meal anchor whose CGM gap left no reach) is likewise
        # widened to the arc it was judged on so severity/worst_bg are never computed
        # over an empty span (#78). end never shrinks, and never reaches into the next
        # episode: the forward walk stops at return-to-range OR ``next_start``, whichever
        # comes first (the non-overlap invariant).
        end = _resolve_end(
            start, end, ctx_cgm, limit=next_start, scenario_config=scenario_config
        )
    sev_raw = severity_score(cgm, start, end, scenario_config=scenario_config)
    wb = worst_bg(cgm, start, end, scenario_config=scenario_config)
    # Severity / worst_bg / attribution are all fixed above over [start, end]; the
    # window below is a *display* slice only. Widen it to cover the narrated arc so
    # every beat (#79) and the extended low-rebound (#81) fall on the canvas the
    # frontend pins to [window.start, window.end] (#89). This changes ONLY the
    # serialized timeline slice — never episode.start/end, severity, k, or ranking.
    steps = narrate(
        attr, ep_anchors, ctx_cgm, ctx_bolus, ctx_basal, scenario_config=scenario_config
    )
    win_start, win_end = _window_bounds(start, end, steps, scenario_config=scenario_config)
    episode = Episode(
        id=f"ep-{idx:03d}",
        start=start,
        end=end,
        trigger=attr.trigger,
        lever=attr.lever,
        severity=sev_raw,
        steps=steps,
        window=window_builder(win_start, win_end),
        worst_bg=wb,
    )
    return episode, attr.lever


def _window_bounds(
    start: datetime, end: datetime, steps: Sequence,
    *, scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Tuple[datetime, datetime]:
    """The display window for an episode's step-through chart (#89).

    ``[min(start, first step t) − lead, max(end, last step t) + settle]``. Beats can
    outrun the episode's own [start, end]: #81 extends low-trigger arcs through the
    rebound and #79's beats range over the trigger's full excursion, so on a
    midnight-crosser the final "settled at 99" beat can sit hours past ``end`` (a
    midnight-crossing episode's header can sit hours before its final beat). The
    frontend pins the x-axis to
    ``window.start``/``end`` and labels the day boundary, so the window must cover
    every step's ``t`` or late markLines/spotlights land off-canvas.

    A step's ``cited_window`` (the missed-meal digestion lookback, #118) reaches
    *back* from the trigger — up to 150 min before the rise onset — so its bounds
    join the coverage too. Otherwise the band the frontend shades to make the scan
    span legible is clipped to a sliver at the canvas edge, hiding exactly the
    thing it exists to show (a nearby bolus sitting just inside/outside the window).

    Payload-only: this shifts nothing but the two window bounds and the timeline slice
    they select — severity, worst_bg, attribution, k, and ranking are all fixed over
    the untouched [start, end] before this runs.
    """
    lo = start
    hi = end
    for s in steps:
        for t in (s.t, _window_lo(s.cited_window), _window_hi(s.cited_window)):
            if t is None:
                continue
            if t < lo:
                lo = t
            if t > hi:
                hi = t
    return (
        lo - timedelta(minutes=scenario_config.engine_window_pad_min),
        hi + timedelta(minutes=scenario_config.engine_window_pad_min),
    )


def _window_lo(cited_window: Optional[Dict]) -> Optional[datetime]:
    return _parse(cited_window["start"]) if cited_window else None


def _window_hi(cited_window: Optional[Dict]) -> Optional[datetime]:
    return _parse(cited_window["end"]) if cited_window else None


def _parse(ts: str) -> datetime:
    return datetime.strptime(ts, _FMT)


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


def _score_pattern(
    lever: Lever,
    episodes: List[Episode],
    recurrence_counts: Dict[Lever, int],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Confidence:
    """The #58 :class:`Confidence` for a lever's pattern.

    ``k`` = unique policy occurrences attributed to this lever; ``n`` = the lever's
    recurrence population (never below ``k`` in served output);
    ``effect`` = mean normalized hypo-weighted severity across occurrence heroes
    (the "typical severity" that feeds both scoring and the recurrence line).
    """
    k = len(episodes)
    n = recurrence_counts[lever]
    if lever is Lever.MEAL_BOLUS_SHORT:
        if k > n:
            raise ValueError(
                f"{lever.value} attribution exceeds its evidence population"
            )
    else:
        # Near-low rebound episodes can be actionable even where no sub-70 anchor was
        # emitted. Those legacy Exposure populations still need this compatibility
        # clamp; ADR 202 records the audited exception explicitly.
        n = max(n, k)
    effects = [
        normalized_severity(ep.severity, scenario_config=scenario_config)
        for ep in episodes
    ]
    effect = statistics.fmean(effects) if effects else 0.0
    return Confidence(n=n, k=k, effect=effect)


def assemble(
    bolus_events: Sequence[BolusEvent],
    cgm_readings: Sequence[CgmReading],
    basal_events: Sequence[BasalEvent] = (),
    *,
    isf: Optional[float] = None,
    window: Optional[Dict] = None,
    window_builder=None,
    carb_entries: Sequence[CarbEntry] = (),  # Carb log (#125): the #172 pre-empted-low count (ADR 0012)
    low_answers: Sequence[LowPromptAnswer] = (),  # low-prompt answers (#129) → over-treated-low tier
    rescue_observation: Optional[RescueObservation] = None,  # rescue-log coverage (#467)
    config: ModelConfig = ModelConfig(),  # insulin-curve knobs for the #172 pre-empted-low IOB
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> ScenarioReport:
    """Assemble a ranked scenario payload from raw events (the pure engine core).

    ``isf`` (mg/dL per U) feeds the carb-undercount classifier; each meal supplies
    its own Dose-stamped I:C. ``window`` is an optional summary dict echoed into the
    report; ``window_builder(start, end) -> dict`` builds each episode's step-through
    payload (defaults to an empty dict, e.g. in unit tests).

    Pipeline: collect anchors → segment → attribute one lever each → group by lever
    → score with #58 Confidence + select hero + rank → apply the surface rules
    (drop one-offs; collapse patterns lacking confident rate signal behind the
    low-confidence expander unless they are a substantial, severe recurring shape).
    """
    if window_builder is None:
        window_builder = lambda _s, _e: {}  # noqa: E731

    anchors = collect_anchors(
        bolus_events, cgm_readings, basal_events, scenario_config=scenario_config
    )
    # Cluster, then split over-merged double-hump clusters at a return-to-range trough
    # between two humps (#80) so each excursion is attributed independently, then split
    # any rebounding low into its own episode so an upstream lever can't absorb an
    # over-treated low (#104), then split an over-treated low that has its *own* cause
    # into a crash moment + an over-correction moment so both surface (#155). All passes
    # preserve start order (segment sorts by reach_start; the splits keep it), so each
    # group's neighbour bound is simply the next group's start.
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
    recurrence_counts = _recurrence_counts(
        bolus_events, cgm_readings, basal_events, scenario_config=scenario_config
    )

    # Authoritative pre-pass: which groups will attribute a lever. The non-overlap clamp
    # binds only lever-bearing episodes (#124 / ADR 0010), so a dropped, lever-less group
    # never truncates a neighbour.
    lever_bearing = _lever_bearing_flags(
        ep_anchor_groups, cgm_readings, bolus_events, basal_events,
        isf=isf,
        scenario_config=scenario_config,
        low_answers=low_answers,
    )

    episodes: Dict[str, Episode] = {}
    by_lever: Dict[Lever, List[Episode]] = {}
    occurrence_ids: Dict[str, str] = {}
    for idx, ep_anchors in enumerate(ep_anchor_groups):
        # Every episode's forward reach is bounded by the next group's start, so no two
        # episodes overlap in time (the non-overlap invariant, #80) — unchanged.
        next_start = (
            ep_anchor_groups[idx + 1].start
            if idx + 1 < len(ep_anchor_groups)
            else None
        )
        # An over-treated low's rebound extension is bounded instead by the next
        # *lever-bearing* group's start, so a dropped, lever-less anchor between the
        # nadir and the rebound no longer truncates the excursion, while two lever-bearing
        # episodes still never overlap (#124 / ADR 0010).
        next_lever_start = _next_lever_bearing_start(ep_anchor_groups, lever_bearing, idx)
        built = _build_episode(
            idx, ep_anchors, cgm_readings, bolus_events, basal_events,
            isf=isf, window_builder=window_builder,
            next_start=next_start, next_lever_start=next_lever_start,
            scenario_config=scenario_config,
            low_answers=low_answers,
        )
        if built is None:
            continue
        episode, lever = built
        episodes[episode.id] = episode
        by_lever.setdefault(lever, []).append(episode)
        occurrence_ids[episode.id] = policy_for(lever).occurrence_for_episode(
            episode.id, bolus_events, episode.steps[0].t,
            scenario_config=scenario_config,
        )

    # Build a scored pattern per lever with >= _MIN_OCCURRENCES episodes. Over-treated
    # lows are exempt from the one-off gate (#104): each is a discrete, dangerous event
    # the per-day investigate tool surfaces, so even a single one becomes a pattern
    # (it still rides the low-confidence expander below unless it recurs / is severe).
    scored: List[Tuple[Confidence, Lever, List[Episode]]] = []
    for lever, eps in by_lever.items():
        # Severity, hero, effect, ranking, and the occurrence gate all apply to the
        # policy's unique occurrence.  For meal-bolus-short that is the implicated
        # meal, represented by its worst associated episode.
        unique = {}
        for episode in eps:
            key = occurrence_ids[episode.id]
            if key not in unique or episode.severity > unique[key].severity:
                unique[key] = episode
        occurrence_eps = list(unique.values())
        if lever is not Lever.OVER_TREATED_LOW and len(occurrence_eps) < scenario_config.engine_min_occurrences:
            continue
        conf = _score_pattern(lever, occurrence_eps, recurrence_counts, scenario_config=scenario_config)
        scored.append((conf, lever, occurrence_eps))

    # Split into surfaced vs low-confidence by a rate-signal gate. `wide` does NOT
    # hide a pattern here (scenario-scoped, #77) — over a realistic window low-base-
    # rate habits are almost always wide, so it rides the payload for #64 to render
    # the pattern tentatively. A pattern collapses only when its sample is too thin
    # (n < _MIN_TRUST_N) or it lacks confident rate signal (score < floor) AND is
    # not a substantial, severe recurring shape (the strong override).
    surfaced_pending: List[Tuple[float, Confidence, Lever, str, List[str]]] = []
    low_pending: List[Tuple[float, Confidence, Lever, str, List[str]]] = []
    for conf, lever, eps in scored:
        # Hero = highest-severity episode; occurrences = all episode ids, hero first.
        ordered = sorted(eps, key=lambda e: e.severity, reverse=True)
        hero = ordered[0].id
        occ_ids = [e.id for e in ordered]
        total_severity = sum(e.severity for e in eps)
        too_thin = conf.n < scenario_config.engine_min_trust_n
        strong = (
            conf.k >= scenario_config.engine_strong_occurrences
            and conf.effect >= scenario_config.engine_strong_effect
        )
        is_low_conf = too_thin or (conf.score < scenario_config.engine_score_floor and not strong)
        bucket = low_pending if is_low_conf else surfaced_pending
        bucket.append((total_severity, conf, lever, hero, occ_ids))

    # Order within each tier by AGGREGATE severity (desc, #77) — total hypo-weighted
    # time-in-danger the behavior cost. The surfaced scores are statistically
    # indistinguishable (all wide, clustered), so severity is the stable, meaningful
    # sort; the hero episode stays each card's face.
    surfaced: List[Pattern] = []
    low_conf: List[Pattern] = []
    for pending, out in ((surfaced_pending, surfaced), (low_pending, low_conf)):
        pending.sort(key=lambda t: t[0], reverse=True)
        for rank, (_sev, conf, lever, hero, occ_ids) in enumerate(pending, start=1):
            groups = []
            for occurrence_id in dict.fromkeys(
                occurrence_ids[episode_id] for episode_id in occ_ids
            ):
                members = [episode for episode in by_lever[lever]
                           if occurrence_ids.get(episode.id) == occurrence_id]
                representative = max(members, key=lambda episode: episode.severity)
                groups.append({"id": occurrence_id, "member_episode_ids": [episode.id for episode in members],
                               "severity": representative.severity, "hero_episode": representative.id})
            out.append(
                Pattern(
                    lever=lever,
                    confidence=conf,
                    rank=rank,
                    recommendation=recommendation(lever),
                    hero_episode=hero,
                    occurrences=occ_ids,
                    occurrence_groups=groups,
                )
            )

    # The #172 masked-low count-object (ADR 0012): the pre-empted lows a rescue carb
    # hid before they printed, attributed at I:C / ISF by the bolus that ran the drop.
    # Rides the payload alongside the printed-low patterns (never a Lever, never a
    # rate) so one behavior isn't fragmented across two reads.
    # ``rescue_observation`` (#467) rides along as the coverage the count was taken
    # over: the log began mid-history, so a window reaching back before it holds fewer
    # rescue rows than it had rescues. Caller-supplied, so the count function itself
    # stays a pure event function with no denominator of its own.
    preempted_lows = compute_preempted_lows(
        carb_entries, bolus_events, cgm_readings,
        config=config, scenario_config=scenario_config,
    )
    if rescue_observation is not None:
        preempted_lows = replace(preempted_lows, observation=rescue_observation)

    return ScenarioReport(
        schema_version=SCENARIO_SCHEMA_VERSION,
        window=window or {},
        patterns=surfaced,
        low_confidence=low_conf,
        episodes=episodes,
        preempted_lows=preempted_lows,
        priority_active_threshold=scenario_config.priority_active_threshold,
    )


def low_prompt_answers(store, start: datetime, now: datetime) -> List[LowPromptAnswer]:
    """The window's low-prompt answers as the attribution seam (#129).

    Reads ``store.prompt_responses()`` for ``detector == "low"`` rows whose anchor falls
    in ``[start, now]`` and shapes them into :class:`~.attribute.LowPromptAnswer` — the
    plain-data seam :func:`assemble` / :func:`tally_attributions` carry into
    over-treated-low attribution. A ``carbs`` answer's logged low-prompt
    :class:`~...events.CarbEntry` is resolved by its ``carb_entry_id`` so the confirmed
    branch can cite it and read its grams for the needed-vs-logged breakdown. Shared by
    the scenario, outcome-summary, and trend paths so their over-treated-low tallies
    agree (a refuted low must drop from every read).

    Endpoint eligibility (#467) is enforced here so every current-endpoint consumer
    (Patterns, exposures, model view, outcome summary) is safe by construction: a rescue
    answer (``carbs`` / ``no`` / ``not-sure``) is included only when it was *recorded* by
    ``now`` (``(answered_at or anchor_t) <= now``) — a rescue answer logged after this
    read's endpoint did not exist when it closed and may not reclassify it. ``false-low``
    is exempt: it is a reading invalidation (adr-381), not a rescue answer, so it applies
    to every read of its excursion however late it arrives. Rolling Outcomes windows
    re-filter this list at each historical window end for the same reason.
    """
    out: List[LowPromptAnswer] = []
    for r in store.prompt_responses():
        if r.get("detector") != "low":
            continue
        anchor_raw = r.get("anchor_t")
        anchor_t = anchor_raw if isinstance(anchor_raw, datetime) else parse_t(anchor_raw)
        if anchor_t < start or anchor_t > now:
            continue
        answer = r.get("answer")
        answered_raw = r.get("answered_at")
        answered_at = (answered_raw if isinstance(answered_raw, datetime)
                       else parse_t(answered_raw) if answered_raw else None)
        # A rescue answer recorded after this read's endpoint was not yet known — drop it
        # (#467). A `false-low` reading invalidation is exempt (its own settled rule).
        if answer != "false-low" and (answered_at or anchor_t) > now:
            continue
        carb_t: Optional[datetime] = None
        carb_grams: Optional[float] = None
        if answer == "carbs" and r.get("carb_entry_id") is not None:
            entry = store.get_carb_entry(r["carb_entry_id"])
            if entry is not None:
                et = entry.get("t")
                carb_t = et if isinstance(et, datetime) else (parse_t(et) if et else None)
                carb_grams = entry.get("grams")
        out.append(LowPromptAnswer(
            anchor_t=anchor_t, answer=answer, carb_t=carb_t, carb_grams=carb_grams,
            answered_at=answered_at))
    return out


def build_scenarios(
    store,
    *,
    window_days: int = 30,
    now: Optional[datetime] = None,
) -> ScenarioReport:
    """Build the ranked scenario payload for ``store``'s recent window (API entry).

    Reads bolus / CGM / basal over the last ``window_days``, sources the effective
    ``isf`` from the ISF analyzer + latest settings snapshot (each meal carries its
    historical Dose-stamped I:C), and
    builds each episode's step-through ``window`` from the same
    :func:`~ciq_autotune.timeline.timeline` payload the ``/api/timeline`` endpoint
    serves.
    """
    from ...timeline import timeline as build_timeline

    basal = store.basal_events()
    cgm = store.cgm_readings()
    bolus = store.bolus_events()
    snaps = store.settings_snapshots()
    carbs = store.carb_entries()
    responses = store.prompt_responses()

    times = [e.t for e in basal] + [r.t for r in cgm]
    span_end = max(times) if times else None
    now = now or span_end or datetime.now()
    start = now - timedelta(days=window_days)

    w_bolus = _slice(bolus, start, now)
    w_cgm = _slice(cgm, start, now)
    # The per-flag false-low excursion records, derived once off the full CGM feed
    # (#381). Two consumers here reuse this single derivation: the reading-drop below
    # (its merged spans) and every per-episode timeline (#426). Resolving each flag's
    # excursion is the expensive part, so it must not run per episode — the display
    # timeline used to re-derive it 20+ times over the whole 42k-row history.
    fl_records = false_low_span_records(cgm, responses)
    # A false-low flag (#381) invalidates its whole excursion: those readings are
    # removed here so the flagged low never mints a LOWS anchor / episode and its fake
    # rebound never reads as a meal. Reading invalidation, not the carb mask below.
    w_cgm = drop_readings(w_cgm, spans_from_records(fl_records))
    w_basal = _slice(basal, start, now)
    # The unbolused-carb log (#125), windowed like the feeds above and handed to the
    # engine core, which distills the #172 pre-empted-low count from it (ADR 0012).
    # Windowed by event time *and* filtered to what had been recorded by this window's
    # endpoint (#467) — the eligibility predicate lives here in the caller so the
    # pre-empted-low gate stays a pure event function.
    w_carbs = _slice(eligible_carb_entries(carbs, now), start, now)
    # How much of the window the rescue log was recording, and what it recorded — the
    # coverage the pre-empted-low count must be read against (#467).
    rescue_observation = observe(carbs, responses, start=start, end=now)
    # The low-prompt answers (#129) that upgrade / suppress over-treated-low attribution.
    # The shared helper enforces the current endpoint (#467): a rescue answer recorded
    # after `now` did not exist when this view closed and is dropped there, so this
    # Patterns/current path is safe even when `now` is a historical point. The rolling
    # Outcomes windows re-filter this same list at each window's own end; a `false-low`
    # reading invalidation is exempt from both (its own settled rule) — applied to the
    # CGM via `fl_records` above.
    w_answers = low_prompt_answers(store, start, now)

    isf = _effective_isf(bolus, basal, cgm, snaps, start, now)

    # Thread the window-invariant timeline inputs (the false-low records above and the
    # settings snapshots) into every episode's window build so timeline() stops
    # re-reading the whole CGM/settings history per episode (#426). The per-window
    # clamp inside timeline() still runs each call; only the derivation is hoisted.
    def window_builder(s: datetime, e: datetime) -> Dict:
        return build_timeline(store, s, e, false_low_records=fl_records, snaps=snaps)

    summary = {"start": _fmt(start), "end": _fmt(now), "days": window_days}
    # The detector-layer thresholds are code-owned and not per-run configurable (#114);
    # construct the one ScenarioConfig here and thread it down, mirroring ModelConfig.
    return assemble(
        w_bolus, w_cgm, w_basal,
        isf=isf,
        window=summary, window_builder=window_builder,
        carb_entries=w_carbs, low_answers=w_answers,
        rescue_observation=rescue_observation,
        scenario_config=ScenarioConfig(),
    )


def _effective_isf(
    bolus, basal, cgm, snaps, start: datetime, now: datetime
) -> Optional[float]:
    """The effective ISF (mg/dL per U) in force in the window.

    The representative-value read is shared with ``analyze()`` via
    :func:`ciq_autotune.settings.effective_isf`. Only the ``analyze_isf`` call is
    local: this orchestrator windows over a different span, so that regression
    genuinely runs here.
    """
    from ..isf import analyze_isf

    # This window differs from analyze()'s, so the ISF analyzer call genuinely
    # runs here (not duplication). Only the representative-value pick is shared.
    isf_rows = analyze_isf(
        _slice(bolus, start, now),
        _slice(basal, start, now),
        _slice(cgm, start, now),
        settings.active_schedule(snaps, "isf"),
    )
    return settings.effective_isf(isf_rows, snaps)
