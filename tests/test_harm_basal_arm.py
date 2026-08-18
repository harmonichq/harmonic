"""Integration test for the harm layer's basal arm end-to-end through
``analyze_basal`` (ADR 0038, revised by ADR 412): recurrent overnight fasting lows
gate the slot and defer the downward magnitude to the clean median — they never
raise it, and no longer invent a full 20% step against a median that reads == or >
current. ADR 412 retires the standalone step math (forecast 2026-07-18).
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.basal import analyze_basal
from ciq_autotune.events import BasalEvent, CgmReading
from ciq_autotune.harm import HarmConfig
from ciq_autotune.safety import Status


def _night(day, *, rate, programmed, bg=120.0, start_h=0, end_h=6):
    """One in-range night of flowing basal — feeds the clean-window median."""
    t0 = datetime(2022, 6, day, start_h, 0, 0)
    basal = [BasalEvent(t=t0, delivery_type="algorithmDelivery",
                        duration_mins=(end_h - start_h) * 60, basal_rate=rate,
                        profile_basal_rate=programmed)]
    cgm = [CgmReading(t=t0 + timedelta(minutes=5 * k), bg=bg, type="EGV")
           for k in range((end_h - start_h) * 60 // 5 + 1)]
    return basal, cgm


def _low_at_0300(day, nadir=50.0):
    """A fasting printed low at 03:00 (no bolus) on its own day."""
    t0 = datetime(2022, 6, day, 3, 0, 0)
    return [CgmReading(t=t0 + timedelta(minutes=5 * k), bg=nadir, type="EGV")
            for k in range(3)]


def _low_at_0500(day, nadir=50.0):
    """A fasting printed low at 05:00 (no bolus) on its own day."""
    t0 = datetime(2022, 6, day, 5, 0, 0)
    return [CgmReading(t=t0 + timedelta(minutes=5 * k), bg=nadir, type="EGV")
            for k in range(3)]


def _slot(slots, label):
    return next(s for s in slots if s.label == label)


def _build(*, rate, programmed, low_nights):
    basal, cgm = [], []
    for d in range(1, 13):  # 12 clean in-range nights → 03:00 clears the thin gate
        b, c = _night(d, rate=rate, programmed=programmed)
        basal += b
        cgm += c
    for d in low_nights:  # printed fasting lows on separate days
        cgm += _low_at_0300(d)
    return basal, cgm


def _suspend_night(day, *, programmed, slot_h=5):
    """A night where the slot's basal is CIQ-suspended: the programmed rate still
    shows through ``profile_basal_rate`` (so ``current`` is known) but the zero
    delivery is excluded from the clean window, so the slot has *no clean median* —
    the real dawn-slot signature (03:00–05:30 with zero clean nights)."""
    t0 = datetime(2022, 6, day, slot_h, 0, 0)
    return [BasalEvent(
        t=t0, delivery_type="algorithmDelivery (control-iq suspension)",
        duration_mins=30, basal_rate=0.0, profile_basal_rate=programmed)]


class BasalArmIntegrationTest(unittest.TestCase):
    def test_recurring_lows_hold_when_median_reads_at_current(self):
        # ADR 412 reference-day case: 03:00 clean median == current (0.72). The old
        # rule fabricated a −20% step (0.576); the revised rule holds at current —
        # the recurring-low gate keeps a raise blocked, but no invented cut against a
        # thick median that reads "no change".
        basal, cgm = _build(rate=0.72, programmed=0.72, low_nights=(20, 21))
        s = _slot(analyze_basal(basal, cgm, [], [], harm_config=HarmConfig()), "03:00")
        self.assertEqual(s.status, Status.HARM_GATED)
        self.assertEqual(s.recommended, 0.72)   # held at current, not 0.576
        self.assertFalse(s.asserts_move)         # a hold does not move the schedule
        self.assertEqual(s.evidence["harm"]["arm"], "basal")
        self.assertEqual(s.evidence["harm"]["arm_days"], 2)
        self.assertEqual(s.evidence["harm"]["row_days"], 2)
        # Compatibility aliases retained for basal explainers; canonical shared
        # row-level keys are arm_days / row_days.
        self.assertEqual(s.evidence["harm"]["band_nights"], 2)
        self.assertEqual(s.evidence["harm"]["slot_nights"], 2)

    def test_recurring_lows_clamp_to_a_median_below_current(self):
        # When the slot's own clean median sits below current, the downward magnitude
        # is the median (floored at one step), NOT the fabricated full step. Delivered
        # 0.60 vs programmed 0.72 → median 0.60 > 0.72·0.8 (0.576), so recommend 0.60.
        basal, cgm = _build(rate=0.60, programmed=0.72, low_nights=(20, 21))
        s = _slot(analyze_basal(basal, cgm, [], [], harm_config=HarmConfig()), "03:00")
        self.assertEqual(s.status, Status.HARM_LOWER)
        self.assertAlmostEqual(s.recommended, 0.60)   # the median, not 0.576
        self.assertTrue(s.asserts_move)

    def test_recurring_lows_with_no_clean_median_keep_the_full_step(self):
        # A dawn slot with recurring lows but zero clean nights has nothing to defer
        # to, so today's one full step stands (05:00, current 0.72 → 0.576).
        basal = _suspend_night(20, programmed=0.72) + _suspend_night(21, programmed=0.72)
        cgm = _low_at_0500(20) + _low_at_0500(21)
        s = _slot(analyze_basal(basal, cgm, [], [], harm_config=HarmConfig()), "05:00")
        self.assertEqual(s.status, Status.HARM_LOWER)
        self.assertAlmostEqual(s.recommended, round(0.72 * 0.8, 3))  # 0.576
        self.assertTrue(s.asserts_move)

    def test_thin_median_below_current_still_moves_downward(self):
        # A thin median (n<8, below the staging gate) can't assert a direction on its
        # own, but recurring lows unlock a downward move to it — ADR 283's thin
        # override survives, in the safe direction only.
        basal, cgm = [], []
        for d in range(1, 5):  # only 4 clean nights → below _MIN_SUPPORTED_NIGHTS (8)
            b, c = _night(d, rate=0.60, programmed=0.72)
            basal += b
            cgm += c
        cgm += _low_at_0300(20) + _low_at_0300(21)
        s = _slot(analyze_basal(basal, cgm, [], [], harm_config=HarmConfig()), "03:00")
        self.assertEqual(s.status, Status.HARM_LOWER)
        self.assertAlmostEqual(s.recommended, 0.60)
        self.assertTrue(s.asserts_move)          # moves below the thin gate, downward

    def test_edit_epoch_stops_a_second_cut_off_pre_edit_lows(self):
        # ADR 412 criterion 4: after a basal edit to the 05:00 slot, the pre-edit lows
        # no longer count toward that slot's nudge, so a second −20% cannot fire off
        # the same lows. They still *gate* it.
        basal = _suspend_night(20, programmed=0.72) + _suspend_night(21, programmed=0.72)
        cgm = _low_at_0500(20) + _low_at_0500(21)
        # Without an epoch the same inputs nudge (proving the reset is what changes it).
        s_no_epoch = _slot(
            analyze_basal(basal, cgm, [], [], harm_config=HarmConfig()), "05:00")
        self.assertEqual(s_no_epoch.status, Status.HARM_LOWER)
        # With the 05:00 rate edited on day 25 (after both lows), the slot holds.
        s = _slot(
            analyze_basal(basal, cgm, [], [], harm_config=HarmConfig(),
                          slot_starts={10: datetime(2022, 6, 25, 5, 0, 0)}),
            "05:00")
        self.assertNotEqual(s.status, Status.HARM_LOWER)  # no second cut
        self.assertFalse(s.asserts_move)
        self.assertTrue(s.evidence["harm"]["gated"])       # still gated evidence

    def test_disabled_by_default_leaves_slot_no_change(self):
        # harm_config=None (analyze_basal's default) → the clean verdict stands.
        basal, cgm = _build(rate=0.72, programmed=0.72, low_nights=(20, 21))
        s = _slot(analyze_basal(basal, cgm, [], []), "03:00")
        self.assertEqual(s.status, Status.NO_CHANGE)
        self.assertEqual(s.recommended, 0.72)
        self.assertNotIn("harm", s.evidence)

    def test_single_low_gates_a_raise_but_does_not_nudge(self):
        # Delivered 1.0 vs programmed 0.72 → clean verdict is a (capped) raise. One
        # printed low withholds that raise; without recurrence it does not force down.
        basal, cgm = _build(rate=1.0, programmed=0.72, low_nights=(20,))
        s = _slot(analyze_basal(basal, cgm, [], [], harm_config=HarmConfig()), "03:00")
        self.assertEqual(s.status, Status.HARM_GATED)
        self.assertEqual(s.recommended, 0.72)  # held at current, never raised
        self.assertFalse(s.asserts_move)

    def test_recurring_lows_never_raise_even_when_median_is_high(self):
        # Safety asymmetry: recurrent lows on a slot whose clean median screams RAISE
        # never add insulin. ADR 412: the median (1.0) reads above current (0.72), so
        # rather than fabricate a −20% cut we hold at current — the raise stays blocked.
        basal, cgm = _build(rate=1.0, programmed=0.72, low_nights=(20, 21, 22))
        s = _slot(analyze_basal(basal, cgm, [], [], harm_config=HarmConfig()), "03:00")
        self.assertEqual(s.status, Status.HARM_GATED)
        self.assertEqual(s.recommended, 0.72)    # held at current, never raised
        self.assertLessEqual(s.recommended, s.current)


if __name__ == "__main__":
    unittest.main()
