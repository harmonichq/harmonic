"""Evidence honesty vocabulary shared by every instance classifier (#70 §4).

Every judgment an instance classifier makes carries an :class:`EvidenceTier` so
the scenario engine can render it honestly:

* ``OBSERVED`` — a hard fact straight from the feed (a bolus of 10 U at 15:48; BG
  hit 64). Rendered solid, asserted.
* ``INFERRED`` — shape-derived and therefore hedged ("likely rescue carbs";
  "bolused into a *real* rise"). Rendered muted/dashed, never asserted as fact.
  Rescue carbs are invisible on Tandem Source (ADR 0003), so anything that leans
  on them is at best ``INFERRED``, gated on the *observable* low/suspend.
* ``NOT_IN_DATA`` — an explicit unknowable, flagged as such.

A classifier's :class:`Verdict` is deliberately tiny: a boolean judgment, a
one-line human ``detail``, and the tier that judgment rests on. The scenario
engine layers episodes, levers, confidence and severity on top; none of that
lives here.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class EvidenceTier(str, Enum):
    """How firmly a classifier's judgment is grounded in the feed (#70 §4).

    Subclasses ``str`` so it serializes to a plain string in a payload and
    compares equal to its value — ``EvidenceTier.OBSERVED == "observed"``.
    """

    OBSERVED = "observed"
    INFERRED = "inferred"
    NOT_IN_DATA = "not_in_data"


class SilenceReason(str, Enum):
    """Why a classifier's judgment did **not** fire — a closed taxonomy (ADR 0009).

    Every episode ends one of two ways: the engine attributes a
    :class:`~ciq_autotune.analyzers.scenario.levers.Lever` (the one actionable
    cause) or it stays silent. This enum makes the *why* of a silence first-class:
    each ``matched=False`` :class:`Verdict` carries the member that names why the
    behavior drew no lever, so #152 (per-day view) and #157 (Guide) read one source
    of truth instead of each re-deriving free-text.

    The set is **closed** — eight members, mirroring the honesty tier each branch
    already returns. Adding one is a deliberate act, like adding a ``Lever``.
    Subclasses ``str`` so it serializes to a plain string in a payload.

    * ``INSUFFICIENT_DATA`` — the window was too sparse to judge (``NOT_IN_DATA``).
    * ``NO_TRIGGER`` — the behavior plainly didn't happen: a flat slope, no
      stack/correction/low, no meaningful IOB tail — a genuinely clean opportunity
      (``OBSERVED``).
    * ``UNDER_THRESHOLD`` — it happened but fell short of the firing bar; the
      near-miss where a mis-tuned threshold hides (``OBSERVED``).
    * ``UPSTREAM_CAUSE`` — an observable recent low and/or defensive suspend (the
      shared context gate) explains the move; a recovery, not the behavior
      (``INFERRED``).
    * ``PRIOR_HIGH_BASELINE`` — the rise was from an already-high start, not
      from-flat (``OBSERVED``).
    * ``OWNED_BY_PRIOR_BOLUS`` — a completed carb bolus in the recent lookback owns
      the rise this bolus dosed into; a real carb excursion already covered by an
      earlier dose, not a late meal bolus (``INFERRED``; #167).
    * ``OWNED_BY_ANNOUNCED_MEAL`` — a substantial announced meal at the low owns the
      rebound, so fast-carb treatment cannot be isolated (``INFERRED``; ADR 225).
    * ``HORIZON_EXPIRED`` — the outcome never arrived inside the classifier's window
      (``OBSERVED``).

    Deliberately **not** a member: being *outranked* — an episode whose behavior
    matched but lost to an earlier-driver lever. That is an attribution-layer
    consequence decided across anchors (#152), not something one ``Verdict`` can see.
    """

    INSUFFICIENT_DATA = "insufficient_data"
    NO_TRIGGER = "no_trigger"
    UNDER_THRESHOLD = "under_threshold"
    UPSTREAM_CAUSE = "upstream_cause"
    PRIOR_HIGH_BASELINE = "prior_high_baseline"
    OWNED_BY_PRIOR_BOLUS = "owned_by_prior_bolus"
    OWNED_BY_ANNOUNCED_MEAL = "owned_by_announced_meal"
    HORIZON_EXPIRED = "horizon_expired"


@dataclass(frozen=True)
class Verdict:
    """The base result every instance classifier returns.

    * ``matched`` — did this classifier's behavior apply to this instance? (Is
      *this* meal late? Did *this* suspend precede a real low?)
    * ``detail`` — a single plain-English line explaining the judgment, suitable
      for an episode step.
    * ``evidence_tier`` — the honesty tier the judgment rests on (see
      :class:`EvidenceTier`).
    * ``silence_reason`` — when ``matched`` is False, the closed-taxonomy member
      naming *why* this judgment didn't fire (see :class:`SilenceReason`); a matched
      verdict leaves it ``None``. ``detail`` still carries the human string with the
      values (numbers); this is the machine-readable why beside it (ADR 0009).

    Concrete classifiers subclass this to attach their own instance-specific
    fields (e.g. the pre-bolus slope, the explaining cause) without redefining
    the shared shape.
    """

    matched: bool
    detail: str
    evidence_tier: EvidenceTier
    silence_reason: Optional[SilenceReason] = None
