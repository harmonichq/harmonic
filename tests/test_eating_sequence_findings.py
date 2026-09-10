"""Manufactured event-to-ownership contracts for sequence habit findings (#342)."""

import unittest
from dataclasses import replace
from datetime import timedelta

from ciq_autotune.analyzers.eating_sequence_config import EatingSequenceConfig
from ciq_autotune.analyzers.eating_sequences import build_sequences
from ciq_autotune.analyzers.scenario.engine import assemble
from ciq_autotune.events import CgmReading
from tests.eating_sequence_streams import sequence_episode_stream




class EatingSequenceFindingsTest(unittest.TestCase):
    def test_supported_empty_meal_episode_retains_sequence_finding(self):
        for lever, expected_n in (("high_carb_sequence", 40), ("repeat_eating", 16)):
            with self.subTest(lever=lever):
                bolus, cgm, carbs, basal = sequence_episode_stream(lever)
                report = assemble(bolus, cgm, basal, carb_entries=carbs)
                patterns = {p.lever.value: p for p in report.patterns + report.low_confidence}
                self.assertIn(lever, patterns)
                self.assertEqual((patterns[lever].confidence.k, patterns[lever].confidence.n), (8, expected_n))
                owned = [e for e in report.episodes.values() if e.lever.value == lever]
                self.assertTrue(all(e.severity > 0 for e in owned))
                self.assertTrue(all(not any(e.start <= b.t < e.end for b in bolus) for e in owned))


class SharedSequenceEvaluationTest(unittest.TestCase):
    def evaluate(self, lever, **kwargs):
        from ciq_autotune.analyzers.scenario.evaluation import evaluate
        bolus, cgm, carbs, basal = sequence_episode_stream(lever, **kwargs)
        return evaluate(bolus, cgm, basal, carb_entries=carbs), (bolus, cgm, carbs, basal)

    def test_observed_impact_reverses_ownership_without_resizing_episodes(self):
        from ciq_autotune.analyzers.scenario.levers import Lever
        for lever in ('high_carb_sequence', 'repeat_eating'):
            outcomes = []
            for competitor in ('mild', 'severe'):
                result, (b, c, log, basal) = self.evaluate(lever, competitor=competitor)
                contested = [e for e in result.episodes if any(x.lever.value == lever for x in e.candidates)
                             and any(x.lever is Lever.MISSED_MEAL for x in e.candidates)]
                self.assertEqual(len(contested), 8)
                expected = Lever(lever) if competitor == 'mild' else Lever.MISSED_MEAL
                self.assertTrue(all(e.attribution.lever is expected for e in contested))
                for e in contested:
                    self.assertEqual(result.candidate_impacts[e.attribution.lever], max(x.impact for x in e.candidates))
                report = assemble(b, c, basal, carb_entries=log)
                for p in report.patterns + report.low_confidence:
                    if p.lever in result.competing_levers:
                        self.assertEqual(p.confidence.effect, result.candidate_impacts[p.lever])
                outcomes.append([(e.start, e.end, e.severity, e.outcome_t) for e in contested])
            self.assertEqual(*outcomes)

    def test_exact_sequence_tie_prefers_repeat_and_ordinary_tie_keeps_driver(self):
        from ciq_autotune.analyzers.scenario.levers import Lever
        result, _ = self.evaluate('repeat_eating', covered=True, competitor=None)
        contested = [e for e in result.episodes if len(e.candidates) == 2]
        self.assertEqual(len(contested), 8)
        for e in contested:
            self.assertEqual({c.lever for c in e.candidates}, {Lever.REPEAT_EATING, Lever.HIGH_CARB_SEQUENCE})
            self.assertEqual(e.candidates[0].impact, e.candidates[1].impact)
            self.assertIs(e.attribution.lever, Lever.REPEAT_EATING)
        result, _ = self.evaluate('high_carb_sequence', competitor=None)
        for e in result.episodes:
            if any(c.sequence for c in e.candidates):
                self.assertEqual(e.candidates[0].impact, e.candidates[1].impact)
                self.assertIs(e.attribution.lever, Lever.MISSED_MEAL)

    def test_multiple_episodes_count_once_and_use_worst_member_price(self):
        from statistics import fmean
        from ciq_autotune.analyzers.scenario.evaluation import SEQUENCE_LEVERS
        from ciq_autotune.analyzers.scenario.engine import tally_attributions
        from ciq_autotune.analyzers.scenario.severity import normalized_severity
        for lever in ('high_carb_sequence', 'repeat_eating'):
            result, (b, c, log, basal) = self.evaluate(lever, multi=True)
            owned = [e for e in result.episodes if e.attribution.lever == lever]
            self.assertGreater(len(owned), 8)
            self.assertEqual(len({e.occurrence_id for e in owned}), 8)
            representatives = {}
            for e in result.episodes:
                for candidate in e.candidates:
                    if candidate.lever == lever:
                        representatives[candidate.occurrence_id] = max(
                            representatives.get(candidate.occurrence_id, 0), e.severity)
            self.assertEqual(result.candidate_impacts[lever],
                             fmean(normalized_severity(s) for s in representatives.values()))
            _, tally = tally_attributions(b, c, basal, carb_entries=log)
            self.assertEqual(tally[lever], 8)
            episodes = [e for e in result.episodes if e.attribution.lever is not None]
            self.assertTrue(all(a.end <= b.start for a, b in zip(episodes, episodes[1:])))
            report = assemble(b, c, basal, carb_entries=log)
            for pattern in report.patterns + report.low_confidence:
                self.assertLessEqual(pattern.confidence.k, pattern.confidence.n)
                if pattern.lever in SEQUENCE_LEVERS:
                    self.assertEqual(pattern.confidence.k, len(pattern.occurrence_groups))
                    self.assertGreater(sum(len(g['member_episode_ids']) for g in pattern.occurrence_groups), 8)

    def test_each_comparison_cohort_requires_eight_qualifying_sequences(self):
        from ciq_autotune.analyzers.scenario.evaluation import evaluate
        from ciq_autotune.events import CarbEntry
        for lever in ('high_carb_sequence', 'repeat_eating'):
            supported, (b, c, _, basal) = self.evaluate(lever, covered=True)
            rows = supported.sequences.populations[lever]
            for cohort in (True, False):
                cohort_rows = [r for r in rows if r.candidate == cohort]
                # Leave exactly seven in this cohort across every measured period.
                excluded = cohort_rows[7:]
                log = [CarbEntry(r.sequence.end + timedelta(minutes=1), 17.3, 'exact', 'manual')
                       for r in excluded]
                result = evaluate(b, c, basal, carb_entries=log)
                self.assertFalse(result.sequences.populations[lever])
                self.assertFalse(any(x.lever == lever for e in result.episodes for x in e.candidates))
                report = assemble(b, c, basal, carb_entries=log)
                self.assertNotIn(lever, {p.lever.value for p in report.patterns + report.low_confidence})

    def test_missing_cgm_and_next_sequence_overlap_withhold_candidates(self):
        from ciq_autotune.analyzers.scenario.evaluation import evaluate
        result, (b, c, _, basal) = self.evaluate('high_carb_sequence')
        empty = evaluate(b, [], basal)
        self.assertFalse(any(x.sequence for e in empty.episodes for x in e.candidates))
        # An overlapping later sequence excludes that period for the earlier one.
        source = result.sequences.populations['high_carb_sequence'][-1]
        extra = replace(b[-1], t=source.sequence.end + timedelta(hours=4), seq_num=9001, carbs=5)
        overlap = evaluate(b + [extra], c, basal)
        self.assertGreater(overlap.sequences.report.high_carb_sequence.exclusions['next_sequence_overlap'], 0)
        self.assertFalse(any(r.id == source.id for r in overlap.sequences.populations['high_carb_sequence']))

    def test_model_view_retains_losing_candidates_as_outranked(self):
        from ciq_autotune.analyzers.scenario.model_view import assemble_model_view
        result, (b, c, log, basal) = self.evaluate('high_carb_sequence')
        owned = next(e for e in result.episodes if e.attribution.lever == 'high_carb_sequence')
        view = assemble_model_view(b, c, basal, target=owned.anchors.end.date(), carb_entries=log)
        episode = next(e for e in view['episodes'] if e.get('evaluation_id') == owned.id)
        self.assertEqual(episode['lever'], 'high_carb_sequence')
        self.assertEqual({x['lever']: x['state'] for x in episode['candidates']},
                         {'high_carb_sequence': 'fired', 'missed_meal': 'outranked'})
        self.assertEqual(episode['outcome_minute'], owned.outcome_t.hour * 60 + owned.outcome_t.minute)
        self.assertTrue(any(a['state'] == 'outranked' for a in episode['anchors']))

    def test_low_outcome_witness_is_the_earliest_nadir(self):
        from ciq_autotune.analyzers.scenario.evaluation import evaluate
        result, (b, c, _, basal) = self.evaluate('high_carb_sequence', covered=True)
        rows = result.sequences.populations['high_carb_sequence']
        nadirs = {row.sequence.end + timedelta(minutes=80) for row in rows if row.candidate}
        lows = nadirs | {t + timedelta(minutes=5) for t in nadirs}
        c = [replace(r, bg=55) if r.t in lows else r for r in c]
        result = evaluate(b, c, basal)
        low_episodes = [e for e in result.episodes if e.worst_bg == 55 and any(x.sequence for x in e.candidates)]
        self.assertEqual(len(low_episodes), 8)
        self.assertTrue(all(e.outcome_t in nadirs for e in low_episodes))

    def test_store_model_view_uses_full_source_window_for_day_evidence(self):
        from types import SimpleNamespace
        from ciq_autotune.analyzers.scenario.model_view import build_model_view
        result, (b, c, log, basal) = self.evaluate('high_carb_sequence')
        owned = next(e for e in result.episodes if e.attribution.lever == 'high_carb_sequence')
        store = SimpleNamespace(bolus_events=lambda: b, cgm_readings=lambda: c,
                                basal_events=lambda: basal, carb_entries=lambda *args: log,
                                settings_snapshots=lambda: [], prompt_responses=lambda: [])
        view = build_model_view(store, owned.anchors.end.date())
        episode = next(e for e in view['episodes'] if e.get('evaluation_id') == owned.id)
        self.assertEqual(episode['lever'], 'high_carb_sequence')
        self.assertEqual({x['lever']: x['impact'] for x in episode['candidates']},
                         {x.lever.value: x.impact for x in owned.candidates})

    def test_all_meal_matches_are_retained_without_changing_legacy_owner(self):
        from ciq_autotune.analyzers.scenario.evaluation import evaluate
        from tests.test_scenario_engine import meal, suspend_run, cgm_flat, cgm_ramp
        m = meal(15, 12, 0, carbs=20.0, dose=2.0)
        basal = suspend_run(15, 13, 20, rows=12)
        cgm = (cgm_flat(15, 10, 0, 100.0, 120)
               + cgm_ramp(15, 12, 0, 100.0, 2.0, 80)
               + cgm_ramp(15, 13, 20, 260.0, -3.6, 55))
        result = evaluate([m], cgm, basal, isf=40)
        episode = next(e for e in result.episodes if e.attribution.lever == 'carb_undercount')
        self.assertIn('meal_over_delivery', {c.lever.value for c in episode.candidates})
        self.assertNotIn('meal_over_delivery', {e.attribution.lever for e in result.episodes})
        self.assertFalse(result.competing_levers)
        self.assertTrue(all(c.attribution.steps[0].citation['operation'] == f'scenario.attribution.{c.lever.value}'
                            for c in episode.candidates))

    def test_flat_candidate_sequence_is_not_an_outcome_occurrence(self):
        result, _ = self.evaluate('repeat_eating')
        self.assertTrue(any(e.severity == 0 for e in result.episodes))
        self.assertFalse(any(c.sequence is not None for e in result.episodes if e.severity == 0 for c in e.candidates))

    def test_supported_repeat_population_excludes_two_window_description(self):
        from ciq_autotune.events import BolusEvent
        from ciq_autotune.analyzers.scenario.evaluation import evaluate
        _, (b, c, _, basal) = self.evaluate('repeat_eating', covered=True)
        start = b[-1].t + timedelta(hours=12)
        for index in range(5):
            t = start + timedelta(hours=index * 8)
            b.append(BolusEvent(t, carbs=500 if index == 0 else 1, insulin=0.5, seq_num=9000 + index))
            if index == 0:
                b.append(BolusEvent(t + timedelta(minutes=31), carbs=500, insulin=0.5, seq_num=9010))
            c.extend(CgmReading(t + timedelta(minutes=m), 110) for m in range(0, 425, 5))
        result = evaluate(b, sorted(c, key=lambda r: r.t), basal)
        rows = result.sequences.populations['repeat_eating']
        self.assertEqual(len(rows), 16)
        self.assertTrue(all(row.sequence.window_count != 2 for row in rows))
        description = [row for row in result.sequences.report.repeat_eating_amplifier.matrix
                       if row.carb_quintile == 5 and row.window_count_band == '2']
        self.assertEqual(description[0].post_4h.n, 1)

    def test_model_view_consumes_retained_verdicts_without_reclassifying(self):
        from unittest.mock import patch
        from ciq_autotune.analyzers.scenario.model_view import assemble_model_view
        result, (b, c, log, basal) = self.evaluate('high_carb_sequence', covered=True)
        owned = next(e for e in result.episodes if e.attribution.lever == 'high_carb_sequence')
        with patch('ciq_autotune.analyzers.scenario.attribute.classify_carb_undercount',
                   side_effect=AssertionError('must consume the retained verdict')):
            view = assemble_model_view(b, c, basal, target=owned.anchors.end.date(), evaluated=result)
        episode = next(e for e in view['episodes'] if e.get('evaluation_id') == owned.id)
        self.assertEqual(episode['lever'], 'high_carb_sequence')
        self.assertTrue(episode['anchors'][0]['verdicts'])
