"""Stable-era replay admission tests built through the synthetic store writer."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from ciq_autotune.analyzers.ic import analyze_ic_blocks
from ciq_autotune.replay import ReplayWindow, WindowRefused, run_replay
from ciq_autotune.settings import Snapshot
from ciq_autotune.store import Store
from scripts.gen_estimator_truth import known_ratio_sets, write_set_to_store


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
        return deepcopy(known_ratio_sets()[0])

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
