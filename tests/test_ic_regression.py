"""Cross-block I:C estimator contracts through production entry points."""

from copy import deepcopy
from dataclasses import replace
from datetime import timedelta
import unittest

from ciq_autotune.admission import run_synthetic_bar
from ciq_autotune.analyze import analyze
from ciq_autotune.analyzers.ic import analyze_ic_blocks
from ciq_autotune.analyzers.ic_regression import analyze_ic_blocks_fuzzy
from ciq_autotune.settings import Snapshot
from ciq_autotune.store import Store
from scripts.gen_estimator_truth import (
    chained_run_sets,
    known_ratio_sets,
    placebo_sets,
    write_set_to_store,
)
from scripts.run_estimator_admission import run_bar


class IncumbentEligibilityEvidenceTest(unittest.TestCase):
    def test_fit_meals_counts_only_meals_consumed_by_the_numeric_estimate(self):
        truth = known_ratio_sets()[0]
        report = run_synthetic_bar(
            analyze_ic_blocks,
            known_sets=[truth],
            placebo_sets=[placebo_sets()[0]],
        )

        self.assertTrue(report["recovery_passed"])
        blocks, _ = analyze_ic_blocks(
            truth["events"], truth["segments"],
            cgm_readings=truth["cgm_readings"],
            isf_effective=truth["isf_effective"],
            observed_days=truth["observed_days"],
            analysis_start=truth["analysis_start"],
            analysis_end=truth["analysis_end"],
            prior_action_observed_from=truth["prior_action_observed_from"],
            snapshots=truth["snapshots"],
            history_catalog=[],
        )
        self.assertEqual(
            blocks[0].n_runs,
            blocks[0].evidence["eligibility"]["fit_meals"],
        )


class FuzzyAdmissionTest(unittest.TestCase):
    def _blocks(self, estimator, truth, **overrides):
        kwargs = {
            "cgm_readings": truth["cgm_readings"],
            "isf_effective": truth["isf_effective"],
            "observed_days": truth["observed_days"],
            "analysis_start": truth["analysis_start"],
            "analysis_end": truth["analysis_end"],
            "prior_action_observed_from": truth["prior_action_observed_from"],
            "snapshots": truth["snapshots"],
            "history_catalog": [],
        }
        kwargs.update(overrides)
        return estimator(truth["events"], truth["segments"], **kwargs)[0]

    def test_candidate_recovers_gated_truths_and_cleanly_passes_placebos(self):
        report = run_synthetic_bar(
            analyze_ic_blocks_fuzzy,
            known_sets=known_ratio_sets() + chained_run_sets(),
            placebo_sets=placebo_sets(),
        )

        self.assertTrue(report["recovery_passed"], report)
        self.assertTrue(report["placebo_passed"], report)
        chained = next(row for row in report["known"] if "chained" in row["name"])
        self.assertEqual("recovered", chained["verdict"])

    def test_fractional_ownership_clears_the_floor_but_not_the_other_gates(self):
        truth = chained_run_sets()[0]
        blocks = self._blocks(analyze_ic_blocks_fuzzy, truth, observed_days=89)

        for block in blocks:
            eligibility = block.evidence["eligibility"]
            self.assertEqual(2, eligibility["whole_runs"])
            self.assertAlmostEqual(8.0, eligibility["fractional_run_ownership"])
            self.assertAlmostEqual(10.0, eligibility["effective_run_count"])
            self.assertEqual(10, block.n_runs)
            self.assertTrue(eligibility["runs_floor_met"])
            self.assertEqual("collecting", block.state)
            self.assertFalse(block.asserts_move)

    def test_snapshot_regime_change_excludes_the_same_lone_run(self):
        truth = deepcopy(known_ratio_sets()[0])
        event = next(row for row in truth["events"] if row.t >= truth["analysis_start"])
        profile = truth["settings"].active()
        changed_segments = tuple(replace(segment, carb_ratio=7.0)
                                 for segment in profile.segments)
        changed = replace(
            truth["settings"],
            profiles=(replace(profile, segments=changed_segments),),
        )
        truth["snapshots"].extend((
            Snapshot(event.t + timedelta(hours=1), changed),
            Snapshot(event.t + timedelta(hours=6), truth["settings"]),
        ))

        incumbent = self._blocks(analyze_ic_blocks, truth)[0]
        candidate = self._blocks(analyze_ic_blocks_fuzzy, truth)[0]
        self.assertEqual(incumbent.n_runs, candidate.n_runs)
        self.assertEqual(
            incumbent.evidence["eligibility"]["fit_meals"],
            candidate.evidence["eligibility"]["fit_meals"],
        )
        self.assertEqual(23, candidate.n_runs)

    def test_one_mismatched_member_excludes_the_whole_chained_run(self):
        truth = deepcopy(chained_run_sets()[0])
        current = [event for event in truth["events"]
                   if event.t >= truth["analysis_start"]]
        chained_day = next(
            day for day in {event.t.date() for event in current}
            if sum(event.t.date() == day for event in current) == 2
        )
        truth["events"] = [
            replace(event, carb_ratio=event.carb_ratio + 1.0)
            if event.t.date() == chained_day and event.t.hour == 13
            else event
            for event in truth["events"]
        ]

        blocks = self._blocks(analyze_ic_blocks_fuzzy, truth)
        self.assertTrue(all(
            block.evidence["eligibility"]["fit_meals"] == 34 for block in blocks
        ))

    def test_singular_chained_fit_preserves_ownership_but_is_not_numeric(self):
        truth = deepcopy(chained_run_sets()[0])
        current = [event for event in truth["events"]
                   if event.t >= truth["analysis_start"]]
        chained_days = {
            day for day in {event.t.date() for event in current}
            if sum(event.t.date() == day for event in current) == 2
        }
        truth["events"] = [
            replace(event, carbs=50.0, insulin=round(50.0 / event.carb_ratio, 4))
            if event.t.date() in chained_days
            else event
            for event in truth["events"]
            if event.t < truth["analysis_start"] or event.t.date() in chained_days
        ]

        blocks = self._blocks(analyze_ic_blocks_fuzzy, truth)
        for block in blocks:
            eligibility = block.evidence["eligibility"]
            self.assertEqual(8, block.n_runs)
            self.assertAlmostEqual(8.0, eligibility["effective_run_count"])
            self.assertTrue(eligibility["runs_floor_met"])
            self.assertIsNone(block.estimate.value)
            self.assertNotEqual("numeric", block.state)
            self.assertFalse(block.asserts_move)
            self.assertEqual(0, eligibility["fit_meals"])

    def test_named_runner_keeps_chained_truth_exploratory_for_incumbent(self):
        incumbent = run_bar("incumbent")
        candidate = run_bar("candidate")
        self.assertEqual(2, incumbent["counts"]["gated_known"])
        self.assertEqual(3, candidate["counts"]["gated_known"])
        self.assertTrue(incumbent["recovery_passed"])
        self.assertTrue(candidate["recovery_passed"])


if __name__ == "__main__":
    unittest.main()


class ShippedEstimatorTest(unittest.TestCase):
    """The default `analyze` path is the fuzzy estimator (ADR 117)."""

    def _blocks(self, **kwargs):
        truth_set = chained_run_sets()[0]
        with Store.open(":memory:") as store:
            write_set_to_store(store, truth_set)
            result = analyze(store, now=truth_set["analysis_end"], **kwargs)
        return {block.block_id: block for block in result.ic_blocks}

    def test_chained_evidence_reaches_the_floor_on_the_shipped_path(self):
        # Two lone runs per block, the rest chained across the boundary: the whole-run
        # incumbent sees the lone pair only, the shipped estimator credits both.
        incumbent = self._blocks(ic_estimator=analyze_ic_blocks)
        shipped = self._blocks()
        for block_id in (0, 720):
            with self.subTest(block=block_id):
                incumbent_eligibility = incumbent[block_id].evidence["eligibility"]
                shipped_eligibility = shipped[block_id].evidence["eligibility"]
                self.assertFalse(incumbent_eligibility["runs_floor_met"])
                self.assertTrue(shipped_eligibility["runs_floor_met"])
                self.assertEqual(shipped[block_id].state, "numeric")
                self.assertGreater(
                    shipped_eligibility["fit_meals"], incumbent_eligibility["fit_meals"])
