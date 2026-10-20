"""A Pattern's causes, largest harm first, each with its own trace (ADR 593).

Read through the public HTTP routes on manufactured QA case stores. Every expected
value is a literal read once from the case's served answers.
"""
import unittest

from tests.test_queue_evidence import HAS_API, _serve


def _cause(subject, title, count, pinnable):
    return {"subject": subject, "title": title, "count": count, "pinnable": pinnable}


class _CaseStore(unittest.TestCase):
    CASE = None
    PATTERN = None

    @classmethod
    def setUpClass(cls):
        cls.database, cls.client = _serve(cls.CASE)
        cls.findings = cls.client.get("/api/diagnose/findings").json()
        projection_id = cls.client.get(
            "/api/diagnose/finding-case-file-preparation").json()["projection_id"]
        cls.case = cls.client.get("/api/diagnose/finding-case-file", params={
            "projection_id": projection_id, "finding_id": cls.PATTERN,
            "alignment": "event"}).json()

    @classmethod
    def tearDownClass(cls):
        cls.client.close(); cls.database.close()

    def _row(self, row_id):
        return next(row for row in self.findings["rows"] if row["id"] == row_id)

    def _causes(self):
        return [(cause["subject"], cause["pattern"]["anchors"],
                 len(cause["pattern"]["episodes"]))
                for cause in self.case["traces"]["causes"]]

    def _members(self):
        return [(occurrence["anchor"]["t"], occurrence["member"])
                for occurrence in self.case["occurrences"]
                if occurrence["member"] != "clean"]

    def test_the_causes_together_draw_the_patterns_anchors(self):
        drawn = [anchor for cause in self.case["traces"]["causes"]
                 for anchor in cause["pattern"]["anchors"]]
        self.assertEqual(sorted(set(drawn)), sorted(self.case["traces"]["pattern"]["anchors"]))


@unittest.skipUnless(HAS_API, "api extra is installed")
class MealPatternCauseOrderTest(_CaseStore):
    """Highs after meals keeps its row: Carb undercount, first in the roster, claims
    four milder rises, Late bolus three longer highs."""

    CASE = "pattern-meal-two-causes"
    PATTERN = "pattern:highs_after_meals"

    def test_the_pattern_row_serves_its_causes_by_severity(self):
        row = self._row("pattern:highs_after_meals")
        self.assertEqual([s["sentence"] for s in row["count_sentences"]],
                         ["7 of 21 meals ran high"])
        self.assertEqual(row["cause_counts"], [
            _cause("habit:late_bolus", "Late bolus", 3, True),
            _cause("habit:carb_undercount", "Carb undercount", 4, True),
        ])
        self.assertEqual((row["pattern"]["k"], row["pattern"]["n"]), (7, 21))
        self.assertEqual([member["subject"] for member in row["pattern"]["members"]],
                         ["habit:carb_undercount", "habit:late_bolus", "setting:carb_ratio"])

    def test_a_pattern_row_with_no_count_serves_no_causes(self):
        for row_id in ("pattern:highs_after_treating_lows",
                       "pattern:lows_after_correcting_highs", "pattern:lows_after_meals"):
            row = self._row(row_id)
            self.assertIsNone(row["count_sentences"], row_id)
            self.assertIsNone(row["cause_counts"], row_id)

    def test_each_cause_is_drawn_from_its_own_meals(self):
        self.assertEqual(self._causes(), [
            ("habit:late_bolus",
             ["2024-05-17 12:05:00", "2024-05-18 12:05:00", "2024-05-19 12:05:00"], 3),
            ("habit:carb_undercount",
             ["2024-05-24 12:05:00", "2024-05-25 12:05:00", "2024-05-26 12:05:00",
              "2024-05-27 12:05:00"], 4),
        ])
        # A meal is drawn at its bolus, the occurrence's own anchor.
        for subject, anchors, _episodes in self._causes():
            self.assertEqual(anchors, [t for t, member in self._members() if member == subject])
        self.assertEqual(self.case["summary"], {"claimed": 7, "denominator": 21, "noun": "meals"})


@unittest.skipUnless(HAS_API, "api extra is installed")
class CollapsedPatternCauseOrderTest(_CaseStore):
    """Lows after correcting highs is served as Correction on active insulin, its one
    member, while Correction stacking, first in the roster, is credited one low."""

    CASE = "pattern-correction-collapse"
    PATTERN = "pattern:lows_after_correcting_highs"

    def test_the_habit_row_serves_the_patterns_causes_by_severity(self):
        served = self._row("finding:correction_on_iob")["served_as"]
        self.assertEqual(served["subject"], "pattern:lows_after_correcting_highs")
        self.assertEqual([(s["count"], s["denominator"]) for s in served["count_sentences"]],
                         [(3, 6)])
        self.assertEqual(served["cause_counts"], [
            _cause("habit:correction_on_iob", "Correction on active insulin", 2, True),
            _cause("habit:correction_stacking", "Correction stacking", 1, False),
        ])
        self.assertEqual(self._row("finding:over_treated_low")["served_as"]["cause_counts"], [
            _cause("habit:over_treated_low", "Over-treated low", 1, True),
        ])

    def test_each_cause_is_drawn_from_the_doses_its_lows_followed(self):
        self.assertEqual(self._causes(), [
            ("habit:correction_on_iob", ["2024-05-24 20:00:00", "2024-05-25 20:00:00"], 2),
            ("habit:correction_stacking", ["2024-05-14 14:40:00"], 1),
        ])
        self.assertEqual(self._members(), [
            ("2024-05-14 16:05:00", "habit:correction_stacking"),
            ("2024-05-24 22:00:00", "habit:correction_on_iob"),
            ("2024-05-25 22:00:00", "habit:correction_on_iob"),
        ])
        self.assertEqual(self.case["summary"], {"claimed": 3, "denominator": 6, "noun": "lows"})


del _CaseStore


if __name__ == "__main__":
    unittest.main()
