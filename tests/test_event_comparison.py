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

    def test_outcome_scope_uses_the_producer_landing_and_keeps_full_trace(self):
        occurrence = {
            "id": "meal-1", "anchor_t": "2024-05-01 06:00:00", "outcome_min": 18 * 60,
            "trace": {"cgm": [{"t": "2024-05-01 06:00:00"},
                              {"t": "2024-05-01 18:00:00"}]},
        }
        selected = scoped_outcome_occurrences(
            [occurrence], start=datetime(2024, 5, 1), end=datetime(2024, 5, 2),
            query=WindowQuery.clock(17 * 60, 19 * 60),
        )
        self.assertEqual(selected, [occurrence])
