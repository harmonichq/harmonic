"""Sequence habit admission cannot change the Pattern's meals rate (#342)."""
import unittest
from types import SimpleNamespace
from datetime import datetime

from ciq_autotune.analyzers.scenario.engine import assemble
from ciq_autotune.analyzers.scenario.evaluation import evaluate
from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns
from ciq_autotune.analyzers.scenario.outcome_patterns import outcome_window_population
from ciq_autotune.explore_exposures import build_exposures
from ciq_autotune.window_membership import WindowQuery
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


class ScopedPatternPopulationTest(unittest.TestCase):
    def test_scoped_pattern_membership_uses_only_the_published_outcome_population(self):
        """A Pattern cannot roster a child that its scoped case file excludes."""
        inside = {
            'ep_id': 'inside-afternoon', 't': '2026-08-01 12:00:00', 'kind': 'meal',
            'attributed': False, 'attributed_levers': [], 'cause_lever': None,
            'cause_title': None, 'outcome_minute': 13 * 60,
        }
        outside = {
            'ep_id': 'outside-evening', 't': '2026-08-01 17:00:00', 'kind': 'meal',
            'attributed': True, 'attributed_levers': ['carb_undercount'],
            'member_associations': ['habit:carb_undercount'],
            'cause_lever': 'carb_undercount', 'cause_title': 'Carb undercount',
            'outcome_minute': 18 * 60,
        }
        exposures = {'exposures': {'meals': {
            'n': 2, 'attributed': 1, 'clean': 1, 'occurrences': [inside, outside],
        }}}
        scenarios = {'patterns': [{
            'lever': 'carb_undercount', 'priority': 40,
            'confidence': {'k': 12, 'n': 20, 'lo': .39, 'hi': .78},
            'guidance': {'action_id': 'carb_undercount', 'seriousness': 'moderate'},
        }], 'low_confidence': []}

        afternoon_population, afternoon_patterns = outcome_window_population(
            {}, exposures, scenarios, WindowQuery.clock(12 * 60, 14 * 60),
        )
        evening_population, evening_patterns = outcome_window_population(
            {}, exposures, scenarios, WindowQuery.clock(18 * 60, 20 * 60),
        )
        afternoon = next(row for row in afternoon_patterns if row['key'] == 'highs_after_meals')
        evening = next(row for row in evening_patterns if row['key'] == 'highs_after_meals')

        self.assertEqual([row['ep_id'] for row in afternoon_population['exposures']['meals']['occurrences']],
                         ['inside-afternoon'])
        self.assertEqual([row['subject'] for row in afternoon['members']], [])
        self.assertEqual((afternoon['k'], afternoon['n']), (0, 1))
        self.assertEqual(afternoon['readiness'], {'count': 1, 'gate': 12, 'verdict': 'withheld'})
        self.assertEqual([row['ep_id'] for row in evening_population['exposures']['meals']['occurrences']],
                         ['outside-evening'])
        self.assertEqual([(row['subject'], row['k']) for row in evening['members']],
                         [('habit:carb_undercount', 1)])
        self.assertEqual((evening['k'], evening['n']), (1, 1))

    def test_circular_half_open_window_uses_outcomes_not_antecedents(self):
        occurrences = [
            {
                "ep_id": "included-at-start", "t": "2026-08-01 22:00:00",
                "kind": "meal", "attributed": True,
                "attributed_levers": ["carb_undercount"],
                "cause_lever": "carb_undercount", "cause_title": "Carb undercount",
                "outcome_minute": 23 * 60 + 30,
            },
            {
                "ep_id": "included-after-midnight", "t": "2026-08-01 23:30:00",
                "kind": "meal", "attributed": True,
                "attributed_levers": ["late_bolus"],
                "cause_lever": "late_bolus", "cause_title": "Late bolus",
                "outcome_minute": 0,
            },
            {
                "ep_id": "excluded-at-end", "t": "2026-08-01 23:45:00",
                "kind": "meal", "attributed": True,
                "attributed_levers": ["carb_undercount"],
                "cause_lever": "carb_undercount", "cause_title": "Carb undercount",
                "outcome_minute": 60,
            },
            {
                "ep_id": "excluded-before-start", "t": "2026-08-02 00:15:00",
                "kind": "meal", "attributed": False, "attributed_levers": [],
                "cause_lever": None, "cause_title": None,
                "outcome_minute": 23 * 60 + 29,
            },
        ]
        exposures = {"exposures": {"meals": {
            "n": 4, "attributed": 3, "clean": 1,
            "occurrences": occurrences,
        }}}
        scenarios = {"patterns": [{
            "lever": "carb_undercount", "priority": 40,
            "confidence": {"k": 12, "n": 20, "lo": 0.39, "hi": 0.78},
            "guidance": {"action_id": "carb_undercount", "seriousness": "moderate"},
        }], "low_confidence": []}

        population, patterns = outcome_window_population(
            {}, exposures, scenarios, WindowQuery.clock(23 * 60 + 30, 60),
        )
        meals = population["exposures"]["meals"]
        pattern = next(row for row in patterns if row["key"] == "highs_after_meals")

        self.assertEqual(
            [row["ep_id"] for row in meals["occurrences"]],
            ["included-at-start", "included-after-midnight"],
        )
        self.assertEqual((pattern["k"], pattern["n"]), (2, 2))
        self.assertEqual(pattern["readiness"], {
            "count": 2, "gate": 12, "verdict": "withheld",
        })

    def test_rebound_high_scopes_low_identity_and_keeps_unattributed_low(self):
        attributed_low = {
            "ep_id": "attributed-low", "t": "2026-08-01 15:00:00",
            "kind": "low", "attributed": True,
            "attributed_levers": ["over_treated_low"],
            "cause_lever": "over_treated_low", "cause_title": "Over-treated low",
            "outcome_minute": 19 * 60,
        }
        unattributed_low = {
            "ep_id": "unattributed-low", "t": "2026-08-01 20:00:00",
            "kind": "low", "attributed": False, "attributed_levers": [],
            "cause_lever": None, "cause_title": None,
        }
        exposures = {"exposures": {
            "lows": {
                "n": 2, "attributed": 1, "clean": 1,
                "occurrences": [attributed_low, unattributed_low],
            },
            "highs": {
                "n": 1, "attributed": 0, "clean": 1,
                "occurrences": [{
                    "ep_id": "attributed-low", "t": "2026-08-01 19:00:00",
                    "kind": "high", "attributed": False, "attributed_levers": [],
                    "cause_lever": None, "cause_title": None,
                    "outcome_minute": 19 * 60,
                }],
            },
        }}
        scenarios = {"patterns": [{
            "lever": "over_treated_low", "priority": 35,
            "confidence": {"k": 12, "n": 20, "lo": 0.39, "hi": 0.78},
            "guidance": {"action_id": "over_treated_low", "seriousness": "moderate"},
        }], "low_confidence": []}

        afternoon_population, afternoon_patterns = outcome_window_population(
            {}, exposures, scenarios, WindowQuery.clock(14 * 60, 18 * 60),
        )
        evening_population, evening_patterns = outcome_window_population(
            {}, exposures, scenarios, WindowQuery.clock(18 * 60, 21 * 60),
        )
        afternoon = next(
            row for row in afternoon_patterns if row["key"] == "highs_after_treating_lows"
        )
        evening = next(
            row for row in evening_patterns if row["key"] == "highs_after_treating_lows"
        )

        self.assertEqual(afternoon_population["exposures"]["lows"]["occurrences"], [])
        self.assertEqual((afternoon["k"], afternoon["n"]), (0, 0))
        self.assertEqual(afternoon["readiness"], {
            "count": 0, "gate": 12, "verdict": "withheld",
        })
        self.assertEqual(
            [row["ep_id"] for row in evening_population["exposures"]["lows"]["occurrences"]],
            ["attributed-low", "unattributed-low"],
        )
        self.assertEqual((evening["k"], evening["n"]), (1, 2))
        self.assertEqual(evening["readiness"], {
            "count": 2, "gate": 12, "verdict": "withheld",
        })
