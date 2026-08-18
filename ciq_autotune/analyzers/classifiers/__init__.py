"""Per-instance behavioral classifiers (scenario-engine epic #70, layer 2).

Each classifier is a **pure function** ``(instance, context) -> Verdict`` that
judges *one* instance — "is **this** meal late? did **this** suspend precede a
real low?" — and returns a verdict, a plain-English detail, and an
``EvidenceTier`` (see :mod:`.evidence`). The scenario engine (#70,
:mod:`ciq_autotune.analyzers.scenario`) consumes these verdicts to assemble
episodes and attribute levers.

Layout — one file per classifier, all sharing the primitives in this package:

* :mod:`.evidence` — the 3-tier honesty vocabulary (``observed`` /
  ``inferred`` / ``not_in_data``) plus the base ``Verdict`` shape every
  classifier returns.
* :mod:`.context_gate` — the **shared context gate**: does an *observable
  upstream cause* (a recent CGM low and/or a defensive-suspend episode) explain a
  pre-bolus rise? Reused by every classifier that must not mistake a
  rescue-rebound / post-low / post-suspend recovery for a behavior.
* :mod:`.late_bolus`, :mod:`.missed_meal`, :mod:`.correction_stacking`,
  :mod:`.correction_on_iob`, :mod:`.suspend`,
  :mod:`.carb_undercount` — the instance classifiers (#71–#76, #150) the engine
  wires into episodes.

The parallel-build lane rule ("no engine wiring here") is lifted now that the
engine consumes these — this package re-exports the whole classifier roster so the
engine imports from one place.
"""

from __future__ import annotations

from .carb_undercount import CarbUndercountVerdict, classify_carb_undercount
from .context_gate import (
    GateResult,
    UpstreamCause,
    upstream_cause,
)
from .correction_on_iob import (
    CorrectionOnIobVerdict,
    classify_correction_on_iob,
)
from .correction_stacking import (
    CorrectionStackingVerdict,
    classify_correction_stacking,
)
from .evidence import EvidenceTier, SilenceReason, Verdict
from .late_bolus import LateBolusVerdict, classify_late_bolus
from .missed_meal import MissedMealVerdict, classify_missed_meal
from .suspend import SuspendVerdict, classify_suspend

__all__ = [
    # honesty vocabulary + base verdict
    "EvidenceTier",
    "SilenceReason",
    "Verdict",
    # shared context gate
    "GateResult",
    "UpstreamCause",
    "upstream_cause",
    # the instance classifiers + their verdicts
    "LateBolusVerdict",
    "classify_late_bolus",
    "MissedMealVerdict",
    "classify_missed_meal",
    "CorrectionStackingVerdict",
    "classify_correction_stacking",
    "CorrectionOnIobVerdict",
    "classify_correction_on_iob",
    "SuspendVerdict",
    "classify_suspend",
    "CarbUndercountVerdict",
    "classify_carb_undercount",
]
