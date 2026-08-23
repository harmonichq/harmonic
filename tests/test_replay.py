"""Stable-era replay admission tests built through the synthetic store writer."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
from datetime import timedelta
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from ciq_autotune.analyzers.ic import analyze_ic_blocks
from ciq_autotune.replay import ReplayReport, ReplayWindow, WindowRefused, run_replay
from ciq_autotune.settings import Snapshot
from ciq_autotune.store import Store
from scripts.gen_estimator_truth import known_ratio_sets, write_set_to_store


def prints_analysis_data(*args, **kwargs):
    print(args[0])
    return analyze_ic_blocks(*args, **kwargs)


def raises_with_analysis_data(*_args, **_kwargs):
    raise RuntimeError("meal 60g at BG 110 with ratio 5.6")


def _settings_changed(settings, *, ratio=None, isf=None):
    profile = settings.active()
    segments = tuple(replace(
        segment,
        carb_ratio=segment.carb_ratio if ratio is None else ratio,
        isf=segment.isf if isf is None else isf,
    ) for segment in profile.segments)
    return replace(settings, profiles=(replace(profile, segments=segments),))


class StableEraReplayTest(unittest.TestCase):
    def _truth(self):
        truth = deepcopy(known_ratio_sets()[0])
        truth["snapshots"].append(Snapshot(truth["analysis_end"], truth["settings"]))
        return truth

    def _replay(self, truth, estimator=analyze_ic_blocks):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.sqlite"
            store = Store.open(str(path))
            self.addCleanup(store.close)
            write_set_to_store(store, truth)
            return run_replay(
                store, estimator, block_id=0,
                window=ReplayWindow(truth["analysis_start"], truth["analysis_end"]),
            )

    def test_incumbent_self_run_agrees_and_never_prints_clinical_rows(self):
        truth = self._truth()
        report = self._replay(truth)
        output = report.render()
        self.assertEqual(report.agreement_verdict, "pass")
        self.assertEqual(report.candidate_verdict, "pass")
        self.assertNotIn("5.0", output)    # estimated ratio
        self.assertNotIn("5.6", output)    # programmed ratio
        self.assertNotIn("60", output)     # meal carbohydrate amount
        self.assertNotIn("110", output)    # meal BG value
        self.assertNotIn("meal row", output)

    def test_mid_window_carb_ratio_reprogramming_is_refused(self):
        truth = self._truth()
        changed_at = truth["analysis_start"] + timedelta(days=7)
        truth["snapshots"].append(Snapshot(
            changed_at, _settings_changed(truth["settings"], ratio=4.0)))
        with self.assertRaisesRegex(WindowRefused, "carb-ratio schedule changed"):
            self._replay(truth)

    def test_first_snapshot_mid_window_without_a_baseline_is_refused(self):
        truth = self._truth()
        truth["snapshots"] = [Snapshot(
            truth["analysis_start"] + timedelta(days=30), truth["settings"])]
        with self.assertRaisesRegex(WindowRefused, "settings snapshot coverage"):
            self._replay(truth)

    def test_no_snapshots_is_refused(self):
        truth = self._truth()
        truth["snapshots"] = []
        with self.assertRaisesRegex(WindowRefused, "settings snapshot coverage"):
            self._replay(truth)

    def test_reverted_post_window_isf_change_is_refused(self):
        truth = self._truth()
        changed_at = truth["analysis_end"] + timedelta(days=1)
        truth["snapshots"].extend((
            Snapshot(changed_at, _settings_changed(truth["settings"], isf=40)),
            Snapshot(changed_at + timedelta(days=1), truth["settings"]),
        ))
        with self.assertRaisesRegex(WindowRefused, "ISF schedule changed"):
            self._replay(truth)

    def test_below_floor_final_pool_is_refused(self):
        truth = self._truth()
        # Keep the four pre-window history events plus seven in-window meal runs.
        truth["events"] = truth["events"][:11]
        with self.assertRaisesRegex(WindowRefused, "does not meet runs floor"):
            self._replay(truth)

    def test_always_finding_candidate_fails_the_convergence_verdict(self):
        def always_finding(*args, **kwargs):
            blocks, run_count = analyze_ic_blocks(*args, **kwargs)
            return [replace(
                block,
                estimate=replace(block.estimate, value=999.0, lo=998.0, hi=1000.0),
                state="numeric",
                asserts_move=True,
            ) for block in blocks], run_count

        report = self._replay(self._truth(), always_finding)
        self.assertEqual(report.candidate_verdict, "fail")
        self.assertIsNone(report.candidate_first_convergence)

    def test_candidate_that_leaves_convergence_for_a_wrong_final_answer_fails(self):
        truth = self._truth()

        def unstable(*args, **kwargs):
            blocks, run_count = analyze_ic_blocks(*args, **kwargs)
            if kwargs["analysis_end"] == truth["analysis_end"]:
                return [replace(
                    block,
                    estimate=replace(block.estimate, value=999.0, lo=999.0, hi=999.0),
                    n_meals=block.n_meals + 1,
                ) for block in blocks], run_count
            return blocks, run_count

        report = self._replay(truth, unstable)
        self.assertIsNotNone(report.candidate_first_convergence)
        self.assertEqual("fail", report.candidate_verdict)

    def test_replay_convergence_consumes_the_shared_recovery_pin(self):
        with patch("ciq_autotune.replay.recovers_target", return_value=False):
            report = self._replay(self._truth())
        self.assertEqual("fail", report.candidate_verdict)

    def test_replay_rejects_a_candidate_that_discards_history_catalog(self):
        def broken(*args, **kwargs):
            kwargs["history_catalog"] = None
            blocks, run_count = analyze_ic_blocks(*args, **kwargs)
            return [replace(block, n_meals=block.n_meals + 1) for block in blocks], run_count

        with self.assertRaisesRegex(ValueError, "history_catalog"):
            self._replay(self._truth(), broken)

    def test_default_report_representation_is_sanitized(self):
        report = ReplayReport(
            block_id=0,
            cutoffs=3,
            incumbent_first_convergence=self._truth()["analysis_start"],
            candidate_first_convergence=self._truth()["analysis_end"],
            incumbent_final_ci_width=9.87654,
            candidate_final_ci_width=8.76543,
            incumbent_final_runs=8,
            candidate_final_runs=9,
            incumbent_final_meals=8,
            candidate_final_meals=9,
            convergence_days_delta=7,
            ci_width_delta=-1.11111,
            meal_count_delta=1,
            agreement_verdict="pass",
            candidate_verdict="pass",
        )
        for output in (str(report), repr(report)):
            self.assertNotIn("9.87654", output)
            self.assertNotIn("8.76543", output)
            self.assertNotIn(self._truth()["analysis_start"].date().isoformat(), output)
            self.assertNotIn(self._truth()["analysis_end"].date().isoformat(), output)

    def test_candidate_output_is_suppressed(self):
        output = StringIO()
        with patch("sys.stdout", output):
            self._replay(self._truth(), prints_analysis_data)
        self.assertNotIn("BolusEvent", output.getvalue())

    def test_candidate_run_reports_incumbent_self_agreement(self):
        report = self._replay(self._truth(), prints_analysis_data)
        self.assertEqual(report.agreement_verdict, "pass")

    def test_cli_sanitizes_candidate_exception(self):
        from scripts import replay_stable_era

        truth = self._truth()
        with TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.sqlite"
            store = Store.open(str(path))
            write_set_to_store(store, truth)
            store.close()
            stderr = StringIO()
            with patch("sys.argv", [
                "replay_stable_era.py", str(path), "--block", "0",
                "--window-start", truth["analysis_start"].isoformat(),
                "--window-end", truth["analysis_end"].isoformat(),
                "--candidate", "tests.test_replay:raises_with_analysis_data",
            ]), patch("sys.stderr", stderr):
                self.assertEqual(replay_stable_era.main(), 1)
        self.assertIn("RuntimeError", stderr.getvalue())
        self.assertNotIn("60g", stderr.getvalue())
