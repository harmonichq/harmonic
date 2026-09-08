"""Durable lifecycle public-interface integration on manufactured stores."""
import tempfile
import unittest

from fastapi.testclient import TestClient

from ciq_autotune.api import create_app
from ciq_autotune.store import Store


class DurableApiTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = self.directory.name + "/synthetic.sqlite"
        with Store.open(self.path):
            pass
        self.client = TestClient(create_app(
            db_path=self.path, token="synthetic-token", enable_fetch_loop=False))
        self.headers = {"Authorization": "Bearer synthetic-token"}

    def test_unreconciled_read_is_unavailable_and_readonly(self):
        with Store.open_readonly(self.path) as store:
            revision = store.input_data_revision()
        response = self.client.get("/api/plan", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["admission"]["state"], "unavailable")
        with Store.open_readonly(self.path) as store:
            self.assertEqual(store.input_data_revision(), revision)
            self.assertIsNone(store.follow_up_frontier())

    def test_finish_is_authenticated_before_identity_lookup(self):
        response = self.client.post("/api/verify/trials/unknown/finish", json={
            "request_id": "finish", "input_revision": 0})
        self.assertEqual(response.status_code, 401)

    def seed_trial(self):
        from datetime import datetime, timedelta
        from tests.test_trial_evidence import _seed_block_ic_switch
        from ciq_autotune.watched_change import reconcile_ingested_follow_up
        _seed_block_ic_switch(self.path)
        with Store.open(self.path) as store:
            store.upsert_bolus([{
                "seq_num": 10000 + day, "request_time": str(datetime(2026, 6, 5, 12) + timedelta(days=day)),
                "completion_time": str(datetime(2026, 6, 5, 12) + timedelta(days=day)),
                "description": "Bolus", "completion": "Completed", "insulin": 4.0,
                "carbs": 40.0, "carb_ratio": 4.4,
            } for day in range(14)])
            reconcile_ingested_follow_up(store)
        return self.client.get("/api/verify/trials", headers=self.headers).json()

    def test_finish_retry_restart_and_readonly_reassessment(self):
        read = self.seed_trial()
        identity = read["admission"]["active_id"]
        self.assertTrue(read["admission"]["can_finish_trial"])
        selected = self.client.get("/api/verify/trials", headers=self.headers,
                                   params={"selected": identity}).json()["selected"]
        self.assertFalse(selected["focus"]["available"])
        self.assertEqual(selected["focus"]["message"],
                         "Focus is unavailable while a Trial is live. It will not queue behind this change.")
        path = f"/api/verify/trials/{identity}/finish"
        body = {"request_id": "finish", "input_revision": read["input_revision"], "conclusion": "My observation"}
        response = self.client.post(path, headers=self.headers, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        original = response.json()
        self.assertEqual(original["record"]["ending"]["kind"], "user_finished")
        self.assertEqual(original["record"]["ending"]["assessment"]["state"], "available")
        self.assertNotIn("views", original["record"]["ending"]["assessment"])
        self.assertIsNone(original["admission"]["active_id"])
        self.assertEqual(self.client.post(path, headers=self.headers, json=body).json(), original)
        changed = {**body, "request_id": "again", "conclusion": "Different"}
        retry = self.client.post(path, headers=self.headers, json=changed)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json()["record"]["ending"], original["record"]["ending"])
        restarted = TestClient(create_app(db_path=self.path, token="synthetic-token", enable_fetch_loop=False))
        with Store.open_readonly(self.path) as store:
            revision, frontier = store.input_data_revision(), store.follow_up_frontier()
        for mode in ("original", "retained", "current"):
            detail = restarted.get("/api/verify/trials", headers=self.headers,
                                   params={"selected": identity, "assessment": mode}).json()["selected"]
            self.assertEqual(detail["original"]["ending"], original["record"]["ending"])
            self.assertEqual(detail["reassessment"] is None, mode == "original")
        with Store.open_readonly(self.path) as store:
            self.assertEqual(store.input_data_revision(), revision)
            self.assertEqual(store.follow_up_frontier(), frontier)

    def test_stale_finish_and_failed_ending_leave_no_partial_state(self):
        from unittest.mock import patch
        read = self.seed_trial()
        identity = read["admission"]["active_id"]
        path = f"/api/verify/trials/{identity}/finish"
        stale = self.client.post(path, headers=self.headers, json={"request_id": "stale", "input_revision": -1})
        self.assertEqual(stale.status_code, 409)
        with Store.open_readonly(self.path) as store:
            before = store.follow_up_record("trial", identity)
            frontier = store.follow_up_frontier()
        with patch("ciq_autotune.follow_up_comparison.compare_follow_up", side_effect=RuntimeError("synthetic failure")):
            with self.assertRaisesRegex(RuntimeError, "synthetic failure"):
                self.client.post(path, headers=self.headers, json={"request_id": "fail", "input_revision": read["input_revision"]})
        with Store.open_readonly(self.path) as store:
            self.assertEqual(store.follow_up_record("trial", identity), before)
            self.assertEqual(store.follow_up_frontier(), frontier)
            self.assertIsNone(store.follow_up_request("fail"))
            self.assertEqual(store.input_data_revision(), read["input_revision"])

    def test_competing_finishes_preserve_first_ending(self):
        from concurrent.futures import ThreadPoolExecutor
        read = self.seed_trial()
        path = f'/api/verify/trials/{read["admission"]["active_id"]}/finish'
        def finish(index):
            return self.client.post(path, headers=self.headers, json={
                "request_id": f"race-{index}", "input_revision": read["input_revision"], "conclusion": str(index)})
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(finish, range(2)))
        self.assertTrue(all(response.status_code in (200, 409) for response in responses))
        winners = [response.json()["record"]["ending"] for response in responses if response.status_code == 200]
        self.assertTrue(winners)
        self.assertTrue(all(ending == winners[0] for ending in winners))

    def test_first_immature_finish_rolls_back_reconciliation(self):
        from tests.test_trial_evidence import _seed_block_ic_switch
        _seed_block_ic_switch(self.path)
        read = self.client.get("/api/verify/trials", headers=self.headers).json()
        identity = read["trials"][0]["id"]
        response = self.client.post(f"/api/verify/trials/{identity}/finish", headers=self.headers,
                                   json={"request_id": "immature", "input_revision": read["input_revision"]})
        self.assertEqual(response.status_code, 409, response.text)
        with Store.open_readonly(self.path) as store:
            self.assertIsNone(store.follow_up_frontier())
            self.assertIsNone(store.follow_up_record("trial", identity))
            self.assertIsNone(store.follow_up_request("immature"))

    def test_partial_durable_requests_do_not_become_legacy_writes(self):
        for path, body in (("/api/plan/apply", {"input_revision": 1}),
                           ("/api/focus", {"lever": "late_bolus", "request_id": "incomplete"}),
                           ("/api/focus/1/resolve", {"input_revision": 0})):
            self.assertEqual(self.client.post(path, headers=self.headers, json=body).status_code, 422)

    def seed_case(self, name):
        from scripts.qa_e2e_cases import QA_CASES, materialize_case
        with Store.open(self.path) as store:
            materialize_case(store, next(case for case in QA_CASES if case.name == name))
        return self.client.get("/api/guidance", headers=self.headers).json()

    def test_apply_retry_pending_withdrawal_and_source_conflicts(self):
        source = self.seed_case("basal-raise")
        action = next(row for row in source["candidates"] if row["subject"] == "setting:basal_rate")["action"][0]
        items = [{"type": "basal", "start_min": action["start_min"], "value": action["recommended"]}]
        draft = self.client.put("/api/plan", headers=self.headers, json={"items": items}).json()
        body = {"request_id": "apply", "input_revision": source["input_revision"],
                "subject": "setting:basal_rate", "analysis_generation": source["analysis_generation"],
                "draft_updated_at": draft["updated_at"]}
        bad = self.client.post("/api/plan/apply", headers=self.headers, json={**body, "draft_updated_at": "stale"})
        self.assertEqual(bad.status_code, 409)
        response = self.client.post("/api/plan/apply", headers=self.headers, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        applied = response.json()
        self.assertEqual(applied["record"]["decision_context"]["state"], "available")
        self.assertTrue(applied["record"]["deliverable"]["rows"])
        self.assertFalse(applied["admission"]["focus_pin"]["available"])
        self.assertEqual(self.client.post("/api/plan/apply", headers=self.headers, json=body).json(), applied)
        guidance = self.client.get("/api/guidance", headers=self.headers).json()
        self.assertEqual(guidance["disposition"], "pending_plan")
        withdrawal = {"request_id": "withdraw", "input_revision": applied["input_revision"],
                      "applied_at": applied["applied_at"], "reason": "Reconsidered"}
        response = self.client.post("/api/plan/history/withdraw", headers=self.headers, json=withdrawal)
        self.assertEqual(response.status_code, 200, response.text)
        original = response.json()
        self.assertTrue(original["admission"]["focus_pin"]["available"])
        self.assertEqual(self.client.post("/api/plan/history/withdraw", headers=self.headers, json=withdrawal).json(), original)
        retry = self.client.post("/api/plan/history/withdraw", headers=self.headers,
                                 json={**withdrawal, "request_id": "withdraw-again", "reason": "Other"})
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json()["record"]["withdrawal"], original["record"]["withdrawal"])

    def test_focus_pin_retry_and_unavailable_atomic_manual_assessment(self):
        from datetime import datetime
        from unittest.mock import patch
        from tests.test_scenario_engine import cgm_ramp
        source = self.seed_case("behavioral-missed-meal")
        body = {"request_id": "pin", "input_revision": source["input_revision"], "lever": "missed_meal",
                "subject": "habit:missed_meal", "analysis_generation": source["analysis_generation"]}
        with patch("ciq_autotune.api.datetime") as clock:
            clock.now.return_value = datetime(2024, 5, 30, 23, 59)
            response = self.client.post("/api/focus", headers=self.headers, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        pinned = response.json()
        self.assertEqual(self.client.post("/api/focus", headers=self.headers, json=body).json(), pinned)
        with Store.open(self.path) as store:
            rows = cgm_ramp(10, 15, 40, 180, 1.4, 140)
            store.upsert_cgm([{"EventDateTime": str(row.t.replace(year=2024, month=6)),
                               "Readings (CGM / BGM)": row.bg, "Description": "EGV"} for row in rows])
            revision = store.input_data_revision()
        with patch("ciq_autotune.api.datetime") as clock:
            clock.now.return_value = datetime(2024, 6, 12)
            response = self.client.post(f'/api/focus/{pinned["id"]}/resolve', headers=self.headers,
                json={"request_id": "resolve", "input_revision": revision, "conclusion": "Recorded"})
        self.assertEqual(response.status_code, 200, response.text)
        ended = response.json()["record"]
        self.assertEqual(ended["ending"]["assessment"]["state"], "unavailable")
        self.assertEqual(ended["ending"]["kind"], "manual")
        self.assertEqual(self.client.post("/api/focus", headers=self.headers, json=body).json(), pinned)
        read = self.client.get("/api/verify/trials", headers=self.headers,
                               params={"kind": "focus", "selected": pinned["id"]}).json()
        self.assertEqual(read["selected"]["original"]["ending"], ended["ending"])
        self.assertEqual(self.client.post(f'/api/focus/{pinned["id"]}/resolve', headers=self.headers).status_code, 404)

    def test_public_focus_resolve_saves_available_exact_period_assessment(self):
        from datetime import datetime
        from unittest.mock import patch
        from tests.test_scenario_engine import cgm_ramp
        from tests.test_outcomes_trend import _snapshot_with_ic
        from ciq_autotune.follow_up_comparison import capture_comparison_context
        with Store.open(self.path) as store:
            store.upsert_settings_snapshot("2026-01-01 00:00:00", _snapshot_with_ic(10).settings)
            readings = cgm_ramp(10, 15, 40, 180, 1.4, 140) + cgm_ramp(11, 15, 40, 180, 1.4, 140)
            store.upsert_cgm([{"EventDateTime": str(row.t), "Readings (CGM / BGM)": row.bg,
                               "Description": "EGV"} for row in readings])
            with store.follow_up_transaction():
                focus = store.pin_focus("missed_meal", "2026-06-11 00:00:00")
                store.save_follow_up_record({"kind": "focus", "id": focus["id"], "version": "386:1", **focus,
                    "comparison_context": capture_comparison_context(store, at=datetime(2026, 6, 11),
                                                                     input_revision=store.input_data_revision())})
            revision = store.input_data_revision()
        with patch("ciq_autotune.api.datetime") as clock:
            clock.now.return_value = datetime(2026, 6, 12)
            response = self.client.post(f'/api/focus/{focus["id"]}/resolve', headers=self.headers,
                                       json={"request_id": "end", "input_revision": revision})
        self.assertEqual(response.status_code, 200, response.text)
        assessment = response.json()["record"]["ending"]["assessment"]
        self.assertEqual(assessment["state"], "available", assessment.get("reason"))
        self.assertEqual(assessment["periods"]["after"]["start"], "2026-06-11 00:00:00")
        self.assertEqual(assessment["adherence"]["before"]["rate"], 1)
        self.assertEqual(assessment["adherence"]["after"]["rate"], 1)

    def test_unique_captured_block_plan_matches_actual_schedule(self):
        from dataclasses import asdict
        from tests.test_trial_evidence import _seed_block_ic_switch
        from ciq_autotune.guidance import plan_deliverable
        from ciq_autotune.watched_change import reconcile_ingested_follow_up
        _seed_block_ic_switch(self.path)
        with Store.open(self.path) as store:
            plan = store.plan_history()[0]
            profile = store.settings_snapshots()[0].settings.active()
            with store.follow_up_transaction():
                store.save_follow_up_record({"kind": "plan", "id": plan["applied_at"], "version": "386:1", **plan,
                    "deliverable": {"version": "386:1", "state": "available", "source_profile": asdict(profile),
                                    "rows": plan_deliverable([asdict(s) for s in profile.segments], plan["items"])}})
            reconcile_ingested_follow_up(store)
            record = store.follow_up_records("trial")[0]
            self.assertEqual(record["reconciliation"]["state"], "available")
            self.assertEqual(record["reconciliation"]["applied_at"], plan["applied_at"])
            self.assertEqual(record["reconciliation"]["block"], [720, 900])
            self.assertEqual(store.follow_up_record("plan", plan["applied_at"])["reconciliation"], record["reconciliation"])
        read = self.client.get("/api/plan/history", headers=self.headers).json()
        self.assertEqual(read["history"][0]["reconciliation"], record["reconciliation"])
