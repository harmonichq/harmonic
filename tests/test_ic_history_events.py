"""Public projection tests for retired I:C event evidence."""

from datetime import datetime, timedelta
import unittest

from ciq_autotune.events import CgmReading
from ciq_autotune.findings_projection import FindingsProjection
from ciq_autotune.ic_history import (
    HistoryIdentity,
    RunIdentity,
    encode_history_id,
    encode_run_id,
)
from ciq_autotune.ic_history_events import prepare_ic_history_events
from ciq_autotune.result import IcHistory, IcHistoryRunRecord
from ciq_autotune.uncertainty import Estimate


class _Store:
    def __init__(self, readings):
        self.readings = readings

    def cgm_readings(self, start=None, end=None):
        return [row for row in self.readings
                if (start is None or row.t >= start) and (end is None or row.t <= end)]


class IcHistoryEventsTest(unittest.TestCase):
    def test_exact_multi_meal_record_membership_and_series_are_published(self):
        meal = datetime(2026, 8, 1, 9)
        run_id = encode_run_id(RunIdentity(meal))
        history_id = encode_history_id(HistoryIdentity(420, 720, 5.0))
        run = IcHistoryRunRecord(
            run_id=run_id, first_member_at=meal.isoformat(),
            last_member_at=(meal + timedelta(minutes=120)).isoformat(),
            member_offsets_min=[0.0, 120.0], cgm_start_min=-10.0,
            cgm_end_min=435.0, outcome_min=420.0,
        )
        history = IcHistory(
            history_id=history_id, block_start_min=420, block_end_min=720,
            label="Breakfast", past_setting=5.0, programmed_now=6.0,
            estimate=Estimate(value=4.6, lo=4.4, hi=4.8, n=1, method="clustered"),
            support=1, annotation="Analyzer-owned history conclusion.",
            lifecycle="active", regime_end="2026-08-02T00:00:00",
            runs=[run],
        )
        findings = FindingsProjection(
            {"window_days": 30, "ic_history": [history.to_dict()]},
            {"exposures": {}}, {"patterns": [], "low_confidence": []})
        readings = [
            CgmReading(meal + timedelta(minutes=offset), bg, "synthetic")
            for offset, bg in ((-10, 101), (0, 105), (120, 142), (435, 111), (440, 99))
        ]

        prepared = prepare_ic_history_events(_Store(readings), findings)
        result = prepared.project(
            history_id, analysis_generation="fixture-process:0")

        self.assertEqual(result["schema"], "diagnose-carb-ratio-history-events-v1")
        self.assertEqual(result["analysis_generation"], "fixture-process:0")
        self.assertEqual(result["window_days"], 90)
        self.assertEqual(result["run_ids"], [run_id])
        self.assertIsNone(result["selected_run_id"])
        self.assertEqual(result["series"][0]["member_offsets_min"], [0.0, 120.0])
        self.assertEqual(result["series"][0]["points"], [
            {"minute": -10.0, "bg": 101}, {"minute": 0.0, "bg": 105},
            {"minute": 120.0, "bg": 142}, {"minute": 435.0, "bg": 111},
        ])

    def test_selected_run_records_selection_without_filtering_exact_population(self):
        meals = [datetime(2026, 8, 1, 9), datetime(2026, 8, 3, 9)]
        runs = [
            IcHistoryRunRecord(
                run_id=encode_run_id(RunIdentity(meal)),
                first_member_at=meal.isoformat(),
                last_member_at=(meal + timedelta(minutes=index * 5)).isoformat(),
                member_offsets_min=[0.0, float(index * 5)],
                cgm_start_min=-5.0, cgm_end_min=15.0, outcome_min=10.0,
            )
            for index, meal in enumerate(meals, start=1)
        ]
        history_id = encode_history_id(HistoryIdentity(420, 720, 5.0))
        history = IcHistory(
            history_id=history_id, block_start_min=420, block_end_min=720,
            label="Breakfast", past_setting=5.0, programmed_now=6.0,
            estimate=Estimate(value=4.6, lo=4.4, hi=4.8, n=2, method="clustered"),
            support=2, annotation="Analyzer-owned history conclusion.",
            lifecycle="active", regime_end="2026-08-04T00:00:00", runs=runs,
        )
        findings = FindingsProjection(
            {"window_days": 30, "ic_history": [history.to_dict()]},
            {"exposures": {}}, {"patterns": [], "low_confidence": []})
        readings = [
            CgmReading(meal + timedelta(minutes=minute), bg, "synthetic")
            for meal, base in zip(meals, (100, 120))
            for minute, bg in ((-5, base), (0, base + 5), (15, base + 2))
        ]
        prepared = prepare_ic_history_events(_Store(readings), findings)

        all_runs = prepared.project(
            history_id, analysis_generation="fixture-process:0")
        selected = prepared.project(
            history_id, runs[1].run_id,
            analysis_generation="fixture-process:0")

        expected_ids = [run.run_id for run in runs]
        expected_series = [
            {
                **run.to_dict(), "meal_at": run.first_member_at,
                "points": [
                    {"minute": -5.0, "bg": base},
                    {"minute": 0.0, "bg": base + 5},
                    {"minute": 15.0, "bg": base + 2},
                ],
            }
            for run, base in zip(runs, (100, 120))
        ]
        self.assertEqual(all_runs["run_ids"], expected_ids)
        self.assertEqual(all_runs["series"], expected_series)
        self.assertIsNone(all_runs["selected_run_id"])
        self.assertEqual(selected["selected_run_id"], runs[1].run_id)
        self.assertEqual(selected["run_ids"], expected_ids)
        self.assertEqual(selected["series"], expected_series)


if __name__ == "__main__":
    unittest.main()
