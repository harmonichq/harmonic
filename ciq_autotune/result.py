"""The single versioned result object every analyzer writes into and every
interface renders from (ROADMAP §5, F3).

``analyze()`` (see :mod:`~ciq_autotune.analyze`) funnels basal, ISF, I:C and
behavioral analysis into one :class:`AnalysisResult`. The CLI renders it as text,
the HTTP API serves its JSON, and a future frontend consumes the same JSON — so
this schema, not the transport, *is* the contract. It is versioned
(:data:`SCHEMA_VERSION`) and JSON-serializable end to end via ``to_dict``.

Everything here is a frozen dataclass of plain data (numbers, strings, dicts, and
nested :class:`~ciq_autotune.uncertainty.Estimate`). No behaviour, no imports of
the analyzers — it is the bottom of the dependency graph so any layer can build
or consume it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional

from .uncertainty import Confidence, Estimate

# Bump on any breaking change to the shapes below; a frontend keys off this.
# v2 (ADR 0001): ISF collapsed to a single fasting estimate; `aggressiveness`
# (an ISF-only knob) removed from the result and SegmentEstimate.
# v3 (issue #58): Finding carries a structured `confidence` object (the Wilson
# analog of Estimate); `severity` is now derived from its score.
# v4 (issue #87): additive `consolidated_basal` — the 48 half-hour slots merged
# into a pump-programmable ≤16-segment profile. Optional/nullable, so older
# producers/consumers still read; the raw 48-slot `basal` is unchanged.
# v5 (issue #95): additive `settling` — per-parameter post-change "settling" state
# (a recently changed parameter whose post-change data hasn't cleared its
# analyzer's sufficiency gate yet). Empty list by default, so older
# producers/consumers still read.
# v6 (issue #125): the unbolused-carb log lands as a data layer — analyze() now
# threads a `carb_entries` exclusion stream to the analyzers/scenario engine. The
# result *shape* is unchanged this slice (the stream is ignored until slice 3), but
# the version marks the new backend generation the frontend keys off.
# v7 (issue #259): additive `tuning_levers` — one unified Lever `priority` (0–100) per
# tuning flavor (basal / ISF / I:C) computed on the backend in insulin currency, plus a
# `priority_active_threshold` echo, so tuning Levers interleave with the /scenarios
# behavioral Levers on one axis (ADR 0032). Empty list by default; older
# producers/consumers still read.
# v8 (issue #518): additive `ic_blocks` + `ic_runs` — the carb-ratio reading moves
# from per-segment rows to per-programmed-value BLOCKS measured over a fixed trailing
# 90 days, and `ic` rows become window-scoped display with `asserts_move` always
# False. Both fields default empty/0, so older producers/consumers still read.
SCHEMA_VERSION = 8

DISCLAIMER = (
    "Advisory only — not medical advice. Every number is shown with its "
    "uncertainty and the evidence behind it; nothing here changes a pump. "
    "Discuss any change with your endocrinologist."
)


@dataclass(frozen=True)
class Span:
    """The wall-clock extent of the data the analysis ran over."""

    start: Optional[str]
    end: Optional[str]

    def to_dict(self) -> dict:
        return {"start": self.start, "end": self.end}


@dataclass(frozen=True)
class EpochInfo:
    """Parameter setting-epoch metadata surfaced with the result.

    ``effective_days`` is the cut span for the basal setting-epoch summary and the
    full measurement span for ISF/I:C, whose setting epochs drive
    caveats/settling instead.
    """

    parameter: str
    start: Optional[str]
    unverified_before: Optional[str]
    effective_days: float

    def to_dict(self) -> dict:
        return {
            "parameter": self.parameter,
            "start": self.start,
            "unverified_before": self.unverified_before,
            "effective_days": round(self.effective_days, 2),
        }


@dataclass(frozen=True)
class Settling:
    """A parameter that recently changed and hasn't yet re-cleared its analyzer's
    sufficiency gate (#95).

    On Review a settling parameter's recommendation is *replaced* by this state:
    the change is too recent for the post-change data to support a fresh
    suggestion, and re-recommending would just propose reverting what was applied.

    ``since`` is the parameter's setting-epoch start (the detected change).
    ``gate`` is the analyzer config's :func:`describe_gate` descriptor — a
    structured, entirely code-driven account of what "enough data" means (criteria + unit + needed),
    interpolated from that config's own constants so it can never drift from the
    gate. ``have`` is the live post-change progress toward ``gate.needed`` (both
    ``None`` for a soft gate like ISF's, which shows no fabricated countdown)."""

    parameter: str            # "basal_rate" | "isf" | "carb_ratio"
    since: Optional[str]
    gate: Dict
    have: Optional[int]

    def to_dict(self) -> dict:
        return {
            "parameter": self.parameter,
            "since": self.since,
            "gate": self.gate,
            "have": self.have,
        }


@dataclass(frozen=True)
class DataQuality:
    """Row counts and plain-English caveats about the data behind the result."""

    counts: Dict[str, int]
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"counts": self.counts, "notes": list(self.notes)}


@dataclass(frozen=True)
class SlotEstimate:
    """One basal slot: programmed rate, estimated rate + CI, and a one-step note."""

    slot: int
    label: str
    current: Optional[float]
    estimate: Estimate
    recommended: Optional[float]
    annotation: str
    days: int
    evidence: Dict = field(default_factory=dict)
    # The real cap() verdict (``safety.Status``), carried so the deliverable path
    # and the Priority impact tally can key on whether a *direction* was asserted
    # rather than re-deriving it from ``estimate.wide`` and drifting (issue #264).
    # ``Optional`` + ``None`` default keeps legacy rows (and light test fixtures)
    # constructible; a ``None`` status reads as "no direction asserted".
    status: Optional["Status"] = None

    @property
    def asserts_move(self) -> bool:
        """Whether ``cap()`` asserted a directional move (RAISE/LOWER/CAPPED_*) for
        this slot — the single "this slot moves" predicate the consolidated
        deliverable and the Priority impact tally both key on (issue #264).

        A **held** slot reads ``False``: ``INSUFFICIENT`` (wide, thin-n, *or* the
        CI-spans-current case), ``NO_CHANGE``, ``NO_DATA``, ``NO_BASELINE``, or a
        ``None`` status. This closes the old ``not estimate.wide``-only gap — a
        CI-spans-current slot is now held everywhere, not just in the frontend."""
        return self.status is not None and self.status.actionable

    def to_dict(self) -> dict:
        status = str(self.status) if self.status is not None else None
        direction = None
        if self.asserts_move:
            from .safety import Status
            directions = {
                Status.RAISE: "raise",
                Status.CAPPED_RAISE: "raise",
                Status.LOWER: "lower",
                Status.CAPPED_LOWER: "lower",
                Status.HARM_LOWER: "lower",
            }
            try:
                direction = directions[self.status]
            except KeyError as exc:
                raise ValueError(
                    f"actionable status has no serialized direction: {self.status!r}"
                ) from exc
        return {
            "slot": self.slot,
            "label": self.label,
            "current": self.current,
            "estimate": self.estimate.to_dict(),
            "recommended": self.recommended,
            "annotation": self.annotation,
            "days": self.days,
            "evidence": self.evidence,
            "asserts_move": self.asserts_move,
            # Additive display field for the workstation verdict lane. Consumers
            # must not compare current/recommended to invent this direction.
            "direction": direction,
            # The cap() verdict's display string ("raise", "held (recurring-low
            # gate)", …) — the Settings audit spine keys each slot's state on it
            # (#495). None when no direction was ever computed (legacy rows).
            "safety_status": status,
        }


@dataclass(frozen=True)
class SegmentEstimate:
    """An ISF or I:C reading: measured-vs-programmed + CI + capped recommendation.

    I:C stays per-segment (one row per programmed segment); ISF is a single
    fasting estimate carried as a one-row list with ``start_min=0`` (ADR 0001)."""

    start_min: int
    label: str
    parameter: str            # "isf" | "carb_ratio"
    current: Optional[float]
    estimate: Estimate
    recommended: Optional[float]
    annotation: str
    evidence: Dict = field(default_factory=dict)
    # The analyzer-owned staging verdict. A live ISF row stamps the
    # post-harm-gate decision from `analyzers.isf.isf_asserts_move`; direction remains
    # separate evidence. For `carb_ratio` this is always False because segment rows are
    # pump-lane display and the live eligibility verdict rides the owning `IcBlock`.
    # `None` is reserved for legacy payloads and non-analyzer constructed rows that did
    # not record a decision.
    asserts_move: Optional[bool] = None
    # The `IcBlock` that owns this segment (#518) — its `block_id`, i.e. the block's
    # own `start_min`. `None` for ISF rows and legacy payloads. The surface uses it to
    # say which stretch reads for a segment that has no number of its own.
    block_id: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            "start_min": self.start_min,
            "label": self.label,
            "parameter": self.parameter,
            "current": self.current,
            "estimate": self.estimate.to_dict(),
            "recommended": self.recommended,
            "annotation": self.annotation,
            "evidence": self.evidence,
            "asserts_move": self.asserts_move,
            "block_id": self.block_id,
        }


@dataclass(frozen=True)
class IcBlock:
    """One carb-ratio **block**: the unit that decides (#518, adr-518-ic-meal-run-ledger).

    A block is a maximal contiguous group of programmed I:C segments sharing ONE
    value, on the CIRCULAR day (a wrap past midnight is one block drawn as two arcs;
    a flat profile degenerates to a single 24 h block). That is the unit the user can
    actually edit — adjacent segments carrying the same ratio move together on the
    pump — so it is the unit that asserts a move. :class:`SegmentEstimate` rows for
    ``carb_ratio`` survive as window-scoped pump-lane *display* with ``asserts_move``
    always ``False``; the one live eligibility flag rides here
    (:func:`~ciq_autotune.analyzers.ic.ic_asserts_move`), which is what stops the
    two-predicate drift that kept #273 and #465 alive across several passes.

    ``block_id`` **is** ``start_min`` — a stable identity for session dispositions
    that survives a re-render. ``end_min`` is arc-aware: ``end_min <= start_min``
    means the block wraps past midnight.

    Everything here is measured over a FIXED trailing 90 days, independent of the
    request's ``window_days`` (adr-518, decision 10) — the run ledger needs that depth
    or three of four pools starve. The segment rows above stay request-windowed, so
    two windows share one screen and each is labelled where it is shown.

    ``state`` is the server-computed read the client branches on directly rather than
    re-deriving from estimate wideness:

    * ``collecting`` — fewer than 90 observed days of history, or the pool is still
      growing toward ``IcConfig.min_runs``;
    * ``below-floor`` — 90 days observed and the pool sits in
      ``[min_runs, _MIN_SUPPORTED_BLOCK_RUNS)``: the number and band display with an
      honest "N of 8 meal runs" countdown, and nothing asserts;
    * ``unmeasured-alone`` — 90 days observed, meals were seen here, but every one of
      them chains into a neighbouring block, so no run ever sits wholly inside this
      one and the pool cannot fill by construction;
    * ``numeric`` — the pool cleared the floor; the eligibility gates decide.

    ``priority`` / ``recurrence`` / ``impact_u_day`` are server-computed (ADR 0032):
    the client picks the maximum PRIORITY among undisposed asserting blocks and never
    derives one, so server and client can never disagree about which block wears the
    flag. ``regime`` is the #481-shaped compare-side bracket (full-window versus
    on-regime-only); it is ``None`` wherever the bracket gate does not apply.
    ``days_observed`` is carried by collecting and asserting blocks so their support
    lines retain the run's age. ``days_needed`` is only a collecting-block countdown.
    """

    block_id: int
    start_min: int
    end_min: int
    label: str
    member_start_mins: List[int]
    current_values: List[float]
    estimate: Estimate
    recommended: Optional[float]
    n_runs: int
    n_meals: int
    state: str
    asserts_move: bool
    annotation: str
    impact_u_day: float = 0.0
    priority: int = 0
    recurrence: float = 0.0
    recurrence_channel: Optional[dict] = None
    harm: Dict = field(default_factory=dict)
    regime: Optional[Dict] = None
    days_observed: Optional[int] = None
    days_needed: Optional[int] = None
    evidence: Dict = field(default_factory=dict)
    # #523: display-only. Set (to the SAME hold annotation `annotation` already
    # carries — never a second copy of the gate logic) when this block is `numeric`,
    # its band excludes the programmed value, and `asserts_move` is False: a regime
    # bracket / harm / rescue gate is correctly withholding a move whose evidence
    # disagrees with the current setting. `None` whenever the band includes the
    # setting (the true agreement case) or the state isn't `numeric`. The frontend
    # verdict reads this before falling through to `confirm`, so a block whose
    # evidence disagrees with its setting can never render a check (#523).
    held_reason: Optional[str] = None

    @property
    def current(self) -> Optional[float]:
        """The block's single programmed value (blocks are single-valued by definition)."""
        return self.current_values[0] if self.current_values else None

    def to_dict(self) -> dict:
        direction = None
        if self.asserts_move and self.current is not None and self.recommended is not None:
            direction = "raise" if self.recommended > self.current else "lower"
        d = {
            "block_id": self.block_id,
            "start_min": self.start_min,
            "end_min": self.end_min,
            "label": self.label,
            "member_start_mins": list(self.member_start_mins),
            "current_values": list(self.current_values),
            "estimate": self.estimate.to_dict(),
            "recommended": self.recommended,
            "n_runs": self.n_runs,
            "n_meals": self.n_meals,
            "state": self.state,
            "asserts_move": self.asserts_move,
            # Additive display field for the workstation verdict lane. The block
            # predicate has already admitted the move before a direction is named.
            "direction": direction,
            "annotation": self.annotation,
            "impact_u_day": round(self.impact_u_day, 4),
            "priority": self.priority,
            "recurrence": round(self.recurrence, 4),
            "recurrence_channel": self.recurrence_channel,
            "harm": self.harm,
            "regime": self.regime,
            "evidence": self.evidence,
            "held_reason": self.held_reason,
        }
        # Collecting and asserting blocks carry the observed run age; only the
        # collecting state carries a countdown target (see the class docstring).
        if self.days_observed is not None:
            d["days_observed"] = self.days_observed
        if self.days_needed is not None:
            d["days_needed"] = self.days_needed
        return d


@dataclass(frozen=True)
class ProfileSegment:
    """One segment of the consolidated, pump-programmable **four-parameter** profile
    (#98, grew out of the basal-only #87 ``BasalSegment``).

    A Tandem profile is one ``tDependentSegs`` array where each segment carries
    basal + ISF + I:C + target at a single ``start_min`` (see ``settings.py``), so a
    deliverable consolidation must name all four at every boundary. ``start_min`` is
    the 30-min-aligned wall-clock start; the segment runs until the next segment's
    start (or midnight). Each of ``basal_rate`` (U/h), ``isf`` (mg/dL per U),
    ``carb_ratio`` (g per U), ``target_bg`` (mg/dL) is either the segment's
    recommendation or the value carried forward from the current programmed profile;
    ``None`` means neither a recommendation nor a programmed value was available.

    ``basal_slots`` are the raw 48-slot indices merged into this segment's basal, and
    ``basal_max_deviation`` is the largest gap (U/h) between ``basal_rate`` and any of
    the raw per-slot deliverable rates it covers — the basal round-trip error the
    merge introduced (the other three params are step functions, not slot medians, so
    they carry no deviation)."""

    start_min: int
    label: str
    basal_rate: Optional[float] = None
    isf: Optional[float] = None
    carb_ratio: Optional[float] = None
    target_bg: Optional[float] = None
    basal_slots: List[int] = field(default_factory=list)
    basal_max_deviation: float = 0.0

    def to_dict(self) -> dict:
        return {
            "start_min": self.start_min,
            "label": self.label,
            "basal_rate": self.basal_rate,
            "isf": self.isf,
            "carb_ratio": self.carb_ratio,
            "target_bg": self.target_bg,
            "basal_slots": list(self.basal_slots),
            "basal_max_deviation": self.basal_max_deviation,
        }


@dataclass(frozen=True)
class ConsolidatedProfile:
    """The current recommendations rolled into a single deliverable ≤16-segment
    **four-parameter** schedule (#98). Boundaries are the union of change boundaries
    across basal / ISF / I:C / target; each segment carries all four values, with
    unchanged params carried forward from the current programmed profile. Additive to
    the raw ``basal`` / ``isf`` / ``ic`` views, not a replacement.

    ``forced_merges`` is true when the union of boundaries exceeded ``max_segments``
    and the builder had to merge otherwise-distinct adjacent segments to fit the
    pump's cap; ``note`` then carries the plain-English data-quality caveat (with the
    worst forced-merge basal deviation)."""

    segments: List[ProfileSegment]
    max_segments: int
    noise_floor: float
    total_daily_basal: float
    forced_merges: bool = False
    note: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "segments": [s.to_dict() for s in self.segments],
            "segment_count": len(self.segments),
            "max_segments": self.max_segments,
            "noise_floor": self.noise_floor,
            "total_daily_basal": self.total_daily_basal,
            "forced_merges": self.forced_merges,
            "note": self.note,
        }


@dataclass(frozen=True)
class Occurrence:
    """One concrete instance behind a Finding's aggregate evidence — a specific
    timestamp a user can jump to in the Daily report, plus a one-line detail."""

    t: datetime
    detail: str

    def to_dict(self) -> dict:
        return {"t": self.t.isoformat(), "detail": self.detail}


@dataclass(frozen=True)
class Finding:
    """One behavioral observation: severity, evidence, plain-English suggestion.

    ``confidence`` is the Finding-side analog of :class:`Estimate` — a Wilson-scored
    ``k``-of-``n`` rate times an effect size (see
    :class:`~ciq_autotune.uncertainty.Confidence`). When a detector supplies it,
    pass ``severity=confidence.severity`` so the string stays a rendered convenience
    derived from the structured score. Detectors that haven't adopted it yet leave
    ``confidence`` ``None`` and set ``severity`` directly (issues #59/#60/#62/#63)."""

    detector: str
    severity: str             # "info" | "low" | "medium" | "high"
    summary: str
    evidence: Dict = field(default_factory=dict)
    # Most-recent-first, capped by the producing analyzer so the drill-down list
    # stays scannable even for a long-window, high-frequency finding.
    occurrences: List[Occurrence] = field(default_factory=list)
    confidence: Optional[Confidence] = None

    def to_dict(self) -> dict:
        return {
            "detector": self.detector,
            "severity": self.severity,
            "summary": self.summary,
            "evidence": self.evidence,
            "occurrences": [o.to_dict() for o in self.occurrences],
            "confidence": self.confidence.to_dict() if self.confidence else None,
        }


@dataclass(frozen=True)
class TuningLever:
    """One tuning flavor's unified Lever **Priority** (0–100) on the /analyze payload (ADR 0032).

    Basal, ISF and I:C each roll up into *one* Lever (all of a flavor's block/segment
    changes stage into one Plan — the Diagnose decision #1), scored on the same axis the
    /scenarios behavioral Levers carry so the frontend interleaves them in one queue.

    ``parameter`` is ``"basal_rate" | "isf" | "carb_ratio"``. ``impact`` and
    ``recurrence`` are the two ``[0, 1]`` factors behind ``priority`` (both surfaced so
    the resting-card bars and tier-2 derivation render from server data). ``impact_u_day``
    is the raw insulin-currency magnitude (U/day implicated by the recommendation, plus the
    I:C masker rescue equivalent) before the shared soft-saturation curve, kept for the
    derivation copy. See ADR 435 and ``ScenarioConfig``.
    """

    parameter: str
    title: str
    impact: float
    recurrence: float
    priority: int
    impact_u_day: float
    # The `start_min` of the segment that earned this Lever's score, when a flavor rolls up
    # per-segment rows (I:C, #428). The frontend renders *this* row, never re-selecting one by
    # raw divergence — the eligibility policy lives only in `ic_lever`. `None` for flavors with
    # no per-segment headline (basal/ISF today) and for legacy payloads.
    headline_start_min: Optional[int] = None
    # The winning **recurrence channel** (#438): the k-of-n evidence stream the `recurrence`
    # factor was measured from, threaded so the frontend can transcribe a plain-count line
    # instead of echoing the Wilson bound. `{"kind", "k", "n"}` for a counted channel, or a
    # bare `{"kind": "held" | "basal_thin"}` marker; `k`/`n` are the **observed** counts
    # (night/meal channels) or the window (day channels), never the padded Wilson denominator.
    # Additive/optional — `None` on legacy payloads, so older stored JSON still validates.
    recurrence_channel: Optional[dict] = None

    def to_dict(self) -> dict:
        d = {
            "parameter": self.parameter,
            "title": self.title,
            "impact": round(self.impact, 4),
            "recurrence": round(self.recurrence, 4),
            "priority": self.priority,
            "impact_u_day": round(self.impact_u_day, 4),
        }
        if self.headline_start_min is not None:
            d["headline_start_min"] = self.headline_start_min
        if self.recurrence_channel is not None:
            d["recurrence_channel"] = self.recurrence_channel
        return d


@dataclass(frozen=True)
class AnalysisResult:
    """The whole analysis, versioned and JSON-serializable."""

    schema_version: int
    generated_at: str
    window_days: int
    span: Span
    epochs: List[EpochInfo]
    data_quality: DataQuality
    basal: List[SlotEstimate]
    isf: List[SegmentEstimate]
    ic: List[SegmentEstimate]
    behavioral: List[Finding]
    disclaimer: str = DISCLAIMER
    # Additive #87 view. Optional so a producer that hasn't populated it yet (and
    # older stored JSON) still validate; interfaces derive it from `basal` when None.
    consolidated_basal: Optional[ConsolidatedProfile] = None
    # Additive #95 view: per-parameter post-change "settling" states. Empty when no
    # parameter is settling; older stored JSON simply omits the key.
    settling: List[Settling] = field(default_factory=list)
    # Additive #259 view: the unified per-flavor tuning Lever priorities (ADR 0032).
    # Empty when the facade hasn't populated them; older stored JSON omits the key.
    tuning_levers: List[TuningLever] = field(default_factory=list)
    # The Diagnose active/tail split line (ADR 0032), echoed so the frontend splits
    # tuning + behavioral Levers on one config-owned line. Mirrors the /scenarios echo.
    priority_active_threshold: int = 30
    # Additive #518 view: the per-programmed-value carb-ratio blocks — the unit that
    # decides. Measured over a fixed trailing 90 days, unlike `ic` above (see
    # :class:`IcBlock`). Empty when no programmed I:C schedule is known.
    ic_blocks: List[IcBlock] = field(default_factory=list)
    # The ONE whole-day meal-run total the settling countdown speaks in (#518). A
    # single top-level number by contract: never summed across `ic` rows or
    # `ic_blocks` (a run can span blocks, so a sum would double-count it).
    ic_runs: int = 0

    def to_dict(self) -> dict:
        return {
            "schema_version": self.schema_version,
            "generated_at": self.generated_at,
            "window_days": self.window_days,
            "span": self.span.to_dict(),
            "epochs": [e.to_dict() for e in self.epochs],
            "data_quality": self.data_quality.to_dict(),
            "basal": [s.to_dict() for s in self.basal],
            "isf": [s.to_dict() for s in self.isf],
            "ic": [s.to_dict() for s in self.ic],
            "behavioral": [f.to_dict() for f in self.behavioral],
            "disclaimer": self.disclaimer,
            "consolidated_basal": (
                self.consolidated_basal.to_dict()
                if self.consolidated_basal is not None else None
            ),
            "settling": [s.to_dict() for s in self.settling],
            "tuning_levers": [t.to_dict() for t in self.tuning_levers],
            "priority_active_threshold": self.priority_active_threshold,
            "ic_blocks": [b.to_dict() for b in self.ic_blocks],
            "ic_runs": self.ic_runs,
        }

    def to_json(self, indent: Optional[int] = None) -> str:
        return json.dumps(self.to_dict(), indent=indent)
