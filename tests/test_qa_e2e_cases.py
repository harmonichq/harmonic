"""Public-interface coverage for the synthetic QA E2E case catalog."""

import tempfile
from dataclasses import replace

import pytest

from ciq_autotune.store import Store

from scripts.qa_e2e_cases import QA_CASES, assert_expectation, execute_case, materialize_case


def test_catalog_names_the_showcase_and_two_isolated_coverage_cases():
    assert tuple(case.name for case in QA_CASES) == (
        "showcase",
        "setting-recommendation",
        "behavioral-precedence",
    )


def _assert_case(case):
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
        with Store.open(database.name) as store:
            materialize_case(store, case)
        with Store.open_readonly(database.name) as store:
            assert_expectation(case, execute_case(store))


def test_each_catalog_case_runs_the_real_producer_composition():
    for case in QA_CASES:
        _assert_case(case)


def test_setting_recommendation_case_runs_the_real_producer_composition():
    _assert_case(next(case for case in QA_CASES if case.name == "setting-recommendation"))


def test_a_perturbed_expectation_fails_the_whole_set_check():
    case = next(case for case in QA_CASES if case.name == "setting-recommendation")
    perturbed = replace(
        case, expectation=replace(case.expectation, asserting_basal_slots=frozenset())
    )
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
        with Store.open(database.name) as store:
            materialize_case(store, case)
        with Store.open_readonly(database.name) as store:
            with pytest.raises(AssertionError):
                assert_expectation(perturbed, execute_case(store))
