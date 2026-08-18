"""Basal and ISF/I:C setting-epoch tests (F2).

A setting epoch is the maximal recent stretch over which the *setting an analyzer
reads* held constant — not a single global cut at every profile switch. Basal
setting epochs are read from the dense profileBasalRate feed (every edit and
switch visible over the whole pull); ISF/I:C/target setting epochs are read from
the append-only settings snapshots (edits visible only forward from the first
snapshot).
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.epochs import (
    Epoch,
    basal_epoch,
    basal_slot_epochs,
    dose_setting_epoch,
    effective_window,
    reconcile_epoch,
    setting_epoch,
)
from ciq_autotune.events import BasalEvent, BolusEvent
from ciq_autotune.settings import Snapshot, parse_pump_settings


def _basal(day, hour, minute, programmed, delivered=None):
    return BasalEvent(
        t=datetime(2026, 6, day, hour, minute, 0),
        delivery_type="algorithmDelivery",
        duration_mins=5.0,
        basal_rate=delivered if delivered is not None else programmed,
        profile_basal_rate=programmed,
    )


def _schedule_day(day, rate_at_0):
    """A day of 5-min programmed-rate samples: one rate before 12:00, another
    fixed rate after — so each time-of-day slot has a stable programmed value."""
    evs = []
    for hour in range(0, 24):
        prog = rate_at_0 if hour < 12 else 0.9
        evs.append(_basal(day, hour, 0, prog))
    return evs


def _jittery_day(day, morning_rate, afternoon_rate=0.6):
    """A realistic day: dense 5-min samples with a schedule boundary at noon whose
    *sample* clock drifts a few seconds per day (as the real pump feed does). The
    boundary lands inside the 12:00-12:30 slot, so that slot holds both rates every
    day even though the programmed schedule never changed."""
    evs = []
    drift = timedelta(seconds=13 * day)  # accumulates minutes across days
    base = datetime(2026, 6, day, 0, 0, 0) + drift
    for i in range(288):  # one every 5 min, whole day
        t = base + timedelta(minutes=5 * i)
        tod_min = t.hour * 60 + t.minute
        prog = morning_rate if tod_min < 12 * 60 + 5 else afternoon_rate  # boundary 12:05
        evs.append(BasalEvent(t=t, delivery_type="algorithmDelivery",
                              duration_mins=5.0, basal_rate=prog,
                              profile_basal_rate=prog))
    return evs


def _raw(active_idp=4, isf=30):
    pad = [{"startTime": 0, "basalRate": 0, "isf": 0, "carbRatio": 0, "targetBg": 0}] * 14
    return {
        "profiles": {
            "activeIdp": active_idp,
            "profile": [
                {"name": "4", "idp": 4, "insulinDuration": 300, "carbEntry": 1,
                 "maxBolus": 15000, "tDependentSegs": [
                     {"startTime": 0, "basalRate": 600, "isf": isf, "carbRatio": 7000, "targetBg": 110},
                 ] + pad},
                {"name": "P1", "idp": 0, "insulinDuration": 300, "carbEntry": 1,
                 "maxBolus": 15000, "tDependentSegs": [
                     {"startTime": 0, "basalRate": 1000, "isf": 50, "carbRatio": 9000, "targetBg": 120},
                 ] + pad},
            ],
        },
        "cgmSettings": {},
    }


class BasalSettingEpochTest(unittest.TestCase):
    def test_constant_schedule_has_no_internal_boundary(self):
        evs = _schedule_day(1, 0.6) + _schedule_day(2, 0.6) + _schedule_day(3, 0.6)
        ep = basal_epoch(evs)
        self.assertIsNone(ep.start)  # no change within the data

    def test_schedule_edit_sets_basal_setting_epoch_start(self):
        # Morning rate was 0.6 on day 1, then edited to 0.8 from day 2 on.
        evs = _schedule_day(1, 0.6) + _schedule_day(2, 0.8) + _schedule_day(3, 0.8)
        ep = basal_epoch(evs)
        self.assertIsNotNone(ep.start)
        # Basal setting epoch starts on day 2 (first sample of the new schedule).
        self.assertEqual(ep.start.day, 2)
        self.assertEqual(ep.parameter, "basal_rate")

    def test_daily_time_of_day_variation_is_not_a_change(self):
        # Rate legitimately steps 0.6 -> 0.9 within each day; that is the schedule,
        # not a basal setting-epoch boundary.
        evs = _schedule_day(1, 0.6) + _schedule_day(2, 0.6)
        self.assertIsNone(basal_epoch(evs).start)

    def test_boundary_inside_a_slot_is_not_a_change(self):
        # Real feed: the noon step 1.1 -> 0.6 lands inside the 12:00-12:30 slot on a
        # jittering 5-min sample clock, so that slot holds both rates every day. The
        # schedule never changed, so no basal setting-epoch boundary should be reported.
        evs = []
        for d in range(20, 30):
            evs += _jittery_day(d, morning_rate=1.1)
        per_slot = basal_slot_epochs(evs)
        noon_slot = (12 * 60) // 30  # slot 24 — the one the boundary bisects
        self.assertIsNone(per_slot[noon_slot])
        self.assertIsNone(basal_epoch(evs).start)

    def test_real_edit_still_detected_with_jitter(self):
        # Same jittery feed, but the morning rate is genuinely edited partway through:
        # that must still register as a basal setting-epoch boundary.
        evs = []
        for d in range(20, 25):
            evs += _jittery_day(d, morning_rate=1.1)
        for d in range(25, 30):
            evs += _jittery_day(d, morning_rate=1.4)
        ep = basal_epoch(evs)
        self.assertIsNotNone(ep.start)
        self.assertEqual(ep.start.day, 25)

    def test_per_slot_basal_setting_epochs_only_cut_the_changed_slots(self):
        # Morning (00:00-11:00) edited 0.6 -> 0.8 from day 2; afternoon untouched.
        evs = _schedule_day(1, 0.6) + _schedule_day(2, 0.8) + _schedule_day(3, 0.8)
        per_slot = basal_slot_epochs(evs)
        morning = per_slot[(8 * 60) // 30]    # 08:00 slot — changed
        afternoon = per_slot[(15 * 60) // 30]  # 15:00 slot — unchanged
        self.assertIsNotNone(morning)
        self.assertEqual(morning.day, 2)
        self.assertIsNone(afternoon)           # keeps the full window


class SnapshotSettingEpochTest(unittest.TestCase):
    def _snap(self, day, **kw):
        return Snapshot(captured_at=datetime(2026, 6, day, 9, 0, 0),
                        settings=parse_pump_settings(_raw(**kw)))

    def test_single_snapshot_is_unverified_before_capture(self):
        ep = setting_epoch([self._snap(5)], "isf")
        self.assertIsNone(ep.start)                       # no detected change
        self.assertEqual(ep.unverified_before, datetime(2026, 6, 5, 9, 0, 0))

    def test_in_place_edit_sets_isf_setting_epoch_start(self):
        snaps = [self._snap(1, isf=30), self._snap(5, isf=40)]
        ep = setting_epoch(snaps, "isf")
        self.assertEqual(ep.start, datetime(2026, 6, 5, 9, 0, 0))

    def test_profile_switch_changing_isf_sets_isf_setting_epoch_start(self):
        # idp 4 isf=30; switch to idp 0 (isf=50) changes the *active* isf schedule.
        snaps = [self._snap(1, active_idp=4), self._snap(5, active_idp=0)]
        ep = setting_epoch(snaps, "isf")
        self.assertEqual(ep.start, datetime(2026, 6, 5, 9, 0, 0))

    def test_switch_not_touching_carb_ratio_does_not_set_carb_ratio_setting_epoch_start(self):
        # Both profiles share target_bg? No — they differ (110 vs 120). Use a param
        # that is identical across the switch by making both idps' carbRatio equal.
        snaps = [self._snap(1, active_idp=4), self._snap(5, active_idp=4)]
        ep = setting_epoch(snaps, "carb_ratio")
        self.assertIsNone(ep.start)


class EffectiveWindowTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 6, 30, 0, 0, 0)

    def test_window_is_requested_days_when_basal_setting_epoch_is_wide(self):
        ep = setting_epoch([], "basal_rate")  # empty -> no setting-epoch info
        start, end = effective_window(ep, self.now, requested_days=30)
        self.assertEqual(end, self.now)
        self.assertEqual(start, self.now - timedelta(days=30))

    def test_basal_setting_epoch_caps_the_window(self):
        from ciq_autotune.epochs import Epoch
        ep = Epoch(parameter="basal_rate", start=datetime(2026, 6, 25, 0, 0, 0),
                   unverified_before=None)
        start, end = effective_window(ep, self.now, requested_days=30)
        self.assertEqual(start, datetime(2026, 6, 25, 0, 0, 0))  # cut to basal setting epoch, not 30d

    def test_basal_setting_epoch_wider_than_request_does_not_extend_window(self):
        from ciq_autotune.epochs import Epoch
        ep = Epoch(parameter="basal_rate", start=datetime(2026, 1, 1, 0, 0, 0),
                   unverified_before=None)
        start, end = effective_window(ep, self.now, requested_days=30)
        self.assertEqual(start, self.now - timedelta(days=30))


def _dose(day, hour, isf=None, carb_ratio=None, target_bg=None):
    return BolusEvent(t=datetime(2026, 6, day, hour, 0, 0), isf=isf,
                      carb_ratio=carb_ratio, target_bg=target_bg)


class DoseSettingEpochTest(unittest.TestCase):
    def test_constant_series_verifies_back_to_earliest_dose(self):
        # ISF stamped 30 on every dose across three days -> no change, and constancy
        # is verified back to the earliest observed dose (not merely the first fetch).
        doses = [_dose(3, 8, isf=30), _dose(4, 12, isf=30), _dose(5, 18, isf=30)]
        ep = dose_setting_epoch(doses, "isf")
        self.assertEqual(ep.parameter, "isf")
        self.assertIsNone(ep.start)
        self.assertEqual(ep.unverified_before, datetime(2026, 6, 3, 8, 0, 0))

    def test_change_point_dated_to_the_first_day_at_the_new_value(self):
        # 30 for days 1-5, then 40 for days 6-10 (the 30x99 / 40x17 spread shape):
        # the ISF setting epoch starts at the first dose of day 6.
        doses = []
        for d in range(1, 6):
            doses += [_dose(d, 8, isf=30), _dose(d, 13, isf=30)]
        for d in range(6, 11):
            doses += [_dose(d, 9, isf=40), _dose(d, 19, isf=40)]
        ep = dose_setting_epoch(doses, "isf")
        self.assertEqual(ep.start, datetime(2026, 6, 6, 9, 0, 0))
        self.assertIsNone(ep.unverified_before)

    def test_three_regime_walk_dates_the_most_recent_change(self):
        # The measured 30 -> 36 -> 40 ISF spread (issue #159): only the freshest
        # change (36 -> 40) bounds the current ISF setting epoch; the earlier 30 -> 36 step is
        # older history and does not move `start`.
        doses = []
        for d in range(1, 6):      # 30 for days 1-5
            doses.append(_dose(d, 8, isf=30))
        for d in range(6, 9):      # 36 for days 6-8
            doses.append(_dose(d, 8, isf=36))
        for d in range(9, 13):     # 40 for days 9-12 (current)
            doses.append(_dose(d, 8, isf=40))
        ep = dose_setting_epoch(doses, "isf")
        self.assertEqual(ep.start, datetime(2026, 6, 9, 8, 0, 0))

    def test_per_day_mode_ignores_a_minority_outlier(self):
        # A single odd 40 among 30s on the same day does not register as a change:
        # the day's representative value is its mode (30).
        doses = [_dose(1, 8, isf=30), _dose(2, 8, isf=30), _dose(2, 9, isf=30),
                 _dose(2, 10, isf=40), _dose(3, 8, isf=30)]
        self.assertIsNone(dose_setting_epoch(doses, "isf").start)

    def test_none_and_missing_values_are_ignored(self):
        # Sentinel-nulled doses (phone/Remote ISF=0 -> None) contribute nothing.
        doses = [_dose(1, 8, isf=None), _dose(2, 8, isf=30), _dose(3, 8, isf=None)]
        ep = dose_setting_epoch(doses, "isf")
        self.assertIsNone(ep.start)
        self.assertEqual(ep.unverified_before, datetime(2026, 6, 2, 8, 0, 0))

    def test_empty_series_is_a_noop_carb_ratio_setting_epoch(self):
        ep = dose_setting_epoch([], "carb_ratio")
        self.assertEqual(ep, Epoch("carb_ratio", None, None))

    def test_reads_the_named_parameter(self):
        # carb_ratio changes 5.0 -> 4.0 from day 4 (each regime held >= 2 days so the
        # change is real, not a blip); isf holds constant. Reads the named attribute.
        doses = ([_dose(d, 8, isf=30, carb_ratio=5.0) for d in (1, 2, 3)]
                 + [_dose(d, 8, isf=30, carb_ratio=4.0) for d in (4, 5, 6)])
        self.assertEqual(dose_setting_epoch(doses, "carb_ratio").start,
                         datetime(2026, 6, 4, 8, 0, 0))
        self.assertIsNone(dose_setting_epoch(doses, "isf").start)

    def test_lone_current_day_excursion_is_not_a_change(self):
        # The #159 follow-up failure: carb ratio is a settled 5.0, but the most
        # recent day has a single breakfast dose in the 4.0 segment. One day is
        # not a regime — it must not date a change or collapse the window.
        doses = [_dose(d, 12, carb_ratio=5.0) for d in range(1, 8)]
        doses.append(_dose(8, 8, carb_ratio=4.0))   # lone partial-day breakfast dose
        ep = dose_setting_epoch(doses, "carb_ratio")
        self.assertIsNone(ep.start)
        self.assertEqual(ep.unverified_before, datetime(2026, 6, 1, 12, 0, 0))

    def test_isolated_midseries_blip_is_not_a_change(self):
        # A single day whose bolus mix skewed to a minority segment (4.5), surrounded
        # by the settled 5.0, is debounced away — no spurious change-point.
        doses = [_dose(d, 12, carb_ratio=5.0) for d in (1, 2, 3, 4)]
        doses.append(_dose(5, 8, carb_ratio=4.5))   # one-day blip
        doses += [_dose(d, 12, carb_ratio=5.0) for d in (6, 7, 8)]
        self.assertIsNone(dose_setting_epoch(doses, "carb_ratio").start)

    def test_change_must_persist_two_days_to_be_dated(self):
        # A genuine change that holds >= 2 days IS dated (30 for days 1-5, then 40 for
        # days 6-7): the two-day persistence separates it from a one-day excursion.
        doses = [_dose(d, 8, isf=30) for d in range(1, 6)]
        doses += [_dose(6, 8, isf=40), _dose(7, 8, isf=40)]
        self.assertEqual(dose_setting_epoch(doses, "isf").start,
                         datetime(2026, 6, 6, 8, 0, 0))


class ReconcileSettingEpochTest(unittest.TestCase):
    def _snap_ep(self, start=None, unverified=None):
        return Epoch("isf", start, unverified)

    def test_most_recent_isf_setting_change_wins(self):
        snap = self._snap_ep(start=datetime(2026, 6, 5))
        dose = Epoch("isf", datetime(2026, 6, 3), None)
        self.assertEqual(reconcile_epoch(snap, dose, datetime(2026, 6, 1)).start,
                         datetime(2026, 6, 5))

    def test_dose_change_the_snapshot_missed_sets_isf_setting_epoch_start(self):
        # Forward-only snapshot saw no change; the dose stream dates one 5 days back.
        snap = self._snap_ep(unverified=datetime(2026, 6, 30))
        dose = Epoch("isf", datetime(2026, 6, 25), None)
        ep = reconcile_epoch(snap, dose, datetime(2026, 6, 1))
        self.assertEqual(ep.start, datetime(2026, 6, 25))
        self.assertIsNone(ep.unverified_before)  # a detected change carries no caveat

    def test_constant_dose_series_pushes_caveat_back_to_earliest_dose(self):
        # Snapshot only verifies from day 30; the dose stream verifies from day 15,
        # which is still inside the requested window (starts day 10) -> caveat moves
        # back to day 15 but does not clear.
        snap = self._snap_ep(unverified=datetime(2026, 6, 30))
        dose = Epoch("isf", None, datetime(2026, 6, 15))
        ep = reconcile_epoch(snap, dose, window_start=datetime(2026, 6, 10))
        self.assertIsNone(ep.start)
        self.assertEqual(ep.unverified_before, datetime(2026, 6, 15))

    def test_dose_covering_the_full_window_clears_the_caveat(self):
        # The dose stream is constant back to day 5, before the window start (day 10):
        # the whole analyzable window is dose-verified, so the caveat clears entirely.
        snap = self._snap_ep(unverified=datetime(2026, 6, 30))
        dose = Epoch("isf", None, datetime(2026, 6, 5))
        ep = reconcile_epoch(snap, dose, window_start=datetime(2026, 6, 10))
        self.assertIsNone(ep.start)
        self.assertIsNone(ep.unverified_before)

    def test_empty_dose_setting_epoch_leaves_snapshot_setting_epoch_intact(self):
        snap = self._snap_ep(unverified=datetime(2026, 6, 30))
        dose = Epoch("isf", None, None)
        ep = reconcile_epoch(snap, dose, window_start=datetime(2026, 6, 10))
        self.assertEqual(ep.unverified_before, datetime(2026, 6, 30))


if __name__ == "__main__":
    unittest.main()
