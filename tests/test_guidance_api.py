import contextlib
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


WHOLE_DAY_OUTCOME_WINDOW = {"start_min": 0, "end_min": 1440}


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
                "/api/focus", json={"pattern_key": "highs_after_meals",
                                     "outcome_window": WHOLE_DAY_OUTCOME_WINDOW},
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

    def test_pattern_focus_accepts_a_ready_scoped_pattern_that_collapses_to_its_member(self):
        _tmp, _app, client = self._case_client("c3-pin")
        roster = client.get("/api/focus").json()
        offered = roster["pinnable_patterns"][0]
        guidance = client.get("/api/guidance").json()
        # In this window the Pattern collapses to its served child; that is not
        # permission to lose the Pattern's producer-owned admission on the write path.
        scope = {"start_min": 720, "end_min": 1080}
        response = client.post("/api/focus", json={
            "pattern_key": offered["key"], "subject": offered["subject"], "outcome_window": scope,
            "request_id": "00000000-0000-4000-8000-000000000404",
            "input_revision": roster["input_revision"], "analysis_generation": guidance["analysis_generation"],
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["record"]["decision_context"]["outcome_window"], scope)

    def test_post_refuses_every_pattern_absent_from_get_pinnable_patterns(self):
        _tmp, _app, client = self._case_client("showcase")
        listed = {row["key"] for row in client.get(
            "/api/focus",
        ).json()["pinnable_patterns"]}
        guidance = client.get("/api/guidance").json()
        patterns = [row for row in guidance["candidates"] if row["kind"] == "pattern"]
        for pattern in patterns:
            response = client.post("/api/focus", json={
                "pattern_key": pattern["pattern_key"],
                "outcome_window": WHOLE_DAY_OUTCOME_WINDOW,
            })
            self.assertEqual(response.status_code == 200,
                             pattern["pattern_key"] in listed,
                             (pattern["pattern_key"], response.text))
            if response.status_code == 200:
                client.post(f"/api/focus/{response.json()['id']}/resolve")

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
                "/api/focus", json={"pattern_key": "highs_after_meals",
                                     "outcome_window": WHOLE_DAY_OUTCOME_WINDOW},
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

    def test_preference_write_keeps_every_recorded_data_result(self):
        """#522, #538: a snooze writes follow-up state only, so the Overview's and
        the Day screen's results survive it, and so does the default analysis."""
        import ciq_autotune.api as api_mod
        import ciq_autotune.analyzers.scenario as scenario_mod
        import ciq_autotune.outcomes as outcomes_mod
        _tmp, app, client = self._case_client("behavioral-carb-undercount")
        day = client.get("/api/status").json()["latest_data_day"]
        counts = {"outcomes": 0, "model-view": 0, "analyze": 0}

        def counting(label, real):
            def run(*args, **kwargs):
                counts[label] += 1
                return real(*args, **kwargs)
            return run

        with patch.object(outcomes_mod, "summarize_outcomes",
                          counting("outcomes", outcomes_mod.summarize_outcomes)), \
             patch.object(scenario_mod, "build_model_view",
                          counting("model-view", scenario_mod.build_model_view)), \
             patch.object(api_mod, "analyze", counting("analyze", api_mod.analyze)):
            def read_all():
                for path, params in (("/api/outcomes", {"window": 14}),
                                     ("/api/model-view", {"date": day}),
                                     ("/api/analyze", {"window": 14}),
                                     ("/api/analyze", {})):
                    self.assertEqual(client.get(path, params=params).status_code, 200, path)
            read_all()
            self.assertEqual(counts, {"outcomes": 1, "model-view": 1, "analyze": 2})
            current = client.get("/api/guidance").json()  # its own pooled analysis
            self.assertEqual(counts["analyze"], 3)
            saved = client.put("/api/guidance/preferences/pattern:highs_after_meals",
                               json={"generation": current["analysis_generation"]})
            self.assertEqual(saved.status_code, 200, saved.text)
            read_all()
            # Nothing is computed again: the default analysis is keyed by the
            # recorded-data revision, which the snooze did not advance.
            self.assertEqual(counts, {"outcomes": 1, "model-view": 1, "analyze": 3})
            # A carb write changes recorded data, so everything is read again.
            logged = client.post("/api/carbs", json={
                "t": f"{day} 12:00:00", "grams": 10, "certainty": "exact"})
            self.assertEqual(logged.status_code, 200, logged.text)
            read_all()
            self.assertEqual(counts, {"outcomes": 2, "model-view": 2, "analyze": 5})

    def test_a_snooze_reranks_the_queue_from_the_derived_results_without_recomputing(self):
        """#538: after a snooze the guidance ranks from the findings snapshot and the
        default analysis already derived — in this process and after a restart —
        and still sets the snoozed subject aside."""
        import ciq_autotune.api as api_mod
        import ciq_autotune.analyzers.scenario as scenario_mod
        from ciq_autotune.api import create_app
        from ciq_autotune.watched_change import reconcile_ingested_follow_up
        tmp, _app, client = self._case_client("basal-lower")
        with Store.open(tmp.name) as store:
            reconcile_ingested_follow_up(store)
        current = client.get("/api/guidance").json()
        self.assertEqual(current["disposition"], "eligible_action")
        subject = current["selected"]["subject"]
        self.assertEqual(client.get("/api/analyze").status_code, 200)
        builds = []

        def counting(label, real):
            def run(*args, **kwargs):
                builds.append(label)
                return real(*args, **kwargs)
            return run

        with patch.object(api_mod, "analyze", counting("analyze", api_mod.analyze)), \
             patch.object(scenario_mod, "build_scenarios",
                          counting("scenarios", scenario_mod.build_scenarios)), \
             patch.object(api_mod, "build_exposures",
                          counting("exposures", api_mod.build_exposures)), \
             patch.object(api_mod, "prepare_findings_projection",
                          counting("findings", api_mod.prepare_findings_projection)):
            saved = client.put(f"/api/guidance/preferences/{subject}",
                               json={"generation": current["analysis_generation"]})
            self.assertEqual(saved.status_code, 200, saved.text)
            aside = client.get("/api/guidance").json()
            self.assertEqual(client.get("/api/diagnose/findings").status_code, 200)
            self.assertEqual(client.get("/api/analyze").status_code, 200)
            self.assertEqual(builds, [])
            restarted = TestClient(create_app(db_path=tmp.name, token="",
                                              enable_fetch_loop=False))
            after_restart = restarted.get("/api/guidance").json()
            self.assertEqual(builds, [])
        row = next(row for row in aside["candidates"] if row["subject"] == subject)
        self.assertTrue(row["preference"]["set_aside"])
        self.assertNotEqual((aside["selected"] or {}).get("subject"), subject)
        self.assertGreater(aside["input_revision"], current["input_revision"])
        self.assertNotEqual(aside["analysis_generation"], current["analysis_generation"])
        for key in ("disposition", "selected", "candidates", "input_revision"):
            self.assertEqual(after_restart[key], aside[key], key)

    #: Every Store read of follow-up state: the preferences, Focus and follow-up
    #: records, the frontier, the request receipts, the Plan draft and history,
    #: the pattern sign-offs, and the stamp floor read off the Plan and Focus rows.
    _FOLLOW_UP_READERS = (
        "guidance_preferences", "active_focus", "list_focuses", "follow_up_record",
        "follow_up_records", "follow_up_frontier", "follow_up_request",
        "get_plan_draft", "plan_history", "pattern_reviews", "latest_server_stamp",
    )

    def _follow_up_reads(self, client, reads):
        """The follow-up readers each read runs, for a client whose cache is cold."""
        calls = []

        def recording(name, real):
            def run(store, *args, **kwargs):
                calls.append(name)
                return real(store, *args, **kwargs)
            return run

        observed = {}
        with contextlib.ExitStack() as stack:
            for name in self._FOLLOW_UP_READERS:
                stack.enter_context(patch.object(
                    Store, name, recording(name, getattr(Store, name))))
            for path, params in reads:
                del calls[:]
                response = client.get(path, params=params)
                self.assertLess(response.status_code, 500, (path, response.text))
                observed[(path, tuple(sorted(params.items())))] = sorted(set(calls))
        return observed

    def test_every_result_a_follow_up_write_keeps_reads_no_follow_up_state(self):
        """#538: the results keyed by the recorded-data revision, and every result a
        follow-up write keeps, run no read of follow-up state; the ones that do are
        exactly those keyed by the input revision or dropped."""
        _tmp, _app, client = self._case_client("showcase")
        day = client.get("/api/status").json()["latest_data_day"]
        start = datetime.strptime(day, "%Y-%m-%d")
        recorded = self._follow_up_reads(client, (
            ("/api/analyze", {}), ("/api/analyze", {"pool": "true"}),
            ("/api/analyze", {"window": 14}), ("/api/analyze", {"ignore_changes": "true"}),
            ("/api/scenarios", {}), ("/api/scenarios", {"window": 14}),
            ("/api/explore/exposures", {}), ("/api/explore/time-of-day", {"days": 14}),
            ("/api/diagnose/findings", {}),
            ("/api/outcomes", {"window": 14}), ("/api/day-navigator", {}),
            ("/api/model-view", {"date": day}),
            ("/api/timeline", {"start": start.isoformat(),
                               "end": (start + timedelta(days=1)).isoformat()}),
            ("/api/catalog", {}),
        ))
        self.assertEqual({read: names for read, names in recorded.items() if names}, {})
        follow_up = self._follow_up_reads(client, (
            ("/api/verify/trials", {}), ("/api/outcomes/trend", {}),
            ("/api/pattern-sweep", {}),
        ))
        self.assertTrue(all(follow_up.values()), follow_up)

    def test_a_focus_pin_refreshes_the_watched_change(self):
        """#538: the watched change reads follow-up state, so it is not answered
        from before the pin that changed it."""
        _tmp, _app, client = self._case_client("behavioral-missed-meal")
        self.assertIsNone(client.get("/api/outcomes/trend").json()["watched_change"])
        pinned = client.post("/api/focus", json={"lever": "missed_meal"})
        self.assertEqual(pinned.status_code, 200, pinned.text)
        watched = client.get("/api/outcomes/trend").json()["watched_change"]
        self.assertEqual(watched["lever"], "missed_meal")

    def test_preference_writes_keep_offline_guidance_reconciled(self):
        from ciq_autotune.watched_change import reconcile_ingested_follow_up
        tmp, _app, client = self._case_client("basal-lower")
        with Store.open(tmp.name) as store:
            reconcile_ingested_follow_up(store)
        current = client.get("/api/guidance").json()
        self.assertEqual(current["disposition"], "eligible_action")
        subject = current["selected"]["subject"]
        path = f"/api/guidance/preferences/{subject}"
        saved = client.put(path, json={"generation": current["analysis_generation"]})
        self.assertEqual(saved.status_code, 200, saved.text)
        aside = client.get("/api/guidance").json()
        self.assertEqual(aside["admission"]["state"], "available")
        self.assertNotEqual(aside["disposition"], "unavailable")
        self.assertTrue(next(row for row in aside["candidates"]
                             if row["subject"] == subject)["preference"]["set_aside"])
        self.assertGreater(aside["input_revision"], current["input_revision"])
        stale = client.put(path, json={"generation": current["analysis_generation"]})
        self.assertEqual(stale.status_code, 409)
        restored = client.delete(path)
        self.assertEqual(restored.status_code, 200, restored.text)
        after = client.get("/api/guidance").json()
        self.assertEqual(after["disposition"], "eligible_action")
        self.assertEqual(after["selected"]["subject"], subject)
        self.assertGreater(after["input_revision"], aside["input_revision"])
        with Store.open_readonly(tmp.name) as store:
            self.assertEqual(store.follow_up_frontier()["reconciled_input_revision"],
                             store.input_data_revision())

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
        self.assertEqual(after["disposition"], "active_change")
        self.assertEqual(after["admission"]["state"], "available")
        self.assertEqual(after["active_watch"], current["active_watch"])

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
        self.assertEqual(client.post("/api/plan/apply", headers=headers).status_code, 422)
        first = client.post("/api/focus", headers=headers, json={"lever": "missed_meal"})
        self.assertEqual(first.status_code, 200)
        second = client.post("/api/focus", headers=headers, json={"lever": "missed_meal"})
        self.assertEqual(second.status_code, 409)
