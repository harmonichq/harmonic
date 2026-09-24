"""Trial + Focus — the single active watched change (#244, ADR 0029).

At most one is active at a time — Trial XOR Focus, pump wins. These tests exercise
the Focus view derivation, the one-active invariant in both directions through the
committed admission, and a retained Trial's bounded per-record reads (#414).
"""

import json
import unittest
from contextlib import nullcontext
from dataclasses import asdict
from datetime import datetime, timedelta
from unittest.mock import patch

from ciq_autotune.events import BolusEvent
from ciq_autotune.guidance import plan_deliverable
from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings
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

    def test_removed_lever_focus_is_dropped_not_watched(self):
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


def _at(n, hour=8):
    """``_day(n)`` at ``hour`` o'clock, as a stored record time."""
    return (_day(n) + timedelta(hours=hour)).strftime(wc._DT_FMT)


def _dose_rows(spans):
    """``upsert_bolus`` rows: one dose-stamped bolus a day at 08:00 across each
    (first day, last day inclusive, stamped settings) span."""
    rows = []
    for lo, hi, stamped in spans:
        for n in range(lo, hi + 1):
            rows.append({"seq_num": len(rows) + 1, "request_time": _at(n), "completion_time": _at(n),
                         "description": "Bolus", "completion": "Completed", "insulin": 5.0,
                         "carbs": 40, **stamped})
    return rows


def _stamps(pairs):
    """(isf, carb ratio, first day, last day) spans as dose-stamped settings."""
    return [(lo, hi, {"isf": isf, "carb_ratio": ic}) for isf, ic, lo, hi in pairs]


# Four correction-factor changes (05-11, 06-20, 07-30, 09-08), each more than one
# 28-day watch window after the one before: the issue's failing-first history.
_FOUR_OLD_CHANGES = _stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 49), (35, 7.0, 50, 89),
                             (50, 7.0, 90, 129), (40, 7.0, 130, 169)])

# A correction-factor change on 05-11, reconciled on 05-13; then the pump goes
# back to 30 on 05-15 and the carb ratio changes on 05-21, reconciled on 05-26.
_BEFORE_REVERSAL = _stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 12)])
_AFTER_REVERSAL = _stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 13), (30, 7.0, 14, 19), (30, 9.0, 20, 25)])


def _seg(start_min, basal, isf, cr, target):
    return ProfileSegment(start_min=start_min, basal_rate=basal, isf=isf,
                          carb_ratio=cr, target_bg=target)


def _profile(idp, segments):
    return ProfileSettings(idp=idp, name=str(idp), dia_min=300, carb_entry=True,
                           max_bolus=15.0, segments=tuple(segments))


class EveryRecordEndsTest(unittest.TestCase):
    """ADR 442: at each reconcile every retained Trial record without an ending
    ends by one rule, oldest first: reverted, else superseded by the first later
    detected change outside its own Edit and inside its watch window, else
    expired once that window has passed. Its saved assessment reads evidence
    only up to its ending instant. Every store is synthetic and every ending is
    recorded by the public reconcile path."""

    def setUp(self):
        self.store = Store.open(":memory:")

    def tearDown(self):
        self.store.close()

    def reconcile(self, now):
        with self.store.follow_up_transaction():
            wc.reconcile_follow_up(self.store, now=now, recorded_at=now)

    def pump_read(self, when, active_idp, profiles):
        self.store.upsert_settings_snapshot(when.strftime(wc._DT_FMT),
                                            PumpSettings(active_idp=active_idp, profiles=tuple(profiles)))

    def records(self):
        """Every retained Trial record by its change time, oldest first."""
        return {record["changed_at"]: record for record in sorted(
            self.store.follow_up_records("trial"), key=lambda record: (record["changed_at"], record["id"]))}

    def assertEnded(self, record, kind, effective_at):
        self.assertEqual((record["ending"].get("kind"), record["ending"].get("effective_at")),
                         (kind, effective_at))

    def pump_read_pair(self):
        """Two correction-factor profile switches nine days apart (05-11 and 05-20
        06:00), each captured by a pump read at the switch, one read before both,
        doses stamped to match."""
        profiles = [_profile(idp, [_seg(0, 0.6, isf, 7.0, 110)]) for idp, isf in ((1, 40), (2, 36), (3, 32))]
        for day, active in ((0, 1), (10, 2), (19, 3)):
            self.pump_read(_day(day) + timedelta(hours=6), active, profiles)
        self.store.upsert_bolus(_dose_rows(_stamps([(40, 7.0, 1, 9), (36, 7.0, 10, 18), (32, 7.0, 19, 60)])))
        return profiles

    def basal_edit(self, moved_on):
        """Programmed basal rows for the 01:00, 03:00 and 05:00 slots; each slot's
        rate steps up on the day ``moved_on`` names (never if absent)."""
        rows = []
        for n in range(1, 61):
            for hour in (1, 3, 5):
                rate = 0.7 if n >= moved_on.get(hour, 61) else 0.6
                rows.append({"seq_num": len(rows) + 1, "time": _at(n, hour),
                             "delivery_type": "Profile", "duration_mins": 30,
                             "basal_rate": rate, "profile_basal_rate": rate})
        self.store.upsert_basal(rows)

    def test_a_changes_older_than_the_window_all_end_on_one_reconcile(self):
        self.store.upsert_bolus(_dose_rows(_FOUR_OLD_CHANGES))
        self.reconcile(_day(170))
        records = self.records()
        self.assertEqual(list(records), [_at(10), _at(50), _at(90), _at(130)])
        for changed_at, expiry in zip(records, (_at(38), _at(78), _at(118), _at(158))):
            self.assertEnded(records[changed_at], "expired_unreviewed", expiry)

    def test_b_pump_read_supersession_says_its_period_ends_at_that_change(self):
        self.pump_read_pair()
        self.reconcile(_day(60))
        older, later = self.records()[_at(10, 6)], self.records()[_at(19, 6)]
        self.assertEnded(older, "superseded", _at(19, 6))
        after = older["ending"]["assessment"]["periods"]["after"]
        self.assertEqual((after["end"], after["boundary_reasons"]["end"]),
                         (_at(19, 6), "next_relevant_setting_change"))
        self.assertEnded(later, "expired_unreviewed", _at(47, 6))
        self.assertEqual(later["ending"]["assessment"]["periods"]["after"]["boundary_reasons"]["end"],
                         "data_tail")

    def test_c_a_later_change_of_another_setting_supersedes(self):
        self.store.upsert_bolus(_dose_rows(_stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 19), (45, 9.0, 20, 30)])))
        self.reconcile(_day(30))
        isf, carb_ratio = self.records()[_at(10)], self.records()[_at(20)]
        self.assertEqual((isf["parameter"], carb_ratio["parameter"]), ("isf", "carb_ratio"))
        self.assertEnded(isf, "superseded", _at(20))

    def test_d_a_reversal_comes_before_supersession(self):
        self.store.upsert_bolus(_dose_rows(_BEFORE_REVERSAL))
        self.reconcile(_day(12))
        self.assertNotIn("kind", self.records()[_at(10)]["ending"])
        self.store.upsert_bolus(_dose_rows(_AFTER_REVERSAL))
        self.reconcile(_day(25))
        self.assertEnded(self.records()[_at(10)], "reverted", _at(14))

    def test_e_a_record_inside_its_window_stays_open_and_watched(self):
        self.store.upsert_bolus(_dose_rows(_stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 20)])))
        self.reconcile(_day(20))
        record = self.records()[_at(10)]
        self.assertNotIn("kind", record["ending"])
        admission = wc.follow_up_admission(self.store, now=_day(20))
        self.assertEqual((admission["active_kind"], admission["active_id"]), ("trial", record["id"]))

    def test_f_a_second_reconcile_changes_no_saved_ending(self):
        profiles = self.pump_read_pair()
        self.reconcile(_day(60))
        first = {record["id"]: record["ending"] for record in self.store.follow_up_records("trial")}
        self.assertEqual(sorted(ending["kind"] for ending in first.values()),
                         ["expired_unreviewed", "superseded"])
        # Newer inputs: a third switch on 06-05 and doses through 07-10.
        self.pump_read(_day(35) + timedelta(hours=6), 4,
                       profiles + [_profile(4, [_seg(0, 0.6, 28, 7.0, 110)])])
        self.store.upsert_bolus(_dose_rows(_stamps([(40, 7.0, 1, 9), (36, 7.0, 10, 18),
                                                    (32, 7.0, 19, 34), (28, 7.0, 35, 70)])))
        self.reconcile(_day(70))
        second = {record["id"]: record["ending"] for record in self.store.follow_up_records("trial")}
        self.assertEqual(len(second), 3)
        self.assertEqual({identity: second[identity] for identity in first}, first)

    def test_g_an_expiry_recorded_after_the_fact_reads_data_to_its_own_instant(self):
        self.pump_read(_day(0) + timedelta(hours=6), 1, [_profile(1, [_seg(0, 0.6, 30, 7.0, 110)])])
        self.store.upsert_bolus(_dose_rows(_stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 41)])))
        self.reconcile(_day(41) + timedelta(hours=8))  # three days after the window ended
        ending = self.records()[_at(10)]["ending"]
        self.assertEqual((ending["kind"], ending["effective_at"], ending["recorded_at"]),
                         ("expired_unreviewed", _at(38), _at(41)))
        self.assertEqual(ending["assessment"]["data_cutoff"], _at(38))

    def test_h_a_context_read_after_the_ending_leaves_the_assessment_unavailable(self):
        self.store.upsert_bolus(_dose_rows(_FOUR_OLD_CHANGES))
        self.pump_read(_day(169), 1, [_profile(1, [_seg(0, 0.6, 40, 7.0, 110)])])
        self.reconcile(_day(170))
        records = self.records()
        self.assertEqual(len(records), 4)
        for record in records.values():
            assessment = record["ending"]["assessment"]
            self.assertEqual((assessment["state"], assessment["reason"]), ("unavailable", "context_after_ending"))
            self.assertEqual(assessment["data_cutoff"], record["ending"]["effective_at"])
            self.assertEqual(assessment["comparison_context"], record["comparison_context"])
            self.assertEqual((assessment["periods"], assessment["outcomes"]), ({}, []))

    def test_i_a_context_read_before_the_superseding_change_is_used(self):
        self.pump_read(_day(0) + timedelta(hours=6), 1, [_profile(1, [_seg(0, 0.6, 30, 7.0, 110)])])
        self.store.upsert_bolus(_dose_rows(_stamps([(30, 7.0, 1, 9), (45, 7.0, 10, 19), (45, 9.0, 20, 60)])))
        self.reconcile(_day(60))
        record = self.records()[_at(10)]
        self.assertEnded(record, "superseded", _at(20))
        assessment = record["ending"]["assessment"]
        self.assertNotEqual(assessment["reason"], "context_after_ending")
        self.assertEqual(assessment["comparison_context"], record["comparison_context"])
        self.assertEqual(assessment["data_cutoff"], _at(20))
        self.assertEqual(assessment["periods"]["after"]["data_cutoff"], _at(20))

    def test_j_a_plan_receipt_is_unchanged_by_the_ending(self):
        profiles = self.pump_read_pair()
        items = [{"type": "isf", "start_min": 0, "value": 36}]
        self.store.save_plan_draft(items, _at(5, 0))
        plan = self.store.apply_plan(_at(5, 0))
        deliverable = {"version": "386:1", "state": "available", "source_profile": asdict(profiles[0]),
                       "rows": plan_deliverable([asdict(s) for s in profiles[0].segments], items)}
        with self.store.follow_up_transaction():
            saved = self.store.save_follow_up_record({"kind": "plan", "id": plan["applied_at"], "version": "386:1",
                                                      **plan, "deliverable": deliverable})
        self.reconcile(_day(60))
        record = self.records()[_at(10, 6)]
        self.assertEnded(record, "superseded", _at(19, 6))
        receipt = {"version": "386:1", "state": "available", "applied_at": _at(5, 0),
                   "trial_id": "isf-all-20260511060000", "established_at": _at(60, 0),
                   "observed_snapshot": {"captured_at": _at(10, 6), "active_idp": 2},
                   "matched_deliverable": saved["deliverable"], "block": None}
        self.assertEqual(record["reconciliation"], receipt)
        self.assertEqual(self.store.follow_up_record("plan", _at(5, 0))["reconciliation"], receipt)

    def test_k_a_multi_slot_edit_ends_at_the_first_change_after_it(self):
        self.basal_edit({1: 10, 3: 10, 5: 20})
        self.reconcile(_day(60))
        records = self.records()
        self.assertEqual(list(records), [_at(10, 1), _at(10, 3), _at(20, 5)])
        self.assertEnded(records[_at(10, 1)], "superseded", _at(20, 5))
        self.assertEnded(records[_at(10, 3)], "superseded", _at(20, 5))

    def test_k_a_multi_slot_edit_without_a_later_change_expires(self):
        self.basal_edit({1: 10, 3: 10})
        self.reconcile(_day(60))
        records = self.records()
        self.assertEqual(list(records), [_at(10, 1), _at(10, 3)])
        self.assertEnded(records[_at(10, 1)], "expired_unreviewed", _at(38, 1))
        self.assertEnded(records[_at(10, 3)], "expired_unreviewed", _at(38, 3))

    def test_l_a_dose_detected_supersession_reads_data_through_that_change(self):
        self.pump_read(_day(0), 1, [_profile(1, [_seg(0, 0.6, 40, 7.0, 110)])])
        self.store.upsert_bolus(_dose_rows(_stamps([(40, 7.0, 1, 9), (40, 8.0, 10, 18), (40, 9.0, 19, 60)])))
        self.reconcile(_day(60))
        older = self.records()[_at(10)]
        self.assertEnded(older, "superseded", _at(19))
        after = older["ending"]["assessment"]["periods"]["after"]
        self.assertEqual((after["end"], after["boundary_reasons"]["end"]), (_at(19), "data_tail"))

    def test_m_a_change_that_settles_later_leaves_the_ending_as_recorded(self):
        profile = lambda idp, isf, ic, target: _profile(idp, [_seg(0, 0.6, isf, ic, target)])
        self.pump_read(_day(0) + timedelta(hours=6), 1, [profile(1, 40, 7.0, 110)])
        self.pump_read(_day(10) + timedelta(hours=20), 2, [profile(1, 40, 7.0, 110), profile(2, 36, 7.0, 110)])
        self.pump_read(_day(12) + timedelta(hours=6), 3, [profile(1, 40, 7.0, 110), profile(2, 36, 8.0, 110),
                                                         profile(3, 36, 8.0, 120)])
        spans = [(0, 10, {"isf": 40, "carb_ratio": 7.0, "target_bg": 110}),
                 (11, 11, {"isf": 36, "carb_ratio": 8.0, "target_bg": 110}),
                 (12, 12, {"isf": 36, "carb_ratio": 8.0, "target_bg": 120})]
        self.store.upsert_bolus(_dose_rows(spans[:2]))
        self.reconcile(_day(12) + timedelta(hours=7))
        records = self.records()
        self.assertEqual(list(records), [_at(10, 20), _at(12, 6)])
        self.assertEnded(records[_at(10, 20)], "superseded", _at(12, 6))
        first = records[_at(10, 20)]["ending"]
        self.store.upsert_bolus(_dose_rows(spans))
        self.reconcile(_day(12) + timedelta(hours=19))
        records = self.records()
        self.assertEqual(records[_at(11)]["parameter"], "carb_ratio")
        edits = wc.review_trials(self.store, now=_day(12) + timedelta(hours=19))["edits"]
        self.assertEqual([edit["count"] for edit in edits], [3])
        self.assertEqual(records[_at(10, 20)]["ending"], first)

    def test_one_history_read_per_reconcile_saves_what_a_read_per_record_saves(self):
        """ADR 442's reconcile cost: a pass reads the detector's history once and
        shares it across every open record. Each store is reconciled twice, once
        that way and once reading the history afresh for each record, and the
        follow-up rows each saves are byte-identical."""
        per_record = wc._reversal_at

        def reversal():
            self.store.upsert_bolus(_dose_rows(_BEFORE_REVERSAL))
            self.reconcile(_day(12))
            self.store.upsert_bolus(_dose_rows(_AFTER_REVERSAL))
            self.reconcile(_day(25))

        def later_read():
            self.store.upsert_bolus(_dose_rows(_FOUR_OLD_CHANGES))
            self.pump_read(_day(169), 1, [_profile(1, [_seg(0, 0.6, 40, 7.0, 110)])])
            self.reconcile(_day(170))

        def dose_pair():
            self.pump_read(_day(0), 1, [_profile(1, [_seg(0, 0.6, 40, 7.0, 110)])])
            self.store.upsert_bolus(_dose_rows(_stamps([(40, 7.0, 1, 9), (40, 8.0, 10, 18), (40, 9.0, 19, 60)])))
            self.reconcile(_day(60))

        # Each store, and the ending kinds its reconcile saves, oldest record first.
        scenarios = {
            "pump-read pair": (lambda: (self.pump_read_pair(), self.reconcile(_day(60))),
                               ["superseded", "expired_unreviewed"]),
            "multi-slot Edit": (lambda: (self.basal_edit({1: 10, 3: 10, 5: 20}), self.reconcile(_day(60))),
                                ["superseded", "superseded", "expired_unreviewed"]),
            "dose pair": (dose_pair, ["superseded", "expired_unreviewed"]),
            "reversal": (reversal, ["reverted", None]),
            "later pump read": (later_read, ["expired_unreviewed"] * 4),
        }
        for name, (build, kinds) in scenarios.items():
            saved, slot_reads = {}, {}
            for mode in ("shared", "per record"):
                self.store.close()
                self.store = Store.open(":memory:")
                reads = []
                counted = lambda events, real=wc.basal_slot_regimes: reads.append(1) or real(events)
                fresh = (patch.object(wc, "_reversal_at", lambda store, record, history=None:
                                      per_record(store, record))
                         if mode == "per record" else nullcontext())
                with fresh, patch.object(wc, "basal_slot_regimes", counted):
                    build()
                saved[mode] = json.dumps({kind: self.store.follow_up_records(kind) for kind in ("trial", "plan")}
                                         | {"frontier": self.store.follow_up_frontier()}, sort_keys=True)
                slot_reads[mode] = len(reads)
            with self.subTest(store=name):
                self.assertEqual(saved["shared"], saved["per record"])
                trials = sorted(json.loads(saved["shared"])["trial"], key=lambda r: (r["changed_at"], r["id"]))
                self.assertEqual([record["ending"].get("kind") for record in trials], kinds)
            if name == "multi-slot Edit":
                # Three open basal-slot records: one read of the basal history, not three.
                self.assertEqual(slot_reads["per record"] - slot_reads["shared"], 2)


if __name__ == "__main__":
    unittest.main()
