"""The I:C meal-run ledger (#518, adr-518-ic-meal-run-ledger).

``meal_burdens`` closes the ADR 0017 balance sheet over a single post-isolated
meal, which admits only the last meal of any chain. ``run_burdens`` closes the
same sheet over the whole chain — so a run of one meal must reproduce
``meal_burdens`` field for field (the generalization regression), and everything
the chain adds (formation, eviction, rescue admission) must keep the shipped
semantics rather than re-deriving them.

Fixtures are synthetic event streams driven through the real analyzer; no ledger
field is ever hand-set (#273's green-while-broken trap).
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.ic import (
    IcConfig, MealRun, meal_burdens, run_burdens)
from ciq_autotune.events import BasalEvent, BolusEvent, CarbEntry, CgmReading
from ciq_autotune.harm import HarmArm, PrintedLow
from ciq_autotune.uncertainty import (
    _WIDE_MIN_CLUSTERS, estimate_pooled_ratio, estimate_pooled_ratio_clustered)

ISF = 50.0


def meal(day, hh, carbs, dose, bg=None, pump_iob=None, completion=None, mm=0):
    return BolusEvent(t=datetime(2026, 6, day, hh, mm, 0), insulin=dose, carbs=carbs,
                      bg=bg, pump_iob=pump_iob, completion=completion)


def corr(day, hh, mm, units, options=None):
    return BolusEvent(t=datetime(2026, 6, day, hh, mm, 0), insulin=units, carbs=None,
                      bolus_options=options)


def user_corr(day, hh, mm, units):
    return corr(day, hh, mm, units, options=0)


def ciq_corr(day, hh, mm, units):
    return corr(day, hh, mm, units, options=3)


def cgm_run(day, hh, bg, *, minutes=(290, 295, 300, 305, 310)):
    """CGM covering the full-DIA outcome window of a bolus at ``day hh:00``."""
    base = datetime(2026, 6, day, hh, 0, 0)
    return [CgmReading(t=base + timedelta(minutes=m), bg=bg) for m in minutes]


def basal_delta(day, hh, delivered, programmed, duration=60.0):
    return BasalEvent(t=datetime(2026, 6, day, hh, 0, 0),
                      delivery_type="algorithmDelivery", duration_mins=duration,
                      basal_rate=delivered, profile_basal_rate=programmed)


def printed_low(day, hh, mm, meal_hh, *, bg=55.0, carbs=60.0):
    return PrintedLow(t=datetime(2026, 6, day, hh, mm, 0), bg=bg, iob_u=2.0,
                      arm=HarmArm.IC,
                      dominant_bolus_t=datetime(2026, 6, day, meal_hh, 0, 0),
                      dominant_bolus_carbs=carbs, attribution_reason="meal-bolus")


def low_run(day, hh, *, bgs=((-10, 68), (-5, 58), (0, 55), (5, 60), (10, 72))):
    """A printed-low CGM excursion centred on ``day hh:00``."""
    base = datetime(2026, 6, day, hh, 0, 0)
    return [CgmReading(t=base + timedelta(minutes=m), bg=bg) for m, bg in bgs]


class SingleMealRunReproducesMealBurdenTest(unittest.TestCase):
    """Test 1 — a run of one meal IS a :class:`MealBurden`.

    The stream deliberately exercises every branch of the ledger on isolated
    meals: a plain meal, one with user and Control-IQ corrections plus a CIQ
    basal delta, one where the IOB guard zeroes the corrections, one the outcome
    BG drives through the hypo floor, and one re-admitted through ADR 0038 §5
    with its rescue grams.
    """

    # (MealBurden attr, MealRun attr) — every closed-ledger field.
    PARITY = [
        ("t", "t"),
        ("carbs", "carbs_covered"),
        ("meal_carbs", "meal_carbs"),
        ("meal_dose", "meal_dose"),
        ("post_correction", "post_correction"),
        ("true_ic", "true_ic"),
        ("effective_insulin", "effective_insulin"),
        ("rescue_carbs", "rescue_carbs"),
        ("rescue_carb_times", "rescue_carb_times"),
        ("ciq_basal_delta_u", "ciq_basal_delta_u"),
        ("ciq_basal_delta_acted_u", "ciq_basal_delta_acted_u"),
        ("bg_outcome_u", "bg_outcome_u"),
        ("outcome_bg", "outcome_bg"),
        ("bg0", "bg0"),
        ("post_correction_user", "post_correction_user"),
        ("post_correction_ciq", "post_correction_ciq"),
        ("post_correction_unknown", "post_correction_unknown"),
        ("n_correction_user", "n_correction_user"),
        ("n_correction_ciq", "n_correction_ciq"),
        ("n_correction_unknown", "n_correction_unknown"),
        ("prior_meal_action_u", "prior_meal_action_u"),
        ("prior_correction_action_u", "prior_correction_action_u"),
        ("prior_action_status", "prior_action_status"),
        ("has_outcome", "has_outcome"),
    ]

    def _stream(self):
        boluses = [
            meal(1, 12, 60, 10.0, bg=110.0),                 # plain
            meal(2, 8, 45, 8.0, bg=120.0),                   # corrections + basal
            user_corr(2, 10, 0, 1.0),
            ciq_corr(2, 11, 30, 0.5),
            corr(2, 12, 0, 0.4),                             # unknown provenance
            meal(3, 12, 60, 10.0, bg=110.0, pump_iob=4.0),   # IOB guard fires
            user_corr(3, 13, 0, 1.5),
            meal(4, 12, 20, 4.0, bg=300.0),                  # hypo floor
            meal(5, 12, 60, 10.0, bg=110.0),                 # printed-and-rescued
        ]
        cgm = (cgm_run(1, 12, 110.0) + cgm_run(2, 8, 150.0) + cgm_run(3, 12, 110.0)
               + cgm_run(4, 12, 40.0)
               + low_run(5, 13) + cgm_run(5, 12, 110.0))
        return {
            "bolus_events": sorted(boluses, key=lambda b: b.t),
            "cgm_readings": cgm,
            "basal_events": [basal_delta(2, 9, 1.0, 0.6)],
            "carb_entries": [CarbEntry(t=datetime(2026, 6, 5, 13, 0, 0), grams=15.0,
                                       certainty="estimate", source="manual")],
            "harm_lows": [printed_low(5, 13, 0, 12)],
        }

    def test_every_ledger_field_matches_meal_burdens(self):
        stream = self._stream()
        boluses = stream.pop("bolus_events")
        burdens = meal_burdens(boluses, IcConfig(), isf_effective=ISF, **stream)
        runs = run_burdens(boluses, IcConfig(), isf_effective=ISF, **stream)

        self.assertEqual(len(burdens), 5, "fixture should admit all five meals")
        self.assertEqual([r.t for r in runs], [b.t for b in burdens])
        for run in runs:
            self.assertEqual(run.n_meals, 1)
        for burden, run in zip(burdens, runs):
            for burden_attr, run_attr in self.PARITY:
                self.assertEqual(
                    getattr(burden, burden_attr), getattr(run, run_attr),
                    f"{burden_attr} differs at {burden.t}")

    def test_member_meal_facts_survive_on_the_run(self):
        # The pooled meal-list findings count MEALS, so the raw per-meal facts
        # have to stay reachable through the run.
        stream = self._stream()
        boluses = stream.pop("bolus_events")
        runs = run_burdens(boluses, IcConfig(), isf_effective=ISF, **stream)
        by_day = {run.t.day: run for run in runs}
        self.assertEqual(by_day[2].meals[0].bg0, 120.0)
        self.assertEqual(by_day[2].meals[0].post_correction_user, 1.0)
        self.assertEqual(by_day[2].meals[0].post_correction_ciq, 0.5)
        self.assertGreater(by_day[2].meals[0].ciq_basal_delta_u, 0.0)
        self.assertTrue(by_day[3].meals[0].guard_fired)
        self.assertEqual(by_day[3].post_correction, 0.0)
        self.assertEqual(by_day[5].meals[0].rescue_carbs, 15.0)

    def test_hypo_floored_run_is_demoted_to_directional_only(self):
        # The floored denominator is an assumption, not a measurement: the run
        # stays as over-coverage evidence but is flagged out of the numeric pool.
        stream = self._stream()
        boluses = stream.pop("bolus_events")
        runs = run_burdens(boluses, IcConfig(), isf_effective=ISF, **stream)
        by_day = {run.t.day: run for run in runs}
        self.assertTrue(by_day[4].directional_only)
        self.assertFalse(by_day[1].directional_only)
        self.assertFalse(by_day[5].directional_only)

    def test_a_directional_only_run_is_kept_out_of_the_pool_and_the_estimate(self):
        # The flag is only worth carrying if something acts on it. A floored run must
        # leave the numeric pool AND leave the number: its ratio is extreme by
        # construction, so pooling it would drag the estimate toward an assumption.
        from ciq_autotune.analyzers.ic import _run_pool
        stream = self._stream()
        boluses = stream.pop("bolus_events")
        runs = run_burdens(boluses, IcConfig(), isf_effective=ISF, **stream)
        floored = next(r for r in runs if r.directional_only)

        pool = _run_pool(runs)
        self.assertNotIn(id(floored), {id(r) for r in pool})
        self.assertTrue(pool, "the other runs must still be poolable")

        # ...and the pooled estimate really does move if it sneaks back in.
        from ciq_autotune.uncertainty import estimate_pooled_ratio_clustered
        honest = estimate_pooled_ratio_clustered(
            [[(r.carbs_covered, r.effective_insulin)] for r in pool])
        contaminated = estimate_pooled_ratio_clustered(
            [[(r.carbs_covered, r.effective_insulin)] for r in pool + [floored]])
        self.assertEqual(honest.n, len(pool))
        self.assertEqual(contaminated.n, len(pool) + 1)
        self.assertNotAlmostEqual(honest.value, contaminated.value, places=3)


class RunFormationTest(unittest.TestCase):
    """Test 2 — chains, the welded gap, and what breaks or evicts a run."""

    def test_gap_is_welded_to_the_outcome_read(self):
        # The run gap IS post_meal_min, so the config check that protects the
        # outcome read is the same one that makes a run's read DIA-clean.
        with self.assertRaises(ValueError) as ctx:
            IcConfig(post_meal_min=180)
        self.assertIn("meal-run gap", str(ctx.exception))
        IcConfig(post_meal_min=315)  # equal to outcome_at_min + tol is fine

    def test_meals_inside_the_gap_form_one_run_and_beyond_it_two(self):
        chained = [meal(1, 12, 60, 10.0, bg=110.0), meal(1, 15, 40, 7.0, bg=110.0)]
        runs = run_burdens(chained, IcConfig(), cgm_readings=cgm_run(1, 15, 110.0),
                           isf_effective=ISF)
        self.assertEqual([r.n_meals for r in runs], [2])
        self.assertEqual(runs[0].t, chained[0].t)
        self.assertEqual(runs[0].end_t, chained[1].t)
        self.assertEqual(runs[0].meal_carbs, 100.0)
        self.assertEqual(runs[0].meal_dose, 17.0)

        split = [meal(1, 8, 60, 10.0, bg=110.0), meal(1, 14, 40, 7.0, bg=110.0)]
        runs = run_burdens(split, IcConfig(),
                           cgm_readings=cgm_run(1, 8, 110.0) + cgm_run(1, 14, 110.0),
                           isf_effective=ISF)
        self.assertEqual([r.n_meals for r in runs], [1, 1])

    def test_the_outcome_is_read_after_the_last_meal_of_the_run(self):
        chained = [meal(1, 12, 60, 10.0, bg=110.0), meal(1, 15, 40, 7.0, bg=110.0)]
        # 150 only in the first meal's read window, 110 in the last meal's.
        cgm = cgm_run(1, 12, 150.0) + cgm_run(1, 15, 110.0)
        runs = run_burdens(chained, IcConfig(), cgm_readings=cgm, isf_effective=ISF)
        self.assertEqual(runs[0].outcome_bg, 110.0)
        self.assertEqual(runs[0].bg0, 110.0)     # the FIRST meal's start
        self.assertEqual(runs[0].bg_outcome_u, 0.0)
        self.assertAlmostEqual(runs[0].effective_insulin, 17.0, places=3)

    def test_a_non_completed_meal_breaks_the_run_without_contributing(self):
        cgm = cgm_run(1, 12, 110.0) + cgm_run(1, 15, 110.0)
        clean = [meal(1, 12, 60, 10.0, bg=110.0), meal(1, 15, 40, 7.0, bg=110.0)]
        self.assertEqual(
            len(run_burdens(clean, IcConfig(), cgm_readings=cgm, isf_effective=ISF)), 1)

        aborted = [meal(1, 12, 60, 10.0, bg=110.0),
                   meal(1, 15, 40, 7.0, bg=110.0, completion="User Aborted")]
        runs = run_burdens(aborted, IcConfig(), cgm_readings=cgm, isf_effective=ISF)
        self.assertEqual(runs, [], "the chain the aborted leg sits in is dropped whole")

    def test_a_truncated_reissue_breaks_the_run(self):
        # #219: the abort already delivered 2 U, so the pump's calculator
        # subtracted it from the re-issue two minutes later.
        events = [meal(1, 12, 60, 10.0, bg=110.0),
                  meal(1, 15, 40, 2.0, completion="User Aborted"),
                  meal(1, 15, 40, 5.0, bg=110.0, mm=2)]
        runs = run_burdens(events, IcConfig(),
                           cgm_readings=cgm_run(1, 15, 110.0), isf_effective=ISF)
        self.assertEqual(runs, [])

    def test_an_unattributable_carb_entry_evicts_the_run(self):
        # A prompt-sourced entry is never in the pre-empted-rescue subset (ADR
        # 0012), so nothing in the run can claim these carbs — and unbolused carbs
        # inside the span mean the ledger's carb side is incomplete.
        chained = [meal(1, 12, 60, 10.0, bg=110.0), meal(1, 15, 40, 7.0, bg=110.0)]
        cgm = cgm_run(1, 15, 110.0)
        entries = [CarbEntry(t=datetime(2026, 6, 1, 16, 0, 0), grams=20.0,
                             certainty="estimate", source="rise-prompt")]
        runs = run_burdens(chained, IcConfig(), cgm_readings=cgm, isf_effective=ISF,
                           carb_entries=entries)
        self.assertEqual(runs, [])
        # Without the entry the same chain closes — the eviction is the entry's doing.
        self.assertEqual(
            len(run_burdens(chained, IcConfig(), cgm_readings=cgm,
                            isf_effective=ISF)), 1)

    def test_an_attributed_rescue_is_admitted_with_its_grams_in_the_numerator(self):
        # ADR 0038 §5, meal-scoped inside the run: the 15:00 meal owns a printed
        # low at 17:00 and the rescue that treated it, so the run keeps its chain
        # AND counts the grams as carbs covered.
        chained = [meal(1, 12, 60, 10.0, bg=110.0), meal(1, 15, 40, 7.0, bg=110.0)]
        cgm = low_run(1, 17) + cgm_run(1, 15, 110.0)
        entries = [CarbEntry(t=datetime(2026, 6, 1, 17, 0, 0), grams=15.0,
                             certainty="estimate", source="manual")]
        runs = run_burdens(chained, IcConfig(), cgm_readings=cgm, isf_effective=ISF,
                           carb_entries=entries,
                           harm_lows=[printed_low(1, 17, 0, 15, carbs=40.0)])
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0].n_meals, 2)
        self.assertEqual(runs[0].rescue_carbs, 15.0)
        self.assertEqual(runs[0].carbs_covered, 115.0)
        # The grams belong to the meal that owned the low, not to the run's start.
        self.assertEqual(runs[0].meals[0].rescue_carbs, 0.0)
        self.assertEqual(runs[0].meals[1].rescue_carbs, 15.0)


class RunRescueAttributionTest(unittest.TestCase):
    """Rescue grams enter a run's numerator exactly once, through one member."""

    def test_a_preempted_rescue_is_admitted_into_the_runs_numerator(self):
        # The pre-empted path (ADR 0012): a manual carb log with NO printed low
        # near it, attributed to the meal bolus whose insulin was still running
        # the drop. It is admitted as carbs covered, not treated as an
        # unattributable entry that evicts the run.
        chained = [meal(1, 12, 60, 10.0, bg=110.0), meal(1, 15, 40, 7.0, bg=110.0)]
        entries = [CarbEntry(t=datetime(2026, 6, 1, 16, 0, 0), grams=20.0,
                             certainty="estimate", source="manual")]
        runs = run_burdens(chained, IcConfig(), cgm_readings=cgm_run(1, 15, 110.0),
                           isf_effective=ISF, carb_entries=entries)
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0].n_meals, 2)
        self.assertEqual(runs[0].rescue_carbs, 20.0)
        self.assertEqual(runs[0].carbs_covered, 120.0)
        self.assertEqual(len(runs[0].rescue_carb_times), 1)
        # Claimed by the bolus that was running the drop — the 15:00 meal.
        self.assertEqual(runs[0].meals[0].rescue_carbs, 0.0)
        self.assertEqual(runs[0].meals[1].rescue_carbs, 20.0)

    def test_same_instant_members_count_one_rescue_once(self):
        # Two boluses can share a timestamp to the second (they are keyed on
        # distinct pump seqNums, not on time). A rescue attributed to that
        # instant matches BOTH members, so anything keyed by timestamp counts
        # its grams twice and inflates the carb side of the ledger.
        same_instant = [meal(1, 12, 60, 10.0, bg=110.0), meal(1, 12, 40, 7.0)]
        entries = [CarbEntry(t=datetime(2026, 6, 1, 15, 0, 0), grams=15.0,
                             certainty="estimate", source="manual")]
        runs = run_burdens(same_instant, IcConfig(),
                           cgm_readings=cgm_run(1, 12, 110.0), isf_effective=ISF,
                           carb_entries=entries)
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0].n_meals, 2, "same-instant legs are one run")
        self.assertEqual(runs[0].rescue_carbs, 15.0)
        self.assertEqual(runs[0].carbs_covered, 115.0)
        self.assertEqual(len(runs[0].rescue_carb_times), 1)
        self.assertEqual(
            sum(rm.rescue_carbs for rm in runs[0].meals), 15.0,
            "exactly one member may claim the grams")

    def test_a_rescue_two_members_could_claim_goes_to_the_earlier_one(self):
        # One rescue sits inside both members' windows and both own a printed
        # low near it. The earlier member claims it; the grams are counted once.
        chained = [meal(1, 12, 60, 10.0, bg=110.0), meal(1, 15, 40, 7.0, bg=110.0)]
        cgm = low_run(1, 16) + cgm_run(1, 15, 110.0)
        entries = [CarbEntry(t=datetime(2026, 6, 1, 16, 0, 0), grams=15.0,
                             certainty="estimate", source="manual")]
        lows = [printed_low(1, 16, 0, 12, carbs=60.0),
                printed_low(1, 16, 0, 15, carbs=40.0)]
        runs = run_burdens(chained, IcConfig(), cgm_readings=cgm, isf_effective=ISF,
                           carb_entries=entries, harm_lows=lows)
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0].rescue_carbs, 15.0)
        self.assertEqual(len(runs[0].rescue_carb_times), 1)
        self.assertEqual(runs[0].meals[0].rescue_carbs, 15.0)
        self.assertEqual(runs[0].meals[1].rescue_carbs, 0.0)


class ClusteredPooledRatioTest(unittest.TestCase):
    """Test 3 — the run is the cluster, and the band has to say so."""

    # Three runs of four meals each; meals inside a run agree, runs disagree —
    # the correlation structure a per-meal bootstrap is blind to.
    CLUSTERS = [
        [(40.0, 10.0)] * 4,
        [(50.0, 10.0)] * 4,
        [(60.0, 10.0)] * 4,
    ]

    def test_point_estimate_is_the_pooled_ratio_over_every_pair(self):
        est = estimate_pooled_ratio_clustered(self.CLUSTERS)
        self.assertAlmostEqual(est.value, 5.0, places=4)
        self.assertEqual(est.method, "bootstrap-pooled-ratio-clustered")

    def test_n_counts_runs_not_meals(self):
        est = estimate_pooled_ratio_clustered(self.CLUSTERS)
        self.assertEqual(est.n, 3)
        self.assertEqual(est.n_clusters, 3)

    def test_clustering_widens_the_band_versus_pooling_the_pairs(self):
        clustered = estimate_pooled_ratio_clustered(self.CLUSTERS)
        pairs = estimate_pooled_ratio([p for c in self.CLUSTERS for p in c])
        self.assertAlmostEqual(clustered.value, pairs.value, places=4)
        self.assertGreater(clustered.hi - clustered.lo, pairs.hi - pairs.lo)

    def test_a_three_run_pool_is_not_wide_from_the_cluster_floor_alone(self):
        # min_runs = 3 clears _WIDE_MIN_CLUSTERS = 2 and _WIDE_MIN_N = 3, so a
        # three-run pool reads soft only when its evidence actually scatters.
        agreeing = [[(50.0, 10.0)] * 2] * 3
        est = estimate_pooled_ratio_clustered(agreeing)
        self.assertEqual(est.n_clusters, 3)
        self.assertGreaterEqual(est.n_clusters, _WIDE_MIN_CLUSTERS)
        self.assertFalse(est.wide)
        # Because n counts runs, the n < 3 floor subsumes the cluster floor: two
        # runs read soft however tightly they agree, and both floors say so.
        two = estimate_pooled_ratio_clustered(agreeing[:2])
        self.assertTrue(two.wide)
        self.assertEqual(two.n, 2)

    def test_no_pairs_gives_a_valueless_estimate(self):
        est = estimate_pooled_ratio_clustered([])
        self.assertIsNone(est.value)
        self.assertEqual(est.n, 0)
        self.assertEqual(est.method, "none")


class RescueDirectionTest(unittest.TestCase):
    """Test 4 — which way admitting rescue grams moves the read.

    Direction only (the magnitude did not reproduce across replicas): counting
    the grams the meal had to be rescued with says the meal was over-covered, so
    leaving them out reads TIGHTER (fewer g/U) than admitting them.
    """

    def _runs(self, *, grams_in):
        events = [meal(1, 12, 60, 10.0, bg=110.0)]
        cgm = low_run(1, 13) + cgm_run(1, 12, 110.0)
        entries = ([CarbEntry(t=datetime(2026, 6, 1, 13, 0, 0), grams=15.0,
                              certainty="estimate", source="manual")]
                   if grams_in else [])
        lows = [printed_low(1, 13, 0, 12)] if grams_in else []
        return run_burdens(events, IcConfig(), cgm_readings=cgm, isf_effective=ISF,
                           carb_entries=entries, harm_lows=lows)

    def test_grams_out_reads_tighter_than_grams_in(self):
        grams_in = self._runs(grams_in=True)
        grams_out = self._runs(grams_in=False)
        self.assertEqual(len(grams_in), 1)
        self.assertEqual(len(grams_out), 1)
        self.assertGreater(grams_in[0].rescue_carbs, 0.0)
        self.assertEqual(grams_out[0].rescue_carbs, 0.0)
        # Same ledger denominator either way — only the carb side moves.
        self.assertAlmostEqual(grams_in[0].effective_insulin,
                               grams_out[0].effective_insulin, places=3)
        self.assertLess(grams_out[0].true_ic, grams_in[0].true_ic)

    def test_an_unclosed_rescue_is_not_pooled_as_a_number(self):
        # Unknown grams cannot close the ledger, so the run leaves the pool
        # entirely rather than contributing a fabricated numerator.
        events = [meal(1, 12, 60, 10.0, bg=110.0)]
        cgm = low_run(1, 13) + cgm_run(1, 12, 110.0)
        entries = [CarbEntry(t=datetime(2026, 6, 1, 13, 0, 0), grams=None,
                             certainty="unknown", source="manual")]
        runs = run_burdens(events, IcConfig(), cgm_readings=cgm, isf_effective=ISF,
                           carb_entries=entries, harm_lows=[printed_low(1, 13, 0, 12)])
        self.assertEqual(runs, [])


class MealRunTypeTest(unittest.TestCase):
    def test_run_burdens_returns_meal_runs(self):
        runs = run_burdens([meal(1, 12, 60, 10.0, bg=110.0)], IcConfig(),
                           cgm_readings=cgm_run(1, 12, 110.0), isf_effective=ISF)
        self.assertIsInstance(runs[0], MealRun)


if __name__ == "__main__":
    unittest.main()
