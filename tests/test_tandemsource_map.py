"""Tandem Source event -> store-row mapping tests (stdlib unittest).

The live OAuth login is untestable without real credentials, so these exercise
the part that actually carries the risk: turning typed eventparser events into
the store's row shapes. Events are faked with dynamically-named classes (the
mapper dispatches on ``type(ev).__name__``) and a stdlib ``datetime`` timestamp.
"""

import os
import unittest
from datetime import datetime, timezone
from unittest import mock

from ciq_autotune.store import Store
from ciq_autotune.tandemsource_map import _TANDEM_EPOCH, events_to_rows


def _egv_for(local_wall: datetime) -> int:
    """The ``egvTimestamp`` a pump emits for a reading at ``local_wall`` (naive).

    ``egvTimestamp`` is seconds since the 2008 epoch in the pump's LOCAL wall
    clock, so we count from the epoch using the wall-clock digits directly (read
    via a UTC helper purely to avoid the host tz leaking in)."""
    return int(local_wall.replace(tzinfo=timezone.utc).timestamp()) - _TANDEM_EPOCH


def ev(_name, _ts, **attrs):
    """A fake event of class ``_name`` with ``eventTimestamp`` and given attrs."""
    obj = type(_name, (), {})()
    obj.eventTimestamp = _ts
    for k, v in attrs.items():
        setattr(obj, k, v)
    return obj


def t(hh, mm):
    return datetime(2022, 5, 27, hh, mm, 0)


class BasalMappingTest(unittest.TestCase):
    def test_source_enum_becomes_delivery_type(self):
        sources = {0: "algorithmDelivery (control-iq suspension)", 1: "profileDelivery",
                   2: "tempDelivery", 3: "algorithmDelivery", 4: "algorithmDelivery"}
        for raw, expected in sources.items():
            rows = events_to_rows([ev("LidBasalDelivery", t(0, 0),
                                      commandedRateSourceRaw=raw, commandedRate=850)])["basal"]
            self.assertEqual(rows[0]["delivery_type"], expected)

    def test_milliunits_become_real_rate(self):
        rows = events_to_rows([ev("LidBasalDelivery", t(0, 0),
                                  commandedRateSourceRaw=1, commandedRate=1589)])["basal"]
        self.assertEqual(rows[0]["basal_rate"], 1.589)

    def test_profile_basal_rate_is_carried(self):
        # The programmed rate rides alongside the delivered rate (both milliunits).
        rows = events_to_rows([ev("LidBasalDelivery", t(0, 0), commandedRateSourceRaw=3,
                                  commandedRate=1250, profileBasalRate=600)])["basal"]
        self.assertEqual(rows[0]["basal_rate"], 1.25)
        self.assertEqual(rows[0]["profile_basal_rate"], 0.6)

    def test_duration_is_gap_to_next_capped_then_cadence(self):
        evs = [
            ev("LidBasalDelivery", t(0, 40), commandedRateSourceRaw=1, commandedRate=800),  # unsorted
            ev("LidBasalDelivery", t(0, 0), commandedRateSourceRaw=1, commandedRate=800),
            ev("LidBasalDelivery", t(0, 5), commandedRateSourceRaw=1, commandedRate=800),
        ]
        rows = events_to_rows(evs)["basal"]
        durs = [r["duration_mins"] for r in rows]  # rows come out sorted by time
        self.assertEqual(durs[0], 5.0)    # 00:00 -> next at 00:05
        self.assertEqual(durs[1], 10.0)   # 00:05 -> 00:40 gap (35) capped at 10
        self.assertEqual(durs[2], 5.0)    # last -> nominal cadence

    def test_seq_num_is_carried_from_the_raw_event(self):
        # The row's natural key is the pump's seqNum, read off the raw event (#194).
        raw = type("RawEvent", (), {"seqNum": 4242})()
        rows = events_to_rows([ev("LidBasalDelivery", t(0, 0), raw=raw,
                                  commandedRateSourceRaw=1, commandedRate=800)])["basal"]
        self.assertEqual(rows[0]["seq_num"], 4242)

    def test_bolus_iob_pump_rows_carry_seq_num(self):
        # Every seqNum-keyed feed reads it off its own raw event (#198). Bolus takes
        # it from the *completion* event, not the requested-msg joins.
        def raw(n):
            return type("RawEvent", (), {"seqNum": n})()
        out = events_to_rows([
            ev("LidBolusCompleted", t(12, 0), raw=raw(11), bolusId=1,
               insulinDelivered=2.0, insulinRequested=2.0, completionStatusRaw=3),
            ev("LidBgReadingTaken", t(1, 0), raw=raw(22), bg=120, iob=0.7),
            ev("LidPumpingSuspended", t(2, 0), raw=raw(33)),
        ])
        self.assertEqual(out["bolus"][0]["seq_num"], 11)
        self.assertEqual(out["iob"][0]["seq_num"], 22)
        self.assertEqual(out["pump"][0]["seq_num"], 33)

    def test_rows_feed_store_upsert(self):
        raw = type("RawEvent", (), {"seqNum": 1})()
        rows = events_to_rows([ev("LidBasalDelivery", t(0, 0), raw=raw,
                                  commandedRateSourceRaw=1, commandedRate=800)])["basal"]
        with Store.open(":memory:") as store:
            self.assertEqual(store.upsert_basal(rows), 1)
            stored = store.basal_events()
            self.assertEqual(stored[0].t, t(0, 0))
            self.assertEqual(stored[0].delivery_type, "profileDelivery")


class CgmMappingTest(unittest.TestCase):
    def test_egv_events_become_cgm_rows(self):
        for name in ("LidCgmDataGxb", "LidCgmDataG7", "LidCgmDataFsl2"):
            out = events_to_rows([ev(name, t(1, 0),
                                     currentGlucoseDisplayValue=124, glucoseValueStatusRaw=0)])
            self.assertEqual(len(out["cgm"]), 1)
            self.assertEqual(out["cgm"][0]["Readings (CGM / BGM)"], 124)
            self.assertEqual(out["iob"], [])  # CGM events carry no IOB

    def test_high_low_status_drops_value_to_none(self):
        out = events_to_rows([ev("LidCgmDataG7", t(1, 0),
                                 currentGlucoseDisplayValue=0, glucoseValueStatusRaw=1)])
        self.assertIsNone(out["cgm"][0]["Readings (CGM / BGM)"])

    def test_cgm_row_feeds_store(self):
        out = events_to_rows([ev("LidCgmDataG7", t(1, 0),
                                 currentGlucoseDisplayValue=124, glucoseValueStatusRaw=0)])
        with Store.open(":memory:") as store:
            self.assertEqual(store.upsert_cgm(out["cgm"]), 1)
            self.assertEqual(store.cgm_readings()[0].bg, 124.0)

    def test_egv_timestamp_overrides_store_time(self):
        # egvTimestamp is the reading's *true* time; the row must use it, not the
        # eventTimestamp the pump stored the reading at. It is the pump's LOCAL
        # wall clock, so the emitted string is naive (no offset) — normalize_time
        # passes it through unshifted.
        egv = _egv_for(datetime(2022, 5, 27, 1, 0, 0))  # read at 01:00 local
        out = events_to_rows([ev("LidCgmDataG7", t(9, 0),  # stored at 09:00...
                                 currentGlucoseDisplayValue=124, glucoseValueStatusRaw=0,
                                 egvTimeStamp=egv)])       # ...but read at 01:00
        self.assertEqual(out["cgm"][0]["EventDateTime"], "2022-05-27 01:00:00")

    def test_egv_timestamp_is_local_not_utc_under_offset_tz(self):
        # The #103-regression, corrected: egvTimestamp is LOCAL, not UTC. A reading
        # at 20:54 local on a Phoenix (UTC-7) pump must land at 20:54 — not 13:54.
        # The old code tagged the egv string UTC and normalize_time converted it a
        # second time, sliding the whole evening 7 h into the afternoon.
        egv = _egv_for(datetime(2024, 3, 4, 20, 54, 37))
        with mock.patch.dict(os.environ, {"TIMEZONE_NAME": "America/Phoenix"}):
            out = events_to_rows([ev("LidCgmDataG7", t(9, 0),
                                     currentGlucoseDisplayValue=205, glucoseValueStatusRaw=0,
                                     egvTimeStamp=egv)])
            with Store.open(":memory:") as store:
                store.upsert_cgm(out["cgm"])
                rows = store.cgm_readings()
                self.assertEqual(str(rows[0].t), "2024-03-04 20:54:37")

    def test_same_egv_reading_dedupes_across_fetches(self):
        # The real dedup guarantee (issue #103 done right): the same physical
        # reading pulled in two overlapping fetches — same egvTimestamp, different
        # store times — collapses to one row, even under a non-UTC TIMEZONE_NAME.
        # Same invented reading as the test above — the point here is exact-timestamp
        # dedup, so the two must key on identical values.
        egv = _egv_for(datetime(2024, 3, 4, 20, 54, 37))
        first = ev("LidCgmDataG7", t(9, 0), currentGlucoseDisplayValue=205,
                   glucoseValueStatusRaw=0, egvTimeStamp=egv)
        second = ev("LidCgmDataG7", t(10, 30), currentGlucoseDisplayValue=205,
                    glucoseValueStatusRaw=0, egvTimeStamp=egv)  # re-pulled later
        with mock.patch.dict(os.environ, {"TIMEZONE_NAME": "America/Phoenix"}):
            out = events_to_rows([first, second])
            with Store.open(":memory:") as store:
                store.upsert_cgm(out["cgm"])
                rows = store.cgm_readings()
                self.assertEqual(len(rows), 1)
                self.assertEqual(str(rows[0].t), "2024-03-04 20:54:37")

    def test_reconnect_backfill_batch_does_not_collapse(self):
        # A Dexcom reconnect dump: three readings the pump stored at one instant
        # (07:09) but which really occurred 5 min apart. Keyed on their true
        # (egv) time they must survive as three distinct rows, not dedupe to one.
        base = _egv_for(datetime(2022, 5, 27, 1, 0, 0))
        batch = [ev("LidCgmDataG7", t(7, 9), currentGlucoseDisplayValue=100 + i,
                    glucoseValueStatusRaw=0, egvTimeStamp=base + i * 300)
                 for i in range(3)]
        out = events_to_rows(batch)
        with Store.open(":memory:") as store:
            self.assertEqual(store.upsert_cgm(out["cgm"]), 3)
            self.assertEqual(len(store.cgm_readings()), 3)


class BgReadingReferenceIobTest(unittest.TestCase):
    """LidBgReadingTaken is sparse (~8/day); kept only as reference IOB, no CGM."""

    def test_yields_reference_iob_not_cgm(self):
        out = events_to_rows([ev("LidBgReadingTaken", t(1, 0), bg=120, iob=0.65)])
        self.assertEqual(out["cgm"], [])
        self.assertEqual(len(out["iob"]), 1)
        self.assertEqual(out["iob"][0]["event_id"], "81")
        self.assertEqual(out["iob"][0]["iob"], 0.65)

    def test_iob_lands_in_continuous_series(self):
        out = events_to_rows([ev("LidBgReadingTaken", t(1, 0), bg=120, iob=0.7,
                                 seqNum=1)])
        with Store.open(":memory:") as store:
            store.upsert_iob(out["iob"])
            series = store.iob_series()  # filters to event_id == "81"
            self.assertEqual(len(series), 1)
            self.assertEqual(series[0].iob, 0.7)


class BolusMappingTest(unittest.TestCase):
    def test_completed_joins_requested_for_carbs_and_bg(self):
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=42, insulinDelivered=5.2,
               insulinRequested=5.5, completionStatusRaw=3),
            ev("LidBolusRequestedMsg1", t(12, 0), bolusId=42, carbAmount=45, bg=160),
        ]
        row = events_to_rows(evs)["bolus"][0]
        self.assertEqual(row["insulin"], 5.2)
        self.assertEqual(row["carbs"], 45)
        self.assertEqual(row["bg"], 160)
        self.assertEqual(row["completion"], "Completed")

    def test_completed_without_request_has_no_carbs_or_bg(self):
        row = events_to_rows([ev("LidBolusCompleted", t(12, 0), bolusId=7,
                                 insulinDelivered=1.0, insulinRequested=1.0,
                                 completionStatusRaw=3)])["bolus"][0]
        self.assertIsNone(row["carbs"])
        self.assertIsNone(row["bg"])

    def test_row_feeds_store(self):
        evs = [ev("LidBolusCompleted", t(12, 0), bolusId=1, insulinDelivered=2.0,
                  insulinRequested=2.0, completionStatusRaw=3, seqNum=1)]
        with Store.open(":memory:") as store:
            self.assertEqual(store.upsert_bolus(events_to_rows(evs)["bolus"]), 1)

    def test_msg2_provenance_joins_onto_bolus_row(self):
        # Msg1 + Msg2 + Completed all keyed on one bolusid: carbs/bg from Msg1,
        # the raw options provenance code (3 = Control-IQ automatic) from Msg2.
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=42, insulinDelivered=1.4,
               insulinRequested=1.4, completionStatusRaw=3),
            ev("LidBolusRequestedMsg1", t(12, 0), bolusId=42, carbAmount=0, bg=180),
            ev("LidBolusRequestedMsg2", t(12, 0), bolusId=42, optionsRaw=3),
        ]
        row = events_to_rows(evs)["bolus"][0]
        self.assertEqual(row["insulin"], 1.4)
        self.assertEqual(row["bolus_options"], 3)

    def test_msg2_reads_raw_options_not_enum(self):
        # A user-initiated Standard bolus (code 0) is a real, falsy code — it must
        # survive as 0 on the row, not collapse to None.
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=7, insulinDelivered=5.0,
               insulinRequested=5.0, completionStatusRaw=3),
            ev("LidBolusRequestedMsg2", t(12, 0), bolusId=7, optionsRaw=0),
        ]
        self.assertEqual(events_to_rows(evs)["bolus"][0]["bolus_options"], 0)

    def test_no_msg2_leaves_provenance_null(self):
        row = events_to_rows([ev("LidBolusCompleted", t(12, 0), bolusId=9,
                                 insulinDelivered=1.0, insulinRequested=1.0,
                                 completionStatusRaw=3)])["bolus"][0]
        self.assertIsNone(row["bolus_options"])

    def test_msg3_food_correction_split_joins_onto_bolus_row(self):
        # Msg1 + Msg3 + Completed on one bolusid: carbs from Msg1, the food/correction
        # split from Msg3 (correctionbolussize/foodbolussize), delivered total from
        # Completed. A constructed mixed dose: 4.0 food + 1.4 correction (#160).
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=4201, insulinDelivered=5.4,
               insulinRequested=5.4, completionStatusRaw=3),
            ev("LidBolusRequestedMsg1", t(12, 0), bolusId=4201, carbAmount=50, bg=160),
            ev("LidBolusRequestedMsg3", t(12, 0), bolusId=4201,
               foodBolusSize=4.0, correctionBolusSize=1.4, totalBolusSize=5.4),
        ]
        row = events_to_rows(evs)["bolus"][0]
        self.assertEqual(row["insulin"], 5.4)
        self.assertEqual(row["carbs"], 50)
        self.assertEqual(row["correction_insulin"], 1.4)
        self.assertEqual(row["food_insulin"], 4.0)

    def test_no_msg3_leaves_split_null(self):
        # Meal-only pump / historical row: no Msg3 -> both components NULL, so the
        # predicate treats the bolus as meal-only (today's behavior).
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=9, insulinDelivered=3.0,
               insulinRequested=3.0, completionStatusRaw=3),
            ev("LidBolusRequestedMsg1", t(12, 0), bolusId=9, carbAmount=30, bg=150),
        ]
        row = events_to_rows(evs)["bolus"][0]
        self.assertIsNone(row["correction_insulin"])
        self.assertIsNone(row["food_insulin"])

    def test_dose_stamped_settings_join_onto_bolus_row(self):
        # #159: the setting the pump used at this dose — Msg2.ISF/targetbg verbatim,
        # Msg1.carbratioRaw÷1000 into g/U (snapshot scale) on a carb-bearing dose.
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=42, insulinDelivered=6.0,
               insulinRequested=6.0, completionStatusRaw=3),
            ev("LidBolusRequestedMsg1", t(12, 0), bolusId=42, carbAmount=45, bg=170,
               carbRatioRaw=5000),
            ev("LidBolusRequestedMsg2", t(12, 0), bolusId=42, optionsRaw=0,
               isf=30, targetBg=110),
        ]
        row = events_to_rows(evs)["bolus"][0]
        self.assertEqual(row["isf"], 30)
        self.assertEqual(row["target_bg"], 110)
        self.assertEqual(row["carb_ratio"], 5.0)

    def test_zero_sentinel_settings_store_null(self):
        # Phone/Remote doses carry isf=0/targetBg=0 (no calc context): coerce to None
        # so only real observations reach the dose-epoch series.
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=7, insulinDelivered=2.0,
               insulinRequested=2.0, completionStatusRaw=3),
            ev("LidBolusRequestedMsg1", t(12, 0), bolusId=7, carbAmount=0, bg=0,
               carbRatioRaw=0),
            ev("LidBolusRequestedMsg2", t(12, 0), bolusId=7, optionsRaw=0,
               isf=0, targetBg=0),
        ]
        row = events_to_rows(evs)["bolus"][0]
        self.assertIsNone(row["isf"])
        self.assertIsNone(row["target_bg"])
        self.assertIsNone(row["carb_ratio"])

    def test_carb_ratio_dropped_on_a_zero_carb_dose(self):
        # A correction-only bolus carries no meaningful I:C even if a stale carbratio
        # rides along — gate carb_ratio on carbs present so it never pollutes the
        # I:C series (ADR 0016). ISF still lands.
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=8, insulinDelivered=1.0,
               insulinRequested=1.0, completionStatusRaw=3),
            ev("LidBolusRequestedMsg1", t(12, 0), bolusId=8, carbAmount=0, bg=200,
               carbRatioRaw=5000),
            ev("LidBolusRequestedMsg2", t(12, 0), bolusId=8, optionsRaw=0,
               isf=30, targetBg=110),
        ]
        row = events_to_rows(evs)["bolus"][0]
        self.assertIsNone(row["carb_ratio"])
        self.assertEqual(row["isf"], 30)

    def test_no_msg1_msg2_leaves_dose_settings_null(self):
        row = events_to_rows([ev("LidBolusCompleted", t(12, 0), bolusId=9,
                                 insulinDelivered=1.0, insulinRequested=1.0,
                                 completionStatusRaw=3)])["bolus"][0]
        self.assertIsNone(row["isf"])
        self.assertIsNone(row["target_bg"])
        self.assertIsNone(row["carb_ratio"])

    def test_dose_settings_round_trip_through_store(self):
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=11, insulinDelivered=6.0,
               insulinRequested=6.0, completionStatusRaw=3, seqNum=11),
            ev("LidBolusRequestedMsg1", t(12, 0), bolusId=11, carbAmount=45, bg=170,
               carbRatioRaw=4500),
            ev("LidBolusRequestedMsg2", t(12, 0), bolusId=11, optionsRaw=0,
               isf=36, targetBg=110),
        ]
        with Store.open(":memory:") as store:
            store.upsert_bolus(events_to_rows(evs)["bolus"])
            b = store.bolus_events()[0]
            self.assertEqual(b.isf, 36)
            self.assertEqual(b.target_bg, 110)
            self.assertEqual(b.carb_ratio, 4.5)

    def test_msg1_iob_anchor_joins_onto_bolus_row(self):
        # The pump's own reported IOB at the dose (Msg1.IOB) rides onto the row as
        # the ground-truth anchor dia-sweep validates the reconstruction against (#162).
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=42, insulinDelivered=1.4,
               insulinRequested=1.4, completionStatusRaw=3),
            ev("LidBolusRequestedMsg1", t(12, 0), bolusId=42, carbAmount=0, bg=180,
               iob=2.35),
        ]
        self.assertEqual(events_to_rows(evs)["bolus"][0]["pump_iob"], 2.35)

    def test_msg2_curve_and_extended_fields_join(self):
        # Msg2 carries the decay-model family (selectediobRaw: 0=Mudaliar, 1=Swan)
        # and the extended-delivery shape (standardpercent/duration) on the same
        # bolusid join — all persisted raw, none interpreted here (#162).
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=7, insulinDelivered=5.0,
               insulinRequested=5.0, completionStatusRaw=3),
            ev("LidBolusRequestedMsg2", t(12, 0), bolusId=7, optionsRaw=0,
               selectedIobRaw=1, standardPercent=60, duration=120),
        ]
        row = events_to_rows(evs)["bolus"][0]
        self.assertEqual(row["selected_iob"], 1)
        self.assertEqual(row["standard_percent"], 60)
        self.assertEqual(row["extended_duration"], 120)

    def test_falsy_curve_family_code_survives(self):
        # selectedIobRaw=0 (Mudaliar) is a real, falsy code — it must survive as 0,
        # not collapse to None (the "no Msg2" sentinel). standardPercent=100 too.
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=8, insulinDelivered=3.0,
               insulinRequested=3.0, completionStatusRaw=3),
            ev("LidBolusRequestedMsg2", t(12, 0), bolusId=8, optionsRaw=0,
               selectedIobRaw=0, standardPercent=100, duration=0),
        ]
        row = events_to_rows(evs)["bolus"][0]
        self.assertEqual(row["selected_iob"], 0)
        self.assertEqual(row["standard_percent"], 100)
        self.assertEqual(row["extended_duration"], 0)

    def test_no_msg1_leaves_anchor_null(self):
        row = events_to_rows([ev("LidBolusCompleted", t(12, 0), bolusId=9,
                                 insulinDelivered=1.0, insulinRequested=1.0,
                                 completionStatusRaw=3)])["bolus"][0]
        self.assertIsNone(row["pump_iob"])

    def test_msg2_override_flags_join_onto_bolus_row(self):
        # The two Msg2 override flags ride the same bolusid join (#161):
        # useroverrideRaw (1=Yes) is the trigger, declinedcorrectionRaw the raw sibling.
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=42, insulinDelivered=5.0,
               insulinRequested=5.0, completionStatusRaw=3),
            ev("LidBolusRequestedMsg2", t(12, 0), bolusId=42, optionsRaw=0,
               userOverrideRaw=1, declinedCorrectionRaw=0),
        ]
        row = events_to_rows(evs)["bolus"][0]
        self.assertEqual(row["user_override"], 1)
        self.assertEqual(row["declined_correction"], 0)

    def test_falsy_override_flags_survive(self):
        # userOverrideRaw=0 ("No, did not override") is a real, falsy code — it must
        # survive as 0, not collapse to None (the "no Msg2" sentinel).
        evs = [
            ev("LidBolusCompleted", t(12, 0), bolusId=8, insulinDelivered=3.0,
               insulinRequested=3.0, completionStatusRaw=3),
            ev("LidBolusRequestedMsg2", t(12, 0), bolusId=8, optionsRaw=0,
               userOverrideRaw=0, declinedCorrectionRaw=0),
        ]
        row = events_to_rows(evs)["bolus"][0]
        self.assertEqual(row["user_override"], 0)
        self.assertEqual(row["declined_correction"], 0)

    def test_no_msg2_leaves_override_flags_null(self):
        row = events_to_rows([ev("LidBolusCompleted", t(12, 0), bolusId=9,
                                 insulinDelivered=1.0, insulinRequested=1.0,
                                 completionStatusRaw=3)])["bolus"][0]
        self.assertIsNone(row["user_override"])
        self.assertIsNone(row["declined_correction"])

    def test_no_msg2_leaves_curve_and_extended_null(self):
        row = events_to_rows([ev("LidBolusCompleted", t(12, 0), bolusId=9,
                                 insulinDelivered=1.0, insulinRequested=1.0,
                                 completionStatusRaw=3)])["bolus"][0]
        self.assertIsNone(row["selected_iob"])
        self.assertIsNone(row["standard_percent"])
        self.assertIsNone(row["extended_duration"])


class PumpEventMappingTest(unittest.TestCase):
    def test_cartridge_family_is_site_change(self):
        for name in ("LidCartridgeFilled", "LidCannulaFilled", "LidTubingFilled"):
            pump = events_to_rows([ev(name, t(8, 0))])["pump"]
            self.assertEqual(pump[0]["event_type"], "Site/Cartridge Change")

    def test_suspension_maps_to_user_suspended(self):
        pump = events_to_rows([ev("LidPumpingSuspended", t(8, 0))])["pump"]
        self.assertEqual(pump[0]["event_type"], "User Suspended")

    def test_exercise_mode_carries_planned_duration(self):
        pump = events_to_rows([ev("LidAaUserModeChange", t(8, 0),
                                  currentUserModeRaw=2, exerciseTime=120)])["pump"]
        self.assertEqual(pump[0]["event_type"], "Exercise")
        self.assertEqual(pump[0]["duration_mins"], 120.0)

    def test_sleep_mode_recorded_without_exclusion_duration(self):
        pump = events_to_rows([ev("LidAaUserModeChange", t(8, 0),
                                  currentUserModeRaw=1)])["pump"]
        self.assertEqual(pump[0]["event_type"], "Sleep")
        self.assertEqual(pump[0]["duration_mins"], 0.0)

    def test_normal_mode_is_ignored(self):
        pump = events_to_rows([ev("LidAaUserModeChange", t(8, 0),
                                  currentUserModeRaw=0)])["pump"]
        self.assertEqual(pump, [])


class UnknownEventTest(unittest.TestCase):
    def test_unmapped_events_are_dropped_not_crashed(self):
        # LidCarbsEntered (event 48) never fires on the Tandem Source BFF feed
        # (ADR 0003); verify it is silently ignored like any other unmapped event.
        out = events_to_rows([ev("LidAlarmActivated", t(8, 0)),
                              ev("LidSomethingNew", t(8, 0)),
                              ev("LidCarbsEntered", t(8, 0), carbs=30.0)])
        self.assertEqual(out, {"basal": [], "bolus": [], "cgm": [], "iob": [],
                               "pump": []})


if __name__ == "__main__":
    unittest.main()
