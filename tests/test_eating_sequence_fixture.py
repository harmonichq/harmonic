"""Drift and provenance contract for the eating-sequence report fixture (#275)."""

import json
from datetime import timedelta
from pathlib import Path
import unittest

from ciq_autotune.analyzers.eating_sequence_config import EatingSequenceConfig
from ciq_autotune.analyzers.eating_sequences import (
    build_eating_sequence_report,
    build_report,
    report_dict,
)
from tests.eating_sequence_streams import repeat_eating_stream


class EatingSequenceFixtureTest(unittest.TestCase):
    def test_fixture_is_analyzer_output_with_synthetic_provenance(self):
        root = Path(__file__).resolve().parents[1]
        fixture = json.loads((
            root / "frontend/__fixtures__/eating-sequence-report.json"
        ).read_text())

        boluses, cgm, carb_log, _ = repeat_eating_stream()
        end = cgm[-1].t
        report = build_report(
            boluses, cgm, carb_log,
            window_start=end - timedelta(days=30), window_end=end,
            config=EatingSequenceConfig(),
        )
        expected = {
            "_generated_by": "scripts/gen_eating_sequence_fixtures.py",
            "_note": "SYNTHETIC. Fixed invented eating sequences; no personal data.",
            **report_dict(report),
        }

        self.assertEqual(fixture, expected)
        self.assertEqual(fixture["_generated_by"], "scripts/gen_eating_sequence_fixtures.py")
        self.assertIn("SYNTHETIC", fixture["_note"])
        finding = fixture["high_carb_sequence"]["finding"]
        self.assertIsNotNone(finding)
        self.assertTrue(any(
            comparison["status"] == "supported"
            for comparison in fixture["high_carb_sequence"]["comparisons"]
        ))
        repeat = fixture["repeat_eating_amplifier"]
        self.assertIsNotNone(repeat["finding"])
        self.assertTrue(any(
            comparison["status"] == "supported"
            for comparison in repeat["comparisons"]
        ))

    def test_served_wrapper_reproduces_the_frozen_fixture(self):
        """The route builds through the store wrapper; the fixture must pin that path too."""
        root = Path(__file__).resolve().parents[1]
        fixture = json.loads((
            root / "frontend/__fixtures__/eating-sequence-report.json"
        ).read_text())
        boluses, cgm, carb_log, basal = repeat_eating_stream()

        class Store:
            def basal_events(self): return basal
            def cgm_readings(self): return cgm
            def bolus_events(self): return boluses
            def carb_entries(self): return carb_log

        served = report_dict(build_eating_sequence_report(Store()))
        frozen = {key: value for key, value in fixture.items() if not key.startswith("_")}
        self.assertEqual(served, frozen)
