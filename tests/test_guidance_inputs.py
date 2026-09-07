"""Public source inputs consumed by the future guidance projection."""

import unittest

from ciq_autotune.result import plan_value


class GuidanceInputsTest(unittest.TestCase):
    def test_instruction_values_use_accepted_pick_precision_and_positive_half_rounding(self):
        self.assertEqual(plan_value(0.1235, "basal_rate"), 0.124)
        self.assertEqual(plan_value(29.5, "isf"), 30.0)
        self.assertEqual(plan_value(5.25, "carb_ratio"), 5.3)
