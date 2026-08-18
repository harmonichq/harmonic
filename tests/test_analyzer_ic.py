"""A3 I:C + carb-counting engine tests.

One engine, driven by post-meal CIQ-correction burden on carb-tagged meals.
A *systematic* excess (the meal bolus consistently under-covers, so CIQ keeps
adding correction insulin) points to an I:C that is too weak -> a tighter I:C
estimate. *High variance* in that burden points at inconsistent carb counting,
not a wrong ratio -> a behavioral Finding instead.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyze import analyze
from ciq_autotune.analyzers.ic import (
    TARGET_BG, IcConfig, _acted, _recommend, analyze_ic, meal_burdens)
from ciq_autotune.events import BasalEvent, BolusEvent, CarbEntry, CgmReading
from ciq_autotune.harm import HarmArm, HarmConfig, PrintedLow
from ciq_autotune.settings import Snapshot, parse_pump_settings

IC_6 = [(0, 6.0)]  # programmed I:C: 6 g/U all day


def meal(day, hh, carbs, dose, bg=None, pump_iob=None, completion=None, mm=0):
    return BolusEvent(t=datetime(2026, 6, day, hh, mm, 0), insulin=dose, carbs=carbs,
                      bg=bg, pump_iob=pump_iob, completion=completion)


def corr(day, hh, mm, units, options=None):
    return BolusEvent(t=datetime(2026, 6, day, hh, mm, 0), insulin=units, carbs=None,
                      bolus_options=options)


# Explicit-provenance correction helpers (#186): option 0 is a user Standard bolus,
# option 3 a Control-IQ Automatic correction (see events._USER/_CIQ_BOLUS_OPTIONS).
def user_corr(day, hh, mm, units):
    return corr(day, hh, mm, units, options=0)


def ciq_corr(day, hh, mm, units):
    return corr(day, hh, mm, units, options=3)


def cgm_run(day, hh, bg, *, minutes=(290, 295, 300, 305, 310), step=None):
    """CGM readings at fixed post-hh offsets, all at ``bg``.

    Defaults cover the full-DIA outcome window (bolus + 300 ± 15 min) with a time
    centroid of exactly +300 — where the meal bolus is fully acted, so expected
    denominators are plain face-value sums. ``step`` overrides ``minutes`` with a
    regular cadence over 285..315 min (same centroid).
    """
    if step is not None:
        minutes = range(285, 316, step)
    base = datetime(2026, 6, day, hh, 0, 0)
    return [CgmReading(t=base + timedelta(minutes=m), bg=bg) for m in minutes]


def basal_delta(day, hh, delivered, programmed, duration=60.0,
                delivery_type="algorithmDelivery"):
    return BasalEvent(t=datetime(2026, 6, day, hh, 0, 0),
                      delivery_type=delivery_type,
                      duration_mins=duration,
                      basal_rate=delivered,
                      profile_basal_rate=programmed)


def _raw_settings(isf=50, cr_mu=6000):
    pad = [{"startTime": 0, "basalRate": 0, "isf": 0,
            "carbRatio": 0, "targetBg": 0}] * 15
    return {"profiles": {"activeIdp": 4, "profile": [
        {"name": "4", "idp": 4, "insulinDuration": 300, "carbEntry": 1,
         "maxBolus": 15000,
         "tDependentSegs": [{"startTime": 0, "basalRate": 600,
                             "isf": isf, "carbRatio": cr_mu,
                             "targetBg": 110}] + pad}]},
            "cgmSettings": {}}


class _FakeAnalyzeStore:
    def __init__(self, *, basal, cgm, bolus, snapshots):
        self._basal = basal
        self._cgm = cgm
        self._bolus = bolus
        self._snapshots = snapshots

    def basal_events(self):
        return self._basal

    def cgm_readings(self):
        return self._cgm

    def bolus_events(self):
        return self._bolus

    def pump_events(self):
        return []

    def settings_snapshots(self):
        return self._snapshots

    def counts(self):
        return {
            "basal_events": len(self._basal),
            "cgm_readings": len(self._cgm),
            "bolus_events": len(self._bolus),
            "pump_events": 0,
        }


class PriorMealIdentifiabilityFacadeTest(unittest.TestCase):
    def test_prior_meal_contamination_holds_the_public_analysis_at_programmed(self):
        boluses = []
        cgm = [CgmReading(datetime(2026, 6, 4), 110)]
        for day in (5, 6, 7):
            boluses.extend([
                meal(day, 9, 60, 10.0, bg=110),
                meal(day, 12, 60, 12.0, bg=110),
            ])
            cgm.extend(cgm_run(day, 12, 110))
        snapshot = Snapshot(
            datetime(2026, 6, 7, 18, 0),
            parse_pump_settings(_raw_settings(isf=50, cr_mu=6000)),
        )
        store = _FakeAnalyzeStore(
            basal=[], cgm=cgm, bolus=boluses, snapshots=[snapshot])

        result = analyze(
            store,
            window_days=30,
            now=datetime(2026, 6, 8),
            harm_config=None,
        )
        row = result.ic[0]

        self.assertEqual(row.current, 6.0)
        self.assertIsNone(row.recommended)
        self.assertFalse(row.asserts_move)
        self.assertEqual(
            {segment.start_min: segment.carb_ratio
             for segment in result.consolidated_basal.segments}[0],
            6.0,
        )
        self.assertEqual(row.evidence["prior_meal_action"]["contaminated_meals"], 3)
        self.assertEqual(row.evidence["prior_meal_action"]["supported_meals"], 0)
        self.assertIn("Prior-meal insulin", row.annotation)

    def test_correction_only_prehistory_remains_numeric_evidence(self):
        boluses = []
        cgm = [CgmReading(datetime(2026, 6, 4), 110)]
        for day in (5, 6, 7):
            boluses.extend([
                corr(day, 9, 0, 2.5),
                meal(day, 12, 60, 12.0, bg=110),
            ])
            cgm.extend(cgm_run(day, 12, 110))
        snapshot = Snapshot(
            datetime(2026, 6, 7, 18, 0),
            parse_pump_settings(_raw_settings(isf=50, cr_mu=6000)),
        )
        result = analyze(
            _FakeAnalyzeStore(
                basal=[], cgm=cgm, bolus=boluses, snapshots=[snapshot]),
            window_days=30,
            now=datetime(2026, 6, 8),
            harm_config=None,
        )
        row = result.ic[0]

        self.assertEqual(row.evidence["prior_meal_action"]["supported_meals"], 3)
        self.assertEqual(
            row.evidence["prior_meal_action"]["correction_only_prehistory_meals"], 3)
        self.assertEqual(row.evidence["prior_meal_action"]["contaminated_meals"], 0)
        self.assertEqual(row.recommended, 5.5)
        # #518: a segment row is display-only and never asserts; and three meals is far
        # below the block's 8-run dosing floor, so the deliverable profile carries the
        # PROGRAMMED ratio forward rather than this segment's visible recommendation.
        self.assertFalse(row.asserts_move)
        self.assertEqual(result.consolidated_basal.segments[0].carb_ratio, 6.0)

    def test_unreconstructable_prior_action_is_unknown_not_clean(self):
        boluses = [
            meal(day, 12, 60, 12.0, bg=110,
                 pump_iob=0.4 if day == 5 else None)
            for day in (5, 6, 7)
        ]
        cgm = [CgmReading(datetime(2026, 6, 5, 12), 110)]
        for day in (5, 6, 7):
            cgm.extend(cgm_run(day, 12, 110))
        snapshot = Snapshot(
            datetime(2026, 6, 7, 18, 0),
            parse_pump_settings(_raw_settings(isf=50, cr_mu=6000)),
        )
        result = analyze(
            _FakeAnalyzeStore(
                basal=[], cgm=cgm, bolus=boluses, snapshots=[snapshot]),
            window_days=30,
            now=datetime(2026, 6, 8),
            harm_config=None,
        )
        row = result.ic[0]
        prior = row.evidence["prior_meal_action"]

        self.assertEqual(prior["unknown_meals"], 1)
        self.assertEqual(prior["supported_meals"], 2)
        self.assertEqual(prior["additional_supported_meals_needed"], 1)
        self.assertEqual(row.estimate.n, 2)
        self.assertIsNone(row.recommended)
        self.assertFalse(row.asserts_move)
        self.assertIn("1 more needed", row.annotation)
        self.assertIn("Prior-meal insulin cannot be separated", row.annotation)
        self.assertNotIn("Active prior-meal insulin", row.annotation)

    def test_too_few_identifiable_meals_reports_the_exit_count(self):
        boluses = [meal(day, 12, 60, 12.0, bg=110) for day in (5, 6)]
        cgm = [CgmReading(datetime(2026, 6, 4), 110)]
        for day in (5, 6):
            cgm.extend(cgm_run(day, 12, 110))
        snapshot = Snapshot(
            datetime(2026, 6, 6, 18, 0),
            parse_pump_settings(_raw_settings(isf=50, cr_mu=6000)),
        )
        result = analyze(
            _FakeAnalyzeStore(
                basal=[], cgm=cgm, bolus=boluses, snapshots=[snapshot]),
            window_days=30,
            now=datetime(2026, 6, 7),
            harm_config=None,
        )
        row = result.ic[0]
        prior = row.evidence["prior_meal_action"]

        self.assertEqual(prior["supported_meals"], 2)
        self.assertEqual(prior["additional_supported_meals_needed"], 1)
        self.assertEqual(prior["hold_reason"], "insufficient_supported_meals")
        self.assertFalse(row.asserts_move)
        self.assertIn("I:C direction needs more identifiable meals", row.annotation)
        self.assertIn("1 more needed", row.annotation)
        self.assertEqual(result.consolidated_basal.segments[0].carb_ratio, 6.0)

    def test_supported_band_including_programmed_holds_with_exit_count(self):
        boluses = [
            meal(5, 12, 60, 12.0, bg=110),
            meal(6, 12, 60, 10.0, bg=110),
            meal(7, 12, 60, 60 / 7, bg=110),
        ]
        cgm = [CgmReading(datetime(2026, 6, 4), 110)]
        for day in (5, 6, 7):
            cgm.extend(cgm_run(day, 12, 110))
        snapshot = Snapshot(
            datetime(2026, 6, 7, 18, 0),
            parse_pump_settings(_raw_settings(isf=50, cr_mu=6000)),
        )
        result = analyze(
            _FakeAnalyzeStore(
                basal=[], cgm=cgm, bolus=boluses, snapshots=[snapshot]),
            window_days=30,
            now=datetime(2026, 6, 8),
            harm_config=None,
        )
        row = result.ic[0]
        prior = row.evidence["prior_meal_action"]

        self.assertEqual(prior["supported_meals"], 3)
        self.assertEqual(prior["contaminated_meals"], 0)
        self.assertEqual(prior["unknown_meals"], 0)
        self.assertEqual(prior["required_supported_meals"], 3)
        self.assertEqual(prior["additional_supported_meals_needed"], 0)
        self.assertEqual(
            prior["hold_reason"], "supported_band_includes_programmed")
        self.assertLessEqual(row.estimate.lo, row.current)
        self.assertGreaterEqual(row.estimate.hi, row.current)
        self.assertFalse(row.asserts_move)
        self.assertEqual(result.consolidated_basal.segments[0].carb_ratio, 6.0)
        self.assertIn("3 clean-start/correction-only meals", row.annotation)
        self.assertIn("band still includes", row.annotation)

    def test_supported_sensitivity_bracket_cannot_straddle_programmed(self):
        boluses = []
        cgm = [CgmReading(datetime(2026, 6, 4), 110)]
        for day in (5, 6, 7):
            # The tiny carb-bearing prior bolus is not itself a qualifying meal,
            # but leaves ~0.40 U of prior meal action at noon: below the 0.5 U
            # admission floor, yet enough to make this deliberately knife-edge
            # fixture cross programmed under 0% vs 100% credit.
            boluses.extend([
                meal(day, 9, 5, 2.5, bg=110),
                meal(day, 12, 60, 60 / 6.1, bg=110),
            ])
            cgm.extend(cgm_run(day, 12, 110))
        snapshot = Snapshot(
            datetime(2026, 6, 7, 18, 0),
            parse_pump_settings(_raw_settings(isf=50, cr_mu=6000)),
        )
        result = analyze(
            _FakeAnalyzeStore(
                basal=[], cgm=cgm, bolus=boluses, snapshots=[snapshot]),
            window_days=30,
            now=datetime(2026, 6, 8),
            harm_config=None,
        )
        row = result.ic[0]
        prior = row.evidence["prior_meal_action"]
        bracket = prior["sensitivity_bracket"]

        self.assertEqual(prior["supported_meals"], 3)
        self.assertGreater(bracket["uncredited"], row.current)
        self.assertLess(bracket["fully_credited"], row.current)
        self.assertTrue(bracket["includes_programmed"])
        self.assertFalse(prior["numeric_direction_supported"])
        self.assertFalse(row.asserts_move)
        self.assertEqual(result.consolidated_basal.segments[0].carb_ratio, 6.0)
        self.assertIn("Prior-meal insulin", row.annotation)

    def test_meal_low_harm_remains_when_numeric_meals_are_excluded(self):
        boluses = []
        cgm = [CgmReading(datetime(2026, 6, 4), 110)]
        lows = []
        for day in (5, 6, 7):
            current_t = datetime(2026, 6, day, 12)
            boluses.extend([
                meal(day, 9, 60, 10.0, bg=110),
                meal(day, 12, 60, 12.0, bg=110),
            ])
            cgm.extend(cgm_run(day, 12, 110))
            if day < 7:
                lows.append(PrintedLow(
                    datetime(2026, 6, day, 15),
                    58.0,
                    1.5,
                    HarmArm.IC,
                    dominant_bolus_t=current_t,
                ))

        rows, _ = analyze_ic(
            boluses,
            IC_6,
            cgm_readings=cgm,
            isf_effective=50.0,
            harm_config=HarmConfig(),
            harm_lows=lows,
            analysis_start=datetime(2026, 6, 5),
            prior_action_observed_from=datetime(2026, 6, 4),
        )
        row = rows[0]

        self.assertEqual(row.estimate.n, 0)
        self.assertEqual(row.evidence["prior_meal_action"]["contaminated_meals"], 3)
        self.assertEqual(row.evidence["harm"]["row_days"], 2)
        self.assertFalse(row.asserts_move)
        self.assertIsNone(row.recommended)

    def test_historical_endpoint_only_counts_then_known_rescue_observations(self):
        boluses = [meal(day, 12, 60, 12.0, bg=110) for day in (5, 6, 7)]
        cgm = [CgmReading(datetime(2026, 6, 4), 110)]
        for day in (5, 6, 7):
            cgm.extend(cgm_run(day, 12, 110))
        snapshot = Snapshot(
            datetime(2026, 6, 7, 18, 0),
            parse_pump_settings(_raw_settings(isf=50, cr_mu=6000)),
        )
        store = _FakeAnalyzeStore(
            basal=[], cgm=cgm, bolus=boluses, snapshots=[snapshot])
        backfilled = CarbEntry(
            datetime(2026, 6, 5, 13),
            10.0,
            "estimate",
            "low-prompt",
            created_at=datetime(2026, 6, 9),
        )

        early = analyze(
            store,
            window_days=30,
            now=datetime(2026, 6, 8),
            carb_entries=[backfilled],
            harm_config=None,
        ).ic[0]
        later = analyze(
            store,
            window_days=30,
            now=datetime(2026, 6, 10),
            carb_entries=[backfilled],
            harm_config=None,
        ).ic[0]

        # The endpoint that could not yet see the backfilled rescue keeps all three
        # meals in the numeric pool; the later endpoint sees it and drops one. (#518:
        # `asserts_move` is no longer the observable here — a segment row never asserts
        # — so the pool count itself is what this pins.)
        self.assertEqual(early.evidence["prior_meal_action"]["supported_meals"], 3)
        self.assertEqual(later.evidence["prior_meal_action"]["supported_meals"], 2)
        self.assertFalse(early.asserts_move)
        self.assertFalse(later.asserts_move)


class IcConfigTest(unittest.TestCase):
    def test_post_meal_min_must_cover_outcome_read(self):
        # Isolation has to protect the full-DIA outcome read; a shorter
        # post_meal_min would let a following meal poison outcome_bg.
        with self.assertRaises(ValueError):
            IcConfig(post_meal_min=180)  # < outcome_at_min + outcome_tol_min
        with self.assertRaises(ValueError):
            IcConfig(post_meal_min=320, outcome_at_min=330)

    def test_coupled_windows_are_accepted(self):
        IcConfig(post_meal_min=315)  # equal to outcome_at_min + tol is fine


class MealBurdenTest(unittest.TestCase):
    def test_post_meal_correction_is_attributed_to_the_meal(self):
        # 60g meal bolused 10U, then a 2U correction within 4h -> true I:C = 60/12 = 5.0.
        events = [meal(1, 12, 60, 10.0), corr(1, 14, 0, 2.0)]
        burdens = meal_burdens(events, IcConfig())
        self.assertEqual(len(burdens), 1)
        self.assertAlmostEqual(burdens[0].true_ic, 5.0, places=2)
        self.assertAlmostEqual(burdens[0].post_correction, 2.0)

    def test_earlier_meal_excluded_later_meal_kept(self):
        # Two meals 1h apart. Post-only isolation: the earlier meal (12:00) is
        # excluded because the later meal (13:00) falls in its post-window. The
        # later meal (13:00) is kept — no meal follows it — and carries no
        # corrections, so post_correction is 0.
        events = [meal(1, 12, 60, 10.0), meal(1, 13, 40, 7.0)]
        burdens = meal_burdens(events, IcConfig())
        self.assertEqual(len(burdens), 1)
        self.assertEqual(burdens[0].carbs, 40.0)
        self.assertAlmostEqual(burdens[0].post_correction, 0.0)
        self.assertAlmostEqual(burdens[0].true_ic, 40.0 / 7.0, places=3)

    def test_tiny_carb_entries_are_not_meals(self):
        events = [meal(1, 12, 5, 1.0)]   # 5g < min_carbs
        self.assertEqual(meal_burdens(events, IcConfig()), [])

    def test_asymmetric_isolation_prior_meal_does_not_exclude(self):
        # A meal 3h BEFORE this one is outside the post-only exclusion window
        # (m.t, m.t + 4h] for the earlier meal. The earlier meal (09:00) has 12:00 in
        # its post-window → excluded. The later meal (12:00) has no meal in its
        # post-window → included; with no pump_iob the IOB guard cannot fire, so its
        # corrections are counted (#181).
        events = [meal(1, 9, 60, 10.0), meal(1, 12, 60, 10.0), corr(1, 14, 0, 2.0)]
        burdens = meal_burdens(events, IcConfig())
        # Only the 12:00 meal is isolated; 09:00 is excluded (12:00 is in its window)
        self.assertEqual(len(burdens), 1)
        self.assertEqual(burdens[0].t.hour, 12)
        self.assertAlmostEqual(burdens[0].post_correction, 2.0)
        self.assertAlmostEqual(burdens[0].true_ic, 60.0 / 12.0, places=3)

    def test_correction_guard_fires_on_high_pump_iob(self):
        # #181: the guard is now IOB-aware, not time-based. A meal dosed on top of
        # substantial pump IOB (5U > 3U threshold) has its post-corrections zeroed —
        # they're cleaning up that prior-insulin overhang, not this meal.
        events = [meal(1, 12, 60, 10.0, pump_iob=5.0), corr(1, 14, 0, 3.0)]
        burdens = meal_burdens(events, IcConfig())
        self.assertEqual(len(burdens), 1)
        self.assertAlmostEqual(burdens[0].post_correction, 0.0)
        self.assertAlmostEqual(burdens[0].true_ic, 60.0 / 10.0, places=3)

    def test_correction_guard_does_not_fire_on_low_pump_iob(self):
        # Below-threshold pump IOB (1U < 3U): the corrections belong to this meal and
        # are counted. The old time guard would have wrongly zeroed them at a short gap
        # regardless of how little insulin was actually on board (#181).
        events = [meal(1, 12, 60, 10.0, pump_iob=1.0), corr(1, 14, 0, 3.0)]
        burdens = meal_burdens(events, IcConfig())
        self.assertEqual(len(burdens), 1)
        self.assertAlmostEqual(burdens[0].post_correction, 3.0)
        self.assertAlmostEqual(burdens[0].true_ic, 60.0 / 13.0, places=3)

    def test_correction_guard_threshold_is_configurable(self):
        # Sensitivity lever (#181 acceptance gate tested 2/3/4U). At threshold 4U a
        # 3.5U-IOB meal keeps its corrections; at 3U it zeroes them.
        events = [meal(1, 12, 60, 10.0, pump_iob=3.5), corr(1, 14, 0, 3.0)]
        kept = meal_burdens(events, IcConfig(guard_pump_iob_u=4.0))[0]
        self.assertAlmostEqual(kept.post_correction, 3.0)
        zeroed = meal_burdens(events, IcConfig(guard_pump_iob_u=3.0))[0]
        self.assertAlmostEqual(zeroed.post_correction, 0.0)

    def test_no_pump_iob_never_trips_the_guard(self):
        # Historical rows / no Msg1 carry pump_iob=None → the guard cannot fire, so
        # corrections are always counted (never silently dropped on missing IOB).
        events = [meal(1, 12, 60, 10.0), corr(1, 14, 0, 3.0)]
        b = meal_burdens(events, IcConfig())[0]
        self.assertAlmostEqual(b.post_correction, 3.0)


class NonCompletedBolusExclusionTest(unittest.TestCase):
    """#219: partial-insulin aborted / alarm-killed carb legs (and their truncated
    Completed re-issues) pollute the I:C pool with inflated true_ic and must be
    excluded at read time. A 0-U abort's clean re-issue stays."""

    def test_completed_meal_is_kept(self):
        # Baseline: an explicitly Completed meal is a normal pool member.
        events = [meal(1, 12, 60, 10.0, completion="Completed")]
        self.assertEqual(len(meal_burdens(events, IcConfig())), 1)

    def test_none_completion_is_kept(self):
        # Historical rows / fixtures carry completion=None → treated as completed,
        # never silently dropped (the whole pre-completion-status history).
        events = [meal(1, 12, 60, 10.0, completion=None)]
        self.assertEqual(len(meal_burdens(events, IcConfig())), 1)

    def test_lone_partial_abort_is_dropped(self):
        # A partial-insulin User Aborted carb leg passes _is_meal (2U ≥ 0.3,
        # 20g ≥ 10) but its dose was truncated → excluded from the pool.
        events = [meal(1, 12, 20, 2.0, completion="User Aborted")]
        self.assertEqual(meal_burdens(events, IcConfig()), [])

    def test_alarm_terminated_carb_leg_is_dropped(self):
        events = [meal(1, 12, 30, 3.0, completion="Terminated by Alarm")]
        self.assertEqual(meal_burdens(events, IcConfig()), [])

    def test_partial_abort_then_quick_reissue_drops_both(self):
        # Partial abort (delivered ≥ ε) then a Completed re-issue 3 min later: the
        # re-issue's calculator subtracted the delivered partial, so it is also
        # truncated. Both legs leave the pool → zero meals.
        events = [
            meal(1, 12, 20, 2.0, completion="User Aborted", mm=0),
            meal(1, 12, 20, 8.0, completion="Completed", mm=3),
        ]
        self.assertEqual(meal_burdens(events, IcConfig()), [])

    def test_zero_abort_then_reissue_keeps_the_reissue(self):
        # A 0-U abort delivered nothing to subtract, so its Completed re-issue is a
        # clean, correct meal. (The 0-U leg itself is already out via min_meal_dose_u.)
        events = [
            meal(1, 12, 20, 0.0, completion="User Aborted", mm=0),
            meal(1, 12, 20, 4.0, completion="Completed", mm=3),
        ]
        burdens = meal_burdens(events, IcConfig())
        self.assertEqual(len(burdens), 1)
        self.assertAlmostEqual(burdens[0].meal_dose, 4.0)
        self.assertAlmostEqual(burdens[0].true_ic, 20.0 / 4.0, places=3)

    def test_reissue_window_boundary(self):
        # Re-issue at exactly 5 min → still the same truncated bolus (dropped);
        # at 6 min → a separate, clean meal (kept).
        abort = meal(1, 12, 20, 2.0, completion="User Aborted", mm=0)
        at_5 = [abort, meal(1, 12, 20, 8.0, completion="Completed", mm=5)]
        self.assertEqual(meal_burdens(at_5, IcConfig()), [])
        at_6 = [abort, meal(1, 12, 20, 8.0, completion="Completed", mm=6)]
        kept = meal_burdens(at_6, IcConfig())
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0].t.minute, 6)


class SignedOutcomeTest(unittest.TestCase):
    ISF = 50.0  # 1U drops 50 mg/dL

    def test_no_cgm_falls_back_to_correction_only(self):
        # Omitting CGM keeps the old behaviour: outcome fields are None.
        events = [meal(1, 12, 60, 10.0), corr(1, 14, 0, 2.0)]
        b = meal_burdens(events, IcConfig())[0]
        self.assertIsNone(b.bg_outcome_u)
        self.assertIsNone(b.outcome_bg)
        self.assertAlmostEqual(b.true_ic, 5.0, places=2)  # 60 / (10 + 2)

    def test_outcome_high_gives_positive_outcome_and_tighter_ic(self):
        # Meal starting at target, reading 160 at full DIA (+50 → +1.0U under-
        # covered), no correction. The bolus is fully acted at the read (#181 /
        # ADR 0017), so it enters at face value: effective = 10 + 1.0.
        events = [meal(1, 12, 60, 10.0, bg=TARGET_BG)]
        readings = cgm_run(1, 12, TARGET_BG + 50.0)
        b = meal_burdens(events, IcConfig(), cgm_readings=readings,
                         isf_effective=50.0)[0]
        self.assertAlmostEqual(b.outcome_bg, 160.0, places=1)
        self.assertAlmostEqual(b.bg_outcome_u, 1.0, places=2)
        self.assertAlmostEqual(b.effective_insulin, 11.0, places=3)
        self.assertAlmostEqual(b.true_ic, 60.0 / 11.0, places=2)
        self.assertLess(b.true_ic, 6.0)  # tighter than the flat-outcome 60/10

    def test_outcome_low_gives_negative_outcome_and_looser_ic(self):
        # Starting at target, reading 60 at full DIA (-50 → -1.0U over-covered):
        # effective = 10 - 1.0, looser than the flat-outcome case.
        events = [meal(1, 12, 60, 10.0, bg=TARGET_BG)]
        readings = cgm_run(1, 12, TARGET_BG - 50.0)
        b = meal_burdens(events, IcConfig(), cgm_readings=readings,
                         isf_effective=50.0)[0]
        self.assertAlmostEqual(b.outcome_bg, 60.0, places=1)
        self.assertAlmostEqual(b.bg_outcome_u, -1.0, places=2)
        self.assertAlmostEqual(b.effective_insulin, 9.0, places=3)
        self.assertAlmostEqual(b.true_ic, 60.0 / 9.0, places=2)

    def test_correction_bolus_and_outcome_combine(self):
        # A 2U correction at +2h AND it still read 50 high at full DIA → both
        # count. The meal bolus is fully acted; the correction (delivered at +120
        # min, read at +300) is only ~84% acted, so it enters curve-weighted, not
        # at its 2U face value (#181).
        events = [meal(1, 12, 60, 10.0, bg=TARGET_BG), corr(1, 14, 0, 2.0)]
        readings = cgm_run(1, 12, TARGET_BG + 50.0)
        b = meal_burdens(events, IcConfig(), cgm_readings=readings,
                         isf_effective=50.0)[0]
        self.assertAlmostEqual(b.bg_outcome_u, 1.0, places=2)
        base = datetime(2026, 6, 1, 12, 0, 0)
        corr_acted = _acted([(base + timedelta(hours=2), 2.0)], base,
                            base + timedelta(minutes=300))
        self.assertLess(corr_acted, 2.0)  # curve-weighted below face value
        eff = 10.0 + corr_acted + 1.0
        self.assertAlmostEqual(b.effective_insulin, eff, places=3)
        self.assertAlmostEqual(b.true_ic, 60.0 / eff, places=2)

    def test_no_cgm_at_the_read_excludes_outcome(self):
        # CGM exists but nowhere near the full-DIA read window -> excluded.
        base = datetime(2026, 6, 1, 12, 0, 0)
        readings = [CgmReading(t=base + timedelta(minutes=m), bg=160.0)
                    for m in (30, 45, 60, 90, 120, 150, 180)]
        b = meal_burdens([meal(1, 12, 60, 10.0)], IcConfig(),
                         cgm_readings=readings, isf_effective=50.0)[0]
        self.assertIsNone(b.bg_outcome_u)
        self.assertIsNone(b.outcome_bg)
        self.assertAlmostEqual(b.true_ic, 6.0, places=2)  # falls back to 60/10

    def test_trending_at_read_still_reads_outcome(self):
        # BG still moving through the read window is a fact about the meal's tail,
        # not an exclusion reason — at full DIA the meal bolus is spent regardless
        # (the settle-read design excluded these; ADR 0017). The window mean is the
        # outcome: readings 140..160 across ±10 min → 150.
        base = datetime(2026, 6, 1, 12, 0, 0)
        readings = [CgmReading(t=base + timedelta(minutes=m), bg=150.0 + (m - 300))
                    for m in (290, 295, 300, 305, 310)]
        b = meal_burdens([meal(1, 12, 60, 10.0, bg=TARGET_BG)], IcConfig(),
                         cgm_readings=readings, isf_effective=50.0)[0]
        self.assertAlmostEqual(b.outcome_bg, 150.0, places=1)
        self.assertAlmostEqual(b.bg_outcome_u, 0.8, places=2)  # (150-110)/50

    def test_sparse_cgm_at_the_read_excludes_outcome(self):
        # Only 2 readings land inside the ±15 min read window — fewer than
        # outcome_min_readings=3, i.e. a CGM gap at the read. The meal is
        # excluded, not guessed.
        base = datetime(2026, 6, 1, 12, 0, 0)
        readings = [CgmReading(t=base + timedelta(minutes=m), bg=160.0)
                    for m in (150, 200, 250, 295, 300)]
        b = meal_burdens([meal(1, 12, 60, 10.0, bg=TARGET_BG)], IcConfig(),
                         cgm_readings=readings, isf_effective=50.0)[0]
        self.assertIsNone(b.bg_outcome_u)
        self.assertIsNone(b.outcome_bg)

    def test_analyze_ic_threads_outcome_into_points(self):
        events = []
        readings = []
        for d in (1, 2, 3):
            events.append(meal(d, 12, 60, 10.0, bg=TARGET_BG))
            readings += cgm_run(d, 12, TARGET_BG + 50.0)
        ic_segs, _ = analyze_ic(events, IC_6, cgm_readings=readings,
                                isf_effective=50.0)
        points = ic_segs[0].evidence["points"]
        self.assertEqual(len(points), 3)
        for p in points:
            self.assertAlmostEqual(p["bg_outcome_u"], 1.0, places=2)
            self.assertAlmostEqual(p["outcome_bg"], 160.0, places=1)
            self.assertAlmostEqual(p["start_bg"], TARGET_BG, places=1)

    def test_exactly_min_readings_is_sufficient(self):
        # outcome_min_readings=3 with exactly 3 readings inside the window is
        # enough to read the outcome.
        base = datetime(2026, 6, 1, 12, 0, 0)
        readings = [CgmReading(t=base + timedelta(minutes=m), bg=TARGET_BG + 50.0)
                    for m in (295, 300, 305)]  # exactly 3, centroid +300
        b = meal_burdens([meal(1, 12, 60, 10.0, bg=TARGET_BG)], IcConfig(),
                         cgm_readings=readings, isf_effective=50.0)[0]
        self.assertIsNotNone(b.outcome_bg)
        self.assertAlmostEqual(b.outcome_bg, TARGET_BG + 50.0, places=1)
        self.assertAlmostEqual(b.bg_outcome_u, 1.0, places=2)

    def test_corrected_total_zero_or_negative_retained_via_floor(self):
        # A severe confirmed hypo: outcome_bg well below the start, bg_outcome_u a
        # large negative number that drives corrected_total <= 0. The meal must
        # be RETAINED as (extreme) over-coverage evidence — the denominator floored,
        # not dropped to the correction-only true_ic (which would look well-covered
        # and bias toward over-coverage exactly on the meals that prove it).
        base = datetime(2026, 6, 1, 12, 0, 0)
        # ISF=50; meal_dose=1U, no corrections. outcome_bg = 35 mg/dL at full DIA.
        # bg_outcome_u = (35-110)/50 = -1.5U; insulin_acted is the fully-acted 1U
        # bolus; corrected_total = 1.0 - 1.5 < 0.
        readings = [CgmReading(t=base + timedelta(minutes=m), bg=35.0)
                    for m in (295, 300, 305)]
        b = meal_burdens(
            [BolusEvent(t=base, insulin=1.0, carbs=60.0, bg=TARGET_BG)],
            IcConfig(),  # hypo_floor_frac=0.1
            cgm_readings=readings,
            isf_effective=self.ISF,
        )[0]
        # Outcome is retained, not nulled.
        self.assertAlmostEqual(b.bg_outcome_u, -1.5, places=2)
        self.assertAlmostEqual(b.outcome_bg, 35.0, places=1)
        # Denominator floored at hypo_floor_frac * insulin_acted (= the 1U bolus,
        # fully acted) — the meal stays in as extreme over-coverage.
        self.assertAlmostEqual(b.effective_insulin, 0.1, places=4)
        self.assertAlmostEqual(b.true_ic, 60.0 / 0.1, places=1)
        self.assertTrue(b.has_outcome)

    def test_excluded_meal_still_appears_with_null_outcome_in_points(self):
        # No CGM at all -> every meal excluded, but still present in the payload.
        events = [meal(d, 12, 60, 10.0) for d in (1, 2, 3)]
        ic_segs, _ = analyze_ic(events, IC_6, cgm_readings=[], isf_effective=50.0)
        points = ic_segs[0].evidence["points"]
        self.assertEqual(len(points), 3)
        for p in points:
            self.assertIsNone(p["bg_outcome_u"])
            self.assertIsNone(p["outcome_bg"])


class PriorIobNotCreditedTest(unittest.TestCase):
    """#181: prior-bolus IOB is deliberately NOT credited to the meal, though the
    plan (Q4) called for it. With asymmetric post-only isolation the prior IOB is
    usually a prior meal's insulin covering prior carbs — crediting it double-books
    (ADR 0017). The denominator is this meal's own bolus + its post-corrections +
    outcome only."""

    ISF = 50.0

    def test_prior_bolus_iob_is_not_credited(self):
        # A 4U correction 1h before the meal is still absorbing into the outcome
        # window, but it must NOT change the denominator — effective matches the
        # no-prior-bolus case exactly.
        base = datetime(2026, 6, 1, 12, 0, 0)
        prior = BolusEvent(t=base - timedelta(hours=1), insulin=4.0, carbs=None)
        events = [prior, meal(1, 12, 60, 10.0, bg=TARGET_BG)]
        readings = cgm_run(1, 12, TARGET_BG + 50.0)  # reads +1.0U high at full DIA
        b = meal_burdens(events, IcConfig(), cgm_readings=readings,
                         isf_effective=self.ISF)[0]
        self.assertAlmostEqual(b.effective_insulin, 11.0, places=3)

    def test_matches_no_prior_bolus_case(self):
        # The same meal with no prior bolus at all yields the identical denominator.
        events = [meal(1, 12, 60, 10.0, bg=TARGET_BG)]
        readings = cgm_run(1, 12, TARGET_BG + 50.0)
        b = meal_burdens(events, IcConfig(), cgm_readings=readings,
                         isf_effective=self.ISF)[0]
        self.assertAlmostEqual(b.effective_insulin, 11.0, places=3)


class StartBgBaselineTest(unittest.TestCase):
    """#175: the outcome is BG *travelled* from the meal's start, not distance from
    the fixed 110 target. Insulin spent fixing a pre-meal high must not be booked as
    carb coverage — that inflated every meal's need and biased recs toward 'tighten'.
    """

    ISF = 50.0  # 1U drops 50 mg/dL

    def test_start_at_target_uses_target_as_baseline(self):
        # bg0 == target: travelled +50 → +1.0U. Denominator is the fully-acted
        # bolus plus that outcome: 10 + 1.0.
        events = [meal(1, 12, 60, 10.0, bg=TARGET_BG)]
        readings = cgm_run(1, 12, TARGET_BG + 50.0)
        b = meal_burdens(events, IcConfig(), cgm_readings=readings,
                         isf_effective=self.ISF)[0]
        self.assertAlmostEqual(b.bg0, TARGET_BG, places=1)
        self.assertAlmostEqual(b.bg_outcome_u, 1.0, places=2)
        self.assertAlmostEqual(b.true_ic, 60.0 / 11.0, places=2)

    def test_meal_starting_high_uses_start_not_target_baseline(self):
        # Starts at 160, reads 160 at full DIA: it never travelled, so the outcome
        # is 0 — NOT the +1.0U of 'under-coverage' the pre-#175 target baseline
        # booked for a pre-meal high. The start-baseline denominator (10 + 0)
        # yields a LOOSER ratio than a target baseline (10 + 1.0) would.
        events = [meal(1, 12, 60, 10.0, bg=160.0)]
        readings = cgm_run(1, 12, 160.0)
        b = meal_burdens(events, IcConfig(), cgm_readings=readings,
                         isf_effective=self.ISF)[0]
        self.assertAlmostEqual(b.bg0, 160.0, places=1)
        self.assertAlmostEqual(b.bg_outcome_u, 0.0, places=2)
        self.assertAlmostEqual(b.true_ic, 6.0, places=2)
        target_baseline_ic = 60.0 / (10.0 + (160.0 - TARGET_BG) / self.ISF)
        self.assertGreater(b.true_ic, target_baseline_ic)  # looser than target baseline

    def test_meal_starting_low_uses_start_not_target_baseline(self):
        # Starts at 70, reads 160: it climbed 90 mg/dL → +1.8U under-covered. The
        # start baseline captures the full climb; a target baseline sees only
        # (160-110)/50 = +1.0U, understating it — so the start baseline is TIGHTER
        # than a target one here.
        events = [meal(1, 12, 60, 10.0, bg=70.0)]
        readings = cgm_run(1, 12, 160.0)
        b = meal_burdens(events, IcConfig(), cgm_readings=readings,
                         isf_effective=self.ISF)[0]
        self.assertAlmostEqual(b.bg0, 70.0, places=1)
        self.assertAlmostEqual(b.bg_outcome_u, (160.0 - 70.0) / 50.0, places=2)
        self.assertAlmostEqual(b.true_ic, 60.0 / 11.8, places=2)
        target_baseline_ic = 60.0 / (10.0 + (160.0 - TARGET_BG) / self.ISF)
        self.assertLess(b.true_ic, target_baseline_ic)  # tighter than target baseline

    def test_bg0_sourced_from_cgm_when_bolus_has_no_bg(self):
        # No bolus BG, but a CGM reading 5 min before the bolus reads 150 -> that is
        # bg0. Reads 150 at full DIA (no travel) -> outcome 0, correctly covered.
        base = datetime(2026, 6, 1, 12, 0, 0)
        pre = [CgmReading(t=base - timedelta(minutes=5), bg=150.0)]
        readings = pre + cgm_run(1, 12, 150.0)
        b = meal_burdens([meal(1, 12, 60, 10.0)], IcConfig(),
                         cgm_readings=readings, isf_effective=self.ISF)[0]
        self.assertAlmostEqual(b.bg0, 150.0, places=1)
        self.assertAlmostEqual(b.bg_outcome_u, 0.0, places=2)

    def test_bolus_bg_wins_over_cgm(self):
        # The bolus row's own BG is authoritative; a differing pre-meal CGM is ignored.
        base = datetime(2026, 6, 1, 12, 0, 0)
        pre = [CgmReading(t=base - timedelta(minutes=5), bg=200.0)]
        readings = pre + cgm_run(1, 12, 160.0)
        b = meal_burdens([meal(1, 12, 60, 10.0, bg=110.0)], IcConfig(),
                         cgm_readings=readings, isf_effective=self.ISF)[0]
        self.assertAlmostEqual(b.bg0, 110.0, places=1)
        self.assertAlmostEqual(b.bg_outcome_u, 1.0, places=2)

    def test_missing_bg0_falls_back_to_correction_only(self):
        # The outcome reads cleanly, but there is NO starting BG (no bolus bg, no
        # CGM within ±10 min of the bolus) -> the meal must NOT assume it started
        # at target; it drops to the correction-only fallback (bg_outcome_u None),
        # never mixing a start-based and a target-based baseline in the pool.
        base = datetime(2026, 6, 1, 12, 0, 0)
        # Nearest pre-bolus CGM is 15 min out (> bg0_max_gap_min=10) -> not usable.
        far = [CgmReading(t=base - timedelta(minutes=15), bg=150.0)]
        readings = far + cgm_run(1, 12, 160.0)
        b = meal_burdens([meal(1, 12, 60, 10.0)], IcConfig(),
                         cgm_readings=readings, isf_effective=self.ISF)[0]
        self.assertIsNone(b.bg0)
        self.assertIsNone(b.bg_outcome_u)
        self.assertIsNotNone(b.outcome_bg)  # the read exists; only the baseline is missing
        self.assertFalse(b.has_outcome)     # excluded from the outcome point estimate
        self.assertAlmostEqual(b.true_ic, 6.0, places=2)  # correction-only 60/10

    def test_start_high_hypo_floor_interaction(self):
        # Starts high (200) and crashes to 60: travelled -140 → (60-200)/50 = -2.8U
        # over-covered. corrected_total = 1.0 + (-2.8) <= 0, so the denominator is
        # floored at hypo_floor_frac * insulin_acted. The meal is retained as
        # extreme over-coverage, and the baseline that produced the crash is the
        # START, not target ( (60-110)/50 = -1.0 would understate it ).
        base = datetime(2026, 6, 1, 12, 0, 0)
        readings = [CgmReading(t=base + timedelta(minutes=m), bg=60.0)
                    for m in (295, 300, 305)]
        b = meal_burdens([BolusEvent(t=base, insulin=1.0, carbs=60.0, bg=200.0)],
                         IcConfig(), cgm_readings=readings, isf_effective=self.ISF)[0]
        self.assertAlmostEqual(b.bg0, 200.0, places=1)
        self.assertAlmostEqual(b.bg_outcome_u, (60.0 - 200.0) / 50.0, places=2)
        self.assertAlmostEqual(b.effective_insulin, 0.1, places=4)  # floored
        self.assertAlmostEqual(b.true_ic, 60.0 / 0.1, places=1)
        self.assertTrue(b.has_outcome)

    def test_flat_outcome_at_full_dia_confirms_programmed(self):
        # Meals that start high and read the same BG at full DIA travelled nowhere
        # with the whole bolus absorbed: correctly covered, pooled estimate 6.0 ==
        # programmed. (The settle-read #181 cut loosened here — a flat BG mid-meal
        # with a discounted bolus read as over-coverage; that discount was the
        # artifact, ADR 0017.)
        events, readings = [], []
        for d in (1, 2, 3, 4):
            events.append(meal(d, 12, 60, 10.0, bg=170.0))
            readings += cgm_run(d, 12, 170.0)
        ic_segs, _ = analyze_ic(events, IC_6, cgm_readings=readings,
                                isf_effective=self.ISF)
        self.assertAlmostEqual(ic_segs[0].estimate.value, 6.0, delta=1e-2)
        for p in ic_segs[0].evidence["points"]:
            self.assertAlmostEqual(p["start_bg"], 170.0, places=1)
            self.assertAlmostEqual(p["bg_outcome_u"], 0.0, places=2)


class FullMealLedgerTest(unittest.TestCase):
    """ADR 0041: I:C uses a closed meal ledger with rescue carbs and CIQ basal delta."""

    ISF = 50.0

    @staticmethod
    def _rescue(day, hh=13, mm=0, grams=10.0, certainty="estimate"):
        return CarbEntry(t=datetime(2026, 6, day, hh, mm, 0), grams=grams,
                         certainty=certainty, source="manual")

    def test_ciq_extra_basal_enters_denominator_positive(self):
        events = [meal(1, 12, 60, 10.0, bg=TARGET_BG)]
        basal = [basal_delta(1, 12, delivered=1.0, programmed=0.0, duration=60.0)]
        b = meal_burdens(events, IcConfig(), cgm_readings=cgm_run(1, 12, TARGET_BG),
                         isf_effective=self.ISF, basal_events=basal)[0]
        self.assertAlmostEqual(b.ciq_basal_delta_u, 1.0, places=3)
        self.assertAlmostEqual(b.ciq_basal_delta_acted_u, 1.0, places=3)
        self.assertAlmostEqual(b.effective_insulin, 11.0, places=3)
        self.assertAlmostEqual(b.true_ic, 60.0 / 11.0, places=2)

    def test_ciq_withheld_basal_enters_denominator_negative(self):
        events = [meal(1, 12, 60, 10.0, bg=TARGET_BG)]
        basal = [basal_delta(1, 12, delivered=0.0, programmed=1.0, duration=60.0)]
        b = meal_burdens(events, IcConfig(), cgm_readings=cgm_run(1, 12, TARGET_BG),
                         isf_effective=self.ISF, basal_events=basal)[0]
        self.assertAlmostEqual(b.ciq_basal_delta_u, -1.0, places=3)
        self.assertAlmostEqual(b.ciq_basal_delta_acted_u, -1.0, places=3)
        self.assertAlmostEqual(b.effective_insulin, 9.0, places=3)
        self.assertAlmostEqual(b.true_ic, 60.0 / 9.0, places=2)

    def test_ciq_suspension_type_enters_denominator_negative(self):
        events = [meal(1, 12, 60, 10.0, bg=TARGET_BG)]
        basal = [basal_delta(1, 12, delivered=0.0, programmed=1.0, duration=60.0,
                             delivery_type="algorithmDelivery (control-iq suspension)")]
        b = meal_burdens(events, IcConfig(), cgm_readings=cgm_run(1, 12, TARGET_BG),
                         isf_effective=self.ISF, basal_events=basal)[0]
        self.assertAlmostEqual(b.ciq_basal_delta_u, -1.0, places=3)
        self.assertAlmostEqual(b.ciq_basal_delta_acted_u, -1.0, places=3)
        self.assertAlmostEqual(b.effective_insulin, 9.0, places=3)

    def test_user_temp_basal_delta_is_not_ciq_compensation(self):
        events = [meal(1, 12, 60, 10.0, bg=TARGET_BG)]
        basal = [basal_delta(1, 12, delivered=0.0, programmed=1.0, duration=60.0,
                             delivery_type="tempDelivery")]
        b = meal_burdens(events, IcConfig(), cgm_readings=cgm_run(1, 12, TARGET_BG),
                         isf_effective=self.ISF, basal_events=basal)[0]
        self.assertAlmostEqual(b.ciq_basal_delta_u, 0.0, places=3)
        self.assertAlmostEqual(b.ciq_basal_delta_acted_u, 0.0, places=3)
        self.assertAlmostEqual(b.effective_insulin, 10.0, places=3)
        self.assertAlmostEqual(b.true_ic, 6.0, places=2)

    def test_known_attributable_rescue_carbs_enter_closed_ledger_numerator(self):
        events = [meal(1, 12, 60, 10.0, bg=TARGET_BG)]
        entries = [self._rescue(1, grams=10.0)]
        b = meal_burdens(events, IcConfig(), cgm_readings=cgm_run(1, 12, TARGET_BG),
                         isf_effective=self.ISF, carb_entries=entries)[0]
        self.assertAlmostEqual(b.meal_carbs, 60.0)
        self.assertAlmostEqual(b.rescue_carbs, 10.0)
        self.assertAlmostEqual(b.carbs, 70.0)
        self.assertAlmostEqual(b.effective_insulin, 10.0, places=3)
        self.assertAlmostEqual(b.true_ic, 7.0, places=2)
        self.assertEqual(b.rescue_carb_times, (entries[0].t,))

    def test_unknown_rescue_is_gate_only_and_not_a_numeric_meal(self):
        events = []
        for d in (1, 2, 3):
            events += [meal(d, 12, 60, 10.0), corr(d, 14, 0, 2.0)]
        events.append(meal(4, 12, 60, 10.0))
        entries = [self._rescue(4, grams=None, certainty="unknown")]

        rows, _ = analyze_ic(events, IC_6, carb_entries=entries)
        seg = rows[0]
        self.assertEqual(seg.estimate.n, 3)
        self.assertEqual(len(seg.evidence["points"]), 3)
        self.assertEqual(seg.recommended, 6.0)
        self.assertIn("pre-empted low", seg.annotation)
        self.assertEqual(seg.evidence["preempted_low_gate"]["count"], 1)

    def test_numeric_rescue_is_not_also_used_as_gate_only_evidence(self):
        events = []
        readings = []
        entries = [self._rescue(1, grams=10.0)]
        for d in (1, 2, 3):
            events.append(meal(d, 12, 60, 10.0, bg=TARGET_BG))
            readings += cgm_run(d, 12, TARGET_BG)

        rows, _ = analyze_ic(events, IC_6, cgm_readings=readings,
                             isf_effective=self.ISF, carb_entries=entries)
        seg = rows[0]
        self.assertEqual(seg.estimate.n, 3)
        self.assertNotIn("preempted_low_gate", seg.evidence)
        rescue_points = [p for p in seg.evidence["points"] if p["rescue_carbs"]]
        self.assertEqual(len(rescue_points), 1)
        self.assertEqual(rescue_points[0]["rescue_carbs"], 10.0)


class PrintedRescueAdmissionTest(unittest.TestCase):
    """ADR 0038 §5: a printed-and-rescued meal re-enters the I:C balance sheet with
    its rescue grams as carbs-covered — instead of being evicted by post-meal
    isolation — but only through three gates (started near target, no rebound-high,
    low attributable to this meal's own IOB)."""

    ISF = 50.0

    @staticmethod
    def _rescue(day, hh=13, mm=0, grams=15.0, certainty="estimate"):
        return CarbEntry(t=datetime(2026, 6, day, hh, mm, 0), grams=grams,
                         certainty=certainty, source="manual")

    @staticmethod
    def _low(day, hh=13, mm=0, bg=55.0, meal_hh=12, carbs=60.0):
        """A harm-layer printed low attributed to the day's meal bolus."""
        return PrintedLow(
            t=datetime(2026, 6, day, hh, mm, 0), bg=bg, iob_u=2.0, arm=HarmArm.IC,
            dominant_bolus_t=datetime(2026, 6, day, meal_hh, 0, 0),
            dominant_bolus_carbs=carbs, attribution_reason="meal-bolus")

    @staticmethod
    def _cgm(day, outcome_bg=110.0):
        """CGM that prints a low ~13:00 (so it is a printed-and-rescued, not a
        pre-empted, low) and recovers to ``outcome_bg`` by the full-DIA read."""
        base = datetime(2026, 6, day, 12, 0, 0)
        low_run = [CgmReading(t=base + timedelta(minutes=m), bg=bg)
                   for m, bg in [(50, 68), (55, 58), (60, 55), (65, 60), (70, 72)]]
        return low_run + cgm_run(day, 12, outcome_bg)

    def test_all_gates_pass_readmits_meal_with_rescue_grams(self):
        events = [meal(1, 12, 60, 10.0, bg=110.0)]
        entries = [self._rescue(1, grams=15.0)]
        burdens = meal_burdens(events, IcConfig(), cgm_readings=self._cgm(1),
                               isf_effective=self.ISF, carb_entries=entries,
                               harm_lows=[self._low(1)])
        self.assertEqual(len(burdens), 1)
        b = burdens[0]
        self.assertAlmostEqual(b.meal_carbs, 60.0)
        self.assertAlmostEqual(b.rescue_carbs, 15.0)
        self.assertAlmostEqual(b.carbs, 75.0)
        self.assertAlmostEqual(b.effective_insulin, 10.0, places=3)
        # 60g dosed + 15g rescued over ~10U acted -> a looser (larger g/U) I:C than
        # the naive 6.0 read, because the meal drove a low it had to rescue.
        self.assertAlmostEqual(b.true_ic, 7.5, places=2)
        self.assertEqual(b.rescue_carb_times, (entries[0].t,))

    def test_without_harm_layer_the_rescue_evicts_the_meal(self):
        # Same meal + rescue, but no harm_lows: the rescue carb log sits in the
        # post-meal window and evicts the meal (the pre-#295 baseline).
        events = [meal(1, 12, 60, 10.0, bg=110.0)]
        entries = [self._rescue(1, grams=15.0)]
        burdens = meal_burdens(events, IcConfig(), cgm_readings=self._cgm(1),
                               isf_effective=self.ISF, carb_entries=entries)
        self.assertEqual(burdens, [])

    def test_gate_a_high_start_is_guarded_out(self):
        # A 233-start meal is a correction, not a near-target meal — guarded out
        # (unguarded it would blow up to ~82 g/U through the hypo floor).
        events = [meal(1, 12, 60, 10.0, bg=233.0)]
        entries = [self._rescue(1, grams=15.0)]
        burdens = meal_burdens(events, IcConfig(), cgm_readings=self._cgm(1),
                               isf_effective=self.ISF, carb_entries=entries,
                               harm_lows=[self._low(1)])
        self.assertEqual(burdens, [])

    def test_gate_b_rebound_high_is_guarded_out(self):
        events = [meal(1, 12, 60, 10.0, bg=110.0)]
        entries = [self._rescue(1, grams=15.0)]
        # BG rebounds to 200 after the rescue -> the rescue over-treated, so the grams
        # aren't clean carb coverage. Guarded out.
        cgm = self._cgm(1) + [
            CgmReading(t=datetime(2026, 6, 1, 14, 0, 0), bg=200.0)]
        burdens = meal_burdens(events, IcConfig(), cgm_readings=cgm,
                               isf_effective=self.ISF, carb_entries=entries,
                               harm_lows=[self._low(1)])
        self.assertEqual(burdens, [])

    def test_gate_c_low_owned_by_another_bolus_is_guarded_out(self):
        events = [meal(1, 12, 60, 10.0, bg=110.0)]
        entries = [self._rescue(1, grams=15.0)]
        # A printed low the harm layer attributed to an earlier bolus, not this meal.
        other = PrintedLow(t=datetime(2026, 6, 1, 13, 0, 0), bg=55.0, iob_u=2.0,
                           arm=HarmArm.IC,
                           dominant_bolus_t=datetime(2026, 6, 1, 9, 0, 0),
                           dominant_bolus_carbs=40.0)
        burdens = meal_burdens(events, IcConfig(), cgm_readings=self._cgm(1),
                               isf_effective=self.ISF, carb_entries=entries,
                               harm_lows=[other])
        self.assertEqual(burdens, [])

    def test_unknown_grams_printed_rescue_is_not_numeric(self):
        # An "ate something, don't know" rescue can't close the ledger, so the meal
        # is not a numeric burden (it falls to the gate-only path).
        events = [meal(1, 12, 60, 10.0, bg=110.0)]
        entries = [self._rescue(1, grams=None, certainty="unknown")]
        burdens = meal_burdens(events, IcConfig(), cgm_readings=self._cgm(1),
                               isf_effective=self.ISF, carb_entries=entries,
                               harm_lows=[self._low(1)])
        self.assertEqual(burdens, [])

    def test_analyze_ic_readmits_printed_rescue_end_to_end(self):
        # Full path: the harm layer detects and attributes the printed low from CGM,
        # and analyze_ic re-admits the meal. CGM prints a low ~13:00 and recovers to
        # 110 by the full-DIA read.
        base = datetime(2026, 6, 1, 12, 0, 0)
        low_run = [CgmReading(t=base + timedelta(minutes=m), bg=bg)
                   for m, bg in [(50, 68), (55, 58), (60, 55), (65, 60), (70, 72)]]
        events = [meal(1, 12, 60, 10.0, bg=110.0)]
        cgm = low_run + cgm_run(1, 12, 110.0)
        entries = [self._rescue(1, grams=15.0)]
        rows, _ = analyze_ic(events, IC_6, cgm_readings=cgm, isf_effective=self.ISF,
                             carb_entries=entries, harm_config=HarmConfig())
        pts = [p for p in rows[0].evidence["points"] if p["rescue_carbs"]]
        self.assertEqual(len(pts), 1)
        self.assertAlmostEqual(pts[0]["rescue_carbs"], 15.0)
        self.assertAlmostEqual(pts[0]["bg_outcome_u"], 0.0, places=2)
        self.assertAlmostEqual(pts[0]["effective_insulin"], 10.0, places=2)


class AnalyzeFacadeIcLedgerTest(unittest.TestCase):
    def test_analyze_threads_basal_stream_into_ic_ledger(self):
        bolus, cgm, basal = [], [], []
        for d in (1, 2, 3):
            bolus.append(meal(d, 12, 60, 10.0, bg=TARGET_BG))
            cgm += cgm_run(d, 12, TARGET_BG)
            basal.append(basal_delta(d, 12, delivered=1.0, programmed=0.0,
                                     duration=60.0))
        snaps = [Snapshot(datetime(2026, 6, 1, 0, 0, 0),
                          parse_pump_settings(_raw_settings(isf=50, cr_mu=6000)))]
        store = _FakeAnalyzeStore(basal=basal, cgm=cgm, bolus=bolus, snapshots=snaps)

        result = analyze(store, window_days=30, now=datetime(2026, 6, 4, 0, 0, 0),
                         harm_config=None)
        points = result.ic[0].evidence["points"]
        self.assertEqual(len(points), 3)
        for p in points:
            self.assertAlmostEqual(p["ciq_basal_delta_acted_u"], 1.0, places=3)
            self.assertAlmostEqual(p["effective_insulin"], 11.0, places=3)
        self.assertAlmostEqual(result.ic[0].estimate.value, 60.0 / 11.0, delta=1e-3)


class AnalyzeIcTest(unittest.TestCase):
    def _consistent(self):
        # 4 meals on 4 days, each 60g/10U with a steady 2U post-correction.
        events = []
        for d in (1, 2, 3, 4):
            events += [meal(d, 12, 60, 10.0), corr(d, 14, 0, 2.0)]
        return events

    def test_systematic_excess_gives_tighter_ic_estimate(self):
        ic_segs, findings = analyze_ic(self._consistent(), IC_6)
        self.assertEqual(len(ic_segs), 1)
        seg = ic_segs[0]
        self.assertEqual(seg.parameter, "carb_ratio")
        self.assertEqual(seg.current, 6.0)
        self.assertAlmostEqual(seg.estimate.value, 5.0, delta=0.3)   # true I:C tighter
        self.assertLess(seg.recommended, 6.0)                        # recommend tightening
        self.assertGreaterEqual(seg.recommended, 6.0 * 0.8 - 1e-9)   # capped one step
        # Consistent burden -> no carb-counting flag.
        self.assertEqual([f for f in findings if f.detector == "carb-counting"], [])
        # Carbs-vs-correction-burden scatter for the evidence modal: one point per meal.
        points = seg.evidence["points"]
        self.assertEqual(len(points), 4)
        for p in points:
            self.assertEqual(p["carbs"], 60.0)
            self.assertAlmostEqual(p["burden"], 2.0)
            # #20: each meal's own timestamp, for the unified evidence -> Daily
            # report drill-down.
            self.assertIn("T12:00", p["t"])

    def test_wide_implied_ic_raises_carb_counting_finding(self):
        # Widely scattered implied I:C (small meals over-bolused, big meals
        # under-bolused) -> the pooled I:C interval is `wide` -> carb-counting flag.
        # This keys off true_ic dispersion, not the old burden-per-carb CV.
        events = []
        data = ((1, 20, 10.0, 0.0), (2, 80, 10.0, 0.0), (3, 30, 12.0, 3.0),
                (4, 90, 9.0, 0.0), (5, 25, 11.0, 4.0), (6, 85, 8.0, 0.0))
        for d, carbs, dose, cor in data:
            events.append(meal(d, 12, carbs, dose))
            if cor:
                events.append(corr(d, 14, 0, cor))
        ic_segs, findings = analyze_ic(events, IC_6)
        carb_findings = [f for f in findings if f.detector == "carb-counting"]
        self.assertEqual(len(carb_findings), 1)
        self.assertIn("carb", carb_findings[0].summary.lower())
        # Evidence carries the wide I:C estimate, not a CV.
        self.assertTrue(carb_findings[0].evidence["ic_estimate"]["wide"])
        self.assertNotIn("cv", carb_findings[0].evidence)

    def test_tight_implied_ic_does_not_flag_carb_counting(self):
        # A well-covered dataset: implied I:C tight (CV small) -> the pooled I:C
        # interval is NOT wide -> no carb-counting finding, even though most meals
        # need little/no correction (the old CV-on-burden fired HIGH here).
        events = []
        # Consistent ~5:1 counting across varied meal sizes, near-zero burdens.
        for d, carbs, dose in ((1, 50, 10.0), (2, 60, 12.0), (3, 45, 9.0),
                               (4, 55, 11.0), (5, 48, 9.6), (6, 52, 10.4)):
            events.append(meal(d, 12, carbs, dose))
        ic_segs, findings = analyze_ic(events, IC_6)
        self.assertFalse(ic_segs[0].estimate.wide)
        self.assertEqual([f for f in findings if f.detector == "carb-counting"], [])

    def test_ic_estimate_is_pooled_not_mean_of_ratios(self):
        # Mean-of-ratios is biased high vs pooled Σcarbs/Σinsulin. Meal sizes vary,
        # so the two estimators diverge: mean([carbs/ins]) > Σcarbs/Σins.
        import statistics as _stats

        from ciq_autotune.analyzers.ic import meal_burdens
        events = []
        # Small-dose meals with a high per-meal ratio inflate the ratio mean
        # (mean-of-ratios overweights small denominators); the pooled ratio does not.
        for d, carbs, dose in ((1, 50, 5.0), (2, 48, 6.0), (3, 40, 10.0),
                               (4, 45, 12.0), (5, 44, 11.0)):
            events.append(meal(d, 12, carbs, dose))
        burdens = meal_burdens(events, IcConfig())
        mean_of_ratios = _stats.fmean([b.carbs / b.effective_insulin for b in burdens])
        pooled = sum(b.carbs for b in burdens) / sum(b.effective_insulin for b in burdens)
        # The estimator must report the pooled value, and it must be below the
        # (upward-biased) mean-of-ratios.
        ic_segs, _ = analyze_ic(events, IC_6)
        self.assertAlmostEqual(ic_segs[0].estimate.value, pooled, delta=1e-3)
        self.assertLess(pooled, mean_of_ratios)

    def test_fallback_meals_excluded_from_point_estimate(self):
        # Outcome-confirmed meals imply I:C ~5.45; a fallback (no CGM at the read)
        # meal centres elsewhere. The point estimate must be built from the
        # confirmed subpopulation only, so the fallback meal does not pull it.
        from ciq_autotune.analyzers.ic import meal_burdens
        events = []
        readings = []
        # Three confirmed meals starting at target: 60g/10U reading 50 high at
        # full DIA -> effective 11U, ic ~5.45.
        for d in (1, 2, 3):
            events.append(meal(d, 12, 60, 10.0, bg=TARGET_BG))
            readings += cgm_run(d, 12, TARGET_BG + 50.0)
        # A fourth meal with NO CGM in its window -> falls back to correction-only
        # (60/20 = 3.0), a very different centre.
        events.append(meal(4, 12, 60, 20.0))
        ic_segs, _ = analyze_ic(events, IC_6, cgm_readings=readings,
                                isf_effective=50.0)
        burdens = meal_burdens(events, IcConfig(), cgm_readings=readings,
                               isf_effective=50.0)
        confirmed = [b for b in burdens if b.has_outcome]
        fallback = [b for b in burdens if not b.has_outcome]
        self.assertEqual(len(confirmed), 3)
        self.assertEqual(len(fallback), 1)
        # Point estimate = pooled over confirmed meals only (180 / 33 = 5.454),
        # not diluted by the fallback meal's 3.0.
        expected = sum(b.carbs for b in confirmed) / sum(b.effective_insulin for b in confirmed)
        self.assertAlmostEqual(ic_segs[0].estimate.value, expected, delta=1e-3)
        self.assertEqual(ic_segs[0].estimate.n, 3)  # n reflects confirmed meals

    def test_all_fallback_uses_all_meals(self):
        # With no CGM every meal is a correction-only fallback; the estimate then
        # falls back to pooling all of them rather than reporting nothing.
        events = [meal(d, 12, 60, 10.0) for d in (1, 2, 3)]
        ic_segs, _ = analyze_ic(events, IC_6)  # no cgm_readings
        self.assertEqual(ic_segs[0].estimate.n, 3)
        self.assertAlmostEqual(ic_segs[0].estimate.value, 6.0, delta=1e-3)

    def test_no_meals_no_estimate_no_findings(self):
        ic_segs, findings = analyze_ic([], IC_6)
        self.assertIsNone(ic_segs[0].estimate.value)
        self.assertIsNone(ic_segs[0].recommended)
        self.assertEqual(findings, [])

    def test_below_min_meals_estimate_visible_but_no_recommendation(self):
        # n=2 meals: estimate is present (value and n set) but min_meals=3 gate blocks
        # the recommendation. This is the #176 bug: previously recommended fired anyway.
        events = [meal(d, 12, 60, 10.0) for d in (1, 2)]
        ic_segs, _ = analyze_ic(events, IC_6)
        seg = ic_segs[0]
        self.assertEqual(seg.estimate.n, 2)
        self.assertIsNotNone(seg.estimate.value)   # estimate stays visible
        self.assertIsNone(seg.recommended)          # but no recommendation
        self.assertIn("2 clean-start/correction-only meals", seg.annotation)
        self.assertIn("1 more needed", seg.annotation)

    def test_at_min_meals_boundary_recommendation_fires(self):
        # Exactly min_meals=3 → gate satisfied, recommendation should be non-None.
        events = [meal(d, 12, 60, 10.0) for d in (1, 2, 3)]
        ic_segs, _ = analyze_ic(events, IC_6)
        self.assertIsNotNone(ic_segs[0].recommended)

    def test_recommend_is_half_the_gap_capped_at_20_percent(self):
        cfg = IcConfig()
        # Reference midday: 5.4 → measured 5.82. Half-gap = 5.4 + (5.82−5.4)/2 ≈ 5.61 → 5.6,
        # NOT the full-step 6.5 (5.4 × 1.20) the old capped-to-measured rule produced.
        rec, _ = _recommend(5.4, 5.8227, cfg)
        self.assertEqual(rec, 5.6)
        # A gap larger than ±20% still clamps at the ±20% cap (half-gap of a 2× would be
        # 8.1, but the cap holds it to 5.4 × 1.20 = 6.48 → 6.5).
        rec_far, _ = _recommend(5.4, 10.8, cfg)
        self.assertEqual(rec_far, 6.5)
        # Symmetric on the tighten side: 6.0 → 5.0 half-gap is 5.5, inside the cap.
        rec_tight, _ = _recommend(6.0, 5.0, cfg)
        self.assertEqual(rec_tight, 5.5)

    def test_recurrent_meal_lows_no_longer_nudge_a_looser_step(self):
        # #410: the harm arm's step is retired. Recurring meal-owned lows no longer
        # fabricate a looser recommendation (the old "nudged one ≤20% step weaker" →
        # 7.2); with no measured meals there is simply nothing to recommend. The
        # recurrence bar is still recorded in the evidence, and no step-nudge annotation
        # is emitted.
        lows = [
            PrintedLow(datetime(2026, 6, 1, 17, 0, 0), 55.0, 2.0, HarmArm.IC,
                       dominant_bolus_t=datetime(2026, 6, 1, 12, 0, 0)),
            PrintedLow(datetime(2026, 6, 2, 17, 0, 0), 58.0, 1.8, HarmArm.IC,
                       dominant_bolus_t=datetime(2026, 6, 2, 12, 0, 0)),
        ]
        ic_segs, _ = analyze_ic([], IC_6, harm_config=HarmConfig(), harm_lows=lows)
        seg = ic_segs[0]
        self.assertIsNone(seg.recommended)                 # no fabricated looser step
        self.assertNotIn("nudged", seg.annotation)         # no step-nudge annotation
        self.assertTrue(seg.evidence["harm"]["nudged"])    # recurrence bar still recorded

    def test_recurrent_meal_lows_still_gate_a_tighter_move(self):
        # #410: the harm arm keeps its HOLD. Under-covered meals imply a tighter (5.5)
        # half-gap step, but because meal-owned lows recur the gate withholds it and
        # holds at the current ratio — the hold stays, only the step retired.
        meals = [meal(d, 12, 60, 12.0) for d in (1, 2, 3)]   # true_ic ~5.0 < programmed 6.0
        lows = [
            PrintedLow(datetime(2026, 6, d, 15, 0, 0), 55.0, 2.0, HarmArm.IC,
                       dominant_bolus_t=datetime(2026, 6, d, 12, 0, 0))
            for d in (1, 2)
        ]
        ic_segs, _ = analyze_ic(meals, IC_6, harm_config=HarmConfig(), harm_lows=lows)
        seg = ic_segs[0]
        self.assertEqual(seg.estimate.value, 5.0)           # meals measure tighter
        self.assertEqual(seg.recommended, 6.0)              # held at current, not tightened
        self.assertFalse(seg.asserts_move)                  # the hold is canonical
        self.assertIn("withheld", seg.annotation)
        self.assertNotIn("nudged", seg.annotation)

    def test_well_counted_meals_are_not_flagged_despite_tiny_jitter(self):
        # Near-zero burdens with high relative spread must NOT raise a carb flag —
        # there is nothing wrong when meals are well-covered.
        events = []
        for d, c in ((1, 0.0), (2, 0.1), (3, 0.0), (4, 0.2), (5, 0.0)):
            events += [meal(d, 12, 60, 10.0)]
            if c:
                events.append(corr(d, 14, 0, c))
        _, findings = analyze_ic(events, IC_6)
        self.assertEqual([f for f in findings if f.detector == "carb-counting"], [])


class CarbEntryExclusionTest(unittest.TestCase):
    """#127: a manual carb-log entry joins meal_times for isolation only.

    It never becomes an estimated meal (`_is_meal` needs insulin, entries carry
    none). A mid-window entry drops the meal (isolation). As of #181 the correction
    guard is pump-IOB-based, so a prior entry no longer zeroes corrections.
    """

    @staticmethod
    def _entry(day, hh, mm, grams=20.0, certainty="estimate"):
        return CarbEntry(t=datetime(2026, 6, day, hh, mm, 0), grams=grams,
                         certainty=certainty, source="manual")

    def test_entry_in_post_window_drops_the_meal(self):
        # 60g meal at 12:00; without any entry it yields one burden.
        events = [meal(1, 12, 60, 10.0), corr(1, 14, 0, 2.0)]
        self.assertEqual(len(meal_burdens(events, IcConfig())), 1)
        # A snack logged at 13:00 lands inside the meal's post-window (12:00–15:00),
        # so the meal is no longer isolated and drops out entirely.
        entries = [self._entry(1, 13, 0)]
        self.assertEqual(meal_burdens(events, IcConfig(), carb_entries=entries), [])

    def test_prior_entry_does_not_zero_corrections(self):
        # Meal at 12:00 with a 2U correction at 14:00 → post_correction 2.0 normally.
        events = [meal(1, 12, 60, 10.0), corr(1, 14, 0, 2.0)]
        self.assertAlmostEqual(meal_burdens(events, IcConfig())[0].post_correction, 2.0)
        # A prior entry at 11:00 no longer touches the correction guard (#181 replaced
        # the time-based guard with a pump-IOB one, which entries don't feed). The
        # entry is outside the post-window, so the meal is untouched.
        entries = [self._entry(1, 11, 0)]
        burdens = meal_burdens(events, IcConfig(), carb_entries=entries)
        self.assertEqual(len(burdens), 1)
        self.assertAlmostEqual(burdens[0].post_correction, 2.0)

    def test_entry_outside_windows_leaves_the_meal_untouched(self):
        events = [meal(1, 12, 60, 10.0), corr(1, 14, 0, 2.0)]
        base = meal_burdens(events, IcConfig())
        # An entry at 20:00 is clear of the post-window (isolation is the only lever
        # carb entries pull; the correction guard is pump-IOB-based, #181).
        entries = [self._entry(1, 20, 0)]
        got = meal_burdens(events, IcConfig(), carb_entries=entries)
        self.assertEqual(len(got), 1)
        self.assertAlmostEqual(got[0].post_correction, base[0].post_correction)
        self.assertAlmostEqual(got[0].true_ic, base[0].true_ic)

    def test_grams_null_behaves_identically_to_grams_20(self):
        events = [meal(1, 12, 60, 10.0), corr(1, 14, 0, 2.0)]
        known = meal_burdens(events, IcConfig(),
                             carb_entries=[self._entry(1, 13, 0, grams=20.0)])
        unknown = meal_burdens(events, IcConfig(),
                               carb_entries=[self._entry(1, 13, 0, grams=None,
                                                         certainty="unknown")])
        self.assertEqual(known, unknown)  # both drop the meal → []

    def test_entry_is_never_an_estimated_meal(self):
        # A lone carb entry (no bolus) produces no burden — entries carry no insulin.
        entries = [self._entry(1, 12, 0, grams=60.0)]
        self.assertEqual(meal_burdens([], IcConfig(), carb_entries=entries), [])


class MealsStartHighFindingTest(unittest.TestCase):
    """#178: the pre-meal-high signal #175 displaced from the I:C outcome math gets a
    home as a behavioral Finding. Fires when the median starting BG (`bg0`) across the
    meals with a known start exceeds CIQ's 110 target; framed as a delta; coaching, not
    a parameter prescription; `correction_insulin` is never used to split it (#175's
    IOB-netting caveat)."""

    def _high_pool(self, bg=155.0):
        # 4 meals across 4 days, each starting at `bg`, well-covered (true_ic == 6.0).
        return [meal(d, 12, 60, 10.0, bg=bg) for d in (1, 2, 3, 4)]

    def _finding(self, findings):
        hits = [f for f in findings if f.detector == "meals-start-high"]
        return hits[0] if hits else None

    def test_fires_when_median_bg0_above_target(self):
        _, findings = analyze_ic(self._high_pool(155.0), IC_6)
        f = self._finding(findings)
        self.assertIsNotNone(f)
        # Body states the median pre-meal BG, the 110 target, and the median delta.
        self.assertIn("155", f.summary)
        self.assertIn("110", f.summary)
        self.assertIn("45", f.summary)  # 155 - 110

    def test_does_not_fire_when_meals_start_near_target(self):
        # Median bg0 = 108 < 110 → the signal is absent, finding stays silent.
        _, findings = analyze_ic(self._high_pool(108.0), IC_6)
        self.assertIsNone(self._finding(findings))

    def test_at_target_does_not_fire(self):
        # Exactly at target is not "above" target.
        _, findings = analyze_ic(self._high_pool(TARGET_BG), IC_6)
        self.assertIsNone(self._finding(findings))

    def test_excludes_bg0_none_meals_from_median(self):
        # Meals with no resolvable start BG (no bolus bg, no CGM) must not enter the
        # median. Four meals start at 160 (bg0 set); adding two starts-unknown meals
        # (which would drag a naive average down) must not change that the median of
        # the *known* pool is 160 > 110.
        events = self._high_pool(160.0) + [meal(5, 12, 60, 10.0), meal(6, 12, 60, 10.0)]
        _, findings = analyze_ic(events, IC_6)
        f = self._finding(findings)
        self.assertIsNotNone(f)
        self.assertIn("160", f.summary)
        # Evidence scatter carries only the meals with a known start BG.
        self.assertEqual(len(f.evidence["start_bgs"]), 4)

    def test_evidence_carries_per_meal_bg0(self):
        _, findings = analyze_ic(self._high_pool(150.0), IC_6)
        f = self._finding(findings)
        self.assertEqual(sorted(f.evidence["start_bgs"]), [150.0] * 4)
        self.assertAlmostEqual(f.evidence["median_bg0"], 150.0)
        self.assertAlmostEqual(f.evidence["target"], TARGET_BG)
        self.assertAlmostEqual(f.evidence["delta"], 40.0)

    def test_copy_names_both_levers_and_is_coaching(self):
        _, findings = analyze_ic(self._high_pool(155.0), IC_6)
        summary = self._finding(findings).summary.lower()
        self.assertIn("pre-bolus", summary)      # timing lever
        self.assertIn("correction", summary)     # pre-meal correction lever
        # Coaching, not a parameter prescription: it must not tell them to change I:C.
        self.assertNotIn("carb ratio", summary)
        self.assertNotIn("i:c", summary)

    def test_references_post_meal_burden_finding(self):
        # The related post-meal CIQ-burden signal (#65-B) is referenced as a see-also.
        _, findings = analyze_ic(self._high_pool(155.0), IC_6)
        self.assertIn("65-B", self._finding(findings).evidence["see_also"])

    def test_correction_insulin_does_not_change_the_finding(self):
        # #175: the pump's correction split is IOB-netted and unreliable, so it may not
        # split or qualify the finding. Two pools identical in bg0 but differing wildly
        # in post-correction insulin must produce the same finding.
        plain = self._high_pool(155.0)
        with_corr = self._high_pool(155.0) + [corr(d, 14, 0, 3.0) for d in (1, 2, 3, 4)]
        _, f_plain = analyze_ic(plain, IC_6)
        _, f_corr = analyze_ic(with_corr, IC_6)
        self.assertEqual(self._finding(f_plain).summary,
                         self._finding(f_corr).summary)

    def test_occurrences_carry_start_bg_detail(self):
        _, findings = analyze_ic(self._high_pool(155.0), IC_6)
        occ = self._finding(findings).occurrences
        self.assertEqual(len(occ), 4)
        self.assertIn("155", occ[0].detail)


class MealsStartHighCrossRefTest(unittest.TestCase):
    """#178: when the finding fires and a segment is confirmed (measured == programmed)
    or loosened (measured > programmed), the I:C card's annotation appends a static
    cross-reference — the pre-meal high is the bigger lever there. A *tightened*
    segment (measured < programmed, the ratio itself is flagged) does not."""

    XREF = "meals start high"

    def test_cross_ref_on_confirm(self):
        # 4 well-covered meals starting high (bg0 155): true_ic 6.0 == programmed 6.0
        # → confirm, and median bg0 155 > 110 → finding fires → cross-ref appended.
        events = [meal(d, 12, 60, 10.0, bg=155.0) for d in (1, 2, 3, 4)]
        ic_rows, _ = analyze_ic(events, IC_6)
        self.assertIn(self.XREF, ic_rows[0].annotation.lower())

    def test_cross_ref_on_loosen(self):
        # Over-covered: true_ic 60/10 = 6.0 > programmed 5.0 → loosen; starts high.
        events = [meal(d, 12, 60, 10.0, bg=155.0) for d in (1, 2, 3, 4)]
        ic_rows, _ = analyze_ic(events, [(0, 5.0)])
        self.assertIn(self.XREF, ic_rows[0].annotation.lower())

    def test_no_cross_ref_on_tighten(self):
        # Under-covered: 2U correction → true_ic 60/12 = 5.0 < programmed 6.0 → tighten.
        # Starts high so the finding still fires, but the tightened segment is silent.
        events = []
        for d in (1, 2, 3, 4):
            events += [meal(d, 12, 60, 10.0, bg=155.0), corr(d, 14, 0, 2.0)]
        ic_rows, findings = analyze_ic(events, IC_6)
        self.assertIsNotNone(
            [f for f in findings if f.detector == "meals-start-high"])
        self.assertNotIn(self.XREF, ic_rows[0].annotation.lower())

    def test_no_cross_ref_when_finding_absent(self):
        # Confirmed segment, but meals start near target → no finding → no cross-ref.
        events = [meal(d, 12, 60, 10.0, bg=108.0) for d in (1, 2, 3, 4)]
        ic_rows, _ = analyze_ic(events, IC_6)
        self.assertNotIn(self.XREF, ic_rows[0].annotation.lower())

    def test_no_cross_ref_when_below_min_meals(self):
        # Only 2 meals (< min_meals): no measured direction, no cross-ref even though
        # they start high.
        events = [meal(d, 12, 60, 10.0, bg=155.0) for d in (1, 2)]
        ic_rows, _ = analyze_ic(events, IC_6)
        self.assertNotIn(self.XREF, ic_rows[0].annotation.lower())


class PostMealCorrectionBurdenTest(unittest.TestCase):
    """#186: a reporting Finding decomposing post-meal correction insulin into
    user-delivered vs Control-IQ auto, gated on Msg2 provenance (not the sub-1U
    heuristic), framed honestly on whichever share dominates, cross-linked to #178.
    """

    DETECTOR = "post-meal-correction-burden"

    def _finding(self, findings):
        matched = [f for f in findings if f.detector == self.DETECTOR]
        return matched[0] if matched else None

    def test_burden_split_totals_user_vs_ciq(self):
        # Each of 4 isolated meals draws a 3U user correction and a 1U CIQ
        # auto-correction inside the post-meal window. Per meal the split is 3/1;
        # across the pool that totals 12U user / 4U CIQ.
        events = []
        for d in (1, 2, 3, 4):
            events += [meal(d, 12, 60, 10.0),
                       user_corr(d, 13, 0, 3.0), ciq_corr(d, 13, 30, 1.0)]
        burdens = meal_burdens(events, IcConfig())
        self.assertEqual(len(burdens), 4)
        for b in burdens:
            self.assertAlmostEqual(b.post_correction, 4.0)
            self.assertAlmostEqual(b.post_correction_user, 3.0)
            self.assertAlmostEqual(b.post_correction_ciq, 1.0)
            self.assertAlmostEqual(b.post_correction_unknown, 0.0)
            self.assertEqual(b.n_correction_user, 1)
            self.assertEqual(b.n_correction_ciq, 1)
        _, findings = analyze_ic(events, IC_6)
        f = self._finding(findings)
        self.assertIsNotNone(f)
        self.assertEqual(f.evidence["user_u"], 12.0)
        self.assertEqual(f.evidence["ciq_u"], 4.0)
        self.assertEqual(f.evidence["n_user"], 4)
        self.assertEqual(f.evidence["n_ciq"], 4)
        self.assertEqual(f.evidence["total_u"], 16.0)

    def test_split_uses_provenance_not_sub_1u_heuristic(self):
        # A small (0.6U) *user* correction and a large (2U) *CIQ auto* correction.
        # The retired heuristic would call the sub-1U one automatic; provenance
        # correctly books 0.6U to the user and 2U to CIQ.
        events = []
        for d in (1, 2, 3):
            events += [meal(d, 12, 60, 10.0),
                       user_corr(d, 13, 0, 0.6), ciq_corr(d, 13, 30, 2.0)]
        b = meal_burdens(events, IcConfig())[0]
        self.assertAlmostEqual(b.post_correction_user, 0.6)
        self.assertAlmostEqual(b.post_correction_ciq, 2.0)

    def test_unknown_provenance_is_excluded_from_the_split(self):
        # A correction with no Msg2 (bolus_options=None) counts toward the raw
        # post_correction but not toward either provenance bucket.
        events = [meal(1, 12, 60, 10.0), corr(1, 13, 0, 2.0)]  # options=None
        b = meal_burdens(events, IcConfig())[0]
        self.assertAlmostEqual(b.post_correction, 2.0)
        self.assertAlmostEqual(b.post_correction_user, 0.0)
        self.assertAlmostEqual(b.post_correction_ciq, 0.0)
        self.assertAlmostEqual(b.post_correction_unknown, 2.0)
        self.assertEqual(b.n_correction_unknown, 1)

    def test_all_unknown_provenance_does_not_fire(self):
        # Plenty of correction insulin but none of it has provenance -> the split is
        # undefined, so the finding stays silent rather than claim a false split.
        events = []
        for d in (1, 2, 3, 4):
            events += [meal(d, 12, 60, 10.0), corr(d, 13, 0, 3.0)]  # options=None
        _, findings = analyze_ic(events, IC_6)
        self.assertIsNone(self._finding(findings))

    def test_below_threshold_does_not_fire(self):
        # Known-provenance correction insulin below min_post_correction_u -> silent.
        cfg = IcConfig(min_post_correction_u=5.0)
        events = []
        for d in (1, 2, 3):
            events += [meal(d, 12, 60, 10.0), user_corr(d, 13, 0, 0.5)]  # 1.5U total
        _, findings = analyze_ic(events, IC_6, config=cfg)
        self.assertIsNone(self._finding(findings))

    def test_at_threshold_fires(self):
        cfg = IcConfig(min_post_correction_u=5.0)
        events = []
        for d in (1, 2, 3):
            events += [meal(d, 12, 60, 10.0), user_corr(d, 13, 0, 2.0)]  # 6U total
        _, findings = analyze_ic(events, IC_6, config=cfg)
        self.assertIsNotNone(self._finding(findings))

    def test_below_min_meals_does_not_fire(self):
        # Two meals with big corrections still fail the pool gate.
        events = [meal(1, 12, 60, 10.0), user_corr(1, 13, 0, 5.0),
                  meal(2, 12, 60, 10.0), user_corr(2, 13, 0, 5.0)]
        _, findings = analyze_ic(events, IC_6)
        self.assertIsNone(self._finding(findings))

    def test_copy_user_dominant_names_user_not_ciq(self):
        # User share dominates: copy must NOT claim CIQ is cleaning up.
        events = []
        for d in (1, 2, 3, 4):
            events += [meal(d, 12, 60, 10.0),
                       user_corr(d, 13, 0, 3.0), ciq_corr(d, 13, 30, 1.0)]
        _, findings = analyze_ic(events, IC_6)
        f = self._finding(findings)
        self.assertIn("you deliver most of it yourself", f.summary)
        self.assertNotIn("delivered automatically by Control-IQ", f.summary)
        # Cross-links the pre-meal counterpart in human terms (summary) and
        # structurally (evidence) — the raw issue ref stays out of patient copy.
        self.assertIn("meals start high", f.summary)
        self.assertNotIn("#178", f.summary)
        self.assertEqual(f.evidence["cross_refs"], [178])

    def test_copy_ciq_dominant_names_ciq(self):
        # CIQ share dominates: copy reflects that instead.
        events = []
        for d in (1, 2, 3, 4):
            events += [meal(d, 12, 60, 10.0),
                       user_corr(d, 13, 0, 1.0), ciq_corr(d, 13, 30, 3.0)]
        _, findings = analyze_ic(events, IC_6)
        f = self._finding(findings)
        self.assertIn("delivered automatically by Control-IQ", f.summary)
        self.assertNotIn("you deliver most of it yourself", f.summary)
        self.assertIn("meals start high", f.summary)
        self.assertNotIn("#178", f.summary)
        self.assertEqual(f.evidence["cross_refs"], [178])

    def test_guard_zeroes_the_split_too(self):
        # A high-pump-IOB meal (#181 guard) zeroes post_correction; the provenance
        # split must follow, not book the mis-attributed corrections to a bucket.
        events = [meal(1, 12, 60, 10.0, pump_iob=5.0), user_corr(1, 13, 0, 2.0)]
        burdens = meal_burdens(events, IcConfig())
        self.assertEqual(len(burdens), 1)
        b = burdens[0]
        self.assertAlmostEqual(b.post_correction, 0.0)
        self.assertAlmostEqual(b.post_correction_user, 0.0)
        self.assertEqual(b.n_correction_user, 0)

    def test_occurrences_carry_the_per_meal_split(self):
        events = []
        for d in (1, 2, 3):
            events += [meal(d, 12, 60, 10.0),
                       user_corr(d, 13, 0, 3.0), ciq_corr(d, 13, 30, 1.0)]
        _, findings = analyze_ic(events, IC_6)
        occ = self._finding(findings).occurrences
        self.assertEqual(len(occ), 3)
        self.assertIn("you 3.0 U", occ[0].detail)
        self.assertIn("CIQ 1.0 U", occ[0].detail)


if __name__ == "__main__":
    unittest.main()
