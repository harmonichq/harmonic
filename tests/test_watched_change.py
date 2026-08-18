"""Trial + Focus — the single active watched change (#244, ADR 0029).

A Trial is derived-live from the setting-change epoch (never stored); a Focus is the
one persisted object (a hand-pinned behavioral lever). At most one is active at a
time — Trial XOR Focus, pump wins. These tests exercise trial detection + the
param→existing-series target mapping, the Maturing gate, the revert-vs-third-value
rule, the Focus view derivation, and the one-active invariant in both directions.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading
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
        t = wc.detect_trial([], bolus, [], now=_day(8), window_days=14)
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
        t = wc.detect_trial([], bolus, [], now=_day(8), window_days=14)
        self.assertEqual(t.parameter, "carb_ratio")
        self.assertEqual(t.target_metrics, ["arc"])

    def test_target_change_maps_to_tir(self):
        bolus = ([_bolus(d, isf=30, ic=7.0, target=110) for d in range(1, 5)]
                 + [_bolus(d, isf=30, ic=7.0, target=100) for d in range(5, 9)])
        t = wc.detect_trial([], bolus, [], now=_day(8), window_days=14)
        self.assertEqual(t.parameter, "target_bg")
        self.assertEqual(t.target_metrics, ["tir"])

    def test_basal_change_maps_to_tbr(self):
        basal = _basal_days([(0.6, 1, 4), (0.8, 5, 8)])
        t = wc.detect_trial(basal, [], [], now=_day(8), window_days=14)
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
        t = wc.detect_trial(basal, bolus, [], now=_day(8), window_days=14)
        self.assertEqual(t.parameter, "profile")
        self.assertEqual(t.target_metrics, ["tir", "arc"])
        self.assertIsNone(t.before)
        self.assertIsNone(t.after)

    def test_no_change_no_trial(self):
        bolus = _isf_boluses([(30, 1, 8)])
        self.assertIsNone(wc.detect_trial([], bolus, [], now=_day(8), window_days=14))

    def test_stale_change_outside_watch_horizon_is_not_a_trial(self):
        # A change 40 days before `now` (> 2× the 14d window) has long matured and
        # is no longer a watched change.
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 40)])
        self.assertIsNone(wc.detect_trial([], bolus, [], now=_day(60), window_days=14))


class MaturingTest(unittest.TestCase):
    def test_recent_change_is_maturing(self):
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])
        cgm = _cgm_days(1, 8)  # only a few post-change data-days
        t = wc.detect_trial([], bolus, [], now=_day(8), window_days=14,
                            cgm_readings=cgm)
        self.assertTrue(t.maturing.is_maturing)
        self.assertGreaterEqual(t.maturing.days_elapsed, 1)
        self.assertLess(t.maturing.days_elapsed, 14)
        self.assertEqual(t.maturing.days_required, 14)

    def test_matured_change_is_not_maturing(self):
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 24)])
        cgm = _cgm_days(5, 24)  # >14 distinct post-change data-days
        t = wc.detect_trial([], bolus, [], now=_day(24), window_days=14,
                            cgm_readings=cgm)
        self.assertFalse(t.maturing.is_maturing)
        self.assertGreaterEqual(t.maturing.days_elapsed, 14)

    def test_no_target_data_keeps_it_maturing_despite_calendar(self):
        # An ISF change 30 calendar days old but with NO post-change CGM stays
        # maturing — the gate is data accrual, not the wall clock (ADR 0029 §6).
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])
        t = wc.detect_trial([], bolus, [], now=_day(20), window_days=14,
                            cgm_readings=[])
        self.assertTrue(t.maturing.is_maturing)
        self.assertEqual(t.maturing.days_elapsed, 0)

    def test_arc_target_matures_on_meal_days_not_cgm(self):
        # I:C change → target `arc`, which accrues on post-meal days. CGM presence is
        # irrelevant; the meal boluses that carry the I:C are themselves the data.
        bolus = ([_bolus(d, isf=30, ic=8.0, target=110) for d in range(1, 5)]
                 + [_bolus(d, isf=30, ic=6.0, target=110) for d in range(5, 9)])
        t = wc.detect_trial([], bolus, [], now=_day(8), window_days=14,
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
        self.assertIsNone(wc.detect_trial([], bolus, [], now=_day(12), window_days=14))

    def test_third_value_creates_new_trial(self):
        # 30 → 45 → 60: a third value is a genuine new trial (45 → 60).
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8), (60, 9, 12)])
        t = wc.detect_trial([], bolus, [], now=_day(12), window_days=14)
        self.assertIsNotNone(t)
        self.assertEqual(t.parameter, "isf")
        self.assertEqual(t.before, 45.0)
        self.assertEqual(t.after, 60.0)

    def test_revert_after_maturing_is_a_new_trial(self):
        # Walk-back long AFTER the change matured is a deliberate new change, watched.
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8), (30, 30, 33)])
        t = wc.detect_trial([], bolus, [], now=_day(33), window_days=14)
        self.assertIsNotNone(t)
        self.assertEqual(t.before, 45.0)
        self.assertEqual(t.after, 30.0)

    def test_revert_on_one_param_does_not_hide_a_live_trial_on_another(self):
        # ISF reverted (newest change) but a genuine, slightly-earlier basal trial is
        # still live: fall through to the basal Trial, don't blank the payload.
        isf = _isf_boluses([(30, 1, 4), (45, 5, 8), (30, 9, 12)])  # reverted at day 9
        basal = _basal_days([(0.6, 1, 6), (0.8, 7, 12)])           # basal changed day 7
        t = wc.detect_trial(basal, isf, [], now=_day(12), window_days=14)
        self.assertIsNotNone(t)
        self.assertEqual(t.parameter, "basal_rate")
        self.assertEqual(t.target_metrics, ["tbr"])


class FocusViewTest(unittest.TestCase):
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

    def tearDown(self):
        self.store.close()

    def test_focus_surfaces_when_no_trial(self):
        self.store.pin_focus("late_bolus", "2026-05-06 08:00:00")
        active = wc.active_watched_change(
            self.store, [], [], [], now=_day(10), window_days=14)
        self.assertEqual(active.kind, "focus")
        self.assertEqual(active.lever, "late_bolus")

    def test_removed_lever_focus_is_dropped_instead_of_breaking_verify(self):
        self.store.pin_focus(
            "overnight_low_from_evening_dosing", "2026-05-06 08:00:00"
        )
        active = wc.active_watched_change(
            self.store, [], [], [], now=_day(10), window_days=14
        )
        self.assertIsNone(active)
        self.assertIsNone(self.store.active_focus())
        self.assertEqual(self.store.list_focuses()[0]["status"], "dropped")

    def test_setting_change_preempts_and_drops_focus(self):
        self.store.pin_focus("late_bolus", "2026-05-06 08:00:00")
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])  # change at day 5
        active = wc.active_watched_change(
            self.store, [], bolus, [], now=_day(8), window_days=14)
        # Trial takes the slot; the Focus is dropped (not paused), not surfaced.
        self.assertEqual(active.kind, "trial")
        self.assertIsNone(self.store.active_focus())
        self.assertEqual(self.store.list_focuses()[0]["status"], "dropped")

    def test_trial_active_blocks_a_pin(self):
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])
        self.assertTrue(wc.trial_is_active(
            self.store, bolus_events=bolus, now=_day(8), window_days=14))
        # No change → no trial → a pin would be allowed.
        self.assertFalse(wc.trial_is_active(
            self.store, bolus_events=[], now=_day(8), window_days=14))

    def test_nothing_watched_returns_none(self):
        self.assertIsNone(wc.active_watched_change(
            self.store, [], [], [], now=_day(8), window_days=14))


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
        t = wc.detect_trial([], bolus, snaps, now=_day(8), window_days=14)
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
        t = wc.detect_trial([], bolus, snaps, now=_day(8), window_days=14)
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
        t = wc.detect_trial(basal, [], snaps, now=_day(8), window_days=14)
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
        t = wc.detect_trial(basal, bolus, snaps, now=_day(8), window_days=14)
        self.assertEqual(t.parameter, "profile")
        self.assertEqual(t.target_metrics, ["tir", "arc"])

    def test_switch_with_missing_outgoing_profile_falls_back_to_whole_profile(self):
        # The outgoing profile (idp 1) is gone from the post-switch snapshot.
        p_in = _profile(2, [_seg(0, 0.6, 36, 5.0, 110)])
        snaps = [_snap(4, 1, [_profile(1, [_seg(0, 0.6, 40, 5.0, 110)]), p_in]),
                 _snap(5, 2, [p_in])]
        bolus = ([_bolus(d, isf=40, ic=5.0, target=110) for d in range(1, 5)]
                 + [_bolus(d, isf=36, ic=5.0, target=110) for d in range(5, 9)])
        t = wc.detect_trial([], bolus, snaps, now=_day(8), window_days=14)
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
                            now=_day(5) + timedelta(hours=12), window_days=14)
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
        t1 = wc.detect_trial([], one_day, snaps, now=_day(6), window_days=14)
        self.assertEqual(t1.parameter, "carb_ratio")
        self.assertEqual(t1.maturing.days_elapsed, 1)
        two_days = one_day + [_bolus(6, isf=40, ic=5.7, target=110, hour=12)]
        t2 = wc.detect_trial([], two_days, snaps, now=_day(7), window_days=14)
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
            [], bolus, snaps, now=_day(10) + timedelta(hours=13), window_days=14
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
                            now=_day(5) + timedelta(hours=12), window_days=14)
        self.assertIsNone(t)

    def test_whole_parameter_carb_ratio_change_still_opens_a_trial(self):
        # The other half of the fallback: only the BLOCK-scoped case is suppressed.
        # A whole-day carb-ratio change is still watched exactly as before.
        bolus = ([_bolus(d, isf=40, ic=5.4, target=110, hour=12) for d in range(1, 5)]
                 + [_bolus(d, isf=40, ic=5.7, target=110, hour=12) for d in range(7, 11)])
        t = wc.detect_trial([], bolus, [], now=_day(10) + timedelta(hours=13),
                            window_days=14)
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
            [], bolus, snaps, now=_day(39) + timedelta(hours=13), window_days=14
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
            [], bolus, snaps, now=_day(14) + timedelta(hours=13), window_days=14
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
            [], bolus, snaps, now=_day(14) + timedelta(hours=13), window_days=14
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
        t = wc.detect_trial([], [], snaps, now=_day(6), window_days=14)
        self.assertEqual(t.parameter, "profile")
        self.assertEqual(t.target_metrics, ["tir", "arc"])

    def test_missing_outgoing_profile_with_no_doses_is_whole_profile(self):
        p_in = _profile(6, [_seg(0, 0.6, 36, 5.4, 110)])
        snaps = [_snap(4, 5, [_profile(5, [_seg(0, 0.6, 40, 5.4, 110)]), p_in]),
                 _snap(5, 6, [p_in])]
        t = wc.detect_trial([], [], snaps, now=_day(6), window_days=14)
        self.assertEqual(t.parameter, "profile")

    def test_exact_switch_back_in_window_is_closed_not_a_second_trial(self):
        p_out = _profile(5, [_seg(0, 0.6, 40, 5.4, 110), _seg(720, 0.6, 40, 5.4, 110)])
        p_in = _profile(6, [_seg(0, 0.6, 40, 5.4, 110), _seg(720, 0.6, 40, 5.7, 110)])
        snaps = [_snap(4, 5, [p_out, p_in]), _snap(5, 6, [p_out, p_in]),
                 _snap(8, 5, [p_out, p_in])]
        self.assertIsNone(wc.detect_trial([], [], snaps, now=_day(9), window_days=14))


if __name__ == "__main__":
    unittest.main()
