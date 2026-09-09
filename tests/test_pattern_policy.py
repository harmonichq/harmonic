"""Contract tests for the outcome-pattern composition boundary."""

import unittest

from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns


def _scenario(lever, *, price=20, k=2, lo=.1, hi=.3):
    return {"lever": lever, "priority": price,
            "confidence": {"k": k, "lo": lo, "hi": hi},
            "guidance": {"action_id": f"habit:{lever}", "seriousness": "high"}}


class OutcomePatternPolicyTest(unittest.TestCase):
    def test_returns_the_closed_roster_and_owns_no_deferred_lever(self):
        roster = build_outcome_patterns({}, {"exposures": {}}, {"patterns": [], "low_confidence": []})
        self.assertEqual([item["key"] for item in roster], [
            "highs_after_meals", "lows_after_meals", "highs_after_treating_lows",
            "lows_after_correcting_highs", "overnight_lows_without_iob",
        ])
        self.assertNotIn("meal_bolus_short", str(roster))
        self.assertNotIn("missed_meal", str(roster))

    def test_staged_setting_wins_an_interval_near_tie(self):
        analysis = {
            "tuning_levers": [{
                "parameter": "carb_ratio", "priority": 10,
                "recurrence_channel": {"kind": "ic_runs", "k": 1, "n": 12},
            }],
            "ic_blocks": [{"asserts_move": True}],
        }
        exposures = {"exposures": {"meals": {"n": 12, "occurrences": [
            {"attributed": True, "cause_lever": "carb_undercount", "ep_id": "a"}]} }}
        roster = build_outcome_patterns(analysis, exposures, {"patterns": [_scenario("carb_undercount", price=20)], "low_confidence": []})
        high = roster[0]
        self.assertEqual(high["settled_price"], 10)
        self.assertEqual(high["admission_route"], "setting_staging")

    def test_single_admitted_habit_collapses_to_its_member(self):
        exposures = {"exposures": {"lows": {"n": 12, "occurrences": [
            {"attributed": True, "cause_lever": "over_treated_low", "ep_id": "a"}]} }}
        roster = build_outcome_patterns({}, exposures, {"patterns": [_scenario("over_treated_low")], "low_confidence": []})
        pattern = next(item for item in roster if item["key"] == "highs_after_treating_lows")
        self.assertEqual(pattern["collapse"], "collapse_to_member")
        self.assertEqual(pattern["readiness"], {"count": 12, "gate": 12, "verdict": "ready"})
