"""Public-interface coverage for the synthetic QA E2E case catalog."""

import sqlite3
import tempfile
import unittest
from dataclasses import replace
from datetime import date, datetime, timedelta

from ciq_autotune.store import Store

from scripts.qa_e2e_cases import (
    BASAL_SOURCE_SPAN_DAYS,
    QA_CASES,
    ExpectedAnalyzerRow,
    ExpectedAnalyzerRows,
    ExpectedQueueRow,
    ExpectedSupport,
    assert_expectation,
    execute_case,
    materialize_case,
)


EXPECTED_CASE_NAMES = (
    "showcase", "setting-recommendation", "behavioral-precedence",
    "basal-raise", "basal-lower", "basal-capped-raise",
    "basal-capped-lower", "basal-insufficient-seven-night",
    "basal-insufficient-unsupported-sign", "basal-blind",
    "basal-no-baseline", "basal-no-change",
    "basal-recurring-low-lower", "basal-recurring-low-no-clean-median",
    "basal-recurring-low-gate",
)


def _execution_and_span(case):
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
        with Store.open(database.name) as store:
            materialize_case(store, case)
        with sqlite3.connect(database.name) as conn:
            earliest = conn.execute(
                "SELECT MIN(t) FROM (SELECT t FROM basal_events UNION ALL "
                "SELECT t FROM cgm_readings UNION ALL SELECT t FROM bolus_events)"
            ).fetchone()[0]
            latest = conn.execute(
                "SELECT MAX(t) FROM (SELECT t FROM basal_events UNION ALL "
                "SELECT t FROM cgm_readings)"
            ).fetchone()[0]
        span = (datetime.fromisoformat(latest).date()
                - datetime.fromisoformat(earliest).date()).days + 1
        with Store.open_readonly(database.name) as store:
            return execute_case(store, case), span


def _execution(case):
    return _execution_and_span(case)[0]


class QaE2ECasesTest(unittest.TestCase):
    def test_catalog_names_the_existing_and_twelve_basal_cases(self):
        self.assertEqual(tuple(case.name for case in QA_CASES), EXPECTED_CASE_NAMES)

    def test_generated_case_methods_decode_to_the_catalog(self):
        decoded = {
            method._qa_case_name
            for name in dir(type(self)) if name.startswith("test_case_")
            for method in (getattr(type(self), name),)
        }
        self.assertEqual(decoded, {case.name for case in QA_CASES})

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

    def test_a_literal_default_row_is_load_bearing(self):
        case = next(case for case in QA_CASES if case.name == "basal-raise")
        rows = case.expectation.analyzer_rows
        perturbed_rows = replace(
            rows, default=replace(rows.default, safety_status="no change"),
        )
        perturbed = replace(
            case, expectation=replace(case.expectation, analyzer_rows=perturbed_rows),
        )
        with self.assertRaises(AssertionError):
            assert_expectation(perturbed, _execution(case))

    def test_exact_expectation_classes_reject_perturbations(self):
        case = next(case for case in QA_CASES if case.name == "basal-raise")
        execution = _execution(case)
        row_key = ("basal", "03:00")
        rows = case.expectation.analyzer_rows
        perturbations = (
            replace(case.expectation, analyzer_rows=replace(
                rows,
                overrides={**rows.overrides, row_key: replace(
                    rows[row_key], asserts_move=False,
                )},
            )),
            replace(case.expectation, support={
                **case.expectation.support,
                row_key: ExpectedSupport(directional_support_count=29),
            }),
            replace(case.expectation, queue_rows={
                **case.expectation.queue_rows,
                ("whole_day", row_key): ExpectedQueueRow("held", "raise", None),
            }),
            replace(
                case.expectation,
                queue_absences=(
                    case.expectation.queue_absences | {("whole_day", row_key)}
                ),
            ),
        )
        for expectation in perturbations:
            with self.subTest(expectation=expectation):
                with self.assertRaises(AssertionError):
                    assert_expectation(replace(case, expectation=expectation), execution)

    def test_showcase_exact_rest_windows_and_history_series_are_load_bearing(self):
        case = next(case for case in QA_CASES if case.name == "showcase")
        execution = _execution(case)
        perturbations = (
            replace(case.expectation, rest_windows=frozenset()),
            replace(case.expectation, history_series={}),
            replace(case.expectation, behavioral_rows=frozenset()),
            replace(case.expectation, finding_titles=frozenset()),
        )
        for expectation in perturbations:
            with self.subTest(expectation=expectation):
                with self.assertRaises(AssertionError):
                    assert_expectation(replace(case, expectation=expectation), execution)


def _case_test(case):
    def test(self):
        if case.target_family == "basal":
            rows = case.expectation.analyzer_rows
            self.assertIsInstance(rows, ExpectedAnalyzerRows)
            self.assertIsInstance(rows.default, ExpectedAnalyzerRow)
            self.assertEqual(len(rows), 48)
            self.assertTrue(rows.overrides)
            self.assertEqual(case.source_span_days, BASAL_SOURCE_SPAN_DAYS)
        execution, source_span = _execution_and_span(case)
        self.assertEqual(source_span, case.source_span_days)
        assert_expectation(case, execution)

    test.__name__ = f"test_case_{case.name.replace('-', '_')}"
    test._qa_case_name = case.name
    return test


for _case in QA_CASES:
    setattr(QaE2ECasesTest, f"test_case_{_case.name.replace('-', '_')}", _case_test(_case))
