"""Pre-empted (masked) lows — the #172 coaching count (ADR 0012).

A `source='manual'` **Rescue carb** whose drop was arrested *before it printed a
low* (no CGM low nadir near it) is a **Pre-empted low**: real downward insulin
pressure the CGM never printed as a low at all. It surfaces only as an aggregate **count**
on the Patterns view, attributed by the preceding bolus (meal → an I:C signal,
correction → an ISF signal, no live bolus IOB → unattributed), and is governed by
ADR 0012:

* never a rate / percentage / denominator — only a count;
* only `source='manual'` entries with **no nearby printed low nadir** (a manual
  entry sitting on a printed nadir is a printed-low *treatment*, owned by the low
  levers — excluded); `rise-prompt` / `low-prompt` excluded too;
* attributability gated on residual **bolus** IOB above one easily-changed floor;
* never a Lever, never scored against an Exposure, never a modeling input.

These tests pin the compute logic (a pure function of event lists — no store).
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.scenario.preempted import (
    ATTRIBUTABILITY_FLOOR_U,
    PRINTED_LOW_WINDOW_MIN,
    compute_preempted_lows,
)
from ciq_autotune.analyzers.scenario.payload import PreemptedLows
from ciq_autotune.events import BolusEvent, CarbEntry, CgmReading


# --- builders --------------------------------------------------------------

DAY = 4


def rescue(h, m, source="manual", grams=15.0, certainty="estimate"):
    """A Carb-log entry at (DAY, h:m). Defaults to a manual rescue carb."""
    return CarbEntry(
        t=datetime(2026, 6, DAY, h, m, 0), grams=grams,
        certainty=certainty, source=source,
    )


def meal(h, m, carbs=45.0, dose=5.0):
    return BolusEvent(t=datetime(2026, 6, DAY, h, m, 0), insulin=dose, carbs=carbs)


def correction(h, m, dose=3.0):
    return BolusEvent(t=datetime(2026, 6, DAY, h, m, 0), insulin=dose, carbs=None)


def cgm_flat(h, m, bg, minutes, step=5):
    t0 = datetime(2026, 6, DAY, h, m, 0)
    return [
        CgmReading(t=t0 + timedelta(minutes=step * k), bg=bg, type="EGV")
        for k in range(minutes // step + 1)
    ]


# A CGM backdrop that stays comfortably above the near-low line (75) around the
# rescue, so the pre-empted gate (no printed nadir) is open. Nadir 80 is the case
# the gate must hold: a drop arrested at 80 never printed a low.
def cgm_arrested_at_80():
    # 84 → 80 → 88 across ~2 h centered on 13:00; never touches 75.
    t0 = datetime(2026, 6, DAY, 12, 0, 0)
    bgs = [88, 86, 84, 82, 80, 80, 82, 84, 86, 90, 94, 98]
    return [CgmReading(t=t0 + timedelta(minutes=10 * k), bg=bg, type="EGV")
            for k, bg in enumerate(bgs)]


class PreemptedLowGateTest(unittest.TestCase):
    """The pre-empted subset gate: source='manual' AND no printed low nadir near it."""

    def test_masked_meal_preceded_rescue_attributes_ic(self):
        # A meal bolus 60 min before the rescue still carries residual IOB; the drop
        # is arrested at 80 (never prints a low). → one pre-empted low, I:C bucket.
        boluses = [meal(12, 0, carbs=45, dose=5.0)]
        entries = [rescue(13, 0)]
        got = compute_preempted_lows(entries, boluses, cgm_arrested_at_80())
        self.assertEqual(got.total, 1)
        self.assertEqual(got.ic, 1)
        self.assertEqual(got.isf, 0)
        self.assertEqual(got.unattributed, 0)

    def test_masked_correction_preceded_rescue_attributes_isf(self):
        # A pure correction (no carbs) 45 min before → the ISF bucket.
        boluses = [correction(12, 15, dose=3.0)]
        entries = [rescue(13, 0)]
        got = compute_preempted_lows(entries, boluses, cgm_arrested_at_80())
        self.assertEqual(got.total, 1)
        self.assertEqual(got.isf, 1)
        self.assertEqual(got.ic, 0)
        self.assertEqual(got.unattributed, 0)

    def test_masked_rescue_with_decayed_iob_is_unattributed(self):
        # The only bolus is 150 min back (residual ~0.06 U, below the 0.3 U floor):
        # a basal / exercise-style drop with no live bolus IOB → counted, unattributed.
        boluses = [meal(10, 30, carbs=45, dose=1.0)]
        entries = [rescue(13, 0)]
        got = compute_preempted_lows(entries, boluses, cgm_arrested_at_80())
        self.assertEqual(got.total, 1)
        self.assertEqual(got.unattributed, 1)
        self.assertEqual(got.ic, 0)
        self.assertEqual(got.isf, 0)

    def test_manual_entry_on_printed_nadir_is_excluded(self):
        # The CGM around the rescue reaches a printed near-low (72 ≤ 75): this is a
        # hand-logged printed-low *treatment* (ADR 0011), owned by the low levers.
        # Excluded from the pre-empted count even though it's source='manual'.
        t0 = datetime(2026, 6, DAY, 12, 30, 0)
        bgs = [90, 84, 78, 72, 74, 82, 96, 110]  # dips to 72
        cgm = [CgmReading(t=t0 + timedelta(minutes=10 * k), bg=bg, type="EGV")
               for k, bg in enumerate(bgs)]
        boluses = [meal(12, 0, carbs=45, dose=5.0)]
        entries = [rescue(13, 0)]
        got = compute_preempted_lows(entries, boluses, cgm)
        self.assertEqual(got.total, 0)

    def test_low_prompt_entry_is_excluded(self):
        # A low-prompt Carb-log entry always sits on a printed low — never this signal.
        boluses = [meal(12, 0, carbs=45, dose=5.0)]
        entries = [rescue(13, 0, source="low-prompt")]
        got = compute_preempted_lows(entries, boluses, cgm_arrested_at_80())
        self.assertEqual(got.total, 0)

    def test_rise_prompt_entry_is_excluded(self):
        # A rise-prompt (missed-meal) entry is a separate concern — not counted.
        boluses = [meal(12, 0, carbs=45, dose=5.0)]
        entries = [rescue(13, 0, source="rise-prompt")]
        got = compute_preempted_lows(entries, boluses, cgm_arrested_at_80())
        self.assertEqual(got.total, 0)


class PreemptedLowAttributionTest(unittest.TestCase):
    """Attribution keys off the most-recent delivered bolus whose residual clears the floor."""

    def test_most_recent_above_floor_bolus_wins_over_a_decayed_recent_one(self):
        # A tiny correction 10 min before the rescue is below the floor (0.2·~0.97 <
        # 0.3), so it is NOT a candidate; the meal 90 min back still clears the floor.
        # → attribute to the meal (I:C), not the negligible recent correction.
        boluses = [meal(11, 30, carbs=45, dose=5.0), correction(12, 50, dose=0.2)]
        entries = [rescue(13, 0)]
        got = compute_preempted_lows(entries, boluses, cgm_arrested_at_80())
        self.assertEqual(got.total, 1)
        self.assertEqual(got.ic, 1)
        self.assertEqual(got.isf, 0)

    def test_bolus_after_the_rescue_never_attributes(self):
        # A bolus delivered *after* the rescue can't have run the drop. With no prior
        # bolus, the rescue is counted but unattributed.
        boluses = [meal(13, 30, carbs=45, dose=5.0)]
        entries = [rescue(13, 0)]
        got = compute_preempted_lows(entries, boluses, cgm_arrested_at_80())
        self.assertEqual(got.total, 1)
        self.assertEqual(got.unattributed, 1)

    def test_meal_iff_carbs_positive_not_the_meal_floor(self):
        # Classification is `carbs > 0`, NOT the anchor MEAL_MIN_CARBS (10). A 4 g
        # carb-bearing bolus is a meal here → I:C.
        boluses = [BolusEvent(t=datetime(2026, 6, DAY, 12, 15, 0), insulin=3.0, carbs=4.0)]
        entries = [rescue(13, 0)]
        got = compute_preempted_lows(entries, boluses, cgm_arrested_at_80())
        self.assertEqual(got.ic, 1)
        self.assertEqual(got.isf, 0)

    def test_extended_bolus_residual_uses_the_bolusiob_curve(self):
        # An extended (square/dual-wave) bolus's residual must come from the sanctioned
        # BolusIob curve — spread across extended_duration — not a hand-rolled point
        # mass at delivery. Locks the #172-review fix against regression.
        from ciq_autotune.analyzers.scenario.preempted import _residual
        from ciq_autotune.insulin import BolusIob
        from ciq_autotune.model import ModelConfig
        cfg = ModelConfig()
        b = BolusEvent(t=datetime(2026, 6, DAY, 12, 0, 0), insulin=5.0, carbs=45.0,
                       standard_percent=50, extended_duration=120)
        at = datetime(2026, 6, DAY, 13, 0, 0)
        self.assertAlmostEqual(
            _residual(b, at, cfg.insulin_peak_min, cfg.insulin_dia_min),
            BolusIob([b], cfg.insulin_peak_min, cfg.insulin_dia_min).at(at),
        )

    def test_multiple_rescues_each_counted_and_bucketed(self):
        boluses = [meal(12, 0, dose=5.0), correction(15, 15, dose=3.0)]
        # Second arrested-at-80 backdrop three hours later.
        cgm = cgm_arrested_at_80() + [
            CgmReading(t=datetime(2026, 6, DAY, 15, 0, 0) + timedelta(minutes=10 * k),
                       bg=bg, type="EGV")
            for k, bg in enumerate([88, 84, 80, 80, 84, 90, 96])
        ]
        entries = [rescue(13, 0), rescue(16, 0)]
        got = compute_preempted_lows(entries, boluses, cgm)
        self.assertEqual(got.total, 2)
        self.assertEqual(got.ic, 1)
        self.assertEqual(got.isf, 1)


class PreemptedLowPayloadTest(unittest.TestCase):
    """The count-object contract: a count with attribution + the exposed floor."""

    def test_empty_inputs_produce_a_zero_count(self):
        got = compute_preempted_lows([], [], [])
        self.assertIsInstance(got, PreemptedLows)
        self.assertEqual(got.total, 0)
        self.assertEqual((got.ic, got.isf, got.unattributed), (0, 0, 0))

    def test_to_dict_shape_and_floor_exposed(self):
        boluses = [meal(12, 0, dose=5.0)]
        entries = [rescue(13, 0)]
        d = compute_preempted_lows(entries, boluses, cgm_arrested_at_80()).to_dict()
        for key in ("total", "ic", "isf", "unattributed", "floor_u"):
            self.assertIn(key, d)
        # total is exactly the sum of the buckets — never a rate/denominator.
        self.assertEqual(d["total"], d["ic"] + d["isf"] + d["unattributed"])
        self.assertEqual(d["floor_u"], ATTRIBUTABILITY_FLOOR_U)

    def test_no_rate_field_anywhere(self):
        # ADR 0012 §1: never a rate / percentage / "% of meals".
        d = compute_preempted_lows([rescue(13, 0)], [], cgm_arrested_at_80()).to_dict()
        for forbidden in ("rate", "pct", "percent", "denominator", "n", "exposure"):
            self.assertNotIn(forbidden, d)

    def test_constants_are_the_expected_defaults(self):
        self.assertEqual(ATTRIBUTABILITY_FLOOR_U, 0.3)
        self.assertGreater(PRINTED_LOW_WINDOW_MIN, 0)
