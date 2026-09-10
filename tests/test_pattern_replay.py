"""Fail-closed public replay of every ADR 391 outcome-pattern ruling."""

import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from ciq_autotune.guidance import _source_candidates, build_guidance
from ciq_autotune.store import Store
from ciq_autotune.watched_change import follow_up_admission, reconcile_follow_up
from scripts.qa_e2e_cases import QA_CASES, assert_expectation, execute_case, materialize_case


EXPECTED_ACTIVE_KINDS = {
    "pattern-focus-meals": None,
    "showcase": None,
    "setting-recommendation": None,
    "behavioral-precedence": None,
    "basal-raise": None,
    "basal-lower": None,
    "basal-capped-raise": None,
    "basal-capped-lower": None,
    "basal-insufficient-seven-night": None,
    "basal-insufficient-unsupported-sign": None,
    "basal-blind": None,
    "basal-no-baseline": None,
    "basal-no-change": None,
    "basal-recurring-low-lower": None,
    "basal-recurring-low-no-clean-median": None,
    "basal-recurring-low-gate": None,
    "isf-strengthen": None,
    "isf-direction-only-weaken": None,
    "isf-held": None,
    "ic-collecting": None,
    "ic-raise": None,
    "ic-lower": None,
    "ic-capped-raise": None,
    "ic-capped-lower": None,
    "ic-held": None,
    "ic-quiet-seven-run": None,
    "ic-history-register": None,
    "behavioral-carb-undercount": None,
    "behavioral-late-bolus": None,
    "behavioral-uncaused-highs": None,
    "behavioral-false-low-suppressed": None,
    "behavioral-low-no-suppressed": None,
    "behavioral-lone-correction-clean": None,
    "behavioral-meals-start-high": None,
    "behavioral-carb-counting": None,
    "behavioral-post-meal-correction-burden": None,
    "behavioral-meal-over-delivery": None,
    "behavioral-correction-stacking": None,
    "behavioral-over-treated-low": None,
    "behavioral-correction-on-iob": None,
    "behavioral-missed-meal": None,
    "behavioral-meal-bolus-short": None,
    "behavioral-carb-log-fasting-exclusion": None,
    "behavioral-preempted-detector": None,
    "pattern-near-tie": None,
    "pattern-collapse": None,
    "high-carb-sequence-covered": None,
    "high-carb-sequence-empty": None,
    "high-carb-sequence-thin-candidate": None,
    "high-carb-sequence-thin-reference": None,
    "high-carb-sequence-losing": None,
    "high-carb-sequence-multiple": None,
    "repeat-eating-covered": None,
    "repeat-eating-empty": None,
    "repeat-eating-thin-candidate": None,
    "repeat-eating-thin-reference": None,
    "repeat-eating-losing": None,
    "repeat-eating-multiple": None,
    "c3-focus": "focus",
    "c3-trial": "trial",
    "c3-history": "trial",
    "c3-preempted": "trial",
    "c3-pin": None,
}


class PatternReplayTest(unittest.TestCase):
    def test_adr_391_catalog_replay_through_public_producers(self):
        """Every manufactured catalog case remains a complete policy receipt.

        The literal roster held by each QA expectation is deliberately the oracle:
        this test must fail when a member, denominator, admission, action,
        seriousness, fingerprint, collapse, or readiness ruling is absent or changes.
        """
        observed = set()
        for case in QA_CASES:
            with self.subTest(case=case.name), tempfile.NamedTemporaryFile(
                suffix=".sqlite",
            ) as database:
                with Store.open(database.name) as store:
                    materialize_case(store, case)
                    execution = execute_case(store, case)
                    admission = follow_up_admission(
                        store, now=_latest_observation(store),
                    )

                # ``execute_case`` prepares Findings once from the same analysis,
                # exposure, and scenario producers. Its expectation is literal,
                # rather than a second implementation of the policy.
                assert_expectation(case, execution)
                self.assertEqual(
                    execution.findings["whole_day"]["outcome_patterns"],
                    list(execution.outcome_patterns),
                )
                guidance = build_guidance(
                    analysis=execution.analysis,
                    exposures=execution.exposures,
                    scenarios=execution.scenarios,
                )
                projected = {
                    row["subject"]: row
                    for row in guidance["candidates"] if row["kind"] == "pattern"
                }
                source_candidates = {
                    row["subject"]: row for row in _source_candidates(
                        execution.analysis, execution.exposures, execution.scenarios,
                    )
                }
                self.assertEqual(
                    set(projected), {row["subject"] for row in execution.outcome_patterns},
                )
                for roster in execution.outcome_patterns:
                    candidate = projected[roster["subject"]]
                    self.assertEqual(candidate["members"], roster["members"])
                    self.assertEqual(
                        _action_id(candidate["action"]), _action_id(roster["action"]),
                    )
                    self.assertEqual(candidate["seriousness"], roster["seriousness"])
                    self.assertEqual(candidate["admitted"], roster["admission_route"] != "none")
                    self.assertEqual(candidate["collapse"], roster["collapse"])
                    self.assertEqual(
                        {key: candidate["readiness"][key] for key in roster["readiness"]},
                        roster["readiness"],
                    )
                    self.assertEqual(candidate["priority_inputs"]["member_set_fingerprint"],
                                     roster["member_set_fingerprint"])
                    if roster["admission_route"] == "setting_staging":
                        self.assertEqual(
                            candidate["action"],
                            source_candidates[candidate["chosen_member"]["subject"]]["action"],
                        )
                self.assertEqual(admission["active_kind"], EXPECTED_ACTIVE_KINDS[case.name])
                if case.name in {"pattern-near-tie", "pattern-collapse"}:
                    ready_habits = [row for row in execution.outcome_patterns
                                    if row["readiness"]["verdict"] == "ready"
                                    and any(member["kind"] == "habit"
                                            for member in row["members"])]
                    self.assertEqual(ready_habits, [])
                observed.update(row["key"] for row in execution.outcome_patterns)

        # A catalog regression that quietly stops publishing one policy subject
        # cannot pass merely because the remaining literal expectations matched.
        self.assertEqual(observed, {
            "highs_after_meals", "lows_after_meals", "highs_after_treating_lows",
            "lows_after_correcting_highs", "overnight_lows_no_iob",
        })

    def test_pattern_focus_and_trial_are_mutually_exclusive(self):
        """The public pin path admits one Focus; a later pump Trial preempts it."""
        from fastapi.testclient import TestClient
        from ciq_autotune.api import create_app
        from ciq_autotune.analyzers.scenario import outcome_patterns

        case = next(case for case in QA_CASES if case.name == "behavioral-carb-undercount")
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database, patch.dict(
            outcome_patterns._GATES, {"highs_after_meals": 6},
        ):
            with Store.open(database.name) as store:
                materialize_case(store, case)
            client = TestClient(create_app(
                db_path=database.name, token="", enable_fetch_loop=False,
            ))
            pinned = client.post("/api/focus", json={"pattern_key": "highs_after_meals"})
            self.assertEqual(pinned.status_code, 200, pinned.text)
            with Store.open(database.name) as store:
                focus_admission = follow_up_admission(
                    store, now=_latest_observation(store),
                )
                self.assertEqual(focus_admission["active_kind"], "focus")
                self.assertFalse(focus_admission["focus_pin"]["available"])
                _add_isf_trial(store)
                with store.follow_up_transaction():
                    trial_admission = reconcile_follow_up(
                        store, now=datetime(2026, 5, 9), recorded_at=datetime(2026, 5, 9),
                    )
                self.assertEqual(trial_admission["active_kind"], "trial")
                self.assertIsNone(store.active_focus())
            refused = client.post("/api/focus", json={"pattern_key": "highs_after_meals"})
            self.assertEqual(refused.status_code, 409, refused.text)


def _add_isf_trial(store):
    rows = []
    for day, isf in [*( (day, 30) for day in range(1, 5)),
                     *( (day, 45) for day in range(5, 9))]:
        at = datetime(2026, 5, day, 8)
        rows.append({
            "seq_num": 9000 + day, "request_time": str(at), "completion_time": str(at),
            "description": "Bolus", "completion": "Completed", "insulin": 5.0,
            "isf": isf, "carb_ratio": 7.0, "carbs": 40,
        })
    store.upsert_bolus(rows)


def _latest_observation(store):
    events = [*store.basal_events(), *store.cgm_readings(), *store.bolus_events()]
    return max((event.t for event in events), default=datetime(2024, 1, 1))


def _action_id(action):
    if isinstance(action, dict):
        return action.get("action_id")
    if isinstance(action, list):
        parameters = {item.get("parameter") for item in action}
        return parameters.pop() if len(parameters) == 1 else None
    return action
