"""Outcome Patterns: scoped populations, membership, meal identity and uncertainty."""
import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns
from ciq_autotune.analyzers.scenario.outcome_patterns import outcome_window_population
from ciq_autotune.explore_exposures import build_exposures
from ciq_autotune.window_membership import WindowQuery


SPLIT_MEAL_NOON = datetime(2024, 5, 3, 12, 0)
FMT = "%Y-%m-%d %H:%M:%S"


def write_split_meals(store, *, gap, peak=360.0, days=14):
    """Write ``days`` synthetic noon meals from 2024-05-03 into a real ``Store``.

    Each meal is a 45 g / 4.5 U bolus, plus a 20 g / 2 U top-up ``gap`` minutes later
    unless ``gap`` is None. Glucose is flat at 110, climbs 2 mg/dL/min from the first
    bolus to ``peak``, then falls; the settings snapshot and flat background are the
    behavioral QA lane's.
    """
    from scripts.qa_e2e_cases import _materialize_behavioral_background, _respond_fasting_lane

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
    _respond_fasting_lane(store)


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
    from scripts.qa_e2e_cases import _materialize_behavioral_background, _respond_fasting_lane

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
    _respond_fasting_lane(store)

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
            'admission_basis': 'lower_bound',
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
            "admission_basis": "lower_bound",
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
            "admission_basis": "lower_bound",
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

    def _roster(self, analysis, exposures, bounds):
        _population, roster = outcome_window_population(
            analysis, exposures, self.SCENARIOS, WindowQuery.clock(*bounds),
        )
        return {row["key"]: row for row in roster}

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


def write_bad_meals_among_clean(store, *, bad_days, clean):
    """Write ``bad_days`` days of split meals, then ``clean`` meals that stay flat.

    The split meals are :func:`write_split_meals` at a 35-minute gap, so each day
    adds two meals and one carb-undercount high. The clean meals are a 45 g / 4.5 U
    bolus every eight hours from 2024-05-08 on the flat background, which never
    leaves range.
    """
    write_split_meals(store, gap=35, days=bad_days)
    start = datetime(2024, 5, 8, 7, 0)
    store.upsert_bolus([{
        "seq_num": 700_000 + i, "request_time": (start + timedelta(hours=8 * i)).strftime(FMT),
        "description": "Synthetic meal bolus", "completion": "Completed",
        "insulin": 4.5, "requested_insulin": 4.5, "carbs": 45.0,
        "carb_ratio": 10.0, "isf": 40.0, "target_bg": 110.0,
    } for i in range(clean)])


def write_over_treated_lows(store, *, count):
    """Write ``count`` synthetic lows to 48, each treated into a rebound to 260.

    One a day at 13:00 from 2024-05-11 on the behavioral background; every low the
    lane holds is over-treated, so ``count`` is both the habit's ``k`` and its ``n``.
    """
    from scripts.qa_e2e_cases import _materialize_behavioral_background, _respond_fasting_lane

    first = _materialize_behavioral_background(store, span_days=30)
    down = [100.0 - 52.0 * i / 4 for i in range(1, 5)]
    up = [48.0 + 212.0 * i / 8 for i in range(1, 9)]
    rows = []
    for day in range(count):
        start = datetime.combine(first + timedelta(days=10 + day), datetime.min.time())
        start += timedelta(hours=13)
        rows.extend({
            "EventDateTime": (start + timedelta(minutes=5 * i)).strftime(FMT),
            "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV",
        } for i, bg in enumerate([100.0] * 5 + down + up))
    store.upsert_cgm(rows)
    _respond_fasting_lane(store)


class PatternUncertainTest(unittest.TestCase):
    """A Pattern reads Uncertain (``wide``) only when its Queue admission does not
    hold at the low end of its evidence; precision alone never makes it so (#485)."""

    @staticmethod
    def _roster(writer, **shape):
        import tempfile

        from ciq_autotune.analyzers.scenario import build_scenarios
        from ciq_autotune.store import Store

        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                writer(store, **shape)
                exposures = build_exposures(store)
                scenarios = build_scenarios(store).to_dict()
        return {p["key"]: p for p in build_outcome_patterns({}, exposures, scenarios)}

    @staticmethod
    def _member(pattern, subject):
        return next(m for m in pattern["members"] if m["subject"] == subject)

    def test_a_habit_admitted_at_its_lower_bound_is_not_uncertain_however_broad_its_range(self):
        highs = self._roster(write_bad_meals_among_clean, bad_days=4, clean=20)["highs_after_meals"]

        self.assertEqual((highs["k"], highs["n"]), (4, 28))
        self.assertEqual(highs["admission_route"], "habit_threshold")
        self.assertEqual(self._member(highs, "habit:carb_undercount")["admission_basis"],
                         "lower_bound")
        # The range is broad: its half-width is more than half its rate.
        half = (highs["wilson"]["hi"] - highs["wilson"]["lo"]) / 2
        self.assertGreater(half, 0.5 * highs["rate"])
        self.assertIs(highs["wide"], False)

    def test_a_habit_admitted_only_by_the_strong_override_is_uncertain(self):
        highs = self._roster(write_bad_meals_among_clean, bad_days=4, clean=60)["highs_after_meals"]

        self.assertEqual((highs["k"], highs["n"]), (4, 68))
        self.assertEqual(highs["admission_route"], "habit_threshold")
        self.assertEqual(self._member(highs, "habit:carb_undercount")["admission_basis"],
                         "strong_override")
        self.assertIs(highs["wide"], True)

    def test_a_habit_admitted_on_too_few_cases_is_uncertain(self):
        treated = self._roster(write_over_treated_lows, count=2)["highs_after_treating_lows"]

        self.assertEqual((treated["k"], treated["n"]), (2, 2))
        self.assertEqual(treated["admission_route"], "habit_threshold")
        self.assertEqual(self._member(treated, "habit:over_treated_low")["admission_basis"],
                         "low_confidence")
        self.assertIs(treated["wide"], True)

    def test_enough_cases_clear_the_same_habit(self):
        treated = self._roster(write_over_treated_lows, count=3)["highs_after_treating_lows"]

        self.assertEqual((treated["k"], treated["n"]), (3, 3))
        self.assertEqual(self._member(treated, "habit:over_treated_low")["admission_basis"],
                         "lower_bound")
        self.assertIs(treated["wide"], False)

    @staticmethod
    def _unadmitted_highs_after_meals(k, n):
        meals = [{
            'ep_id': f'meal-{i}', 't': f'2026-08-01 12:{i:02d}:00', 'kind': 'meal',
            'attributed': i < k, 'attributed_levers': ['carb_undercount'] if i < k else [],
            'cause_lever': 'carb_undercount' if i < k else None, 'outcome_minute': 13 * 60,
        } for i in range(n)]
        exposures = {'exposures': {'meals': {'n': n, 'occurrences': meals}}}
        roster = build_outcome_patterns({}, exposures, {'patterns': [], 'low_confidence': []})
        return next(p for p in roster if p['key'] == 'highs_after_meals')

    def test_a_pattern_outside_the_queue_is_uncertain_only_without_a_range(self):
        cases = (
            (0, 0, True),    # no opportunities: no range at all
            (2, 2, False),   # thin, but nothing is admitted to be uncertain about
            (5, 50, False),  # broad range, same
        )
        for k, n, wide in cases:
            with self.subTest(k=k, n=n):
                pattern = self._unadmitted_highs_after_meals(k, n)
                self.assertEqual((pattern['k'], pattern['n']), (k, n))
                self.assertEqual(pattern['admission_route'], 'none')
                self.assertIs(pattern['wide'], wide)


def _claim(t, **severity):
    return {"t": t, "attributed_levers": list(severity), "claim_severity": severity}


class CauseOrderTest(unittest.TestCase):
    """ADR 593: a Pattern's causes by summed claim severity, crediting unchanged."""

    LEVERS = ("carb_undercount", "late_bolus")

    def _order(self, *occurrences):
        from ciq_autotune.analyzers.scenario.outcome_patterns import cause_order
        return cause_order({"exposures": {"meals": {"occurrences": list(occurrences)}}},
                           "meals", self.LEVERS)

    def test_equal_harm_keeps_roster_order(self):
        self.assertEqual(self._order(_claim("2024-05-02 12:00:00", late_bolus=500.0),
                                     _claim("2024-05-03 12:00:00", carb_undercount=500.0)),
                         [("carb_undercount", 1), ("late_bolus", 1)])

    def test_the_larger_summed_harm_leads(self):
        self.assertEqual(self._order(_claim("2024-05-02 12:00:00", carb_undercount=300.0),
                                     _claim("2024-05-03 12:00:00", carb_undercount=300.0),
                                     _claim("2024-05-04 12:00:00", late_bolus=700.0),
                                     {"t": "2024-05-05 12:00:00", "attributed_levers": []}),
                         [("late_bolus", 1), ("carb_undercount", 2)])

    def test_a_doubly_claimed_meal_counts_once_for_the_first_lever_and_its_own_claim(self):
        # The second lever's claims are the more severe, but the shared meal is
        # credited to the first in roster order, with only that lever's severity.
        self.assertEqual(self._order(
            _claim("2024-05-02 12:00:00", carb_undercount=100.0, late_bolus=900.0),
            _claim("2024-05-03 12:00:00", carb_undercount=100.0),
            _claim("2024-05-04 12:00:00", late_bolus=250.0),
        ), [("late_bolus", 1), ("carb_undercount", 2)])
        self.assertEqual(self._order(
            _claim("2024-05-02 12:00:00", carb_undercount=100.0, late_bolus=900.0),
            _claim("2024-05-04 12:00:00", late_bolus=150.0),
        ), [("late_bolus", 1), ("carb_undercount", 1)])
        self.assertEqual(self._order(
            _claim("2024-05-02 12:00:00", carb_undercount=100.0, late_bolus=900.0),
            _claim("2024-05-04 12:00:00", late_bolus=50.0),
        ), [("carb_undercount", 1), ("late_bolus", 1)])
