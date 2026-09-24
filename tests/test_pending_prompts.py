"""Pending carb-log prompt queue tests (#128, slice 4/4).

Covers the two halves of the seam:

* :func:`build_candidates` — reuse of the existing detection: a matched
  ``missed-meal`` rise and every sub-70 low become one prompt each; near-lows
  (71–75) and un-matched rises do not; and a High that an over-treated low's
  rebound owns in the shared evaluation raises no missed-meal prompt (ADR 448).
* :func:`pending_prompts` — the answered-match (with anchor tolerance across a
  recomputation drift), the 7-day expiry (silent drop), and the oldest-first
  display cap. All exercised across the seam with plain data.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.classifiers import classify_missed_meal
from ciq_autotune.analyzers.scenario import Lever, LowPromptAnswer, evaluate
from ciq_autotune.events import BolusEvent, CarbEntry, CgmReading, format_t
from ciq_autotune.pending_prompts import (
    ANCHOR_TOLERANCE,
    ANSWERED_GRACE_HOURS,
    CARB_COVERAGE_WINDOW,
    DETECTOR_LOW,
    DETECTOR_MISSED_MEAL,
    DISPLAY_CAP,
    PROMPT_WINDOW_DAYS,
    Prompt,
    build_candidates,
    build_pending_prompts,
    pending_prompts,
)


# --- builders -----------------------------------------------------------------


def cgm_series(t0, values, cadence=5):
    """5-min CGM readings starting at ``t0`` taking ``values`` in order."""
    return [
        CgmReading(t=t0 + timedelta(minutes=cadence * k), bg=v, type="EGV")
        for k, v in enumerate(values)
    ]


def a_low_dip(day, hh, mm, nadir=58):
    """A CGM run that dips clearly below 70 and recovers — one sub-70 low."""
    t0 = datetime(2026, 6, day, hh, mm, 0)
    return cgm_series(t0, [95, 80, 68, nadir, 66, 82, 100])


def a_missed_meal_rise(day, hh, mm):
    """A steady unannounced rise from a flat baseline, no bolus — matches missed-meal."""
    t0 = datetime(2026, 6, day, hh, mm, 0)
    # flat baseline then a 2 mg/dL/min climb well past the peak threshold.
    return cgm_series(t0, [110, 110, 110, 130, 160, 195, 230, 255, 270])


def prompt(detector, day, hh, mm, key_bg=60.0):
    """A bare :class:`Prompt` candidate at a fixed instant (for pending_prompts tests)."""
    return Prompt(
        detector=detector,
        anchor_t=datetime(2026, 6, day, hh, mm, 0),
        key_bg=key_bg,
        question="q",
        context="c",
        cgm=[],
    )


def response(detector, anchor_t, answer="no", answered_at=None):
    row = {"detector": detector, "anchor_t": format_t(anchor_t), "answer": answer}
    if answered_at is not None:
        row["answered_at"] = format_t(answered_at)
    return row


def carb(day, hh, mm, *, source="manual", grams=15.0, certainty="exact"):
    """A :class:`CarbEntry` at a fixed instant (for coverage tests)."""
    return CarbEntry(
        t=datetime(2026, 6, day, hh, mm, 0),
        grams=grams, certainty=certainty, source=source,
    )


def cgm_legs(t0, start_bg, *legs):
    """5-min CGM from ``t0`` at ``start_bg``, then each ``(minutes, to_bg)`` leg as a line."""
    values = [float(start_bg)]
    for minutes, to_bg in legs:
        steps = minutes // 5
        frm = values[-1]
        values += [frm + (to_bg - frm) * k / steps for k in range(1, steps + 1)]
    return cgm_series(t0, values)


REBOUND_T0 = datetime(2026, 6, 10, 13, 0, 0)
REBOUND_NADIR_T = REBOUND_T0 + timedelta(hours=1)


def a_rebound(nadir, rise_min):
    """A low bottoming at ``nadir`` at 14:00 that rebounds, with no bolus, into a High.

    Flat 110, a 30-min fall to the nadir, a straight ``rise_min``-min climb to 270, then
    a slow fall back through range. The climb crosses 250 mg/dL about
    ``rise_min * (250 - nadir) / (270 - nadir)`` minutes after the nadir.
    """
    return cgm_legs(REBOUND_T0, 110, (30, 110), (30, nadir), (rise_min, 270),
                    (60, 180), (60, 144))


def first_at_or_above(cgm, bg):
    return next(r.t for r in cgm if r.bg >= bg)


def detector_times(prompts):
    return [(p.detector, p.anchor_t) for p in prompts]


SEQUENCE_WEEK_DAY0 = datetime(2026, 6, 1)


def a_sequence_won_week():
    """ADR 448's sequence-won week: a High-carb sequence wins an owned High's Episode.

    Six carb-tagged meal boluses a day for 7 days (42 sequences), 3.5–4 h apart. Ten
    are 90 g or more — every 09:30 breakfast and three 21:10 dinners — and glucose
    sits at 230 through most of the 4-hour window after nine of them, so a High-carb
    sequence finding is supported. On 06-06 the 99 g breakfast is followed by a
    72 mg/dL near-low at 12:00 and a rebound crossing 250 mg/dL at 12:55.
    """
    slots = [(1, 15), (5, 20), (9, 30), (13, 35), (17, 40), (21, 10)]
    special_day = 5
    big = {(d, 2): 91.0 + d for d in range(7)} | {(1, 5): 90.0, (3, 5): 90.5, (4, 5): 90.8}
    big[(special_day, 2)] = 99.0
    bolus, bg = [], {}
    t = SEQUENCE_WEEK_DAY0
    while t < SEQUENCE_WEEK_DAY0 + timedelta(days=7, hours=6):
        bg[t] = 110.0
        t += timedelta(minutes=5)
    seq = 0
    for d in range(7):
        for s, (h, m) in enumerate(slots):
            at = SEQUENCE_WEEK_DAY0 + timedelta(days=d, hours=h, minutes=m)
            carbs = big.get((d, s), 20.0 + (seq % 40))
            seq += 1
            bolus.append(BolusEvent(t=at, insulin=carbs / 10.0, carbs=carbs,
                                    completion="Completed", carb_ratio=10.0, seq_num=seq))
            if (d, s) in big and (d, s) != (special_day, 2):
                for k in range(6, 42):               # 30 min .. 3.5 h after: a 230 plateau
                    bg[at + timedelta(minutes=5 * k)] = 230.0
    b = SEQUENCE_WEEK_DAY0 + timedelta(days=special_day, hours=11)
    for k in range(13):                               # 11:00 -> 12:00: 110 -> 72
        bg[b + timedelta(minutes=5 * k)] = 110.0 - (110.0 - 72.0) * k / 12
    for k in range(13):                               # 12:00 -> 13:00: 72 -> 270
        bg[b + timedelta(hours=1, minutes=5 * k)] = 72.0 + (270.0 - 72.0) * k / 12
    for k in range(13):                               # 13:00 -> 14:00: 270 -> 180
        bg[b + timedelta(hours=2, minutes=5 * k)] = 270.0 - 90.0 * k / 12
    for k in range(1, 5):                             # 14:00 -> 14:20: 180 -> 110
        bg[b + timedelta(hours=3, minutes=5 * k)] = 180.0 - 70.0 * k / 4
    cgm = [CgmReading(t=t, bg=bg[t], type="EGV") for t in sorted(bg)]
    return bolus, cgm


NOW = datetime(2026, 6, 30, 12, 0, 0)


# --- build_candidates ---------------------------------------------------------


class BuildCandidatesTest(unittest.TestCase):
    def test_sub70_low_becomes_one_low_prompt(self):
        cgm = a_low_dip(30, 3, 0, nadir=55)
        candidates = build_candidates([], cgm)
        lows = [c for c in candidates if c.detector == DETECTOR_LOW]
        self.assertEqual(len(lows), 1)
        self.assertEqual(lows[0].key_bg, 55)          # anchored at the nadir
        self.assertIn("55", lows[0].context)
        self.assertTrue(lows[0].cgm)                  # carries its ±2h window

    def test_near_low_is_not_a_prompt(self):
        # A run that bottoms at 72 never crosses the sub-70 line — not "a low you had".
        t0 = datetime(2026, 6, 30, 3, 0, 0)
        cgm = cgm_series(t0, [90, 80, 74, 72, 76, 88])
        self.assertEqual(build_candidates([], cgm), [])

    def test_matched_rise_becomes_missed_meal_prompt(self):
        cgm = a_missed_meal_rise(30, 9, 0)
        candidates = build_candidates([], cgm)
        mm = [c for c in candidates if c.detector == DETECTOR_MISSED_MEAL]
        self.assertEqual(len(mm), 1)
        peak_reading = max(cgm, key=lambda r: r.bg)
        # anchored at the rise onset (the >250 run's start), strictly before the peak.
        self.assertLess(mm[0].anchor_t, peak_reading.t)
        self.assertEqual(mm[0].key_bg, peak_reading.bg)   # key_bg is the peak reached

    def test_rise_with_prior_meal_bolus_is_not_flagged(self):
        # Same rise, but a carb-tagged bolus just before it → digestion tail, no prompt.
        cgm = a_missed_meal_rise(30, 9, 0)
        bolus = [BolusEvent(t=cgm[0].t - timedelta(minutes=10), insulin=6.0, carbs=45.0)]
        mm = [c for c in build_candidates(bolus, cgm) if c.detector == DETECTOR_MISSED_MEAL]
        self.assertEqual(mm, [])


class OwnedHighTest(unittest.TestCase):
    """A High an over-treated low's rebound owns raises no missed-meal prompt (ADR 448).

    The queue reads the shared evaluation's ownership record and judges no low or
    rebound itself. The missed-meal classifier alone matches every owned onset here,
    so a missing prompt is the ownership read, not the classifier.
    """

    def test_slow_rebound_after_a_sub70_low_raises_only_the_low_prompt(self):
        for rise_min in (120, 165):          # the 250 crossing lands 110 and 150 min after
            with self.subTest(rise_min=rise_min):
                cgm = a_rebound(55, rise_min)
                onset = first_at_or_above(cgm, 250)
                # Past the context gate's 90-min lookback, so the gate alone misses the low.
                self.assertGreater(onset - REBOUND_NADIR_T, timedelta(minutes=90))
                self.assertTrue(classify_missed_meal(onset, cgm).matched)
                self.assertEqual(detector_times(build_candidates([], cgm)),
                                 [(DETECTOR_LOW, REBOUND_NADIR_T)])

    def test_near_low_rebound_raises_no_prompt(self):
        for rise_min in (70, 120):           # the 250 crossing lands 65 and 110 min after
            with self.subTest(rise_min=rise_min):
                cgm = a_rebound(72, rise_min)
                self.assertTrue(classify_missed_meal(first_at_or_above(cgm, 250), cgm).matched)
                self.assertEqual(detector_times(build_candidates([], cgm)), [])

    def test_unbolused_rise_with_no_low_still_raises_its_prompt(self):
        cgm = cgm_legs(REBOUND_T0, 110, (60, 110), (120, 270), (60, 180), (60, 144))
        self.assertEqual(detector_times(build_candidates([], cgm)),
                         [(DETECTOR_MISSED_MEAL, first_at_or_above(cgm, 250))])

    def test_rise_after_the_rebound_settles_in_range_still_raises_its_prompt(self):
        # The low fires over-treated (a 200 rebound), then dwells at 120 for an hour —
        # past the 30-min settle that ends its rebound — before an unbolused rise.
        cgm = cgm_legs(REBOUND_T0, 110, (30, 110), (30, 55), (45, 200), (30, 120),
                       (60, 120), (100, 270), (60, 180))
        self.assertIn(Lever.OVER_TREATED_LOW,
                      [ep.attribution.lever for ep in evaluate([], cgm).episodes])
        self.assertEqual(detector_times(build_candidates([], cgm)),
                         [(DETECTOR_LOW, REBOUND_NADIR_T),
                          (DETECTOR_MISSED_MEAL, first_at_or_above(cgm, 250))])

    def test_a_refuted_low_owns_nothing_so_its_rebound_high_is_asked_about(self):
        cgm = a_rebound(55, 120)
        refuted = [LowPromptAnswer(anchor_t=REBOUND_NADIR_T, answer="no")]
        self.assertEqual(detector_times(build_candidates([], cgm, low_answers=refuted)),
                         [(DETECTOR_LOW, REBOUND_NADIR_T),
                          (DETECTOR_MISSED_MEAL, first_at_or_above(cgm, 250))])
        for answer in (LowPromptAnswer(anchor_t=REBOUND_NADIR_T, answer="not-sure"),
                       LowPromptAnswer(anchor_t=REBOUND_NADIR_T, answer="carbs",
                                       carb_t=REBOUND_NADIR_T, carb_grams=15.0)):
            with self.subTest(answer=answer.answer):
                self.assertEqual(detector_times(build_candidates([], cgm, low_answers=[answer])),
                                 [(DETECTOR_LOW, REBOUND_NADIR_T)])

    def test_a_sequence_won_episode_keeps_its_owned_high(self):
        bolus, cgm = a_sequence_won_week()
        onset = datetime(2026, 6, 6, 12, 55)
        self.assertEqual(first_at_or_above([r for r in cgm if r.t.day == 6], 250), onset)
        self.assertTrue(classify_missed_meal(onset, cgm, bolus).matched)
        self.assertEqual(detector_times(c for c in build_candidates(bolus, cgm)
                                        if c.detector == DETECTOR_MISSED_MEAL), [])
        episode = next(ep for ep in evaluate(bolus, cgm).episodes
                       if ep.start <= onset < ep.end)
        self.assertIs(episode.attribution.lever, Lever.HIGH_CARB_SEQUENCE)
        self.assertIn(onset, [high.reach_start for high, _ in episode.attribution.owned_highs])


# --- pending_prompts: answered-match -----------------------------------------


class AnsweredMatchTest(unittest.TestCase):
    def test_unanswered_candidate_is_pending(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        self.assertEqual(len(pending_prompts([c], [], NOW)), 1)

    def test_answered_candidate_is_dropped(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        r = response(DETECTOR_LOW, c.anchor_t, answer="no")
        self.assertEqual(pending_prompts([c], [r], NOW), [])

    def test_not_sure_answer_also_resolves(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        r = response(DETECTOR_LOW, c.anchor_t, answer="not-sure")
        self.assertEqual(pending_prompts([c], [r], NOW), [])

    def test_response_within_tolerance_matches_despite_drift(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        drifted = c.anchor_t - (ANCHOR_TOLERANCE - timedelta(minutes=1))
        r = response(DETECTOR_LOW, drifted)
        self.assertEqual(pending_prompts([c], [r], NOW), [])

    def test_response_outside_tolerance_does_not_match(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        far = c.anchor_t - (ANCHOR_TOLERANCE + timedelta(minutes=5))
        r = response(DETECTOR_LOW, far)
        self.assertEqual(len(pending_prompts([c], [r], NOW)), 1)

    def test_detector_must_match(self):
        # Same anchor, different detector → not the same prompt.
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        r = response(DETECTOR_MISSED_MEAL, c.anchor_t)
        self.assertEqual(len(pending_prompts([c], [r], NOW)), 1)


# --- pending_prompts: include_answered (faded ✓ pins survive reload) ----------


class IncludeAnsweredTest(unittest.TestCase):
    def test_answered_prompt_is_returned_tagged_when_included(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        r = response(DETECTOR_LOW, c.anchor_t, answer="no")
        [out] = pending_prompts([c], [r], NOW, include_answered=True)
        self.assertEqual(out.anchor_t, c.anchor_t)
        self.assertEqual(out.answer, "no")            # carries the stored answer

    def test_pending_prompt_has_null_answer(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        [out] = pending_prompts([c], [], NOW, include_answered=True)
        self.assertIsNone(out.answer)

    def test_pending_keep_priority_over_answered_at_cap(self):
        # cap slots go to pending first; only leftover slots hold answered pins.
        pend = [prompt(DETECTOR_LOW, 30, 0, m) for m in range(6)]     # 6 pending
        ans = [prompt(DETECTOR_MISSED_MEAL, 29, 0, m) for m in range(8)]  # 8 answered
        responses = [response(DETECTOR_MISSED_MEAL, p.anchor_t, "no") for p in ans]
        out = pending_prompts(pend + ans, responses, NOW,
                              include_answered=True, cap=10)
        self.assertEqual(len(out), 10)
        n_pending = sum(1 for p in out if p.answer is None)
        self.assertEqual(n_pending, 6)                # all pending kept
        self.assertEqual(len(out) - n_pending, 4)     # only 4 answered fit

    def test_expiry_still_drops_old_answered(self):
        stale = Prompt(detector=DETECTOR_LOW,
                       anchor_t=NOW - timedelta(days=PROMPT_WINDOW_DAYS, minutes=1),
                       key_bg=60.0, question="q", context="c")
        r = response(DETECTOR_LOW, stale.anchor_t, "no")
        self.assertEqual(pending_prompts([stale], [r], NOW, include_answered=True), [])


# --- pending_prompts: answered grace (#165 — answered pins fall off sooner) ---


class AnsweredGraceTest(unittest.TestCase):
    """An answered prompt lingers as a faded ✓ only for the grace window, then drops
    off entirely — measured against WALL-CLOCK now, not the event-time window `now`."""

    def test_recent_answer_still_shows_within_grace(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        r = response(DETECTOR_LOW, c.anchor_t, "no",
                     answered_at=NOW - timedelta(hours=ANSWERED_GRACE_HOURS - 1))
        [out] = pending_prompts([c], [r], NOW, include_answered=True, wall_now=NOW)
        self.assertEqual(out.answer, "no")            # still a reviseable faded ✓

    def test_answer_past_grace_drops_from_queue(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        r = response(DETECTOR_LOW, c.anchor_t, "no",
                     answered_at=NOW - timedelta(hours=ANSWERED_GRACE_HOURS, minutes=1))
        self.assertEqual(
            pending_prompts([c], [r], NOW, include_answered=True, wall_now=NOW), [])

    def test_grace_boundary_is_just_over_the_grace(self):
        # exactly at the edge still shows; a minute past is gone.
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        at_edge = response(DETECTOR_LOW, c.anchor_t, "no",
                           answered_at=NOW - timedelta(hours=ANSWERED_GRACE_HOURS))
        just_over = response(DETECTOR_LOW, c.anchor_t, "no",
                             answered_at=NOW - timedelta(hours=ANSWERED_GRACE_HOURS, minutes=1))
        self.assertEqual(
            len(pending_prompts([c], [at_edge], NOW, include_answered=True, wall_now=NOW)), 1)
        self.assertEqual(
            pending_prompts([c], [just_over], NOW, include_answered=True, wall_now=NOW), [])

    def test_past_grace_does_not_resurrect_as_pending(self):
        # The response still matches the candidate within tolerance, so a dropped
        # answered prompt must be filtered out, never bounced back into pending.
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        r = response(DETECTOR_LOW, c.anchor_t, "no",
                     answered_at=NOW - timedelta(hours=ANSWERED_GRACE_HOURS + 1))
        self.assertEqual(pending_prompts([c], [r], NOW, wall_now=NOW), [])
        self.assertEqual(
            pending_prompts([c], [r], NOW, include_answered=True, wall_now=NOW), [])

    def test_grace_is_overridable_via_keyword(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        r = response(DETECTOR_LOW, c.anchor_t, "no",
                     answered_at=NOW - timedelta(hours=ANSWERED_GRACE_HOURS + 1))
        # default grace drops it; a wider override keeps it as a faded ✓.
        self.assertEqual(
            pending_prompts([c], [r], NOW, include_answered=True, wall_now=NOW), [])
        [out] = pending_prompts([c], [r], NOW, include_answered=True, wall_now=NOW,
                                answered_grace_hours=ANSWERED_GRACE_HOURS + 3)
        self.assertEqual(out.answer, "no")

    def test_grace_uses_wall_clock_not_lagging_event_time(self):
        # Catch-up DB: the data's latest event time lags wall clock by days. An answer
        # made "just now" (wall clock) still shows; one made 4h ago is gone — proving
        # the grace is measured against wall_now, not the event-time window `now`.
        wall = datetime(2026, 7, 3, 9, 0, 0)
        event_now = wall - timedelta(days=5)          # data lags real time
        c = prompt(DETECTOR_LOW, 28, 3, 0)            # 06-28 03:00 — inside event_now's window
        self.assertLess(c.anchor_t, event_now)
        self.assertGreater(c.anchor_t, event_now - timedelta(days=PROMPT_WINDOW_DAYS))
        fresh = response(DETECTOR_LOW, c.anchor_t, "no", answered_at=wall - timedelta(minutes=1))
        stale = response(DETECTOR_LOW, c.anchor_t, "no", answered_at=wall - timedelta(hours=4))
        [out] = pending_prompts([c], [fresh], event_now, include_answered=True, wall_now=wall)
        self.assertEqual(out.answer, "no")
        self.assertEqual(
            pending_prompts([c], [stale], event_now, include_answered=True, wall_now=wall), [])


# --- pending_prompts: expiry + cap + ordering --------------------------------


class ExpiryAndCapTest(unittest.TestCase):
    def test_older_than_window_is_dropped_silently(self):
        stale = Prompt(
            detector=DETECTOR_LOW,
            anchor_t=NOW - timedelta(days=PROMPT_WINDOW_DAYS, minutes=1),
            key_bg=60.0, question="q", context="c",
        )
        fresh = prompt(DETECTOR_LOW, 30, 3, 0)
        result = pending_prompts([stale, fresh], [], NOW)
        self.assertEqual([p.anchor_t for p in result], [fresh.anchor_t])

    def test_oldest_first_ordering(self):
        a = prompt(DETECTOR_LOW, 28, 8, 0)
        b = prompt(DETECTOR_LOW, 29, 8, 0)
        c = prompt(DETECTOR_LOW, 30, 8, 0)
        result = pending_prompts([c, a, b], [], NOW)
        self.assertEqual([p.anchor_t for p in result], [a.anchor_t, b.anchor_t, c.anchor_t])

    def test_display_cap_keeps_the_oldest(self):
        # DISPLAY_CAP+5 prompts spread over the last ~5 days (all inside the window).
        many = [
            Prompt(
                detector=DETECTOR_LOW,
                anchor_t=NOW - timedelta(hours=8 * (i + 1)),
                key_bg=60.0, question="q", context="c",
            )
            for i in range(DISPLAY_CAP + 5)
        ]
        result = pending_prompts(many, [], NOW)
        self.assertEqual(len(result), DISPLAY_CAP)
        # capped to the oldest — the newest extras fall off the end.
        self.assertEqual(result[0].anchor_t, min(p.anchor_t for p in many))

    def test_age_days_filled_relative_to_now(self):
        c = prompt(DETECTOR_LOW, 28, 12, 0)
        [out] = pending_prompts([c], [], NOW)
        self.assertAlmostEqual(out.age_days, 2.0, places=2)


# --- pending_prompts: manual-carb coverage (#166 / ADR 0011) ------------------


class CarbCoverageTest(unittest.TestCase):
    """A manual carb the user already logged covers an unanswered prompt silently —
    it drops from the queue like an expired candidate, no ✓ pin, no stored artifact."""

    def test_covering_carb_drops_pending_prompt(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        covering = carb(30, 3, 5)                    # 5 min off the nadir
        self.assertEqual(pending_prompts([c], [], NOW, carb_entries=[covering]), [])

    def test_covered_prompt_leaves_no_answered_pin(self):
        # Silent: even include_answered mode shows nothing (unlike a stored answer's ✓).
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        covering = carb(30, 3, 5)
        self.assertEqual(
            pending_prompts([c], [], NOW, carb_entries=[covering], include_answered=True), [])

    def test_carb_just_outside_window_does_not_cover(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        far = c.anchor_t + (CARB_COVERAGE_WINDOW + timedelta(minutes=1))
        entry = CarbEntry(t=far, grams=15.0, certainty="exact", source="manual")
        self.assertEqual(len(pending_prompts([c], [], NOW, carb_entries=[entry])), 1)

    def test_carb_at_window_edge_covers(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        edge = CarbEntry(t=c.anchor_t + CARB_COVERAGE_WINDOW, grams=15.0,
                         certainty="exact", source="manual")
        self.assertEqual(pending_prompts([c], [], NOW, carb_entries=[edge]), [])

    def test_coverage_is_detector_agnostic(self):
        # A manual carb covers a missed-meal candidate as readily as a low.
        c = prompt(DETECTOR_MISSED_MEAL, 30, 9, 0, key_bg=240.0)
        covering = carb(30, 9, 5)
        self.assertEqual(pending_prompts([c], [], NOW, carb_entries=[covering]), [])

    def test_unknown_certainty_carb_still_covers(self):
        # No grams/certainty filter: coverage asks *whether*, not how many.
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        vague = CarbEntry(t=c.anchor_t, grams=None, certainty="unknown", source="manual")
        self.assertEqual(pending_prompts([c], [], NOW, carb_entries=[vague]), [])

    def test_prompt_sourced_carb_does_not_cover(self):
        # rise-prompt / low-prompt entries are the answer path's byproduct, tracked by
        # their prompt_responses row — only `manual` entries cover here.
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        from_prompt = carb(30, 3, 0, source="low-prompt")
        self.assertEqual(len(pending_prompts([c], [], NOW, carb_entries=[from_prompt])), 1)

    def test_stored_answer_wins_over_coverage(self):
        # An explicit in-queue answer stays authoritative: it keeps its reviseable ✓
        # instead of being silently dropped by a nearby manual carb.
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        r = response(DETECTOR_LOW, c.anchor_t, answer="no",
                     answered_at=NOW - timedelta(hours=1))
        covering = carb(30, 3, 5)
        [out] = pending_prompts([c], [r], NOW, carb_entries=[covering],
                                include_answered=True, wall_now=NOW)
        self.assertEqual(out.answer, "no")           # ✓ survives, not silently covered

    def test_no_carbs_leaves_prompt_pending(self):
        c = prompt(DETECTOR_LOW, 30, 3, 0)
        self.assertEqual(len(pending_prompts([c], [], NOW, carb_entries=[])), 1)


class CarbCoverageStoreTest(unittest.TestCase):
    """The store-facing wrapper reads `carb_entries` and applies coverage end-to-end."""

    def _store_with_low(self):
        from ciq_autotune.store import Store
        store = Store.open(":memory:")
        # A CGM run that dips clearly below 70 and recovers — one low prompt.
        t0 = datetime(2026, 6, 30, 3, 0, 0)
        for k, v in enumerate([95, 80, 68, 55, 66, 82, 100]):
            store.upsert_cgm([{
                "EventDateTime": format_t(t0 + timedelta(minutes=5 * k)),
                "Readings (CGM / BGM)": str(v), "Description": "EGV",
            }])
        return store

    def test_manual_carb_covers_low_prompt_through_store(self):
        store = self._store_with_low()
        try:
            # Baseline: the low prompts.
            open_before = [p for p in build_pending_prompts(store) if p.answer is None]
            self.assertEqual(len(open_before), 1)
            self.assertEqual(open_before[0].detector, DETECTOR_LOW)
            # Log a manual carb at the nadir → the prompt is covered, silently gone.
            store.upsert_carb_entry(
                CarbEntry(t=open_before[0].anchor_t, grams=15.0,
                          certainty="exact", source="manual"))
            self.assertEqual(build_pending_prompts(store), [])
        finally:
            store.close()


class OwnedHighStoreTest(unittest.TestCase):
    """The store-facing wrapper reads ownership under the Scenario's own low answers.

    Those answers follow #467's endpoint rule: a `no` recorded after the latest reading
    is not yet known, so it restores the High's question only once data reaches it.
    """

    def _store_with_slow_rebound(self):
        from ciq_autotune.store import Store
        store = Store.open(":memory:")
        store.upsert_cgm([{
            "EventDateTime": format_t(r.t),
            "Readings (CGM / BGM)": str(r.bg), "Description": "EGV",
        } for r in a_rebound(55, 120)])
        return store

    def test_a_known_no_restores_the_rebound_high_question(self):
        cgm = a_rebound(55, 120)
        store = self._store_with_slow_rebound()
        try:
            self.assertEqual(detector_times(build_pending_prompts(store)),
                             [(DETECTOR_LOW, REBOUND_NADIR_T)])
            store.record_prompt_response(detector=DETECTOR_LOW, anchor_t=REBOUND_NADIR_T,
                                         answer="no", answered_at=cgm[-1].t)
            open_now = [p for p in build_pending_prompts(store) if p.answer is None]
            self.assertEqual(detector_times(open_now),
                             [(DETECTOR_MISSED_MEAL, first_at_or_above(cgm, 250))])
        finally:
            store.close()

    def test_a_no_recorded_after_the_latest_reading_does_not_restore_it(self):
        store = self._store_with_slow_rebound()
        try:
            # The store stamps wall-clock time, after every synthetic reading.
            store.record_prompt_response(detector=DETECTOR_LOW, anchor_t=REBOUND_NADIR_T,
                                         answer="no")
            self.assertNotIn(DETECTOR_MISSED_MEAL,
                             [p.detector for p in build_pending_prompts(store)])
        finally:
            store.close()


if __name__ == "__main__":
    unittest.main()
