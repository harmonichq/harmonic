"""Per-window fetch resilience for :func:`ciq_autotune.sync.pull_from_tconnect`.

The live login/pull is untestable without real credentials (CLAUDE.md), so
these drive the window-iteration seam :func:`ciq_autotune.sync._pull_windows`
directly with a fake ``tconnect`` whose ``pump_events`` yields canned events per
window (and can raise on the Nth), covering the contract the epic asked for:
completed windows persist, a mid-run failure surfaces as ``PartialFetchError``,
and a clean multi-window run matches the old single-pass aggregate.
"""

import itertools
import os
import tempfile
import unittest
from unittest import mock

from ciq_autotune.store import Store
from ciq_autotune.sync import PartialFetchError, _pull_windows, pull_from_tconnect
from ciq_autotune.tandemsource_map import events_to_rows


class _LidCgmDataG7:
    """Minimal stand-in for an upstream CGM event (matched by class name)."""

    # events_to_rows buckets on ``type(ev).__name__``; expose the real name.
    __name__ = "LidCgmDataG7"

    def __init__(self, t, bg=120):
        self.eventTimestamp = t
        # 3.0.0 attribute names (camelCase); see tandemsource_map + #237.
        self.egvTimeStamp = None  # -> _cgm_time falls back to eventTimestamp
        self.currentGlucoseDisplayValue = bg
        self.glucoseValueStatusRaw = 0


# type(ev).__name__ is what events_to_rows reads, so the class itself must be
# named LidCgmDataG7 — set it explicitly rather than naming the Python class.
_LidCgmDataG7.__name__ = "LidCgmDataG7"
_LidCgmDataG7.__qualname__ = "LidCgmDataG7"


def _cgm_events(day, n):
    """``n`` unique CGM events on ``day`` (5-min spaced) for stable row counts."""
    return [_LidCgmDataG7(f"2026-{day:02d}-01 00:{5 * i:02d}:00") for i in range(n)]


class _FakeTandemSource:
    def __init__(self, events_by_window, *, fail_on=None, exc=None):
        self.events_by_window = events_by_window
        self.fail_on = fail_on  # 0-based window index to raise on, or None
        self.exc = exc or RuntimeError("network blip")
        self.calls = []

    def pump_events(self, device_id, start, end, fetch_all_event_types=False):
        idx = len(self.calls)
        self.calls.append((start, end))
        if self.fail_on is not None and idx == self.fail_on:
            raise self.exc
        return iter(self.events_by_window[idx])


class _FakeTConnect:
    def __init__(self, tandemsource):
        self.tandemsource = tandemsource


# A 3-window span (>62 days forces three <=31-day windows).
_START, _END = "2026-01-01", "2026-03-15"
_EVENTS = [_cgm_events(1, 3), _cgm_events(2, 4), _cgm_events(3, 5)]


def _tmp_store():
    tmp = tempfile.NamedTemporaryFile(suffix=".db")
    return tmp, Store.open(tmp.name)


class PullWindowsTest(unittest.TestCase):
    def test_windows_tile_and_all_persist_on_clean_run(self):
        fake = _FakeTConnect(_FakeTandemSource(_EVENTS))
        tmp, store = _tmp_store()
        with tmp, store:
            written = _pull_windows(store, fake, "dev", _START, _END)
            self.assertEqual(fake.tandemsource.calls and len(fake.tandemsource.calls), 3)
            self.assertEqual(written["cgm_readings"], 3 + 4 + 5)
            # rows really landed in the store
            self.assertEqual(len(store.cgm_readings(None, None)), 12)

    def test_clean_run_matches_single_pass_aggregate(self):
        # Old behaviour: chain every window into one events_to_rows pass, upsert once.
        tmp_a, store_a = _tmp_store()
        with tmp_a, store_a:
            rows = events_to_rows(itertools.chain.from_iterable(
                iter(w) for w in _EVENTS))
            single = {
                "basal_events": store_a.upsert_basal(rows["basal"]),
                "bolus_events": store_a.upsert_bolus(rows["bolus"]),
                "cgm_readings": store_a.upsert_cgm(rows["cgm"]),
                "iob_events": store_a.upsert_iob(rows["iob"]),
                "pump_events": store_a.upsert_pump(rows["pump"]),
            }
        fake = _FakeTConnect(_FakeTandemSource(_EVENTS))
        tmp_b, store_b = _tmp_store()
        with tmp_b, store_b:
            per_window = _pull_windows(store_b, fake, "dev", _START, _END)
        self.assertEqual(per_window, single)

    def test_mid_run_failure_keeps_completed_windows(self):
        fake = _FakeTConnect(_FakeTandemSource(_EVENTS, fail_on=2))
        tmp, store = _tmp_store()
        with tmp, store:
            with self.assertRaises(PartialFetchError) as ctx:
                _pull_windows(store, fake, "dev", _START, _END)
            # windows 0 and 1 upserted before window 2 raised
            self.assertEqual(len(store.cgm_readings(None, None)), 3 + 4)
        err = ctx.exception
        self.assertEqual(err.windows_completed, 2)
        self.assertEqual(err.windows_total, 3)
        self.assertEqual(err.written["cgm_readings"], 3 + 4)
        self.assertIn("2 of 3 windows", str(err))
        self.assertIsInstance(err.__cause__, RuntimeError)

    def test_first_window_failure_is_ordinary_error(self):
        fake = _FakeTConnect(_FakeTandemSource(_EVENTS, fail_on=0,
                                               exc=ValueError("login failed")))
        tmp, store = _tmp_store()
        with tmp, store:
            # nothing completed -> raw error, not PartialFetchError
            with self.assertRaises(ValueError):
                _pull_windows(store, fake, "dev", _START, _END)
            self.assertEqual(len(store.cgm_readings(None, None)), 0)


class TimezoneGuardTest(unittest.TestCase):
    """#198: a fetch must refuse to run when TIMEZONE_NAME is unset rather than
    ingest tz-aware pump timestamps against a silent UTC default (+7h phantoms).
    The guard fires before the network login or the ``sync`` extra import, so it
    is reachable without credentials."""

    def test_fetch_refuses_without_timezone_name(self):
        env = {k: v for k, v in os.environ.items() if k != "TIMEZONE_NAME"}
        tmp, store = _tmp_store()
        with tmp, store, mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(RuntimeError) as ctx:
                pull_from_tconnect(store, start=_START, end=_END)
            self.assertIn("TIMEZONE_NAME", str(ctx.exception))


def _seg(start, basal_mu, isf, cr_mu, target):
    return {"startTime": start, "basalRate": basal_mu, "isf": isf,
            "carbRatio": cr_mu, "targetBg": target}


def _details_blob():
    """A 3.0.0 ``settings.details`` blob (the shape ``parse_pump_settings`` wants)."""
    pad = [_seg(0, 0, 0, 0, 0)] * 15
    return {
        "profiles": {
            "activeIdp": 4,
            "profile": [
                {"name": "4", "idp": 4, "insulinDuration": 300, "carbEntry": 1,
                 "maxBolus": 15000, "tDependentSegs": [_seg(0, 600, 30, 7000, 110)] + pad},
            ],
        },
        "cgmSettings": {},
    }


class CaptureSettingsSnapshotTest(unittest.TestCase):
    """#229: tconnectsync 3.0.0 `choose()` returns the raw `BffPump`, so
    `device["settings"]` is the `PumpSettingsEnvelope` `{settingsHash, details}`
    — the blob `parse_pump_settings` wants lives at `settings["details"]`. Feed a
    3.0.0-shaped device dict and assert the profile actually parses (a nonzero
    snapshot), guarding against silently re-passing the envelope."""

    def test_unwraps_3_0_0_envelope_and_writes_nonzero(self):
        from ciq_autotune.sync import _capture_settings_snapshot

        device = {"settings": {"settingsHash": "abc", "details": _details_blob()}}
        tmp, store = _tmp_store()
        with tmp, store:
            written = _capture_settings_snapshot(store, device)
        self.assertGreater(written, 0)

    def test_missing_details_returns_zero(self):
        from ciq_autotune.sync import _capture_settings_snapshot

        tmp, store = _tmp_store()
        with tmp, store:
            self.assertEqual(_capture_settings_snapshot(store, {"settings": None}), 0)
            self.assertEqual(_capture_settings_snapshot(store, {"settings": {}}), 0)


if __name__ == "__main__":
    unittest.main()
