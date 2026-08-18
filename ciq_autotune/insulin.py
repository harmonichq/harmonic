"""Insulin-on-board reconstructed from delivered boluses.

Tandem Source does not expose a dense IOB telemetry — the old t:connect WS2
"EventID 81" series (a total-IOB snapshot every ~5 min) has no equivalent in the
new event log; IOB only rides on sparse per-bolus / per-BG-reading events. So to
feed the clean-window filter we reconstruct the IOB contributed by **boluses**
from the bolus log and a standard insulin-activity curve.

Why bolus-only (not basal + bolus):

* The clean-window test is "has the meal/correction insulin cleared?" — a
  question about *bolus* insulin. Basal is the thing we're trying to measure, not
  exclude.
* Total IOB never returns to zero (basal leaves a floating equilibrium that
  drifts with the rate and time of day), which forced the old model's IOB
  threshold to be a fudge. Bolus-only IOB decays cleanly to ~0, so the gate is an
  absolute "essentially no bolus on board" test.
* The same bolus-activity curve is what later ICR / ISF tuning needs, so building
  it here is reusable scaffolding rather than a throwaway.

The curve is the Loop/oref exponential model, parameterized by time-to-peak
activity and duration of insulin action (DIA). Defaults target rapid analogs
(Novolog/Humalog: peak ~75 min, DIA ~300 min); Fiasp users would lower the peak.
The curve only gates window boundaries here, so modest parameter error is
harmless — but it must be validated before it's trusted to *quantify* ICR/ISF.
"""

from __future__ import annotations

import bisect
import math
from datetime import datetime, timedelta
from typing import List, Tuple

from .events import BasalEvent, BolusEvent


def iob_fraction(minutes: float, peak: float, dia: float) -> float:
    """Fraction (0..1) of one unit still on board ``minutes`` after delivery.

    Exponential insulin-activity model. ``peak`` (time to peak activity) and
    ``dia`` (duration of insulin action) are in minutes, with ``0 < peak < dia/2``.
    """
    if minutes <= 0:
        return 1.0
    if minutes >= dia:
        return 0.0
    tau = peak * (1 - peak / dia) / (1 - 2 * peak / dia)
    a = 2 * tau / dia
    s = 1 / (1 - a + (1 + a) * math.exp(-dia / tau))
    t = minutes
    return 1 - s * (1 - a) * (
        (t * t / (tau * dia * (1 - a)) - t / tau - 1) * math.exp(-t / tau) + 1
    )


# Pump-matched, units-accurate bolus-IOB DIA (ADR 0013). Every consumer that needs
# a real IOB *quantity* — the behavioral classifiers, ISF/IC, the #181 meal balance
# sheet — imports this. Matches the pump's reported IOB to a small bias near its peak.
# Distinct from the Gate DIA (180 min, ModelConfig.insulin_dia_min), which is the
# clean-window filter's fast-clear threshold.
ACCOUNTING_DIA_MIN = 300.0

# Time-to-peak activity for the Accounting-DIA curve (ADR 0013 holds peak constant
# at 75 across both curves). Co-located with ACCOUNTING_DIA_MIN so accounting
# consumers (#181) import one curve from one home instead of re-declaring the pair;
# the classifiers still keep their own local `IOB_PEAK_MIN = 75.0` for now.
ACCOUNTING_PEAK_MIN = 75.0

# Sub-dose cadence for spreading an extended (square/dual-wave) bolus across its
# delivery window — 5 min to match the basal micro-dose step (see basal_microdoses).
_EXTENDED_SUBDOSE_MIN = 5.0


def _extended_subdoses(
    t0: datetime, amt: float, duration_min: int
) -> List[Tuple[datetime, float]]:
    """Spread ``amt`` uniformly over ``[t0, t0 + duration_min]`` as sub-doses.

    An extended bolus is delivered over ``duration_min``, not all at ``t0``. We
    bucket the window at :data:`_EXTENDED_SUBDOSE_MIN` cadence and place a sub-dose
    at each bucket's midpoint carrying that bucket's share of ``amt`` (so the
    amount-weighted delivery centroid lands at ``t0 + duration_min/2``). The last
    bucket absorbs the remainder, so the sub-doses sum exactly to ``amt``.
    """
    n = math.ceil(duration_min / _EXTENDED_SUBDOSE_MIN)
    subs: List[Tuple[datetime, float]] = []
    placed = 0.0
    for i in range(n):
        start = i * _EXTENDED_SUBDOSE_MIN
        end = min((i + 1) * _EXTENDED_SUBDOSE_MIN, float(duration_min))
        if i == n - 1:
            a = amt - placed  # remainder → last bucket, exact conservation
        else:
            a = amt * (end - start) / duration_min
            placed += a
        subs.append((t0 + timedelta(minutes=(start + end) / 2.0), a))
    return subs


class BolusIob:
    """Total bolus insulin-on-board, evaluable at any instant.

    Built from store bolus rows (``t`` = delivery time, ``insulin`` = units
    delivered). ``at(t)`` sums each prior bolus's remaining fraction; boluses
    older than ``dia`` contribute nothing and are skipped via a bisect window.
    With no boluses, IOB is 0 everywhere — which correctly means "nothing acting".

    Extended (square/dual-wave) boluses — ``standard_percent < 100`` delivered
    over ``extended_duration`` minutes — are placed as a spread of sub-doses
    across that window rather than a single point mass at ``t``, so their activity
    tail lands when the insulin actually arrived. Standard boluses
    (``standard_percent`` 100 or NULL) stay single point masses.
    """

    def __init__(self, bolus_events: List[BolusEvent], peak_min: float, dia_min: float):
        self.peak = peak_min
        self.dia = dia_min
        self.events = list(bolus_events)
        pairs = []
        for idx, b in enumerate(self.events):
            amt = b.insulin
            if amt is None or amt <= 0:
                continue
            amt = float(amt)
            if (
                b.standard_percent is not None
                and b.standard_percent < 100
                and b.extended_duration
                and b.extended_duration > 0
            ):
                pairs.extend((t, a, idx) for t, a in
                             _extended_subdoses(b.t, amt, b.extended_duration))
            else:
                pairs.append((b.t, amt, idx))
        pairs.sort(key=lambda p: p[0])
        self.times = [p[0] for p in pairs]
        self.amts = [p[1] for p in pairs]
        self.sources = [p[2] for p in pairs]

    def at(self, t: datetime) -> float:
        lo = bisect.bisect_left(self.times, t - timedelta(minutes=self.dia))
        hi = bisect.bisect_right(self.times, t)
        total = 0.0
        for k in range(lo, hi):
            mins = (t - self.times[k]).total_seconds() / 60.0
            total += self.amts[k] * iob_fraction(mins, self.peak, self.dia)
        return total

    def contributions_at(self, t: datetime) -> List[Tuple[BolusEvent, float]]:
        """Residual IOB at ``t`` grouped by original bolus event.

        Extended-bolus sub-doses are recombined to their parent bolus. The list is
        sorted by largest residual contribution first, with the more recent bolus
        winning exact ties. That tie-break matches ADR 0038's attribution rule:
        dominant residual bolus IOB, recency only among equals.
        """
        lo = bisect.bisect_left(self.times, t - timedelta(minutes=self.dia))
        hi = bisect.bisect_right(self.times, t)
        by_source = {}
        for k in range(lo, hi):
            mins = (t - self.times[k]).total_seconds() / 60.0
            residual = self.amts[k] * iob_fraction(mins, self.peak, self.dia)
            if residual > 0:
                src = self.sources[k]
                by_source[src] = by_source.get(src, 0.0) + residual
        return [
            (self.events[src], amt)
            for src, amt in sorted(
                by_source.items(),
                key=lambda item: (item[1], self.events[item[0]].t),
                reverse=True,
            )
        ]


def basal_microdoses(basal_events: List[BasalEvent]) -> List[Tuple[datetime, float]]:
    """Each 5-min ``LidBasalDelivery`` as a discrete micro-dose ``(t, units)``.

    Units = delivered ``basal_rate`` (U/h) over its own ``duration_mins`` — the
    actual insulin Control-IQ ran, so ISF's activity read sees basal, not just
    boluses. Rows with no rate/duration contribute nothing.
    """
    out: List[Tuple[datetime, float]] = []
    for e in basal_events:
        if e.basal_rate and e.duration_mins:
            units = float(e.basal_rate) * float(e.duration_mins) / 60.0
            if units > 0:
                out.append((e.t, units))
    return out


class InsulinActivity:
    """Units of insulin that *acted* (were absorbed) over any interval.

    Where :class:`BolusIob` answers "how much is still on board at instant t",
    this answers "how many units got absorbed between t0 and t1" — the activity
    the ISF deviation model regresses ΔBG on. Built from *total* insulin (bolus +
    basal micro-doses); the amount a dose contributes to ``(t0, t1]`` is
    ``amt · (iob_fraction(t0) - iob_fraction(t1))``, i.e. the drop in its own
    remaining fraction across the step. Doses delivered after t1 contribute 0
    (both fractions are 1.0); a dose delivered mid-step contributes only what
    absorbed after it landed.
    """

    def __init__(self, doses: List[Tuple[datetime, float]],
                 peak_min: float, dia_min: float):
        pairs = sorted((t, float(a)) for t, a in doses if a and a > 0)
        self.times = [p[0] for p in pairs]
        self.amts = [p[1] for p in pairs]
        self.peak = peak_min
        self.dia = dia_min

    def acted(self, t0: datetime, t1: datetime) -> float:
        # Prune on t0, not t1: a dose delivered >= DIA before *t0* has f0 = f1 = 0
        # and truly contributes nothing. The original t1-based bound dropped any
        # dose that fully absorbed *inside* (t0, t1] — f0 = 1, f1 = 0, a full amt
        # of activity — zeroing every interval longer than the DIA (the #181
        # full-DIA balance sheet reads exactly such an interval; ISF's short
        # regression steps only ever lost sub-0.1 U tails to it).
        lo = bisect.bisect_left(self.times, t0 - timedelta(minutes=self.dia))
        hi = bisect.bisect_right(self.times, t1)
        total = 0.0
        for k in range(lo, hi):
            td = self.times[k]
            f0 = iob_fraction((t0 - td).total_seconds() / 60.0, self.peak, self.dia)
            f1 = iob_fraction((t1 - td).total_seconds() / 60.0, self.peak, self.dia)
            total += self.amts[k] * (f0 - f1)
        return total
