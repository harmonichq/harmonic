"""Per-day model-view — the #152 introspection payload (ADR 0019).

A debug/introspection surface: for one calendar day, show **every** anchor the
engine saw and, for each, **why** each detector did or didn't fire — including the
near-miss verdicts that the coaching path discards the moment a driver fires
(#149/#150/#151 were all near-misses hiding inside a fired episode). This is the
tool's whole reason to exist.

Contract (ADR 0019), all realised here, deliberately **off** the coaching hot path:

1. **Every anchor's verdict is retained**, even when the episode fires elsewhere.
   The coaching path (:func:`~.attribute.attribute` / :func:`~.engine.tally_attributions`)
   short-circuits at the first matching classifier and collapses the rest — that is
   correct and cheap for coaching (ADR 0007). This module runs a *separate*, full
   classifier sweep per anchor so nothing is collapsed; it never touches
   ``attribute()``'s cost. (This is why the ADR-0019 "``attribute()`` stops
   discarding" contract lives in a sibling module, not by bloating the hot function.)
2. **Five distinct anchor states**: ``fired`` (the episode's driver), ``outranked``
   (a classifier matched here but an earlier anchor became the driver — the
   attribution-layer consequence ADR 0009 keeps off the ``Verdict``), ``near_miss``
   (``matched=False`` with a loud :class:`~...classifiers.evidence.SilenceReason`),
   ``clean`` (nothing to flag), ``no_data`` (too sparse to judge).
3. **All classifier verdicts per anchor**, never the most-specific one — a late meal
   bolus on a prior carb bolus shows both ``owned_by_prior_bolus`` and the retained
   carb-undercount near-miss. Most-specific-wins (ADR 0009) is a coaching-layer
   surfacing rule and does not bind this debug feed.
4. **Its own per-day feed** — ``/model-view?date=YYYY-MM-DD`` (api.py), not a flag on
   ``/scenarios``.

Day assignment (the deferred ADR-0019 question, settled by the locked mockup): a
spanning episode renders on the day it **resolves** (``episode.end``'s calendar day),
with the prior-day lead-in shown; ``spans_midnight`` marks it — true only when a real
anchor lands after midnight, not merely because the window's cap pushed ``end`` past
00:00 (#280).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date as date_cls
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

from ...carbs import carb_log_exclusion_spans
from ...events import BasalEvent, BolusEvent, CgmReading
from ..classifiers import (
    classify_carb_undercount,
    classify_correction_on_iob,
    classify_late_bolus,
    classify_meal_bolus_short,
    classify_missed_meal,
)
from ..classifiers.evidence import EvidenceTier, SilenceReason
from ..scenario_config import ScenarioConfig
from .anchors import Anchor, AnchorKind, collect_anchors
from .meal_suspend import classify_meal_owned_suspend
from .attribute import (
    LowPromptAnswer,
    _correction_lever,
    _nadir_at,
    _over_treated_text,
    attribute,
    match_low_answer,
    over_treated_rebound,
    split_caused_over_treatments,
)
from .levers import Lever
from .segment import segment, split_double_humps, split_low_rebounds
from .severity import worst_bg

_FMT = "%Y-%m-%d %H:%M:%S"

# Context pad handed to each anchor's classifiers so their look-back/ahead (IOB a
# full DIA, digestion 150 min, correction low-scan 4 h) reaches outside the tight
# episode bounds. Mirrors engine._CONTEXT_PAD_MIN so the verdicts match the build.
_CONTEXT_PAD_MIN = 300.0

# Display pad around a day's episodes for the floating chart window.
_WINDOW_PAD_MIN = 15.0

# Reasons that do NOT make an anchor a near-miss (a genuinely clean opportunity, or
# unjudgeable). Everything else in the closed taxonomy is a "loud" near-miss reason —
# the invisible under-threshold / recovery-masked misses this view exists to surface.
_CALM_REASONS = frozenset({SilenceReason.NO_TRIGGER, SilenceReason.INSUFFICIENT_DATA})

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


@dataclass(frozen=True)
class AnchorVerdict:
    """One classifier's judgment of one anchor, retained regardless of firing (ADR 0019).

    The debug counterpart to a coaching :class:`~...classifiers.evidence.Verdict`: it
    additionally names *which* classifier produced it, so the view can list every
    detector that looked at an anchor, not just the one the coaching layer surfaced.
    """

    classifier: str
    matched: bool
    detail: str
    evidence_tier: EvidenceTier
    silence_reason: Optional[SilenceReason]
    suspend_start: Optional[datetime] = None
    suspend_end: Optional[datetime] = None

    def to_dict(self) -> dict:
        payload = {
            "classifier": self.classifier,
            "matched": self.matched,
            "detail": self.detail,
            "evidence_tier": self.evidence_tier.value,
            "silence_reason": self.silence_reason.value if self.silence_reason else None,
        }
        if self.suspend_start is not None:
            payload["suspend_start"] = _fmt(self.suspend_start)
        if self.suspend_end is not None:
            payload["suspend_end"] = _fmt(self.suspend_end)
        return payload


def _mv(classifier: str, verdict) -> AnchorVerdict:
    """Wrap a classifier :class:`Verdict` as an :class:`AnchorVerdict` under ``classifier``."""
    return AnchorVerdict(
        classifier=classifier,
        matched=verdict.matched,
        detail=verdict.detail,
        evidence_tier=verdict.evidence_tier,
        silence_reason=None if verdict.matched else verdict.silence_reason,
    )


def _meal_verdicts(
    anchor: Anchor,
    cgm: Sequence[CgmReading],
    basal: Sequence[BasalEvent],
    bolus: Sequence[BolusEvent],
    *,
    isf: Optional[float],
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> List[AnchorVerdict]:
    """Every meal-anchor classifier, in precedence order, none collapsed.

    Mirrors :func:`~.attribute._meal_lever`'s roster (carb-undercount ▸ late-bolus ▸
    meal-over-delivery) but runs all three and keeps each verdict. Meal-over-delivery
    uses the same ADR 681 ownership and selection module as attribution, so its match
    and selected suspend identity cannot drift from the lever.
    """
    meal = anchor.bolus
    assert meal is not None
    cu = classify_carb_undercount(
        meal, cgm, basal, bolus, isf=isf,
        scenario_config=scenario_config,
    )
    lb = classify_late_bolus(meal, cgm, basal, bolus, scenario_config=scenario_config)
    sv = classify_meal_owned_suspend(
        meal, bolus, cgm, basal, scenario_config=scenario_config
    )
    mod_matched = sv.matched
    over_delivery = AnchorVerdict(
        classifier="meal_over_delivery",
        matched=mod_matched,
        detail=sv.detail,
        evidence_tier=sv.evidence_tier,
        silence_reason=(
            None
            if mod_matched
            else (sv.silence_reason or SilenceReason.NO_TRIGGER)
        ),
        suspend_start=sv.suspend_start,
        suspend_end=sv.suspend_end,
    )
    return [_mv("carb_undercount", cu), _mv("late_bolus", lb), over_delivery]


def _low_verdicts(
    anchor: Anchor,
    cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    basal: Sequence[BasalEvent],
    *,
    scenario_config: ScenarioConfig,
    low_answers: Sequence[LowPromptAnswer],
) -> List[AnchorVerdict]:
    """Every low-anchor read: over-treated-low and correction-on-IOB.

    Mirrors :func:`~.attribute._low_lever`. Over-treated-low is inline attribution logic
    rather than a classifier, so it is synthesized from the shared
    :func:`~.attribute.over_treated_rebound` scan and emitted only when it fires (it is
    never a near-miss). A refuted low ('no' answer) or a crash already split into its own
    high-moment (#155) suppresses it, exactly as the lever does.
    """
    out: List[AnchorVerdict] = []

    nadir = anchor.bg if anchor.bg is not None else _nadir_at(cgm, anchor.t)
    answer = match_low_answer(low_answers, anchor.t)
    refuted = answer is not None and answer.answer == "no"
    if not anchor.over_treatment_split_off and not refuted:
        rebound = over_treated_rebound(
            cgm, anchor.t, nadir, bolus, scenario_config=scenario_config,
        )
        if rebound is not None:
            out.append(AnchorVerdict(
                classifier="over_treated_low",
                matched=True,
                detail=_over_treated_text(nadir, rebound.peak),
                evidence_tier=EvidenceTier.INFERRED,
                silence_reason=None,
            ))

    out.append(_mv("correction_on_iob",
                   classify_correction_on_iob(
                       anchor.t, nadir, cgm, bolus, basal,
                       scenario_config=scenario_config)))
    return out


def _high_verdicts(
    anchor: Anchor,
    cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    basal: Sequence[BasalEvent],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> List[AnchorVerdict]:
    """A high anchor's read: over-treated-low for a split rebound high-moment, else the
    two rise judgments.

    Mirrors :func:`~.attribute._high_lever`: a synthesized rebound HIGH (#155,
    ``rebound_nadir_bg`` set) is the over-correction and reads over-treated-low; a real
    HIGH run reads missed-meal AND meal-bolus-fell-short (#63), both anchored at the rise
    onset (``reach_start``). Both are swept even though at most one can match, because
    the model view reports every judgment made about an anchor, matched or not — that is
    what makes a silence legible.
    """
    if anchor.rebound_nadir_bg is not None:
        return [AnchorVerdict(
            classifier="over_treated_low",
            matched=True,
            detail=_over_treated_text(anchor.rebound_nadir_bg, anchor.bg),
            evidence_tier=EvidenceTier.INFERRED,
            silence_reason=None,
        )]
    return [
        _mv("missed_meal",
            classify_missed_meal(
                anchor.reach_start, cgm, bolus, basal,
                scenario_config=scenario_config)),
        _mv("meal_bolus_short",
            classify_meal_bolus_short(
                anchor.reach_start, cgm, bolus, basal,
                scenario_config=scenario_config)),
    ]


def _anchor_verdicts(
    anchor: Anchor,
    cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    basal: Sequence[BasalEvent],
    *,
    isf: Optional[float],
    scenario_config: ScenarioConfig,
    low_answers: Sequence[LowPromptAnswer],
    correction: Tuple[Optional[tuple], Optional[object]],
    is_last_correction: bool,
) -> List[AnchorVerdict]:
    """All verdicts for one anchor, dispatched by kind (SUSPEND anchors carry none)."""
    if anchor.kind is AnchorKind.MEAL:
        return _meal_verdicts(
            anchor, cgm, basal, bolus, isf=isf,
            scenario_config=scenario_config,
        )
    if anchor.kind is AnchorKind.LOW:
        return _low_verdicts(
            anchor, cgm, bolus, basal,
            scenario_config=scenario_config, low_answers=low_answers,
        )
    if anchor.kind is AnchorKind.HIGH:
        return _high_verdicts(anchor, cgm, bolus, basal, scenario_config=scenario_config)
    if anchor.kind is AnchorKind.CORRECTION:
        result, silence = correction
        if (
            result is not None
            and len(result) > 3
            and anchor.bolus is not None
            and result[3][1] == anchor.bolus.seq_num
        ):
            # The stacking dose the cluster attributes at — a matched verdict here.
            return [AnchorVerdict(
                classifier="correction_stacking", matched=True,
                detail=result[1].text, evidence_tier=result[1].evidence_tier,
                silence_reason=None,
            )]
        if silence is not None and is_last_correction:
            return [_mv("correction_stacking", silence)]
        return []
    return []  # SUSPEND: no classifier runs on a suspend anchor


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
    if attr.lever is None:
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
) -> dict:
    """One episode's model-view record: attribution + every anchor's every verdict + state."""
    start = ep_anchors.start
    end = ep_anchors.end
    ctx_start = start - timedelta(minutes=_CONTEXT_PAD_MIN)
    ctx_end = end + timedelta(minutes=_CONTEXT_PAD_MIN)
    ctx_cgm = _slice(cgm, ctx_start, ctx_end)
    ctx_bolus = _slice(bolus, ctx_start, ctx_end)
    ctx_basal = _slice(basal, ctx_start, ctx_end)

    attr = attribute(
        ep_anchors, ctx_cgm, ctx_bolus, ctx_basal,
        isf=isf,
        scenario_config=scenario_config, low_answers=low_answers,
    )
    # The correction cluster is judged once for the whole episode (it needs the pair).
    correction = _correction_lever(
        ep_anchors.anchors, ctx_cgm, ctx_basal, scenario_config=scenario_config
    )
    corr_anchor_ts = [a.t for a in ep_anchors.anchors if a.kind is AnchorKind.CORRECTION]
    last_corr_t = corr_anchor_ts[-1] if corr_anchor_ts else None

    ordered = sorted(ep_anchors.anchors, key=lambda a: a.t)
    anchor_dicts = []
    for a in ordered:
        verdicts = _anchor_verdicts(
            a, ctx_cgm, ctx_bolus, ctx_basal,
            isf=isf,
            scenario_config=scenario_config, low_answers=low_answers,
            correction=correction, is_last_correction=(a.t == last_corr_t),
        )
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
) -> dict:
    """The per-day model-view payload for ``target`` — the pure core (event lists in, dict out).

    Runs the same anchor → segment → split pipeline the scenario engine does (so the
    episodes and their split rebound high-moments match), attributes each, and for every
    anchor collects *every* classifier verdict + its state. Episodes are assigned to the
    calendar day they **resolve** on (``end``'s date); an episode with a real anchor
    after midnight marks ``spans_midnight`` and its prior-day lead-in rides the window
    so the chart shows it.
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
            cgm_readings, scenario_config=scenario_config,
        ),
        cgm_readings, bolus_events, basal_events,
        isf=isf,
        scenario_config=scenario_config, low_answers=low_answers,
    )

    episodes: List[dict] = []
    for idx, ep_anchors in enumerate(ep_anchor_groups):
        if ep_anchors.end.date() != target:
            continue
        episodes.append(_build_episode_view(
            idx, ep_anchors, cgm_readings, bolus_events, basal_events,
            isf=isf,
            scenario_config=scenario_config, low_answers=low_answers,
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

    day = assemble_model_view(
        bolus, cgm, basal,
        target=target, isf=isf, low_answers=low_answers,
    )

    # Carb-log exclusion spans over the assembled window — the Day surface reads
    # these to tag a low that was arrested by rescue carbs ("⤴ rescued", the
    # pre-empted-low chart tag; ADR 0012/0027). Computed the same way the
    # /timeline daily report does, then clamped to the window it actually shows.
    win_start = datetime.strptime(day["window"]["start"], _FMT)
    win_end = datetime.strptime(day["window"]["end"], _FMT)
    excl = carb_log_exclusion_spans(store.carb_entries(win_start, win_end))
    day["window"]["carb_exclusion_spans"] = [
        {"start": _fmt(max(lo, win_start)), "end": _fmt(min(hi, win_end))}
        for lo, hi in excl
        if lo < win_end and hi > win_start
    ]
    # False-low excursion spans (#381), clamped to the shown window: the Day chart
    # greys these (still drawn) as sensor artifacts with an undo, matching /timeline.
    day["window"]["false_low_exclusion_spans"] = [
        {"anchor_t": _fmt(rec["anchor_t"]),
         "start": _fmt(max(rec["start"], win_start)), "end": _fmt(min(rec["end"], win_end))}
        for rec in fl_records
        if rec["start"] < win_end and rec["end"] > win_start
    ]
    return {"isf": isf, **day}
