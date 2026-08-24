"""Public sidecar safety contract (#123)."""
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ciq_autotune.derived_artifacts import load_or_compute, sidecar_path
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

    def test_crossed_write_before_fresh_read_does_not_persist(self):
        def compute(store):
            with Store.open(self.tmp.name) as writer:
                writer.upsert_cgm([{"EventDateTime": "2020-01-01 00:00:00", "Readings (CGM / BGM)": 100}])
            return {"fresh": True}
        self.assertEqual(self.load(compute), {"fresh": True})
        calls = []
        self.assertEqual(self.load(lambda store: calls.append(1) or {"next": True}), {"next": True})
        self.assertEqual(calls, [1])

    def test_corrupt_artifact_is_never_served(self):
        self.load(lambda store: {"good": True})
        with sqlite3.connect(sidecar_path(self.tmp.name)) as conn:
            conn.execute("UPDATE artifacts SET payload = '{bad'")
        self.assertEqual(self.load(lambda store: {"recomputed": True}), {"recomputed": True})

    def test_transient_lock_returns_fresh_without_deleting_sidecar(self):
        self.load(lambda store: {"old": True})
        path = sidecar_path(self.tmp.name)
        with patch("ciq_autotune.derived_artifacts._open", side_effect=sqlite3.OperationalError("database is locked")):
            self.assertEqual(self.load(lambda store: {"fresh": True}, ("other",)), {"fresh": True})
        self.assertTrue(Path(path).exists())

    def test_crash_mid_write_keeps_prior_artifact_readable(self):
        self.load(lambda store: {"old": True})
        path = sidecar_path(self.tmp.name)
        with sqlite3.connect(path) as conn:
            before = conn.execute("SELECT payload FROM artifacts").fetchone()[0]
        self.assertEqual(self.load(lambda store: {"ignored": True}), {"old": True})
        with sqlite3.connect(path) as conn:
            self.assertEqual(conn.execute("SELECT payload FROM artifacts").fetchone()[0], before)
