"""Trial + Focus — the single active watched change (#244, ADR 0029).

At most one is active at a time — Trial XOR Focus, pump wins. These tests exercise
the Focus view derivation, the one-active invariant in both directions through the
committed admission, and a retained Trial's bounded per-record reads (#414).
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.events import BolusEvent
from ciq_autotune.store import Store
from ciq_autotune import watched_change as wc

BASE = datetime(2026, 5, 1, 0, 0, 0)


def _day(n):
    return BASE + timedelta(days=n)


def _bolus(day, *, isf=None, ic=None, target=None, hour=8):
    """A confirmed bolus carrying the pump's dose-stamped settings on ``day``."""
    return BolusEvent(
        t=_day(day) + timedelta(hours=hour),
        description="Bolus", completion="Completed", insulin=5.0, carbs=40,
        isf=isf, carb_ratio=ic, target_bg=target,
    )


def _isf_boluses(spans):
    """Boluses stamping ``isf`` = value across each (start_day, end_day_inclusive)."""
    out = []
    for value, lo, hi in spans:
        for d in range(lo, hi + 1):
            out.append(_bolus(d, isf=value, ic=7.0, target=110))
    return out


class FocusViewTest(unittest.TestCase):
    def test_pattern_focus_adds_identity_but_keeps_lever_derived_copy(self):
        row = {"id": 4, "lever": "late_bolus", "pattern_key": "highs_after_meals",
               "pinned_at": "2026-07-01 08:00:00", "status": "active"}
        view = wc.focus_view(row).to_dict()
        self.assertEqual(view["subject"], "pattern:highs_after_meals")
        self.assertEqual(view["pattern_key"], "highs_after_meals")
        self.assertEqual(view["title"], "Late bolus")
        self.assertEqual(view["target_metric"], "arc")

    def test_all_setting_pattern_is_not_pinnable(self):
        self.assertFalse(wc.is_pinnable("basal_rate", "overnight_lows_no_iob"))

    def test_meal_lever_outcome_is_arc(self):
        v = wc.focus_view({"id": 1, "lever": "late_bolus",
                           "pinned_at": "2026-07-01 08:00:00", "status": "active"})
        self.assertEqual(v.kind, "focus")
        self.assertEqual(v.lever, "late_bolus")
        self.assertEqual(v.title, "Late bolus")
        self.assertEqual(v.target_metric, "arc")

    def test_low_lever_outcome_is_tbr(self):
        v = wc.focus_view({"id": 2, "lever": "over_treated_low",
                           "pinned_at": "2026-07-01 08:00:00", "status": "active"})
        self.assertEqual(v.target_metric, "tbr")

    def test_override_lever_pinnable_with_title(self):
        self.assertIn("user_override", wc.pinnable_levers())
        v = wc.focus_view({"id": 3, "lever": "user_override",
                           "pinned_at": "2026-07-01 08:00:00", "status": "active"})
        self.assertTrue(v.title)

    def test_pinnable_universe_is_behavioral_only(self):
        universe = wc.pinnable_levers()
        self.assertIn("late_bolus", universe)
        self.assertIn("missed_meal", universe)
        # A parameter is a tuning knob, never a pinnable behavioral lever.
        self.assertNotIn("isf", universe)
        self.assertNotIn("basal_rate", universe)
        self.assertTrue(wc.is_pinnable("late_bolus"))
        self.assertFalse(wc.is_pinnable("isf"))


class OneActiveInvariantTest(unittest.TestCase):
    def setUp(self):
        self.store = Store.open(":memory:")

    def reconcile(self, boluses=(), now=None):
        self.store.upsert_bolus([{
            "seq_num": index + 1, "request_time": str(b.t), "completion_time": str(b.t),
            "description": "Bolus", "completion": "Completed", "insulin": b.insulin,
            "isf": b.isf, "carb_ratio": b.carb_ratio, "carbs": b.carbs,
        } for index, b in enumerate(boluses)])
        with self.store.follow_up_transaction():
            wc.reconcile_follow_up(self.store, now=now or _day(10), recorded_at=now or _day(10))

    def tearDown(self):
        self.store.close()

    def test_focus_surfaces_when_no_trial(self):
        self.store.pin_focus("late_bolus", "2026-05-06 08:00:00")
        self.reconcile()
        active = wc.active_watched_change(
            self.store, [], [], [], now=_day(10))
        self.assertEqual(active.kind, "focus")
        self.assertEqual(active.lever, "late_bolus")

    def test_removed_lever_focus_is_dropped_instead_of_breaking_verify(self):
        self.store.pin_focus(
            "overnight_low_from_evening_dosing", "2026-05-06 08:00:00"
        )
        self.reconcile()
        active = wc.active_watched_change(
            self.store, [], [], [], now=_day(10)
        )
        self.assertIsNone(active)
        self.assertIsNone(self.store.active_focus())
        self.assertEqual(self.store.list_focuses()[0]["status"], "dropped")

    def test_setting_change_preempts_and_drops_focus(self):
        self.store.pin_focus("late_bolus", "2026-05-06 08:00:00")
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])  # change at day 5
        self.reconcile(bolus, _day(8))
        active = wc.active_watched_change(
            self.store, [], bolus, [], now=_day(8))
        # Trial takes the slot; the Focus is dropped (not paused), not surfaced.
        self.assertEqual(active.kind, "trial")
        self.assertIsNone(self.store.active_focus())
        self.assertEqual(self.store.list_focuses()[0]["status"], "dropped")

    def test_trial_active_blocks_a_pin(self):
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])
        self.reconcile(bolus, _day(8))
        self.assertTrue(wc.trial_is_active(
            self.store, bolus_events=bolus, now=_day(8)))
        # Caller-supplied slices cannot change the committed admission.
        self.assertTrue(wc.trial_is_active(
            self.store, bolus_events=[], now=_day(8)))

    def test_trial_admission_blocks_a_pattern_focus_pin(self):
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])
        self.reconcile(bolus, _day(8))
        admission = wc.follow_up_admission(self.store, now=_day(8))
        self.assertEqual(admission["active_kind"], "trial")
        self.assertFalse(admission["focus_pin"]["available"])

    def test_trial_preempts_an_active_pattern_focus(self):
        unavailable = {"version": "386:1", "state": "unavailable",
                       "reason": "not_recorded"}
        with self.store.follow_up_transaction():
            focus = self.store.pin_focus(
                "late_bolus", "2026-05-06 08:00:00", "highs_after_meals",
            )
            self.store.save_follow_up_record({
                "kind": "focus", "id": focus["id"], "version": "386:1", **focus,
                "decision_context": unavailable, "comparison_context": unavailable,
            })
        bolus = _isf_boluses([(30, 1, 4), (45, 5, 8)])
        self.reconcile(bolus, _day(8))
        self.assertIsNone(self.store.active_focus())
        record = self.store.follow_up_record("focus", focus["id"])
        self.assertEqual(record["ending"]["kind"], "trial_preempted")

    def test_nothing_watched_returns_none(self):
        self.assertIsNone(wc.active_watched_change(
            self.store, [], [], [], now=_day(8)))


class _SpyStore(Store):
    """A Store that records the ``start``/``end`` every read call receives."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cgm_calls = []
        self.bolus_calls = []

    def cgm_readings(self, start=None, end=None):
        self.cgm_calls.append((start, end))
        return super().cgm_readings(start, end)

    def bolus_events(self, start=None, end=None):
        self.bolus_calls.append((start, end))
        return super().bolus_events(start, end)


def _save_retained_trial(store, *, record_id, parameter, slot, changed_at, before, after):
    with store.follow_up_transaction():
        store.save_follow_up_record({
            "kind": "trial", "id": record_id, "version": "386:1",
            "parameter": parameter, "slot": slot, "changed_at": changed_at,
            "before": before, "after": after,
            "first_observed_at": changed_at,
            "observed_context": wc._unavailable("not_recorded"),
        })


class BoundedRetainedReadTest(unittest.TestCase):
    """#414 1.1: `_retained_trial`'s per-record store reads are bounded to the
    record's own ``[changed_at, end + 1s)`` window, never a whole-table scan —
    and the +1s pad keeps a reading landing exactly on the boundary in."""

    def setUp(self):
        self.store = _SpyStore.open(":memory:")

    def tearDown(self):
        self.store.close()

    def test_reads_are_bounded_per_retained_record_and_keep_the_boundary_reading(self):
        changed_1 = datetime(2024, 1, 1, 0, 0, 0)
        changed_2 = datetime(2024, 1, 1, 2, 0, 0)
        # `now` lands exactly on both records' own bounded-window end (`min(now,
        # changed_at + _MATURE_WINDOW)` caps at `now` for both), an exact reading
        # instant (`_latest_instant`).
        latest_instant = changed_1 + wc._MATURE_WINDOW
        # Retained trial record ids are always the parameter/slot/changed_at
        # `_review_id` stamp (watched_change.py:1508) — mirror that format here so
        # the roster row this test looks up actually matches its saved record.
        id_1 = f"isf-all-{changed_1.strftime('%Y%m%d%H%M%S')}"
        id_2 = f"isf-all-{changed_2.strftime('%Y%m%d%H%M%S')}"
        _save_retained_trial(self.store, record_id=id_1, parameter="isf",
                             slot=None, changed_at=changed_1.strftime(wc._DT_FMT),
                             before=30.0, after=40.0)
        _save_retained_trial(self.store, record_id=id_2, parameter="isf",
                             slot=None, changed_at=changed_2.strftime(wc._DT_FMT),
                             before=40.0, after=45.0)
        # A single CGM reading exactly at `end` — the store's own read is half-open
        # [start, end) while `_maturing`/`_data_gaps` accept (changed_at, end], so
        # without the +1s pad this reading falls right outside the store's window.
        self.store.upsert_cgm([{
            "EventDateTime": latest_instant.strftime("%Y-%m-%dT%H:%M:%S"),
            "Readings (CGM / BGM)": 120, "Description": "Synthetic EGV",
        }])

        result = wc.review_trials(self.store, now=latest_instant)

        unbounded = [c for c in self.store.cgm_calls if c == (None, None)]
        bounded = [c for c in self.store.cgm_calls if c != (None, None)]
        # Exactly one whole-table read: `_reviewable_trials`'s candidate detection.
        self.assertEqual(len(unbounded), 1)
        # One bounded read per retained record — never the whole table.
        self.assertEqual(len(bounded), 2)
        read_end = (latest_instant + timedelta(seconds=1)).strftime(wc._DT_FMT)
        self.assertIn((changed_1.strftime(wc._DT_FMT), read_end), bounded)
        self.assertIn((changed_2.strftime(wc._DT_FMT), read_end), bounded)

        row = next(r for r in result["trials"] if r["id"] == id_1)
        # The boundary reading is not dropped: it lands inside the bounded window,
        # so maturity and the gap count read exactly as an unbounded scan would.
        self.assertEqual(row["maturing"]["days_elapsed"], 1)
        self.assertEqual(row["maturing"]["gap_count"], 14)


if __name__ == "__main__":
    unittest.main()
