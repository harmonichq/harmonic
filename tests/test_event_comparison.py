"""Reusable event-trace support retained for case-file projections."""

import unittest

from ciq_autotune.event_comparison import project_cohort


class EventTraceSupportTest(unittest.TestCase):
    def test_project_cohort_keeps_case_file_support_and_quantiles(self):
        projection = project_cohort("fired", [
            {"id": "one", "trace": {"cgm": [{"minute": 0, "bg": 100}]}},
            {"id": "two", "trace": {"cgm": [{"minute": 0, "bg": 120}]}},
        ], [0, 0])
        self.assertEqual(projection["occurrence_ids"], ["one", "two"])
        self.assertEqual(projection["points"][0]["median"], 110)
