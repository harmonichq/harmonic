"""Reusable event-trace support retained for case-file projections."""

import unittest

from datetime import datetime

from ciq_autotune.event_comparison import project_cohort, scoped_outcome_occurrences
from ciq_autotune.window_membership import WindowQuery


class EventTraceSupportTest(unittest.TestCase):
    def test_project_cohort_keeps_case_file_support_and_quantiles(self):
        projection = project_cohort("fired", [
            {"id": "one", "trace": {"cgm": [{"minute": 0, "bg": 100}]}},
            {"id": "two", "trace": {"cgm": [{"minute": 0, "bg": 120}]}},
        ], [0, 0])
        self.assertEqual(projection["occurrence_ids"], ["one", "two"])
        self.assertEqual(projection["points"][0]["median"], 110)

    def test_outcome_scope_uses_the_producer_landing_across_arm_boundaries(self):
        antecedent = {
            "id": "meal-1", "anchor_t": "2024-04-30 23:00:00",
            "outcome_t": "2024-05-01 18:00:00", "outcome_min": 18 * 60,
            "trace": {"cgm": [{"t": "2024-05-01 06:00:00"},
                              {"t": "2024-05-01 18:00:00"}]},
        }
        reverse = {
            "id": "meal-2", "anchor_t": "2024-05-01 18:00:00",
            "outcome_t": "2024-05-02 18:00:00", "outcome_min": 18 * 60,
            "trace": {"cgm": [{"t": "2024-05-01 18:00:00"},
                              {"t": "2024-05-02 18:00:00"}]},
        }
        selected = scoped_outcome_occurrences(
            [antecedent, reverse], start=datetime(2024, 5, 1), end=datetime(2024, 5, 2),
            query=WindowQuery.clock(17 * 60, 19 * 60),
        )
        self.assertEqual(selected, [antecedent])


class CompletedMealPopulationTest(unittest.TestCase):
    """ADR 470: the completed carb-bolus population counts meals, not boluses."""

    def test_a_split_meal_is_one_completed_meal_at_its_first_bolus(self):
        from datetime import timedelta

        from ciq_autotune.event_comparison import completed_carb_boluses
        from ciq_autotune.events import BolusEvent

        noon = datetime(2024, 5, 3, 12, 0)
        bolus = []
        for day, gap in enumerate((10, 30, 35)):
            first = noon + timedelta(days=day)
            bolus += [
                BolusEvent(t=first, completion="Completed", insulin=4.5, carbs=45.0,
                           seq_num=100 + day),
                BolusEvent(t=first + timedelta(minutes=gap), completion="Completed",
                           insulin=2.0, carbs=20.0, seq_num=200 + day),
            ]

        meals = completed_carb_boluses(bolus)

        self.assertEqual([(meal.t, meal.seq_num, meal.carbs, meal.insulin) for meal in meals], [
            (noon, 100, 65.0, 6.5),
            (noon + timedelta(days=1), 101, 65.0, 6.5),
            (noon + timedelta(days=2), 102, 45.0, 4.5),
            (noon + timedelta(days=2, minutes=35), 202, 20.0, 2.0),
        ])
