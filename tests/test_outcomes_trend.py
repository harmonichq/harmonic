"""Outcomes-trend tests (#131) — deterministic, stdlib unittest, no DB/network.

Covers what the issue is emphatic about: the rolling-window tiling (oldest→newest,
index-aligned, newest ending at ``now``); the **fixed-ISF** rule (every window judged
against the same constant profile ISF, never a per-window estimate); **honest
denominators** (each behavior keeps its own exposure, even the affinity-moved ones);
the ``correction_stacking`` behavior-vs-harm split (two numerators, ``harm ⊆
behavior``); the net-new post-meal spike; and the payload shape + both renderers.

The pure functions are exercised directly on synthetic data. ``summarize_trend`` runs
against a tiny in-memory fake store; the API path uses a real TestClient. Neither
touches SQLite or the network.
"""

from __future__ import annotations

import json
import unittest
from datetime import datetime, timedelta
from unittest import mock

from ciq_autotune.analyzers.classifiers.correction_stacking import count_correction_stacks
from ciq_autotune.analyzers.scenario import Exposure, Lever
from ciq_autotune.analyzers.scenario_config import ScenarioConfig
from ciq_autotune.events import BolusEvent, CarbEntry, CgmReading
from ciq_autotune.outcomes_trend import (
    ARC_MIN_MEALS,
    SCHEMA_VERSION,
    ArcRescueContext,
    ArcTrend,
    OutcomesTrend,
    ProgrammedIcRange,
    PreMealTrend,
    _meal_arc,
    _overnight_lows_cleared,
    _window_bounds,
    day_rate_clears,
    fisher_exact_two_sided,
    markdown_trend,
    newcombe_diff_interval,
    post_meal_arc,
    post_meal_rescue_context,
    pre_meal_start,
    summarize_trend,
)
from ciq_autotune.settings import (
    ProfileSegment,
    ProfileSettings,
    PumpSettings,
    Snapshot,
)
from tests.test_scenario_engine import ISF, dose_stamped_ic_fixture

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False


def _cgm(values, *, start, step_min=5):
    return [
        CgmReading(start + timedelta(minutes=step_min * i), bg=float(v))
        for i, v in enumerate(values)
    ]


class _FakeStore:
    """A minimal store stand-in: just the four reads ``summarize_trend`` calls."""

    def __init__(self, *, cgm=(), bolus=(), basal=(), snaps=(), carbs=(),
                 responses=(), plan_history=(), active_focus=None):
        self._cgm, self._bolus, self._basal, self._snaps = cgm, bolus, basal, snaps
        self._carbs = carbs
        self._responses = responses
        self._plan_history = plan_history
        self._active_focus = active_focus
        self.dropped = []  # focus ids dropped by an active_watched_change preemption

    def basal_events(self):
        return list(self._basal)

    def bolus_events(self):
        return list(self._bolus)

    def cgm_readings(self):
        return list(self._cgm)

    def settings_snapshots(self):
        return list(self._snaps)

    def prompt_responses(self):
        return list(self._responses)

    def carb_entries(self):
        return list(self._carbs)

    # Focus / watched-change surface (#244).
    def plan_history(self):
        return list(self._plan_history)

    def active_focus(self):
        return dict(self._active_focus) if self._active_focus else None

    def resolve_focus(self, focus_id, status="resolved"):
        self.dropped.append((focus_id, status))
        if self._active_focus and self._active_focus.get("id") == focus_id:
            self._active_focus = None
        return True


def _snapshot_with_ic(*values):
    segments = tuple(
        ProfileSegment(
            start_min=i * (1440 // len(values)), basal_rate=1.0, isf=40,
            carb_ratio=value, target_bg=110,
        )
        for i, value in enumerate(values)
    )
    profile = ProfileSettings(
        idp=1, name="Main", dia_min=300, carb_entry=True, max_bolus=10.0,
        segments=segments,
    )
    return Snapshot(
        captured_at=datetime(2026, 6, 18),
        settings=PumpSettings(active_idp=1, profiles=(profile,)),
    )


class WindowBoundsTest(unittest.TestCase):
    def test_tiles_oldest_to_newest_newest_ends_at_now(self):
        now = datetime(2026, 7, 2, 0, 0, 0)
        earliest = now - timedelta(days=40)  # spans just over 2 windows of 14 → 3
        bounds = _window_bounds(now, earliest, 14)
        self.assertEqual(len(bounds), 3)
        # Equal width, contiguous, oldest→newest, newest ends at now.
        for start, end in bounds:
            self.assertEqual((end - start), timedelta(days=14))
        self.assertEqual(bounds[-1][1], now)
        self.assertEqual(bounds[0][0], now - timedelta(days=42))
        self.assertEqual(bounds[0][1], bounds[1][0])  # contiguous

    def test_empty_data_is_one_window(self):
        now = datetime(2026, 7, 2)
        self.assertEqual(len(_window_bounds(now, None, 14)), 1)

    def test_oldest_window_is_full_width_not_shrunk(self):
        # Data starting mid-window keeps the window full-width (low cgm_active later).
        now = datetime(2026, 7, 2)
        earliest = now - timedelta(days=15)  # ceil(15/14) = 2 windows
        bounds = _window_bounds(now, earliest, 14)
        self.assertEqual(len(bounds), 2)
        self.assertEqual((bounds[0][1] - bounds[0][0]), timedelta(days=14))


def _series(start, pairs):
    """CGM readings at ``(minutes_after_start, bg)`` offsets — for hand-built arcs."""
    return [CgmReading(start + timedelta(minutes=mn), bg=float(v)) for mn, v in pairs]


def _meal(t):
    return BolusEvent(t, insulin=5.0, carbs=50.0)


def _rescue(t, grams=12.0, *, source="manual", certainty="estimate", created_at=None):
    return CarbEntry(t=t, grams=grams, certainty=certainty, source=source,
                     created_at=created_at)


class MealArcTest(unittest.TestCase):
    """The per-meal arc primitive (ADR 0018): absolute peak/nadir, truncation, ≥3h gate."""

    START = datetime(2026, 6, 1, 8, 0, 0)

    def test_peak_is_max_in_3h_nadir_is_min_after_peak(self):
        # Rise to 180 at +90 (the peak), crash to 70 at +240 (the nadir), recover to 90.
        cgm = _series(self.START, [(30, 120), (90, 180), (240, 70), (300, 90)])
        arc = _meal_arc(self.START, None, cgm)
        self.assertEqual(arc.peak, 180.0)      # absolute mg/dL, no baseline offset
        self.assertEqual(arc.nadir, 70.0)
        self.assertTrue(arc.nadir_qualifies)   # full 6h arc

    def test_nadir_only_searched_after_the_peak(self):
        # A low BEFORE the peak is not the nadir — the nadir window opens at peak_time.
        cgm = _series(self.START, [(30, 60), (90, 180), (240, 90)])
        arc = _meal_arc(self.START, None, cgm)
        self.assertEqual(arc.peak, 180.0)
        self.assertEqual(arc.nadir, 90.0)      # 60 at +30 precedes the peak, ignored

    def test_truncation_at_next_meal_caps_the_windows(self):
        # A true 3h peak of 250 at +140 is cut off when the next meal lands at +120.
        cgm = _series(self.START, [(30, 120), (90, 180), (140, 250), (200, 60)])
        nxt = self.START + timedelta(minutes=120)
        arc = _meal_arc(self.START, nxt, cgm)
        self.assertEqual(arc.peak, 180.0)      # 250 at +140 is past the truncation

    def test_arc_truncated_under_3h_does_not_qualify_for_nadir(self):
        # Next meal at +90 min → the arc spans <3h → excluded from the nadir series.
        cgm = _series(self.START, [(30, 120), (60, 170), (85, 150)])
        nxt = self.START + timedelta(minutes=90)
        arc = _meal_arc(self.START, nxt, cgm)
        self.assertEqual(arc.peak, 170.0)      # peak half still valid
        self.assertFalse(arc.nadir_qualifies)

    def test_no_cgm_in_window_is_all_none(self):
        arc = _meal_arc(self.START, None, [])
        self.assertIsNone(arc.peak)
        self.assertIsNone(arc.nadir)


class PostMealArcTest(unittest.TestCase):
    """Aggregation: split denominator, the 5-meal gate, and the None gap (ADR 0018)."""

    START = datetime(2026, 6, 1, 0, 0, 0)

    def _full_meals(self, n, *, peak=180, nadir=70):
        """``n`` clean meals 12h apart, each a peak-at-+90 / nadir-at-+240 arc."""
        meals, cgm = [], []
        for i in range(n):
            t = self.START + timedelta(hours=12 * i)
            meals.append(_meal(t))
            cgm += _series(t, [(30, 120), (90, peak), (240, nadir), (300, 90)])
        return meals, cgm

    def test_medians_and_split_denominator(self):
        meals, cgm = self._full_meals(ARC_MIN_MEALS)      # 5 clean full arcs
        # A 6th meal truncated to <3h by a trailing bolus (in ctx only): peak counts,
        # nadir excluded. Its next meal sits 60 min later.
        short_t = self.START + timedelta(hours=12 * ARC_MIN_MEALS)
        meals.append(_meal(short_t))
        cgm += _series(short_t, [(30, 150)])
        truncator = _meal(short_t + timedelta(minutes=60))
        peak, nadir, n_peak, n_nadir = post_meal_arc(
            meals, cgm, ctx_meals=meals + [truncator]
        )
        self.assertEqual(n_peak, ARC_MIN_MEALS + 1)       # all 6 meals have a peak
        self.assertEqual(n_nadir, ARC_MIN_MEALS)          # the short arc is excluded
        self.assertEqual(peak, 180.0)                     # absolute median
        self.assertEqual(nadir, 70.0)

    def test_below_five_qualifying_meals_is_a_none_gap(self):
        meals, cgm = self._full_meals(ARC_MIN_MEALS - 1)  # only 4 meals
        peak, nadir, n_peak, n_nadir = post_meal_arc(meals, cgm)
        self.assertIsNone(peak)                           # gate → None, not a value
        self.assertIsNone(nadir)
        self.assertEqual(n_peak, ARC_MIN_MEALS - 1)       # counts still reported
        self.assertEqual(n_nadir, ARC_MIN_MEALS - 1)

    def test_no_meals_is_none_with_zero_counts(self):
        peak, nadir, n_peak, n_nadir = post_meal_arc([], _cgm([100] * 10, start=self.START))
        self.assertIsNone(peak)
        self.assertIsNone(nadir)
        self.assertEqual((n_peak, n_nadir), (0, 0))

    def test_rescue_context_counts_preempted_manual_entries_inside_truncated_tail_only(self):
        meal = _meal(self.START)
        next_meal = _meal(self.START + timedelta(minutes=210))
        cgm = _cgm([120] * 80, start=self.START)
        entries = [
            _rescue(self.START + timedelta(minutes=60), grams=8.0),
            _rescue(
                self.START + timedelta(minutes=90),
                grams=None,
                source="low-prompt",
                certainty="unknown",
            ),
            _rescue(self.START + timedelta(minutes=120), grams=20.0,
                    source="rise-prompt"),
            _rescue(self.START - timedelta(minutes=5), grams=12.0),
            _rescue(self.START + timedelta(minutes=240), grams=12.0),
        ]

        got = post_meal_rescue_context(
            [meal], entries, cgm, ctx_meals=[meal, next_meal]
        )

        self.assertEqual(got, ArcRescueContext(count=1, grams=8.0, unknown_count=0))

    def test_rescue_context_excludes_manual_entries_on_printed_lows(self):
        meal = _meal(self.START)
        entry = _rescue(self.START + timedelta(minutes=90), grams=12.0)
        cgm = _series(self.START, [(60, 90), (85, 72), (120, 100)])

        got = post_meal_rescue_context([meal], [entry], cgm)

        self.assertEqual(got, ArcRescueContext())

    def test_rescue_context_excludes_entries_after_the_six_hour_tail(self):
        meal = _meal(self.START)
        got = post_meal_rescue_context(
            [meal],
            [_rescue(self.START + timedelta(minutes=ARC_MIN_MEALS * 100))],
            _cgm([120] * 10, start=self.START),
        )
        self.assertEqual(got.count, 0)

    def test_rescue_context_does_not_change_arc_medians_or_counts(self):
        meals, cgm = self._full_meals(ARC_MIN_MEALS, peak=180, nadir=85)
        entries = [_rescue(m.t + timedelta(minutes=210), grams=8.0) for m in meals]

        self.assertEqual(post_meal_arc(meals, cgm), (180.0, 85.0, 5, 5))
        self.assertEqual(post_meal_rescue_context(meals, entries, cgm).count, 5)
        self.assertEqual(post_meal_arc(meals, cgm), (180.0, 85.0, 5, 5))


class CountCorrectionStacksTest(unittest.TestCase):
    """The behavior-vs-harm split (#131's resolved caveat)."""

    def _corr(self, t, u=3.0):
        return BolusEvent(t, insulin=u, carbs=None)

    def test_stack_on_iob_no_low_is_behavior_not_harm(self):
        t0 = datetime(2026, 6, 1, 12, 0, 0)
        boluses = [self._corr(t0), self._corr(t0 + timedelta(minutes=30))]
        # Flat ~120, no low in the 4 h after → behavior fires, harm does not.
        cgm = _cgm([120] * 60, start=t0 - timedelta(minutes=30))
        behavior, harm = count_correction_stacks(boluses, boluses, cgm)
        self.assertEqual(behavior, 1)
        self.assertEqual(harm, 0)

    def test_stack_then_low_is_both_behavior_and_harm(self):
        t0 = datetime(2026, 6, 1, 12, 0, 0)
        boluses = [self._corr(t0), self._corr(t0 + timedelta(minutes=30))]
        # Flat 120 up to the stack, then a real low (<70) an hour later.
        pre = _cgm([120] * 18, start=t0 - timedelta(minutes=30))
        drop = _cgm([100, 85, 70, 60, 65], start=t0 + timedelta(minutes=60))
        behavior, harm = count_correction_stacks(boluses, boluses, pre + drop)
        self.assertEqual(behavior, 1)
        self.assertEqual(harm, 1)
        self.assertLessEqual(harm, behavior)  # harm ⊆ behavior

    def test_runaway_high_rising_is_excluded_from_both(self):
        t0 = datetime(2026, 6, 1, 12, 0, 0)
        boluses = [self._corr(t0), self._corr(t0 + timedelta(minutes=30))]
        # BG high (>180) AND climbing across the pre-dose slope → rational chase.
        rising = _cgm([250, 270, 290, 310, 330, 350, 370], start=t0)
        pre = _cgm([200, 210, 220, 230], start=t0 - timedelta(minutes=20))
        behavior, harm = count_correction_stacks(boluses, boluses, pre + rising)
        self.assertEqual(behavior, 0)
        self.assertEqual(harm, 0)

    def test_far_apart_corrections_do_not_stack(self):
        t0 = datetime(2026, 6, 1, 12, 0, 0)
        # 90 min apart → beyond the 60-min stack window.
        boluses = [self._corr(t0), self._corr(t0 + timedelta(minutes=90))]
        cgm = _cgm([120] * 60, start=t0 - timedelta(minutes=30))
        behavior, harm = count_correction_stacks(boluses, boluses, cgm)
        self.assertEqual((behavior, harm), (0, 0))


class FixedIsfTest(unittest.TestCase):
    """The window loop must judge every window against the SAME constant profile ISF."""

    def test_same_profile_isf_threaded_to_every_window(self):
        now = datetime(2026, 7, 2, 0, 0, 0)
        start = now - timedelta(days=42)  # 3 windows
        cgm = _cgm([120] * (288 * 42), start=start)
        store = _FakeStore(cgm=cgm)

        captured = []

        def _spy(bolus, cgm_, basal, *, isf=None, **kw):
            captured.append(isf)
            return ({e: 0 for e in Exposure}, {})

        with mock.patch(
            "ciq_autotune.outcomes_trend._profile_settings",
            return_value=(12.3, ProgrammedIcRange(5.0, 5.0)),
        ), mock.patch(
            "ciq_autotune.outcomes_trend.tally_attributions", side_effect=_spy
        ):
            trend = summarize_trend(store, window_days=14, now=now)

        self.assertEqual(len(trend.windows), 3)
        self.assertEqual(len(captured), 3)
        # Identical fixed ISF on every window — not a per-window estimate.
        self.assertEqual(set(captured), {12.3})
        self.assertEqual(trend.profile_isf, 12.3)
        self.assertEqual(trend.profile_ic, ProgrammedIcRange(5.0, 5.0))

    def test_unstamped_meal_matches_scenario_aggregate(self):
        bolus, cgm = dose_stamped_ic_fixture()
        with mock.patch(
            "ciq_autotune.outcomes_trend._profile_settings",
            return_value=(ISF, None),
        ):
            trend = summarize_trend(
                _FakeStore(cgm=cgm, bolus=bolus), window_days=14,
                now=datetime(2026, 6, 19),
            )

        carb_undercount = next(
            behavior for behavior in trend.behaviors
            if behavior.lever == Lever.CARB_UNDERCOUNT.value
        )
        self.assertEqual(len(carb_undercount.series), 1)
        self.assertEqual(carb_undercount.series[0].exposure_n, 4)
        self.assertEqual(carb_undercount.series[0].attributed, 3)


def _low_rebound_readings(t0, *, nadir=48.0, rebound=189.0):
    """The classic over-treated-low CGM shape (ADR 0005) around a nadir at ``t0 + 40m``.

    Mirrors ``test_scenario_engine.OverTreatedLowTest._low_rebound`` — falls 100 → nadir,
    climbs to a rebound past the 160 bar, then settles — so the low is attributed
    OVER_TREATED_LOW with no carb/bolus data needed.
    """
    def seg(offset_min, start_bg, slope, minutes, step=5):
        base = t0 + timedelta(minutes=offset_min)
        return [CgmReading(t=base + timedelta(minutes=step * k),
                           bg=start_bg + slope * step * k, type="EGV")
                for k in range(minutes // step + 1)]
    return (seg(0, 100, 0.0, 20) + seg(20, 100, -(100 - nadir) / 20.0, 20)
            + seg(40, nadir, (rebound - nadir) / 40.0, 40) + seg(80, rebound, -1.5, 60))


class LateAnswerBoundaryTest(unittest.TestCase):
    """A rolling window only reads answers recorded by its own endpoint (#467).

    An over-treated low sits in the older of two 1-day windows. A ``no`` low-prompt
    answer suppresses that over-treated-low attribution — but only for a window that had
    the answer by the time it closed. Anchored inside the window yet recorded after it
    closed, the answer must not reach back and reclassify it.
    """

    NOW = datetime(2026, 6, 3, 0, 0, 0)
    NADIR_BASE = datetime(2026, 6, 1, 12, 0, 0)  # nadir at 12:40, in the older window
    ANCHOR = datetime(2026, 6, 1, 12, 40, 0)

    def _cgm(self):
        low = _low_rebound_readings(self.NADIR_BASE)
        lo, hi = low[0].t, low[-1].t
        out, t = [], self.NOW - timedelta(days=2)
        while t < self.NOW:
            if not (lo <= t <= hi):
                out.append(CgmReading(t=t, bg=120.0, type="EGV"))
            t += timedelta(minutes=5)
        return sorted(out + low, key=lambda r: r.t)

    LATE = datetime(2026, 6, 2, 12, 0, 0)   # after the older window closed (06-02 00:00)

    def _older_point(self, *, answer, answered_at):
        row = {"detector": "low", "anchor_t": self.ANCHOR, "answer": answer,
               "answered_at": answered_at}
        with mock.patch("ciq_autotune.outcomes_trend._profile_settings",
                        return_value=(ISF, None)):
            trend = summarize_trend(
                _FakeStore(cgm=self._cgm(), responses=[row]),
                window_days=1, now=self.NOW,
            )
        beh = next(b for b in trend.behaviors if b.lever == Lever.OVER_TREATED_LOW.value)
        return beh.series[0]  # series[0] == the older window

    def test_a_late_no_answer_does_not_reclassify_the_closed_window(self):
        # A rescue `no` recorded after the older window closed cannot suppress that
        # window's over-treated-low count — the low is still there and still attributed.
        pt = self._older_point(answer="no", answered_at=self.LATE)
        self.assertEqual(pt.attributed, 1)
        self.assertEqual(pt.exposure_n, 1)

    def test_a_live_no_answer_does_reclassify_its_own_window(self):
        # Same answer recorded live (06-01 13:00, before the window closed) — eligible,
        # so it suppresses the over-treated-low step. Proves the late case above is the
        # boundary at work, not a dead answer.
        pt = self._older_point(answer="no", answered_at=datetime(2026, 6, 1, 13, 0, 0))
        self.assertEqual(pt.attributed, 0)

    def test_a_late_false_low_removes_the_historical_low(self):
        # A `false-low` flag is reading invalidation, not a rescue answer: it applies to
        # every read however late (adr-381), and it *removes* the low outright rather
        # than merely un-classifying it. So even recorded after the window closed, the
        # low's readings are gone — no LOWS exposure, nothing to attribute — where the
        # equally-late rescue `no` above left the low fully intact.
        pt = self._older_point(answer="false-low", answered_at=self.LATE)
        self.assertEqual(pt.exposure_n, 0)
        self.assertEqual(pt.attributed, 0)


class HonestDenominatorTest(unittest.TestCase):
    """Each behavior keeps its own exposure denominator (issue #131)."""

    def test_exposure_field_matches_lever_denominator(self):
        now = datetime(2026, 7, 2, 0, 0, 0)
        cgm = _cgm([120] * (288 * 14), start=now - timedelta(days=14))
        trend = summarize_trend(_FakeStore(cgm=cgm), window_days=14, now=now)
        by_lever = {b.lever: b.exposure for b in trend.behaviors}
        # The affinity-moved rows keep their OWN honest denominator.
        self.assertEqual(by_lever["missed_meal"], Exposure.HIGHS.value)
        self.assertEqual(
            by_lever["correction_stacking"], Exposure.CORRECTION_CLUSTERS.value
        )
        self.assertEqual(by_lever["over_treated_low"], Exposure.LOWS.value)
        self.assertEqual(by_lever["late_bolus"], Exposure.MEALS.value)

    def test_correction_pairs_denominate_stacking(self):
        now = datetime(2026, 7, 2, 12, 0, 0)
        start = now - timedelta(days=1)
        # Four user corrections → three consecutive pairs = the exposure denominator.
        bolus = [
            BolusEvent(start + timedelta(hours=h), insulin=3.0, carbs=None)
            for h in (1, 5, 9, 13)
        ]
        cgm = _cgm([120] * (288), start=start)
        trend = summarize_trend(_FakeStore(cgm=cgm, bolus=bolus), window_days=14, now=now)
        stacking = next(b for b in trend.behaviors if b.lever == "correction_stacking")
        # Newest window carries all four corrections → 3 pairs.
        self.assertEqual(stacking.series[-1].exposure_n, 3)


def _meal_at(t, *, bg=None):
    return BolusEvent(t, insulin=5.0, carbs=50.0, bg=bg)


class PreMealStartTest(unittest.TestCase):
    """The pre-meal starting-BG trend (#302): median bg0 per window, the honest
    known-start denominator, the thin-window gap, and CGM-resolved bg0."""

    START = datetime(2026, 6, 1, 8, 0, 0)

    def test_pure_median_and_count_over_gate(self):
        meals = [_meal_at(self.START + timedelta(hours=6 * i), bg=b)
                 for i, b in enumerate([150, 160, 170, 180, 190])]
        median, n = pre_meal_start(meals, [])
        self.assertEqual(median, 170.0)
        self.assertEqual(n, 5)

    def test_below_gate_is_a_gap_never_zero(self):
        meals = [_meal_at(self.START + timedelta(hours=6 * i), bg=170)
                 for i in range(ARC_MIN_MEALS - 1)]
        median, n = pre_meal_start(meals, [])
        self.assertIsNone(median)              # a gap, never a fabricated value
        self.assertEqual(n, ARC_MIN_MEALS - 1)

    def test_only_meals_with_a_readable_start_are_counted(self):
        # 3 meals with a start + 2 with neither bolus bg nor CGM → n = 3 (not 5), and
        # below the gate → a gap. A meal with no readable start contributes nothing.
        meals = ([_meal_at(self.START + timedelta(hours=6 * i), bg=170) for i in range(3)]
                 + [_meal_at(self.START + timedelta(hours=6 * (3 + i))) for i in range(2)])
        median, n = pre_meal_start(meals, [])
        self.assertEqual(n, 3)
        self.assertIsNone(median)

    def test_bg0_resolves_from_cgm_when_bolus_has_no_bg(self):
        # No bg on the bolus row; a CGM reading 5 min before each meal supplies bg0 —
        # the same resolution the I:C meals-start-high finding uses.
        meals, cgm = [], []
        for i, b in enumerate([150, 160, 170, 180, 190]):
            t = self.START + timedelta(hours=6 * i)
            meals.append(_meal_at(t))
            cgm.append(CgmReading(t - timedelta(minutes=5), bg=float(b)))
        median, n = pre_meal_start(meals, cgm)
        self.assertEqual(median, 170.0)
        self.assertEqual(n, 5)

    def test_summarize_trend_windows_the_series_with_an_empty_gap(self):
        now = datetime(2026, 7, 2, 0, 0, 0)
        cgm = _cgm([120] * (288 * 28), start=now - timedelta(days=28))
        # 5 meals starting high, all in the newest 14-day window (2 days apart); the
        # older window has no meals → an empty point, not a zero.
        meals = [_meal_at(now - timedelta(days=2 * i, hours=1), bg=b)
                 for i, b in enumerate([150, 160, 170, 180, 190])]
        trend = summarize_trend(_FakeStore(cgm=cgm, bolus=meals), window_days=14, now=now)
        self.assertEqual(len(trend.windows), 2)
        self.assertEqual(trend.pre_meal.series, [None, 170.0])
        self.assertEqual(trend.pre_meal.n, [0, 5])
        self.assertEqual(trend.pre_meal.target, 110.0)

    def test_markdown_renders_the_pre_meal_section(self):
        now = datetime(2026, 7, 2, 0, 0, 0)
        cgm = _cgm([120] * (288 * 14), start=now - timedelta(days=14))
        meals = [_meal_at(now - timedelta(days=2 * i, hours=1), bg=b)
                 for i, b in enumerate([150, 160, 170, 180, 190])]
        md = markdown_trend(
            summarize_trend(_FakeStore(cgm=cgm, bolus=meals), window_days=14, now=now)
        )
        self.assertIn("Pre-meal starting BG", md)
        self.assertIn("170", md)               # the current median
        self.assertIn("+60", md)               # delta vs the 110 target

    def test_markdown_renders_overnight_lows_as_an_outcome(self):
        now = datetime(2026, 6, 3, 12, 0, 0)
        start = now - timedelta(days=2)
        cgm = _cgm([120] * (288 * 2 + 1), start=start)
        low_at = datetime(2026, 6, 2, 2, 0, 0)
        cgm = [CgmReading(r.t, 60.0 if r.t == low_at else r.bg) for r in cgm]
        md = markdown_trend(
            summarize_trend(_FakeStore(cgm=cgm), window_days=2, now=now)
        )
        self.assertIn("Nights with a low", md)
        self.assertIn("1 of 2", md)
        self.assertIn("50%", md)


class PayloadShapeTest(unittest.TestCase):
    def _trend(self):
        now = datetime(2026, 7, 2, 0, 0, 0)
        cgm = _cgm([120] * (288 * 28), start=now - timedelta(days=28))
        return summarize_trend(_FakeStore(cgm=cgm), window_days=14, now=now)

    def test_top_level_keys_match_capture(self):
        body = json.loads(self._trend().to_json())
        self.assertEqual(
            set(body),
            {"schema_version", "window_days", "profile_isf", "profile_ic",
             "windows", "behaviors", "metrics", "arc", "pre_meal",
             "overnight_lows", "watched_change"},
        )
        self.assertEqual(body["schema_version"], SCHEMA_VERSION)

    def test_profile_ic_payload_preserves_varying_and_uniform_schedules(self):
        for values, expected in (
            ((5.1, 4.0, 5.4), {"min": 4.0, "max": 5.4}),
            ((5.1, 5.1), {"min": 5.1, "max": 5.1}),
        ):
            with self.subTest(values=values):
                trend = summarize_trend(
                    _FakeStore(snaps=[_snapshot_with_ic(*values)]),
                    window_days=14, now=datetime(2026, 6, 19),
                )
                self.assertEqual(trend.to_dict()["profile_ic"], expected)

    def test_overnight_lows_are_an_outcome_not_a_behavior(self):
        now = datetime(2026, 6, 3, 12, 0, 0)
        start = now - timedelta(days=2)
        cgm = _cgm([120] * (288 * 2 + 1), start=start)
        # One of the two inferred rest windows contains a printed low.
        low_at = datetime(2026, 6, 2, 2, 0, 0)
        cgm = [CgmReading(r.t, 60.0 if r.t == low_at else r.bg) for r in cgm]

        body = summarize_trend(
            _FakeStore(cgm=cgm), window_days=2, now=now
        ).to_dict()

        self.assertEqual(
            body["overnight_lows"],
            {
                "title": "Nights with a low",
                "unit": "%",
                "threshold": 70.0,
                "series": [50.0],
                "low_n": [1],
                "n": [2],
                # One window only → no prior to compare → never headlines.
                "cleared": False,
            },
        )
        self.assertNotIn(
            "overnight_low_from_evening_dosing",
            {behavior["lever"] for behavior in body["behaviors"]},
        )

    def test_pre_meal_payload_shape_and_window_alignment(self):
        body = json.loads(self._trend().to_json())
        pm = body["pre_meal"]
        self.assertEqual(
            set(pm),
            {"title", "unit", "target", "series", "n", "min_meals"},
        )
        n = len(body["windows"])
        self.assertEqual(len(pm["series"]), n)   # window-aligned
        self.assertEqual(len(pm["n"]), n)
        self.assertEqual(pm["unit"], "mg/dL")
        self.assertEqual(pm["target"], 110.0)
        # A flat-120 CGM trend with no meals: every window is a gap, never a zero.
        self.assertEqual(pm["series"], [None] * n)
        self.assertEqual(pm["n"], [0] * n)

    def test_arc_payload_shape_and_window_alignment(self):
        body = json.loads(self._trend().to_json())
        arc = body["arc"]
        self.assertEqual(
            set(arc),
            {
                "title", "unit", "peak", "nadir", "n_peak", "n_nadir",
                "preempted", "rescue_context", "observed_days", "rescue_evidence",
                "min_meals",
            },
        )
        n = len(body["windows"])
        for key in ("peak", "nadir", "n_peak", "n_nadir", "preempted", "rescue_context",
                    "observed_days", "rescue_evidence"):
            self.assertEqual(len(arc[key]), n)   # every arc series is window-aligned
        self.assertEqual(
            set(arc["rescue_context"][0]),
            {"count", "grams", "unknown_count"},
        )
        # Each window carries the four rescue-evidence states beside its day count (#467).
        self.assertEqual(
            set(arc["rescue_evidence"][0]["states"]),
            {"confirmed-rescue", "explicit-no", "not-sure"},
        )
        self.assertIn("state", arc["rescue_evidence"][0])
        self.assertIn("observed_days", arc["rescue_evidence"][0])
        for forbidden in ("rate", "pct", "percent", "denominator", "exposure"):
            self.assertNotIn(forbidden, arc["rescue_context"][0])
        self.assertEqual(arc["unit"], "mg/dL")   # absolute values, no offset

    def test_rescue_context_aligns_to_the_meal_window_not_entry_window(self):
        now = datetime(2026, 6, 3, 0, 0, 0)
        start = now - timedelta(days=2)
        cgm = _cgm([120] * (288 * 2), start=start)
        meal = BolusEvent(
            t=datetime(2026, 6, 1, 23, 0, 0),
            insulin=5.0,
            carbs=50.0,
        )
        # Recorded well before either window closed, so this test isolates the
        # attribution split (meal-window vs entry-window) from the created-at eligibility
        # boundary exercised separately below (#467).
        rescue = _rescue(datetime(2026, 6, 2, 0, 30, 0), grams=8.0,
                         created_at=datetime(2026, 6, 1, 12, 0, 0))

        trend = summarize_trend(
            _FakeStore(cgm=cgm, bolus=[meal], carbs=[rescue]),
            window_days=1,
            now=now,
        )

        self.assertEqual([r.count for r in trend.arc.rescue_context], [1, 0])
        self.assertEqual(trend.arc.preempted, [0, 1])

    def test_padded_context_eligibility_uses_the_wall_endpoint_not_end_plus_pad(self):
        # #467 fix: a rescue in a meal's tail that spills past the older window's wall
        # boundary is attributed to that window by event time — but only if it was
        # *recorded* by the wall endpoint. Recorded 5h after the window closed (well
        # inside the 11h context pad), it must NOT count against that closed window,
        # even though its event time falls in the padded look-ahead.
        now = datetime(2026, 6, 3, 0, 0, 0)
        start = now - timedelta(days=2)
        cgm = _cgm([120] * (288 * 2), start=start)
        meal = BolusEvent(t=datetime(2026, 6, 1, 23, 0, 0), insulin=5.0, carbs=50.0)
        rescue = _rescue(datetime(2026, 6, 2, 2, 0, 0), grams=8.0,
                         created_at=datetime(2026, 6, 2, 5, 0, 0))
        trend = summarize_trend(
            _FakeStore(cgm=cgm, bolus=[meal], carbs=[rescue]), window_days=1, now=now,
        )
        self.assertEqual([r.count for r in trend.arc.rescue_context], [0, 0])

    def _two_window_trend(self, rescue):
        """Two 1-day windows ending 2026-06-03, with one rescue in the older one."""
        now = datetime(2026, 6, 3, 0, 0, 0)
        cgm = _cgm([120] * (288 * 2), start=now - timedelta(days=2))
        return summarize_trend(
            _FakeStore(cgm=cgm, carbs=[rescue]), window_days=1, now=now,
        )

    def test_a_rescue_recorded_live_counts_in_its_own_window(self):
        # #467 control: recorded minutes after it happened, so the window that contains
        # it also knew about it.
        t = datetime(2026, 6, 1, 12, 0, 0)
        trend = self._two_window_trend(
            CarbEntry(t=t, grams=12.0, certainty="estimate", source="manual",
                      created_at=t + timedelta(minutes=5)))
        self.assertEqual(trend.arc.preempted, [1, 0])

    def test_a_rescue_backfilled_later_is_excluded_from_the_closed_window(self):
        # #467: same event time, recorded a day after that window closed — it may not
        # count against a window that ended before it existed.
        t = datetime(2026, 6, 1, 12, 0, 0)
        trend = self._two_window_trend(
            CarbEntry(t=t, grams=12.0, certainty="estimate", source="manual",
                      created_at=datetime(2026, 6, 2, 20, 0, 0)))
        self.assertEqual(trend.arc.preempted, [0, 0])

    def test_each_window_reports_the_days_the_rescue_log_was_recording(self):
        # The log's first record lands at the newer window's start, so that window is
        # fully observed and the older one not at all — a count of observed days, never
        # a rate (ADR 0012).
        t = datetime(2026, 6, 1, 12, 0, 0)
        trend = self._two_window_trend(
            CarbEntry(t=t, grams=12.0, certainty="estimate", source="manual",
                      created_at=datetime(2026, 6, 2, 0, 0, 0)))
        self.assertEqual(trend.arc.observed_days, [0, 1])

    def test_each_window_carries_the_four_rescue_states(self):
        # #467 / ADR 467: each Outcomes window names what the rescue log knew, not only
        # how many days it watched. A confirmed answer in the newer window and none in
        # the older (pre-instrumentation) one.
        now = datetime(2026, 6, 3, 0, 0, 0)
        cgm = _cgm([120] * (288 * 2), start=now - timedelta(days=2))
        answer = {"detector": "low", "anchor_t": datetime(2026, 6, 2, 12, 0, 0),
                  "answer": "carbs", "answered_at": datetime(2026, 6, 2, 12, 5, 0)}
        entry = CarbEntry(t=datetime(2026, 6, 2, 12, 0, 0), grams=12.0,
                          certainty="estimate", source="manual",
                          created_at=datetime(2026, 6, 2, 0, 0, 0))
        trend = summarize_trend(
            _FakeStore(cgm=cgm, carbs=[entry], responses=[answer]),
            window_days=1, now=now,
        )
        older, newer = trend.arc.rescue_evidence
        self.assertEqual(newer["states"]["confirmed-rescue"], 1)
        self.assertEqual(newer["state"], "confirmed-rescue")
        # The older window predates the log entirely — unknown, not rescue-free.
        self.assertEqual(older["state"], "no-recorded-observation")
        self.assertEqual(older["observed_days"], 0)
        self.assertFalse(older["fully_observed"])

    def test_eight_behaviors_in_locked_order(self):
        levers = [b["lever"] for b in json.loads(self._trend().to_json())["behaviors"]]
        self.assertEqual(
            levers,
            ["late_bolus", "carb_undercount", "meal_over_delivery", "over_treated_low",
             "correction_on_iob",
             "correction_stacking", "missed_meal", "meal_bolus_short"],
        )

    def test_metrics_in_locked_order_with_polarity(self):
        # The post-meal spike metric moved to the dedicated arc card (#196); the AGP
        # panel metrics remain, spike-free.
        metrics = json.loads(self._trend().to_json())["metrics"]
        self.assertEqual([m["key"] for m in metrics],
                         ["tir", "tbr", "mean", "cv"])
        by_key = {m["key"]: m for m in metrics}
        self.assertEqual(by_key["tir"]["polarity"], "up_good")   # only up_good metric
        self.assertEqual(by_key["tbr"]["polarity"], "down_good")
        self.assertEqual(by_key["tir"]["range"], "70–180")

    def test_window_meta_shape_and_cgm_active_is_fraction(self):
        w = json.loads(self._trend().to_json())["windows"]
        self.assertEqual(len(w), 2)
        for wm in w:
            self.assertEqual(set(wm), {"start", "end", "cgm_active", "days"})
            self.assertLessEqual(wm["cgm_active"], 1.0)   # a 0–1 fraction, capped
            self.assertGreaterEqual(wm["cgm_active"], 0.0)
        # Index-aligned oldest→newest.
        self.assertLess(w[0]["start"], w[1]["start"])

    def test_only_harm_bearing_behaviors_carry_harm(self):
        # correction_stacking and (when shown) user_override carry a harm sub-count;
        # every other lever omits it. This no-bolus trend keeps the override tile below
        # its gate, so correction_stacking is the only harm-bearing row here.
        behaviors = json.loads(self._trend().to_json())["behaviors"]
        harm_bearing = {"correction_stacking", "user_override"}
        for b in behaviors:
            for pt in b["series"]:
                if b["lever"] in harm_bearing:
                    self.assertIn("harm", pt)
                else:
                    self.assertNotIn("harm", pt)

    def test_series_are_window_aligned(self):
        trend = self._trend()
        n = len(trend.windows)
        for b in trend.behaviors:
            self.assertEqual(len(b.series), n)
        for m in trend.metrics:
            self.assertEqual(len(m.series), n)

    def test_empty_store_summarizes_without_error(self):
        trend = summarize_trend(_FakeStore(), window_days=14, now=datetime(2026, 7, 2))
        self.assertIsInstance(trend, OutcomesTrend)
        self.assertEqual(len(trend.windows), 1)
        self.assertEqual(len(trend.behaviors), 8)
        # No data → metric series is a single None, not a fabricated zero.
        tir = next(m for m in trend.metrics if m.key == "tir")
        self.assertEqual(tir.series, [None])


class OverrideTileTest(unittest.TestCase):
    """The override-rate tile (#161): appears only past the thin-data gate, carries harm."""

    NOW = datetime(2026, 7, 2, 0, 0, 0)

    def _override(self, t, u=3.0):
        # A user calculator correction dosed above the pump's ~0 rec (override-up).
        return BolusEvent(t=t, insulin=u, requested_insulin=u, carbs=None,
                          bolus_options=0, correction_insulin=0.0, food_insulin=0.0,
                          user_override=1, declined_correction=0)

    def _trend(self, n_overrides, *, low_at=None, scenario_config=None):
        # 28 days of flat 120 CGM (harm=0). `low_at` dips a single reading to 75 so a
        # qualifying low follows an override within the look-ahead → nonzero harm.
        start = self.NOW - timedelta(days=28)
        values = [120.0] * (288 * 28)
        if low_at is not None:
            idx = int((low_at - start).total_seconds() // 300)
            values[idx] = 75.0
        cgm = _cgm(values, start=start)
        bolus = [self._override(self.NOW - timedelta(days=1, hours=i))
                 for i in range(n_overrides)]
        store = _FakeStore(cgm=cgm, bolus=bolus)
        return summarize_trend(
            store, window_days=14, now=self.NOW, scenario_config=scenario_config
        )

    def _override_behavior(self, trend):
        return next((b for b in trend.behaviors if b.lever == "user_override"), None)

    def test_hidden_below_the_thin_data_gate(self):
        # Fewer than a handful of overrides → the tile stays silent (no n=2 headline).
        self.assertIsNone(self._override_behavior(self._trend(3)))

    def test_appears_once_enough_overrides_exist(self):
        b = self._override_behavior(self._trend(6))
        self.assertIsNotNone(b)
        self.assertEqual(b.exposure, "boluses")
        # Denominated on every bolus in the window; carries the harm sub-count.
        cur = b.series[-1]
        self.assertEqual(cur.attributed, 6)
        self.assertEqual(cur.exposure_n, 6)
        self.assertIsNotNone(cur.harm)

    def test_tile_never_recommends_correcting_harder(self):
        # Guardrail 1 also holds for the tile's copy.
        b = self._override_behavior(self._trend(6))
        rec = b.recommendation.lower()
        for banned in ("isf", "correct harder", "too weak", "increase your correction"):
            self.assertNotIn(banned, rec)

    def test_title_is_a_neutral_evidence_label(self):
        # #420: retitled to a factual label, not the coaching headline.
        b = self._override_behavior(self._trend(6))
        self.assertEqual(b.title, "Doses above pump calculation")

    def test_no_baked_coaching_copy_survives(self):
        # #420 banned-phrase guard: the tile carries no prose that explains the pump's
        # calculation, asserts it accounts for active insulin, or tells the user to
        # delay/add a dose. The evidence sentence is built frontend-side from the payload,
        # so the backend recommendation slot is empty.
        b = self._override_behavior(self._trend(6))
        self.assertEqual(b.recommendation, "")
        blob = f"{b.title} {b.recommendation}".lower()
        for banned in (
            "accounts for", "still working", "give the last dose",
            "time to act", "before adding more", "before you", "wait",
        ):
            self.assertNotIn(banned, blob)

    def test_harm_and_config_thresholds_surface_in_payload(self):
        # #420: the counts (harm sub-count) plus the harm threshold + look-ahead the gate
        # used all ride in the payload, so the frontend spells out the summary without
        # hardcoding literals. Nonzero-harm case: a low follows an override within 5 h.
        b = self._override_behavior(
            self._trend(6, low_at=self.NOW - timedelta(days=1) + timedelta(minutes=30))
        )
        self.assertGreater(b.series[-1].harm, 0)
        self.assertEqual(b.harm_threshold_mgdl, 80.0)
        self.assertEqual(b.harm_lookahead_min, 300.0)

    def test_zero_harm_still_carries_thresholds(self):
        # Zero follow-on lows: harm reads 0 (not None) and the thresholds still surface.
        b = self._override_behavior(self._trend(6))
        self.assertEqual(b.series[-1].harm, 0)
        self.assertEqual(b.harm_threshold_mgdl, 80.0)
        self.assertEqual(b.harm_lookahead_min, 300.0)

    def test_payload_look_ahead_follows_the_config(self):
        # The surfaced look-ahead is derived from ScenarioConfig, not a literal: change
        # the config and the payload follows.
        cfg = ScenarioConfig(user_override_harm_lookahead_min=240.0,
                             user_override_harm_low_mgdl=75.0)
        b = self._override_behavior(self._trend(6, scenario_config=cfg))
        self.assertEqual(b.harm_lookahead_min, 240.0)
        self.assertEqual(b.harm_threshold_mgdl, 75.0)


class CliRendererTest(unittest.TestCase):
    def _trend(self):
        now = datetime(2026, 7, 2, 0, 0, 0)
        cgm = _cgm([120] * (288 * 28), start=now - timedelta(days=28))
        return summarize_trend(_FakeStore(cgm=cgm), window_days=14, now=now)

    def test_markdown_covers_all_sections(self):
        md = markdown_trend(self._trend())
        self.assertIn("outcomes trend", md.lower())
        self.assertIn("fixed profile ISF", md)
        self.assertIn("each meal's Dose-stamped I:C", md)
        self.assertNotIn("fixed current-profile ISF/I:C", md)
        self.assertIn("Windows", md)
        self.assertIn("Behaviors", md)
        self.assertIn("Late bolus", md)
        self.assertIn("Glycemic metrics", md)
        self.assertIn("Time in range", md)
        self.assertIn("Watched change", md)


class WatchedChangeInPayloadTest(unittest.TestCase):
    """The active watched change (#244) rides on the trend payload, one at a time."""

    NOW = datetime(2026, 6, 20, 0, 0, 0)

    def _isf_boluses(self, spans):
        out = []
        for value, lo, hi in spans:
            for d in range(lo, hi + 1):
                out.append(BolusEvent(t=datetime(2026, 6, d, 8, 0, 0),
                                      insulin=5.0, carbs=40, isf=value,
                                      carb_ratio=7.0, target_bg=110))
        return out

    def test_setting_change_surfaces_as_a_trial(self):
        bolus = self._isf_boluses([(30, 10, 13), (45, 14, 19)])  # ISF change 06-14
        store = _FakeStore(bolus=bolus)
        trend = summarize_trend(store, window_days=14, now=self.NOW)
        wc = trend.to_dict()["watched_change"]
        self.assertEqual(wc["kind"], "trial")
        self.assertEqual(wc["parameter"], "isf")
        self.assertEqual(wc["target_metrics"], ["tir"])
        self.assertTrue(wc["maturing"]["is_maturing"])

    def test_pinned_focus_surfaces_when_no_change(self):
        store = _FakeStore(active_focus={"id": 7, "lever": "late_bolus",
                                         "pinned_at": "2026-06-10 08:00:00",
                                         "status": "active"})
        trend = summarize_trend(store, window_days=14, now=self.NOW)
        wc = trend.to_dict()["watched_change"]
        self.assertEqual(wc["kind"], "focus")
        self.assertEqual(wc["lever"], "late_bolus")

    def test_trial_preempts_and_drops_an_active_focus(self):
        bolus = self._isf_boluses([(30, 10, 13), (45, 14, 19)])
        store = _FakeStore(bolus=bolus,
                           active_focus={"id": 7, "lever": "late_bolus",
                                         "pinned_at": "2026-06-10 08:00:00",
                                         "status": "active"})
        trend = summarize_trend(store, window_days=14, now=self.NOW)
        wc = trend.to_dict()["watched_change"]
        # Never a Trial AND a Focus: the Trial wins, the Focus is dropped.
        self.assertEqual(wc["kind"], "trial")
        self.assertIn((7, "dropped"), store.dropped)

    def test_nothing_watched_is_null(self):
        trend = summarize_trend(_FakeStore(), window_days=14, now=self.NOW)
        self.assertIsNone(trend.to_dict()["watched_change"])


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class ApiRendererTest(unittest.TestCase):
    def setUp(self):
        import tempfile

        from ciq_autotune.store import Store
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        with Store.open(self.tmp.name) as store:
            cgm = []
            for d in range(1, 29):  # 28 days of full-cadence readings → 2 windows
                t0 = datetime(2026, 6, 1, 0, 0, 0) + timedelta(days=d - 1)
                for k in range(288):
                    tt = t0 + timedelta(minutes=5 * k)
                    cgm.append({"EventDateTime": tt.strftime("%Y-%m-%dT%H:%M:%S"),
                                "Readings (CGM / BGM)": 120, "Description": "EGV"})
            store.upsert_cgm(cgm)
        from ciq_autotune.api import create_app
        self.app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp.close()

    def test_trend_endpoint_returns_versioned_payload(self):
        r = self.client.get("/api/outcomes/trend", params={"window": 14})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["schema_version"], SCHEMA_VERSION)
        self.assertEqual(body["window_days"], 14)
        self.assertEqual(len(body["behaviors"]), 8)
        self.assertEqual(len(body["metrics"]), 4)
        self.assertIn("arc", body)
        self.assertGreaterEqual(len(body["windows"]), 2)

    def test_window_param_flows_through(self):
        r = self.client.get("/api/outcomes/trend", params={"window": 7})
        self.assertEqual(r.json()["window_days"], 7)


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class FocusApiTest(unittest.TestCase):
    """The Focus pin/unpin/list endpoints and the one-active invariant (#244)."""

    def setUp(self):
        import tempfile

        from ciq_autotune.store import Store
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        # An empty DB → no data instant, no Trial: a pin is allowed.
        with Store.open(self.tmp.name):
            pass
        from ciq_autotune.api import create_app
        self.app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp.close()

    def test_pin_list_resolve_roundtrip(self):
        r = self.client.post("/api/focus", json={"lever": "late_bolus"})
        self.assertEqual(r.status_code, 200, r.text)
        fid = r.json()["id"]
        self.assertEqual(r.json()["status"], "active")

        listing = self.client.get("/api/focus").json()
        self.assertEqual(listing["focuses"][0]["lever"], "late_bolus")
        self.assertIn("late_bolus", listing["pinnable"])
        self.assertNotIn("isf", listing["pinnable"])

        r = self.client.post(f"/api/focus/{fid}/resolve")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client.get("/api/focus").json()["focuses"][0]["status"],
                         "resolved")

    def test_non_behavioral_lever_rejected(self):
        r = self.client.post("/api/focus", json={"lever": "isf"})
        self.assertEqual(r.status_code, 400)

    def test_second_active_pin_rejected(self):
        self.assertEqual(self.client.post("/api/focus", json={"lever": "late_bolus"}).status_code, 200)
        r = self.client.post("/api/focus", json={"lever": "missed_meal"})
        self.assertEqual(r.status_code, 409)

    def test_resolve_missing_focus_is_404(self):
        self.assertEqual(self.client.post("/api/focus/999/resolve").status_code, 404)


class DayLevelGateTest(unittest.TestCase):
    """The adr-364 day-level bar (#377): the primitive that must reproduce the kills.

    The Verify digest headlines a "what changed" chip only when a two-arm day-rate
    comparison clears BOTH the 95% Newcombe interval (excludes zero) AND the two-sided
    Fisher exact (< 0.05). adr-364 priced six candidates and shipped an EMPTY launch
    set; the ones carrying clean binary day-counts must NOT clear.
    """

    def test_sunday_lows_do_not_clear(self):
        # adr-364: 17/22 observed Sundays vs 71/128 other days. Newcombe interval
        # -0.5..+37.1 points (includes zero) and Fisher exact 0.063 (> 0.05). The
        # borderline kill the interval/exact choice exists for — must NOT headline.
        self.assertFalse(day_rate_clears(17, 22, 71, 128))
        lo, hi = newcombe_diff_interval(17, 22, 71, 128)
        self.assertLessEqual(lo, 0.0)  # interval includes no difference
        self.assertAlmostEqual(fisher_exact_two_sided(17, 5, 71, 57), 0.063, places=2)

    def test_post_low_rebound_does_not_clear(self):
        # adr-364: 7/88 low-days rebounded above 250 vs 8/56 control days — the
        # base rate is actually higher, nowhere near significant. Must NOT headline.
        self.assertFalse(day_rate_clears(7, 88, 8, 56))

    def test_a_large_real_gap_clears(self):
        # A would-fail-first guard: a genuinely large, well-powered difference DOES
        # clear, so the gate isn't vacuously rejecting everything.
        self.assertTrue(day_rate_clears(45, 60, 10, 60))

    def test_empty_arm_never_clears(self):
        self.assertFalse(day_rate_clears(0, 0, 5, 20))
        self.assertFalse(day_rate_clears(5, 20, 0, 0))

    def test_fisher_two_sided_symmetric_and_bounded(self):
        p = fisher_exact_two_sided(10, 2, 3, 9)
        self.assertGreater(p, 0.0)
        self.assertLessEqual(p, 1.0)
        # A table with no association sits at p == 1.0.
        self.assertAlmostEqual(fisher_exact_two_sided(5, 5, 5, 5), 1.0, places=6)

    def test_overnight_cleared_uses_last_two_populated_windows(self):
        # A gap window (no Rest windows) is skipped; the two real day-rates that
        # bracket it are compared. A big swing across them clears.
        low_n = [45, 0, 10]
        n = [60, 0, 60]
        self.assertTrue(_overnight_lows_cleared(low_n, n))
        # A quiet move does not.
        self.assertFalse(_overnight_lows_cleared([11, 12], [24, 24]))
        # Fewer than two populated windows → nothing to compare.
        self.assertFalse(_overnight_lows_cleared([5, 0], [20, 0]))


class TrialWindowInvarianceTest(unittest.TestCase):
    """#18: a Trial's maturing window, watch horizon and accrual period are backend
    facts. Diagnose loads the trend at 30 days; none of the three may follow it."""

    NOW = datetime(2026, 6, 25, 0, 0, 0)

    def _store(self, **kwargs):
        # One ISF change at 2026-06-05 08:00 with dense CGM (4/day) through day 24
        # — the 15–28-day band where the dock's unbounded count used to run ahead
        # of Verify's bounded one.
        bolus = [BolusEvent(t=datetime(2026, 6, d, 8, 0, 0), insulin=5.0, carbs=40,
                            isf=30 if d <= 4 else 45, carb_ratio=7.0, target_bg=110)
                 for d in range(1, 25)]
        cgm = [CgmReading(t=datetime(2026, 6, d, h, 0, 0), bg=120.0)
               for d in range(1, 25) for h in (0, 6, 12, 18)]
        return _FakeStore(bolus=bolus, cgm=cgm, **kwargs)

    def test_trend_window_cannot_move_days_required(self):
        for window in (30, 90):
            trend = summarize_trend(self._store(), window_days=window, now=self.NOW)
            payload = trend.to_dict()
            # The tiling still follows the requested window …
            self.assertEqual(payload["window_days"], window)
            # … but the Trial's maturing window is the fixed backend 14.
            self.assertEqual(payload["watched_change"]["maturing"]["days_required"], 14)

    def test_trend_and_roster_count_the_same_bounded_days(self):
        from ciq_autotune.watched_change import review_trials
        store = self._store()
        wc = summarize_trend(store, window_days=30, now=self.NOW
                             ).to_dict()["watched_change"]
        roster = review_trials(store, now=self.NOW)["trials"]
        self.assertEqual(wc["parameter"], "isf")
        self.assertEqual(roster[0]["parameter"], "isf")
        # Maturity accrues only inside the Trial's own bounded 14-day period, so
        # the dock and Verify report the same count (15 dates span that period).
        self.assertEqual(wc["maturing"]["days_elapsed"], 15)
        self.assertEqual(roster[0]["maturing"]["days_elapsed"], 15)
        self.assertFalse(wc["maturing"]["is_maturing"])

    def test_aged_out_change_is_no_trial_and_keeps_the_pinned_focus(self):
        # A change 40 calendar days before now sits past the fixed 28-day horizon:
        # not a live Trial at any trend window, so loading Diagnose surfaces the
        # pinned Focus instead of dropping it.
        bolus = [BolusEvent(t=datetime(2026, 5, d, 8, 0, 0), insulin=5.0, carbs=40,
                            isf=30 if d <= 4 else 45, carb_ratio=7.0, target_bg=110)
                 for d in range(1, 15)]
        store = _FakeStore(bolus=bolus, active_focus={
            "id": 3, "lever": "late_bolus",
            "pinned_at": "2026-06-01 08:00:00", "status": "active",
        })
        wc = summarize_trend(store, window_days=30, now=datetime(2026, 6, 14)
                             ).to_dict()["watched_change"]
        self.assertEqual(wc["kind"], "focus")
        self.assertEqual(store.dropped, [])


if __name__ == "__main__":
    unittest.main()
