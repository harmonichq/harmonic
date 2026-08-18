"""Tests for ciq_autotune.timeline — the raw event-stream slice behind the
Daily report's ECharts treatment timeline (#14)."""

import unittest
from datetime import datetime, timedelta, timezone

from ciq_autotune.events import CarbEntry
from ciq_autotune.settings import SleepSchedule
from ciq_autotune.store import Store
from ciq_autotune.timeline import sleep_windows, timeline

# Enabled 23:00 -> 09:00 every day, matching the live controlIqSettings blob.
_ALL_WEEK = SleepSchedule(start_min=1380, end_min=540, active_days=tuple(range(7)))


class SleepWindowsTest(unittest.TestCase):
    def test_overnight_window_wraps_past_midnight(self):
        # 2026-06-16 is a Tuesday. The band for the night starting the 16th runs
        # 23:00 on the 16th to 09:00 on the 17th — not a 23:00->09:00 daytime block.
        wins = sleep_windows([_ALL_WEEK], datetime(2026, 6, 16, 12, 0),
                             datetime(2026, 6, 17, 12, 0))
        self.assertIn((datetime(2026, 6, 16, 23, 0), datetime(2026, 6, 17, 9, 0)), wins)

    def test_clipped_to_single_day_panel(self):
        # A one-day panel [00:00, 24:00) sees two pieces: the tail of the previous
        # night (00:00-09:00) and the head of tonight (23:00-24:00).
        wins = sleep_windows([_ALL_WEEK], datetime(2026, 6, 16, 0, 0),
                             datetime(2026, 6, 17, 0, 0))
        self.assertEqual(wins, [
            (datetime(2026, 6, 16, 0, 0), datetime(2026, 6, 16, 9, 0)),
            (datetime(2026, 6, 16, 23, 0), datetime(2026, 6, 17, 0, 0)),
        ])

    def test_inactive_weekday_paints_no_band(self):
        # Only active on Monday (weekday 0); a Wednesday panel gets nothing.
        mon_only = SleepSchedule(start_min=1380, end_min=540, active_days=(0,))
        wins = sleep_windows([mon_only], datetime(2026, 6, 17, 0, 0),  # Wed
                             datetime(2026, 6, 18, 0, 0))
        self.assertEqual(wins, [])

    def test_no_schedules_is_empty(self):
        self.assertEqual(sleep_windows([], datetime(2026, 6, 16), datetime(2026, 6, 17)), [])


class TimelineTest(unittest.TestCase):
    def setUp(self):
        self.store = Store.open(":memory:")
        self.addCleanup(self.store.close)
        self.store.upsert_cgm([
            {"EventDateTime": "2026-06-10T07:55:00", "Readings (CGM / BGM)": 65, "Description": "EGV"},
            {"EventDateTime": "2026-06-10T08:00:00", "Readings (CGM / BGM)": 120, "Description": "EGV"},
            {"EventDateTime": "2026-06-10T08:05:00", "Readings (CGM / BGM)": 190, "Description": "EGV"},
            # Outside the window — must not appear.
            {"EventDateTime": "2026-06-11T08:00:00", "Readings (CGM / BGM)": 100, "Description": "EGV"},
        ])
        self.store.upsert_bolus([
            {"seq_num": 1, "request_time": "2026-06-10 08:00:00-04:00", "description": "Standard",
             "insulin": "2.5", "requested_insulin": "2.5", "carbs": "30", "bg": "120",
             "user_override": "0", "extended_bolus": "0", "completion": "Completed",
             "completion_time": "2026-06-10 08:00:30-04:00"},
        ])
        self.store.upsert_basal([
            {"seq_num": 1, "time": "2026-06-10 08:00:00", "delivery_type": "algorithmDelivery",
             "duration_mins": 5, "basal_rate": 0.8, "profile_basal_rate": 0.6},
        ])
        self.store.upsert_pump([
            {"seq_num": 1, "time": "2026-06-10 23:00:00", "event_type": "Sleep", "duration_mins": 420},
        ])

    def test_returns_events_within_window_only(self):
        result = timeline(self.store, datetime(2026, 6, 10, 0, 0, 0), datetime(2026, 6, 11, 0, 0, 0))
        self.assertEqual(result["start"], "2026-06-10 00:00:00")
        self.assertEqual(result["end"], "2026-06-11 00:00:00")
        self.assertEqual(len(result["cgm"]), 3)
        self.assertEqual(result["cgm"][0], {"t": "2026-06-10 07:55:00", "bg": 65})

    def test_boluses_shaped_with_dose_and_carbs(self):
        result = timeline(self.store, datetime(2026, 6, 10, 0, 0, 0), datetime(2026, 6, 11, 0, 0, 0))
        # -04:00 bolus converts to UTC: 08:00 -04:00 = 12:00 UTC.
        self.assertEqual(result["boluses"], [
            {"t": "2026-06-10 12:00:00", "insulin": 2.5, "carbs": 30.0, "bg": 120.0, "extended": False},
        ])

    def test_carb_markers_come_from_bolus_attached_carbs(self):
        # Carb icons on the chart are sourced from bolus_events.carbs (ADR 0003).
        # The timeline no longer returns a standalone carbs array.
        result = timeline(self.store, datetime(2026, 6, 10, 0, 0, 0), datetime(2026, 6, 11, 0, 0, 0))
        self.assertNotIn("carbs", result)
        # The bolus row carries the carbs directly.
        boluses_with_carbs = [b for b in result["boluses"] if b.get("carbs")]
        self.assertEqual(len(boluses_with_carbs), 1)
        self.assertEqual(boluses_with_carbs[0]["carbs"], 30.0)

    def test_basal_includes_delivered_and_programmed_rate(self):
        result = timeline(self.store, datetime(2026, 6, 10, 0, 0, 0), datetime(2026, 6, 11, 0, 0, 0))
        self.assertEqual(result["basal"], [{
            "t": "2026-06-10 08:00:00", "delivery_type": "algorithmDelivery",
            "duration_mins": 5.0, "basal_rate": 0.8, "profile_basal_rate": 0.6,
        }])

    def test_pump_events_included_for_sleep_exercise_bars(self):
        result = timeline(self.store, datetime(2026, 6, 10, 0, 0, 0), datetime(2026, 6, 11, 0, 0, 0))
        self.assertEqual(result["pump_events"], [
            {"t": "2026-06-10 23:00:00", "event_type": "Sleep", "duration_mins": 420.0},
        ])

    def test_sleep_windows_from_stored_schedule_round_trip(self):
        # Persist a snapshot carrying the CIQ sleep schedule, then confirm the
        # timeline derives the band from it (survives the store round-trip).
        from ciq_autotune.settings import parse_pump_settings
        seg = {"startTime": 0, "basalRate": 600, "isf": 30, "carbRatio": 7000, "targetBg": 110}
        raw = {"profiles": {"activeIdp": 4, "profile": [
                   {"name": "4", "idp": 4, "insulinDuration": 300, "carbEntry": 1,
                    "maxBolus": 15000, "tDependentSegs": [seg]}]},
               "controlIqSettings": {"sleepSchedule0": {
                   "activeDays": ["Wednesday"], "startTime": 1380,
                   "enabled": True, "endTime": 540}}}
        self.store.upsert_settings_snapshot("2026-06-17 12:00:00",
                                            parse_pump_settings(raw))
        # 2026-06-17 is a Wednesday: band starts 23:00 that night into the 18th.
        result = timeline(self.store, datetime(2026, 6, 17, 12, 0),
                          datetime(2026, 6, 18, 12, 0))
        self.assertEqual(result["sleep_windows"], [
            {"start": "2026-06-17 23:00:00", "end": "2026-06-18 09:00:00"},
        ])

    def test_narrow_window_for_occurrence_zoom(self):
        result = timeline(self.store, datetime(2026, 6, 10, 7, 50, 0), datetime(2026, 6, 10, 8, 2, 0))
        self.assertEqual(len(result["cgm"]), 2)

    def test_tz_aware_bounds_are_treated_as_wall_clock_not_converted(self):
        # An offset-aware datetime (e.g. from FastAPI parsing a query param
        # with a "Z"/"+00:00" suffix) must keep its literal wall-clock digits,
        # like every other read path in store.py — not get UTC-shifted.
        tz_start = datetime(2026, 6, 10, 0, 0, 0, tzinfo=timezone(timedelta(hours=-4)))
        tz_end = datetime(2026, 6, 11, 0, 0, 0, tzinfo=timezone(timedelta(hours=-4)))
        result = timeline(self.store, tz_start, tz_end)
        self.assertEqual(result["start"], "2026-06-10 00:00:00")
        self.assertEqual(result["end"], "2026-06-11 00:00:00")
        self.assertEqual(len(result["cgm"]), 3)

    def test_rest_windows_key_always_present(self):
        result = timeline(self.store, datetime(2026, 6, 10, 0, 0), datetime(2026, 6, 11, 0, 0))
        self.assertIn("rest_windows", result)
        self.assertIsInstance(result["rest_windows"], list)

    def test_carb_exclusion_spans_key_always_present(self):
        result = timeline(self.store, datetime(2026, 6, 10, 0, 0), datetime(2026, 6, 11, 0, 0))
        self.assertIn("carb_exclusion_spans", result)
        self.assertIsInstance(result["carb_exclusion_spans"], list)


class CarbExclusionSpansTimelineTest(unittest.TestCase):
    """carb_exclusion_spans emitted by timeline() — wiring and clamping."""

    def setUp(self):
        self.store = Store.open(":memory:")
        self.addCleanup(self.store.close)

    def test_rescue_carb_during_rest_window_produces_exclusion_span(self):
        # A manual 8g rescue carb at 03:00 inside the fasting window should
        # produce a carb_exclusion_spans entry covering that entry forward.
        self.store.upsert_carb_entry(CarbEntry(
            t=datetime(2026, 6, 11, 3, 0), grams=8.0, certainty="exact",
            source="manual", note=None,
        ))
        result = timeline(
            self.store,
            datetime(2026, 6, 11, 0, 0),
            datetime(2026, 6, 12, 0, 0),
        )
        spans = result["carb_exclusion_spans"]
        self.assertEqual(len(spans), 1)
        self.assertEqual(spans[0]["start"], "2026-06-11 03:00:00")
        # 8g / 40 g/h * 60 min = 12 min cob_clear + onset(15) + guard(45) = 72 min
        self.assertEqual(spans[0]["end"], "2026-06-11 04:12:00")

    def test_exclusion_span_clamped_to_requested_window(self):
        # An entry at 23:30 with a 300-min (null-gram) span extends past midnight;
        # the emitted end must be clamped to the day boundary.
        self.store.upsert_carb_entry(CarbEntry(
            t=datetime(2026, 6, 11, 23, 30), grams=None, certainty="unknown",
            source="manual", note=None,
        ))
        result = timeline(
            self.store,
            datetime(2026, 6, 11, 0, 0),
            datetime(2026, 6, 12, 0, 0),
        )
        spans = result["carb_exclusion_spans"]
        self.assertEqual(len(spans), 1)
        self.assertEqual(spans[0]["start"], "2026-06-11 23:30:00")
        self.assertEqual(spans[0]["end"], "2026-06-12 00:00:00")

    def test_no_carb_entries_emits_empty_list(self):
        result = timeline(
            self.store,
            datetime(2026, 6, 11, 0, 0),
            datetime(2026, 6, 12, 0, 0),
        )
        self.assertEqual(result["carb_exclusion_spans"], [])


class RestWindowsTimelineTest(unittest.TestCase):
    """rest_windows array wired into timeline() — detection + shape."""

    def setUp(self):
        self.store = Store.open(":memory:")
        self.addCleanup(self.store.close)
        # Dinner bolus (with carbs) — spine anchor before rest.
        self.store.upsert_bolus([
            {"seq_num": 1, "request_time": "2026-06-10 20:00:00", "description": "Standard",
             "insulin": "3.0", "requested_insulin": "3.0", "carbs": "60", "bg": "140",
             "user_override": "0", "extended_bolus": "0", "completion": "Completed",
             "completion_time": "2026-06-10 20:00:30"},
            # Breakfast bolus — spine anchor after rest.
            {"seq_num": 2, "request_time": "2026-06-11 09:00:00", "description": "Standard",
             "insulin": "2.0", "requested_insulin": "2.0", "carbs": "45", "bg": "110",
             "user_override": "0", "extended_bolus": "0", "completion": "Completed",
             "completion_time": "2026-06-11 09:00:30"},
        ])
        # Dense overnight CGM 22:00 → 08:00 (97 readings at 5-min spacing).
        cgm_rows = []
        t = datetime(2026, 6, 10, 22, 0, 0)
        while t <= datetime(2026, 6, 11, 8, 0, 0):
            cgm_rows.append({"EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
                              "Readings (CGM / BGM)": 110, "Description": "EGV"})
            t += timedelta(minutes=5)
        self.store.upsert_cgm(cgm_rows)

    def test_rest_window_detected_and_shaped(self):
        # Query spans dinner → breakfast so detect_rest_windows sees both anchors.
        result = timeline(self.store,
                          datetime(2026, 6, 10, 0, 0), datetime(2026, 6, 11, 12, 0))
        self.assertEqual(len(result["rest_windows"]), 1)
        w = result["rest_windows"][0]
        self.assertEqual(w["start"], "2026-06-10 22:00:00")
        self.assertEqual(w["end"], "2026-06-11 08:00:00")

    def test_rest_window_shape_matches_sleep_window_schema(self):
        result = timeline(self.store,
                          datetime(2026, 6, 10, 0, 0), datetime(2026, 6, 11, 12, 0))
        for w in result["rest_windows"]:
            self.assertEqual(set(w.keys()), {"start", "end"})

    def test_single_day_slice_still_yields_overnight_rest_window(self):
        # Regression for #147 (broke in #136): the Daily report fetches exactly
        # one calendar day. The overnight fast visible on the 11th's morning is
        # anchored on the *evening of the 10th* (22:00 → 08:00 envelope), which a
        # 00:00–24:00 fetch of the 11th never contains. timeline() must pad the
        # detector's input beyond the returned span so the band still appears.
        result = timeline(self.store,
                          datetime(2026, 6, 11, 0, 0), datetime(2026, 6, 12, 0, 0))
        # Returned event series stay clamped to the requested day (the padded
        # slice is detector-only) — no prior-evening dinner bolus leaks in.
        self.assertEqual(result["start"], "2026-06-11 00:00:00")
        self.assertEqual(result["end"], "2026-06-12 00:00:00")
        # Only the 11th's breakfast bolus — the prior-evening dinner used as the
        # detector's evening anchor must NOT leak onto the chart.
        self.assertEqual([b["t"] for b in result["boluses"]],
                         ["2026-06-11 09:00:00"])
        # ...yet the overnight rest window is detected and covers the morning
        # portion visible on the panel (00:00–08:00 on the 11th).
        self.assertEqual(len(result["rest_windows"]), 1)
        w = result["rest_windows"][0]
        self.assertEqual(w["start"], "2026-06-10 22:00:00")
        self.assertEqual(w["end"], "2026-06-11 08:00:00")


class HoistedInputsTest(unittest.TestCase):
    """#426: the window-invariant inputs (false-low records + settings snapshots)
    may be passed in pre-computed; the output must be byte-identical to computing
    them in-line, and the per-window clamp of the hoisted records still runs."""

    def setUp(self):
        self.store = Store.open(":memory:")
        self.addCleanup(self.store.close)
        # A false-low excursion on the 11th: a plunge to a sub-70 nadir the user
        # flagged "not real", with a fast fake rebound. The whole span must resolve
        # off the full CGM feed, then clamp to the requested window.
        cgm_rows = []
        t = datetime(2026, 6, 11, 2, 0, 0)
        bgs = ([110] * 6 + [95, 80, 66, 55, 48, 60, 90, 130, 150] + [120] * 6)
        for bg in bgs:
            cgm_rows.append({"EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
                             "Readings (CGM / BGM)": bg, "Description": "EGV"})
            t += timedelta(minutes=5)
        self.store.upsert_cgm(cgm_rows)
        self.store.record_prompt_response(
            detector="low", anchor_t=datetime(2026, 6, 11, 2, 50), answer="false-low")

    def test_precomputed_inputs_give_byte_identical_output(self):
        from ciq_autotune.false_low import false_low_span_records
        start = datetime(2026, 6, 11, 0, 0)
        end = datetime(2026, 6, 12, 0, 0)

        inline = timeline(self.store, start, end)

        records = false_low_span_records(
            self.store.cgm_readings(), self.store.prompt_responses())
        snaps = self.store.settings_snapshots()
        hoisted = timeline(self.store, start, end,
                           false_low_records=records, snaps=snaps)

        self.assertEqual(inline, hoisted)
        # The excursion actually surfaced (so the equality above is meaningful).
        self.assertEqual(len(inline["false_low_exclusion_spans"]), 1)

    def test_hoisted_records_are_still_clamped_per_window(self):
        # Pass the full-history records but request a narrow window that only
        # overlaps the tail of the excursion; the emitted span must be clamped to
        # the requested start, proving the per-window clamp still runs on the
        # hoisted records (only the derivation is hoisted, not the clamp).
        from ciq_autotune.false_low import false_low_span_records
        records = false_low_span_records(
            self.store.cgm_readings(), self.store.prompt_responses())
        narrow_start = datetime(2026, 6, 11, 2, 55)
        result = timeline(self.store, narrow_start, datetime(2026, 6, 11, 4, 0),
                          false_low_records=records)
        spans = result["false_low_exclusion_spans"]
        self.assertEqual(len(spans), 1)
        self.assertEqual(spans[0]["start"], "2026-06-11 02:55:00")


if __name__ == "__main__":
    unittest.main()
