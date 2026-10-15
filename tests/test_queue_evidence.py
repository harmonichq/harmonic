"""What the Queue reads for a queued carb-ratio Setting and for a Pattern served as
its one habit, through the public HTTP routes, on manufactured QA case stores.

Every expected value is a literal read once from the case's served answers.
"""
import tempfile
import unittest

try:
    from fastapi.testclient import TestClient
    from ciq_autotune.api import create_app
    from ciq_autotune.store import Store
    HAS_API = True
except ImportError:  # pragma: no cover
    HAS_API = False


def _serve(case_name):
    from scripts.qa_e2e_cases import QA_CASES, materialize_case

    database = tempfile.NamedTemporaryFile(suffix=".sqlite")
    with Store.open(database.name) as store:
        materialize_case(store, next(case for case in QA_CASES if case.name == case_name))
    client = TestClient(create_app(db_path=database.name, token=None, enable_fetch_loop=False))
    return database, client


@unittest.skipUnless(HAS_API, "api extra is installed")
class QueuedCarbRatioTest(unittest.TestCase):
    def setUp(self):
        self.database, self.client = _serve("basal-and-carb-ratio-lower")

    def tearDown(self):
        self.client.close(); self.database.close()

    def test_the_queued_carb_ratio_row_serves_its_block_as_its_member(self):
        candidate = next(c for c in self.client.get("/api/guidance").json()["candidates"]
                         if c["subject"] == "setting:carb_ratio")
        self.assertTrue(candidate["admitted"])
        rows = self.client.get("/api/diagnose/findings").json()["rows"]
        row = next(r for r in rows if r.get("parameter") == "carb_ratio")
        self.assertEqual(row["span"], {"start_min": 0, "end_min": 1440, "label": "00:00 to 24:00"})
        self.assertEqual(row["members"], [{
            "start_min": 0, "current": 10.0, "recommended": 9.0,
            "estimate": {"value": 8.0, "lo": 8.0, "hi": 8.0, "n": 8, "confidence": 0.8,
                         "method": "bootstrap-inverse-ratio-wls-clustered", "wide": False,
                         "n_clusters": 8},
        }])


@unittest.skipUnless(HAS_API, "api extra is installed")
class PatternServedAsItsHabitTest(unittest.TestCase):
    """Lows after correcting highs is served as Correction on active insulin, its one
    admitted habit, while a stacked pair of corrections that habit never claims falls
    into a low the Pattern also counts. Highs after treating lows is served as
    Over-treated low."""

    def setUp(self):
        self.database, self.client = _serve("pattern-correction-collapse")
        self.findings = self.client.get("/api/diagnose/findings").json()
        self.projection_id = self.client.get(
            "/api/diagnose/finding-case-file-preparation").json()["projection_id"]

    def tearDown(self):
        self.client.close(); self.database.close()

    def _case(self, subject):
        return self.client.get("/api/diagnose/finding-case-file", params={
            "projection_id": self.projection_id, "finding_id": subject, "alignment": "event"})

    def test_both_patterns_are_served_as_their_habit(self):
        self.assertEqual(
            {p["key"]: p["action"] for p in self.findings["outcome_patterns"]
             if p["collapse"] == "collapse_to_member"},
            {"highs_after_treating_lows": "habit:over_treated_low",
             "lows_after_correcting_highs": "habit:correction_on_iob"})

    def test_a_pattern_served_as_its_habit_has_its_own_case_file(self):
        for subject in ("pattern:highs_after_treating_lows", "pattern:lows_after_correcting_highs"):
            response = self._case(subject)
            self.assertEqual(response.status_code, 200, f"{subject}: {response.text}")
            self.assertEqual(response.json()["finding"]["subject"], subject)
            self.assertEqual(response.json()["projection"]["comparison"]["state"], "available")

    def test_the_served_count_and_the_case_file_are_one_population(self):
        row = next(r for r in self.findings["rows"] if r["id"] == "finding:correction_on_iob")
        # The habit's own driver count: the stacked pair's low is not its claim.
        self.assertEqual([(s["count"], s["denominator"]) for s in row["count_sentences"]],
                         [(2, 6)])
        served = row["served_as"]
        self.assertEqual(served["subject"], "pattern:lows_after_correcting_highs")
        self.assertEqual(
            [(s["count"], s["denominator"], s["noun"]) for s in served["count_sentences"]],
            [(3, 6, "lows")])
        self.assertEqual(served["cause_counts"], [
            {"subject": "habit:correction_stacking", "title": "Correction stacking", "count": 1},
            {"subject": "habit:correction_on_iob", "title": "Correction on active insulin",
             "count": 2},
        ])
        case = self._case("pattern:lows_after_correcting_highs").json()
        self.assertEqual(case["summary"], {"claimed": 3, "denominator": 6, "noun": "lows"})
        members = [o["member"] for o in case["occurrences"] if o["member"] != "clean"]
        self.assertEqual(sorted(members), ["habit:correction_on_iob", "habit:correction_on_iob",
                                           "habit:correction_stacking"])

    def test_each_low_carries_its_outcome_in_the_patterns_direction(self):
        nadirs = {o["anchor"]["t"]: o["outcome"] for o in
                  self._case("pattern:lows_after_correcting_highs").json()["occurrences"]}
        peaks = {o["anchor"]["t"]: o["outcome"] for o in
                 self._case("pattern:highs_after_treating_lows").json()["occurrences"]}
        self.assertEqual(nadirs, EXPECTED_NADIRS)
        self.assertEqual(peaks, EXPECTED_PEAKS)


def _outcome(kind, bg, t, minute):
    return {"kind": kind, "bg": bg, "t": t, "minute": minute}


# Each low's nadir is its own anchor reading: a low anchor is the excursion nadir.
EXPECTED_NADIRS = {
    "2024-05-14 16:05:00": _outcome("nadir", 60.0, "2024-05-14 16:05:00", 0.0),
    "2024-05-24 22:00:00": _outcome("nadir", 53.8, "2024-05-24 22:00:00", 0.0),
    "2024-05-25 22:00:00": _outcome("nadir", 53.8, "2024-05-25 22:00:00", 0.0),
    "2024-05-26 13:55:00": _outcome("nadir", 60.0, "2024-05-26 13:55:00", 0.0),
    "2024-05-27 22:00:00": _outcome("nadir", 53.8, "2024-05-27 22:00:00", 0.0),
    "2024-05-28 16:10:00": _outcome("nadir", 60.0, "2024-05-28 16:10:00", 0.0),
}
# The over-treated low (13:55) rebounds to 260 forty minutes on.
EXPECTED_PEAKS = {
    "2024-05-14 16:05:00": _outcome("peak", 120.0, "2024-05-14 16:10:00", 5.0),
    "2024-05-24 22:00:00": _outcome("peak", 121.9, "2024-05-24 23:55:00", 115.0),
    "2024-05-25 22:00:00": _outcome("peak", 122.2, "2024-05-25 23:50:00", 110.0),
    "2024-05-26 13:55:00": _outcome("peak", 260.0, "2024-05-26 14:35:00", 40.0),
    "2024-05-27 22:00:00": _outcome("peak", 122.3, "2024-05-27 23:55:00", 115.0),
    "2024-05-28 16:10:00": _outcome("peak", 120.0, "2024-05-28 17:20:00", 70.0),
}


if __name__ == "__main__":
    unittest.main()
