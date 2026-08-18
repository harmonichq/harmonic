"""Public-interface guard for the issue #364 grounding analysis."""

from __future__ import annotations

from datetime import datetime, timedelta
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "analyze_localized_outcomes.py"


class LocalizedOutcomesGroundingTest(unittest.TestCase):
    def test_cli_counts_dense_low_readings_as_one_low_day(self):
        with tempfile.TemporaryDirectory() as td:
            db = Path(td) / "fixture.db"
            conn = sqlite3.connect(db)
            conn.executescript(
                """
                CREATE TABLE cgm_readings (t TEXT PRIMARY KEY, bg REAL, type TEXT);
                CREATE TABLE bolus_events (
                    t TEXT NOT NULL, insulin REAL, carbs REAL, pump_iob REAL
                );
                CREATE TABLE pump_events (t TEXT NOT NULL, event_type TEXT NOT NULL);
                CREATE TABLE carb_entries (t TEXT NOT NULL);
                """
            )
            # Thirty autocorrelated low readings are one observed low-day, not n=30.
            start = datetime(2026, 1, 4, 2, 0)
            rows = [
                ((start + timedelta(minutes=5 * i)).strftime("%Y-%m-%d %H:%M:%S"), 65, "EGV")
                for i in range(30)
            ]
            # Two comparison days make the half/window machinery exercise sparse input.
            for day in (5, 6):
                day_start = datetime(2026, 1, day, 2, 0)
                rows.extend(
                    (
                        (day_start + timedelta(minutes=5 * i)).strftime(
                            "%Y-%m-%d %H:%M:%S"
                        ),
                        110,
                        "EGV",
                    )
                    for i in range(30)
                )
            conn.executemany("INSERT INTO cgm_readings VALUES (?, ?, ?)", rows)
            conn.commit()
            conn.close()

            proc = subprocess.run(
                [sys.executable, str(SCRIPT), "--db", str(db), "--json"],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            report = json.loads(proc.stdout)

        overnight = next(
            candidate
            for candidate in report["candidates"]
            if candidate["id"] == "overnight-low-clustering"
        )
        self.assertEqual(overnight["numbers"]["low_readings"], 30)
        self.assertEqual(overnight["numbers"]["low_days"], 1)
        self.assertEqual(overnight["effective_n"], 3)

    def test_cli_rejects_the_real_sunday_split_at_day_level(self):
        with tempfile.TemporaryDirectory() as td:
            db = Path(td) / "launch-set.db"
            conn = sqlite3.connect(db)
            conn.executescript(
                """
                CREATE TABLE cgm_readings (t TEXT PRIMARY KEY, bg REAL, type TEXT);
                CREATE TABLE bolus_events (
                    t TEXT NOT NULL, insulin REAL, carbs REAL, pump_iob REAL
                );
                CREATE TABLE pump_events (t TEXT NOT NULL, event_type TEXT NOT NULL);
                CREATE TABLE carb_entries (t TEXT NOT NULL);
                """
            )
            first_sunday = datetime(2026, 1, 4)
            days = [first_sunday + timedelta(days=offset) for offset in range(150)]
            first_half = days[:75]
            second_half = days[75:]
            first_sundays = [day for day in first_half if day.weekday() == 6]
            second_sundays = [day for day in second_half if day.weekday() == 6]
            first_others = [day for day in first_half if day.weekday() != 6]
            second_others = [day for day in second_half if day.weekday() != 6]
            low_days = set(
                first_sundays[:9]
                + second_sundays[:8]
                + first_others[:35]
                + second_others[:36]
            )
            cgm = []
            for day in days:
                cgm.extend(
                    (
                        (day + timedelta(hours=2, minutes=5 * i)).strftime(
                            "%Y-%m-%d %H:%M:%S"
                        ),
                        110,
                        "EGV",
                    )
                    for i in range(30)
                )
                if day in low_days:
                    cgm.extend(
                        [
                            ((day + timedelta(hours=13)).strftime("%Y-%m-%d %H:%M:%S"), 65, "EGV"),
                            ((day + timedelta(hours=19)).strftime("%Y-%m-%d %H:%M:%S"), 65, "EGV"),
                        ]
                    )
            conn.executemany("INSERT INTO cgm_readings VALUES (?, ?, ?)", cgm)
            conn.commit()
            conn.close()

            proc = subprocess.run(
                [sys.executable, str(SCRIPT), "--db", str(db), "--json"],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            report = json.loads(proc.stdout)

        sunday = next(
            candidate
            for candidate in report["candidates"]
            if candidate["id"] == "sunday-lows"
        )
        self.assertEqual(sunday["numbers"]["sunday"], {"events": 17, "n": 22})
        self.assertEqual(
            sunday["numbers"]["other_days"], {"events": 71, "n": 128}
        )
        self.assertEqual(
            sunday["numbers"]["risk_difference_newcombe_95ci_pct"], [-0.5, 37.1]
        )
        self.assertAlmostEqual(
            sunday["numbers"]["fisher_exact_two_sided_p"], 0.0634, places=4
        )
        self.assertFalse(sunday["day_level_signal"]["passed"])
        self.assertTrue(all(gate["passed"] for gate in sunday["gates"].values()))
        self.assertEqual(report["survivors"], [])
        self.assertEqual(
            report["killed"],
            [
                "overnight-low-clustering",
                "sunday-lows",
                "late-evening-meals",
                "post-low-rebound",
                "user-suspend-clusters",
                "reactive-site-changes",
            ],
        )


if __name__ == "__main__":
    unittest.main()
