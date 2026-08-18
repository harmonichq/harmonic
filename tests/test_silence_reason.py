"""SilenceReason taxonomy tests (#164, ADR 0009).

Every ``matched=False`` classifier :class:`Verdict` must carry the closed-taxonomy
:class:`SilenceReason` member that names *why* it drew no lever, and ``attribute()``
must surface that reason for a ``lever=None`` episode. This file asserts one case per
classifier per non-firing branch (inputs mirror the per-classifier test suites), the
``attribute()`` exposure, and a regression guard that the set of levers firing on the
existing fixtures is unchanged (a fired attribution carries no silence reason).

The branch→member mapping (ADR 0009): the honesty tier is a hint, but each branch is
tagged by *meaning*. UPSTREAM_CAUSE is specifically the shared context gate's recent
low / defensive suspend — a runaway-high chase, a digestion tail, a prior-high
correction or a basal-driven low are "the behavior didn't happen" (NO_TRIGGER), not
upstream causes.
"""

import unittest
from dataclasses import replace
from datetime import datetime, timedelta

from ciq_autotune.analyzers.classifiers import SilenceReason
from ciq_autotune.analyzers.classifiers.carb_undercount import classify_carb_undercount
from ciq_autotune.analyzers.classifiers.context_gate import CIQ_SUSPEND_TYPE
from ciq_autotune.analyzers.classifiers.correction_on_iob import (
    classify_correction_on_iob,
)
from ciq_autotune.analyzers.classifiers.correction_stacking import (
    classify_correction_stacking,
)
from ciq_autotune.analyzers.classifiers.late_bolus import classify_late_bolus
from ciq_autotune.analyzers.classifiers.missed_meal import classify_missed_meal
from ciq_autotune.analyzers.classifiers.suspend import classify_suspend
from ciq_autotune.analyzers.scenario.anchors import collect_anchors
from ciq_autotune.analyzers.scenario.attribute import attribute
from ciq_autotune.analyzers.scenario.levers import Lever
from ciq_autotune.analyzers.scenario.segment import segment
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading


# --- builders (mirror the per-classifier test suites) ------------------------


def cgm_ramp(day, h, m, start_bg, slope_per_min, minutes, step=5):
    t0 = datetime(2026, 6, day, h, m, 0)
    return [
        CgmReading(t=t0 + timedelta(minutes=step * k),
                   bg=start_bg + slope_per_min * step * k, type="EGV")
        for k in range(minutes // step + 1)
    ]


def cgm_arc(day, h, m, points, cadence=5):
    t0 = datetime(2026, 6, day, h, m, 0)
    return [
        CgmReading(t=t0 + timedelta(minutes=cadence * k), bg=float(v), type="EGV")
        for k, v in enumerate(points)
    ]


def cgm_flat(day, h, m, bg, minutes):
    return cgm_ramp(day, h, m, bg, 0.0, minutes)


def meal(day, h, m, carbs=45.0, dose=10.0):
    return BolusEvent(
        t=datetime(2026, 6, day, h, m, 0), insulin=dose, carbs=carbs,
        carb_ratio=10.0,
    )


def suspend_run(day, h, m, rows=6, cadence=5):
    t0 = datetime(2026, 6, day, h, m, 0)
    return [
        BasalEvent(t=t0 + timedelta(minutes=cadence * k), delivery_type=CIQ_SUSPEND_TYPE,
                   basal_rate=0.0, profile_basal_rate=0.9)
        for k in range(rows)
    ]


# Deliberately the SAME invented pair as ``test_classifier_carb_undercount``'s
# ``ISF`` / ``IC`` — one suite's settings seen from the silence-reason side. Change
# both together or the two suites stop describing the same configuration.
CU_ISF, CU_IC = 32.0, 5.0


class LateBolusSilenceTest(unittest.TestCase):
    def test_sparse_is_insufficient_data(self):
        cgm = [CgmReading(t=datetime(2026, 6, 15, 12, 25, 0), bg=150.0, type="EGV")]
        v = classify_late_bolus(meal(15, 12, 30), cgm)
        self.assertEqual(v.silence_reason, SilenceReason.INSUFFICIENT_DATA)

    def test_flat_pre_bolus_is_no_trigger(self):
        cgm = cgm_ramp(15, 12, 0, 120, 0.0, 40)
        v = classify_late_bolus(meal(15, 12, 30), cgm)
        self.assertEqual(v.silence_reason, SilenceReason.NO_TRIGGER)

    def test_gate_explained_is_upstream_cause(self):
        cgm = cgm_ramp(15, 12, 0, 64, 5.0, 50)          # low -> rebound
        v = classify_late_bolus(meal(15, 12, 40), cgm)
        self.assertEqual(v.silence_reason, SilenceReason.UPSTREAM_CAUSE)

    def test_high_start_is_prior_high_baseline(self):
        cgm = cgm_ramp(11, 5, 27, 250, 4.7, 25)         # rising off a clearly-high start
        m = BolusEvent(t=datetime(2026, 6, 11, 5, 47, 0), insulin=3.0, carbs=15.0)
        v = classify_late_bolus(m, cgm)
        self.assertEqual(v.silence_reason, SilenceReason.PRIOR_HIGH_BASELINE)


class CarbUndercountSilenceTest(unittest.TestCase):
    def _classify(self, m, cgm, basal=()):
        return classify_carb_undercount(
            replace(m, carb_ratio=CU_IC), cgm, basal, isf=CU_ISF,
        )

    def test_missing_settings_is_insufficient_data(self):
        cgm = cgm_arc(15, 12, 0, [145, 220, 320, 360])
        v = classify_carb_undercount(meal(15, 12, 5, carbs=30.0, dose=6.0), cgm,
                                     isf=None)
        self.assertEqual(v.silence_reason, SilenceReason.INSUFFICIENT_DATA)

    def test_no_cgm_is_insufficient_data(self):
        v = self._classify(meal(15, 12, 5, carbs=30.0, dose=6.0), [])
        self.assertEqual(v.silence_reason, SilenceReason.INSUFFICIENT_DATA)

    def test_in_range_meal_is_no_trigger(self):
        cgm = cgm_arc(15, 12, 0, [110, 120, 135, 150, 145, 130, 120])
        v = self._classify(meal(15, 12, 5, carbs=45.0, dose=10.0), cgm)
        self.assertEqual(v.silence_reason, SilenceReason.NO_TRIGGER)

    def test_rebound_off_low_is_upstream_cause(self):
        cgm = cgm_ramp(15, 12, 0, 62, 5.5, 55)          # runaway that is a rebound
        v = self._classify(meal(15, 12, 40, carbs=30.0, dose=30.0 / CU_IC), cgm)
        self.assertEqual(v.silence_reason, SilenceReason.UPSTREAM_CAUSE)

    def test_within_counting_range_is_under_threshold(self):
        # Ran a bit high (peak ~230) but implied carbs sit inside counting range —
        # the near-miss ADR 0009 keeps distinct from a clean no-trigger.
        cgm = cgm_arc(15, 12, 0, [120, 140, 175, 210, 230, 220, 200])
        v = self._classify(meal(15, 12, 5, carbs=60.0, dose=60.0 / CU_IC), cgm)
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.UNDER_THRESHOLD)


class MissedMealSilenceTest(unittest.TestCase):
    ANCHOR = datetime(2026, 6, 14, 10, 40, 0)

    def test_sparse_is_insufficient_data(self):
        cgm = [CgmReading(t=datetime(2026, 6, 14, 10, 35, 0), bg=140.0, type="EGV")]
        v = classify_missed_meal(self.ANCHOR, cgm)
        self.assertEqual(v.silence_reason, SilenceReason.INSUFFICIENT_DATA)

    def test_flat_is_no_trigger(self):
        v = classify_missed_meal(self.ANCHOR, cgm_ramp(14, 10, 0, 120, 0.0, 60))
        self.assertEqual(v.silence_reason, SilenceReason.NO_TRIGGER)

    def test_rebound_is_upstream_cause(self):
        v = classify_missed_meal(self.ANCHOR, cgm_ramp(14, 10, 0, 64, 4.0, 50))
        self.assertEqual(v.silence_reason, SilenceReason.UPSTREAM_CAUSE)

    def test_digestion_tail_is_no_trigger(self):
        # A prior bolused meal explains the rise — announced, so the missed-meal
        # trigger is absent. Not the context gate, so NOT upstream-cause.
        cgm = cgm_ramp(28, 20, 0, 110, 2.0, 60)
        anchor = datetime(2026, 6, 28, 20, 40, 0)
        prior = meal(28, 19, 56, carbs=35.0, dose=6.0)
        v = classify_missed_meal(anchor, cgm, bolus_events=[prior])
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.NO_TRIGGER)


class CorrectionOnIobSilenceTest(unittest.TestCase):
    DAY = datetime(2026, 5, 7)

    def _at(self, h, m=0):
        return self.DAY + timedelta(hours=h, minutes=m)

    def _seg(self, t0, start_bg, slope, minutes, step=5):
        return [
            CgmReading(t=t0 + timedelta(minutes=step * k),
                       bg=start_bg + slope * step * k, type="EGV")
            for k in range(minutes // step + 1)
        ]

    def _corr(self, t, dose=5.0):
        return BolusEvent(t=t, insulin=dose, carbs=None)

    def _meal(self, t, carbs=45.0, dose=6.1):
        return BolusEvent(t=t, insulin=dose, carbs=carbs)

    def test_near_low_nadir_is_no_trigger(self):
        cgm = self._seg(self._at(19, 40), 243, -0.7, 140)
        boluses = [self._meal(self._at(19)), self._corr(self._at(20))]
        v = classify_correction_on_iob(self._at(22), 74.0, cgm, boluses)
        self.assertEqual(v.silence_reason, SilenceReason.NO_TRIGGER)

    def test_no_user_correction_is_no_trigger(self):
        cgm = self._seg(self._at(19, 40), 243, -0.7, 140)
        boluses = [self._meal(self._at(20), carbs=50.0, dose=10.0)]
        v = classify_correction_on_iob(self._at(22), 50.0, cgm, boluses)
        self.assertEqual(v.silence_reason, SilenceReason.NO_TRIGGER)

    def test_second_correction_defers_to_stacking_is_no_trigger(self):
        cgm = self._seg(self._at(19, 40), 243, -0.7, 140)
        boluses = [self._meal(self._at(19)), self._corr(self._at(20)),
                   self._corr(self._at(20, 30), dose=3.0)]
        v = classify_correction_on_iob(self._at(22), 50.0, cgm, boluses)
        self.assertEqual(v.silence_reason, SilenceReason.NO_TRIGGER)

    def test_cleared_iob_is_no_trigger(self):
        cgm = self._seg(self._at(19, 40), 243, -0.7, 140)
        boluses = [self._corr(self._at(20))]         # nothing on board to stack onto
        v = classify_correction_on_iob(self._at(22), 50.0, cgm, boluses)
        self.assertEqual(v.silence_reason, SilenceReason.NO_TRIGGER)

    def test_rising_chase_is_no_trigger(self):
        # Rising BG makes the correction a rational spike-chase; INFERRED tier, but
        # the over-stack behavior didn't happen (not the context gate) -> NO_TRIGGER.
        cgm = self._seg(self._at(19, 40), 120, 1.0, 25)
        cgm += self._seg(self._at(20, 10), 143, -0.8, 110)
        boluses = [self._meal(self._at(19)), self._corr(self._at(20))]
        v = classify_correction_on_iob(self._at(22), 55.0, cgm, boluses)
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.NO_TRIGGER)

    def test_recovery_from_suspend_is_upstream_cause(self):
        cgm = self._seg(self._at(19, 40), 243, -0.7, 140)
        basal = [
            BasalEvent(t=self._at(19, 15) + timedelta(minutes=5 * k),
                       delivery_type=CIQ_SUSPEND_TYPE, basal_rate=0.0,
                       profile_basal_rate=0.9)
            for k in range(6)                                # 19:15..19:40 suspended
        ]
        boluses = [self._meal(self._at(19)), self._corr(self._at(20))]
        v = classify_correction_on_iob(self._at(22), 50.0, cgm, boluses, basal)
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.UPSTREAM_CAUSE)


class CorrectionStackingSilenceTest(unittest.TestCase):
    def _corr(self, day, h, m, dose=3.0):
        return BolusEvent(t=datetime(2026, 6, day, h, m, 0), insulin=dose, carbs=None)

    def test_no_stack_is_no_trigger(self):
        cgm = cgm_ramp(15, 8, 0, 150, -0.3, 360)
        corrs = [self._corr(15, 8, 30), self._corr(15, 11, 30)]   # 3 h apart
        v = classify_correction_stacking(corrs, cgm)
        self.assertEqual(v.silence_reason, SilenceReason.NO_TRIGGER)

    def test_runaway_chase_is_no_trigger(self):
        cgm = cgm_ramp(26, 19, 0, 145, 2.0, 120)                 # high AND rising
        corrs = [self._corr(26, 19, 30, 4.0), self._corr(26, 20, 10, 4.0)]
        v = classify_correction_stacking(corrs, cgm)
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.NO_TRIGGER)

    def test_recovery_gate_is_upstream_cause(self):
        low = cgm_ramp(15, 13, 30, 62, 2.5, 45)                  # real low before stack
        corrs = [self._corr(15, 13, 45), self._corr(15, 14, 10)]
        v = classify_correction_stacking(corrs, low)
        self.assertEqual(v.silence_reason, SilenceReason.UPSTREAM_CAUSE)

    def test_stack_no_low_follows_is_horizon_expired(self):
        # A real stack onto live IOB, but no low ever arrives in the look-ahead —
        # the harmful outcome expired unrealized.
        cgm = cgm_ramp(15, 10, 0, 160, -0.2, 240)                # settles, never < 70
        corrs = [self._corr(15, 10, 10), self._corr(15, 10, 40)]
        v = classify_correction_stacking(corrs, cgm)
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.HORIZON_EXPIRED)


class SuspendSilenceTest(unittest.TestCase):
    ANCHOR = datetime(2026, 6, 15, 12, 0, 0)

    def test_no_episode_is_insufficient_data(self):
        v = classify_suspend(self.ANCHOR, cgm_flat(15, 12, 0, 100, 60), [])
        self.assertEqual(v.silence_reason, SilenceReason.INSUFFICIENT_DATA)

    def test_trivial_trim_is_no_trigger(self):
        basal = suspend_run(15, 12, 0, rows=2)                  # 5-min cut
        cgm = cgm_flat(15, 12, 0, 110, 30) + cgm_ramp(15, 12, 30, 110, -2.0, 30)
        v = classify_suspend(self.ANCHOR, cgm, basal)
        self.assertEqual(v.silence_reason, SilenceReason.NO_TRIGGER)

    def test_no_near_low_is_horizon_expired(self):
        # A real suspend, but the near-low outcome never arrived in the gate window.
        basal = suspend_run(15, 12, 0, rows=12)
        cgm = cgm_flat(15, 11, 30, 110, 120)                   # stays at 110 throughout
        v = classify_suspend(self.ANCHOR, cgm, basal)
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.HORIZON_EXPIRED)


class AttributeSilenceTest(unittest.TestCase):
    """attribute() surfaces the winning non-firing reason for a lever=None episode."""

    ISF, IC = 40.0, 10.0

    def test_lever_none_episode_exposes_reason_and_detail(self):
        # A benign meal that peaks ~160 and settles: no lever. The most-specific
        # classifier (carb-undercount) says "didn't run away" -> NO_TRIGGER, and the
        # detail (with the day's numbers) rides along.
        cgm = cgm_ramp(15, 12, 0, 120, 0.4, 120)
        m = meal(15, 12, 0, carbs=40.0, dose=8.0)
        eps = segment(collect_anchors([m], cgm, []))
        attr = attribute(eps[0], cgm, [m], [], isf=self.ISF)
        self.assertIsNone(attr.lever)
        self.assertIsNotNone(attr.silence)
        self.assertEqual(attr.silence.silence_reason, SilenceReason.NO_TRIGGER)
        self.assertTrue(attr.silence.detail)                   # human string carried

    def test_fired_lever_carries_no_silence(self):
        # A runaway dinner fires carb-undercount; a fired attribution has no silence.
        pre = cgm_flat(28, 19, 35, 148, 20)
        runup = cgm_ramp(28, 19, 56, 150, 2.4, 95)             # 150 -> ~370
        cgm = pre + runup
        m = meal(28, 19, 56, carbs=35.0, dose=8.0)
        eps = segment(collect_anchors([m], cgm, []))
        attr = attribute(eps[0], cgm, [m], [], isf=self.ISF)
        self.assertEqual(attr.lever, Lever.CARB_UNDERCOUNT)
        self.assertIsNone(attr.silence)


class LeverFiringRegressionTest(unittest.TestCase):
    """The set of levers firing on representative fixtures is UNCHANGED (ADR 0009).

    Minting silence reasons must not move which levers fire. Each fixture below fired
    its lever before #164; assert it still does (and never sprouts a silence reason).
    """

    ISF, IC = 40.0, 10.0

    def _fired(self, cgm, boluses, basal=()):
        eps = segment(collect_anchors(list(boluses), cgm, list(basal)))
        levers = []
        for e in eps:
            attr = attribute(e, cgm, list(boluses), list(basal),
                             isf=self.ISF)
            if attr.lever is not None:
                self.assertIsNone(attr.silence)                # fired -> no silence
                levers.append(attr.lever)
        return levers

    def test_carb_undercount_still_fires(self):
        cgm = cgm_flat(28, 19, 35, 148, 20) + cgm_ramp(28, 19, 56, 150, 2.4, 95)
        self.assertIn(Lever.CARB_UNDERCOUNT,
                      self._fired(cgm, [meal(28, 19, 56, carbs=35.0, dose=8.0)]))

    def test_missed_meal_still_fires(self):
        cgm = cgm_ramp(15, 15, 0, 130, 2.2, 100)               # from-flat rise, no bolus
        self.assertIn(Lever.MISSED_MEAL, self._fired(cgm, []))

    def test_benign_meal_fires_nothing(self):
        cgm = cgm_ramp(15, 12, 0, 120, 0.4, 120)
        self.assertEqual(self._fired(cgm, [meal(15, 12, 0, carbs=40.0, dose=8.0)]), [])


if __name__ == "__main__":
    unittest.main()
