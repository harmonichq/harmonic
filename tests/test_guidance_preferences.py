import tempfile
import unittest

from ciq_autotune.store import Store


class GuidancePreferencesTest(unittest.TestCase):
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
