"""#426: build_scenarios hoists the window-invariant timeline inputs.

``/scenarios`` rebuilds a display timeline once per episode, and each rebuild used
to re-read + re-parse the *entire* CGM history to derive false-low excursion
records (and re-read the settings snapshots) — window-invariant work that scaled
with the episode count. ``build_scenarios`` now computes those once and threads
them into every episode's window build; ``timeline()`` keeps its own windowed
reads and still clamps the hoisted records per window.

These tests pin the two properties that matter:

* the output is **byte-identical** to recomputing the records in-line per episode
  (the hoist is a pure perf refactor — no episode, pattern, or window changes);
* the unbounded full-history CGM read happens **O(1)** times per build, not once
  per episode — the guard that catches a regression reintroducing the per-episode
  read (it would have counted one read per episode before the fix).
"""

import json
import unittest
from datetime import datetime, timedelta

import ciq_autotune.timeline as timeline_module
from ciq_autotune.analyzers.scenario import Lever
from ciq_autotune.analyzers.scenario.engine import build_scenarios
from ciq_autotune.settings import parse_pump_settings
from ciq_autotune.store import Store

_NOW = datetime(2026, 6, 12, 12, 0)


def _cgm_rows(day, h, m, start_bg, slope, minutes, step=5):
    t0 = datetime(2026, 6, day, h, m, 0)
    rows = []
    for k in range(minutes // step + 1):
        t = t0 + timedelta(minutes=step * k)
        rows.append({"EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
                     "Readings (CGM / BGM)": start_bg + slope * step * k,
                     "Description": "EGV"})
    return rows


def _seed_over_treated_lows(store, days):
    """One over-treated-low excursion per day: a correction bolus, a plunge to a
    ~50 nadir, then an over-treated rebound — each attributes an OVER_TREATED_LOW
    lever, so the engine builds one episode (and one timeline) per day."""
    seg = {"startTime": 0, "basalRate": 600, "isf": 30, "carbRatio": 7000, "targetBg": 110}
    raw = {"profiles": {"activeIdp": 4, "profile": [
        {"name": "4", "idp": 4, "insulinDuration": 300, "carbEntry": 1,
         "maxBolus": 15000, "tDependentSegs": [seg]}]}, "controlIqSettings": {}}
    store.upsert_settings_snapshot("2026-06-01 00:00:00", parse_pump_settings(raw))

    bolus, cgm = [], []
    for i, day in enumerate(days):
        ds = "2026-06-%02d" % day
        bolus.append({"seq_num": i + 1, "request_time": ds + " 13:00:00",
                      "description": "Standard", "insulin": "3.0",
                      "requested_insulin": "3.0", "carbs": "0", "bg": "180",
                      "user_override": "0", "extended_bolus": "0",
                      "completion": "Completed", "completion_time": ds + " 13:00:30"})
        cgm += _cgm_rows(day, 12, 0, 120, 0, 60)
        cgm += _cgm_rows(day, 13, 0, 180, -4.0, 60)    # plunge 180 -> 60
        cgm += _cgm_rows(day, 14, 0, 60, -0.5, 20)     # nadir ~50
        cgm += _cgm_rows(day, 14, 20, 50, 5.0, 60)     # over-treated rebound
        cgm += _cgm_rows(day, 15, 20, 350, -4.0, 60)   # back down
    store.upsert_cgm(cgm)
    store.upsert_bolus(bolus)


class BuildScenariosHoistTest(unittest.TestCase):
    def setUp(self):
        self.store = Store.open(":memory:")
        self.addCleanup(self.store.close)
        # 10 days → 9 built episodes (the last day's excursion runs past `now`).
        _seed_over_treated_lows(self.store, range(2, 12))

    def _serialize(self, report):
        return json.dumps(report.to_dict(), sort_keys=True, default=str)

    def test_multiple_episodes_built(self):
        # The whole point is a fan-out of per-episode timelines; assert there are
        # enough episodes that an O(episodes) read would be plainly distinguishable
        # from an O(1) one.
        report = build_scenarios(self.store, window_days=30, now=_NOW)
        self.assertGreaterEqual(len(report.episodes), 3)

    def test_output_byte_identical_to_inline_recompute(self):
        # The shipped path (hoisted records + snaps threaded into every window build)
        # vs. the old path (each timeline recomputes them in-line). Byte-for-byte
        # equal: the hoist changes performance only.
        hoisted = build_scenarios(self.store, window_days=30, now=_NOW)

        real_timeline = timeline_module.timeline

        def inline(store, s, e, **_hoisted):
            return real_timeline(store, s, e)   # drop the hoisted kwargs

        timeline_module.timeline = inline
        try:
            recomputed = build_scenarios(self.store, window_days=30, now=_NOW)
        finally:
            timeline_module.timeline = real_timeline

        self.assertEqual(self._serialize(hoisted), self._serialize(recomputed))

    def test_full_history_cgm_read_is_o1_not_per_episode(self):
        # Guard: the unbounded (full-history) CGM read must stay a small constant,
        # independent of episode count. Before the fix every episode's timeline
        # issued one, so this counted one-per-episode and would fail here.
        unbounded = [0]
        real_cgm = self.store.cgm_readings

        def counting(start=None, end=None):
            if start is None and end is None:
                unbounded[0] += 1
            return real_cgm(start, end)

        self.store.cgm_readings = counting
        try:
            report = build_scenarios(self.store, window_days=30, now=_NOW)
        finally:
            self.store.cgm_readings = real_cgm

        self.assertGreaterEqual(len(report.episodes), 3)   # timelines really fanned out
        self.assertLessEqual(unbounded[0], 2)              # yet O(1) full reads


class FutureRescueAnswerNotAppliedToPatternsTest(unittest.TestCase):
    """A rescue answer recorded after `now` must not reclassify the current path (#467).

    ``build_scenarios`` (the Patterns / current-view path) reads its low-prompt answers
    through the shared ``low_prompt_answers`` helper, which now enforces the endpoint. So
    a ``no`` answer logged after this build's ``now`` — one that did not exist when the
    view closed — cannot suppress an over-treated low, while the same answer logged live
    does. End-to-end through the emitted episodes, not the helper in isolation.
    """

    NOW = datetime(2026, 6, 6, 12, 0)

    def _store(self):
        store = Store.open(":memory:")
        self.addCleanup(store.close)
        _seed_over_treated_lows(store, [5])   # one over-treated low on 2026-06-05
        return store

    def _over_treated(self, report):
        return [e for e in report.episodes.values() if e.lever == Lever.OVER_TREATED_LOW]

    def test_future_no_leaves_the_over_treated_low_but_a_live_no_suppresses_it(self):
        base = build_scenarios(self._store(), window_days=30, now=self.NOW)
        eps = self._over_treated(base)
        self.assertEqual(len(eps), 1)              # baseline: the low IS over-treated
        nadir_t = eps[0].steps[0].t               # the anchor the answer must match

        live = self._store()
        live.record_prompt_response(detector="low", anchor_t=nadir_t, answer="no",
                                    answered_at=self.NOW - timedelta(hours=1))
        self.assertEqual(
            len(self._over_treated(build_scenarios(live, window_days=30, now=self.NOW))),
            0)                                     # live `no` suppresses it

        future = self._store()
        future.record_prompt_response(detector="low", anchor_t=nadir_t, answer="no",
                                      answered_at=self.NOW + timedelta(days=2))
        self.assertEqual(
            len(self._over_treated(build_scenarios(future, window_days=30, now=self.NOW))),
            1)                                     # future `no` did not exist yet — kept


if __name__ == "__main__":
    unittest.main()
