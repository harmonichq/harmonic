"""Fail-closed public replay of every ADR 391 outcome-pattern ruling."""

import tempfile
import unittest
from datetime import datetime

from ciq_autotune.guidance import build_guidance
from ciq_autotune.store import Store, _PATTERN_MIGRATION_PENDING
from ciq_autotune.watched_change import follow_up_admission
from scripts.qa_e2e_cases import QA_CASES, assert_expectation, execute_case, materialize_case


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
                    self.assertEqual(
                        {key: candidate["readiness"][key] for key in roster["readiness"]},
                        roster["readiness"],
                    )
                    self.assertEqual(candidate["priority_inputs"]["member_set_fingerprint"],
                                     roster["member_set_fingerprint"])
                self.assertIn(admission["active_kind"], (None, "trial", "focus"))
                self.assertFalse(
                    admission["active_kind"] == "trial"
                    and admission["active_kind"] == "focus",
                )
                if case.name == "behavioral-carb-undercount":
                    with Store.open(database.name) as migration_store:
                        migration_store.save_guidance_preference(
                            "habit:carb_undercount", decided_at="2026-01-01 00:00:00",
                            reason="later", comparison_version="383:1", state={"kind": "habit"},
                        )
                        migration_store.conn.execute(
                            f"PRAGMA application_id = {_PATTERN_MIGRATION_PENDING}",
                        )
                        self.assertTrue(migration_store.migrate_pattern_subjects(
                            execution.analysis, execution.exposures, execution.scenarios,
                        ))
                        self.assertEqual(
                            [row["subject"] for row in migration_store.guidance_preferences()],
                            ["pattern:highs_after_meals"],
                        )
                observed.update(row["key"] for row in execution.outcome_patterns)

        # A catalog regression that quietly stops publishing one policy subject
        # cannot pass merely because the remaining literal expectations matched.
        self.assertEqual(observed, {
            "highs_after_meals", "lows_after_meals", "highs_after_treating_lows",
            "lows_after_correcting_highs", "overnight_lows_without_iob",
        })


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
