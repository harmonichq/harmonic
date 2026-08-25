#!/usr/bin/env python3
"""Measurement behind ADR 136: do post-meal peaks cluster within a day?

Run against a **read-only snapshot** of a real database (AGENTS.md, "The data
boundary"), never the live file:

    uv run python docs/scope/verify-attribution-uncertainty.spike.py <snapshot>

Prints aggregates only - counts, correlations, interval widths. No record-level
value is printed, and nothing it prints may be committed beyond the aggregate
figures already recorded in ADR 136.

What it answers: an interval computed as if every meal were an independent
observation is narrower than the evidence earns, because meals sharing a day
share that day's state. The one-way random-effects ICC and its design effect
price that; the half-history bootstrap shows whether the two treatments
disagree about a difference excluding zero.
"""
from __future__ import annotations

import bisect
import random
import statistics as st
import sys
from collections import defaultdict
from datetime import timedelta

from ciq_autotune.analyzers.scenario.anchors import _is_meal
from ciq_autotune.store import Store

ARC_END_MINUTES = 240      # peak search window after the meal bolus
MIN_ARC_READINGS = 12      # at least an hour of coverage behind a peak
BOOTSTRAP_REPS = 4000
SEED = 7


def peaks_by_meal(store):
    """``[(day, peak mg/dL)]`` for every meal with enough post-bolus coverage."""
    cgm = sorted((r for r in store.cgm_readings() if r.bg is not None),
                 key=lambda r: r.t)
    times = [r.t for r in cgm]
    out = []
    for meal in (b.t for b in store.bolus_events() if _is_meal(b)):
        lo = bisect.bisect_left(times, meal)
        hi = bisect.bisect_right(times, meal + timedelta(minutes=ARC_END_MINUTES))
        values = [cgm[i].bg for i in range(lo, hi)]
        if len(values) >= MIN_ARC_READINGS:
            out.append((meal.date(), max(values)))
    return out


def icc(by_day, n):
    """One-way random-effects intraclass correlation of peaks within a day."""
    grand = st.mean(v for values in by_day.values() for v in values)
    k = len(by_day)
    ms_between = sum(len(v) * (st.mean(v) - grand) ** 2 for v in by_day.values()) / (k - 1)
    ms_within = sum(sum((x - st.mean(v)) ** 2 for x in v) for v in by_day.values()) / (n - k)
    m0 = (n - sum(len(v) ** 2 for v in by_day.values()) / n) / (k - 1)
    return (ms_between - ms_within) / (ms_between + (m0 - 1) * ms_within)


def bootstrap_means(sample, *, clustered, rng):
    """Bootstrap the mean peak, resampling days when clustered and meals when not."""
    if clustered:
        groups = defaultdict(list)
        for day, peak in sample:
            groups[day].append(peak)
        units = list(groups.values())
        return [st.mean([p for g in (rng.choice(units) for _ in units) for p in g])
                for _ in range(BOOTSTRAP_REPS)]
    values = [peak for _, peak in sample]
    return [st.mean([rng.choice(values) for _ in values]) for _ in range(BOOTSTRAP_REPS)]


def main(path):
    with Store.open_readonly(path) as store:
        peaks = peaks_by_meal(store)
    by_day = defaultdict(list)
    for day, peak in peaks:
        by_day[day].append(peak)
    n, days = len(peaks), len(by_day)
    per_day = n / days
    rho = icc(by_day, n)
    design_effect = 1 + (per_day - 1) * rho
    print(f"meals with arc coverage: {n}")
    print(f"days: {days}  mean meals/day: {per_day:.2f}")
    print(f"ICC(day): {rho:.3f}")
    print(f"design effect: {design_effect:.2f}  -> interval width x{design_effect ** 0.5:.2f}")

    # Does the treatment change the verdict? Split the history, compare the halves.
    peaks.sort(key=lambda pair: pair[0])
    midpoint = peaks[len(peaks) // 2][0]
    before = [pair for pair in peaks if pair[0] < midpoint]
    after = [pair for pair in peaks if pair[0] >= midpoint]
    for label, clustered in (("independent meals", False), ("by day", True)):
        rng = random.Random(SEED)
        deltas = sorted(b - a for a, b in zip(
            bootstrap_means(before, clustered=clustered, rng=rng),
            bootstrap_means(after, clustered=clustered, rng=rng)))
        lo = deltas[int(0.025 * len(deltas))]
        hi = deltas[int(0.975 * len(deltas))]
        spans_zero = "includes zero" if lo <= 0 <= hi else "excludes zero"
        print(f"{label:19s} delta {st.mean(deltas):+.1f}  "
              f"range {lo:+.1f} to {hi:+.1f}  ({spans_zero})")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
