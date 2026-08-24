"""Public sidecar safety contract (#123)."""
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import ciq_autotune.derived_artifacts as artifacts
from ciq_autotune.derived_artifacts import load_latest_prior, load_or_compute, sidecar_path
from ciq_autotune.store import Store


class DerivedArtifactsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        with Store.open(self.tmp.name):
            pass

    def tearDown(self):
        Path(sidecar_path(self.tmp.name)).unlink(missing_ok=True)
        self.tmp.close()

    def load(self, compute, key=("fixed",)):
        return load_or_compute(self.tmp.name, key, compute, shape_marker="test-v1")

    def test_restart_warm_exact_key_and_revision_miss(self):
        calls = []
        self.assertEqual(self.load(lambda store: calls.append(1) or {"value": 1}), {"value": 1})
        self.assertEqual(self.load(lambda store: calls.append(2) or {"value": 2}), {"value": 1})
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm([{"EventDateTime": "2020-01-01 00:00:00", "Readings (CGM / BGM)": 100}])
        self.assertEqual(self.load(lambda store: calls.append(3) or {"value": 3}), {"value": 3})
        self.assertEqual(calls, [1, 3])

    def test_persists_snapshot_data_horizon_with_the_artifact(self):
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm([{"EventDateTime": "2020-01-01 00:00:00", "Readings (CGM / BGM)": 100}])
        first = load_or_compute(self.tmp.name, ("horizon",), lambda store: {"value": 1},
                                shape_marker="test-v1", with_age=True)
        second = load_or_compute(self.tmp.name, ("horizon",), lambda store: {"value": 2},
                                 shape_marker="test-v1", with_age=True)
        self.assertEqual(first.value, {"value": 1})
        self.assertIsNone(first.input_data_age)
        self.assertEqual(second.value, {"value": 1})
        self.assertIsNone(second.input_data_age)
        self.assertEqual(second.covers_to, "2020-01-01 00:00:00")

    def test_crossed_write_recomputes_before_returning_an_unlabeled_result(self):
        calls = []

        def compute(store):
            calls.append(store.input_data_revision())
            if len(calls) == 1:
                with Store.open(self.tmp.name) as writer:
                    writer.upsert_cgm([{"EventDateTime": "2020-01-01 00:00:00", "Readings (CGM / BGM)": 100}])
            return {"revision": store.input_data_revision()}

        result = load_or_compute(
            self.tmp.name, ("crossed",), compute,
            shape_marker="test-v1", with_age=True)

        self.assertEqual(calls, [0, 1])
        self.assertEqual(result.value, {"revision": 1})
        self.assertEqual(result.revision, 1)
        self.assertIsNone(result.input_data_age)
        with sqlite3.connect(sidecar_path(self.tmp.name)) as conn:
            self.assertEqual(conn.execute(
                "SELECT revision FROM artifacts WHERE coordinates=?",
                (artifacts._canonical(("crossed",)),),
            ).fetchone()[0], 1)

    def test_continuously_crossed_revisions_fail_instead_of_returning_old_data(self):
        calls = []

        def compute(store):
            calls.append(store.input_data_revision())
            with Store.open(self.tmp.name) as writer:
                writer.upsert_cgm([{
                    "EventDateTime": f"2020-01-0{len(calls)} 00:00:00",
                    "Readings (CGM / BGM)": 100 + len(calls),
                }])
            return {"revision": calls[-1]}

        with self.assertRaisesRegex(RuntimeError, "input data changed"):
            load_or_compute(
                self.tmp.name, ("always-crossed",), compute,
                shape_marker="test-v1", with_age=True)

        self.assertEqual(calls, [0, 1, 2])

    def test_crossed_exact_hit_recomputes_before_returning_unlabeled_data(self):
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm([{"EventDateTime": "2020-01-01 00:00:00", "Readings (CGM / BGM)": 100}])
        self.load(lambda store: {"revision": 1}, ("crossed-hit",))
        rebuilt = []

        def rebuild(value):
            rebuilt.append(value)
            with Store.open(self.tmp.name) as writer:
                writer.upsert_cgm([{
                    "EventDateTime": "2020-01-02 00:00:00",
                    "Readings (CGM / BGM)": 101,
                }])
            return value

        result = load_or_compute(
            self.tmp.name, ("crossed-hit",),
            lambda store: {"revision": store.input_data_revision()},
            shape_marker="test-v1", rebuild=rebuild, with_age=True)

        self.assertEqual(rebuilt, [{"revision": 1}])
        self.assertEqual(result.value, {"revision": 2})
        self.assertEqual(result.revision, 2)
        self.assertIsNone(result.input_data_age)

    def test_corrupt_artifact_is_never_served(self):
        self.load(lambda store: {"good": True})
        with sqlite3.connect(sidecar_path(self.tmp.name)) as conn:
            conn.execute("UPDATE artifacts SET payload = '{bad'")
        self.assertEqual(self.load(lambda store: {"recomputed": True}), {"recomputed": True})

    def test_altered_covers_to_invalidates_the_artifact(self):
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm([{"EventDateTime": "2020-01-01 00:00:00", "Readings (CGM / BGM)": 100}])
        first = load_or_compute(
            self.tmp.name, ("horizon-integrity",), lambda store: {"old": True},
            shape_marker="test-v1", with_age=True)
        self.assertEqual(first.covers_to, "2020-01-01 00:00:00")
        with sqlite3.connect(sidecar_path(self.tmp.name)) as conn:
            conn.execute(
                "UPDATE artifacts SET covers_to='2099-01-01 00:00:00' WHERE coordinates=?",
                (artifacts._canonical(("horizon-integrity",)),),
            )

        second = load_or_compute(
            self.tmp.name, ("horizon-integrity",), lambda store: {"recomputed": True},
            shape_marker="test-v1", with_age=True)

        self.assertEqual(second.value, {"recomputed": True})
        self.assertEqual(second.covers_to, "2020-01-01 00:00:00")

    def test_latest_prior_selects_against_one_current_revision_snapshot(self):
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm([{"EventDateTime": "2020-01-01 00:00:00", "Readings (CGM / BGM)": 100}])
        self.load(lambda store: {"revision": 1}, ("prior",))
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm([{"EventDateTime": "2020-01-02 00:00:00", "Readings (CGM / BGM)": 101}])
        self.load(lambda store: {"revision": 2}, ("prior",))

        real_open = artifacts._open

        class BumpOnClose:
            def __init__(self, connection):
                self.connection = connection

            def __getattr__(self, name):
                return getattr(self.connection, name)

            def close(self):
                self.connection.close()
                with Store.open(self.tmp_name) as writer:
                    writer.upsert_cgm([{
                        "EventDateTime": "2020-01-03 00:00:00",
                        "Readings (CGM / BGM)": 102,
                    }])

        BumpOnClose.tmp_name = self.tmp.name
        with patch.object(artifacts, "_open",
                          side_effect=lambda path: BumpOnClose(real_open(path))):
            prior = load_latest_prior(
                self.tmp.name, ("prior",), shape_marker="test-v1")

        self.assertEqual(prior.value, {"revision": 2})
        self.assertEqual(prior.revision, 2)
        self.assertEqual(prior.input_data_age.newest_covers_to,
                         "2020-01-03 00:00:00")

    def test_transient_lock_returns_fresh_without_deleting_sidecar(self):
        self.load(lambda store: {"old": True})
        path = sidecar_path(self.tmp.name)
        with patch("ciq_autotune.derived_artifacts._open", side_effect=sqlite3.OperationalError("database is locked")):
            self.assertEqual(self.load(lambda store: {"fresh": True}, ("other",)), {"fresh": True})
        self.assertTrue(Path(path).exists())

    def test_corruption_with_concurrently_held_handle_does_not_delete(self):
        self.load(lambda store: {"old": True})
        path = sidecar_path(self.tmp.name)
        with sqlite3.connect(path, timeout=0.0) as held:
            held.execute("BEGIN IMMEDIATE")
            with patch("ciq_autotune.derived_artifacts._open",
                       side_effect=sqlite3.DatabaseError("database disk image is malformed")):
                self.assertEqual(self.load(lambda store: {"fresh": True}, ("other",)),
                                 {"fresh": True})
            self.assertTrue(Path(path).exists())

    def test_crash_mid_write_keeps_prior_artifact_readable(self):
        self.load(lambda store: {"old": True})
        self.assertEqual(load_or_compute(
            self.tmp.name, ("fixed",), lambda store: {"new": True},
            shape_marker="test-v1",
            rebuild=lambda _: (_ for _ in ()).throw(ValueError("force replacement")),
            before_commit=lambda: (_ for _ in ()).throw(
                sqlite3.OperationalError("injected before commit")),
        ), {"new": True})
        self.assertEqual(self.load(lambda store: {"ignored": True}), {"old": True})

    def test_valid_json_wrong_adapter_shape_recomputes(self):
        self.load(lambda store: {"good": True}, ("shape",))
        path = sidecar_path(self.tmp.name)
        with sqlite3.connect(path) as conn:
            payload = '{"wrong":true}'
            conn.execute("UPDATE artifacts SET payload=?, digest=? WHERE coordinates=?",
                         (payload, artifacts._digest(payload, None),
                          artifacts._canonical(("shape",))))
        self.assertEqual(load_or_compute(
            self.tmp.name, ("shape",), lambda store: {"fresh": True},
            shape_marker="test-v1",
            rebuild=lambda value: (_ for _ in ()).throw(ValueError("wrong shape")),
        ), {"fresh": True})

    def test_concurrent_identical_and_distinct_keys_leave_complete_artifacts(self):
        barrier = threading.Barrier(4)
        errors = []

        def write(key, value):
            try:
                barrier.wait()
                self.load(lambda store: {"value": value}, key)
            except Exception as error:  # pragma: no cover - assertion below reports it
                errors.append(error)

        threads = [threading.Thread(target=write, args=(("same",), 1)),
                   threading.Thread(target=write, args=(("same",), 3)),
                   threading.Thread(target=write, args=(("other",), 2))]
        for thread in threads:
            thread.start()
        barrier.wait()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])
        self.assertIn(self.load(lambda store: {"bad": True}, ("same",)),
                      ({"value": 1}, {"value": 3}))
        self.assertEqual(self.load(lambda store: {"bad": True}, ("other",)), {"value": 2})

    def test_injected_source_fingerprint_change_misses(self):
        self.load(lambda store: {"first": True})
        old = artifacts._FINGERPRINT
        try:
            artifacts._FINGERPRINT = "different-source-fingerprint"
            self.assertEqual(self.load(lambda store: {"second": True}), {"second": True})
        finally:
            artifacts._FINGERPRINT = old

    def test_layout_marker_change_misses(self):
        self.load(lambda store: {"first": True}, ("layout",))
        with patch.object(artifacts, "DERIVED_ARTIFACT_STORE_SCHEMA_VERSION", 4):
            self.assertEqual(self.load(lambda store: {"second": True}, ("layout",)),
                             {"second": True})

    def test_readonly_compute_does_not_create_sidecar(self):
        self.assertEqual(load_or_compute(
            self.tmp.name, ("readonly",), lambda store: {"snapshot": True},
            shape_marker="test-v1", readonly=True), {"snapshot": True})
        self.assertFalse(Path(sidecar_path(self.tmp.name)).exists())

    def test_malformed_sidecar_schema_recreates_after_recompute(self):
        path = sidecar_path(self.tmp.name)
        with sqlite3.connect(path) as conn:
            conn.execute("CREATE TABLE artifacts (wrong INTEGER)")
        self.assertEqual(self.load(lambda store: {"recovered": True}, ("schema",)),
                         {"recovered": True})
        with sqlite3.connect(path) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM artifacts").fetchone()[0], 1)

    def test_write_before_persist_recomputes_the_new_revision(self):
        wrote = False

        def write_after_read():
            nonlocal wrote
            if wrote:
                return
            wrote = True
            with Store.open(self.tmp.name) as writer:
                writer.upsert_cgm([{"EventDateTime": "2020-01-02 00:00:00", "Readings (CGM / BGM)": 101}])

        self.assertEqual(load_or_compute(
            self.tmp.name, ("late",), lambda store: {"revision": store.input_data_revision()},
            shape_marker="test-v1", before_persist=write_after_read), {"revision": 1})
        calls = []
        self.assertEqual(self.load(lambda store: calls.append(1) or {"wrong": True}, ("late",)),
                         {"revision": 1})
        self.assertEqual(calls, [])
