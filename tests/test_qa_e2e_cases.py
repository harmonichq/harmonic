"""Public-interface coverage for the synthetic QA E2E case catalog."""

import tempfile
import unittest
from dataclasses import replace

from ciq_autotune.store import Store

from scripts.qa_e2e_cases import QA_CASES, assert_expectation, execute_case, materialize_case


def _assert_case(case):
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
        with Store.open(database.name) as store:
            materialize_case(store, case)
        with Store.open_readonly(database.name) as store:
            assert_expectation(case, execute_case(store))


class QaE2ECasesTest(unittest.TestCase):
    def test_catalog_names_the_showcase_and_two_isolated_coverage_cases(self):
        self.assertEqual(tuple(case.name for case in QA_CASES), (
            "showcase", "setting-recommendation", "behavioral-precedence",
        ))

    def test_each_catalog_case_runs_the_real_producer_composition(self):
        for case in QA_CASES:
            _assert_case(case)

    def test_setting_recommendation_case_runs_the_real_producer_composition(self):
        _assert_case(next(case for case in QA_CASES if case.name == "setting-recommendation"))

    def test_a_perturbed_expectation_fails_the_whole_set_check(self):
        case = next(case for case in QA_CASES if case.name == "setting-recommendation")
        perturbed = replace(
            case, expectation=replace(case.expectation, asserting_basal_slots=frozenset())
        )
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                materialize_case(store, case)
            with Store.open_readonly(database.name) as store:
                with self.assertRaises(AssertionError):
                    assert_expectation(perturbed, execute_case(store))
