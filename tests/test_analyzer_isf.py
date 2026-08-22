"""A2 ISF-analyzer tests (ADR 0001: single fasting ISF, deviation model).

ISF is measured from a true-fasting deviation model: over each 5-min step in an
overnight window with no recent carb bolus, regress ΔBG on the insulin that acted
(total bolus + basal activity via the oref curve). ISF = -slope. The result is a
single estimate with a CI, compared to the programmed ISF; a recommendation fires
only when programmed falls outside the CI (else the data confirms it).
"""

import random
import unittest
from datetime import date, datetime, timedelta

from ciq_autotune.analyzers.isf import (
    IsfChannels,
    IsfConfig,
    _recommend,
    analyze_isf,
    fasting_steps,
    isf_asserts_move,
)
from ciq_autotune.events import BasalEvent, BolusEvent, CarbEntry, CgmReading
from ciq_autotune.harm import HarmArm, HarmConfig, PrintedLow
from ciq_autotune.insulin import InsulinActivity, basal_microdoses
from ciq_autotune.rest_window import RestWindow, detect_rest_windows
from ciq_autotune.store import Store
from ciq_autotune.uncertainty import Estimate

ISF_36 = [(0, 36.0), (300, 36.0), (540, 36.0), (720, 36.0)]


class IsfAssertsMoveTest(unittest.TestCase):
    def test_requires_current_direction_and_a_real_recommendation(self):
        cases = [
            (None, "strengthen", 40.0, False, "no programmed value"),
            (42.0, None, 40.0, False, "no direction"),
            (42.0, "weaken", None, False, "direction only"),
            (42.0, "strengthen", None, False, "held without recommendation"),
            (42.0, "strengthen", 42.0, False, "rounded no-op"),
            (42.0, "strengthen", 40.0, True, "strengthen move"),
            (42.0, "weaken", 47.0, True, "sized weaken move"),
        ]
        for current, direction, recommended, expected, label in cases:
            with self.subTest(label=label):
                self.assertIs(
                    isf_asserts_move(current, direction, recommended), expected
                )


def rw(day, start_h=0, end_h=8):
    """A rest window covering a synthetic night's overnight CGM (00:00–06:00) on
    `day`. The ISF gate is now rest-window membership (#110): steps count when both
    CGM endpoints fall inside a detected window. Direct ``fasting_steps`` unit tests
    inject a covering window (the detector's own coverage logic is tested in
    tests/test_rest_window.py) so step membership is deterministic."""
    return [RestWindow(date=date(2026, 6, day),
                       start=datetime(2026, 6, day, start_h, 0, 0),
                       end=datetime(2026, 6, day, end_h, 0, 0))]


def basal_night(day, rate=0.6, start_h=0, hours=6):
    """5-min LidBasalDelivery rows across an overnight window."""
    t0 = datetime(2026, 6, day, start_h, 0, 0)
    return [BasalEvent(t=t0 + timedelta(minutes=5 * k), delivery_type="algorithmDelivery",
                       duration_mins=5.0, basal_rate=rate, profile_basal_rate=rate)
            for k in range(hours * 12)]


def synth_night(day, isf, boluses, *, rate=0.6, bg0=170.0, drift=0.4,
                noise_sd=1.5, rng=None, cfg=IsfConfig()):
    """One overnight of CGM whose 5-min ΔBG is generated *from* the insulin that
    acted at a known ISF — so a correct analyzer must recover `isf`.

    Returns (bolus_events, basal_events, cgm_readings). `boluses` is a list of
    (hour, minute, units); all carb-free (fasting corrections)."""
    basal = basal_night(day, rate=rate)
    bolus = [BolusEvent(t=datetime(2026, 6, day, h, m, 0), insulin=u, carbs=None)
             for (h, m, u) in boluses]
    doses = [(b.t, b.insulin) for b in bolus] + basal_microdoses(basal)
    activity = InsulinActivity(doses, cfg.peak_min, cfg.dia_min)

    times = [datetime(2026, 6, day, 0, 0, 0) + timedelta(minutes=5 * k) for k in range(72)]
    cgm, bg = [], bg0
    cgm.append(CgmReading(t=times[0], bg=round(bg, 1), type="EGV"))
    for t0, t1 in zip(times, times[1:]):
        acted = activity.acted(t0, t1)
        eps = rng.gauss(0, noise_sd) if rng else 0.0
        bg = bg - isf * acted + drift + eps
        cgm.append(CgmReading(t=t1, bg=round(bg, 1), type="EGV"))
    return bolus, basal, cgm


class FastingStepsTest(unittest.TestCase):
    def test_daytime_and_recent_carb_steps_are_excluded(self):
        cfg = IsfConfig()
        # A clean overnight night, plus a daytime step and a carb bolus at 02:00.
        _, basal, cgm = synth_night(1, 40, [(1, 0, 3.0)])
        # Daytime CGM (12:00) must never become a fasting step.
        cgm.append(CgmReading(t=datetime(2026, 6, 1, 12, 0, 0), bg=150.0, type="EGV"))
        cgm.append(CgmReading(t=datetime(2026, 6, 1, 12, 5, 0), bg=145.0, type="EGV"))
        steps = fasting_steps([], basal, cgm, cfg, rw(1))
        self.assertTrue(steps)
        # Every step falls inside the detected rest window; the 12:00 daytime pair
        # is outside it and never becomes a fasting step.
        win = rw(1)[0]
        for s in steps:
            self.assertTrue(win.start <= s.t <= win.end)

    def test_carb_bearing_bolus_masks_the_lookback_window(self):
        cfg = IsfConfig()
        _, basal, cgm = synth_night(1, 40, [])
        # A meal bolus at 02:30 blanks every step within the ~5h lookback after it.
        meal = [BolusEvent(t=datetime(2026, 6, 1, 2, 30, 0), insulin=5.0, carbs=60.0)]
        steps = fasting_steps(meal, basal, cgm, cfg, rw(1))
        self.assertTrue(all(s.t < datetime(2026, 6, 1, 2, 30, 0) for s in steps))

    def test_large_5min_jump_is_dropped_as_an_outlier(self):
        cfg = IsfConfig()
        cgm = [CgmReading(t=datetime(2026, 6, 1, 1, 0, 0), bg=120.0, type="EGV"),
               CgmReading(t=datetime(2026, 6, 1, 1, 5, 0), bg=200.0, type="EGV")]  # +80
        self.assertEqual(fasting_steps([], [], cgm, cfg, rw(1)), [])


class ClusterKeyTest(unittest.TestCase):
    """#177: every fasting step carries its containing rest window's identity as a
    cluster key, so the ISF CI can resample nights instead of individual steps."""

    def test_each_step_is_keyed_to_its_rest_window_date(self):
        cfg = IsfConfig()
        _, basal, cgm = synth_night(1, 40, [(1, 0, 3.0)])
        steps = fasting_steps([], basal, cgm, cfg, rw(1))
        self.assertTrue(steps)
        self.assertTrue(all(s.cluster == date(2026, 6, 1) for s in steps))

    def test_steps_from_different_nights_get_different_cluster_keys(self):
        cfg = IsfConfig()
        _, basal1, cgm1 = synth_night(1, 40, [(1, 0, 3.0)])
        _, basal2, cgm2 = synth_night(2, 40, [(2, 0, 4.0)])
        steps = fasting_steps([], basal1 + basal2, cgm1 + cgm2, cfg,
                              rw(1) + rw(2))
        keys = {s.cluster for s in steps}
        self.assertEqual(keys, {date(2026, 6, 1), date(2026, 6, 2)})

    def test_estimate_uses_the_clustered_method(self):
        rng = random.Random(3)
        bolus, basal, cgm = [], [], []
        for i in range(4):
            b, ba, c = synth_night(i + 1, 40, [(1, 0, 3.0), (3, 0, 4.0)],
                                   noise_sd=1.0, rng=rng)
            bolus += b; basal += ba; cgm += c
        seg = analyze_isf(bolus, basal, cgm, ISF_36)[0]
        self.assertEqual(seg.estimate.method, "bootstrap-ols-isf-clustered")

    def test_single_night_is_soft_and_makes_no_recommendation(self):
        # One night of fasting data: the clustered band collapses to a point, so
        # the estimate must read wide (not maximally confident) and withhold its
        # recommendation even though the collapsed CI excludes the programmed value
        # (#185). Programmed 36 vs a single steep night is exactly the trap.
        rng = random.Random(5)
        bolus, basal, cgm = synth_night(1, 60, [(1, 0, 3.0), (3, 0, 4.0)],
                                        noise_sd=1.0, rng=rng)
        # One detected night -> one cluster (inject it so the step set is
        # deterministic, same as the ClusterKeyTest fixtures).
        seg = analyze_isf(bolus, basal, cgm, ISF_36, rest_windows=rw(1))[0]
        self.assertGreater(seg.estimate.n, 3)
        self.assertEqual(seg.estimate.n_clusters, 1)
        self.assertTrue(seg.estimate.wide)
        self.assertIsNone(seg.recommended)
        self.assertIn("not enough fasting nights", seg.annotation.lower())


class SyntheticRecoveryTest(unittest.TestCase):
    """The acceptance-criteria guard against sign/units regressions."""

    def _run(self, isf, noise_sd=1.5):
        rng = random.Random(7)
        bolus, basal, cgm = [], [], []
        # Vary bolus size/timing per night for x-spread the slope needs.
        plans = [[(1, 0, 3.0)], [(2, 0, 4.0), (4, 0, 2.0)], [(1, 30, 5.0)],
                 [(3, 0, 3.5)], [(0, 30, 2.0), (3, 30, 4.0)], [(2, 0, 6.0)],
                 [(1, 0, 3.0), (4, 30, 2.5)], [(2, 30, 5.0)]]
        for i, plan in enumerate(plans):
            b, ba, c = synth_night(i + 1, isf, plan, noise_sd=noise_sd, rng=rng)
            bolus += b; basal += ba; cgm += c
        return analyze_isf(bolus, basal, cgm, ISF_36)

    def test_recovers_known_isf_within_ci(self):
        rows = self._run(40.0)
        self.assertEqual(len(rows), 1)
        seg = rows[0]
        self.assertEqual(seg.start_min, 0)
        self.assertEqual(seg.parameter, "isf")
        self.assertGreater(seg.estimate.n, 100)
        self.assertAlmostEqual(seg.estimate.value, 40.0, delta=5.0)
        # The true value sits inside the reported CI (sign + units are right).
        self.assertLessEqual(seg.estimate.lo, 40.0)
        self.assertGreaterEqual(seg.estimate.hi, 40.0)
        # Positive ISF: a positive slope of ΔBG on insulin would be a sign bug.
        self.assertGreater(seg.estimate.value, 0)

    def test_a_lower_true_isf_reads_lower(self):
        low = self._run(25.0)[0].estimate.value
        high = self._run(45.0)[0].estimate.value
        self.assertLess(low, high)


class RecommendationTest(unittest.TestCase):
    """The advisory gate (#413: lows own the direction), tested directly on
    `_recommend` (deterministic)."""

    cfg = IsfConfig()

    def _est(self, value, lo, hi):
        return Estimate(value=value, lo=lo, hi=hi, n=200, method="bootstrap-ols-isf")

    def _ch(self, *, night_median=None, fits=None, corr_low_days=0, rescue_days=0,
            covered_days=30):
        """Build IsfChannels. `fits` is a list of per-night ISFs (dates auto-assigned
        in chronological order); `night_median` overrides the derived median."""
        pairs = [(date(2026, 6, i + 1), isf) for i, isf in enumerate(fits or [])]
        if night_median is None and pairs:
            vals = sorted(v for _, v in pairs)
            m = len(vals) // 2
            night_median = vals[m] if len(vals) % 2 else (vals[m - 1] + vals[m]) / 2
        return IsfChannels(night_fits=pairs, night_median=night_median,
                           corr_low_days=corr_low_days, rescue_days=rescue_days,
                           covered_days=covered_days)

    def test_confirms_when_programmed_inside_ci(self):
        rec, ann, direction, priced = _recommend(
            36.0, self._est(40.0, 32.0, 48.0), self._ch(night_median=40.0), self.cfg)
        self.assertIsNone(rec)
        self.assertIsNone(direction)
        self.assertIn("agrees with the set factor", ann.lower())

    def test_recurring_correction_lows_own_the_weaken_direction(self):
        # 4-of-30 low days clears the priced day-rate bar; the card weakens. #468: the
        # weaken is DIRECTION-ONLY — no number reaches `recommended`. The capped
        # half-gap (57.9 → 47, capped to 43.2) survives only as the lever's pricing
        # basis, never as advice.
        rec, ann, direction, priced = _recommend(
            36.0, self._est(24.8, 17.7, 35.2),
            self._ch(night_median=57.9, corr_low_days=4), self.cfg)
        self.assertEqual(direction, "weaken")
        self.assertIsNone(rec)
        self.assertAlmostEqual(priced, 43.2, places=1)
        self.assertIn("overshooting", ann.lower())

    def test_weaken_says_the_pooled_fit_is_unstable_when_it_disagrees(self):
        # The pooled band sits entirely on the stronger side (hi 35.2 < 36) while the
        # lows say weaken: the copy must call the fit unstable and hand the decision
        # to the lows (#413 §7).
        _, ann, direction, priced = _recommend(
            36.0, self._est(24.8, 17.7, 35.2),
            self._ch(night_median=57.9, corr_low_days=4), self.cfg)
        self.assertEqual(direction, "weaken")
        self.assertIn("lows carry the decision", ann.lower())

    def test_one_correction_low_blocks_a_strengthen_move(self):
        # A single correction-caused low (below the recurrence bar) does NOT weaken,
        # but it still forbids strengthening — the adr-283/adr-313 gate invariant.
        rec, ann, direction, priced = _recommend(
            36.0, self._est(24.0, 18.0, 30.0),
            self._ch(fits=[24.0, 25.0, 23.0], corr_low_days=1), self.cfg)
        self.assertIsNone(rec)
        self.assertIsNone(direction)
        self.assertIn("correction low is on record", ann.lower())

    def test_measurement_cannot_assert_weaken_in_silence(self):
        # No lows, but the measurement reads more-sensitive/weaker (60 vs 36). The
        # measurement may only ever assert *stronger* in silence — a silent weaken is
        # exactly the fragile pooled-fit signal #413 refuses to act on. No card.
        rec, _, direction, priced = _recommend(
            36.0, self._est(60.0, 52.0, 68.0),
            self._ch(fits=[60.0, 58.0, 62.0, 59.0]), self.cfg)
        self.assertIsNone(rec)
        self.assertIsNone(direction)

    def test_strengthen_needs_a_prior_decision_signal(self):
        # Today's window cannot manufacture a second decision point by splitting its
        # own nights. It needs an independently evaluated prior weekly check-in.
        rec, ann, direction, priced = _recommend(
            36.0, self._est(20.0, 15.0, 25.0),
            self._ch(fits=[20.0, 22.0, 18.0, 21.0, 19.0, 23.0]), self.cfg)
        self.assertIsNone(rec)
        self.assertIsNone(direction)
        rec, ann, direction, priced = _recommend(
            36.0, self._est(20.0, 15.0, 25.0),
            self._ch(fits=[20.0, 22.0, 18.0, 21.0, 19.0, 23.0]), self.cfg,
            prior_strengthen_signal=True)
        self.assertEqual(direction, "strengthen")
        self.assertLess(rec, 36.0)
        self.assertGreaterEqual(rec, 36.0 * 0.8)  # capped -20%

    def test_night_wilson_signal_can_assert_despite_a_pooled_ci_covering_programmed(self):
        # The pooled fit is display context only. A qualified per-night vote, at two
        # endpoints, decides the measurement direction even if the pooled band spans
        # programmed (the reference conflict made that separation necessary).
        rec, _, direction, priced = _recommend(
            36.0, self._est(30.0, 29.0, 39.0),
            self._ch(fits=[20.0, 22.0, 18.0, 21.0, 19.0, 23.0]), self.cfg,
            prior_strengthen_signal=True)
        self.assertEqual(direction, "strengthen")
        self.assertLess(rec, 36.0)

    def test_single_window_exclusion_is_noise_and_makes_no_card(self):
        # The band excludes programmed, but the strengthen signal only holds in the
        # recent half (older half reads weaker): a one-off exclusion → no card.
        rec, _, direction, priced = _recommend(
            36.0, self._est(28.0, 22.0, 34.0),
            self._ch(fits=[50.0, 48.0, 52.0, 20.0, 22.0, 18.0]), self.cfg)
        self.assertIsNone(rec)
        self.assertIsNone(direction)

    def test_no_measurement_makes_no_recommendation(self):
        rec, _, direction, priced = _recommend(
            36.0, self._est(None, None, None), self._ch(), self.cfg)
        self.assertIsNone(rec)
        self.assertIsNone(direction)

    def test_soft_estimate_withholds_the_recommendation(self):
        # A single-night estimate collapses its band to a point and reads as soft
        # (n_clusters below the floor -> wide). Even though programmed sits outside
        # the degenerate [lo, hi], no advisory move fires; the annotation says why.
        soft = Estimate(value=60.0, lo=60.0, hi=60.0, n=200,
                        method="bootstrap-ols-isf-clustered", n_clusters=1)
        self.assertTrue(soft.wide)
        rec, ann, direction, priced = _recommend(36.0, soft, self._ch(night_median=60.0), self.cfg)
        self.assertIsNone(rec)
        self.assertIsNone(direction)
        self.assertIn("not enough fasting nights", ann.lower())

    def test_no_programmed_withholds_a_recommendation(self):
        rec, _, _, priced = _recommend(None, self._est(34.0, 30.0, 38.0),
                               self._ch(night_median=34.0), self.cfg)
        self.assertIsNone(rec)

    def test_recurrent_correction_lows_withhold_a_number_without_a_night_target(self):
        # Harm still asserts weaken, but it may not invent a fallback percentage when
        # no per-night median supports a numeric ISF recommendation.
        lows = [PrintedLow(datetime(2026, 6, d, 3, 0, 0), 55.0, 1.2, HarmArm.ISF)
                for d in (1, 2, 3, 4)]
        seg = analyze_isf([], [], [], [(0, 40.0)], harm_config=HarmConfig(),
                          harm_lows=lows, window_days=30)[0]
        self.assertIsNone(seg.recommended)
        self.assertEqual(seg.evidence["direction"], "weaken")

    def test_programmed_taken_over_fasting_window_only(self):
        # Daytime segments differ wildly; only the overnight-covering segments
        # (00:00 and 05:00) set the programmed comparison value.
        rng = random.Random(3)
        segs = [(0, 36.0), (300, 36.0), (540, 10.0), (720, 90.0)]
        bolus, basal, cgm = synth_night(1, 36, [(1, 0, 3.0)], noise_sd=1.0, rng=rng)
        seg = analyze_isf(bolus, basal, cgm, segs)[0]
        self.assertEqual(seg.current, 36.0)


class LowsOwnDirectionTest(unittest.TestCase):
    """#413 acceptance: lows own the direction, built from analyzer output over N
    nights (never hand-set flags — the #273 lesson)."""

    def _nights(self, isf, n=8, plans=None, rng_seed=7):
        rng = random.Random(rng_seed)
        plans = plans or [[(1, 0, 3.0)], [(2, 0, 4.0), (4, 0, 2.0)], [(1, 30, 5.0)],
                          [(3, 0, 3.5)], [(0, 30, 2.0), (3, 30, 4.0)], [(2, 0, 6.0)],
                          [(1, 0, 3.0), (4, 30, 2.5)], [(2, 30, 5.0)]]
        bolus, basal, cgm, windows = [], [], [], []
        for i in range(n):
            b, ba, c = synth_night(i + 1, isf, plans[i % len(plans)],
                                   noise_sd=1.0, rng=rng)
            bolus += b; basal += ba; cgm += c; windows += rw(i + 1)
        return bolus, basal, cgm, windows

    def _isf_lows(self, days):
        return [PrintedLow(datetime(2026, 6, d, 3, 0, 0), 60.0, 1.2, HarmArm.ISF)
                for d in days]

    def test_recurring_lows_override_a_stronger_measurement(self):
        # The measurement reads *stronger* (nights at ISF 24, band excludes the
        # programmed 36 on the stronger side) — #410's gate would recommend stronger
        # corrections. Recurring correction lows must flip it to WEAKEN, and the copy
        # must say the overnight fit is unstable and the lows carry the decision.
        bolus, basal, cgm, windows = self._nights(24.0)
        seg = analyze_isf(bolus, basal, cgm, ISF_36, rest_windows=windows,
                          harm_config=HarmConfig(),
                          harm_lows=self._isf_lows([1, 5, 9, 13]), window_days=30)[0]
        self.assertLess(seg.estimate.hi, 36.0)          # band excludes on stronger side
        self.assertEqual(seg.evidence["direction"], "weaken")
        self.assertIsNone(seg.recommended)              # no supporting night target
        self.assertIn("lows carry the decision", seg.annotation.lower())

    def test_cap_bound_weaken_recommends_no_number(self):
        # #468 regression. Nights at ISF ~58 → per-night median well above programmed
        # and recurring correction lows: the reference-snapshot shape whose half-gap
        # binds at the ±20% cap (36 × 1.2 = 43.2). That cap is not a measurement, so it
        # must NOT be recommended — the direction and the harm counts persist, the
        # number does not. Priced-only, it still feeds the lever's currency.
        bolus, basal, cgm, windows = self._nights(58.0)
        seg = analyze_isf(bolus, basal, cgm, ISF_36, rest_windows=windows,
                          harm_config=HarmConfig(),
                          harm_lows=self._isf_lows([1, 5, 9, 13]), window_days=30)[0]
        self.assertEqual(seg.evidence["direction"], "weaken")
        self.assertGreater(seg.evidence["night_median"], 50.0)
        self.assertIsNone(seg.recommended)
        self.assertIs(seg.to_dict()["asserts_move"], False)
        self.assertEqual(seg.evidence["recurrence_channels"]["corr_low_days"], 4)
        self.assertEqual(seg.evidence["recurrence_channels"]["covered_days"], 30)
        self.assertAlmostEqual(
            seg.evidence["impact_inputs"]["priced_target"], 43.2, places=1)

    def test_direction_only_weaken_leaves_the_pump_profile_alone(self):
        # A finding with no number cannot reach the consolidated pump schedule: the
        # programmed ISF segments carry forward untouched (#180 + #468).
        from ciq_autotune.analyzers.basal import consolidate_profile
        bolus, basal, cgm, windows = self._nights(58.0)
        rows = analyze_isf(bolus, basal, cgm, ISF_36, rest_windows=windows,
                           harm_config=HarmConfig(),
                           harm_lows=self._isf_lows([1, 5, 9, 13]), window_days=30)
        self.assertIsNone(rows[0].recommended)
        programmed = [(0, 36.0), (720, 40.0)]   # the reference snapshot's schedule
        profile = consolidate_profile([], isf=rows, programmed_isf=programmed)
        self.assertEqual(sorted({s.isf for s in profile.segments}), [36.0, 40.0])

    def test_masker_weakens_via_the_rescue_days_channel(self):
        # Quiet lows, but 4 correction-attributed rescue-log days: the days channel
        # catches the masker and asserts weaken even with no printed low on record.
        bolus, basal, cgm, windows = self._nights(58.0)
        seg = analyze_isf(bolus, basal, cgm, ISF_36, rest_windows=windows,
                          window_days=30, correction_rescue_days=4)[0]
        self.assertEqual(seg.evidence["direction"], "weaken")
        self.assertIsNone(seg.recommended)                       # direction-only (#468)
        self.assertGreater(seg.evidence["impact_inputs"]["priced_target"], 36.0)

    def test_four_low_days_fire_the_bar_three_do_not(self):
        # The priced day-rate bar: 4-of-30 clears the Wilson floor, 3-of-30 does not.
        bolus, basal, cgm, windows = self._nights(58.0)
        four = analyze_isf(bolus, basal, cgm, ISF_36, rest_windows=windows,
                           harm_config=HarmConfig(),
                           harm_lows=self._isf_lows([1, 5, 9, 13]), window_days=30)[0]
        three = analyze_isf(bolus, basal, cgm, ISF_36, rest_windows=windows,
                            harm_config=HarmConfig(),
                            harm_lows=self._isf_lows([1, 5, 9]), window_days=30)[0]
        self.assertEqual(four.evidence["direction"], "weaken")
        self.assertNotEqual(three.evidence["direction"], "weaken")

    def test_well_tuned_confirms_with_no_direction_and_zero_priority(self):
        # Band covers programmed, ≤3 correction low-days, no rescue recurrence:
        # no direction, and the tuning lever scores 0.
        from ciq_autotune.analyzers.tuning_priority import isf_lever
        bolus, basal, cgm, windows = self._nights(36.0)
        rows = analyze_isf(bolus, basal, cgm, ISF_36, rest_windows=windows,
                           harm_config=HarmConfig(),
                           harm_lows=self._isf_lows([1, 5]), window_days=30)
        seg = rows[0]
        self.assertTrue(seg.estimate.lo <= 36.0 <= seg.estimate.hi)  # band covers
        self.assertIsNone(seg.evidence["direction"])
        self.assertIsNone(seg.recommended)
        self.assertIs(seg.asserts_move, False)
        self.assertEqual(isf_lever(rows).priority, 0)

    def test_single_correction_low_blocks_a_strengthen_move(self):
        # Nights genuinely more sensitive (ISF 24), silent enough that the measurement
        # would strengthen — but one correction-caused low forbids it (the gate).
        bolus, basal, cgm, windows = self._nights(24.0)
        seg = analyze_isf(bolus, basal, cgm, ISF_36, rest_windows=windows,
                          harm_config=HarmConfig(),
                          harm_lows=self._isf_lows([3]), window_days=30)[0]
        self.assertIsNone(seg.recommended)
        self.assertIsNone(seg.evidence["direction"])

    def test_sustained_strengthen_stages_its_existing_numeric_move(self):
        bolus, basal, cgm, windows = self._nights(24.0)
        seg = analyze_isf(
            bolus, basal, cgm, ISF_36, rest_windows=windows, window_days=30,
            prior_strengthen_signal=True,
        )[0]

        self.assertEqual(seg.evidence["direction"], "strengthen")
        self.assertEqual(seg.recommended, 29.5)
        self.assertIs(seg.asserts_move, True)

    def test_rounded_strengthen_no_op_cannot_stage(self):
        bolus, basal, cgm, windows = self._nights(36.85)
        seg = analyze_isf(
            bolus, basal, cgm, ISF_36, rest_windows=windows, window_days=30,
            prior_strengthen_signal=True,
        )[0]

        self.assertEqual(seg.evidence["direction"], "strengthen")
        self.assertEqual(seg.recommended, seg.current)
        self.assertIs(seg.asserts_move, False)

    def test_no_programmed_factor_keeps_measurement_but_cannot_stage(self):
        bolus, basal, cgm, windows = self._nights(34.0)
        seg = analyze_isf(bolus, basal, cgm, [], rest_windows=windows,
                          window_days=30)[0]

        self.assertIsNone(seg.current)
        self.assertIsNotNone(seg.estimate.value)
        self.assertIsNotNone(seg.estimate.lo)
        self.assertIsNotNone(seg.estimate.hi)
        self.assertGreater(seg.estimate.n, 0)
        self.assertTrue(seg.evidence["night_fits"])
        self.assertIsNotNone(seg.evidence["night_median"])
        self.assertIn("no set value to compare", seg.annotation)
        self.assertIsNone(seg.recommended)
        self.assertIs(seg.asserts_move, False)


class ResultShapeTest(unittest.TestCase):
    def test_no_data_gives_single_valueless_estimate(self):
        rows = analyze_isf([], [], [], ISF_36)
        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0].estimate.value)
        self.assertIs(rows[0].asserts_move, False)
        self.assertIsNone(rows[0].recommended)

    def test_evidence_is_scatter_plus_window_no_per_step_timestamps(self):
        rng = random.Random(1)
        bolus, basal, cgm = synth_night(1, 40, [(1, 0, 3.0), (3, 0, 4.0)],
                                        noise_sd=1.0, rng=rng)
        seg = analyze_isf(bolus, basal, cgm, ISF_36, rest_windows=rw(1))[0]
        ev = seg.evidence
        self.assertEqual(ev["n_steps"], seg.estimate.n)
        self.assertIn("r_squared", ev)
        # The Daily-report highlight for ISF is the detected rest window(s) as a
        # band — per-date coords (ISO, crossing midnight), not one fixed clock.
        self.assertEqual(len(ev["rest_windows"]), 1)
        w = ev["rest_windows"][0]
        self.assertEqual(w["start"], "2026-06-01 00:00:00")
        self.assertEqual(w["end"], "2026-06-01 08:00:00")
        self.assertIn("rest window", ev["fast_window"])
        self.assertTrue(ev["points"])
        for p in ev["points"]:
            self.assertIn("insulin_acted", p)
            self.assertIn("dbg", p)
            # No per-step timestamp: hundreds of 5-min slices are not a drill-down.
            self.assertNotIn("t", p)

    def test_evidence_points_are_capped(self):
        rng = random.Random(2)
        bolus, basal, cgm = [], [], []
        for i in range(8):  # ~500 steps, above the 200 cap
            b, ba, c = synth_night(i + 1, 40, [(1, 0, 3.0)], noise_sd=1.0, rng=rng)
            bolus += b; basal += ba; cgm += c
        cfg = IsfConfig(max_evidence_points=200)
        seg = analyze_isf(bolus, basal, cgm, ISF_36, config=cfg)[0]
        self.assertGreater(seg.estimate.n, 200)          # estimate uses all steps
        self.assertLessEqual(len(seg.evidence["points"]), 200)  # scatter is capped


class CarbEntryExclusionTest(unittest.TestCase):
    """#169: a manual carb-log entry masks the fasting gate for a grams-SCALED
    forward-decay window (COB), not the old flat 5 h. NULL grams keep the flat
    window (ADR 0033 §2)."""

    @staticmethod
    def _entry(day, h, m, grams=20.0, certainty="estimate", source="low-prompt"):
        return CarbEntry(t=datetime(2026, 6, day, h, m, 0), grams=grams,
                         certainty=certainty, source=source)

    def test_small_carb_releases_the_gate_sooner_than_the_flat_window(self):
        cfg = IsfConfig()
        _, basal, cgm = synth_night(1, 40, [])
        base = fasting_steps([], basal, cgm, cfg, rw(1))
        self.assertTrue(any(s.t >= datetime(2026, 6, 1, 2, 30, 0) for s in base))
        # A 20 g low-prompt (fast, 40 g/h) at 02:30 clears at 15 onset + 30 decay
        # + 45 guard = 90 min → the gate reopens ~04:00, not the old flat +5 h.
        entries = [self._entry(1, 2, 30, grams=20.0)]
        steps = fasting_steps([], basal, cgm, cfg, rw(1), carb_entries=entries)
        self.assertLess(len(steps), len(base))          # some steps masked
        # Nothing survives between the entry and its clearance (steps are keyed by
        # their start t0; the step ending at ~04:00 has t0 ~03:55).
        self.assertFalse(any(datetime(2026, 6, 1, 2, 30, 0) <= s.t
                             < datetime(2026, 6, 1, 3, 55, 0) for s in steps))
        # ...but steps well after clearance do (unlike the flat 5 h window).
        self.assertTrue(any(s.t >= datetime(2026, 6, 1, 4, 30, 0) for s in steps))

    def test_larger_grams_mask_no_fewer_steps_than_smaller(self):
        cfg = IsfConfig()
        _, basal, cgm = synth_night(1, 40, [])
        small = fasting_steps([], basal, cgm, cfg, rw(1),
                              carb_entries=[self._entry(1, 1, 0, grams=15.0)])
        large = fasting_steps([], basal, cgm, cfg, rw(1),
                              carb_entries=[self._entry(1, 1, 0, grams=60.0)])
        # More grams ⇒ clears later ⇒ never MORE surviving steps.
        self.assertLessEqual(len(large), len(small))

    def test_entry_outside_window_leaves_steps_untouched(self):
        cfg = IsfConfig()
        _, basal, cgm = synth_night(1, 40, [])
        base = fasting_steps([], basal, cgm, cfg, rw(1))
        # An entry at midday (well outside the rest window and its clearance)
        # touches nothing.
        entries = [self._entry(1, 13, 0)]
        steps = fasting_steps([], basal, cgm, cfg, rw(1), carb_entries=entries)
        self.assertEqual([s.t for s in steps], [s.t for s in base])

    def test_null_gram_entry_keeps_the_flat_lookback(self):
        cfg = IsfConfig()
        _, basal, cgm = synth_night(1, 40, [])
        # A 20 g entry releases the gate ~90 min out (COB); a NULL-gram "ate
        # something, don't know" entry is never decayed and keeps the flat 5 h
        # lookback — so it masks strictly more of the night.
        known = fasting_steps([], basal, cgm, cfg, rw(1),
                              carb_entries=[self._entry(1, 2, 30, grams=20.0)])
        unknown = fasting_steps([], basal, cgm, cfg, rw(1),
                                carb_entries=[self._entry(1, 2, 30, grams=None,
                                                          certainty="unknown")])
        self.assertLess(len(unknown), len(known))
        self.assertTrue(all(s.t < datetime(2026, 6, 1, 2, 30, 0) for s in unknown))

    def test_carb_bearing_bolus_is_not_grams_scaled(self):
        # The excursion guard (#169 correction): a carb-bearing bolus keeps the full
        # flat ~DIA lookback even for small grams — the meal insulin acts ~5 h and
        # its post-meal descent would collapse the ISF fit. An unbolused Carb-log
        # entry of the *same* grams grams-scales instead (no covering insulin).
        cfg = IsfConfig()
        _, basal, cgm = synth_night(1, 40, [])
        # 20 g as a meal BOLUS at 02:00 masks the full ~5 h (excursion) → nothing
        # after it survives overnight.
        via_bolus = fasting_steps(
            [BolusEvent(t=datetime(2026, 6, 1, 2, 0, 0), insulin=2.0, carbs=20.0)],
            basal, cgm, cfg, rw(1))
        self.assertTrue(all(s.t < datetime(2026, 6, 1, 2, 0, 0) for s in via_bolus))
        # 20 g as an unbolused low treatment grams-scales (~90 min) → later steps live.
        via_log = fasting_steps([], basal, cgm, cfg, rw(1),
                                carb_entries=[self._entry(1, 2, 0, grams=20.0)])
        self.assertGreater(len(via_log), len(via_bolus))
        self.assertTrue(any(s.t >= datetime(2026, 6, 1, 4, 0, 0) for s in via_log))


class RepullIdempotencyTest(unittest.TestCase):
    """#194 acceptance criterion, end-to-end through the store: a re-pull of an
    unchanged window is idempotent — the fasting-ISF estimate is the same before
    and after the fetch. The bug doubled ``basal_events`` on re-pull (its store
    time jitters a few seconds across BFF decodes), ~2×-ing reconstructed basal
    insulin and collapsing the OLS slope. Keying basal on the pump's stable
    seqNum makes the re-pull merge instead of double."""

    def _basal_rows(self, jitter_s=0):
        """Store dict-rows for three fasting nights of 5-min basal, each row keyed
        by a stable seqNum. ``jitter_s`` shifts the *store time* (not the seqNum),
        mimicking the BFF re-decoding the same delivery a few seconds off."""
        rows = []
        for day in (1, 2, 3):
            for b in basal_night(day):
                rows.append({
                    "seq_num": int(b.t.strftime("%Y%m%d%H%M%S")),
                    "time": (b.t + timedelta(seconds=jitter_s)).strftime("%Y-%m-%d %H:%M:%S"),
                    "delivery_type": b.delivery_type, "duration_mins": b.duration_mins,
                    "basal_rate": b.basal_rate, "profile_basal_rate": b.profile_basal_rate,
                })
        return rows

    def _seed_cgm_bolus(self, store):
        rng = random.Random(42)
        for day in (1, 2, 3):
            bolus, _, cgm = synth_night(day, 40, [(1, 0, 3.0)], rng=rng)
            store.upsert_cgm([{"EventDateTime": c.t.strftime("%Y-%m-%dT%H:%M:%S"),
                               "Readings (CGM / BGM)": c.bg, "Description": "EGV"}
                              for c in cgm])
            store.upsert_bolus([{"seq_num": int(b.t.strftime("%Y%m%d%H%M%S")),
                                 "request_time": b.t.strftime("%Y-%m-%d %H:%M:%S"),
                                 "description": "Bolus", "insulin": b.insulin,
                                 "completion_time": b.t.strftime("%Y-%m-%d %H:%M:%S")}
                                for b in bolus])

    def _isf(self, store):
        return analyze_isf(store.bolus_events(), store.basal_events(),
                           store.cgm_readings(), ISF_36)[0].estimate

    def _step_spacing(self, store):
        # The step-endpoint times the criterion calls "step spacing" — driven by
        # the (unchanged) CGM stream, so a basal re-pull must leave them identical.
        rest = detect_rest_windows(store.cgm_readings(), store.bolus_events())
        steps = fasting_steps(store.bolus_events(), store.basal_events(),
                              store.cgm_readings(), IsfConfig(), rest)
        return [s.t for s in steps]

    def test_basal_repull_is_idempotent_for_analyze_isf(self):
        store = Store.open(":memory:")
        self._seed_cgm_bolus(store)
        store.upsert_basal(self._basal_rows())
        before = self._isf(store)
        before_spacing = self._step_spacing(store)
        n_basal = store.counts()["basal_events"]
        self.assertIsNotNone(before.value)

        # An identical re-pull is fully bit-idempotent: same rows, same estimate.
        store.upsert_basal(self._basal_rows())
        same = self._isf(store)
        self.assertEqual(store.counts()["basal_events"], n_basal)
        self.assertEqual((same.value, same.n, same.lo, same.hi),
                         (before.value, before.n, before.lo, before.hi))

        # A re-pull whose store times jitter a few seconds (the real BFF case)
        # must still merge on seqNum — not double — so n and the estimate hold
        # (the old (t, delivery_type) key doubled the stream and collapsed ISF).
        store.upsert_basal(self._basal_rows(jitter_s=33))
        after = self._isf(store)
        self.assertEqual(store.counts()["basal_events"], n_basal)
        self.assertEqual(after.n, before.n)
        self.assertEqual(self._step_spacing(store), before_spacing)  # unchanged
        self.assertAlmostEqual(after.value, before.value, places=1)
        store.close()


if __name__ == "__main__":
    unittest.main()
