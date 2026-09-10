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
        from ciq_autotune.analyzers.scenario.evaluation import SEQUENCE_LEVERS
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
                    if p.lever in SEQUENCE_LEVERS:
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


def _ordinary_competition_stream():
    """Three undercount owners, three late owners, and one sequence contest."""
    from ciq_autotune.events import BolusEvent
    bolus, cgm, _, basal = sequence_episode_stream(
        "high_carb_sequence", covered=True, competitor=None,
    )
    t = bolus[-1].t
    bolus[-1] = replace(bolus[-1], carbs=80)
    # Two distinct same-time doses: the first matches late bolus, the stamped
    # second also matches undercount. Both stay inside the same bounded episode.
    bolus.append(BolusEvent(t, carbs=20, insulin=.5, carb_ratio=200,
                            completion="Completed", seq_num=999))
    for index, reading in enumerate(cgm):
        minute = (reading.t - t).total_seconds() / 60
        if -15 <= minute <= 0:
            cgm[index] = replace(reading, bg=110 + 4 * (minute + 15))
        elif 0 < minute < 60:
            cgm[index] = replace(reading, bg=185)
    for index in range(6):
        t = bolus[0].t - timedelta(hours=12 * (index + 1))
        late = index >= 3
        bolus.append(BolusEvent(t, carbs=20, insulin=.5,
                                carb_ratio=None if late else 40,
                                completion="Completed", seq_num=1000 + index * 2))
        if late:
            bolus.append(BolusEvent(t, carbs=10, insulin=.5, carb_ratio=40,
                                    completion="Completed", seq_num=1001 + index * 2))
        for minute in range(-30, 365, 5):
            glucose = 210 if 60 <= minute < 70 else 110
            if late and -15 <= minute <= 0:
                glucose = 110 + 4 * (minute + 15)
            elif late and 0 < minute < 60:
                glucose = 185
            cgm.append(CgmReading(t + timedelta(minutes=minute), glucose))
    return sorted(bolus, key=lambda b: b.t), sorted(cgm, key=lambda r: r.t), basal


def _crossing_reach_stream():
    """The late peak crosses the next group's short configured context bound."""
    from datetime import datetime
    from ciq_autotune.analyzers.scenario_config import ScenarioConfig
    from ciq_autotune.events import BolusEvent
    start = datetime(2040, 2, 1, 12)
    b = [BolusEvent(start, carbs=20, insulin=.5, carb_ratio=40, completion="Completed")]
    c = [CgmReading(start + timedelta(minutes=m),
                    350 if 180 <= m < 200 else 250 if 130 <= m < 180 else 110)
         for m in range(-5, 365, 5)]
    config = ScenarioConfig(segment_max_duration_min=120, engine_context_pad_min=5,
                            carb_undercount_runaway_peak_mgdl=260)
    return b, c, config


class ReviewRegressionTest(unittest.TestCase):
    def test_sequence_winner_is_excluded_from_clean_rates_and_trends(self):
        from ciq_autotune.analyzers.scenario import tally_attributions
        from ciq_autotune.outcomes import summarize_outcomes
        from ciq_autotune.outcomes_trend import summarize_trend
        from tests.test_outcomes_trend import _FakeStore
        for lever, meals in (("high_carb_sequence", 40), ("repeat_eating", 100)):
            with self.subTest(lever=lever):
                b, c, log, basal = sequence_episode_stream(lever)
                _, attributed = tally_attributions(b, c, basal)
                self.assertEqual(attributed[lever], 8)
                store = _FakeStore(bolus=b, cgm=c, basal=basal, carbs=log)
                summary = summarize_outcomes(store, window_days=40)
                self.assertEqual([(r.exposure, r.n, r.attributed) for r in summary.clean_rates],
                                 [("meals", meals, 0), ("lows", 0, 0),
                                  ("correction_clusters", 0, 0), ("highs", 9, 1)])
                trend = summarize_trend(store, window_days=40)
                self.assertEqual([r.lever for r in trend.behaviors],
                                 ["late_bolus", "carb_undercount", "meal_over_delivery",
                                  "over_treated_low", "correction_on_iob", "correction_stacking",
                                  "missed_meal", "meal_bolus_short"])

    def test_ordinary_effect_uses_only_owned_episodes_when_sequences_compete(self):
        from ciq_autotune.analyzers.scenario.evaluation import evaluate
        from ciq_autotune.events import CarbEntry
        b, c, basal = _ordinary_competition_stream()
        effects = []
        owners = []
        for enabled in (False, True):
            # Exclude sequence comparisons only; leave every ordinary event intact.
            log = [] if enabled else [CarbEntry(x.t + timedelta(minutes=1), 17.3,
                                                "exact", "manual") for x in b]
            evaluated = evaluate(b, c, basal, isf=40, carb_entries=log)
            matched = [e for e in evaluated.episodes
                       if any(x.lever == "carb_undercount" for x in e.candidates)]
            self.assertEqual(len(matched), 7)
            self.assertEqual(sum(e.attribution.lever == "late_bolus" for e in matched),
                             3 if enabled else 4)
            if enabled:
                self.assertEqual(matched[-1].attribution.lever, "high_carb_sequence")
            owners.append([(e.start, e.end, e.severity) for e in matched
                           if e.attribution.lever == "carb_undercount"])
            report = assemble(b, c, basal, isf=40, carb_entries=log)
            pattern = next(p for p in report.patterns + report.low_confidence
                           if p.lever == "carb_undercount")
            self.assertEqual(pattern.confidence.k, 3)
            effects.append((pattern.confidence.effect, pattern.confidence.score))
        self.assertEqual(*owners)
        self.assertEqual(*effects)

    def test_sequence_population_keys_match_closed_levers_and_policy(self):
        from ciq_autotune.analyzers.scenario.evaluation import evaluate
        from ciq_autotune.analyzers.scenario.levers import Lever
        from ciq_autotune.analyzers.scenario.evidence_population import policy_for
        expected = {Lever.HIGH_CARB_SEQUENCE.value, Lever.REPEAT_EATING.value}
        for lever in expected:
            b, c, log, basal = sequence_episode_stream(lever)
            result = evaluate(b, c, basal, carb_entries=log)
            self.assertEqual(set(result.sequences.populations), expected)
            self.assertEqual(policy_for(lever).sequence_lever, lever)
            self.assertTrue(result.sequences.populations[lever])

    def test_tally_preserves_classifier_reach_beyond_next_group(self):
        from ciq_autotune.analyzers.scenario import tally_attributions, attributed_occurrences
        from ciq_autotune.analyzers.scenario.evaluation import evaluate
        b, c, config = _crossing_reach_stream()
        start = b[0].t
        result = evaluate(b, c, isf=40, scenario_config=config)
        self.assertLess(result.episodes[1].start + timedelta(minutes=5),
                        start + timedelta(minutes=180))
        self.assertGreater(result.episodes[0].anchors.end, result.episodes[1].start)
        _, tally = tally_attributions(b, c, isf=40, scenario_config=config)
        self.assertEqual(tally.get("carb_undercount", 0), 1)
        occurrences = attributed_occurrences(b, c, isf=40, scenario_config=config)
        self.assertEqual(sum(r.lever == "carb_undercount" for r in occurrences), 1)

    def test_assemble_preserves_base_attribution_on_crossing_reach(self):
        b, c, config = _crossing_reach_stream()
        report = assemble(b, c, isf=40, scenario_config=config)
        # The base's bounded classifier cannot see the decisive later peak;
        # no episode or Pattern is emitted. The tally's wider read is pinned above.
        self.assertEqual(report.episodes, {})
        self.assertEqual(report.patterns, [])
        self.assertEqual(report.low_confidence, [])
