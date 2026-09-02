"""Public-interface coverage for the synthetic QA E2E case catalog."""

import sqlite3
import tempfile
import unittest
from dataclasses import replace
from datetime import date, datetime, timedelta
from unittest.mock import patch

from ciq_autotune.store import Store

from scripts.qa_e2e_cases import (
    BASAL_SOURCE_SPAN_DAYS,
    IC_SOURCE_SPAN_DAYS,
    ISF_SOURCE_SPAN_DAYS,
    QA_CASES,
    ExpectedAnalyzerRow,
    ExpectedAnalyzerRows,
    ExpectedQueueRow,
    ExpectedSupport,
    ExpectedVerdictTally,
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
    "isf-strengthen", "isf-direction-only-weaken", "isf-held",
    "ic-collecting", "ic-raise", "ic-lower", "ic-capped-raise",
    "ic-capped-lower", "ic-held", "ic-quiet-seven-run",
    "ic-history-register",
    "behavioral-carb-undercount",
    "behavioral-late-bolus",
    "behavioral-uncaused-highs",
    "behavioral-false-low-suppressed", "behavioral-low-no-suppressed",
    "behavioral-lone-correction-clean",
    "behavioral-meals-start-high",
    "behavioral-carb-counting", "behavioral-post-meal-correction-burden",
    "behavioral-meal-over-delivery",
    "behavioral-correction-stacking",
    "behavioral-over-treated-low",
    "behavioral-correction-on-iob",
    "behavioral-missed-meal", "behavioral-meal-bolus-short",
    "behavioral-carb-log-fasting-exclusion",
    "behavioral-preempted-detector",
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
    def test_existing_cases_reject_an_extra_behavioral_summary_expectation(self):
        case = next(case for case in QA_CASES if case.name == "behavioral-precedence")
        self.assertEqual(case.expectation.uncaused_highs, 0)
        execution = _execution(case)
        with self.assertRaises(AssertionError):
            assert_expectation(replace(
                case,
                expectation=replace(
                    case.expectation,
                    verdict_tallies={
                        ("carb_undercount", "meals"): ExpectedVerdictTally(
                            denominator=0,
                            counts={
                                "fired": 0,
                                "outranked": 0,
                                "near_miss": 0,
                                "no_data": 0,
                                "clean": 0,
                            },
                        ),
                    },
                ),
            ), execution)

    def test_carb_log_fasting_exclusion_changes_isf_support(self):
        case = next(
            case for case in QA_CASES
            if case.name == "behavioral-carb-log-fasting-exclusion"
        )
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                with patch.object(
                    Store, "upsert_carb_entry", autospec=True,
                ) as upsert_carb_entry:
                    materialize_case(store, case)
                upsert_carb_entry.assert_called_once()
            with Store.open_readonly(database.name) as store:
                execution = execute_case(store, case)
        fasting = next(
            row for row in execution.analysis["isf"] if row["label"] == "Fasting"
        )
        self.assertNotEqual(fasting["evidence"]["n_steps"], 102)

    def test_catalog_names_every_declared_coverage_case(self):
        self.assertEqual(tuple(case.name for case in QA_CASES), EXPECTED_CASE_NAMES)

    def test_representative_lever_cases_declare_their_family_spans(self):
        expected = {
            "isf-strengthen": ("isf", ISF_SOURCE_SPAN_DAYS),
            "ic-raise": ("ic", IC_SOURCE_SPAN_DAYS),
        }
        observed = {
            case.name: (case.target_family, case.source_span_days)
            for case in QA_CASES if case.name in expected
        }
        self.assertEqual(observed, expected)

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

    def test_direction_only_isf_never_stages_or_ranks(self):
        case = next(
            case for case in QA_CASES
            if case.name == "isf-direction-only-weaken"
        )
        execution = _execution(case)
        analyzer_row = execution.analysis["isf"][0]
        queue_row = next(
            row for row in execution.findings["whole_day"]["rows"]
            if row.get("parameter") == "isf"
        )
        self.assertEqual(analyzer_row["evidence"]["direction"], "weaken")
        self.assertIsNone(analyzer_row["recommended"])
        self.assertIs(analyzer_row["asserts_move"], False)
        self.assertNotIn("rank", queue_row)

    def test_capped_and_uncapped_ic_recommendations_are_distinct(self):
        expected = {
            "ic-raise": 11.0,
            "ic-capped-raise": 12.0,
            "ic-lower": 9.0,
            "ic-capped-lower": 8.0,
        }
        for name, recommendation in expected.items():
            with self.subTest(name=name):
                case = next(case for case in QA_CASES if case.name == name)
                row = _execution(case).analysis["ic_blocks"][0]
                self.assertEqual(row["recommended"], recommendation)


def _case_test(case):
    def test(self):
        if case.target_family == "basal":
            rows = case.expectation.analyzer_rows
            self.assertIsInstance(rows, ExpectedAnalyzerRows)
            self.assertIsInstance(rows.default, ExpectedAnalyzerRow)
            self.assertEqual(len(rows), 48)
            self.assertTrue(rows.overrides)
            self.assertEqual(case.source_span_days, BASAL_SOURCE_SPAN_DAYS)
        elif case.target_family == "isf":
            rows = case.expectation.analyzer_rows
            self.assertIsInstance(rows, ExpectedAnalyzerRows)
            self.assertIsInstance(rows.default, ExpectedAnalyzerRow)
            self.assertEqual(len(rows), 1)
            self.assertEqual(case.source_span_days, ISF_SOURCE_SPAN_DAYS)
        elif case.target_family == "ic":
            rows = case.expectation.analyzer_rows
            self.assertIsInstance(rows, ExpectedAnalyzerRows)
            self.assertIsInstance(rows.default, ExpectedAnalyzerRow)
            self.assertEqual(len(rows), 1)
            if rows.default.state == "collecting":
                self.assertEqual(case.source_span_days, 30)
            else:
                self.assertEqual(case.source_span_days, IC_SOURCE_SPAN_DAYS)
        execution, source_span = _execution_and_span(case)
        self.assertEqual(source_span, case.source_span_days)
        assert_expectation(case, execution)
        if case.name == "behavioral-correction-stacking":
            target_key = ("correction_stacking", "correction_clusters")
            target_tally = case.expectation.verdict_tallies[target_key]
            state_row = (
                "correction_clusters", "2024-05-24 14:40:00", "fired",
            )
            perturbations = (
                replace(
                    case.expectation,
                    behavioral_rows=(
                        case.expectation.behavioral_rows - {state_row}
                    ) | {
                        ("correction_clusters", "2024-05-24 14:40:00", "clean"),
                    },
                ),
                replace(
                    case.expectation,
                    verdict_tallies={
                        **case.expectation.verdict_tallies,
                        target_key: replace(target_tally, denominator=7),
                    },
                ),
                replace(
                    case.expectation,
                    verdict_tallies={
                        **case.expectation.verdict_tallies,
                        target_key: replace(target_tally, counts={
                            **target_tally.counts,
                            "outranked": 1,
                            "no_data": 3,
                        }),
                    },
                ),
            )
            for expectation in perturbations:
                with self.subTest(expectation=expectation):
                    with self.assertRaises(AssertionError):
                        assert_expectation(
                            replace(case, expectation=expectation), execution,
                        )

    test.__name__ = f"test_case_{case.name.replace('-', '_')}"
    test._qa_case_name = case.name
    return test


for _case in QA_CASES:
    setattr(QaE2ECasesTest, f"test_case_{_case.name.replace('-', '_')}", _case_test(_case))
