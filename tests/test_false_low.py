"""False-low flag (#381): a manual "not real (compression low)" answer invalidates
the whole flagged excursion from tuning — the harm layer's printed-low detection
(basal + ISF arms), the fasting-ISF regression + rest-window, and the count of lows
the scenario queue works from — while the Day chart keeps it drawn (greyed) for an undo.

The excursion is a *reading invalidation* (the readings vanish), distinct from the
carb *mask* (the reading survives, it just doesn't count as fasting). These tests
exercise it through the same public composition ``analyze`` / ``build_scenarios`` /
``timeline`` use: :func:`false_low_spans` + :func:`drop_readings`.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.events import BolusEvent, CgmReading
from ciq_autotune.false_low import (
    drop_readings,
    excursion_span,
    false_low_spans,
    in_spans,
)
from ciq_autotune.harm import HarmArm, HarmConfig, find_printed_lows
from ciq_autotune.store import Store


# --- synthetic overnight compression V --------------------------------------------
# Flat ~110 baseline, a physiologically-impossible fasting plunge to 47, then a fake
# +139 rebound to ~186 in 25 min, settling back onto trend — the classic
# "pressure on the sensor while asleep" false low (the #381 grounding).

_ANCHOR = datetime(2026, 6, 21, 3, 10)  # the nadir the low prompt anchors at


def _compression_v(day=21):
    pts = []
    t0 = datetime(2026, 6, day, 0, 0)

    def add(mins, bg):
        pts.append(CgmReading(t=t0 + timedelta(minutes=mins), bg=bg, type="EGV"))

    m = 0
    while m < 150:                                   # 00:00–02:30 calm baseline
        add(m, 110)
        m += 5
    for mm, bg in [(150, 108), (155, 95), (160, 80),  # the plunge to 47
                   (165, 66), (170, 55), (175, 49), (185, 47), (190, 47)]:
        add(mm, bg)
    for mm, bg in [(195, 70), (200, 110), (205, 150), (210, 186)]:  # the fake +139 rebound
        add(mm, bg)
    for mm, bg in [(215, 150), (220, 130), (225, 118), (230, 112), (235, 111)]:  # settle
        add(mm, bg)
    m = 240
    while m <= 360:                                  # 04:00–06:00 calm baseline
        add(m, 110)
        m += 5
    return pts


def _false_low_response(anchor=_ANCHOR):
    return {"detector": "low", "answer": "false-low",
            "anchor_t": anchor.strftime("%Y-%m-%d %H:%M:%S")}


class ExcursionSpanTest(unittest.TestCase):
    def test_span_covers_drop_start_through_rejoin(self):
        cgm = sorted(_compression_v(), key=lambda r: r.t)
        span = excursion_span(cgm, _ANCHOR)
        self.assertIsNotNone(span)
        start, end = span
        # Starts at the drop's shoulder (02:30), not swallowing the calm baseline before.
        self.assertEqual(start, datetime(2026, 6, 21, 2, 30))
        # Ends where BG rejoins trend, past the fake rebound peak (03:30).
        self.assertGreaterEqual(end, datetime(2026, 6, 21, 3, 30))

    def test_whole_excursion_not_just_sub_70(self):
        # AC: a reading on the fake rebound ABOVE 70 (the +139 climb to 186) is also
        # excluded, so it can't read as a missed meal / ISF sample.
        spans = false_low_spans(_compression_v(), [_false_low_response()])
        rebound_186 = datetime(2026, 6, 21, 3, 30)
        self.assertTrue(in_spans(rebound_186, spans))
        # The calm baseline on either side stays out of the span.
        self.assertFalse(in_spans(datetime(2026, 6, 21, 1, 0), spans))
        self.assertFalse(in_spans(datetime(2026, 6, 21, 5, 0), spans))

    def test_no_span_when_no_low_near_anchor(self):
        # A flat in-range night: the flag has nothing to suppress (data changed).
        cgm = [CgmReading(t=datetime(2026, 6, 21, 0, 0) + timedelta(minutes=5 * k),
                          bg=110, type="EGV") for k in range(72)]
        self.assertIsNone(excursion_span(cgm, _ANCHOR))

    def test_only_false_low_answers_produce_spans(self):
        cgm = _compression_v()
        for other in ("no", "not-sure", "carbs"):
            resp = {"detector": "low", "answer": other,
                    "anchor_t": _ANCHOR.strftime("%Y-%m-%d %H:%M:%S")}
            self.assertEqual(false_low_spans(cgm, [resp]), [])
        self.assertEqual(len(false_low_spans(cgm, [_false_low_response()])), 1)


class HarmSuppressionTest(unittest.TestCase):
    """AC: without the flag the compression V mints a BASAL printed low; with it,
    zero printed lows. Exercises the exact composition ``analyze`` uses."""

    def test_unflagged_v_mints_a_basal_printed_low(self):
        cgm = _compression_v()
        lows = find_printed_lows(cgm, [], HarmConfig())      # no bolus → fasting → basal
        self.assertEqual(len(lows), 1)
        self.assertEqual(lows[0].arm, HarmArm.BASAL)
        self.assertLess(lows[0].bg, 50)

    def test_flagged_v_mints_zero_printed_lows(self):
        cgm = _compression_v()
        spans = false_low_spans(cgm, [_false_low_response()])
        lows = find_printed_lows(drop_readings(cgm, spans), [], HarmConfig())
        self.assertEqual(lows, [])

    def test_a_real_low_elsewhere_still_prints(self):
        # Only the flagged excursion is suppressed; an unflagged low on another night
        # is untouched — the flag is surgical, not a blanket low-off switch.
        cgm = _compression_v(21) + _compression_v(24)
        spans = false_low_spans(cgm, [_false_low_response(datetime(2026, 6, 21, 3, 10))])
        lows = find_printed_lows(drop_readings(cgm, spans), [], HarmConfig())
        self.assertEqual(len(lows), 1)
        self.assertEqual(lows[0].t.day, 24)


def _raw_cgm(readings):
    return [{"EventDateTime": r.t.strftime("%Y-%m-%dT%H:%M:%S"),
             "Readings (CGM / BGM)": r.bg, "Description": "EGV"} for r in readings]


class AnalyzeHarmWiringTest(unittest.TestCase):
    """AC end-to-end through :func:`analyze` itself — not the
    ``find_printed_lows(drop_readings(...))`` composition above. Covers the one-line
    analyze() wiring (the false-low spans reach the harm layer's printed-low detection):
    two compression Vs gate the overnight basal slot (held at current, since its clean
    median reads == current — ADR 412 defers magnitude to the median rather than
    forcing a step); flagging both lifts the gate, so the slot reads no-change again."""

    def _store_with_lows(self):
        from ciq_autotune.store import Store

        store = Store.open(":memory:")
        self.addCleanup(store.close)
        # 12 clean in-range nights of flowing 0.72 basal == programmed → the 03:00 slot
        # clears the thin-slot gate and its clean verdict is "no change".
        basal_raw, cgm = [], []
        for d in range(1, 13):
            t0 = datetime(2026, 6, d, 0, 0)
            basal_raw.append({
                "seq_num": d,
                "time": t0.strftime("%Y-%m-%d %H:%M:%S"),
                "delivery_type": "algorithmDelivery",
                "duration_mins": 360, "basal_rate": 0.72, "profile_basal_rate": 0.72})
            cgm += [CgmReading(t=t0 + timedelta(minutes=5 * k), bg=120, type="EGV")
                    for k in range(73)]
        # Two compression Vs on separate nights → two recurring 03:00 fasting lows.
        cgm += _compression_v(20) + _compression_v(21)
        store.upsert_basal(basal_raw)
        store.upsert_cgm(_raw_cgm(cgm))
        return store

    def _slot_0300(self, result):
        return next(s for s in result.basal if s.label == "03:00")

    def test_unflagged_lows_gate_the_overnight_slot(self):
        from ciq_autotune.analyze import analyze

        s = self._slot_0300(analyze(self._store_with_lows()))
        # Median == current, so ADR 412 holds at current (gated) rather than cutting.
        self.assertEqual(s.status.name, "HARM_GATED")
        self.assertIn("harm", s.evidence)
        self.assertEqual(s.recommended, s.current)

    def test_flagging_both_lows_lifts_the_nudge(self):
        from ciq_autotune.analyze import analyze

        store = self._store_with_lows()
        for day in (20, 21):
            store.record_prompt_response(
                detector="low", anchor_t=datetime(2026, 6, day, 3, 10),
                answer="false-low")
        # analyze() must be handed the answers — the CLI/back-compat default is None.
        s = self._slot_0300(analyze(store, prompt_responses=store.prompt_responses()))
        self.assertEqual(s.status.name, "NO_CHANGE")
        self.assertNotIn("harm", s.evidence)
        self.assertEqual(s.recommended, 0.72)


class LowCountDenominatorTest(unittest.TestCase):
    """AC: the count of lows the app works from falls by exactly one for one flagged
    overnight low.

    Read off the scenario queue — the surface the app actually renders. This used to be
    read off the browsable exposure population, which was retired with the Diagnose
    evidence-drill it fed (#500). The two are not the same measurement: the population
    counted every low in the window, attributed or not, while the queue counts only the
    ones a lever was blamed for. So this pins the invalidation on the lows the *queue*
    works from — narrower than what it replaces, and the strongest form of the
    guarantee still observable from a surface with a reader."""

    def _store_with_two_lows(self):
        store = Store.open(":memory:")
        self.addCleanup(store.close)
        store.upsert_cgm(_raw_cgm(_compression_v(21) + _compression_v(24)))
        return store

    def _queued_lows(self, store):
        """Episodes the queue attributes to a low-exposure lever — filtered by exposure
        so this counts lows, not "whatever the queue happened to build"."""
        from ciq_autotune.analyzers.scenario import (LEVER_EXPOSURE, Exposure,
                                                     build_scenarios)
        report = build_scenarios(store, window_days=30)
        return [e for e in report.episodes.values()
                if LEVER_EXPOSURE.get(e.lever) is Exposure.LOWS]

    def test_flagging_one_low_drops_the_low_count_by_one(self):
        store = self._store_with_two_lows()
        self.assertEqual(len(self._queued_lows(store)), 2)

        store.record_prompt_response(
            detector="low", anchor_t=datetime(2026, 6, 21, 3, 10), answer="false-low")
        self.assertEqual(len(self._queued_lows(store)), 1)   # exactly one fewer


class FastingIsfSuppressionTest(unittest.TestCase):
    """AC: the flagged excursion drops from the fasting-ISF regression + rest-window
    and contributes no fasting sample."""

    def test_no_fasting_step_falls_inside_a_flagged_excursion(self):
        from ciq_autotune.analyzers.isf import IsfConfig, fasting_steps
        from ciq_autotune.rest_window import detect_rest_windows

        # A full overnight rest window needs the prior evening's lead-in (the 22:00
        # envelope anchor) or the detector starves (#147). Add a calm 22:00→24:00 on
        # the 20th so the 20th-evening night covers the 21st's compression V.
        evening = [CgmReading(t=datetime(2026, 6, 20, 22, 0) + timedelta(minutes=5 * k),
                              bg=110, type="EGV") for k in range(24)]
        cgm = evening + _compression_v()
        rest = detect_rest_windows(cgm, [])
        self.assertTrue(rest)                         # a rest window did form
        cfg = IsfConfig()
        spans = false_low_spans(cgm, [_false_low_response()])

        before = fasting_steps([], [], cgm, cfg, rest)
        after = fasting_steps([], [], drop_readings(cgm, spans), cfg, rest)

        # At least one fasting sample sat inside the excursion before the flag (the
        # settling tail on the fake rebound) — that's the sample the flag must remove.
        self.assertTrue(any(in_spans(s.t, spans) for s in before))
        self.assertFalse(any(in_spans(s.t, spans) for s in after))


class TimelineDisplayTest(unittest.TestCase):
    """The Day chart keeps the flagged readings DRAWN (greyed) and only surfaces the
    span — display is reading-preserving, unlike the tuning paths."""

    def test_timeline_surfaces_span_but_keeps_readings(self):
        from ciq_autotune.timeline import timeline

        store = Store.open(":memory:")
        self.addCleanup(store.close)
        store.upsert_cgm(_raw_cgm(_compression_v(21)))
        store.record_prompt_response(
            detector="low", anchor_t=datetime(2026, 6, 21, 3, 10), answer="false-low")

        payload = timeline(store, datetime(2026, 6, 21, 0, 0), datetime(2026, 6, 21, 6, 0))
        self.assertTrue(payload["false_low_exclusion_spans"])   # span present for greying
        # The 47 nadir reading is still in the drawn curve (so a misflag is visible).
        self.assertTrue(any(row["bg"] == 47 for row in payload["cgm"]))


class OutcomeSummaryInvalidationTest(unittest.TestCase):
    """AC (#532): the flat Outcomes summary's clean rates and glycemic panel honor a
    false-low flag exactly as the trend already does — the flagged excursion's
    readings vanish from ``summarize_outcomes`` before its window, tally, or panel
    forms, so the two views agree on the same store."""

    def _store_with_two_lows(self):
        store = Store.open(":memory:")
        self.addCleanup(store.close)
        store.upsert_cgm(_raw_cgm(_compression_v(21) + _compression_v(24)))
        return store

    def _lows_clean_rate(self, summary):
        from ciq_autotune.analyzers.scenario import Exposure

        return next(c for c in summary.clean_rates if c.exposure == Exposure.LOWS.value)

    def test_unflagged_two_lows_report_n2_flagged2(self):
        from ciq_autotune.outcomes import summarize_outcomes

        store = self._store_with_two_lows()
        summary = summarize_outcomes(store, window_days=30)
        cr = self._lows_clean_rate(summary)
        self.assertEqual((cr.n, cr.attributed, cr.clean), (2, 2, 0.0))
        self.assertEqual(summary.metrics.tir, 91.7)
        # The baseline the flagged run is read against: unflagged, the 06-21 night
        # alone already counts its low.
        only_21 = summarize_outcomes(store, window_days=30, now=datetime(2026, 6, 21, 6, 0))
        self.assertEqual(self._lows_clean_rate(only_21).n, 1)

    def test_flagging_one_low_drops_it_from_the_summary(self):
        from ciq_autotune.outcomes import summarize_outcomes

        store = self._store_with_two_lows()
        store.record_prompt_response(
            detector="low", anchor_t=datetime(2026, 6, 21, 3, 10), answer="false-low")
        summary = summarize_outcomes(store, window_days=30)
        cr = self._lows_clean_rate(summary)
        # Matches the trend's answer for the same store/window/flag.
        self.assertEqual((cr.n, cr.attributed, cr.clean), (1, 1, 0.0))
        self.assertEqual(summary.metrics.tir, 95.3)
        # Surgical, not a blanket low-off switch: named through the same summary, the
        # low that vanished is the flagged 06-21 night and the survivor is 06-24. Each
        # window below ends on one night's data, so its count names that night.
        only_21 = summarize_outcomes(store, window_days=30, now=datetime(2026, 6, 21, 6, 0))
        self.assertEqual(self._lows_clean_rate(only_21).n, 0)
        only_24 = summarize_outcomes(store, window_days=2, now=datetime(2026, 6, 24, 6, 0))
        self.assertEqual(self._lows_clean_rate(only_24).n, 1)

    def test_flagging_the_last_low_does_not_slide_the_window(self):
        # The window the summary reports is resolved on the full series, as the trend
        # does — otherwise flagging a low that runs to the end of the data would pull
        # the window's end back onto the last surviving reading, and the two views
        # would cover different stretches of time on the same store.
        from ciq_autotune.outcomes import summarize_outcomes

        tail = [r for r in _compression_v(21) + _compression_v(24)
                if r.t <= datetime(2026, 6, 24, 3, 30)]   # data stops inside the 06-24 low
        store = Store.open(":memory:")
        self.addCleanup(store.close)
        store.upsert_cgm(_raw_cgm(tail))
        unflagged = summarize_outcomes(store, window_days=30)
        store.record_prompt_response(
            detector="low", anchor_t=datetime(2026, 6, 24, 3, 10), answer="false-low")
        flagged = summarize_outcomes(store, window_days=30)
        self.assertEqual(flagged.generated_at, unflagged.generated_at)
        self.assertEqual(flagged.generated_at, "2026-06-24 03:30:00")


if __name__ == "__main__":
    unittest.main()
