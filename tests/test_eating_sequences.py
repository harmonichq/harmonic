"""Eating-sequence aggregate report contract tests (#274)."""

import json
import unittest
from datetime import datetime, timedelta
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
from tests.eating_sequence_streams import high_carb_stream, repeat_eating_stream


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
    def test_public_sequence_primitive_pins_window_merge_boundaries(self):
        from ciq_autotune.analyzers.eating_sequences import build_sequences
        from ciq_autotune.events import BolusEvent

        start = datetime(2040, 2, 3, 12)
        exact = build_sequences([
            BolusEvent(start, carbs=11.3),
            BolusEvent(start + timedelta(minutes=30), carbs=12.7),
        ], config=EatingSequenceConfig())
        split = build_sequences([
            BolusEvent(start, carbs=11.3),
            BolusEvent(start + timedelta(minutes=31), carbs=12.7),
        ], config=EatingSequenceConfig())
        corrected = build_sequences([
            BolusEvent(start, carbs=11.3),
            BolusEvent(start + timedelta(minutes=20), carbs=None),
            BolusEvent(start + timedelta(minutes=40), carbs=12.7),
        ], config=EatingSequenceConfig())

        self.assertEqual((len(exact), exact[0].window_count), (1, 1))
        self.assertEqual((len(split), split[0].window_count), (1, 2))
        self.assertEqual((len(corrected), corrected[0].window_count), (1, 2))

    def _report(self, boluses, cgm=(), carb_log=(), *, config=None, hours=24):
        from ciq_autotune.analyzers.eating_sequences import build_report

        start = datetime(2040, 2, 3, 12)
        return build_report(boluses, cgm, carb_log, window_start=start,
                            window_end=start + timedelta(hours=hours),
                            config=config or EatingSequenceConfig())

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

    def test_construction_includes_exact_boundaries_and_evening_membership(self):
        from ciq_autotune.events import BolusEvent

        start = datetime(2040, 2, 3, 12)
        report = self._report([
            BolusEvent(start, carbs=11.3),
            BolusEvent(start + timedelta(minutes=30), carbs=12.7),
            BolusEvent(start + timedelta(minutes=61), carbs=13.9),
            BolusEvent(start + timedelta(hours=4, minutes=2), carbs=15.1),
        ])
        self.assertEqual(sum(row.sequence_n for row in report.high_carb_sequence.pooled.rows), 2)
        evening = self._report([
            BolusEvent(start.replace(hour=17, minute=59), carbs=11.3),
            BolusEvent((start + timedelta(days=1)).replace(hour=18), carbs=12.7),
            BolusEvent((start + timedelta(days=2)).replace(hour=23, minute=59), carbs=13.9),
        ], hours=80)
        self.assertEqual(sum(row.sequence_n for row in evening.high_carb_sequence.evening.rows), 2)

    def test_assignment_precedes_eligibility_and_evening_reuses_boundaries(self):
        from ciq_autotune.events import BolusEvent, CgmReading

        start = datetime(2040, 2, 3, 18)
        boluses = [BolusEvent(start + timedelta(hours=index * 8), carbs=11.3 + index * 2.7)
                   for index in range(10)]
        cgm = [CgmReading(bolus.t + timedelta(minutes=minute), 111.3)
               for bolus in boluses[:8] for minute in range(0, 365, 5)]
        report = self._report(boluses, cgm, hours=80)
        q5 = report.high_carb_sequence.pooled.rows[4]
        self.assertEqual(q5.sequence_n, 2)
        self.assertEqual(q5.post_4h.n, 0)
        self.assertEqual(report.high_carb_sequence.evening.boundaries_g,
                         report.high_carb_sequence.pooled.boundaries_g)

    def test_coverage_and_exclusion_counts_follow_pinned_order(self):
        from ciq_autotune.events import BolusEvent, CgmReading
        from tests.eating_sequence_streams import carb_entry

        start = datetime(2040, 2, 3, 12)
        config = EatingSequenceConfig(minimum_bucket_n=1, in_sequence_tail_minutes=50)
        bolus = BolusEvent(start, carbs=11.3)
        seven = [CgmReading(start + timedelta(minutes=index * 5), 111.3) for index in range(7)]
        seven += [CgmReading(start + timedelta(minutes=index * 5), 111.3)
                  for index in range(10, 73)]
        report = self._report([bolus], seven, config=config)
        self.assertEqual(report.high_carb_sequence.pooled.rows[0].in_sequence.n, 1)
        six = self._report([bolus], [reading for reading in seven
                                     if reading.t != start + timedelta(minutes=30)], config=config)
        self.assertEqual(six.high_carb_sequence.exclusions["cgm_coverage"], 1)
        contaminated = self._report([bolus], seven + [CgmReading(start + timedelta(hours=5), 111.3)],
                                    [carb_entry(start + timedelta(hours=5))], config=config)
        self.assertEqual(contaminated.high_carb_sequence.exclusions["carb_log_contamination"], 1)
        early = self._report([bolus], seven, [carb_entry(start + timedelta(hours=2))], config=config)
        self.assertEqual(early.high_carb_sequence.exclusions["carb_log_contamination"], 2)

    def test_carb_log_horizon_is_half_open(self):
        from ciq_autotune.events import BolusEvent, CgmReading
        from tests.eating_sequence_streams import carb_entry

        start = datetime(2040, 2, 3, 12)
        bolus = BolusEvent(start, carbs=11.3)
        config = EatingSequenceConfig(minimum_bucket_n=1)
        cgm = [CgmReading(start + timedelta(minutes=minute), 111.3)
               for minute in range(0, 365, 5)]
        at_start = self._report([bolus], cgm, [carb_entry(start)], config=config)
        at_end = self._report([bolus], cgm, [carb_entry(start + timedelta(hours=4))], config=config)
        self.assertEqual(at_start.high_carb_sequence.exclusions["carb_log_contamination"], 3)
        self.assertEqual(at_end.high_carb_sequence.exclusions["carb_log_contamination"], 1)

    def test_overlap_excludes_post_six_only_before_coverage(self):
        from ciq_autotune.events import BolusEvent, CgmReading

        start = datetime(2040, 2, 3, 12)
        config = EatingSequenceConfig(minimum_bucket_n=1)
        first, next_ = BolusEvent(start, carbs=11.3), BolusEvent(start + timedelta(hours=5), carbs=17.3)
        cgm = [CgmReading(start + timedelta(minutes=minute), 111.3) for minute in range(0, 665, 5)]
        report = self._report([first, next_], cgm, config=config)
        self.assertEqual(report.high_carb_sequence.exclusions["next_sequence_overlap"], 1)
        self.assertEqual(report.high_carb_sequence.exclusions["cgm_coverage"], 0)

    def test_non_adverse_and_empty_reports_do_not_conclude(self):
        from ciq_autotune.events import BolusEvent, CgmReading

        start = datetime(2040, 2, 3, 12)
        start = start.replace(hour=18)
        boluses = [BolusEvent(start + timedelta(hours=index * 8), carbs=11.3 + index * 2.7)
                   for index in range(40)]
        cgm = [CgmReading(bolus.t + timedelta(minutes=minute), 201.3 if index < 32 else 111.3)
               for index, bolus in enumerate(boluses) for minute in range(0, 365, 5)]
        report = self._report(boluses, cgm, hours=320)
        self.assertEqual(report.high_carb_sequence.status, "insufficient")
        self.assertIsNone(report.high_carb_sequence.finding)
        empty = self._report([])
        self.assertTrue(all(row.sequence_n == 0 for row in empty.high_carb_sequence.pooled.rows))
        self.assertEqual(empty.high_carb_sequence.pooled.boundaries_g, (None, None, None, None))
        self.assertEqual(empty.window.days, 1)
        repeat = empty.repeat_eating_amplifier
        self.assertEqual(repeat.status, "insufficient")
        self.assertIsNone(repeat.finding)
        self.assertEqual(
            [(row.carb_quintile, row.window_count_band) for row in repeat.matrix],
            [(quintile, band) for quintile in range(1, 6) for band in ("1", "2", "3+")],
        )
        self.assertTrue(all(
            aggregate.n == 0 and aggregate.status == "insufficient"
            for row in repeat.matrix
            for aggregate in (row.in_sequence, row.post_4h, row.post_6h)
        ))
        self.assertEqual(
            [(row.carb_quintile, row.period) for row in repeat.comparisons],
            [(quintile, period) for quintile in range(1, 6)
             for period in ("in_sequence", "post_4h", "post_6h")],
        )
        self.assertTrue(all(
            row.status == "insufficient" and row.reference_n == row.repeat_n == 0
            for row in repeat.comparisons
        ))
        self.assertEqual(repeat.exclusions, {
            "cgm_coverage": 0,
            "carb_log_contamination": 0,
            "next_sequence_overlap": 0,
        })

    def test_pre_window_events_do_not_construct_a_sequence(self):
        from ciq_autotune.events import BolusEvent

        start = datetime(2040, 2, 3, 12)
        from ciq_autotune.analyzers.eating_sequences import build_report
        report = build_report([BolusEvent(start - timedelta(minutes=1), carbs=11.3)], [], [],
                              window_start=start, window_end=start + timedelta(days=2),
                              config=EatingSequenceConfig())
        self.assertTrue(all(row.sequence_n == 0 for row in report.high_carb_sequence.pooled.rows))

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

    def test_repeat_eating_bands_three_and_four_windows_together_and_finds_tir_drop(self):
        from ciq_autotune.analyzers.eating_sequences import build_report

        boluses, cgm, carb_log, _ = repeat_eating_stream()
        report = build_report(boluses, cgm, carb_log, window_start=boluses[0].t,
                              window_end=cgm[-1].t, config=EatingSequenceConfig())

        repeat = report.repeat_eating_amplifier
        q5_rows = [row for row in repeat.matrix if row.carb_quintile == 5]
        self.assertEqual([(row.window_count_band, row.post_4h.n) for row in q5_rows],
                         [("1", 8), ("2", 0), ("3+", 8)])
        self.assertEqual(repeat.status, "supported")
        self.assertIsNotNone(repeat.finding)
        self.assertIn("spent", repeat.finding.summary)
        self.assertEqual(repeat.finding.period, "post_4h")

    def test_repeat_eating_tir_drop_outranks_a_spread_rise(self):
        from ciq_autotune.analyzers.eating_sequences import build_report

        boluses, cgm, carb_log, _ = repeat_eating_stream(sd_only=True)
        repeat_start = boluses[0].t + timedelta(hours=64 * 8)
        cgm = [reading.__class__(
            reading.t, 211.7 if reading.t >= repeat_start and reading.t.minute % 20 == 0 else reading.bg,
        ) for reading in cgm]
        report = build_report(boluses, cgm, carb_log, window_start=boluses[0].t,
                              window_end=cgm[-1].t, config=EatingSequenceConfig())

        finding = report.repeat_eating_amplifier.finding
        self.assertIsNotNone(finding)
        self.assertIn("spent", finding.summary)

    def test_repeat_matrix_keeps_two_windows_descriptive_and_in_order(self):
        from ciq_autotune.analyzers.eating_sequences import build_report, build_sequences

        boluses, cgm, carb_log, _ = repeat_eating_stream(two_count=4, repeat_count=4)
        sequences = build_sequences(boluses, config=EatingSequenceConfig())
        self.assertEqual({sequence.window_count for sequence in sequences[64:]}, {1, 2, 3, 4})
        report = build_report(boluses, cgm, carb_log, window_start=boluses[0].t,
                              window_end=cgm[-1].t, config=EatingSequenceConfig())

        self.assertEqual([(row.carb_quintile, row.window_count_band) for row in report.repeat_eating_amplifier.matrix],
                         [(quintile, band) for quintile in range(1, 6) for band in ("1", "2", "3+")])
        q5_rows = [row for row in report.repeat_eating_amplifier.matrix if row.carb_quintile == 5]
        self.assertEqual([(row.window_count_band, row.post_4h.n) for row in q5_rows],
                         [("1", 8), ("2", 4), ("3+", 4)])

    def test_repeat_bands_follow_the_detector_configuration(self):
        from ciq_autotune.analyzers.eating_sequences import build_report

        config = EatingSequenceConfig(window_count_bands=("single", "two", "repeated"))
        boluses, cgm, carb_log, _ = repeat_eating_stream()
        report = build_report(boluses, cgm, carb_log, window_start=boluses[0].t,
                              window_end=cgm[-1].t, config=config)

        q5_rows = [row for row in report.repeat_eating_amplifier.matrix if row.carb_quintile == 5]
        self.assertEqual([(row.window_count_band, row.post_4h.n) for row in q5_rows],
                         [("single", 8), ("two", 0), ("repeated", 8)])
        comparison = next(row for row in report.repeat_eating_amplifier.comparisons
                          if row.carb_quintile == 5 and row.period == "post_4h")
        self.assertEqual((comparison.reference_band, comparison.repeat_band),
                         ("single", "repeated"))

    def test_repeat_eating_sd_only_adversity_uses_spread_template(self):
        from ciq_autotune.analyzers.eating_sequences import build_report

        boluses, cgm, carb_log, _ = repeat_eating_stream(sd_only=True)
        report = build_report(boluses, cgm, carb_log, window_start=boluses[0].t,
                              window_end=cgm[-1].t, config=EatingSequenceConfig())

        finding = report.repeat_eating_amplifier.finding
        self.assertIsNotNone(finding)
        self.assertIn("glucose spread", finding.summary)

    def test_two_window_band_is_descriptive_when_repeat_band_is_thin(self):
        from ciq_autotune.analyzers.eating_sequences import build_report

        boluses, cgm, carb_log, _ = repeat_eating_stream(two_count=8, repeat_count=7)
        report = build_report(boluses, cgm, carb_log, window_start=boluses[0].t,
                              window_end=cgm[-1].t, config=EatingSequenceConfig())

        repeat = report.repeat_eating_amplifier
        row = next(row for row in repeat.matrix
                   if row.carb_quintile == 5 and row.window_count_band == "2")
        self.assertEqual((row.post_4h.status, row.post_4h.n), ("supported", 8))
        self.assertEqual(repeat.status, "insufficient")
        self.assertIsNone(repeat.finding)

    def test_two_window_band_cannot_substitute_for_the_single_window_reference(self):
        from ciq_autotune.analyzers.eating_sequences import build_report

        boluses, cgm, carb_log, _ = repeat_eating_stream(two_count=8, repeat_count=8)
        report = build_report(boluses, cgm, carb_log, window_start=boluses[0].t,
                              window_end=cgm[-1].t, config=EatingSequenceConfig())

        comparison = next(row for row in report.repeat_eating_amplifier.comparisons
                          if row.carb_quintile == 5 and row.period == "post_4h")
        self.assertEqual((comparison.status, comparison.reference_n, comparison.repeat_n),
                         ("insufficient", 0, 8))
        self.assertIsNone(report.repeat_eating_amplifier.finding)

    def test_repeat_eating_supported_non_adverse_comparison_does_not_conclude(self):
        from ciq_autotune.analyzers.eating_sequences import build_report

        boluses, cgm, carb_log, _ = repeat_eating_stream(repeat_count=8)
        cgm = [reading.__class__(reading.t, 111.3) for reading in cgm]
        report = build_report(boluses, cgm, carb_log, window_start=boluses[0].t,
                              window_end=cgm[-1].t, config=EatingSequenceConfig())

        comparison = next(row for row in report.repeat_eating_amplifier.comparisons
                          if row.carb_quintile == 5 and row.period == "post_4h")
        self.assertEqual(comparison.status, "supported")
        self.assertEqual(comparison.tir_difference_pct_points, 0.0)
        self.assertEqual(report.repeat_eating_amplifier.status, "insufficient")
        self.assertIsNone(report.repeat_eating_amplifier.finding)

    def test_repeat_eating_reuses_high_carb_exclusions(self):
        from ciq_autotune.analyzers.eating_sequences import build_report
        from ciq_autotune.events import BolusEvent, CgmReading
        from tests.eating_sequence_streams import carb_entry

        start = datetime(2040, 2, 3, 12)
        boluses = [BolusEvent(start, carbs=11.3), BolusEvent(start + timedelta(hours=5), carbs=17.3)]
        cgm = [CgmReading(start + timedelta(minutes=minute), 111.3)
               for minute in range(0, 665, 5) if minute != 300]
        report = build_report(boluses, cgm, [carb_entry(start + timedelta(hours=2))],
                              window_start=start, window_end=cgm[-1].t,
                              config=EatingSequenceConfig(minimum_bucket_n=1))

        self.assertEqual(report.repeat_eating_amplifier.exclusions,
                         report.high_carb_sequence.exclusions)
        self.assertTrue(all(count > 0 for count in report.high_carb_sequence.exclusions.values()))

    def test_tir_drop_outranks_a_larger_sd_only_comparison(self):
        from ciq_autotune.analyzers.eating_sequences import build_report
        from ciq_autotune.events import BolusEvent, CgmReading

        start = datetime(2040, 2, 3, 12)
        boluses, cgm = [], []
        for index in range(40):
            meal = start + timedelta(hours=index * 8)
            high = index >= 32
            boluses.extend((BolusEvent(meal, carbs=11.3 + index * 2.7),
                            BolusEvent(meal + timedelta(minutes=30), carbs=12.7)))
            for minute in range(0, 391, 5):
                value = 111.3
                if high and minute < 35:
                    value = 91.3 if minute % 10 else 171.3
                elif high and minute < 55:
                    value = 211.7
                cgm.append(CgmReading(meal + timedelta(minutes=minute), value))
        report = build_report(boluses, cgm, [], window_start=start,
                              window_end=start + timedelta(hours=320),
                              config=EatingSequenceConfig())

        finding = report.high_carb_sequence.finding
        self.assertIsNotNone(finding)
        self.assertIn("in range against", finding.summary)

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
