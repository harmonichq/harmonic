"""Narrative-beat tests (#79).

:func:`~ciq_autotune.analyzers.scenario.narrate.narrate` turns an attributed
episode into a curated multi-beat story: the trigger (beat 1) plus the turning
points of *the excursion that contains the trigger* — peak, user intervention(s),
suspend, nadir, resolution — trigger-centered and bounded by return-to-range
troughs, evidence-tiered per ADR 0003.

Coverage:

* **the composed over-correction beat** — a runaway meal that a user correction
  drives into a low reads as one arc: trigger → correction → nadir (inferred
  causal clause) → resolution. This is the taxonomy hole #79 fills without a lever.
* **peak beat + suppression** — a peak the trigger doesn't state gets its own
  observed beat; a meal driver that already says "ran away to 375" suppresses it.
* **intervention aggregation** — ≥2 user corrections aggregate; sub-1 U CIQ
  auto-corrections never count.
* **trigger-centering** — a pre-trigger hump/correction is never narrated (beats
  are forward of the trigger), so a double-hump episode tells the trigger's story.
* **low-trigger dedup** — an overnight low doesn't emit its nadir twice.
* **dedup + cap** — adjacent identical beats collapse; the arc caps at ~6 beats.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.classifiers.evidence import EvidenceTier
from ciq_autotune.analyzers.scenario import Lever, assemble
from ciq_autotune.analyzers.scenario.anchors import AnchorKind, collect_anchors
from ciq_autotune.analyzers.scenario.attribute import Attribution, attribute
from ciq_autotune.analyzers.scenario.narrate import _dedup_and_cap, narrate
from ciq_autotune.analyzers.scenario.payload import Step
from ciq_autotune.analyzers.scenario.narrate import _arc_bounds
from ciq_autotune.analyzers.scenario.segment import EpisodeAnchors, segment
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading


# --- builders (mirror tests/test_scenario_engine.py) -----------------------


def cgm_ramp(day, h, m, start_bg, slope_per_min, minutes, step=5):
    t0 = datetime(2026, 6, day, h, m, 0)
    return [
        CgmReading(t=t0 + timedelta(minutes=step * k),
                   bg=start_bg + slope_per_min * step * k, type="EGV")
        for k in range(minutes // step + 1)
    ]


def cgm_flat(day, h, m, bg, minutes, step=5):
    return cgm_ramp(day, h, m, bg, 0.0, minutes, step)


def meal(day, h, m, carbs=45.0, dose=10.0):
    return BolusEvent(
        t=datetime(2026, 6, day, h, m, 0), insulin=dose, carbs=carbs,
        carb_ratio=10.0,
    )


def corr(day, h, m, units=2.0):
    return BolusEvent(t=datetime(2026, 6, day, h, m, 0), insulin=units, carbs=None)


def suspend_run(day, h, m, rows=8, cadence=5, profile_rate=0.9):
    from ciq_autotune.analyzers.classifiers.context_gate import CIQ_SUSPEND_TYPE

    t0 = datetime(2026, 6, day, h, m, 0)
    return [
        BasalEvent(t=t0 + timedelta(minutes=cadence * k),
                   delivery_type=CIQ_SUSPEND_TYPE,
                   basal_rate=0.0, profile_basal_rate=profile_rate)
        for k in range(rows)
    ]


ISF = 40.0
IC = 10.0


def _narrate_one(boluses, cgm, basal=()):
    """Segment → attribute → narrate the (single) actionable episode's beats."""
    anchors = collect_anchors(boluses, cgm, basal)
    eps = [e for e in segment(anchors)]
    for ep in eps:
        attr = attribute(ep, cgm, boluses, basal, isf=ISF)
        if attr.lever is not None:
            return attr, narrate(attr, ep, cgm, boluses, basal)
    raise AssertionError("no actionable episode")


class ComposedOverCorrectionTest(unittest.TestCase):
    """The #79 headline: a runaway meal a correction drives into a low."""

    def _runaway_into_low(self):
        pre = cgm_flat(15, 11, 40, 120, 20)
        up = cgm_ramp(15, 12, 0, 120, 3.0, 70)      # 120 -> 330 by 13:10
        down = cgm_ramp(15, 13, 10, 330, -3.0, 90)  # 330 -> 60 by 14:40
        rec = cgm_ramp(15, 14, 40, 60, 1.2, 60)     # 60 -> 132 by 15:40
        tail = cgm_flat(15, 15, 40, 132, 40)
        cgm = pre + up + down + rec + tail
        m = meal(15, 12, 0, carbs=30.0, dose=7.0)   # under-covers -> carb undercount
        c = corr(15, 13, 15, units=5.0)             # 5U after the peak
        return [m, c], cgm

    def test_reads_as_a_multi_beat_story(self):
        boluses, cgm = self._runaway_into_low()
        attr, steps = _narrate_one(boluses, cgm)
        self.assertEqual(attr.lever, Lever.CARB_UNDERCOUNT)
        self.assertGreaterEqual(len(steps), 3)
        # Beat 1 is the attributed trigger.
        self.assertIn("undercount", steps[0].text)
        # The nadir is a composed beat: observed value + inferred causal clause.
        nadir = [s for s in steps if "bottomed at" in s.text]
        self.assertEqual(len(nadir), 1)
        self.assertEqual(nadir[0].evidence_tier, EvidenceTier.INFERRED)
        self.assertIn("5U correction", nadir[0].text)     # names the over-correction
        # The correction is its own observed intervention beat.
        self.assertTrue(any(s.evidence_tier == EvidenceTier.OBSERVED
                            and "correction" in s.text for s in steps))
        # Steps are in wall-clock order.
        self.assertEqual([s.t for s in steps], sorted(s.t for s in steps))

    def test_peak_suppressed_when_trigger_states_it(self):
        # The carb-undercount driver says "ran away to 330" — no separate peak beat.
        boluses, cgm = self._runaway_into_low()
        _attr, steps = _narrate_one(boluses, cgm)
        self.assertFalse(any("peaked at" in s.text for s in steps))


class PeakAndInterventionTest(unittest.TestCase):
    def test_peak_beat_appears_when_trigger_is_silent_on_it(self):
        # A missed meal states the rise slope, not the peak -> peak earns a beat.
        cgm = cgm_ramp(15, 15, 0, 130, 2.2, 100)    # 130 -> ~350, no bolus
        _attr, steps = _narrate_one([], cgm)
        peak = [s for s in steps if "peaked at" in s.text]
        self.assertEqual(len(peak), 1)
        self.assertEqual(peak[0].evidence_tier, EvidenceTier.OBSERVED)

    def test_two_corrections_aggregate(self):
        pre = cgm_flat(15, 11, 40, 120, 20)
        up = cgm_ramp(15, 12, 0, 120, 3.0, 70)
        down = cgm_ramp(15, 13, 10, 330, -3.0, 90)
        rec = cgm_ramp(15, 14, 40, 60, 1.2, 60)
        tail = cgm_flat(15, 15, 40, 132, 40)
        cgm = pre + up + down + rec + tail
        m = meal(15, 12, 0, carbs=30.0, dose=7.0)
        boluses = [m, corr(15, 13, 15, units=4.0), corr(15, 13, 45, units=3.0)]
        _attr, steps = _narrate_one(boluses, cgm)
        agg = [s for s in steps if "corrected 2×" in s.text]
        self.assertEqual(len(agg), 1)
        self.assertIn("U total", agg[0].text)

    def test_sub_1u_auto_correction_is_not_an_intervention(self):
        pre = cgm_flat(15, 11, 40, 120, 20)
        up = cgm_ramp(15, 12, 0, 120, 3.0, 70)
        down = cgm_ramp(15, 13, 10, 330, -3.0, 90)
        rec = cgm_ramp(15, 14, 40, 60, 1.2, 60)
        tail = cgm_flat(15, 15, 40, 132, 40)
        cgm = pre + up + down + rec + tail
        m = meal(15, 12, 0, carbs=30.0, dose=7.0)
        auto = BolusEvent(t=datetime(2026, 6, 15, 13, 15), insulin=0.4, carbs=None)
        _attr, steps = _narrate_one([m, auto], cgm)
        self.assertFalse(any("correction" in s.text for s in steps))


class TriggerCenteringTest(unittest.TestCase):
    def test_no_beat_precedes_the_trigger(self):
        # A pre-meal user correction (a prior excursion's fallout) must not be
        # narrated: consequence beats are forward of the trigger.
        pre = cgm_flat(15, 11, 40, 120, 20)
        up = cgm_ramp(15, 12, 0, 120, 3.0, 80)      # 120 -> 360 by 13:20
        down = cgm_ramp(15, 13, 20, 360, -2.0, 120)  # -> 120 by ~15:20
        cgm = pre + up + down
        m = meal(15, 12, 0, carbs=30.0, dose=7.0)
        pre_corr = corr(15, 11, 45, units=3.0)      # BEFORE the meal trigger
        attr, steps = _narrate_one([m, pre_corr], cgm)
        self.assertTrue(all(s.t >= attr.trigger_t for s in steps))
        self.assertFalse(any("correction" in s.text for s in steps))

    def test_double_hump_narrates_the_triggers_excursion(self):
        # Two humps in one cluster; the trigger sits in the SECOND. Trigger-centered
        # bounding must narrate hump 2's excursion (peak 330) and never hump 1's
        # (peak 300). Attribution is hand-built to pin the trigger in hump 2
        # deterministically (a classifier's own digestion window is not under test).
        hump1_up = cgm_ramp(15, 12, 0, 120, 3.0, 60)     # 120 -> 300 by 13:00
        hump1_dn = cgm_ramp(15, 13, 0, 300, -3.0, 60)    # 300 -> 120 by 14:00 (in range)
        hump2_up = cgm_ramp(15, 14, 0, 120, 3.0, 70)     # 120 -> 330 by 15:10
        hump2_dn = cgm_ramp(15, 15, 10, 330, -2.0, 130)  # -> ~70 by 17:20
        cgm = hump1_up + hump1_dn + hump2_up + hump2_dn
        m1 = meal(15, 12, 0, carbs=45.0, dose=10.0)
        m2 = meal(15, 14, 0, carbs=30.0, dose=7.0)
        anchors = collect_anchors([m1, m2], cgm, [])
        ep = EpisodeAnchors(anchors=anchors)
        trigger_step = Step(t=m2.t,
                            text="ran away to 330 mg/dL despite the bolus — a likely "
                                 "carb undercount",
                            evidence_tier=EvidenceTier.INFERRED)
        attr = Attribution(lever=Lever.CARB_UNDERCOUNT, trigger="meal",
                           trigger_t=m2.t, steps=[trigger_step])
        steps = narrate(attr, ep, cgm, [m1, m2], [])
        # Every beat is forward of the trigger — hump 1 is not the story.
        self.assertTrue(all(s.t >= m2.t for s in steps))
        self.assertFalse(any("300" in s.text for s in steps))


class LowTriggerAndUnresolvedTest(unittest.TestCase):
    def test_correction_on_iob_does_not_emit_its_nadir_twice(self):
        # An evening correction on meal IOB drives a low — the driver
        # step already narrates the nadir, so no second "bottomed at" beat.
        dinner = meal(15, 21, 30, carbs=50.0, dose=8.0)
        evening = corr(15, 22, 30, units=4.0)
        fall = cgm_ramp(16, 0, 0, 110, -0.7, 70)     # 110 -> ~61 by 01:10
        low = cgm_flat(16, 1, 10, 60, 30)
        rec = cgm_ramp(16, 1, 40, 60, 1.2, 60)       # recover into range
        cgm = fall + low + rec
        boluses = [dinner, evening]
        anchors = collect_anchors(boluses, cgm, [])
        eps = [e for e in segment(anchors)
               if any(a.kind is AnchorKind.LOW for a in e.anchors)]
        attr = attribute(eps[0], cgm, boluses, [], isf=ISF)
        self.assertEqual(attr.lever, Lever.CORRECTION_ON_IOB)
        steps = narrate(attr, eps[0], cgm, boluses, [])
        self.assertLessEqual(sum("bottomed at" in s.text for s in steps), 1)

    def test_unresolved_arc_says_so(self):
        # A runaway that never returns to range before the data ends.
        cgm = cgm_ramp(15, 12, 0, 150, 2.0, 120)     # 150 -> ~390, still climbing
        m = meal(15, 12, 0, carbs=20.0, dose=5.0)
        _attr, steps = _narrate_one([m], cgm)
        self.assertTrue(any("still high" in s.text for s in steps))


class DedupAndCapTest(unittest.TestCase):
    def _step(self, minute, text):
        return Step(t=datetime(2026, 6, 15, 12, minute), text=text,
                    evidence_tier=EvidenceTier.OBSERVED)

    def test_adjacent_identical_beats_collapse(self):
        steps = [self._step(0, "a"), self._step(5, "a"), self._step(10, "b")]
        out = _dedup_and_cap(steps)
        self.assertEqual([s.text for s in out], ["a", "b"])

    def test_cap_keeps_trigger_and_resolution(self):
        steps = [self._step(i, chr(ord("a") + i)) for i in range(8)]
        out = _dedup_and_cap(steps)
        self.assertLessEqual(len(out), 6)
        self.assertEqual(out[0].text, "a")     # trigger survives
        self.assertEqual(out[-1].text, "h")    # resolution survives


class IntegrationTest(unittest.TestCase):
    def test_engine_wires_narrate_into_episode_steps(self):
        # Two runaway meals on two days -> a surfaced pattern whose hero episode has
        # a genuine multi-beat story (not the old single actionable-lever step).
        bolus, cgm = [], []
        for d in (10, 11):
            cgm += cgm_flat(d, 11, 40, 120, 20)
            cgm += cgm_ramp(d, 12, 0, 120, 3.0, 70)
            cgm += cgm_ramp(d, 13, 10, 330, -3.0, 90)
            cgm += cgm_ramp(d, 14, 40, 60, 1.2, 60)
            cgm += cgm_flat(d, 15, 40, 132, 40)
            bolus.append(meal(d, 12, 0, carbs=30.0, dose=7.0))
            bolus.append(corr(d, 13, 15, units=5.0))
        report = assemble(bolus, cgm, [], isf=ISF)
        eps = list(report.episodes.values())
        self.assertTrue(eps)
        self.assertTrue(all(len(e.steps) >= 2 for e in eps))
        hero = max(eps, key=lambda e: e.severity)
        self.assertTrue(any("bottomed at" in s.text for s in hero.steps))


class CitedRefsTest(unittest.TestCase):
    """#82 — beats carry the ``window`` join keys they assert, not a re-derived guess."""

    def test_aggregated_corrections_cite_each_dose(self):
        pre = cgm_flat(15, 11, 40, 120, 20)
        up = cgm_ramp(15, 12, 0, 120, 3.0, 70)
        down = cgm_ramp(15, 13, 10, 330, -3.0, 90)
        rec = cgm_ramp(15, 14, 40, 60, 1.2, 60)
        tail = cgm_flat(15, 15, 40, 132, 40)
        cgm = pre + up + down + rec + tail
        m = meal(15, 12, 0, carbs=30.0, dose=7.0)
        c1, c2 = corr(15, 13, 15, units=4.0), corr(15, 13, 45, units=3.0)
        _attr, steps = _narrate_one([m, c1, c2], cgm)
        agg = next(s for s in steps if "corrected 2×" in s.text)
        # Exactly the two doses, keyed by their timestamp — the same "%Y-%m-%d
        # %H:%M:%S" the window's bolus rows carry — and their units sum matches text.
        self.assertEqual(
            agg.cited_event_refs,
            [c1.t.strftime("%Y-%m-%d %H:%M:%S"), c2.t.strftime("%Y-%m-%d %H:%M:%S")],
        )
        self.assertIn(f"~{4.0 + 3.0:.0f}U", agg.text)

    def test_single_correction_cites_its_dose(self):
        pre = cgm_flat(15, 11, 40, 120, 20)
        up = cgm_ramp(15, 12, 0, 120, 3.0, 70)
        down = cgm_ramp(15, 13, 10, 330, -3.0, 90)
        rec = cgm_ramp(15, 14, 40, 60, 1.2, 60)
        tail = cgm_flat(15, 15, 40, 132, 40)
        cgm = pre + up + down + rec + tail
        m = meal(15, 12, 0, carbs=30.0, dose=7.0)
        c = corr(15, 13, 15, units=5.0)
        _attr, steps = _narrate_one([m, c], cgm)
        corr_beat = next(s for s in steps if "U correction" in s.text)
        self.assertEqual(corr_beat.cited_event_refs,
                         [c.t.strftime("%Y-%m-%d %H:%M:%S")])

    def test_peak_and_nadir_cite_their_cgm_point(self):
        boluses = [meal(15, 12, 0, carbs=30.0, dose=7.0), corr(15, 13, 15, units=5.0)]
        pre = cgm_flat(15, 11, 40, 120, 20)
        up = cgm_ramp(15, 12, 0, 120, 3.0, 70)
        down = cgm_ramp(15, 13, 10, 330, -3.0, 90)
        rec = cgm_ramp(15, 14, 40, 60, 1.2, 60)
        tail = cgm_flat(15, 15, 40, 132, 40)
        cgm = pre + up + down + rec + tail
        _attr, steps = _narrate_one(boluses, cgm)
        nadir = next(s for s in steps if "bottomed at" in s.text)
        self.assertEqual(nadir.cited_event_refs,
                         [nadir.t.strftime("%Y-%m-%d %H:%M:%S")])

    def test_trigger_and_resolution_cite_nothing(self):
        cgm = cgm_ramp(15, 15, 0, 130, 2.2, 100)
        _attr, steps = _narrate_one([], cgm)
        self.assertEqual(steps[0].cited_event_refs, [])   # trigger cites only its t
        self.assertEqual(steps[-1].cited_event_refs, [])  # resolution likewise


class SuspendContractTest(unittest.TestCase):
    """#82 — the suspend beat cites the zero-rate ``basal`` run (the supported contract)."""

    def test_suspend_beat_cites_the_zero_rate_run(self):
        # A runaway meal, a correction into a low, and a CIQ defensive suspend during
        # the fall — the suspend beat names the zero-rate rows spanning it.
        pre = cgm_flat(15, 11, 40, 120, 20)
        up = cgm_ramp(15, 12, 0, 120, 3.0, 70)
        down = cgm_ramp(15, 13, 10, 330, -3.0, 90)
        rec = cgm_ramp(15, 14, 40, 60, 1.2, 60)
        tail = cgm_flat(15, 15, 40, 132, 40)
        cgm = pre + up + down + rec + tail
        m = meal(15, 12, 0, carbs=30.0, dose=7.0)
        c = corr(15, 13, 15, units=5.0)
        basal = suspend_run(15, 13, 40, rows=6)   # zero-rate run during the fall
        _attr, steps = _narrate_one([m, c], cgm, basal)
        susp = next(s for s in steps if "suspended basal" in s.text)
        zero_ts = [b.t.strftime("%Y-%m-%d %H:%M:%S")
                   for b in basal if b.basal_rate == 0]
        self.assertEqual(susp.cited_event_refs, zero_ts)


class OverTreatedLowReboundArcTest(unittest.TestCase):
    """#81 — a low trigger's arc extends through the over-treatment's rebound high."""

    def _over_treated_low(self):
        # One clean 5-min series: fall to a low, settle briefly in range (the
        # premature #79 close), then the rescue over-shoots into a rebound high
        # that finally comes home. Written explicitly so there are no
        # duplicate-timestamp boundary rows to confuse the trough test.
        bgs = (
            # 16:00 -> a low (leaves range below), 5-min steps
            [130, 110, 90, 70, 55, 50, 55]                  # nadir 50
            # climb home to an in-range settle trough (~120)
            + [70, 90, 110, 120, 120, 120]                  # premature #79 close ~120
            # rebound climbs back out of range to a high
            + [130, 160, 190, 220, 250, 280, 300, 290]      # rebound peak 300
            # rebound comes home for good
            + [250, 210, 175, 150, 130, 120]                # settle in range
        )
        t0 = datetime(2026, 6, 15, 16, 0, 0)
        return [CgmReading(t=t0 + timedelta(minutes=5 * k), bg=float(v), type="EGV")
                for k, v in enumerate(bgs)]

    def test_arc_extends_through_the_rebound(self):
        cgm = self._over_treated_low()
        ep = EpisodeAnchors(anchors=collect_anchors([], cgm, []))
        rows = sorted((r for r in cgm if r.bg is not None), key=lambda r: r.t)
        nadir_t = min(rows, key=lambda r: r.bg).t
        # High trigger would close at the first in-range trough after the nadir…
        _s, hi_end, _r = _arc_bounds(rows, nadir_t, ep, is_low_trigger=False)
        _s, lo_end, _r = _arc_bounds(rows, nadir_t, ep, is_low_trigger=True)
        # …the low trigger extends well past it, into the rebound.
        self.assertGreater(lo_end, hi_end)
        # The rebound peak falls inside the low-trigger arc, outside the high one.
        peak_t = max(rows, key=lambda r: r.bg).t
        self.assertGreaterEqual(lo_end, peak_t)
        self.assertLess(hi_end, peak_t)

    def test_over_treated_low_story_reaches_the_rebound(self):
        cgm = self._over_treated_low()
        nadir_t = datetime(2026, 6, 15, 16, 25)   # the 50 mg/dL nadir
        anchors = collect_anchors([], cgm, [])
        ep = EpisodeAnchors(anchors=anchors)
        trigger_step = Step(
            t=nadir_t,
            text="BG bottomed at 50 mg/dL, then rebounded to 300 mg/dL — the low "
                 "was likely over-treated with fast carbs",
            evidence_tier=EvidenceTier.INFERRED,
        )
        attr = Attribution(lever=Lever.OVER_TREATED_LOW, trigger="low",
                           trigger_t=nadir_t, steps=[trigger_step])
        steps = narrate(attr, ep, cgm, [], [])
        # The resolution is the *rebound's* settle (return-to-range from above),
        # not the premature in-range trough right after the nadir. The premature
        # close would land ~16:55–17:15; the rebound peak is ~18:15.
        res = steps[-1]
        self.assertGreater(res.t, datetime(2026, 6, 15, 18, 0))
        self.assertNotIn("bottomed", res.text)


class NearLowNeverLeavesRangeTest(unittest.TestCase):
    """#115: a meal over-delivery that dips to a near-low but never leaves the
    70-180 range must close its arc at the recovery settle, not run to the ~5 h
    context pad edge (a 7.5 h tail). The forward scan's
    ``left_range`` gate never tripped on a shallow near-low, so the arc fell
    through to the last reading."""

    def _meal_over_delivery(self):
        base = cgm_flat(15, 22, 0, 117.0, 20)          # in-range baseline
        dip = cgm_ramp(15, 22, 20, 117.0, -1.8, 25)    # -> near-low nadir 72 @ 22:45
        rec = cgm_ramp(15, 22, 45, 72.0, 2.0, 25)      # climbs back to 122 @ 23:10
        tail = cgm_flat(15, 23, 10, 122.0, 300)        # flat, in-range, 5 h tail
        return base + dip + rec + tail

    def test_near_low_closes_arc_at_settle_not_pad_edge(self):
        cgm = self._meal_over_delivery()
        rows = sorted((r for r in cgm if r.bg is not None), key=lambda r: r.t)
        ep = EpisodeAnchors(anchors=collect_anchors([], cgm, []))
        trigger_t = datetime(2026, 6, 15, 22, 0)
        _s, arc_end, resolved = _arc_bounds(rows, trigger_t, ep, is_low_trigger=False)
        # The near-low (<=75) is a genuine excursion: the arc closes on its
        # in-range recovery settle (~23:10), past the nadir but nowhere near the
        # far end of the 5 h in-range tail (~04:10).
        self.assertGreater(arc_end, datetime(2026, 6, 15, 22, 45))   # past the nadir
        self.assertLess(arc_end, datetime(2026, 6, 15, 23, 45))      # not the pad edge
        self.assertTrue(resolved)                                    # came home

    def test_shallow_dip_above_near_low_still_runs_unresolved(self):
        # A dip that never reaches the near-low band (bottoms at 95) is NOT an
        # excursion — the arc stays unresolved (unchanged behaviour, no false close).
        base = cgm_flat(16, 10, 0, 120.0, 20)
        dip = cgm_ramp(16, 10, 20, 120.0, -1.0, 25)    # -> 95, never <=75
        tail = cgm_flat(16, 10, 45, 95.0, 120)
        cgm = base + dip + tail
        rows = sorted((r for r in cgm if r.bg is not None), key=lambda r: r.t)
        ep = EpisodeAnchors(anchors=collect_anchors([], cgm, []))
        _s, _e, resolved = _arc_bounds(rows, datetime(2026, 6, 16, 10, 0), ep)
        self.assertFalse(resolved)


if __name__ == "__main__":
    unittest.main()
