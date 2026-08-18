"""Text renderer tests — the CLI is a thin renderer over AnalysisResult."""

import unittest

from ciq_autotune.render import render_text
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
                             None, "your fasting data agrees with the set correction factor",
                             {"n_steps": 120})],
        ic=[SegmentEstimate(0, "00:00", "carb_ratio", 6.0,
                            Estimate(5.0, 4.5, 5.5, 5, 0.8, "bootstrap-mean"),
                            5.0, "under-covered", {"n_meals": 5})],
        behavioral=[Finding("correction-stacking", "high", "Corrections stacked.",
                            {"stacks": 6})],
    )


class RenderTextTest(unittest.TestCase):
    def setUp(self):
        self.text = render_text(_result())

    def test_includes_disclaimer(self):
        self.assertIn("not medical advice", self.text.lower())

    def test_shows_basal_estimate_and_ci(self):
        self.assertIn("00:00", self.text)
        self.assertIn("0.55", self.text)   # CI low edge
        self.assertIn("0.65", self.text)

    def test_empty_slot_renders_a_dash_not_a_crash(self):
        self.assertIn("00:30", self.text)

    def test_shows_isf_and_ic_sections(self):
        self.assertIn("ISF", self.text)
        self.assertIn("I:C", self.text)
        self.assertIn("35", self.text)   # measured ISF
        self.assertIn("5.0", self.text)  # measured I:C

    def test_shows_behavioral_findings(self):
        self.assertIn("correction-stacking", self.text)
        self.assertIn("high", self.text)

    def test_renders_data_quality_notes(self):
        self.assertIn("thin basal epoch", self.text)


if __name__ == "__main__":
    unittest.main()
