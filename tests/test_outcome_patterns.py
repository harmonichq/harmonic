"""Sequence habit admission cannot change the Pattern's meals rate (#342)."""
import unittest
from types import SimpleNamespace
from datetime import datetime, timedelta

from ciq_autotune.analyzers.scenario.engine import assemble
from ciq_autotune.analyzers.scenario.evaluation import evaluate
from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns
from ciq_autotune.analyzers.scenario.outcome_patterns import outcome_window_population
from ciq_autotune.explore_exposures import build_exposures
from ciq_autotune.window_membership import WindowQuery
from tests.eating_sequence_streams import sequence_episode_stream


SPLIT_MEAL_NOON = datetime(2024, 5, 3, 12, 0)
FMT = "%Y-%m-%d %H:%M:%S"


def write_split_meals(store, *, gap, peak=360.0, days=14):
    """Write ``days`` synthetic noon meals from 2024-05-03 into a real ``Store``.

    Each meal is a 45 g / 4.5 U bolus, plus a 20 g / 2 U top-up ``gap`` minutes later
    unless ``gap`` is None. Glucose is flat at 110, climbs 2 mg/dL/min from the first
    bolus to ``peak``, then falls; the settings snapshot and flat background are the
    behavioral QA lane's.
    """
    from scripts.qa_e2e_cases import _materialize_behavioral_background

    _materialize_behavioral_background(store, span_days=30)
    for day in range(days):
        noon = SPLIT_MEAL_NOON + timedelta(days=day)
        rows, bg, t, climbing = [], 110.0, noon - timedelta(minutes=30), True
        while t <= noon + timedelta(hours=5):
            if t > noon:
                bg = min(peak, bg + 10.0) if climbing else max(110.0, bg - 5.0)
                climbing = climbing and bg < peak
            rows.append({"EventDateTime": t.strftime(FMT), "Readings (CGM / BGM)": bg,
                         "Description": "Synthetic EGV"})
            t += timedelta(minutes=5)
        store.upsert_cgm(rows)
        doses = [(200_000 + day, noon, 4.5, 45.0)]
        if gap is not None:
            doses.append((300_000 + day, noon + timedelta(minutes=gap), 2.0, 20.0))
        store.upsert_bolus([{
            "seq_num": seq_num, "request_time": at.strftime(FMT),
            "description": "Synthetic meal bolus", "completion": "Completed",
            "insulin": insulin, "requested_insulin": insulin, "carbs": carbs,
            "carb_ratio": 10.0, "isf": 40.0, "target_bg": 110.0,
        } for seq_num, at, insulin, carbs in doses])


def write_late_meals(store, *, post_peak, top_up=False):
    """Write fourteen synthetic late noon meals, every other day from 2024-05-03.

    Each meal climbs 2 mg/dL/min from 120 to 160 at a 45 g / 4.5 U bolus. With a
    ``post_peak`` of 165 or less glucose reads 165 once after the bolus and falls to
    80; above it, it holds at or under 180 for forty minutes, climbs on to
    ``post_peak`` sixty minutes after the bolus and falls, so only an arc read past
    a +10 top-up's grace finds the high. No low, suspend or earlier
    carb bolus explains the climb. ``top_up`` adds a 20 g / 2 U top-up ten minutes
    after each bolus.
    """
    from scripts.qa_e2e_cases import _materialize_behavioral_background

    first = _materialize_behavioral_background(store, span_days=30)
    lane = datetime.combine(first, datetime.min.time())
    for day in range(2, 30, 2):
        noon = lane + timedelta(days=day, hours=12)
        after = ([165.0, 150.0, 130.0, 110.0, 95.0, 85.0, 80.0] if post_peak <= 165
                 else [165.0, 170.0, 170.0, 175.0, 175.0, 180.0, 180.0, 180.0, 190.0, 210.0,
                       230.0, post_peak, 220.0, 190.0, 160.0, 130.0, 110.0, 95.0, 80.0])
        values = [120.0, 130.0, 140.0, 150.0, 160.0] + after
        store.upsert_cgm([{
            "EventDateTime": (noon + timedelta(minutes=5 * (i - 4))).strftime(FMT),
            "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV",
        } for i, bg in enumerate(values)])
        doses = [(400_000 + day, noon, 4.5, 45.0)]
        if top_up:
            doses.append((500_000 + day, noon + timedelta(minutes=10), 2.0, 20.0))
        store.upsert_bolus([{
            "seq_num": seq_num, "request_time": at.strftime(FMT),
            "description": "Synthetic meal bolus", "completion": "Completed",
            "insulin": insulin, "requested_insulin": insulin, "carbs": carbs,
            "carb_ratio": 10.0, "isf": 40.0, "target_bg": 110.0,
        } for seq_num, at, insulin, carbs in doses])

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
        evening = next(
            row for row in evening_patterns if row["key"] == "highs_after_treating_lows"
        )

        self.assertEqual(afternoon_population["exposures"]["lows"]["occurrences"], [])
        # No outcome of it lands in the window, so the Pattern joins none (ADR 467).
        self.assertNotIn("highs_after_treating_lows",
                         [row["key"] for row in afternoon_patterns])
        self.assertEqual(
            [row["ep_id"] for row in evening_population["exposures"]["lows"]["occurrences"]],
            ["attributed-low", "unattributed-low"],
        )
        self.assertEqual((evening["k"], evening["n"]), (1, 2))
        self.assertEqual(evening["readiness"], {
            "count": 2, "gate": 12, "verdict": "withheld",
        })


class ScopedPatternMembershipTest(unittest.TestCase):
    """A scoped window carries a Pattern when its outcomes land in it (ADR 467)."""

    SCENARIOS = {"patterns": [], "low_confidence": []}

    @staticmethod
    def _analysis(source_nights):
        return {
            "basal": [{"evidence": {"harm_band_source_nights": source_nights,
                                    "harm": {"band_nights": 2}}}],
            "tuning_levers": [{"parameter": "basal_rate", "priority": 39}],
        }

    def _roster(self, analysis, exposures, bounds):
        _population, roster = outcome_window_population(
            analysis, exposures, self.SCENARIOS, WindowQuery.clock(*bounds),
        )
        return {row["key"]: row for row in roster}

    def test_the_overnight_pattern_joins_windows_overlapping_its_band(self):
        analysis = self._analysis(8)
        for bounds in ((0, 360), (300, 420)):
            with self.subTest(bounds=bounds):
                pattern = self._roster(analysis, {"exposures": {}}, bounds)[
                    "overnight_lows_no_iob"]
                self.assertEqual((pattern["k"], pattern["n"]), (2, 8))
        self.assertNotIn("overnight_lows_no_iob",
                         self._roster(analysis, {"exposures": {}}, (360, 1440)))

    def test_the_overnight_pattern_with_no_source_nights_joins_no_window(self):
        self.assertNotIn("overnight_lows_no_iob",
                         self._roster(self._analysis(0), {"exposures": {}}, (0, 360)))

    def test_an_unadmitted_pattern_joins_the_window_its_outcome_lands_in(self):
        low = {
            "ep_id": "afternoon-low", "t": "2026-08-01 15:00:00", "kind": "low",
            "attributed": False, "attributed_levers": [], "cause_lever": None,
            "cause_title": None, "outcome_minute": 15 * 60,
        }
        exposures = {"exposures": {"lows": {
            "n": 1, "attributed": 0, "clean": 1, "occurrences": [low],
        }}}
        inside = self._roster({}, exposures, (14 * 60, 16 * 60))
        self.assertEqual(inside["highs_after_treating_lows"]["admission_route"], "none")
        self.assertEqual(inside["highs_after_treating_lows"]["n"], 1)
        self.assertNotIn("highs_after_treating_lows",
                         self._roster({}, exposures, (16 * 60, 18 * 60)))


class SplitMealIdentityTest(unittest.TestCase):
    """ADR 470: a top-up within the same-meal grace is part of the meal, not a second one."""

    def _serve(self, **shape):
        import tempfile

        from ciq_autotune.analyzers.scenario import build_scenarios
        from ciq_autotune.store import Store

        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                write_split_meals(store, **shape)
                exposures = build_exposures(store)
                scenarios = build_scenarios(store).to_dict()
        patterns = {p["key"]: p for p in build_outcome_patterns({}, exposures, scenarios)}
        undercount = next((p for p in scenarios["patterns"] + scenarios["low_confidence"]
                           if p["lever"] == "carb_undercount"), None)
        return exposures["exposures"]["meals"], patterns["highs_after_meals"], undercount

    def test_a_top_up_ten_minutes_after_the_meal_is_one_meal(self):
        meals, highs, undercount = self._serve(gap=10)

        self.assertEqual(meals["n"], 14)
        self.assertEqual({(o["t"][11:], o["carbs"], o["insulin"])
                          for o in meals["occurrences"]}, {("12:00:00", 65.0, 6.5)})
        self.assertEqual((highs["k"], highs["n"]), (14, 14))
        self.assertEqual(undercount["confidence"]["n"], 14)

    def test_a_split_meal_is_judged_on_its_summed_carbs_and_dose(self):
        meals, highs, _ = self._serve(gap=10, peak=210.0)

        self.assertEqual((highs["k"], highs["n"]), (0, 14))
        self.assertFalse([o for o in meals["occurrences"]
                          if "carb_undercount" in o["attributed_levers"]])

    def test_a_top_up_exactly_at_the_grace_is_the_same_meal(self):
        meals, _, _ = self._serve(gap=30)

        self.assertEqual(meals["n"], 14)

    def test_a_top_up_past_the_grace_stays_a_separate_meal(self):
        meals, highs, undercount = self._serve(gap=35)

        self.assertEqual(meals["n"], 28)
        self.assertEqual((highs["k"], highs["n"]), (14, 28))
        self.assertEqual(undercount["confidence"]["n"], 28)


class LateBolusOutcomeTest(unittest.TestCase):
    """ADR 461: Late bolus puts a meal in "ran high" only when it ran above 180."""

    def _serve(self, post_peak):
        import tempfile

        from ciq_autotune.analyzers.scenario import build_scenarios
        from ciq_autotune.store import Store

        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                write_late_meals(store, post_peak=post_peak)
                exposures = build_exposures(store)
                scenarios = build_scenarios(store).to_dict()
        patterns = {p["key"]: p for p in build_outcome_patterns({}, exposures, scenarios)}
        return exposures["exposures"]["meals"]["occurrences"], patterns["highs_after_meals"]

    def test_late_meals_that_stayed_in_range_did_not_run_high(self):
        meals, highs = self._serve(165.0)

        self.assertEqual((highs["k"], highs["n"]), (0, 14))
        self.assertFalse([o for o in meals if "late_bolus" in o["attributed_levers"]])

    def test_late_meals_that_ran_above_the_line_still_count(self):
        meals, highs = self._serve(240.0)

        self.assertEqual((highs["k"], highs["n"]), (14, 14))
        self.assertTrue(all("late_bolus" in o["attributed_levers"] for o in meals))
