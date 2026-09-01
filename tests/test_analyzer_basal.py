"""A1 basal-analyzer tests.

Same clean-window method as the original model, now reported as an Estimate with
a CI (never blanked), with 'current' read from the programmed profileBasalRate
feed and the safety cap demoted to a one-step annotation.
"""

import random
import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.basal import (
    analyze_basal,
    consolidate_profile,
    MAX_PUMP_SEGMENTS,
    _annotation_for,
    _deliverable_rate,
    _pool_decision,
    _slot_lean_magnitude,
)
from ciq_autotune.analyzers.ic import (
    BLOCK_WINDOW_DAYS,
    IcConfig,
    analyze_ic_blocks,
    ic_asserts_move,
)
from ciq_autotune.analyzers.tuning_priority import (
    build_tuning_levers,
    ic_headline_block,
    price_ic_blocks,
)
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading
from ciq_autotune.model import ModelConfig
from ciq_autotune.result import IcBlock, SegmentEstimate, SlotEstimate
from ciq_autotune.safety import Status, cap, SafetyConfig
from ciq_autotune.uncertainty import Estimate, estimate_median


def _slot(i, *, rate=None, current=None, recommended=None, status=None):
    """A SlotEstimate whose deliverable rate is `rate` (via a carried-forward
    current, since `status` defaults to None → no asserted direction)."""
    val = rate if rate is not None else 0.5
    return SlotEstimate(
        slot=i, label=f"{(i * 30) // 60:02d}:{(i * 30) % 60:02d}",
        current=current if current is not None else val,
        estimate=Estimate(value=val, lo=val - 0.05, hi=val + 0.05, n=5,
                          confidence=0.8, method="bootstrap-median"),
        recommended=recommended if recommended is not None else val,
        annotation="", days=5, status=status,
    )


def _slots_from_rates(rates):
    return [_slot(i, rate=r) for i, r in enumerate(rates)]


def _ic_meal(day, hh, carbs, dose):
    return BolusEvent(t=datetime(2026, 6, day, hh, 0, 0), insulin=dose, carbs=carbs)


def night(day, *, rate=0.8, programmed=0.6, bg=120.0, start_h=0, end_h=6):
    t0 = datetime(2022, 6, day, start_h, 0, 0)
    basal = [BasalEvent(t=t0, delivery_type="algorithmDelivery",
                        duration_mins=(end_h - start_h) * 60, basal_rate=rate,
                        profile_basal_rate=programmed)]
    cgm = []
    for k in range((end_h - start_h) * 60 // 5 + 1):
        cgm.append(CgmReading(t=t0 + timedelta(minutes=5 * k), bg=bg, type="EGV"))
    return basal, cgm


def combine(*nights):
    basal, cgm = [], []
    for b, c in nights:
        basal += b
        cgm += c
    return basal, cgm


def slot_at(slots, label):
    return next(s for s in slots if s.label == label)


class AnalyzeBasalTest(unittest.TestCase):
    def test_returns_full_day_of_slots(self):
        basal, cgm = night(1)
        slots = analyze_basal(basal, cgm, [], [])
        self.assertEqual(len(slots), 48)            # 30-min slots

    def test_clean_slot_estimate_is_the_median_with_ci(self):
        basal, cgm = combine(*(night(d, rate=0.8) for d in (1, 2, 3, 4)))
        s = slot_at(analyze_basal(basal, cgm, [], []), "03:00")
        self.assertAlmostEqual(s.estimate.value, 0.8, places=3)
        self.assertEqual(s.days, 4)
        self.assertLessEqual(s.estimate.lo, s.estimate.value)
        self.assertLessEqual(s.estimate.value, s.estimate.hi)

    def test_current_comes_from_profile_basal_rate(self):
        basal, cgm = combine(*(night(d, rate=0.8, programmed=0.6) for d in (1, 2)))
        s = slot_at(analyze_basal(basal, cgm, [], []), "03:00")
        self.assertAlmostEqual(s.current, 0.6)

    def test_active_basal_overrides_reconstructed_current(self):
        # #69: when the active profile's basal schedule is supplied, `current`
        # comes from it (matching the "Active profile" table) instead of the
        # delivered-basal reconstruction — even when they disagree (e.g. the
        # window spans an older profile).
        basal, cgm = combine(*(night(d, rate=0.8, programmed=0.6) for d in (1, 2)))
        # Active schedule: 0.9 U/h all day, and 1.3 from 03:00 (180 min).
        active = [(0, 0.9), (180, 1.3)]
        slots = analyze_basal(basal, cgm, [], [], active_basal=active)
        self.assertAlmostEqual(slot_at(slots, "00:00").current, 0.9)
        self.assertAlmostEqual(slot_at(slots, "03:00").current, 1.3)
        # ...not the reconstructed 0.6.
        self.assertNotAlmostEqual(slot_at(slots, "03:00").current, 0.6)

    def test_falls_back_to_reconstructed_when_no_active_schedule(self):
        # No active_basal (no settings snapshot): keep the delivered reconstruction.
        basal, cgm = combine(*(night(d, rate=0.8, programmed=0.6) for d in (1, 2)))
        s = slot_at(analyze_basal(basal, cgm, [], [], active_basal=[]), "03:00")
        self.assertAlmostEqual(s.current, 0.6)

    def test_thin_slot_is_not_blanked(self):
        # One night only: thin, but still an estimate with a wide CI — never None.
        basal, cgm = night(1, rate=0.8)
        s = slot_at(analyze_basal(basal, cgm, [], []), "03:00")
        self.assertIsNotNone(s.estimate.value)
        self.assertTrue(s.estimate.wide)
        self.assertGreaterEqual(s.estimate.n, 1)

    def test_empty_slot_has_no_estimate_but_still_a_row(self):
        basal, cgm = night(1, rate=0.8, start_h=0, end_h=6)
        s = slot_at(analyze_basal(basal, cgm, [], []), "18:00")  # no data here
        self.assertIsNone(s.estimate.value)
        self.assertEqual(s.estimate.n, 0)

    def test_safety_annotation_is_a_one_step_move_not_a_gate(self):
        # Suggested (0.8) is far above current (0.6); a >20% step is capped, but the
        # estimate is still reported in full.
        basal, cgm = combine(*(night(d, rate=0.8, programmed=0.6) for d in (1, 2, 3, 4)))
        s = slot_at(analyze_basal(basal, cgm, [], []), "03:00")
        self.assertAlmostEqual(s.estimate.value, 0.8, places=3)   # full estimate kept
        self.assertIsNotNone(s.recommended)
        self.assertLessEqual(s.recommended, 0.6 * 1.20 + 1e-9)    # one-step cap honored
        self.assertIsInstance(s.annotation, str)

    def test_evidence_carries_one_point_per_clean_day(self):
        # The Dashboard evidence modal scatters one (date, rate) point per clean
        # day behind the slot's estimate, alongside the CI/programmed line it
        # already reports as estimate/current.
        basal, cgm = combine(*(night(d, rate=0.8) for d in (1, 2, 3, 4)))
        s = slot_at(analyze_basal(basal, cgm, [], []), "03:00")
        points = s.evidence["points"]
        self.assertEqual(len(points), 4)
        for p in points:
            self.assertIn("date", p)
            self.assertAlmostEqual(p["rate"], 0.8, places=3)

    def test_evidence_points_carry_a_timestamp_for_the_daily_drilldown(self):
        # #20: every evidence point needs a `t` so "View evidence" can jump to
        # that moment in the Daily report, same as behavioral occurrences. For
        # basal a "moment" is this slot's own time-of-day on the clean day, not
        # midnight — the slot already has no single instant, so we use its label.
        basal, cgm = combine(*(night(d, rate=0.8) for d in (1, 2)))
        s = slot_at(analyze_basal(basal, cgm, [], []), "03:00")
        points = s.evidence["points"]
        self.assertEqual(len(points), 2)
        for p in points:
            self.assertTrue(p["t"].startswith(p["date"]))
            self.assertIn("T03:00", p["t"])

    def test_empty_slot_has_no_evidence_points(self):
        basal, cgm = night(1, rate=0.8, start_h=0, end_h=6)
        s = slot_at(analyze_basal(basal, cgm, [], []), "18:00")  # no data here
        self.assertEqual(s.evidence["points"], [])

    def test_night_roster_carries_glucose_story_and_slot_norm(self):
        slot_start = datetime(2026, 6, 1, 3, 0)
        basal = [BasalEvent(
            t=slot_start, delivery_type="algorithmDelivery", duration_mins=30,
            basal_rate=0.8, profile_basal_rate=0.6,
        )]
        trace_start = slot_start - timedelta(minutes=60)
        cgm = [
            CgmReading(t=trace_start + timedelta(minutes=5 * i), bg=100 + i, type="EGV")
            for i in range(19)
        ]

        slot = slot_at(analyze_basal(basal, cgm, [], []), "03:00")
        roster_night = slot.evidence["night_roster"][0]

        self.assertEqual(roster_night["glucose_mean"], 114.5)
        self.assertEqual(roster_night["glucose_entry"], 112.0)
        self.assertEqual(roster_night["glucose_exit"], 118.0)
        self.assertEqual(roster_night["glucose_trace"], [
            {
                "t": (trace_start + timedelta(minutes=5 * i)).strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
                "minute": float(-60 + 5 * i),
                "bg": 100 + i,
            }
            for i in range(19)
        ])
        self.assertEqual(slot.evidence["roster_glucose_mean"], 114.5)

    def test_last_slot_mean_stops_before_next_day_exit_reading(self):
        slot_start = datetime(2026, 6, 1, 23, 30)
        basal = [BasalEvent(
            t=slot_start, delivery_type="algorithmDelivery", duration_mins=30,
            basal_rate=0.8, profile_basal_rate=0.6,
        )]
        cgm = [
            CgmReading(t=slot_start + timedelta(minutes=5 * i), bg=110 + i, type="EGV")
            for i in range(7)
        ]

        roster_night = slot_at(
            analyze_basal(basal, cgm, [], []), "23:30"
        ).evidence["night_roster"][0]

        self.assertEqual(roster_night["glucose_mean"], 112.5)
        self.assertEqual(roster_night["glucose_exit"], 116.0)
        self.assertEqual(roster_night["glucose_trace"][-1], {
            "t": "2026-06-02 00:00:00", "minute": 30.0, "bg": 116,
        })

    def test_midnight_slot_trace_keeps_prior_day_lead_timestamp(self):
        slot_start = datetime(2026, 6, 2)
        basal = [BasalEvent(
            t=slot_start, delivery_type="algorithmDelivery", duration_mins=30,
            basal_rate=0.8, profile_basal_rate=0.6,
        )]
        trace_start = slot_start - timedelta(minutes=60)
        cgm = [
            CgmReading(t=trace_start + timedelta(minutes=5 * i), bg=120, type="EGV")
            for i in range(19)
        ]

        trace = slot_at(
            analyze_basal(basal, cgm, [], []), "00:00"
        ).evidence["night_roster"][0]["glucose_trace"]

        self.assertEqual(trace[0], {
            "t": "2026-06-01 23:00:00", "minute": -60.0, "bg": 120,
        })
        self.assertEqual(trace[-1], {
            "t": "2026-06-02 00:30:00", "minute": 30.0, "bg": 120,
        })

    def test_lead_only_night_stays_in_roster_but_not_glucose_norm(self):
        covered_start = datetime(2026, 6, 1, 3, 0)
        gappy_start = datetime(2026, 6, 2, 3, 0)
        basal = [
            BasalEvent(covered_start, "algorithmDelivery", 30, 0.8, 0.6),
            BasalEvent(gappy_start, "algorithmDelivery", 30, 0.8, 0.6),
        ]
        cgm = [
            *(CgmReading(covered_start + timedelta(minutes=minute), 120, "EGV")
              for minute in (-25, -15, -5, 0)),
            *(CgmReading(gappy_start + timedelta(minutes=minute), 130, "EGV")
              for minute in (-25, -15, -5)),
        ]

        slot = slot_at(analyze_basal(basal, cgm, [], []), "03:00")
        roster = slot.evidence["night_roster"]

        self.assertEqual([night["date"] for night in roster], [
            "2026-06-01", "2026-06-02",
        ])
        self.assertEqual(roster[0]["glucose_mean"], 120.0)
        self.assertIsNone(roster[1]["glucose_mean"])
        self.assertEqual(roster[1]["glucose_entry"], 130.0)
        self.assertIsNone(roster[1]["glucose_exit"])
        self.assertEqual(roster[1]["glucose_trace"], [
            {"t": "2026-06-02 02:35:00", "minute": -25.0, "bg": 130},
            {"t": "2026-06-02 02:45:00", "minute": -15.0, "bg": 130},
            {"t": "2026-06-02 02:55:00", "minute": -5.0, "bg": 130},
        ])
        self.assertEqual(slot.evidence["roster_glucose_mean"], 120.0)

    def test_n_equals_one_slot_emits_no_direction(self):
        # #54/#56: one night (n=1) is far above current (0.8 vs 0.6) but the data
        # can't support a sign — the slot must NOT read as a raise/lower.
        basal, cgm = night(1, rate=0.8, programmed=0.6)
        s = slot_at(analyze_basal(basal, cgm, [], []), "03:00")
        self.assertEqual(s.estimate.n, 1)
        # Reconstruct the status the annotation was built from.
        _, status = cap(s.current, s.estimate.value, SafetyConfig(), s.estimate)
        self.assertEqual(status, Status.INSUFFICIENT)
        self.assertFalse(status.actionable)
        self.assertEqual(s.annotation, _annotation_for(Status.INSUFFICIENT))

    def test_narrow_thin_slot_is_held_below_the_staging_floor(self):
        # #273 regression: a slot with a tight spread but only 5 clean nights names
        # a direction confidently yet must NOT stage — basal holds anything under
        # `_MIN_SUPPORTED_NIGHTS` (8). Below-floor slots read INSUFFICIENT and the
        # deliverable carries the current rate forward (no phantom "new break").
        basal, cgm = combine(*(night(d, rate=0.48, programmed=0.6) for d in range(1, 6)))
        s = slot_at(analyze_basal(basal, cgm, [], []), "03:00")
        self.assertEqual(s.estimate.n, 5)
        self.assertFalse(s.estimate.wide)            # narrow, not caught by `wide`
        self.assertEqual(s.status, Status.INSUFFICIENT)
        self.assertFalse(s.asserts_move)             # held everywhere that keys on it
        self.assertEqual(_deliverable_rate(s), s.current)  # no move into the schedule

    def test_eight_informative_nights_meet_support_but_not_multiplicity(self):
        # Eight non-tie nights meet the support floor, but the exact tail does not
        # clear the fixed clock-slot family. The observation remains held.
        basal, cgm = combine(*(
            night(d, rate=0.48, programmed=0.6, start_h=3, end_h=4)
            for d in range(1, 9)
        ))
        s = slot_at(analyze_basal(basal, cgm, [], []), "03:00")
        self.assertEqual(s.estimate.n, 8)
        self.assertEqual(s.status, Status.INSUFFICIENT)
        self.assertFalse(s.asserts_move)
        self.assertEqual(_deliverable_rate(s), s.current)

    def test_multiplicity_clearing_departure_moves_every_shared_consumer(self):
        basal, cgm = combine(*(night(d, rate=0.48, programmed=0.6) for d in range(1, 13)))
        s = slot_at(analyze_basal(basal, cgm, [], []), "03:00")

        self.assertEqual(s.status, Status.LOWER)
        self.assertTrue(s.asserts_move)
        self.assertIs(s.to_dict()["asserts_move"], True)  # Plan staging reads this
        self.assertEqual(_deliverable_rate(s), s.recommended)
        lever = build_tuning_levers(
            analyze_basal(basal, cgm, [], []), [], [], slot_minutes=30
        )[0]
        self.assertGreater(lever.impact_u_day, 0.0)

    def test_endpoint_pinned_interval_cannot_assert_a_clean_move(self):
        # #480 regression: six nights at programmed + six above it pin the
        # bootstrap CI to current. The old open-interval rule called this a raise;
        # ties are now non-evidence, leaving only six informative nights.
        at_profile = [night(d, rate=0.6, programmed=0.6) for d in range(1, 7)]
        above_profile = [night(d, rate=0.7, programmed=0.6) for d in range(7, 13)]
        basal, cgm = combine(*(at_profile + above_profile))

        s = slot_at(analyze_basal(basal, cgm, [], []), "03:00")

        self.assertEqual(s.estimate.lo, s.current)
        self.assertEqual(s.status, Status.INSUFFICIENT)
        self.assertFalse(s.asserts_move)
        self.assertEqual(_deliverable_rate(s), s.current)

    def test_zero_width_profile_point_mass_cannot_assert_against_today(self):
        # Historical nights all delivered the programmed rate then in force.
        # Today's active profile differs, so the bootstrap observation is a
        # zero-width departure from today's current; all as-of signs are ties.
        basal, cgm = combine(*(
            night(d, rate=0.7, programmed=0.7) for d in range(1, 13)
        ))
        s = slot_at(analyze_basal(
            basal, cgm, [], [], active_basal=[(0, 0.6)]
        ), "03:00")

        self.assertEqual(s.estimate.lo, s.estimate.hi)
        self.assertGreater(s.estimate.value, s.current)
        self.assertEqual(s.status, Status.INSUFFICIENT)
        self.assertFalse(s.asserts_move)

    def test_direction_compares_each_night_to_its_as_of_programmed_rate(self):
        # The first six nights ran a lower profile than the last six. Every night
        # delivered 20% above its own programmed basal, so all 12 signs agree.
        older = [
            night(d, rate=0.6, programmed=0.5) for d in range(1, 7)
        ]
        current = [
            night(d, rate=0.72, programmed=0.6) for d in range(7, 13)
        ]
        basal, cgm = combine(*(older + current))

        s = slot_at(analyze_basal(
            basal, cgm, [], [], active_basal=[(0, 0.6)]
        ), "03:00")

        self.assertEqual(s.status, Status.RAISE)
        self.assertTrue(s.asserts_move)

    def test_nights_without_an_as_of_programmed_rate_are_unavailable(self):
        basal, cgm = combine(*(
            night(d, rate=0.8, programmed=None) for d in range(1, 13)
        ))
        s = slot_at(analyze_basal(
            basal, cgm, [], [], active_basal=[(0, 0.6)]
        ), "03:00")

        self.assertIsNotNone(s.estimate.value)
        self.assertEqual(s.status, Status.INSUFFICIENT)
        self.assertFalse(s.asserts_move)


SLOT_0300 = 6  # 03:00 at 30-min slots (180 min // 30)


class PoolAgreeingRegimesTest(unittest.TestCase):
    """#85: data-driven pre/post-edit pooling across a slot edit.

    ``night(d)`` places 03:00's clean minutes on day ``d``; a ``slot_starts`` cut
    at the start of a mid-window day makes earlier days "pre-edit" and later days
    "post-edit" for that slot. With pooling off the pre-edit days are dropped (the
    #56 hard cut); with it on they are pooled back iff the two subsets agree.
    """

    def _cut(self, day):
        return {SLOT_0300: datetime(2022, 6, day, 0, 0, 0)}

    def test_off_by_default_keeps_the_hard_cut(self):
        # Days 1-4 pre-edit, 5-8 post-edit; cut at day 5. Default (off): post only.
        basal, cgm = combine(*(night(d, rate=0.8) for d in range(1, 9)))
        s = slot_at(analyze_basal(basal, cgm, [], [], slot_starts=self._cut(5)), "03:00")
        self.assertEqual(s.days, 4)  # only the 4 post-edit days
        self.assertNotIn("pooling", s.evidence)

    def test_regime_a_agree_recovers_full_window(self):
        # Same underlying rate before and after the edit -> CIs overlap -> pool.
        basal, cgm = combine(*(night(d, rate=0.8) for d in range(1, 9)))
        s = slot_at(analyze_basal(basal, cgm, [], [], slot_starts=self._cut(5),
                                  pool_agreeing_regimes=True), "03:00")
        self.assertEqual(s.days, 8)  # full-window n recovered, not the 4-day sliver
        self.assertTrue(s.evidence["pooling"]["pooled"])
        self.assertEqual(len(s.evidence["points"]), 8)

    def test_regime_b_diverge_keeps_post_only_and_notes_it(self):
        # Rate genuinely changed at the edit: pre 0.4, post 1.2 -> CIs disjoint.
        pre = combine(*(night(d, rate=0.4) for d in range(1, 5)))
        post = combine(*(night(d, rate=1.2) for d in range(5, 9)))
        basal = pre[0] + post[0]
        cgm = pre[1] + post[1]
        s = slot_at(analyze_basal(basal, cgm, [], [], slot_starts=self._cut(5),
                                  pool_agreeing_regimes=True), "03:00")
        self.assertEqual(s.days, 4)  # post-edit only
        self.assertFalse(s.evidence["pooling"]["pooled"])
        self.assertIn("disagrees", s.evidence["pooling"]["note"])
        self.assertIn("03:00", s.evidence["pooling"]["note"])
        self.assertAlmostEqual(s.estimate.value, 1.2, places=3)

    def test_too_thin_post_subset_is_not_tested(self):
        # Only 2 post-edit days (< _MIN_DIRECTIONAL_DAYS): keep current behavior,
        # no pool and no divergence assertion, even though pre-edit data exists.
        basal, cgm = combine(*(night(d, rate=0.8) for d in range(1, 7)))
        # cut at day 5 -> days 1-4 pre, days 5-6 post (n=2).
        s = slot_at(analyze_basal(basal, cgm, [], [], slot_starts=self._cut(5),
                                  pool_agreeing_regimes=True), "03:00")
        self.assertEqual(s.days, 2)
        self.assertNotIn("pooling", s.evidence)

    def test_pool_decision_thin_post_refuses(self):
        pre = estimate_median([0.8, 0.8, 0.8, 0.8])
        post = estimate_median([0.8, 0.8])  # n=2 < 3
        should_pool, note = _pool_decision(pre, post)
        self.assertFalse(should_pool)
        self.assertIsNone(note)

    def test_pool_decision_overlap_pools(self):
        pre = estimate_median([0.75, 0.8, 0.85, 0.8])
        post = estimate_median([0.78, 0.82, 0.8, 0.79])
        should_pool, note = _pool_decision(pre, post)
        self.assertTrue(should_pool)
        self.assertIsNone(note)

    def test_pool_decision_disjoint_diverges(self):
        pre = estimate_median([0.4, 0.41, 0.39, 0.4])
        post = estimate_median([1.2, 1.21, 1.19, 1.2])
        should_pool, note = _pool_decision(pre, post)
        self.assertFalse(should_pool)
        self.assertIsNotNone(note)
        self.assertIn("disagrees", note)


class ConsolidateProfileTest(unittest.TestCase):
    def test_deliverable_rate_uses_recommended_only_for_a_directional_move(self):
        # A real directional move (status RAISE) → programs the moved rate.
        est = Estimate(0.9, 0.8, 1.0, 5, 0.8, "bootstrap-median")
        rec = SlotEstimate(0, "00:00", current=0.6, estimate=est, recommended=0.7,
                           annotation="", days=5, status=Status.RAISE)
        self.assertEqual(_deliverable_rate(rec), 0.7)

    def test_deliverable_rate_holds_a_held_slot_to_current(self):
        # #264: a held slot (INSUFFICIENT) still has a moved `recommended`, but with
        # no asserted direction the deliverable must carry the CURRENT rate forward.
        est = Estimate(0.9, 0.8, 1.0, 5, 0.8, "bootstrap-median")
        held = SlotEstimate(0, "00:00", current=0.6, estimate=est, recommended=0.7,
                            annotation="", days=5, status=Status.INSUFFICIENT)
        self.assertEqual(_deliverable_rate(held), 0.6)

    def test_deliverable_rate_no_status_holds_to_current(self):
        # A legacy / fixture slot with no status reads as "no direction asserted".
        est = Estimate(0.9, 0.8, 1.0, 5, 0.8, "bootstrap-median")
        no_status = SlotEstimate(0, "00:00", current=0.6, estimate=est, recommended=0.7,
                                 annotation="", days=5)
        self.assertEqual(_deliverable_rate(no_status), 0.6)

    def test_deliverable_rate_falls_back_to_current_then_estimate(self):
        est = Estimate(0.9, 0.8, 1.0, 5, 0.8, "bootstrap-median")
        no_rec = SlotEstimate(0, "00:00", current=0.6, estimate=est, recommended=None,
                              annotation="", days=5, status=Status.NO_CHANGE)
        self.assertEqual(_deliverable_rate(no_rec), 0.6)
        # No baseline: recommended is the only number we have — still used (NO_BASELINE).
        no_baseline = SlotEstimate(0, "00:00", current=None, estimate=est, recommended=0.9,
                                   annotation="", days=5, status=Status.NO_BASELINE)
        self.assertEqual(_deliverable_rate(no_baseline), 0.9)
        est_only = SlotEstimate(0, "00:00", current=None, estimate=est, recommended=None,
                                annotation="", days=5, status=Status.NO_DATA)
        self.assertEqual(_deliverable_rate(est_only), 0.9)

    def test_held_wide_slot_carries_current_into_consolidated_profile(self):
        # #264: a flat 0.6 profile except slot 0, which the model would move to 0.9
        # but holds (INSUFFICIENT / wide). The consolidated profile must program 0.6
        # everywhere — the held trim does NOT ride into the deliverable.
        slots = _slots_from_rates([0.6] * 48)
        slots[0] = _slot(0, current=0.6, recommended=0.9, status=Status.INSUFFICIENT)
        prof = consolidate_profile(slots)
        self.assertEqual(len(prof.segments), 1)
        self.assertEqual(prof.segments[0].basal_rate, 0.6)

    def test_directional_slot_moves_in_consolidated_profile(self):
        # The same shape but slot 0 carries a real RAISE → its moved rate rides in,
        # producing a distinct opening segment. No regression to real recommendations.
        slots = _slots_from_rates([0.6] * 48)
        slots[0] = _slot(0, current=0.6, recommended=0.72, status=Status.RAISE)
        prof = consolidate_profile(slots)
        self.assertEqual(prof.segments[0].start_min, 0)
        self.assertEqual(prof.segments[0].basal_rate, 0.72)
        # the rest stays at the programmed 0.6
        self.assertEqual(prof.segments[-1].basal_rate, 0.6)

    def test_flat_profile_collapses_to_one_segment(self):
        prof = consolidate_profile(_slots_from_rates([0.6] * 48))
        self.assertEqual(len(prof.segments), 1)
        self.assertEqual(prof.segments[0].start_min, 0)
        self.assertAlmostEqual(prof.segments[0].basal_rate, 0.6, places=3)
        self.assertFalse(prof.forced_merges)

    def test_noise_floor_merges_near_equal_adjacent_slots(self):
        # Two blocks differing well under the 0.05 floor -> one segment.
        rates = [0.60] * 24 + [0.62] * 24
        prof = consolidate_profile(_slots_from_rates(rates))
        self.assertEqual(len(prof.segments), 1)

    def test_distinct_blocks_stay_separate(self):
        rates = [0.5] * 24 + [1.0] * 24
        prof = consolidate_profile(_slots_from_rates(rates))
        self.assertEqual(len(prof.segments), 2)
        self.assertEqual(prof.segments[0].basal_rate, 0.5)
        self.assertEqual(prof.segments[1].basal_rate, 1.0)
        self.assertEqual(prof.segments[1].start_min, 24 * 30)

    def test_many_distinct_blocks_are_force_merged_to_cap(self):
        # 24 distinct two-slot blocks -> 24 run-length segments (not single-slot
        # islands, so island-collapse leaves them), forced to ≤16. (A pure
        # single-slot alternating pattern would instead be dissolved as noise; see
        # BasalIslandCollapseTest.)
        rates = [r for i in range(24) for r in (round(0.3 + 0.08 * i, 3),) * 2]
        prof = consolidate_profile(_slots_from_rates(rates))
        self.assertLessEqual(len(prof.segments), MAX_PUMP_SEGMENTS)
        self.assertTrue(prof.forced_merges)
        self.assertIsNotNone(prof.note)
        self.assertIn("16-segment limit", prof.note)

    def test_max_deviation_reported_per_segment(self):
        rates = [0.60, 0.61, 0.59] + [1.2] * 45
        prof = consolidate_profile(_slots_from_rates(rates))
        first = prof.segments[0]
        self.assertEqual(sorted(first.basal_slots), [0, 1, 2])
        self.assertGreater(first.basal_max_deviation, 0.0)
        self.assertLess(first.basal_max_deviation, 0.05)

    def test_empty_input_yields_empty_profile(self):
        prof = consolidate_profile([])
        self.assertEqual(prof.segments, [])
        self.assertEqual(prof.total_daily_basal, 0.0)

    def test_serializes_to_plain_json(self):
        import json
        prof = consolidate_profile(_slots_from_rates([0.5 + 0.03 * i for i in range(48)]))
        json.dumps(prof.to_dict())

    # --- property-style tests (issue #87 acceptance) ---------------------------

    def test_property_never_exceeds_16_segments_and_preserves_daily_total(self):
        rng = random.Random(1234)
        for _ in range(300):
            # Random 48-slot deliverable profiles across a plausible basal range.
            rates = [round(rng.uniform(0.2, 2.5), 3) for _ in range(48)]
            prof = consolidate_profile(_slots_from_rates(rates))

            # Invariant 1: never more than the pump's 16-segment cap.
            self.assertLessEqual(len(prof.segments), MAX_PUMP_SEGMENTS)

            # Invariant 2: total daily basal stays in a bounded band of the raw
            # sum. The noise-floor merge and forced merges are duration-weighted
            # means that conserve the sum up to rounding, but #180's single-slot
            # island-collapse deliberately does NOT: it raises a one-slot dip to
            # its larger neighbor, so on adversarial random data (many isolated
            # dips with near-equal neighbors) the total can shift by a couple U/day
            # in the upward direction. The band below is bounded but loose to
            # accommodate that intentional non-conservation.
            raw_total = sum(rates) * 0.5  # 48 half-hour slots -> U/day
            self.assertAlmostEqual(prof.total_daily_basal, raw_total, delta=3.0)


def _seg_est(start_min, parameter, current, recommended, asserts_move=True):
    # asserts_move stands in for the analyzer's per-segment eligibility decision (#465):
    # these consolidation-shape tests are about boundaries and carry-forward, so their I:C
    # rows assert by default. The gate itself is exercised through `analyze_ic` below.
    est = Estimate(recommended, None, None, 5, 0.8, "measured")
    return SegmentEstimate(start_min=start_min, label=f"{start_min//60:02d}:00",
                           parameter=parameter, current=current,
                           estimate=est, recommended=recommended, annotation="",
                           asserts_move=asserts_move)


class FourParameterConsolidationTest(unittest.TestCase):
    """#98: consolidate_profile grows to a single unified four-parameter profile —
    union of basal/ISF/I:C/target boundaries, carry-forward from the programmed
    profile for unchanged params, forced-merge to the pump's 16-segment cap."""

    def test_basal_only_carries_none_for_other_params(self):
        # No ISF/I:C rows and no programmed schedules: basal-only, other params None.
        prof = consolidate_profile(_slots_from_rates([0.6] * 48))
        self.assertEqual(len(prof.segments), 1)
        seg = prof.segments[0]
        self.assertAlmostEqual(seg.basal_rate, 0.6, places=3)
        self.assertIsNone(seg.isf)
        self.assertIsNone(seg.carb_ratio)
        self.assertIsNone(seg.target_bg)

    def test_carry_forward_from_programmed_when_no_recommendation(self):
        # Flat basal, no analyzer rows, but programmed schedules for the other three
        # -> one segment carrying the programmed values verbatim (pure carry-forward).
        prof = consolidate_profile(
            _slots_from_rates([0.6] * 48),
            programmed_isf=[(0, 50.0)],
            programmed_ic=[(0, 10.0)],
            programmed_target=[(0, 110.0)],
        )
        self.assertEqual(len(prof.segments), 1)
        seg = prof.segments[0]
        self.assertEqual(seg.isf, 50.0)
        self.assertEqual(seg.carb_ratio, 10.0)
        self.assertEqual(seg.target_bg, 110.0)

    def test_union_of_boundaries_across_params(self):
        # Flat basal (1 boundary at 0). Programmed ISF steps at 06:00, programmed I:C
        # steps at 12:00, target programmed at 0 only. Union -> boundaries {0, 360, 720}.
        prof = consolidate_profile(
            _slots_from_rates([0.6] * 48),
            programmed_isf=[(0, 50.0), (360, 45.0)],
            programmed_ic=[(0, 10.0), (720, 10.0)],
            programmed_target=[(0, 110.0)],
        )
        starts = [s.start_min for s in prof.segments]
        self.assertEqual(starts, [0, 360, 720])
        # target carried forward across every segment; basal held flat.
        for seg in prof.segments:
            self.assertIsNotNone(seg.isf)
            self.assertEqual(seg.carb_ratio, 10.0)
            self.assertEqual(seg.target_bg, 110.0)

    def _blocks_thin_midnight_supported_morning(self):
        """The #465/#518 reference shape, built through the REAL block analyzer.

        Midnight (00:00-07:00 @ 1:5.1): three scattered meals -> a wide band spanning
        the programmed value and a pool far below the 8-run floor, so nothing asserts.
        Morning (07:00-12:00 @ 1:4.0, TWO programmed segments sharing that value):
        thirty consistent meals dosed at a tighter true ratio, so the band excludes
        programmed and the block asserts.

        No flag is hand-set anywhere: `asserts_move` comes out of the analyzer, which is
        the whole point of #273's lesson.
        """
        programmed_ic = [(0, 5.1), (420, 4.0), (570, 4.0), (720, 5.7)]
        events = (
            [_ic_meal(1, 0, 60, 15.0), _ic_meal(3, 0, 60, 10.0), _ic_meal(5, 0, 60, 6.7)]
            + [_ic_meal(d, 8, 60, 20.0) for d in range(1, 31)]
        )
        for b in events:
            object.__setattr__(b, "carb_ratio", 5.1 if b.t.hour == 0 else 4.0)
        blocks, _runs = analyze_ic_blocks(
            events, programmed_ic, config=IcConfig(),
            observed_days=BLOCK_WINDOW_DAYS)
        return programmed_ic, blocks

    def test_thin_block_stays_visible_but_delivers_programmed(self):
        # #465/#518: an unsupported I:C estimate must not move the deliverable schedule.
        # The overnight block is three meals — below the 8-run dosing floor — so the
        # pump-programmable profile carries 5.1 forward.
        programmed_ic, blocks = self._blocks_thin_midnight_supported_morning()
        overnight = next(b for b in blocks if b.block_id == 0)
        self.assertLess(overnight.n_runs, 8)
        self.assertFalse(overnight.asserts_move)
        self.assertIs(overnight.to_dict()["asserts_move"], False)   # the frontend reads it

        prof = consolidate_profile(
            _slots_from_rates([0.6] * 48),
            carb_ratio=ic_headline_block(blocks),
            programmed_ic=programmed_ic,
        )
        seg_at_0 = next(s for s in prof.segments if s.start_min == 0)
        self.assertEqual(seg_at_0.carb_ratio, 5.1)

    def test_headline_block_writes_its_value_at_every_member_boundary(self):
        # A block covers several programmed segments, and the deliverable is a step
        # function: writing only the block's start would leave 09:30 onward running the
        # OLD ratio. One value across every member is what "the block moved" means.
        programmed_ic, blocks = self._blocks_thin_midnight_supported_morning()
        headline = ic_headline_block(blocks)
        self.assertIsNotNone(headline)
        self.assertEqual(headline.member_start_mins, [420, 570])

        prof = consolidate_profile(
            _slots_from_rates([0.6] * 48),
            carb_ratio=headline,
            programmed_ic=programmed_ic,
        )
        by_start = {s.start_min: s.carb_ratio for s in prof.segments}
        self.assertEqual(by_start[420], headline.recommended)
        self.assertEqual(by_start[570], headline.recommended)
        self.assertNotEqual(by_start[420], 4.0)
        # the blocks that did NOT headline are untouched — one change at a time
        self.assertEqual(by_start[0], 5.1)
        self.assertEqual(by_start[720], 5.7)

    def _two_asserting_blocks(self):
        """A profile where BOTH blocks assert — the shape the one-change rule is for.

        Overnight (00:00–07:00 @ 1:5.1) and morning (07:00–12:00 @ 1:4.0) each get a
        full pool of consistent meals, dosed under their own currently-programmed
        ratio, reading tighter than programmed. Both clear every gate, so the profile
        has two live moves and the deliverable must still carry only one.
        """
        programmed_ic = [(0, 5.1), (420, 4.0), (570, 4.0), (720, 5.7)]
        events = ([_ic_meal(d, 0, 60, 14.0) for d in range(1, 25)]
                  + [_ic_meal(d, 8, 60, 20.0) for d in range(1, 25)])
        for b in events:
            object.__setattr__(b, "carb_ratio", 5.1 if b.t.hour == 0 else 4.0)
        blocks, _runs = analyze_ic_blocks(
            events, programmed_ic, config=IcConfig(),
            observed_days=BLOCK_WINDOW_DAYS)
        return programmed_ic, blocks

    def test_consolidation_carries_the_headline_block_only(self):
        # Two asserting blocks, one deliverable move: machine-initiated advice is one
        # change at a time (ADR 518 decision 14). The non-headline block stays visible
        # and individually stageable, but never reaches the profile by itself.
        programmed_ic, blocks = self._two_asserting_blocks()
        priced = price_ic_blocks(blocks)
        moved = [b for b in priced if b.asserts_move]
        self.assertEqual(len(moved), 2, "the fixture must really have TWO live moves")
        headline = ic_headline_block(priced)
        other = next(b for b in moved if b.block_id != headline.block_id)
        self.assertIsNotNone(other.recommended)

        prof = consolidate_profile(
            _slots_from_rates([0.6] * 48),
            carb_ratio=headline,
            programmed_ic=programmed_ic,
        )
        by_start = {s.start_min: s.carb_ratio for s in prof.segments}
        # the headline moved at every one of its members...
        for start in headline.member_start_mins:
            self.assertEqual(by_start[start], headline.recommended)
        # ...and the OTHER asserting block still delivers its programmed value.
        for start in other.member_start_mins:
            self.assertEqual(by_start[start], other.current_values[0])
            self.assertNotEqual(by_start[start], other.recommended)

    def test_unstamped_block_fails_closed(self):
        # Consumers must not reconstruct eligibility. A block with no eligibility
        # evidence carries the programmed I:C forward — insulin advice fails closed.
        bare = IcBlock(
            block_id=0, start_min=0, end_min=1440, label="All day",
            member_start_mins=[0], current_values=[5.1],
            estimate=Estimate(5.5, 5.4, 5.6, 30, 0.8, "measured"),
            recommended=5.5, n_runs=30, n_meals=30, state="numeric",
            asserts_move=False, annotation="")
        self.assertFalse(ic_asserts_move(bare))
        prof = consolidate_profile(
            _slots_from_rates([0.6] * 48),
            carb_ratio=bare,
            programmed_ic=[(0, 5.1)],
        )
        self.assertEqual(prof.segments[0].carb_ratio, 5.1)

    def _ramp_slots(self):
        """48 slots that all differ — every slot is its own basal segment.

        This is the adversarial shape for the pump's 16-segment cap: the union of
        boundaries is far over it, so the forced merge runs many times and gets to
        choose which boundaries die. Callers pass a tiny ``noise_floor`` so the ramp
        survives the noise-floor merge and really does produce 48 segments.
        """
        return _slots_from_rates([round(0.30 + 0.02 * i, 2) for i in range(48)])

    def test_forced_merge_never_deletes_the_headline_block_exit_boundary(self):
        # The bug this pins: the forced merge ranks boundaries by BASAL delta alone,
        # so on a ramp it will happily delete the boundary that ENDS the headline
        # block — and the tighter recommended ratio then keeps running into the next
        # stretch, which is a dosing error, not a rounding one.
        programmed_ic, blocks = self._blocks_thin_midnight_supported_morning()
        headline = ic_headline_block(blocks)
        self.assertEqual(headline.member_start_mins, [420, 570])
        self.assertEqual(headline.end_min, 720)

        prof = consolidate_profile(
            self._ramp_slots(), carb_ratio=headline, programmed_ic=programmed_ic,
            noise_floor=0.001)
        self.assertTrue(prof.forced_merges)          # the cap really did bite
        self.assertLessEqual(len(prof.segments), 16)

        # Sample the delivered I:C across the whole day: the recommendation must be
        # live inside the block's arc and gone the moment it ends.
        def ic_at(minute):
            val = None
            for seg in prof.segments:
                if seg.start_min <= minute:
                    val = seg.carb_ratio
                else:
                    break
            return val

        self.assertEqual(ic_at(420), headline.recommended)
        self.assertEqual(ic_at(690), headline.recommended)   # still inside
        self.assertEqual(ic_at(720), 5.7)                    # restored on the dot
        self.assertEqual(ic_at(1439), 5.7)                   # and stays restored
        self.assertEqual(ic_at(0), 5.1)                      # the block before it

    def test_unfittable_protected_boundaries_fail_closed_to_programmed(self):
        # When the protected boundaries cannot fit under the cap there is no safe
        # merge. Delivering the move anyway would run it past its stretch, so the
        # carb-ratio dimension falls back to the PROGRAMMED schedule entirely —
        # advising nothing beats advising an unbounded ratio.
        programmed_ic, blocks = self._blocks_thin_midnight_supported_morning()
        headline = ic_headline_block(blocks)
        prof = consolidate_profile(
            self._ramp_slots(), carb_ratio=headline, programmed_ic=programmed_ic,
            noise_floor=0.001, max_segments=2)
        self.assertLessEqual(len(prof.segments), 2)
        self.assertNotIn(headline.recommended, [s.carb_ratio for s in prof.segments])

    def test_no_headline_block_is_pure_carry_forward(self):
        # The launch posture (ADR 518 consequences): nothing asserts, so the deliverable
        # profile is exactly the programmed schedule.
        prof = consolidate_profile(
            _slots_from_rates([0.6] * 48),
            carb_ratio=None,
            programmed_ic=[(0, 5.1), (720, 5.7)],
        )
        self.assertEqual([s.carb_ratio for s in prof.segments], [5.1, 5.7])

    def test_daily_total_conserved_with_param_unions(self):
        # Splitting on ISF/I:C boundaries must not change the daily basal total: the
        # basal step function is unchanged, only sampled at more points.
        rates = [0.6] * 24 + [0.9] * 24
        no_union = consolidate_profile(_slots_from_rates(rates))
        with_union = consolidate_profile(
            _slots_from_rates(rates),
            programmed_isf=[(0, 50), (180, 40), (900, 45)],
        )
        self.assertAlmostEqual(no_union.total_daily_basal,
                               with_union.total_daily_basal, places=2)


class BasalIslandCollapseTest(unittest.TestCase):
    """#180: single-slot basal "islands" — a per-slot-median rate that dips for one
    30-min slot and immediately returns to the neighbor level — are noise, not a
    programmable baseline. _basal_segments' adjacent-only noise-floor merge can't
    catch them; the island-collapse pass folds prev+island+next into one segment
    keeping the larger neighbor's rate."""

    def test_single_slot_island_collapses_to_one_segment(self):
        # 0.6 everywhere except slot 1 dipping to 0.48 and returning — a 30-min blip.
        rates = [0.6] * 48
        rates[1] = 0.48
        prof = consolidate_profile(_slots_from_rates(rates))
        self.assertEqual(len(prof.segments), 1)
        self.assertAlmostEqual(prof.segments[0].basal_rate, 0.6, places=3)
        self.assertFalse(prof.forced_merges)

    def test_keeps_larger_neighbor_not_weighted_mean(self):
        # Neighbors 0.6 (within noise_floor of each other), island 0.48 -> the merged
        # segment carries 0.6 (the larger neighbor), not a mean dragged toward 0.48.
        rates = [0.6] * 48
        rates[20] = 0.48
        prof = consolidate_profile(_slots_from_rates(rates))
        self.assertEqual(len(prof.segments), 1)
        self.assertAlmostEqual(prof.segments[0].basal_rate, 0.6, places=3)

    def test_monotonic_ramp_untouched(self):
        # A genuine rising ramp has no single-slot dip-and-return: nothing collapses
        # that would erase a real step.
        rates = [round(0.4 + 0.06 * i, 3) for i in range(48)]
        prof = consolidate_profile(_slots_from_rates(rates))
        # Every step exceeds the noise floor and no neighbor pair is within it, so no
        # island collapse fires. The ramp stays monotonic non-decreasing (later
        # force-merge to the 16-seg cap averages neighbors but cannot invert it) and
        # the daily total is conserved — nothing was raised to a neighbor level.
        self.assertGreater(len(prof.segments), 1)
        seg_rates = [s.basal_rate for s in prof.segments]
        self.assertEqual(seg_rates, sorted(seg_rates))
        self.assertAlmostEqual(prof.total_daily_basal, sum(rates) * 0.5, delta=0.1)

    def test_isolated_step_with_distinct_neighbors_untouched(self):
        # Single-slot bump whose neighbors are NOT within noise_floor of each other
        # (0.6 -> 0.72 island -> 1.0) is a real transition, not noise: left intact.
        rates = [0.6] * 20 + [0.72] + [1.0] * 27
        prof = consolidate_profile(_slots_from_rates(rates))
        rate_set = {round(s.basal_rate, 2) for s in prof.segments}
        self.assertIn(0.72, rate_set)

    def test_first_and_last_slots_are_not_treated_as_islands(self):
        # Only *interior* single-slot segments collapse; a dip in the very first slot
        # has no left neighbor and is left as its own boundary.
        rates = [0.48] + [0.6] * 47
        prof = consolidate_profile(_slots_from_rates(rates))
        self.assertEqual(prof.segments[0].start_min, 0)
        self.assertAlmostEqual(prof.segments[0].basal_rate, 0.48, places=3)


class OnesidedLeanEvidenceTest(unittest.TestCase):
    """The one-sided / dawn-band lean verdict (ADR 0001, #56) now lives in
    analyze_basal and rides on SlotEstimate.evidence["onesided"] — the same shelf
    as the pooling verdict. Relocated from analyze.py in #106; these unit-test the
    lean logic through the basal analyzer's own interface.

    A slot is one-sided when a fraction above cfg.onesided_bg_threshold (default
    0.65) of its clean minutes have BG above the (bg_low + bg_high)/2 midpoint
    (125 for the default [70, 180] window).
    """

    def _build_inputs(self, bg_value, n_days=10):
        """Minimal basal + CGM for one 30-min slot (00:00 → slot 0) over n_days
        nights. All CGM readings share bg_value, so the above-midpoint fraction is
        deterministic (0% or 100% depending on bg_value vs midpoint)."""
        basal_events, cgm_readings = [], []
        for d in range(n_days):
            t0 = datetime(2026, 1, d + 1, 0, 0, 0)
            for k in range(6):  # 30 min of 5-min samples
                tt = t0 + timedelta(minutes=5 * k)
                basal_events.append(BasalEvent(
                    t=tt, delivery_type="algorithmDelivery", duration_mins=5,
                    basal_rate=0.8, profile_basal_rate=0.6,
                ))
                cgm_readings.append(CgmReading(t=tt, bg=bg_value))
        return basal_events, cgm_readings

    def _onesided(self, rows, slot=0):
        return rows[slot].evidence.get("onesided")

    def test_above_threshold_fires_verdict(self):
        """BG=160 is above midpoint 125 → 100% one-sided → verdict on the slot."""
        cfg = ModelConfig()  # bg_low=70, bg_high=180, midpoint=125
        basal, cgm = self._build_inputs(bg_value=160)
        rows = analyze_basal(basal, cgm, [], [], config=cfg)
        o = self._onesided(rows, slot=0)
        self.assertIsNotNone(o, "expected a one-sided verdict on slot 0")
        self.assertIn("one-sided", o["note"])
        self.assertIn("125", o["note"])  # midpoint shown
        self.assertGreater(o["frac"], 0.65)

    def test_below_threshold_no_verdict(self):
        """BG=100 is below midpoint 125 → 0% above → no verdict on any slot."""
        cfg = ModelConfig()
        basal, cgm = self._build_inputs(bg_value=100)
        rows = analyze_basal(basal, cgm, [], [], config=cfg)
        self.assertTrue(all("onesided" not in r.evidence for r in rows))

    def test_mixed_bg_at_threshold_boundary(self):
        """Exactly 65% above midpoint is not strictly > 0.65 → no verdict.

        20 day-nights, each contributing one minute to slot 0. 13 have BG=160
        (above midpoint 125), 7 have BG=100 (below): aggregate 13/20 = 65% exactly.
        """
        cfg = ModelConfig()
        n_above, n_below = 13, 7
        basal_events, cgm_readings = [], []
        for d in range(n_above + n_below):
            tt = datetime(2026, 1, d + 1, 0, 0, 0)  # 00:00 → slot 0
            bg = 160 if d < n_above else 100
            basal_events.append(BasalEvent(
                t=tt, delivery_type="algorithmDelivery", duration_mins=1,
                basal_rate=0.8, profile_basal_rate=0.6,
            ))
            cgm_readings.append(CgmReading(t=tt, bg=bg))
        rows = analyze_basal(basal_events, cgm_readings, [], [], config=cfg)
        self.assertIsNone(self._onesided(rows, slot=0))  # 65% NOT strictly > 0.65

    def test_flat_bg_slot_reports_lean_within_noise(self):
        """When every clean minute shares one BG there is no bottom half to compare
        against, so the note falls back to the within-noise statement."""
        cfg = ModelConfig()
        basal, cgm = self._build_inputs(bg_value=160)  # all BG identical
        rows = analyze_basal(basal, cgm, [], [], config=cfg)
        o = self._onesided(rows, slot=0)
        self.assertIsNotNone(o)
        self.assertIn("Lean within noise", o["note"])

    def test_injected_lean_is_recovered(self):
        """A slot where high-BG minutes carry extra corrective basal reports a lean
        close to that injected magnitude, exposed on evidence["onesided"].

        One 30-min slot (00:00) over 20 day-nights. On 15 nights the slot runs
        high-in-range (BG 170, above midpoint 125) with an extra 0.30 U/h riding on
        the 0.80 U/h maintenance rate; on 5 it runs low-in-range (BG 100, below) at
        bare 0.80. So 15/20 = 75% above midpoint (one-sided fires). Full clean
        median is the high rate (1.10); bottom-half BG minutes are the low ones
        (0.80), so the recovered lean is ~0.30 U/h. Each night is a run of
        consecutive readings so the clean-window slope gate admits the minutes.
        """
        cfg = ModelConfig()
        basal_events, cgm_readings = [], []
        true_rate, corrective = 0.80, 0.30
        n_high, n_low = 15, 5
        for d in range(n_high + n_low):
            hi = d < n_high
            bg = 170 if hi else 100
            rate = true_rate + (corrective if hi else 0.0)
            t0 = datetime(2026, 1, d + 1, 0, 0, 0)  # midnight → slot 0
            for k in range(6):
                tt = t0 + timedelta(minutes=5 * k)
                basal_events.append(BasalEvent(
                    t=tt, delivery_type="algorithmDelivery", duration_mins=5,
                    basal_rate=rate, profile_basal_rate=0.6,
                ))
                cgm_readings.append(CgmReading(t=tt, bg=bg))
        rows = analyze_basal(basal_events, cgm_readings, [], [], config=cfg)
        o = self._onesided(rows, slot=0)
        self.assertIsNotNone(o)
        self.assertIn("may lean high by ~", o["note"])
        self.assertAlmostEqual(o["lean"], corrective, delta=0.05)
        import re
        m = re.search(r"lean high by ~([0-9.]+) U/h", o["note"])
        self.assertIsNotNone(m, f"no magnitude in note: {o['note']}")
        self.assertAlmostEqual(float(m.group(1)), corrective, delta=0.05)


class SlotLeanMagnitudeTest(unittest.TestCase):
    """_slot_lean_magnitude: full-median minus bottom-half-median, clamped at 0."""

    def test_no_spread_returns_none(self):
        self.assertIsNone(_slot_lean_magnitude([(0.8, 120.0), (0.9, 120.0)]))

    def test_too_few_points_returns_none(self):
        self.assertIsNone(_slot_lean_magnitude([(0.8, 120.0)]))

    def test_recovers_gap_between_halves(self):
        # High-BG minutes carry +0.30; bottom-half (low-BG) is the bare rate.
        pairs = [(0.8, 100.0)] * 5 + [(1.1, 170.0)] * 15
        lean = _slot_lean_magnitude(pairs)
        self.assertAlmostEqual(lean, 0.30, delta=0.01)

    def test_clamped_at_zero_when_not_leaning_high(self):
        # Bottom half sits higher than the full median → clamp to 0, not negative.
        pairs = [(1.0, 100.0), (1.0, 110.0), (0.5, 160.0), (0.5, 170.0)]
        self.assertEqual(_slot_lean_magnitude(pairs), 0.0)


if __name__ == "__main__":
    unittest.main()
