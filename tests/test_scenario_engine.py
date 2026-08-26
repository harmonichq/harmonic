"""Scenario engine tests (#70, layer 3).

The engine segments the raw timeline into episodes, attributes a single lever per
episode (root-cause-by-time — the dedup that collapses co-occurring classifier
flags), groups episodes into patterns, scores them with #58 ``Confidence``, selects
a hero, ranks, and emits the ranked payload #64 renders.

Coverage:

* **segmentation** — gap clustering, the 5 h hard cap, and the span-aware rule
  that keeps one continuous excursion (anchored only at its endpoints) as one
  episode.
* **single-lever attribution / dedup** — the case where three honest-but-local
  classifiers fire on *one* dinner and must collapse to one attributed episode
  with the co-occurring behaviors narrated as consequence steps.
* **pattern grouping + #58 scoring + hero** — episodes group by lever; the pattern
  carries a Wilson-scored rate against the right exposure denominator and a hero =
  the highest-severity episode.
* **confidence floor** — wide / low-score patterns collapse behind the
  low-confidence list; one-offs do not surface at all.
* **payload shape** — the Pattern / Episode / Step contract of #70 §5.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.classifiers.context_gate import CIQ_SUSPEND_TYPE
from ciq_autotune.analyzers.classifiers.correction_on_iob import (
    classify_correction_on_iob,
)
from ciq_autotune.analyzers.classifiers.evidence import (
    EvidenceTier,
    SilenceReason,
)
from ciq_autotune.analyzers.classifiers.missed_meal import (
    DIGESTION_LOOKBACK_MIN,
    classify_missed_meal,
)
from ciq_autotune.analyzers.scenario import (
    Exposure,
    Lever,
    LowPromptAnswer,
    ScenarioReport,
    assemble,
    low_prompt_answers,
    tally_attributions,
)
from ciq_autotune.analyzers.scenario.anchors import (
    Anchor,
    AnchorKind,
    collect_anchors,
)
from ciq_autotune.analyzers.scenario.attribute import (
    _high_lever,
    attribute,
    match_low_answer,
    over_treated_rebound_judgment,
)
from ciq_autotune.analyzers.scenario.payload import Step, event_ref, window_ref
from ciq_autotune.analyzers.scenario.engine import (
    _build_episode,
    _resolve_end,
    _window_bounds,
)
from ciq_autotune.analyzers.scenario.segment import (
    MAX_DURATION_MIN,
    REBOUND_HIGH_MGDL,
    REBOUND_HORIZON_MIN,
    EpisodeAnchors,
    GuardedRebound,
    guarded_rebound,
    guarded_rebound_peak,
    segment,
    split_double_humps,
)
from ciq_autotune.analyzers.scenario.severity import severity_score, worst_bg
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading


# --- builders (mirror tests/test_classifier_*.py conventions) --------------


def cgm_ramp(day, h, m, start_bg, slope_per_min, minutes, step=5):
    """5-min CGM readings ramping at ``slope_per_min`` mg/dL/min from (day, h:m)."""
    t0 = datetime(2026, 6, day, h, m, 0)
    return [
        CgmReading(t=t0 + timedelta(minutes=step * k),
                   bg=start_bg + slope_per_min * step * k, type="EGV")
        for k in range(minutes // step + 1)
    ]


def cgm_flat(day, h, m, bg, minutes, step=5):
    return cgm_ramp(day, h, m, bg, 0.0, minutes, step)


def meal(day, h, m, carbs=45.0, dose=10.0, carb_ratio=10.0):
    return BolusEvent(
        t=datetime(2026, 6, day, h, m, 0), insulin=dose, carbs=carbs,
        carb_ratio=carb_ratio, completion="Completed",
    )


def corr(day, h, m, units=2.0):
    return BolusEvent(t=datetime(2026, 6, day, h, m, 0), insulin=units, carbs=None)


def suspend_run(day, h, m, rows=8, cadence=5, profile_rate=0.9):
    t0 = datetime(2026, 6, day, h, m, 0)
    return [
        BasalEvent(t=t0 + timedelta(minutes=cadence * k), delivery_type=CIQ_SUSPEND_TYPE,
                   basal_rate=0.0, profile_basal_rate=profile_rate)
        for k in range(rows)
    ]


# Settings that let the carb-undercount classifier judge test meals.
ISF = 40.0


class PostMealSuspendAttributionTest(unittest.TestCase):
    def test_later_qualifying_suspend_attributes_meal_over_delivery(self):
        m = meal(15, 11, 45, carbs=50.0, dose=5.0)
        basal = suspend_run(15, 12, 0, rows=12)
        cgm = cgm_flat(15, 11, 30, 110.0, 105)
        cgm.append(CgmReading(
            t=datetime(2026, 6, 15, 13, 15), bg=68.0, type="EGV"
        ))

        report = assemble([m], cgm, basal, isf=None)

        self.assertIn(
            Lever.MEAL_OVER_DELIVERY,
            {episode.lever for episode in report.episodes.values()},
        )

    def test_suspend_at_inclusive_two_hour_boundary_is_owned(self):
        m = meal(15, 10, 0, carbs=50.0, dose=5.0)
        basal = suspend_run(15, 12, 0, rows=12)
        cgm = (
            cgm_flat(15, 10, 0, 110.0, 175)
            + cgm_ramp(15, 12, 55, 110.0, -1.4, 30)
        )

        report = assemble([m], cgm, basal, isf=None)

        self.assertIn(
            Lever.MEAL_OVER_DELIVERY,
            {episode.lever for episode in report.episodes.values()},
        )

    def test_suspend_after_two_hour_boundary_is_not_owned(self):
        m = meal(15, 10, 0, carbs=50.0, dose=5.0)
        basal = suspend_run(15, 12, 5, rows=12)
        cgm = (
            cgm_flat(15, 10, 0, 110.0, 180)
            + cgm_ramp(15, 13, 0, 110.0, -1.4, 30)
        )

        report = assemble([m], cgm, basal, isf=None)

        self.assertNotIn(
            Lever.MEAL_OVER_DELIVERY,
            {episode.lever for episode in report.episodes.values()},
        )

    def test_incomplete_later_bolus_does_not_steal_suspend_ownership(self):
        completed = BolusEvent(
            t=datetime(2026, 6, 15, 10, 30), insulin=5.0, carbs=50.0,
            completion="Completed", carb_ratio=10.0,
        )
        aborted = BolusEvent(
            t=datetime(2026, 6, 15, 11, 30), insulin=2.0, carbs=20.0,
            completion="User Aborted", carb_ratio=10.0,
        )
        basal = suspend_run(15, 12, 0, rows=12)
        cgm = (
            cgm_flat(15, 10, 0, 110.0, 175)
            + cgm_ramp(15, 12, 55, 110.0, -1.4, 30)
        )

        report = assemble([completed, aborted], cgm, basal, isf=None)

        episode = next(ep for ep in report.episodes.values()
                       if ep.lever is Lever.MEAL_OVER_DELIVERY)
        self.assertEqual(episode.steps[0].t, completed.t)

    def test_carb_undercount_keeps_precedence_over_owned_suspend(self):
        m = meal(15, 12, 0, carbs=20.0, dose=2.0)
        basal = suspend_run(15, 13, 20, rows=12)
        cgm = (
            cgm_flat(15, 10, 0, 100.0, 120)
            + cgm_ramp(15, 12, 0, 100.0, 2.0, 80)
            + cgm_ramp(15, 13, 20, 260.0, -3.6, 55)
        )

        report = assemble([m], cgm, basal, isf=ISF)

        self.assertIn(
            Lever.CARB_UNDERCOUNT,
            {episode.lever for episode in report.episodes.values()},
        )
        self.assertNotIn(
            Lever.MEAL_OVER_DELIVERY,
            {episode.lever for episode in report.episodes.values()},
        )

    def test_late_bolus_keeps_precedence_over_owned_suspend(self):
        m = meal(15, 12, 40, carbs=45.0, dose=10.0)
        basal = suspend_run(15, 13, 0, rows=12)
        cgm = (
            cgm_flat(15, 11, 40, 120.0, 30)
            + cgm_ramp(15, 12, 10, 120.0, 2.0, 50)
            + cgm_ramp(15, 13, 0, 220.0, -2.8, 55)
        )

        report = assemble([m], cgm, basal, isf=None)

        self.assertIn(
            Lever.LATE_BOLUS,
            {episode.lever for episode in report.episodes.values()},
        )
        self.assertNotIn(
            Lever.MEAL_OVER_DELIVERY,
            {episode.lever for episode in report.episodes.values()},
        )


def dose_stamped_ic_fixture():
    """Four runaway meals: three stamped I:C values and one unstamped (~25%)."""
    bolus, cgm = [], []
    for day, carb_ratio in zip((15, 16, 17, 18), (5.1, 4.0, 5.4, None)):
        bolus.append(meal(day, 8, 0, carbs=30.0, dose=6.0, carb_ratio=carb_ratio))
        cgm.extend(
            cgm_flat(day, 6, 0, 145, 30)
            + cgm_ramp(day, 8, 0, 145, 3.6, 60)
            + cgm_ramp(day, 9, 0, 361, -3.6, 60)
        )
    return bolus, cgm


def mixed(day, h, m, carbs=50.0, dose=5.4, correction=1.4):
    """A mixed food+correction bolus: a Msg3 split with a correction component (#160)."""
    return BolusEvent(t=datetime(2026, 6, day, h, m, 0), insulin=dose, carbs=carbs,
                      bolus_options=0, correction_insulin=correction)


class MixedBolusDualEmitTest(unittest.TestCase):
    """A mixed food+correction bolus is BOTH a meal and a correction (#160)."""

    def test_mixed_bolus_emits_both_meal_and_correction_anchors(self):
        cgm = cgm_flat(10, 11, 30, 130, 120)
        anchors = collect_anchors([mixed(10, 12, 0)], cgm, [])
        kinds = [a.kind for a in anchors]
        self.assertIn(AnchorKind.MEAL, kinds)
        self.assertIn(AnchorKind.CORRECTION, kinds)
        # Both anchors carry the same originating dose.
        for a in anchors:
            self.assertEqual(a.bolus.insulin, 5.4)

    def test_mixed_bolus_lands_in_both_exposure_denominators(self):
        from ciq_autotune.analyzers.scenario.engine import _exposure_counts
        from ciq_autotune.analyzers.scenario.levers import Exposure
        cgm = cgm_flat(10, 11, 0, 130, 180)
        # One mixed bolus, then a pure correction 30 min later. The mixed bolus is a
        # meal (MEALS=1) AND forms a consecutive correction pair with the pure one.
        boluses = [mixed(10, 12, 0), corr(10, 12, 30)]
        counts = _exposure_counts(boluses, cgm, [])
        self.assertEqual(counts[Exposure.MEALS], 1)
        self.assertEqual(counts[Exposure.CORRECTION_CLUSTERS], 1)  # len(corr)-1 == 1

    def test_mixed_bolus_without_split_is_meal_only(self):
        # No Msg3 split -> no CORRECTION anchor, today's behavior.
        cgm = cgm_flat(10, 11, 30, 130, 120)
        b = BolusEvent(t=datetime(2026, 6, 10, 12, 0, 0), insulin=6.0, carbs=45,
                       bolus_options=0, correction_insulin=None)
        kinds = [a.kind for a in collect_anchors([b], cgm, [])]
        self.assertIn(AnchorKind.MEAL, kinds)
        self.assertNotIn(AnchorKind.CORRECTION, kinds)


class DoseStampedIcAggregationTest(unittest.TestCase):
    def test_unstamped_share_stays_in_exposure_but_moves_out_of_attribution(self):
        bolus, cgm = dose_stamped_ic_fixture()

        exposure, attributed = tally_attributions(bolus, cgm, [], isf=ISF)

        self.assertEqual(exposure[Exposure.MEALS], 4)
        self.assertEqual(attributed[Lever.CARB_UNDERCOUNT], 3)

        report = assemble(bolus, cgm, [], isf=ISF)
        self.assertEqual(
            sum(ep.lever is Lever.CARB_UNDERCOUNT for ep in report.episodes.values()),
            3,
        )


class SegmentationTest(unittest.TestCase):
    def test_two_far_apart_anchors_are_two_episodes(self):
        # A breakfast meal at 08:00 and a dinner meal at 18:00 — far past the 90-min
        # gap, so two episodes.
        cgm = cgm_flat(10, 7, 0, 120, 60 * 13)
        anchors = collect_anchors([meal(10, 8, 0), meal(10, 18, 0)], cgm, [])
        eps = segment(anchors)
        self.assertEqual(len(eps), 2)

    def test_close_anchors_cluster_into_one_episode(self):
        # A meal at 12:00 and a correction 40 min later — within the gap, one episode.
        cgm = cgm_flat(10, 11, 30, 130, 120)
        anchors = collect_anchors([meal(10, 12, 0), corr(10, 12, 40)], cgm, [])
        eps = segment(anchors)
        self.assertEqual(len(eps), 1)
        self.assertEqual(len(eps[0].anchors), 2)

    def test_continuous_excursion_stays_one_episode(self):
        # A meal at 19:56 whose runaway high peaks ~100 min later. The only anchors
        # are the meal and the high peak (>90 min apart by their instants), but the
        # unbroken CGM run means the high *reaches back* to its onset — so the
        # span-aware gap keeps them one episode.
        pre = cgm_flat(28, 19, 30, 145, 25)
        runup = cgm_ramp(28, 19, 56, 150, 2.2, 100)
        cgm = pre + runup
        anchors = collect_anchors([meal(28, 19, 56, carbs=35.0, dose=8.0)], cgm, [])
        kinds = {a.kind for a in anchors}
        self.assertIn(AnchorKind.MEAL, kinds)
        self.assertIn(AnchorKind.HIGH, kinds)
        eps = segment(anchors)
        self.assertEqual(len(eps), 1)

    def test_five_hour_hard_cap_splits_a_runaway_cluster(self):
        # Anchors chained 60 min apart would cluster forever; the 5 h span cap must
        # split them. Seven meals 60 min apart span 6 h.
        cgm = cgm_flat(10, 6, 0, 120, 60 * 8)
        meals = [meal(10, 6 + k, 0) for k in range(7)]
        anchors = collect_anchors(meals, cgm, [])
        eps = segment(anchors)
        # Each episode's span must respect the hard cap.
        for e in eps:
            self.assertLessEqual(
                (e.end - e.start).total_seconds() / 60.0, MAX_DURATION_MIN + 1e-6)
        self.assertGreaterEqual(len(eps), 2)


class SegmentationCorrectnessTest(unittest.TestCase):
    """#78 zero-duration episodes + #80 double-hump split / cut-off-at-peak."""

    def test_zero_duration_meal_anchor_is_guarded(self):
        # #78: a meal whose excursion detection never fires inside a narrow window —
        # a CGM gap right after the bolus leaves no high-run onset reaching back to
        # the meal instant. A point-in-time meal reach would collapse to start == end,
        # scoring severity/worst_bg over an empty span. The meal now reaches forward
        # over its judgement horizon, so no episode is degenerate.
        m = meal(12, 12, 0, carbs=50.0, dose=9.0)
        # No readings 12:00–12:15 (the gap); CGM resumes already running away high, so
        # the high run's onset is at 12:20, not reaching back to the 12:00 meal.
        cgm = cgm_ramp(12, 12, 20, 210, 2.2, 120)   # 210 -> ~370, no onset at 12:00
        anchors = collect_anchors([m], cgm, [])
        eps = split_double_humps(segment(anchors), cgm)
        # The meal anchor alone must not produce a zero-duration episode.
        self.assertTrue(all(e.start != e.end for e in eps))
        meal_ep = next(e for e in eps if any(a.kind is AnchorKind.MEAL for a in e.anchors))
        self.assertGreater((meal_ep.end - meal_ep.start).total_seconds(), 0)

    def test_degenerate_window_severity_and_worst_bg_are_guarded(self):
        # A hand-built degenerate (point) meal episode — the pre-fix shape. Over the
        # empty [start, end] span severity is 0 and worst_bg reflects only the anchor
        # instant; no None-driven miscount is introduced, and _resolve_end never
        # returns before end (it only ever widens a truncated/empty window forward).
        m = meal(12, 12, 0, carbs=50.0, dose=9.0)
        cgm = cgm_ramp(12, 12, 0, 150, 2.0, 130)
        pt = Anchor(t=m.t, kind=AnchorKind.MEAL, bolus=m)
        ep = EpisodeAnchors(anchors=[pt])
        self.assertEqual(ep.start, ep.end)          # the degenerate case
        # Guarded: an empty span scores 0 (not a crash), and _resolve_end never moves
        # end earlier than the input end.
        self.assertEqual(severity_score(cgm, ep.start, ep.end), 0.0)
        self.assertGreaterEqual(_resolve_end(ep.start, ep.end, cgm), ep.end)

    def test_two_runaway_meals_each_get_their_own_carb_undercount(self):
        # #80 archetype (ep-060): a meal runs away to ~240 and *recovers into range*,
        # then a SEPARATE later meal runs away to ~250. Each meal must be its own
        # episode with its own carb-undercount attribution — the first meal must never
        # be silently dropped by the one-lever-per-episode rule. Since #249 widened
        # ``anchor_meal_reach_min`` to 300 (== the ``segment_max_duration_min`` hard
        # cap), the second meal's forward reach pushes the cluster span past the cap, so
        # ``segment`` now separates the two meals directly; ``split_double_humps`` is a
        # no-op on the already-separated single-meal clusters. Either way each meal owns
        # its excursion and its attribution (``split_double_humps``'s own divide is still
        # covered by ``test_split_double_humps_divides_meal_then_unbolused_high``).
        pre = cgm_flat(13, 11, 40, 120, 20)
        up1 = cgm_ramp(13, 12, 0, 120, 2.4, 50)     # meal1 12:00: 120 -> 240 by 12:50
        down1 = cgm_ramp(13, 12, 50, 240, -2.5, 45) # recovers to ~127 (into range)
        up2 = cgm_ramp(13, 13, 40, 128, 2.4, 50)    # meal2 13:40: 128 -> 248
        down2 = cgm_ramp(13, 14, 30, 248, -2.2, 50)
        cgm = pre + up1 + down1 + up2 + down2
        m1 = meal(13, 12, 0, carbs=45.0, dose=9.0)
        m2 = meal(13, 13, 40, carbs=42.0, dose=8.0)
        anchors = collect_anchors([m1, m2], cgm, [])
        clustered = segment(anchors)
        self.assertEqual(len(clustered), 2)         # separated at the max-duration cap
        split = split_double_humps(clustered, cgm)
        self.assertEqual(len(split), 2)             # already separate — a no-op here
        # Each hump attributes independently — the first meal is no longer dropped.
        levers = [
            attribute(e, cgm, [m1, m2], [], isf=ISF).lever
            for e in split
        ]
        self.assertEqual(levers, [Lever.CARB_UNDERCOUNT, Lever.CARB_UNDERCOUNT])

    def test_split_double_humps_divides_meal_then_unbolused_high(self):
        # split_double_humps' own job (#80), kept covered after #249 moved two-meal
        # separation to the max-duration cap: a bolused meal runs away to ~240 and
        # *recovers into range*, then a SEPARATE UNBOLUSED rise climbs to a ~260 high.
        # The meal's 300-min forward reach dominates the cluster span (== the hard cap,
        # not over it), so the two stapled excursions stay ONE cluster — and
        # split_double_humps must divide them at the return-to-range trough so the
        # unannounced second rise isn't demoted to a consequence of the meal.
        pre = cgm_flat(13, 11, 40, 120, 20)
        up1 = cgm_ramp(13, 12, 0, 120, 2.4, 50)     # meal 12:00: 120 -> 240 by 12:50 (no high anchor)
        down1 = cgm_ramp(13, 12, 50, 240, -2.5, 48) # recovers to ~120 (into range) by ~13:38
        up2 = cgm_ramp(13, 13, 50, 140, 3.0, 50)    # UNBOLUSED rise 13:50: 140 -> 290 (high anchor)
        down2 = cgm_ramp(13, 14, 40, 290, -3.0, 50) # descends through 250 over several readings
        cgm = pre + up1 + down1 + up2 + down2
        m = meal(13, 12, 0, carbs=45.0, dose=9.0)
        anchors = collect_anchors([m], cgm, [])
        # One meal anchor + one (unbolused) high-peak anchor — two story anchors.
        kinds = [a.kind for a in anchors if a.kind in (AnchorKind.MEAL, AnchorKind.HIGH)]
        self.assertEqual(sorted(kinds, key=lambda k: k.value),
                         [AnchorKind.HIGH, AnchorKind.MEAL])   # one meal + one high
        clustered = segment(anchors)
        self.assertEqual(len(clustered), 1)         # meal reach == the cap: stays one cluster
        split = split_double_humps(clustered, cgm)
        self.assertEqual(len(split), 2)             # divided at the return-to-range trough

    def test_single_hump_that_never_returns_to_range_is_not_split(self):
        # Guard against over-splitting (#70): a meal that runs away and over-corrects
        # straight into a low — a monotonic transit through range, never a settled
        # in-range trough between two stories — stays ONE episode. A lone excursion is
        # not two humps just because it crossed the range band on its way down.
        pre = cgm_flat(14, 10, 40, 130, 20)
        up = cgm_ramp(14, 11, 0, 130, 2.6, 55)      # 130 -> ~273
        down = cgm_ramp(14, 11, 55, 273, -3.0, 80)  # straight through range to ~33
        cgm = pre + up + down
        m = meal(14, 11, 0, carbs=40.0, dose=8.0)
        anchors = collect_anchors([m], cgm, [])
        split = split_double_humps(segment(anchors), cgm)
        self.assertEqual(len(split), 1)

    def test_split_episodes_never_overlap_in_time(self):
        # #80 non-overlap invariant. A multi-hump day: three meals, each running high
        # and recovering into range. Since #249 each meal reaches t+300 (== the
        # max-duration cap), so segment separates them into distinct episodes; the
        # forward extensions (meal-reach t+300 and cut-off-at-peak _resolve_end) must be
        # bounded by the next episode's start so the same danger-time is never counted
        # by two episodes. Assert each episode.end <= the next episode.start.
        pre = cgm_flat(20, 6, 40, 120, 20)
        h1u = cgm_ramp(20, 7, 0, 120, 2.4, 50)
        h1d = cgm_ramp(20, 7, 50, 240, -2.5, 45)     # recovers to ~127 (into range)
        h2u = cgm_ramp(20, 8, 40, 128, 2.4, 50)
        h2d = cgm_ramp(20, 9, 30, 248, -2.5, 48)     # recovers to ~128
        h3u = cgm_ramp(20, 10, 20, 130, 2.4, 50)
        h3d = cgm_ramp(20, 11, 10, 250, -2.5, 50)
        cgm = pre + h1u + h1d + h2u + h2d + h3u + h3d
        meals = [
            meal(20, 7, 0, carbs=45.0, dose=9.0),
            meal(20, 8, 40, carbs=42.0, dose=8.0),
            meal(20, 10, 20, carbs=44.0, dose=9.0),
        ]
        report = assemble(meals, cgm, [], isf=ISF)
        eps = sorted(report.episodes.values(), key=lambda e: e.start)
        # The multi-hump day split into distinct episodes (not one blob).
        self.assertGreaterEqual(len(eps), 2)
        # The non-overlap invariant: no two episodes share a stretch of wall-clock.
        for earlier, later in zip(eps, eps[1:]):
            self.assertLessEqual(
                earlier.end, later.start,
                f"{earlier.id} ({earlier.end}) overlaps {later.id} ({later.start})",
            )

    def test_cut_off_at_peak_episode_extends_to_resolution(self):
        # #80: the 5 h cap (or a truncated reach) ends an episode while BG is still
        # out of range — the arc is cut off at its peak. _resolve_end must push the
        # end forward to the excursion's return-to-range so severity/worst_bg cover
        # the whole arc, not a slice that stops at the peak.
        start = datetime(2026, 6, 13, 12, 0, 0)
        end = datetime(2026, 6, 13, 14, 0, 0)       # ends mid-runaway (BG ~330)
        up = cgm_ramp(13, 12, 0, 150, 1.5, 140)     # 150 -> ~360 by 14:20
        down = cgm_ramp(13, 14, 20, 360, -2.5, 120) # crosses back into range ~15:35
        cgm = up + down
        self.assertGreater(next(r.bg for r in cgm if r.t == end), 180)  # cut off high
        extended = _resolve_end(start, end, cgm)
        self.assertGreater(extended, end)           # arc extended past the peak
        # Severity over the full arc strictly exceeds the truncated-at-peak severity.
        self.assertGreater(
            severity_score(cgm, start, extended),
            severity_score(cgm, start, end),
        )
        # And worst_bg over the extended window still surfaces the true peak.
        self.assertIsNotNone(worst_bg(cgm, start, extended))


class SingleLeverAttributionTest(unittest.TestCase):
    """The dedup case: three flags on one dinner collapse to one lever."""

    def _undercounted_dinner(self):
        # A dinner bolus at 19:56 that under-covers a huge meal: BG runs 150 -> ~370
        # (carb undercount, the earliest actionable driver). The runaway then trips
        # a defensive suspend that nears a low, and the tail reads meal-shaped — the
        # co-occurring behaviors the old detectors each flagged separately.
        pre = cgm_flat(28, 19, 35, 148, 20)
        runup = cgm_ramp(28, 19, 56, 150, 2.4, 95)      # 150 -> ~370 by ~21:31
        cgm = pre + runup
        m = meal(28, 19, 56, carbs=35.0, dose=8.0)
        return cgm, m

    def test_three_flag_dinner_gets_one_carb_undercount_lever(self):
        cgm, m = self._undercounted_dinner()
        anchors = collect_anchors([m], cgm, [])
        eps = segment(anchors)
        self.assertEqual(len(eps), 1)         # one dinner, not three
        attr = attribute(eps[0], cgm, [m], [], isf=ISF)
        self.assertEqual(attr.lever, Lever.CARB_UNDERCOUNT)
        self.assertEqual(attr.trigger, "meal")
        # The driver step is the carb-undercount inference, hedged (never asserted).
        self.assertEqual(attr.steps[0].evidence_tier, EvidenceTier.INFERRED)
        self.assertIn("implies", attr.steps[0].text)

    def test_earliest_driver_wins_and_later_flag_is_a_consequence(self):
        # A meal that runs away (carb undercount, the earliest actionable driver),
        # peaks ~330, then falls; the user then stacks two corrections onto the
        # residual IOB once BG is back down (not high/rising), which drives a later
        # low. The stack is a *genuine* correction-stacking hit — but it must narrate
        # as a consequence of the undercount, not mint a second lever/pattern.
        pre = cgm_flat(15, 10, 40, 150, 20)
        up = cgm_ramp(15, 11, 0, 150, 3.0, 60)          # 150 -> ~330 by 12:00
        down = cgm_ramp(15, 12, 0, 330, -3.0, 60)       # ~330 -> 150 by 13:00
        crash = cgm_ramp(15, 13, 0, 150, -1.4, 100)     # 150 -> ~30 by ~14:40 (stack low)
        cgm = pre + up + down + crash
        m = meal(15, 11, 0, carbs=30.0, dose=7.0)
        c1 = corr(15, 12, 40, units=4.0)                # onto the residual, BG ~150
        c2 = corr(15, 13, 10, units=4.0)
        boluses = [m, c1, c2]
        anchors = collect_anchors(boluses, cgm, [])
        eps = segment(anchors)
        self.assertEqual(len(eps), 1)                   # all one episode
        attr = attribute(eps[0], cgm, boluses, [], isf=ISF)
        # Earliest actionable driver is the meal (carb undercount), not the stack.
        self.assertEqual(attr.lever, Lever.CARB_UNDERCOUNT)
        # ...and the stack shows up as a later consequence step, not a new lever.
        self.assertGreaterEqual(len(attr.steps), 2)
        self.assertTrue(any("correction" in s.text.lower() for s in attr.steps[1:]))

    def test_resolved_fine_episode_has_no_lever(self):
        # A meal that peaks at a benign 160 and settles — no actionable behavior.
        cgm = cgm_ramp(15, 12, 0, 120, 0.4, 120)        # gentle, never runs away
        m = meal(15, 12, 0, carbs=40.0, dose=8.0)
        anchors = collect_anchors([m], cgm, [])
        eps = segment(anchors)
        attr = attribute(eps[0], cgm, [m], [], isf=ISF)
        self.assertIsNone(attr.lever)


class MissedMealAndOvernightTest(unittest.TestCase):
    def test_unannounced_rise_is_missed_meal(self):
        # A steep from-flat rise into a >250 high with NO bolus anywhere.
        cgm = cgm_ramp(15, 15, 0, 130, 2.2, 100)        # 130 -> ~350, no bolus
        anchors = collect_anchors([], cgm, [])
        eps = segment(anchors)
        self.assertEqual(len(eps), 1)
        attr = attribute(eps[0], cgm, [], [], isf=ISF)
        self.assertEqual(attr.lever, Lever.MISSED_MEAL)

    def test_overnight_low_after_evening_meal_dose_is_not_a_lever(self):
        # A late meal dose still acting when BG bottoms at 60 is an outcome to track,
        # not a user-controlled behavior to attribute as a Lever (#327).
        evening_meal = meal(15, 22, 30, carbs=50.0, dose=4.0)
        fall = cgm_ramp(16, 0, 0, 110, -0.7, 70)        # 110 -> ~61 by ~01:10
        low = cgm_flat(16, 1, 10, 60, 30)
        cgm = fall + low
        anchors = collect_anchors([evening_meal], cgm, [])
        low_eps = [e for e in segment(anchors)
                   if any(a.kind is AnchorKind.LOW for a in e.anchors)]
        self.assertTrue(low_eps)
        attr = attribute(low_eps[0], cgm, [evening_meal], [], isf=ISF)
        self.assertIsNone(attr.lever)


class MissedMealAnchorAndWindowTest(unittest.TestCase):
    """#118: the missed-meal lever anchors at the rise onset (not the peak) and the
    matched step carries the digestion lookback as a ``cited_window`` span."""

    # A HIGH excursion: onset (first out-of-range reading) at 16:20, peak at 18:00.
    ONSET = datetime(2026, 6, 11, 16, 20, 0)
    PEAK = datetime(2026, 6, 11, 18, 0, 0)

    def _cgm(self):
        # A steady rise (>1 mg/dL/min) spanning the onset and the peak so the slope
        # fit is valid at either anchor; no low/suspend for the gate to catch.
        return cgm_ramp(11, 15, 40, 180, 1.4, 140)      # 15:40 -> 18:00, 180 -> 376

    def _anchor(self):
        return Anchor(t=self.PEAK, kind=AnchorKind.HIGH, bg=376.0,
                      span_start=self.ONSET, span_end=self.PEAK)

    def test_peak_anchoring_would_miss_a_meal_the_onset_sees(self):
        # A 35 g meal at 15:13. From the PEAK a 150-min lookback starts 15:30 and
        # misses it (→ missed meal); from the ONSET it starts 13:50 and sees it (→
        # digestion tail). This is the miss the fix targets.
        cgm = self._cgm()
        prior = meal(11, 15, 13, carbs=35.0, dose=7.0)
        self.assertTrue(classify_missed_meal(self.PEAK, cgm, [prior]).matched)
        self.assertFalse(classify_missed_meal(self.ONSET, cgm, [prior]).matched)

    def test_high_lever_anchors_at_reach_start(self):
        # _high_lever must use the onset, so the meal is seen and nothing fires.
        cgm = self._cgm()
        prior = meal(11, 15, 13, carbs=35.0, dose=7.0)
        # _high_lever returns (lever_result, silence); no lever means the first is None.
        self.assertIsNone(_high_lever(self._anchor(), cgm, [prior], [])[0])

    def test_matched_step_carries_the_digestion_window(self):
        # No prior meal → matched. The step sits at the onset and cites the
        # [onset - 150 min, onset] digestion window it scanned.
        cgm = self._cgm()
        result, _silence = _high_lever(self._anchor(), cgm, [], [])
        self.assertIsNotNone(result)
        lever, step = result
        self.assertEqual(lever, Lever.MISSED_MEAL)
        self.assertEqual(step.t, self.ONSET)
        expected_start = self.ONSET - timedelta(minutes=DIGESTION_LOOKBACK_MIN)
        self.assertEqual(step.cited_window, window_ref(expected_start, self.ONSET))

    def test_attribution_trigger_t_is_the_onset(self):
        # The whole-episode attribution reports the onset as the trigger instant, so
        # the narrative arc bounds from the climb, not the peak.
        cgm = self._cgm()
        attr = attribute(EpisodeAnchors([self._anchor()]), cgm, [], [],
                         isf=ISF)
        self.assertEqual(attr.lever, Lever.MISSED_MEAL)
        self.assertEqual(attr.trigger_t, self.ONSET)
        self.assertEqual(attr.steps[0].cited_window["start"],
                         window_ref(self.ONSET - timedelta(minutes=DIGESTION_LOOKBACK_MIN),
                                    self.ONSET)["start"])

    def test_display_window_covers_the_cited_lookback_span(self):
        # #118: the display window must reach back over the digestion lookback so the
        # band isn't clipped to a sliver at the canvas edge. The trigger sits at the
        # onset; its cited_window reaches 150 min further back.
        win = window_ref(self.ONSET - timedelta(minutes=DIGESTION_LOOKBACK_MIN),
                         self.ONSET)
        trigger = Step(t=self.ONSET, text="rise", evidence_tier=EvidenceTier.INFERRED,
                       cited_window=win)
        peak = Step(t=self.PEAK, text="peak", evidence_tier=EvidenceTier.OBSERVED)
        lo, hi = _window_bounds(self.ONSET, self.PEAK, [trigger, peak])
        # Reaches at least to the lookback start (minus the display pad), not just
        # the pad before the trigger.
        self.assertLessEqual(
            lo, self.ONSET - timedelta(minutes=DIGESTION_LOOKBACK_MIN))
        self.assertGreaterEqual(hi, self.PEAK)

    def test_step_to_dict_serializes_cited_window(self):
        with_win = Step(t=self.ONSET, text="x", evidence_tier=EvidenceTier.INFERRED,
                        cited_window=window_ref(self.ONSET, self.PEAK))
        self.assertEqual(with_win.to_dict()["cited_window"],
                         window_ref(self.ONSET, self.PEAK))
        # A beat that scans no window serializes an explicit null.
        plain = Step(t=self.ONSET, text="x", evidence_tier=EvidenceTier.OBSERVED)
        self.assertIsNone(plain.to_dict()["cited_window"])


class SeverityTest(unittest.TestCase):
    def test_low_outweighs_high_of_equal_magnitude(self):
        # A 55 (15 below 70) held 30 min vs a 195 (15 above 180) held 30 min: the
        # low must score higher (hypo-weighted).
        start = datetime(2026, 6, 15, 12, 0, 0)
        low = cgm_flat(15, 12, 0, 55, 30)
        high = cgm_flat(15, 12, 0, 195, 30)
        s_low = severity_score(low, start, start + timedelta(minutes=30))
        s_high = severity_score(high, start, start + timedelta(minutes=30))
        self.assertGreater(s_low, s_high)

    def test_in_range_scores_zero(self):
        start = datetime(2026, 6, 15, 12, 0, 0)
        cgm = cgm_flat(15, 12, 0, 120, 60)
        self.assertEqual(severity_score(cgm, start, start + timedelta(hours=1)), 0.0)

    def test_deeper_nadir_outscores_shallower_at_equal_duration(self):
        # #151: two lows held the SAME time below range — a 46 and a 68 — must not
        # score alike. The nadir-depth term makes the deeper crash clearly worse.
        start = datetime(2026, 6, 15, 12, 0, 0)
        deep = cgm_flat(15, 12, 0, 46, 30)
        shallow = cgm_flat(15, 12, 0, 68, 30)
        end = start + timedelta(minutes=30)
        self.assertGreater(
            severity_score(deep, start, end), severity_score(shallow, start, end)
        )


class PatternScoringAndPayloadTest(unittest.TestCase):
    def _recurring_missed_meals(self, n_days):
        """``n_days`` unannounced meal-shaped highs (one per day) + filler meals so
        the exposure denominator is realistic."""
        bolus = []
        cgm = []
        for d in range(1, n_days + 1):
            # An unannounced high rise mid-afternoon (no bolus).
            cgm += cgm_ramp(d, 15, 0, 130, 2.2, 100)
            # A normal, resolved breakfast far away (exposure meal, no lever).
            cgm += cgm_ramp(d, 8, 0, 120, 0.3, 90)
            bolus.append(meal(d, 8, 0, carbs=40.0, dose=8.0))
        return bolus, cgm

    def test_recurring_pattern_surfaces_ranked_with_hero(self):
        bolus, cgm = self._recurring_missed_meals(4)
        report = assemble(bolus, cgm, [], isf=ISF)
        self.assertIsInstance(report, ScenarioReport)
        missed = [p for p in report.patterns if p.lever == Lever.MISSED_MEAL]
        self.assertEqual(len(missed), 1)
        p = missed[0]
        # k = 4 unannounced-meal episodes; scored against the HIGHS exposure.
        self.assertEqual(p.confidence.k, 4)
        self.assertGreaterEqual(p.confidence.n, 4)
        self.assertEqual(p.rank, 1)
        # Hero is a real episode id that resolves, and it heads the occurrence list.
        self.assertIn(p.hero_episode, report.episodes)
        self.assertEqual(p.occurrences[0], p.hero_episode)
        self.assertEqual(len(p.occurrences), 4)

    def test_one_off_does_not_surface(self):
        # A single unannounced high — a one-off, must not surface anywhere.
        cgm = cgm_ramp(15, 15, 0, 130, 2.2, 100)
        report = assemble([], cgm, [], isf=ISF)
        levers = {p.lever for p in report.patterns} | {p.lever for p in report.low_confidence}
        self.assertNotIn(Lever.MISSED_MEAL, levers)

    def test_wide_thin_pattern_collapses_to_low_confidence(self):
        # Exactly the minimum (2) occurrences: enough to be a pattern, but thin
        # enough that its Wilson interval is wide -> low-confidence expander, not a
        # surfaced headline.
        bolus, cgm = self._recurring_missed_meals(2)
        report = assemble(bolus, cgm, [], isf=ISF)
        surfaced = {p.lever for p in report.patterns}
        collapsed = {p.lever for p in report.low_confidence}
        self.assertNotIn(Lever.MISSED_MEAL, surfaced)
        self.assertIn(Lever.MISSED_MEAL, collapsed)

    def test_payload_shape(self):
        bolus, cgm = self._recurring_missed_meals(4)
        d = assemble(bolus, cgm, [], isf=ISF).to_dict()
        # Top-level contract.
        for key in ("schema_version", "window", "patterns", "low_confidence",
                    "episodes", "preempted_lows"):
            self.assertIn(key, d)
        # The #172 count-object rides alongside patterns (ADR 0012).
        for key in ("total", "ic", "isf", "unattributed", "floor_u"):
            self.assertIn(key, d["preempted_lows"])
        p = d["patterns"][0]
        for key in ("lever", "confidence", "rank", "recommendation",
                    "hero_episode", "occurrences"):
            self.assertIn(key, p)
        for key in ("rate", "lo", "hi", "score", "wide"):
            self.assertIn(key, p["confidence"])
        # Episode contract (#70 §5).
        ep = d["episodes"][p["hero_episode"]]
        for key in ("id", "start", "end", "trigger", "lever", "severity",
                    "steps", "window"):
            self.assertIn(key, ep)
        step = ep["steps"][0]
        for key in ("t", "text", "evidence_tier"):
            self.assertIn(key, step)
        self.assertIn(step["evidence_tier"],
                      {"observed", "inferred", "not_in_data"})

    def test_window_reuses_timeline_shape(self):
        # The episode window is built by an injected builder (here a stub) — the
        # engine passes [start, end] and stores whatever it returns.
        bolus, cgm = self._recurring_missed_meals(3)

        def builder(s, e):
            return {"cgm": [], "boluses": [], "basal": [],
                    "start": s.isoformat(), "end": e.isoformat()}

        report = assemble(bolus, cgm, [], isf=ISF,
                          window_builder=builder)
        any_ep = next(iter(report.episodes.values()))
        self.assertIn("cgm", any_ep.window)
        self.assertIn("start", any_ep.window)


class OverTreatedLowJudgmentTest(unittest.TestCase):
    """The complete rebound judgment keeps every guarded-scan outcome (#90)."""

    def _rebound(self, peak):
        t0 = datetime(2026, 6, 17, 11, 30)
        return (
            [
                CgmReading(t=t0, bg=55.0, type="EGV"),
                CgmReading(t=t0 + timedelta(minutes=5), bg=peak, type="EGV"),
            ],
            t0,
        )

    def test_complete_judgment_covers_fired_near_clean_and_insufficient(self):
        cases = (
            ("fired", 165.0, True, EvidenceTier.INFERRED, None),
            ("near", 155.0, False, EvidenceTier.OBSERVED,
             SilenceReason.UNDER_THRESHOLD),
            ("clean", 135.0, False, EvidenceTier.OBSERVED,
             SilenceReason.NO_TRIGGER),
        )
        for label, peak, matched, tier, silence_reason in cases:
            with self.subTest(label=label):
                cgm, nadir_t = self._rebound(peak)
                judgment = over_treated_rebound_judgment(cgm, nadir_t, 55.0, [])
                self.assertEqual(judgment.rebound.peak, peak)
                self.assertEqual(judgment.rebound_bar, 160.0)
                self.assertEqual(judgment.near_floor, 140.0)
                self.assertEqual(judgment.verdict.matched, matched)
                self.assertEqual(judgment.verdict.evidence_tier, tier)
                self.assertEqual(judgment.verdict.silence_reason, silence_reason)

        nadir_t = datetime(2026, 6, 18, 11, 30)
        judgment = over_treated_rebound_judgment(
            [CgmReading(t=nadir_t, bg=55.0, type="EGV")], nadir_t, 55.0, []
        )
        self.assertIsNone(judgment.rebound.peak)
        self.assertFalse(judgment.verdict.matched)
        self.assertEqual(judgment.verdict.evidence_tier, EvidenceTier.NOT_IN_DATA)
        self.assertEqual(judgment.verdict.silence_reason, SilenceReason.INSUFFICIENT_DATA)


class OverTreatedLowTest(unittest.TestCase):
    """#104: over-eating lows must be counted — even absorbed under an upstream lever.

    Fixtures follow ADR 0005's cited examples: a low the user over-treats with fast
    carbs rebounds into a high. Today it is under-reported because (1) an
    earlier lever in the same episode absorbs it, (2) the rebound threshold (180) is
    stricter than the design (160) and the peak scan stops at ``episode.end``, and
    (3) a single occurrence is gated out. These fixtures pin the fixed counts so the
    number can't silently drift.
    """

    def _low_rebound(self, day, h, m, nadir=48.0, rebound=189.0):
        """A low bottoming at ``nadir`` then rebounding to ``rebound`` within ~40 min.

        Falls 100 -> nadir, climbs nadir -> rebound, then settles back toward range —
        the classic over-treated-low CGM shape (ADR 0005), no carb data needed. Built
        off a base datetime with timedeltas so minute fields never overflow.
        """
        t0 = datetime(2026, 6, day, h, m, 0)

        def seg(offset_min, start_bg, slope_per_min, minutes, step=5):
            base = t0 + timedelta(minutes=offset_min)
            return [
                CgmReading(t=base + timedelta(minutes=step * k),
                           bg=start_bg + slope_per_min * step * k, type="EGV")
                for k in range(minutes // step + 1)
            ]

        pre = seg(0, 100, 0.0, 20)
        fall = seg(20, 100, -(100 - nadir) / 20.0, 20)          # -> nadir over 20 min
        rise = seg(40, nadir, (rebound - nadir) / 40.0, 40)     # -> rebound over 40 min
        settle = seg(80, rebound, -1.5, 60)                     # back toward range
        return pre + fall + rise + settle

    def test_standalone_over_treated_low_is_attributed(self):
        cgm = self._low_rebound(17, 11, 30, nadir=48.0, rebound=189.0)  # ADR 48->188
        anchors = collect_anchors([], cgm, [])
        eps = segment(anchors)
        low_eps = [e for e in eps if any(a.kind is AnchorKind.LOW for a in e.anchors)]
        self.assertTrue(low_eps)
        attr = attribute(low_eps[0], cgm, [], [], isf=ISF)
        self.assertEqual(attr.lever, Lever.OVER_TREATED_LOW)
        self.assertEqual(attr.steps[0].evidence_tier, EvidenceTier.INFERRED)

    def test_rebound_threshold_is_160(self):
        # A low rebounding into the 160-179 band (dropped by the old 180 cutoff) counts;
        # a low that only recovers to a benign 150 does not.
        counts = self._low_rebound(18, 13, 0, nadir=55.0, rebound=165.0)
        a_counts = collect_anchors([], counts, [])
        e_counts = [e for e in segment(a_counts) if any(a.kind is AnchorKind.LOW for a in e.anchors)][0]
        self.assertEqual(
            attribute(e_counts, counts, [], [], isf=ISF).lever,
            Lever.OVER_TREATED_LOW,
        )
        benign = self._low_rebound(18, 16, 0, nadir=55.0, rebound=150.0)
        a_benign = collect_anchors([], benign, [])
        e_benign = [e for e in segment(a_benign) if any(a.kind is AnchorKind.LOW for a in e.anchors)][0]
        self.assertIsNone(
            attribute(e_benign, benign, [], [], isf=ISF).lever
        )

    def test_negative_low_recovers_to_range_without_rebound(self):
        # A low that recovers to a flat 120 and stays there — never a rebound high, so
        # it must NOT be an over-treated low.
        pre = cgm_flat(19, 2, 0, 100, 15)
        fall = cgm_ramp(19, 2, 15, 100, -2.2, 20)       # 100 -> ~56
        recover = cgm_ramp(19, 2, 35, 56, 2.0, 32)      # 56 -> ~120 and holds
        hold = cgm_flat(19, 3, 10, 120, 60)
        cgm = pre + fall + recover + hold
        eps = [e for e in segment(collect_anchors([], cgm, []))
               if any(a.kind is AnchorKind.LOW for a in e.anchors)]
        self.assertTrue(eps)
        self.assertIsNone(attribute(eps[0], cgm, [], [], isf=ISF).lever)

    def test_over_treated_low_splits_off_an_upstream_meal(self):
        # Cause 1, the ADR 48->189 shape: a carb-undercount dinner runs BG away high,
        # then it falls straight THROUGH range into a low the user over-treats into a
        # rebound. No settled in-range trough (double-hump can't cut it), so today the
        # low is absorbed and only carb_undercount surfaces. The low-rebound split must
        # give the low its OWN episode so BOTH levers surface.
        meal_up = cgm_ramp(21, 18, 0, 150, 2.5, 60)     # meal 18:00: 150 -> ~300
        fall = cgm_ramp(21, 19, 0, 300, -3.4, 75)       # 300 -> ~45 straight through range
        rebound = cgm_ramp(21, 20, 15, 45, 3.6, 40)     # 45 -> ~189 (over-treated)
        settle = cgm_ramp(21, 20, 55, 189, -1.5, 60)
        cgm = meal_up + fall + rebound + settle
        m = meal(21, 18, 0, carbs=30.0, dose=7.0)
        report = assemble([m], cgm, [], isf=ISF)
        levers = {ep.lever for ep in report.episodes.values()}
        self.assertIn(Lever.CARB_UNDERCOUNT, levers)     # the meal keeps its lever
        self.assertIn(Lever.OVER_TREATED_LOW, levers)    # the low is no longer absorbed

    def test_single_over_treated_low_surfaces_as_a_pattern(self):
        # Cause 3: with the per-day investigate tool, a single over-treated low must
        # surface (not be gated out by _MIN_OCCURRENCES like the other levers). It may
        # ride the low-confidence expander, but it must appear somewhere.
        cgm = self._low_rebound(22, 14, 0, nadir=48.0, rebound=200.0)
        report = assemble([], cgm, [], isf=ISF)
        surfaced = {p.lever for p in report.patterns} | {p.lever for p in report.low_confidence}
        self.assertIn(Lever.OVER_TREATED_LOW, surfaced)

    def test_deeper_nadir_ranks_above_shallower_at_equal_rebound(self):
        # #151: two over-treated lows the same day that rebound identically (165) but
        # bottom out at 46 vs 68. Both fire (rebound clears the sub-70 160 bar), so the
        # firing bar is untouched — but the 46 is the far more dangerous event and must
        # rank strictly above the 68: higher severity, and the pattern's hero.
        deep = self._low_rebound(25, 8, 0, nadir=46.0, rebound=165.0)
        shallow = self._low_rebound(25, 14, 0, nadir=68.0, rebound=165.0)
        report = assemble([], deep + shallow, [], isf=ISF)
        by_nadir = {round(e.worst_bg): e for e in report.episodes.values()}
        self.assertIn(46, by_nadir)
        self.assertIn(68, by_nadir)
        self.assertEqual(by_nadir[46].lever, Lever.OVER_TREATED_LOW)
        self.assertEqual(by_nadir[68].lever, Lever.OVER_TREATED_LOW)
        self.assertGreater(by_nadir[46].severity, by_nadir[68].severity)
        # The deeper low is the hero the over-treated-low pattern shows first.
        otl = next(
            p for p in (report.patterns + report.low_confidence)
            if p.lever is Lever.OVER_TREATED_LOW
        )
        self.assertEqual(otl.hero_episode, by_nadir[46].id)
        self.assertEqual(otl.occurrences[0], by_nadir[46].id)

    def test_split_over_treated_low_does_not_overlap_the_meal_episode(self):
        # The non-overlap invariant (#80) must hold across the low-rebound split too:
        # the meal episode's forward reach can't straddle into the low's episode.
        meal_up = cgm_ramp(23, 18, 0, 150, 2.5, 60)
        fall = cgm_ramp(23, 19, 0, 300, -3.4, 75)
        rebound = cgm_ramp(23, 20, 15, 45, 3.6, 40)
        settle = cgm_ramp(23, 20, 55, 189, -1.5, 60)
        cgm = meal_up + fall + rebound + settle
        m = meal(23, 18, 0, carbs=30.0, dose=7.0)
        report = assemble([m], cgm, [], isf=ISF)
        eps = sorted(report.episodes.values(), key=lambda e: e.start)
        for earlier, later in zip(eps, eps[1:]):
            self.assertLessEqual(earlier.end, later.start)


class CorrectionOnIobLeverTest(unittest.TestCase):
    """#150: the lone-correction-on-IOB crash lever, wired into ``_low_lever``.

    A single user correction dropped onto insulin still working that drove a low —
    the ``n=1`` sibling of ``correction_stacking``, which needs a pair. It is
    LOW-anchored and NET-NEW: it fires **last** in ``_low_lever`` (after
    over-treated-low), so it owns a low driven by a user correction, and a meal/high
    lever always wins by earliest-actionable-by-time.
    """

    def test_lone_correction_on_meal_iob_crash_is_attributed(self):
        # A benign 6 U dinner at 19:00 (peaks 190 < 200, dosed at a flat baseline — no
        # meal lever fires). The user drops a lone 4 U correction at 20:00 onto falling
        # BG; the stack crashes to a sub-70 low at 22:00 with no rebound. Net-new #150.
        pre = cgm_flat(17, 18, 40, 120, 20)              # flat baseline -> not late_bolus
        rise = cgm_ramp(17, 19, 0, 120, 1.75, 40)        # 120 -> 190 (< 200, not undercount)
        fall = cgm_ramp(17, 19, 40, 190, -1.0, 140)      # 190 -> 50 by 22:00
        cgm = pre + rise + fall
        m = meal(17, 19, 0, carbs=40.0, dose=6.0)
        c = corr(17, 20, 0, units=4.0)
        eps = [e for e in segment(collect_anchors([m, c], cgm, []))
               if any(a.kind is AnchorKind.LOW for a in e.anchors)]
        self.assertTrue(eps)
        attr = attribute(eps[0], cgm, [m, c], [], isf=ISF)
        self.assertEqual(attr.lever, Lever.CORRECTION_ON_IOB)
        self.assertEqual(attr.trigger, "low")
        self.assertEqual(attr.steps[0].evidence_tier, EvidenceTier.INFERRED)
        self.assertIn("still on board", attr.steps[0].text)

    def test_correction_on_iob_over_treatment_splits_into_two_moments(self):
        # #155 (supersedes the old "over-treated-low owns it, #150 suppressed" rule):
        # a correction-on-IOB crash is a qualifying *own cause*, so when it is ALSO
        # over-treated into a rebound the episode splits — the crash keeps its #150
        # lever (low-moment) and the over-correction takes over_treated_low
        # (high-moment). Both lessons surface; nothing goes silent.
        pre = cgm_flat(19, 18, 40, 120, 20)
        rise = cgm_ramp(19, 19, 0, 120, 1.75, 40)        # 120 -> 190
        fall = cgm_ramp(19, 19, 40, 190, -1.4, 100)      # 190 -> 50 by 21:20
        rebound = cgm_ramp(19, 21, 20, 50, 4.0, 40)      # 50 -> 210 (over-treated)
        settle = cgm_ramp(19, 22, 0, 210, -1.2, 80)
        cgm = pre + rise + fall + rebound + settle
        m = meal(19, 19, 0, carbs=40.0, dose=6.0)
        c = corr(19, 20, 0, units=4.0)
        cand = classify_correction_on_iob(
            datetime(2026, 6, 19, 21, 20, 0), 50.0, cgm, [m, c]
        )
        self.assertTrue(cand.matched)
        report = assemble([m, c], cgm, [], isf=ISF)
        levers = {ep.lever for ep in report.episodes.values()}
        self.assertIn(Lever.OVER_TREATED_LOW, levers)      # the over-correction moment
        self.assertIn(Lever.CORRECTION_ON_IOB, levers)     # the crash keeps its cause
        # Disjoint spans (AC4): the two moments never overlap in time.
        eps = sorted(report.episodes.values(), key=lambda e: e.start)
        for earlier, later in zip(eps, eps[1:]):
            self.assertLessEqual(earlier.end, later.start)

    def test_owns_an_overnight_low_when_a_correction_is_actionable(self):
        # An 8 U dinner at 21:30 plus a lone 4 U correction at 22:30 still acting when
        # BG bottoms at 60 overnight (~01:10). The time of day does not hide the
        # actionable correction-on-IOB behavior (#327).
        dinner = meal(15, 21, 30, carbs=50.0, dose=8.0)
        evening_corr = corr(15, 22, 30, units=4.0)
        fall = cgm_ramp(16, 0, 0, 110, -0.7, 70)         # 110 -> ~61 by ~01:10
        low = cgm_flat(16, 1, 10, 60, 30)
        cgm = fall + low
        boluses = [dinner, evening_corr]
        cand = classify_correction_on_iob(
            datetime(2026, 6, 16, 1, 10, 0), 60.0, cgm, boluses
        )
        self.assertTrue(cand.matched)
        report = assemble(boluses, cgm, [], isf=ISF)
        self.assertIn(
            Lever.CORRECTION_ON_IOB,
            {episode.lever for episode in report.episodes.values()},
        )

    def test_correction_stacking_still_surfaces_overnight(self):
        # Two corrections stack before midnight while BG is falling, then carry it
        # below 70 after midnight. Reporting the low in Verify does not suppress the
        # actionable correction behavior in Diagnose (#327).
        fall = cgm_ramp(15, 23, 0, 160, -0.8, 60)        # 160 -> 112 at midnight
        crash = cgm_ramp(16, 0, 5, 108, -1.2, 60)       # 108 -> 36 after midnight
        cgm = fall + crash
        corrections = [corr(15, 23, 10, 3.0), corr(15, 23, 40, 3.0)]

        report = assemble(corrections, cgm, [], isf=ISF)

        self.assertIn(
            Lever.CORRECTION_STACKING,
            {episode.lever for episode in report.episodes.values()},
        )

    def test_does_not_preempt_carb_undercount_meal(self):
        # A dinner runs away high (carb undercount, the earliest actionable driver),
        # then falls; a lone correction onto the residual IOB drives a sub-70 low with
        # no rebound. carb_undercount owns the episode; #150 rides as a consequence.
        pre = cgm_flat(15, 18, 40, 150, 20)
        up = cgm_ramp(15, 19, 0, 150, 3.0, 60)           # 150 -> ~330 (runaway)
        down = cgm_ramp(15, 20, 0, 330, -3.0, 60)        # ~330 -> 150 by 21:00
        crash = cgm_ramp(15, 21, 0, 150, -1.2, 100)      # 150 -> ~30 (lone-correction low)
        cgm = pre + up + down + crash
        m = meal(15, 19, 0, carbs=30.0, dose=7.0)
        c = corr(15, 20, 40, units=4.0)                  # one correction onto residual IOB
        eps = segment(collect_anchors([m, c], cgm, []))
        self.assertEqual(len(eps), 1)                    # meal + correction + low, one episode
        attr = attribute(eps[0], cgm, [m, c], [], isf=ISF)
        self.assertEqual(attr.lever, Lever.CARB_UNDERCOUNT)
        # #150 narrates as a hedged consequence, not a second lever.
        self.assertTrue(any("still on board" in s.text for s in attr.steps[1:]))


class PriorCarbBolusWiringTest(unittest.TestCase):
    """#167 wired through ``_meal_lever`` / ``attribute``: the day's bolus list now
    reaches the late-bolus classifier, so a meal dosed into a rise owned by a recent
    completed carb bolus draws no late-bolus lever."""

    def _late_bolus_day(self):
        # A from-flat rise fully spanning the 12:40 meal's 20-min pre-bolus window
        # (would be flagged late), no low/suspend. Rise starts at 12:10 so 12:20-12:40
        # is all climbing.
        pre = cgm_flat(15, 11, 40, 120, 30)              # flat baseline 11:40-12:10
        rise = cgm_ramp(15, 12, 10, 120, 2.0, 60)        # 120 -> 360 by 13:10
        settle = cgm_ramp(15, 13, 10, 360, -2.0, 120)    # back down, no low
        return pre + rise + settle

    def test_late_bolus_fires_without_prior_carb_bolus(self):
        cgm = self._late_bolus_day()
        m = meal(15, 12, 40, carbs=45.0, dose=10.0)
        eps = segment(collect_anchors([m], cgm, []))
        self.assertTrue(eps)
        # Missing ISF means carb-undercount can't attribute, so late-bolus owns it.
        attr = attribute(eps[0], cgm, [m], [], isf=None)
        self.assertEqual(attr.lever, Lever.LATE_BOLUS)

    def test_prior_carb_bolus_suppresses_late_bolus_lever(self):
        cgm = self._late_bolus_day()
        m = meal(15, 12, 40, carbs=45.0, dose=10.0)
        beer = BolusEvent(t=datetime(2026, 6, 15, 12, 0, 0), insulin=2.0,
                          carbs=20.0, completion="Completed")   # dosed at flat BG, not late
        bolus = [beer, m]
        eps = segment(collect_anchors(bolus, cgm, []))
        self.assertTrue(eps)
        attr = attribute(eps[0], cgm, bolus, [], isf=None)
        self.assertNotEqual(attr.lever, Lever.LATE_BOLUS)


class OverTreatedLowShapeOnlyTest(unittest.TestCase):
    """#400 / ADR 400: over-treated-low classification is by low→rebound shape alone.

    The removed #130 guard raised the rebound bar by an ``IOB × (ISF/I:C)`` "credit"
    that was labelled mg/dL but was dimensionally neither mg/dL nor grams, so residual
    bolus insulin could suppress an otherwise-qualifying over-treated low. That credit
    is gone: a rebound that clears the tiered bar fires regardless of how much bolus
    IOB was on board, and regardless of whether ISF/I:C are known.
    """

    def _low_rebound(self, day, h, m, nadir, rebound):
        # Reuse OverTreatedLowTest's fixture: bottoms out 40 min after the base time,
        # rebounds over the next 40, then settles. The nadir anchor sits at t0 + 40 min.
        return OverTreatedLowTest._low_rebound(self, day, h, m, nadir=nadir, rebound=rebound)

    def _nadir_time(self, day, h, m):
        return datetime(2026, 6, day, h, m, 0) + timedelta(minutes=40)

    def _low_episode(self, cgm):
        eps = [e for e in segment(collect_anchors([], cgm, []))
               if any(a.kind is AnchorKind.LOW for a in e.anchors)]
        self.assertTrue(eps)
        return eps[0]

    def test_shallow_rebound_on_live_iob_now_fires(self):
        # The #400 regression (fails on the old IOB-adjusted behavior): a 55 -> 178
        # rebound sitting on ~6 U of live bolus. The old guard netted a ~24 mg/dL
        # "credit" and pushed the effective bar to ~184 > 178, suppressing it; now the
        # bar is the plain sub-70 160, so the rebound fires.
        cgm = self._low_rebound(24, 15, 0, nadir=55.0, rebound=178.0)
        bolus = [BolusEvent(t=self._nadir_time(24, 15, 0) - timedelta(minutes=10),
                            insulin=6.0, carbs=None)]
        attr = attribute(self._low_episode(cgm), cgm, bolus, [], isf=ISF)
        self.assertEqual(attr.lever, Lever.OVER_TREATED_LOW)

    def test_classification_independent_of_iob_and_settings(self):
        # AC1: the same 55 -> 178 low classifies identically with 0 U and ~6 U residual
        # bolus IOB, and with or without ISF — all four combinations are
        # OVER_TREATED_LOW. No active-insulin value moves the threshold.
        bolus = [BolusEvent(t=self._nadir_time(24, 12, 0) - timedelta(minutes=10),
                            insulin=6.0, carbs=None)]
        for label, b in (("0U", []), ("6U", bolus)):
            for isf in (ISF, None):
                cgm = self._low_rebound(24, 12, 0, nadir=55.0, rebound=178.0)
                attr = attribute(self._low_episode(cgm), cgm, b, [], isf=isf)
                self.assertEqual(attr.lever, Lever.OVER_TREATED_LOW,
                                 msg=f"{label} isf={isf}")

    def test_big_rebound_anchor_still_fires(self):
        # AC2: the 52 -> 224 anchor on ~8 U of live bolus stays an over-treated low.
        cgm = self._low_rebound(24, 21, 0, nadir=52.0, rebound=224.0)
        bolus = [BolusEvent(t=self._nadir_time(24, 21, 0) - timedelta(minutes=15),
                            insulin=8.0, carbs=None)]
        attr = attribute(self._low_episode(cgm), cgm, bolus, [], isf=ISF)
        self.assertEqual(attr.lever, Lever.OVER_TREATED_LOW)

    def test_benign_recovery_still_does_not_fire(self):
        # The tiered bar itself is unchanged: a sub-70 low that only recovers to 150
        # (below the 160 bar) is not an over-treatment, live IOB or not.
        cgm = self._low_rebound(24, 18, 0, nadir=48.0, rebound=150.0)
        bolus = [BolusEvent(t=self._nadir_time(24, 18, 0) - timedelta(minutes=10),
                            insulin=6.0, carbs=None)]
        attr = attribute(self._low_episode(cgm), cgm, bolus, [], isf=ISF)
        self.assertIsNone(attr.lever)


class OverTreatedLowPromptAnswerTest(unittest.TestCase):
    """#129 / ADR 0008: feed low-prompt answers into over-treated-low attribution.

    The over-treated-low label was a pure CGM-shape inference (ADR 0005) — it never
    saw the user's answer to "did you treat this low?". This wires the answer in: a
    ``carbs`` answer upgrades the step Inferred → Observed, cites the logged entry, and
    reports the logged grams + a follow-your-plan line (no computed gram target — #400
    / ADR 400 removed the unsupported rescue-carb estimates); a ``no`` answer rejects
    the finding outright (the step is not minted, so the low can't inflate the
    recurrence stat); a ``not-sure`` / unmatched answer leaves the shape-only Inferred
    beat untouched.
    """

    def _low_rebound(self, day, h, m, nadir, rebound):
        return OverTreatedLowTest._low_rebound(self, day, h, m, nadir=nadir, rebound=rebound)

    def _nadir_time(self, day, h, m):
        return datetime(2026, 6, day, h, m, 0) + timedelta(minutes=40)

    def _low_episode(self, cgm):
        eps = [e for e in segment(collect_anchors([], cgm, []))
               if any(a.kind is AnchorKind.LOW for a in e.anchors)]
        self.assertTrue(eps)
        return eps[0]

    def _answer(self, day, h, m, answer, *, grams=None, carb_t=None):
        nadir_t = self._nadir_time(day, h, m)
        return LowPromptAnswer(
            anchor_t=nadir_t, answer=answer,
            carb_t=(carb_t if carb_t is not None else (nadir_t if answer == "carbs" else None)),
            carb_grams=grams,
        )

    # --- match tolerance ---------------------------------------------------

    def test_tolerance_matches_the_queue_anchor_tolerance(self):
        # The 10-min match must stay equal to the queue's ANCHOR_TOLERANCE (the
        # established (detector, anchor_t) tolerance) — pinned so the two can't drift.
        from ciq_autotune.analyzers.scenario.attribute import _LOW_ANSWER_TOLERANCE
        from ciq_autotune.pending_prompts import ANCHOR_TOLERANCE
        self.assertEqual(_LOW_ANSWER_TOLERANCE, ANCHOR_TOLERANCE)

    def test_match_within_tolerance_and_nearest_wins(self):
        nadir = datetime(2026, 6, 24, 12, 40, 0)
        near = LowPromptAnswer(anchor_t=nadir + timedelta(minutes=9), answer="no")
        far = LowPromptAnswer(anchor_t=nadir + timedelta(minutes=11), answer="carbs")
        self.assertIs(match_low_answer([near, far], nadir), near)     # 11 min is outside
        closer = LowPromptAnswer(anchor_t=nadir + timedelta(minutes=2), answer="carbs")
        self.assertIs(match_low_answer([near, closer], nadir), closer)  # nearest wins
        self.assertIsNone(match_low_answer([far], nadir))

    # --- confirmed (carbs) → Observed + citation + logged grams + plan (#400) ------

    def _assert_no_gram_target(self, text):
        # AC5: confirmed coaching carries no fixed gram step, personalized "needed"
        # grams, IOB-derived grams, or "would've fixed" claim.
        for banned in ("would've fixed", "treat in steps", "g would", "g more",
                       "~15 g", "needed"):
            self.assertNotIn(banned, text, msg=f"unexpected {banned!r} in {text!r}")
        # And the coaching points back to the person's own plan + a 15-min recheck.
        self.assertIn("follow your usual low-treatment plan", text)
        self.assertIn("15 min", text)

    def test_confirmed_carbs_upgrades_to_observed_and_cites(self):
        # AC4: a confirmed carb answer is OBSERVED, cites the logged entry, and reports
        # the logged grams + the observed nadir and rebound — with no computed gram
        # target of any kind (AC5).
        cgm = self._low_rebound(24, 12, 0, nadir=48.0, rebound=200.0)
        ans = self._answer(24, 12, 0, "carbs", grams=30.0)
        attr = attribute(self._low_episode(cgm), cgm, [], [], isf=ISF,
                         low_answers=[ans])
        self.assertEqual(attr.lever, Lever.OVER_TREATED_LOW)
        step = attr.steps[0]
        self.assertEqual(step.evidence_tier, EvidenceTier.OBSERVED)
        self.assertEqual(step.cited_event_refs, [event_ref(ans.carb_t)])
        self.assertFalse(hasattr(step, "over_treated_breakdown"))
        self.assertIn("logged 30 g", step.text)          # logged grams reported
        self.assertIn("48 mg/dL", step.text)             # observed nadir
        self.assertIn("200 mg/dL", step.text)            # observed rebound
        self._assert_no_gram_target(step.text)

    def test_confirmed_under_high_iob_still_gives_no_gram_target(self):
        # AC1/AC5/AC6: 52 -> 224 on ~8 U delivered 15 min before the nadir stays an
        # over-treated low, and the confirmed message is the SAME plan-based coaching —
        # residual IOB is neither converted to grams nor allowed to stage a gram step.
        cgm = self._low_rebound(24, 21, 0, nadir=52.0, rebound=224.0)
        bolus = [BolusEvent(t=self._nadir_time(24, 21, 0) - timedelta(minutes=15),
                            insulin=8.0, carbs=None)]
        ans = self._answer(24, 21, 0, "carbs", grams=20.0)
        attr = attribute(self._low_episode(cgm), cgm, bolus, [], isf=ISF,
                         low_answers=[ans])
        self.assertEqual(attr.lever, Lever.OVER_TREATED_LOW)
        step = attr.steps[0]
        self.assertEqual(step.evidence_tier, EvidenceTier.OBSERVED)
        self.assertIn("logged 20 g", step.text)
        self._assert_no_gram_target(step.text)

    def test_confirmed_without_settings_upgrades_and_cites(self):
        # ISF / I:C now play no role in classification or coaching: the confirmed step
        # still upgrades to Observed, cites the entry, and gives the same plan-based
        # coaching whether or not settings are known.
        cgm = self._low_rebound(24, 6, 0, nadir=48.0, rebound=200.0)
        ans = self._answer(24, 6, 0, "carbs", grams=30.0)
        attr = attribute(self._low_episode(cgm), cgm, [], [], isf=None,
                         low_answers=[ans])
        self.assertEqual(attr.lever, Lever.OVER_TREATED_LOW)
        step = attr.steps[0]
        self.assertEqual(step.evidence_tier, EvidenceTier.OBSERVED)
        self.assertEqual(step.cited_event_refs, [event_ref(ans.carb_t)])
        self.assertIn("logged 30 g", step.text)
        self._assert_no_gram_target(step.text)

    # --- refuted (no) → the step is not minted -----------------------------

    def test_refuted_no_suppresses_the_over_treated_step(self):
        cgm = self._low_rebound(24, 15, 0, nadir=48.0, rebound=200.0)
        ans = self._answer(24, 15, 0, "no")
        attr = attribute(self._low_episode(cgm), cgm, [], [], isf=ISF,
                         low_answers=[ans])
        self.assertIsNone(attr.lever)   # no other cause — the low goes silent

    def test_refuted_low_still_counts_in_lows_denominator(self):
        # The refuted low is still a real sub-70 low: it drops from the OVER_TREATED_LOW
        # numerator but stays in the LOWS exposure denominator (a real low, just not an
        # over-treatment).
        cgm = self._low_rebound(24, 18, 0, nadir=48.0, rebound=200.0)
        ans = self._answer(24, 18, 0, "no")
        exposure, attributed = tally_attributions(
            [], cgm, [], isf=ISF, low_answers=[ans])
        self.assertGreaterEqual(exposure[Exposure.LOWS], 1)
        self.assertNotIn(Lever.OVER_TREATED_LOW, attributed)
        # Without the refutation the same low DOES attribute an over-treated low.
        _e, attributed_open = tally_attributions([], cgm, [], isf=ISF)
        self.assertEqual(attributed_open.get(Lever.OVER_TREATED_LOW), 1)

    def test_refuted_low_does_not_surface_as_a_pattern(self):
        cgm = self._low_rebound(24, 9, 0, nadir=48.0, rebound=200.0)
        ans = self._answer(24, 9, 0, "no")
        report = assemble([], cgm, [], isf=ISF, low_answers=[ans])
        surfaced = {p.lever for p in report.patterns} | {p.lever for p in report.low_confidence}
        self.assertNotIn(Lever.OVER_TREATED_LOW, surfaced)

    # --- abstain / unmatched → unchanged Inferred --------------------------

    def test_not_sure_stays_inferred(self):
        cgm = self._low_rebound(24, 3, 0, nadir=48.0, rebound=200.0)
        ans = self._answer(24, 3, 0, "not-sure")
        attr = attribute(self._low_episode(cgm), cgm, [], [], isf=ISF,
                         low_answers=[ans])
        self.assertEqual(attr.lever, Lever.OVER_TREATED_LOW)
        self.assertEqual(attr.steps[0].evidence_tier, EvidenceTier.INFERRED)
        # Shape-only inferred beat: the hedged "likely over-treated" text, no logged fact.
        self.assertIn("likely over-treated", attr.steps[0].text)

    def test_unmatched_answer_leaves_shape_only_inferred(self):
        cgm = self._low_rebound(24, 1, 0, nadir=48.0, rebound=200.0)
        # An answer for a nadir 30 min away must not match this one.
        far = LowPromptAnswer(
            anchor_t=self._nadir_time(24, 1, 0) + timedelta(minutes=30), answer="carbs")
        attr = attribute(self._low_episode(cgm), cgm, [], [], isf=ISF,
                         low_answers=[far])
        self.assertEqual(attr.lever, Lever.OVER_TREATED_LOW)
        self.assertEqual(attr.steps[0].evidence_tier, EvidenceTier.INFERRED)

    def test_no_answers_is_todays_behavior(self):
        cgm = self._low_rebound(24, 22, 0, nadir=48.0, rebound=200.0)
        attr = attribute(self._low_episode(cgm), cgm, [], [], isf=ISF)
        self.assertEqual(attr.lever, Lever.OVER_TREATED_LOW)
        self.assertEqual(attr.steps[0].evidence_tier, EvidenceTier.INFERRED)

    # --- payload contract --------------------------------------------------

    def test_schema_version_remains_6_until_the_projection_fixture_chunk(self):
        cgm = self._low_rebound(24, 14, 0, nadir=48.0, rebound=200.0)
        report = assemble([], cgm, [], isf=ISF)
        self.assertEqual(report.schema_version, 6)

    def test_pattern_carries_unified_priority(self):
        # Every surfaced pattern exposes the ADR 0032 priority + its two factor inputs,
        # and priority = round(100·√(effect·lo)). Because that is monotonic in the
        # existing confidence.score, adding it never reorders patterns[] — it only puts
        # behavioral Levers on the shared axis (rank-preservation, verified in
        # test_priority.PriorityScoreTest / BehavioralPriorityTest).
        from math import sqrt

        cgm = self._low_rebound(24, 14, 0, nadir=48.0, rebound=200.0)
        report = assemble([], cgm, [], isf=ISF)
        d = report.to_dict()
        self.assertEqual(d["priority_active_threshold"], 30)
        pats = d["patterns"] + d["low_confidence"]
        self.assertTrue(pats)
        for pat in pats:
            c = pat["confidence"]
            self.assertEqual(pat["impact"], round(c["effect"], 4))
            self.assertEqual(pat["recurrence"], round(c["lo"], 4))
            self.assertEqual(pat["priority"], round(100 * sqrt(c["effect"] * c["lo"])))

    def test_confirmed_step_serializes_without_breakdown(self):
        # AC7: the serialized step no longer advertises the removed breakdown contract;
        # the confirmed fact rides in ``text`` and the citation in ``cited_event_refs``.
        cgm = self._low_rebound(24, 13, 0, nadir=48.0, rebound=200.0)
        ans = self._answer(24, 13, 0, "carbs", grams=30.0)
        attr = attribute(self._low_episode(cgm), cgm, [], [], isf=ISF,
                         low_answers=[ans])
        d = attr.steps[0].to_dict()
        self.assertEqual(d["evidence_tier"], "observed")
        self.assertNotIn("over_treated_breakdown", d)
        self.assertIn("logged 30 g", d["text"])
        self.assertEqual(d["cited_event_refs"], [event_ref(ans.carb_t)])


class _FakeLowPromptStore:
    """Minimal store double for :func:`low_prompt_answers` (#129)."""

    def __init__(self, responses, entries):
        self._responses = responses
        self._entries = entries

    def prompt_responses(self):
        return self._responses

    def get_carb_entry(self, id):
        return self._entries.get(id)


class LowPromptAnswersBuilderTest(unittest.TestCase):
    """#129: the store-facing seam that shapes prompt_responses into LowPromptAnswer."""

    def test_builds_carbs_no_and_notsure_and_filters(self):
        nadir = datetime(2026, 6, 24, 12, 40, 0)
        responses = [
            {"detector": "low", "anchor_t": nadir, "answer": "carbs", "carb_entry_id": 7},
            {"detector": "low", "anchor_t": nadir + timedelta(hours=1),
             "answer": "no", "carb_entry_id": None},
            {"detector": "low", "anchor_t": nadir + timedelta(hours=2),
             "answer": "not-sure", "carb_entry_id": None},
            # ignored: wrong detector, and out-of-window
            {"detector": "missed-meal", "anchor_t": nadir, "answer": "carbs",
             "carb_entry_id": 9},
            {"detector": "low", "anchor_t": nadir - timedelta(days=99),
             "answer": "no", "carb_entry_id": None},
        ]
        entries = {7: {"t": nadir, "grams": 30.0}}
        store = _FakeLowPromptStore(responses, entries)
        out = low_prompt_answers(store, nadir - timedelta(days=1), nadir + timedelta(days=1))
        self.assertEqual([a.answer for a in out], ["carbs", "no", "not-sure"])
        carbs = out[0]
        self.assertEqual(carbs.carb_grams, 30.0)
        self.assertEqual(carbs.carb_t, nadir)
        self.assertIsNone(out[1].carb_grams)

    def test_a_future_rescue_answer_is_excluded_but_a_late_false_low_is_kept(self):
        # #467: the shared helper enforces the current endpoint, so every consumer of it
        # (Patterns, exposures, model view, outcome summary) is safe by construction. A
        # rescue answer whose anchor is in-window but which was *recorded* after `now`
        # did not exist when this read closed and is dropped; a `false-low` reading
        # invalidation is exempt (its own settled rule) and kept however late it arrives.
        anchor = datetime(2026, 6, 24, 12, 40, 0)
        now = datetime(2026, 6, 25, 0, 0, 0)
        responses = [
            {"detector": "low", "anchor_t": anchor, "answer": "no",
             "carb_entry_id": None, "answered_at": now + timedelta(hours=6)},
            {"detector": "low", "anchor_t": anchor + timedelta(minutes=1),
             "answer": "carbs", "carb_entry_id": None,
             "answered_at": now + timedelta(days=2)},
            {"detector": "low", "anchor_t": anchor + timedelta(minutes=2),
             "answer": "false-low", "carb_entry_id": None,
             "answered_at": now + timedelta(days=3)},
            {"detector": "low", "anchor_t": anchor + timedelta(minutes=3),
             "answer": "no", "carb_entry_id": None,
             "answered_at": now - timedelta(hours=1)},   # live control
        ]
        store = _FakeLowPromptStore(responses, {})
        out = low_prompt_answers(store, anchor - timedelta(days=1), now)
        # Both future rescue answers gone; the late false-low and the live `no` remain.
        self.assertEqual([a.answer for a in out], ["false-low", "no"])
        self.assertEqual(out[1].answered_at, now - timedelta(hours=1))


# Every arc below is invented. The year is fixed and arbitrary so no arc can be read
# as a capture date; only the *shape* each string carries is load-bearing.
_ARC_YEAR = 2024


def _arc_cgm(mo, day, spec):
    """CGM readings from a hardcoded ``"HH:MM:bg,..."`` string of invented values."""
    out = []
    for tok in spec.split(","):
        h, m, bg = tok.split(":")
        out.append(CgmReading(
            t=datetime(_ARC_YEAR, mo, day, int(h), int(m), 0), bg=float(bg), type="EGV"))
    return out


def _arc_bolus(mo, day, h, m, insulin, carbs):
    return BolusEvent(
        t=datetime(_ARC_YEAR, mo, day, h, m, 0), insulin=insulin, carbs=carbs)


# Invented evening arcs on the CGM + bolus schema the scenario engine reads. The
# nadir/rebound pair of each is the #112 acceptance signal, and is the only property
# the assertions below depend on — the individual readings are filler that carries it.
#
# A near-low that dips to 73, is treated with unbolused rescue carbs after a dinner
# bolus, and rockets to 238: a textbook over-treated low the old sub-70 anchor line
# would have missed by 3 mg/dL.
# SYNTHETIC-FIXTURE: invented CGM arc; preserves a near-low nadir just above the old sub-70 line that rebounds hard — the #112 acceptance shape.
_DEEP_REBOUND_CGM = (
    "17:00:121,17:05:124,17:10:127,17:15:129,17:20:130,17:25:133,17:30:132,17:35:121,"
    "17:40:114,17:45:106,17:50:99,17:55:93,18:00:89,18:05:86,18:10:87,18:15:96,"
    "18:20:105,18:25:104,18:30:101,18:35:103,18:40:107,18:45:104,18:50:96,18:55:91,"
    "19:00:88,19:05:90,19:10:85,19:15:78,19:20:75,19:25:74,19:30:73,19:35:74,19:40:77,"
    "19:45:83,19:50:82,19:55:89,20:00:96,20:05:118,20:10:148,20:15:157,20:20:186,"
    "20:25:209,20:30:214,20:35:221,20:40:230,20:45:236,20:50:238,20:55:233,21:00:231,"
    "21:05:236,21:10:220,21:15:216,21:20:218,21:25:214"
)
# A second, independent near-low: dips to 74 and rebounds to 204 within the hour.
# SYNTHETIC-FIXTURE: invented CGM arc; preserves a second, independent near-low/rebound pair, proving the #112 fix isn't overfit to one arc.
_SECOND_REBOUND_CGM = (
    "14:45:119,14:50:114,14:55:108,15:00:102,15:05:95,15:10:91,15:15:87,15:20:78,"
    "15:25:76,15:30:74,15:35:84,15:40:98,15:45:109,15:50:117,15:55:128,16:00:136,"
    "16:05:137,16:10:159,16:15:172,16:20:176,16:25:183,16:30:193,16:35:196,16:40:203,"
    "16:45:201,16:50:204,16:55:192,17:00:184,17:05:173,17:10:152"
)
# The explicit negative: a near-low wobble — dips to 73 but only recovers to 174,
# short of the 180 near-low rebound bar, so it is NOT an over-treated low (a shallow
# wobble, not a rescue-carb spike).
# SYNTHETIC-FIXTURE: invented CGM arc; preserves a near-low that recovers short of the rebound bar — the negative control for #112.
_SHALLOW_WOBBLE_CGM = (
    "15:30:88,15:35:85,15:40:81,15:45:78,15:50:76,15:55:75,16:00:74,16:05:73,16:10:81,"
    "16:15:95,16:20:96,16:25:114,16:30:146,16:35:168,16:40:174,16:45:161,16:50:159,"
    "16:55:158,17:00:156,17:05:162,17:10:160"
)


class NearLowReboundTest(unittest.TestCase):
    """#112: a near-low (nadir 70–75) that rebounds hard is an over-treated low.

    The over-treated-low shape is defined by the *rebound*, not the nadir depth. A 73
    → 238 is a textbook over-treatment, but the sub-70 anchor line missed it by
    3 mg/dL (inside Dexcom noise), so the whole day produced zero episodes. The fix
    widens low anchoring to nadir ≤ 75 and gates near-lows on a tiered rebound bar
    (≥180, vs the sub-70 ≥160) so genuine over-treatments surface while shallow
    wobbles don't.

    ``isf`` is left ``None`` so carb-undercount can't attribute — the shape where the
    dinner bolus falls through to the low and the day yields exactly one episode.
    """

    def test_near_low_rebound_is_a_single_over_treated_low(self):
        # AC1 / AC6: the 73 → 238 evening → EXACTLY ONE episode, over_treated_low,
        # trigger=low (before #112: zero episodes the whole day). One episode, not two
        # — the near-low must not over-split.
        cgm = _arc_cgm(3, 4, _DEEP_REBOUND_CGM)
        bolus = [
            _arc_bolus(3, 4, 17, 50, 5.80, 32.0),    # dinner bolus
            _arc_bolus(3, 4, 20, 20, 1.50, None),    # correction into the rebound
        ]
        report = assemble(bolus, cgm, [], isf=None)
        eps = list(report.episodes.values())
        self.assertEqual(len(eps), 1)
        self.assertEqual(eps[0].lever, Lever.OVER_TREATED_LOW)
        self.assertEqual(eps[0].trigger, "low")

    def test_second_near_low_rebound_also_surfaces(self):
        # AC2: a second, independent day (74 → 204) — proves it isn't overfit to the
        # first arc.
        cgm = _arc_cgm(3, 11, _SECOND_REBOUND_CGM)
        bolus = [
            _arc_bolus(3, 11, 16, 15, 1.50, None),
            _arc_bolus(3, 11, 16, 20, 2.80, 14.0),
        ]
        report = assemble(bolus, cgm, [], isf=None)
        levers = {e.lever for e in report.episodes.values()}
        self.assertIn(Lever.OVER_TREATED_LOW, levers)

    def test_shallow_wobble_is_not_an_over_treated_low(self):
        # AC3: a 73 → 174 wobble clears the sub-70 160 bar but not the near-low 180
        # bar, so it must NOT mint an over-treated low.
        cgm = _arc_cgm(3, 18, _SHALLOW_WOBBLE_CGM)
        bolus = [_arc_bolus(3, 18, 16, 45, 2.40, None)]
        report = assemble(bolus, cgm, [], isf=None)
        levers = {e.lever for e in report.episodes.values()}
        self.assertNotIn(Lever.OVER_TREATED_LOW, levers)

    def test_near_low_rebound_bar_is_180_not_160(self):
        # The tier boundary itself: a near-low (nadir 72) rebounding to 172 does NOT
        # fire, but the same nadir rebounding to 182 does. (Sub-70's 160 bar is
        # covered by OverTreatedLowTest.test_rebound_threshold_is_160.)
        def near_low(rebound):
            # 90 -> 72 over 20 min, then 72 -> rebound over 30 min, then settle.
            fall = cgm_ramp(15, 12, 0, 90, -0.9, 20)         # -> 72
            rise = cgm_ramp(15, 12, 20, 72, (rebound - 72) / 30.0, 30)
            settle = cgm_ramp(15, 12, 50, rebound, -1.0, 40)
            c = fall + rise + settle
            ep = [e for e in segment(collect_anchors([], c, []))
                  if any(a.kind is AnchorKind.LOW for a in e.anchors)][0]
            return attribute(ep, c, [], [], isf=None).lever

        self.assertIsNone(near_low(172.0))                    # below the 180 bar
        self.assertEqual(near_low(182.0), Lever.OVER_TREATED_LOW)

    def test_sub70_exposure_denominator_ignores_near_lows(self):
        # AC4: a dip to 73 is NOT "a low you had" — it must not enter the LOWS
        # exposure count. Only the sub-70 run counts.
        from ciq_autotune.analyzers.scenario.engine import _exposure_counts
        from ciq_autotune.analyzers.scenario.levers import Exposure

        near_low_only = cgm_ramp(15, 8, 0, 90, 0.0, 15) + cgm_ramp(15, 8, 15, 90, -1.2, 15) \
            + cgm_ramp(15, 8, 30, 72, 1.2, 15)               # dips to 72, never sub-70
        real_low = cgm_ramp(15, 14, 0, 90, 0.0, 15) + cgm_ramp(15, 14, 15, 90, -1.6, 15) \
            + cgm_ramp(15, 14, 30, 66, 1.6, 15)              # dips to 66, a real low
        counts = _exposure_counts([], near_low_only + real_low, [])
        self.assertEqual(counts[Exposure.LOWS], 1)           # only the sub-70 run


# An overnight low that rebounds *slowly*: a 45 nadir at 02:30 that clears 160 only at
# ~04:10 (100 min out) and keeps climbing for hours. The 60-min horizon tops out at 127
# and drops it; the widened+guarded scan sees the rebound. The slowness is the whole
# point — the climb never levels, so the settled-recovery guard must not cap it (#149).
# SYNTHETIC-FIXTURE: invented CGM arc; preserves a slow, never-leveling overnight rebound past the old 60-min horizon — the #149 shape the widened scan needs.
_SLOW_REBOUND_CGM = (
    "02:30:45,02:35:45,02:40:51,02:45:61,02:50:70,02:55:76,03:00:81,03:05:86,03:10:93,"
    "03:15:101,03:20:110,03:25:118,03:30:127,03:35:133,03:40:138,03:45:142,03:50:147,"
    "03:55:152,04:00:156,04:05:159,04:10:163,04:15:168,04:20:173,04:25:178,04:30:183,"
    "04:35:188,04:40:192,04:45:195,04:50:199,04:55:203,05:00:206,05:05:209,05:10:211,"
    "05:15:213,05:20:214,05:25:215,05:30:216"
)

# A low that genuinely recovers, then a SEPARATE later meal (#153). Nadir 64 at 16:20,
# recovery into range, then a plateau that noodles 101-127 for ~1 h — a real settle that
# swings ~21 mg/dL of sensor noise, far past the old 8 mg/dL min–max band, so that band
# could never see it as settled. A separate 50 g meal bolused at 17:45 then runs BG up
# past 180 by 18:55. With the guard inert, the 180-min raw scan sweeps that later meal up
# as the low's "rebound" (64 → 209, a false over_treated_low). The noise-sized slope
# guard must cap the scan at the plateau so the meal is its own episode. The window
# covers the fall, the plateau, and the separate meal's climb.
# SYNTHETIC-FIXTURE: invented CGM arc; preserves a noisy real settle followed by a separate later meal's climb — the #153 shape the noise-sized slope guard needs.
_NOISY_PLATEAU_CGM = (
    "15:30:85,15:35:82,15:40:83,15:45:80,15:50:78,15:55:76,16:00:77,16:05:74,16:10:72,"
    "16:15:69,16:20:64,16:25:70,16:30:78,16:35:88,16:40:102,16:45:116,16:50:121,"
    "16:55:112,17:00:106,17:05:122,17:10:127,17:15:114,17:20:110,17:25:112,17:30:118,"
    "17:35:108,17:40:101,17:45:104,17:50:118,17:55:132,18:00:141,18:05:143,18:10:148,"
    "18:15:152,18:20:149,18:25:150,18:30:154,18:35:151,18:40:158,18:45:160,18:50:167,"
    "18:55:180,19:00:188,19:05:187,19:10:190,19:15:194,19:20:199,19:25:204,19:30:209"
)


class OverTreatedLowSpanTest(unittest.TestCase):
    """#124 / ADR 0010: an over-treated low is scored over its whole rebound excursion.

    The guarded rebound scan yields both the peak and a *terminal* (the excursion's
    resolution) from one scan; the engine extends the over-treated-low episode's span to
    that terminal, reaching *through* a dropped, lever-less anchor between the nadir and
    the rebound but clamping at a real lever-bearing neighbour. Previously the span was
    capped at the next anchor unconditionally, so a rebound separated from its nadir by
    an intervening (lever-less) anchor was truncated off and the excursion scored ~0.
    """

    # A near-low (nadir 72 > 70) that rebounds past 180 to a 210 peak, then declines
    # back to a flat in-range plateau. Near-low so worst_bg reports the peak (a sub-70
    # nadir would dominate worst_bg); mirrors the deep-rebound arc's spike shape.
    def _near_low_rebound(self, day=10, h=19, m=0):
        t0 = datetime(2026, 6, day, h, m, 0)

        def seg(off, start_bg, slope, minutes, step=5):
            base = t0 + timedelta(minutes=off)
            return [CgmReading(t=base + timedelta(minutes=step * k),
                               bg=start_bg + slope * step * k, type="EGV")
                    for k in range(minutes // step + 1)]

        cgm = (seg(0, 100, 0.0, 20)
               + seg(20, 100, -(100 - 72) / 20.0, 20)      # -> 72 near-low nadir at +40
               + seg(40, 72, (210 - 72) / 40.0, 40)         # -> 210 rebound peak at +80
               + seg(80, 210, -(210 - 120) / 60.0, 60)      # decline back toward range
               + seg(140, 120, 0.0, 40))                    # settled plateau
        ep = [e for e in segment(collect_anchors([], cgm, []))
              if any(a.kind is AnchorKind.LOW for a in e.anchors)][0]
        nadir_t = [a for a in ep.anchors if a.kind is AnchorKind.LOW][0].t
        return cgm, ep, nadir_t

    def _build(self, cgm, ep, next_start, next_lever_start):
        return _build_episode(
            0, ep, cgm, [], [], isf=ISF,
            window_builder=lambda _s, _e: {},
            next_start=next_start, next_lever_start=next_lever_start,
        )

    def test_guarded_scan_yields_peak_and_terminal_from_one_scan(self):
        # AC5: one scanner. The peak and the terminal come from the same scan, and the
        # thin ``guarded_rebound_peak`` accessor equals ``guarded_rebound(...).peak`` —
        # the split, the label, and the scored span can never disagree.
        cgm, _ep, nadir_t = self._near_low_rebound()
        gr = guarded_rebound(cgm, nadir_t)
        self.assertIsInstance(gr, GuardedRebound)
        self.assertEqual(gr.peak, 210.0)
        # The terminal is the settled plateau (BG came to rest), well past the +80 peak.
        self.assertEqual(gr.terminal, datetime(2026, 6, 10, 21, 15, 0))
        self.assertEqual(guarded_rebound_peak(cgm, nadir_t), gr.peak)

    def test_extends_through_lever_less_neighbour(self):
        # AC2/AC3 (lever-less direction): an intervening anchor whose group attributes no
        # lever (simulated by an early ``next_start`` with no lever-bearing neighbour)
        # must NOT truncate the low. The span reaches the guarded-scan terminal, so
        # severity/worst_bg cover the whole excursion — the 210 peak, not the in-range
        # near-low run that scores 0.
        cgm, ep, nadir_t = self._near_low_rebound()
        lever_less_at = nadir_t + timedelta(minutes=15)
        episode, lever = self._build(cgm, ep, next_start=lever_less_at, next_lever_start=None)
        self.assertEqual(lever, Lever.OVER_TREATED_LOW)
        # Reaches the terminal — past the lever-less neighbour's start.
        self.assertEqual(episode.end, datetime(2026, 6, 10, 21, 15, 0))
        self.assertGreater(episode.end, lever_less_at)
        # Pinned extended-span severity/worst_bg so the scored span can't silently drift.
        self.assertEqual(episode.worst_bg, 210.0)
        self.assertAlmostEqual(episode.severity, 438.75, places=2)

    def test_clamps_at_lever_bearing_neighbour(self):
        # AC3 (lever-bearing direction): a lever-bearing neighbour that starts inside the
        # rebound hump DOES clamp the low at its start — two lever-bearing episodes never
        # overlap. The peak past the clamp is excluded, so the span scores 0 over the
        # in-range slice up to the neighbour.
        cgm, ep, nadir_t = self._near_low_rebound()
        neighbour_at = nadir_t + timedelta(minutes=25)      # mid-rebound, BG still climbing
        episode, lever = self._build(
            cgm, ep, next_start=nadir_t + timedelta(minutes=15), next_lever_start=neighbour_at)
        self.assertEqual(lever, Lever.OVER_TREATED_LOW)
        self.assertEqual(episode.end, neighbour_at)          # clamped, not extended
        self.assertLess(episode.worst_bg, 180.0)             # the 210 peak is excluded
        self.assertEqual(episode.severity, 0.0)


class GuardedReboundScanTest(unittest.TestCase):
    """#149: the post-nadir rebound scan widens 60 → 180 min behind a settled-recovery
    guard, so a slow *continuous* rebound is seen while an unrelated later high is not.

    The horizon alone is unsafe — an unguarded 180-min raw scan grabs later meals as
    the "rebound". :func:`guarded_rebound_peak` caps the scan at the first settled
    recovery (a level ≥30-min in-range dwell), a re-dip to a new low, or a CGM gap, so
    the split (``_rebounds``) and the classifier (``_low_lever``) read one guarded peak
    and can never disagree (AC §3).
    """

    def test_slow_rebound_is_now_seen(self):
        # AC test (a): the slow overnight rebound off a 45 nadir. The 60-min window
        # peaks at 127 (< the 160 bar) and drops it; the guarded 180-min scan reaches
        # the rebound and clears the bar. Assert both, so the horizon extension is what
        # fixes it.
        cgm = _arc_cgm(2, 6, _SLOW_REBOUND_CGM)
        nadir_t = datetime(_ARC_YEAR, 2, 6, 2, 30, 0)
        old_60min = max(
            r.bg for r in cgm
            if nadir_t < r.t <= nadir_t + timedelta(minutes=60)
        )
        self.assertLess(old_60min, REBOUND_HIGH_MGDL)        # the 60-min horizon missed it
        guarded = guarded_rebound_peak(cgm, nadir_t)
        self.assertIsNotNone(guarded)
        self.assertGreaterEqual(guarded, REBOUND_HIGH_MGDL)  # the guarded scan sees it

    def test_recovered_low_then_separate_meal_is_not_over_treated(self):
        # #153 regression: the 16:20 low (nadir 64) recovers into range and noodles
        # 101-127 for ~1 h — a plateau that swings ~21 mg/dL of sensor noise, which the
        # old 8 mg/dL min–max band could never see as settled, so the 180-min scan swept
        # the SEPARATE 17:45 meal (climbing past 180) up as the "rebound" (a false
        # over_treated_low). The noise-sized slope guard caps at the plateau.
        cgm = _arc_cgm(2, 13, _NOISY_PLATEAU_CGM)
        nadir_t = datetime(_ARC_YEAR, 2, 13, 16, 20, 0)   # the 64 nadir
        # FAILS on RECOVERY_DRIFT_MGDL = 8 (guard inert -> peak sweeps up the later meal);
        # PASSES once the guard caps at the plateau (peak stays at the ~101-127 recovery).
        self.assertLess(guarded_rebound_peak(cgm, nadir_t), REBOUND_HIGH_MGDL)
        # AC1: the low no longer reads as an over-treated low — the separate 17:45 meal
        # is not swept up as its rebound. (The meal itself is adequately bolused — 50 g on
        # 5.5 U — so the whole evening rightly yields no actionable pattern.)
        ep = self._low_episode(cgm)
        self.assertIsNone(
            attribute(ep, cgm, [], [], isf=None).lever)
        bolus = [_arc_bolus(2, 13, 17, 45, 5.50, 50.0)]
        report = assemble(bolus, cgm, [], isf=None)
        self.assertNotIn(
            Lever.OVER_TREATED_LOW, {e.lever for e in report.episodes.values()})

    def test_recover_dwell_then_separate_meal_is_not_a_rebound(self):
        # AC test (b): a low recovers to range, dwells there ≥30 min (settled), then a
        # *separate* later bump exceeds 180. The guard caps at the settle, so the later
        # meal is not this low's rebound — no over-treated low.
        pre = cgm_flat(10, 10, 0, 100, 10)
        fall = cgm_ramp(10, 10, 10, 100, -4.4, 10)           # 100 -> 56
        recover = cgm_ramp(10, 10, 20, 56, 3.6, 15)          # 56 -> 110
        dwell = cgm_flat(10, 10, 35, 110, 45)                # settled plateau, 45 min
        bump = cgm_ramp(10, 11, 20, 110, 4.5, 20)            # separate rise 110 -> 200
        tail = cgm_ramp(10, 11, 40, 200, -2.0, 40)
        cgm = pre + fall + recover + dwell + bump + tail
        nadir_t = datetime(2026, 6, 10, 10, 20, 0)           # the 56 nadir
        self.assertLess(guarded_rebound_peak(cgm, nadir_t), REBOUND_HIGH_MGDL)
        ep = self._low_episode(cgm)
        self.assertIsNone(attribute(ep, cgm, [], [], isf=None).lever)

    def test_meal_bolus_ends_low_rebound_scan(self):
        # A low rebounds into a high-ish recovery, then a carb-tagged meal bolus lands
        # before the scanner observes a settled dwell. The meal-driven climb after that
        # bolus is not part of the low treatment's rebound.
        pre = cgm_flat(10, 8, 0, 100, 10)
        fall = cgm_ramp(10, 8, 10, 100, -3.4, 10)            # 100 -> 66
        rescue = cgm_ramp(10, 8, 20, 66, 4.3, 30)            # 66 -> 195
        meal_climb = cgm_ramp(10, 8, 50, 195, 2.0, 50)       # meal drives 195 -> 295
        cgm = pre + fall + rescue + meal_climb
        bolus = [meal(10, 8, 50, carbs=45.0, dose=9.0)]
        ep = self._low_episode(cgm)

        attr = attribute(ep, cgm, bolus, [], isf=None)
        self.assertEqual(attr.lever, Lever.OVER_TREATED_LOW)
        self.assertIn("rebounded to 195 mg/dL", attr.steps[0].text)
        self.assertEqual(attr.rebound_end, bolus[0].t)

    def test_fast_rebound_transiting_range_still_fires(self):
        # AC test (c): a fast rebound that transits range without dwelling (48 -> 200 in
        # ~25 min) IS an over-treated low — the brief upward pass-through never settles,
        # so it does not cap the scan.
        pre = cgm_flat(11, 14, 0, 100, 10)
        fall = cgm_ramp(11, 14, 10, 100, -5.2, 10)           # 100 -> 48
        rise = cgm_ramp(11, 14, 20, 48, 7.6, 20)             # 48 -> 200, straight through range
        settle = cgm_ramp(11, 14, 40, 200, -1.5, 60)
        cgm = pre + fall + rise + settle
        nadir_t = datetime(2026, 6, 11, 14, 20, 0)
        self.assertGreaterEqual(guarded_rebound_peak(cgm, nadir_t), REBOUND_HIGH_MGDL)
        ep = self._low_episode(cgm)
        self.assertEqual(
            attribute(ep, cgm, [], [], isf=None).lever,
            Lever.OVER_TREATED_LOW,
        )

    def test_cgm_dropout_breaks_continuity(self):
        # AC test (d): a CGM dropout ≥ MAX_GAP_MIN mid-window ends the scan — a high on
        # the far side of the gap can't be tied to this low's excursion.
        pre = cgm_flat(12, 10, 0, 100, 10)
        fall = cgm_ramp(12, 10, 10, 100, -4.4, 10)           # 100 -> 56
        recover = cgm_ramp(12, 10, 20, 56, 4.0, 15)          # 56 -> 116 (below the bar)
        # ~105-min dropout, then a separate high on the far side.
        after = cgm_ramp(12, 12, 20, 120, 5.0, 20) + cgm_ramp(12, 12, 40, 220, -2.0, 40)
        cgm = pre + fall + recover + after
        nadir_t = datetime(2026, 6, 12, 10, 20, 0)
        self.assertLess(guarded_rebound_peak(cgm, nadir_t), REBOUND_HIGH_MGDL)
        ep = self._low_episode(cgm)
        self.assertIsNone(attribute(ep, cgm, [], [], isf=None).lever)

    def _low_episode(self, cgm):
        eps = [e for e in segment(collect_anchors([], cgm, []))
               if any(a.kind is AnchorKind.LOW for a in e.anchors)]
        self.assertTrue(eps)
        return eps[0]


class MidnightCrossingWindowTest(unittest.TestCase):
    """#89: the display window must cover every narrated beat's ``t``.

    #79's beats range over the trigger's full excursion and #81 extends low-trigger
    arcs through the rebound, so a beat can outrun the episode's own [start, end] —
    most visibly on a midnight-crosser, where the resolution beat lands hours after
    the episode header time. The frontend pins the x-axis to window.start/end, so
    every step ``t`` must fall inside [window.start, window.end] or late markLines
    plot off-canvas.
    """

    def _midnight_meal(self):
        # A late dinner at 21:40 that runs away and only settles back into range
        # past midnight — the resolution beat lands on the next calendar day.
        pre = cgm_flat(30, 21, 20, 150, 20)
        up = cgm_ramp(30, 21, 40, 150, 1.6, 150)        # 150 -> ~390 by ~00:10 next day
        # Down-ramp starts where the up-ramp ended (00:10 next day) — build from the
        # datetime directly so the minute field doesn't overflow past 59.
        d0 = up[-1].t
        down = [
            CgmReading(t=d0 + timedelta(minutes=5 * k), bg=up[-1].bg - 1.8 * 5 * k,
                       type="EGV")
            for k in range(1, 130 // 5 + 1)             # falls back into range next day
        ]
        cgm = pre + up + down
        m = meal(30, 21, 40, carbs=35.0, dose=8.0)
        return cgm, m

    def test_window_covers_every_narrated_step(self):
        cgm, m = self._midnight_meal()
        report = assemble([m], cgm, [], isf=ISF,
                          window_builder=lambda s, e: {"start": s, "end": e})
        # The midnight-crossing meal episode is the one whose story spans two days.
        episode = next(
            ep for ep in report.episodes.values()
            if ep.steps and max(s.t for s in ep.steps).date() > ep.start.date()
        )
        win_start = episode.window["start"]
        win_end = episode.window["end"]

        # The story actually crosses midnight (the whole point of the case).
        last_step_t = max(s.t for s in episode.steps)
        self.assertGreater(last_step_t, episode.end)          # beat outran the header
        self.assertGreater(last_step_t.date(), episode.start.date())  # next day

        # Every beat lands inside the serialized window.
        for s in episode.steps:
            self.assertGreaterEqual(s.t, win_start)
            self.assertLessEqual(s.t, win_end)

    def test_window_widen_is_payload_only(self):
        # Widening the window must not touch scoring: severity, worst_bg, and the
        # episode's own [start, end] are computed over the untouched episode bounds,
        # independent of where the beats (and thus the window) reach.
        cgm, m = self._midnight_meal()
        report = assemble([m], cgm, [], isf=ISF,
                          window_builder=lambda s, e: {"start": s, "end": e})
        episode = next(
            ep for ep in report.episodes.values()
            if ep.steps and max(s.t for s in ep.steps).date() > ep.start.date()
        )
        # severity / worst_bg equal a direct recompute over [start, end] — proof the
        # window widening fed nothing back into scoring.
        self.assertEqual(episode.severity,
                         severity_score(cgm, episode.start, episode.end))
        self.assertEqual(episode.worst_bg,
                         worst_bg(cgm, episode.start, episode.end))


# An overnight low with a live meal-bolus tail (#155): it bottoms at 46 with insulin
# still on board from a bolus ~3 h earlier, and is then over-treated into a 243 rebound.
# The old evening-dose reframe won outright and the over-correction went silent — the
# bug. The arc covers the crash, the recovery dip out of the nadir, the 243 peak, and
# the decline back toward range; the dip between crash and rebound is what the split
# reads, so it is load-bearing, not decoration.
# SYNTHETIC-FIXTURE: invented CGM arc; preserves an overnight crash-then-overcorrection pair with a recovery dip between them — the #155 shape the episode split needs.
_DEEP_LOW_SPLIT_CGM = (
    "02:30:118,02:35:112,02:40:107,02:45:101,02:50:96,02:55:91,03:00:84,03:05:77,"
    "03:10:70,03:15:66,03:20:63,03:25:60,03:30:57,03:35:54,03:40:51,03:45:49,03:50:46,"
    "03:55:47,04:00:55,04:05:73,04:10:98,04:15:124,04:20:156,04:25:183,04:30:206,"
    "04:35:219,04:40:227,04:45:232,04:50:229,04:55:226,05:00:230,05:05:236,05:10:243,"
    "05:15:241,05:20:237,05:25:233,05:30:233,05:35:228,05:40:222,05:45:215,05:50:208,"
    "05:55:200,06:00:194,06:05:186,06:10:183,06:15:181,06:20:179,06:25:176"
)


class OverTreatedCausedLowSplitTest(unittest.TestCase):
    """#155: split an over-treated low that has its *own* cause into two moments.

    When a correction-on-IOB low is also over-treated into
    a rebound, one lever per episode let the crash-reframe win and the over-correction
    went silent. This splits the episode at the recovery dip into a low-moment (the
    crash, keeping its own cause lever) and a high-moment (the over-correction, taking
    over_treated_low) — both surface, over disjoint spans. A plain daytime
    over-treatment with no other cause is left as a single over_treated_low, unchanged.
    """

    # Invented ISF / I:C in force for this arc. Classification is shape-only (#400), so
    # these no longer move the over-treated bar — nothing below asserts on their values.
    SPLIT_ISF, SPLIT_IC = 32.0, 5.0

    def _deep_low(self):
        cgm = _arc_cgm(2, 20, _DEEP_LOW_SPLIT_CGM)
        # The meal-dose tail: 4.5 U at 00:45, ~3 h before the 03:50 nadir.
        bolus = [_arc_bolus(2, 20, 0, 45, 4.5, 22.0)]
        return assemble(bolus, cgm, [],
                        isf=self.SPLIT_ISF)

    def test_deep_low_surfaces_only_the_actionable_over_correction(self):
        # The meal-driven low is an outcome, not a Lever. Its rebound still carries
        # the actionable over-treated-low behavior.
        report = self._deep_low()
        levers = {e.lever for e in report.episodes.values()}
        self.assertEqual(levers, {Lever.OVER_TREATED_LOW})

    def test_daytime_plain_over_treatment_stays_a_single_moment(self):
        # AC2: a plain daytime over-treated low with no other identifiable cause stays a
        # SINGLE over_treated_low — no split, no hollow low-moment, no duplicate.
        pre = cgm_flat(20, 14, 0, 100, 15)
        fall = cgm_ramp(20, 14, 15, 100, -2.2, 20)                # 100 -> ~56
        rebound = cgm_ramp(20, 14, 35, 56, 3.6, 40)               # 56 -> ~200 (over-treated)
        settle = cgm_ramp(20, 15, 15, 200, -1.5, 60)              # back toward range
        cgm = pre + fall + rebound + settle
        report = assemble([], cgm, [], isf=ISF)
        eps = list(report.episodes.values())
        self.assertEqual(len(eps), 1)                             # one moment, not two
        self.assertEqual(eps[0].lever, Lever.OVER_TREATED_LOW)
        # The single moment owns the whole round-trip: worst_bg is the (hypo-weighted)
        # nadir and the span extends past the rebound peak (#124), unchanged from today.
        self.assertEqual(round(eps[0].worst_bg), 56)
        self.assertGreater(eps[0].end, datetime(2026, 6, 20, 14, 55))

    def test_in_between_standalone_high_is_not_anchored(self):
        # AC3 (negative): a rise into the in-between band (over the tiered bar, under
        # 250) that does NOT follow a low is not anchored as a high — the 250 line still
        # governs standalone highs, so no over_treated_low is invented for it.
        pre = cgm_flat(20, 12, 0, 120, 20)
        rise = cgm_ramp(20, 12, 20, 120, 1.0, 100)                # 120 -> 220, no prior low
        settle = cgm_ramp(20, 14, 0, 220, -1.0, 80)
        cgm = pre + rise + settle
        anchors = collect_anchors([], cgm, [])
        self.assertFalse(any(a.kind is AnchorKind.HIGH for a in anchors))  # <250, unanchored
        report = assemble([], cgm, [], isf=ISF)
        self.assertNotIn(Lever.OVER_TREATED_LOW,
                         {e.lever for e in report.episodes.values()})

    def test_shape_classifies_overnight_rebound_regardless_of_iob(self):
        # #400 (supersedes the #130 guard): an overnight sub-70 low rebounding to ~178
        # clears the tiered bar, so it is an over-treated low by shape alone — the 6 U
        # of live bolus at the nadir no longer suppresses the classification.
        fall = cgm_ramp(16, 0, 0, 110, -1.0, 55)                  # 110 -> 55
        low = cgm_flat(16, 0, 55, 55, 20)
        rebound = cgm_ramp(16, 1, 15, 55, 2.46, 50)              # 55 -> ~178 (shallow)
        peak = cgm_flat(16, 2, 5, 178, 10)
        settle = cgm_ramp(16, 2, 15, 178, -1.7, 40) + cgm_flat(16, 2, 55, 110, 60)
        cgm = fall + low + rebound + peak + settle
        bolus = [BolusEvent(t=datetime(2026, 6, 16, 0, 45, 0), insulin=6.0, carbs=None)]
        report = assemble(bolus, cgm, [], isf=ISF)
        levers = {e.lever for e in report.episodes.values()}
        self.assertIn(Lever.OVER_TREATED_LOW, levers)


class EvidencePopulationStructuralCountTest(unittest.TestCase):
    """Every behavioral analyzer output preserves its served ``k <= n`` contract."""

    def _events(self, lever):
        if lever is Lever.CARB_UNDERCOUNT:
            bolus, cgm = dose_stamped_ic_fixture()
            return bolus, cgm, [], ISF
        if lever is Lever.LATE_BOLUS:
            cgm = (cgm_flat(24, 11, 40, 120, 30)
                   + cgm_ramp(24, 12, 10, 120, 2.0, 60)
                   + cgm_ramp(24, 13, 10, 240, -1.0, 80))
            return [meal(24, 12, 40, carbs=85, dose=10)], cgm, [], None
        if lever is Lever.MEAL_OVER_DELIVERY:
            bolus = [meal(25, 11, 45, carbs=50, dose=5)]
            cgm = cgm_flat(25, 11, 30, 110, 105) + [
                CgmReading(t=datetime(2026, 6, 25, 13, 15), bg=68, type="EGV")
            ]
            return bolus, cgm, suspend_run(25, 12, 0, rows=12), None
        if lever is Lever.OVER_TREATED_LOW:
            cgm = OverTreatedLowTest()._low_rebound(26, 11, 30)
            return [], cgm, [], ISF
        if lever is Lever.CORRECTION_ON_IOB:
            cgm = (cgm_flat(27, 18, 40, 120, 20)
                   + cgm_ramp(27, 19, 0, 120, 1.75, 40)
                   + cgm_ramp(27, 19, 40, 190, -1.0, 140))
            bolus = [meal(27, 19, 0, carbs=40, dose=6), corr(27, 20, 0, 4)]
            return bolus, cgm, [], ISF
        if lever is Lever.CORRECTION_STACKING:
            cgm = (cgm_ramp(28, 10, 0, 160, -0.8, 60)
                   + cgm_ramp(28, 11, 5, 108, -1.2, 60))
            bolus = [corr(28, 10, 10, 3), corr(28, 10, 40, 3)]
            return bolus, cgm, [], ISF
        if lever is Lever.MISSED_MEAL:
            return [], cgm_ramp(29, 15, 0, 130, 2.2, 100), [], ISF
        if lever is Lever.MEAL_BOLUS_SHORT:
            cgm = (cgm_flat(30, 9, 0, 110, 180)
                   + cgm_ramp(30, 12, 0, 112, 2.4, 65)
                   + cgm_ramp(30, 13, 5, 268, -1.5, 100))
            bolus = [meal(30, 12, 0, carbs=85, dose=5), corr(30, 13, 20, 2.5)]
            return bolus, cgm, [], 45
        self.fail(f"missing synthetic analyzer fixture for {lever.value}")

    def _report(self, lever):
        from ciq_autotune.analyzers.scenario_config import ScenarioConfig
        bolus, cgm, basal, isf = self._events(lever)
        return assemble(
            bolus, cgm, basal, isf=isf,
            scenario_config=ScenarioConfig(engine_min_occurrences=1),
        )

    def test_every_behavioral_lever_serves_a_structural_count(self):
        self.assertEqual(len(Lever), 8)
        for lever in Lever:
            with self.subTest(lever=lever.value):
                report = self._report(lever)
                self.assertIn(lever, {episode.lever for episode in report.episodes.values()})
                pattern = next(
                    item for item in [*report.patterns, *report.low_confidence]
                    if item.lever is lever
                )
                payload = pattern.to_dict()
                self.assertLessEqual(payload["confidence"]["k"],
                                     payload["confidence"]["n"])

    def test_all_behavioral_levers_leave_staging_verdict_bytes_unchanged(self):
        """Behavioral patterns cannot stage; pin invariance at the basal seam.

        The eight per-lever scenario fixtures below prove that every behavioral
        classifier runs, but scenario findings do not own an ``asserts_move``
        predicate. A separate synthetic basal analyzer fixture therefore supplies
        real staging verdicts without hand-setting them or touching the predicate.
        """
        import json

        from ciq_autotune.analyzers.basal import analyze_basal

        for lever in Lever:
            self.assertIn(
                lever,
                {episode.lever for episode in self._report(lever).episodes.values()},
            )

        basal, cgm = [], []
        for day in range(1, 13):
            start = datetime(2022, 6, day)
            basal.append(BasalEvent(
                t=start, delivery_type="algorithmDelivery", duration_mins=360,
                basal_rate=0.48, profile_basal_rate=0.6,
            ))
            cgm.extend(
                CgmReading(t=start + timedelta(minutes=5 * offset), bg=120,
                           type="EGV")
                for offset in range(73)
            )
        slots = analyze_basal(basal, cgm, [], [])
        verdicts = [
            [slot.status.value if slot.status is not None else None,
             slot.asserts_move]
            for slot in slots
        ]
        actual = json.dumps(verdicts, separators=(",", ":")).encode()
        expected = json.dumps(
            [["lower", True]] * 12 + [["no data", False]] * 36,
            separators=(",", ":"),
        ).encode()
        self.assertEqual(actual, expected)


if __name__ == "__main__":
    unittest.main()
