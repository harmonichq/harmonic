"""CLI coverage for the committed synthetic QA E2E database."""

import pathlib
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from ciq_autotune.store import Store
from scripts.qa_e2e_cases import QA_CASES


ROOT = pathlib.Path(__file__).resolve().parent.parent
GENERATOR = ROOT / "scripts" / "gen_qa_e2e_db.py"
DEFAULT_OUTPUT = ROOT / "mockups" / "qa-e2e.synthetic" / "harmonic.sqlite"


def run(*args):
    return subprocess.run(
        [sys.executable, str(GENERATOR), *args], cwd=ROOT,
        capture_output=True, text=True,
    )


def dump(path):
    with sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True) as conn:
        return "\n".join(
            line for line in conn.iterdump() if "input_data_revision" not in line
        )


class QaE2EDatabaseGeneratorTest(unittest.TestCase):
    def setUp(self):
        self.default_bytes = DEFAULT_OUTPUT.read_bytes()
        self.default_mtime = DEFAULT_OUTPUT.stat().st_mtime_ns

    def tearDown(self):
        self.assertEqual(DEFAULT_OUTPUT.read_bytes(), self.default_bytes)
        self.assertEqual(DEFAULT_OUTPUT.stat().st_mtime_ns, self.default_mtime)

    def test_bare_check_is_the_only_default_output_resolution(self):
        result = run("--check")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("current", result.stdout)

    def test_cli_writes_stamped_showcase_only_store(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / "harmonic.sqlite"
            result = run("--out", str(output))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(output.with_name(output.name + "-wal").exists())
            self.assertFalse(output.with_name(output.name + "-shm").exists())
            with sqlite3.connect(output) as conn:
                self.assertEqual(
                    conn.execute(
                        "SELECT _generated_by, synthetic "
                        "FROM synthetic_fixture_provenance"
                    ).fetchone(),
                    ("scripts/gen_qa_e2e_db.py", 1),
                )
            self.assertEqual(dump(output), dump(DEFAULT_OUTPUT))

    def test_committed_showcase_contains_no_credentials(self):
        with Store.open_readonly(str(DEFAULT_OUTPUT)) as store:
            self.assertIsNone(store.get_credentials())

    def test_named_case_writes_only_that_stamped_scratch_store(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / "basal-raise.sqlite"
            result = run("--case", "basal-raise", "--out", str(output))
            self.assertEqual(result.returncode, 0, result.stderr)
            with sqlite3.connect(output) as conn:
                provenance = conn.execute(
                    "SELECT _generated_by, _note, synthetic "
                    "FROM synthetic_fixture_provenance"
                ).fetchone()
                self.assertEqual(provenance[0], "scripts/gen_qa_e2e_db.py")
                self.assertIn("basal-raise", provenance[1])
                self.assertEqual(provenance[2], 1)
                self.assertEqual(
                    conn.execute("SELECT COUNT(*) FROM bolus_events").fetchone()[0], 0,
                )

    def test_named_case_requires_an_explicit_output_and_writes_nothing(self):
        result = run("--case", "basal-raise")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--out", result.stderr)

    def test_case_and_check_are_mutually_exclusive(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / "case.sqlite"
            result = run("--case", "basal-raise", "--out", str(output), "--check")
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())

    def test_unknown_case_names_the_runtime_catalog(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / "unknown.sqlite"
            result = run("--case", "not-a-case", "--out", str(output))
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())
            for case in QA_CASES:
                self.assertIn(case.name, result.stderr)

    def test_check_compares_a_generated_store_logically(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / "harmonic.sqlite"
            self.assertEqual(run("--out", str(output)).returncode, 0)
            checked = run("--check", "--out", str(output))
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)

    def test_check_rejects_logical_database_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / "harmonic.sqlite"
            self.assertEqual(run("--out", str(output)).returncode, 0)
            with sqlite3.connect(output) as conn:
                conn.execute(
                    "UPDATE cgm_readings SET bg = bg + 1 "
                    "WHERE t = (SELECT MIN(t) FROM cgm_readings)"
                )
            checked = run("--check", "--out", str(output))
            self.assertEqual(checked.returncode, 1)
            self.assertIn("differ", checked.stdout)
