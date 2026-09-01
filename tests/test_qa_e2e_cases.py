"""Public-interface coverage for the synthetic QA E2E case catalog."""

import tempfile
import unittest
from datetime import date, timedelta
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

    def test_showcase_materializes_a_dense_thirty_day_source_window(self):
        showcase = next(case for case in QA_CASES if case.name == "showcase")
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                materialize_case(store, showcase)
                first = date(2024, 6, 1)
                for offset in range(30):
                    current = first + timedelta(days=offset)
                    start = f"{current.isoformat()} 00:00:00"
                    end = f"{current.isoformat()} 23:59:59"
                    self.assertEqual(len(store.cgm_readings(start, end)), 288)
                    self.assertEqual(len(store.basal_events(start, end)), 288)
                bolus_times = [event.t for event in store.bolus_events()]
                self.assertEqual(len(bolus_times), len(set(bolus_times)))

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

        behavioral = next(case for case in QA_CASES if case.name == "behavioral-precedence")
        perturbed_behavioral = replace(
            behavioral,
            expectation=replace(behavioral.expectation, behavioral_rows=frozenset()),
        )
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                materialize_case(store, behavioral)
            with Store.open_readonly(database.name) as store:
                with self.assertRaises(AssertionError):
                    assert_expectation(perturbed_behavioral, execute_case(store))

    def test_showcase_rejects_each_perturbed_evidence_expectation(self):
        showcase = next(case for case in QA_CASES if case.name == "showcase")
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                materialize_case(store, showcase)
            with Store.open_readonly(database.name) as store:
                execution = execute_case(store)
                perturbations = (
                    {"history_row_ids": frozenset()},
                    {"isf_rest_window_count": 0},
                    {"ic_history_series_count": 0},
                )
                for fields in perturbations:
                    with self.subTest(fields=fields):
                        perturbed = replace(
                            showcase,
                            expectation=replace(showcase.expectation, **fields),
                        )
                        with self.assertRaises(AssertionError):
                            assert_expectation(perturbed, execution)
