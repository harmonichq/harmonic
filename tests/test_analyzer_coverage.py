"""Coverage-driven tests for the four analyzers and the analyze() facade.

Targets the uncovered branches identified by `coverage run -m pytest` on the
existing analyzer / facade test files.  All tests use synthetic, deterministic
data — no live Tandem fetch, no filesystem reads.

Coverage targets (at time of writing, 94 % → 100 % goal):

``ciq_autotune/analyzers/isf.py``
  * IsfConfig.describe_gate() — never called in existing tests
  * _programmed_fasting_isf([], …) → None (empty segment list, line 147)
  * _programmed_fasting_isf with segments that do NOT overlap the fasting window
    → covers the "not covering" branch (line 154)

``ciq_autotune/analyzers/ic.py``
  * IcConfig.describe_gate() — never called
  * meal with zero total insulin is skipped (line 229)
  * _recommend(programmed=None, …) → returns measured directly (line 278)
  * _recommend(measured > programmed) → over-covered annotation (line 286)

``ciq_autotune/analyzers/basal.py``
  * programmed_basal_by_slot: event with profile_basal_rate=None is skipped (line 82)
  * _pool_decision: pre.value is None → return False, None (line 135)
  * _slot_lean_magnitude: all BG > bg_mid → bottom list is empty → None (line 175)
  * _onesided_verdicts: clean sample with no nearby CGM → skipped (lines 237, 249)
  * _deliverable_rate: slot with no recommended, no current, no estimate → None (line 421)
  * consolidate_profile: segment row whose basal is None skips the total (line 624)

``ciq_autotune/analyze.py``
  * _settling: basal setting-epoch settling (line 259)
  * _settling: ISF setting-epoch settling — no measurement yet (lines 266-268)
  * _settling: I:C setting-epoch settling — too few meals (lines 273-277)
  * _quality_notes: no settings snapshot note (line 304)
  * _quality_notes: pooling ON with pooled + diverged slots (lines 311-321)
  * _quality_notes: pooling ON, all pooled, none diverged (line 319 branch)
  * _quality_notes: ISF/I:C setting changes do not emit basal measurement-cut notes (line 327)
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.basal import (
    _deliverable_rate,
    _pool_decision,
    _slot_lean_magnitude,
    analyze_basal,
    consolidate_profile,
    programmed_basal_by_slot,
)
from ciq_autotune.analyzers.ic import IcConfig, _recommend as _ic_recommend, analyze_ic
from ciq_autotune.analyzers.isf import (
    IsfConfig,
    _programmed_fasting_isf,
    analyze_isf,
    fasting_steps,
)
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading
from ciq_autotune.model import ModelConfig
from ciq_autotune.rest_window import RestWindow, RestWindowConfig
from ciq_autotune.result import SegmentEstimate, SlotEstimate
from ciq_autotune.uncertainty import Estimate, estimate_median


def _night_rest_window(day, start_h=0, end_h=8):
    """A single rest window covering a synthetic night's overnight CGM on `day`.

    The ISF gate is now rest-window membership (#110), so direct ``fasting_steps``
    / ``analyze_isf`` unit tests inject a covering window instead of relying on the
    detector's coverage heuristics (which the detector's own tests exercise)."""
    from datetime import date
    return [RestWindow(date=date(2026, 6, day),
                       start=datetime(2026, 6, day, start_h, 0, 0),
                       end=datetime(2026, 6, day, end_h, 0, 0))]


# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------

def _slot(i, *, rate=None, current=None, recommended=None, estimate_value=None):
    """Minimal SlotEstimate for consolidate_profile / _deliverable_rate tests."""
    val = rate if rate is not None else 0.5
    ev = estimate_value if estimate_value is not None else val
    return SlotEstimate(
        slot=i,
        label=f"{(i * 30) // 60:02d}:{(i * 30) % 60:02d}",
        current=current,
        estimate=Estimate(value=ev, lo=ev - 0.05 if ev else None,
                          hi=ev + 0.05 if ev else None,
                          n=5 if ev else 0,
                          confidence=0.8, method="bootstrap-median"),
        recommended=recommended,
        annotation="",
        days=5,
    )


def _slots_flat(rate, n=48):
    return [_slot(i, rate=rate) for i in range(n)]


def _basal_event(t, *, rate=0.8, programmed=None, duration_mins=5):
    return BasalEvent(
        t=t,
        delivery_type="algorithmDelivery",
        duration_mins=duration_mins,
        basal_rate=rate,
        profile_basal_rate=programmed,
    )


def _cgm(t, bg=120.0):
    return CgmReading(t=t, bg=bg)


def _meal(day, hh, carbs=60.0, dose=10.0):
    return BolusEvent(t=datetime(2026, 6, day, hh, 0, 0),
                      insulin=dose, carbs=carbs)


# ---------------------------------------------------------------------------
# ISF analyzer — uncovered branches
# ---------------------------------------------------------------------------

class IsfConfigDescribeGateTest(unittest.TestCase):
    """IsfConfig.describe_gate() was never called in the existing test suite."""

    def test_describe_gate_returns_soft_gate(self):
        gate = IsfConfig().describe_gate()
        self.assertIsNone(gate["unit"])
        self.assertIsNone(gate["needed"])
        self.assertTrue(gate["soft"])
        self.assertIn("criteria", gate)
        self.assertTrue(len(gate["criteria"]) >= 1)

    def test_describe_gate_interpolates_rest_envelope(self):
        # The rest-window envelope (#110) appears in a criterion — change the
        # envelope constants, the gate text tracks them.
        cfg = IsfConfig(rest_window=RestWindowConfig(env_start_min=1380,   # 23:00
                                                     env_end_min=420))     # 07:00
        gate = cfg.describe_gate()
        criteria_text = " ".join(gate["criteria"])
        self.assertIn("23:00", criteria_text)
        self.assertIn("07:00", criteria_text)

    def test_describe_gate_carb_lookback_in_criteria(self):
        # Carb-bearing boluses keep the flat ~DIA lookback (excursion guard, #169),
        # so the criterion still interpolates carb_lookback_min.
        cfg = IsfConfig(carb_lookback_min=240)  # 4h
        gate = cfg.describe_gate()
        criteria_text = " ".join(gate["criteria"])
        self.assertIn("4 h", criteria_text)
        self.assertIn("still on board", criteria_text)  # grams-scaled Carb-log half


class ProgrammedFastingIsfTest(unittest.TestCase):
    """_programmed_fasting_isf edge cases."""

    def test_empty_segments_returns_none(self):
        # Line 147: empty segment list hits the early-return guard.
        result = _programmed_fasting_isf([], IsfConfig())
        self.assertIsNone(result)

    def test_all_none_isf_segments_return_none(self):
        # The `isf is not None` filter leaves `covering` empty → return None.
        # (A schedule can't be "entirely outside" the nocturnal envelope: its last
        # segment always extends to 24:00 and so always overlaps the evening side.)
        cfg = IsfConfig()
        segs = [(0, None), (720, None)]
        result = _programmed_fasting_isf(segs, cfg)
        self.assertIsNone(result)

    def test_single_segment_covering_window_returned_directly(self):
        cfg = IsfConfig()
        segs = [(0, 42.0)]
        result = _programmed_fasting_isf(segs, cfg)
        self.assertEqual(result, 42.0)

    def test_multiple_overlapping_segments_take_median(self):
        # Two segments overlapping the rest envelope — median of two == upper one
        # when sorted (len=2, index=1 → second of sorted pair).
        cfg = IsfConfig()
        segs = [(0, 30.0), (180, 50.0)]
        result = _programmed_fasting_isf(segs, cfg)
        # covering = [30.0, 50.0], sorted; index len//2 = 1 → 50.0
        self.assertEqual(result, 50.0)


# ---------------------------------------------------------------------------
# I:C analyzer — uncovered branches
# ---------------------------------------------------------------------------

class IcConfigDescribeGateTest(unittest.TestCase):
    """IcConfig.describe_gate() was never called in the existing test suite."""

    def test_describe_gate_returns_hard_gate(self):
        gate = IcConfig().describe_gate()
        self.assertFalse(gate["soft"])
        # #518: the countdown unit is meal RUNS — a run is one closed ledger, and a
        # following meal now extends the chain instead of evicting it.
        self.assertEqual(gate["unit"], "meal runs")
        self.assertIsNotNone(gate["needed"])

    def test_describe_gate_interpolates_min_carbs(self):
        cfg = IcConfig(min_carbs=15.0, max_prior_meal_action_u=0.4)
        gate = cfg.describe_gate()
        criteria_text = " ".join(gate["criteria"])
        self.assertIn("15", criteria_text)
        self.assertIn("<0.4 U prior-meal action", criteria_text)
        self.assertEqual(gate["label"], "closed meal runs")

    def test_describe_gate_never_claims_meals_must_be_isolated(self):
        # The old copy said "no other meal within 5 h", which the run ledger makes
        # false: a following meal extends the run. The gap now belongs to the END of
        # the chain, and the criteria must say so.
        text = " ".join(IcConfig().describe_gate()["criteria"])
        self.assertNotIn("no other meal within", text)
        self.assertIn("last meal of the chain", text)

    def test_describe_gate_needed_matches_min_runs(self):
        cfg = IcConfig(min_runs=5)
        gate = cfg.describe_gate()
        self.assertEqual(gate["needed"], 5)


class IcMealZeroInsulinTest(unittest.TestCase):
    """meal_burdens skips any meal whose total insulin is 0 (line 229)."""

    def test_zero_dose_meal_is_skipped(self):
        from ciq_autotune.analyzers.ic import meal_burdens
        # A meal bolus with 0 insulin: total = 0, should be skipped.
        events = [BolusEvent(t=datetime(2026, 6, 1, 12, 0, 0),
                             insulin=0.0, carbs=60.0)]
        burdens = meal_burdens(events, IcConfig())
        self.assertEqual(burdens, [])


class IcRecommendTest(unittest.TestCase):
    """_recommend branches not hit by existing tests."""

    def test_no_programmed_returns_measured(self):
        # Line 278: programmed is None → recommendation is the measured value.
        rec, ann = _ic_recommend(None, 7.5, IcConfig())
        self.assertAlmostEqual(rec, 7.5, places=1)
        self.assertIn("implied", ann.lower())

    def test_measured_above_programmed_over_covered_annotation(self):
        # measured > programmed → over-covered annotation.
        rec, ann = _ic_recommend(6.0, 8.0, IcConfig())
        self.assertIn("over-covered", ann.lower())
        # Half the gap toward measured (#410): 6.0 + (8.0−6.0)/2 = 7.0, inside the ±20% cap.
        self.assertAlmostEqual(rec, 7.0, places=1)

    def test_measured_equals_programmed_matches_annotation(self):
        # measured == programmed: neither branch fires; "matches" annotation.
        rec, ann = _ic_recommend(6.0, 6.0, IcConfig())
        self.assertIn("matches", ann.lower())
        self.assertAlmostEqual(rec, 6.0, places=1)


# ---------------------------------------------------------------------------
# Basal analyzer — uncovered branches
# ---------------------------------------------------------------------------

class ProgrammedBasalBySlotNoneTest(unittest.TestCase):
    """programmed_basal_by_slot skips events with profile_basal_rate=None (line 82)."""

    def test_none_profile_rate_events_are_skipped(self):
        t0 = datetime(2026, 6, 1, 3, 0, 0)
        events = [
            _basal_event(t0, rate=0.8, programmed=None),   # should be skipped
            _basal_event(t0 + timedelta(minutes=5), rate=0.8, programmed=0.6),
        ]
        result = programmed_basal_by_slot(events, slot_minutes=30)
        # Only the event with a real programmed rate contributes.
        self.assertTrue(len(result) >= 1)
        slot = 3 * 60 // 30  # slot 6 = 03:00
        self.assertAlmostEqual(result[slot], 0.6)

    def test_all_none_profile_rates_yields_empty_dict(self):
        t0 = datetime(2026, 6, 1, 3, 0, 0)
        events = [_basal_event(t0, programmed=None)]
        result = programmed_basal_by_slot(events, slot_minutes=30)
        self.assertEqual(result, {})


class PoolDecisionNoneValueTest(unittest.TestCase):
    """_pool_decision returns (False, None) when an estimate has None value/CI (line 135)."""

    def test_pre_estimate_none_value_refuses(self):
        pre = Estimate(value=None, lo=None, hi=None, n=5, confidence=0.8,
                       method="bootstrap-median")
        post = estimate_median([0.8, 0.8, 0.8, 0.8])
        should_pool, note = _pool_decision(pre, post)
        self.assertFalse(should_pool)
        self.assertIsNone(note)

    def test_post_estimate_none_value_refuses(self):
        pre = estimate_median([0.8, 0.8, 0.8, 0.8])
        post = Estimate(value=None, lo=None, hi=None, n=5, confidence=0.8,
                        method="bootstrap-median")
        should_pool, note = _pool_decision(pre, post)
        self.assertFalse(should_pool)
        self.assertIsNone(note)


class FastingStepsCarbPointerAdvanceTest(unittest.TestCase):
    """fasting_steps advances the carb-pointer ci past expired carb times (isf.py:130).

    The while loop on line 129-130 advances `ci` beyond carb times that fall
    before the current step's lookback guard.  To exercise it we need *two*
    carb boluses well-separated in time so that the second CGM step's guard_lo
    advances past the first carb time, triggering `ci += 1`.
    """

    def test_two_carbs_advances_ci_and_includes_later_steps(self):
        cfg = IsfConfig(carb_lookback_min=60)
        # Two carb boluses: one at 01:00, one at 02:00.
        # CGM steps from 03:00 onwards have guard_lo = 03:0x - 1h = ~02:0x.
        # For a step at 03:30, guard_lo = 02:30, which is past the 01:00 carb
        # → ci advances past the 01:00 carb (line 130).  The 02:00 carb is also
        # past guard_lo = 02:30, so ci moves to 2 (past both), and the step is
        # included (no blocking carb ≤ t1).
        base = datetime(2026, 6, 1, 0, 0, 0)
        boluses = [
            BolusEvent(t=base + timedelta(hours=1), insulin=3.0, carbs=30.0),
            BolusEvent(t=base + timedelta(hours=2), insulin=2.0, carbs=20.0),
        ]
        # Flat CGM from 03:00 to 06:00.
        cgm = [CgmReading(t=base + timedelta(minutes=m), bg=120.0)
               for m in range(180, 361, 5)]
        steps = fasting_steps(boluses, [], cgm, cfg, _night_rest_window(1))
        # Steps from 03:00+ should be present: no active carb within 1h.
        self.assertTrue(len(steps) > 0)
        for s in steps:
            tod = s.t.hour * 60 + s.t.minute
            self.assertGreaterEqual(tod, 180)  # all inside the rest window


class SlotLeanMagnitudeAdditionalTest(unittest.TestCase):
    """Additional _slot_lean_magnitude branch tests.

    Note: line 175 (`if not bottom: return None`) is a defensive guard that is
    logically unreachable: bg_mid = (bg_min + bg_max)/2 and bg_min is the
    minimum, so bg_min <= bg_mid always, meaning at least one element always
    satisfies bg <= bg_mid.  We do not fabricate a test for dead code.

    We instead cover the boundary between a tiny non-zero lean (> 0, not
    clamped) and a lean that is below the noise floor.
    """

    def test_single_pair_returns_none(self):
        # len(pairs) < 2 → None (line 167).
        self.assertIsNone(_slot_lean_magnitude([(0.8, 120.0)]))

    def test_positive_lean_is_returned_unclamped(self):
        # Bottom half (low BG) has rate 0.8; high-BG half has rate 1.1.
        # full_median on 10 points: 6×1.1 + 4×0.8 → 1.1 if 6 > 4, actually
        # median of [0.8,0.8,0.8,0.8,1.1,1.1,1.1,1.1,1.1,1.1] = 1.1.
        # bottom_median = 0.8. lean = 1.1 - 0.8 = 0.3.
        pairs = [(0.8, 80.0)] * 4 + [(1.1, 160.0)] * 6
        result = _slot_lean_magnitude(pairs)
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result, 0.3, delta=0.05)


class OnesidedVerdictsNoCgmTest(unittest.TestCase):
    """_onesided_verdicts skips clean samples with no nearby CGM reading (line 237).

    Build clean samples with timestamps that do NOT align with any CGM reading
    (more than bg_max_stale_min apart), so _nearest_bg returns None.  The slot
    should have zero onesided verdict because no sample contributed.
    """

    def test_clean_samples_without_matching_cgm_produce_no_verdict(self):
        # One clean overnight slot (00:00) but CGM timestamps are deliberately
        # far from every basal sample — no matching reading within stale window.
        cfg = ModelConfig(bg_max_stale_min=5)  # tight: 5-min stale limit
        t_base = datetime(2026, 1, 1, 0, 0, 0)
        basal_events = []
        cgm_readings = []
        for k in range(6):
            bt = t_base + timedelta(minutes=5 * k)
            basal_events.append(_basal_event(bt, rate=0.8, programmed=0.6))
            # CGM is 60 min ahead of basal — always stale relative to basal t.
            cgm_readings.append(_cgm(bt + timedelta(minutes=60), bg=160.0))

        rows = analyze_basal(basal_events, cgm_readings, [], [], config=cfg)
        slot0 = rows[0]
        self.assertNotIn("onesided", slot0.evidence)


class DeliverableRateAllNoneTest(unittest.TestCase):
    """_deliverable_rate returns None when recommended=None, current=None, estimate.value=None (line 421)."""

    def test_all_none_yields_none(self):
        slot = _slot(0, rate=None, current=None, recommended=None, estimate_value=None)
        # Override rate so estimate has None value too.
        slot_no_est = SlotEstimate(
            slot=0, label="00:00", current=None,
            estimate=Estimate(value=None, lo=None, hi=None, n=0,
                              confidence=0.8, method="none"),
            recommended=None, annotation="", days=0,
        )
        result = _deliverable_rate(slot_no_est)
        self.assertIsNone(result)


class ConsolidateProfileNoneBasalTest(unittest.TestCase):
    """consolidate_profile skips rows whose basal is None when computing the total (line 624).

    This arises when a non-basal boundary (from ISF or I:C) splits the profile
    at a start_min that has no active basal segment yet.  The total-accumulation
    loop must skip such rows rather than crash on None arithmetic.
    """

    def _seg_est(self, start_min, current, recommended):
        return SegmentEstimate(
            start_min=start_min,
            label=f"{start_min // 60:02d}:00",
            parameter="isf",
            current=current,
            estimate=Estimate(recommended, None, None, 5, 0.8, "measured"),
            recommended=recommended,
            annotation="",
        )

    def test_isf_boundary_before_first_basal_boundary_does_not_crash(self):
        # Flat basal across all 48 slots starting at 0, but an ISF boundary at
        # minute 0 and another at minute 30.  The union adds minute 30; the basal
        # active-seg propagates from the slot-0 (minute-0) boundary.  The total
        # must still be computed without a crash.
        prof = consolidate_profile(
            _slots_flat(0.6, n=48),
            isf=[self._seg_est(0, 50.0, 50.0), self._seg_est(30, 50.0, 45.0)],
        )
        # 0.6 U/h over 24h = 14.4 U
        self.assertAlmostEqual(prof.total_daily_basal, 0.6 * 24, delta=0.1)

    def test_no_basal_slots_with_isf_only_has_zero_or_none_total(self):
        # Empty slot list → empty profile → 0 total.
        prof = consolidate_profile(
            [],
            isf=[self._seg_est(0, 50.0, 50.0)],
        )
        self.assertEqual(prof.total_daily_basal, 0.0)


# ---------------------------------------------------------------------------
# analyze() facade — settling + quality notes
# ---------------------------------------------------------------------------

from ciq_autotune.analyze import analyze, _settling, _quality_notes
from ciq_autotune.epochs import Epoch
from ciq_autotune.result import EpochInfo, Settling
from ciq_autotune.settings import parse_pump_settings
from ciq_autotune.store import Store


def _raw_settings(isf=30, cr_mu=6000):
    """Minimal raw pump settings dict accepted by parse_pump_settings."""
    pad = [{"startTime": 0, "basalRate": 0, "isf": 0, "carbRatio": 0,
            "targetBg": 0}] * 15
    return {
        "profiles": {"activeIdp": 4, "profile": [
            {"name": "4", "idp": 4, "insulinDuration": 300,
             "carbEntry": 1, "maxBolus": 15000,
             "tDependentSegs": [{"startTime": 0, "basalRate": 600,
                                 "isf": isf, "carbRatio": cr_mu,
                                 "targetBg": 110}] + pad}
        ]},
        "cgmSettings": {},
    }


def _seed_store_nights(n_days=7, *, programmed=0.6, basal_rate=0.8,
                       with_snapshot=True):
    """A small Store with ``n_days`` clean overnight nights + optional snapshot."""
    store = Store.open(":memory:")
    basal, cgm = [], []
    for d in range(1, n_days + 1):
        t0 = datetime(2026, 6, d, 0, 0, 0)
        for k in range(72):  # 6 h of 5-min samples
            tt = t0 + timedelta(minutes=5 * k)
            basal.append({"seq_num": int(tt.strftime("%Y%m%d%H%M%S")), "time": tt.strftime("%Y-%m-%d %H:%M:%S"),
                          "delivery_type": "algorithmDelivery",
                          "duration_mins": 5,
                          "basal_rate": basal_rate,
                          "profile_basal_rate": programmed})
            cgm.append({"EventDateTime": tt.strftime("%Y-%m-%dT%H:%M:%S"),
                        "Readings (CGM / BGM)": 120,
                        "Description": "EGV"})
    store.upsert_basal(basal)
    store.upsert_cgm(cgm)
    if with_snapshot:
        store.upsert_settings_snapshot(
            f"2026-06-{n_days:02d} 09:00:00",
            parse_pump_settings(_raw_settings()))
    return store


class SettlingBasalTest(unittest.TestCase):
    """_settling emits a basal Settling when the basal setting epoch is recent and slots are thin (line 259)."""

    def test_recent_basal_setting_epoch_with_thin_slots_settles(self):
        # Use a fresh store and set now to just after the edit, so basal has
        # only 1 day of post-cut data — below high_min_days (3).
        store = _seed_store_nights(n_days=2)
        # Force a recent basal setting epoch by using a store with a recent programmed
        # change.  We exercise _settling directly by constructing the setting epoch.
        cfg = ModelConfig()
        b_ep = Epoch("basal_rate", start=datetime(2026, 6, 2, 0, 0, 0),
                     unverified_before=None)
        isf_ep = Epoch("isf", None, None)
        ic_ep = Epoch("carb_ratio", None, None)
        # One cut slot (slot 0) with 1 clean day.
        slot_cuts = {0: datetime(2026, 6, 2, 0, 0, 0)}
        basal_rows = [
            SlotEstimate(slot=0, label="00:00", current=0.6,
                         estimate=Estimate(0.8, 0.7, 0.9, 1, 0.8, "bootstrap-median"),
                         recommended=None, annotation="", days=1)
        ]
        settling = _settling(b_ep, isf_ep, ic_ep,
                             basal_rows=basal_rows, isf_rows=[], ic_runs=0,
                             slot_cuts=slot_cuts, config=cfg)
        # Should produce one basal settling entry.
        basal_settling = [s for s in settling if s.parameter == "basal_rate"]
        self.assertEqual(len(basal_settling), 1)
        self.assertEqual(basal_settling[0].parameter, "basal_rate")
        self.assertEqual(basal_settling[0].have, 1)
        store.close()

    def test_thick_slots_do_not_settle(self):
        # days=5 >= high_min_days(3) → no basal settling.
        cfg = ModelConfig()
        b_ep = Epoch("basal_rate", start=datetime(2026, 6, 1, 0, 0, 0),
                     unverified_before=None)
        isf_ep = Epoch("isf", None, None)
        ic_ep = Epoch("carb_ratio", None, None)
        slot_cuts = {0: datetime(2026, 6, 1, 0, 0, 0)}
        basal_rows = [
            SlotEstimate(slot=0, label="00:00", current=0.6,
                         estimate=Estimate(0.8, 0.7, 0.9, 5, 0.8, "bootstrap-median"),
                         recommended=None, annotation="", days=5)
        ]
        settling = _settling(b_ep, isf_ep, ic_ep,
                             basal_rows=basal_rows, isf_rows=[], ic_runs=0,
                             slot_cuts=slot_cuts, config=cfg)
        self.assertFalse([s for s in settling if s.parameter == "basal_rate"])


class SettlingIsfTest(unittest.TestCase):
    """_settling emits an ISF Settling when the ISF setting epoch is recent and no estimate yet (lines 266-268)."""

    def test_isf_settling_when_no_estimate(self):
        cfg = ModelConfig()
        b_ep = Epoch("basal_rate", None, None)
        isf_ep = Epoch("isf", start=datetime(2026, 6, 1, 0, 0, 0),
                        unverified_before=None)
        ic_ep = Epoch("carb_ratio", None, None)
        # ISF rows with no estimate (value=None).
        isf_rows = [SegmentEstimate(
            start_min=0, label="Fasting", parameter="isf",
            current=36.0,
            estimate=Estimate(None, None, None, 0, 0.8, "none"),
            recommended=None, annotation="not enough data",
        )]
        settling = _settling(b_ep, isf_ep, ic_ep,
                             basal_rows=[], isf_rows=isf_rows, ic_runs=0,
                             slot_cuts={}, config=cfg)
        isf_settling = [s for s in settling if s.parameter == "isf"]
        self.assertEqual(len(isf_settling), 1)
        self.assertIsNone(isf_settling[0].have)

    def test_isf_not_settling_when_estimate_exists(self):
        cfg = ModelConfig()
        b_ep = Epoch("basal_rate", None, None)
        isf_ep = Epoch("isf", start=datetime(2026, 6, 1, 0, 0, 0),
                        unverified_before=None)
        ic_ep = Epoch("carb_ratio", None, None)
        isf_rows = [SegmentEstimate(
            start_min=0, label="Fasting", parameter="isf",
            current=36.0,
            estimate=Estimate(40.0, 35.0, 45.0, 200, 0.8, "bootstrap-ols-isf"),
            recommended=None, annotation="confirms",
        )]
        settling = _settling(b_ep, isf_ep, ic_ep,
                             basal_rows=[], isf_rows=isf_rows, ic_runs=0,
                             slot_cuts={}, config=cfg)
        self.assertFalse([s for s in settling if s.parameter == "isf"])


class SettlingIcTest(unittest.TestCase):
    """_settling emits an I:C Settling when the I:C setting epoch is recent and meals < min_meals (lines 273-277)."""

    def test_too_few_runs_produces_ic_settling(self):
        cfg = ModelConfig()
        b_ep = Epoch("basal_rate", None, None)
        isf_ep = Epoch("isf", None, None)
        ic_ep = Epoch("carb_ratio", start=datetime(2026, 6, 1, 0, 0, 0),
                      unverified_before=None)
        ic_runs = 1  # 1 closed run < min_runs(3)
        settling = _settling(b_ep, isf_ep, ic_ep,
                             basal_rows=[], isf_rows=[], ic_runs=ic_runs,
                             slot_cuts={}, config=cfg)
        ic_settling = [s for s in settling if s.parameter == "carb_ratio"]
        self.assertEqual(len(ic_settling), 1)
        self.assertEqual(ic_settling[0].have, 1)

    def test_enough_runs_no_ic_settling(self):
        cfg = ModelConfig()
        b_ep = Epoch("basal_rate", None, None)
        isf_ep = Epoch("isf", None, None)
        ic_ep = Epoch("carb_ratio", start=datetime(2026, 6, 1, 0, 0, 0),
                      unverified_before=None)
        ic_runs = 5  # 5 >= min_runs(3)
        settling = _settling(b_ep, isf_ep, ic_ep,
                             basal_rows=[], isf_rows=[], ic_runs=ic_runs,
                             slot_cuts={}, config=cfg)
        self.assertFalse([s for s in settling if s.parameter == "carb_ratio"])


class QualityNotesNoSnapshotTest(unittest.TestCase):
    """_quality_notes emits a 'no snapshot' note when the snapshot list is empty (line 304)."""

    def test_no_snapshots_note_emitted(self):
        epochs = [EpochInfo("basal_rate", None, None, 30.0)]
        notes = _quality_notes(epochs, snaps=[])
        self.assertTrue(any("snapshot" in n.lower() for n in notes))

    def test_with_snapshot_no_snapshot_note(self):
        from ciq_autotune.settings import parse_pump_settings
        snap = parse_pump_settings(_raw_settings())
        epochs = [EpochInfo("basal_rate", None, None, 30.0)]
        # pass a non-empty list even if it's a minimal Snapshot
        notes = _quality_notes(epochs, snaps=[snap])
        self.assertFalse(any("no settings snapshot" in n.lower() for n in notes))


class QualityNotesPoolingNoteTest(unittest.TestCase):
    """_quality_notes pooling paths (lines 297-302, 311-321).

    The function inspects each basal row's evidence["pooling"] dict and assembles:
    * 'pooled' count  → "keep the full window" note
    * 'diverged' count → "disagreed" note

    We build minimal SlotEstimate rows with the right evidence shapes.
    """

    def _row_pooled(self):
        return SlotEstimate(
            slot=0, label="00:00", current=0.6,
            estimate=Estimate(0.8, 0.7, 0.9, 8, 0.8, "bootstrap-median"),
            recommended=None, annotation="", days=8,
            evidence={"pooling": {"pooled": True}, "points": []},
        )

    def _row_diverged(self, note="pre-edit delivery (~0.4 U/h) disagrees with post-edit"):
        return SlotEstimate(
            slot=1, label="00:30", current=1.2,
            estimate=Estimate(1.2, 1.1, 1.3, 4, 0.8, "bootstrap-median"),
            recommended=None, annotation="", days=4,
            evidence={"pooling": {"pooled": False, "note": "slot 00:30: " + note},
                      "points": []},
        )

    def _setting_epoch_info_with_start(self, parameter="basal_rate"):
        return EpochInfo(parameter, "2026-06-01 09:00:00", None, 7.0)

    def test_pooled_and_diverged_note(self):
        epochs = [self._setting_epoch_info_with_start()]
        rows = [self._row_pooled(), self._row_diverged()]
        notes = _quality_notes(epochs, snaps=[], basal_rows=rows)
        combined = " ".join(notes)
        # Pooled note: "pooled pre- and post-edit"
        self.assertIn("pooled", combined)
        # Diverged note: a number + "kept post-edit-only"
        self.assertIn("kept post-edit-only", combined)
        # Specific divergence note is appended.
        self.assertIn("disagrees", combined)

    def test_all_pooled_no_diverged_note(self):
        epochs = [self._setting_epoch_info_with_start()]
        rows = [self._row_pooled()]
        notes = _quality_notes(epochs, snaps=[], basal_rows=rows)
        combined = " ".join(notes)
        # Pooled note present.
        self.assertIn("pooled", combined)
        # No "disagreed" mention when diverged == 0.
        self.assertIn("no edited slot's pre/post data disagreed", combined)

    def test_isf_setting_epoch_with_start_emits_no_window_cut_note(self):
        # ADR 0039: an ISF setting epoch with a detected start
        # does NOT emit a "window cut" note — its measurement spans the full window
        # (setting-independent physiology); settling + the "verified only since"
        # caveat carry the recent-change signal instead. Only basal cuts.
        epochs = [self._setting_epoch_info_with_start("isf")]
        notes = _quality_notes(epochs, snaps=[])
        combined = " ".join(notes)
        self.assertNotIn("window cut to", combined)

    def test_basal_setting_epoch_with_start_still_emits_window_cut_note(self):
        # The basal cut note is unchanged: a detected basal edit still cuts.
        epochs = [self._setting_epoch_info_with_start("basal_rate")]
        notes = _quality_notes(epochs, snaps=[])
        combined = " ".join(notes)
        self.assertIn("cut to", combined)


class FacadeNoSnapshotTest(unittest.TestCase):
    """analyze() with no settings snapshot produces the 'no snapshot' quality note."""

    def setUp(self):
        self.store = _seed_store_nights(n_days=7, with_snapshot=False)

    def tearDown(self):
        self.store.close()

    def test_no_snapshot_note_in_result(self):
        result = analyze(self.store, window_days=30,
                         now=datetime(2026, 6, 8, 0, 0, 0))
        notes_text = " ".join(result.data_quality.notes)
        self.assertIn("snapshot", notes_text.lower())


class FacadeIsfNoWindowCutNoteTest(unittest.TestCase):
    """ADR 0039: after an ISF settings change, analyze() detects the ISF setting epoch but
    does NOT cut the ISF measurement window or emit a "window cut" note.

    Two snapshots with a different ISF trigger ISF setting-epoch detection; its
    start is populated (drives settling / caveat), yet the ISF measurement spans
    the full requested window and no cut note is surfaced.
    """

    def _seed_with_two_snapshots(self):
        store = Store.open(":memory:")
        basal, cgm = [], []
        for d in range(1, 15):
            t0 = datetime(2026, 6, d, 0, 0, 0)
            for k in range(72):
                tt = t0 + timedelta(minutes=5 * k)
                basal.append({"seq_num": int(tt.strftime("%Y%m%d%H%M%S")), "time": tt.strftime("%Y-%m-%d %H:%M:%S"),
                              "delivery_type": "algorithmDelivery",
                              "duration_mins": 5,
                              "basal_rate": 0.8,
                              "profile_basal_rate": 0.6})
                cgm.append({"EventDateTime": tt.strftime("%Y-%m-%dT%H:%M:%S"),
                            "Readings (CGM / BGM)": 120,
                            "Description": "EGV"})
        store.upsert_basal(basal)
        store.upsert_cgm(cgm)
        # First snapshot: ISF=30, carb_ratio=6000 mu (6 g/U)
        store.upsert_settings_snapshot("2026-06-07 09:00:00",
                                       parse_pump_settings(_raw_settings(isf=30)))
        # Second snapshot: ISF=35 — triggers an ISF setting-epoch change.
        store.upsert_settings_snapshot("2026-06-14 09:00:00",
                                       parse_pump_settings(_raw_settings(isf=35)))
        return store

    def test_isf_change_detected_but_no_window_cut_note(self):
        store = self._seed_with_two_snapshots()
        result = analyze(store, window_days=30,
                         now=datetime(2026, 6, 15, 0, 0, 0))
        store.close()
        isf_ep = next(e for e in result.epochs if e.parameter == "isf")
        self.assertIsNotNone(isf_ep.start)  # the ISF change is still detected
        # …but the measurement is full-window and no cut note is emitted.
        self.assertAlmostEqual(isf_ep.effective_days, 30, places=0)
        notes_text = " ".join(result.data_quality.notes)
        self.assertNotIn("window cut to", notes_text.lower())


class FacadeSettlingEndToEndTest(unittest.TestCase):
    """analyze() populates result.settling when a parameter is still collecting data.

    After a very recent ISF change with no post-change fasting data, analyze()
    should surface an ISF settling entry in result.settling.
    """

    def _seed_no_overnight(self):
        # Day-only basal + CGM (12:00–18:00): no fasting steps, so ISF never measures.
        store = Store.open(":memory:")
        basal, cgm = [], []
        for d in range(1, 8):
            t0 = datetime(2026, 6, d, 12, 0, 0)  # noon start
            for k in range(72):  # 6h daytime
                tt = t0 + timedelta(minutes=5 * k)
                basal.append({"seq_num": int(tt.strftime("%Y%m%d%H%M%S")), "time": tt.strftime("%Y-%m-%d %H:%M:%S"),
                              "delivery_type": "algorithmDelivery",
                              "duration_mins": 5,
                              "basal_rate": 0.8,
                              "profile_basal_rate": 0.6})
                cgm.append({"EventDateTime": tt.strftime("%Y-%m-%dT%H:%M:%S"),
                            "Readings (CGM / BGM)": 120,
                            "Description": "EGV"})
        store.upsert_basal(basal)
        store.upsert_cgm(cgm)
        # Two snapshots: ISF changed → ISF setting epoch detected.
        store.upsert_settings_snapshot("2026-06-04 09:00:00",
                                       parse_pump_settings(_raw_settings(isf=30)))
        store.upsert_settings_snapshot("2026-06-07 09:00:00",
                                       parse_pump_settings(_raw_settings(isf=35)))
        return store

    def test_isf_settling_appears_in_result(self):
        store = self._seed_no_overnight()
        result = analyze(store, window_days=30,
                         now=datetime(2026, 6, 8, 0, 0, 0))
        store.close()
        isf_settling = [s for s in result.settling if s.parameter == "isf"]
        self.assertTrue(len(isf_settling) >= 1,
                        f"expected ISF settling, got {result.settling}")
        self.assertIsNone(isf_settling[0].have)


if __name__ == "__main__":
    unittest.main()
