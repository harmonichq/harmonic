"""#442 triage premises: which retained Trial records a reconcile leaves open, and
what ADR 442's one ending rule would record for each.

Run from the repository root (in process, no server, no port, scratch copies only):

    PYTHONPATH=. uv run python openspec/changes/backfilled-record-endings/premises.py 2>/dev/null

``rule()`` is the spike of ADR 442's decision, read-only. For every retained
Trial record without an ending, oldest first, it returns ``reverted`` at the
detector's reversal, else ``superseded`` at the earliest detected change later
than the record and inside its watch window, else ``expired_unreviewed`` at
the window's end once the reconcile instant has reached it, else open. It also
reports whether the record's retained comparison context came from a pump read
at or before that ending instant ("bounded") or after it
(``context_after_ending``). Nothing here writes to a committed store. Synthetic
stores only; the output is dates and codes, no record-level values.
"""
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from ciq_autotune import watched_change as wc
from ciq_autotune.settings import PumpSettings, ProfileSegment, ProfileSettings
from ciq_autotune.follow_up_comparison import compare_follow_up
from ciq_autotune.store import Store
from scripts.qa_e2e_cases import QA_CASES, materialize_case

CASES = ("c3-trial", "c3-history", "c3-preempted", "c4-missing", "c4-history",
         "c4-ic", "c4-isf", "c4-profile", "edit-chain")
FMT = "%Y-%m-%d %H:%M:%S"


def data_tail(store):
    times = ([r.t for r in store.cgm_readings()] + [r.t for r in store.basal_events()]
             + [r.t for r in store.bolus_events()] + [s.captured_at for s in store.settings_snapshots()])
    return max(times)


def rule(store, record, now, starts):
    """ADR 442's decision for one open record; (kind, effective instant) or (None, None)."""
    changed = datetime.fromisoformat(record["changed_at"])
    expiry = changed + wc._WATCH_HORIZON
    reversal = wc._reversal_at(store, record)
    if reversal is not None:
        return "reverted", reversal
    successor = next((start for start in starts if start > changed), None)
    if successor is not None and successor < expiry:
        return "superseded", successor
    if now >= expiry:
        return "expired_unreviewed", expiry
    return None, None


def bound(record, at):
    context = record.get("comparison_context") or {}
    if context.get("state") != "available":
        return f"unavailable ({context.get('reason')})"
    source = (context.get("source_snapshot") or {}).get("captured_at")
    if source is None or datetime.fromisoformat(source) > at:
        return "context_after_ending"
    return "bounded"


def report(label, store, now=None):
    now = now or data_tail(store)
    frontier = store.follow_up_frontier() or {}
    trials = wc._reviewable_trials(store, now, horizon_start=datetime.min)
    starts = sorted({datetime.fromisoformat(t.view.changed_at) for t in trials})
    records = sorted(store.follow_up_records("trial"), key=lambda r: (r["changed_at"], r["id"]))
    print(f"{label}: data tail {now.strftime(FMT)}, {len(records)} retained, frontier "
          f"{frontier.get('trial_id')}, {len(trials)} detected")
    for record in records:
        ending = record["ending"]
        role = "frontier" if record["id"] == frontier.get("trial_id") else "history"
        if "kind" in ending:
            cutoff = (ending.get("assessment") or {}).get("data_cutoff")
            print(f"  {record['changed_at']} {role} ended {ending['kind']} at {ending['effective_at']}; "
                  f"saved cutoff {cutoff} (ADR 442 cutoff {ending['effective_at']}); "
                  f"context {bound(record, datetime.fromisoformat(ending['effective_at']))}")
            continue
        kind, at = rule(store, record, now, starts)
        decided = f"{kind} at {at.strftime(FMT)}; context {bound(record, at)}" if kind else "stays open"
        if kind and bound(record, at) == "bounded":
            decided += "; saved assessment " + saved(store, record, kind, at)
        print(f"  {record['changed_at']} {role} OPEN today -> ADR 442: {decided}")


def saved(store, record, kind, at):
    """The comparison ADR 442 would save for a bounded ending, computed read-only."""
    proposed = {**record, "ending": {"kind": kind, "effective_at": at.strftime(FMT)}}
    comparison = compare_follow_up(store, record=proposed, data_cutoff=at,
                                   input_revision=store.input_data_revision())["comparison"]
    after = (comparison.get("periods") or {}).get("after") or {}
    return (f"{comparison['availability']['state']}/{comparison['availability']['reason']}, "
            f"After ends {after.get('end')} ({(after.get('boundary_reasons') or {}).get('end')}), "
            f"read to {after.get('data_cutoff')}")


def bolus_rows(spans, day):
    rows, seq = [], 0
    for isf, ic, lo, hi in spans:
        for n in range(lo, hi + 1):
            seq += 1
            t = (day(n) + timedelta(hours=8)).strftime(FMT)
            rows.append({"seq_num": seq, "request_time": t, "completion_time": t,
                         "description": "Bolus", "completion": "Completed", "insulin": 5.0,
                         "isf": isf, "carb_ratio": ic, "carbs": 40})
    return rows


def settings(isf):
    segment = ProfileSegment(start_min=0, basal_rate=0.6, isf=isf, carb_ratio=7.0, target_bg=110)
    profile = ProfileSettings(idp=1, name="1", dia_min=300, carb_entry=True, max_bolus=15.0,
                              segments=(segment,))
    return PumpSettings(active_idp=1, profiles=(profile,))


def issue_store(with_later_read):
    """The issue's failing-first shape: four detected ISF changes, each more than
    one watch window apart, reconciled once. Optionally one pump read after all
    of them, so every retained context is read after each older ending."""
    base = datetime(2026, 5, 1)
    day = lambda n: base + timedelta(days=n)
    store = Store.open(":memory:")
    store.upsert_bolus(bolus_rows([(30, 7.0, 1, 9), (45, 7.0, 10, 49), (35, 7.0, 50, 89),
                                   (50, 7.0, 90, 129), (40, 7.0, 130, 169)], day))
    if with_later_read:
        store.upsert_settings_snapshot(day(169).strftime(FMT), settings(40))
    with store.follow_up_transaction():
        wc.reconcile_follow_up(store, now=day(170), recorded_at=day(170))
    return store, day(170)


def cross_setting_store():
    """A live frontier: an ISF change reconciled, then a carb-ratio change ten days
    later reconciled. Today's frontier rule ends the ISF record superseded."""
    base = datetime(2026, 5, 1)
    day = lambda n: base + timedelta(days=n)
    store = Store.open(":memory:")
    store.upsert_bolus(bolus_rows([(30, 7.0, 1, 9), (45, 7.0, 10, 15)], day))
    with store.follow_up_transaction():
        wc.reconcile_follow_up(store, now=day(15), recorded_at=day(15))
    rows = bolus_rows([(30, 7.0, 1, 9), (45, 7.0, 10, 19), (45, 9.0, 20, 25)], day)
    store.upsert_bolus(rows)
    with store.follow_up_transaction():
        wc.reconcile_follow_up(store, now=day(25), recorded_at=day(25))
    return store, day(25)


def main():
    for label, with_read in (("issue-store", False), ("issue-store+later-read", True)):
        store, now = issue_store(with_read)
        report(label, store, now)
        store.close()
    store, now = cross_setting_store()
    report("live-cross-setting", store, now)
    store.close()
    with tempfile.TemporaryDirectory() as scratch:
        for name in CASES:
            path = Path(scratch) / f"{name}.sqlite"
            with Store.open(str(path)) as store:
                materialize_case(store, next(case for case in QA_CASES if case.name == name))
                report(name, store)
    tail = datetime(2024, 6, 1, 23, 59)
    shifted = [datetime(2024, 5, 15), datetime(2024, 5, 22), datetime(2024, 5, 23), datetime(2024, 5, 24)]
    print("edit-chain with its four records 14 days later: "
          + ", ".join(f"{d.strftime('%m-%d')} window ends {(d + wc._WATCH_HORIZON).strftime('%m-%d')}"
                      for d in shifted)
          + f"; open at tail {tail.strftime(FMT)}: {all(d + wc._WATCH_HORIZON > tail for d in shifted)}")


if __name__ == "__main__":
    main()
