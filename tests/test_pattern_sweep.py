"""Public-interface tests for the pattern sweep engine (#378).

Every test drives the sweep through its public surface — the ``sweep`` payload, the
store's approve/dismiss round-trip, and the HTTP endpoints — on synthetic fixtures.
The real-snapshot grounding numbers live in the PR body; here we pin the behaviour the
contract turns on: Sunday and late-evening meals surface as *tracked* (signal, not
cleared), the bar tightens with grammar size, evidence is era-bounded, a cleared cell
waits for human sign-off, and no user-facing string carries a dosing or causal claim.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
import tempfile
import unittest
from pathlib import Path

from ciq_autotune import pattern_sweep as ps
from ciq_autotune.pattern_sweep import (
    ALPHA, FOOTNOTE, fisher_exact_two_sided, sweep,
)
from ciq_autotune.store import Store


def _cgm(dt: datetime, bg: float) -> SimpleNamespace:
    return SimpleNamespace(t=dt, bg=bg)


def _bolus(dt: datetime, carbs: float) -> SimpleNamespace:
    return SimpleNamespace(t=dt, carbs=carbs)


def _pump(dt: datetime, event_type: str) -> SimpleNamespace:
    return SimpleNamespace(t=dt, event_type=event_type)


def _day_readings(day: date, low_at=()):
    """A day's readings: 48 normal readings 00:00–03:55 (enough to make both the whole
    day and the 00:00–06:00 overnight window eligible) plus a sub-70 low at each hour in
    ``low_at`` (used to place the low in specific blocks)."""
    base = datetime.combine(day, time())
    rows = [_cgm(base + timedelta(minutes=5 * i), 110.0) for i in range(48)]
    rows.extend(_cgm(base + timedelta(hours=h), 60.0) for h in low_at)
    return rows


def _cell(payload, cid):
    return next((c for c in payload["cells"] if c["id"] == cid), None)


class SundayTrackedTest(unittest.TestCase):
    """The Sunday-lows candidate: real signal, fails only on evidence volume → tracked.

    Mirrors the #364 grounding fixture: 150 days, 17 of 22 Sundays low, 71 of 128 other
    days low. The generated ``low__full__dow-6`` cell must reproduce those counts, pass
    every confound gate, fail the day-level significance bar (its interval still spans
    zero), and land as *tracked* — never *ready*."""

    def _payload(self):
        first_sunday = date(2026, 1, 4)  # a Sunday
        days = [first_sunday + timedelta(days=o) for o in range(150)]
        first_half, second_half = days[:75], days[75:]
        f_sun = [d for d in first_half if d.weekday() == 6]
        s_sun = [d for d in second_half if d.weekday() == 6]
        f_oth = [d for d in first_half if d.weekday() != 6]
        s_oth = [d for d in second_half if d.weekday() != 6]
        low_days = set(f_sun[:9] + s_sun[:8] + f_oth[:35] + s_oth[:36])
        cgm = []
        for d in days:
            cgm.extend(_day_readings(d, low_at=(13, 19) if d in low_days else ()))
        return sweep(cgm, [], [], era_start=days[0],
                     generated_at=datetime(2026, 6, 1, 12, 0))

    def test_sunday_reproduces_the_reference_split_and_tracks(self):
        payload = self._payload()
        cell = _cell(payload, "low__full__dow-6")
        self.assertIsNotNone(cell, "the grammar must generate the Sunday cell")
        self.assertEqual(cell["in_group"], {"events": 17, "n": 22})
        self.assertEqual(cell["out_group"], {"events": 71, "n": 128})
        # Every confound gate passes; the day-level signal does not (CI spans zero).
        self.assertTrue(all(g["passed"] for g in cell["gates"].values()))
        self.assertFalse(cell["day_level_signal"]["passed"])
        self.assertEqual(cell["verdict"], "tracked")
        self.assertIn("low__full__dow-6", payload["tracked"])
        # A tracked candidate never self-publishes: it is not in the ready queue.
        self.assertNotIn("low__full__dow-6", payload["ready_for_review"])
        self.assertNotIn("low__full__dow-6", payload["approved"])


class LateEveningMealsTrackedTest(unittest.TestCase):
    """Late-evening meals → 00:00–06:00 lows: day-level excess but an *emerging* split.

    The exposed nights carry more overnight lows, but the effect is concentrated in the
    recent half (the widening-split signature), so stability is not met and the cell
    tracks rather than clears."""

    def test_late_meal_exposure_tracks_on_a_widening_split(self):
        first = date(2026, 1, 5)
        days = [first + timedelta(days=o) for o in range(120)]
        cgm, bolus = [], []
        for i, d in enumerate(days):
            # A late-evening carb bolus the prior night marks this day as exposed.
            exposed = i % 2 == 0
            if exposed:
                prev = datetime.combine(d - timedelta(days=1), time(21, 0))
                bolus.append(_bolus(prev, 30.0))
            # Overnight low rate: exposed nights low ~half the time but almost all of
            # that lands in the recent half — a widening split, not a steady effect.
            recent = i >= 60
            low = exposed and (recent or i % 6 == 0)
            cgm.extend(_day_readings(d, low_at=(3,) if low else ()))
        payload = sweep(cgm, bolus, [], era_start=days[0],
                        generated_at=datetime(2026, 6, 1, 12, 0))
        cell = _cell(payload, "low__overnight__late-meal")
        self.assertIsNotNone(cell)
        self.assertGreater(cell["risk_difference_pct"], 0.0)
        self.assertFalse(cell["gates"]["stability"]["passed"])
        self.assertEqual(cell["verdict"], "tracked")
        self.assertNotIn(cell["id"], payload["ready_for_review"])


def _full_day(day: date, lows=(), highs=()):
    """A day with full 5-minute CGM coverage (so every window and the clock family is
    eligible), plus a sub-70 reading at each hour in ``lows`` and a >250 reading at each
    hour in ``highs``."""
    base = datetime.combine(day, time())
    rows = [_cgm(base + timedelta(minutes=5 * i), 110.0) for i in range(288)]
    rows.extend(_cgm(base + timedelta(hours=h, minutes=1), 60.0) for h in lows)
    rows.extend(_cgm(base + timedelta(hours=h, minutes=2), 260.0) for h in highs)
    return rows


class GrammarGeneratesAllSixReferenceCandidatesTest(unittest.TestCase):
    """The whole point of the sweep: the six #364 hand candidates are *generated* by the
    grammar, not hand-listed, and each is priced through the one gate (adr-365-swept §3,
    CONTEXT.md "Pattern sweep"). The two near-misses track; the other four die.

    The four non-tracked reference candidates map to generated cells that carry the
    reference *shapes* (not day-rate reframings): the suspend cell anchors on suspend
    clusters with a three-hour follow-up, the post-low cell scores rebounds against
    time-matched non-low control days, and the site cell measures site-life drift.
      overnight-low clustering  -> low__earlyam__clock   (a low clusters in 02–05h?)
      post-low rebound          -> high__postlow__follow (a high within 3h of a low?)
      user-suspend follow-ups   -> high__suspend__follow (a high within 3h of a suspend?)
      reactive site changes     -> high__site__life      (glucose drifts over site life?)
    Here we give the grammar data where all four lack a real excess, and assert the
    sweep generates every one and kills it — nothing self-publishes."""

    def _payload(self):
        first_sunday = date(2026, 1, 4)
        days = [first_sunday + timedelta(days=o) for o in range(49)]
        cgm, bolus, pump = [], [], []
        for i, d in enumerate(days):
            # Lows land in the afternoon/evening, never 02–05h, so a low never clusters
            # early-morning (the overnight-clustering candidate has no excess).
            lows = (13, 19) if i % 3 == 0 else ()
            cgm.extend(_full_day(d, lows=lows))
            # A late-evening carb bolus every fourth night marks the next day exposed.
            if i % 4 == 0:
                bolus.append(_bolus(datetime.combine(d, time(21, 0)), 30.0))
            # A fresh site every seventh day (populates fresh- and stale-site days).
            if i % 7 == 0:
                pump.append(_pump(datetime.combine(d, time(9, 0)),
                                  "Site/Cartridge Change"))
            # A pump suspend every fifth day.
            if i % 5 == 0:
                pump.append(_pump(datetime.combine(d, time(15, 0)), "User Suspended"))
        return sweep(cgm, bolus, pump, era_start=days[0],
                     generated_at=datetime(2026, 6, 1, 12, 0))

    def test_all_six_reference_candidates_are_generated_and_none_self_publish(self):
        payload = self._payload()
        by_id = {c["id"]: c for c in payload["cells"]}
        six = {
            "low__earlyam__clock": "killed",       # overnight-low clustering
            "low__full__dow-6": None,              # Sunday lows (tracked elsewhere)
            "low__overnight__late-meal": None,     # late-evening meals (tracked elsewhere)
            "high__postlow__follow": "killed",     # post-low rebound
            "high__suspend__follow": "killed",     # user-suspend follow-ups
            "high__site__life": "killed",          # reactive site changes
        }
        for cid, expected in six.items():
            self.assertIn(cid, by_id, f"the grammar must generate {cid}")
            self.assertNotIn(cid, payload["ready_for_review"],
                             f"{cid} must never self-publish")
            if expected is not None:
                self.assertEqual(by_id[cid]["verdict"], expected,
                                 f"{cid} should be {expected}")
        # The multiplicity denominator is the whole closed family, fixed by the grammar.
        self.assertEqual(payload["cells_swept"], len(ps.GRAMMAR_CELLS))

    def test_every_cell_gets_one_of_exactly_three_verdicts(self):
        # The contract: exactly three outcomes per cell — killed, tracked, or ready — and
        # every cell priced through the identical gate, none silently dropped. A cell
        # whose in-group has no eligible days this era (an empty arm) has no excess to
        # establish, so the gate *kills* it — it is not a fourth 'insufficient' outcome,
        # but it is still carried in the payload with gate evidence and still counted in
        # the multiplicity denominator so the bar cannot loosen as data thins.
        # A short weekday-only stretch leaves several partitions (weekend, most days of
        # the week, sites, suspends) with an empty arm.
        first_monday = date(2026, 1, 5)
        days = [first_monday + timedelta(days=o) for o in range(3)]  # Mon, Tue, Wed
        cgm = []
        for d in days:
            cgm.extend(_full_day(d, lows=(13,)))
        payload = sweep(cgm, [], [], era_start=days[0],
                        generated_at=datetime(2026, 6, 1, 12, 0))
        # Only ever three verdicts, and every enumerated cell carries one of them.
        verdicts = {c["verdict"] for c in payload["cells"]}
        self.assertTrue(verdicts <= {"killed", "tracked", "ready"}, verdicts)
        self.assertEqual(len(payload["cells"]), len(ps.GRAMMAR_CELLS))
        # The bar is still divided by the whole family, even though most cells are
        # untestable this window (an empty arm still counts as a hypothesis).
        self.assertEqual(payload["cells_swept"], len(ps.GRAMMAR_CELLS))
        self.assertLess(payload["cells_testable"], payload["cells_swept"])
        # An empty-arm cell (e.g. weekends — none of Mon/Tue/Wed) comes back killed with
        # gate evidence, and never enters the tracked or ready sets.
        weekend = _cell(payload, "low__full__weekend")
        self.assertIsNotNone(weekend)
        self.assertEqual(weekend["in_group"]["n"], 0)
        self.assertEqual(weekend["verdict"], "killed")
        self.assertTrue(weekend["day_level_signal"]["evidence"])
        self.assertEqual(set(weekend["gates"]),
                         {"selection", "carryover", "time_of_day_balance", "stability"})
        self.assertNotIn("low__full__weekend", payload["tracked"])
        self.assertNotIn("low__full__weekend", payload["ready_for_review"])


class MultiplicityTighteningTest(unittest.TestCase):
    """The significance bar tightens with the grammar's size.

    A cell whose effect clears the *uncorrected* p<0.05 day-level bar must fail once the
    bar is tightened across the full swept family, so a wide sweep cannot fish. We build
    a Sunday effect sized to land between the corrected and uncorrected bars and assert
    the sweep tracks it — with every other gate (including stability) passing, so the
    *only* thing holding it out of the ready queue is the multiplicity correction."""

    def test_uncorrected_winner_fails_the_swept_family_bar(self):
        first_sunday = date(2026, 1, 4)
        days = [first_sunday + timedelta(days=o) for o in range(77)]
        sundays = [d for d in days if d.weekday() == 6]
        others = [d for d in days if d.weekday() != 6]
        # 9 of 11 Sundays low; 26 of 66 other days low → Fisher p ≈ 0.019 (clears
        # uncorrected) but well above the ~0.0007 grammar-corrected bar. Both groups'
        # lows are spread evenly across the record so the effect is stable across halves
        # (isolating multiplicity, not stability, as the reason it fails to clear).
        low_sun = {sundays[i] for i in range(len(sundays)) if i not in (3, 8)}
        low_oth = {others[round(i * (len(others) - 1) / 25)] for i in range(26)}
        cgm = []
        for d in days:
            low = d in low_sun or d in low_oth
            cgm.extend(_day_readings(d, low_at=(13, 19) if low else ()))
        payload = sweep(cgm, [], [], era_start=days[0],
                        generated_at=datetime(2026, 6, 1, 12, 0))
        cell = _cell(payload, "low__full__dow-6")
        a, n = cell["in_group"]["events"], cell["in_group"]["n"]
        b, m = cell["out_group"]["events"], cell["out_group"]["n"]

        # Uncorrected, this cell would clear.
        self.assertLess(fisher_exact_two_sided(a, n, b, m), ALPHA)
        # The swept-family bar is tighter than 0.05 and rejects it.
        self.assertLess(cell["alpha_corrected"], ALPHA)
        self.assertGreaterEqual(cell["fisher_exact_two_sided_p"], cell["alpha_corrected"])
        # Confounds and stability all pass — only the corrected bar keeps it tracked.
        self.assertTrue(all(g["passed"] for g in cell["gates"].values()))
        self.assertEqual(cell["verdict"], "tracked")
        self.assertNotIn(cell["id"], payload["ready_for_review"])


class EraBoundingTest(unittest.TestCase):
    """Evidence restarts at the most recent era boundary; old-era data never rescues.

    A strong Sunday effect sits entirely before a long data gap; the recent era alone
    carries no signal. Priced across the whole record (borrowing the pre-gap era) the
    cell clears; era-bounded to the recent side it does not."""

    def _build(self):
        pre = [date(2025, 1, 5) + timedelta(days=o) for o in range(84)]  # 12 Sundays
        gap_days = 40
        post_start = pre[-1] + timedelta(days=gap_days)
        post = [post_start + timedelta(days=o) for o in range(28)]  # 4 Sundays
        cgm = []
        # Pre-gap: every Sunday low, almost no other day low → a clean, strong effect.
        for d in pre:
            low = d.weekday() == 6 or (d.weekday() == 2 and (d - pre[0]).days % 21 == 0)
            cgm.extend(_day_readings(d, low_at=(13, 19) if low else ()))
        # Recent era: no day-of-week structure at all.
        for i, d in enumerate(post):
            cgm.extend(_day_readings(d, low_at=(13,) if i % 3 == 0 else ()))
        return cgm, pre[0], post_start

    def test_pre_boundary_data_would_clear_but_era_bounding_blocks_it(self):
        cgm, first_day, post_start = self._build()
        # Borrowing the pre-gap era (unbounded): the Sunday cell clears.
        borrowed = sweep(cgm, [], [], era_start=first_day,
                         generated_at=datetime(2026, 6, 1, 12, 0))
        self.assertIn("low__full__dow-6", borrowed["ready_for_review"])

        # Era-bounded (boundary derived from the ≥14-day gap): recent era alone, so the
        # cell does not clear.
        bounded = sweep(cgm, [], [], generated_at=datetime(2026, 6, 1, 12, 0))
        self.assertEqual(bounded["era_start"], post_start.isoformat())
        self.assertNotIn("low__full__dow-6", bounded["ready_for_review"])


class StabilityHalvesOverObservedDaysTest(unittest.TestCase):
    """Stability splits the era's *observed* days in half — not the cell's eligible
    subset (adr-364: "first 75 vs last 75 observed days"). If a sub-day window only
    became coverable partway through the record, splitting the eligible subset would
    manufacture two positive halves out of the recent stretch alone and wrongly call the
    effect stable. Splitting observed days puts the early, coverage-thin stretch in the
    first half where the effect is (correctly) absent, so the cell stays tracked."""

    def _sparse_day(self, day):
        # Full-day-eligible (a handful of readings) but NOT overnight-eligible: only 10
        # readings, all before 01:00, well under the 00:00–06:00 coverage floor.
        base = datetime.combine(day, time())
        return [_cgm(base + timedelta(minutes=5 * i), 110.0) for i in range(10)]

    def test_early_uncoverable_stretch_lands_in_the_first_half(self):
        first = date(2026, 1, 3)  # a Saturday
        days = [first + timedelta(days=o) for o in range(40)]
        cgm = []
        for i, d in enumerate(days):
            if i < 20:
                cgm.extend(self._sparse_day(d))            # overnight not coverable yet
            else:
                low = (3,) if d.weekday() >= 5 else ()      # weekends run low overnight
                cgm.extend(_day_readings(d, low_at=low))
        payload = sweep(cgm, [], [], era_start=days[0],
                        generated_at=datetime(2026, 6, 1, 12, 0))
        cell = _cell(payload, "low__overnight__weekend")
        self.assertIsNotNone(cell)
        # The excess is real and confound-clean, but concentrated entirely in the recent,
        # coverable half — so stability is not met and the cell tracks (never ready).
        # Splitting the *eligible* subset instead would have found two positive halves
        # and wrongly cleared stability.
        self.assertGreater(cell["risk_difference_pct"], 0.0)
        self.assertFalse(cell["gates"]["stability"]["passed"])
        self.assertNotIn(cell["id"], payload["ready_for_review"])


class EraDetectionRegimeChangeTest(unittest.TestCase):
    """The era boundary restarts at a settings regime change, and it recognises a
    deliberate *within-profile* basal/dose edit — not only a profile switch. A cosmetic
    switch to an identical duplicate profile is not a regime change and must not cut the
    era short (that would let a bookkeeping switch strand recent evidence)."""

    @staticmethod
    def _profile(idp, basal):
        from ciq_autotune.settings import ProfileSegment, ProfileSettings
        seg = ProfileSegment(start_min=0, basal_rate=basal, isf=50,
                             carb_ratio=10.0, target_bg=110)
        return ProfileSettings(idp=idp, name=f"p{idp}", dia_min=300,
                               carb_entry=True, max_bolus=10.0, segments=(seg,))

    def _snap(self, when, active_idp, profiles):
        from ciq_autotune.settings import PumpSettings, Snapshot
        return Snapshot(captured_at=when, settings=PumpSettings(
            active_idp=active_idp, profiles=profiles))

    def _cgm_40_days(self, first):
        days = [first + timedelta(days=o) for o in range(40)]
        cgm = []
        for d in days:
            cgm.extend(_day_readings(d, low_at=(3,)))
        return cgm, days

    def test_within_profile_basal_edit_is_a_regime_boundary(self):
        first = date(2026, 1, 5)
        cgm, days = self._cgm_40_days(first)
        edit_day = days[20]
        snaps = [
            self._snap(datetime.combine(days[2], time(9)), 1, (self._profile(1, 1.0),)),
            self._snap(datetime.combine(edit_day, time(9)), 1, (self._profile(1, 1.2),)),
        ]
        payload = sweep(cgm, [], [], settings_snapshots=snaps,
                        generated_at=datetime(2026, 6, 1, 12, 0))
        self.assertEqual(payload["era_start"], edit_day.isoformat())

    def test_cosmetic_profile_switch_is_not_a_regime_boundary(self):
        first = date(2026, 1, 5)
        cgm, days = self._cgm_40_days(first)
        # active profile flips 1 -> 2, but profile 2 is an identical duplicate.
        profiles = (self._profile(1, 1.0), self._profile(2, 1.0))
        snaps = [
            self._snap(datetime.combine(days[2], time(9)), 1, profiles),
            self._snap(datetime.combine(days[20], time(9)), 2, profiles),
        ]
        payload = sweep(cgm, [], [], settings_snapshots=snaps,
                        generated_at=datetime(2026, 6, 1, 12, 0))
        # No real change and no data gap -> the whole record is one era.
        self.assertIsNone(payload["era_start"])

    def test_real_profile_switch_is_a_regime_boundary(self):
        first = date(2026, 1, 5)
        cgm, days = self._cgm_40_days(first)
        switch_day = days[20]
        profiles = (self._profile(1, 1.0), self._profile(2, 1.5))
        snaps = [
            self._snap(datetime.combine(days[2], time(9)), 1, profiles),
            self._snap(datetime.combine(switch_day, time(9)), 2, profiles),
        ]
        payload = sweep(cgm, [], [], settings_snapshots=snaps,
                        generated_at=datetime(2026, 6, 1, 12, 0))
        self.assertEqual(payload["era_start"], switch_day.isoformat())


class ReadyQueueSignOffTest(unittest.TestCase):
    """A cleared cell waits in the ready queue; nothing ships without the approve call,
    and approve/dismiss persist across a store reopen."""

    def _cleared_payload(self, reviews=None):
        # A strong, stable, confound-clean Sunday effect that clears even the corrected
        # bar: every Sunday low, hardly any other day low, across both halves.
        first_sunday = date(2026, 1, 4)
        days = [first_sunday + timedelta(days=o) for o in range(140)]
        cgm = []
        for i, d in enumerate(days):
            low = d.weekday() == 6 or (d.weekday() == 3 and i % 28 == 0)
            cgm.extend(_day_readings(d, low_at=(13, 19) if low else ()))
        return sweep(cgm, [], [], era_start=days[0], reviews=reviews,
                     generated_at=datetime(2026, 6, 1, 12, 0))

    def test_cleared_cell_queues_and_never_self_publishes(self):
        payload = self._cleared_payload()
        self.assertIn("low__full__dow-6", payload["ready_for_review"])
        self.assertEqual(payload["approved"], [])

    def test_approve_and_dismiss_round_trip_and_persist(self):
        with tempfile.TemporaryDirectory() as td:
            db = str(Path(td) / "ciq.db")
            with Store.open(db) as store:
                store.record_pattern_review(cell_id="low__full__dow-6",
                                            era_start="2026-01-04", decision="approved")
                store.record_pattern_review(cell_id="low__overnight__dow-6",
                                            era_start="2026-01-04", decision="dismissed")
            # Reopen: the human decisions survive.
            with Store.open(db) as store:
                reviews = store.pattern_reviews("2026-01-04")
            self.assertEqual(reviews["low__full__dow-6"]["decision"], "approved")
            self.assertEqual(reviews["low__overnight__dow-6"]["decision"], "dismissed")

        # An approved cell moves out of the ready queue into ``approved``; a dismissed
        # one drops out entirely.
        approved = self._cleared_payload(
            reviews={"low__full__dow-6": {"decision": "approved"}})
        self.assertNotIn("low__full__dow-6", approved["ready_for_review"])
        self.assertIn("low__full__dow-6", approved["approved"])

        dismissed = self._cleared_payload(
            reviews={"low__full__dow-6": {"decision": "dismissed"}})
        self.assertNotIn("low__full__dow-6", dismissed["ready_for_review"])
        self.assertNotIn("low__full__dow-6", dismissed["approved"])


class ClockCellIsDayLevelNotBlockPooledTest(unittest.TestCase):
    """A clock cell's comparison arm is **day-level and paired** — one observation per
    day (the window versus one comparable block of the same day), never the many
    day×block observations the old engine pooled as if independent (#378 finding 2).

    The regression this pins: the comparison denominator must equal the window
    denominator (a paired unit) and can never exceed the observed days. The old bug
    reported the comparison arm as ``days × comparison-block-count`` (e.g. 92/843 against
    a 143-day window), which understated uncertainty and could wrongly promote a cell."""

    def test_clock_comparison_denominator_does_not_multiply_days_by_blocks(self):
        first = date(2026, 1, 5)
        days = [first + timedelta(days=o) for o in range(40)]
        cgm = []
        for i, d in enumerate(days):
            # A low clusters in 02:00–05:00 on some days; full coverage means the day has
            # six comparable three-hour blocks, so a block-pooled arm would be ~6× the
            # days. The paired arm must stay at the day count.
            cgm.extend(_full_day(d, lows=(3,) if i % 2 == 0 else ()))
        payload = sweep(cgm, [], [], era_start=days[0],
                        generated_at=datetime(2026, 6, 1, 12, 0))
        cell = _cell(payload, "low__earlyam__clock")
        self.assertIsNotNone(cell)
        in_n = cell["in_group"]["n"]
        out_n = cell["out_group"]["n"]
        observed = payload["snapshot"]["observed_days"]
        # Paired: the comparison arm has exactly the window arm's denominator.
        self.assertEqual(out_n, in_n)
        # And it can never be the days×block-count pool the old engine reported.
        self.assertLessEqual(out_n, observed)
        # The 02:00–05:00 window has five other three-hour blocks; a pooled arm would be
        # several times the days. Guard against any such multiplication explicitly.
        self.assertLess(out_n, observed * 2)


class EmptyReportingWindowStillCarriesEveryCellTest(unittest.TestCase):
    """An empty reporting window must not bypass enumeration (#378 finding 3).

    ``sweep([], [], [])`` reports ``cells_swept`` for the whole grammar, so it must also
    *return* every one of those cells — each carried as killed with gate evidence (an
    empty arm has no excess to establish), counted in the multiplicity denominator,
    never a bare ``cells: []`` behind a non-zero swept count."""

    def test_empty_window_returns_every_grammar_cell_killed(self):
        payload = sweep([], [], [], generated_at=datetime(2026, 6, 1, 12, 0))
        # Swept count and returned count are the whole closed family — no silent drop.
        self.assertEqual(payload["cells_swept"], len(ps.GRAMMAR_CELLS))
        self.assertEqual(len(payload["cells"]), len(ps.GRAMMAR_CELLS))
        returned = {c["id"] for c in payload["cells"]}
        self.assertEqual(returned, {spec.id for spec in ps.GRAMMAR_CELLS})
        # Every cell is killed, with gate evidence and the four named gates.
        for cell in payload["cells"]:
            self.assertEqual(cell["verdict"], "killed")
            self.assertTrue(cell["day_level_signal"]["evidence"])
            self.assertEqual(set(cell["gates"]),
                             {"selection", "carryover", "time_of_day_balance", "stability"})
        # Nothing tracked, nothing queued, nothing approved; the footnote is the only
        # user-facing string.
        self.assertEqual(payload["tracked"], [])
        self.assertEqual(payload["ready_for_review"], [])
        self.assertEqual(payload["approved"], [])
        self.assertEqual(payload["cells_testable"], 0)
        self.assertEqual(payload["footnote"], FOOTNOTE)


class FootnoteAndNoAdviceTest(unittest.TestCase):
    def test_footnote_exact_when_queue_empty(self):
        payload = sweep([_cgm(datetime(2026, 1, 1, 2, 0), 110.0)], [], [],
                        era_start=date(2026, 1, 1))
        self.assertEqual(payload["ready_for_review"], [])
        self.assertEqual(payload["footnote"], FOOTNOTE)
        self.assertEqual(
            payload["footnote"],
            "Pattern sweep: nothing recurring in your data has cleared the evidence "
            "bar this window.",
        )

    def test_no_dosing_or_causal_claim_in_user_facing_strings(self):
        # The footnote is the only always-on user-facing string. It must carry no
        # dosing verb or causal claim.
        banned = ("basal", "bolus", "insulin", "dose", "reduce", "increase", "lower",
                  "raise", "unit", "u/", "because", "causes", "caused by")
        text = FOOTNOTE.lower()
        for term in banned:
            self.assertNotIn(term, text)


if __name__ == "__main__":
    unittest.main()
