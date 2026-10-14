"""Contract tests for the outcome-pattern composition boundary."""

import unittest

from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns


def _scenario(lever, *, price=20, k=2, n=12, lo=.1, hi=.3, action=True, basis="lower_bound"):
    return {"lever": lever, "priority": price, "admission_basis": basis,
            "confidence": {"k": k, "n": n, "lo": lo, "hi": hi},
            "guidance": {"action_id": f"habit:{lever}" if action else None,
                         "seriousness": "high"}}


class OutcomePatternPolicyTest(unittest.TestCase):
    def test_returns_the_closed_roster_and_owns_no_deferred_lever(self):
        roster = build_outcome_patterns({}, {"exposures": {}}, {"patterns": [], "low_confidence": []})
        self.assertEqual([item["key"] for item in roster], [
            "highs_after_meals", "lows_after_meals", "highs_after_treating_lows",
            "lows_after_correcting_highs",
        ])
        self.assertEqual(roster[0]["rate_levers"], [
            "habit:carb_undercount", "habit:late_bolus",
        ])
        self.assertNotIn("missed_meal", str(roster))

    def test_staged_setting_wins_an_interval_near_tie(self):
        analysis = {
            "tuning_levers": [{
                "parameter": "carb_ratio", "priority": 10,
                "recurrence_channel": {
                    "kind": "ic_runs", "k": 1, "n": 12, "lo": .15, "hi": .35,
                },
            }],
            "ic_blocks": [{"asserts_move": True, "safety_status": "lower",
                           "start_min": 0, "end_min": 1440, "evidence": {},
                           "guidance": None}],
        }
        exposures = {"exposures": {"meals": {"n": 12, "occurrences": [
            {"attributed": True, "attributed_levers": ["carb_undercount"],
             "cause_lever": "carb_undercount", "ep_id": "a", "t": "a"}]} }}
        roster = build_outcome_patterns(analysis, exposures, {"patterns": [_scenario("carb_undercount", price=20)], "low_confidence": []})
        high = roster[0]
        self.assertEqual(high["settled_price"], 10)
        self.assertEqual(high["admission_route"], "setting_staging")

    def test_withheld_setting_interval_leaves_priority_in_charge(self):
        analysis = {
            "tuning_levers": [{
                "parameter": "carb_ratio", "priority": 10,
                "recurrence_channel": {"kind": "ic_runs", "k": 1, "n": 12},
            }],
            "ic_blocks": [{"asserts_move": True, "safety_status": "lower",
                           "start_min": 0, "end_min": 1440, "evidence": {},
                           "guidance": None}],
        }
        exposures = {"exposures": {"meals": {"n": 12, "occurrences": [
            {"attributed": True, "attributed_levers": ["carb_undercount"],
             "cause_lever": "carb_undercount", "ep_id": "a", "t": "a"},
        ]}}}
        high = build_outcome_patterns(
            analysis, exposures,
            {"patterns": [_scenario("carb_undercount", price=20)], "low_confidence": []},
        )[0]
        setting = next(item for item in high["members"] if item["kind"] == "setting")
        self.assertIsNone(setting["lo"])
        self.assertIsNone(setting["hi"])
        self.assertEqual(high["settled_price"], 20)
        self.assertEqual(high["admission_route"], "habit_threshold")

    def test_non_overlapping_intervals_leave_priority_in_charge(self):
        analysis = {
            "tuning_levers": [{
                "parameter": "carb_ratio", "priority": 10,
                "recurrence_channel": {
                    "kind": "ic_runs", "k": 1, "n": 12, "lo": .01, "hi": .05,
                },
            }],
            "ic_blocks": [{"asserts_move": True, "safety_status": "lower",
                           "start_min": 0, "end_min": 1440, "evidence": {},
                           "guidance": None}],
        }
        exposures = {"exposures": {"meals": {"n": 12, "occurrences": [
            {"attributed": True, "attributed_levers": ["carb_undercount"],
             "cause_lever": "carb_undercount", "ep_id": "a", "t": "a"},
        ]}}}
        high = build_outcome_patterns(
            analysis, exposures,
            {"patterns": [_scenario("carb_undercount", price=20, lo=.2, hi=.4)],
             "low_confidence": []},
        )[0]
        self.assertEqual(high["settled_price"], 20)
        self.assertEqual(high["admission_route"], "habit_threshold")

    def test_setting_seriousness_fallback_uses_guidance_empty_state(self):
        analysis = {
            "tuning_levers": [{"parameter": "carb_ratio", "priority": 0,
                               "recurrence_channel": {"kind": "ic_runs", "k": 0, "n": 0}}],
            "ic_blocks": [{"asserts_move": False, "safety_status": "held",
                           "start_min": 0, "end_min": 1440, "evidence": {},
                           "guidance": None}],
        }
        member = next(item for item in build_outcome_patterns(
            analysis, {"exposures": {}}, {"patterns": [], "low_confidence": []},
        )[0]["members"] if item["kind"] == "setting")
        self.assertIsNone(member["seriousness"])
        self.assertEqual(member["seriousness_segments"], [])

    def test_single_admitted_habit_collapses_to_its_member(self):
        exposures = {"exposures": {"lows": {"n": 12, "occurrences": [
            {"attributed": True, "attributed_levers": ["over_treated_low"],
             "cause_lever": "over_treated_low", "ep_id": "a", "t": "a"}]} }}
        roster = build_outcome_patterns({}, exposures, {"patterns": [_scenario("over_treated_low")], "low_confidence": []})
        pattern = next(item for item in roster if item["key"] == "highs_after_treating_lows")
        self.assertEqual(pattern["collapse"], "collapse_to_member")
        self.assertEqual(pattern["readiness"], {"count": 12, "gate": 12, "verdict": "ready"})

    def test_inconsistent_source_counts_remain_a_published_pattern(self):
        exposures = {"exposures": {"lows": {"n": 1, "occurrences": [
            {"attributed": True, "cause_lever": "over_treated_low",
             "attributed_levers": ["over_treated_low"],
             "ep_id": "a", "t": "2026-08-01 12:00:00"},
            {"attributed": True, "cause_lever": "over_treated_low",
             "attributed_levers": ["over_treated_low"],
             "ep_id": "b", "t": "2026-08-02 12:00:00"},
        ]}}}
        pattern = next(item for item in build_outcome_patterns(
            {}, exposures, {"patterns": [_scenario("over_treated_low")], "low_confidence": []},
        ) if item["key"] == "highs_after_treating_lows")

        self.assertEqual(pattern["count_status"],
                         {"status": "inconsistent_counts", "k": 2, "n": 1})
        self.assertIsNone(pattern["rate"])
        self.assertIsNone(pattern["wilson"])

    def test_one_credit_rule_gives_a_shared_meal_to_its_first_rate_lever(self):
        """ADR 424: each claimed Occurrence is credited to exactly one rate lever, the
        first in roster order whose claims include it, and the rate counts those
        credits — so a meal two rate levers claim adds one to the Pattern's count."""
        from ciq_autotune.analyzers.scenario.outcome_patterns import credited_claims

        exposures = {"exposures": {"meals": {"n": 4, "occurrences": [
            {"t": "2026-08-01 08:00:00", "cause_lever": "late_bolus",
             "attributed_levers": ["late_bolus", "carb_undercount"]},
            {"t": "2026-08-01 12:00:00", "cause_lever": "late_bolus",
             "attributed_levers": ["late_bolus"]},
            {"t": "2026-08-01 16:00:00", "cause_lever": None,
             "attributed_levers": ["carb_undercount"]},
            {"t": "2026-08-01 20:00:00", "cause_lever": None,
             "attributed_levers": []},
        ]}}}
        high = build_outcome_patterns(
            {}, exposures, {"patterns": [], "low_confidence": []},
        )[0]
        rate_levers = [subject.removeprefix("habit:") for subject in high["rate_levers"]]

        credits = credited_claims(exposures, "meals", rate_levers)

        # The rate-lever order decides, not the order a meal lists its claimants in.
        self.assertEqual(credits, {
            "2026-08-01 08:00:00": "carb_undercount",
            "2026-08-01 12:00:00": "late_bolus",
            "2026-08-01 16:00:00": "carb_undercount",
        })
        self.assertEqual((high["k"], high["n"]), (len(credits), 4))
