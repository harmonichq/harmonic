"""The scenario-engine payload — the contract #64 renders (#70 §5).

Frozen dataclasses of plain data (numbers, strings, nested dicts). No behaviour,
no analyzer imports: the bottom of the scenario package's dependency graph, so any
layer can build or consume it. Every piece is JSON-serializable via ``to_dict``.

Shapes (verbatim from #70 §5):

    Pattern { lever, confidence(rate, lo, hi, score, wide), rank,
              recommendation, hero_episode, occurrences:[episode_ref…] }
    Episode { id, start, end, trigger, lever, severity,
              steps:[ {t, text, evidence_tier, cited_event_refs} … ],
              window:{cgm, boluses, basal, pump_events, sleep_windows} }

    Suspends are ``basal_rate == 0`` runs within ``window.basal`` — the supported
    contract (#82), not a separate array (see :class:`Step`).

The episode ``window`` reuses the existing ``/api/timeline`` payload shape, so the
frontend's step-through chart renders it with the same code the daily chart uses.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Sequence

from ...rescue_evidence import RescueObservation
from ...uncertainty import Confidence
from ..classifiers.evidence import EvidenceTier
from .levers import Lever
from .priority import behavioral_priority

# Bump when the scenario payload shape changes; a frontend keys off this.
# v2 (#172): adds the ``preempted_lows`` count-object (ADR 0012).
# v3 (#129): adds ``Step.over_treated_breakdown`` — the needed-vs-logged coaching
# breakdown on a confirmed (logged-carbs) over-treated low (ADR 0008).
# v4 (#259): adds the unified Lever ``priority`` (+ its two factor inputs) per Pattern
# and the ``priority_active_threshold`` echo, so behavioral Levers interleave with the
# /api/analyze tuning Levers on one axis (ADR 0032). Additive — the rank order of
# ``patterns`` is unchanged.
# v5 (#400): removes ``Step.over_treated_breakdown`` — the needed-vs-logged /
# rescue-carb estimates it carried (``lift_g``, ``iob_covered_g``, staged/point
# regimes) were unsupported and are gone (ADR 400). The confirmed over-treated-low
# beat now reports logged grams + a follow-your-plan line in ``Step.text``.
# v6 (#467): adds ``preempted_lows.observation`` — how many of the window's days the
# manual rescue log was actually recording, plus the recorded prompt-answer states, so
# the count is read against its real observed coverage instead of assumed silence.
SCENARIO_SCHEMA_VERSION = 6

# Mirror of ``ScenarioConfig.priority_active_threshold`` (ADR 0032) for direct
# ``ScenarioReport`` constructors (unit tests); :func:`~.engine.assemble` passes the
# live config value. Kept here so payload stays free of an analyzer-config import.
_DEFAULT_ACTIVE_THRESHOLD = 30

_FMT = "%Y-%m-%d %H:%M:%S"


def _fmt(dt: datetime) -> str:
    return dt.strftime(_FMT)


@dataclass(frozen=True)
class Step:
    """One narrative step in an episode's step-through, with its honesty tier.

    ``evidence_tier`` (observed / inferred / not_in_data) tells the renderer how
    firmly to draw the step: observed steps are solid facts, inferred steps are
    hedged (muted/dashed), not-in-data is an explicit unknowable (#70 §4).

    ``cited_event_refs`` are the ``window`` events this beat asserts *beyond its
    own ``t``* — the boluses an "corrected 2×, ~6U" beat sums, the CGM point a
    nadir/peak reads, the ``window.suspends`` interval a suspend beat names (#82).
    Each ref is a ``"%Y-%m-%d %H:%M:%S"`` timestamp, the join key the ``window``
    ``cgm`` / ``boluses`` / ``suspends`` rows already carry — so the frontend
    highlights *exactly* the events the narrative cites, never a re-derived guess.
    Empty for beats that cite nothing but their own ``t`` (trigger / resolution).

    A suspend beat cites the *first* zero-rate ``basal`` row of its run: the
    supported suspend contract is the ``basal_rate == 0`` run (247 rows in the
    real capture), not the ``delivery_type`` string (which labelled only 7); the
    run's extent is the contiguous zero-rate rows the frontend already holds (#82).

    ``cited_window`` is the *span* a look-back/ahead beat scanned, as a
    ``{"start", "end"}`` pair of ``"%Y-%m-%d %H:%M:%S"`` timestamps (build it with
    :func:`window_ref`). Unlike ``cited_event_refs`` (point events that join to
    ``window`` rows), this is a continuous interval the frontend shades as a
    ``markArea`` band — e.g. the missed-meal digestion lookback the verdict scanned
    for a prior bolus (#118). ``None`` for beats that scan no window.
    """

    t: datetime
    text: str
    evidence_tier: EvidenceTier
    cited_event_refs: List[str] = field(default_factory=list)
    cited_window: Optional[dict] = None

    def to_dict(self) -> dict:
        return {
            "t": _fmt(self.t),
            "text": self.text,
            "evidence_tier": self.evidence_tier.value,
            "cited_event_refs": list(self.cited_event_refs),
            "cited_window": dict(self.cited_window) if self.cited_window else None,
        }


def event_ref(t: datetime) -> str:
    """The ``window``-payload join key for an event at instant ``t`` (#82).

    A beat's ``cited_event_refs`` hold these; the ``window`` ``cgm`` / ``boluses``
    / ``suspends`` rows carry the same ``"%Y-%m-%d %H:%M:%S"`` string on ``t`` /
    ``start``, so the frontend joins on equality without re-deriving anything.
    """
    return _fmt(t)


def event_refs(ts: Sequence[datetime]) -> List[str]:
    """:func:`event_ref` over a sequence, preserving order."""
    return [_fmt(t) for t in ts]


def window_ref(start: datetime, end: datetime) -> dict:
    """A ``Step.cited_window`` span: a ``{"start", "end"}`` pair of join keys (#118).

    The continuous interval a look-back/ahead beat scanned (e.g. the missed-meal
    digestion lookback), shaded as a ``markArea`` band by the frontend. Same
    ``"%Y-%m-%d %H:%M:%S"`` string form as :func:`event_ref`.
    """
    return {"start": _fmt(start), "end": _fmt(end)}


@dataclass(frozen=True)
class Episode:
    """One attributed episode: a trigger, a single lever, severity, and its story.

    ``window`` is the raw ``/api/timeline`` payload for ``[start, end]`` (with a little
    lead-in/out) — the step-through chart. ``severity`` is the hypo-weighted
    time-out-of-range score (:mod:`.severity`); ``worst_bg`` is the nadir-or-peak
    the frontend can headline.
    """

    id: str
    start: datetime
    end: datetime
    trigger: str
    lever: Lever
    severity: float
    steps: List[Step]
    window: Dict = field(default_factory=dict)
    worst_bg: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "start": _fmt(self.start),
            "end": _fmt(self.end),
            "trigger": self.trigger,
            "lever": self.lever.value,
            "severity": round(self.severity, 2),
            "worst_bg": self.worst_bg,
            "steps": [s.to_dict() for s in self.steps],
            "window": self.window,
        }


@dataclass(frozen=True)
class Pattern:
    """A lever faced by a hero episode, scored and ranked (#70 §3, §5).

    * ``confidence`` — the #58 :class:`~ciq_autotune.uncertainty.Confidence` for
      this lever: ``k`` episodes gone bad this way out of ``n`` exposure
      opportunities, times the typical-severity ``effect``. Its ``rate`` is the
      recurrence line ("recurs in ~28% of your meals"); ``score`` ranks it;
      ``wide`` (thin/soft) collapses it behind the low-confidence expander.
    * ``rank`` — 1-based rank among surfaced patterns (by score, desc).
    * ``hero_episode`` — the id of the highest-severity credible episode, the
      pattern's face.
    * ``occurrences`` — sibling episode ids (all episodes attributed to this lever,
      hero first).
    """

    lever: Lever
    confidence: Confidence
    rank: int
    recommendation: str
    hero_episode: str
    occurrences: List[str]

    def to_dict(self) -> dict:
        c = self.confidence
        return {
            "lever": self.lever.value,
            "title": _lever_title(self.lever),
            "confidence": {
                "rate": round(c.rate, 4),
                "lo": round(c.lo, 4),
                "hi": round(c.hi, 4),
                "score": round(c.score, 4),
                "wide": c.wide,
                "n": c.n,
                "k": c.k,
                "effect": round(c.effect, 4),
                "confidence": c.confidence,
            },
            # The unified Lever Priority (ADR 0032): impact = effect, recurrence = the
            # Wilson lower bound ``lo``. ``100·√(effect·lo)`` is monotonic in the
            # ``confidence.score`` above, so this never reorders ``patterns`` — it only
            # puts behavioral Levers on the same axis the /api/analyze tuning Levers carry.
            **behavioral_priority(c).to_dict(),
            "rank": self.rank,
            "recommendation": self.recommendation,
            "hero_episode": self.hero_episode,
            "occurrences": list(self.occurrences),
        }


def _lever_title(lever: Lever) -> str:
    # Local import to keep payload free of a hard levers-metadata dependency cycle.
    from .levers import title

    return title(lever)


@dataclass(frozen=True)
class PreemptedLows:
    """The #172 pre-empted-low **count** — a coaching signal, never a rate (ADR 0012).

    A **Pre-empted low** is a ``source='manual'`` **Rescue carb** whose drop was
    arrested *before* it printed a low (no CGM nadir near it), so the scenario engine
    raised no Anchor / Episode / Lever — the entry is the excursion's only trace.
    This object is the aggregate answer "how many, and after what": a *count* split
    by the preceding bolus, presented on the Patterns view like an Outcome-summary
    metric (a number with attribution), **not** a Lever and **not** a rate-scored
    Pattern.

    * ``total`` — pre-empted lows in the window (always ``ic + isf + unattributed``).
    * ``ic`` — arrested after a **meal** bolus still on board → look at I:C (over-bolus
      *or* carb overcount — the flag is cause-agnostic between them).
    * ``isf`` — arrested after a **correction** still on board → look at ISF.
    * ``unattributed`` — no live bolus IOB at the rescue (a basal / activity drop);
      counted in the tally but pointed at no setting.
    * ``floor_u`` — the residual bolus-IOB floor (U) that gated attributability, echoed
      so the (deliberately re-tunable) constant is visible in the payload.
    * ``observation`` — how much of the window the rescue log was actually recording and
      what it recorded (#467): an observed-**day count** plus the recorded prompt-answer
      states, so a count over a window that predates the log reads as partly unknown
      rather than as a complete tally. ``None`` when the caller supplied no coverage.

    Deliberately carries **no** denominator, rate, or exposure count: a rate over
    rescues inverts ADR 0008's under-logging honesty (a forgotten rescue reads as a
    clean day and buries the pattern), so only a count is honest here. ``observation``
    keeps that line — it is coverage of the *window*, never a denominator over rescues
    and never a per-low ledger.
    """

    total: int
    ic: int
    isf: int
    unattributed: int
    floor_u: float
    observation: Optional[RescueObservation] = None

    def to_dict(self) -> dict:
        return {
            "total": self.total,
            "ic": self.ic,
            "isf": self.isf,
            "unattributed": self.unattributed,
            "floor_u": self.floor_u,
            "observation": (self.observation.to_dict()
                            if self.observation is not None else None),
        }


@dataclass(frozen=True)
class ScenarioReport:
    """The whole ranked scenario payload — patterns + the episodes they reference.

    ``patterns`` are the surfaced (above-floor) levers, ranked. ``low_confidence``
    holds the collapsed wide/low-score patterns for #64's "show N low-confidence"
    expander. ``episodes`` is every episode keyed by id, so a pattern's
    ``hero_episode`` / ``occurrences`` ids resolve to full episode payloads without
    duplicating them per pattern. ``preempted_lows`` is the #172 masked-low count-
    object, surfaced on the Patterns view *alongside* the printed-low levers so one
    behavior isn't fragmented across two reads (ADR 0012).
    """

    schema_version: int
    window: Dict
    patterns: List[Pattern]
    low_confidence: List[Pattern]
    episodes: Dict[str, Episode]
    preempted_lows: PreemptedLows
    # The Diagnose active/tail split line (ADR 0032): a Lever with ``priority`` at/above
    # this is actionable now; below it collapses into the "why so few?" tail. Echoed so
    # the frontend splits behavioral + tuning Levers on one shared, config-owned line.
    priority_active_threshold: int = _DEFAULT_ACTIVE_THRESHOLD

    def to_dict(self) -> dict:
        return {
            "schema_version": self.schema_version,
            "window": self.window,
            "patterns": [p.to_dict() for p in self.patterns],
            "low_confidence": [p.to_dict() for p in self.low_confidence],
            "episodes": {eid: ep.to_dict() for eid, ep in self.episodes.items()},
            "preempted_lows": self.preempted_lows.to_dict(),
            "priority_active_threshold": self.priority_active_threshold,
        }
