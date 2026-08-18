"""Anchors — the actionable instants the raw timeline is segmented around (#70 §1).

An **anchor** is a moment worth reasoning about: a meal bolus, a user correction,
the nadir of a CGM low run, the peak of a CGM high run, or the start of a
Control-IQ defensive-suspend episode. The scenario engine clusters anchors into
episodes (:mod:`.segment`) and runs the instance classifiers at each one
(:mod:`.attribute`).

Anchor *detection* is deliberately generous — it only has to find the candidate
instants; the classifiers decide whether anything actionable actually happened
there. Rescue carbs stay invisible (ADR 0003): a low/high anchor is the observable
CGM shape, never a carb event.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional, Sequence

from ...events import BasalEvent, BolusEvent, CgmReading
from ..classifiers.context_gate import _is_suspend
from ..scenario_config import ScenarioConfig

# The meal floor, user-correction floor, near-low anchor line, high line, run gap, and
# meal forward-reach now live on ``ScenarioConfig`` (the ``anchor_*`` fields). The
# near-low anchor line (``anchor_near_low_mgdl`` = 75) is deliberately looser than the
# exposure / gate low line (``gate_low_mgdl`` = 70): a dip to 71-75 is attributable (a
# 72 → 244 rebound is a textbook over-treated low, #112) but is not itself "a low you
# had", so it must NOT widen the LOWS exposure denominator (see engine._exposure_counts).


class AnchorKind(str, Enum):
    """What an anchor is — drives the trigger a classifier is picked for."""

    MEAL = "meal"
    CORRECTION = "correction"
    LOW = "low"
    HIGH = "high"
    SUSPEND = "suspend"


@dataclass(frozen=True)
class Anchor:
    """One actionable instant on the timeline.

    * ``t`` — when it happened (the nadir/peak instant for a CGM run, the dose time
      for a bolus, the episode start for a suspend).
    * ``kind`` — which :class:`AnchorKind`.
    * ``bolus`` — the originating :class:`~ciq_autotune.events.BolusEvent` for a
      meal / correction anchor, else ``None``.
    * ``bg`` — the CGM value at the anchor for a low/high anchor (the nadir/peak),
      else ``None``.
    * ``end`` — the end instant for a suspend episode, else ``None``.
    * ``span_start`` / ``span_end`` — the extent this anchor *reaches* for
      clustering: a CGM run or suspend episode spans its whole run, not just its
      extremum instant, so a continuous excursion whose only anchors are its
      endpoints still clusters as one episode. Both default to ``t`` (a bolus is a
      point event).
    * ``over_treatment_split_off`` — set on a LOW anchor whose over-treatment has
      been split into its own high-moment (#155): tells
      :func:`~...attribute._low_lever` to skip its over-treated-low check and fall
      through to the low's *own* cause (correction-on-IOB), so the
      crash and the over-correction surface as two moments. Default ``False`` (the
      low owns its own rebound, today's behavior).
    * ``rebound_nadir_bg`` — set on the synthesized HIGH anchor of a split's
      high-moment (#155): the nadir the rebound climbed from. Its presence routes
      :func:`~...attribute._high_lever` to attribute ``over_treated_low`` (the
      over-correction) rather than missed-meal, and supplies the crash value for the
      beat text. ``None`` for a real, standalone HIGH-run anchor.
    * ``rebound_nadir_t`` — the instant of that nadir (#129). Carried alongside
      ``rebound_nadir_bg`` so :func:`~...attribute._high_lever` can re-match the
      low-prompt answer for the crash nadir (the over-treated-low evidence-tier
      upgrade + needed-vs-logged breakdown) on the split high-moment, exactly as
      :func:`~...attribute._low_lever` does for an unsplit over-treated low. ``None``
      for a real, standalone HIGH-run anchor.
    """

    t: datetime
    kind: AnchorKind
    bolus: Optional[BolusEvent] = None
    bg: Optional[float] = None
    end: Optional[datetime] = None
    span_start: Optional[datetime] = None
    span_end: Optional[datetime] = None
    over_treatment_split_off: bool = False
    rebound_nadir_bg: Optional[float] = None
    rebound_nadir_t: Optional[datetime] = None

    @property
    def reach_start(self) -> datetime:
        return self.span_start or self.t

    @property
    def reach_end(self) -> datetime:
        return self.span_end or self.end or self.t


def _is_meal(b: BolusEvent, *, scenario_config: ScenarioConfig = ScenarioConfig()) -> bool:
    return b.carbs is not None and b.carbs >= scenario_config.anchor_meal_min_carbs


def _is_user_correction(
    b: BolusEvent, *, scenario_config: ScenarioConfig = ScenarioConfig()
) -> bool:
    floor_u = scenario_config.anchor_user_correction_floor_u
    # No insulin, nothing to judge.
    if b.insulin is None:
        return False
    auto = b.is_automatic_bolus
    if b.carbs:
        # A mixed food+correction bolus (#160). Admitted as a correction only when
        # the Msg3 split is present, the *correction component* clears the floor,
        # and it isn't a Control-IQ automatic dose. No split (correction_insulin is
        # None) -> meal-only, today's behavior. Scoring the floor on the component
        # (not the total delivered dose) keeps a food-only bolus with a trivial
        # pump-folded correction below the line while admitting a real one. A mixed
        # bolus is also still a meal (see _is_meal) — one dose, two opportunities,
        # so collect_anchors dual-emits a MEAL and a CORRECTION anchor.
        if b.correction_insulin is None or auto:
            return False
        return b.correction_insulin >= floor_u
    # Pure correction (no carbs): today's exact logic. Real Msg2 provenance wins
    # when present (a Control-IQ automatic bolus is never a user correction whatever
    # its magnitude); with no provenance, fall back to the magnitude floor on the
    # (whole == correction) dose.
    if auto is not None:
        return not auto
    return b.insulin >= floor_u


def _cgm_run_anchors(
    readings: Sequence[CgmReading], kind: AnchorKind, threshold: float, run_gap: timedelta
) -> List[Anchor]:
    """Anchor the extremum of each CGM run past ``threshold``.

    A run is a maximal sequence of readings on the wrong side of ``threshold`` with
    no gap wider than ``run_gap``. For a LOW run we anchor the nadir; for a HIGH
    run, the peak. One anchor per run so a long excursion isn't over-anchored.
    """
    rows = sorted((r for r in readings if r.bg is not None), key=lambda r: r.t)
    is_low = kind is AnchorKind.LOW
    out: List[Anchor] = []
    run: List[CgmReading] = []

    def flush() -> None:
        if not run:
            return
        best = min(run, key=lambda r: r.bg) if is_low else max(run, key=lambda r: r.bg)
        out.append(Anchor(
            t=best.t, kind=kind, bg=best.bg,
            span_start=run[0].t, span_end=run[-1].t,
        ))

    for r in rows:
        past = r.bg <= threshold if is_low else r.bg >= threshold
        if past:
            if run and r.t - run[-1].t > run_gap:
                flush()
                run = []
            run.append(r)
        else:
            flush()
            run = []
    flush()
    return out


def _low_anchors(
    readings: Sequence[CgmReading], near_low_mgdl: float, run_gap: timedelta,
    *, scenario_config: ScenarioConfig = ScenarioConfig(),
) -> List[Anchor]:
    """Low nadir anchors: every sub-70 run, plus *purely* near-low runs (#112).

    Two passes, kept strictly additive so sub-70 anchoring is byte-identical to the
    pre-#112 behavior:

    * **sub-70 runs** are anchored at :data:`GATE_LOW_MGDL` exactly as before — same
      run boundaries, same nadir instants, same spans. Anything that dipped below 70
      is a real "low you had" and its episode must not move.
    * **near-low runs** (a run whose readings stay in ``(70, near_low_mgdl]`` and never
      touch sub-70) are anchored too, so a 72 → 244 over-treatment can be attributed
      (:func:`~ciq_autotune.analyzers.scenario.attribute._low_lever`'s ≥180 tier). A
      near-low run that *does* dip below 70 is dropped here — it is already the sub-70
      pass's run, and re-anchoring it would widen that run's span and shift the
      untouched sub-70 episode.

    When ``near_low_mgdl <= gate_low_mgdl`` (the exposure count re-anchors at 70) the
    second pass is a no-op, so the result is exactly the sub-70 pass.
    """
    gate_low_mgdl = scenario_config.gate_low_mgdl
    sub70 = _cgm_run_anchors(readings, AnchorKind.LOW, gate_low_mgdl, run_gap)
    if near_low_mgdl <= gate_low_mgdl:
        return sub70
    near = [
        a
        for a in _cgm_run_anchors(readings, AnchorKind.LOW, near_low_mgdl, run_gap)
        if a.bg is not None and a.bg > gate_low_mgdl
    ]
    return sub70 + near


def _suspend_anchors(
    basal_events: Sequence[BasalEvent], group_gap: timedelta
) -> List[Anchor]:
    """One anchor per Control-IQ defensive-suspend episode (its start).

    Groups consecutive suspend rows (see
    :func:`~ciq_autotune.analyzers.classifiers.context_gate._is_suspend`) within
    ``group_gap`` into one episode and anchors the episode start.
    """
    rows = sorted((e for e in basal_events if _is_suspend(e)), key=lambda e: e.t)
    out: List[Anchor] = []
    ep_start: Optional[datetime] = None
    ep_end: Optional[datetime] = None
    for e in rows:
        if ep_end is not None and e.t - ep_end <= group_gap:
            ep_end = e.t
        else:
            if ep_start is not None:
                out.append(Anchor(
                    t=ep_start, kind=AnchorKind.SUSPEND, end=ep_end,
                    span_start=ep_start, span_end=ep_end,
                ))
            ep_start = e.t
            ep_end = e.t
    if ep_start is not None:
        out.append(Anchor(
            t=ep_start, kind=AnchorKind.SUSPEND, end=ep_end,
            span_start=ep_start, span_end=ep_end,
        ))
    return out


def collect_anchors(
    bolus_events: Sequence[BolusEvent],
    cgm_readings: Sequence[CgmReading],
    basal_events: Sequence[BasalEvent] = (),
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    low_mgdl: Optional[float] = None,
) -> List[Anchor]:
    """All anchors in the window, sorted by time.

    Meal boluses, user corrections, CGM low nadirs, CGM high peaks, and
    defensive-suspend episode starts — the candidate instants
    :mod:`.segment` clusters into episodes.

    ``low_mgdl`` overrides the low-anchor line (defaults to
    ``scenario_config.anchor_near_low_mgdl``); the engine passes ``gate_low_mgdl`` to
    re-anchor lows at 70 for the honest exposure count.
    """
    if low_mgdl is None:
        low_mgdl = scenario_config.anchor_near_low_mgdl
    high_mgdl = scenario_config.anchor_high_mgdl
    run_gap = timedelta(minutes=scenario_config.anchor_run_gap_min)
    anchors: List[Anchor] = []

    meal_reach = timedelta(minutes=scenario_config.anchor_meal_reach_min)
    for b in bolus_events:
        # A mixed food+correction bolus is BOTH a meal and a correction (#160): the
        # predicates are no longer exclusive, so this dual-emits a MEAL and a
        # CORRECTION anchor off the one dose rather than picking one. Each is a real,
        # independent opportunity (see engine._exposure_counts' two denominators).
        if _is_meal(b, scenario_config=scenario_config):
            # A meal reaches forward over its judgement horizon (#78) so an episode
            # anchored only by the meal still spans the excursion it's scored on,
            # never collapsing to a zero-duration window. reach_start stays the dose
            # time (the meal has no pre-history to reach back to).
            anchors.append(Anchor(
                t=b.t, kind=AnchorKind.MEAL, bolus=b,
                span_start=b.t, span_end=b.t + meal_reach,
            ))
        if _is_user_correction(b, scenario_config=scenario_config):
            anchors.append(Anchor(t=b.t, kind=AnchorKind.CORRECTION, bolus=b))

    anchors += _low_anchors(
        cgm_readings, low_mgdl, run_gap, scenario_config=scenario_config
    )
    anchors += _cgm_run_anchors(cgm_readings, AnchorKind.HIGH, high_mgdl, run_gap)
    anchors += _suspend_anchors(
        basal_events, timedelta(minutes=scenario_config.gate_suspend_group_gap_min)
    )

    anchors.sort(key=lambda a: a.t)
    return anchors
