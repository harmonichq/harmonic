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
            support=1, lifecycle="active", regime_end="2026-08-02T00:00:00",
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


if __name__ == "__main__":
    unittest.main()
