"""Observation-aware rescue evidence (#467).

The rescue-carb log began part-way through the history, so two things have to hold:

* a window may only read the evidence that had been **recorded** by its endpoint (else
  a rescue entered retrospectively today counts against a window that closed before it
  existed), and
* the part of a window that predates the log is **unknown** — it may not be read as
  zero rescues, and it may not supply the silence an ISF *strengthen* requires.

Grounded on the 2026-07-20 read-only snapshot: 26 prompt responses (18 ``carbs`` / 3
``no`` / 5 ``not-sure``), 44 carb entries, first recorded observation
2026-07-04 01:06:50, nine entries whose event time predates it.
"""

import random
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from ciq_autotune.analyze import analyze
from ciq_autotune.analyzers.isf import analyze_isf
from ciq_autotune.events import CarbEntry
from ciq_autotune.harm import HarmArm, HarmConfig, PrintedLow
from ciq_autotune.rescue_evidence import (
    CONFIRMED_RESCUE,
    EXPLICIT_NO,
    NOT_SURE,
    NO_RECORDED_OBSERVATION,
    RescueObservation,
    eligible_carb_entries,
    eligible_prompt_responses,
    first_observation,
    observe,
    observed_days,
)
from ciq_autotune.settings import parse_pump_settings
from ciq_autotune.store import Store

# The snapshot's real instrumentation boundary and the default 30-day window that
# straddles it (the window starts 14 days before the log's first entry).
FIRST_OBSERVATION = datetime(2026, 7, 4, 1, 6, 50)
WINDOW_END = datetime(2026, 7, 20, 0, 0, 0)
WINDOW_START = WINDOW_END - timedelta(days=30)


def _entry(t, *, created_at=None, grams=12.0, source="manual", certainty="estimate"):
    return CarbEntry(t=t, grams=grams, certainty=certainty, source=source,
                     created_at=created_at)


def _answer(anchor_t, answer, answered_at, detector="low"):
    return {"detector": detector, "anchor_t": anchor_t, "answer": answer,
            "answered_at": answered_at}


class EligibilityTest(unittest.TestCase):
    """Inclusion keys on when a row became known, not on when the carbs happened."""

    def test_entry_recorded_after_the_endpoint_is_not_eligible(self):
        # The snapshot's real shape: an old event time, backfilled weeks later.
        retro = _entry(datetime(2026, 6, 28, 2, 0, 0), created_at=FIRST_OBSERVATION)
        self.assertEqual(eligible_carb_entries([retro], FIRST_OBSERVATION), [retro])
        self.assertEqual(
            eligible_carb_entries([retro], datetime(2026, 7, 3, 0, 0, 0)), [])

    def test_missing_creation_time_falls_back_to_the_event_time(self):
        # Hand-built fixtures and the CLI back-compat callers pass created_at=None;
        # such an entry is treated as observed when it happened, never at the epoch.
        plain = _entry(datetime(2026, 7, 10, 2, 0, 0))
        self.assertEqual(eligible_carb_entries([plain], datetime(2026, 7, 10, 3)), [plain])
        self.assertEqual(eligible_carb_entries([plain], datetime(2026, 7, 10, 1)), [])

    def test_answer_recorded_after_the_endpoint_is_not_eligible(self):
        late = _answer(datetime(2026, 6, 28, 2, 0, 0), "no", datetime(2026, 7, 6, 9, 0, 0))
        self.assertEqual(eligible_prompt_responses([late], datetime(2026, 7, 6, 9)), [late])
        self.assertEqual(eligible_prompt_responses([late], datetime(2026, 7, 5)), [])


class ObservedCoverageTest(unittest.TestCase):
    """Coverage is a count of observed days, from the first-ever observation onward."""

    def test_first_observation_is_the_earliest_recorded_time(self):
        entry = _entry(datetime(2026, 6, 28, 2, 0, 0), created_at=FIRST_OBSERVATION)
        answer = _answer(datetime(2026, 7, 9, 3, 0, 0), "carbs",
                         datetime(2026, 7, 9, 3, 30, 0))
        self.assertEqual(first_observation([entry], [answer]), FIRST_OBSERVATION)
        # Either stream can be the earliest one.
        earlier = _answer(datetime(2026, 7, 1, 3, 0, 0), "no", datetime(2026, 7, 1, 4, 0, 0))
        self.assertEqual(first_observation([entry], [earlier]),
                         datetime(2026, 7, 1, 4, 0, 0))

    def test_nothing_recorded_means_nothing_observed(self):
        self.assertIsNone(first_observation([], []))
        self.assertEqual(observed_days(WINDOW_START, WINDOW_END, None), 0)

    def test_coverage_excludes_the_pre_instrumentation_days(self):
        # 2026-06-20 → 2026-07-20 with the log starting 2026-07-04 01:06:50: 15 whole
        # observed days of 30, and the shortfall is unknown, not rescue-free.
        obs = observe([], [], start=WINDOW_START, end=WINDOW_END,
                      observed_from=FIRST_OBSERVATION)
        self.assertEqual(obs.window_days, 30)
        self.assertEqual(obs.observed_days, 15)
        self.assertEqual(obs.unobserved_days, 15)
        self.assertFalse(obs.fully_observed)

    def test_a_window_inside_the_observed_span_is_fully_observed(self):
        obs = observe([], [], start=datetime(2026, 7, 6), end=WINDOW_END,
                      observed_from=FIRST_OBSERVATION)
        self.assertTrue(obs.fully_observed)
        self.assertEqual(obs.observed_days, 14)

    def test_coverage_is_a_day_count_with_no_rate_over_rescues(self):
        # ADR 0012 / adr-166: an observed-window count, never a rate and never a ledger.
        d = observe([], [], start=WINDOW_START, end=WINDOW_END,
                    observed_from=FIRST_OBSERVATION).to_dict()
        for forbidden in ("rate", "pct", "percent", "denominator", "covered", "entries"):
            self.assertNotIn(forbidden, d)


class FourStatesTest(unittest.TestCase):
    """Confirmed rescue / explicit no / not sure / no recorded observation."""

    def _snapshot_answers(self):
        """The snapshot's 26 answers (18 carbs / 3 no / 5 not-sure), all in-window."""
        rows = []
        for i in range(18):
            rows.append(_answer(WINDOW_END - timedelta(hours=i + 1), "carbs",
                                WINDOW_END - timedelta(minutes=30 * i)))
        for i in range(3):
            rows.append(_answer(WINDOW_END - timedelta(hours=30 + i), "no",
                                WINDOW_END - timedelta(hours=30 + i)))
        for i in range(5):
            rows.append(_answer(WINDOW_END - timedelta(hours=50 + i), "not-sure",
                                WINDOW_END - timedelta(hours=50 + i)))
        return rows

    def test_the_three_recorded_states_are_counted_separately(self):
        obs = observe([], self._snapshot_answers(), start=WINDOW_START, end=WINDOW_END,
                      observed_from=FIRST_OBSERVATION)
        self.assertEqual((obs.confirmed, obs.explicit_no, obs.not_sure), (18, 3, 5))
        self.assertEqual(obs.state, CONFIRMED_RESCUE)
        self.assertEqual(obs.to_dict()["states"],
                         {CONFIRMED_RESCUE: 18, EXPLICIT_NO: 3, NOT_SURE: 5})

    def test_not_sure_outranks_an_explicit_no(self):
        # A recorded "not sure" is unknown; it may not read as evidence of absence.
        rows = [_answer(datetime(2026, 7, 10, 3), "no", datetime(2026, 7, 10, 4)),
                _answer(datetime(2026, 7, 11, 3), "not-sure", datetime(2026, 7, 11, 4))]
        obs = observe([], rows, start=datetime(2026, 7, 6), end=WINDOW_END,
                      observed_from=FIRST_OBSERVATION)
        self.assertEqual(obs.state, NOT_SURE)

    def test_explicit_no_is_recorded_evidence_over_an_observed_window(self):
        rows = [_answer(datetime(2026, 7, 10, 3), "no", datetime(2026, 7, 10, 4))]
        obs = observe([], rows, start=datetime(2026, 7, 6), end=WINDOW_END,
                      observed_from=FIRST_OBSERVATION)
        self.assertEqual(obs.state, EXPLICIT_NO)

    def test_absence_over_an_unobserved_span_is_no_recorded_observation(self):
        # The same "no" answer cannot speak for the 15 days before the log existed.
        rows = [_answer(datetime(2026, 7, 10, 3), "no", datetime(2026, 7, 10, 4))]
        obs = observe([], rows, start=WINDOW_START, end=WINDOW_END,
                      observed_from=FIRST_OBSERVATION)
        self.assertEqual(obs.state, NO_RECORDED_OBSERVATION)
        self.assertEqual(obs.explicit_no, 1)

    def test_an_answer_given_after_the_endpoint_does_not_speak_for_the_window(self):
        rows = [_answer(datetime(2026, 7, 8, 3), "carbs", datetime(2026, 7, 19, 9))]
        obs = observe([], rows, start=datetime(2026, 7, 6),
                      end=datetime(2026, 7, 12), observed_from=FIRST_OBSERVATION)
        self.assertEqual(obs.confirmed, 0)
        self.assertEqual(obs.state, NO_RECORDED_OBSERVATION)

    def test_a_false_low_flag_is_not_a_rescue_state(self):
        # #381's reading invalidation says nothing about carbs.
        rows = [_answer(datetime(2026, 7, 10, 3), "false-low", datetime(2026, 7, 10, 4))]
        obs = observe([], rows, start=datetime(2026, 7, 6), end=WINDOW_END,
                      observed_from=FIRST_OBSERVATION)
        self.assertEqual((obs.confirmed, obs.explicit_no, obs.not_sure), (0, 0, 0))

    def test_a_lone_old_false_low_does_not_start_rescue_coverage(self):
        # A `false-low` flag (#381) is a reading invalidation, not a rescue answer, so
        # even an old one must not make an otherwise-unwatched window read as observed.
        rows = [_answer(datetime(2026, 6, 1, 3), "false-low", datetime(2026, 6, 1, 4))]
        self.assertIsNone(first_observation([], rows))
        obs = observe([], rows, start=WINDOW_START, end=WINDOW_END)
        self.assertIsNone(obs.observed_from)
        self.assertEqual(obs.observed_days, 0)
        self.assertFalse(obs.fully_observed)
        self.assertEqual((obs.confirmed, obs.explicit_no, obs.not_sure), (0, 0, 0))
        self.assertEqual(obs.state, NO_RECORDED_OBSERVATION)


class StrengthenNeedsObservedSilenceTest(unittest.TestCase):
    """An unobserved stretch is not silence: no stronger corrections off it (#413/#467)."""

    def _clean_stronger_fit(self):
        """Eight synthetic nights whose true ISF (25) reads stronger than programmed 36.

        Built by the same generator ``test_analyzer_isf`` uses, so the fit is a real
        regression over real steps rather than a hand-set flag.
        """
        from .test_analyzer_isf import ISF_36, synth_night

        rng = random.Random(7)
        plans = [[(1, 0, 3.0)], [(2, 0, 4.0), (4, 0, 2.0)], [(1, 30, 5.0)],
                 [(3, 0, 3.5)], [(0, 30, 2.0), (3, 30, 4.0)], [(2, 0, 6.0)],
                 [(1, 0, 3.0), (4, 30, 2.5)], [(2, 30, 5.0)]]
        bolus, basal, cgm = [], [], []
        for i, plan in enumerate(plans):
            b, ba, c = synth_night(i + 1, 25.0, plan, noise_sd=1.5, rng=rng)
            bolus += b
            basal += ba
            cgm += c
        return bolus, basal, cgm, ISF_36

    def _run(self, observation):
        bolus, basal, cgm, programmed = self._clean_stronger_fit()
        return analyze_isf(bolus, basal, cgm, programmed, window_days=30,
                           prior_strengthen_signal=True,
                           rescue_observation=observation)[0]

    def _coverage(self, observed_from):
        return observe([], [], start=datetime(2026, 6, 1), end=datetime(2026, 6, 9),
                       observed_from=observed_from)

    def test_a_fully_observed_window_still_strengthens(self):
        seg = self._run(self._coverage(datetime(2026, 5, 20)))
        self.assertEqual(seg.evidence["direction"], "strengthen")
        self.assertLess(seg.recommended, 36.0)

    def test_a_partly_unobserved_window_does_not_strengthen(self):
        # Same data, same clean overnight fit — only the rescue-log coverage differs.
        seg = self._run(self._coverage(datetime(2026, 6, 5)))
        self.assertIsNone(seg.evidence["direction"])
        self.assertIsNone(seg.recommended)
        self.assertFalse(seg.evidence["strengthen_signal"])
        self.assertIn("stays as it is", seg.annotation.lower())

    def test_a_never_observed_window_does_not_strengthen(self):
        seg = self._run(self._coverage(None))
        self.assertIsNone(seg.evidence["direction"])
        self.assertIsNone(seg.recommended)

    def test_the_card_reports_the_coverage_it_used(self):
        seg = self._run(self._coverage(datetime(2026, 6, 5)))
        self.assertEqual(seg.evidence["rescue_evidence"]["observed_days"], 4)
        self.assertEqual(seg.evidence["rescue_evidence"]["window_days"], 8)
        self.assertEqual(seg.evidence["rescue_evidence"]["state"],
                         NO_RECORDED_OBSERVATION)
        self.assertEqual(seg.evidence["recurrence_channels"]["rescue_observed_days"], 4)
        self.assertFalse(seg.evidence["recurrence_channels"]["measurement_asserts"])

    def test_missing_coverage_leaves_the_analyzer_unchanged(self):
        # The pure-analyzer callers pass no coverage at all; they must read as before.
        seg = self._run(None)
        self.assertEqual(seg.evidence["direction"], "strengthen")
        self.assertIsNone(seg.evidence["recurrence_channels"]["rescue_observed_days"])

    def test_a_weaken_is_unaffected_by_missing_coverage(self):
        # Absence never suppresses a low-driven hold: recurring correction lows still
        # own the weaken direction over a window the rescue log never covered.
        lows = [PrintedLow(datetime(2026, 6, d, 3, 0, 0), 55.0, 1.2, HarmArm.ISF)
                for d in (1, 2, 3, 4)]
        seg = analyze_isf([], [], [], [(0, 40.0)], harm_config=HarmConfig(),
                          harm_lows=lows, window_days=30,
                          rescue_observation=self._coverage(None))[0]
        self.assertEqual(seg.evidence["direction"], "weaken")


def _facade_store(*, rescue_created_at, today_carb_created_at=None):
    """A store whose prior weekly ISF endpoint contains one masked rescue.

    Flat 120 CGM (no printed lows, so nothing near the rescue reads as a treated low),
    5-min basal, and one correction bolus 60 min before a manual rescue carb on
    2026-06-16 — inside the 7-day-back ISF window ``[06-13, 07-13]`` and outside
    today's ``[06-20, 07-20]``. ``rescue_created_at`` is when that entry was recorded.

    ``today_carb_created_at`` (optional) adds a second manual carb whose *event* time
    (2026-07-10) sits inside today's window ``[06-20, 07-20]``, recorded at the given
    time — used to prove today's endpoint applies the same created-at eligibility.
    """
    store = Store.open(":memory:")
    basal, cgm = [], []
    t = datetime(2026, 6, 10, 0, 0, 0)
    while t <= WINDOW_END:
        basal.append({"seq_num": int(t.strftime("%Y%m%d%H%M%S")),
                      "time": t.strftime("%Y-%m-%d %H:%M:%S"),
                      "delivery_type": "algorithmDelivery", "duration_mins": 5,
                      "basal_rate": 0.8, "profile_basal_rate": 0.6})
        cgm.append({"EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
                    "Readings (CGM / BGM)": 120, "Description": "EGV"})
        t += timedelta(minutes=5)
    store.upsert_basal(basal)
    store.upsert_cgm(cgm)
    store.upsert_bolus([{
        "request_time": "2026-06-16 02:00:00", "seq_num": 1, "description": "Bolus",
        "insulin": 4.0, "carbs": None, "completion_time": "2026-06-16 02:00:00",
    }])
    store.upsert_settings_snapshot(
        "2026-06-10 09:00:00",
        parse_pump_settings({"profiles": {"activeIdp": 4, "profile": [
            {"name": "4", "idp": 4, "insulinDuration": 300, "carbEntry": 1,
             "maxBolus": 15000,
             "tDependentSegs": [{"startTime": 0, "basalRate": 600, "isf": 36,
                                 "carbRatio": 6000, "targetBg": 110}]
                               + [{"startTime": 0, "basalRate": 0, "isf": 0,
                                   "carbRatio": 0, "targetBg": 0}] * 15}]},
            "cgmSettings": {}}))
    store.upsert_carb_entry(_entry(datetime(2026, 6, 16, 3, 0, 0),
                                   created_at=rescue_created_at))
    if today_carb_created_at is not None:
        store.upsert_carb_entry(_entry(datetime(2026, 7, 10, 3, 0, 0),
                                       created_at=today_carb_created_at))
    return store


class ReplayBoundaryThroughTheFacadeTest(unittest.TestCase):
    """Both ISF decision endpoints apply the boundary — the prior one is the trap."""

    def _rescue_days_per_endpoint(self, *, rescue_created_at):
        from ciq_autotune.analyzers.isf import analyze_isf as real_analyze_isf

        store = _facade_store(rescue_created_at=rescue_created_at)
        try:
            with patch("ciq_autotune.analyze.analyze_isf",
                       wraps=real_analyze_isf) as spy:
                result = analyze(store, window_days=30, now=WINDOW_END,
                                 carb_entries=store.carb_entries())
            prior, current = spy.call_args_list
            return (prior.kwargs["correction_rescue_days"],
                    current.kwargs["correction_rescue_days"],
                    prior.kwargs["rescue_observation"], result)
        finally:
            store.close()

    def test_a_rescue_logged_live_counts_in_the_window_it_happened_in(self):
        prior_days, today_days, observation, _ = self._rescue_days_per_endpoint(
            rescue_created_at=datetime(2026, 6, 16, 3, 5, 0))
        self.assertEqual(prior_days, 1)
        # The event time sits before today's window, so only the prior endpoint sees it.
        self.assertEqual(today_days, 0)
        self.assertEqual(observation.end, WINDOW_END - timedelta(days=7))

    def test_a_rescue_backfilled_later_is_excluded_from_the_earlier_window(self):
        # Identical event time; recorded five days after that window's endpoint.
        prior_days, today_days, _, _ = self._rescue_days_per_endpoint(
            rescue_created_at=datetime(2026, 7, 18, 9, 0, 0))
        self.assertEqual(prior_days, 0)
        self.assertEqual(today_days, 0)

    def _prior_carb_stream(self, *, rescue_created_at):
        """The carb_entries stream `analyze` hands the 7-day-back `analyze_isf`."""
        from ciq_autotune.analyzers.isf import analyze_isf as real_analyze_isf

        store = _facade_store(rescue_created_at=rescue_created_at)
        try:
            with patch("ciq_autotune.analyze.analyze_isf",
                       wraps=real_analyze_isf) as spy:
                analyze(store, window_days=30, now=WINDOW_END,
                        carb_entries=store.carb_entries())
            prior, _current = spy.call_args_list
            return prior.kwargs["carb_entries"]
        finally:
            store.close()

    def test_the_boundary_filters_the_prior_isf_carb_stream_too(self):
        # The prior endpoint's fasting steps + strengthen signal are computed inside
        # `analyze_isf` from its carb stream, so the created-at boundary must reach that
        # stream — not only `prior_rescue_days`. A rescue logged live before the prior
        # endpoint stays in the stream; the same event backfilled after it drops out.
        live = self._prior_carb_stream(rescue_created_at=datetime(2026, 6, 16, 3, 5, 0))
        self.assertEqual(len(live), 1)
        backfilled = self._prior_carb_stream(
            rescue_created_at=datetime(2026, 7, 18, 9, 0, 0))
        self.assertEqual(backfilled, [])

    def test_the_result_reports_the_coverage_and_says_it_is_unknown(self):
        # The log's only entry was recorded 2026-07-18 09:00, so it covers 1 whole day
        # of the window's 30: the rest is unknown, and the result must say so.
        _, _, _, result = self._rescue_days_per_endpoint(
            rescue_created_at=datetime(2026, 7, 18, 9, 0, 0))
        evidence = result.isf[0].evidence["rescue_evidence"]
        self.assertEqual(evidence["window_days"], 30)
        self.assertEqual(evidence["observed_days"], 1)
        self.assertFalse(evidence["fully_observed"])
        notes = " ".join(result.data_quality.notes)
        self.assertIn("rescue-carb log covers 1 of the last 30 day(s)", notes)
        self.assertIn("unknown", notes)

    def test_a_log_older_than_the_window_reads_as_fully_observed(self):
        _, _, _, result = self._rescue_days_per_endpoint(
            rescue_created_at=datetime(2026, 6, 16, 3, 5, 0))
        evidence = result.isf[0].evidence["rescue_evidence"]
        self.assertTrue(evidence["fully_observed"])
        self.assertEqual(evidence["observed_days"], 30)
        self.assertNotIn("rescue-carb log covers",
                         " ".join(result.data_quality.notes))

    def test_no_rescue_log_at_all_reads_as_unknown_not_rescue_free(self):
        store = _facade_store(rescue_created_at=datetime(2026, 6, 16, 3, 5, 0))
        try:
            result = analyze(store, window_days=30, now=WINDOW_END)  # no carb stream
        finally:
            store.close()
        evidence = result.isf[0].evidence["rescue_evidence"]
        self.assertIsNone(evidence["observed_from"])
        self.assertEqual(evidence["observed_days"], 0)
        self.assertEqual(evidence["state"], NO_RECORDED_OBSERVATION)
        self.assertIn("No rescue carbs have ever been logged",
                      " ".join(result.data_quality.notes))


class CurrentEndpointBoundaryTest(unittest.TestCase):
    """Today's public `analyze` endpoint applies the same created-at boundary (#467).

    A carb whose event time lands in today's window but whose `created_at` is after
    ``now`` was not recorded when this read closed, so it must reach none of the three
    exclusion-consuming analyzers — basal clean minutes, the current fasting-ISF steps,
    and I:C meal exclusion.
    """

    def _carbs_seen_by_each_analyzer(self, *, today_carb_created_at):
        from ciq_autotune.analyzers.basal import analyze_basal as real_basal
        from ciq_autotune.analyzers.ic import analyze_ic as real_ic
        from ciq_autotune.analyzers.isf import analyze_isf as real_isf

        store = _facade_store(rescue_created_at=datetime(2026, 6, 16, 3, 5, 0),
                              today_carb_created_at=today_carb_created_at)
        try:
            with patch("ciq_autotune.analyze.analyze_basal", wraps=real_basal) as b_spy, \
                 patch("ciq_autotune.analyze.analyze_ic", wraps=real_ic) as c_spy, \
                 patch("ciq_autotune.analyze.analyze_isf", wraps=real_isf) as i_spy:
                analyze(store, window_days=30, now=WINDOW_END,
                        carb_entries=store.carb_entries())
            # analyze_isf runs twice (prior endpoint, then today); today is the second.
            _prior, current_isf = i_spy.call_args_list
            return {
                "basal": b_spy.call_args.kwargs["carb_entries"],
                "isf": current_isf.kwargs["carb_entries"],
                "ic": c_spy.call_args.kwargs["carb_entries"],
            }
        finally:
            store.close()

    def _has_today_carb(self, entries):
        return any(e.t == datetime(2026, 7, 10, 3, 0, 0) for e in entries)

    def test_a_live_today_carb_reaches_all_three_analyzers(self):
        seen = self._carbs_seen_by_each_analyzer(
            today_carb_created_at=datetime(2026, 7, 10, 3, 5, 0))
        for analyzer in ("basal", "isf", "ic"):
            self.assertTrue(self._has_today_carb(seen[analyzer]),
                            f"{analyzer} should see the live today carb")

    def test_a_backfilled_today_carb_reaches_none_of_them(self):
        # Same event time, recorded after today's endpoint: it may not retroactively
        # change clean minutes, fasting steps, or meal exclusion.
        seen = self._carbs_seen_by_each_analyzer(
            today_carb_created_at=WINDOW_END + timedelta(days=5))
        for analyzer in ("basal", "isf", "ic"):
            self.assertFalse(self._has_today_carb(seen[analyzer]),
                             f"{analyzer} must not see the backfilled today carb")


class ObservationIsNotAnEventTimeReplacementTest(unittest.TestCase):
    """Event time keeps doing its own jobs once a row is eligible."""

    def test_event_time_still_drives_the_window_slice_and_attribution(self):
        # Eligible (recorded long ago) but its carbs happened outside the window: the
        # boundary is a second predicate, never a substitute for the `t` slice.
        entry = _entry(datetime(2026, 6, 1, 3, 0, 0),
                       created_at=datetime(2026, 6, 1, 3, 5, 0))
        self.assertEqual(eligible_carb_entries([entry], WINDOW_END), [entry])
        self.assertEqual([e for e in eligible_carb_entries([entry], WINDOW_END)
                          if WINDOW_START <= e.t <= WINDOW_END], [])

    def test_observation_object_keeps_the_window_it_describes(self):
        obs = RescueObservation(start=WINDOW_START, end=WINDOW_END,
                                observed_from=FIRST_OBSERVATION,
                                observed_days=15, window_days=30)
        self.assertEqual(obs.start, WINDOW_START)
        self.assertEqual(obs.end, WINDOW_END)


if __name__ == "__main__":
    unittest.main()
