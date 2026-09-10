"""Sequence habit admission cannot change the Pattern's meals rate (#342)."""
import unittest
from types import SimpleNamespace
from datetime import datetime

from ciq_autotune.analyzers.scenario.engine import assemble
from ciq_autotune.analyzers.scenario.evaluation import evaluate
from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns
from ciq_autotune.explore_exposures import build_exposures
from tests.eating_sequence_streams import sequence_episode_stream


class SequenceHabitPatternTest(unittest.TestCase):
    def test_covered_and_empty_winners_admit_without_rate_claims(self):
        for lever in ('high_carb_sequence', 'repeat_eating'):
            for covered in (False, True):
                with self.subTest(lever=lever, covered=covered):
                    b, c, log, basal = sequence_episode_stream(lever, covered=covered)
                    store = SimpleNamespace(bolus_events=lambda: b, cgm_readings=lambda: c,
                                            basal_events=lambda: basal, carb_entries=lambda: log,
                                            settings_snapshots=lambda: [], prompt_responses=lambda: [])
                    scenarios = assemble(b, c, basal, carb_entries=log).to_dict()
                    evaluated = evaluate(b, c, basal, carb_entries=log)
                    exposures = build_exposures(store)
                    meals = exposures['exposures']['meals']['occurrences']
                    pattern = next(p for p in build_outcome_patterns({}, exposures, scenarios)
                                   if p['key'] == 'highs_after_meals')
                    subject = f'habit:{lever}'
                    member = next(m for m in pattern['members'] if m['subject'] == subject)
                    own = next(p for p in scenarios['patterns'] + scenarios['low_confidence'] if p['lever'] == lever)
                    self.assertTrue(member['admitted'])
                    self.assertEqual(member['k'], 8)
                    self.assertEqual(member['price'], own['priority'])
                    self.assertEqual(pattern['admission_route'], 'habit_threshold')
                    self.assertNotIn(subject, pattern['rate_levers'])
                    self.assertNotIn('habit:high_carb_sequence', pattern['rate_levers'])
                    self.assertNotIn('habit:repeat_eating', pattern['rate_levers'])
                    self.assertIn('habit:meal_bolus_short', pattern['rate_levers'])
                    self.assertEqual(pattern['n'], len(meals))
                    self.assertEqual(pattern['k'], 0)
                    self.assertTrue(all(lever not in m['attributed_levers'] for m in meals))
                    owned = [e for e in evaluated.episodes if e.attribution.lever == lever]
                    expected = {m['t'] for m in meals if any(
                        e.start <= datetime.fromisoformat(m['t']) < e.end for e in owned)}
                    actual = {m['t'] for m in meals if subject in m.get('member_associations', [])}
                    self.assertEqual(actual, expected)
                    self.assertEqual(bool(actual), covered)
                    evidence = exposures['sequence_evidence'][lever]
                    self.assertEqual(len({e['id'] for e in evidence['occurrences']}), 8)
                    self.assertEqual(len(evidence['population']), own['confidence']['n'])
