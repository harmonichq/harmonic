"""Tests for safety caps and the backtest (stdlib unittest)."""

import os
import unittest
import unittest.mock
from dataclasses import replace
from datetime import datetime, timedelta

from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading
from ciq_autotune.insulin import iob_fraction
from ciq_autotune.safety import SafetyConfig, Status, apply_safety_caps, cap
from ciq_autotune.backtest import (
    DiaPoint,
    DiaSweep,
    anchor_drift,
    backtest,
    dia_sweep,
    render_dia_sweep,
)
from ciq_autotune.model import ModelConfig, suggest_basal_profile
from ciq_autotune.uncertainty import Estimate

CFG = SafetyConfig()


def _est(value, lo, hi, n):
    return Estimate(value=value, lo=lo, hi=hi, n=n, method="bootstrap-median")


class SafetyCapTest(unittest.TestCase):
    def test_no_data_passes_through(self):
        self.assertEqual(cap(1.0, None, CFG), (None, Status.NO_DATA))

    def test_relative_cap_limits_a_big_move(self):
        # current 1.0, model wants 2.0, but +20% caps it at 1.20.
        rec, status = cap(1.0, 2.0, CFG)
        self.assertAlmostEqual(rec, 1.2, places=3)
        self.assertEqual(status, Status.CAPPED_RAISE)

    def test_small_move_is_no_change(self):
        rec, status = cap(1.0, 1.02, CFG)  # within 0.05 noise floor
        self.assertEqual(status, Status.NO_CHANGE)
        self.assertEqual(rec, 1.0)

    def test_uncapped_raise_and_lower(self):
        self.assertEqual(cap(1.0, 1.1, CFG)[1], Status.RAISE)
        self.assertEqual(cap(1.0, 0.9, CFG)[1], Status.LOWER)

    def test_absolute_bounds_enforced(self):
        # current unknown: only absolute range applies.
        rec, status = cap(None, 9.0, CFG)
        self.assertEqual(rec, CFG.abs_max)
        self.assertEqual(status, Status.NO_BASELINE)
        rec, status = cap(None, 0.0, CFG)
        self.assertEqual(rec, CFG.abs_min)


class UncertaintyGateTest(unittest.TestCase):
    """A directional result is downgraded to INSUFFICIENT when the estimate can't
    support a sign (issue #54): wide, n<3, or the CI strictly spans current."""

    def test_no_estimate_keeps_old_behavior(self):
        # Legacy caller (apply_safety_caps) passes no estimate -> unchanged.
        self.assertEqual(cap(1.0, 1.1, CFG)[1], Status.RAISE)

    def test_wide_estimate_is_insufficient(self):
        # Broad CI (half-width > 25% of point) -> flagged wide -> no direction,
        # but the number is still returned.
        wide = _est(value=1.1, lo=0.4, hi=1.8, n=10)
        self.assertTrue(wide.wide)
        rec, status = cap(1.0, 1.1, CFG, wide)
        self.assertEqual(status, Status.INSUFFICIENT)
        self.assertIsNotNone(rec)

    def test_ci_strictly_containing_current_is_insufficient(self):
        # Ample n, not wide, but the band spans current -> sign unknown.
        est = _est(value=1.1, lo=0.9, hi=1.2, n=10)
        self.assertFalse(est.wide)
        self.assertEqual(cap(1.0, 1.1, CFG, est)[1], Status.INSUFFICIENT)

    def test_ci_touching_current_at_endpoint_survives(self):
        # Open interval: current == lo is NOT "inside" -> direction survives
        # (03:00's [0.60, 0.95] with current 0.60).
        est = _est(value=0.775, lo=0.6, hi=0.95, n=11)
        self.assertFalse(est.wide)
        rec, status = cap(0.6, 0.775, CFG, est)
        self.assertEqual(status, Status.CAPPED_RAISE)

    def test_n_below_three_refuses_any_direction(self):
        # #56 guard, owned here: n<3 never emits a direction, even with a tight CI.
        est = _est(value=1.2, lo=1.2, hi=1.2, n=1)  # n=1 CI collapses to a point
        rec, status = cap(1.0, 1.2, CFG, est)
        self.assertEqual(status, Status.INSUFFICIENT)

    def test_basal_night_floor_holds_a_narrow_thin_slot(self):
        # The exact #273 leak: n=4, tight CI, band NOT spanning current -> the
        # default n>=3 floor would assert a move, but basal passes the stronger
        # `min_directional_days=8` staging floor, so it's held. This is the one
        # gate that keeps a thin trim (e.g. 12:00 0.6->0.519, 4 clean nights) out
        # of the Plan / deliverable / priority tally.
        est = _est(value=0.519, lo=0.50, hi=0.54, n=4)
        self.assertFalse(est.wide)                      # narrow, not caught by wide
        self.assertEqual(cap(0.6, 0.519, CFG, est)[1], Status.LOWER)  # default floor moves it
        rec, status = cap(0.6, 0.519, CFG, est, min_directional_days=8)
        self.assertEqual(status, Status.INSUFFICIENT)   # basal floor holds it
        self.assertIsNotNone(rec)                       # number stays visible

    def test_basal_night_floor_lets_a_well_supported_slot_move(self):
        # n=8 clears the staging floor: a well-supported, narrow, off-current slot
        # still asserts a direction and stages.
        est = _est(value=0.519, lo=0.50, hi=0.54, n=8)
        self.assertFalse(est.wide)
        self.assertEqual(cap(0.6, 0.519, CFG, est, min_directional_days=8)[1], Status.LOWER)


class StatusActionableTest(unittest.TestCase):
    def test_moves_are_actionable(self):
        for s in (Status.RAISE, Status.LOWER, Status.CAPPED_RAISE, Status.CAPPED_LOWER):
            self.assertTrue(s.actionable, s)

    def test_non_moves_are_not_actionable(self):
        for s in (Status.NO_DATA, Status.NO_CHANGE, Status.NO_BASELINE):
            self.assertFalse(s.actionable, s)

    def test_renders_as_display_string(self):
        self.assertEqual(str(Status.CAPPED_RAISE), "capped (raise)")


class AdvisoryTest(unittest.TestCase):
    def test_join_carries_suggestion_and_recommendation(self):
        # Delivered 1.4 vs a revealed current of 1.0 at 03:00 -> a +40% move that
        # the ±20% cap pulls back to a capped raise. One Advisory carries both the
        # model fields and the recommendation, so no slot re-join is needed.
        basal, cgm = _disagreement_dataset([1, 2, 3])
        advisory = apply_safety_caps(suggest_basal_profile(basal, cgm, [], []))
        slot = next(s for s in advisory.slots if s.label == "03:00")
        self.assertEqual(slot.current, 1.0)
        self.assertGreater(slot.clean_minutes, 0)
        self.assertIsNotNone(slot.suggested)
        self.assertEqual(slot.status, Status.CAPPED_RAISE)
        self.assertTrue(slot.actionable)
        self.assertGreaterEqual(advisory.actionable_count, 1)


def _seg(day, h, m, dur, rate, dtype, profile_rate=None):
    return BasalEvent(t=datetime(2022, 6, day, h, m), delivery_type=dtype,
                      duration_mins=dur, basal_rate=rate,
                      profile_basal_rate=profile_rate)


def _cgm(day, end_h=6, bg=120.0):
    t0 = datetime(2022, 6, day, 0, 0)
    return [CgmReading(t=t0 + timedelta(minutes=5 * k), bg=bg, type="EGV")
            for k in range(end_h * 60 // 5 + 1)]


def _disagreement_dataset(days):
    """Contiguous nights where CIQ delivers 1.4 U/h, while the programmed profile
    (revealed by one 5-min profileDelivery sliver on day 1, at 03:00) is 1.0.
    No boluses, so every flat in-range minute is clean.

    The 03:00 sliver carries the programmed rate two ways so both paths recover
    ``current`` at 1.0: ``basal_rate`` for the legacy profileDelivery scan the
    Advisory test still exercises, and ``profile_basal_rate`` for the dense feed
    the shipped estimator (and the reworked backtest, #84) reads."""
    basal, cgm = [], []
    for d in days:
        if d == days[0]:
            basal += [
                _seg(d, 0, 0, 180, 1.4, "algorithmDelivery"),   # 00:00–03:00
                _seg(d, 3, 0, 5, 1.0, "profileDelivery",
                     profile_rate=1.0),                          # 03:00–03:05
                _seg(d, 3, 5, 175, 1.4, "algorithmDelivery"),   # 03:05–06:00
            ]
        else:
            basal += [_seg(d, 0, 0, 360, 1.4, "algorithmDelivery")]
        cgm += _cgm(d)
    return basal, cgm


class BacktestTest(unittest.TestCase):
    def test_suggestion_beats_current_when_delivery_disagrees_with_profile(self):
        # Profile learned from delivery (~1.4) should predict held-out delivery
        # better than the programmed 1.0 does.
        basal, cgm = _disagreement_dataset([1, 2, 3, 4, 5])
        bt = backtest(basal, cgm, [], [], holdout_days=2)
        self.assertGreater(bt.n_matched, 0)
        self.assertLess(bt.mae_suggested_matched, bt.mae_current_matched)
        self.assertGreater(bt.improvement, 0)

    def test_empty_when_no_holdout_possible(self):
        basal, cgm = _disagreement_dataset([1])  # only 1 day
        bt = backtest(basal, cgm, [], [], holdout_days=2)
        self.assertEqual(bt.test_clean_minutes, 0)
        self.assertIsNone(bt.improvement)

    def test_backtest_does_not_call_legacy_suggest_basal_profile(self):
        # #84 acceptance: backtest() must score the SHIPPED estimator, so the
        # legacy suggest_basal_profile path can never be reached from it. Patch it
        # to explode and prove backtest() still produces a head-to-head.
        import ciq_autotune.backtest as bt_mod

        def _boom(*a, **k):  # pragma: no cover - only fires on regression
            raise AssertionError("backtest() called legacy suggest_basal_profile")

        self.assertFalse(hasattr(bt_mod, "suggest_basal_profile"))
        basal, cgm = _disagreement_dataset([1, 2, 3, 4, 5])
        with unittest.mock.patch(
            "ciq_autotune.model.suggest_basal_profile", _boom
        ):
            bt = backtest(basal, cgm, [], [], holdout_days=2)
        self.assertGreater(bt.n_matched, 0)

    def test_median_not_mean_under_shipped_path(self):
        # ADR 0001's median-not-mean claim must still hold on the estimator the
        # backtest now scores. CIQ's clean delivery is right-skewed: mostly 1.0
        # with a fat corrective tail. The per-day median lands at ~1.0; the mean
        # is dragged up by the tail. The suggestion the backtest trains must be the
        # median (~1.0), not the mean — so its held-out MAE must beat what the mean
        # of the same skewed data would score.
        skewed = [1.0] * 20 + [3.0, 4.0, 5.0]  # median 1.0, mean ~1.35
        held = skewed  # held-out delivery is the same right-skewed shape
        basal, cgm = [], []
        for d in range(1, 8):
            # One non-overlapping 5-min algorithmDelivery per skewed value, filling
            # the 00:00 slot's 30 minutes across the first six samples of each day.
            t0 = datetime(2022, 6, d, 0, 0)
            for k, rate in enumerate(skewed):
                basal.append(BasalEvent(
                    t=t0 + timedelta(minutes=5 * k),
                    delivery_type="algorithmDelivery",
                    duration_mins=5, basal_rate=rate, profile_basal_rate=2.0))
            cgm += _cgm(d, end_h=2)
        bt = backtest(basal, cgm, [], [], holdout_days=2)
        self.assertIsNotNone(bt.mae_suggested_matched)
        median_mae = sum(abs(1.0 - x) for x in held) / len(held)
        mean_val = sum(skewed) / len(skewed)
        mean_mae = sum(abs(mean_val - x) for x in held) / len(held)
        # The trained suggestion is the median: its MAE tracks the median error and
        # is strictly better than the mean-based suggestion would be.
        self.assertLess(bt.mae_suggested_matched, mean_mae)
        self.assertAlmostEqual(bt.mae_suggested_matched, median_mae, delta=0.05)

    def test_epoch_cut_drops_stale_programmed_rate(self):
        # Per-slot epoch cut, matching production: a slot whose programmed rate
        # changed mid-window must train only on minutes after the change. The 00:00
        # slot delivers 0.8 on days 1-3 (old programmed 0.8) and 1.4 on days 4+
        # (programmed edited to 1.4). Without the cut the train median straddles
        # both; with it, only the post-change 1.4 run is trained.
        def day(d, rate):
            evs = []
            for k in range(6):  # six 5-min segments fill the 00:00 slot
                evs.append(BasalEvent(
                    t=datetime(2022, 6, d, 0, 5 * k),
                    delivery_type="algorithmDelivery", duration_mins=5,
                    basal_rate=rate, profile_basal_rate=rate))
            return evs
        basal, cgm = [], []
        for d in range(1, 8):
            basal += day(d, 0.8 if d <= 3 else 1.4)
            cgm += _cgm(d, end_h=2)
        # Hold out days 6-7 (delivery 1.4). Train on days 1-5 with the day-4 cut.
        bt = backtest(basal, cgm, [], [], holdout_days=2)
        # The cut discards the 0.8 days, so the trained slot-00:00 rate is 1.4 and
        # predicts the 1.4 held-out delivery with ~0 error. (~0.6 if uncut.)
        self.assertIsNotNone(bt.mae_suggested_matched)
        self.assertLess(bt.mae_suggested_matched, 0.1)


def _full_day_cgm(day, bg=120.0):
    """One flat in-range CGM reading every 5 min for the whole calendar day."""
    t0 = datetime(2022, 6, day, 0, 0)
    return [CgmReading(t=t0 + timedelta(minutes=5 * k), bg=bg, type="EGV")
            for k in range(24 * 60 // 5)]


def _day_basal(day, rate):
    """One synthetic profileDelivery segment covering the whole day at ``rate``.
    Delivered == programmed here, so every clean minute reads ``rate``."""
    return BasalEvent(t=datetime(2022, 6, day, 0, 0), delivery_type="profileDelivery",
                      duration_mins=24 * 60, basal_rate=rate)


def _coverage_dataset(days, bolus_hour=8, bolus_u=6.0):
    """A flat 0.60 U/h profile all day, with one big morning bolus each day.

    Under a long DIA the bolus's reconstructed IOB lingers into the afternoon and
    the clean-window filter rejects those daytime minutes; under a short DIA it
    clears and the afternoon slots become clean. Overnight is always clean."""
    basal, cgm, bolus = [], [], []
    for d in days:
        basal.append(_day_basal(d, 0.60))
        cgm += _full_day_cgm(d)
        bolus.append(BolusEvent(t=datetime(2022, 6, d, bolus_hour, 0), insulin=bolus_u))
    return basal, cgm, bolus


class DiaSweepTest(unittest.TestCase):
    def test_shorter_dia_recovers_daytime_coverage(self):
        # A morning bolus buries the early-afternoon slots under DIA 300 but not
        # under DIA 180: coverage must rise as DIA shortens, monotonically.
        basal, cgm, bolus = _coverage_dataset(range(1, 15))
        sweep = dia_sweep(basal, cgm, bolus, [],
                          dia_values=[180.0, 300.0], baseline_dia_min=300.0,
                          min_days=5)
        by_dia = {p.dia_min: p for p in sweep.points}
        self.assertGreater(by_dia[180.0].daytime_covered_slots,
                           by_dia[300.0].daytime_covered_slots)
        self.assertGreater(by_dia[180.0].daytime_coverage_gain, 0)
        self.assertEqual(by_dia[300.0].daytime_coverage_gain, 0)  # baseline

    def test_no_drift_when_rate_is_stable(self):
        # Delivered basal is a constant 0.60 everywhere, so recovering coverage
        # cannot move any robust slot's median: drift stays ~0 and every non-
        # baseline DIA reads "safe".
        basal, cgm, bolus = _coverage_dataset(range(1, 15))
        sweep = dia_sweep(basal, cgm, bolus, [],
                          dia_values=[180.0, 240.0, 300.0], baseline_dia_min=300.0,
                          min_days=5, robust_min_days=10)
        self.assertGreater(sweep.robust_slots, 0)
        for p in sweep.points:
            if p.is_baseline:
                self.assertIsNone(p.safe)
                continue
            self.assertEqual(p.median_abs_drift, 0.0)
            self.assertLessEqual(p.max_abs_drift, sweep.safe_drift_u)
            self.assertTrue(p.safe)
            self.assertEqual(p.drift_exceed_slots, 0)

    def test_recommendation_maximizes_safe_coverage(self):
        # The recommendation picks the safe, coverage-holding DIA that recovers the
        # MOST daytime coverage (180 buries fewer afternoon minutes than 240 here).
        basal, cgm, bolus = _coverage_dataset(range(1, 15))
        sweep = dia_sweep(basal, cgm, bolus, [],
                          dia_values=[180.0, 240.0, 300.0], baseline_dia_min=300.0,
                          min_days=5)
        by_dia = {p.dia_min: p for p in sweep.points}
        self.assertTrue(by_dia[180.0].safe and by_dia[240.0].safe)
        self.assertGreater(by_dia[180.0].daytime_covered_slots,
                           by_dia[240.0].daytime_covered_slots)
        self.assertEqual(sweep.recommendation, 180.0)

    def test_recommendation_breaks_coverage_ties_toward_longest_dia(self):
        # Pure logic check on the tie-break: two safe DIAs with equal daytime
        # coverage -> the longer (more defensible) one wins.
        def pt(dia, cov, drift, base=False):
            return DiaPoint(dia_min=dia, covered_slots=cov, daytime_covered_slots=cov,
                            drift_slots=1, median_abs_drift=None if base else drift,
                            max_abs_drift=None if base else drift,
                            drift_exceed_slots=0, safe_drift_u=0.05,
                            daytime_coverage_gain=cov - 5, is_baseline=base)
        sweep = DiaSweep(baseline_dia_min=300.0, min_days=5, robust_min_days=10,
                         safe_drift_u=0.05, robust_slots=3,
                         points=[pt(180.0, 8, 0.0), pt(240.0, 8, 0.0), pt(300.0, 5, 0.0, base=True)])
        self.assertEqual(sweep.recommendation, 240.0)

    def test_max_drift_over_floor_reads_contaminated(self):
        # The contamination classification: a DIA where even ONE robust slot moves
        # past the safe floor is unsafe, no matter how clean the median. (The
        # robust-slot drift path is exercised end-to-end on real data — see
        # test_real_db_reports_coverage_and_drift; here we pin the predicate.)
        contaminated = DiaPoint(
            dia_min=120.0, covered_slots=48, daytime_covered_slots=32,
            drift_slots=23, median_abs_drift=0.0, max_abs_drift=0.09,
            drift_exceed_slots=1, safe_drift_u=0.05,
            daytime_coverage_gain=14, is_baseline=False)
        self.assertFalse(contaminated.safe)
        clean = DiaPoint(
            dia_min=180.0, covered_slots=48, daytime_covered_slots=32,
            drift_slots=23, median_abs_drift=0.0, max_abs_drift=0.04,
            drift_exceed_slots=0, safe_drift_u=0.05,
            daytime_coverage_gain=14, is_baseline=False)
        self.assertTrue(clean.safe)
        # A contaminated DIA is excluded from the recommendation even at max coverage.
        sweep = DiaSweep(baseline_dia_min=300.0, min_days=5, robust_min_days=10,
                         safe_drift_u=0.05, robust_slots=23,
                         points=[contaminated, clean,
                                 DiaPoint(300.0, 30, 18, 23, None, None, 0, 0.05, 0, True)])
        self.assertEqual(sweep.recommendation, 180.0)
        self.assertIn("CONTAMINATED", render_dia_sweep(sweep))

    def test_empty_data_yields_no_recommendation(self):
        sweep = dia_sweep([], [], [], [], dia_values=[180.0, 300.0],
                          baseline_dia_min=300.0)
        self.assertEqual(sweep.robust_slots, 0)
        self.assertIsNone(sweep.recommendation)
        for p in sweep.points:
            self.assertEqual(p.covered_slots, 0)

    def test_render_is_stringable(self):
        basal, cgm, bolus = _coverage_dataset(range(1, 8))
        sweep = dia_sweep(basal, cgm, bolus, [],
                          dia_values=[180.0, 300.0], baseline_dia_min=300.0)
        out = render_dia_sweep(sweep)
        self.assertIn("DIA sweep", out)
        self.assertIn("300", out)


class AnchorDriftTest(unittest.TestCase):
    """Reconstructed bolus IOB vs the pump's own reported IOB anchor (#162)."""

    def test_mae_over_anchored_boluses_excludes_own_dose(self):
        # A prior 4U bolus is still partly on board when a 2U bolus lands 60 min
        # later carrying the pump's IOB anchor. The reconstruction at that instant
        # counts only the PRIOR insulin — the 2U's own fresh (fraction-1.0)
        # contribution is backed out, because the pump anchor is pre-this-dose.
        peak, dia = 75.0, 300.0
        t0 = datetime(2022, 6, 1, 12, 0)
        prior = 4.0 * iob_fraction(60.0, peak, dia)
        boluses = [
            BolusEvent(t=t0, insulin=4.0),                        # no anchor
            BolusEvent(t=t0 + timedelta(minutes=60), insulin=2.0,
                       pump_iob=prior + 0.5),                     # anchor reads 0.5 high
        ]
        mae, n = anchor_drift(boluses, peak, dia)
        self.assertEqual(n, 1)                                    # only the 2U is anchored
        self.assertAlmostEqual(mae, 0.5, places=4)

    def test_no_anchored_boluses_yields_none(self):
        boluses = [BolusEvent(t=datetime(2022, 6, 1, 12, 0), insulin=4.0)]
        self.assertEqual(anchor_drift(boluses, 75.0, 300.0), (None, 0))

    def test_shorter_dia_can_track_a_fast_decaying_anchor_better(self):
        # 90 min after a 5U dose the pump still reports only 0.3U on board (fast
        # clearer). The shorter DIA reconstructs less lingering IOB, so it tracks
        # that small anchor with less error — exactly what the sweep column surfaces.
        t0 = datetime(2022, 6, 1, 12, 0)
        boluses = [
            BolusEvent(t=t0, insulin=5.0),
            BolusEvent(t=t0 + timedelta(minutes=90), insulin=1.0, pump_iob=0.3),
        ]
        mae_short, _ = anchor_drift(boluses, 60.0, 180.0)
        mae_long, _ = anchor_drift(boluses, 75.0, 300.0)
        self.assertLess(mae_short, mae_long)

    def test_dia_sweep_reports_anchor_drift_per_dia(self):
        # The sweep gains a pump-anchor column: an MAE (U) and an anchored-bolus
        # count at every DIA, so the user reads which DIA best tracks the pump.
        basal, cgm, bolus = _coverage_dataset(range(1, 15))
        bolus = [replace(b, pump_iob=0.5) for b in bolus]        # each dose anchored
        sweep = dia_sweep(basal, cgm, bolus, [],
                          dia_values=[180.0, 300.0], baseline_dia_min=300.0)
        by_dia = {p.dia_min: p for p in sweep.points}
        for dia in (180.0, 300.0):
            self.assertEqual(by_dia[dia].anchor_slots, len(bolus))
            self.assertIsNotNone(by_dia[dia].anchor_mae)
            self.assertGreaterEqual(by_dia[dia].anchor_mae, 0.0)
        self.assertIn("anchor", render_dia_sweep(sweep).lower())

    def test_dia_sweep_anchor_none_when_no_anchors(self):
        # Boluses with no anchor (today's real DB, pre-re-fetch): the column reads
        # empty, no crash, no zero-fill masquerading as a real reading.
        basal, cgm, bolus = _coverage_dataset(range(1, 8))
        sweep = dia_sweep(basal, cgm, bolus, [],
                          dia_values=[180.0, 300.0], baseline_dia_min=300.0)
        for p in sweep.points:
            self.assertEqual(p.anchor_slots, 0)
            self.assertIsNone(p.anchor_mae)


_REAL_DB = os.path.join("tconnect-data", "ciq.db")


@unittest.skipUnless(os.path.exists(_REAL_DB), "no real DB present")
class DiaSweepRealDbTest(unittest.TestCase):
    """Read-only end-to-end smoke check against a local private snapshot, if present.

    Never mutates the DB. Asserts structural invariants only — not a specific
    recommendation, because recommendation presence is legitimately data-dependent
    (changes as real data or the upstream model shifts)."""

    def test_real_db_reports_coverage_and_drift(self):
        from ciq_autotune.store import Store

        with Store.open(_REAL_DB) as store:
            basal = store.basal_events()
            cgm = store.cgm_readings()
            bolus = store.bolus_events()
            pump = store.pump_events()
        sweep = dia_sweep(basal, cgm, bolus, pump, baseline_dia_min=300.0)
        by_dia = {p.dia_min: p for p in sweep.points}

        # Structure: requested DIA keys are present.
        self.assertIn(180.0, by_dia)
        self.assertIn(300.0, by_dia)

        for dia, point in by_dia.items():
            # Each point carries the right DIA key.
            self.assertEqual(point.dia_min, dia)
            # Coverage fields are non-negative integers.
            self.assertIsInstance(point.daytime_covered_slots, int)
            self.assertGreaterEqual(point.daytime_covered_slots, 0)
            self.assertIsInstance(point.covered_slots, int)
            self.assertGreaterEqual(point.covered_slots, 0)
            # Drift fields: None at baseline, float >= 0 elsewhere.
            if point.is_baseline:
                self.assertIsNone(point.median_abs_drift)
                self.assertIsNone(point.max_abs_drift)
            else:
                if point.median_abs_drift is not None:
                    self.assertGreaterEqual(point.median_abs_drift, 0.0)
                if point.max_abs_drift is not None:
                    self.assertGreaterEqual(point.max_abs_drift, 0.0)
            # Pump-anchor column is structurally present at every DIA (#162): a
            # non-negative anchored-bolus count, and an MAE that is None only when
            # no bolus carries an anchor (the state until the store is re-fetched).
            self.assertIsInstance(point.anchor_slots, int)
            self.assertGreaterEqual(point.anchor_slots, 0)
            if point.anchor_slots == 0:
                self.assertIsNone(point.anchor_mae)
            else:
                self.assertGreaterEqual(point.anchor_mae, 0.0)

        # Directional invariant: shorter DIA yields >= daytime coverage vs baseline.
        # (Equality is valid when coverage is already saturated.)
        self.assertGreaterEqual(by_dia[180.0].daytime_covered_slots,
                                by_dia[300.0].daytime_covered_slots)

        # Recommendation is either None (no safe shorter DIA on current data) or a
        # float strictly shorter than the 300-min baseline.
        rec = sweep.recommendation
        if rec is not None:
            self.assertIsInstance(rec, float)
            self.assertLess(rec, 300.0)


if __name__ == "__main__":
    unittest.main()
