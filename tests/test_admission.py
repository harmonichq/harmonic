"""Admission bar tests exercise real I:C block output, not copied eligibility flags."""

import unittest
from dataclasses import replace

from ciq_autotune.admission import run_synthetic_bar
from ciq_autotune.analyze import analyze
from ciq_autotune.analyzers.ic import analyze_ic_blocks
from ciq_autotune.store import Store
from scripts.gen_estimator_truth import known_ratio_sets, placebo_sets, write_set_to_store


class AdmissionBarTest(unittest.TestCase):
    def test_incumbent_recovers_gated_truths_and_cleanly_passes_placebos(self):
        report = run_synthetic_bar(analyze_ic_blocks)
        self.assertTrue(report["recovery_passed"])
        self.assertTrue(report["placebo_passed"])
        for row in report["placebo"]:
            self.assertEqual("clean", row["verdict"])
            for block in row["blocks"]:
                self.assertEqual("numeric", block["evidence"]["state"])
                self.assertTrue(block["evidence"]["runs_floor_met"])

    def test_numeric_excluding_stub_fails_placebo_bar(self):
        def broken(*args, **kwargs):
            blocks, runs = analyze_ic_blocks(*args, **kwargs)
            return [replace(block, evidence={**block.evidence, "eligibility": {
                **block.evidence["eligibility"], "band_excludes_programmed": True,
            }}, asserts_move=True) for block in blocks], runs

        report = run_synthetic_bar(broken)
        self.assertFalse(report["placebo_passed"])
        self.assertTrue(all(row["verdict"] == "finding" for row in report["placebo"]))

    def test_non_numeric_placebo_is_vacuous_not_clean(self):
        def collecting(*args, **kwargs):
            blocks, runs = analyze_ic_blocks(*args, **kwargs)
            return [replace(block, state="collecting") for block in blocks], runs

        report = run_synthetic_bar(collecting)
        self.assertFalse(report["placebo_passed"])
        self.assertTrue(all(row["verdict"] == "vacuous" for row in report["placebo"]))

    def test_store_round_trip_preserves_block_equivalence(self):
        truth_set = placebo_sets()[0]
        direct, _ = analyze_ic_blocks(
            truth_set["events"], truth_set["segments"],
            cgm_readings=truth_set["cgm_readings"],
            isf_effective=truth_set["isf_effective"], observed_days=truth_set["observed_days"],
            analysis_start=truth_set["analysis_start"], analysis_end=truth_set["analysis_end"],
            prior_action_observed_from=truth_set["analysis_start"],
            snapshots=truth_set["snapshots"], history_catalog=[],
        )
        with Store.open(":memory:") as store:
            write_set_to_store(store, truth_set)
            stored = analyze(store, now=truth_set["analysis_end"]).ic_blocks
        self.assertEqual(len(direct), len(stored))
        for expected, actual in zip(direct, stored):
            self.assertEqual(expected.state, actual.state)
            self.assertEqual(expected.estimate, actual.estimate)
            self.assertEqual(expected.evidence["eligibility"], actual.evidence["eligibility"])


if __name__ == "__main__":
    unittest.main()
