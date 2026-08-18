"""Carbs-on-board reconstructed from logged grams — static, forward, decay-only.

Sibling to :mod:`~ciq_autotune.insulin`'s ``BolusIob``. Governed by **ADR 0011**
(COB is static, forward, exclusion-only; never re-fit to CGM) and the ``COB``
glossary entry — read those before touching this. This module *implements* that
decision; it does not re-decide it.

The hard lines the shape here enforces structurally:

* **COB is logged grams + the clock, never CGM.** :class:`CarbsOnBoard` takes
  ``(t, grams, rate)`` doses and nothing else, so it *cannot* shape-infer carb
  behavior from BG even by accident — the ADR 0008 / 0011 firewall is the type
  signature, not a code review rule.
* **Static forward decay only.** A constant-rate (oref0-style) decay
  ``max(0, grams − rate·(t − onset))``. The rate/onset/guard are **borrowed
  priors** (oref0's ~20–30 g/h band), never fitted or "calibrated" against this
  user's BG curves — calibrating would reintroduce shape inference.
* **Exclusion only.** COB moves the boundary of what counts as clean data. It is
  never a regressor and never a dosing/coaching number. A missed entry leaves
  data exactly as contaminated as today, never worse (#127 honesty baseline).

``rate`` is resolved by the caller (:func:`carb_doses`), so this class never sees
a stream tag either — it holds decay arithmetic and nothing about provenance.
"""

from __future__ import annotations

import bisect
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

from .events import CarbEntry

# Borrowed priors (oref0's ~20–30 g/h band), NOT user-facing settings and NOT
# calibrated against this user's BG curves. Conservative (longer-mask) direction
# chosen: over-masking only spends clean minutes, it never contaminates. An agent
# may adjust one of these ONLY if the layer-2 backtest shows it regresses tuning,
# and must report it (issue #169).
MEAL_CARB_RATE_G_PER_H = 20.0   # announced snacks (`rise-prompt` Carb-log entries)
FAST_CARB_RATE_G_PER_H = 40.0   # `low-prompt` / `manual` Carb-log entries
CARB_ONSET_DELAY_MIN = 15.0     # grams sit at full for this long before decaying
CARB_TRAILING_GUARD_MIN = 45.0  # COB must read 0 this long before a minute clears


class CarbsOnBoard:
    """Total carbs-on-board from logged grams, evaluable at any instant.

    Built from ``(t, grams, rate)`` doses — ``t`` the logged clock time, ``grams``
    the logged amount, ``rate`` the g/h decay the caller picked for that dose's
    stream (:func:`carb_doses`). ``at(t)`` sums each prior dose's remaining grams
    under a constant-rate decay after a shared ``onset`` delay; doses that have
    fully cleared are skipped via a bisect window, mirroring ``BolusIob.at``. With
    no doses, COB is 0 everywhere — "no carbs on board".
    """

    def __init__(self, doses: List[Tuple[datetime, float, float]], onset_min: float):
        self.onset = float(onset_min)
        triples = sorted(
            (t, float(g), float(r))
            for t, g, r in doses
            if g and g > 0 and r and r > 0
        )
        self.times = [x[0] for x in triples]
        self.grams = [x[1] for x in triples]
        self.rates = [x[2] for x in triples]
        # Longest a dose can stay on board: onset + grams/rate (hours→minutes). The
        # bisect lower bound in at()/cleared_since() only needs to look back this far.
        self._max_window = timedelta(minutes=(
            self.onset + max(
                (g / r * 60.0 for g, r in zip(self.grams, self.rates)),
                default=0.0,
            )
        ))

    def at(self, t: datetime) -> float:
        """Grams still on board at instant ``t`` (0 before any dose, 0 once cleared)."""
        lo = bisect.bisect_left(self.times, t - self._max_window)
        hi = bisect.bisect_right(self.times, t)
        total = 0.0
        for k in range(lo, hi):
            elapsed = (t - self.times[k]).total_seconds() / 60.0 - self.onset
            if elapsed <= 0.0:
                total += self.grams[k]          # still in the onset delay
            else:
                remaining = self.grams[k] - self.rates[k] * elapsed / 60.0
                if remaining > 0.0:
                    total += remaining
        return total

    def cleared_since(self, t: datetime, guard_min: float) -> bool:
        """True iff COB has been 0 for at least ``guard_min`` up to ``t``.

        This is the gate consumers actually call: not "is COB 0 right now" but
        "has it stayed 0 long enough to trust". The trailing guard absorbs
        constant-rate curve error and the high-fat-meal tail (the pizza problem)
        without trusting the zero-crossing to the minute — a clearance floor, not a
        richer curve (a richer curve would imply absorption-shape knowledge we do
        not have; ADR 0011). Equivalent to ``at(x) == 0`` for all ``x`` in
        ``[t − guard, t]``, computed from clearance times so a small dose that
        landed *and* cleared inside the guard window still blocks.
        """
        threshold = t - timedelta(minutes=guard_min)
        lo = bisect.bisect_left(self.times, threshold - self._max_window)
        hi = bisect.bisect_right(self.times, t)
        for k in range(lo, hi):
            clear_t = self.times[k] + timedelta(
                minutes=self.onset + self.grams[k] / self.rates[k] * 60.0)
            if clear_t > threshold:
                return False
        return True


def carb_log_exclusion_spans(
    carb_entries: Optional[List[CarbEntry]] = None,
    *,
    meal_rate: float = MEAL_CARB_RATE_G_PER_H,
    fast_rate: float = FAST_CARB_RATE_G_PER_H,
    onset_min: float = CARB_ONSET_DELAY_MIN,
    guard_min: float = CARB_TRAILING_GUARD_MIN,
    flat_lookback_min: float = 300.0,
) -> List[Tuple[datetime, datetime]]:
    # Mirrors fasting_steps' two-path drop: grams-bearing entries are excluded for
    # onset+grams/rate·60+guard (COB clearance + guard); NULL-gram entries use the
    # flat carb_lookback_min window (never decayed, ADR 0011 §2). Overlaps merged.
    # flat_lookback_min must match IsfConfig.carb_lookback_min (default 300).
    raw: List[Tuple[datetime, datetime]] = []
    for c in (carb_entries or []):
        t = c.t
        if c.grams is None:
            # NULL-gram: flat lookback, same as the flat_carb_times guard in fasting_steps.
            end = t + timedelta(minutes=flat_lookback_min)
        elif c.grams <= 0:
            # Zero/negative grams: no COB, not in flat_carb_times — fasting_steps skips it.
            continue
        else:
            rate = meal_rate if c.source == "rise-prompt" else fast_rate
            cob_clear_min = onset_min + c.grams / rate * 60.0
            end = t + timedelta(minutes=cob_clear_min + guard_min)
        raw.append((t, end))
    if not raw:
        return []
    raw.sort()
    merged: List[Tuple[datetime, datetime]] = [raw[0]]
    for lo, hi in raw[1:]:
        prev_lo, prev_hi = merged[-1]
        if lo <= prev_hi:
            merged[-1] = (prev_lo, max(prev_hi, hi))
        else:
            merged.append((lo, hi))
    return merged


def carb_doses(
    carb_entries: Optional[List[CarbEntry]] = None,
    *,
    meal_rate: float = MEAL_CARB_RATE_G_PER_H,
    fast_rate: float = FAST_CARB_RATE_G_PER_H,
) -> List[Tuple[datetime, float, float]]:
    """Stream→rate policy: the unbolused **Carb log** → ``(t, grams, rate)`` doses.

    The one place a stream tag becomes a decay rate, so :class:`CarbsOnBoard` stays
    provenance-blind (ADR 0011 §1). Rate is keyed on ``source``:

    * ``rise-prompt`` (an announced snack) → **meal rate**
    * ``low-prompt`` / ``manual`` (a low treatment / quick carbs) → **fast rate**
    * NULL grams (``certainty == 'unknown'``) → **dropped**; never decayed, the
      consumer keeps its flat window (ADR 0011 §2, #127 honesty baseline).

    **Pump bolus-attached carbs are deliberately NOT accepted here** (the type
    signature enforces it, like the CGM firewall above). A carb-bearing bolus must
    be masked for its whole insulin *excursion* (~DIA), not just carb absorption:
    the meal bolus is sized for the carbs, so BG spends ~5 h resolving the
    excursion, and that post-meal descent — if admitted — reads as false insulin
    potency and collapses the ISF fit (measured on real data: feeding bolus carbs
    into COB dragged fasting ISF sharply lower by admitting ~1,500 post-meal-descent
    minutes; #169). Both consumers therefore mask boluses by *insulin* (ISF via its
    flat ~DIA carb-bolus lookback; the basal filter via bolus IOB) and hand COB the
    Carb-log stream only. See the wiring notes in isf.py / model.py.
    """
    doses: List[Tuple[datetime, float, float]] = []
    for c in (carb_entries or []):
        if c.grams is None or c.grams <= 0:
            continue  # NULL-gram entry: never decayed, consumer keeps flat window
        rate = meal_rate if c.source == "rise-prompt" else fast_rate
        doses.append((c.t, float(c.grams), rate))
    return doses
