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
from ciq_autotune.analyzers.scenario.anchors import AnchorKind
from ciq_autotune.analyzers.scenario.levers import Lever
from ciq_autotune.analyzers.scenario.model_view import _KIND_LABEL
from ciq_autotune.analyzers.scenario_config import ScenarioConfig
from ciq_autotune.explore_exposures import _FAMILY_FOR_KIND

ROOT = Path(__file__).resolve().parent.parent
PAYLOAD = ROOT / "mockups/diagnose-workstation.synthetic/payload.json"
CAPTURE = ROOT / "mockups/diagnose-event-comparison.synthetic/capture.json"

# The classifiers the attribution step judges at each anchor kind
# (ciq_autotune/analyzers/scenario/attribute.py): `_meal_lever` at a meal, `_low_lever`
# at a low, `_high_lever` at a high, and Correction stacking alone at a correction
# cluster's stacking dose or last correction. At each of these kinds every judged
# classifier is a lever that kind can drive, so a claim by any other lever is a claim
# the producer never serves.
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
                if verdict["silence_reason"] is not None:
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
                if verdict["silence_reason"] is not None:
                    self.assertIn(verdict["silence_reason"], silences, (family, row["id"]))


if __name__ == "__main__":
    unittest.main()
