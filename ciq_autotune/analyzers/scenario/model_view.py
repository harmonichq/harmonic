"""Per-day model-view — the #152 introspection payload (ADR 0019).

A debug/introspection surface: for one calendar day, show **every** anchor the
engine saw and, for each, **why** each detector did or didn't fire. The shared
evaluation retains both matched and nonmatching verdicts; this view renders them.

Inspection contract (ADR 0019):

1. **Every anchor's verdict is retained**, even when the episode fires elsewhere.
   Ownership and nonmatching classifier verdicts come from the shared evaluator.
2. **Five distinct anchor states**: ``fired`` (the episode's driver), ``outranked``
   (a classifier matched here but another candidate became the driver — the
   attribution-layer consequence ADR 0009 keeps off the ``Verdict``), ``near_miss``
   (``matched=False`` with a loud :class:`~...classifiers.evidence.SilenceReason`),
   ``clean`` (nothing to flag), ``no_data`` (too sparse to judge).
3. **All classifier verdicts per anchor**, never the most-specific one — a late meal
   bolus on a prior carb bolus shows both ``owned_by_prior_bolus`` and the retained
   carb-undercount near-miss. Most-specific-wins (ADR 0009) is a coaching-layer
   surfacing rule and does not bind this debug feed.
4. **Its own per-day feed** — ``/api/model-view?date=YYYY-MM-DD`` (api.py), not a flag on
   ``/api/scenarios``.

Day assignment (the deferred ADR-0019 question, settled by the locked mockup): a
spanning episode renders on the day it **resolves** (``episode.end``'s calendar day),
with the prior-day lead-in shown; ``spans_midnight`` marks it — true only when a real
anchor lands after midnight, not merely because the window's cap pushed ``end`` past
00:00 (#280).
"""

from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

from ...carbs import carb_log_exclusion_spans
from ...events import BasalEvent, BolusEvent, CgmReading
from ..classifiers.evidence import SilenceReason
from ..scenario_config import ScenarioConfig
from .anchors import Anchor, AnchorKind
from .attribute import AnchorVerdict, LowPromptAnswer, attribute
from .levers import Lever
from .evaluation import evaluate, SEQUENCE_LEVERS
from .severity import worst_bg

_FMT = "%Y-%m-%d %H:%M:%S"

# Context pad handed to each anchor's classifiers so their look-back/ahead (IOB a
# full DIA, digestion 150 min, correction low-scan 4 h) reaches outside the tight
# episode bounds for the legacy single-group adapter. Shared evaluations carry
# their already-retained verdicts.
_CONTEXT_PAD_MIN = 300.0

# Display pad around a day's episodes for the floating chart window.
_WINDOW_PAD_MIN = 15.0

# Reasons that do NOT make an anchor a near-miss (a genuinely clean opportunity, or
# unjudgeable). Everything else in the closed taxonomy is a "loud" near-miss reason —
# the invisible under-threshold / recovery-masked misses this view exists to surface.
_CALM_REASONS = frozenset({
    SilenceReason.NO_TRIGGER,
    SilenceReason.INSUFFICIENT_DATA,
    SilenceReason.OWNED_BY_ANNOUNCED_MEAL,
})

# Human labels per anchor kind (mirror the frontend KIND_LABEL).
_KIND_LABEL = {
    AnchorKind.MEAL: "Meal bolus",
    AnchorKind.CORRECTION: "Correction",
    AnchorKind.LOW: "Low",
    AnchorKind.HIGH: "High",
    AnchorKind.SUSPEND: "Suspend",
}


def _fmt(dt: datetime) -> str:
    return dt.strftime(_FMT)


def _slice(events: Sequence, start: datetime, end: datetime) -> list:
    return [e for e in events if start <= e.t <= end]


def _low_verdicts(anchor, cgm, bolus, basal, *, scenario_config, low_answers):
    """Compatibility view of the low classifier's retained judgments."""
    from .attribute import _low_lever
    verdicts = []
    _low_lever(anchor, cgm, bolus, basal, scenario_config=scenario_config,
               low_answers=low_answers, verdicts=verdicts)
    return verdicts


def _anchor_state(is_driver: bool, verdicts: Sequence[AnchorVerdict]) -> str:
    """The anchor's one state, by precedence (ADR 0019 §2)."""
    if is_driver:
        return "fired"
    if any(v.matched for v in verdicts):
        return "outranked"
    if any(not v.matched and v.silence_reason not in _CALM_REASONS for v in verdicts):
        return "near_miss"
    if any(v.silence_reason is SilenceReason.INSUFFICIENT_DATA for v in verdicts):
        return "no_data"
    return "clean"


def _anchor_facts(anchor: Anchor) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    """``(bg, insulin, carbs)`` display facts for an anchor."""
    bg = anchor.bg
    insulin = anchor.bolus.insulin if anchor.bolus is not None else None
    carbs = anchor.bolus.carbs if anchor.bolus is not None else None
    return bg, insulin, carbs


def _is_driver(anchor: Anchor, attr) -> bool:
    """Is this anchor the episode's lever driver? (trigger_t sits at ``t`` or the rise onset.)"""
    if attr.lever is None or attr.lever in SEQUENCE_LEVERS:
        return False
    if (
        attr.lever is Lever.CORRECTION_STACKING
        and attr.correction_pair is not None
        and anchor.kind is AnchorKind.CORRECTION
        and anchor.bolus is not None
    ):
        return anchor.bolus.seq_num == attr.correction_pair[1]
    return anchor.t == attr.trigger_t or anchor.reach_start == attr.trigger_t


def _build_episode_view(
    idx: int,
    ep_anchors,
    cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    basal: Sequence[BasalEvent],
    *,
    isf: Optional[float],
    scenario_config: ScenarioConfig,
    low_answers: Sequence[LowPromptAnswer],
    evaluated=None,
) -> dict:
    """One episode's model-view record: attribution + every anchor's every verdict + state."""
    start = ep_anchors.start
    end = ep_anchors.end
    ctx_start = start - timedelta(minutes=_CONTEXT_PAD_MIN)
    ctx_end = end + timedelta(minutes=_CONTEXT_PAD_MIN)
    ctx_cgm = _slice(cgm, ctx_start, ctx_end)
    ctx_bolus = _slice(bolus, ctx_start, ctx_end)
    ctx_basal = _slice(basal, ctx_start, ctx_end)

    attr = evaluated.attribution if evaluated is not None else attribute(
        ep_anchors, ctx_cgm, ctx_bolus, ctx_basal, isf=isf,
        scenario_config=scenario_config, low_answers=low_answers,
    )
    retained = {id(anchor): verdicts for anchor, verdicts in zip(ep_anchors.anchors, attr.anchor_verdicts)}

    ordered = sorted(ep_anchors.anchors, key=lambda a: a.t)
    anchor_dicts = []
    for a in ordered:
        verdicts = retained[id(a)]
        bg, insulin, carbs = _anchor_facts(a)
        anchor_dicts.append({
            "t": _fmt(a.t),
            "kind": a.kind.value,
            "label": _KIND_LABEL.get(a.kind, a.kind.value),
            "bg": bg,
            "insulin": insulin,
            "carbs": carbs,
            "state": _anchor_state(_is_driver(a, attr), verdicts),
            "verdicts": [v.to_dict() for v in verdicts],
        })

    first_date = ordered[0].t.date()
    spans_midnight = any(a.t.date() > first_date for a in ordered)
    return {
        "id": f"{end.date().isoformat()}-ep{idx}",
        "start": _fmt(start),
        "end": _fmt(end),
        "lever": attr.lever.value if attr.lever is not None else None,
        "trigger": attr.trigger,
        "trigger_t": _fmt(attr.trigger_t),
        "worst_bg": worst_bg(ctx_cgm, start, end, scenario_config=scenario_config),
        "spans_midnight": spans_midnight,
        # The attributed step-through (#70 §4) — the Day surface's tier-2 "Model
        # steps: how the episode was reasoned out" (ADR 0024). Empty for a clean
        # (unlevered) episode. Each step is {t, text, evidence_tier, …}.
        "steps": [s.to_dict() for s in attr.steps],
        "anchors": anchor_dicts,
        **({"evaluation_id": evaluated.id,
            "bounded_start": _fmt(evaluated.start), "bounded_end": _fmt(evaluated.end),
            "occurrence_id": evaluated.occurrence_id,
            "outcome_minute": (evaluated.outcome_t.hour * 60 + evaluated.outcome_t.minute
                               if evaluated.outcome_t is not None else None),
            "candidates": [{**c.to_dict(), "state": "fired" if c.lever is attr.lever else "outranked"}
                           for c in evaluated.candidates]}
           if evaluated is not None and any(c.sequence is not None for c in evaluated.candidates) else {}),
    }


def assemble_model_view(
    bolus_events: Sequence[BolusEvent],
    cgm_readings: Sequence[CgmReading],
    basal_events: Sequence[BasalEvent] = (),
    *,
    target: date_cls,
    isf: Optional[float] = None,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    low_answers: Sequence[LowPromptAnswer] = (),
    carb_entries=(),
    evaluated=None,
) -> dict:
    """The per-day model-view payload for ``target`` — the pure core (event lists in, dict out).

    Runs the same anchor → segment → split pipeline the scenario engine does (so the
    episodes and their split rebound high-moments match), attributes each, and for every
    anchor collects *every* classifier verdict + its state. Episodes are assigned to the
    calendar day they **resolve** on (``end``'s date); an episode with a real anchor
    after midnight marks ``spans_midnight`` and its prior-day lead-in rides the window
    so the chart shows it.
    """
    evaluated = evaluated or evaluate(bolus_events, cgm_readings, basal_events, isf=isf,
                                      scenario_config=scenario_config, low_answers=low_answers,
                                      carb_entries=carb_entries)
    episodes = []
    for idx, item in enumerate(evaluated.episodes):
        if item.anchors.end.date() != target:
            continue
        episodes.append(_build_episode_view(
            idx, item.anchors, cgm_readings, bolus_events, basal_events, isf=isf,
            scenario_config=scenario_config, low_answers=low_answers, evaluated=item,
        ))

    # Window covers every assigned episode's full span (incl. a spanning lead-in) + a
    # small display pad, and the CGM within it. midnight = the target's 00:00 divider,
    # shown only when there is a prior-day lead-in to distinguish.
    day_start = datetime.combine(target, datetime.min.time())
    day_end = day_start + timedelta(days=1)
    if episodes:
        span_start = min(datetime.strptime(e["start"], _FMT) for e in episodes)
        span_end = max(datetime.strptime(e["end"], _FMT) for e in episodes)
    else:
        span_start, span_end = day_start, day_end
    win_start = min(span_start, day_start) - timedelta(minutes=_WINDOW_PAD_MIN)
    win_end = max(span_end, day_end) - timedelta(seconds=1) + timedelta(minutes=_WINDOW_PAD_MIN)
    win_cgm = [
        {"t": _fmt(r.t), "bg": r.bg}
        for r in cgm_readings
        if win_start <= r.t <= win_end and r.bg is not None
    ]
    midnight = _fmt(day_start) if win_start < day_start else None

    return {
        "date": target.isoformat(),
        "midnight": midnight,
        "window": {"start": _fmt(win_start), "end": _fmt(win_end), "cgm": win_cgm},
        "chart_start": _fmt(win_start),
        "chart_end": _fmt(win_end),
        "episodes": episodes,
    }


def build_model_view(
    store,
    target: date_cls,
    *,
    context_days: int = 2,
    settings_window_days: int = 30,
) -> dict:
    """Build the per-day model-view for ``store`` on ``target`` (the API entry).

    Reads events over a small window bracketing ``target`` (``±context_days`` so every
    classifier look-back/ahead and any midnight-spanning episode is covered), sources the
    effective ISF the same way :func:`~.engine.build_scenarios` does (each meal carries
    its historical Dose-stamped I:C), and delegates to :func:`assemble_model_view`.
    ``isf`` rides the top of the payload for the header; the rest is the single day.
    """
    from .engine import _effective_isf, low_prompt_answers
    from ...false_low import drop_readings, false_low_span_records, spans_from_records

    day_start = datetime.combine(target, datetime.min.time())
    win_start = day_start - timedelta(days=context_days)
    win_end = day_start + timedelta(days=1 + context_days)

    bolus = _slice(store.bolus_events(), win_start, win_end)
    # A flagged false low (#381) is invalidated from the anchor view too, so a
    # suppressed low doesn't reappear as a debug anchor. Its span is surfaced below so
    # the Day chart can grey the excursion it removed.
    all_cgm = store.cgm_readings()
    responses = store.prompt_responses()
    # Resolve each flag's excursion once (the per-flag chart records) and derive the
    # merged reading-drop spans from them, rather than resolving every anchor twice.
    fl_records = false_low_span_records(all_cgm, responses)
    fl_spans = spans_from_records(fl_records)
    cgm = drop_readings(_slice(all_cgm, win_start, win_end), fl_spans)
    basal = _slice(store.basal_events(), win_start, win_end)
    snaps = store.settings_snapshots()
    low_answers = low_prompt_answers(store, win_start, win_end)

    # Effective settings over a representative recent window ending at the target day.
    settings_start = day_start - timedelta(days=settings_window_days)
    settings_end = day_start + timedelta(days=1)
    isf = _effective_isf(
        store.bolus_events(), store.basal_events(), store.cgm_readings(),
        snaps, settings_start, settings_end,
    )

    # Sequence comparison and prices use the fixed current Diagnose source window,
    # even though this consumer displays one day. A day outside that source window
    # keeps its historical local attribution and cannot acquire a sequence finding.
    all_basal = store.basal_events()
    source_times = [r.t for r in all_cgm] + [b.t for b in all_basal]
    source_end = max(source_times, default=day_start)
    source_start = source_end - timedelta(days=30)
    source_evaluation = None
    if source_start.date() <= target <= source_end.date():
        from ...rescue_evidence import eligible_carb_entries
        all_bolus = store.bolus_events()
        isf = _effective_isf(all_bolus, all_basal, all_cgm, snaps, source_start, source_end)
        source_evaluation = evaluate(
            _slice(all_bolus, source_start, source_end),
            drop_readings(_slice(all_cgm, source_start, source_end), fl_spans),
            _slice(all_basal, source_start, source_end), isf=isf,
            low_answers=low_prompt_answers(store, source_start, source_end),
            carb_entries=_slice(eligible_carb_entries(store.carb_entries(), source_end), source_start, source_end),
            window_start=source_start, window_end=source_end,
        )

    day = assemble_model_view(
        bolus, cgm, basal,
        target=target, isf=isf, low_answers=low_answers,
        carb_entries=store.carb_entries(win_start, win_end), evaluated=source_evaluation,
    )

    # Carb-log exclusion spans over the assembled window — the Day surface reads
    # these to tag a low that was arrested by rescue carbs ("⤴ rescued", the
    # pre-empted-low chart tag; ADR 0012/0027). Computed the same way the
    # /api/timeline daily report does, then clamped to the window it actually shows.
    win_start = datetime.strptime(day["window"]["start"], _FMT)
    win_end = datetime.strptime(day["window"]["end"], _FMT)
    excl = carb_log_exclusion_spans(store.carb_entries(win_start, win_end))
    day["window"]["carb_exclusion_spans"] = [
        {"start": _fmt(max(lo, win_start)), "end": _fmt(min(hi, win_end))}
        for lo, hi in excl
        if lo < win_end and hi > win_start
    ]
    # False-low excursion spans (#381), clamped to the shown window: the Day chart
    # greys these (still drawn) as sensor artifacts with an undo, matching /api/timeline.
    day["window"]["false_low_exclusion_spans"] = [
        {"anchor_t": _fmt(rec["anchor_t"]),
         "start": _fmt(max(rec["start"], win_start)), "end": _fmt(min(rec["end"], win_end))}
        for rec in fl_records
        if rec["start"] < win_end and rec["end"] > win_start
    ]
    return {"isf": isf, **day}
