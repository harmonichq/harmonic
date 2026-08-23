"""Outcome-summary tests (#113) — deterministic, stdlib unittest, no DB/network.

Covers the four things the issue's acceptance criteria name: the glycemic metrics
math on a synthetic CGM series; the coverage gate (≥14 d @ ≥70% vs sub-threshold
labelling); clean-rate derivation including a thin-exposure wide-interval case;
OutcomeSummary JSON-serializability; and both the CLI (markdown) and API renderers.

The metrics/coverage/clean-rate layers are pure functions of their inputs, so they
are exercised directly on synthetic data. The store-facing ``summarize_outcomes``
and the two renderers run against a tiny in-memory fake store (metrics-only path) and
a real TestClient (API path); neither touches SQLite or the network.
"""

from __future__ import annotations

import json
import unittest
from datetime import datetime, timedelta
from unittest import mock

from ciq_autotune.analyzers.scenario.levers import Exposure, Lever
from ciq_autotune.events import CgmReading
from ciq_autotune.outcomes import (
    CONSENSUS_MIN_COVERAGE,
    CONSENSUS_MIN_DAYS,
    SCHEMA_VERSION,
    OutcomeSummary,
    compute_clean_rates,
    compute_coverage,
    compute_metrics,
    markdown_outcomes,
    summarize_outcomes,
)
from tests.test_scenario_engine import ISF, dose_stamped_ic_fixture

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False


def _series(values, *, start=datetime(2026, 6, 1, 0, 0, 0), step_min=5):
    """A CGM series with one reading per ``value`` at a fixed 5-min cadence."""
    return [
        CgmReading(start + timedelta(minutes=step_min * i), bg=float(v))
        for i, v in enumerate(values)
    ]


class MetricsMathTest(unittest.TestCase):
    def test_panel_on_a_known_series(self):
        # 10 readings, hand-chosen so every bucket has a known count:
        #   <54: [50]           → 1
        #   <70: [50, 65]       → 2
        #   70–180: [70,120,150,180] → 4
        #   >180: [200,260,300] → 3      (>250: [260,300] → 2)
        vals = [50, 65, 70, 120, 150, 180, 200, 260, 300, 90]
        m = compute_metrics(_series(vals))
        self.assertEqual(m.n_readings, 10)
        # 70–180 inclusive: 70,120,150,180,90 → 5
        self.assertEqual(m.tir, 50.0)
        self.assertEqual(m.tbr_lvl1, 20.0)   # <70: 50,65
        self.assertEqual(m.tbr_lvl2, 10.0)   # <54: 50
        self.assertEqual(m.tar_lvl1, 30.0)   # >180: 200,260,300
        self.assertEqual(m.tar_lvl2, 20.0)   # >250: 260,300
        self.assertAlmostEqual(m.mean_glucose, sum(vals) / len(vals), places=1)

    def test_gmi_and_cv_formulas(self):
        # A flat 100 mg/dL series: GMI = 3.31 + 0.02392*100 = 5.702 → 5.7; CV = 0.
        m = compute_metrics(_series([100] * 20))
        self.assertEqual(m.gmi, 5.7)
        self.assertEqual(m.cv, 0.0)
        self.assertEqual(m.mean_glucose, 100.0)

    def test_empty_series_is_none_not_zero(self):
        m = compute_metrics([])
        self.assertEqual(m.n_readings, 0)
        for v in (m.tir, m.mean_glucose, m.gmi, m.cv, m.tbr_lvl1):
            self.assertIsNone(v)

    def test_none_bg_readings_dropped(self):
        readings = _series([100, 100]) + [CgmReading(datetime(2026, 6, 2), bg=None)]
        m = compute_metrics(readings)
        self.assertEqual(m.n_readings, 2)


class CoverageGateTest(unittest.TestCase):
    def test_full_14d_at_over_70pct_clears_consensus(self):
        # 15 days of full 288/day cadence → ~100% coverage over 15 d.
        n = int(288 * 15)
        readings = _series([120] * n)
        cov = compute_coverage(readings, span_days=15.0)
        self.assertTrue(cov.consensus)
        self.assertGreaterEqual(cov.cgm_active, CONSENSUS_MIN_COVERAGE * 100)
        self.assertGreaterEqual(cov.days, CONSENSUS_MIN_DAYS)

    def test_sub_threshold_days_labelled_not_faked(self):
        # 12 days of full coverage — clears the 70% bar but not the 14-day bar.
        n = int(288 * 12)
        cov = compute_coverage(_series([120] * n), span_days=12.0)
        self.assertFalse(cov.consensus)
        self.assertEqual(cov.days, 12.0)

    def test_sub_threshold_coverage_labelled_not_faked(self):
        # 14 days of span but only half the expected readings → ~50% coverage.
        n = int(288 * 14 * 0.5)
        cov = compute_coverage(_series([120] * n), span_days=14.0)
        self.assertFalse(cov.consensus)
        self.assertLess(cov.cgm_active, CONSENSUS_MIN_COVERAGE * 100)
        self.assertAlmostEqual(cov.cgm_active, 50.0, delta=1.0)

    def test_coverage_capped_at_100(self):
        # Denser-than-cadence backfill can push observed over expected; cap at 100.
        n = int(288 * 14 * 1.3)
        cov = compute_coverage(_series([120] * n), span_days=14.0)
        self.assertLessEqual(cov.cgm_active, 100.0)


class CleanRateTest(unittest.TestCase):
    def test_derivation_is_one_minus_rate(self):
        # 100 meals, 4 attributed to a meal lever → clean point ≈ 0.96.
        exposure = {Exposure.MEALS: 100, Exposure.LOWS: 0,
                    Exposure.CORRECTION_CLUSTERS: 0, Exposure.HIGHS: 0}
        attributed = {Lever.CARB_UNDERCOUNT: 3, Lever.LATE_BOLUS: 1}  # both → MEALS
        rates = {c.exposure: c for c in compute_clean_rates(exposure, attributed)}
        meals = rates["meals"]
        self.assertEqual(meals.n, 100)
        self.assertEqual(meals.attributed, 4)   # both meal levers rolled up
        self.assertAlmostEqual(meals.clean, 0.96, places=2)
        self.assertLessEqual(meals.clean_lo, meals.clean)
        self.assertGreaterEqual(meals.clean_hi, meals.clean)

    def test_all_four_exposures_always_present_in_order(self):
        rates = compute_clean_rates({}, {})
        self.assertEqual([c.exposure for c in rates],
                         ["meals", "lows", "correction_clusters", "highs"])

    def test_thin_exposure_is_wide_never_blank(self):
        # A single meal with a single attribution: n=1 → wide, but still a value.
        exposure = {Exposure.MEALS: 1}
        attributed = {Lever.CARB_UNDERCOUNT: 1}
        meals = compute_clean_rates(exposure, attributed)[0]
        self.assertEqual(meals.n, 1)
        self.assertTrue(meals.wide)                 # thin sample → wide interval
        self.assertIsNotNone(meals.clean)           # never blank
        # A wide interval spans a real chunk of [0, 1], not a collapsed point.
        self.assertGreater(meals.clean_hi - meals.clean_lo, 0.2)

    def test_thin_widens_relative_to_thick(self):
        thin = compute_clean_rates({Exposure.MEALS: 4},
                                   {Lever.CARB_UNDERCOUNT: 2})[0]
        thick = compute_clean_rates({Exposure.MEALS: 400},
                                    {Lever.CARB_UNDERCOUNT: 200})[0]
        self.assertGreater(thin.clean_hi - thin.clean_lo,
                           thick.clean_hi - thick.clean_lo)

    def test_attribution_never_exceeds_exposure(self):
        # Defensive clamp: k can't exceed n, so clean stays in [0, 1].
        meals = compute_clean_rates({Exposure.MEALS: 2},
                                    {Lever.CARB_UNDERCOUNT: 5})[0]
        self.assertEqual(meals.attributed, 2)
        self.assertGreaterEqual(meals.clean, 0.0)


class _FakeStore:
    """A minimal store stand-in: just the read methods summarize_outcomes calls.

    No SQLite. ``settings_snapshots`` is empty so the clean-rate path runs with
    ``isf=None`` (carb-undercount simply can't attribute) — the metrics/coverage
    layers are what this fake exercises end-to-end without a DB.
    """

    def __init__(self, cgm, bolus=()):
        self._cgm = cgm
        self._bolus = bolus

    def basal_events(self):
        return []

    def bolus_events(self):
        return list(self._bolus)

    def cgm_readings(self):
        return list(self._cgm)

    def settings_snapshots(self):
        return []

    def prompt_responses(self):
        return []


class SummarizeAndJsonTest(unittest.TestCase):
    def test_unstamped_meal_reduces_carb_undercount_clean_rate_attribution(self):
        bolus, cgm = dose_stamped_ic_fixture()
        with mock.patch("ciq_autotune.outcomes._effective_isf", return_value=ISF):
            summary = summarize_outcomes(
                _FakeStore(cgm, bolus), window_days=14,
                now=datetime(2026, 6, 19),
            )

        meals = next(r for r in summary.clean_rates
                     if r.exposure == Exposure.MEALS.value)
        self.assertEqual(meals.n, 4)
        self.assertEqual(meals.attributed, 3)

    def test_summarize_over_fake_store_is_json_serializable(self):
        now = datetime(2026, 6, 20, 0, 0, 0)
        start = now - timedelta(days=14)
        # 14 days of readings ending at ``now`` at 5-min cadence.
        n = int(288 * 14)
        cgm = [CgmReading(start + timedelta(minutes=5 * i), bg=120.0)
               for i in range(n) if start + timedelta(minutes=5 * i) <= now]
        summary = summarize_outcomes(_FakeStore(cgm), window_days=14, now=now)
        self.assertIsInstance(summary, OutcomeSummary)
        self.assertEqual(summary.schema_version, SCHEMA_VERSION)
        self.assertEqual(summary.window_days, 14)
        self.assertEqual(len(summary.clean_rates), 4)
        # Round-trips through JSON cleanly (the API contract).
        body = json.loads(summary.to_json())
        self.assertEqual(body["schema_version"], SCHEMA_VERSION)
        self.assertIn("metrics", body)
        self.assertIn("coverage", body)
        self.assertEqual(len(body["clean_rates"]), 4)

    def test_full_window_with_late_first_reading_clears_consensus(self):
        # #113 review: the first CGM reading can land a few seconds INSIDE the
        # window (the ``now − 14d`` boundary rarely aligns with a 5-min egv time), so
        # the data span is a hair under 14 days. A full window at good coverage must
        # still clear the gate — the sub-interval shortfall is quantization, not a
        # missing day.
        now = datetime(2026, 6, 20, 0, 0, 0)
        first = now - timedelta(days=14) + timedelta(seconds=37)
        cgm, t = [], first
        while t <= now:
            cgm.append(CgmReading(t, bg=120.0))
            t += timedelta(minutes=5)
        cov = summarize_outcomes(_FakeStore(cgm), window_days=14, now=now).coverage
        self.assertGreaterEqual(cov.cgm_active, 70.0)
        self.assertTrue(cov.consensus)

    def test_short_data_span_stays_subthreshold(self):
        # Guard the tolerance from swallowing a real shortfall: only ~10 days of
        # data in a 14-day window is a genuine gap, not quantization, and must
        # remain sub-threshold.
        now = datetime(2026, 6, 20, 0, 0, 0)
        first = now - timedelta(days=10)
        cgm, t = [], first
        while t <= now:
            cgm.append(CgmReading(t, bg=120.0))
            t += timedelta(minutes=5)
        cov = summarize_outcomes(_FakeStore(cgm), window_days=14, now=now).coverage
        self.assertFalse(cov.consensus)

    def test_now_defaults_to_latest_data_not_wallclock(self):
        # Old data, no ``now`` passed — must summarize its own tail, not empty
        # (wall-clock now would place the window years after the data).
        base = datetime(2020, 1, 1, 0, 0, 0)
        cgm = [CgmReading(base + timedelta(minutes=5 * i), bg=120.0)
               for i in range(288 * 10)]
        summary = summarize_outcomes(_FakeStore(cgm), window_days=14)
        self.assertGreater(summary.metrics.n_readings, 0)

    def test_empty_store_summarizes_without_error(self):
        summary = summarize_outcomes(_FakeStore([]), window_days=14,
                                     now=datetime(2026, 6, 20))
        self.assertEqual(summary.metrics.n_readings, 0)
        self.assertIsNone(summary.metrics.tir)
        self.assertFalse(summary.coverage.consensus)
        self.assertEqual(len(summary.clean_rates), 4)


class CliRendererTest(unittest.TestCase):
    def _sample_summary(self):
        now = datetime(2026, 6, 20, 0, 0, 0)
        start = now - timedelta(days=14)
        cgm = [CgmReading(start + timedelta(minutes=5 * i), bg=120.0)
               for i in range(288 * 14)
               if start + timedelta(minutes=5 * i) <= now]
        return summarize_outcomes(_FakeStore(cgm), window_days=14, now=now)

    def test_markdown_renderer_covers_both_layers(self):
        md = markdown_outcomes(self._sample_summary())
        self.assertIn("outcome summary", md.lower())
        self.assertIn("Glycemic metrics", md)
        self.assertIn("Time in range", md)
        self.assertIn("Clean rates", md)
        self.assertIn("meals", md)

    def test_markdown_labels_sub_threshold_span(self):
        # A short window → below the consensus gate → the renderer must label it.
        now = datetime(2026, 6, 10, 0, 0, 0)
        start = now - timedelta(days=5)
        cgm = [CgmReading(start + timedelta(minutes=5 * i), bg=120.0)
               for i in range(288 * 5)
               if start + timedelta(minutes=5 * i) <= now]
        summary = summarize_outcomes(_FakeStore(cgm), window_days=5, now=now)
        md = markdown_outcomes(summary)
        self.assertIn("Below the consensus gate", md)


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class ApiRendererTest(unittest.TestCase):
    def setUp(self):
        import tempfile

        from ciq_autotune.store import Store
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        with Store.open(self.tmp.name) as store:
            cgm = []
            for d in range(1, 16):  # 15 days of full-cadence readings
                t0 = datetime(2026, 6, d, 0, 0, 0)
                for k in range(288):
                    tt = t0 + timedelta(minutes=5 * k)
                    cgm.append({"EventDateTime": tt.strftime("%Y-%m-%dT%H:%M:%S"),
                                "Readings (CGM / BGM)": 120, "Description": "EGV"})
            store.upsert_cgm(cgm)
        from ciq_autotune.api import create_app
        self.app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp.close()

    def test_outcomes_endpoint_returns_versioned_summary(self):
        r = self.client.get("/api/outcomes", params={"window": 14})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["schema_version"], SCHEMA_VERSION)
        self.assertEqual(body["window_days"], 14)
        self.assertIn("metrics", body)
        self.assertIn("coverage", body)
        self.assertEqual(len(body["clean_rates"]), 4)
        # Full-cadence 14+ day data clears the consensus gate.
        self.assertTrue(body["coverage"]["consensus"])
        self.assertIsNotNone(body["metrics"]["tir"])

    def test_outcomes_window_param_flows_through(self):
        r = self.client.get("/api/outcomes", params={"window": 30})
        self.assertEqual(r.json()["window_days"], 30)


if __name__ == "__main__":
    unittest.main()
