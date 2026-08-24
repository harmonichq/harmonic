"""Public-interface tests for the synthetic revise-E2E SQLite generator."""

from __future__ import annotations

import pathlib
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from ciq_autotune.findings_projection import WindowQuery, prepare_findings_projection
from ciq_autotune.ic_history_events import prepare_ic_history_events
from ciq_autotune.store import Store


_REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
_GENERATOR = _REPO_ROOT / "scripts" / "gen_revise_e2e_db.py"


class ReviseE2EDatabaseGeneratorTest(unittest.TestCase):
    def test_generator_builds_a_synthetic_store_through_the_cli(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / "harmonic.sqlite"
            result = subprocess.run(
                [sys.executable, str(_GENERATOR), "--out", str(output)],
                cwd=_REPO_ROOT,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(output.is_file())
            self.assertFalse(output.with_name(output.name + "-wal").exists())
            self.assertFalse(output.with_name(output.name + "-shm").exists())
            with Store.open_readonly(str(output)) as store:
                self.assertEqual(
                    store.cgm_day_bounds(), ("2020-02-03", "2020-05-12")
                )
                self.assertEqual(
                    store.counts(),
                    {
                        "basal_events": 28800,
                        "bolus_events": 600,
                        "cgm_readings": 28800,
                        "iob_events": 0,
                        "pump_events": 0,
                        "profile_settings": 2,
                    },
                )
                self.assertEqual(len(store.settings_snapshots()), 2)
                self.assertIsNone(store.get_credentials())
                from ciq_autotune.analyze import analyze
                from ciq_autotune.analyzers.scenario import build_scenarios
                from ciq_autotune.explore_exposures import build_exposures
                projection = prepare_findings_projection(
                    analysis=analyze(
                        store, window_days=30, pool_agreeing_basal_regimes=True,
                        carb_entries=store.carb_entries(),
                        prompt_responses=store.prompt_responses(),
                    ).to_dict(),
                    exposures=build_exposures(store, window_days=30),
                    scenarios=build_scenarios(store, window_days=30).to_dict(),
                )
                self.assertGreaterEqual(
                    projection.project(WindowQuery.whole_day())["counts"]["finding"],
                    1,
                )
                findings = projection.project(
                    WindowQuery.whole_day(), analysis_generation="fixture:0")
                self.assertGreaterEqual(findings["counts"]["history"], 1)
                history = next(row for row in findings["rows"]
                               if row["register"] == "history")
                evidence = prepare_ic_history_events(store, projection).project(
                    history["id"], analysis_generation="fixture:0")
                self.assertTrue(any(
                    len(series["member_offsets_min"]) > 1
                    for series in evidence["series"]
                ))

            with sqlite3.connect(output) as conn:
                row = conn.execute(
                    "SELECT _generated_by, _note, synthetic "
                    "FROM synthetic_fixture_provenance"
                ).fetchone()
            self.assertEqual(row[0], "scripts/gen_revise_e2e_db.py")
            self.assertIn("SYNTHETIC", row[1])
            self.assertEqual(row[2], 1)

    def test_check_accepts_the_committed_database(self) -> None:
        result = subprocess.run(
            [sys.executable, str(_GENERATOR), "--check"],
            cwd=_REPO_ROOT,
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("current", result.stdout)

    def test_check_rejects_logical_database_drift(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / "harmonic.sqlite"
            generated = subprocess.run(
                [sys.executable, str(_GENERATOR), "--out", str(output)],
                cwd=_REPO_ROOT,
                capture_output=True,
                text=True,
            )
            self.assertEqual(generated.returncode, 0, generated.stderr)
            with sqlite3.connect(output) as conn:
                conn.execute(
                    "UPDATE cgm_readings SET bg = bg + 1 "
                    "WHERE t = (SELECT MIN(t) FROM cgm_readings)"
                )

            checked = subprocess.run(
                [sys.executable, str(_GENERATOR), "--check", "--out", str(output)],
                cwd=_REPO_ROOT,
                capture_output=True,
                text=True,
            )

        self.assertNotEqual(checked.returncode, 0)
        self.assertIn("differ", checked.stdout)


if __name__ == "__main__":
    unittest.main()
