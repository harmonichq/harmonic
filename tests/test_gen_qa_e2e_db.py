"""CLI coverage for the future committed synthetic QA E2E database."""

import pathlib
import sqlite3
import subprocess
import sys
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parent.parent
GENERATOR = ROOT / "scripts" / "gen_qa_e2e_db.py"


def run(*args):
    return subprocess.run([sys.executable, str(GENERATOR), *args], cwd=ROOT,
                          capture_output=True, text=True)


class QaE2EDatabaseGeneratorTest(unittest.TestCase):
    def test_cli_writes_stamped_showcase_only_store(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / "harmonic.sqlite"
            result = run("--out", str(output))
            self.assertEqual(result.returncode, 0, result.stderr)
            with sqlite3.connect(output) as conn:
                self.assertEqual(
                    conn.execute("SELECT _generated_by, synthetic FROM synthetic_fixture_provenance").fetchone(),
                    ("scripts/gen_qa_e2e_db.py", 1),
                )


    def test_check_compares_a_generated_store_logically(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / "harmonic.sqlite"
            self.assertEqual(run("--out", str(output)).returncode, 0)
            checked = run("--check", "--out", str(output))
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)


    def test_bare_check_fails_closed_when_the_future_artifact_is_absent(self):
        result = run("--check")
        self.assertEqual(result.returncode, 1)
        self.assertIn("mockups/qa-e2e.synthetic/harmonic.sqlite", result.stdout)

    def test_check_rejects_logical_database_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / "harmonic.sqlite"
            self.assertEqual(run("--out", str(output)).returncode, 0)
            with sqlite3.connect(output) as conn:
                conn.execute("UPDATE cgm_readings SET bg = bg + 1 WHERE t = (SELECT MIN(t) FROM cgm_readings)")
            checked = run("--check", "--out", str(output))
            self.assertEqual(checked.returncode, 1)
            self.assertIn("differ", checked.stdout)
