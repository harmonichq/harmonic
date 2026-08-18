"""Unified Lever **Priority** — one 0–100 score for tuning + behavioral Levers (ADR 0032).

The Diagnose surface (#246) ranks tuning and behavioral Levers in *one* honest
queue, so both flavors must land on a single scoring axis computed identically. The
locked mockup fabricated it client-side with placeholder constants; this module is
the backend home ADR 0032 pins.

    priority = 100 · √(impact · confidence_adjusted_recurrence)

Two factors, geometric mean — one weak factor drags the whole score down (that is
what lets a solid habit beat a thin setting). Both factors are unitless in ``[0, 1]``;
each flavor maps its own evidence onto them (see the builders):

* **Behavioral** — impact = ``Confidence.effect``; recurrence = the Wilson lower
  bound ``Confidence.lo``. Because ``√(effect·lo)`` is monotonic in the existing
  ``score = lo·effect``, behavioral *ranking is unchanged* — this only puts tuning
  on the same axis (:func:`behavioral_priority`).
* **Tuning** (basal / ISF / I:C) — impact is one shared *insulin currency* (U/day
  implicated by the recommendation, with I:C's documented masker rescue equivalent)
  mapped to ``[0, 1)`` by the ADR 435 soft curve; recurrence is a Wilson lower
  bound over the same machinery behavioral uses (built in
  :mod:`ciq_autotune.analyzers.tuning_priority`, which reads the result rows).

This core stays pure (stdlib + duck-typed ``Confidence``) so the scenario payload can
import it without pulling the result layer.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


def _clamp01(x: float) -> float:
    """Clamp to ``[0, 1]`` — a factor outside the unit interval is a mis-scaled input."""
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return x


def priority_score(impact: float, recurrence: float) -> int:
    """``round(100 · √(impact · recurrence))`` with both factors clamped to ``[0, 1]``.

    The single shared function both flavors call (ADR 0032). The geometric mean means
    either factor near zero pulls the score to zero — a big effect that almost never
    recurs, or a nightly habit with negligible impact, both correctly rank low.
    """
    return round(100.0 * math.sqrt(_clamp01(impact) * _clamp01(recurrence)))


@dataclass(frozen=True)
class Priority:
    """A Lever's unified Priority: the two factor inputs + the derived 0–100 score.

    Carries the factors (not just the score) so the resting-card factor bars and the
    tier-2 derivation render from server data instead of re-deriving them (ADR 0032).
    """

    impact: float
    recurrence: float

    @property
    def value(self) -> int:
        return priority_score(self.impact, self.recurrence)

    def to_dict(self) -> dict:
        return {
            "priority": self.value,
            "impact": round(_clamp01(self.impact), 4),
            "recurrence": round(_clamp01(self.recurrence), 4),
        }


def behavioral_priority(confidence) -> Priority:
    """The :class:`Priority` for a behavioral Lever's #58 ``Confidence`` (ADR 0032).

    impact = ``effect`` (how bad each occurrence is), recurrence = ``lo`` (the Wilson
    lower bound that already fuses "how often" and "how sure"). ``√(effect·lo)`` is
    monotonic in the existing ``score = lo·effect``, so ordering behavioral Levers by
    priority reproduces their ordering by score exactly.
    """
    return Priority(impact=confidence.effect, recurrence=confidence.lo)
