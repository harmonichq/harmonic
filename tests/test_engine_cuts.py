"""The engine's cut roster, read through the findings and guidance endpoints (#499).

Each store is materialized from a manufactured QA case, so every assertion reads
analyzer output built from data, never a hand-set flag.
"""
import tempfile
import unittest

try:
    from fastapi.testclient import TestClient
except ImportError:  # pragma: no cover
    TestClient = None

from ciq_autotune.store import Store
from scripts.qa_e2e_cases import QA_CASES, materialize_case

_CUT_PATTERN = "overnight_lows_no_iob"
_CUT_LEVERS = ("meal_bolus_short", "high_carb_sequence", "repeat_eating")
_KEPT_PATTERNS = {
    "highs_after_meals", "lows_after_meals", "highs_after_treating_lows",
    "lows_after_correcting_highs",
}


@unittest.skipIf(TestClient is None, "api extra not installed")
class EngineCutsTest(unittest.TestCase):
    def _client(self, name):
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        with Store.open(tmp.name) as store:
            materialize_case(store, next(case for case in QA_CASES if case.name == name))
        return TestClient(create_app(db_path=tmp.name, token="", enable_fetch_loop=False))

    def _reads(self, name):
        client = self._client(name)
        findings = client.get("/api/diagnose/findings")
        guidance = client.get("/api/guidance")
        self.assertEqual(findings.status_code, 200, findings.text)
        self.assertEqual(guidance.status_code, 200, guidance.text)
        return client, findings.json(), guidance.json()

    def test_overnight_lows_reach_the_person_through_the_basal_setting_alone(self):
        _client, findings, guidance = self._reads("basal-recurring-low-lower")
        keys = {pattern["key"] for pattern in findings["outcome_patterns"]}
        self.assertNotIn(_CUT_PATTERN, keys)
        self.assertNotIn(f"pattern:{_CUT_PATTERN}", {row["id"] for row in findings["rows"]})
        self.assertNotIn(f"pattern:{_CUT_PATTERN}",
                         {row["subject"] for row in guidance["candidates"]})
        basal = [row for row in findings["rows"]
                 if row["kind"] == "setting" and row.get("parameter") == "basal_rate"]
        self.assertTrue(basal, "the overnight basal Setting is no longer served")
        self.assertTrue(any(member["recommended"] is not None
                            for row in basal for member in row["members"] or ()))
        setting = next(row for row in guidance["candidates"]
                       if row["subject"] == "setting:basal_rate")
        self.assertTrue(setting["admitted"])

    def test_every_served_pattern_has_a_pinnable_habit(self):
        from ciq_autotune.analyzers.scenario.outcome_patterns import _ROSTER
        from ciq_autotune.watched_change import is_pinnable
        roster = {key: habits for key, _title, habits, *_rest in _ROSTER}
        self.assertEqual(set(roster), _KEPT_PATTERNS)
        for key, habits in roster.items():
            self.assertTrue(any(is_pinnable(lever) for lever in habits), key)
        _client, findings, _guidance = self._reads("showcase")
        self.assertEqual({p["key"] for p in findings["outcome_patterns"]}, _KEPT_PATTERNS)

    def test_correction_factor_is_never_a_candidate(self):
        # ADR 564 rule 1: no correction-factor concern is served, whatever the
        # overnight correction nights read, so none queues, leads, or rides on a Pattern.
        for name in ("pattern-near-tie",):
            with self.subTest(case=name):
                _client, findings, guidance = self._reads(name)
                self.assertNotIn("setting:isf",
                                 {row["subject"] for row in guidance["candidates"]})
                self.assertNotEqual((guidance["selected"] or {}).get("subject"),
                                    "setting:isf")
                self.assertNotIn("isf", {row.get("parameter") for row in findings["rows"]})
                for pattern in findings["outcome_patterns"]:
                    self.assertNotIn("setting:isf",
                                     {m["subject"] for m in pattern["members"]}, pattern["key"])

    def test_the_day_model_view_still_serves_after_the_sequence_detector_left(self):
        client, _findings, _guidance = self._reads("showcase")
        last_day = client.get("/api/day-navigator").json()
        dates = sorted(day["date"] for day in last_day.get("days") or [] if day.get("date"))
        target = dates[-1] if dates else "2024-06-30"
        response = client.get("/api/model-view", params={"date": target})
        self.assertEqual(response.status_code, 200, response.text)
        for episode in response.json()["episodes"]:
            self.assertNotIn(episode["lever"], _CUT_LEVERS)

    def test_cut_levers_and_blocks_are_absent(self):
        client, findings, guidance = self._reads("showcase")
        _c, uncaused_findings, uncaused_guidance = self._reads("behavioral-uncaused-highs")
        for payload in (findings, uncaused_findings):
            self.assertNotIn("uncaused_highs", payload)
            for pattern in payload["outcome_patterns"]:
                self.assertNotIn("overlap_counts", pattern)
                self.assertNotIn("harm_low_overlap", pattern)
            ids = {row["id"] for row in payload["rows"]}
            for lever in _CUT_LEVERS:
                self.assertNotIn(f"finding:{lever}", ids)
        for payload in (guidance, uncaused_guidance):
            subjects = {row["subject"] for row in payload["candidates"]}
            self.assertNotIn("investigation:uncaused_highs", subjects)
            for lever in _CUT_LEVERS:
                self.assertNotIn(f"habit:{lever}", subjects)
        meals = next(p for p in findings["outcome_patterns"] if p["key"] == "highs_after_meals")
        self.assertEqual(meals["rate_levers"], ["habit:carb_undercount", "habit:late_bolus"])
        catalog = client.get("/api/catalog").json()
        served = {row.get("lever") or row.get("value") for row in catalog.get("levers", [])}
        for lever in _CUT_LEVERS:
            self.assertNotIn(lever, served)


if __name__ == "__main__":
    unittest.main()
