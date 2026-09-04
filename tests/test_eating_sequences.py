"""Eating-sequence aggregate report contract tests (#274)."""

import json
import unittest
from dataclasses import FrozenInstanceError

from ciq_autotune.analyzers.eating_sequence_config import EatingSequenceConfig
from ciq_autotune.analyzers.eating_sequences import (
    REPORT_SCHEMA,
    EatingSequenceReport,
    HighCarbComparisonRow,
    HighCarbFinding,
    HighCarbSequenceReport,
    IntervalAggregate,
    MatrixRow,
    MetricRow,
    QuintileRow,
    QuintileScope,
    RepeatComparisonRow,
    RepeatEatingAmplifierReport,
    RepeatEatingFinding,
    SequenceItem,
    SourceWindow,
    aggregate_interval,
    assign_quintiles,
    empty_report,
    report_dict,
)
from tests.eating_sequence_streams import high_carb_stream


class EatingSequenceConfigTest(unittest.TestCase):
    def test_defaults_are_frozen_detector_rules(self):
        config = EatingSequenceConfig()

        self.assertEqual(config.window_merge_minutes, 30.0)
        self.assertEqual(config.sequence_gap_hours, 3.0)
        self.assertEqual(config.in_sequence_tail_minutes, 5.0)
        self.assertEqual(config.post_horizons_hours, (4, 6))
        self.assertEqual(config.tir_low_mgdl, 70)
        self.assertEqual(config.tir_high_mgdl, 180)
        self.assertIsInstance(config.tir_low_mgdl, int)
        self.assertIsInstance(config.tir_high_mgdl, int)
        self.assertEqual(config.cgm_coverage_floor, 0.7)
        self.assertEqual(config.minimum_bucket_n, 8)
        self.assertEqual(config.quintile_count, 5)
        self.assertEqual(config.evening_start_hour, 18)
        self.assertEqual(config.evening_end_hour, 24)
        self.assertEqual(config.window_count_bands, ("1", "2", "3+"))
        with self.assertRaises(FrozenInstanceError):
            config.minimum_bucket_n = 9


class QuintileAssignmentTest(unittest.TestCase):
    def test_assigns_balanced_quintiles_and_boundaries(self):
        items = [SequenceItem(carb_total=float(n * 7), sequence_start=f"s{n:02}")
                 for n in range(10)]

        assigned = assign_quintiles(items, config=EatingSequenceConfig())

        self.assertEqual([row.quintile for row in assigned.rows],
                         [1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
        self.assertEqual(assigned.boundaries_g, (10.5, 24.5, 38.5, 52.5))

    def test_ties_use_sequence_start_and_small_populations_stay_balanced(self):
        items = [
            SequenceItem(carb_total=21.0, sequence_start="s3"),
            SequenceItem(carb_total=21.0, sequence_start="s1"),
            SequenceItem(carb_total=21.0, sequence_start="s2"),
        ]

        assigned = assign_quintiles(items, config=EatingSequenceConfig())

        self.assertEqual([row.item.sequence_start for row in assigned.rows],
                         ["s1", "s2", "s3"])
        self.assertEqual([row.quintile for row in assigned.rows], [1, 2, 4])
        self.assertEqual(assigned.boundaries_g, (21.0, 21.0, 21.0, 21.0))

    def test_non_divisible_population_uses_the_pinned_rank_and_boundary_formula(self):
        items = [SequenceItem(carb_total=float(n * 10), sequence_start=f"s{n:02}")
                 for n in range(13)]

        assigned = assign_quintiles(items, config=EatingSequenceConfig())

        self.assertEqual([row.quintile for row in assigned.rows],
                         [1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 5])
        self.assertEqual(assigned.boundaries_g, (25.0, 55.0, 75.0, 105.0))


class IntervalAggregateTest(unittest.TestCase):
    def test_thin_evidence_is_visible_but_non_concluding(self):
        rows = [MetricRow(tir_pct=61.0, mean_mgdl=141.0, sd_mgdl=26.0, peak_mgdl=193.0)
                for _ in range(7)]

        aggregate = aggregate_interval(rows, config=EatingSequenceConfig())

        self.assertEqual(aggregate.status, "insufficient")
        self.assertEqual(aggregate.n, 7)
        self.assertEqual(
            (aggregate.tir_pct, aggregate.mean_mgdl, aggregate.sd_mgdl, aggregate.peak_mgdl),
            (None, None, None, None),
        )

    def test_supported_aggregate_uses_per_sequence_medians(self):
        rows = [MetricRow(tir_pct=float(n), mean_mgdl=float(n * 10),
                          sd_mgdl=float(n + 4), peak_mgdl=float(n * 20))
                for n in range(1, 9)]

        aggregate = aggregate_interval(rows, config=EatingSequenceConfig())

        self.assertEqual(aggregate.status, "supported")
        self.assertEqual(aggregate.n, 8)
        self.assertEqual(
            (aggregate.tir_pct, aggregate.mean_mgdl, aggregate.sd_mgdl, aggregate.peak_mgdl),
            (4.5, 45.0, 8.5, 90.0),
        )


class EmptyReportTest(unittest.TestCase):
    def test_empty_report_is_a_complete_aggregate_only_skeleton(self):
        payload = report_dict(empty_report(SourceWindow(
            start="2040-01-01T00:00:00",
            end="2040-01-31T00:00:00",
            days=30,
        )))

        self.assertEqual(json.loads(json.dumps(payload))["schema"], REPORT_SCHEMA)
        self.assertEqual(set(payload), {"schema", "window", "definitions",
                                        "high_carb_sequence", "repeat_eating_amplifier"})
        self.assertEqual(set(payload["window"]), {"start", "end", "days"})
        self.assertEqual(json.dumps(payload["definitions"]["tir_range_mgdl"]), "[70, 180]")
        self.assertEqual(len(payload["high_carb_sequence"]["comparisons"]), 6)
        self.assertEqual(len(payload["repeat_eating_amplifier"]["matrix"]), 15)
        self.assertEqual(len(payload["repeat_eating_amplifier"]["comparisons"]), 15)

        for scope in ("pooled", "evening"):
            rows = payload["high_carb_sequence"]["scopes"][scope]["rows"]
            self.assertEqual([row["quintile"] for row in rows], [1, 2, 3, 4, 5])
            self.assertEqual(payload["high_carb_sequence"]["scopes"][scope]["boundaries_g"],
                             [None, None, None, None])
            for row in rows:
                self.assertEqual(row["sequence_n"], 0)
                self._assert_insufficient_intervals(row)

        for row in payload["repeat_eating_amplifier"]["matrix"]:
            self._assert_insufficient_intervals(row)
        for group in (payload["high_carb_sequence"]["comparisons"],
                      payload["repeat_eating_amplifier"]["comparisons"]):
            for row in group:
                self.assertEqual(row["status"], "insufficient")
                self.assertEqual(
                    (row["tir_difference_pct_points"], row["mean_difference_mgdl"],
                     row["sd_difference_mgdl"]),
                    (None, None, None),
                )

        self._assert_only_window_timestamps(payload)

    def test_populated_report_serializes_aggregate_findings_and_metrics(self):
        aggregate = IntervalAggregate(
            status="supported", n=8, tir_pct=63.125, mean_mgdl=147.875,
            sd_mgdl=31.625, peak_mgdl=271.375,
        )
        scope = QuintileScope(
            boundaries_g=(19.25, 37.75, 58.25, 83.75),
            rows=(QuintileRow(5, 8, aggregate, aggregate, aggregate),),
        )
        high_carb = HighCarbSequenceReport(
            status="supported",
            finding=HighCarbFinding(
                summary="Synthetic evening association.", scope="evening", period="post_4h",
            ),
            pooled=scope,
            evening=scope,
            comparisons=(HighCarbComparisonRow(
                scope="evening", period="post_4h", status="supported", reference_n=8,
                high_n=8, tir_difference_pct_points=13.875, mean_difference_mgdl=18.625,
                sd_difference_mgdl=4.125,
            ),),
            exclusions={"cgm_coverage": 0, "carb_log_contamination": 0,
                        "next_sequence_overlap": 0},
        )
        repeat = RepeatEatingAmplifierReport(
            status="supported",
            finding=RepeatEatingFinding(
                summary="Synthetic repeat association.", carb_quintile=5, period="post_4h",
            ),
            matrix=(MatrixRow(5, "3+", aggregate, aggregate, aggregate),),
            comparisons=(RepeatComparisonRow(
                carb_quintile=5, period="post_4h", status="supported", reference_n=8,
                repeat_n=8, tir_difference_pct_points=13.875, mean_difference_mgdl=18.625,
                sd_difference_mgdl=4.125,
            ),),
            exclusions={"cgm_coverage": 0, "carb_log_contamination": 0,
                        "next_sequence_overlap": 0},
        )
        payload = report_dict(EatingSequenceReport(
            window=SourceWindow("2040-02-01T00:00:00", "2040-03-01T00:00:00", 29),
            config=EatingSequenceConfig(), high_carb_sequence=high_carb,
            repeat_eating_amplifier=repeat,
        ))

        self.assertEqual(payload["high_carb_sequence"]["finding"], {
            "summary": "Synthetic evening association.", "scope": "evening", "period": "post_4h",
        })
        self.assertEqual(payload["repeat_eating_amplifier"]["finding"], {
            "summary": "Synthetic repeat association.", "carb_quintile": 5, "period": "post_4h",
        })
        interval = payload["high_carb_sequence"]["scopes"]["evening"]["rows"][0]["post_4h"]
        self.assertEqual(interval["status"], "supported")
        self.assertTrue(all(interval[key] is not None for key in (
            "tir_pct", "mean_mgdl", "sd_mgdl", "peak_mgdl",
        )))
        comparison = payload["high_carb_sequence"]["comparisons"][0]
        self.assertEqual(comparison["status"], "supported")
        self.assertTrue(all(comparison[key] is not None for key in (
            "tir_difference_pct_points", "mean_difference_mgdl", "sd_difference_mgdl",
        )))
        self._assert_only_window_timestamps(payload)

    def _assert_insufficient_intervals(self, row):
        for period in ("in_sequence", "post_4h", "post_6h"):
            aggregate = row[period]
            self.assertEqual(aggregate["status"], "insufficient")
            self.assertEqual(aggregate["n"], 0)
            self.assertEqual(
                (aggregate["tir_pct"], aggregate["mean_mgdl"], aggregate["sd_mgdl"],
                 aggregate["peak_mgdl"]),
                (None, None, None, None),
            )

    def _assert_only_window_timestamps(self, value, path=()):
        if isinstance(value, dict):
            for key, child in value.items():
                child_path = path + (key,)
                if key in {"start", "end"}:
                    self.assertEqual(child_path[:1], ("window",))
                    continue
                self.assertNotIn("event", key.lower())
                self._assert_only_window_timestamps(child, child_path)
        elif isinstance(value, list):
            for child in value:
                self._assert_only_window_timestamps(child, path)
        elif isinstance(value, str):
            self.assertNotRegex(value, r"^\d{4}-\d\d-\d\d[ T]")


class EatingSequenceDetectorTest(unittest.TestCase):
    def test_build_report_chains_windows_and_ignores_corrections(self):
        from datetime import datetime, timedelta
        from ciq_autotune.analyzers.eating_sequences import build_report
        from ciq_autotune.events import BolusEvent

        start = datetime(2040, 2, 3, 12)
        boluses = [
            BolusEvent(start, carbs=11.3),
            BolusEvent(start + timedelta(minutes=20), carbs=12.7),
            BolusEvent(start + timedelta(minutes=50), carbs=None),
            BolusEvent(start + timedelta(hours=3, minutes=20), carbs=23.9),
            BolusEvent(start + timedelta(hours=6, minutes=21), carbs=31.1),
        ]
        report = build_report(
            boluses, [], [], window_start=start,
            window_end=start + timedelta(hours=8), config=EatingSequenceConfig(),
        )

        rows = report.high_carb_sequence.pooled.rows
        self.assertEqual(sum(row.sequence_n for row in rows), 2)
        self.assertEqual(report.high_carb_sequence.pooled.boundaries_g, (39.5, 39.5, 47.9, 47.9))

    def test_build_report_constructs_supported_high_carb_association(self):
        from ciq_autotune.analyzers.eating_sequences import build_report

        boluses, cgm, carb_log, _ = high_carb_stream()
        report = build_report(
            boluses, cgm, carb_log,
            window_start=boluses[0].t,
            window_end=cgm[-1].t,
            config=EatingSequenceConfig(),
        )

        payload = report_dict(report)
        self.assertEqual(payload["high_carb_sequence"]["status"], "supported")
        self.assertIsNotNone(payload["high_carb_sequence"]["finding"])
        self.assertIn("highest-carb fifth", payload["high_carb_sequence"]["finding"]["summary"])

    def test_sd_only_adversity_uses_the_spread_summary(self):
        from ciq_autotune.analyzers.eating_sequences import build_report

        boluses, cgm, carb_log, _ = high_carb_stream(sd_only=True)
        report = build_report(
            boluses, cgm, carb_log,
            window_start=boluses[0].t,
            window_end=cgm[-1].t,
            config=EatingSequenceConfig(),
        )

        finding = report_dict(report)["high_carb_sequence"]["finding"]
        self.assertIsNotNone(finding)
        self.assertIn("glucose spread", finding["summary"])

    def test_store_wrapper_uses_basal_as_a_bound_only_and_slices_events(self):
        from datetime import timedelta
        from ciq_autotune.analyzers.eating_sequences import build_eating_sequence_report

        boluses, cgm, carb_log, basal = high_carb_stream(count=1)
        end = cgm[-1].t + timedelta(hours=2)
        basal = [basal[0].__class__(end, "Profile")]

        class Store:
            def basal_events(self): return basal
            def cgm_readings(self): return cgm
            def bolus_events(self): return boluses
            def carb_entries(self): return carb_log

        report = build_eating_sequence_report(Store())
        self.assertEqual(report.window.end, end.isoformat())
        self.assertEqual(report.window.start, (end - timedelta(days=30)).isoformat())
        self.assertEqual(report.high_carb_sequence.pooled.rows[0].sequence_n, 1)
