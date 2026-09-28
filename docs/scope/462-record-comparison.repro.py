"""#462 reproduction (triage, 2026-09-24), in process on synthetic case stores.

1. c4-isf's recipe plus one unchanged pump read after its watch window, then its
   one reconcile: the saved ending and each reassessment mode, on the same build
   and after a simulated update (a different whole-package code hash).
2. c4-ic's superseded carb-ratio record: where each mode's Trial period ends,
   against the record's ending instant.

No server, no fetch, no real data. Run from the repo root:
    uv run python docs/scope/462-record-comparison.repro.py
"""
import sys
import tempfile
from datetime import datetime
from unittest import mock

sys.path.insert(0, ".")
import ciq_autotune.follow_up_comparison as comparison_module
import ciq_autotune.watched_change as watched_change
from ciq_autotune.store import Store
from scripts.qa_e2e_cases import QA_CASES, _materialize_c4_setting, materialize_case

NOW = datetime(2024, 7, 2)


def summary(read):
    comparison = read.get("comparison", read)
    availability = comparison.get("availability") or {"state": read.get("state"), "reason": read.get("reason")}
    periods = comparison.get("periods") or {}
    views = comparison.get("views") or {}
    return (f"{availability['state']}"
            f"{' · ' + availability['reason'] if availability.get('reason') else ''}, "
            f"{len(periods)} periods, {len(comparison.get('outcomes') or [])} outcomes, "
            f"clock views {'yes' if any((views.get(arm) or {}).get('clock') for arm in ('before', 'after')) else 'no'}"
            f"{', state ' + comparison['assessment']['state'] if comparison.get('assessment') and availability['state'] == 'available' else ''}")


def later_read_recipe(store):
    real = watched_change.reconcile_ingested_follow_up

    def with_later_read(store):
        last = store.settings_snapshots()[-1]
        store.upsert_settings_snapshot("2024-06-30 12:00:00", last.settings)
        return real(store)

    with mock.patch.object(watched_change, "reconcile_ingested_follow_up", with_later_read):
        _materialize_c4_setting(store, parameter="isf")


def reads(store, identity):
    out = {}
    for mode in ("original", "retained", "current"):
        selected = watched_change.review_trials(store, now=NOW, selected=identity, assessment=mode)["selected"]
        out[mode] = selected["original"]["assessment"] if mode == "original" else selected["reassessment"]
    return out


with tempfile.TemporaryDirectory() as scratch:
    print("1. c4-isf plus one unchanged pump read after the window")
    with Store.open(f"{scratch}/c4-isf-later-read.sqlite") as store:
        later_read_recipe(store)
        record = store.follow_up_records("trial")[0]
        print(f"   record {record['id']} ending {record['ending']['kind']} at {record['ending']['effective_at']};"
              f" context pump read {record['comparison_context']['source_snapshot']['captured_at']}")
        same = reads(store, record["id"])
        real_execution = comparison_module._execution
        updated = lambda: {**real_execution(), "code_version": "0" * 64}
        with mock.patch.object(comparison_module, "_execution", updated):
            after_update = reads(store, record["id"])
        for mode, label in (("original", "Saved ending"), ("retained", "Retained context"), ("current", "Current policy")):
            print(f"   {label:17} same build: {summary(same[mode])}")
            print(f"   {'':17} after update: {summary(after_update[mode])}")

    print("2. c4-ic's superseded record: Trial period end against the ending instant")
    with Store.open(f"{scratch}/c4-ic.sqlite") as store:
        materialize_case(store, next(case for case in QA_CASES if case.name == "c4-ic"))
        for record in sorted(store.follow_up_records("trial"), key=lambda r: r["changed_at"]):
            ending = record["ending"]
            if ending.get("kind") != "superseded":
                continue
            print(f"   record {record['id']} superseded at {ending['effective_at']}")
            saved = (ending["assessment"].get("periods") or {}).get("after", {})
            print(f"   {'Saved ending':17} Trial period ends {saved.get('end')}")
            for mode, label in (("retained", "Retained context"), ("current", "Current policy")):
                selected = watched_change.review_trials(store, now=NOW, selected=record["id"], assessment=mode)["selected"]
                after = selected["reassessment"]["comparison"]["periods"].get("after", {})
                later = after.get("end", "") > ending["effective_at"]
                print(f"   {label:17} Trial period ends {after.get('end')}"
                      f"{' — after the ending' if later else ''}")
