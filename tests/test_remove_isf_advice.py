"""#600 (ADR 564 rules 1 and 6): the engine serves no correction-factor advice,
and the durable state that names the correction factor still reads.

The store is the manufactured QA case `pattern-near-tie`, whose overnight
correction nights are the evidence a correction-factor estimate once read, so
every absence here is the advice's, not the evidence's.
"""
import tempfile
import unittest

from fastapi.testclient import TestClient

from ciq_autotune.api import create_app
from ciq_autotune.guidance import COMPARISON_VERSION
from ciq_autotune.store import Store
from ciq_autotune.watched_change import reconcile_ingested_follow_up
from scripts.qa_e2e_cases import QA_CASES, execute_case, materialize_case

CASE = next(case for case in QA_CASES if case.name == "pattern-near-tie")
DECIDED_AT = "2024-06-08 12:00:00"


def _set_aside_isf(store):
    """A correction factor set aside before #564, as that record was saved."""
    store.save_guidance_preference(
        "setting:isf", decided_at=DECIDED_AT, reason=None,
        comparison_version=COMPARISON_VERSION,
        state={"kind": "setting", "action": [], "seriousness": []})


def _record_isf_plan(store):
    """A Done on a correction factor before #564, as its Plan record was saved."""
    with store.follow_up_transaction():
        store.save_plan_draft([{"type": "isf", "start_min": 0, "value": 32.0}], DECIDED_AT)
        applied = store.apply_plan(DECIDED_AT)
        store.save_follow_up_record({
            "kind": "plan", "id": applied["applied_at"], "version": "386:1", **applied,
            "decision_context": {
                "version": "386:1", "state": "available", "captured_at": DECIDED_AT,
                "input_revision": store.input_data_revision(), "analysis_generation": "recorded",
                "action": [], "explanation": "Correction factor",
                "source_window": {"start": "2024-05-10 00:00:00", "end": DECIDED_AT},
                "policy": COMPARISON_VERSION, "subjects": ["setting:isf"], "occurrences": [],
                "settings": [{"value": 32.0, "unit": "mg/dL/U"}], "support": {}, "unknowns": []}})


class RemoveIsfAdviceTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = directory.name + "/synthetic.sqlite"
        with Store.open(self.path) as store:
            materialize_case(store, CASE)
            reconcile_ingested_follow_up(store)
            _set_aside_isf(store)
            _record_isf_plan(store)
            self.preferences = store.guidance_preferences()
            self.execution = execute_case(store, CASE)

    def test_guidance_serves_no_correction_factor_candidate(self):
        from ciq_autotune.guidance import build_guidance
        e = self.execution
        guidance = build_guidance(analysis=e.analysis, exposures=e.exposures,
                                  scenarios=e.scenarios)
        self.assertNotIn("setting:isf", {row["subject"] for row in guidance["candidates"]})
        self.assertNotEqual((guidance["selected"] or {}).get("subject"), "setting:isf")

    def test_the_findings_serve_no_correction_factor_row(self):
        for window, projection in self.execution.findings.items():
            with self.subTest(window=window):
                self.assertNotIn("isf", {row.get("parameter") for row in projection["rows"]})
        self.assertNotIn("isf", {lever["parameter"]
                                 for lever in self.execution.analysis["tuning_levers"]})

    def test_a_set_aside_correction_factor_is_an_absent_row_named_correction_factor(self):
        from ciq_autotune.guidance import build_guidance
        e = self.execution
        guidance = build_guidance(analysis=e.analysis, exposures=e.exposures,
                                  scenarios=e.scenarios, preferences=self.preferences)
        (row,) = [row for row in guidance["candidates"] if row["subject"] == "setting:isf"]
        self.assertTrue(row["absent"])
        self.assertEqual(row["title"], "Correction factor")
        self.assertIsNone(row["action"])
        self.assertIs(row["admitted"], False)
        self.assertTrue(row["preference"]["set_aside"])

    def test_a_recorded_correction_factor_plan_is_still_named_in_history(self):
        client = TestClient(create_app(db_path=self.path, token="", enable_fetch_loop=False))
        response = client.get("/api/plan/history")
        self.assertEqual(response.status_code, 200, response.text)
        (record,) = response.json()["history"]
        self.assertEqual(record["decision_context"]["subjects"], ["setting:isf"])
        self.assertEqual(record["decision_context"]["subject_titles"], ["Correction factor"])


if __name__ == "__main__":
    unittest.main()
