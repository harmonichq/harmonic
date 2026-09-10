"""Guidance through committed producer payloads and ADR 383 comparison edges."""
import importlib.util
import pathlib
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy

from ciq_autotune.analyzers.scenario import assemble
from ciq_autotune.analyzers.tuning_priority import build_tuning_levers
from ciq_autotune.findings_projection import prepare_findings_projection
from ciq_autotune.guidance import (
    COMPARISON_VERSION,
    baseline_for,
    build_guidance,
    is_preference_subject,
    preference_status,
)
from ciq_autotune.store import Store
from ciq_autotune.result import AnalysisResult, DataQuality, SCHEMA_VERSION, Span
from scripts.qa_e2e_cases import QA_CASES, execute_case, materialize_case
from tests.test_scenario_engine import ISF, PatternScoringAndPayloadTest

_path = pathlib.Path(__file__).resolve().parents[1] / "scripts/gen_findings_projection_fixtures.py"
_spec = importlib.util.spec_from_file_location("guidance_fixture", _path)
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)


def _producer():
    projection = gen.projection()
    return projection._analysis, projection._exposures, projection._scenarios


def _instruction(start, end, value):
    return {"parameter": "basal_rate", "start_min": start, "end_min": end,
            "direction": "raise", "units": "U/h", "recommended": value}


def _qa(name):
    case = next(case for case in QA_CASES if case.name == name)
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
        with Store.open(database.name) as store:
            materialize_case(store, case)
        with Store.open_readonly(database.name) as store:
            execution = execute_case(store, case)
    projection = prepare_findings_projection(
        analysis=execution.analysis, exposures=execution.exposures,
        scenarios=execution.scenarios,
    )
    return projection.guidance(), execution


def _treatment_fields(value):
    found = []
    if isinstance(value, dict):
        for key, item in value.items():
            if key in {"recommended", "priced_target"}:
                found.append(key)
            found.extend(_treatment_fields(item))
    elif isinstance(value, list):
        for item in value:
            found.extend(_treatment_fields(item))
    return found


class GuidanceTest(unittest.TestCase):
    def test_pattern_subjects_are_a_closed_preference_set(self):
        self.assertTrue(is_preference_subject("pattern:highs_after_meals"))
        self.assertFalse(is_preference_subject("pattern:not-in-the-roster"))

    def test_candidates_are_pure_under_concurrent_calls(self):
        analysis, exposures, scenarios = _producer()
        with ThreadPoolExecutor(max_workers=2) as pool:
            rows = list(pool.map(
                lambda _index: build_guidance(
                    analysis=analysis, exposures=exposures, scenarios=scenarios,
                ),
                range(2),
            ))
        self.assertEqual(rows[0], rows[1])
        self.assertEqual(
            len([row for row in rows[0]["candidates"] if row["kind"] == "pattern"]),
            5,
        )

    def test_every_pattern_publishes_named_readiness(self):
        result, _execution = _qa("showcase")
        patterns = [row for row in result["candidates"] if row["kind"] == "pattern"]
        self.assertEqual(len(patterns), 5)
        for row in patterns:
            self.assertIn(row["readiness"]["verdict"], ("ready", "withheld"))
            self.assertIsInstance(row["readiness"]["count"], int)
            self.assertIsInstance(row["readiness"]["gate"], int)
            self.assertTrue(row["readiness"]["reason"])

    def test_generated_public_payload_selects_actual_staged_subject(self):
        analysis, exposures, scenarios = _producer()
        result = build_guidance(analysis=analysis, exposures=exposures, scenarios=scenarios)
        self.assertEqual((result["disposition"], result["selected"]["subject"]),
                         ("eligible_action", "pattern:highs_after_meals"))
        action = result["selected"]["action"][0]
        source = next(block["guidance"]["action"] for block in analysis["ic_blocks"]
                      if block["guidance"]["action"] is not None)
        self.assertEqual(action, source)
        self.assertEqual(action["member_start_mins"], source["member_start_mins"])
        self.assertNotEqual(result["reasons"]["admission"],
                            result["reasons"]["ordering"])

    def test_generated_held_evidence_stays_without_advice(self):
        analysis, exposures, scenarios = _producer()
        rows = {row["subject"]: row for row in build_guidance(
            analysis=analysis, exposures=exposures, scenarios=scenarios)["candidates"]}
        self.assertIsNone(rows["setting:basal_rate"]["action"])
        self.assertNotIn("recommended", rows["setting:basal_rate"]["members"][0])

    def test_analyzer_held_and_thin_verdicts_are_evidenced_without_advice(self):
        expected = {
            "basal-insufficient-seven-night": ("setting:basal_rate", None),
            "basal-recurring-low-gate": ("setting:basal_rate", None),
            "isf-direction-only-weaken": ("setting:isf", "weaken"),
            "isf-held": ("setting:isf", None),
            "ic-collecting": ("setting:carb_ratio", None),
            "ic-held": ("setting:carb_ratio", None),
        }
        for case_name, (subject, direction) in expected.items():
            with self.subTest(case=case_name):
                result, execution = _qa(case_name)
                row = next(row for row in result["candidates"]
                           if row["subject"] == subject)
                self.assertEqual(result["disposition"], "guided_investigation")
                self.assertIsNone(row["action"])
                self.assertEqual(row["members"][0]["direction"], direction)
                self.assertTrue(row["members"][0]["support"])
                self.assertEqual(_treatment_fields(row["members"]), [])
                self.assertEqual(_treatment_fields(row["priority_inputs"]), [])
                if case_name == "ic-collecting":
                    self.assertIsNotNone(execution.analysis["ic_blocks"][0]["recommended"])

    def test_active_watch_keeps_generated_candidates_visible(self):
        analysis, exposures, scenarios = _producer()
        result = build_guidance(analysis=analysis, exposures=exposures, scenarios=scenarios,
                                active_watch={"kind": "focus", "lever": "late_bolus"})
        self.assertEqual((result["disposition"], result["selected"]), ("active_change", None))
        self.assertTrue(result["alternatives"])

    def test_setting_comparison_ignores_split_narrowing_and_disappearance(self):
        saved = {"comparison_version": COMPARISON_VERSION,
                 "state": {"kind": "setting", "action": [_instruction(0, 120, 1)], "seriousness": []}}
        for current in ({"kind": "setting", "action": [_instruction(0, 60, 1), _instruction(60, 120, 1)], "seriousness": []},
                        {"kind": "setting", "action": [_instruction(0, 60, 1)], "seriousness": []},
                        {"kind": "setting", "action": None, "seriousness": []}):
            self.assertTrue(preference_status(current, saved)["set_aside"])

    def test_setting_return_names_instruction_and_harm_interval(self):
        saved = {"comparison_version": COMPARISON_VERSION,
                 "state": {"kind": "setting", "action": [_instruction(360, 420, 1)], "seriousness": []}}
        changed = {"kind": "setting", "action": [_instruction(360, 420, 1.1)], "seriousness": []}
        reason = preference_status(changed, saved)["return_reason"]
        self.assertEqual(
            reason,
            "Instruction changed from 06:00–07:00: raise to 1 U/h to "
            "06:00–07:00: raise to 1.1 U/h.",
        )
        harmed = {"kind": "setting", "action": [_instruction(360, 420, 1)],
                   "seriousness": [{"start_min": 60, "end_min": 120, "seriousness": "recurring_low"}]}
        self.assertEqual(
            preference_status(harmed, saved)["return_reason"],
            "Recurring-low verdict now affects 01:00–02:00.",
        )

    def test_expanded_instruction_is_a_newly_admitted_interval(self):
        saved = {"comparison_version": COMPARISON_VERSION,
                 "state": {"kind": "setting", "action": [_instruction(0, 60, 1)], "seriousness": []}}
        expanded = {"kind": "setting", "action": [_instruction(0, 120, 1)], "seriousness": []}
        self.assertEqual(
            preference_status(expanded, saved)["return_reason"],
            "New instruction: 00:00–02:00: raise to 1 U/h.",
        )

    def test_habit_keeps_owner_support_population_and_episode_identity(self):
        result, execution = _qa("behavioral-precedence")
        rows = {row["subject"]: row for row in result["candidates"]}
        source = execution.scenarios["patterns"][0]
        row = rows["pattern:highs_after_treating_lows"]
        member = next(item for item in row["members"]
                      if item["subject"] == f"habit:{source['lever']}")
        self.assertEqual(member["k"], source["confidence"]["k"])
        exposure_ids = [item["ep_id"]
                        for family in execution.exposures["exposures"].values()
                        for item in family["occurrences"]]
        self.assertLess(len(set(exposure_ids)), len(exposure_ids))
        self.assertEqual(member["subject"], f"habit:{source['lever']}")

    def test_absent_unknown_comparison_version_explains_restore(self):
        analysis, exposures, scenarios = _producer()
        result = build_guidance(
            analysis=analysis, exposures=exposures, scenarios=scenarios,
            preferences=[{
                "subject": "habit:not-current",
                "decided_at": "2026-01-01 00:00:00",
                "reason": None,
                "comparison_version": "future:1",
                "state": {},
            }],
        )
        row = next(row for row in result["candidates"] if row["subject"] == "habit:not-current")
        self.assertIn("Restore is required", row["preference"]["return_reason"])

    def test_supported_habit_leads_over_unstaged_settings(self):
        result, execution = _qa("behavioral-missed-meal")
        self.assertEqual(result["selected"]["subject"], "habit:missed_meal")
        self.assertEqual(result["disposition"], "eligible_action")
        source = execution.scenarios["patterns"][0]
        self.assertEqual(result["selected"]["occurrence_ids"], source["occurrences"])
        self.assertEqual(result["selected"]["evidence"][0]["uncertainty"],
                         source["confidence"])
        self.assertTrue(all(row["action"] is None for row in result["candidates"]
                            if row["kind"] == "setting"))

    def test_owner_priced_tie_is_stable_after_input_reordering(self):
        _habit_result, execution = _qa("behavioral-missed-meal")
        basal = gen.basal_rows()
        levers = build_tuning_levers(
            basal, [], [], slot_minutes=30, robust_daily_insulin_u=46.0,
        )
        self.assertEqual(levers[0].priority, execution.scenarios["patterns"][0]["priority"])

        def guidance(rows):
            analysis = AnalysisResult(
                schema_version=SCHEMA_VERSION, generated_at="2026-08-17 09:00:00",
                window_days=30, span=Span(start="2026-07-18", end="2026-08-17"),
                epochs=[], data_quality=DataQuality(counts={}, notes=[]),
                basal=rows, isf=[], ic=[], behavioral=[], tuning_levers=levers,
            ).to_dict()
            return prepare_findings_projection(
                analysis=analysis, exposures=execution.exposures,
                scenarios=execution.scenarios,
            ).guidance()

        first = guidance(basal)
        second = guidance(list(reversed(basal)))
        self.assertEqual(first["selected"]["subject"], "habit:missed_meal")
        self.assertEqual(second["selected"]["subject"], first["selected"]["subject"])

    def test_low_confidence_and_observation_only_patterns_remain_investigations(self):
        bolus, cgm = PatternScoringAndPayloadTest()._recurring_missed_meals(2)
        low_scenarios = assemble(bolus, cgm, [], isf=ISF).to_dict()
        analysis = gen.empty_projection()._analysis
        low = prepare_findings_projection(
            analysis=analysis, exposures={"exposures": {}},
            scenarios=low_scenarios,
        ).guidance()
        observation, execution = _qa("behavioral-meal-bolus-short")
        self.assertEqual(low["disposition"], "guided_investigation")
        self.assertEqual(low["selected"]["subject"], "habit:missed_meal")
        self.assertTrue(low["selected"]["evidence"])
        self.assertEqual(observation["disposition"], "guided_investigation")
        self.assertEqual(observation["selected"]["subject"],
                         "habit:meal_bolus_short")
        self.assertIsNone(execution.scenarios["patterns"][0]["guidance"]["action_id"])
        self.assertTrue(observation["selected"]["evidence"])
        self.assertTrue(all(row["action"] is None
                            for row in (low["candidates"] + observation["candidates"])))

    def test_set_aside_ignores_priority_refresh_and_restore_returns_selection(self):
        analysis, exposures, scenarios = _producer()
        first = build_guidance(analysis=analysis, exposures=exposures, scenarios=scenarios)
        selected = first["selected"]
        baseline = baseline_for(selected)
        preference = {
            "subject": selected["subject"], "decided_at": "2026-01-01 00:00:00",
            "reason": "later", **baseline,
        }
        refreshed = deepcopy(analysis)
        next(row for row in refreshed["tuning_levers"]
             if row["parameter"] == "carb_ratio")["priority"] += 1
        aside = build_guidance(
            analysis=refreshed, exposures=exposures, scenarios=scenarios,
            preferences=[preference], generation="changed-fingerprint-and-count",
        )
        row = next(row for row in aside["candidates"]
                   if row["subject"] == selected["subject"])
        self.assertTrue(row["preference"]["set_aside"])
        self.assertNotEqual(aside["selected"]["subject"], selected["subject"])
        restored = build_guidance(analysis=analysis, exposures=exposures, scenarios=scenarios)
        self.assertEqual(restored["selected"]["subject"], selected["subject"])

    def test_pattern_set_aside_never_withholds_its_setting_candidate(self):
        analysis, exposures, scenarios = _producer()
        current = build_guidance(
            analysis=analysis, exposures=exposures, scenarios=scenarios,
        )
        pattern = next(row for row in current["candidates"]
                       if row["subject"] == "pattern:highs_after_meals")
        result = build_guidance(
            analysis=analysis, exposures=exposures, scenarios=scenarios,
            preferences=[{
                "subject": pattern["subject"], "decided_at": "2026-01-01 00:00:00",
                "reason": "later", **baseline_for(pattern),
            }],
        )
        setting = next(row for row in result["candidates"]
                       if row["subject"] == "setting:carb_ratio")
        self.assertTrue(setting["action"])
        self.assertFalse(setting["preference"]["set_aside"])

    def test_pattern_baseline_contains_only_meaningful_comparison_state(self):
        analysis, exposures, scenarios = _producer()
        current = build_guidance(
            analysis=analysis, exposures=exposures, scenarios=scenarios,
        )
        pattern = next(row for row in current["candidates"]
                       if row["subject"] == "pattern:highs_after_meals")
        baseline = baseline_for(pattern)
        self.assertEqual(set(baseline["state"]), {
            "kind", "action", "seriousness", "member_set_fingerprint",
        })
        self.assertIsInstance(baseline["state"]["action"], str)
        self.assertIn(baseline["state"]["seriousness"],
                      (None, "info", "low", "medium", "high"))

    def test_setting_source_before_habit_source_is_safe(self):
        result, _execution = _qa("basal-raise")
        pattern = next(row for row in result["candidates"]
                       if row["subject"] == "pattern:overnight_lows_no_iob")
        self.assertEqual(pattern["chosen_member"]["kind"], "setting")
        self.assertIsInstance(pattern["action"], list)

    def test_habit_returns_for_semantic_action_or_worse_owner_seriousness(self):
        saved = {"comparison_version": COMPARISON_VERSION,
                 "state": {"kind": "habit", "action": {"action_id": "habit:a"},
                           "seriousness": "low"}}
        equivalent = {"kind": "habit", "action": {"action_id": "habit:a"},
                      "seriousness": "info"}
        self.assertTrue(preference_status(equivalent, saved)["set_aside"])
        changed = {**equivalent, "action": {"action_id": "habit:b"}}
        self.assertIn("action changed", preference_status(changed, saved)["return_reason"])
        worsened = {**equivalent, "seriousness": "medium"}
        self.assertIn("seriousness increased",
                      preference_status(worsened, saved)["return_reason"])

    def test_actual_quiet_analyzer_output_is_quiet_for_no_concern(self):
        result, _execution = _qa("basal-no-change")
        self.assertEqual(result["disposition"], "quiet")
        self.assertEqual(result["reasons"]["admission"], "No current concern.")

    def test_missing_threshold_or_citation_identity_is_explicitly_unavailable(self):
        bolus, cgm = PatternScoringAndPayloadTest()._recurring_missed_meals(4)
        source = assemble(bolus, cgm, [], isf=ISF).to_dict()
        for mutation in ("threshold", "citations"):
            with self.subTest(missing=mutation):
                scenarios = deepcopy(source)
                if mutation == "threshold":
                    scenarios["priority_active_threshold"] = None
                else:
                    scenarios["patterns"][0]["guidance"]["citation_episode_ids"] = []
                result = prepare_findings_projection(
                    analysis=gen.empty_projection()._analysis,
                    exposures={"exposures": {}}, scenarios=scenarios,
                ).guidance()
                self.assertEqual(result["disposition"], "unavailable")
                self.assertIsNotNone(result["unavailable"])
                self.assertTrue(result["candidates"][0]["unavailable"])


class SequenceGuidanceExclusionTest(unittest.TestCase):
    def test_supported_habit_members_have_no_setting_instruction(self):
        from tests.test_findings_projection import sequence_products
        from ciq_autotune.window_membership import WindowQuery
        for lever in ("high_carb_sequence", "repeat_eating"):
            projection, _ = sequence_products(lever)
            rows = projection.project(WindowQuery.whole_day())["rows"]
            cause = next(row for row in rows if row["id"] == f"finding:{lever}")
            self.assertIsNone(cause["parameter"])
            self.assertIsNone(cause.get("asserts_move"))
            self.assertEqual(cause["kind"], "habit")
            guidance = build_guidance(analysis=projection._analysis, exposures=projection._exposures,
                                      scenarios=projection._scenarios)
            candidate = next(row for row in guidance["candidates"]
                             if row["subject"] == "pattern:highs_after_meals")
            self.assertEqual(_treatment_fields(candidate), [])
            member = next(row for row in candidate["members"] if row["subject"] == f"habit:{lever}")
            self.assertEqual(member["kind"], "habit")
