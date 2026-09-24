"""Trial + Focus — the single active watched change (#244, ADR 0029).

A Trial is derived-live from the setting-change epoch (never stored); a Focus is the
one persisted object (a hand-pinned behavioral lever). At most one is active at a
time — Trial XOR Focus, pump wins. These tests exercise trial detection + the
param→existing-series target mapping, the Maturing gate, the revert-vs-third-value
rule, the Focus view derivation, and the one-active invariant in both directions.
"""

import json
import unittest
from contextlib import nullcontext
from dataclasses import asdict
from datetime import datetime, timedelta
from unittest.mock import patch

from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading
from ciq_autotune.guidance import plan_deliverable
from ciq_autotune.settings import (
    ProfileSegment,
    ProfileSettings,
    PumpSettings,
    Snapshot,
)
from ciq_autotune.store import Store
from ciq_autotune import watched_change as wc

BASE = datetime(2026, 5, 1, 0, 0, 0)


def _day(n):
    return BASE + timedelta(days=n)


def _cgm_days(lo, hi, per_day=12):
    """A few in-range CGM readings on each of days [lo, hi] — the target-metric data
    Maturing counts as it accrues past the change (tir/tbr draw on CGM)."""
    out = []
    for d in range(lo, hi + 1):
        for k in range(per_day):
            out.append(CgmReading(t=_day(d) + timedelta(hours=k * 2), bg=120.0))
    return out


def _bolus(day, *, isf=None, ic=None, target=None, hour=8):
    """A confirmed bolus carrying the pump's dose-stamped settings on ``day``."""
    return BolusEvent(
        t=_day(day) + timedelta(hours=hour),
        description="Bolus", completion="Completed", insulin=5.0, carbs=40,
        isf=isf, carb_ratio=ic, target_bg=target,
    )


def _isf_boluses(spans):
    """Boluses stamping ``isf`` = value across each (start_day, end_day_inclusive)."""
    out = []
    for value, lo, hi in spans:
        for d in range(lo, hi + 1):
            out.append(_bolus(d, isf=value, ic=7.0, target=110))
    return out


def _basal_slot(day, hour, minute, rate):
    return BasalEvent(
        t=_day(day) + timedelta(hours=hour, minutes=minute),
        delivery_type="profileDelivery", duration_mins=5.0,
        basal_rate=rate, profile_basal_rate=rate,
    )


def _basal_days(spans, hour=0):
    """Programmed-rate samples for one slot across day spans (rate change over time)."""
    out = []
    for value, lo, hi in spans:
        for d in range(lo, hi + 1):
            out.append(_basal_slot(d, hour, 0, value))
    return out


class TrialDetectionTest(unittest.TestCase):
    def test_isf_change_maps_to_tir(self):
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])
        t = wc.detect_trial([], bolus, [], now=_day(8))
        self.assertIsNotNone(t)
        self.assertEqual(t.parameter, "isf")
        self.assertEqual(t.target_metrics, ["tir"])
        self.assertEqual(t.before, 30.0)
        self.assertEqual(t.after, 45.0)
        # Anchored at the first dose of the new regime (BASE is 05-01, so _day(5) is
        # 05-06), read straight off the epoch's conservative boundary.
        self.assertEqual(t.changed_at, "2026-05-06 08:00:00")

    def test_carb_ratio_change_maps_to_arc(self):
        bolus = ([_bolus(d, isf=30, ic=8.0, target=110) for d in range(1, 5)]
                 + [_bolus(d, isf=30, ic=6.0, target=110) for d in range(5, 9)])
        t = wc.detect_trial([], bolus, [], now=_day(8))
        self.assertEqual(t.parameter, "carb_ratio")
        self.assertEqual(t.target_metrics, ["arc"])

    def test_target_change_maps_to_tir(self):
        bolus = ([_bolus(d, isf=30, ic=7.0, target=110) for d in range(1, 5)]
                 + [_bolus(d, isf=30, ic=7.0, target=100) for d in range(5, 9)])
        t = wc.detect_trial([], bolus, [], now=_day(8))
        self.assertEqual(t.parameter, "target_bg")
        self.assertEqual(t.target_metrics, ["tir"])

    def test_basal_change_maps_to_tbr(self):
        basal = _basal_days([(0.6, 1, 4), (0.8, 5, 8)])
        t = wc.detect_trial(basal, [], [], now=_day(8))
        self.assertEqual(t.parameter, "basal_rate")
        self.assertEqual(t.target_metrics, ["tbr"])
        self.assertEqual(t.slot, "00:00")
        self.assertEqual(t.before, 0.6)
        self.assertEqual(t.after, 0.8)

    def test_whole_profile_switch_maps_to_overall(self):
        # basal + isf + I:C + target all move at the same instant → whole-profile.
        bolus = ([_bolus(d, isf=30, ic=8.0, target=110) for d in range(1, 5)]
                 + [_bolus(d, isf=45, ic=6.0, target=100) for d in range(5, 9)])
        basal = _basal_days([(0.6, 1, 4), (0.8, 5, 8)])
        t = wc.detect_trial(basal, bolus, [], now=_day(8))
        self.assertEqual(t.parameter, "profile")
        self.assertEqual(t.target_metrics, ["tir", "arc"])
        self.assertIsNone(t.before)
        self.assertIsNone(t.after)

    def test_no_change_no_trial(self):
        bolus = _isf_boluses([(30, 1, 8)])
        self.assertIsNone(wc.detect_trial([], bolus, [], now=_day(8)))

    def test_stale_change_outside_watch_horizon_is_not_a_trial(self):
        # A change 40 days before `now` (> 2× the 14d window) has long matured and
        # is no longer a watched change.
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 40)])
        self.assertIsNone(wc.detect_trial([], bolus, [], now=_day(60)))


class MaturingTest(unittest.TestCase):
    def test_recent_change_is_maturing(self):
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])
        cgm = _cgm_days(1, 8)  # only a few post-change data-days
        t = wc.detect_trial([], bolus, [], now=_day(8),
                            cgm_readings=cgm)
        self.assertTrue(t.maturing.is_maturing)
        self.assertGreaterEqual(t.maturing.days_elapsed, 1)
        self.assertLess(t.maturing.days_elapsed, 14)
        self.assertEqual(t.maturing.days_required, 14)

    def test_matured_change_is_not_maturing(self):
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 24)])
        cgm = _cgm_days(5, 24)  # >14 distinct post-change data-days
        t = wc.detect_trial([], bolus, [], now=_day(24),
                            cgm_readings=cgm)
        self.assertFalse(t.maturing.is_maturing)
        self.assertGreaterEqual(t.maturing.days_elapsed, 14)

    def test_no_target_data_keeps_it_maturing_despite_calendar(self):
        # An ISF change 30 calendar days old but with NO post-change CGM stays
        # maturing — the gate is data accrual, not the wall clock (ADR 0029 §6).
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])
        t = wc.detect_trial([], bolus, [], now=_day(20),
                            cgm_readings=[])
        self.assertTrue(t.maturing.is_maturing)
        self.assertEqual(t.maturing.days_elapsed, 0)

    def test_arc_target_matures_on_meal_days_not_cgm(self):
        # I:C change → target `arc`, which accrues on post-meal days. CGM presence is
        # irrelevant; the meal boluses that carry the I:C are themselves the data.
        bolus = ([_bolus(d, isf=30, ic=8.0, target=110) for d in range(1, 5)]
                 + [_bolus(d, isf=30, ic=6.0, target=110) for d in range(5, 9)])
        t = wc.detect_trial([], bolus, [], now=_day(8),
                            cgm_readings=_cgm_days(1, 8))
        self.assertEqual(t.target_metrics, ["arc"])
        # post-change meal-days (days 5..8, minus the day-5 boundary dose at/after
        # change) drive days_elapsed — a handful, still maturing.
        self.assertTrue(t.maturing.is_maturing)
        self.assertGreaterEqual(t.maturing.days_elapsed, 1)


class RevertRuleTest(unittest.TestCase):
    def test_revert_within_window_closes_trial_no_second_trial(self):
        # 30 → 45 → back to exact 30 inside the maturing window: closed, no new trial.
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8), (30, 9, 12)])
        self.assertIsNone(wc.detect_trial([], bolus, [], now=_day(12)))

    def test_third_value_creates_new_trial(self):
        # 30 → 45 → 60: a third value is a genuine new trial (45 → 60).
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8), (60, 9, 12)])
        t = wc.detect_trial([], bolus, [], now=_day(12))
        self.assertIsNotNone(t)
        self.assertEqual(t.parameter, "isf")
        self.assertEqual(t.before, 45.0)
        self.assertEqual(t.after, 60.0)

    def test_revert_after_maturing_is_a_new_trial(self):
        # Walk-back long AFTER the change matured is a deliberate new change, watched.
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8), (30, 30, 33)])
        t = wc.detect_trial([], bolus, [], now=_day(33))
        self.assertIsNotNone(t)
        self.assertEqual(t.before, 45.0)
        self.assertEqual(t.after, 30.0)

    def test_revert_on_one_param_does_not_hide_a_live_trial_on_another(self):
        # ISF reverted (newest change) but a genuine, slightly-earlier basal trial is
        # still live: fall through to the basal Trial, don't blank the payload.
        isf = _isf_boluses([(30, 1, 4), (45, 5, 8), (30, 9, 12)])  # reverted at day 9
        basal = _basal_days([(0.6, 1, 6), (0.8, 7, 12)])           # basal changed day 7
        t = wc.detect_trial(basal, isf, [], now=_day(12))
        self.assertIsNotNone(t)
        self.assertEqual(t.parameter, "basal_rate")
        self.assertEqual(t.target_metrics, ["tbr"])


class FocusViewTest(unittest.TestCase):
    def test_pattern_focus_adds_identity_but_keeps_lever_derived_copy(self):
        row = {"id": 4, "lever": "late_bolus", "pattern_key": "highs_after_meals",
               "pinned_at": "2026-07-01 08:00:00", "status": "active"}
        view = wc.focus_view(row).to_dict()
        self.assertEqual(view["subject"], "pattern:highs_after_meals")
        self.assertEqual(view["pattern_key"], "highs_after_meals")
        self.assertEqual(view["title"], "Late bolus")
        self.assertEqual(view["target_metric"], "arc")

    def test_all_setting_pattern_is_not_pinnable(self):
        self.assertFalse(wc.is_pinnable("basal_rate", "overnight_lows_no_iob"))

    def test_meal_lever_outcome_is_arc(self):
        v = wc.focus_view({"id": 1, "lever": "late_bolus",
                           "pinned_at": "2026-07-01 08:00:00", "status": "active"})
        self.assertEqual(v.kind, "focus")
        self.assertEqual(v.lever, "late_bolus")
        self.assertEqual(v.title, "Late bolus")
        self.assertEqual(v.target_metric, "arc")

    def test_low_lever_outcome_is_tbr(self):
        v = wc.focus_view({"id": 2, "lever": "over_treated_low",
                           "pinned_at": "2026-07-01 08:00:00", "status": "active"})
        self.assertEqual(v.target_metric, "tbr")

    def test_override_lever_pinnable_with_title(self):
        self.assertIn("user_override", wc.pinnable_levers())
        v = wc.focus_view({"id": 3, "lever": "user_override",
                           "pinned_at": "2026-07-01 08:00:00", "status": "active"})
        self.assertTrue(v.title)

    def test_pinnable_universe_is_behavioral_only(self):
        universe = wc.pinnable_levers()
        self.assertIn("late_bolus", universe)
        self.assertIn("missed_meal", universe)
        # A parameter is a tuning knob, never a pinnable behavioral lever.
        self.assertNotIn("isf", universe)
        self.assertNotIn("basal_rate", universe)
        self.assertTrue(wc.is_pinnable("late_bolus"))
        self.assertFalse(wc.is_pinnable("isf"))


class OneActiveInvariantTest(unittest.TestCase):
    def setUp(self):
        self.store = Store.open(":memory:")

    def reconcile(self, boluses=(), now=None):
        self.store.upsert_bolus([{
            "seq_num": index + 1, "request_time": str(b.t), "completion_time": str(b.t),
            "description": "Bolus", "completion": "Completed", "insulin": b.insulin,
            "isf": b.isf, "carb_ratio": b.carb_ratio, "carbs": b.carbs,
        } for index, b in enumerate(boluses)])
        with self.store.follow_up_transaction():
            wc.reconcile_follow_up(self.store, now=now or _day(10), recorded_at=now or _day(10))

    def tearDown(self):
        self.store.close()

    def test_focus_surfaces_when_no_trial(self):
        self.store.pin_focus("late_bolus", "2026-05-06 08:00:00")
        self.reconcile()
        active = wc.active_watched_change(
            self.store, [], [], [], now=_day(10))
        self.assertEqual(active.kind, "focus")
        self.assertEqual(active.lever, "late_bolus")

    def test_removed_lever_focus_is_dropped_instead_of_breaking_verify(self):
        self.store.pin_focus(
            "overnight_low_from_evening_dosing", "2026-05-06 08:00:00"
        )
        self.reconcile()
        active = wc.active_watched_change(
            self.store, [], [], [], now=_day(10)
        )
        self.assertIsNone(active)
        self.assertIsNone(self.store.active_focus())
        self.assertEqual(self.store.list_focuses()[0]["status"], "dropped")

    def test_setting_change_preempts_and_drops_focus(self):
        self.store.pin_focus("late_bolus", "2026-05-06 08:00:00")
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])  # change at day 5
        self.reconcile(bolus, _day(8))
        active = wc.active_watched_change(
            self.store, [], bolus, [], now=_day(8))
        # Trial takes the slot; the Focus is dropped (not paused), not surfaced.
        self.assertEqual(active.kind, "trial")
        self.assertIsNone(self.store.active_focus())
        self.assertEqual(self.store.list_focuses()[0]["status"], "dropped")

    def test_trial_active_blocks_a_pin(self):
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])
        self.reconcile(bolus, _day(8))
        self.assertTrue(wc.trial_is_active(
            self.store, bolus_events=bolus, now=_day(8)))
        # Caller-supplied slices cannot change the committed admission.
        self.assertTrue(wc.trial_is_active(
            self.store, bolus_events=[], now=_day(8)))

    def test_trial_admission_blocks_a_pattern_focus_pin(self):
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])
        self.reconcile(bolus, _day(8))
        admission = wc.follow_up_admission(self.store, now=_day(8))
        self.assertEqual(admission["active_kind"], "trial")
        self.assertFalse(admission["focus_pin"]["available"])

    def test_trial_preempts_an_active_pattern_focus(self):
        unavailable = {"version": "386:1", "state": "unavailable",
                       "reason": "not_recorded"}
        with self.store.follow_up_transaction():
            focus = self.store.pin_focus(
                "late_bolus", "2026-05-06 08:00:00", "highs_after_meals",
            )
            self.store.save_follow_up_record({
                "kind": "focus", "id": focus["id"], "version": "386:1", **focus,
                "decision_context": unavailable, "comparison_context": unavailable,
            })
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])
        self.reconcile(bolus, _day(8))
        self.assertIsNone(self.store.active_focus())
        record = self.store.follow_up_record("focus", focus["id"])
        self.assertEqual(record["ending"]["kind"], "trial_preempted")

    def test_nothing_watched_returns_none(self):
        self.assertIsNone(wc.active_watched_change(
            self.store, [], [], [], now=_day(8)))


def _seg(start_min, basal, isf, cr, target):
    return ProfileSegment(start_min=start_min, basal_rate=basal, isf=isf,
                          carb_ratio=cr, target_bg=target)


def _profile(idp, segments):
    return ProfileSettings(idp=idp, name=str(idp), dia_min=300, carb_entry=True,
                           max_bolus=15.0, segments=tuple(segments))


def _snap(day, active_idp, profiles, hour=6):
    return Snapshot(captured_at=_day(day) + timedelta(hours=hour),
                    settings=PumpSettings(active_idp=active_idp,
                                          profiles=tuple(profiles)))


class ProfileSwitchAttributionTest(unittest.TestCase):
    """A profile switch is attributed to the setting(s) that actually moved (#331).

    The user duplicates a profile, edits one thing, and switches. Diffing the
    outgoing vs incoming active profile says whether the switch was a single-knob
    change (a targeted Trial) or a genuine whole-profile switch. Before #331 any
    ``active_idp`` switch was forced to ``parameter="profile"``.
    """

    def test_single_setting_switch_attributes_the_changed_parameter(self):
        # Duplicate-and-switch differing only in ISF@07:00 (40→36). Pre-#331 this
        # returned parameter="profile"; it must now target the one thing that moved.
        # (This used a single-segment I:C change until #518, which suppresses exactly
        # that — a block-scoped carb-ratio edit opens no Trial; see
        # `test_block_scoped_carb_ratio_switch_opens_no_trial`. The attribution rule
        # under test here is parameter-agnostic.)
        p_out = _profile(1, [_seg(0, 0.6, 40, 5.0, 110), _seg(420, 0.6, 40, 5.0, 110),
                             _seg(720, 0.6, 40, 5.0, 110)])
        p_in = _profile(2, [_seg(0, 0.6, 40, 5.0, 110), _seg(420, 0.6, 36, 5.0, 110),
                            _seg(720, 0.6, 40, 5.0, 110)])
        snaps = [_snap(4, 1, [p_out, p_in]), _snap(5, 2, [p_out, p_in])]
        bolus = ([_bolus(d, isf=40, ic=5.0, target=110) for d in range(1, 5)]
                 + [_bolus(d, isf=36, ic=5.0, target=110) for d in range(5, 9)])
        t = wc.detect_trial([], bolus, snaps, now=_day(8))
        self.assertEqual(t.parameter, "isf")
        self.assertEqual(t.before, 40)
        self.assertEqual(t.after, 36)
        self.assertEqual(t.target_metrics, ["tir"])
        self.assertEqual(t.slot, "07:00")

    def test_whole_day_isf_switch_is_one_changed_parameter(self):
        # ISF 40→36 on every segment is ONE parameter (not eight changed slots).
        p_out = _profile(1, [_seg(0, 0.6, 40, 5.0, 110), _seg(720, 0.6, 40, 5.0, 110)])
        p_in = _profile(2, [_seg(0, 0.6, 36, 5.0, 110), _seg(720, 0.6, 36, 5.0, 110)])
        snaps = [_snap(4, 1, [p_out, p_in]), _snap(5, 2, [p_out, p_in])]
        bolus = ([_bolus(d, isf=40, ic=5.0, target=110) for d in range(1, 5)]
                 + [_bolus(d, isf=36, ic=5.0, target=110) for d in range(5, 9)])
        t = wc.detect_trial([], bolus, snaps, now=_day(8))
        self.assertEqual(t.parameter, "isf")
        self.assertIsNone(t.slot)
        self.assertEqual(t.target_metrics, ["tir"])

    def test_single_basal_slot_switch_targets_basal_with_slot(self):
        # basal differs only at 08:30 (one 30-min slot); the next segment restores it.
        p_out = _profile(1, [_seg(0, 0.6, 40, 5.0, 110), _seg(510, 0.6, 40, 5.0, 110),
                             _seg(540, 0.6, 40, 5.0, 110)])
        p_in = _profile(2, [_seg(0, 0.6, 40, 5.0, 110), _seg(510, 1.1, 40, 5.0, 110),
                            _seg(540, 0.6, 40, 5.0, 110)])
        snaps = [_snap(4, 1, [p_out, p_in]), _snap(5, 2, [p_out, p_in])]
        basal = ([_basal_slot(d, 8, 30, 0.6) for d in range(1, 5)]
                 + [_basal_slot(d, 8, 30, 1.1) for d in range(5, 9)])
        t = wc.detect_trial(basal, [], snaps, now=_day(8))
        self.assertEqual(t.parameter, "basal_rate")
        self.assertEqual(t.slot, "08:30")
        self.assertEqual(t.target_metrics, ["tbr"])
        self.assertEqual(t.before, 0.6)
        self.assertEqual(t.after, 1.1)

    def test_multi_parameter_switch_stays_whole_profile(self):
        # Mirrors the real 07-08 switch: basal + isf + I:C all move → whole-profile.
        p_out = _profile(1, [_seg(0, 0.6, 40, 5.0, 110), _seg(720, 0.6, 40, 5.0, 110)])
        p_in = _profile(2, [_seg(0, 0.8, 36, 4.0, 110), _seg(720, 0.8, 36, 4.0, 110)])
        snaps = [_snap(4, 1, [p_out, p_in]), _snap(5, 2, [p_out, p_in])]
        bolus = ([_bolus(d, isf=40, ic=5.0, target=110) for d in range(1, 5)]
                 + [_bolus(d, isf=36, ic=4.0, target=110) for d in range(5, 9)])
        basal = ([_basal_slot(d, 0, 0, 0.6) for d in range(1, 5)]
                 + [_basal_slot(d, 0, 0, 0.8) for d in range(5, 9)])
        t = wc.detect_trial(basal, bolus, snaps, now=_day(8))
        self.assertEqual(t.parameter, "profile")
        self.assertEqual(t.target_metrics, ["tir", "arc"])

    def test_switch_with_missing_outgoing_profile_falls_back_to_whole_profile(self):
        # The outgoing profile (idp 1) is gone from the post-switch snapshot.
        p_in = _profile(2, [_seg(0, 0.6, 36, 5.0, 110)])
        snaps = [_snap(4, 1, [_profile(1, [_seg(0, 0.6, 40, 5.0, 110)]), p_in]),
                 _snap(5, 2, [p_in])]
        bolus = ([_bolus(d, isf=40, ic=5.0, target=110) for d in range(1, 5)]
                 + [_bolus(d, isf=36, ic=5.0, target=110) for d in range(5, 9)])
        t = wc.detect_trial([], bolus, snaps, now=_day(8))
        self.assertEqual(t.parameter, "profile")
        self.assertEqual(t.target_metrics, ["tir", "arc"])


class SwitchStartsTrialImmediatelyTest(unittest.TestCase):
    """A profile switch starts the Trial by itself — no dose stream needed (#463).

    The user duplicates P005 as P006, edits one block, activates it, and fetches
    settings. The switch snapshot already proves what moved and when, so the Trial
    exists before any bolus stamps the new value; waiting for the dose stream's
    two-day debounce contradicted #331's authoritative-diff rule.
    """

    def _whole_day_ic_switch(self):
        """Every I:C segment moving to the same value — one whole-PARAMETER change.

        The diff collapses this to a single slot-less carb-ratio change, so #518's
        block-scope suppression does not apply, and the target stays ``arc`` — meal
        days, which is the accrual these tests measure.
        """
        p_out = _profile(5, [_seg(0, 0.6, 40, 5.4, 110), _seg(720, 0.6, 40, 5.4, 110),
                             _seg(900, 0.6, 40, 5.4, 110)])
        p_in = _profile(6, [_seg(0, 0.6, 40, 5.7, 110), _seg(720, 0.6, 40, 5.7, 110),
                            _seg(900, 0.6, 40, 5.7, 110)])
        return [_snap(4, 5, [p_out, p_in]), _snap(5, 6, [p_out, p_in])]

    def _noon_isf_switch(self):
        """A single-segment ISF change — the vehicle for the switch-Trial mechanics.

        These tests are about attribution, maturity accrual and identity, none of
        which is parameter-specific. They used a segment-scoped carb-ratio switch
        until #518, which suppresses exactly that (a block edit opens no Trial until
        the stage-time arc is persisted), so they ride ISF instead. The carb-ratio
        fallback itself is pinned by its own tests below.
        """
        p_out = _profile(5, [_seg(0, 0.6, 40, 5.4, 110), _seg(720, 0.6, 40, 5.4, 110),
                             _seg(900, 0.6, 40, 5.4, 110)])
        p_in = _profile(6, [_seg(0, 0.6, 40, 5.4, 110), _seg(720, 0.6, 36, 5.4, 110),
                            _seg(900, 0.6, 40, 5.4, 110)])
        return [_snap(4, 5, [p_out, p_in]), _snap(5, 6, [p_out, p_in])]

    def _noon_ic_switch(self):
        p_out = _profile(5, [_seg(0, 0.6, 40, 5.4, 110), _seg(720, 0.6, 40, 5.4, 110),
                             _seg(900, 0.6, 40, 5.4, 110)])
        p_in = _profile(6, [_seg(0, 0.6, 40, 5.4, 110), _seg(720, 0.6, 40, 5.7, 110),
                            _seg(900, 0.6, 40, 5.4, 110)])
        return [_snap(4, 5, [p_out, p_in]), _snap(5, 6, [p_out, p_in])]

    def test_switch_with_zero_boluses_is_a_targeted_trial(self):
        t = wc.detect_trial([], [], self._noon_isf_switch(),
                            now=_day(5) + timedelta(hours=12))
        self.assertIsNotNone(t)
        self.assertEqual(t.parameter, "isf")
        self.assertEqual(t.before, 40)
        self.assertEqual(t.after, 36)
        self.assertEqual(t.slot, "12:00")
        self.assertEqual(t.target_metrics, ["tir"])
        self.assertEqual(t.changed_at, "2026-05-06 06:00:00")
        self.assertTrue(t.maturing.is_maturing)
        self.assertEqual(t.maturing.days_elapsed, 0)

    def test_later_meal_days_only_advance_maturity(self):
        # One post-switch meal day, then two: the Trial's existence never depended on
        # them; they only move days_elapsed.
        snaps = self._whole_day_ic_switch()
        one_day = [_bolus(5, isf=40, ic=5.7, target=110, hour=12)]
        t1 = wc.detect_trial([], one_day, snaps, now=_day(6))
        self.assertEqual(t1.parameter, "carb_ratio")
        self.assertEqual(t1.maturing.days_elapsed, 1)
        two_days = one_day + [_bolus(6, isf=40, ic=5.7, target=110, hour=12)]
        t2 = wc.detect_trial([], two_days, snaps, now=_day(7))
        self.assertEqual(t2.parameter, "carb_ratio")
        self.assertEqual(t2.before, 5.4)
        self.assertEqual(t2.after, 5.7)
        self.assertEqual(t2.maturing.days_elapsed, 2)

    def test_later_dose_change_point_preserves_switch_trial_identity(self):
        snaps = self._whole_day_ic_switch()
        bolus = ([_bolus(d, isf=40, ic=5.4, target=110, hour=12)
                  for d in range(1, 5)]
                 + [_bolus(d, isf=40, ic=5.7, target=110, hour=12)
                    for d in range(7, 11)])

        t = wc.detect_trial(
            [], bolus, snaps, now=_day(10) + timedelta(hours=13)
        )

        self.assertEqual(t.parameter, "carb_ratio")
        self.assertIsNone(t.slot)
        self.assertEqual(t.before, 5.4)
        self.assertEqual(t.after, 5.7)
        self.assertEqual(t.changed_at, "2026-05-06 06:00:00")
        self.assertEqual(t.maturing.days_elapsed, 4)


    def test_block_scoped_carb_ratio_switch_opens_no_trial(self):
        # #518 declared fallback. Watching ONE carb-ratio stretch honestly needs the
        # arc it covered recorded at stage time — a later profile edit re-partitions
        # the blocks underneath a live Trial. Until that is persisted with the Plan, a
        # segment-scoped carb-ratio edit opens no Trial rather than a wrong one.
        t = wc.detect_trial([], [], self._noon_ic_switch(),
                            now=_day(5) + timedelta(hours=12))
        self.assertIsNone(t)

    def test_whole_parameter_carb_ratio_change_still_opens_a_trial(self):
        # The other half of the fallback: only the BLOCK-scoped case is suppressed.
        # A whole-day carb-ratio change is still watched exactly as before.
        bolus = ([_bolus(d, isf=40, ic=5.4, target=110, hour=12) for d in range(1, 5)]
                 + [_bolus(d, isf=40, ic=5.7, target=110, hour=12) for d in range(7, 11)])
        t = wc.detect_trial([], bolus, [], now=_day(10) + timedelta(hours=13))
        self.assertIsNotNone(t)
        self.assertEqual(t.parameter, "carb_ratio")
        self.assertIsNone(t.slot)
        self.assertEqual((t.before, t.after), (5.4, 5.7))

    def test_late_corroboration_does_not_resurrect_aged_out_switch(self):
        snaps = self._noon_ic_switch()
        bolus = ([_bolus(d, isf=40, ic=5.4, target=110, hour=12)
                  for d in range(1, 5)]
                 + [_bolus(d, isf=40, ic=5.7, target=110, hour=12)
                    for d in range(35, 39)])

        t = wc.detect_trial(
            [], bolus, snaps, now=_day(39) + timedelta(hours=13)
        )

        self.assertIsNone(t)

    def test_later_different_dose_value_starts_a_new_trial(self):
        snaps = self._noon_ic_switch()
        bolus = ([_bolus(d, isf=40, ic=5.4, target=110, hour=12)
                  for d in range(1, 5)]
                 + [_bolus(d, isf=40, ic=5.7, target=110, hour=12)
                    for d in range(7, 11)]
                 + [_bolus(d, isf=40, ic=6.0, target=110, hour=12)
                    for d in range(11, 15)])

        t = wc.detect_trial(
            [], bolus, snaps, now=_day(14) + timedelta(hours=13)
        )

        self.assertEqual(t.parameter, "carb_ratio")
        self.assertIsNone(t.slot)
        self.assertEqual(t.before, 5.7)
        self.assertEqual(t.after, 6.0)
        self.assertEqual(t.changed_at, "2026-05-12 12:00:00")

    def test_later_transition_to_same_value_starts_a_new_trial(self):
        snaps = self._noon_ic_switch()
        bolus = ([_bolus(d, isf=40, ic=5.4, target=110, hour=12)
                  for d in range(1, 5)]
                 + [_bolus(d, isf=40, ic=6.0, target=110, hour=12)
                    for d in range(7, 11)]
                 + [_bolus(d, isf=40, ic=5.7, target=110, hour=12)
                    for d in range(11, 15)])

        t = wc.detect_trial(
            [], bolus, snaps, now=_day(14) + timedelta(hours=13)
        )

        self.assertEqual(t.parameter, "carb_ratio")
        self.assertIsNone(t.slot)
        self.assertEqual(t.before, 6.0)
        self.assertEqual(t.after, 5.7)
        self.assertEqual(t.changed_at, "2026-05-12 12:00:00")

    def test_multi_parameter_switch_with_no_doses_is_whole_profile(self):
        p_out = _profile(5, [_seg(0, 0.6, 40, 5.4, 110)])
        p_in = _profile(6, [_seg(0, 0.8, 36, 5.4, 110)])
        snaps = [_snap(4, 5, [p_out, p_in]), _snap(5, 6, [p_out, p_in])]
        t = wc.detect_trial([], [], snaps, now=_day(6))
        self.assertEqual(t.parameter, "profile")
        self.assertEqual(t.target_metrics, ["tir", "arc"])

    def test_missing_outgoing_profile_with_no_doses_is_whole_profile(self):
        p_in = _profile(6, [_seg(0, 0.6, 36, 5.4, 110)])
        snaps = [_snap(4, 5, [_profile(5, [_seg(0, 0.6, 40, 5.4, 110)]), p_in]),
                 _snap(5, 6, [p_in])]
        t = wc.detect_trial([], [], snaps, now=_day(6))
        self.assertEqual(t.parameter, "profile")

    def test_exact_switch_back_in_window_is_closed_not_a_second_trial(self):
        p_out = _profile(5, [_seg(0, 0.6, 40, 5.4, 110), _seg(720, 0.6, 40, 5.4, 110)])
        p_in = _profile(6, [_seg(0, 0.6, 40, 5.4, 110), _seg(720, 0.6, 40, 5.7, 110)])
        snaps = [_snap(4, 5, [p_out, p_in]), _snap(5, 6, [p_out, p_in]),
                 _snap(8, 5, [p_out, p_in])]
        self.assertIsNone(wc.detect_trial([], [], snaps, now=_day(9)))


class _SpyStore(Store):
    """A Store that records the ``start``/``end`` every read call receives."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cgm_calls = []
        self.bolus_calls = []

    def cgm_readings(self, start=None, end=None):
        self.cgm_calls.append((start, end))
        return super().cgm_readings(start, end)

    def bolus_events(self, start=None, end=None):
        self.bolus_calls.append((start, end))
        return super().bolus_events(start, end)


def _save_retained_trial(store, *, record_id, parameter, slot, changed_at, before, after):
    with store.follow_up_transaction():
        store.save_follow_up_record({
            "kind": "trial", "id": record_id, "version": "386:1",
            "parameter": parameter, "slot": slot, "changed_at": changed_at,
            "before": before, "after": after,
            "first_observed_at": changed_at,
            "observed_context": wc._unavailable("not_recorded"),
        })


class BoundedRetainedReadTest(unittest.TestCase):
    """#414 1.1: `_retained_trial`'s per-record store reads are bounded to the
    record's own ``[changed_at, end + 1s)`` window, never a whole-table scan —
    and the +1s pad keeps a reading landing exactly on the boundary in."""

    def setUp(self):
        self.store = _SpyStore.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_reads_are_bounded_per_retained_record_and_keep_the_boundary_reading(self):
        changed_1 = datetime(2024, 1, 1, 0, 0, 0)
        changed_2 = datetime(2024, 1, 1, 2, 0, 0)
        # `now` lands exactly on both records' own bounded-window end (`min(now,
        # changed_at + _MATURE_WINDOW)` caps at `now` for both), an exact reading
        # instant (`_latest_instant`).
        latest_instant = changed_1 + wc._MATURE_WINDOW
        # Retained trial record ids are always the parameter/slot/changed_at
        # `_review_id` stamp (watched_change.py:1508) — mirror that format here so
        # the roster row this test looks up actually matches its saved record.
        id_1 = f"isf-all-{changed_1.strftime('%Y%m%d%H%M%S')}"
        id_2 = f"isf-all-{changed_2.strftime('%Y%m%d%H%M%S')}"
        _save_retained_trial(self.store, record_id=id_1, parameter="isf",
                             slot=None, changed_at=changed_1.strftime(wc._DT_FMT),
                             before=30.0, after=40.0)
        _save_retained_trial(self.store, record_id=id_2, parameter="isf",
                             slot=None, changed_at=changed_2.strftime(wc._DT_FMT),
                             before=40.0, after=45.0)
        # A single CGM reading exactly at `end` — the store's own read is half-open
        # [start, end) while `_maturing`/`_data_gaps` accept (changed_at, end], so
        # without the +1s pad this reading falls right outside the store's window.
        self.store.upsert_cgm([{
            "EventDateTime": latest_instant.strftime("%Y-%m-%dT%H:%M:%S"),
            "Readings (CGM / BGM)": 120, "Description": "Synthetic EGV",
        }])

        result = wc.review_trials(self.store, now=latest_instant)

        unbounded = [c for c in self.store.cgm_calls if c == (None, None)]
        bounded = [c for c in self.store.cgm_calls if c != (None, None)]
        # Exactly one whole-table read: `_reviewable_trials`'s candidate detection.
        self.assertEqual(len(unbounded), 1)
        # One bounded read per retained record — never the whole table.
        self.assertEqual(len(bounded), 2)
        read_end = (latest_instant + timedelta(seconds=1)).strftime(wc._DT_FMT)
        self.assertIn((changed_1.strftime(wc._DT_FMT), read_end), bounded)
        self.assertIn((changed_2.strftime(wc._DT_FMT), read_end), bounded)

        row = next(r for r in result["trials"] if r["id"] == id_1)
        # The boundary reading is not dropped: it lands inside the bounded window,
        # so maturity and the gap count read exactly as an unbounded scan would.
        self.assertEqual(row["maturing"]["days_elapsed"], 1)
        self.assertEqual(row["maturing"]["gap_count"], 14)


def _at(n, hour=8):
    """``_day(n)`` at ``hour`` o'clock, as a stored record time."""
    return (_day(n) + timedelta(hours=hour)).strftime(wc._DT_FMT)


def _dose_rows(spans):
    """``upsert_bolus`` rows: one dose-stamped bolus a day at 08:00 across each
    (first day, last day inclusive, stamped settings) span."""
    rows = []
    for lo, hi, stamped in spans:
        for n in range(lo, hi + 1):
            rows.append({"seq_num": len(rows) + 1, "request_time": _at(n), "completion_time": _at(n),
                         "description": "Bolus", "completion": "Completed", "insulin": 5.0,
                         "carbs": 40, **stamped})
    return rows


def _stamps(pairs):
    """(isf, carb ratio, first day, last day) spans as dose-stamped settings."""
    return [(lo, hi, {"isf": isf, "carb_ratio": ic}) for isf, ic, lo, hi in pairs]


# Four correction-factor changes (05-11, 06-20, 07-30, 09-08), each more than one
# 28-day watch window after the one before: the issue's failing-first history.
_FOUR_OLD_CHANGES = _stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 49), (35, 7.0, 50, 89),
                             (50, 7.0, 90, 129), (40, 7.0, 130, 169)])

# A correction-factor change on 05-11, reconciled on 05-13; then the pump goes
# back to 30 on 05-15 and the carb ratio changes on 05-21, reconciled on 05-26.
_BEFORE_REVERSAL = _stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 12)])
_AFTER_REVERSAL = _stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 13), (30, 7.0, 14, 19), (30, 9.0, 20, 25)])


class EveryRecordEndsTest(unittest.TestCase):
    """ADR 442: at each reconcile every retained Trial record without an ending
    ends by one rule, oldest first: reverted, else superseded by the first later
    detected change outside its own Edit and inside its watch window, else
    expired once that window has passed. Its saved assessment reads evidence
    only up to its ending instant. Every store is synthetic and every ending is
    recorded by the public reconcile path."""

    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def reconcile(self, now):
        with self.store.follow_up_transaction():
            wc.reconcile_follow_up(self.store, now=now, recorded_at=now)

    def pump_read(self, when, active_idp, profiles):
        self.store.upsert_settings_snapshot(when.strftime(wc._DT_FMT),
                                            PumpSettings(active_idp=active_idp, profiles=tuple(profiles)))

    def records(self):
        """Every retained Trial record by its change time, oldest first."""
        return {record["changed_at"]: record for record in sorted(
            self.store.follow_up_records("trial"), key=lambda record: (record["changed_at"], record["id"]))}

    def assertEnded(self, record, kind, effective_at):
        self.assertEqual((record["ending"].get("kind"), record["ending"].get("effective_at")),
                         (kind, effective_at))

    def pump_read_pair(self):
        """Two correction-factor profile switches nine days apart (05-11 and 05-20
        06:00), each captured by a pump read at the switch, one read before both,
        doses stamped to match."""
        profiles = [_profile(idp, [_seg(0, 0.6, isf, 7.0, 110)]) for idp, isf in ((1, 40), (2, 36), (3, 32))]
        for day, active in ((0, 1), (10, 2), (19, 3)):
            self.pump_read(_day(day) + timedelta(hours=6), active, profiles)
        self.store.upsert_bolus(_dose_rows(_stamps([(40, 7.0, 1, 9), (36, 7.0, 10, 18), (32, 7.0, 19, 60)])))
        return profiles

    def basal_edit(self, moved_on):
        """Programmed basal rows for the 01:00, 03:00 and 05:00 slots; each slot's
        rate steps up on the day ``moved_on`` names (never if absent)."""
        rows = []
        for n in range(1, 61):
            for hour in (1, 3, 5):
                rate = 0.7 if n >= moved_on.get(hour, 61) else 0.6
                rows.append({"seq_num": len(rows) + 1, "time": _at(n, hour),
                             "delivery_type": "Profile", "duration_mins": 30,
                             "basal_rate": rate, "profile_basal_rate": rate})
        self.store.upsert_basal(rows)

    def test_a_changes_older_than_the_window_all_end_on_one_reconcile(self):
        self.store.upsert_bolus(_dose_rows(_FOUR_OLD_CHANGES))
        self.reconcile(_day(170))
        records = self.records()
        self.assertEqual(list(records), [_at(10), _at(50), _at(90), _at(130)])
        for changed_at, expiry in zip(records, (_at(38), _at(78), _at(118), _at(158))):
            self.assertEnded(records[changed_at], "expired_unreviewed", expiry)

    def test_b_pump_read_supersession_says_its_period_ends_at_that_change(self):
        self.pump_read_pair()
        self.reconcile(_day(60))
        older, later = self.records()[_at(10, 6)], self.records()[_at(19, 6)]
        self.assertEnded(older, "superseded", _at(19, 6))
        after = older["ending"]["assessment"]["periods"]["after"]
        self.assertEqual((after["end"], after["boundary_reasons"]["end"]),
                         (_at(19, 6), "next_relevant_setting_change"))
        self.assertEnded(later, "expired_unreviewed", _at(47, 6))
        self.assertEqual(later["ending"]["assessment"]["periods"]["after"]["boundary_reasons"]["end"],
                         "data_tail")

    def test_c_a_later_change_of_another_setting_supersedes(self):
        self.store.upsert_bolus(_dose_rows(_stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 19), (45, 9.0, 20, 30)])))
        self.reconcile(_day(30))
        isf, carb_ratio = self.records()[_at(10)], self.records()[_at(20)]
        self.assertEqual((isf["parameter"], carb_ratio["parameter"]), ("isf", "carb_ratio"))
        self.assertEnded(isf, "superseded", _at(20))

    def test_d_a_reversal_comes_before_supersession(self):
        self.store.upsert_bolus(_dose_rows(_BEFORE_REVERSAL))
        self.reconcile(_day(12))
        self.assertNotIn("kind", self.records()[_at(10)]["ending"])
        self.store.upsert_bolus(_dose_rows(_AFTER_REVERSAL))
        self.reconcile(_day(25))
        self.assertEnded(self.records()[_at(10)], "reverted", _at(14))

    def test_e_a_record_inside_its_window_stays_open_and_watched(self):
        self.store.upsert_bolus(_dose_rows(_stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 20)])))
        self.reconcile(_day(20))
        record = self.records()[_at(10)]
        self.assertNotIn("kind", record["ending"])
        admission = wc.follow_up_admission(self.store, now=_day(20))
        self.assertEqual((admission["active_kind"], admission["active_id"]), ("trial", record["id"]))

    def test_f_a_second_reconcile_changes_no_saved_ending(self):
        profiles = self.pump_read_pair()
        self.reconcile(_day(60))
        first = {record["id"]: record["ending"] for record in self.store.follow_up_records("trial")}
        self.assertEqual(sorted(ending["kind"] for ending in first.values()),
                         ["expired_unreviewed", "superseded"])
        # Newer inputs: a third switch on 06-05 and doses through 07-10.
        self.pump_read(_day(35) + timedelta(hours=6), 4,
                       profiles + [_profile(4, [_seg(0, 0.6, 28, 7.0, 110)])])
        self.store.upsert_bolus(_dose_rows(_stamps([(40, 7.0, 1, 9), (36, 7.0, 10, 18),
                                                    (32, 7.0, 19, 34), (28, 7.0, 35, 70)])))
        self.reconcile(_day(70))
        second = {record["id"]: record["ending"] for record in self.store.follow_up_records("trial")}
        self.assertEqual(len(second), 3)
        self.assertEqual({identity: second[identity] for identity in first}, first)

    def test_g_an_expiry_recorded_after_the_fact_reads_data_to_its_own_instant(self):
        self.pump_read(_day(0) + timedelta(hours=6), 1, [_profile(1, [_seg(0, 0.6, 30, 7.0, 110)])])
        self.store.upsert_bolus(_dose_rows(_stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 41)])))
        self.reconcile(_day(41) + timedelta(hours=8))  # three days after the window ended
        ending = self.records()[_at(10)]["ending"]
        self.assertEqual((ending["kind"], ending["effective_at"], ending["recorded_at"]),
                         ("expired_unreviewed", _at(38), _at(41)))
        self.assertEqual(ending["assessment"]["data_cutoff"], _at(38))

    def test_h_a_context_read_after_the_ending_leaves_the_assessment_unavailable(self):
        self.store.upsert_bolus(_dose_rows(_FOUR_OLD_CHANGES))
        self.pump_read(_day(169), 1, [_profile(1, [_seg(0, 0.6, 40, 7.0, 110)])])
        self.reconcile(_day(170))
        records = self.records()
        self.assertEqual(len(records), 4)
        for record in records.values():
            assessment = record["ending"]["assessment"]
            self.assertEqual((assessment["state"], assessment["reason"]), ("unavailable", "context_after_ending"))
            self.assertEqual(assessment["data_cutoff"], record["ending"]["effective_at"])
            self.assertEqual(assessment["comparison_context"], record["comparison_context"])
            self.assertEqual((assessment["periods"], assessment["outcomes"]), ({}, []))

    def test_i_a_context_read_before_the_superseding_change_is_used(self):
        self.pump_read(_day(0) + timedelta(hours=6), 1, [_profile(1, [_seg(0, 0.6, 30, 7.0, 110)])])
        self.store.upsert_bolus(_dose_rows(_stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 19), (45, 9.0, 20, 60)])))
        self.reconcile(_day(60))
        record = self.records()[_at(10)]
        self.assertEnded(record, "superseded", _at(20))
        assessment = record["ending"]["assessment"]
        self.assertNotEqual(assessment["reason"], "context_after_ending")
        self.assertEqual(assessment["comparison_context"], record["comparison_context"])
        self.assertEqual(assessment["data_cutoff"], _at(20))
        self.assertEqual(assessment["periods"]["after"]["data_cutoff"], _at(20))

    def test_j_a_plan_receipt_is_unchanged_by_the_ending(self):
        profiles = self.pump_read_pair()
        items = [{"type": "isf", "start_min": 0, "value": 36}]
        self.store.save_plan_draft(items, _at(5, 0))
        plan = self.store.apply_plan(_at(5, 0))
        deliverable = {"version": "386:1", "state": "available", "source_profile": asdict(profiles[0]),
                       "rows": plan_deliverable([asdict(s) for s in profiles[0].segments], items)}
        with self.store.follow_up_transaction():
            saved = self.store.save_follow_up_record({"kind": "plan", "id": plan["applied_at"], "version": "386:1",
                                                      **plan, "deliverable": deliverable})
        self.reconcile(_day(60))
        record = self.records()[_at(10, 6)]
        self.assertEnded(record, "superseded", _at(19, 6))
        receipt = {"version": "386:1", "state": "available", "applied_at": _at(5, 0),
                   "trial_id": "isf-all-20260511060000", "established_at": _at(60, 0),
                   "observed_snapshot": {"captured_at": _at(10, 6), "active_idp": 2},
                   "matched_deliverable": saved["deliverable"], "block": None}
        self.assertEqual(record["reconciliation"], receipt)
        self.assertEqual(self.store.follow_up_record("plan", _at(5, 0))["reconciliation"], receipt)

    def test_k_a_multi_slot_edit_ends_at_the_first_change_after_it(self):
        self.basal_edit({1: 10, 3: 10, 5: 20})
        self.reconcile(_day(60))
        records = self.records()
        self.assertEqual(list(records), [_at(10, 1), _at(10, 3), _at(20, 5)])
        self.assertEnded(records[_at(10, 1)], "superseded", _at(20, 5))
        self.assertEnded(records[_at(10, 3)], "superseded", _at(20, 5))

    def test_k_a_multi_slot_edit_without_a_later_change_expires(self):
        self.basal_edit({1: 10, 3: 10})
        self.reconcile(_day(60))
        records = self.records()
        self.assertEqual(list(records), [_at(10, 1), _at(10, 3)])
        self.assertEnded(records[_at(10, 1)], "expired_unreviewed", _at(38, 1))
        self.assertEnded(records[_at(10, 3)], "expired_unreviewed", _at(38, 3))

    def test_l_a_dose_detected_supersession_reads_data_through_that_change(self):
        self.pump_read(_day(0), 1, [_profile(1, [_seg(0, 0.6, 40, 7.0, 110)])])
        self.store.upsert_bolus(_dose_rows(_stamps([(40, 7.0, 1, 9), (40, 8.0, 10, 18), (40, 9.0, 19, 60)])))
        self.reconcile(_day(60))
        older = self.records()[_at(10)]
        self.assertEnded(older, "superseded", _at(19))
        after = older["ending"]["assessment"]["periods"]["after"]
        self.assertEqual((after["end"], after["boundary_reasons"]["end"]), (_at(19), "data_tail"))

    def test_m_a_change_that_settles_later_leaves_the_ending_as_recorded(self):
        profile = lambda idp, isf, ic, target: _profile(idp, [_seg(0, 0.6, isf, ic, target)])
        self.pump_read(_day(0) + timedelta(hours=6), 1, [profile(1, 40, 7.0, 110)])
        self.pump_read(_day(10) + timedelta(hours=20), 2, [profile(1, 40, 7.0, 110), profile(2, 36, 7.0, 110)])
        self.pump_read(_day(12) + timedelta(hours=6), 3, [profile(1, 40, 7.0, 110), profile(2, 36, 8.0, 110),
                                                         profile(3, 36, 8.0, 120)])
        spans = [(0, 10, {"isf": 40, "carb_ratio": 7.0, "target_bg": 110}),
                 (11, 11, {"isf": 36, "carb_ratio": 8.0, "target_bg": 110}),
                 (12, 12, {"isf": 36, "carb_ratio": 8.0, "target_bg": 120})]
        self.store.upsert_bolus(_dose_rows(spans[:2]))
        self.reconcile(_day(12) + timedelta(hours=7))
        records = self.records()
        self.assertEqual(list(records), [_at(10, 20), _at(12, 6)])
        self.assertEnded(records[_at(10, 20)], "superseded", _at(12, 6))
        first = records[_at(10, 20)]["ending"]
        self.store.upsert_bolus(_dose_rows(spans))
        self.reconcile(_day(12) + timedelta(hours=19))
        records = self.records()
        self.assertEqual(records[_at(11)]["parameter"], "carb_ratio")
        edits = wc.review_trials(self.store, now=_day(12) + timedelta(hours=19))["edits"]
        self.assertEqual([edit["count"] for edit in edits], [3])
        self.assertEqual(records[_at(10, 20)]["ending"], first)

    def test_one_history_read_per_reconcile_saves_what_a_read_per_record_saves(self):
        """ADR 442's reconcile cost: a pass reads the detector's history once and
        shares it across every open record. Each store is reconciled twice, once
        that way and once reading the history afresh for each record, and the
        follow-up rows each saves are byte-identical."""
        per_record = wc._reversal_at

        def reversal():
            self.store.upsert_bolus(_dose_rows(_BEFORE_REVERSAL))
            self.reconcile(_day(12))
            self.store.upsert_bolus(_dose_rows(_AFTER_REVERSAL))
            self.reconcile(_day(25))

        def later_read():
            self.store.upsert_bolus(_dose_rows(_FOUR_OLD_CHANGES))
            self.pump_read(_day(169), 1, [_profile(1, [_seg(0, 0.6, 40, 7.0, 110)])])
            self.reconcile(_day(170))

        def dose_pair():
            self.pump_read(_day(0), 1, [_profile(1, [_seg(0, 0.6, 40, 7.0, 110)])])
            self.store.upsert_bolus(_dose_rows(_stamps([(40, 7.0, 1, 9), (40, 8.0, 10, 18), (40, 9.0, 19, 60)])))
            self.reconcile(_day(60))

        # Each store, and the ending kinds its reconcile saves, oldest record first.
        scenarios = {
            "pump-read pair": (lambda: (self.pump_read_pair(), self.reconcile(_day(60))),
                               ["superseded", "expired_unreviewed"]),
            "multi-slot Edit": (lambda: (self.basal_edit({1: 10, 3: 10, 5: 20}), self.reconcile(_day(60))),
                                ["superseded", "superseded", "expired_unreviewed"]),
            "dose pair": (dose_pair, ["superseded", "expired_unreviewed"]),
            "reversal": (reversal, ["reverted", None]),
            "later pump read": (later_read, ["expired_unreviewed"] * 4),
        }
        for name, (build, kinds) in scenarios.items():
            saved, slot_reads = {}, {}
            for mode in ("shared", "per record"):
                self.store.close()
                self.store = Store.open(":memory:")
                reads = []
                counted = lambda events, real=wc.basal_slot_regimes: reads.append(1) or real(events)
                fresh = (patch.object(wc, "_reversal_at", lambda store, record, history=None:
                                      per_record(store, record))
                         if mode == "per record" else nullcontext())
                with fresh, patch.object(wc, "basal_slot_regimes", counted):
                    build()
                saved[mode] = json.dumps({kind: self.store.follow_up_records(kind) for kind in ("trial", "plan")}
                                         | {"frontier": self.store.follow_up_frontier()}, sort_keys=True)
                slot_reads[mode] = len(reads)
            with self.subTest(store=name):
                self.assertEqual(saved["shared"], saved["per record"])
                trials = sorted(json.loads(saved["shared"])["trial"], key=lambda r: (r["changed_at"], r["id"]))
                self.assertEqual([record["ending"].get("kind") for record in trials], kinds)
            if name == "multi-slot Edit":
                # Three open basal-slot records: one read of the basal history, not three.
                self.assertEqual(slot_reads["per record"] - slot_reads["shared"], 2)


if __name__ == "__main__":
    unittest.main()
