"""Lever attribution — one lever per episode, root-cause-by-time (#70 §2).

This is the dedup that turns *three* honest-but-local classifier flags on one
dinner into *one* attributed episode. The rule:

    **The episode's lever is its earliest _actionable_ driver.** Co-occurring
    behaviors at later anchors are narrated as _consequences_ of that lever, not
    as competing flags.

Mechanically: walk the episode's anchors in time order, ask each anchor's
classifier(s) whether an actionable lever fires there, and take the **first**
anchor that yields one as the episode's lever (the trigger). Every *other* matched
classifier in the episode becomes a hedged consequence :class:`Step`, so the story
still reads ("...then Control-IQ suspended basal... then the tail looked like a
fresh meal...") without minting a second pattern.

The taxonomy table (#70 §2), by anchor kind → shape → lever:

* **meal** → carb-undercount (ran away high) ▸ late-bolus (dosed into a real
  rise) ▸ meal-over-delivery (crashed/suspended into a near-low).
* **low** → over-treated-low (rescued into a rebound high) ▸ correction-on-IOB
  (a lone correction on live insulin drove a low, #150).
* **correction cluster** → correction-stacking (stacked onto IOB, not chasing a
  runaway, drove a later low).
* **high** → missed / unannounced meal (a meal-shaped rise with no bolus) ▸
  meal-bolus-fell-short (a rise that kept climbing past a counted meal bolus and
  needed a correction behind it, #63).

An episode where nothing actionable fires gets **no lever** and does not surface
(#70: a habit tool, not an alerts inbox).

Every step carries an :class:`EvidenceTier`; inferences are hedged, never asserted
(carbs stay invisible, ADR 0003).
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from typing import List, Optional, Sequence

from ...events import BasalEvent, BolusEvent, CgmReading
from ..classifiers import (
    Verdict,
    classify_carb_undercount,
    classify_correction_on_iob,
    classify_correction_stacking,
    classify_late_bolus,
    classify_meal_bolus_short,
    classify_missed_meal,
)
from ..classifiers.evidence import EvidenceTier
from ..scenario_config import ScenarioConfig
from .anchors import Anchor, AnchorKind
from .levers import Lever
from .meal_suspend import classify_meal_owned_suspend
from .payload import Step, event_ref, window_ref
from .segment import (
    EpisodeAnchors,
    GuardedRebound,
    guarded_rebound,
    recovery_dip,
)

# The return-to-range target and the #155 split context pad live on
# ``ScenarioConfig`` (the ``attribute_*`` fields). The over-treated bar reads
# ``segment_rebound_high_mgdl`` / ``segment_range_high_mgdl`` and the low line
# ``gate_low_mgdl``.

# --- Low-prompt answers → over-treated-low evidence tier (#129 / ADR 0008, #400) --

# Match a stored low-prompt answer to a nadir by the established anchor tolerance
# (mirrors ``pending_prompts.ANCHOR_TOLERANCE`` — the 10-min ``(detector, anchor_t)``
# match the queue and ``store.clear_prompt_response`` already use). Not imported from
# that module to avoid a scenario-package import cycle; the value is the shared one.
_LOW_ANSWER_TOLERANCE = timedelta(minutes=10)


@dataclass(frozen=True)
class LowPromptAnswer:
    """A user's answer to a "did you treat this low?" prompt, matched to a nadir (#129).

    The seam that carries ``store.prompt_responses()`` (``detector == "low"``) into
    over-treated-low attribution — the answer the shape-only lever never saw (ADR 0005).
    Plain data so :func:`~.engine.assemble` stays store-free and unit-testable; the
    store-facing :func:`~.engine.build_scenarios` builds these from the response rows.

    * ``anchor_t`` — the nadir the prompt was about (``prompt_responses.anchor_t``).
    * ``answer`` — ``"carbs"`` (confirmed → upgrade to OBSERVED + citation), ``"no"``
      (refuted → the over-treated-low step is not minted at all), or ``"not-sure"``
      (abstain → unchanged, stays INFERRED).
    * ``carb_t`` / ``carb_grams`` — the logged low-prompt :class:`~...events.CarbEntry`
      a ``"carbs"`` answer created (its instant, for the citation, and its grams, to
      report what was logged). ``None`` for ``no`` / ``not-sure`` / an
      unknown-certainty entry.
    * ``answered_at`` — when the answer became *known* (``prompt_responses.answered_at``).
      A rolling Outcomes window may only read an answer recorded by its own endpoint
      (#467), so a ``no`` / ``not-sure`` / ``carbs`` answer logged after a historical
      window closed must not retroactively reclassify that window's behavior. ``None``
      for hand-built fixtures, which fall back to ``anchor_t``. The ``false-low`` reading
      invalidation is exempt — it corrects a CGM claim and applies to every read.
    """

    anchor_t: datetime
    answer: str
    carb_t: Optional[datetime] = None
    carb_grams: Optional[float] = None
    answered_at: Optional[datetime] = None


def match_low_answer(
    low_answers: Sequence[LowPromptAnswer], nadir_t: datetime
) -> Optional[LowPromptAnswer]:
    """The nearest low-prompt answer within :data:`_LOW_ANSWER_TOLERANCE` of ``nadir_t``.

    Anchor identity is ``(detector="low", anchor_t)`` with the 10-min tolerance the
    queue uses (anchors are recomputed live, so an exact match would miss a drifted
    answer). Nearest wins when two answers fall inside the window. ``None`` when the
    nadir is unanswered — the caller then keeps today's shape-only INFERRED behavior.
    """
    tol = _LOW_ANSWER_TOLERANCE.total_seconds()
    best: Optional[tuple] = None
    for a in low_answers:
        d = abs((a.anchor_t - nadir_t).total_seconds())
        if d <= tol and (best is None or d < best[0]):
            best = (d, a)
    return best[1] if best else None


def _confirmed_over_treated_text(
    nadir: Optional[float], peak: float, logged_g: Optional[float]
) -> str:
    """The OBSERVED (confirmed-carbs) over-treated-low beat — logged fact + coaching (#400).

    The eaten side is the logged grams (never shape-inferred, ADR 0008 §1). The
    coaching side carries **no** computed gram target: ``IOB × I:C`` is not a validated
    rescue-carb prescription and a personalized "needed" amount would be dosing advice
    we cannot ground (ADR 400 supersedes ADR 0008 §2/§4). Instead we report what
    happened and point back to the person's own plan: "follow your usual low-treatment
    plan and recheck in ~15 min before treating again" (ADA 2026 / ISPAD 2022 both
    advise reassessing after 15 minutes).
    """
    crash = (
        f"BG bottomed at {nadir:.0f} mg/dL, then rebounded to {peak:.0f} mg/dL"
        if nadir is not None
        else f"a low rebounded to {peak:.0f} mg/dL"
    )
    logged = (
        f"logged {logged_g:.0f} g"
        if logged_g is not None
        else "carbs logged"
    )
    return (
        f"{crash} — {logged}; follow your usual low-treatment plan and recheck "
        "in ~15 min before treating again"
    )


def _over_treated_step(
    t: datetime,
    nadir: Optional[float],
    peak: float,
    answer: Optional[LowPromptAnswer],
) -> Step:
    """The over-treated-low trigger :class:`Step`, tiered by the matched low answer (#129).

    Shared by the unsplit (:func:`_low_lever`) and split-high-moment
    (:func:`_high_lever`) mint sites so the two never diverge. A ``carbs`` answer
    upgrades Inferred → **Observed** and cites the logged carb entry; the beat reports
    the nadir, rebound, and logged grams, then points back to the person's own
    low-treatment plan (no computed gram target — ADR 400). Any other case
    (``not-sure`` / no matching answer) keeps ADR 0005's shape-only INFERRED beat. (A
    ``no`` answer never reaches here — the caller suppresses the whole step.)
    """
    if answer is None or answer.answer != "carbs":
        return Step(t=t, text=_over_treated_text(nadir, peak),
                    evidence_tier=EvidenceTier.INFERRED)
    refs = [event_ref(answer.carb_t)] if answer.carb_t is not None else []
    return Step(
        t=t,
        text=_confirmed_over_treated_text(nadir, peak, answer.carb_grams),
        evidence_tier=EvidenceTier.OBSERVED,
        cited_event_refs=refs,
    )


def over_treated_rebound(
    cgm: Sequence[CgmReading],
    nadir_t: datetime,
    nadir_bg: Optional[float],
    bolus: Sequence[BolusEvent],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Optional[GuardedRebound]:
    """The guarded rebound iff this low was over-treated, else ``None`` (#104/#112/#400).

    The single decision point for "did this low rebound past the over-treated bar?",
    shared by the over-treated-low label (:func:`_low_lever`) and the #155 split gate
    (:func:`split_caused_over_treatments`) so the anchor and the label read the *same*
    guarded scan and can never disagree (the #149 no-divergence invariant). Applies the
    tiered rebound bar (#112 — ADR-0005 ≥160 for a sub-70 nadir, ≥180 for a near-low).
    Classification is by the observed low→rebound shape alone: residual bolus IOB does
    **not** move the bar (#400 / ADR 400 removed the unsupported ``IOB × (ISF/I:C)``
    credit — it was labelled mg/dL but was dimensionally neither mg/dL nor grams).
    Returns the :class:`GuardedRebound` (peak / peak_t / terminal) when the peak clears
    the bar, else ``None``.
    """
    rebound = guarded_rebound(
        cgm, nadir_t,
        stop_at=_next_meal_bolus_t(bolus, nadir_t, scenario_config=scenario_config),
        scenario_config=scenario_config,
    )
    if rebound.peak is None:
        return None
    rebound_bar = (
        scenario_config.segment_range_high_mgdl
        if (nadir_bg is not None and nadir_bg > scenario_config.gate_low_mgdl)
        else scenario_config.segment_rebound_high_mgdl
    )
    return rebound if rebound.peak >= rebound_bar else None


def _next_meal_bolus_t(
    bolus: Sequence[BolusEvent],
    nadir_t: datetime,
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Optional[datetime]:
    """The first carb-tagged meal bolus after a low's nadir, if any.

    A substantial meal bolus is an explicit new food story. The low's rebound can
    still fire up to that instant, but readings after it belong to the meal, not the
    low treatment. Small 15 g-ish carb entries are left alone because those can be
    the fast-carb treatment the over-treated-low signal is trying to judge.
    """
    meals = [
        b.t for b in bolus
        if (
            b.t > nadir_t
            and b.carbs is not None
            and b.carbs >= scenario_config.segment_rebound_stop_meal_min_carbs
        )
    ]
    return min(meals) if meals else None


def _over_treated_text(nadir: Optional[float], peak: float) -> str:
    """The over-treated-low beat text — crash → rebound (ADR 0003: the rebound is
    observed, "over-treated" is the hedged inference)."""
    if nadir is not None:
        return (
            f"BG bottomed at {nadir:.0f} mg/dL, then rebounded to {peak:.0f} mg/dL — "
            "the low was likely over-treated with fast carbs"
        )
    return f"a low rebounded to {peak:.0f} mg/dL — likely over-treated"


@dataclass(frozen=True)
class Attribution:
    """The result of attributing a lever to one episode.

    * ``lever`` — the single attributed lever, or ``None`` when nothing actionable
      fired (the episode does not surface).
    * ``trigger`` — a short human label for the anchor that drove the lever
      (e.g. ``"meal"``, ``"low"``).
    * ``trigger_t`` — when that driving anchor happened.
    * ``steps`` — the ordered narrative: the driver's step first, then hedged
      consequence steps for the co-occurring behaviors.
    * ``silence`` — when ``lever is None``, the retained non-firing :class:`Verdict`
      of the episode's most-specific classifier, so a caller can read *why* the
      episode stayed silent (its :class:`~...classifiers.evidence.SilenceReason` +
      ``detail``) without re-running the classifiers (ADR 0009, #152/#157). ``None``
      whenever a lever fired (a silence reason is meaningless then).
    * ``rebound_end`` — for an ``OVER_TREATED_LOW`` lever, the guarded rebound scan's
      terminal (:class:`~...segment.GuardedRebound`): the instant the rebound excursion
      resolves. The engine extends the episode's scored span to it so severity /
      ``worst_bg`` / the window cover the whole excursion — the climb past range and the
      decline back down — not just the anchor-bounded near-low run (#124 / ADR 0010).
      ``None`` for every other lever (and when the scan found no rebound).
    """

    lever: Optional[Lever]
    trigger: str
    trigger_t: datetime
    steps: List[Step]
    silence: Optional[Verdict] = None
    rebound_end: Optional[datetime] = None
    correction_pair: Optional[tuple[int, int]] = None
    driver_anchor: Optional[Anchor] = None


# Each ``_*_lever`` helper returns ``(lever_result, silence)``: the ``(lever, step)``
# tuple when its ladder fired (``silence`` is then ``None`` — irrelevant), else
# ``(None, verdict)`` where ``verdict`` is the non-firing :class:`Verdict` of the
# anchor's **most-specific** classifier (the top of its priority ladder). That
# retained verdict is what :func:`attribute` exposes as the episode's silence reason
# when nothing actionable fires (ADR 0009). Returning it never changes which lever
# fires — the ``matched`` checks are untouched.
def _meal_lever(
    anchor: Anchor,
    cgm: Sequence[CgmReading],
    basal: Sequence[BasalEvent],
    bolus: Sequence[BolusEvent] = (),
    *,
    isf: Optional[float],
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> tuple[Optional[tuple], Optional[Verdict]]:
    """Attribute a meal anchor to a lever by shape precedence.

    Precedence (earliest-actionable within the meal itself): carb-undercount (the
    meal ran away high) beats late-bolus (dosed into a real rise) beats
    meal-over-delivery (crashed / suspended into a near-low). Returns
    ``((lever, driver_step), None)`` when one fires, else ``(None, cu)`` — the
    carb-undercount verdict is the meal's most-specific non-firing reason.

    ``bolus`` is the day's bolus sequence, passed to the late-bolus classifier so it
    can suppress a meal dosed into a rise already owned by a recent completed carb
    bolus (#167); it never changes which lever fires above late-bolus.
    """
    meal = anchor.bolus
    assert meal is not None

    cu = classify_carb_undercount(
        meal, cgm, basal, bolus, isf=isf,
        scenario_config=scenario_config,
    )
    if cu.matched:
        return (Lever.CARB_UNDERCOUNT, _step(meal.t, cu)), None

    lb = classify_late_bolus(meal, cgm, basal, bolus, scenario_config=scenario_config)
    if lb.matched:
        return (Lever.LATE_BOLUS, _step(meal.t, lb)), None

    # Meal over-delivery: ADR 681 assigns later suspend episodes to one Meal, then
    # judges each candidate at its own suspend start through the unchanged classifier.
    sv = classify_meal_owned_suspend(
        meal, bolus, cgm, basal, scenario_config=scenario_config
    )
    if sv.matched:
        return (Lever.MEAL_OVER_DELIVERY, _step(meal.t, sv)), None

    return None, cu


def _low_lever(
    anchor: Anchor,
    cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    basal: Sequence[BasalEvent] = (),
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    low_answers: Sequence[LowPromptAnswer] = (),
) -> tuple[Optional[tuple], Optional[Verdict]]:
    """Attribute a low anchor: over-treated low or correction-on-IOB.

    Ordered by earliest-actionable precedence (spec #150 §3):

    1. Over-treated low — the low rebounded into a high within the guarded post-nadir
       scan (:func:`~...segment.guarded_rebound_peak`, #149).
    2. **Correction-on-IOB (#150)** — a lone user correction dropped onto insulin
       still working that drove this sub-70 low (the ``n=1`` sibling of
       ``correction_stacking``, back-scanned from the nadir). It never preempts an
       over-treated low.

    Returns ``((lever, driver_step[, rebound_end]), None)`` when one fires, else
    ``(None, silence)``: correction-on-IOB's non-firing verdict (over-treated-low is
    inline attribution logic, not a classifier, so it carries no verdict to surface). The over-treated-low
    result carries a third element — the guarded scan's ``terminal`` — so the engine
    can extend the episode's scored span to the rebound's resolution (#124).

    Over-treated-low classification is by the observed low→rebound shape alone (#400):
    residual bolus IOB no longer moves the rebound bar. ``basal`` feeds the #150
    recovery guard (the shared context gate needs it to see a defensive suspend).
    """
    # Over-treated low: the low rebounded into a high within the guarded post-nadir scan
    # (#104 / ADR 0005 / #149 / #112 / #400) — the tiered bar lives in the shared
    # :func:`over_treated_rebound`, so the anchor a #155 split emits and this label
    # read the same scan (no divergence). The scan catches rebounds that peak after the
    # low run's episode closes, capping at the first settled recovery / re-dip / gap so a
    # later unrelated meal can't masquerade as the rebound. The low is observed;
    # "over-treated" (rescue carbs) is an inference (ADR 0003).
    #
    # Skipped when the over-treatment has been split into its own high-moment (#155):
    # the low keeps only its *own* cause (correction-on-IOB below) and
    # the rebound is scored on the high-moment, so this must not also claim it here.
    nadir = anchor.bg if anchor.bg is not None else _nadir_at(cgm, anchor.t)
    # The low-prompt answer for this nadir (#129): 'no' rejects the over-treated-low
    # finding outright (the user says they didn't eat — who are we to call it an
    # over-treatment?), so the step is not minted and the low falls through to its own
    # cause; 'carbs' upgrades it to Observed and cites the logged entry;
    # 'not-sure' / unanswered keeps ADR 0005's shape-only Inferred beat.
    answer = match_low_answer(low_answers, anchor.t)
    refuted = answer is not None and answer.answer == "no"
    if not anchor.over_treatment_split_off and not refuted:
        rebound = over_treated_rebound(
            cgm, anchor.t, nadir, bolus, scenario_config=scenario_config,
        )
        if rebound is not None:
            return (
                Lever.OVER_TREATED_LOW,
                _over_treated_step(anchor.t, nadir, rebound.peak, answer),
                rebound.terminal,
            ), None

    # Correction-on-IOB (#150): fires only after over-treated-low has passed. Back-scans
    # from this nadir for the single
    # user correction that landed on live IOB. ``nadir`` is the sub-70 outcome the
    # classifier gates on (near-lows are rejected inside it).
    coi = classify_correction_on_iob(
        anchor.t, nadir, cgm, bolus, basal, scenario_config=scenario_config
    )
    if coi.matched:
        return (Lever.CORRECTION_ON_IOB, _step(anchor.t, coi)), None

    return None, coi


def _correction_lever(
    anchors: Sequence[Anchor],
    cgm: Sequence[CgmReading],
    basal: Sequence[BasalEvent],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> tuple[Optional[tuple], Optional[Verdict]]:
    """Attribute the episode's user-correction cluster to correction-stacking.

    Passes *all* the episode's correction boluses to the classifier (it finds the
    stacked pair, gates the runaway chase, and outcome-gates on a later low).
    Returns ``((lever, driver_step, stack_t), None)`` when it fires, else
    ``(None, cs)`` — the correction-stacking verdict is the cluster's silence reason
    (or ``(None, None)`` when there aren't two corrections to judge).
    """
    corrections = [a.bolus for a in anchors if a.kind is AnchorKind.CORRECTION and a.bolus]
    if len(corrections) < 2:
        return None, None
    cs = classify_correction_stacking(corrections, cgm, basal, scenario_config=scenario_config)
    if cs.matched and cs.stack_t is not None:
        return (
            Lever.CORRECTION_STACKING,
            _step(cs.stack_t, cs),
            cs.stack_t,
            (cs.previous_seq_num, cs.second_seq_num),
        ), None
    return None, cs


def _high_lever(
    anchor: Anchor,
    cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    basal: Sequence[BasalEvent],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    low_answers: Sequence[LowPromptAnswer] = (),
) -> tuple[Optional[tuple], Optional[Verdict]]:
    """Attribute a high anchor to missed / unannounced meal.

    Anchors the missed-meal classifier at the run's *start* (``anchor.reach_start``,
    the rise onset) rather than ``anchor.t`` (the HIGH-run *peak*), so its digestion
    lookback is measured from where the climb began, not where it topped out. A
    150-min lookback from the peak can just clear a real meal that a lookback from
    the onset would see — a same-evening missed-meal case (#118). The matched step carries
    the digestion window as a ``cited_window`` span so the chart shades what was
    scanned.

    When missed-meal declines because a **counted meal bolus** already announced the
    rise, the rise is handed to :func:`~...classifiers.meal_bolus_short.classify_meal_bolus_short`
    (#63), which asks the next question: was that announcement enough? It matches only
    when a correction was needed behind the dose, and it claims a shortfall, never a
    carb count. The two split one population at exactly one line, so at most one of
    them can ever fire on a given rise.

    Returns ``((lever, driver_step), None)`` when either fires, else ``(None, mm)`` —
    the missed-meal verdict remains the high's silence reason, because it is the more
    general judgment and every unattributed high already reports it.

    A **rebound high-moment** (the synthesized anchor of a #155 split, marked with
    ``rebound_nadir_bg``) is the exception: it is the over-correction the crash
    rebounded into, so it attributes ``over_treated_low`` — not missed-meal. The split
    gate (:func:`over_treated_rebound`) already applied the tiered bar, so this just
    carries the decided lever, the crash → rebound text, and the guarded terminal
    (``reach_end``) the engine scores the climb over (#124).
    """
    if anchor.rebound_nadir_bg is not None:
        # The split high-moment (#129): re-match the crash nadir's low-prompt answer so
        # the over-correction beat upgrades / cites exactly as an unsplit over-treated
        # low would. The split gate already dropped a refuted ('no') low, so any answer
        # reaching here is 'carbs' / 'not-sure' / unanswered.
        nadir_t = anchor.rebound_nadir_t if anchor.rebound_nadir_t is not None else anchor.t
        answer = match_low_answer(low_answers, nadir_t)
        return (
            Lever.OVER_TREATED_LOW,
            _over_treated_step(anchor.t, anchor.rebound_nadir_bg, anchor.bg, answer),
            anchor.reach_end,
        ), None

    onset = anchor.reach_start
    mm = classify_missed_meal(onset, cgm, bolus, basal, scenario_config=scenario_config)
    if mm.matched:
        cited_window = (
            window_ref(mm.digestion_window_start, onset)
            if mm.digestion_window_start is not None
            else None
        )
        return (Lever.MISSED_MEAL, Step(
            t=onset, text=mm.detail, evidence_tier=mm.evidence_tier,
            cited_window=cited_window,
        )), None

    mbs = classify_meal_bolus_short(
        onset, cgm, bolus, basal, scenario_config=scenario_config
    )
    if mbs.matched:
        cited_window = (
            window_ref(mbs.digestion_window_start, onset)
            if mbs.digestion_window_start is not None
            else None
        )
        return (Lever.MEAL_BOLUS_SHORT, Step(
            t=onset, text=mbs.detail, evidence_tier=mbs.evidence_tier,
            cited_window=cited_window,
        )), None
    return None, mm


def _step(t: datetime, verdict: Verdict) -> Step:
    """Turn a classifier verdict into a narrative :class:`Step` (its detail + tier)."""
    return Step(t=t, text=verdict.detail, evidence_tier=verdict.evidence_tier)


def _nadir_at(cgm: Sequence[CgmReading], t: datetime) -> Optional[float]:
    # Nearest reading's value — a fallback when the anchor carries no bg.
    near = [(abs((r.t - t).total_seconds()), r.bg) for r in cgm if r.bg is not None]
    return min(near)[1] if near else None


def _trigger_label(kind: AnchorKind, lever: Lever) -> str:
    if kind is AnchorKind.MEAL:
        return "meal"
    if kind is AnchorKind.LOW:
        return "low"
    if kind is AnchorKind.CORRECTION:
        return "correction cluster"
    if kind is AnchorKind.HIGH:
        return "high"
    return kind.value


def attribute(
    episode: EpisodeAnchors,
    cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    basal: Sequence[BasalEvent] = (),
    *,
    isf: Optional[float] = None,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    low_answers: Sequence[LowPromptAnswer] = (),
) -> Attribution:
    """Attribute one lever to ``episode``, root-cause-by-time.

    Walks the episode's anchors in time order; the **first** anchor that yields an
    actionable lever wins (the trigger). Every *later* matched classifier in the
    episode is appended as a hedged consequence :class:`Step`, so co-occurring
    behaviors are narrated, not re-flagged — the dedup at the heart of #70.

    ``cgm`` / ``bolus`` / ``basal`` should span at least the episode plus the
    classifiers' own look-back/ahead (the engine passes a padded slice). ``isf``
    feeds the carb-undercount classifier; the meal's I:C comes from its Dose-stamped
    ``BolusEvent.carb_ratio``. Over-treated-low classification is shape-only (#400) —
    it reads neither ISF/I:C nor residual IOB.

    Returns an :class:`Attribution`; ``lever is None`` means the episode resolved
    with no actionable behavior and must not surface.
    """
    driver: Optional[tuple] = None       # (lever, trigger_kind, trigger_t, driver_step, anchor)
    # The guarded rebound scan's terminal for the winning driver, when it is an
    # over-treated low — threaded up so the engine scores the whole excursion (#124).
    rebound_end: Optional[datetime] = None
    correction_pair: Optional[tuple[int, int]] = None
    consequences: List[Step] = []
    # When nothing fires, the episode still owes a reason. Retain the first anchor's
    # most-specific non-firing verdict (anchors are in time order, mirroring the
    # earliest-driver rule) so a ``lever=None`` episode can report why it stayed
    # silent (ADR 0009). Only read when ``driver`` never gets set.
    silence: Optional[Verdict] = None
    # A correction cluster is judged once for the whole episode (it needs the pair),
    # so remember whether we've already spent it.
    correction_used = False
    correction_result, correction_silence = _correction_lever(
        episode.anchors, cgm, basal, scenario_config=scenario_config
    )

    for a in episode.anchors:
        result: Optional[tuple] = None
        sil: Optional[Verdict] = None
        # The guarded rebound terminal this anchor's result carries (over-treated low
        # only); read into ``rebound_end`` iff this anchor becomes the driver.
        this_rebound_end: Optional[datetime] = None
        # The instant the trigger anchor drove the lever. Defaults to the anchor's
        # own ``t``; a HIGH anchor drives its missed-meal lever from the rise onset
        # (``reach_start``), not the peak, so the trigger beat and its arc bound sit
        # at the climb the classifier judged (#118).
        trig_t = a.t
        if a.kind is AnchorKind.MEAL:
            r, sil = _meal_lever(
                a, cgm, basal, bolus,
                isf=isf, scenario_config=scenario_config,
            )
            if r is not None:
                result = (r[0], r[1])
        elif a.kind is AnchorKind.LOW:
            r, sil = _low_lever(
                a, cgm, bolus, basal,
                scenario_config=scenario_config,
                low_answers=low_answers,
            )
            if r is not None:
                result = (r[0], r[1])
                if len(r) > 2:                       # over-treated low carries its terminal
                    this_rebound_end = r[2]
        elif a.kind is AnchorKind.HIGH:
            r, sil = _high_lever(
                a, cgm, bolus, basal,
                scenario_config=scenario_config,
                low_answers=low_answers,
            )
            if r is not None:
                result = (r[0], r[1])
                if len(r) > 2:
                    # A rebound high-moment (#155): over-treated-low carries the guarded
                    # terminal so the engine scores the whole climb; the trigger sits at
                    # the peak (a.t), not the rise onset.
                    this_rebound_end = r[2]
                else:
                    # Missed-meal drives from the rise onset (reach_start), not the peak.
                    trig_t = a.reach_start
        elif a.kind is AnchorKind.CORRECTION and not correction_used:
            # Attribute the whole correction cluster at its stacking dose's anchor.
            if correction_result is not None:
                correction_used = True
                result = (correction_result[0], correction_result[1])
                correction_pair = correction_result[3]
            else:
                sil = correction_silence

        if result is None:
            if silence is None and sil is not None:
                silence = sil
            continue
        lever, step = result
        if driver is None:
            driver_anchor = a
            if lever is Lever.CORRECTION_STACKING and correction_pair is not None:
                driver_anchor = next(
                    (candidate for candidate in episode.anchors
                     if candidate.kind is AnchorKind.CORRECTION
                     and candidate.bolus is not None
                     and candidate.bolus.seq_num == correction_pair[1]),
                    a,
                )
                trig_t = driver_anchor.t
            driver = (lever, driver_anchor.kind, trig_t, step, driver_anchor)
            rebound_end = this_rebound_end
        else:
            # A later actionable behavior: narrate as a consequence, don't re-flag.
            consequences.append(step)

    if driver is None:
        return Attribution(
            lever=None, trigger="", trigger_t=episode.start, steps=[], silence=silence
        )

    lever, kind, trigger_t, driver_step, driver_anchor = driver
    steps = [driver_step] + consequences
    return Attribution(
        lever=lever,
        trigger=_trigger_label(kind, lever),
        trigger_t=trigger_t,
        steps=steps,
        rebound_end=rebound_end,
        correction_pair=(correction_pair if lever is Lever.CORRECTION_STACKING else None),
        driver_anchor=driver_anchor,
    )


# --- Over-treated caused-low split (#155) ---------------------------------------

# The context pad the split gate attributes a candidate low-moment over now lives on
# ``ScenarioConfig.attribute_split_context_pad_min``. It MUST match the engine's
# ``engine_context_pad_min`` so the gate's own-cause verdict is reproduced by the real
# build — a wider window here would split into a crash the narrower build can't
# attribute, dropping the low (the low2/06-04 silent-crash bug).

# The low own-cause lever that justifies splitting an over-treated low into two moments
# (#155 decision 3): the crash keeps one of these, the over-correction takes
# over_treated_low. A low whose only lesson is the over-treatment (no own cause) stays
# a single over_treated_low, unchanged.
_OWN_CAUSE_LEVERS = frozenset({
    Lever.CORRECTION_ON_IOB,
})


def _ctx(events: Sequence, start: datetime, end: datetime) -> list:
    return [e for e in events if start <= e.t <= end]


def split_caused_over_treatments(
    episodes: Sequence[EpisodeAnchors],
    cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    basal: Sequence[BasalEvent] = (),
    *,
    isf: Optional[float] = None,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    low_answers: Sequence[LowPromptAnswer] = (),
) -> List[EpisodeAnchors]:
    """Split an over-treated low that has its *own* cause into two moments (#155).

    When a correction-on-IOB low is also over-treated into a
    rebound, one lever per episode lets the crash-reframe win and the over-correction
    goes silent. This post-pass cuts such an episode at the recovery dip into a
    **low-moment** (the crash, keeping its own cause lever) and a **high-moment** (the
    over-correction, an ``over_treated_low`` anchored on a synthesized rebound HIGH) —
    both surface, and the crash-and-climb round-trip is scored exactly once over
    disjoint spans (AC4).

    Gated to "the low has its own cause" (:func:`_low_has_own_cause`): a plain daytime
    over-treatment whose only lesson is the over-treatment is left untouched — a single
    ``over_treated_low`` on the low, byte-identical to today (AC2). A near-low nadir has
    no sub-70 cause, so it never splits either. Runs after :func:`split_low_rebounds`
    (which already gives a downstream rebounding low its own head-of-cluster episode),
    so each candidate low leads its group.
    """
    out: List[EpisodeAnchors] = []
    for ep in episodes:
        out.extend(
            _split_over_treatment_one(
                ep, cgm, bolus, basal,
                isf=isf,
                scenario_config=scenario_config,
                low_answers=low_answers,
            )
        )
    return out


def _split_over_treatment_one(
    ep: EpisodeAnchors,
    cgm: Sequence[CgmReading],
    bolus: Sequence[BolusEvent],
    basal: Sequence[BasalEvent],
    *,
    isf: Optional[float],
    scenario_config: ScenarioConfig = ScenarioConfig(),
    low_answers: Sequence[LowPromptAnswer] = (),
) -> List[EpisodeAnchors]:
    ordered = sorted(ep.anchors, key=lambda a: a.reach_start)
    for a in ordered:
        if a.kind is not AnchorKind.LOW or a.over_treatment_split_off:
            continue
        nadir = a.bg if a.bg is not None else _nadir_at(cgm, a.t)
        # A refuted low ('no' — user says they didn't eat) is not an over-treatment, so
        # it must not split into an over-correction high-moment either (#129). Leave it
        # whole; ``_low_lever`` independently suppresses its over-treated branch and it
        # falls through to its own cause.
        answer = match_low_answer(low_answers, a.t)
        if answer is not None and answer.answer == "no":
            continue
        rebound = over_treated_rebound(
            cgm, a.t, nadir, bolus, scenario_config=scenario_config,
        )
        if rebound is None or rebound.peak_t is None:
            continue                                    # not over-treated — leave it
        dip = recovery_dip(cgm, a.t, rebound.peak_t, scenario_config=scenario_config)
        if dip is None:
            continue                                    # no in-range ascent — don't split
        # Low-moment: keep every original anchor, flagging the crash so its
        # over-treatment defers to the high-moment (it falls through to its own cause).
        low_moment = EpisodeAnchors(anchors=[
            replace(x, over_treatment_split_off=True) if x is a else x
            for x in ordered
        ])
        # Split only when the crash has its *own* cause — and only when the engine
        # build will actually attribute it. Gate by attributing the candidate
        # low-moment over the SAME context the build uses (not the full window): a
        # correction-on-IOB that needs a wider IOB look-back than the pad matches here
        # but not at build time would otherwise split into a crash that then goes
        # silent, dropping the low (#155). Must reproduce the build 1:1.
        cs = low_moment.start - timedelta(minutes=scenario_config.attribute_split_context_pad_min)
        ce = low_moment.end + timedelta(minutes=scenario_config.attribute_split_context_pad_min)
        low_attr = attribute(
            low_moment, _ctx(cgm, cs, ce), _ctx(bolus, cs, ce), _ctx(basal, cs, ce),
            isf=isf,
            scenario_config=scenario_config,
            low_answers=low_answers,
        )
        if low_attr.lever not in _OWN_CAUSE_LEVERS:
            continue                                    # no own cause — one moment, as today
        # High-moment: a synthesized rebound HIGH anchored at the peak, reaching from
        # the recovery dip (disjoint from the low-moment) through the guarded terminal
        # (so severity/worst_bg cover the whole climb-and-decline, #124). Carries the
        # crash nadir's instant so ``_high_lever`` re-matches its low-prompt answer for
        # the evidence-tier upgrade (#129).
        high_moment = Anchor(
            t=rebound.peak_t, kind=AnchorKind.HIGH, bg=rebound.peak,
            span_start=dip, span_end=rebound.terminal, rebound_nadir_bg=nadir,
            rebound_nadir_t=a.t,
        )
        return [low_moment, EpisodeAnchors(anchors=[high_moment])]
    return [ep]
