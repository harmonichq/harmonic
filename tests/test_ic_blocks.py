"""Per-programmed-value carb-ratio blocks — the unit that decides (#518).

Every fixture here is synthetic and every verdict is built through the REAL analyzer:
no test hand-sets `asserts_move`. That is the discipline #273 cost four passes to
learn — its old tests stayed green because their fixtures encoded the very assumption
that was false against real data.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.ic import (
    BLOCK_WINDOW_DAYS,
    IcConfig,
    analyze_ic_blocks,
    ic_blocks_from_segments,
)
from ciq_autotune.analyzers.tuning_priority import ic_headline_block, price_ic_blocks
from ciq_autotune.events import BolusEvent, CarbEntry
from ciq_autotune.harm import HarmArm, HarmConfig, PrintedLow
from ciq_autotune.safety import _MIN_SUPPORTED_BLOCK_RUNS


BASE = datetime(2026, 3, 1)


def meal(day, hh, carbs, dose, *, ratio=None, mm=0):
    return BolusEvent(t=BASE + timedelta(days=day, hours=hh, minutes=mm),
                      insulin=dose, carbs=carbs, carb_ratio=ratio,
                      completion="Completed")


def blocks_for(segments, events, **kw):
    kw.setdefault("observed_days", BLOCK_WINDOW_DAYS)
    kw.setdefault("config", IcConfig())
    blocks, runs = analyze_ic_blocks(events, segments, **kw)
    return blocks, runs


def by_id(blocks):
    return {b.block_id: b for b in blocks}


class BlockPartitionTest(unittest.TestCase):
    """The partition is a pure read of the programmed schedule — the app never draws a
    boundary the user did not program."""

    def test_flat_profile_is_one_all_day_block(self):
        groups = ic_blocks_from_segments([(0, 5.0)])
        self.assertEqual(len(groups), 1)
        self.assertEqual((groups[0]["start_min"], groups[0]["end_min"]), (0, 1440))

    def test_repeated_value_collapses_to_one_block_with_every_member(self):
        groups = ic_blocks_from_segments([(0, 5.0), (420, 5.0), (900, 5.0)])
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["member_start_mins"], [0, 420, 900])

    def test_a_wrapping_value_is_one_block_drawn_as_two_arcs(self):
        # 20:00–07:00 carries 1:5.0 across midnight. That is ONE decision on the pump,
        # so it must be ONE block: end_min <= start_min is how the arc says it wraps.
        groups = ic_blocks_from_segments([(0, 5.0), (420, 4.0), (1200, 5.0)])
        self.assertEqual(len(groups), 2)
        wrapped = next(g for g in groups if g["value"] == 5.0)
        self.assertEqual(wrapped["start_min"], 1200)
        self.assertEqual(wrapped["end_min"], 420)
        self.assertLessEqual(wrapped["end_min"], wrapped["start_min"])
        # members read forward around the clock from the block's own start
        self.assertEqual(wrapped["member_start_mins"], [1200, 0])

    def test_wrapped_block_claims_meals_on_both_sides_of_midnight(self):
        events = [meal(d, 22, 60, 12.0) for d in range(6)] + \
                 [meal(d, 2, 60, 12.0) for d in range(6)]
        blocks, _ = blocks_for([(0, 5.0), (420, 4.0), (1200, 5.0)], events)
        wrapped = by_id(blocks)[1200]
        self.assertEqual(wrapped.n_meals, 12)

    def test_no_programmed_schedule_yields_no_blocks(self):
        self.assertEqual(ic_blocks_from_segments([]), [])
        self.assertEqual(blocks_for([], [meal(0, 12, 60, 12.0)]), ([], 0))


class BlockPoolTest(unittest.TestCase):
    def test_a_run_spanning_a_boundary_is_coverage_only(self):
        # 11:00 and 13:00 are 2 h apart, so they CHAIN into one run — and that run
        # straddles the 12:00 boundary. At block scope a spanning run is information-free
        # (a pro-rata split reproduces the whole-run ratio exactly), so it must count for
        # coverage and never for the numeric pool.
        events = []
        for d in range(12):
            events += [meal(d, 11, 60, 12.0), meal(d, 13, 60, 12.0)]
        blocks, whole_day_runs = blocks_for([(0, 5.0), (720, 6.0)], events)
        b = by_id(blocks)
        self.assertEqual(whole_day_runs, 12)             # 12 closed runs whole-day
        self.assertEqual(b[0].n_runs, 0)
        self.assertEqual(b[720].n_runs, 0)
        self.assertEqual(b[0].n_meals, 12)               # coverage still counts them
        self.assertEqual(b[720].n_meals, 12)

    def test_a_run_wholly_inside_enters_that_block_only(self):
        events = [meal(d, 9, 60, 15.0) for d in range(10)]
        blocks, _ = blocks_for([(0, 5.0), (720, 6.0)], events)
        b = by_id(blocks)
        self.assertEqual(b[0].n_runs, 10)
        self.assertEqual(b[720].n_runs, 0)


class BlockStateMachineTest(unittest.TestCase):
    """collecting · below-floor · unmeasured-alone · numeric — the server's read."""

    SEGMENTS = [(0, 5.0), (720, 6.0)]

    def test_short_history_is_collecting_however_full_the_pool(self):
        events = [meal(d, 9, 60, 15.0) for d in range(30)]
        blocks, _ = blocks_for(self.SEGMENTS, events, observed_days=34)
        b = by_id(blocks)[0]
        self.assertEqual(b.state, "collecting")
        self.assertFalse(b.asserts_move)
        # a collecting block carries the honest day countdown, and only it does
        self.assertEqual((b.days_observed, b.days_needed), (34, BLOCK_WINDOW_DAYS))
        self.assertNotIn("days_observed", by_id(blocks_for(
            self.SEGMENTS, events)[0])[0].to_dict())

    def test_pool_between_min_runs_and_the_floor_is_below_floor(self):
        events = [meal(d, 9, 60, 15.0) for d in range(4)]
        b = by_id(blocks_for(self.SEGMENTS, events)[0])[0]
        self.assertEqual(b.n_runs, 4)
        self.assertEqual(b.state, "below-floor")
        self.assertFalse(b.asserts_move)
        # the number and band still PRINT — the floor gates assertion, never display
        self.assertIsNotNone(b.estimate.value)

    def test_meals_that_always_chain_out_read_unmeasured_alone(self):
        # Every meal in the 00:00–12:00 block chains into the afternoon block, so no run
        # ever sits wholly inside it: the pool cannot fill by construction, and saying
        # "collecting" would promise a number that will never arrive.
        events = []
        for d in range(8):
            events += [meal(d, 11, 60, 12.0), meal(d, 13, 60, 12.0)]
        b = by_id(blocks_for(self.SEGMENTS, events)[0])[0]
        self.assertEqual(b.n_runs, 0)
        self.assertGreaterEqual(b.n_meals, IcConfig().min_runs)
        self.assertEqual(b.state, "unmeasured-alone")
        self.assertIn("chain", b.annotation)

    def test_a_full_pool_is_numeric(self):
        events = [meal(d, 9, 60, 15.0, ratio=5.0) for d in range(12)]
        b = by_id(blocks_for(self.SEGMENTS, events)[0])[0]
        self.assertGreaterEqual(b.n_runs, _MIN_SUPPORTED_BLOCK_RUNS)
        self.assertEqual(b.state, "numeric")


class BlockEligibilityTest(unittest.TestCase):
    """The four conditions, each demonstrated by turning exactly one of them off."""

    SEGMENTS = [(0, 5.0), (720, 6.0)]

    def _asserting(self, n=12, ratio=5.0):
        # 60 g on 15 U reads 4.0 g/U against a programmed 5.0 — a consistent, tight,
        # excluding band, dosed under the currently-programmed ratio.
        events = [meal(d, 9, 60, 15.0, ratio=ratio) for d in range(n)]
        return by_id(blocks_for(self.SEGMENTS, events)[0])[0]

    def test_all_four_conditions_met_asserts(self):
        b = self._asserting()
        e = b.evidence["eligibility"]
        self.assertTrue(all(e[k] for k in ("runs_floor_met", "band_excludes_programmed",
                                           "regime_supported", "names_a_move")))
        self.assertTrue(b.asserts_move)
        self.assertLess(b.recommended, 5.0)     # tighter: more insulin per carb

    def test_a_narrow_band_below_the_run_floor_is_still_held(self):
        # #273's exact failure at block scope: n = 5 clears `wide` and would stage.
        b = self._asserting(n=5)
        self.assertFalse(b.estimate.wide)
        self.assertFalse(b.asserts_move)
        self.assertFalse(b.evidence["eligibility"]["runs_floor_met"])
        self.assertEqual(b.evidence["eligibility"]["runs_floor"],
                         _MIN_SUPPORTED_BLOCK_RUNS)

    def test_a_band_that_covers_programmed_is_held(self):
        # 60 g on 12 U reads exactly the programmed 5.0.
        events = [meal(d, 9, 60, 12.0, ratio=5.0) for d in range(12)]
        b = by_id(blocks_for(self.SEGMENTS, events)[0])[0]
        self.assertFalse(b.evidence["eligibility"]["band_excludes_programmed"])
        self.assertFalse(b.asserts_move)


class RegimeBracketTest(unittest.TestCase):
    """Gate 3 — the compare-side hold that decays as post-change meals accrue (#518)."""

    SEGMENTS = [(0, 5.0), (720, 6.0)]

    def _block(self, events):
        return by_id(blocks_for(self.SEGMENTS, events)[0])[0]

    def test_an_empty_on_regime_pool_holds(self):
        # Every meal was dosed under the OLD 6.0 ratio; nothing yet says the body
        # disagrees with the ratio actually programmed now.
        b = self._block([meal(d, 9, 60, 15.0, ratio=6.0) for d in range(12)])
        self.assertTrue(b.evidence["eligibility"]["band_excludes_programmed"])
        self.assertFalse(b.evidence["eligibility"]["regime_supported"])
        self.assertFalse(b.asserts_move)
        self.assertEqual(b.regime["on_regime"], None)
        self.assertEqual(b.regime["n_runs_on_regime"], 0)
        self.assertIn("bracket", b.annotation)          # the hold names its reason

    def test_a_straddling_bracket_holds(self):
        # A synthetic profile edit. The bulk of the evidence was dosed under the OLD 6.0
        # ratio and reads 8.0 g/U — well ABOVE the programmed 5.0, with a band that
        # excludes it. But the handful of meals actually dosed under 5.0 read 4.0, BELOW
        # it. The two readings bracket the programmed value, so nothing is identified
        # yet and the block is held by that alone.
        events = ([meal(d, 9, 60, 7.5, ratio=6.0) for d in range(20)]
                  + [meal(d, 9, 60, 15.0, ratio=5.0) for d in range(20, 22)])
        b = self._block(events)
        e = b.evidence["eligibility"]
        self.assertTrue(e["runs_floor_met"])
        self.assertTrue(e["band_excludes_programmed"])
        self.assertTrue(e["names_a_move"])
        self.assertTrue(b.regime["straddles_programmed"])
        self.assertFalse(e["regime_supported"])
        self.assertFalse(b.asserts_move)
        self.assertIn("bracket", b.annotation)

    def test_the_hold_lifts_once_on_regime_meals_agree(self):
        # The same block after the post-change meals themselves support the move: both
        # readings sit on the same side of programmed, so the bracket no longer straddles.
        events = ([meal(d, 9, 60, 15.0, ratio=6.0) for d in range(10)]
                  + [meal(d, 9, 60, 15.0, ratio=5.0) for d in range(10, 20)])
        b = self._block(events)
        self.assertFalse(b.regime["straddles_programmed"])
        self.assertGreater(b.regime["n_runs_on_regime"], 0)
        self.assertTrue(b.asserts_move)
        self.assertEqual(b.to_dict()["days_observed"], BLOCK_WINDOW_DAYS)

    def test_measurement_stays_full_window(self):
        # ADR 0039/#288: the bracket is COMPARE-side only. The estimate itself must be
        # the full-window pool, never the on-regime subset.
        events = ([meal(d, 9, 60, 9.0, ratio=6.0) for d in range(10)]
                  + [meal(d, 9, 60, 15.0, ratio=5.0) for d in range(10, 20)])
        b = self._block(events)
        self.assertEqual(b.estimate.n, 20)
        self.assertAlmostEqual(b.regime["full"]["value"], b.estimate.value)


class BlockHarmTest(unittest.TestCase):
    """Harm is arm-wide for a tighten and block-scoped for a loosen."""

    SEGMENTS = [(0, 5.0), (720, 5.0), (1080, 4.0)]

    def _events(self):
        # 09:00 meals read tighter than the programmed 5.0 in the overnight/day block.
        return [meal(d, 9, 60, 15.0, ratio=5.0) for d in range(12)]

    def test_a_low_anywhere_on_the_arm_withholds_a_tighten(self):
        events = self._events()
        # The low is owned by an EVENING meal bolus — a different block entirely. The
        # insulin still landed in a body, so it withholds dosing breakfast harder.
        evening = meal(3, 19, 40, 8.0, ratio=4.0)
        low = PrintedLow(t=evening.t + timedelta(hours=2), bg=58.0, iob_u=2.1,
                         arm=HarmArm.IC, dominant_bolus_t=evening.t,
                         attribution_reason="meal-bolus")
        blocks, _ = blocks_for(self.SEGMENTS, events + [evening],
                               harm_config=HarmConfig(), harm_lows=[low])
        held = by_id(blocks)[0]
        self.assertEqual(held.recommended, held.current_values[0])
        self.assertFalse(held.asserts_move)
        self.assertIn("low printed", held.annotation)

    def test_without_the_low_the_same_block_asserts(self):
        blocks, _ = blocks_for(self.SEGMENTS, self._events(),
                               harm_config=HarmConfig(), harm_lows=[])
        self.assertTrue(by_id(blocks)[0].asserts_move)

    def test_a_pre_empted_rescue_re_keys_to_the_owning_block(self):
        # The rescue hold used to be keyed per segment. Post-revamp a segment gates
        # nothing, so leaving it there would silently drop a live safety hold.
        events = self._events()
        # Without the rescue this block asserts a TIGHTEN — that is the control.
        before = by_id(blocks_for(self.SEGMENTS, events)[0])[0]
        self.assertTrue(before.asserts_move)
        self.assertLess(before.recommended, before.current_values[0])

        # A manual carb logged while this meal's insulin is still acting, with no
        # printed low near it: the masked-rescue signal. It must withhold the tighten.
        rescue = CarbEntry(t=events[2].t + timedelta(hours=2), grams=16.0,
                           certainty="estimate", source="manual")
        b = by_id(blocks_for(self.SEGMENTS, events, carb_entries=[rescue])[0])[0]
        gate = b.evidence["preempted_low_gate"]
        self.assertTrue(gate["gated"], "the rescue must reach the block's own gate")
        self.assertEqual(gate["count"], 1)
        self.assertEqual(b.recommended, b.current_values[0])   # held at current
        self.assertFalse(b.asserts_move)
        self.assertIn("pre-empted low", b.annotation)


class HeldReasonTest(unittest.TestCase):
    """#523: `held_reason` is display-only, transcribed from the annotation the
    analyzer already writes for the failing gate — never a second copy of the gate
    logic. Non-None exactly when the block is `numeric`, its band excludes the
    programmed value, and `asserts_move` is False; `None` otherwise."""

    SEGMENTS = [(0, 5.0), (720, 6.0)]

    def _block(self, events, **kw):
        return by_id(blocks_for(self.SEGMENTS, events, **kw)[0])[0]

    def test_a_straddling_regime_bracket_carries_the_transcribed_hold(self):
        events = ([meal(d, 9, 60, 7.5, ratio=6.0) for d in range(20)]
                  + [meal(d, 9, 60, 15.0, ratio=5.0) for d in range(20, 22)])
        b = self._block(events)
        self.assertEqual(b.state, "numeric")
        self.assertTrue(b.evidence["eligibility"]["band_excludes_programmed"])
        self.assertFalse(b.asserts_move)
        self.assertIsNotNone(b.held_reason)
        self.assertEqual(b.held_reason, b.annotation)   # transcribed, never a copy

    def test_a_harm_gated_tighten_carries_the_transcribed_hold(self):
        events = [meal(d, 9, 60, 15.0, ratio=5.0) for d in range(12)]
        evening = meal(3, 19, 40, 8.0, ratio=6.0)
        low = PrintedLow(t=evening.t + timedelta(hours=2), bg=58.0, iob_u=2.1,
                         arm=HarmArm.IC, dominant_bolus_t=evening.t,
                         attribution_reason="meal-bolus")
        b = self._block(events + [evening], harm_config=HarmConfig(), harm_lows=[low])
        self.assertEqual(b.state, "numeric")
        self.assertFalse(b.asserts_move)
        self.assertIsNotNone(b.held_reason)
        self.assertEqual(b.held_reason, b.annotation)

    def test_an_asserting_block_carries_no_held_reason(self):
        # The regime-bracket control from RegimeBracketTest: on-regime evidence
        # supports the move, so it fully asserts — no hold, no reason to show one.
        events = ([meal(d, 9, 60, 15.0, ratio=6.0) for d in range(10)]
                  + [meal(d, 9, 60, 15.0, ratio=5.0) for d in range(10, 20)])
        b = self._block(events)
        self.assertTrue(b.asserts_move)
        self.assertIsNone(b.held_reason)

    def test_a_genuinely_settled_block_carries_no_held_reason(self):
        # The band includes the programmed value: true agreement, not a hold.
        events = [meal(d, 9, 60, 12.0, ratio=5.0) for d in range(12)]
        b = self._block(events)
        self.assertFalse(b.evidence["eligibility"]["band_excludes_programmed"])
        self.assertFalse(b.asserts_move)
        self.assertIsNone(b.held_reason)

    def test_a_below_floor_block_carries_no_held_reason(self):
        # #273's exact trap at block scope: a narrow band at n=5 excludes programmed
        # but never clears the run floor — it is below-floor, not numeric, so it
        # never reads as held either.
        events = [meal(d, 9, 60, 15.0, ratio=5.0) for d in range(5)]
        b = self._block(events)
        self.assertEqual(b.state, "below-floor")
        self.assertFalse(b.asserts_move)
        self.assertIsNone(b.held_reason)


class HeadlineTest(unittest.TestCase):
    def test_the_headline_is_the_highest_priority_asserting_block(self):
        # Two asserting blocks with different carb loads: the one carrying more carbs
        # implicates more insulin, so it must headline — the same emitted priority the
        # client ranks by, not a raw divergence the two could compute differently.
        events = ([meal(d, 9, 90, 22.5, ratio=5.0) for d in range(12)]
                  + [meal(d, 19, 30, 7.5, ratio=5.0) for d in range(12)])
        # Two DISTINCT programmed values, so the day really is two blocks (one value
        # across the whole day would correctly collapse to one).
        blocks, _ = blocks_for([(0, 5.0), (720, 5.1)], events)
        priced = price_ic_blocks(blocks)
        asserting = [b for b in priced if b.asserts_move]
        self.assertTrue(asserting)
        head = ic_headline_block(priced)
        self.assertEqual(head.priority, max(b.priority for b in asserting))

    def test_nothing_asserting_has_no_headline(self):
        events = [meal(d, 9, 60, 12.0, ratio=5.0) for d in range(12)]
        blocks, _ = blocks_for([(0, 5.0), (720, 6.0)], events)
        self.assertIsNone(ic_headline_block(price_ic_blocks(blocks)))


class WindowSplitTest(unittest.TestCase):
    """The blocks' 90-day span must not leak into the request-windowed arms (#518).

    `analyze()` now builds a SECOND printed-low list over the block window. If that list
    were handed to basal or ISF as well, a 60-day-old low would silently start gating a
    30-day basal read — a defect, not a detail (ADR 518 decision 10).
    """

    def _result(self, window_days, *, old_low=False):
        """A 120-day fixture; ``old_low`` plants a low 60 days back.

        60 days is INSIDE the blocks' fixed 90-day span and OUTSIDE a 30-day request
        window, so it is the one event that can prove the two spans are really
        separate lists rather than the same list read twice.
        """
        from ciq_autotune.analyze import analyze
        from ciq_autotune.settings import parse_pump_settings
        from tests.test_analyzer_ic import _FakeAnalyzeStore, _raw_settings
        from ciq_autotune.settings import Snapshot
        from ciq_autotune.events import CgmReading

        now = datetime(2026, 6, 1)
        cgm, bolus = [], []
        for d in range(120):
            t0 = now - timedelta(days=120 - d)
            bolus.append(BolusEvent(t=t0 + timedelta(hours=9), insulin=15.0,
                                    carbs=60.0, carb_ratio=6.0, completion="Completed"))
            deep = old_low and d == 60
            for k in range(288):
                t = t0 + timedelta(minutes=5 * k)
                bg = 120.0
                # a real printed low two hours after that day's meal
                if deep and 132 <= k <= 144:
                    bg = 54.0
                cgm.append(CgmReading(t=t, bg=bg, type="EGV"))
        snapshot = Snapshot(now - timedelta(days=200),
                            parse_pump_settings(_raw_settings(isf=50, cr_mu=6000)))
        store = _FakeAnalyzeStore(basal=[], cgm=cgm, bolus=bolus,
                                  snapshots=[snapshot])
        return analyze(store, window_days=window_days, now=now)

    def test_blocks_read_ninety_days_while_the_rest_reads_the_request_window(self):
        res = self._result(window_days=30)
        self.assertEqual(res.window_days, 30)
        # The pump-lane segment rows are request-windowed; the blocks are not.
        seg_meals = sum(int((r.evidence or {}).get("n_meals") or 0) for r in res.ic)
        block_meals = sum(b.n_meals for b in res.ic_blocks)
        self.assertGreater(block_meals, seg_meals)
        self.assertLessEqual(block_meals, BLOCK_WINDOW_DAYS)

    def test_a_low_only_the_block_window_can_see_never_reaches_basal_or_isf(self):
        # The real hazard of the second harm list: a 60-day-old low is inside the
        # blocks' 90-day span and outside the 30-day request window. It must change
        # the I:C side and leave basal/ISF byte-identical — if the two arms shared a
        # list, this low would start gating a 30-day basal read.
        quiet = self._result(window_days=30)
        with_low = self._result(window_days=30, old_low=True)

        self.assertEqual([r.to_dict() for r in quiet.basal],
                         [r.to_dict() for r in with_low.basal])
        self.assertEqual([r.to_dict() for r in quiet.isf],
                         [r.to_dict() for r in with_low.isf])

        # ...and the low really is visible to the block side, or this proves nothing.
        def ic_harm_days(res):
            return sum(int((b.harm or {}).get("arm_days") or 0) for b in res.ic_blocks)

        self.assertGreater(ic_harm_days(with_low), ic_harm_days(quiet))
        self.assertGreater(BLOCK_WINDOW_DAYS, quiet.window_days)

    def test_ic_runs_is_one_whole_day_total_not_a_sum_over_blocks(self):
        res = self._result(window_days=30)
        self.assertIsInstance(res.ic_runs, int)
        self.assertGreaterEqual(res.ic_runs, max((b.n_runs for b in res.ic_blocks),
                                                 default=0))
        self.assertEqual(res.to_dict()["ic_runs"], res.ic_runs)


class CarbCountingGateUnitTest(unittest.TestCase):
    """The whole-day carb-counting finding gates on `min_runs`, not `min_meals` (D2).

    The two configs are deliberately set far apart so the assertion cannot pass by
    coincidence: whichever constant the code reads, only one of these outcomes is
    possible.
    """

    def _findings(self, cfg):
        from ciq_autotune.analyzers.ic import analyze_ic
        # deliberately scattered implied ratios -> a wide whole-day band
        doses = [6.0, 20.0, 9.0, 30.0, 7.0, 24.0, 11.0, 18.0]
        events = [meal(d, 12, 60, dose) for d, dose in enumerate(doses)]
        _rows, findings = analyze_ic(events, [(0, 5.0)], config=cfg)
        return {f.detector for f in findings}

    def test_fires_on_min_runs_even_when_min_meals_is_unreachable(self):
        cfg = IcConfig(min_meals=99, min_runs=3)
        self.assertIn("carb-counting", self._findings(cfg))

    def test_held_by_min_runs_even_when_min_meals_is_trivially_met(self):
        cfg = IcConfig(min_meals=1, min_runs=99)
        self.assertNotIn("carb-counting", self._findings(cfg))


class BasalWindowIndexDifferentialTest(unittest.TestCase):
    """The bisect optimisation must be value-identical to the full scan it replaced.

    The meal ledger used to scan every basal event for every meal window; it now sorts
    once and bisects. That is a pure performance change, so a randomized fixture —
    long and short deliveries, unsorted input, windows that start before and end after
    events — must produce byte-identical micro-doses either way.
    """

    def test_indexed_lookup_equals_the_full_scan_on_random_windows(self):
        import random
        from ciq_autotune.analyzers.ic import (
            _BasalWindowIndex, _ciq_basal_delta_doses)
        from ciq_autotune.events import BasalEvent

        rng = random.Random(518)
        events = []
        t = BASE
        for _ in range(600):
            dur = rng.choice([5, 5, 5, 30, 120, 360])   # incl. events wider than a window
            events.append(BasalEvent(
                t=t, delivery_type="algorithmDelivery", duration_mins=dur,
                basal_rate=round(rng.uniform(0.0, 1.4), 3), profile_basal_rate=0.6))
            t += timedelta(minutes=rng.choice([5, 5, 10, 45]))
        rng.shuffle(events)                              # input order must not matter
        index = _BasalWindowIndex(events)

        for _ in range(200):
            t0 = BASE + timedelta(minutes=rng.randrange(0, 6000))
            t1 = t0 + timedelta(minutes=rng.choice([5, 60, 315, 900]))
            # Compared as SETS of micro-doses: the index returns them time-ordered
            # and the raw scan in input order, and every consumer sums them
            # (`_acted_signed`, the delta total), so order is not part of the value.
            self.assertEqual(sorted(_ciq_basal_delta_doses(index, t0, t1)),
                             sorted(_ciq_basal_delta_doses(events, t0, t1)))

    def test_the_run_ledger_itself_is_unchanged_by_indexing(self):
        # End to end: the same runs, through the same analyzer, with the basal feed
        # shuffled — the ledger numbers must not move.
        import random
        from ciq_autotune.analyzers.ic import run_burdens
        from ciq_autotune.events import BasalEvent

        rng = random.Random(4242)
        basal = []
        t = BASE
        for _ in range(2000):
            basal.append(BasalEvent(
                t=t, delivery_type="algorithmDelivery", duration_mins=5,
                basal_rate=round(rng.uniform(0.0, 1.2), 3), profile_basal_rate=0.6))
            t += timedelta(minutes=5)
        events = [meal(d, 9, 60, 15.0) for d in range(6)]
        ordered = run_burdens(events, IcConfig(), basal_events=basal)
        shuffled_basal = basal[:]
        rng.shuffle(shuffled_basal)
        shuffled = run_burdens(events, IcConfig(), basal_events=shuffled_basal)
        self.assertEqual([r.true_ic for r in ordered], [r.true_ic for r in shuffled])
        self.assertEqual([r.ciq_basal_delta_u for r in ordered],
                         [r.ciq_basal_delta_u for r in shuffled])


class DeriveOnReadFallbackTest(unittest.TestCase):
    """report/render derive the consolidated profile when a producer didn't fill it.

    Those fallbacks have the result's blocks but NOT the programmed schedule, so a
    block's recommendation written there would have no restoring boundary after it —
    a 07:00–12:00 move would render as running to midnight. They are therefore
    carry-forward-only for carb ratio, which with no programmed schedule means the
    I:C column is simply absent.
    """

    def _result(self):
        from ciq_autotune.render import _consolidated as render_prof
        from ciq_autotune.report import _consolidated_profile as report_prof
        from ciq_autotune.result import AnalysisResult, DataQuality, Span, SlotEstimate
        from ciq_autotune.uncertainty import Estimate

        events = [meal(d, 9, 60, 15.0, ratio=5.0) for d in range(12)]
        blocks, _ = blocks_for([(0, 5.0), (720, 6.0)], events)
        headline = ic_headline_block(price_ic_blocks(blocks))
        self.assertIsNotNone(headline)
        self.assertLess(headline.recommended, 5.0)
        slots = [SlotEstimate(slot=i, label="x", current=0.6,
                              estimate=Estimate(0.6, 0.55, 0.65, 5, 0.8, "m"),
                              recommended=0.6, annotation="", days=5)
                 for i in range(48)]
        result = AnalysisResult(
            schema_version=8, generated_at="2026-06-01 00:00:00", window_days=30,
            span=Span(None, None), epochs=[],
            data_quality=DataQuality(counts={}, notes=[]),
            basal=slots, isf=[], ic=[], behavioral=[],
            consolidated_basal=None, ic_blocks=blocks,
        )
        return result, headline, report_prof, render_prof

    def test_neither_fallback_writes_an_unbounded_block_recommendation(self):
        result, headline, report_prof, render_prof = self._result()
        for name, derive in (("report", report_prof), ("render", render_prof)):
            prof = derive(result)
            values = [s.carb_ratio for s in prof.segments]
            with self.subTest(surface=name):
                # the recommendation never appears — there is no boundary to end it
                self.assertNotIn(headline.recommended, values, name)
                # and nothing is invented in its place
                self.assertTrue(all(v is None for v in values), name)

    def test_the_primary_path_does_bound_it(self):
        # The contrast that makes the fallback's silence a choice rather than a bug:
        # given the programmed schedule, the same block IS delivered — and it stops
        # exactly at its own end.
        _result, headline, _rp, _rd = self._result()
        from ciq_autotune.analyzers.basal import consolidate_profile
        from ciq_autotune.result import SlotEstimate
        from ciq_autotune.uncertainty import Estimate
        slots = [SlotEstimate(slot=i, label="x", current=0.6,
                              estimate=Estimate(0.6, 0.55, 0.65, 5, 0.8, "m"),
                              recommended=0.6, annotation="", days=5)
                 for i in range(48)]
        prof = consolidate_profile(slots, carb_ratio=headline,
                                   programmed_ic=[(0, 5.0), (720, 6.0)])
        by_start = {s.start_min: s.carb_ratio for s in prof.segments}
        self.assertEqual(by_start[0], headline.recommended)
        self.assertEqual(by_start[720], 6.0)          # restored at the block's end


if __name__ == "__main__":
    unittest.main()
