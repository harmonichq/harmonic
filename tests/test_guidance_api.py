import threading
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

try:
    from fastapi.testclient import TestClient
except ImportError:  # pragma: no cover
    TestClient = None

from tests.test_api import _seed
from ciq_autotune.store import Store
from scripts.qa_e2e_cases import QA_CASES, materialize_case


@unittest.skipIf(TestClient is None, "api extra not installed")
class GuidanceApiTest(unittest.TestCase):
    def _case_client(self, name):
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        with Store.open(tmp.name) as store:
            materialize_case(store, next(case for case in QA_CASES if case.name == name))
        app = create_app(db_path=tmp.name, token="", enable_fetch_loop=False)
        return tmp, app, TestClient(app)

    def test_focus_read_preserves_levers_and_adds_ready_patterns(self):
        from ciq_autotune.watched_change import pinnable_levers
        _tmp, _app, client = self._case_client("showcase")
        payload = client.get("/api/focus").json()
        self.assertEqual(payload["pinnable"], sorted(pinnable_levers()))
        self.assertEqual(set(payload), {
            "focuses", "pinnable", "pinnable_patterns", "input_revision", "admission",
        })
        self.assertTrue(all(row["readiness"]["verdict"] == "ready"
                            for row in payload["pinnable_patterns"]))

    def test_pattern_focus_pin_publishes_pattern_identity(self):
        from ciq_autotune.analyzers.scenario import outcome_patterns
        with patch.dict(outcome_patterns._GATES, {"highs_after_meals": 6}):
            _tmp, app, client = self._case_client("behavioral-carb-undercount")
            before = app.state.result_cache.version
            response = client.post(
                "/api/focus", json={"pattern_key": "highs_after_meals"},
            )
            active = client.get("/api/guidance").json()["active_watch"]
            listed = client.get("/api/focus").json()["focuses"][0]
            resolved = client.post(f"/api/focus/{response.json()['id']}/resolve")
        self.assertEqual(response.status_code, 200, response.text)
        record = response.json()["record"]
        self.assertEqual(record["subject"], "pattern:highs_after_meals")
        self.assertEqual(record["pattern_key"], "highs_after_meals")
        self.assertEqual(active["subject"], "pattern:highs_after_meals")
        self.assertEqual(active["pattern_key"], "highs_after_meals")
        self.assertEqual(active["title"], "Carb undercount")
        self.assertEqual(active["target_metric"], "arc")
        self.assertEqual(listed["subject"], "pattern:highs_after_meals")
        self.assertEqual(resolved.status_code, 200, resolved.text)
        self.assertEqual(app.state.result_cache.version - before, 2)

    def test_all_setting_pattern_pin_is_rejected_separately(self):
        _tmp, _app, client = self._case_client("showcase")
        response = client.post(
            "/api/focus", json={"pattern_key": "overnight_lows_without_iob"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("all-setting", response.json()["detail"])

    def test_pattern_pin_rechecks_readiness_on_the_write_source(self):
        import ciq_autotune.guidance as guidance_module
        from ciq_autotune.analyzers.scenario import outcome_patterns
        real_build = guidance_module.build_outcome_patterns
        calls = 0

        def crossing_build(*args, **kwargs):
            nonlocal calls
            calls += 1
            roster = real_build(*args, **kwargs)
            if calls > 1:
                row = next(item for item in roster
                           if item["key"] == "highs_after_meals")
                row["readiness"] = {**row["readiness"], "verdict": "withheld"}
            return roster

        with patch.dict(outcome_patterns._GATES, {"highs_after_meals": 6}), \
             patch.object(guidance_module, "build_outcome_patterns", crossing_build):
            tmp, _app, client = self._case_client("behavioral-carb-undercount")
            response = client.post(
                "/api/focus", json={"pattern_key": "highs_after_meals"},
            )
        self.assertEqual(response.status_code, 409)
        with Store.open(tmp.name) as store:
            self.assertIsNone(store.active_focus())

    def test_preference_and_restore_writes_each_invalidate_cache(self):
        _tmp, app, client = self._case_client("behavioral-carb-undercount")
        current = client.get("/api/guidance").json()
        subject = "pattern:highs_after_meals"
        before = app.state.result_cache.version
        saved = client.put(
            f"/api/guidance/preferences/{subject}",
            json={"generation": current["analysis_generation"]},
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(app.state.result_cache.version - before, 1)
        before = app.state.result_cache.version
        restored = client.delete(f"/api/guidance/preferences/{subject}")
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertEqual(app.state.result_cache.version - before, 1)

    def test_failed_pattern_migration_leaves_readable_rows_and_serves(self):
        import ciq_autotune.api as api_module
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        with Store.open(tmp.name) as store:
            materialize_case(store, next(
                case for case in QA_CASES if case.name == "behavioral-carb-undercount"
            ))
            store.save_guidance_preference(
                "habit:carb_undercount", decided_at="2026-01-02 00:00:00",
                reason="later", comparison_version="383:1",
                state={"kind": "habit", "action": {
                    "action_id": "habit:carb_undercount"}, "seriousness": "low"},
            )
            store.conn.execute("PRAGMA user_version = 0")
        with self.assertLogs("ciq_autotune.api", level="ERROR") as logs, \
             patch.object(api_module, "analyze", side_effect=RuntimeError("boom")):
            app = create_app(db_path=tmp.name, token="", enable_fetch_loop=False)
        self.assertEqual(sum("migration remains pending" in row for row in logs.output), 1)
        with Store.open(tmp.name) as store:
            self.assertTrue(store.pattern_migration_pending())
            self.assertEqual(store.conn.execute(
                "PRAGMA user_version"
            ).fetchone()[0], 393)
            self.assertEqual(
                [row["subject"] for row in store.guidance_preferences()],
                ["habit:carb_undercount"],
            )
        response = TestClient(app).get("/api/guidance")
        self.assertEqual(response.status_code, 200, response.text)
        retry = create_app(db_path=tmp.name, token="", enable_fetch_loop=False)
        with Store.open(tmp.name) as store:
            self.assertFalse(store.pattern_migration_pending())
            self.assertEqual(
                [row["subject"] for row in store.guidance_preferences()],
                ["pattern:highs_after_meals"],
            )
        self.assertEqual(retry.state.result_cache.version, 1)

    def test_healthy_pattern_migration_is_noop_on_second_startup(self):
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        with Store.open(tmp.name) as store:
            materialize_case(store, next(
                case for case in QA_CASES if case.name == "behavioral-carb-undercount"
            ))
            store.save_guidance_preference(
                "habit:carb_undercount", decided_at="2026-01-02 00:00:00",
                reason="later", comparison_version="383:1",
                state={"kind": "habit"},
            )
            store.conn.execute("PRAGMA user_version = 0")
        first = create_app(db_path=tmp.name, token="", enable_fetch_loop=False)
        with Store.open(tmp.name) as store:
            revision = store.input_data_revision()
            rows = store.guidance_preferences()
        second = create_app(db_path=tmp.name, token="", enable_fetch_loop=False)
        with Store.open(tmp.name) as store:
            self.assertEqual(store.input_data_revision(), revision)
            self.assertEqual(store.guidance_preferences(), rows)
            self.assertFalse(store.pattern_migration_pending())
        self.assertEqual(first.state.result_cache.version, 1)
        self.assertEqual(second.state.result_cache.version, 0)

    def test_empty_store_is_explicitly_unavailable_not_an_investigation(self):
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        with Store.open(tmp.name):
            pass
        response = TestClient(create_app(
            db_path=tmp.name, token="", enable_fetch_loop=False,
        )).get("/api/guidance")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["disposition"], "unavailable")
        self.assertIsNone(response.json()["selected"])
        self.assertIsNotNone(response.json()["unavailable"])

    def test_read_is_authenticated_and_returns_a_versioned_public_shape(self):
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        _seed(tmp.name)
        client = TestClient(create_app(db_path=tmp.name, token="secret", enable_fetch_loop=False))
        self.assertEqual(client.get("/api/guidance").status_code, 401)
        response = client.get("/api/guidance", headers={"Authorization": "Bearer secret"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["schema"], "guidance-v2")

    def test_preference_put_delete_are_authenticated_and_generation_bound(self):
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        _seed(tmp.name)
        client = TestClient(create_app(db_path=tmp.name, token="secret", enable_fetch_loop=False))
        headers = {"Authorization": "Bearer secret"}
        read = client.get("/api/guidance", headers=headers).json()
        subject = read["candidates"][0]["subject"]
        path = f"/api/guidance/preferences/{subject}"
        self.assertEqual(client.put(path, json={"generation": read["analysis_generation"]}).status_code, 401)
        self.assertEqual(client.put(path, headers=headers, json={"generation": "stale"}).status_code, 409)
        self.assertEqual(client.put("/api/guidance/preferences/unknown", headers=headers,
                                    json={"generation": read["analysis_generation"]}).status_code, 404)
        self.assertEqual(client.put(path, headers=headers,
                                    json={"generation": read["analysis_generation"], "reason": "later"}).status_code, 200)
        after = client.get("/api/guidance", headers=headers).json()
        row = next(row for row in after["candidates"] if row["subject"] == subject)
        self.assertTrue(row["preference"]["set_aside"])
        self.assertEqual(row["decision"]["reason"], "later")
        self.assertNotEqual(after["analysis_generation"], read["analysis_generation"])

        reopened = TestClient(create_app(
            db_path=tmp.name, token="secret", enable_fetch_loop=False,
        )).get("/api/guidance", headers=headers).json()
        reopened_row = next(row for row in reopened["candidates"]
                            if row["subject"] == subject)
        self.assertTrue(reopened_row["preference"]["set_aside"])
        self.assertEqual(client.delete(path, headers=headers).status_code, 200)

    def test_store_revision_makes_a_prior_guidance_generation_stale(self):
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        _seed(tmp.name)
        client = TestClient(create_app(db_path=tmp.name, token="secret", enable_fetch_loop=False))
        headers = {"Authorization": "Bearer secret"}
        read = client.get("/api/guidance", headers=headers).json()
        with Store.open(tmp.name) as store:
            store.save_guidance_preference(
                "investigation:uncaused_highs", decided_at="2026-01-01 00:00:00",
                reason=None, comparison_version="383:1", state={"kind": "investigation"},
            )
        subject = read["candidates"][0]["subject"]
        response = client.put(
            f"/api/guidance/preferences/{subject}", headers=headers,
            json={"generation": read["analysis_generation"]},
        )
        self.assertEqual(response.status_code, 409)

    def test_preference_put_rejects_a_write_crossing_revision_check_and_insert(self):
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        _seed(tmp.name)
        client = TestClient(create_app(
            db_path=tmp.name, token="secret", enable_fetch_loop=False,
        ))
        headers = {"Authorization": "Bearer secret"}
        current = client.get("/api/guidance", headers=headers).json()
        subject = current["candidates"][0]["subject"]
        real_save = Store.save_guidance_preference
        real_revision = Store.input_data_revision
        writer_locked = threading.Event()
        release_writer = threading.Event()
        checking = False
        writer_errors = []

        def competing_write():
            try:
                with Store.open(tmp.name) as store:
                    store.conn.execute("BEGIN IMMEDIATE")
                    writer_locked.set()
                    release_writer.wait(0.5)
                    real_save(
                        store, "setting:isf", decided_at="2026-01-01 00:00:00",
                        reason=None, comparison_version="383:1",
                        state={"kind": "setting"},
                    )
            except Exception as error:  # pragma: no cover - asserted below
                writer_errors.append(error)

        writer = threading.Thread(target=competing_write, daemon=True)

        def instrumented_save(store, *args, **kwargs):
            nonlocal checking
            writer.start()
            self.assertTrue(
                writer_locked.wait(1.0), "competing writer never acquired its lock",
            )
            checking = True
            try:
                return real_save(store, *args, **kwargs)
            finally:
                checking = False

        def crossing_revision(store):
            revision = real_revision(store)
            if checking:
                release_writer.set()
                writer.join(1.0)
                self.assertFalse(writer.is_alive(), "competing writer silently hung")
            return revision

        with patch.object(Store, "save_guidance_preference", instrumented_save), \
             patch.object(Store, "input_data_revision", crossing_revision):
            response = client.put(
                f"/api/guidance/preferences/{subject}", headers=headers,
                json={"generation": current["analysis_generation"]},
            )
        release_writer.set()
        writer.join(1.0)
        self.assertFalse(writer.is_alive(), "competing writer silently hung")
        self.assertEqual(writer_errors, [])
        self.assertEqual(response.status_code, 409)
        with Store.open(tmp.name) as store:
            self.assertEqual(
                [row["subject"] for row in store.guidance_preferences()],
                ["setting:isf"],
            )

    def test_required_source_failure_is_explicit_for_read_and_set_aside(self):
        import ciq_autotune.api as api_mod
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        _seed(tmp.name)
        client = TestClient(create_app(db_path=tmp.name, token="secret",
                                       enable_fetch_loop=False),
                            raise_server_exceptions=False)
        headers = {"Authorization": "Bearer secret"}
        with patch.object(api_mod, "load_or_compute", side_effect=OSError("unavailable")):
            self.assertEqual(client.get("/api/guidance", headers=headers).status_code, 503)
            response = client.put(
                "/api/guidance/preferences/setting:basal_rate", headers=headers,
                json={"generation": "prior"},
            )
        self.assertEqual(response.status_code, 503)

    def test_crossing_watch_write_retries_to_one_coherent_guidance_read(self):
        import ciq_autotune.watched_change as watched_change
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        _seed(tmp.name)
        client = TestClient(create_app(db_path=tmp.name, token="secret", enable_fetch_loop=False))
        headers = {"Authorization": "Bearer secret"}
        real_resolve = watched_change.active_watched_change
        crossed = False

        def crossing_resolve(*args, **kwargs):
            nonlocal crossed
            resolved = real_resolve(*args, **kwargs)
            if not crossed:
                crossed = True
                with Store.open(tmp.name) as store:
                    store.pin_focus("late_bolus", "2026-01-01 00:00:00")
                    watched_change.reconcile_ingested_follow_up(store)
            return resolved

        with patch.object(watched_change, "active_watched_change",
                          side_effect=crossing_resolve):
            response = client.get("/api/guidance", headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["disposition"], "active_change")
        self.assertEqual(response.json()["active_watch"]["lever"], "late_bolus")

    def test_focus_preemption_is_resolved_again_at_its_new_revision(self):
        import ciq_autotune.watched_change as watched_change
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        _seed(tmp.name)
        with Store.open(tmp.name) as store:
            store.pin_focus("late_bolus", "2026-06-05 05:00:00")
            basal, cgm = [], []
            for day in range(6, 9):
                start = datetime(2026, 6, day)
                for index in range(72):
                    at = start + timedelta(minutes=5 * index)
                    basal.append({
                        "seq_num": int(at.strftime("%Y%m%d%H%M%S")),
                        "time": at.strftime("%Y-%m-%d %H:%M:%S"),
                        "delivery_type": "algorithmDelivery", "duration_mins": 5,
                        "basal_rate": 0.8, "profile_basal_rate": 0.8,
                    })
                    cgm.append({
                        "EventDateTime": at.strftime("%Y-%m-%dT%H:%M:%S"),
                        "Readings (CGM / BGM)": 120, "Description": "EGV",
                    })
            store.upsert_basal(basal)
            store.upsert_cgm(cgm)
            watched_change.reconcile_ingested_follow_up(store)
        real_resolve = watched_change.active_watched_change
        calls = 0

        def counted_resolve(*args, **kwargs):
            nonlocal calls
            calls += 1
            return real_resolve(*args, **kwargs)

        client = TestClient(create_app(
            db_path=tmp.name, token="secret", enable_fetch_loop=False,
        ))
        with patch.object(watched_change, "active_watched_change",
                          side_effect=counted_resolve):
            response = client.get(
                "/api/guidance", headers={"Authorization": "Bearer secret"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["active_watch"]["kind"], "trial")
        self.assertEqual(calls, 1)
        with Store.open(tmp.name) as store:
            self.assertIsNone(store.active_focus())

    def test_focus_lever_and_durable_habit_subject_are_distinct_identities(self):
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        case = next(case for case in QA_CASES
                    if case.name == "behavioral-missed-meal")
        with Store.open(tmp.name) as store:
            materialize_case(store, case)
        client = TestClient(create_app(
            db_path=tmp.name, token="secret", enable_fetch_loop=False,
        ))
        headers = {"Authorization": "Bearer secret"}
        self.assertEqual(client.post(
            "/api/focus", headers=headers, json={"lever": "missed_meal"},
        ).status_code, 200)
        current = client.get("/api/guidance", headers=headers).json()
        self.assertEqual(current["active_watch"]["kind"], "focus")
        self.assertNotIn("subject", current["active_watch"])
        response = client.put(
            "/api/guidance/preferences/habit:missed_meal", headers=headers,
            json={"generation": current["analysis_generation"]},
        )
        self.assertEqual(response.status_code, 200)
        after = client.get("/api/guidance", headers=headers).json()
        self.assertEqual(after["disposition"], "unavailable")
        self.assertEqual(after["admission"]["reason"], "reconciliation_required")

    def test_restore_rejects_invalid_subject_but_keeps_canonical_idempotence(self):
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        _seed(tmp.name)
        client = TestClient(create_app(
            db_path=tmp.name, token="secret", enable_fetch_loop=False,
        ))
        headers = {"Authorization": "Bearer secret"}
        self.assertEqual(client.delete(
            "/api/guidance/preferences/not-a-canonical-subject", headers=headers,
        ).status_code, 404)
        valid = "/api/guidance/preferences/setting:basal_rate"
        self.assertEqual(client.delete(valid, headers=headers).status_code, 200)
        self.assertEqual(client.delete(valid, headers=headers).status_code, 200)

        with Store.open(tmp.name) as store:
            store.save_guidance_preference(
                "habit:retired-owner-value", decided_at="2026-01-01 00:00:00",
                reason=None, comparison_version="future:1", state={},
            )
        self.assertEqual(client.delete(
            "/api/guidance/preferences/habit:retired-owner-value", headers=headers,
        ).status_code, 200)

    def test_guidance_read_does_not_bypass_plan_or_focus_write_checks(self):
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        with Store.open(tmp.name) as store:
            materialize_case(store, next(case for case in QA_CASES if case.name == "behavioral-missed-meal"))
        client = TestClient(create_app(db_path=tmp.name, token="secret", enable_fetch_loop=False))
        headers = {"Authorization": "Bearer secret"}
        self.assertEqual(client.get("/api/guidance", headers=headers).status_code, 200)
        self.assertEqual(client.post("/api/plan/apply", headers=headers).status_code, 400)
        first = client.post("/api/focus", headers=headers, json={"lever": "missed_meal"})
        self.assertEqual(first.status_code, 200)
        second = client.post("/api/focus", headers=headers, json={"lever": "missed_meal"})
        self.assertEqual(second.status_code, 409)
