"""The carb-ratio ledger converts each meal's glucose miss with its own ISF (ADR 563).

Two stores carry the same meals, bolus stamps, printed lows and meal-window basal,
and differ only in their fasting nights: one lane answers the insulin that acted
overnight, the other is a flat wall, so the ISF analyzer serves a real fasting
estimate for the first and zero for the second. The carb-ratio result must not
move with that estimate, and the zero must not switch the glucose term off.
"""

import tempfile
import unittest

from ciq_autotune.analyze import analyze
from ciq_autotune.store import Store

from scripts.qa_e2e_cases import QA_CASES, WINDOW_DAYS, execute_case, materialize_case


_CASE = next(case for case in QA_CASES if case.name == "behavioral-carb-counting")


def _analysis(*, responded_nights: bool) -> dict:
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
        with Store.open(database.name) as store:
            if responded_nights:
                materialize_case(store, _CASE)
            else:
                # The recipe alone: its lane nights stay the flat 120 mg/dL wall
                # `materialize_case` would otherwise make answer the acted insulin.
                _CASE.recipe(store)
        with Store.open_readonly(database.name) as store:
            return analyze(
                store, window_days=WINDOW_DAYS,
                carb_entries=store.carb_entries(),
                prompt_responses=store.prompt_responses(),
            ).to_dict()


class DoseStampedIsfConversionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.measured = _analysis(responded_nights=True)
        cls.flat = _analysis(responded_nights=False)

    def test_the_two_stores_serve_different_fasting_estimates_one_zero(self):
        measured = self.measured["isf"][0]["estimate"]["value"]
        flat = self.flat["isf"][0]["estimate"]["value"]
        self.assertIsNotNone(measured)
        self.assertNotEqual(measured, 0.0)
        self.assertEqual(flat, 0.0)

    def test_carb_ratio_rows_and_blocks_do_not_move_with_the_fasting_estimate(self):
        self.assertEqual(self.measured["ic"], self.flat["ic"])
        self.assertEqual(self.measured["ic_blocks"], self.flat["ic_blocks"])

    def test_every_meal_with_a_readable_outcome_carries_its_travel_in_units(self):
        for analysis in (self.measured, self.flat):
            points = [point for row in analysis["ic"]
                      for point in (row.get("evidence") or {}).get("points", [])]
            runs = [run for block in analysis["ic_blocks"]
                    for run in block["evidence"]["runs"]]
            read = [row for row in points + runs if row["outcome_bg"] is not None]
            self.assertTrue(read, "no meal read its full-DIA outcome")
            for row in read:
                with self.subTest(t=row["t"]):
                    self.assertIsNotNone(row["bg_outcome_u"])


def _served_runs(case_name: str) -> dict:
    case = next(case for case in QA_CASES if case.name == case_name)
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
        with Store.open(database.name) as store:
            materialize_case(store, case)
        with Store.open_readonly(database.name) as store:
            analysis = execute_case(store, case).analysis
    return {run["t"]: run for block in analysis["ic_blocks"]
            for run in block["evidence"]["runs"]}


class EachRunConvertsWithItsOwnIsfTest(unittest.TestCase):
    """The `ic-dose-stamped-isf` QA case: every meal travels 60 mg/dL to its read.

    Its schedule programs ISF 30 before noon and 60 after; a second capture on
    day 50 strengthens the morning to 40, and the morning stamps follow it.
    """

    @classmethod
    def setUpClass(cls):
        cls.runs = _served_runs("ic-dose-stamped-isf")

    def assert_converted(self, days, hour, units):
        for day in days:
            run = self.runs[f"2024-{day}T{hour:02d}:00:00"]
            with self.subTest(day=day, hour=hour):
                self.assertEqual(run["outcome_bg"], 180.0)
                self.assertEqual(run["bg_outcome_u"], units)

    def test_each_meal_converts_with_the_isf_stamped_on_its_bolus(self):
        self.assert_converted(("03-13", "03-15", "03-17", "03-19", "03-21", "03-23"), 9, 2.0)
        self.assert_converted(("04-22", "04-24", "04-26", "04-28", "04-30", "05-02"), 9, 1.5)
        self.assert_converted(("03-13", "03-15", "03-17", "03-19", "03-21", "03-23",
                               "04-22", "04-24", "04-26", "04-28", "04-30"), 18, 1.0)

    def test_an_unstamped_meal_converts_with_its_segment_as_of_its_time(self):
        # Before the day-50 capture, the morning segment it programs (40) is ignored.
        self.assert_converted(("03-25", "03-27", "03-29"), 9, 2.0)
        self.assert_converted(("03-25", "03-27", "03-29"), 18, 1.0)
        self.assert_converted(("05-04", "05-06", "05-08"), 9, 1.5)

    def test_an_unstamped_meal_before_every_capture_is_not_converted(self):
        for day in ("03-04", "03-06", "03-08"):
            run = self.runs[f"2024-{day}T09:00:00"]
            with self.subTest(day=day):
                self.assertEqual(run["outcome_bg"], 180.0)
                self.assertIsNone(run["bg_outcome_u"])
                self.assertFalse(run["in_pool"])


if __name__ == "__main__":
    unittest.main()
