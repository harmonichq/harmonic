#!/usr/bin/env python3
"""Spike for #434: one reason per excluded basal night, by fixed precedence.

Evidence for the change's design, not shipping code. It re-states the proposed
rule against today's clean-window filter internals so the order is pinned to
executed logic rather than prose; the implementation must own this rule once,
inside the analyzer and the filter, and must not import this file.

Synthetic nights only (no store, no real data). Run from the repository root:

    uv run python openspec/changes/basal-excluded-night-reasons/evidence/reason-precedence-spike.py
"""

from __future__ import annotations

import pathlib
import sys
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[4]))

from ciq_autotune.analyzers.basal import analyze_basal  # noqa: E402
from ciq_autotune.events import BasalEvent, BolusEvent, CarbEntry, CgmReading  # noqa: E402
from ciq_autotune.insulin import BolusIob  # noqa: E402
from ciq_autotune.model import (  # noqa: E402
    _ZERO_DELIVERY, CgmSeries, ModelConfig, _BasalTimeline, _CarbExclusionWindows,
    _ExcludedWindows, _slot_of,
)

# Precedence order, highest first. The index is the rank.
BUCKETS = ("before_current_setting", "below_range_or_suspended", "above_range",
           "insulin_acting", "carb_log", "other")


def minute_bucket(t, cfg, timeline, iob, cgm, events, carbs):
    """The highest-precedence rule the filter's minute ``t`` fails; None if clean."""
    i = timeline._index_at(t)
    rate = timeline.rates[i] if i is not None else None
    bg = cgm.nearest(t)
    if rate is not None and rate <= 0:
        return "below_range_or_suspended"          # covered, zero or suspended delivery
    if bg is not None and bg < cfg.bg_low:
        return "below_range_or_suspended"
    if bg is not None and bg > cfg.bg_high:
        return "above_range"
    if iob.at(t) > cfg.bolus_clear_u:
        return "insulin_acting"
    if carbs.contains(t):
        return "carb_log"
    slope = cgm.slope(t, timedelta(minutes=cfg.slope_window_min))
    if (rate is None or events.contains(t) or bg is None
            or slope is None or abs(slope) > cfg.flat_slope_per_min):
        return "other"                               # uncovered, pump event, no glucose, not flat
    return None


def reasons(basal, cgm_readings, bolus, pump, carb_entries, slot_starts, slot, row,
            cfg=ModelConfig()):
    """Bucket every excluded night of one analyzer row; counts in BUCKETS order."""
    timeline = _BasalTimeline(basal)
    iob = BolusIob(bolus, cfg.insulin_peak_min, cfg.insulin_dia_min)
    cgm = CgmSeries(cgm_readings, timedelta(minutes=cfg.bg_max_stale_min),
                    cfg.slope_min_points, cfg.slope_min_span_frac)
    events = _ExcludedWindows(pump, cfg.excluded_events, timedelta(minutes=cfg.event_margin_min))
    carbs = _CarbExclusionWindows(
        carb_entries, timedelta(minutes=cfg.carb_exclusion_back_min),
        timedelta(minutes=cfg.carb_exclusion_fwd_min), onset_min=cfg.carb_onset_min,
        guard_min=cfg.carb_guard_min, meal_rate=cfg.meal_carb_rate, fast_rate=cfg.fast_carb_rate)
    all_times = timeline.starts + cgm.times
    span_start, span_end = min(all_times).replace(second=0, microsecond=0), max(all_times)
    cut = slot_starts.get(slot)
    source, pre_cut = set(), set()
    for event in basal:                              # the analyzer's own source-night walk
        t, end = event.t, event.t + timedelta(minutes=event.duration_mins or 0.0)
        while t < end:
            if _slot_of(t, cfg.slot_minutes) == slot:
                source.add(t.date())
                if cut is not None and t < cut:
                    pre_cut.add(t.date())
            t += timedelta(minutes=1)
    estimate = {night["date"] for night in row["evidence"]["night_roster"]}
    pooled = (row["evidence"].get("pooling") or {}).get("pooled") is True
    counts = dict.fromkeys(BUCKETS, 0)
    for night in sorted(d for d in source if d.isoformat() not in estimate):
        if night in pre_cut and not pooled:
            counts["before_current_setting"] += 1
            continue
        start = datetime.combine(night, datetime.min.time()) + timedelta(minutes=slot * cfg.slot_minutes)
        found = [minute_bucket(t, cfg, timeline, iob, cgm, events, carbs)
                 for t in (start + timedelta(minutes=k) for k in range(cfg.slot_minutes))
                 if span_start <= t <= span_end]
        ranked = [b for b in found if b is not None]
        counts[min(ranked, key=BUCKETS.index) if ranked else "other"] += 1
    return counts


def six_cause_nights():
    """Sixteen synthetic nights at 00:00: three before a setting cut, eight steady,
    one suspended low, one high, one under bolus insulin, one under a Carb log
    entry, and one rising steadily while still in range."""
    basal, cgm, bolus, carbs = [], [], [], []
    kinds = {}
    for day in range(1, 17):
        start = datetime(2026, 2, day)
        kind = ("pre-cut" if day < 4 else
                {12: "suspended low", 13: "high", 14: "bolus", 15: "carb log",
                 16: "rising"}.get(day, "steady"))
        kinds[start.date()] = kind
        suspended = kind == "suspended low"
        basal.append(BasalEvent(start, sorted(_ZERO_DELIVERY)[0] if suspended else "algorithmDelivery",
                                30, 0.0 if suspended else 0.8, 0.6))
        for minute in range(-60, 36, 5):
            bg = {"suspended low": 60, "high": 220}.get(kind, 120)
            if kind == "rising":
                bg = 80 + (minute + 60)             # 1 mg/dL/min, 80..175, never out of range
            cgm.append(CgmReading(start + timedelta(minutes=minute), bg, "EGV"))
        if kind == "bolus":
            bolus.append(BolusEvent(start - timedelta(minutes=30), insulin=2.0))
        if kind == "carb log":
            carbs.append(CarbEntry(start - timedelta(minutes=5), 20.0, "exact", "manual"))
    return basal, cgm, bolus, carbs, kinds


class ReasonPrecedenceSpike(unittest.TestCase):
    def test_each_cause_lands_in_its_bucket_and_the_buckets_sum_to_the_count(self):
        basal, cgm, bolus, carbs = six_cause_nights()[:4]
        cut = {0: datetime(2026, 2, 4)}
        row = analyze_basal(basal, cgm, bolus, [], carb_entries=carbs, slot_starts=cut)[0].to_dict()
        counts = reasons(basal, cgm, bolus, [], carbs, cut, 0, row)
        self.assertEqual(counts, {"before_current_setting": 3, "below_range_or_suspended": 1,
                                  "above_range": 1, "insulin_acting": 1, "carb_log": 1,
                                  "other": 1})
        self.assertEqual(sum(counts.values()), row["evidence"]["excluded_night_count"])

    def test_a_low_minute_outranks_a_high_night(self):
        basal, cgm, bolus, carbs = six_cause_nights()[:4]
        # One dip below range on the otherwise-high night moves it to the low bucket.
        cgm = [CgmReading(r.t, 60, r.type) if r.t == datetime(2026, 2, 13, 0, 10) else r for r in cgm]
        cut = {0: datetime(2026, 2, 4)}
        row = analyze_basal(basal, cgm, bolus, [], carb_entries=carbs, slot_starts=cut)[0].to_dict()
        counts = reasons(basal, cgm, bolus, [], carbs, cut, 0, row)
        self.assertEqual((counts["below_range_or_suspended"], counts["above_range"]), (2, 0))
        self.assertEqual(sum(counts.values()), row["evidence"]["excluded_night_count"])

    def test_pooling_returns_steady_pre_cut_nights_and_their_bucket_empties(self):
        basal, cgm, bolus, carbs = six_cause_nights()[:4]
        cut = {0: datetime(2026, 2, 4)}
        row = analyze_basal(basal, cgm, bolus, [], carb_entries=carbs, slot_starts=cut,
                            pool_agreeing_regimes=True)[0].to_dict()
        self.assertTrue(row["evidence"]["pooling"]["pooled"])
        counts = reasons(basal, cgm, bolus, [], carbs, cut, 0, row)
        self.assertEqual(counts["before_current_setting"], 0)
        self.assertEqual(sum(counts.values()), row["evidence"]["excluded_night_count"])


if __name__ == "__main__":
    unittest.main()
