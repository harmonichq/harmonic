"""Private generated eating-sequence capture parity and browser transport tests."""

import json
from pathlib import Path
import unittest

from ciq_autotune.analyzers.eating_sequence_config import EatingSequenceConfig


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

    def test_sequence_cases_retain_every_public_roster_selection(self):
        for state in self.fixture["states"].values():
            for window in state["windows"].values():
                for stored in window["cases"].values():
                    event = stored["event"]
                    if event["family"] != "sequences":
                        continue
                    roster = {row["id"] for row in event["occurrences"]}
                    self.assertEqual(set(stored["selections"]), roster)

    def test_high_carb_in_sequence_response_is_producer_derived(self):
        from scripts.gen_eating_sequence_fixtures import products
        case = self.fixture["states"]["high_carb_sequence_in_sequence"]["windows"]["global"]["cases"][
            "finding:high_carb_sequence"]["event"]
        self.assertEqual(case["projection"]["response"]["period"], "in_sequence")
        self.assertEqual(case["projection"]["response"]["window_min"], [0, 5])
        _, (bolus, _, _, _) = products("high_carb_sequence", during=True, varied_duration=True)
        from ciq_autotune.analyzers.eating_sequences import build_sequences
        varied = build_sequences(bolus, config=EatingSequenceConfig())
        durations = {
            sequence.end - sequence.start
            for sequence in varied
        }
        self.assertGreater(len(durations), 1)

    def test_high_carb_selections_equal_the_public_producer(self):
        from scripts.gen_eating_sequence_fixtures import products
        from ciq_autotune import finding_case_file
        from ciq_autotune.store import Store
        from ciq_autotune.window_membership import WindowQuery
        from tests.test_findings_projection import seed_sequence_store
        projection, (bolus, cgm, log, _) = products("high_carb_sequence")
        stored = self.fixture["states"]["high_carb_sequence_empty"]["windows"]["global"]["cases"][
            "finding:high_carb_sequence"]
        with Store.open(":memory:") as store:
            seed_sequence_store(store, bolus, cgm, log)
            prepared = finding_case_file.prepare(
                store, query=WindowQuery.whole_day(), version=0,
                analysis=projection._analysis, exposures=projection._exposures,
                scenarios=projection._scenarios, analysis_generation="synthetic-342:0")
            roster = prepared.case("finding:high_carb_sequence", "event", None)["occurrences"]
            self.assertEqual(len(roster), 40)
            for row in roster:
                expected = prepared.case("finding:high_carb_sequence", "event", row["id"])["selection"]
                self.assertEqual(expected["state"], "selected")
                self.assertEqual(stored["selections"].get(row["id"]), expected, row["id"])

    def test_browser_expansion_equals_python_transport(self):
        import subprocess
        script = """
          import { readFileSync } from 'node:fs';
          import { expandSequenceFixture } from './frontend/eating-sequence-fixture.js';
          const payload = expandSequenceFixture(JSON.parse(readFileSync(
            'mockups/eating-sequence-findings.synthetic/payload.json', 'utf8')));
          delete payload.shared;
          process.stdout.write(JSON.stringify(payload));
        """
        result = subprocess.run(["node", "--input-type=module", "-e", script],
                                cwd=self.root, capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout), self.fixture)

    def test_limited_support_and_missing_points_keep_literal_observed_values(self):
        def response(name):
            return self.fixture["states"][f"high_carb_sequence_{name}"]["windows"]["global"][
                "cases"]["finding:high_carb_sequence"]["event"]["projection"]["response"]
        limited = response("limited")
        self.assertEqual(limited["window_min"], [-30, 5])
        self.assertEqual([[(p["minute"], p["median"], p["n"], p["support"]) for p in c["points"]]
                          for c in limited["cohorts"]], [
            [(minute, 190.0, 8, "supported") for minute in range(-30, 1, 5)],
            [(minute, 110.0, 12, "limited") for minute in range(-30, 0, 5)]
            + [(0, 110.0, 32, "supported")]])
        for cohort in response("null_period")["cohorts"]:
            self.assertEqual(cohort["points"][0], {
                "minute": 0, "median": None, "p25": None, "p75": None,
                "n": 0, "support": "withheld"})
            self.assertEqual(cohort["points"][1]["minute"], 5)
            self.assertEqual(cohort["points"][1]["median"], 110.0)

    def test_short_headlines_keep_the_full_comparison_in_the_case(self):
        for name, title in (("empty", "Glucose after high-carb eating"),
                            ("in_sequence", "Glucose during high-carb eating")):
            window = self.fixture["states"][f"high_carb_sequence_{name}"]["windows"]["global"]
            row = next(row for row in window["preparation"]["rendered_rows"]
                       if row["id"] == "finding:high_carb_sequence")
            response = window["cases"][row["id"]]["event"]["projection"]["response"]
            self.assertEqual(row["headline"], title)
            self.assertIn("%", response["summary"])
            self.assertIn("n = 8 vs 32", response["summary"])
            self.assertEqual(len(response["comparisons"]), 3)
