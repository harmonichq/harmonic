"""analyze() facade integration test (F3b).

Builds a small store, runs the whole model, and checks the assembled
AnalysisResult is well-formed, setting-epoch metadata-aware, and JSON-serializable.
"""

import json
import random
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from ciq_autotune.analyze import analyze
from ciq_autotune.events import CarbEntry
from ciq_autotune.findings_projection import FindingsProjection, WindowQuery
from ciq_autotune.model import ModelConfig
from ciq_autotune.result import SCHEMA_VERSION, SegmentEstimate
from ciq_autotune.settings import parse_pump_settings
from ciq_autotune.store import Store
from ciq_autotune.uncertainty import Estimate


def _raw_settings(isf=30, cr_mu=6000):
    pad = [{"startTime": 0, "basalRate": 0, "isf": 0, "carbRatio": 0, "targetBg": 0}] * 15
    return {"profiles": {"activeIdp": 4, "profile": [
        {"name": "4", "idp": 4, "insulinDuration": 300, "carbEntry": 1, "maxBolus": 15000,
         "tDependentSegs": [{"startTime": 0, "basalRate": 600, "isf": isf,
                             "carbRatio": cr_mu, "targetBg": 110}] + pad}]},
            "cgmSettings": {}}


def _seed_store():
    store = Store.open(":memory:")
    # A few nights of clean basal + CGM over several days.
    basal, cgm = [], []
    for d in range(1, 8):
        t0 = datetime(2026, 6, d, 0, 0, 0)
        for k in range(72):  # 6h of 5-min samples
            tt = t0 + timedelta(minutes=5 * k)
            basal.append({"seq_num": int(tt.strftime("%Y%m%d%H%M%S")),
                          "time": tt.strftime("%Y-%m-%d %H:%M:%S"),
                          "delivery_type": "algorithmDelivery", "duration_mins": 5,
                          "basal_rate": 0.8, "profile_basal_rate": 0.6})
            cgm.append({"EventDateTime": tt.strftime("%Y-%m-%dT%H:%M:%S"),
                        "Readings (CGM / BGM)": 120, "Description": "EGV"})
    store.upsert_basal(basal)
    store.upsert_cgm(cgm)
    store.upsert_settings_snapshot("2026-06-07 09:00:00", parse_pump_settings(_raw_settings()))
    return store


class AnalyzeFacadeTest(unittest.TestCase):
    def setUp(self):
        self.store = _seed_store()
        self.result = analyze(self.store, window_days=30,
                              now=datetime(2026, 6, 8, 0, 0, 0))

    def tearDown(self):
        self.store.close()

    def test_result_is_versioned_and_json_serializable(self):
        d = self.result.to_dict()
        self.assertEqual(d["schema_version"], SCHEMA_VERSION)
        self.assertIn("ic_history", d)
        json.dumps(d)  # must not raise

    def test_carb_entry_excludes_basal_minutes_through_the_facade(self):
        # #127: the unbolused-carb stream is now a live exclusion signal wired into
        # every analyzer. An entry inside the clean 00:00–06:00 fixture bars the
        # basal minutes around it, so the assembled result *changes* — the 03:00
        # slot loses that day's clean minutes. (Slice 1 proved plumbing; this proves
        # the plumbing has teeth.)
        now = datetime(2026, 6, 8, 0, 0, 0)
        # Recorded live, minutes after the carbs — so it is eligible at this replay's
        # `now` (#467). Without an explicit created_at the store stamps the real wall
        # clock, which sits after this past endpoint and would (correctly) exclude the
        # entry, defeating the exclusion-plumbing this test is asserting.
        self.store.upsert_carb_entry(
            CarbEntry(datetime(2026, 6, 5, 3, 0, 0), 12.0, "estimate", "low-prompt",
                      created_at=datetime(2026, 6, 5, 3, 5, 0)))

        def slot_0300(result):
            return next(s for s in result.basal if s.label == "03:00")

        base = analyze(self.store, window_days=30, now=now)
        with_carbs = analyze(self.store, window_days=30, now=now,
                             carb_entries=self.store.carb_entries())
        # One day's 03:00 clean minutes drop out; the rest stay.
        self.assertEqual(slot_0300(with_carbs).days, slot_0300(base).days - 1)
        self.assertLess(slot_0300(with_carbs).estimate.n,
                        slot_0300(base).estimate.n)

    def test_current_endpoint_boundary_backfill_equals_absence(self):
        # #467: today's `analyze` endpoint applies created-at eligibility to the carb
        # exclusion stream. Proven here through the RETURNED AnalysisResult (not analyzer
        # kwargs): the same in-window carb masks an 03:00 clean day only when it was
        # recorded by `now`; recorded after this historical endpoint it is invisible —
        # behaviourally identical to no carb at all.
        now = datetime(2026, 6, 8, 0, 0, 0)

        def slot_0300_days(created_at):
            store = _seed_store()
            try:
                if created_at is not None:
                    store.upsert_carb_entry(
                        CarbEntry(datetime(2026, 6, 5, 3, 0, 0), 12.0, "estimate",
                                  "low-prompt", created_at=created_at))
                res = analyze(store, window_days=30, now=now,
                              carb_entries=store.carb_entries())
                return next(s for s in res.basal if s.label == "03:00").days
            finally:
                store.close()

        absent = slot_0300_days(None)
        live = slot_0300_days(datetime(2026, 6, 5, 3, 5, 0))       # recorded at the event
        backfilled = slot_0300_days(datetime(2026, 6, 20, 9, 0, 0))  # after `now`
        self.assertEqual(live, absent - 1)      # a live entry masks that day's minutes
        self.assertEqual(backfilled, absent)    # a late backfill can't reach back

    def test_all_sections_present(self):
        r = self.result
        self.assertEqual(len(r.basal), 48)            # full day of basal slots
        self.assertGreaterEqual(len(r.isf), 1)
        self.assertGreaterEqual(len(r.ic), 1)
        self.assertEqual({e.parameter for e in r.epochs},
                         {"basal_rate", "isf", "carb_ratio"})

    def test_basal_estimate_recovers_delivered_rate(self):
        slot = next(s for s in self.result.basal if s.label == "03:00")
        self.assertAlmostEqual(slot.estimate.value, 0.8, places=2)
        self.assertAlmostEqual(slot.current, 0.6, places=2)

    def test_isf_segment_carries_programmed_value(self):
        self.assertEqual(self.result.isf[0].current, 30.0)

    def test_consolidated_basal_is_populated_at_build_time(self):
        # #92: analyze() populates consolidated_basal (was derived on-read by the
        # renderers) so the API JSON carries it directly.
        cb = self.result.consolidated_basal
        self.assertIsNotNone(cb)
        self.assertLessEqual(len(cb.segments), cb.max_segments)
        self.assertEqual(cb.max_segments, 16)

    def test_populated_consolidated_carries_four_params(self):
        # #98: analyze() builds the unified four-parameter profile off the #105
        # effective-settings seam, so every segment names basal + ISF + I:C +
        # target (carried forward from the programmed profile where unchanged) —
        # not just a basal rate.
        cb = self.result.consolidated_basal
        self.assertTrue(cb.segments)
        for seg in cb.segments:
            self.assertIsNotNone(seg.basal_rate)
            self.assertIsNotNone(seg.isf)
            self.assertIsNotNone(seg.carb_ratio)
            self.assertIsNotNone(seg.target_bg)

    def test_populated_basal_rate_matches_basal_only_derive(self):
        # The basal *rate* track is still the basal-only consolidation of the raw
        # 48 slots — the four-param growth only adds the other three params and
        # splits at their boundaries; it never moves a basal number. Compare the
        # basal step function (rate at each boundary) between the two.
        from ciq_autotune.analyzers.basal import consolidate_profile
        basal_only = consolidate_profile(self.result.basal)
        # Basal-only boundaries must all appear (as a subset) in the unified profile
        # with the same rate; the unified profile may have extra boundaries from the
        # ISF/I:C/target unions, but each carries the basal rate in force there.
        unified = {s.start_min: s.basal_rate for s in self.result.consolidated_basal.segments}
        for seg in basal_only.segments:
            self.assertEqual(unified.get(seg.start_min), seg.basal_rate)

    def test_single_snapshot_flags_unverified_isf_history(self):
        notes = " ".join(self.result.data_quality.notes)
        self.assertIn("verified only since", notes)

    def test_isf_strengthen_check_reads_a_separate_prior_weekly_endpoint(self):
        # #413: do not split this run's nights into pretend decision points. The
        # facade must run the prior endpoint through the analyzer, then pass that
        # independently-qualified signal into today's call.
        from ciq_autotune.analyzers.isf import analyze_isf as real_analyze_isf
        with patch("ciq_autotune.analyze.analyze_isf", wraps=real_analyze_isf) as spy:
            analyze(self.store, window_days=30, now=datetime(2026, 6, 8, 0, 0, 0))
        self.assertEqual(spy.call_count, 2)
        prior, current = spy.call_args_list
        self.assertLessEqual(max(r.t for r in prior.args[2]),
                             datetime(2026, 6, 1, 0, 0, 0))
        self.assertGreater(max(r.t for r in current.args[2]),
                           max(r.t for r in prior.args[2]))
        self.assertIn("prior_strengthen_signal", current.kwargs)
        self.assertFalse(current.kwargs["prior_strengthen_signal"])

    def test_isf_strengthen_requires_two_facade_decision_endpoints(self):
        # The analyzer's actual night-vote policy is covered in test_analyzer_isf.
        # This facade test proves it supplies the first endpoint's result to the
        # second rather than manufacturing history inside a single analyzer call.
        def run(prior_signal):
            calls = []

            def fake_isf(*_args, **kwargs):
                calls.append(kwargs)
                current = "prior_strengthen_signal" in kwargs
                signal = kwargs.get("prior_strengthen_signal", prior_signal)
                return [SegmentEstimate(
                    start_min=0, label="Fasting", parameter="isf", current=30.0,
                    estimate=Estimate(24.0, 20.0, 28.0, 12, method="fixture"),
                    recommended=24.0 if current and signal else None,
                    annotation="", evidence={
                        "strengthen_signal": prior_signal if not current else True,
                        "direction": "strengthen" if current and signal else None,
                        "night_median": 24.0,
                        "impact_inputs": {}, "recurrence_channels": {},
                    },
                )]

            with patch("ciq_autotune.analyze.analyze_isf", side_effect=fake_isf):
                result = analyze(self.store, window_days=30,
                                 now=datetime(2026, 6, 8, 0, 0, 0))
            return result, calls

        one, one_calls = run(False)
        self.assertIsNone(one.isf[0].recommended)
        self.assertFalse(one_calls[1]["prior_strengthen_signal"])
        two, two_calls = run(True)
        self.assertEqual(two.isf[0].recommended, 24.0)
        self.assertTrue(two_calls[1]["prior_strengthen_signal"])


class WindowDefaultTest(unittest.TestCase):
    """analyze() must default to window_days=30."""

    def setUp(self):
        self.store = _seed_store()

    def tearDown(self):
        self.store.close()

    def test_default_window_is_30(self):
        result = analyze(self.store, now=datetime(2026, 6, 8, 0, 0, 0))
        self.assertEqual(result.window_days, 30)

    def test_explicit_window_overrides_default(self):
        result = analyze(self.store, window_days=30,
                         now=datetime(2026, 6, 8, 0, 0, 0))
        self.assertEqual(result.window_days, 30)


def _make_basal_row(t, rate=0.8, profile_rate=0.6, slot_minutes=30):
    return {
        "seq_num": int(t.strftime("%Y%m%d%H%M%S")),
        "time": t.strftime("%Y-%m-%d %H:%M:%S"),
        "delivery_type": "algorithmDelivery",
        "duration_mins": 5,
        "basal_rate": rate,
        "profile_basal_rate": profile_rate,
    }


def _make_cgm_row(t, bg):
    return {
        "EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
        "Readings (CGM / BGM)": bg,
        "Description": "EGV",
    }


class OnesidedNoteEndToEndTest(unittest.TestCase):
    """The one-sided / dawn-band lean note (ADR 0001 / #56) still surfaces through
    the analyze() facade unchanged. The lean *logic* itself is now unit-tested at
    the basal analyzer's interface (test_analyzer_basal), where it was relocated
    (#106); these cases only pin the end-to-end wiring through analyze()."""

    def test_onesided_note_appears_in_analyze_result(self):
        """analyze() includes one-sided notes in data_quality.notes when triggered."""
        from ciq_autotune.events import BasalEvent, CgmReading
        store = Store.open(":memory:")
        basal_rows, cgm_rows = [], []
        # 14 days of slot 0 (00:00–00:30) clean minutes with BG=160 (above midpoint 125)
        for d in range(14):
            t0 = datetime(2026, 1, d + 1, 0, 0, 0)
            for k in range(6):
                tt = t0 + timedelta(minutes=5 * k)
                basal_rows.append(_make_basal_row(tt))
                cgm_rows.append(_make_cgm_row(tt, bg=160))
        store.upsert_basal(basal_rows)
        store.upsert_cgm(cgm_rows)
        store.upsert_settings_snapshot(
            "2026-01-14 09:00:00",
            parse_pump_settings(_raw_settings()),
        )
        result = analyze(store, window_days=30, now=datetime(2026, 1, 15, 0, 0, 0))
        store.close()
        notes_text = " ".join(result.data_quality.notes)
        self.assertIn("one-sided", notes_text)

    def test_onesided_bg_threshold_override_suppresses_note_end_to_end(self):
        """Positive control: the exact fixture that fires a one-sided note under
        the default (0.65) threshold goes silent when onesided_bg_threshold is
        raised past the observed fraction — proving the knob threads through
        analyze(config=...) end-to-end."""
        def _seed():
            store = Store.open(":memory:")
            basal_rows, cgm_rows = [], []
            # 14 days of slot 0 clean minutes at BG=160 → 100% above midpoint 125.
            for d in range(14):
                t0 = datetime(2026, 1, d + 1, 0, 0, 0)
                for k in range(6):
                    tt = t0 + timedelta(minutes=5 * k)
                    basal_rows.append(_make_basal_row(tt))
                    cgm_rows.append(_make_cgm_row(tt, bg=160))
            store.upsert_basal(basal_rows)
            store.upsert_cgm(cgm_rows)
            store.upsert_settings_snapshot(
                "2026-01-14 09:00:00", parse_pump_settings(_raw_settings()))
            return store

        now = datetime(2026, 1, 15, 0, 0, 0)
        # Default threshold: 100% > 0.65 → note fires.
        store = _seed()
        default_notes = " ".join(
            analyze(store, window_days=30, now=now).data_quality.notes)
        store.close()
        self.assertIn("one-sided", default_notes)

        # Raise the threshold to 1.0: 100% is not strictly > 1.0 → note suppressed.
        store = _seed()
        raised_notes = " ".join(analyze(
            store, window_days=30, now=now,
            config=ModelConfig(onesided_bg_threshold=1.0)).data_quality.notes)
        store.close()
        self.assertNotIn("one-sided", raised_notes)


class IgnoreSettingChangesTest(unittest.TestCase):
    """ignore_setting_changes nulls setting metadata for preview mode."""

    def _seed_with_midwindow_edit(self):
        """14 nights of clean data with a mid-window basal programmed-rate jump."""
        store = Store.open(":memory:")
        basal, cgm = [], []
        for d in range(1, 15):
            programmed = 0.6 if d <= 7 else 0.9
            t0 = datetime(2026, 6, d, 0, 0, 0)
            for k in range(72):  # 6h of 5-min samples
                tt = t0 + timedelta(minutes=5 * k)
                basal.append({"seq_num": int(tt.strftime("%Y%m%d%H%M%S")), "time": tt.strftime("%Y-%m-%d %H:%M:%S"),
                              "delivery_type": "algorithmDelivery", "duration_mins": 5,
                              "basal_rate": 0.8, "profile_basal_rate": programmed})
                cgm.append({"EventDateTime": tt.strftime("%Y-%m-%dT%H:%M:%S"),
                            "Readings (CGM / BGM)": 120, "Description": "EGV"})
        store.upsert_basal(basal)
        store.upsert_cgm(cgm)
        store.upsert_settings_snapshot("2026-06-14 09:00:00",
                                       parse_pump_settings(_raw_settings()))
        return store

    def _basal_setting_epoch(self, result):
        return next(e for e in result.epochs if e.parameter == "basal_rate")

    def setUp(self):
        self.store = self._seed_with_midwindow_edit()
        self.now = datetime(2026, 6, 15, 0, 0, 0)

    def tearDown(self):
        self.store.close()

    def test_default_cuts_basal_window_at_the_edit(self):
        result = analyze(self.store, window_days=30, now=self.now)
        ep = self._basal_setting_epoch(result)
        self.assertIsNotNone(ep.start)          # the edit is detected
        self.assertLess(ep.effective_days, 14)  # window cut to since the edit

    def test_ignore_uses_full_window_and_forgets_the_edit(self):
        result = analyze(self.store, window_days=30, now=self.now,
                         ignore_setting_changes=True)
        ep = self._basal_setting_epoch(result)
        self.assertIsNone(ep.start)             # no basal setting-epoch boundary reported
        self.assertAlmostEqual(ep.effective_days, 30, places=0)  # full window


def _bolus_raw(t, isf=None, carbs=None, carb_ratio=None):
    return {
        "seq_num": int(t.strftime("%Y%m%d%H%M%S")),
        "request_time": t.strftime("%Y-%m-%d %H:%M:%S"),
        "description": "Bolus", "completion": "Completed", "insulin": 5.0,
        "carbs": carbs, "isf": isf, "carb_ratio": carb_ratio,
    }


class IcHistoryFacadeTest(unittest.TestCase):
    def test_fresh_analysis_rebuilds_the_same_retired_catalog_from_store_history(self):
        with tempfile.TemporaryDirectory() as directory:
            path = f"{directory}/harmonic.sqlite"
            store = Store.open(path)
            first = datetime(2026, 1, 1)
            changed = datetime(2026, 1, 10)
            store.upsert_settings_snapshot(
                first.strftime("%Y-%m-%d %H:%M:%S"),
                parse_pump_settings(_raw_settings(cr_mu=6000)),
            )
            store.upsert_bolus([_bolus_raw(first + timedelta(hours=1))])
            for day in (1, 2, 3):
                row = _bolus_raw(first + timedelta(days=day, hours=9),
                                 carbs=60, carb_ratio=6.0)
                row["insulin"] = 10.0
                store.upsert_bolus([row])
            store.upsert_settings_snapshot(
                changed.strftime("%Y-%m-%d %H:%M:%S"),
                parse_pump_settings(_raw_settings(cr_mu=5000)),
            )

            first_result = analyze(store, now=datetime(2026, 1, 15), harm_config=None)
            store.close()
            reopened = Store.open(path)
            second_result = analyze(reopened, now=datetime(2026, 1, 15), harm_config=None)
            reopened.close()

        self.assertEqual(len(first_result.ic_history), 1)
        self.assertEqual(first_result.ic_history[0].lifecycle, "active")
        self.assertEqual(first_result.ic_history[0].past_setting, 6.0)
        self.assertEqual(first_result.ic_history[0].programmed_now, 5.0)
        self.assertEqual(first_result.ic_history[0].support, 3)
        self.assertEqual(first_result.ic_history[0].history_id,
                         second_result.ic_history[0].history_id)

    def test_invalid_current_block_withholds_history_from_the_findings_queue(self):
        store = Store.open(":memory:")
        first = datetime(2026, 1, 1)
        changed = datetime(2026, 1, 10)
        store.upsert_settings_snapshot(
            first.strftime("%Y-%m-%d %H:%M:%S"),
            parse_pump_settings(_raw_settings(cr_mu=6000)),
        )
        store.upsert_bolus([_bolus_raw(first + timedelta(hours=1))])
        for day in (1, 2, 3):
            row = _bolus_raw(first + timedelta(days=day, hours=9),
                             carbs=60, carb_ratio=6.0)
            row["insulin"] = 10.0
            store.upsert_bolus([row])
        current = _raw_settings(cr_mu=5000)
        current["profiles"]["profile"][0]["tDependentSegs"] = [
            {"startTime": start, "basalRate": 600, "isf": 30,
             "carbRatio": ratio, "targetBg": 110}
            for start, ratio in ((0, 5000), (360, 0), (720, 5000))
        ]
        store.upsert_settings_snapshot(
            changed.strftime("%Y-%m-%d %H:%M:%S"),
            parse_pump_settings(current),
        )

        try:
            result = analyze(store, now=datetime(2026, 1, 15), harm_config=None)
        finally:
            store.close()

        self.assertEqual(len(result.ic_history), 1)
        history = result.ic_history[0]
        self.assertEqual(history.lifecycle, "unavailable")
        self.assertIsNone(history.programmed_now)
        self.assertFalse(any(block.asserts_move for block in result.ic_blocks))

        projection = FindingsProjection(
            result.to_dict(),
            {"window": {}, "exposures": {}},
            {"patterns": [], "low_confidence": []},
        )
        public = projection.project(WindowQuery.whole_day(), history.history_id)
        self.assertEqual(public["counts"]["history"], 0)
        self.assertEqual(public["selection"], {
            "id": history.history_id,
            "disposition": "unavailable",
            "message": (
                "Past-setting evidence no longer maps to one current program block."
            ),
        })


class DoseSettingEpochReconciliationTest(unittest.TestCase):
    """#159: the retroactive dose-stamped ISF/I:C series reconciles with the
    forward-only snapshot so a first-time user's window/caveat reflects what the
    pump actually used, not just the (initially one-point) snapshot log."""

    def _store(self, boluses, snap_at="2026-06-29 09:00:00"):
        store = Store.open(":memory:")
        store.upsert_bolus(boluses)
        store.upsert_settings_snapshot(snap_at, parse_pump_settings(_raw_settings()))
        return store

    def _isf_setting_epoch(self, result):
        return next(e for e in result.epochs if e.parameter == "isf")

    def test_constant_dose_series_gets_full_window_and_clears_caveat(self):
        # ISF stamped 30 on a dose every day back to 06-01 — before the 14-day
        # window start (06-16). The whole analyzable window is dose-verified, so the
        # "verified only since" caveat that a lone snapshot would raise clears, and
        # the ISF window is the full requested window.
        boluses = [_bolus_raw(datetime(2026, 6, d, 8, 0, 0), isf=30, carbs=40,
                              carb_ratio=5.0) for d in range(1, 30)]
        store = self._store(boluses)
        now = datetime(2026, 6, 30, 0, 0, 0)
        result = analyze(store, window_days=14, now=now)
        store.close()
        ep = self._isf_setting_epoch(result)
        self.assertIsNone(ep.start)
        self.assertIsNone(ep.unverified_before)
        self.assertAlmostEqual(ep.effective_days, 14, places=0)
        isf_note = [n for n in result.data_quality.notes
                    if "isf" in n and "verified only since" in n]
        self.assertEqual(isf_note, [])

    def test_partial_dose_history_pushes_caveat_back_to_earliest_dose(self):
        # Constant, but the earliest dose is 06-20 — inside the 30-day window. The
        # caveat survives, dated to the earliest dose (06-20), far earlier than the
        # lone snapshot (06-29) would allow.
        boluses = [_bolus_raw(datetime(2026, 6, d, 8, 0, 0), isf=30, carbs=40,
                              carb_ratio=5.0) for d in range(20, 30)]
        store = self._store(boluses)
        result = analyze(store, window_days=30, now=datetime(2026, 6, 30, 0, 0, 0))
        store.close()
        ep = self._isf_setting_epoch(result)
        self.assertIsNone(ep.start)
        self.assertEqual(ep.unverified_before, "2026-06-20 08:00:00")

    def test_recent_dose_change_is_detected_but_does_not_cut_the_isf_window(self):
        # ISF walked 30 -> 40 on 06-21 (a change the forward-only snapshot never
        # saw): the ISF setting-epoch start is still *detected* (it drives settling + the
        # compare-to-current caveat), but ADR 0039's measure/compare split means
        # the ISF *measurement* is NOT clamped to that boundary — it spans the
        # full requested window. Pre-0039 this cut effective_days to ~9.
        boluses = ([_bolus_raw(datetime(2026, 6, d, 8, 0, 0), isf=30, carbs=40,
                               carb_ratio=5.0) for d in range(1, 21)]
                   + [_bolus_raw(datetime(2026, 6, d, 8, 0, 0), isf=40, carbs=40,
                                 carb_ratio=5.0) for d in range(21, 30)])
        store = self._store(boluses)
        result = analyze(store, window_days=30, now=datetime(2026, 6, 30, 0, 0, 0))
        store.close()
        ep = self._isf_setting_epoch(result)
        self.assertEqual(ep.start, "2026-06-21 08:00:00")  # change still detected
        self.assertAlmostEqual(ep.effective_days, 30, places=0)  # full window, not cut

    def test_preview_mode_still_nulls_the_reconciled_isf_setting_epoch(self):
        # A recent dose-detected change must vanish under ignore_setting_changes so
        # preview reveals the otherwise-suppressed recommendation.
        boluses = ([_bolus_raw(datetime(2026, 6, d, 8, 0, 0), isf=30, carbs=40,
                               carb_ratio=5.0) for d in range(1, 21)]
                   + [_bolus_raw(datetime(2026, 6, d, 8, 0, 0), isf=40, carbs=40,
                                 carb_ratio=5.0) for d in range(21, 30)])
        store = self._store(boluses)
        result = analyze(store, window_days=30, now=datetime(2026, 6, 30, 0, 0, 0),
                         ignore_setting_changes=True)
        store.close()
        ep = self._isf_setting_epoch(result)
        self.assertIsNone(ep.start)
        self.assertIsNone(ep.unverified_before)


def _basal_raw(ev):
    ts = ev.t.strftime("%Y-%m-%d %H:%M:%S")
    return {"seq_num": int(ev.t.strftime("%Y%m%d%H%M%S")), "time": ts,
            "delivery_type": ev.delivery_type, "duration_mins": ev.duration_mins,
            "basal_rate": ev.basal_rate, "profile_basal_rate": ev.profile_basal_rate}


def _cgm_raw(ev):
    return {"EventDateTime": ev.t.strftime("%Y-%m-%dT%H:%M:%S"),
            "Readings (CGM / BGM)": ev.bg, "Description": "EGV"}


def _bolus_raw_from_event(ev, isf):
    # Fasting correction bolus (carbs=None); stamped with the *programmed* ISF the
    # pump used that night so dose_setting_epoch can detect the setting edit.
    return {"seq_num": int(ev.t.strftime("%Y%m%d%H%M%S")),
            "request_time": ev.t.strftime("%Y-%m-%d %H:%M:%S"),
            "description": "Bolus", "completion": "Completed", "insulin": ev.insulin,
            "carbs": None, "isf": isf, "carb_ratio": None}


class IsfMeasurementIsFullWindowTest(unittest.TestCase):
    """ADR 0039 / #288: ISF is measured over the full requested window even when a
    setting edit is detected mid-window. Built from a real synthetic ISF signal so
    it would go *degenerate* (only the ~3 post-edit nights) if the ISF setting
    epoch still clamped the measurement — the exact starvation #288 fixes."""

    def _seed(self):
        # Import the validated ISF-signal generator (physiology is constant across
        # all nights; only the *programmed* ISF stamp changes at night 14).
        from tests.test_analyzer_isf import synth_night

        store = Store.open(":memory:")
        basal_rows, cgm_rows, bolus_rows = [], [], []
        plans = [[(1, 0, 3.0)], [(2, 0, 4.0), (4, 0, 2.0)], [(1, 30, 5.0)],
                 [(3, 0, 3.5)], [(0, 30, 2.0), (3, 30, 4.0)], [(2, 0, 6.0)],
                 [(1, 0, 3.0), (4, 30, 2.5)], [(2, 30, 5.0)]]
        rng = random.Random(11)
        for night in range(1, 17):  # 16 nights of true-ISF-40 physiology
            plan = plans[(night - 1) % len(plans)]
            bolus, basal, cgm = synth_night(night, 40.0, plan, noise_sd=1.5, rng=rng)
            # Programmed ISF walked 30 -> 40 at night 14 (a dose-detected edit).
            stamped = 30 if night < 14 else 40
            basal_rows += [_basal_raw(b) for b in basal]
            cgm_rows += [_cgm_raw(c) for c in cgm]
            bolus_rows += [_bolus_raw_from_event(b, stamped) for b in bolus]
        store.upsert_basal(basal_rows)
        store.upsert_cgm(cgm_rows)
        store.upsert_bolus(bolus_rows)
        # Current programmed ISF = 40 (compare-to-current target).
        store.upsert_settings_snapshot("2026-06-01 09:00:00",
                                       parse_pump_settings(_raw_settings(isf=40)))
        return store

    def test_isf_measured_over_full_window_despite_midwindow_edit(self):
        store = self._seed()
        result = analyze(store, window_days=30, now=datetime(2026, 6, 17, 0, 0, 0))
        store.close()

        isf_ep = next(e for e in result.epochs if e.parameter == "isf")
        # The edit IS detected (drives settling + compare-to-current caveat)…
        self.assertIsNotNone(isf_ep.start)
        # …but the measurement spans the full window, not the ~3 post-edit nights.
        seg = result.isf[0]
        self.assertIsNotNone(seg.estimate.value)
        # 16 fasting nights → 16 clusters. If the ISF setting epoch still clamped the
        # window to nights 14-16 this would be ~3 — the degenerate starvation #288 removes.
        self.assertGreaterEqual(seg.estimate.n_clusters, 12)
        self.assertGreater(seg.estimate.n, 100)
        # Recovered ISF tracks the true physiology (≈40) with a real interval.
        self.assertAlmostEqual(seg.estimate.value, 40.0, delta=6.0)
        self.assertLess(seg.estimate.lo, seg.estimate.hi)


if __name__ == "__main__":
    unittest.main()
