"""Tests for the PumpSettings parser and the snapshot-diff change-log (F1).

The parser turns the raw ``lastUpload.settings`` dict (confirmed live: basalRate
and carbRatio are milliunits, isf/targetBg whole, insulinDuration minutes, and
tDependentSegs is zero-padded to 16 entries) into typed, unit-correct values.
The change-log manufactures the settings-change event Tandem never emits, by
diffing successive append-only snapshots per IDP.
"""

import unittest
from datetime import datetime

from ciq_autotune.settings import (
    PumpSettings,
    Snapshot,
    active_schedule,
    changelog,
    effective_isf,
    parse_pump_settings,
    parse_sleep_schedules,
    programmed_ic_range,
)


class _Estimate:
    def __init__(self, value):
        self.value = value


class _IsfRow:
    def __init__(self, value):
        self.estimate = _Estimate(value)


def _seg(start, basal_mu, isf, cr_mu, target):
    return {"startTime": start, "basalRate": basal_mu, "isf": isf,
            "carbRatio": cr_mu, "targetBg": target}


# A realistic snapshot shaped like the live one: 4 real segments padded to 16.
def _raw(active_idp=4, isf=30):
    real = [
        _seg(0, 600, isf, 7000, 110),
        _seg(300, 720, isf, 5000, 110),
        _seg(540, 1100, isf, 5000, 110),
        _seg(720, 600, isf, 5000, 110),
    ]
    pad = [_seg(0, 0, 0, 0, 0)] * 12
    return {
        "profiles": {
            "activeIdp": active_idp,
            "profile": [
                {"name": "4", "idp": 4, "insulinDuration": 300, "carbEntry": 1,
                 "maxBolus": 15000, "tDependentSegs": real + pad},
                {"name": "P1", "idp": 0, "insulinDuration": 300, "carbEntry": 1,
                 "maxBolus": 18000, "tDependentSegs": [_seg(0, 1000, 28, 6000, 100)] + pad},
            ],
        },
        "cgmSettings": {},
    }


# The live controlIqSettings blob (verbatim shape): one enabled all-week sleep
# schedule 23:00 -> 09:00, plus three disabled slots.
_CIQ = {
    "controlIqSettings": {
        "sleepSchedule0": {
            "activeDays": ["Monday", "Tuesday", "Wednesday", "Thursday",
                           "Friday", "Saturday", "Sunday"],
            "startTime": 1380, "enabled": True, "endTime": 540,
        },
        "sleepSchedule1": {"activeDays": [], "startTime": 1380, "enabled": False, "endTime": 420},
        "sleepSchedule2": {"activeDays": [], "startTime": 1380, "enabled": False, "endTime": 420},
        "sleepSchedule3": {"activeDays": [], "startTime": 1380, "enabled": False, "endTime": 420},
    }
}


class SleepScheduleTest(unittest.TestCase):
    def test_parses_enabled_schedule_only(self):
        scheds = parse_sleep_schedules(_CIQ)
        self.assertEqual(len(scheds), 1)                      # 3 disabled dropped
        s = scheds[0]
        self.assertEqual(s.start_min, 1380)                  # 23:00, verbatim minutes
        self.assertEqual(s.end_min, 540)                     # 09:00
        self.assertEqual(s.active_days, (0, 1, 2, 3, 4, 5, 6))  # Mon..Sun

    def test_disabled_or_dayless_paints_nothing(self):
        raw = {"controlIqSettings": {
            "sleepSchedule0": {"activeDays": ["Monday"], "startTime": 1380, "enabled": False, "endTime": 540},
            "sleepSchedule1": {"activeDays": [], "startTime": 1380, "enabled": True, "endTime": 540},
        }}
        self.assertEqual(parse_sleep_schedules(raw), ())

    def test_missing_control_iq_is_empty(self):
        self.assertEqual(parse_sleep_schedules({"profiles": {}}), ())

    def test_pump_settings_carries_schedules(self):
        raw = dict(_raw())
        raw.update(_CIQ)
        s = parse_pump_settings(raw)
        self.assertEqual(len(s.sleep_schedules), 1)
        self.assertEqual(s.sleep_schedules[0].start_min, 1380)


class ParsePumpSettingsTest(unittest.TestCase):
    def setUp(self):
        self.s = parse_pump_settings(_raw())

    def test_returns_pump_settings(self):
        self.assertIsInstance(self.s, PumpSettings)
        self.assertEqual(self.s.active_idp, 4)

    def test_unit_conversions_on_active_profile(self):
        prof = self.s.active()
        self.assertEqual(prof.idp, 4)
        self.assertEqual(prof.name, "4")
        self.assertEqual(prof.dia_min, 300)
        self.assertAlmostEqual(prof.dia_hours, 5.0)
        self.assertTrue(prof.carb_entry)
        self.assertAlmostEqual(prof.max_bolus, 15.0)        # 15000 mU -> 15 U
        seg0 = prof.segments[0]
        self.assertEqual(seg0.start_min, 0)
        self.assertAlmostEqual(seg0.basal_rate, 0.6)        # 600 mU -> 0.6 U/h
        self.assertEqual(seg0.isf, 30)                       # whole mg/dL per U
        self.assertAlmostEqual(seg0.carb_ratio, 7.0)        # 7000 mU -> 7.0 g/U
        self.assertEqual(seg0.target_bg, 110)

    def test_skip_segments_filtered(self):
        # 4 real segments survive; the 12 zero-pad rows are dropped.
        self.assertEqual(len(self.s.active().segments), 4)

    def test_segments_sorted_by_start(self):
        starts = [s.start_min for s in self.s.active().segments]
        self.assertEqual(starts, sorted(starts))
        self.assertEqual(starts, [0, 300, 540, 720])

    def test_by_idp_lookup(self):
        self.assertEqual(self.s.by_idp(0).name, "P1")
        self.assertIsNone(self.s.by_idp(99))

    def test_schedule_for_active_parameter(self):
        # The active profile's isf schedule: list of (start_min, value).
        self.assertEqual(
            self.s.active_schedule("isf"),
            [(0, 30), (300, 30), (540, 30), (720, 30)],
        )


class ChangelogTest(unittest.TestCase):
    def _snap(self, t, **kw):
        return Snapshot(captured_at=datetime(2026, 6, t, 9, 0, 0),
                        settings=parse_pump_settings(_raw(**kw)))

    def test_no_change_between_identical_snapshots(self):
        snaps = [self._snap(1), self._snap(2)]
        self.assertEqual(changelog(snaps), [])

    def test_in_place_isf_edit_is_detected(self):
        # idp 4's isf moves 30 -> 35 in place (no Tandem event for this).
        snaps = [self._snap(1, isf=30), self._snap(2, isf=35)]
        changes = changelog(snaps)
        isf_changes = [c for c in changes if c.parameter == "isf" and c.idp == 4]
        self.assertEqual(len(isf_changes), 1)
        c = isf_changes[0]
        self.assertEqual(c.at, datetime(2026, 6, 2, 9, 0, 0))
        self.assertEqual(c.new_schedule[0], (0, 35))
        self.assertEqual(c.old_schedule[0], (0, 30))

    def test_profile_switch_is_detected(self):
        snaps = [self._snap(1, active_idp=4), self._snap(2, active_idp=0)]
        switches = [c for c in changelog(snaps) if c.parameter == "active_idp"]
        self.assertEqual(len(switches), 1)
        self.assertEqual(switches[0].old_schedule, 4)
        self.assertEqual(switches[0].new_schedule, 0)

    def test_changelog_is_forward_only_timestamped_to_capture(self):
        snaps = [self._snap(1, isf=30), self._snap(2, isf=30), self._snap(3, isf=40)]
        isf = [c for c in changelog(snaps) if c.parameter == "isf" and c.idp == 4]
        self.assertEqual([c.at for c in isf], [datetime(2026, 6, 3, 9, 0, 0)])


class EffectiveSettingsTest(unittest.TestCase):
    """The single-place effective-settings read (#105)."""

    def _snap(self, **kw):
        return Snapshot(captured_at=datetime(2026, 6, 1, 9, 0, 0),
                        settings=parse_pump_settings(_raw(**kw)))

    # --- active_schedule -------------------------------------------------
    def test_active_schedule_empty_when_no_snapshot(self):
        self.assertEqual(active_schedule([], "isf"), [])

    def test_active_schedule_reads_latest_snapshot(self):
        # Two snapshots; the read takes the newest (isf 40, not 30).
        snaps = [self._snap(isf=30), self._snap(isf=40)]
        self.assertEqual(
            active_schedule(snaps, "isf"),
            [(0, 40.0), (300, 40.0), (540, 40.0), (720, 40.0)],
        )

    # --- effective_isf: measured -> programmed median -> None ------------
    def test_effective_isf_prefers_measured(self):
        # A measured ISF row wins over the programmed schedule (30).
        snaps = [self._snap(isf=30)]
        self.assertEqual(effective_isf([_IsfRow(42.0)], snaps), 42.0)

    def test_effective_isf_falls_back_to_programmed_median(self):
        # No measured value -> median of the active isf schedule (all 30).
        snaps = [self._snap(isf=30)]
        self.assertEqual(effective_isf([_IsfRow(None)], snaps), 30.0)
        self.assertEqual(effective_isf([], snaps), 30.0)

    def test_effective_isf_none_without_snapshot(self):
        self.assertIsNone(effective_isf([], []))
        self.assertIsNone(effective_isf([_IsfRow(None)], []))

    # --- programmed_ic_range: honest active-schedule bounds -> None ------
    def test_programmed_ic_range_keeps_real_schedule_bounds(self):
        # carb_ratio milliunits 7000/5000/5000/5000 -> 7/5/5/5 g/U.
        self.assertEqual(programmed_ic_range([self._snap()]), (5.0, 7.0))

    def test_programmed_ic_range_none_without_snapshot(self):
        self.assertIsNone(programmed_ic_range([]))


if __name__ == "__main__":
    unittest.main()
