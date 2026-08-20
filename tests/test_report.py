"""Markdown report tests — report.py renders the same AnalysisResult as the CLI
text/JSON renderers (ROADMAP §5); no slot is blanked, evidence is shown not gated."""

import unittest

from ciq_autotune.backtest import BacktestResult
from ciq_autotune.report import markdown_report
from ciq_autotune.result import (
    SCHEMA_VERSION,
    AnalysisResult,
    DataQuality,
    EpochInfo,
    Finding,
    SegmentEstimate,
    SlotEstimate,
    Span,
)
from ciq_autotune.uncertainty import Estimate


def _result():
    return AnalysisResult(
        schema_version=SCHEMA_VERSION,
        generated_at="2026-06-29 14:00:00",
        window_days=30,
        span=Span(start="2026-05-30 00:00:00", end="2026-06-29 13:00:00"),
        epochs=[EpochInfo("isf", None, "2026-06-29 14:00:00", 30.0)],
        data_quality=DataQuality(counts={"cgm_readings": 2169}, notes=["thin basal epoch"]),
        basal=[SlotEstimate(0, "00:00", 0.6, Estimate(0.6, 0.55, 0.65, 4, 0.8, "bootstrap-median"),
                            0.6, "the measured rate and the set rate agree, so no change is suggested", 4),
               SlotEstimate(1, "00:30", None, Estimate(None, None, None, 0, 0.8, "none"),
                            None, "no nights of steady data at this time yet", 0)],
        isf=[SegmentEstimate(0, "Fasting", "isf", 36.0,
                             Estimate(35.0, 30.0, 41.0, 120, 0.8, "bootstrap-ols-isf"),
                             None, "fasting data agrees with the set factor",
                             {"n_steps": 120})],
        ic=[SegmentEstimate(0, "00:00", "carb_ratio", 6.0,
                            Estimate(5.0, 4.5, 5.5, 5, 0.8, "bootstrap-mean"),
                            5.0, "under-covered", {"n_meals": 5})],
        behavioral=[Finding("correction-stacking", "high", "Corrections stacked.",
                            {"stacks": 6})],
    )


def _backtest():
    return BacktestResult(
        holdout_days=2, train_days=28, test_clean_minutes=120,
        mae_suggested=0.12, n_suggested=120, mae_current=0.20, n_current=120,
        mae_suggested_matched=0.12, mae_current_matched=0.20, n_matched=120,
    )


class MarkdownReportTest(unittest.TestCase):
    def setUp(self):
        self.md = markdown_report(_result())

    def test_includes_disclaimer(self):
        self.assertIn("not medical advice", self.md.lower())

    def test_thin_slot_is_shown_not_blanked(self):
        # The no-blanking principle (ROADMAP §8): a zero-data slot still gets a
        # row and its note, not an omitted line.
        self.assertIn("00:30", self.md)
        self.assertIn("no nights of steady data at this time yet", self.md)

    def test_shows_basal_estimate_and_ci(self):
        self.assertIn("00:00", self.md)
        self.assertIn("0.55", self.md)
        self.assertIn("0.65", self.md)

    def test_shows_isf_and_ic_sections(self):
        self.assertIn("ISF", self.md)
        self.assertIn("I:C", self.md)
        self.assertIn("35.0", self.md)
        self.assertIn("5.0", self.md)

    def test_shows_behavioral_findings(self):
        self.assertIn("correction-stacking", self.md)
        self.assertIn("high", self.md)

    def test_shows_data_quality_notes(self):
        self.assertIn("thin basal epoch", self.md)

    def test_backtest_section_omitted_when_not_given(self):
        self.assertNotIn("Backtest", self.md)

    def test_shows_consolidated_pump_profile_derived_from_basal(self):
        # #87: even when the result didn't populate consolidated_basal, the report
        # derives the ≤16-segment deliverable schedule from the raw slots.
        self.assertIn("consolidated pump profile", self.md.lower())
        self.assertIn("/16 segments", self.md)
        self.assertIn("Total daily basal", self.md)


class MarkdownReportWithBacktestTest(unittest.TestCase):
    def setUp(self):
        self.md = markdown_report(_result(), _backtest())

    def test_backtest_section_present(self):
        self.assertIn("## Backtest", self.md)
        self.assertIn("0.12", self.md)
        self.assertIn("0.20", self.md)


if __name__ == "__main__":
    unittest.main()
