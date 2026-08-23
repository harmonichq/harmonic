"""Admission bar tests exercise real I:C block output, not copied eligibility flags."""

import unittest
from dataclasses import replace

from ciq_autotune.admission import run_synthetic_bar
from ciq_autotune.analyze import analyze
from ciq_autotune.analyzers.ic import analyze_ic_blocks
from ciq_autotune.store import Store
from scripts.gen_estimator_truth import known_ratio_sets, placebo_sets, write_set_to_store


class AdmissionBarTest(unittest.TestCase):
    def run_bar(self, estimator, *, known=None, placebo=None):
        return run_synthetic_bar(
            estimator,
            known_sets=known_ratio_sets() if known is None else known,
            placebo_sets=placebo_sets() if placebo is None else placebo,
        )

    def test_incumbent_recovers_gated_truths_and_cleanly_passes_placebos(self):
        report = self.run_bar(analyze_ic_blocks)
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

        report = self.run_bar(broken)
        self.assertFalse(report["placebo_passed"])
        self.assertTrue(all(row["verdict"] == "finding" for row in report["placebo"]))

    def test_non_numeric_placebo_is_vacuous_not_clean(self):
        def collecting(*args, **kwargs):
            blocks, runs = analyze_ic_blocks(*args, **kwargs)
            return [replace(block, state="collecting") for block in blocks], runs

        report = self.run_bar(collecting)
        self.assertFalse(report["placebo_passed"])
        self.assertTrue(all(row["verdict"] == "vacuous" for row in report["placebo"]))

    def test_stamped_band_is_a_finding_below_the_runs_floor(self):
        def broken(*args, **kwargs):
            blocks, runs = analyze_ic_blocks(*args, **kwargs)
            return [replace(block, evidence={**block.evidence, "eligibility": {
                **block.evidence["eligibility"], "runs_floor_met": False,
                "band_excludes_programmed": True,
            }}) for block in blocks], runs

        report = self.run_bar(broken, placebo=[placebo_sets()[0]])
        self.assertEqual("finding", report["placebo"][0]["verdict"])

    def test_asserting_non_numeric_block_is_a_placebo_finding(self):
        def broken(*args, **kwargs):
            blocks, runs = analyze_ic_blocks(*args, **kwargs)
            return [replace(block, state="collecting", asserts_move=True) for block in blocks], runs

        report = self.run_bar(broken, placebo=[placebo_sets()[0]])
        self.assertEqual("finding", report["placebo"][0]["verdict"])

    def test_finding_outranks_a_non_scoreable_block(self):
        def broken(*args, **kwargs):
            blocks, runs = analyze_ic_blocks(*args, **kwargs)
            finding = replace(blocks[0], evidence={**blocks[0].evidence, "eligibility": {
                **blocks[0].evidence["eligibility"], "band_excludes_programmed": True,
            }})
            vacuous = replace(blocks[0], state="collecting", asserts_move=False,
                              evidence={**blocks[0].evidence, "eligibility": {
                                  **blocks[0].evidence["eligibility"],
                                  "runs_floor_met": False,
                                  "band_excludes_programmed": False,
                              }})
            return [finding, vacuous], runs

        report = self.run_bar(broken, placebo=[placebo_sets()[0]])
        self.assertEqual("finding", report["placebo"][0]["verdict"])

    def test_empty_inventories_fail_the_bar(self):
        report = self.run_bar(analyze_ic_blocks, known=[], placebo=[])
        self.assertFalse(report["recovery_passed"])
        self.assertFalse(report["placebo_passed"])

    def test_estimator_that_skips_history_population_fails_loudly(self):
        def broken(*args, **kwargs):
            kwargs["history_catalog"] = None
            return analyze_ic_blocks(*args, **kwargs)

        with self.assertRaises(ValueError):
            self.run_bar(broken)

    def test_estimator_with_bogus_run_count_fails_loudly(self):
        def broken(*args, **kwargs):
            blocks, _runs = analyze_ic_blocks(*args, **kwargs)
            return blocks, 0

        with self.assertRaises(ValueError):
            self.run_bar(broken)

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
