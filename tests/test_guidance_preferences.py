import tempfile
import unittest

from ciq_autotune.findings_projection import prepare_findings_projection
from ciq_autotune.store import Store
from scripts.qa_e2e_cases import QA_CASES, execute_case, materialize_case


class GuidancePreferencesTest(unittest.TestCase):
    @staticmethod
    def _case(name):
        return next(case for case in QA_CASES if case.name == name)

    def _legacy_preferences(self, name, rows):
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        case = self._case(name)
        with Store.open(tmp.name) as store:
            materialize_case(store, case)
            for subject, decided_at, reason in rows:
                store.save_guidance_preference(
                    subject, decided_at=decided_at, reason=reason,
                    comparison_version="383:1",
                    state={"kind": "habit", "action": {"action_id": subject},
                           "seriousness": "low"},
                )
            store.conn.execute("PRAGMA user_version = 0")
        return tmp, case

    def test_owned_habit_migrates_to_pattern_without_meaningless_return(self):
        from ciq_autotune.api import create_app
        tmp, case = self._legacy_preferences("behavioral-carb-undercount", [
            ("habit:carb_undercount", "2026-01-02 00:00:00", "later"),
        ])
        app = create_app(db_path=tmp.name, token="", enable_fetch_loop=False)
        self.assertEqual(app.state.result_cache.version, 1)
        with Store.open(tmp.name) as store:
            preferences = store.guidance_preferences()
            execution = execute_case(store, case)
            self.assertFalse(store.pattern_migration_pending())
            self.assertFalse(store.migrate_pattern_subjects(None, None, None))
        self.assertEqual([row["subject"] for row in preferences],
                         ["pattern:highs_after_meals"])
        guidance = prepare_findings_projection(
            analysis=execution.analysis, exposures=execution.exposures,
            scenarios=execution.scenarios,
        ).guidance(preferences=preferences)
        pattern = next(row for row in guidance["candidates"]
                       if row["subject"] == "pattern:highs_after_meals")
        self.assertTrue(pattern["preference"]["set_aside"])
        self.assertIsNone(pattern["preference"]["return_reason"])

    def test_collapsed_pattern_and_member_share_one_preference(self):
        from ciq_autotune.api import create_app
        tmp, _case = self._legacy_preferences("behavioral-over-treated-low", [
            ("habit:over_treated_low", "2026-01-02 00:00:00", None),
        ])
        create_app(db_path=tmp.name, token="", enable_fetch_loop=False)
        with Store.open(tmp.name) as store:
            rows = store.guidance_preferences()
        self.assertEqual([row["subject"] for row in rows],
                         ["pattern:highs_after_treating_lows"])

    def test_migration_merges_member_preferences_by_earliest_decision(self):
        from ciq_autotune.api import create_app
        tmp, _case = self._legacy_preferences("behavioral-carb-undercount", [
            ("habit:carb_undercount", "2026-01-02 00:00:00", "keep first"),
            ("habit:late_bolus", "2026-01-03 00:00:00", "discard second"),
        ])
        create_app(db_path=tmp.name, token="", enable_fetch_loop=False)
        with Store.open(tmp.name) as store:
            rows = store.guidance_preferences()
            subjects = [row[0] for row in store.conn.execute(
                "SELECT subject FROM guidance_preferences ORDER BY subject")]
        self.assertEqual(subjects, ["pattern:highs_after_meals"])
        self.assertEqual(rows[0]["decided_at"], "2026-01-02 00:00:00")
        self.assertEqual(rows[0]["reason"], "keep first")

    def test_focus_migration_is_one_time_across_a_later_legacy_write(self):
        from ciq_autotune.api import create_app
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        with Store.open(tmp.name) as store:
            focus = store.pin_focus("late_bolus", "2026-01-01 00:00:00")
            store.conn.execute("PRAGMA user_version = 0")
        create_app(db_path=tmp.name, token="", enable_fetch_loop=False)
        with Store.open(tmp.name) as store:
            migrated = store.follow_up_record("focus", focus["id"])
            self.assertEqual(migrated["pattern_key"], "highs_after_meals")
            store.resolve_focus(focus["id"])
            later = store.pin_focus("late_bolus", "2026-01-02 00:00:00")
        with Store.open(tmp.name) as store:
            self.assertNotIn("pattern_key", store.follow_up_record("focus", later["id"]))

    def test_upsert_reopen_and_restore_are_bounded(self):
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        with Store.open(tmp.name) as store:
            store.save_guidance_preference("setting:basal_rate", decided_at="2026-01-01 00:00:00",
                                           reason="later", comparison_version="383:1",
                                           state={"action": [], "seriousness": None})
            store.save_guidance_preference("setting:basal_rate", decided_at="2026-01-02 00:00:00",
                                           reason=None, comparison_version="383:1",
                                           state={"action": [{"recommended": 1}], "seriousness": None})
        with Store.open(tmp.name) as store:
            rows = store.guidance_preferences()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["decided_at"], "2026-01-02 00:00:00")
            self.assertTrue(store.restore_guidance_preference("setting:basal_rate"))
            self.assertFalse(store.restore_guidance_preference("setting:basal_rate"))

    def test_crossing_revision_preserves_the_previous_preference(self):
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(tmp.close)
        with Store.open(tmp.name) as store:
            store.save_guidance_preference(
                "setting:basal_rate", decided_at="2026-01-01 00:00:00",
                reason="first", comparison_version="383:1", state={"kind": "setting"},
            )
            stale_revision = store.input_data_revision()
            store.restore_guidance_preference("not-present")
            store.save_guidance_preference(
                "setting:isf", decided_at="2026-01-01 00:00:01",
                reason=None, comparison_version="383:1", state={"kind": "setting"},
            )
            with self.assertRaisesRegex(ValueError, "guidance changed"):
                store.save_guidance_preference(
                    "setting:basal_rate", decided_at="2026-01-02 00:00:00",
                    reason="replacement", comparison_version="383:1",
                    state={"kind": "setting", "action": [1]},
                    expected_revision=stale_revision,
                )
            row = next(row for row in store.guidance_preferences()
                       if row["subject"] == "setting:basal_rate")
            self.assertEqual(row["reason"], "first")
