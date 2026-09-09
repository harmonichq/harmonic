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
            "lows_after_correcting_highs", "overnight_lows_no_iob",
        ])
        self.assertNotIn("meal_bolus_short", str(roster))
        self.assertNotIn("missed_meal", str(roster))
        self.assertEqual(
            roster[0]["overlap_counts"]["overnight_lows_no_iob"],
            {"status": "not_comparable", "count": None,
             "reason": "no_habit_exposure_identity"},
        )

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
            {"attributed": True, "cause_lever": "carb_undercount", "ep_id": "a"}]} }}
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
            {"attributed": True, "cause_lever": "carb_undercount", "ep_id": "a"},
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
            {"attributed": True, "cause_lever": "carb_undercount", "ep_id": "a"},
        ]}}}
        high = build_outcome_patterns(
            analysis, exposures,
            {"patterns": [_scenario("carb_undercount", price=20, lo=.2, hi=.4)],
             "low_confidence": []},
        )[0]
        self.assertEqual(high["settled_price"], 20)
        self.assertEqual(high["admission_route"], "habit_threshold")

    def test_overlap_counts_and_harm_low_rows_keep_identity_spaces_separate(self):
        analysis = {
            "tuning_levers": [
                {"parameter": "carb_ratio", "priority": 4,
                 "recurrence_channel": {"kind": "ic_runs", "k": 1, "n": 12}},
                {"parameter": "isf", "priority": 5,
                 "recurrence_channel": {"kind": "isf_corr_lows", "k": 1, "n": 12}},
            ],
            "ic_blocks": [{"asserts_move": False, "safety_status": "held",
                           "start_min": 0, "end_min": 1440, "guidance": None,
                           "evidence": {"harm": {"lows": [
                               {"t": "2025-06-01T12:30:00"},
                           ]}}}],
            "isf": [{"asserts_move": False, "safety_status": "held",
                     "guidance": None,
                     "evidence": {"harm": {"lows": [
                         {"t": "2025-06-01T02:30:00"},
                     ]}}}],
        }
        exposures = {"exposures": {
            "meals": {"n": 12, "occurrences": [
                {"attributed": True, "cause_lever": "carb_undercount",
                 "ep_id": "shared-meal"},
                {"attributed": True, "cause_lever": "meal_over_delivery",
                 "ep_id": "shared-meal"},
            ]},
            "lows": {"n": 12, "occurrences": [
                {"attributed": True, "cause_lever": "over_treated_low",
                 "ep_id": "shared-low"},
                {"attributed": True, "cause_lever": "correction_on_iob",
                 "ep_id": "shared-low"},
            ]},
            "correction_clusters": {"n": 12, "occurrences": [
                {"attributed": True, "cause_lever": "correction_stacking",
                 "ep_id": "correction"},
            ]},
        }}
        scenarios = {
            "patterns": [
                _scenario("carb_undercount"), _scenario("meal_over_delivery"),
                _scenario("over_treated_low"), _scenario("correction_stacking"),
                _scenario("correction_on_iob"),
            ],
            "low_confidence": [],
            "episodes": {
                "meal": {"lever": "meal_over_delivery", "steps": [
                    {"citation": {"facts": {
                        "nadir_at": "2025-06-01 12:30:00",
                    }}},
                ]},
                "correction": {"lever": "correction_on_iob", "steps": [
                    {"citation": {"facts": {
                        "nadir_at": "2025-06-01 02:30:00",
                    }}},
                ]},
            },
        }
        roster = {item["key"]: item for item in
                  build_outcome_patterns(analysis, exposures, scenarios)}
        self.assertEqual(
            roster["highs_after_meals"]["overlap_counts"]["lows_after_meals"],
            {"status": "comparable", "count": 1,
             "reason": "shared_meals_exposure"},
        )
        self.assertEqual(
            roster["highs_after_treating_lows"]["overlap_counts"]
                  ["lows_after_correcting_highs"],
            {"status": "comparable", "count": 1,
             "reason": "shared_lows_exposure"},
        )
        self.assertEqual(
            roster["highs_after_meals"]["overlap_counts"]
                  ["lows_after_correcting_highs"]["reason"],
            "different_exposure_families",
        )
        self.assertEqual(
            roster["lows_after_meals"]["harm_low_overlap"], [{
                "habit_subject": "habit:meal_over_delivery",
                "setting_subject": "setting:carb_ratio",
                "status": "comparable", "count": 1,
                "reason": "shared_low_episode_nadir",
            }],
        )
        correction = roster["lows_after_correcting_highs"]
        self.assertEqual(correction["rate_levers"], ["habit:correction_stacking"])
        self.assertEqual(correction["k"], 1)
        self.assertEqual(correction["harm_low_overlap"], [
            {"habit_subject": "habit:correction_stacking",
             "setting_subject": "setting:isf", "status": "not_comparable",
             "count": None, "reason": "different_identity_spaces"},
            {"habit_subject": "habit:correction_on_iob",
             "setting_subject": "setting:isf", "status": "comparable",
             "count": 1, "reason": "shared_low_episode_nadir"},
        ])

    def test_guidance_candidate_seriousness_precedes_safety_category(self):
        analysis = {
            "tuning_levers": [{"parameter": "basal_rate", "priority": 10,
                               "recurrence_channel": {"kind": "basal_lower"}}],
            "basal": [
                {"slot": 0, "asserts_move": True, "safety_status": "lower",
                 "priority": 4,
                 "evidence": {"harm_band_source_nights": 12},
                 "guidance": {"action": {
                     "parameter": "basal_rate", "start_min": 0, "end_min": 30,
                     "direction": "lower", "units": "U/h", "recommended": 0.5,
                 },
                              "seriousness": "low"}},
                {"slot": 1, "asserts_move": True, "safety_status": "lower",
                 "priority": 8,
                 "evidence": {"harm_band_source_nights": 12},
                 "guidance": {"action": {
                     "parameter": "basal_rate", "start_min": 30, "end_min": 60,
                     "direction": "lower", "units": "U/h", "recommended": 0.5,
                 },
                              "seriousness": "high"}},
            ],
        }
        overnight = build_outcome_patterns(
            analysis, {"exposures": {}}, {"patterns": [], "low_confidence": []},
        )[-1]
        seriousness_segments = [
            {"start_min": 0, "end_min": 30, "seriousness": "low"},
            {"start_min": 30, "end_min": 60, "seriousness": "high"},
        ]
        self.assertEqual(overnight["members"][0]["seriousness"], "high")
        self.assertEqual(overnight["members"][0]["seriousness_segments"],
                         seriousness_segments)
        self.assertEqual(overnight["seriousness"], "high")
        self.assertEqual(overnight["settled_price"], 4)

    def test_overnight_setting_admission_is_scoped_to_the_harm_band(self):
        analysis = {
            "tuning_levers": [{"parameter": "basal_rate", "priority": 10,
                               "recurrence_channel": {"kind": "basal_lower"}}],
            "basal": [
                {"slot": 28, "asserts_move": True, "priority": 90,
                 "guidance": {"action": {
                     "parameter": "basal_rate", "start_min": 840, "end_min": 870,
                     "direction": "lower", "units": "U/h", "recommended": 0.5,
                 }},
                 "evidence": {"harm_band_source_nights": 12}},
                {"slot": 2, "asserts_move": False, "priority": 7,
                 "guidance": {"action": {
                     "parameter": "basal_rate", "start_min": 60, "end_min": 90,
                     "direction": "lower", "units": "U/h", "recommended": 0.5,
                 }},
                 "evidence": {"harm_band_source_nights": 12}},
            ],
        }
        overnight = build_outcome_patterns(
            analysis, {"exposures": {}}, {"patterns": [], "low_confidence": []},
        )[-1]
        self.assertFalse(overnight["members"][0]["admitted"])
        self.assertIsNone(overnight["action"])
        self.assertEqual(overnight["settled_price"], 0)

        analysis["basal"][1]["asserts_move"] = True
        overnight = build_outcome_patterns(
            analysis, {"exposures": {}}, {"patterns": [], "low_confidence": []},
        )[-1]
        self.assertTrue(overnight["members"][0]["admitted"])
        self.assertEqual(overnight["action"], "basal_rate")
        self.assertEqual(overnight["settled_price"], 7)

    def test_setting_seriousness_fallback_uses_guidance_empty_state(self):
        analysis = {
            "tuning_levers": [{"parameter": "basal_rate", "priority": 0,
                               "recurrence_channel": {"kind": "basal_thin"}}],
            "basal": [{"slot": 0, "asserts_move": False,
                       "safety_status": "no change", "evidence": {},
                       "guidance": None}],
        }
        member = build_outcome_patterns(
            analysis, {"exposures": {}}, {"patterns": [], "low_confidence": []},
        )[-1]["members"][0]
        self.assertIsNone(member["seriousness"])
        self.assertEqual(member["seriousness_segments"], [])

    def test_single_admitted_habit_collapses_to_its_member(self):
        exposures = {"exposures": {"lows": {"n": 12, "occurrences": [
            {"attributed": True, "cause_lever": "over_treated_low", "ep_id": "a"}]} }}
        roster = build_outcome_patterns({}, exposures, {"patterns": [_scenario("over_treated_low")], "low_confidence": []})
        pattern = next(item for item in roster if item["key"] == "highs_after_treating_lows")
        self.assertEqual(pattern["collapse"], "collapse_to_member")
        self.assertEqual(pattern["readiness"], {"count": 12, "gate": 12, "verdict": "ready"})

    def test_inconsistent_source_counts_remain_a_published_pattern(self):
        exposures = {"exposures": {"lows": {"n": 1, "occurrences": [
            {"attributed": True, "cause_lever": "over_treated_low", "ep_id": "a"},
            {"attributed": True, "cause_lever": "over_treated_low", "ep_id": "b"},
        ]}}}
        pattern = next(item for item in build_outcome_patterns(
            {}, exposures, {"patterns": [_scenario("over_treated_low")], "low_confidence": []},
        ) if item["key"] == "highs_after_treating_lows")

        self.assertEqual(pattern["count_status"],
                         {"status": "inconsistent_counts", "k": 2, "n": 1})
        self.assertIsNone(pattern["rate"])
        self.assertIsNone(pattern["wilson"])
