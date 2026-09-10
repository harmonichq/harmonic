"""Contract tests for the outcome-pattern composition boundary."""

import unittest

from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns
from ciq_autotune.result import SlotEstimate
from ciq_autotune.safety import Status
from ciq_autotune.uncertainty import Estimate


def _scenario(lever, *, price=20, k=2, n=12, lo=.1, hi=.3, action=True):
    return {"lever": lever, "priority": price,
            "confidence": {"k": k, "n": n, "lo": lo, "hi": hi},
            "guidance": {"action_id": f"habit:{lever}" if action else None,
                         "seriousness": "high"}}


def _basal_slot(slot, start_min, status, *, duration_min=30, seriousness=None):
    actionable = status.actionable
    return SlotEstimate(
        slot=slot, label=f"{start_min // 60:02d}:{start_min % 60:02d}",
        current=.6, estimate=Estimate(.5, .5, .5, 12),
        recommended=.5, annotation="owner verdict", days=12,
        evidence={"harm_band_source_nights": 12}, status=status,
        guidance={
            "action": ({
                "kind": "setting_instruction", "parameter": "basal_rate",
                "start_min": start_min, "end_min": start_min + duration_min,
                "direction": "lower", "units": "U/h", "recommended": .5,
            } if actionable else None),
            "seriousness": seriousness,
        },
    ).to_dict()


class OutcomePatternPolicyTest(unittest.TestCase):
    def test_returns_the_closed_roster_and_owns_no_deferred_lever(self):
        roster = build_outcome_patterns({}, {"exposures": {}}, {"patterns": [], "low_confidence": []})
        self.assertEqual([item["key"] for item in roster], [
            "highs_after_meals", "lows_after_meals", "highs_after_treating_lows",
            "lows_after_correcting_highs", "overnight_lows_no_iob",
        ])
        self.assertEqual(roster[0]["rate_levers"], [
            "habit:carb_undercount", "habit:late_bolus", "habit:meal_bolus_short",
        ])
        self.assertNotIn(
            "habit:meal_bolus_short",
            {member["subject"] for member in roster[0]["members"]},
        )
        self.assertNotIn("missed_meal", str(roster))
        self.assertEqual(
            roster[0]["overlap_counts"]["overnight_lows_no_iob"],
            {"status": "not_comparable", "count": None,
             "reason": "no_habit_exposure_identity"},
        )

    def test_highs_after_meals_unions_meal_bolus_short_by_the_cited_meal(self):
        meal_at = "2026-08-01 12:00:00"
        exposures = {"exposures": {
            "meals": {"n": 2, "occurrences": [{
                "attributed": True, "cause_lever": "carb_undercount",
                "ep_id": "meal-driver", "t": meal_at,
            }, {
                "attributed": False, "cause_lever": None,
                "ep_id": "other-meal", "t": "2026-08-02 12:00:00",
            }]},
            "highs": {"n": 1, "occurrences": [{
                "attributed": True, "cause_lever": "meal_bolus_short",
                "cause_occurrence_id": "meal-1", "ep_id": "short-high",
                "t": "2026-08-01 14:00:00",
            }]},
        }}
        scenarios = {
            "patterns": [
                _scenario("carb_undercount"),
                _scenario("meal_bolus_short", price=99, action=False),
            ],
            "low_confidence": [],
            "episodes": {"short-high": {"lever": "meal_bolus_short", "steps": [{
                "citation": {"facts": {"meal_at": meal_at}},
            }]}},
        }

        pattern = build_outcome_patterns({}, exposures, scenarios)[0]

        self.assertEqual((pattern["k"], pattern["n"]), (1, 2))
        self.assertNotIn(
            "habit:meal_bolus_short",
            {member["subject"] for member in pattern["members"]},
        )
        self.assertNotEqual(pattern["action"], "habit:meal_bolus_short")

    def test_lows_after_correcting_highs_unions_both_levers_by_nadir(self):
        stacked_low = "2026-08-01 13:00:00"
        on_iob_low = "2026-08-02 13:00:00"
        scenarios = {
            "patterns": [
                _scenario("correction_stacking", k=1, n=9),
                _scenario("correction_on_iob", k=1, n=3),
            ],
            "low_confidence": [],
            "episodes": {"stacked": {"lever": "correction_stacking", "steps": [{
                "citation": {"facts": {"nadir_at": stacked_low}},
            }]}},
        }
        exposures = {"exposures": {
            "lows": {"n": 3, "occurrences": [
                {"attributed": False, "cause_lever": None,
                 "ep_id": "stacked-low", "t": stacked_low},
                {"attributed": True, "cause_lever": "correction_on_iob",
                 "ep_id": "on-iob", "t": on_iob_low},
                {"attributed": False, "cause_lever": None,
                 "ep_id": "clean", "t": "2026-08-03 13:00:00"},
            ]},
            "correction_clusters": {"n": 9, "occurrences": [{
                "attributed": True, "cause_lever": "correction_stacking",
                "ep_id": "stacked", "t": "2026-08-01 12:30:00",
            }]},
        }}

        pattern = next(row for row in build_outcome_patterns({}, exposures, scenarios)
                       if row["key"] == "lows_after_correcting_highs")

        self.assertEqual((pattern["k"], pattern["n"]), (2, 3))
        self.assertEqual(pattern["rate_producer"], "exposures")
        self.assertEqual(scenarios["patterns"][0]["confidence"]["n"], 9)

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
                 "ep_id": "shared-meal", "t": "2025-06-01 12:00:00"},
                {"attributed": True, "cause_lever": "meal_over_delivery",
                 "ep_id": "shared-meal", "t": "2025-06-01 12:00:00"},
            ]},
            "lows": {"n": 12, "occurrences": [
                {"attributed": True, "cause_lever": "over_treated_low",
                 "ep_id": "shared-low", "t": "2025-06-01 02:30:00"},
                {"attributed": True, "cause_lever": "correction_on_iob",
                 "ep_id": "shared-low", "t": "2025-06-01 02:30:00"},
            ]},
            "correction_clusters": {"n": 12, "occurrences": [
                {"attributed": True, "cause_lever": "correction_stacking",
                 "ep_id": "stacked", "t": "2025-06-01 02:00:00"},
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
                "stacked": {"lever": "correction_stacking", "steps": [
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
        self.assertEqual(correction["rate_levers"], [
            "habit:correction_stacking", "habit:correction_on_iob",
        ])
        self.assertEqual(correction["k"], 1)
        self.assertEqual(correction["harm_low_overlap"], [
            {"habit_subject": "habit:correction_stacking",
             "setting_subject": "setting:isf", "status": "comparable",
             "count": 1, "reason": "shared_low_episode_nadir"},
            {"habit_subject": "habit:correction_on_iob",
             "setting_subject": "setting:isf", "status": "comparable",
             "count": 1, "reason": "shared_low_episode_nadir"},
        ])

    def test_setting_seriousness_uses_the_admitted_slots_owner_category(self):
        analysis = {
            "tuning_levers": [{"parameter": "basal_rate", "priority": 10,
                               "recurrence_channel": {"kind": "basal_lower"}}],
            "basal": [_basal_slot(6, 180, Status.HARM_LOWER,
                                   seriousness="recurring_low")],
        }
        overnight = build_outcome_patterns(
            analysis, {"exposures": {}}, {"patterns": [], "low_confidence": []},
        )[-1]
        seriousness_segments = [{
            "start_min": 180, "end_min": 210,
            "seriousness": "recurring_low",
        }]
        self.assertEqual(overnight["members"][0]["seriousness"], "recurring_low")
        self.assertEqual(overnight["members"][0]["seriousness_segments"],
                         seriousness_segments)
        self.assertEqual(overnight["seriousness"], "recurring_low")
        self.assertEqual(overnight["settled_price"], 10)

    def test_overnight_setting_admission_is_scoped_to_the_harm_band(self):
        analysis = {
            "tuning_levers": [{"parameter": "basal_rate", "priority": 10,
                               "recurrence_channel": {"kind": "basal_lower"}}],
            "basal": [
                _basal_slot(28, 840, Status.LOWER),
                _basal_slot(12, 180, Status.NO_CHANGE, duration_min=15),
            ],
        }
        overnight = build_outcome_patterns(
            analysis, {"exposures": {}}, {"patterns": [], "low_confidence": []},
        )[-1]
        self.assertFalse(overnight["members"][0]["admitted"])
        self.assertIsNone(overnight["action"])
        self.assertEqual(overnight["settled_price"], 0)

        analysis["basal"][1] = _basal_slot(
            12, 180, Status.LOWER, duration_min=15,
        )
        overnight = build_outcome_patterns(
            analysis, {"exposures": {}}, {"patterns": [], "low_confidence": []},
        )[-1]
        self.assertTrue(overnight["members"][0]["admitted"])
        self.assertEqual(overnight["action"], "basal_rate")
        self.assertEqual(overnight["settled_price"], 10)

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
