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
from datetime import datetime, timedelta
from pathlib import Path

from ciq_autotune.analyzers.classifiers.evidence import SilenceReason
from ciq_autotune.analyzers.ic import POOL_REASONS, POOLED_REASONS, IcConfig
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
                 "meals", "harm_evidence", "runs", "series"},
                set(case), name)
            self.assertEqual({"value", "lo", "hi", "wide"},
                             set(case["block"]["estimate"]), name)
            self.assertEqual({"side_k", "side_n", "direction"},
                             set(case["block"]["side"]), name)
            self.assertIn(case["block"]["side"]["direction"], ("above", "below", None),
                          name)
            self.assertEqual({"whole_runs", "fractional_run_ownership",
                              "effective_run_count"},
                             set(case["block"]["support_detail"]), name)
            self.assertEqual({"arm", "gated", "nudged", "arm_days", "row_days", "lows",
                              "evaluated", "seriousness", "minutes_after_bolus_median",
                              "groups", "minutes_after_bolus_min",
                              "minutes_after_bolus_max", "bearing_sentence"},
                             set(case["harm_evidence"]), name)
            self.assertEqual(10.0, case["block"]["end_band_mgdl"], name)
            self.assertEqual("half-gap-capped-rounded",
                             case["block"]["recommendation"]["rule"], name)
            # A block that asserts no move serves no recommended value, rule sentence
            # or direction.
            if not case["block"]["asserts_move"]:
                self.assertEqual((None, None, None),
                                 (case["block"]["recommendation"]["value"],
                                  case["block"]["recommendation"]["sentence"],
                                  case["block"]["direction"]), name)
            else:
                self.assertIn(case["block"]["direction"], ("raise", "lower"), name)
            self.assertEqual({"counts", "band", "window_min"}, set(case["outcomes"]),
                             name)
            self.assertEqual(IcConfig().post_meal_min,
                             case["outcomes"]["window_min"], name)

    def test_every_run_row_names_a_reason_from_the_analyzers_closed_set(self):
        for name, case in self.cases.items():
            for run in case["runs"]:
                self.assertIn(run["pool_reason"], POOL_REASONS, (name, run["run_id"]))
                self.assertEqual(run["pool_reason"] in POOLED_REASONS, run["in_pool"],
                                 (name, run["run_id"]))
                self.assertIn(run["side"], (-1, 0, 1), (name, run["run_id"]))
                self.assertEqual(len(run["member_offsets_min"]),
                                 len(run["member_in_block"]), (name, run["run_id"]))
                self.assertTrue(all(isinstance(flag, bool)
                                    for flag in run["member_in_block"]),
                                (name, run["run_id"]))
                self.assertEqual(not run["member_in_block"][-1],
                                 run["ended_after_later_meal"], (name, run["run_id"]))
                self.assertEqual(run["in_pool"], run["fit_weight"] is not None,
                                 (name, run["run_id"]))
                self.assertAlmostEqual(
                    run["post_correction_user"] + run["post_correction_ciq"]
                    + run["post_correction_unknown"], run["post_correction_total"],
                    msg=(name, run["run_id"]))

    def test_every_run_end_is_its_travel_against_the_served_band(self):
        for name, case in self.cases.items():
            band = case["block"]["end_band_mgdl"]
            for run in case["runs"]:
                if run["outcome_bg"] is None or run["start_bg"] is None:
                    self.assertIsNone(run["end_class"], (name, run["run_id"]))
                    continue
                travelled = run["outcome_bg"] - run["start_bg"]
                self.assertEqual(
                    "lower" if travelled < -band else "higher" if travelled > band
                    else "flat", run["end_class"], (name, run["run_id"]))
            counted = [run for run in case["runs"] if run["in_pool"]]
            self.assertEqual(
                {"lower": sum(run["end_class"] == "lower" for run in counted),
                 "flat": sum(run["end_class"] == "flat" for run in counted),
                 "higher": sum(run["end_class"] == "higher" for run in counted),
                 "after_later_meal": sum(run["ended_after_later_meal"] for run in counted),
                 "n": len(counted)},
                case["block"]["run_ends"], name)

    def test_every_low_is_grouped_by_the_served_roster(self):
        for name, case in self.cases.items():
            harm = case["harm_evidence"]
            runs = {run["run_id"]: run for run in case["runs"]}
            for low in harm["lows"]:
                self.assertIn(low["group"], ("counted-run", "uncounted-run",
                                             "not-a-meal-run"), (name, low["t"]))
                self.assertEqual(low["dominant_bolus_carbs"], low["bolus_carbs"],
                                 (name, low["t"]))
                if low["run_id"] is None:
                    self.assertEqual("not-a-meal-run", low["group"], (name, low["t"]))
                    continue
                self.assertEqual(
                    "counted-run" if runs[low["run_id"]]["in_pool"] else "uncounted-run",
                    low["group"], (name, low["t"]))
            groups = [low["group"] for low in harm["lows"]]
            self.assertEqual(
                {"counted_run": groups.count("counted-run"),
                 "counted_runs_distinct": len({low["run_id"] for low in harm["lows"]
                                               if low["group"] == "counted-run"}),
                 "uncounted_run": groups.count("uncounted-run"),
                 "not_a_meal_run": groups.count("not-a-meal-run"),
                 "total": len(harm["lows"])},
                harm["groups"], name)

    def test_the_ledger_quotient_is_the_served_terms_own_arithmetic(self):
        for name, case in self.cases.items():
            ledger = case["ledger"]
            if ledger["effective_insulin"] <= 0:
                self.assertIsNone(ledger["pooled_ratio"], name)
                continue
            self.assertAlmostEqual(
                ledger["carbs_covered"] / ledger["effective_insulin"],
                ledger["pooled_ratio"], places=4, msg=name)

    def test_every_meal_outcome_is_its_own_peak_and_nadir_against_the_band(self):
        for name, case in self.cases.items():
            band = case["outcomes"]["band"]
            self.assertEqual({"low", "high"}, set(band), name)
            for meal in case["meals"]:
                self.assertEqual({"t", "run_id", "offset_min", "peak_bg", "peak_min",
                                  "nadir_bg", "nadir_min", "outcome", "next_bolus_min",
                                  "peak_before_next_bg", "peak_before_next_min",
                                  "on_counted_run"}, set(meal), name)
                if meal["next_bolus_min"] is not None:
                    self.assertGreaterEqual(meal["next_bolus_min"], 30.0, (name, meal["t"]))
                if meal["peak_before_next_bg"] is not None:
                    self.assertLessEqual(meal["peak_before_next_bg"], meal["peak_bg"],
                                         (name, meal["t"]))
                if meal["peak_bg"] is None:
                    self.assertEqual("unread", meal["outcome"], (name, meal["t"]))
                    continue
                above, below = meal["peak_bg"] > band["high"], meal["nadir_bg"] < band["low"]
                self.assertEqual(
                    {(True, True): "high-and-low", (True, False): "high",
                     (False, True): "low", (False, False): "in-range"}[(above, below)],
                    meal["outcome"], (name, meal["t"]))
                self.assertTrue(0 <= meal["peak_min"] <= 315, (name, meal["t"]))
                self.assertTrue(0 <= meal["nadir_min"] <= 315, (name, meal["t"]))

    def test_the_tally_counts_the_served_meals(self):
        for name, case in self.cases.items():
            outcomes = [meal["outcome"] for meal in case["meals"]]
            both = outcomes.count("high-and-low")
            self.assertEqual(
                {"above_high": outcomes.count("high") + both,
                 "below_low": outcomes.count("low") + both, "both": both,
                 "in_range": outcomes.count("in-range"),
                 "unread": outcomes.count("unread"), "n": len(outcomes),
                 "meals_on_counted_runs": sum(meal["on_counted_run"]
                                              for meal in case["meals"]),
                 "peaked_above_high_before_next": sum(
                     meal["on_counted_run"] and meal["peak_before_next_bg"] is not None
                     and meal["peak_before_next_bg"] > case["outcomes"]["band"]["high"]
                     for meal in case["meals"]),
                 "peaked_above_high_in_window": sum(
                     meal["on_counted_run"] and meal["outcome"] in ("high", "high-and-low")
                     for meal in case["meals"])},
                case["outcomes"]["counts"], name)
            counts = case["outcomes"]["counts"]
            self.assertLessEqual(counts["peaked_above_high_before_next"],
                                 counts["peaked_above_high_in_window"], name)

    def test_the_published_case_exercises_every_fact_the_panel_reads(self):
        case = self.cases["explained"]

        self.assertEqual(
            {"counted-whole", "counted-by-share", "earlier-ratio-or-uncurrent-chain",
             "no-outcome-read"},
            {run["pool_reason"] for run in case["runs"]})
        self.assertGreaterEqual(case["outcomes"]["counts"]["above_high"], 1)
        self.assertGreaterEqual(case["outcomes"]["counts"]["below_low"], 1)
        self.assertGreaterEqual(case["outcomes"]["counts"]["both"], 1)
        self.assertEqual(2, case["harm_evidence"]["row_days"])
        self.assertEqual(2, len(case["harm_evidence"]["lows"]))
        self.assertIsNotNone(case["harm_evidence"]["minutes_after_bolus_median"])
        # Each low belongs to a pooled chain whose first meal's window holds both
        # the spike and the low, and whose later meal's window holds the low: the
        # spike and the low are one run's evidence.
        meals = {meal["t"]: meal for meal in case["meals"]}
        runs = {run["run_id"]: run for run in case["runs"]}
        for low in case["harm_evidence"]["lows"]:
            chain = runs[low["dominant_bolus_t"]]
            self.assertTrue(chain["in_pool"], low["t"])
            self.assertGreaterEqual(chain["n_meals"], 2, low["t"])
            self.assertEqual("high-and-low", meals[chain["run_id"]]["outcome"], low["t"])
            start = datetime.fromisoformat(chain["run_id"])
            later = [meals[(start + timedelta(minutes=offset)).isoformat()]
                     for offset in chain["member_offsets_min"][1:]]
            self.assertTrue(any(meal["outcome"] == "low" for meal in later), low["t"])
        self.assertGreater(case["block"]["support_detail"]["fractional_run_ownership"],
                           0.0)
        # The settled surface's facts: chains ending after the block, meals whose
        # window runs past the next bolus, lows on counted runs, and the rule.
        self.assertGreater(case["block"]["run_ends"]["after_later_meal"], 0)
        self.assertLess(case["outcomes"]["counts"]["peaked_above_high_before_next"],
                        case["outcomes"]["counts"]["peaked_above_high_in_window"])
        self.assertEqual(2, case["harm_evidence"]["groups"]["counted_run"])
        self.assertIsNotNone(case["harm_evidence"]["bearing_sentence"])
        self.assertIsNotNone(case["block"]["recommendation"]["sentence"])


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
