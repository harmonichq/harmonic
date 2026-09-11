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


class EatingSequenceFindingFixtureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(__file__).resolve().parents[1]
        from scripts.gen_eating_sequence_fixtures import expand_findings_payload
        cls.fixture = expand_findings_payload(json.loads((
            cls.root / "mockups/eating-sequence-findings.synthetic/payload.json"
        ).read_text()))

    def test_dedicated_payload_is_deterministic_public_producer_output(self):
        from scripts.gen_eating_sequence_fixtures import findings_payload
        self.assertEqual(self.fixture, findings_payload())
        self.assertLess((self.root / "mockups/eating-sequence-findings.synthetic/payload.json").stat().st_size, 1_000_000)
        self.assertIn("SYNTHETIC", self.fixture["_note"])

    def test_empty_and_covered_cases_keep_sequence_counts_outside_the_meal_rate(self):
        for lever, denominator in (("high_carb_sequence", 40), ("repeat_eating", 16)):
            for name in ("covered", "empty"):
                window = self.fixture["states"][f"{lever}_{name}"]["windows"]["global"]
                prepared = window["preparation"]
                cause = next(r for r in prepared["rendered_rows"] if r["lever"] == lever)
                parent = next(r for r in prepared["rendered_rows"] if r["id"] == cause["claimed_by"])
                case = window["cases"][cause["id"]]["event"]
                self.assertEqual(case["summary"], {"claimed": 8, "denominator": denominator, "noun": "sequences"})
                self.assertEqual(case["projection"]["report"], prepared["eating_sequence_report"])
                self.assertEqual(case["analysis_generation"], prepared["findings"]["analysis_generation"])
                self.assertNotIn(f"habit:{lever}", parent["pattern"]["rate_levers"])
                meals = window["cases"][parent["id"]]["event"]
                self.assertEqual(meals["summary"]["claimed"], parent["pattern"]["k"])
                self.assertEqual(meals["summary"]["denominator"], parent["pattern"]["n"])
                associations = [r for r in meals["occurrences"] if f"habit:{lever}" in r.get("member_associations", [])]
                self.assertEqual(bool(associations), name == "covered")

    def test_both_habits_win_and_thin_or_losing_states_never_fabricate_a_finding(self):
        both = self.fixture["states"]["both_covered"]["windows"]["global"]["preparation"]["rendered_rows"]
        self.assertEqual([r["id"] for r in both if r.get("claimed_by") == "pattern:highs_after_meals"],
                         ["finding:repeat_eating", "finding:high_carb_sequence"])
        for lever in ("high_carb_sequence", "repeat_eating"):
            for name in ("thin_candidate", "thin_reference", "losing"):
                state = self.fixture["states"][f"{lever}_{name}"]
                rows = state["windows"]["global"]["preparation"]["rendered_rows"]
                self.assertNotIn(f"finding:{lever}", {r["id"] for r in rows})
            source = self.fixture["states"][f"{lever}_multiple"]
            case = source["windows"]["global"]["cases"][f"finding:{lever}"]["event"]
            self.assertGreater(sum(len(r["episodes"]) for r in case["occurrences"] if r["attributed"]), 8)
            self.assertEqual(case["summary"]["claimed"], 8)

    def test_sequence_cases_retain_one_real_fired_selection(self):
        for state in self.fixture["states"].values():
            for window in state["windows"].values():
                for stored in window["cases"].values():
                    event = stored["event"]
                    if event["family"] != "sequences":
                        continue
                    self.assertEqual(len(stored["selections"]), 1)
                    selected_id = next(iter(stored["selections"]))
                    selected = next(row for row in event["occurrences"] if row["id"] == selected_id)
                    self.assertEqual(selected["verdict"], "fired")

    def test_high_carb_in_sequence_response_is_producer_derived(self):
        case = self.fixture["states"]["high_carb_sequence_in_sequence"]["windows"]["global"]["cases"][
            "finding:high_carb_sequence"]["event"]
        self.assertEqual(case["projection"]["response"]["period"], "in_sequence")
        self.assertEqual(case["projection"]["response"]["window_min"], [0, 5])
