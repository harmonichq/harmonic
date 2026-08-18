"""User-correction predicate gates on Msg2 provenance, not the 1U floor (#135).

The canonical predicate (``scenario.anchors._is_user_correction``) and its mirror
in the ``correction_stacking`` classifier must both read the pump's own bolus
provenance (``BolusEvent.is_automatic_bolus``, from ``Msg2.options``) and only fall
back to the ``USER_CORRECTION_FLOOR_U`` magnitude heuristic when provenance is
absent (NULL — historical rows / no Msg2). The key regression guard: a >= 1U
Control-IQ automatic bolus (options=3), which the old floor mis-counted as a user
correction, is NOT one.
"""

import unittest
from datetime import datetime

from ciq_autotune.analyzers.classifiers.correction_stacking import (
    _is_user_correction as _stacking_is_user_correction,
)
from ciq_autotune.analyzers.scenario.anchors import _is_user_correction
from ciq_autotune.events import BolusEvent

_T = datetime(2026, 6, 1, 12, 0, 0)


def _bolus(insulin=None, carbs=None, options=None, correction_insulin=None):
    return BolusEvent(_T, insulin=insulin, carbs=carbs, bolus_options=options,
                      correction_insulin=correction_insulin)


class IsAutomaticBolusPropertyTest(unittest.TestCase):
    def test_control_iq_codes_are_automatic(self):
        for code in (3, 6):  # Automatic, Eating Soon Automatic
            self.assertIs(_bolus(options=code).is_automatic_bolus, True)

    def test_user_codes_are_not_automatic(self):
        for code in (0, 1, 2, 4, 5, 7):  # Standard/Extended/Quick/BLE.../Late
            self.assertIs(_bolus(options=code).is_automatic_bolus, False)

    def test_absent_or_unknown_provenance_is_none(self):
        self.assertIsNone(_bolus(options=None).is_automatic_bolus)
        self.assertIsNone(_bolus(options=99).is_automatic_bolus)  # future/unknown code


class UserCorrectionPredicateTest(unittest.TestCase):
    """Both mirrored predicates must return the same verdict on the same input."""

    def _both(self, b):
        anchor = _is_user_correction(b)
        stacking = _stacking_is_user_correction(b)
        self.assertEqual(anchor, stacking,
                         f"predicate mirrors disagree on {b!r}: "
                         f"anchors={anchor} stacking={stacking}")
        return anchor

    def test_large_automatic_bolus_is_not_a_user_correction(self):
        # The regression guard: a >= 1U options=3 bolus with no carbs. The old
        # magnitude floor (insulin >= 1U, no carbs) mislabeled all of these as
        # user corrections; provenance says it's Control-IQ, so it is NOT one.
        self.assertFalse(self._both(_bolus(insulin=1.43, carbs=0, options=3)))

    def test_small_automatic_bolus_is_not_a_user_correction(self):
        self.assertFalse(self._both(_bolus(insulin=0.4, carbs=0, options=3)))

    def test_user_bolus_with_insulin_no_carbs_is_a_correction(self):
        for code in (0, 1, 2, 4, 5, 7):
            self.assertTrue(self._both(_bolus(insulin=2.0, carbs=0, options=code)))

    def test_user_bolus_below_floor_is_still_a_correction_when_provenance_says_user(self):
        # Provenance, not magnitude, decides once it's present: a 0.4U user-tagged
        # correction with no carbs is a user correction even below the 1U floor.
        self.assertTrue(self._both(_bolus(insulin=0.4, carbs=0, options=0)))

    def test_carbs_without_msg3_split_are_meal_only(self):
        # No correction_insulin (no Msg3 join): a carb-tagged bolus stays meal-only,
        # today's behavior — the loosening only fires when the split is present (#160).
        for code in (0, 3, None):
            self.assertFalse(self._both(_bolus(insulin=5.0, carbs=40, options=code)))

    def test_no_insulin_is_never_a_correction(self):
        self.assertFalse(self._both(_bolus(insulin=None, carbs=0, options=0)))

    def test_null_provenance_falls_back_to_floor(self):
        # options=None: identical to the pre-#135 floor behaviour — >= 1U no-carb
        # is a correction, sub-1U is not.
        self.assertTrue(self._both(_bolus(insulin=1.2, carbs=0, options=None)))
        self.assertFalse(self._both(_bolus(insulin=0.6, carbs=0, options=None)))


class MixedFoodCorrectionAdmissionTest(UserCorrectionPredicateTest):
    """A mixed food+correction bolus is admitted on its correction *component* (#160).

    Reuses ``UserCorrectionPredicateTest._both`` so every case also asserts the two
    mirrored predicates agree.
    """

    def test_mixed_bolus_with_component_over_floor_is_a_correction(self):
        # A mixed dose: total delivered with a correction component over the floor,
        # user-tagged. Admitted as a correction (its component clears the 1.0U floor)
        # even though it carries carbs — the exact case the old carb-exclusion mis-dropped.
        self.assertTrue(self._both(
            _bolus(insulin=5.4, carbs=50, options=0, correction_insulin=1.4)))

    def test_mixed_bolus_with_component_below_floor_is_not_a_correction(self):
        # A big meal with a 0.5U pump-folded correction: the component is below the
        # mixed floor, so it's meal-only (accepted asymmetry vs a standalone 0.5U).
        self.assertFalse(self._both(
            _bolus(insulin=8.5, carbs=80, options=0, correction_insulin=0.5)))

    def test_mixed_bolus_scores_component_not_total(self):
        # The total (8.5U) is well over the floor; only the 0.3U component matters,
        # so this is NOT admitted — proof the floor reads the component, not total.
        self.assertFalse(self._both(
            _bolus(insulin=8.5, carbs=80, options=0, correction_insulin=0.3)))

    def test_mixed_bolus_no_split_is_meal_only(self):
        # correction_insulin is None (no Msg3): meal-only, whatever the total.
        self.assertFalse(self._both(
            _bolus(insulin=6.0, carbs=45, options=0, correction_insulin=None)))

    def test_mixed_bolus_automatic_provenance_is_never_a_correction(self):
        # A CIQ automatic dose is never a user correction even with a big component
        # (defensive — automatic boluses don't carry carbs in practice).
        self.assertFalse(self._both(
            _bolus(insulin=5.4, carbs=50, options=3, correction_insulin=1.4)))

    def test_mixed_bolus_null_provenance_with_component_over_floor_is_a_correction(self):
        # No Msg2 (options=None) but a real Msg3 component >= floor: admitted, since
        # "isn't CIQ automatic" holds when provenance is absent.
        self.assertTrue(self._both(
            _bolus(insulin=5.4, carbs=50, options=None, correction_insulin=1.4)))


if __name__ == "__main__":
    unittest.main()
