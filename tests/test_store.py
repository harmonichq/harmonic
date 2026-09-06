"""Store tests (stdlib unittest, no third-party deps)."""

import json
import os
import shutil
import sqlite3
import tempfile
import unittest
from dataclasses import fields
from datetime import datetime
from unittest import mock

from ciq_autotune.events import CarbEntry, CgmReading
from ciq_autotune.settings import Snapshot, parse_pump_settings
from ciq_autotune.store import (
    FocusAlreadyActive,
    Store,
    TimezoneNotConfigured,
    normalize_time,
)


class AuditDismissalStoreTest(unittest.TestCase):
    def test_dismissal_is_scoped_to_item_and_evidence_fingerprint(self):
        with tempfile.TemporaryDirectory() as tmp:
            with Store.open(os.path.join(tmp, "ciq.db")) as store:
                store.dismiss_audit_item("basal:2", "evidence-v1",
                                         dismissed_at="2026-08-09 00:00:00")
                self.assertEqual(store.audit_dismissals()["basal:2"]["evidence_fingerprint"],
                                 "evidence-v1")
                store.dismiss_audit_item("basal:2", "evidence-v2",
                                         dismissed_at="2026-08-10 00:00:00")
                self.assertEqual(store.audit_dismissals()["basal:2"]["evidence_fingerprint"],
                                 "evidence-v2")


def _raw_settings(active_idp=4, isf=30):
    pad = [{"startTime": 0, "basalRate": 0, "isf": 0, "carbRatio": 0, "targetBg": 0}] * 12
    return {
        "profiles": {
            "activeIdp": active_idp,
            "profile": [
                {"name": "4", "idp": 4, "insulinDuration": 300, "carbEntry": 1,
                 "maxBolus": 15000, "tDependentSegs": [
                     {"startTime": 0, "basalRate": 600, "isf": isf, "carbRatio": 7000, "targetBg": 110},
                     {"startTime": 540, "basalRate": 1100, "isf": isf, "carbRatio": 5000, "targetBg": 110},
                 ] + pad},
            ],
        },
        "cgmSettings": {},
    }


class NormalizeTimeTest(unittest.TestCase):
    def test_tz_aware_pump_feed_converts_to_local(self):
        # A -04:00 timestamp converts to the configured zone. Under the suite's
        # TIMEZONE_NAME=UTC (conftest) that is its UTC equivalent: 00:00 -04:00 =
        # 04:00 UTC. Pinned explicitly here so the case is self-contained.
        with mock.patch.dict(os.environ, {"TIMEZONE_NAME": "UTC"}):
            self.assertEqual(
                normalize_time("2022-05-27 00:00:00-04:00"), "2022-05-27 04:00:00"
            )
        # A non-UTC zone shifts the wall clock: 00:00 -04:00 = 21:00 the prior day
        # in America/Phoenix (UTC-7).
        with mock.patch.dict(os.environ, {"TIMEZONE_NAME": "America/Phoenix"}):
            self.assertEqual(
                normalize_time("2022-05-27 00:00:00-04:00"), "2022-05-26 21:00:00"
            )

    def test_tz_aware_without_timezone_name_raises(self):
        # The #198 guard: converting a tz-aware timestamp with TIMEZONE_NAME unset
        # must fail loudly, never silently fall back to UTC (which stored the whole
        # history +7h off the pump clock). Naive inputs are unaffected (below).
        env = {k: v for k, v in os.environ.items() if k != "TIMEZONE_NAME"}
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(TimezoneNotConfigured):
                normalize_time("2022-05-27 00:00:00-04:00")
            # A naive timestamp needs no conversion, so it still passes through.
            self.assertEqual(normalize_time("2022-05-27T00:04:28"),
                             "2022-05-27 00:04:28")

    def test_naive_cgm_feed(self):
        self.assertEqual(
            normalize_time("2022-05-27T00:04:28"), "2022-05-27 00:04:28"
        )

    def test_empty_is_none(self):
        self.assertIsNone(normalize_time(""))
        self.assertIsNone(normalize_time(None))

    def test_sorts_chronologically_as_text(self):
        # UTC+00:00 so it stays at 23:59:59 after conversion; naive b passes through.
        a = normalize_time("2022-05-27 23:59:59+00:00")
        b = normalize_time("2022-05-28T00:00:01")
        self.assertLess(a, b)


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_upsert_is_idempotent(self):
        row = [{"seq_num": 100, "time": "2022-05-27 00:00:00-04:00",
                "delivery_type": "algorithmDelivery",
                "duration_mins": 3.3, "basal_rate": 1.589}]
        self.store.upsert_basal(row)
        self.store.upsert_basal(row)  # same row again
        self.assertEqual(self.store.counts()["basal_events"], 1)

    def test_latest_cgm_or_basal_timestamp_uses_both_streams_without_rows(self):
        self.assertIsNone(self.store.latest_cgm_or_basal_timestamp())

        self.store.upsert_cgm([{
            "EventDateTime": "2026-08-01 09:00:00",
            "Readings (CGM / BGM)": 100,
        }])
        self.assertEqual(
            self.store.latest_cgm_or_basal_timestamp(), datetime(2026, 8, 1, 9)
        )

        self.store.upsert_basal([{
            "seq_num": 1, "time": "2026-08-01 10:00:00",
            "delivery_type": "profileDelivery", "duration_mins": 5,
            "basal_rate": 0.6,
        }])
        self.assertEqual(
            self.store.latest_cgm_or_basal_timestamp(), datetime(2026, 8, 1, 10)
        )

        self.store.conn.execute("DELETE FROM cgm_readings")
        self.assertEqual(
            self.store.latest_cgm_or_basal_timestamp(), datetime(2026, 8, 1, 10)
        )

        self.store.upsert_cgm([{
            "EventDateTime": "2026-08-01 11:00:00",
            "Readings (CGM / BGM)": 110,
        }])
        self.assertEqual(
            self.store.latest_cgm_or_basal_timestamp(), datetime(2026, 8, 1, 11)
        )

    def test_upsert_updates_changed_fields(self):
        self.store.upsert_basal([{"seq_num": 100, "time": "2022-05-27 00:00:00-04:00",
                                  "delivery_type": "profileDelivery",
                                  "duration_mins": 5, "basal_rate": 1.0}])
        # same key, corrected rate -> should overwrite, not duplicate
        self.store.upsert_basal([{"seq_num": 100, "time": "2022-05-27 00:00:00-04:00",
                                  "delivery_type": "profileDelivery",
                                  "duration_mins": 5, "basal_rate": 1.2}])
        rows = self.store.basal_events()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].basal_rate, 1.2)

    def test_upsert_basal_merges_timestamp_jitter(self):
        # The same delivery re-pulled with a ~33s-shifted store time (the BFF
        # re-decodes basal pumpDateTime a few seconds off across pulls, #194) must
        # merge on its stable seqNum, not double — keying on the raw second did.
        base = {"seq_num": 7, "delivery_type": "algorithmDelivery",
                "duration_mins": 5.0, "basal_rate": 0.6, "profile_basal_rate": 0.6}
        self.store.upsert_basal([{"time": "2026-07-02 00:04:15", **base}])
        self.store.upsert_basal([{"time": "2026-07-02 00:04:48", **base}])
        rows = self.store.basal_events()
        self.assertEqual(len(rows), 1)
        # The surviving row carries the latest pull's time.
        self.assertEqual(rows[0].t, datetime(2026, 7, 2, 0, 4, 48))

    def test_upsert_basal_rejects_missing_seq_num(self):
        # A single-column INTEGER PK is a rowid alias, so a NULL seq_num would be
        # auto-assigned a rowid and silently double instead of merging. Every real
        # delivery carries a seqNum, so a missing one is a mapping bug — fail loud.
        with self.assertRaises(ValueError):
            self.store.upsert_basal([{"time": "2026-07-02 00:05:00",
                                      "delivery_type": "algorithmDelivery",
                                      "duration_mins": 5, "basal_rate": 0.6}])

    def test_upsert_basal_distinct_seq_kept(self):
        # Two genuinely different deliveries carry different seqNums and must both
        # survive even if a re-pull lands them a few seconds apart in the same slot.
        base = {"delivery_type": "algorithmDelivery", "duration_mins": 5.0,
                "basal_rate": 0.6, "profile_basal_rate": 0.6}
        self.store.upsert_basal([{"seq_num": 1, "time": "2026-07-02 00:04:15", **base}])
        self.store.upsert_basal([{"seq_num": 2, "time": "2026-07-02 00:04:48", **base}])
        self.assertEqual(len(self.store.basal_events()), 2)

    def test_cgm_drops_serial_number(self):
        fake_serial = "FAKE-SERIAL-0000"
        self.store.upsert_cgm([{
            "DeviceType": "t:slim X2 Insulin Pump", "SerialNumber": fake_serial,
            "Description": "EGV", "EventDateTime": "2022-05-27T00:04:28",
            "Readings (CGM / BGM)": "155",
        }])
        rows = self.store.cgm_readings()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].bg, 155.0)
        # The typed row has only the schema fields — serial/device can't ride in.
        self.assertEqual({f.name for f in fields(CgmReading)}, {"t", "bg", "type"})
        self.assertNotIn(fake_serial, repr(rows[0]))

    def test_range_query_is_half_open(self):
        for t in ["2022-05-27T01:00:00", "2022-05-27T02:00:00", "2022-05-27T03:00:00"]:
            self.store.upsert_cgm([{"EventDateTime": t, "Readings (CGM / BGM)": "100",
                                    "Description": "EGV"}])
        got = self.store.cgm_readings(start="2022-05-27 01:00:00", end="2022-05-27 03:00:00")
        self.assertEqual([r.t for r in got],
                         [datetime(2022, 5, 27, 1, 0, 0), datetime(2022, 5, 27, 2, 0, 0)])


class OpenReadonlyTest(unittest.TestCase):
    """`Store.open_readonly` reads a snapshot without touching the file —
    the grounding-workflow contract (pulled snapshots stay pristine)."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "snap.db")
        with Store.open(self.path) as store:
            store.upsert_cgm([{"EventDateTime": "2022-05-27T01:00:00",
                               "Readings (CGM / BGM)": "100",
                               "Description": "EGV"}])
        # Checkpoint the WAL and drop the sidecars so the file looks like a
        # freshly pulled snapshot sitting in a clean directory.
        conn = sqlite3.connect(self.path)
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.execute("PRAGMA journal_mode = DELETE")
        conn.close()
        for side in ("-wal", "-shm"):
            try:
                os.remove(self.path + side)
            except FileNotFoundError:
                pass

    def tearDown(self):
        shutil.rmtree(self.dir)

    def test_reads_without_creating_sidecars(self):
        before = sorted(os.listdir(self.dir))
        with Store.open_readonly(self.path) as store:
            rows = store.cgm_readings()
        self.assertEqual([r.bg for r in rows], [100.0])
        self.assertEqual(sorted(os.listdir(self.dir)), before)

    def test_write_attempt_raises(self):
        with Store.open_readonly(self.path) as store:
            with self.assertRaises(sqlite3.OperationalError):
                store.upsert_cgm([{"EventDateTime": "2022-05-27T02:00:00",
                                   "Readings (CGM / BGM)": "101",
                                   "Description": "EGV"}])

    def test_queryonly_reads_live_database_but_cannot_write(self):
        with Store.open(self.path) as writer:
            writer.upsert_cgm([{"EventDateTime": "2022-05-27T02:00:00",
                                "Readings (CGM / BGM)": "101",
                                "Description": "EGV"}])
            with Store.open_queryonly(self.path) as reader:
                self.assertEqual([row.bg for row in reader.cgm_readings()], [100.0, 101.0])
                with self.assertRaises(sqlite3.OperationalError):
                    reader.upsert_cgm([{"EventDateTime": "2022-05-27T03:00:00",
                                        "Readings (CGM / BGM)": "102",
                                        "Description": "EGV"}])

    def test_queryonly_does_not_mutate_database_bytes_or_create_sidecars(self):
        before_files = sorted(os.listdir(self.dir))
        with open(self.path, "rb") as database:
            before_bytes = database.read()

        with Store.open_queryonly(self.path) as store:
            self.assertEqual([row.bg for row in store.cgm_readings()], [100.0])

        with open(self.path, "rb") as database:
            after_bytes = database.read()
        self.assertEqual(after_bytes, before_bytes)
        self.assertEqual(sorted(os.listdir(self.dir)), before_files)
        self.assertFalse(os.path.exists(self.path + "-wal"))
        self.assertFalse(os.path.exists(self.path + "-shm"))


class CredentialsStoreTest(unittest.TestCase):
    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_no_credentials_returns_none(self):
        self.assertIsNone(self.store.get_credentials())

    def test_set_then_get_round_trips(self):
        self.store.set_credentials(email="a@b.com", password_encrypted=b"cipher",
                                   region="US", updated_at="2026-01-01 00:00:00")
        row = self.store.get_credentials()
        self.assertEqual(row["email"], "a@b.com")
        self.assertEqual(row["password_encrypted"], b"cipher")
        self.assertEqual(row["region"], "US")

    def test_set_again_replaces_not_duplicates(self):
        self.store.set_credentials(email="a@b.com", password_encrypted=b"old",
                                   region="US", updated_at="2026-01-01 00:00:00")
        self.store.set_credentials(email="a@b.com", password_encrypted=b"new",
                                   region="EU", updated_at="2026-01-02 00:00:00")
        row = self.store.get_credentials()
        self.assertEqual(row["password_encrypted"], b"new")
        self.assertEqual(row["region"], "EU")
        self.assertEqual(self.store.conn.execute(
            "SELECT COUNT(*) FROM credentials").fetchone()[0], 1)


class FetchStatusStoreTest(unittest.TestCase):
    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_no_attempts_returns_none(self):
        self.assertIsNone(self.store.fetch_status())

    def test_records_success(self):
        self.store.record_fetch_result(attempted_at="2026-01-01 00:00:00", ok=True,
                                       written={"cgm_readings": 10})
        status = self.store.fetch_status()
        self.assertEqual(status["last_attempt_at"], "2026-01-01 00:00:00")
        self.assertEqual(status["last_success_at"], "2026-01-01 00:00:00")
        self.assertIsNone(status["last_error"])
        self.assertEqual(status["last_written"], {"cgm_readings": 10})

    def test_failure_keeps_last_success_and_last_written(self):
        self.store.record_fetch_result(attempted_at="2026-01-01 00:00:00", ok=True,
                                       written={"cgm_readings": 10})
        self.store.record_fetch_result(attempted_at="2026-01-01 01:00:00", ok=False,
                                       error="login failed")
        status = self.store.fetch_status()
        self.assertEqual(status["last_attempt_at"], "2026-01-01 01:00:00")
        self.assertEqual(status["last_success_at"], "2026-01-01 00:00:00")
        self.assertEqual(status["last_error"], "login failed")
        self.assertEqual(status["last_written"], {"cgm_readings": 10})

    def test_success_clears_previous_error(self):
        self.store.record_fetch_result(attempted_at="2026-01-01 00:00:00", ok=False,
                                       error="login failed")
        self.store.record_fetch_result(attempted_at="2026-01-01 01:00:00", ok=True,
                                       written={"cgm_readings": 5})
        status = self.store.fetch_status()
        self.assertIsNone(status["last_error"])


class CgmDayBoundsTest(unittest.TestCase):
    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_empty_db_returns_none_none(self):
        earliest, latest = self.store.cgm_day_bounds()
        self.assertIsNone(earliest)
        self.assertIsNone(latest)

    def test_populated_returns_pump_local_days(self):
        self.store.upsert_cgm([
            {"EventDateTime": "2026-01-05T08:32:00", "Readings (CGM / BGM)": 110, "Description": "EGV"},
            {"EventDateTime": "2026-01-10T23:55:00", "Readings (CGM / BGM)": 95, "Description": "EGV"},
            {"EventDateTime": "2026-01-07T12:00:00", "Readings (CGM / BGM)": 105, "Description": "EGV"},
        ])
        earliest, latest = self.store.cgm_day_bounds()
        self.assertEqual(earliest, "2026-01-05")
        self.assertEqual(latest, "2026-01-10")


class BasalProfileRateTest(unittest.TestCase):
    """The programmed rate (LidBasalDelivery.profileBasalRate) rides alongside the
    delivered rate so A1 can show 'current' and F2 can cut basal epochs."""

    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_profile_basal_rate_is_stored_and_read(self):
        self.store.upsert_basal([{
            "seq_num": 1, "time": "2026-06-01 00:00:00-07:00",
            "delivery_type": "algorithmDelivery",
            "duration_mins": 5, "basal_rate": 0.85, "profile_basal_rate": 0.6,
        }])
        row = self.store.basal_events()[0]
        self.assertEqual(row.basal_rate, 0.85)
        self.assertEqual(row.profile_basal_rate, 0.6)

    def test_profile_basal_rate_defaults_to_none(self):
        self.store.upsert_basal([{
            "seq_num": 1, "time": "2026-06-01 00:00:00-07:00",
            "delivery_type": "profileDelivery",
            "duration_mins": 5, "basal_rate": 0.6,
        }])
        self.assertIsNone(self.store.basal_events()[0].profile_basal_rate)


class BolusProvenanceStoreTest(unittest.TestCase):
    """The Msg2 `bolus_options` provenance code round-trips through the store (#135)."""

    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_bolus_options_is_stored_and_read(self):
        self.store.upsert_bolus([{
            "request_time": "2026-06-01 08:00:00", "seq_num": 1, "description": "Bolus",
            "insulin": 1.4, "carbs": None, "bolus_options": 3,
            "completion_time": "2026-06-01 08:00:00",
        }])
        self.assertEqual(self.store.bolus_events()[0].bolus_options, 3)

    def test_falsy_options_code_survives(self):
        # Code 0 (Standard) is a real user-bolus code, not "missing".
        self.store.upsert_bolus([{
            "request_time": "2026-06-01 09:00:00", "seq_num": 1, "description": "Bolus",
            "insulin": 5.0, "carbs": 40, "bolus_options": 0,
            "completion_time": "2026-06-01 09:00:00",
        }])
        self.assertEqual(self.store.bolus_events()[0].bolus_options, 0)

    def test_bolus_options_defaults_to_none(self):
        self.store.upsert_bolus([{
            "request_time": "2026-06-01 10:00:00", "seq_num": 1, "description": "Bolus",
            "insulin": 2.0, "completion_time": "2026-06-01 10:00:00",
        }])
        self.assertIsNone(self.store.bolus_events()[0].bolus_options)

    def test_override_flags_round_trip(self):
        # The two Msg2 override flags persist and read back on the BolusEvent (#161).
        self.store.upsert_bolus([{
            "request_time": "2026-06-01 11:00:00", "seq_num": 1, "description": "Bolus",
            "insulin": 5.0, "requested_insulin": 5.0, "bolus_options": 0,
            "user_override": 1, "declined_correction": 0,
            "completion_time": "2026-06-01 11:00:00",
        }])
        b = self.store.bolus_events()[0]
        self.assertEqual(b.user_override, 1)
        self.assertEqual(b.declined_correction, 0)

    def test_falsy_override_flag_survives(self):
        # user_override=0 is a real "did not override" code, not "missing".
        self.store.upsert_bolus([{
            "request_time": "2026-06-01 12:00:00", "seq_num": 1, "description": "Bolus",
            "insulin": 2.0, "user_override": 0, "declined_correction": 0,
            "completion_time": "2026-06-01 12:00:00",
        }])
        b = self.store.bolus_events()[0]
        self.assertEqual(b.user_override, 0)
        self.assertEqual(b.declined_correction, 0)

    def test_override_flags_default_to_none(self):
        self.store.upsert_bolus([{
            "request_time": "2026-06-01 13:00:00", "seq_num": 1, "description": "Bolus",
            "insulin": 2.0, "completion_time": "2026-06-01 13:00:00",
        }])
        b = self.store.bolus_events()[0]
        self.assertIsNone(b.user_override)
        self.assertIsNone(b.declined_correction)


class BolusFoodCorrectionSplitStoreTest(unittest.TestCase):
    """The Msg3 food/correction split round-trips through the store (#160)."""

    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_split_is_stored_and_read(self):
        # A mixed bolus: total delivered 5.4U, of which 1.4U is the correction
        # component and 4.0U food (a constructed Msg3-split example, #160).
        self.store.upsert_bolus([{
            "request_time": "2026-06-01 08:00:00", "seq_num": 1, "description": "Bolus",
            "insulin": 5.4, "carbs": 50, "bolus_options": 0,
            "correction_insulin": 1.4, "food_insulin": 4.0,
            "completion_time": "2026-06-01 08:00:00",
        }])
        b = self.store.bolus_events()[0]
        self.assertAlmostEqual(b.correction_insulin, 1.4)
        self.assertAlmostEqual(b.food_insulin, 4.0)

    def test_split_defaults_to_none(self):
        # No Msg3 (meal-only pump / historical row): both components read NULL.
        self.store.upsert_bolus([{
            "request_time": "2026-06-01 10:00:00", "seq_num": 1, "description": "Bolus",
            "insulin": 2.0, "carbs": 30, "completion_time": "2026-06-01 10:00:00",
        }])
        b = self.store.bolus_events()[0]
        self.assertIsNone(b.correction_insulin)
        self.assertIsNone(b.food_insulin)


class BolusPumpAnchorStoreTest(unittest.TestCase):
    """The pump's IOB anchor + curve/extended fields round-trip the store (#162)."""

    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_anchor_and_curve_fields_stored_and_read(self):
        self.store.upsert_bolus([{
            "request_time": "2026-06-01 08:00:00", "seq_num": 1, "description": "Bolus",
            "insulin": 5.0, "carbs": 45, "pump_iob": 2.35,
            "selected_iob": 1, "standard_percent": 60, "extended_duration": 120,
            "completion_time": "2026-06-01 08:00:00",
        }])
        b = self.store.bolus_events()[0]
        self.assertAlmostEqual(b.pump_iob, 2.35)
        self.assertEqual(b.selected_iob, 1)
        self.assertEqual(b.standard_percent, 60)
        self.assertEqual(b.extended_duration, 120)

    def test_falsy_curve_code_survives(self):
        # selectediobRaw=0 (Mudaliar) and a 0-duration standard bolus are real,
        # falsy values — they must survive as 0, not collapse to None ("no Msg2").
        self.store.upsert_bolus([{
            "request_time": "2026-06-01 09:00:00", "seq_num": 1, "description": "Bolus",
            "insulin": 3.0, "pump_iob": 0.0,
            "selected_iob": 0, "standard_percent": 100, "extended_duration": 0,
            "completion_time": "2026-06-01 09:00:00",
        }])
        b = self.store.bolus_events()[0]
        self.assertEqual(b.pump_iob, 0.0)
        self.assertEqual(b.selected_iob, 0)
        self.assertEqual(b.standard_percent, 100)
        self.assertEqual(b.extended_duration, 0)

    def test_defaults_to_none(self):
        # No Msg1/Msg2 joined: every anchor/curve field reads NULL, no zero-fill
        # (a 0.0 anchor would read as real ground truth downstream).
        self.store.upsert_bolus([{
            "request_time": "2026-06-01 10:00:00", "seq_num": 1, "description": "Bolus",
            "insulin": 2.0, "completion_time": "2026-06-01 10:00:00",
        }])
        b = self.store.bolus_events()[0]
        self.assertIsNone(b.pump_iob)
        self.assertIsNone(b.selected_iob)
        self.assertIsNone(b.standard_percent)
        self.assertIsNone(b.extended_duration)


class SettingsSnapshotTest(unittest.TestCase):
    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_snapshot_round_trips_to_typed_settings(self):
        s = parse_pump_settings(_raw_settings(isf=30))
        self.store.upsert_settings_snapshot("2026-06-01 09:00:00", s)
        snaps = self.store.settings_snapshots()
        self.assertEqual(len(snaps), 1)
        self.assertIsInstance(snaps[0], Snapshot)
        self.assertEqual(snaps[0].captured_at, datetime(2026, 6, 1, 9, 0, 0))
        prof = snaps[0].settings.active()
        self.assertEqual(prof.idp, 4)
        self.assertAlmostEqual(prof.segments[0].basal_rate, 0.6)
        self.assertEqual(prof.segments[0].isf, 30)
        self.assertAlmostEqual(prof.segments[1].carb_ratio, 5.0)

    def test_append_only_keeps_one_row_per_idp_per_capture(self):
        s = parse_pump_settings(_raw_settings())
        self.store.upsert_settings_snapshot("2026-06-01 09:00:00", s)
        self.store.upsert_settings_snapshot("2026-06-02 09:00:00", s)
        snaps = self.store.settings_snapshots()
        self.assertEqual([sn.captured_at for sn in snaps],
                         [datetime(2026, 6, 1, 9, 0, 0), datetime(2026, 6, 2, 9, 0, 0)])

    def test_same_capture_is_idempotent(self):
        s = parse_pump_settings(_raw_settings())
        self.store.upsert_settings_snapshot("2026-06-01 09:00:00", s)
        self.store.upsert_settings_snapshot("2026-06-01 09:00:00", s)
        self.assertEqual(len(self.store.settings_snapshots()), 1)


class PlanDraftStoreTest(unittest.TestCase):
    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_no_draft_returns_none(self):
        self.assertIsNone(self.store.get_plan_draft())

    def test_save_then_get_round_trips(self):
        items = [{"type": "basal", "key": 0, "label": "00:00", "value": 0.7}]
        self.store.save_plan_draft(items, "2026-06-01 09:00:00")
        draft = self.store.get_plan_draft()
        self.assertEqual(draft["items"], items)
        self.assertEqual(draft["updated_at"], "2026-06-01 09:00:00")

    def test_save_draft_leaves_durable_revision_unchanged(self):
        before = self.store.input_data_revision()
        self.store.save_plan_draft([{"type": "basal", "key": 0}], "2026-06-01 09:00:00")
        self.assertEqual(self.store.input_data_revision(), before)

    def test_save_allows_empty_and_single_family_drafts(self):
        cases = [
            [],
            [{"type": "basal", "key": 0}, {"type": "basal", "key": 1}],
            [{"type": "isf", "key": 0}, {"type": "isf", "key": 540}],
            [{"type": "ic", "key": 0}, {"type": "ic", "key": 540}],
            [{"type": "target", "key": 0}, {"type": "target", "key": 540}],
        ]
        for idx, items in enumerate(cases):
            with self.subTest(items=items):
                self.store.save_plan_draft(items, f"2026-06-01 09:0{idx}:00")
                self.assertEqual(self.store.get_plan_draft()["items"], items)

    def test_save_rejects_mixed_family_draft(self):
        with self.assertRaises(ValueError):
            self.store.save_plan_draft(
                [{"type": "basal", "key": 0}, {"type": "isf", "key": 540}],
                "2026-06-01 09:00:00",
            )
        self.assertIsNone(self.store.get_plan_draft())

    def test_save_rejects_non_tuning_item(self):
        with self.assertRaises(ValueError):
            self.store.save_plan_draft(
                [{"type": "basal", "key": 0}, {"type": "behavior", "key": "late-meal"}],
                "2026-06-01 09:00:00",
            )

    def test_save_overwrites_previous_draft(self):
        self.store.save_plan_draft([{"type": "basal", "key": 0}], "2026-06-01 09:00:00")
        self.store.save_plan_draft([{"type": "isf", "key": 540}], "2026-06-01 10:00:00")
        draft = self.store.get_plan_draft()
        self.assertEqual(draft["items"], [{"type": "isf", "key": 540}])
        self.assertEqual(draft["updated_at"], "2026-06-01 10:00:00")

    def test_apply_raises_with_no_draft(self):
        with self.assertRaises(ValueError):
            self.store.apply_plan("2026-06-01 09:00:00")

    def test_apply_raises_with_empty_draft(self):
        self.store.save_plan_draft([], "2026-06-01 09:00:00")
        with self.assertRaises(ValueError):
            self.store.apply_plan("2026-06-01 09:30:00")

    def test_apply_snapshots_into_history_and_clears_draft(self):
        items = [{"type": "basal", "key": 0, "value": 0.7}]
        self.store.save_plan_draft(items, "2026-06-01 09:00:00")
        result = self.store.apply_plan("2026-06-01 12:00:00")
        self.assertEqual(result, {"applied_at": "2026-06-01 12:00:00", "items": items})
        self.assertIsNone(self.store.get_plan_draft())
        self.assertEqual(self.store.plan_history(), [result])

    def test_apply_rejects_mixed_draft_inserted_outside_store_api(self):
        items = [{"type": "basal", "key": 0}, {"type": "ic", "key": 540}]
        self.store.conn.execute(
            "INSERT INTO plan_draft (id, items_json, updated_at) VALUES (1, ?, ?)",
            (json.dumps(items), "2026-06-01 09:00:00"),
        )
        with self.assertRaises(ValueError):
            self.store.apply_plan("2026-06-01 12:00:00")
        self.assertEqual(self.store.plan_history(), [])
        self.assertEqual(self.store.get_plan_draft()["items"], items)

    def test_plan_history_newest_first(self):
        self.store.save_plan_draft([{"type": "basal", "key": 0}], "2026-06-01 09:00:00")
        self.store.apply_plan("2026-06-01 12:00:00")
        self.store.save_plan_draft([{"type": "isf", "key": 540}], "2026-06-02 09:00:00")
        self.store.apply_plan("2026-06-02 12:00:00")
        history = self.store.plan_history()
        self.assertEqual([h["applied_at"] for h in history],
                         ["2026-06-02 12:00:00", "2026-06-01 12:00:00"])


class IcBlockProvenancePlanStoreTest(unittest.TestCase):
    """#581: an annotated I:C row must belong to a complete, internally
    consistent block group (see store._validate_ic_block_groups), on both
    draft save and apply. Unannotated rows (manual picks, Revert drafts) are
    untouched."""

    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def _block(self, start=720, end=900, members=(720, 780)):
        return {
            "block_start_min": start, "block_end_min": end,
            "block_member_start_mins": list(members),
        }

    def test_valid_multi_member_group_round_trips_through_save_apply_history(self):
        prov = self._block()
        items = [
            {"type": "ic", "start_min": 720, "value": 9.5, "ic_block_provenance": prov},
            {"type": "ic", "start_min": 780, "value": 9.5, "ic_block_provenance": prov},
        ]
        self.store.save_plan_draft(items, "2026-06-01 09:00:00")
        self.assertEqual(self.store.get_plan_draft()["items"], items)
        result = self.store.apply_plan("2026-06-01 12:00:00")
        self.assertEqual(result["items"], items)
        self.assertEqual(self.store.plan_history(), [result])

    def test_wrapping_block_is_valid(self):
        prov = self._block(start=1320, end=120, members=(1320, 60))
        items = [
            {"type": "ic", "start_min": 1320, "value": 8.0, "ic_block_provenance": prov},
            {"type": "ic", "start_min": 60, "value": 8.0, "ic_block_provenance": prov},
        ]
        self.store.save_plan_draft(items, "2026-06-01 09:00:00")
        self.assertEqual(self.store.get_plan_draft()["items"], items)
        result = self.store.apply_plan("2026-06-01 12:00:00")
        self.assertEqual(result["items"], items)

    def test_all_day_block_closing_at_midnight_round_trips(self):
        # #357: the I:C analyzer publishes a profile carrying one I:C all day as
        # the single block start_min 0, end_min 1440 — the exclusive end naming
        # the first minute after the arc. That is the whole of such a wearer's
        # day, and the only block they can be offered; the bounds check read its
        # 1440 as an impossible minute of day and refused the save.
        prov = self._block(start=0, end=1440, members=(0, 420, 660, 1080))
        items = [
            {"type": "ic", "start_min": m, "value": 5.7, "ic_block_provenance": prov}
            for m in (0, 420, 660, 1080)
        ]
        self.store.save_plan_draft(items, "2026-06-01 09:00:00")
        self.assertEqual(self.store.get_plan_draft()["items"], items)
        result = self.store.apply_plan("2026-06-01 12:00:00")
        self.assertEqual(result["items"], items)
        self.assertEqual(self.store.plan_history(), [result])

    def test_block_end_outside_its_own_domain_still_rejected(self):
        # The end admits midnight and nothing past it: 1441 is off the clock, -1
        # and 0 are not ends at all, and a bool or a float is not a minute. The
        # save is refused and no draft is recorded.
        for end in (1441, -1, 0, True, 1440.0):
            with self.subTest(block_end_min=end):
                prov = self._block(start=0, end=end, members=(0, 420, 660, 1080))
                items = [
                    {"type": "ic", "start_min": m, "value": 5.7,
                     "ic_block_provenance": prov}
                    for m in (0, 420, 660, 1080)
                ]
                with self.assertRaises(ValueError):
                    self.store.save_plan_draft(items, "2026-06-01 09:00:00")
                self.assertIsNone(self.store.get_plan_draft())

    def test_truncated_single_row_claiming_two_members_rejected_on_save(self):
        prov = self._block()
        items = [{"type": "ic", "start_min": 720, "value": 9.5, "ic_block_provenance": prov}]
        with self.assertRaises(ValueError):
            self.store.save_plan_draft(items, "2026-06-01 09:00:00")

    def test_truncated_group_rejected_on_apply_even_if_inserted_directly(self):
        prov = self._block()
        items = [{"type": "ic", "start_min": 720, "value": 9.5, "ic_block_provenance": prov}]
        self.store.conn.execute(
            "INSERT INTO plan_draft (id, items_json, updated_at) VALUES (1, ?, ?)",
            (json.dumps(items), "2026-06-01 09:00:00"),
        )
        with self.assertRaises(ValueError):
            self.store.apply_plan("2026-06-01 12:00:00")
        self.assertEqual(self.store.plan_history(), [])

    def test_duplicate_member_row_rejected(self):
        prov = self._block()
        items = [
            {"type": "ic", "start_min": 720, "value": 9.5, "ic_block_provenance": prov},
            {"type": "ic", "start_min": 720, "value": 9.5, "ic_block_provenance": prov},
        ]
        with self.assertRaises(ValueError):
            self.store.save_plan_draft(items, "2026-06-01 09:00:00")

    def test_mismatched_values_rejected(self):
        prov = self._block()
        items = [
            {"type": "ic", "start_min": 720, "value": 9.5, "ic_block_provenance": prov},
            {"type": "ic", "start_min": 780, "value": 9.6, "ic_block_provenance": prov},
        ]
        with self.assertRaises(ValueError):
            self.store.save_plan_draft(items, "2026-06-01 09:00:00")

    def test_member_outside_arc_rejected(self):
        prov = self._block(members=(720, 950))  # 950 is outside [720, 900)
        items = [
            {"type": "ic", "start_min": 720, "value": 9.5, "ic_block_provenance": prov},
            {"type": "ic", "start_min": 950, "value": 9.5, "ic_block_provenance": prov},
        ]
        with self.assertRaises(ValueError):
            self.store.save_plan_draft(items, "2026-06-01 09:00:00")

    def test_unannotated_ic_rows_save_and_apply_fine(self):
        items = [{"type": "ic", "start_min": 720, "value": 9.5}]
        self.store.save_plan_draft(items, "2026-06-01 09:00:00")
        self.assertEqual(self.store.get_plan_draft()["items"], items)
        result = self.store.apply_plan("2026-06-01 12:00:00")
        self.assertEqual(result["items"], items)

    def test_revert_style_row_with_only_type_start_min_value_saves_and_applies(self):
        # Revert stages the prior server value with no provenance decoration.
        items = [{"type": "ic", "start_min": 720, "value": 10}]
        self.store.save_plan_draft(items, "2026-06-01 09:00:00")
        result = self.store.apply_plan("2026-06-01 12:00:00")
        self.assertEqual(result["items"], items)


class MigrationTest(unittest.TestCase):
    """Opening a pre-F1 database adds the new columns/tables in place (the real
    ciq.db already exists and must survive an upgrade)."""

    def test_rekeys_legacy_basal_table_on_seq_num_wiping_rows(self):
        # A pre-#194 basal table keyed on (t, delivery_type) is dropped and
        # recreated keyed on seq_num; its rows can't be back-keyed (a doubled
        # store can't be de-conflated in place) so they're discarded for the next
        # fetch to repopulate. Everything else about the open is unaffected.
        with tempfile.NamedTemporaryFile(suffix=".db") as f:
            conn = sqlite3.connect(f.name)
            conn.executescript(
                "CREATE TABLE basal_events (t TEXT NOT NULL, delivery_type TEXT NOT NULL, "
                "duration_mins REAL, basal_rate REAL, PRIMARY KEY (t, delivery_type));"
                "INSERT INTO basal_events VALUES ('2026-06-01 00:00:00','profileDelivery',5,0.6);"
            )
            conn.commit()
            conn.close()
            with Store.open(f.name) as store:
                self.assertEqual(store.basal_events(), [])
                cols = {r["name"] for r in
                        store.conn.execute("PRAGMA table_info(basal_events)")}
                self.assertIn("seq_num", cols)
                # The #125 carb log is a manual store, deliberately kept out of
                # counts() (which tracks the synced feeds' data quality).
                self.assertNotIn("carb_entries", store.counts())

    def test_migration_advances_durable_revision_once(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as f:
            conn = sqlite3.connect(f.name)
            conn.execute("CREATE TABLE profile_settings (captured_at TEXT PRIMARY KEY)")
            conn.commit()
            conn.close()
            with Store.open(f.name) as store:
                self.assertEqual(store.input_data_revision(), 1)

    def test_rekeys_legacy_bolus_iob_pump_tables_wiping_rows(self):
        # Pre-#198 bolus/iob/pump tables keyed on derived tuples with no seq_num.
        # A wrong-tz fetch doubled them as +7h phantoms that can't be de-conflated
        # in place, so open drops and recreates each keyed on seq_num; their rows
        # are discarded for the next fetch to repopulate. (The additive-column
        # ALTERs those tables used before are gone — a fresh recreate carries every
        # column.) The carb log, keyed on its own id, is untouched.
        with tempfile.NamedTemporaryFile(suffix=".db") as f:
            conn = sqlite3.connect(f.name)
            conn.executescript(
                "CREATE TABLE bolus_events (t TEXT NOT NULL, description TEXT NOT NULL, "
                "insulin REAL, PRIMARY KEY (t, description, insulin));"
                "INSERT INTO bolus_events VALUES ('2026-06-01 08:00:00','Bolus',1.4);"
                "CREATE TABLE iob_events (t TEXT NOT NULL, iob REAL, event_id TEXT NOT NULL, "
                "PRIMARY KEY (t, event_id));"
                "INSERT INTO iob_events VALUES ('2026-06-01 08:00:00',0.5,'81');"
                "CREATE TABLE pump_events (t TEXT NOT NULL, event_type TEXT NOT NULL, "
                "duration_mins REAL, PRIMARY KEY (t, event_type));"
                "INSERT INTO pump_events VALUES ('2026-06-01 08:00:00','Sleep',420);"
            )
            conn.commit()
            conn.close()
            with Store.open(f.name) as store:
                self.assertEqual(store.bolus_events(), [])
                self.assertEqual(store.iob_events(), [])
                self.assertEqual(store.pump_events(), [])
                for table in ("bolus_events", "iob_events", "pump_events"):
                    cols = {r["name"] for r in
                            store.conn.execute(f"PRAGMA table_info({table})")}
                    self.assertIn("seq_num", cols)

    def test_adds_159_dose_columns_to_existing_seqnum_bolus_table(self):
        # Regression (#159): a bolus_events table that already carries seq_num (a
        # post-#198 DB) is NOT recreated by the re-key — it's a no-op once seq_num
        # exists — so the #159 dose-stamped columns must be added by the additive
        # ALTER. Before the fix they were silently missing and the next fetch died on
        # "table bolus_events has no column named isf". Existing rows survive.
        with tempfile.NamedTemporaryFile(suffix=".db") as f:
            conn = sqlite3.connect(f.name)
            # The pre-#159 bolus_events shape: seq_num-keyed (post-#198) with every
            # column *except* the three #159 dose-stamped ones.
            conn.executescript(
                "CREATE TABLE bolus_events (seq_num INTEGER NOT NULL, t TEXT NOT NULL, "
                "description TEXT NOT NULL, completion TEXT, insulin REAL, "
                "requested_insulin REAL, carbs REAL, bg REAL, user_override INTEGER, "
                "extended INTEGER, completion_t TEXT, bolus_options INTEGER, "
                "correction_insulin REAL, food_insulin REAL, pump_iob REAL, "
                "selected_iob INTEGER, standard_percent INTEGER, extended_duration INTEGER, "
                "declined_correction INTEGER, PRIMARY KEY (seq_num));"
                "INSERT INTO bolus_events (seq_num, t, description, insulin) "
                "VALUES (5,'2026-06-01 08:00:00','Bolus',1.4);"
            )
            conn.commit()
            conn.close()
            with Store.open(f.name) as store:
                cols = {r["name"] for r in
                        store.conn.execute("PRAGMA table_info(bolus_events)")}
                for c in ("isf", "target_bg", "carb_ratio"):
                    self.assertIn(c, cols)
                # The pre-existing seq_num-keyed row survived (not wiped).
                self.assertEqual(len(store.bolus_events()), 1)
                # And a fresh upsert carrying the dose-stamped settings now works.
                store.upsert_bolus([{
                    "seq_num": 6, "request_time": "2026-06-02 12:00:00",
                    "description": "Bolus", "insulin": 5.0, "carbs": 40,
                    "isf": 45, "target_bg": 110, "carb_ratio": 8.0,
                }])
                row = next(b for b in store.bolus_events() if b.isf == 45)
                self.assertEqual(row.carb_ratio, 8.0)

    def test_migration_creates_carb_log_tables_on_existing_db(self):
        """A DB predating the #125 carb log gains carb_entries + prompt_responses on
        open, existing rows untouched (ADR 0003's DROP of the dead event-48
        carb_entries is retired now that a real manual carb source exists)."""
        with tempfile.NamedTemporaryFile(suffix=".db") as f:
            conn = sqlite3.connect(f.name)
            conn.executescript(
                "CREATE TABLE basal_events (t TEXT NOT NULL, delivery_type TEXT NOT NULL, "
                "duration_mins REAL, basal_rate REAL, PRIMARY KEY (t, delivery_type));"
                "INSERT INTO basal_events VALUES ('2026-06-01 00:00:00','profileDelivery',5,0.6);"
            )
            conn.commit()
            conn.close()
            with Store.open(f.name) as store:
                # The legacy basal rows are wiped by the #194 re-key (covered
                # above); this test's subject is the carb-log tables appearing.
                self.assertEqual(store.basal_events(), [])
                names = {r["name"] for r in store.conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'")}
                self.assertIn("carb_entries", names)
                self.assertIn("prompt_responses", names)
                # Freshly created and empty; usable through the typed readers.
                self.assertEqual(store.carb_entries(), [])
                self.assertEqual(store.prompt_responses(), [])


class CarbLogTest(unittest.TestCase):
    """The #125 unbolused-carb log: carb_entries + prompt_responses store methods."""

    def setUp(self):
        self.store = Store.open(":memory:")
        self.t = datetime(2026, 7, 2, 13, 30, 0)

    def tearDown(self):
        self.store.close()

    def test_upsert_insert_then_list(self):
        cid = self.store.upsert_carb_entry(
            CarbEntry(self.t, 15.0, "estimate", "manual", note="apple"))
        self.assertIsInstance(cid, int)
        rows = self.store.carb_entries()
        self.assertEqual(len(rows), 1)
        e = rows[0]
        self.assertEqual((e.t, e.grams, e.certainty, e.source, e.note),
                         (self.t, 15.0, "estimate", "manual", "apple"))
        self.assertIsInstance(e.created_at, datetime)  # stamped at insert

    def test_upsert_update_keeps_created_at(self):
        cid = self.store.upsert_carb_entry(CarbEntry(self.t, 15.0, "estimate", "manual"))
        created = self.store.carb_entries()[0].created_at
        # Edit grams/certainty; created_at must not move.
        self.store.upsert_carb_entry(
            CarbEntry(self.t, 20.0, "exact", "manual"), id=cid)
        rows = self.store.carb_entries()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].grams, 20.0)
        self.assertEqual(rows[0].certainty, "exact")
        self.assertEqual(rows[0].created_at, created)

    def test_unknown_certainty_stores_null_grams(self):
        self.store.upsert_carb_entry(CarbEntry(self.t, None, "unknown", "low-prompt"))
        self.assertIsNone(self.store.carb_entries()[0].grams)

    def test_list_is_windowed_and_chronological(self):
        earlier = datetime(2026, 7, 1, 8, 0, 0)
        self.store.upsert_carb_entry(CarbEntry(self.t, 10.0, "exact", "manual"))
        self.store.upsert_carb_entry(CarbEntry(earlier, 5.0, "exact", "manual"))
        self.assertEqual([e.t for e in self.store.carb_entries()], [earlier, self.t])
        windowed = self.store.carb_entries(start="2026-07-02 00:00:00")
        self.assertEqual([e.t for e in windowed], [self.t])

    def test_delete_removes_entry(self):
        cid = self.store.upsert_carb_entry(CarbEntry(self.t, 10.0, "exact", "manual"))
        self.assertEqual(self.store.delete_carb_entry(cid), 1)
        self.assertEqual(self.store.carb_entries(), [])
        self.assertEqual(self.store.delete_carb_entry(cid), 0)  # already gone

    def test_record_prompt_response_negative_and_abstain(self):
        # "no" / "not-sure" are first-class stored labels, not dismissals.
        self.store.record_prompt_response(detector="low", anchor_t=self.t, answer="no")
        self.store.record_prompt_response(
            detector="missed-meal", anchor_t=self.t, answer="not-sure")
        answers = {r["answer"] for r in self.store.prompt_responses()}
        self.assertEqual(answers, {"no", "not-sure"})
        # No carb entry is created for a negative/abstain answer.
        self.assertEqual(self.store.carb_entries(), [])

    def test_atomic_create_entry_and_response(self):
        carb_id, resp_id = self.store.record_carb_entry_with_response(
            CarbEntry(self.t, 8.0, "estimate", "rise-prompt"),
            detector="missed-meal", anchor_t=self.t)
        self.assertEqual(len(self.store.carb_entries()), 1)
        resps = self.store.prompt_responses()
        self.assertEqual(len(resps), 1)
        self.assertEqual(resps[0]["answer"], "carbs")
        self.assertEqual(resps[0]["carb_entry_id"], carb_id)
        self.assertEqual(resps[0]["id"], resp_id)

    def test_delete_carb_entry_cascades_to_prompt_response(self):
        # The prompt "resurrects" — deleting the entry drops its response row so the
        # recomputed (detector, anchor_t) prompt asks again.
        carb_id, resp_id = self.store.record_carb_entry_with_response(
            CarbEntry(self.t, 8.0, "estimate", "rise-prompt"),
            detector="missed-meal", anchor_t=self.t)
        self.assertEqual(len(self.store.prompt_responses()), 1)
        self.store.delete_carb_entry(carb_id)
        self.assertEqual(self.store.prompt_responses(), [])
        self.assertEqual(self.store.carb_entries(), [])

    def test_manual_response_not_cascaded_by_unrelated_delete(self):
        # A standalone entry with no response, and a separate negative response, are
        # independent: deleting the entry leaves the unrelated response intact.
        cid = self.store.upsert_carb_entry(CarbEntry(self.t, 10.0, "exact", "manual"))
        self.store.record_prompt_response(detector="low", anchor_t=self.t, answer="no")
        self.store.delete_carb_entry(cid)
        self.assertEqual(len(self.store.prompt_responses()), 1)

    # --- #126: id-bearing readers the HTTP CRUD layer serializes -------------

    def test_list_carb_entries_is_id_bearing_and_windowed(self):
        earlier = datetime(2026, 7, 1, 8, 0, 0)
        c1 = self.store.upsert_carb_entry(CarbEntry(self.t, 10.0, "exact", "manual"))
        c0 = self.store.upsert_carb_entry(CarbEntry(earlier, 5.0, "exact", "manual"))
        rows = self.store.list_carb_entries()
        # dicts, chronological, carrying the surrogate id the typed reader drops.
        self.assertEqual([r["id"] for r in rows], [c0, c1])
        self.assertEqual(rows[0]["grams"], 5.0)
        self.assertEqual(set(rows[0]),
                         {"id", "t", "grams", "certainty", "source", "note", "created_at"})
        windowed = self.store.list_carb_entries(start="2026-07-02 00:00:00")
        self.assertEqual([r["id"] for r in windowed], [c1])

    def test_get_carb_entry_returns_dict_or_none(self):
        cid = self.store.upsert_carb_entry(
            CarbEntry(self.t, None, "unknown", "manual", note="snack"))
        got = self.store.get_carb_entry(cid)
        self.assertEqual(got["id"], cid)
        self.assertIsNone(got["grams"])
        self.assertEqual(got["note"], "snack")
        self.assertIsNone(self.store.get_carb_entry(9999))


class SeqNumRekeyTest(unittest.TestCase):
    """#198: bolus/iob/pump key on the pump's seqNum, so the same event re-pulled
    with a shifted store time (a wrong-tz fetch stored the whole history +7h)
    merges instead of doubling — and a missing seqNum fails loudly rather than
    rowid-alias into a silent duplicate."""

    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_bolus_repull_shifted_time_merges_on_seq_num(self):
        base = {"seq_num": 5, "description": "Bolus", "insulin": 2.0}
        self.store.upsert_bolus([{"request_time": "2026-06-01 18:40:00", **base}])
        # Same seqNum, +7h phantom time — must overwrite, not double.
        self.store.upsert_bolus([{"request_time": "2026-06-02 01:40:00", **base}])
        rows = self.store.bolus_events()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].t, datetime(2026, 6, 2, 1, 40, 0))

    def test_bolus_reads_retain_seq_num_and_order_timestamp_ties(self):
        at = "2026-06-01 18:40:00"
        self.store.upsert_bolus([
            {"seq_num": 9, "request_time": at, "description": "Bolus",
             "insulin": 2.0, "carbs": 20.0},
            {"seq_num": 5, "request_time": at, "description": "Bolus",
             "insulin": 3.0, "carbs": 30.0},
        ])

        rows = self.store.bolus_events()

        self.assertEqual([row.seq_num for row in rows], [5, 9])

    def test_iob_repull_shifted_time_merges_on_seq_num(self):
        self.store.upsert_iob([{"seq_num": 9, "time": "2026-06-01 18:40:00",
                                "iob": 0.6, "event_id": "81"}])
        self.store.upsert_iob([{"seq_num": 9, "time": "2026-06-02 01:40:00",
                                "iob": 0.6, "event_id": "81"}])
        self.assertEqual(len(self.store.iob_events()), 1)

    def test_pump_repull_shifted_time_merges_on_seq_num(self):
        self.store.upsert_pump([{"seq_num": 3, "time": "2026-06-01 18:40:00",
                                 "event_type": "Sleep", "duration_mins": 420}])
        self.store.upsert_pump([{"seq_num": 3, "time": "2026-06-02 01:40:00",
                                 "event_type": "Sleep", "duration_mins": 420}])
        self.assertEqual(len(self.store.pump_events()), 1)

    def test_missing_seq_num_fails_loudly(self):
        with self.assertRaises(ValueError):
            self.store.upsert_bolus([{"request_time": "2026-06-01 18:40:00",
                                      "description": "Bolus", "insulin": 2.0}])
        with self.assertRaises(ValueError):
            self.store.upsert_iob([{"time": "2026-06-01 18:40:00", "iob": 0.6,
                                    "event_id": "81"}])
        with self.assertRaises(ValueError):
            self.store.upsert_pump([{"time": "2026-06-01 18:40:00",
                                     "event_type": "Sleep", "duration_mins": 420}])


class ConnectionConcurrencyTest(unittest.TestCase):
    """#241: ``serve`` runs the API and the hourly fetch loop in one process, so
    many short-lived reader connections share the DB file with one background
    writer doing large multi-window upserts. In SQLite's default rollback-journal
    mode a reader holding a transaction blocks the writer's commit, which surfaced
    as ``database is locked`` and killed the fetch mid-run. ``Store.open`` must
    open the file in WAL mode with a busy_timeout so they no longer contend.

    Uses a file-backed DB, not ``:memory:`` — WAL and cross-connection locking
    only exist for on-disk databases.
    """

    def setUp(self):
        self._dir = tempfile.mkdtemp()
        self.path = os.path.join(self._dir, "ciq.db")

    def tearDown(self):
        # Also drops the -wal/-shm sidecars WAL creates.
        shutil.rmtree(self._dir, ignore_errors=True)

    def test_open_puts_a_file_db_in_wal_mode(self):
        with Store.open(self.path) as store:
            mode = store.conn.execute("PRAGMA journal_mode").fetchone()[0]
        self.assertEqual(mode.lower(), "wal")

    def test_open_sets_a_generous_busy_timeout(self):
        with Store.open(self.path) as store:
            timeout = store.conn.execute("PRAGMA busy_timeout").fetchone()[0]
        self.assertGreaterEqual(timeout, 30000)

    def test_reader_does_not_block_a_concurrent_writer(self):
        # The exact reported failure: an API read holding a transaction open while
        # the fetch commits a window. Under WAL the writer proceeds; under the old
        # rollback journal this raised ``sqlite3.OperationalError: database is
        # locked``. Two independent connections, no threads — fully deterministic.
        with Store.open(self.path) as reader, Store.open(self.path) as writer:
            reader.conn.execute("BEGIN")
            reader.conn.execute("SELECT COUNT(*) FROM cgm_readings").fetchall()
            try:
                writer.record_fetch_result(
                    attempted_at="2026-07-07 00:00:00", ok=True, written={})
            except sqlite3.OperationalError as e:  # pragma: no cover - the bug
                self.fail(f"writer blocked by an open reader: {e}")


class FocusStoreTest(unittest.TestCase):
    """The Focus table — the one persisted watched-change object (#244)."""

    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_pin_active_list_roundtrip(self):
        row = self.store.pin_focus("late_bolus", "2026-07-01 08:00:00")
        self.assertEqual(row["lever"], "late_bolus")
        self.assertEqual(row["status"], "active")
        self.assertIsInstance(row["id"], int)
        active = self.store.active_focus()
        self.assertEqual(active["lever"], "late_bolus")
        self.assertEqual(active["id"], row["id"])
        self.assertEqual([f["lever"] for f in self.store.list_focuses()], ["late_bolus"])

    def test_one_active_invariant(self):
        self.store.pin_focus("late_bolus", "2026-07-01 08:00:00")
        with self.assertRaises(FocusAlreadyActive):
            self.store.pin_focus("over_treated_low", "2026-07-02 08:00:00")

    def test_resolve_frees_the_slot_and_allows_repin(self):
        first = self.store.pin_focus("late_bolus", "2026-07-01 08:00:00")
        self.assertTrue(self.store.resolve_focus(first["id"], "resolved"))
        self.assertIsNone(self.store.active_focus())
        # Slot freed → a new pin succeeds; both rows survive in the list.
        second = self.store.pin_focus("over_treated_low", "2026-07-05 08:00:00")
        self.assertEqual(self.store.active_focus()["id"], second["id"])
        self.assertEqual(len(self.store.list_focuses()), 2)

    def test_resolve_is_idempotent_on_closed_row(self):
        row = self.store.pin_focus("late_bolus", "2026-07-01 08:00:00")
        self.assertTrue(self.store.resolve_focus(row["id"], "dropped"))
        # Already closed → no active row moves, returns False (no resurrection).
        self.assertFalse(self.store.resolve_focus(row["id"], "resolved"))
        self.assertEqual(self.store.list_focuses()[0]["status"], "dropped")

    def test_dropped_status_persists(self):
        row = self.store.pin_focus("late_bolus", "2026-07-01 08:00:00")
        self.store.resolve_focus(row["id"], "dropped")
        self.assertIsNone(self.store.active_focus())
        self.assertEqual(self.store.list_focuses()[0]["status"], "dropped")

    def test_invalid_status_rejected(self):
        row = self.store.pin_focus("late_bolus", "2026-07-01 08:00:00")
        with self.assertRaises(ValueError):
            self.store.resolve_focus(row["id"], "paused")


if __name__ == "__main__":
    unittest.main()
