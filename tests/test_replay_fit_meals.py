"""Replay compares meals consumed by an estimate, not block coverage."""

from copy import deepcopy
from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from ciq_autotune.analyzers.ic import analyze_ic_blocks
from ciq_autotune.replay import ReplayWindow, run_replay
from ciq_autotune.settings import Snapshot
from ciq_autotune.store import Store
from scripts.gen_estimator_truth import known_ratio_sets, write_set_to_store


class ReplayFitMealsTest(unittest.TestCase):
    def _report(self, estimator=analyze_ic_blocks):
        truth = deepcopy(known_ratio_sets()[0])
        truth["snapshots"].append(Snapshot(truth["analysis_end"], truth["settings"]))
        with TemporaryDirectory() as directory:
            store = Store.open(str(Path(directory) / "synthetic.sqlite"))
            self.addCleanup(store.close)
            write_set_to_store(store, truth)
            return run_replay(
                store,
                estimator,
                block_id=0,
                window=ReplayWindow(truth["analysis_start"], truth["analysis_end"]),
            )

    def test_incumbent_self_replay_passes_with_equal_fit_meals(self):
        report = self._report()
        self.assertEqual("pass", report.candidate_verdict)
        self.assertEqual(report.incumbent_final_meals, report.candidate_final_meals)
        self.assertEqual(0, report.meal_count_delta)

    def test_equal_candidate_fails_even_when_it_inflates_coverage(self):
        def equal_with_more_coverage(*args, **kwargs):
            blocks, run_count = analyze_ic_blocks(*args, **kwargs)
            return [replace(block, n_meals=block.n_meals + 100) for block in blocks], run_count

        report = self._report(equal_with_more_coverage)
        self.assertEqual("fail", report.candidate_verdict)
        self.assertEqual(report.incumbent_final_meals, report.candidate_final_meals)
        self.assertEqual(0, report.meal_count_delta)

    def test_malformed_candidate_fit_meals_fails_without_crashing_replay(self):
        def malformed_fit_meals(*args, **kwargs):
            blocks, run_count = analyze_ic_blocks(*args, **kwargs)
            return [replace(
                block,
                evidence={
                    **block.evidence,
                    "eligibility": {
                        **block.evidence["eligibility"],
                        "fit_meals": "unknown",
                    },
                },
            ) for block in blocks], run_count

        report = self._report(malformed_fit_meals)
        self.assertEqual("fail", report.candidate_verdict)
        self.assertEqual(0, report.candidate_final_meals)


if __name__ == "__main__":
    unittest.main()
