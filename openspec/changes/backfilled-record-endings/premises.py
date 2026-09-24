"""#442 triage premises: which retained Trial records a reconcile leaves open, and
what ADR 442's one ending rule would record for each.

Run from the repository root (in process, no server, no port, scratch copies only):

    PYTHONPATH=. uv run python openspec/changes/backfilled-record-endings/premises.py 2>/dev/null

``rule()`` is the spike of ADR 442's decision, read-only. For every retained
Trial record without an ending, oldest first, it returns ``reverted`` at the
detector's reversal, else ``superseded`` at the earliest detected change later
than the record, outside the record's own ADR 414 Edit (read through the
existing ``_group_edits``) and inside its watch window, else
``expired_unreviewed`` at the window's end once the reconcile instant has
reached it, else open. ``label_table()`` is the spike of the one-line
period-end label fix: it runs ``follow_up_comparison._setting_period`` with the
label line as it stands at base and as patched, on real stores, at each
record's ADR 442 cut. It also
reports whether the record's retained comparison context came from a pump read
at or before that ending instant ("bounded") or after it
(``context_after_ending``). ``apply_rule()`` records those endings through
``capture_ending`` on the in-memory ``late_settling_bridge`` store only. Nothing
here writes to a committed store. Synthetic stores only; the output is dates and
codes, no record-level values.
"""
import inspect
import tempfile
import textwrap
from datetime import datetime, timedelta
from pathlib import Path

from ciq_autotune import follow_up_comparison as fc
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


def rule(store, record, now, starts, edit_of):
    """ADR 442's decision for one open record; (kind, effective instant) or (None, None).

    ``starts`` is this reconcile's detected changes as sorted (instant, id)
    pairs; ``edit_of`` maps a retained record id to its ADR 414 Edit key, or is
    None for the triage-round-1 rule, which had no Edit exclusion."""
    changed = datetime.fromisoformat(record["changed_at"])
    expiry = changed + wc._WATCH_HORIZON
    reversal = wc._reversal_at(store, record)
    if reversal is not None:
        return "reverted", reversal
    successor = next((start for start, identity in starts if start > changed
                      and (edit_of is None or edit_of.get(identity) != edit_of.get(record["id"]))), None)
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
    starts = sorted((datetime.fromisoformat(t.view.changed_at), wc._review_id(t.view, t.block))
                    for t in trials)
    records = sorted(store.follow_up_records("trial"), key=lambda r: (r["changed_at"], r["id"]))
    edit_of, _ = wc._group_edits(records)
    print(f"{label}: data tail {now.strftime(FMT)}, {len(records)} retained, frontier "
          f"{frontier.get('trial_id')}, {len(trials)} detected")
    for record in records:
        ending = record["ending"]
        role = "frontier" if record["id"] == frontier.get("trial_id") else "history"
        if "kind" in ending:
            assessment = ending.get("assessment") or {}
            after = (assessment.get("periods") or {}).get("after") or {}
            print(f"  {record['changed_at']} {role} ended {ending['kind']} at {ending['effective_at']}; "
                  f"saved cutoff {assessment.get('data_cutoff')} (ADR 442 cutoff {ending['effective_at']}); "
                  f"saved After end {(after.get('boundary_reasons') or {}).get('end')}; "
                  f"context {bound(record, datetime.fromisoformat(ending['effective_at']))}")
            continue
        kind, at = rule(store, record, now, starts, edit_of)
        decided = f"{kind} at {at.strftime(FMT)}; context {bound(record, at)}" if kind else "stays open"
        r1_kind, r1_at = rule(store, record, now, starts, None)
        if (r1_kind, r1_at) != (kind, at):
            decided += f"; without the Edit exclusion: {r1_kind} at {r1_at.strftime(FMT)}"
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


def profile(idp, isf):
    segment = ProfileSegment(start_min=0, basal_rate=0.6, isf=isf, carb_ratio=7.0, target_bg=110)
    return ProfileSettings(idp=idp, name=str(idp), dia_min=300, carb_entry=True, max_bolus=15.0,
                           segments=(segment,))


def settings(isf):
    return PumpSettings(active_idp=1, profiles=(profile(1, isf),))


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


def multi_slot_store():
    """A detected multi-slot basal edit: the 01:00 and 03:00 slots both move on
    day 10 (one ADR 414 Edit, two records two hours apart), the 05:00 slot moves
    on day 20 (the next Edit). Reconciled once on day 60."""
    base = datetime(2026, 5, 1)
    day = lambda n: base + timedelta(days=n)
    store = Store.open(":memory:")
    rows, seq = [], 0
    for n in range(1, 61):
        for hour, moved_on in ((1, 10), (3, 10), (5, 20)):
            seq += 1
            rate = 0.7 if n >= moved_on else 0.6
            rows.append({"seq_num": seq, "time": (day(n) + timedelta(hours=hour)).strftime(FMT),
                         "delivery_type": "Profile", "duration_mins": 30,
                         "basal_rate": rate, "profile_basal_rate": rate})
    store.upsert_basal(rows)
    with store.follow_up_transaction():
        wc.reconcile_follow_up(store, now=day(60), recorded_at=day(60))
    return store, day(60)


def dose_pair_store():
    """Task 1.4 (l): two carb-ratio changes nine days apart, known only from the
    dose-stamped boluses, one pump read before both (so the retained context is
    bounded), reconciled once after both windows."""
    base = datetime(2026, 5, 1)
    day = lambda n: base + timedelta(days=n)
    store = Store.open(":memory:")
    store.upsert_settings_snapshot(day(0).strftime(FMT), settings(40))
    store.upsert_bolus(bolus_rows([(40, 7.0, 1, 9), (40, 8.0, 10, 18), (40, 9.0, 19, 60)], day))
    with store.follow_up_transaction():
        wc.reconcile_follow_up(store, now=day(60), recorded_at=day(60))
    return store, day(60)


def pump_read_pair_store():
    """Task 1.4 (b): two correction-factor changes nine days apart, each captured
    by a pump read at the change (a profile switch), one pump read before both,
    doses stamped to match, reconciled once after both windows."""
    base = datetime(2026, 5, 1)
    day = lambda n: base + timedelta(days=n)
    store = Store.open(":memory:")
    profiles = (profile(1, 40), profile(2, 36), profile(3, 32))
    for n, active in ((0, 1), (10, 2), (19, 3)):
        store.upsert_settings_snapshot((day(n) + timedelta(hours=6)).strftime(FMT),
                                       PumpSettings(active_idp=active, profiles=profiles))
    store.upsert_bolus(bolus_rows([(40, 7.0, 1, 9), (36, 7.0, 10, 18), (32, 7.0, 19, 60)], day))
    with store.follow_up_transaction():
        wc.reconcile_follow_up(store, now=day(60), recorded_at=day(60))
    return store, day(60)


def profile3(idp, isf, carb_ratio, target):
    segment = ProfileSegment(start_min=0, basal_rate=0.6, isf=isf, carb_ratio=carb_ratio,
                             target_bg=target)
    return ProfileSettings(idp=idp, name=str(idp), dia_min=300, carb_entry=True, max_bolus=15.0,
                           segments=(segment,))


def apply_rule(store, now):
    """Record ADR 442's endings on this in-memory store, as the implementation
    will, through capture_ending: oldest first, data cut at each ending."""
    trials = wc._reviewable_trials(store, now, horizon_start=datetime.min)
    starts = sorted((datetime.fromisoformat(t.view.changed_at), wc._review_id(t.view, t.block))
                    for t in trials)
    records = sorted(store.follow_up_records("trial"), key=lambda r: (r["changed_at"], r["id"]))
    edit_of, _ = wc._group_edits(records)
    with store.follow_up_transaction():
        for record in records:
            if "kind" in record["ending"]:
                continue
            kind, at = rule(store, record, now, starts, edit_of)
            if kind:
                wc.capture_ending(store, store.follow_up_record("trial", record["id"]), kind=kind,
                                  effective_at=at, recorded_at=now, data_cutoff=at)


def late_settling_bridge():
    """Cold pass 2's reproduction: an ISF switch 05-11 20:00, a carb-ratio edit
    known only from doses stamped from 05-12, a target switch 05-13 06:00;
    reconciles at 05-13 07:00 and 19:00. The first reconcile ends the ISF
    record against the target switch in another Edit; the carb-ratio change
    settles only by the second and then chains all three into one Edit."""
    at = lambda day, hour: datetime(2026, 5, day, hour)
    store = Store.open(":memory:")
    reads = ((at(1, 6), 1, (profile3(1, 40, 7.0, 110),)),
             (at(11, 20), 2, (profile3(1, 40, 7.0, 110), profile3(2, 36, 7.0, 110))),
             (at(13, 6), 3, (profile3(1, 40, 7.0, 110), profile3(2, 36, 8.0, 110),
                             profile3(3, 36, 8.0, 120))))
    for captured, active, profiles in reads:
        store.upsert_settings_snapshot(captured.strftime(FMT),
                                       PumpSettings(active_idp=active, profiles=profiles))

    def doses(last_day):
        rows = []
        for n in range(1, last_day + 1):
            t = at(n, 8).strftime(FMT)
            isf, ic, target = (40, 7.0, 110) if n <= 11 else (36, 8.0, 110 if n < 13 else 120)
            rows.append({"seq_num": n, "request_time": t, "completion_time": t,
                         "description": "Bolus", "completion": "Completed", "insulin": 5.0,
                         "isf": isf, "carb_ratio": ic, "target_bg": target, "carbs": 40})
        return rows

    for last_day, now in ((12, at(13, 7)), (13, at(13, 19))):
        store.upsert_bolus(doses(last_day))
        with store.follow_up_transaction():
            wc.reconcile_follow_up(store, now=now, recorded_at=now)
        apply_rule(store, now)
        records = sorted(store.follow_up_records("trial"), key=lambda r: (r["changed_at"], r["id"]))
        _, edits = wc._group_edits(records)
        print(f"late-settling-bridge after the reconcile at {now.strftime(FMT)}: "
              f"{len(edits)} Edit(s) {[e['count'] for e in edits]}")
        for record in records:
            ending = record["ending"]
            state = (f"{ending['kind']} at {ending['effective_at']}" if "kind" in ending
                     else "open")
            print(f"  {record['changed_at']} {record['parameter']}: {state}")
    store.close()


BASE_LABEL = '"next_relevant_setting_change" if following < cutoff else "data_tail")'
PATCHED_LABEL = '"next_relevant_setting_change" if index + 1 < len(runs) else "data_tail")'


def setting_period_variants():
    """``_setting_period`` with its label line as at base and as patched, built
    from the module's own source (either side may be the one installed)."""
    source = textwrap.dedent(inspect.getsource(fc._setting_period))
    if BASE_LABEL in source:
        sources = source, source.replace(BASE_LABEL, PATCHED_LABEL)
    elif PATCHED_LABEL in source:
        sources = source.replace(PATCHED_LABEL, BASE_LABEL), source
    else:
        raise SystemExit("the period-end label line moved; update premises.py")
    built = []
    for code in sources:
        namespace = dict(vars(fc))
        exec(compile(code, fc.__file__, "exec"), namespace)
        built.append(namespace["_setting_period"])
    return built


def label_table(label, store, now):
    """The After end label each record's saved assessment gets at its ADR 442 cut."""
    base, patched = setting_period_variants()
    trials = wc._reviewable_trials(store, now, horizon_start=datetime.min)
    starts = sorted((datetime.fromisoformat(t.view.changed_at), wc._review_id(t.view, t.block))
                    for t in trials)
    records = sorted(store.follow_up_records("trial"), key=lambda r: (r["changed_at"], r["id"]))
    edit_of, _ = wc._group_edits(records)
    for record in records:
        ending = record["ending"]
        if "kind" in ending:
            kind, cut = ending["kind"], datetime.fromisoformat(ending["effective_at"])
        else:
            kind, cut = rule(store, record, now, starts, edit_of)
        if kind is None:
            continue
        times = [x.t for x in store.cgm_readings() + store.bolus_events() + store.basal_events()
                 if x.t < cut]
        earliest = min(times)
        ends = [variant(store, record, cut, earliest) for variant in (base, patched)]
        print(f"  label {label} {record['changed_at']} {kind} cut {cut.strftime(FMT)}: After ends "
              f"{ends[1][2].strftime(FMT)}; base {ends[0][4]} | patched {ends[1][4]}")


def main():
    for label, build in (("multi-slot-edit", multi_slot_store),
                         ("pump-read-pair", pump_read_pair_store),
                         ("dose-pair", dose_pair_store)):
        store, now = build()
        report(label, store, now)
        if label != "multi-slot-edit":
            label_table(label, store, now)
        store.close()
    for label, with_read in (("issue-store", False), ("issue-store+later-read", True)):
        store, now = issue_store(with_read)
        report(label, store, now)
        store.close()
    late_settling_bridge()
    store, now = cross_setting_store()
    report("live-cross-setting", store, now)
    store.close()
    with tempfile.TemporaryDirectory() as scratch:
        for name in CASES:
            path = Path(scratch) / f"{name}.sqlite"
            with Store.open(str(path)) as store:
                materialize_case(store, next(case for case in QA_CASES if case.name == name))
                report(name, store)
                if name == "c4-ic":
                    label_table(name, store, data_tail(store))
    tail = datetime(2024, 6, 1, 23, 59)
    shifted = [datetime(2024, 5, 15), datetime(2024, 5, 22), datetime(2024, 5, 23), datetime(2024, 5, 24)]
    print("edit-chain with its four records 14 days later: "
          + ", ".join(f"{d.strftime('%m-%d')} window ends {(d + wc._WATCH_HORIZON).strftime('%m-%d')}"
                      for d in shifted)
          + f"; open at tail {tail.strftime(FMT)}: {all(d + wc._WATCH_HORIZON > tail for d in shifted)}")


if __name__ == "__main__":
    main()
