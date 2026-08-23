"""Pending carb-log prompts — the review queue's pure core (#128, slice 4/4).

The one genuinely new module of the unbolused-carb-log feature. It answers a
single question: *which carb-log questions is the user still owed?* — and hides
behind one seam everything fragile about that:

* **candidate derivation** — the questions worth asking, reusing existing
  detection (no new detectors, per the epic): the ``missed-meal`` classifier's
  matched rises ("rise with no bolus — did you eat?") and every sub-70 low run
  ("did you treat this low?"). See :func:`build_candidates`.
* **answered-match** — a candidate is *pending* iff no ``prompt_responses`` row
  answers it. Identity is ``(detector, anchor_t)`` with a small time tolerance:
  the anchors are recomputed live every call (never stored), and a recomputation
  can shift an anchor by a reading or two, so an exact match would resurrect an
  already-answered prompt. See :data:`ANCHOR_TOLERANCE`.
* **7-day expiry** — a candidate older than :data:`PROMPT_WINDOW_DAYS` is dropped
  silently (no stored answer): recall is gone that far back, and a guessed label
  is worse than none.
* **display cap** — at most :data:`DISPLAY_CAP`, oldest-first (answer the
  most-fadeable memories first). There is deliberately **no bulk-answer** path:
  bulk answers are noise by construction (if the queue routinely caps out, tune
  the detectors, not the UI).

The route handler and the tests cross this seam with plain data — a list of
:class:`Prompt` candidates and a list of ``prompt_responses`` dicts — matching the
repo's pure-analyzer convention (``analyzers`` in, plain payload out). Stdlib
only; no ``api``/``sync`` extras.

The ``GET /api/prompts`` contract is ``List[Prompt]`` (:meth:`Prompt.to_dict`); the
LOCKED #128 ribbon UI binds it directly.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Sequence, Union

from .events import BasalEvent, BolusEvent, CarbEntry, CgmReading, format_t, parse_t
from .analyzers.classifiers import classify_missed_meal
from .analyzers.scenario.anchors import Anchor, AnchorKind, collect_anchors
from .analyzers.scenario_config import ScenarioConfig

# The queue only asks about the last week: past that, recall is gone and a guessed
# label pollutes the label flywheel more than a missing one does.
PROMPT_WINDOW_DAYS = 7

# Show at most this many at once, oldest-first — the memories most likely to fade.
DISPLAY_CAP = 10

# Once answered, a prompt lingers on the ribbon only this long before dropping off,
# so a week of answered ✓ pins doesn't bury the one or two still open (#165). Within
# the grace it stays a faded, reviseable ✓; past it, it's gone from the queue — the
# stored answer and any carbs CarbEntry are untouched (still reviseable from the daily
# report tab, just not the ribbon). Compared against WALL-CLOCK now, never the
# event-time window `now`: answered_at is real wall-clock time, whereas `now` is
# derived from the latest event time so a catch-up/demo DB whose data lags real time
# still surfaces its recent prompts. Using the event-time clock would hide every
# answer instantly (or treat answers as future) on such a DB.
ANSWERED_GRACE_HOURS = 3

# Prompt identity is (detector, anchor_t) with this tolerance. Anchors are derived
# live each call, never stored; a recomputation (a late CGM backfill, a shifted run
# boundary) can move an anchor by a reading or two, so an already-answered prompt
# must still match its response despite a small drift. Two CGM readings (~10 min).
ANCHOR_TOLERANCE = timedelta(minutes=10)

# A manual carb logged within this window of a pending prompt's anchor *covers* it:
# the missing information ("was there something here?") is now on record, so the
# prompt drops from the queue silently — no stored response, no faded ✓, no trace,
# exactly like an expired candidate (ADR 0011, #166). Delete the carb and the prompt
# returns, because the information is missing again. Deliberately distinct from
# `ANCHOR_TOLERANCE`: that absorbs anchor *recomputation* drift (mechanical, ~2
# readings), whereas this absorbs human carb-timing slop — a low treated a few
# minutes off its nadir, a meal logged around its onset (the #166 lows sat 4–7 min
# off each nadir). The two happen to be close; do not collapse them.
CARB_COVERAGE_WINDOW = timedelta(minutes=20)

# How much CGM context each prompt carries for its ±2h sparkline / the ribbon trace.
_SPARKLINE_PAD = timedelta(hours=2)

# Detector tags — the (detector, anchor_t) identity's first half; mirrors the
# prompt_responses.detector vocab and the CarbEntry source mapping below.
DETECTOR_MISSED_MEAL = "missed-meal"
DETECTOR_LOW = "low"

# detector -> the CarbEntry.source a "carbs" answer is logged under (#125 vocab).
SOURCE_BY_DETECTOR = {
    DETECTOR_MISSED_MEAL: "rise-prompt",
    DETECTOR_LOW: "low-prompt",
}


@dataclass(frozen=True)
class Prompt:
    """One carb-log question, pinned to the instant it is about.

    Plain data end to end (the seam the route + tests share). ``anchor_t`` is the
    actionable instant — the rise *onset* for a missed meal (where the climb began,
    the classifier's own anchor), the *nadir* for a low. ``key_bg`` is the value
    that makes the question concrete — the peak a missed meal rose to, the floor a
    low dropped to. ``cgm`` is the ±2h context the ribbon and pop-up sparkline draw,
    as ``[{"t", "bg"}, …]``. ``age_days`` is filled by :func:`pending_prompts`
    relative to its ``now`` (0.0 on a bare candidate). ``answer`` is ``None`` on a
    pending prompt, or the stored ``carbs`` / ``no`` / ``not-sure`` label when the
    prompt has been answered (so the ribbon can render it as a faded ✓ the user can
    reopen to revise — the review/revise win survives a reload, #128).
    """

    detector: str
    anchor_t: datetime
    key_bg: Optional[float]
    question: str
    context: str
    cgm: List[dict] = field(default_factory=list)
    age_days: float = 0.0
    answer: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "detector": self.detector,
            "anchor_t": format_t(self.anchor_t),
            "key_bg": self.key_bg,
            "question": self.question,
            "context": self.context,
            "age_days": round(self.age_days, 2),
            "cgm": self.cgm,
            "answer": self.answer,
        }


def _cgm_window(cgm_readings: Sequence[CgmReading], center: datetime) -> List[dict]:
    """The ±2h CGM slice around ``center``, as plain ``{"t", "bg"}`` rows (sorted)."""
    lo = center - _SPARKLINE_PAD
    hi = center + _SPARKLINE_PAD
    rows = [
        r for r in cgm_readings
        if r.bg is not None and lo <= r.t <= hi
    ]
    rows.sort(key=lambda r: r.t)
    return [{"t": format_t(r.t), "bg": r.bg} for r in rows]


def _low_prompt(anchor: Anchor, cgm_readings: Sequence[CgmReading]) -> Prompt:
    """A "did you treat this low?" prompt anchored at a sub-70 nadir."""
    nadir = anchor.bg
    context = (
        f"Glucose dropped to {nadir:.0f} mg/dL."
        if nadir is not None
        else "Glucose dropped below 70 mg/dL."
    )
    return Prompt(
        detector=DETECTOR_LOW,
        anchor_t=anchor.t,
        key_bg=nadir,
        question="Did you treat this low?",
        context=context,
        cgm=_cgm_window(cgm_readings, anchor.t),
    )


def _missed_meal_prompt(
    anchor: Anchor, onset: datetime, cgm_readings: Sequence[CgmReading]
) -> Prompt:
    """A "rise with no bolus — did you eat?" prompt anchored at the rise onset.

    ``anchor.t`` is the HIGH-run peak; the classifier anchors at the *onset*
    (``anchor.reach_start``), so the prompt does too. ``key_bg`` stays the peak the
    rise reached (what the question is about), matching the LOCKED ribbon pin.
    """
    peak = anchor.bg
    context = (
        f"Glucose rose to {peak:.0f} mg/dL with no bolus logged."
        if peak is not None
        else "Glucose rose sharply with no bolus logged."
    )
    return Prompt(
        detector=DETECTOR_MISSED_MEAL,
        anchor_t=onset,
        key_bg=peak,
        question="Did you eat here?",
        context=context,
        cgm=_cgm_window(cgm_readings, onset),
    )


def build_candidates(
    bolus_events: Sequence[BolusEvent],
    cgm_readings: Sequence[CgmReading],
    basal_events: Sequence[BasalEvent] = (),
) -> List[Prompt]:
    """Every carb-log question the data raises, before answered/expiry/cap filtering.

    Reuses the scenario engine's detection (no new detectors, per #70/#128):

    * **sub-70 lows** — every genuine low run (nadir anchored at
      ``ScenarioConfig.gate_low_mgdl``, so near-lows at 71–75 are excluded — a dip to 72 is not
      "a low you had"). Day or night; an over-treated-low attribution is still just a
      low here, so the same nadir yields exactly one prompt.
    * **missed meals** — each HIGH-run onset the ``missed-meal`` classifier matches
      (a meal-shaped rise with no bolus behind it).

    No ISF / I:C needed: the missed-meal classifier judges CGM shape + bolus
    presence only (carb-undercount, the one classifier that needs settings, plays no
    part in the queue).
    """
    candidates: List[Prompt] = []
    scenario_config = ScenarioConfig()
    anchors = collect_anchors(
        bolus_events, cgm_readings, basal_events,
        scenario_config=scenario_config, low_mgdl=scenario_config.gate_low_mgdl,
    )
    for a in anchors:
        if a.kind is AnchorKind.LOW:
            candidates.append(_low_prompt(a, cgm_readings))
        elif a.kind is AnchorKind.HIGH:
            onset = a.reach_start
            if classify_missed_meal(
                onset, cgm_readings, bolus_events, basal_events,
                scenario_config=scenario_config,
            ).matched:
                candidates.append(_missed_meal_prompt(a, onset, cgm_readings))
    return candidates


def _parse_dt(value) -> Optional[datetime]:
    """A stored datetime column (naive ``format_t`` string or ``datetime``) → datetime."""
    if value is None:
        return None
    return value if isinstance(value, datetime) else parse_t(value)


def _response_anchor(response: dict) -> Optional[datetime]:
    return _parse_dt(response.get("anchor_t"))


def _answered_index(responses: Sequence[dict]) -> Dict[str, List[tuple]]:
    """``{detector: [(answered anchor_t, answer, answered_at), …]}`` — the match set.

    A response answers a candidate regardless of *which* answer it holds: ``no`` and
    ``not-sure`` are first-class stored labels (negative / abstain), not dismissals,
    so any row for the pair means the prompt has been answered — the answer string
    rides along so the queue can show a faded ✓ the user can revise.

    ``answered_at`` (real wall-clock time the row was recorded) rides along too so the
    answered/pending split can apply the post-answer grace (:data:`ANSWERED_GRACE_HOURS`,
    #165); it is ``None`` only for a legacy row missing the column, which never expires.
    """
    index: Dict[str, List[tuple]] = {}
    for r in responses:
        at = _response_anchor(r)
        if at is None:
            continue
        answered_at = _parse_dt(r.get("answered_at"))
        index.setdefault(r.get("detector"), []).append(
            (at, r.get("answer"), answered_at))
    return index


def _matching_answer(
    prompt: Prompt, index: Dict[str, List[tuple]]
) -> Optional[tuple]:
    """The matching ``(answer, answered_at)`` for ``prompt`` within
    :data:`ANCHOR_TOLERANCE`, or ``None`` when the prompt is unanswered.

    The tolerance absorbs recomputation drift: the anchor is derived live every call
    and can shift by a reading, so an exact match would resurrect an answered prompt.
    """
    tol = ANCHOR_TOLERANCE.total_seconds()
    for at, ans, answered_at in index.get(prompt.detector, ()):  # type: ignore[arg-type]
        if abs((at - prompt.anchor_t).total_seconds()) <= tol:
            return ans, answered_at
    return None


def _manual_carb_times(carb_entries: Sequence[CarbEntry]) -> List[datetime]:
    """The instants of the *manual* carb-log entries — the coverage signal (ADR 0011).

    Only ``source == "manual"`` entries cover: a ``rise-prompt`` / ``low-prompt`` entry
    is the "carbs" answer's own byproduct, already tracked by its ``prompt_responses``
    row (the stored-answer path), so counting it here would double-handle it. No
    grams/certainty filter — coverage asks *whether* there were carbs, not how many, so
    an ``unknown``-certainty or a 4 g entry covers just as well."""
    return [e.t for e in carb_entries if e.source == "manual" and e.t is not None]


def _is_covered(prompt: Prompt, manual_carb_times: Sequence[datetime]) -> bool:
    """True iff a manual carb sits within :data:`CARB_COVERAGE_WINDOW` of ``prompt``.

    Detector-agnostic on purpose (ADR 0011): a logged carb is a source-agnostic "there
    were carbs here" fact, so it covers a ``low`` or a ``missed-meal`` candidate alike."""
    tol = CARB_COVERAGE_WINDOW.total_seconds()
    return any(
        abs((t - prompt.anchor_t).total_seconds()) <= tol for t in manual_carb_times
    )


def pending_prompts(
    candidates: Sequence[Prompt],
    responses: Sequence[dict],
    now: datetime,
    *,
    carb_entries: Sequence[CarbEntry] = (),
    include_answered: bool = False,
    window_days: int = PROMPT_WINDOW_DAYS,
    cap: int = DISPLAY_CAP,
    answered_grace_hours: int = ANSWERED_GRACE_HOURS,
    wall_now: Optional[datetime] = None,
) -> List[Prompt]:
    """The review-queue prompts: within the window, oldest-first, capped.

    ``candidates`` are the live-derived questions (:func:`build_candidates`);
    ``responses`` are ``prompt_responses`` rows (plain dicts with ``detector`` /
    ``anchor_t`` / ``answer`` / ``answered_at``); ``now`` dates the window and fills
    ``age_days``.

    Every candidate is matched against the responses (within :data:`ANCHOR_TOLERANCE`
    of its ``(detector, anchor_t)``) and tagged with its ``answer`` (``None`` when
    pending) — anything outside the ``window_days`` window drops silently.

    ``carb_entries`` are the manual carb-log rows (:class:`CarbEntry`); a candidate with
    **no** stored answer that a manual carb *covers* (within :data:`CARB_COVERAGE_WINDOW`
    of its anchor, detector-agnostic) drops silently too — the missing information is now
    on record, so there is nothing to ask (ADR 0011, #166). A **stored answer wins**:
    coverage is a fallback checked only after the answered-match, so a deliberate in-queue
    answer (even ``no``) keeps its reviseable ✓ over a later nearby carb.

    An answered candidate only lingers as a faded ✓ for ``answered_grace_hours`` after
    its ``answered_at``; past that it drops out of the queue entirely (#165). The grace
    is measured against **wall-clock now** (``wall_now``, defaulting to
    :func:`datetime.now`), NOT the event-time ``now`` that dates the window — because
    ``answered_at`` is real wall-clock time while ``now`` may lag it by days on a
    catch-up/demo DB. A dropped answered prompt is filtered *out*, never resurrected as
    pending (its response still matches it within :data:`ANCHOR_TOLERANCE`).

    * ``include_answered=False`` (default) — return only the *pending* prompts,
      oldest-first, truncated to ``cap``. The pure inbox contract.
    * ``include_answered=True`` — also return within-grace answered prompts (carrying
      their ``answer``) so the ribbon can show faded ✓ pins that survive a reload and
      stay reviseable/clearable (#128). Pending prompts keep priority: up to ``cap``
      pending (oldest-first) are kept first, then the newest answered fill any
      remaining slots, so a busy queue is never crowded out by old ✓ pins.

    There is no bulk action in either mode, by design.
    """
    cutoff = now - timedelta(days=window_days)
    grace = timedelta(hours=answered_grace_hours)
    wall_now = wall_now or datetime.now()
    index = _answered_index(responses)
    manual_carb_times = _manual_carb_times(carb_entries)

    pending: List[Prompt] = []
    answered: List[Prompt] = []
    for c in candidates:
        if c.anchor_t < cutoff or c.anchor_t > now:
            continue                       # expired (or, defensively, in the future)
        age = (now - c.anchor_t).total_seconds() / 86400.0
        match = _matching_answer(c, index)
        if match is None:
            # No stored answer — but a manual carb the user already logged here covers
            # it (silently, no ✓), so we only surface the still-unaccounted-for ones.
            if _is_covered(c, manual_carb_times):
                continue
            pending.append(replace(c, age_days=age, answer=None))
            continue
        answer, answered_at = match
        if answered_at is not None and (wall_now - answered_at) > grace:
            continue                       # answered past the grace — drop entirely
        answered.append(replace(c, age_days=age, answer=answer))

    pending.sort(key=lambda p: p.anchor_t)   # oldest-first
    if not include_answered:
        return pending[:cap]

    kept = pending[:cap]
    remaining = cap - len(kept)
    if remaining > 0 and answered:
        answered.sort(key=lambda p: p.anchor_t, reverse=True)  # newest answered first
        kept = kept + answered[:remaining]
    kept.sort(key=lambda p: p.anchor_t)      # ribbon renders in time order
    return kept


def build_pending_prompts(
    store,
    *,
    now: Optional[datetime] = None,
    include_answered: bool = True,
    window_days: int = PROMPT_WINDOW_DAYS,
    cap: int = DISPLAY_CAP,
    answered_grace_hours: int = ANSWERED_GRACE_HOURS,
) -> List[Prompt]:
    """Store-facing wrapper the ``GET /api/prompts`` route calls (mirrors ``build_scenarios``).

    Reads the last ``window_days`` of bolus / CGM / basal from ``store``, derives the
    candidates, and matches them against ``store.prompt_responses()``. ``now`` defaults
    to the latest event time (like ``build_scenarios``), not the wall clock, so a
    demo / catch-up DB whose data lags real time still surfaces its recent prompts.

    ``include_answered`` defaults to ``True`` — the UI wants the faded ✓ pins so the
    user can revise/clear a prior answer across reloads; the frontend derives the
    open count from each prompt's ``answer`` field.

    The post-answer grace (:data:`ANSWERED_GRACE_HOURS`, #165) is measured against real
    wall-clock ``datetime.now()`` inside :func:`pending_prompts`, never this ``now``:
    ``now`` is the latest *event* time, which lags real time on a catch-up/demo DB,
    whereas ``answered_at`` is real wall-clock — the two must be compared on the same
    clock.

    Manual carb entries in the window are read as a second suppression signal (ADR 0011,
    #166): a manual carb near a pending candidate covers it silently. Read from ``start``
    with no upper bound so a treatment logged just *after* the latest pump event still
    covers a candidate near ``now``.
    """
    basal = store.basal_events()
    cgm = store.cgm_readings()
    bolus = store.bolus_events()

    times = [e.t for e in basal] + [r.t for r in cgm]
    span_end = max(times) if times else None
    now = now or span_end or datetime.now()
    start = now - timedelta(days=window_days)

    w_bolus = [b for b in bolus if start <= b.t <= now]
    w_cgm = [r for r in cgm if start <= r.t <= now]
    w_basal = [e for e in basal if start <= e.t <= now]

    candidates = build_candidates(w_bolus, w_cgm, w_basal)
    return pending_prompts(
        candidates, store.prompt_responses(), now,
        carb_entries=store.carb_entries(start),
        include_answered=include_answered, window_days=window_days, cap=cap,
        answered_grace_hours=answered_grace_hours,
    )
