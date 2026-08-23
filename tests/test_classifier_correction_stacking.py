"""Correction-stacking instance classifier tests (#73, epic #70).

The judgment the old ``correction_stacking`` detector got wrong: it counted *any*
run of user corrections within 60 min as risky, with no notion of *why* BG was
being corrected. Two shapes it conflated:

* ``stacked, not high/rising, -> later low`` — a genuine over-stack (piling
  corrections onto live IOB), must still flag.
* ``high and still rising -> corrections chase it`` — the rational chase of a
  runaway high (the BG 145->375 undercounted meal the carb-undercount suite reads
  from its own angle), must NOT flag: that lever is carb-undercount / I:C, not
  "stacking."

Plus the outcome gate: a stack that harms nothing (IOB already cleared, or no low
follows) is not a risky stack.
"""

import unittest
from datetime import datetime, timedelta

# Import the classifier from its submodule path directly (the package __init__ is
# owned by the orchestrator; sibling classifier agents run in parallel on it).
from ciq_autotune.analyzers.classifiers.context_gate import (
    CIQ_SUSPEND_TYPE,
    UpstreamCause,
)
from ciq_autotune.analyzers.classifiers.correction_stacking import (
    classify_correction_stacking,
)
from ciq_autotune.analyzers.classifiers.evidence import EvidenceTier
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading


# --- builders (mirror tests/test_classifier_late_bolus.py conventions) ------


def cgm_ramp(day, start_h, start_min, start_bg, slope_per_min, minutes):
    """A CGM series of 5-min readings ramping at ``slope_per_min`` mg/dL/min."""
    t0 = datetime(2026, 6, day, start_h, start_min, 0)
    return [
        CgmReading(t=t0 + timedelta(minutes=5 * k),
                   bg=start_bg + slope_per_min * 5 * k, type="EGV")
        for k in range(minutes // 5 + 1)
    ]


def correction(day, hh, mm, dose=3.0, seq_num=None):
    """A user correction bolus (no carbs, above the 1U user floor)."""
    return BolusEvent(t=datetime(2026, 6, day, hh, mm, 0), insulin=dose, carbs=None,
                      seq_num=seq_num)


def suspend_run(day, hh, mm, rows=6, cadence=5):
    """A run of ``rows`` consecutive CIQ-suspended basal rows, ``cadence`` min apart."""
    t0 = datetime(2026, 6, day, hh, mm, 0)
    return [
        BasalEvent(t=t0 + timedelta(minutes=cadence * k), delivery_type=CIQ_SUSPEND_TYPE,
                   basal_rate=0.0, profile_basal_rate=0.9)
        for k in range(rows)
    ]


class RunawayChaseVsOverStackTest(unittest.TestCase):
    """The core `runaway chase (exclude)` vs `over-stack -> low (flag)` contrast."""

    def test_runaway_chase_is_not_flagged(self):
        # An evening BG runs away 145 -> 375 off an undercounted meal. Two
        # corrections chase it; the second lands with BG high and still climbing.
        # Rational chase of a runaway -> NOT a risky stack.
        cgm = cgm_ramp(26, 19, 0, 145, 2.0, 120)          # 145 -> ~375 by ~21:00
        corrs = [correction(26, 19, 30, 4.0), correction(26, 20, 10, 4.0)]
        v = classify_correction_stacking(corrs, cgm)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertGreaterEqual(v.bg_at_stack, 180.0)     # BG was high ...
        self.assertGreater(v.pre_stack_slope, 0.5)        # ... and still rising
        self.assertIn("runaway", v.detail)

    def test_stack_not_high_rising_then_low_is_flagged(self):
        # Two corrections 30 min apart while BG is only mildly high and *falling*
        # (not a runaway), the second onto live IOB; BG then crashes to 58.
        fall = cgm_ramp(15, 14, 0, 160, -0.8, 60)          # 160 -> ~112 by 15:00, falling
        crash = cgm_ramp(15, 15, 5, 108, -1.2, 60)         # keeps dropping to ~58
        cgm = fall + crash
        corrs = [correction(15, 14, 10, 3.0), correction(15, 14, 40, 3.0)]
        v = classify_correction_stacking(corrs, cgm)
        self.assertTrue(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertGreaterEqual(v.iob_at_stack, 0.5)       # landed on live IOB
        self.assertIsNotNone(v.nadir_bg)
        self.assertLessEqual(v.nadir_bg, 70.0)             # a real low followed
        self.assertAlmostEqual(v.gap_min, 30.0, delta=0.1)

    def test_three_corrections_choose_the_last_canonical_equal_time_pair(self):
        fall = cgm_ramp(15, 14, 0, 160, -0.8, 60)
        crash = cgm_ramp(15, 15, 5, 108, -1.2, 60)
        corrections = [
            correction(15, 14, 40, seq_num=12),
            correction(15, 14, 10, seq_num=10),
            correction(15, 14, 40, seq_num=11),
        ]
        verdict = classify_correction_stacking(corrections, fall + crash)
        self.assertTrue(verdict.matched)
        self.assertEqual((verdict.previous_seq_num, verdict.second_seq_num), (11, 12))


class NoHarmTest(unittest.TestCase):
    """A stack that harms nothing is not a risky stack."""

    def test_stack_but_no_low_follows_is_not_flagged(self):
        # Two corrections close together onto live IOB, but BG settles in-range —
        # no low follows. Not risky.
        cgm = cgm_ramp(15, 10, 0, 160, -0.2, 240)          # 160 -> ~112, never < 70
        corrs = [correction(15, 10, 10, 3.0), correction(15, 10, 40, 3.0)]
        v = classify_correction_stacking(corrs, cgm)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)
        self.assertIsNone(v.nadir_bg)
        self.assertIn("no low followed", v.detail)

    def test_corrections_far_apart_are_not_a_stack(self):
        # Two corrections 3 h apart never stack — the first has long cleared.
        cgm = cgm_ramp(15, 8, 0, 150, -0.3, 360)
        corrs = [correction(15, 8, 30, 3.0), correction(15, 11, 30, 3.0)]
        v = classify_correction_stacking(corrs, cgm)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)
        self.assertIn("nothing stacked", v.detail)

    def test_single_correction_is_not_a_stack(self):
        cgm = cgm_ramp(15, 12, 0, 150, -0.5, 120)
        v = classify_correction_stacking([correction(15, 12, 30, 3.0)], cgm)
        self.assertFalse(v.matched)
        self.assertIn("nothing stacked", v.detail)

    def test_sub_floor_auto_corrections_do_not_stack(self):
        # Two sub-1U doses close together are Control-IQ auto-corrections, not the
        # user stacking — they don't count.
        cgm = cgm_ramp(15, 12, 0, 130, -1.0, 120)          # would crash if it counted
        corrs = [correction(15, 12, 10, 0.4), correction(15, 12, 40, 0.5)]
        v = classify_correction_stacking(corrs, cgm)
        self.assertFalse(v.matched)
        self.assertIn("nothing stacked", v.detail)


class IobGateTest(unittest.TestCase):
    """The IOB-aware distinction: a stack onto cleared insulin is not over-stacking."""

    def test_second_correction_onto_cleared_iob_is_not_over_stack(self):
        # Corrections within the 60-min window but the first is tiny (0.1 U) — it
        # has essentially cleared by the time the second lands, so even though a
        # low follows, this isn't insulin *stacking*.
        fall = cgm_ramp(15, 14, 0, 130, -1.0, 120)          # drifts down to ~58
        corrs = [
            BolusEvent(t=datetime(2026, 6, 15, 14, 10, 0), insulin=0.1, carbs=None),
            correction(15, 14, 55, 3.0),
        ]
        # The 0.1 U dose is below the user floor, so only one *user* correction
        # exists -> nothing stacked at all.
        v = classify_correction_stacking(corrs, fall)
        self.assertFalse(v.matched)
        self.assertIn("nothing stacked", v.detail)


class RecoveryGateTest(unittest.TestCase):
    """A stack landing mid-recovery from an observable low/suspend is not fresh."""

    def test_stack_after_recent_low_is_gated_as_recovery(self):
        # Two corrections close together, but a real low (62) sits in the window
        # before the second — it's landing into a recovery, not a fresh over-stack.
        low = cgm_ramp(15, 13, 30, 62, 2.5, 45)             # low 62 -> rebound
        corrs = [correction(15, 13, 45, 3.0), correction(15, 14, 10, 3.0)]
        v = classify_correction_stacking(corrs, low)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertIsNotNone(v.gate)
        self.assertIn(v.gate.cause, (UpstreamCause.RECENT_LOW, UpstreamCause.BOTH))

    def test_stack_after_defensive_suspend_is_gated(self):
        # Same, but the upstream cause is a Control-IQ suspend, not a low. BG stays
        # below the runaway-high line so the recovery gate (not the runaway
        # exclusion) is what carries the not-matched verdict.
        cgm = cgm_ramp(15, 13, 0, 130, 0.3, 120)            # rising slowly, never low/high
        basal = suspend_run(15, 13, 0, rows=6)              # suspend 13:00-13:25
        corrs = [correction(15, 13, 40, 3.0), correction(15, 14, 10, 3.0)]
        v = classify_correction_stacking(corrs, cgm, basal)
        self.assertFalse(v.matched)
        self.assertEqual(v.gate.cause, UpstreamCause.DEFENSIVE_SUSPEND)


if __name__ == "__main__":
    unittest.main()
