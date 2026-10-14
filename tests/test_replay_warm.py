"""The replay's warmed case store arrives warm, and serves what a cold one would (#507).

The browser replay copies each generated case to a fresh store per story. Its
warm step runs once per case, against the pristine source; a story's copy then
carries that sidecar. These tests read the Diagnose arrival through the API.
"""
import importlib.util
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

try:
    from fastapi.testclient import TestClient
except ImportError:  # pragma: no cover
    TestClient = None

from ciq_autotune.derived_artifacts import sidecar_path

ROOT = Path(__file__).resolve().parents[1]
_ARRIVAL = ("/api/analyze?window=30", "/api/analyze?window=30&pool=1", "/api/scenarios?window=30")


def _undated(payload):
    return {key: value for key, value in payload.items() if key != "generated_at"}


def _warm_module():
    spec = importlib.util.spec_from_file_location("replay_warm", ROOT / "frontend" / "replay-warm.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@unittest.skipIf(TestClient is None, "api extra not installed")
class ReplayWarmTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.source = self.tmp / "generated-basal-no-change.sqlite"
        subprocess.run([sys.executable, str(ROOT / "scripts" / "gen_qa_e2e_db.py"), "--case",
                        "basal-no-change", "--out", str(self.source)], cwd=ROOT, check=True,
                       capture_output=True)

    def _copy(self, name, *, sidecar):
        story = self.tmp / name / "harmonic-qa-e2e.sqlite"
        story.parent.mkdir()
        shutil.copyfile(self.source, story)
        if sidecar:
            shutil.copyfile(sidecar_path(str(self.source)), sidecar_path(str(story)))
        return story

    def _reads(self, story):
        from ciq_autotune.api import create_app
        client = TestClient(create_app(db_path=str(story), token="", enable_fetch_loop=False))
        responses = [client.get(path) for path in _ARRIVAL]
        for response in responses:
            self.assertEqual(response.status_code, 200, response.text)
        return [response.json() for response in responses]

    def test_a_fresh_copy_of_a_warmed_case_serves_its_arrival_without_recomputing(self):
        cold = self._reads(self._copy("cold", sidecar=False))
        _warm_module().warm(str(self.source))
        story = self._copy("story", sidecar=True)

        def refuse(*args, **kwargs):
            raise AssertionError("a warmed arrival recomputed its analysis")

        with patch("ciq_autotune.api.analyze", refuse), \
                patch("ciq_autotune.analyzers.scenario.build_scenarios", refuse):
            warm = self._reads(story)
        # A hit carries the warm step's compute time, as a restarted install's does.
        self.assertEqual([_undated(payload) for payload in warm], [_undated(payload) for payload in cold])

    def test_a_store_without_synthetic_provenance_is_refused(self):
        with sqlite3.connect(self.source) as conn:
            conn.execute("DROP TABLE synthetic_fixture_provenance")
        with self.assertRaisesRegex(ValueError, "generated synthetic store"):
            _warm_module().warm(str(self.source))
        self.assertFalse(Path(sidecar_path(str(self.source))).exists())


if __name__ == "__main__":
    unittest.main()
