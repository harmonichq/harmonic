"""Manufactured browser-gate rows carry only shapes their producer can serve (ADR 454).

The Diagnose workstation fixture generator manufactures the exposure Occurrences the
browser gates read, and the event-comparison capture judges its comparison rows.
Each committed row is read here against the real producer's own vocabulary: the
anchor kind and label the episode view serves for its family, the classifiers the
attribution step judges at that anchor kind, the closed silence-reason set, and the
high-anchor threshold.
"""
import json
import unittest
from pathlib import Path

from ciq_autotune.analyzers.classifiers.evidence import SilenceReason
from ciq_autotune.analyzers.ic import POOL_REASONS, POOLED_REASONS
from ciq_autotune.analyzers.scenario.anchors import AnchorKind
from ciq_autotune.analyzers.scenario.levers import Lever
from ciq_autotune.analyzers.scenario.model_view import _KIND_LABEL
from ciq_autotune.analyzers.scenario_config import ScenarioConfig
from ciq_autotune.explore_exposures import _FAMILY_FOR_KIND
from ciq_autotune.ic_block_evidence import SCHEMA

ROOT = Path(__file__).resolve().parent.parent
PAYLOAD = ROOT / "mockups/diagnose-workstation.synthetic/payload.json"
CAPTURE = ROOT / "mockups/diagnose-event-comparison.synthetic/capture.json"
BLOCK_EVIDENCE = (
    ROOT / "mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json")

# The classifiers the attribution step judges at each anchor kind
# (ciq_autotune/analyzers/scenario/attribute.py): `_meal_lever` at a meal, `_low_lever`
# at a low, `_high_lever` at a high, and Correction stacking alone at a correction
# cluster's stacking dose or last correction. At each of these kinds every judged
# classifier is a lever that kind can drive, so a claim by any other lever is a claim
# the producer never serves, except a rebound High, which Over-treated low claims; the
# fixture manufactures none.
JUDGED = {
    "meal": {"carb_undercount", "late_bolus", "meal_over_delivery"},
    "low": {"over_treated_low", "correction_on_iob"},
    "high": {"missed_meal", "meal_bolus_short"},
    "correction": {"correction_stacking"},
}
KIND_FOR_FAMILY = {family: kind for kind, family in _FAMILY_FOR_KIND.items()}


def _exposure_rows():
    exposures = json.loads(PAYLOAD.read_text())["exposures"]["exposures"]
    return [(family, row) for family, body in exposures.items() for row in body["occurrences"]]


def _comparison_rows():
    views = json.loads(CAPTURE.read_text())["views"]
    return [(family, view, row) for family, view in views.items() for row in view["occurrences"]]


class ManufacturedExposureRowsTest(unittest.TestCase):
    def setUp(self):
        self.rows = _exposure_rows()
        self.assertEqual({family for family, _ in self.rows}, set(KIND_FOR_FAMILY))
        self.assertTrue(any(row["attributed"] for _, row in self.rows))
        self.assertTrue(any(not row["attributed"] for _, row in self.rows))

    def test_every_row_serves_its_familys_anchor_kind_and_label(self):
        for family, row in self.rows:
            kind = KIND_FOR_FAMILY[family]
            self.assertEqual((row["kind"], row["label"]), (kind, _KIND_LABEL[AnchorKind(kind)]),
                             (family, row["t"]))

    def test_every_row_judges_exactly_its_anchor_kinds_classifiers(self):
        for family, row in self.rows:
            judged = [verdict["classifier"] for verdict in row["verdicts"]]
            self.assertEqual(len(judged), len(set(judged)), (family, row["t"]))
            self.assertEqual(set(judged), JUDGED[KIND_FOR_FAMILY[family]], (family, row["t"]))

    def test_every_classifier_and_silence_reason_is_in_its_closed_set(self):
        levers = {lever.value for lever in Lever}
        silences = {reason.value for reason in SilenceReason}
        for family, row in self.rows:
            for verdict in row["verdicts"]:
                self.assertIn(verdict["classifier"], levers, (family, row["t"]))
                # A matched verdict carries no silence reason (`attribute._mv`).
                if verdict["matched"]:
                    self.assertIsNone(verdict["silence_reason"], (family, row["t"]))
                elif verdict["silence_reason"] is not None:
                    self.assertIn(verdict["silence_reason"], silences, (family, row["t"]))

    def test_a_claimed_row_reads_its_own_levers_matched_sentence_as_its_text(self):
        for family, row in self.rows:
            if not row["attributed"]:
                continue
            lever = row["cause_lever"]
            self.assertIn(lever, JUDGED[KIND_FOR_FAMILY[family]], (family, row["t"]))
            [own] = [verdict for verdict in row["verdicts"] if verdict["classifier"] == lever]
            self.assertTrue(own["matched"], (family, row["t"]))
            self.assertTrue(row["text"], (family, row["t"]))
            self.assertEqual(own["detail"], row["text"], (family, row["t"]))
            self.assertEqual([verdict["classifier"] for verdict in row["verdicts"]
                              if verdict["matched"]], [lever], (family, row["t"]))

    def test_an_unclaimed_row_matches_nothing_and_tells_no_cause(self):
        for family, row in self.rows:
            if row["attributed"]:
                continue
            self.assertEqual((row["cause_lever"], row["text"]), (None, ""), (family, row["t"]))
            self.assertFalse(any(verdict["matched"] for verdict in row["verdicts"]),
                             (family, row["t"]))

    def test_a_high_reaches_the_high_anchor_threshold(self):
        highs = [row for family, row in self.rows if family == "highs"]
        self.assertTrue(highs)
        for row in highs:
            self.assertGreaterEqual(row["bg"], ScenarioConfig().anchor_high_mgdl, row["t"])


class IcBlockEvidenceRowsTest(unittest.TestCase):
    """The committed block-evidence capture speaks only its producers' vocabulary.

    The generator runs the real estimator and the real projection, so this reads the
    capture back against the closed sets those producers own — a hand-edited case, or
    one generated before a set moved, fails here rather than in a browser.
    """

    def setUp(self):
        self.cases = json.loads(BLOCK_EVIDENCE.read_text())["cases"]
        # `frontend/desk.browser.test.mjs` serves this case as the endpoint.
        self.assertIn("cross_midnight", self.cases)

    def test_every_case_carries_the_v2_payload(self):
        for name, case in self.cases.items():
            self.assertEqual(SCHEMA, case["schema"], name)
            self.assertEqual(
                {"schema", "analysis_generation", "block", "ledger", "outcomes",
                 "harm_evidence", "meal_comparison", "runs", "series"},
                set(case), name)
            self.assertEqual({"value", "lo", "hi", "wide"},
                             set(case["block"]["estimate"]), name)
            self.assertEqual({"side_k", "side_n"}, set(case["block"]["side"]), name)
            self.assertEqual({"whole_runs", "fractional_run_ownership",
                              "effective_run_count"},
                             set(case["block"]["support_detail"]), name)

    def test_every_run_row_names_a_reason_from_the_analyzers_closed_set(self):
        for name, case in self.cases.items():
            for run in case["runs"]:
                self.assertIn(run["pool_reason"], POOL_REASONS, (name, run["run_id"]))
                self.assertEqual(run["pool_reason"] in POOLED_REASONS, run["in_pool"],
                                 (name, run["run_id"]))
                self.assertIn(run["side"], (-1, 0, 1), (name, run["run_id"]))

    def test_the_ledger_quotient_is_the_served_terms_own_arithmetic(self):
        for name, case in self.cases.items():
            ledger = case["ledger"]
            if ledger["effective_insulin"] <= 0:
                self.assertIsNone(ledger["pooled_ratio"], name)
                continue
            self.assertAlmostEqual(
                ledger["carbs_covered"] / ledger["effective_insulin"],
                ledger["pooled_ratio"], places=4, msg=name)

    def test_every_comparison_cohort_is_one_served_outcome(self):
        for name, case in self.cases.items():
            projection = case["meal_comparison"]
            self.assertEqual("diagnose-carb-ratio-meal-comparison-v1",
                             projection["schema"], name)
            self.assertEqual([-10, 315], projection["window_min"], name)
            self.assertEqual(["ran-high", "ran-low", "in-range"],
                             [cohort["key"] for cohort in projection["cohorts"]], name)
            counts = case["outcomes"]["counts"]
            routed = {cohort["key"]: cohort["routed_count"]
                      for cohort in projection["cohorts"]}
            # Every meal that is not `unread` is traced exactly once.
            self.assertEqual(
                {"ran-high": counts["ran_high"], "ran-low": counts["ran_low"],
                 "in-range": counts["in_range"]}, routed, name)
            for cohort in projection["cohorts"]:
                self.assertEqual(projection["anchor"], cohort["anchor"], name)
                for point in cohort["points"]:
                    self.assertEqual({"minute", "n", "support", "median", "p25", "p75"},
                                     set(point), name)

    def test_the_published_case_exercises_every_fact_the_panel_reads(self):
        case = self.cases["explained"]

        self.assertEqual(
            {"counted-whole", "counted-by-share", "earlier-ratio-or-uncurrent-chain",
             "no-outcome-read"},
            {run["pool_reason"] for run in case["runs"]})
        self.assertGreaterEqual(case["outcomes"]["counts"]["ran_high"], 1)
        self.assertGreaterEqual(case["outcomes"]["counts"]["ran_low"], 1)
        self.assertEqual(2, case["harm_evidence"]["row_days"])
        self.assertEqual(2, len(case["harm_evidence"]["lows"]))
        self.assertIsNotNone(case["harm_evidence"]["minutes_after_bolus_median"])
        self.assertGreater(case["block"]["support_detail"]["fractional_run_ownership"],
                           0.0)


class ComparisonRowsTest(unittest.TestCase):
    def test_every_comparison_row_judges_only_its_anchor_kinds_classifiers(self):
        rows = _comparison_rows()
        self.assertEqual({family for family, _, _ in rows}, {"meals", "lows"})
        silences = {reason.value for reason in SilenceReason}
        for family, view, row in rows:
            judged = JUDGED[KIND_FOR_FAMILY[family]]
            self.assertEqual(set(view["factors"]), judged, family)
            self.assertEqual({verdict["classifier"] for verdict in row["verdicts"]}, judged,
                             (family, row["id"]))
            for verdict in row["verdicts"]:
                # A matched verdict carries no silence reason (`attribute._mv`).
                if verdict["matched"]:
                    self.assertIsNone(verdict["silence_reason"], (family, row["id"]))
                elif verdict["silence_reason"] is not None:
                    self.assertIn(verdict["silence_reason"], silences, (family, row["id"]))


if __name__ == "__main__":
    unittest.main()
