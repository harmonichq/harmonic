"""Contract test: `events_to_rows` against **real** tconnectsync event objects.

The rest of the mapper suite (``test_tandemsource_map.py``) fakes events with
dynamically-named classes and hand-set attributes. That is fast and dependency-
free, but it has one fatal blind spot: a fake encodes whatever attribute names
the test author *believes* the upstream event carries. When tconnectsync 3.0.0
camelCased every field (``currentglucosedisplayvalue`` -> ``currentGlucoseDisplayValue``,
``bolusid`` -> ``bolusId``, ``egvTimestamp`` -> ``egvTimeStamp``, …), the fakes
and the mapper drifted *together* — every test stayed green while a live fetch
crashed on the first CGM event (issue #237).

This module closes that gap by constructing events through the real
``eventparser`` classes' ``build_from_json`` — the exact path
``tandemsource.pump_events`` uses to turn BFF JSON into typed events. If upstream
renames a field again, these assertions break loudly instead of silently reading
``None``. It requires the ``sync`` extra (like ``test_api.py``) and skips cleanly
when tconnectsync is not installed, so a core-only checkout is unaffected.

The BFF ``eventProperties`` keys below are the raw lowercase names upstream's
``build_from_json`` reads (it normalizes case), NOT our attribute names — that is
deliberate: this test speaks the wire format, and the typed attribute is exactly
what the mapper must get right.
"""

import unittest

try:
    from tconnectsync.eventparser import events as E
    HAVE_TCONNECTSYNC = True
except ImportError:  # pragma: no cover - core-only environment
    HAVE_TCONNECTSYNC = False

from ciq_autotune.tandemsource_map import events_to_rows


def _mk(cls, props, *, seq=1, code=0, pump_dt="2026-07-01 20:54:00"):
    """Build a real typed event from BFF-shaped JSON, exactly as pump_events does."""
    return cls.build_from_json({
        "pumpDateTime": pump_dt,
        "eventCode": code,
        "sequenceNumber": seq,
        "eventProperties": props,
    })


@unittest.skipUnless(HAVE_TCONNECTSYNC, "requires the sync extra (tconnectsync)")
class RealEventContractTest(unittest.TestCase):
    """Every assertion here rides a real 3.0.0 attribute; a rename fails it."""

    def test_cgm_in_range_reads_display_value_and_egv_time(self):
        # egvTimeStamp (2008-epoch secs) is a DIFFERENT instant from pumpDateTime;
        # the row must be timestamped by it, proving the mapper reads egvTimeStamp
        # (a stale `egvTimestamp` silently fell back to the store time — #90 regression).
        ev = _mk(E.LidCgmDataG7, {
            "currentGlucoseDisplayValue": 124, "glucoseValueStatus": 0,
            "egvTimestamp": 500000000, "cgmDataType": [0], "interval": 0,
        })
        row = events_to_rows([ev])["cgm"][0]
        self.assertEqual(row["Readings (CGM / BGM)"], 124)
        self.assertTrue(row["EventDateTime"].startswith("2023-11-05"),
                        f"expected egvTimeStamp-derived date, got {row['EventDateTime']}")

    def test_cgm_high_status_drops_value(self):
        # glucoseValueStatus=1 ("high", display value 0) -> not an in-range reading.
        ev = _mk(E.LidCgmDataG7, {
            "currentGlucoseDisplayValue": 0, "glucoseValueStatus": 1,
            "egvTimestamp": 500000300, "cgmDataType": [0], "interval": 0,
        })
        self.assertIsNone(events_to_rows([ev])["cgm"][0]["Readings (CGM / BGM)"])

    def test_basal_rate_and_source_and_profile(self):
        ev = _mk(E.LidBasalDelivery, {
            "commandedRate": 1250, "commandedRateSource": 3, "profileBasalRate": 600,
        })
        row = events_to_rows([ev])["basal"][0]
        self.assertEqual(row["basal_rate"], 1.25)
        self.assertEqual(row["profile_basal_rate"], 0.6)
        self.assertEqual(row["delivery_type"], "algorithmDelivery")

    def test_iob_reference_event(self):
        ev = _mk(E.LidBgReadingTaken, {"iob": 0.9, "bg": 150, "isf": 50, "targetBg": 110}, seq=20)
        row = events_to_rows([ev])["iob"][0]
        self.assertEqual(row["iob"], 0.9)
        self.assertEqual(row["seq_num"], 20)

    def test_exercise_mode_type_and_duration(self):
        ev = _mk(E.LidAaUserModeChange, {"currentUserMode": 2, "exerciseTime": 60})
        row = events_to_rows([ev])["pump"][0]
        self.assertEqual(row["event_type"], "Exercise")
        self.assertEqual(row["duration_mins"], 60.0)

    def test_basal_profile_rate_sentinel_maps_to_none(self):
        # 0xFFFF (65535 milliunits) is the pump's "no value" sentinel emitted
        # during a Control-IQ suspension. It must store as None, not 65.535 U/h.
        # The delivered commandedRate (0 during suspension) must still map normally.
        ev = _mk(E.LidBasalDelivery, {
            "commandedRate": 0, "commandedRateSource": 0, "profileBasalRate": 65535,
        })
        row = events_to_rows([ev])["basal"][0]
        self.assertIsNone(row["profile_basal_rate"])
        self.assertEqual(row["basal_rate"], 0.0)

    def test_full_bolus_join_maps_every_field(self):
        # Completed + Msg1 + Msg2 + Msg3 on one bolusId: exercises every renamed
        # bolus attribute at once. carb_ratio is carbRatioRaw/1000 on a carb dose.
        evs = [
            _mk(E.LidBolusCompleted, {
                "completionStatus": 3, "bolusId": 77,
                "insulinDelivered": 2.5, "insulinRequested": 2.6, "iob": 1.1}, seq=10),
            _mk(E.LidBolusRequestedMsg1, {
                "bolusId": 77, "carbAmount": 30, "bg": 140, "iob": 1.0, "carbRatio": 10000}),
            _mk(E.LidBolusRequestedMsg2, {
                "bolusId": 77, "options": 0, "selectedIob": 1, "standardPercent": 60,
                "duration": 120, "userOverride": 1, "declinedCorrection": 0,
                "isf": 50, "targetBg": 110}),
            _mk(E.LidBolusRequestedMsg3, {
                "bolusId": 77, "foodBolusSize": 2.0, "correctionBolusSize": 0.5,
                "totalBolusSize": 2.5}),
        ]
        row = events_to_rows(evs)["bolus"][0]
        self.assertEqual(row["seq_num"], 10)
        self.assertEqual(row["completion"], "Completed")
        self.assertEqual(row["insulin"], 2.5)
        self.assertEqual(row["requested_insulin"], 2.6)
        self.assertEqual(row["carbs"], 30)
        self.assertEqual(row["bg"], 140)
        self.assertEqual(row["pump_iob"], 1.0)
        self.assertEqual(row["selected_iob"], 1)
        self.assertEqual(row["standard_percent"], 60)
        self.assertEqual(row["extended_duration"], 120)
        self.assertEqual(row["user_override"], 1)
        self.assertEqual(row["declined_correction"], 0)
        self.assertEqual(row["isf"], 50)
        self.assertEqual(row["target_bg"], 110)
        self.assertEqual(row["carb_ratio"], 10.0)
        self.assertEqual(row["food_insulin"], 2.0)
        self.assertEqual(row["correction_insulin"], 0.5)


if __name__ == "__main__":
    unittest.main()
