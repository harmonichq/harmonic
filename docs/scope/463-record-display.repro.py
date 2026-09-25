"""#463 reproduction (triage, 2026-09-24), in process on synthetic stores.

1. Float tails: every served outcome difference on the committed QA showcase
   (retained reassessments and saved endings) that is not already at one decimal.
2. Clock views: c4-profile's saved ending against its retained reassessment.
3. A Trial that `_reconcile_plan` matches to a Plan (a profile switch dated at a
   pump read) still serves the observed context, with no decision.
4. A Trial the dose stream detects, with a Plan confirmed from a pump read: the
   Trial never meets the Plan (the #431 test's shape).
5. Dating: a correction-factor and carb-ratio edit made mid-morning, where the
   day's first bolus carries the old values.

No server, no fetch, no real data. Run from the repo root:
    uv run python docs/scope/463-record-display.repro.py
"""
import shutil
import sys
import tempfile
from dataclasses import asdict
from datetime import datetime, timedelta

sys.path.insert(0, ".")
import ciq_autotune.watched_change as wc
from ciq_autotune.guidance import plan_deliverable
from ciq_autotune.store import Store
from ciq_autotune.events import BolusEvent
from scripts.qa_e2e_cases import QA_CASES, materialize_case

SHOWCASE = "mockups/qa-e2e.synthetic/harmonic.sqlite"


def tails(rows):
    return [(row["key"], row.get("before"), row.get("after"), row["difference"]) for row in rows or []
            if row.get("difference") is not None and repr(row["difference"]) != repr(round(row["difference"], 1))]


with tempfile.TemporaryDirectory() as scratch:
    print("1. Served differences with a float tail, a reconciled scratch copy of the committed showcase")
    shutil.copy(SHOWCASE, f"{scratch}/showcase.sqlite")
    with Store.open(f"{scratch}/showcase.sqlite") as store:
        wc.reconcile_ingested_follow_up(store)
        now = max(r.t for r in store.cgm_readings())
        for record in store.follow_up_records("trial"):
            saved = tails(((record["ending"].get("assessment") or {}).get("outcomes")))
            read = wc.review_trials(store, now=now, selected=record["id"], assessment="retained")["selected"]
            retained = tails(read["reassessment"]["comparison"].get("outcomes"))
            for source, found in (("saved ending", saved), ("retained", retained)):
                for key, before, after, difference in found:
                    print(f"   {record['id']} {source}: {key} before {before} after {after} difference {difference!r}")

    print("2. c4-profile: clock views on the saved ending and on the retained read")
    with Store.open(f"{scratch}/c4-profile.sqlite") as store:
        materialize_case(store, next(case for case in QA_CASES if case.name == "c4-profile"))
        now = max(r.t for r in store.cgm_readings())
        for record in store.follow_up_records("trial"):
            assessment = record["ending"]["assessment"]
            read = wc.review_trials(store, now=now, selected=record["id"], assessment="retained")["selected"]
            views = read["reassessment"]["comparison"]["views"]
            print(f"   {record['id']} ended {record['ending']['kind']}: saved assessment {assessment['state']},"
                  f" views saved {'views' in assessment}; retained read clock bins"
                  f" before {len(views['before']['clock'])} after {len(views['after']['clock'])}")

    print("3. A Trial matched to a Plan by `_reconcile_plan`")
    from tests.test_watched_change import EveryRecordEndsTest, _at, _day
    case = EveryRecordEndsTest("test_j_a_plan_receipt_is_unchanged_by_the_ending")
    case.setUp()
    store = case.store
    profiles = case.pump_read_pair()
    items = [{"type": "isf", "start_min": 0, "value": 36}]
    store.save_plan_draft(items, _at(5, 0))
    plan = store.apply_plan(_at(5, 0))
    decision = {"version": "386:1", "state": "available", "captured_at": _at(5, 0), "input_revision": 1,
                "action": [{"recommended": 36, "units": "mg/dL/U"}], "explanation": "Synthetic correction-factor decision",
                "source_window": {"start": _at(1, 0), "end": _at(5, 0)}, "policy": "synthetic:1",
                "subjects": ["setting:isf"], "occurrences": [], "settings": [{"value": 36, "unit": "mg/dL/U"}],
                "support": {}, "unknowns": []}
    with store.follow_up_transaction():
        store.save_follow_up_record({"kind": "plan", "id": plan["applied_at"], "version": "386:1", **plan,
            "decision_context": decision,
            "deliverable": {"version": "386:1", "state": "available", "source_profile": asdict(profiles[0]),
                            "rows": plan_deliverable([asdict(s) for s in profiles[0].segments], items)}})
    case.reconcile(_day(60))
    record = case.records()[_at(10, 6)]
    served = wc.review_trials(store, now=_day(60), selected=record["id"])["selected"]["original"]["context"]
    print(f"   {record['id']}: receipt {record['reconciliation']['state']} naming Plan {record['reconciliation']['applied_at']};"
          f" served original context action {served['action']!r}, explanation {served['explanation']!r}")
    case.tearDown()

print("4. A dose-detected Trial and a Plan confirmed from a pump read")
from tests.test_plan_verdict import ServerConfirmationTest
case = ServerConfirmationTest("test_a_change_the_dose_stream_detects_still_confirms_from_the_read")

case.setUp()
try:
    case.test_a_change_the_dose_stream_detects_still_confirms_from_the_read()
    with Store.open_readonly(case.path) as store:
        trial = store.follow_up_records("trial")[0]
        plan = store.follow_up_records("plan")[0]
        now = max(r.t for r in store.cgm_readings())
        served = wc.review_trials(store, now=now, selected=trial["id"])["selected"]["original"]["context"]
        print(f"   Trial {trial['id']} changed_at {trial['changed_at']}; Plan recorded {plan['applied_at']},"
              f" confirmed from read {plan['reconciliation']['observed_snapshot']['captured_at']} with trial_id"
              f" {plan['reconciliation']['trial_id']!r}; Trial receipt {trial['reconciliation']['state']};"
              f" served original context action {served['action']!r}")
finally:
    case.doCleanups()

print("5. Dating a mid-morning edit the dose stream detects")
day = datetime(2024, 3, 10)
boluses = []
for n in range(-3, 3):
    for hour, minute in ((8, 0), (12, 30), (18, 30)):
        t = day + timedelta(days=n, hours=hour, minutes=minute)
        new = n > 0 or (n == 0 and hour >= 10)
        boluses.append(BolusEvent(t=t, description="Bolus", completion="Completed", insulin=4.0, carbs=40,
                                  isf=44.0 if new else 40.0, carb_ratio=9.0 if new else 10.0, target_bg=110.0))
edit = day + timedelta(hours=10)
first_new = min(b.t for b in boluses if b.isf == 44.0)
for parameter in ("isf", "carb_ratio"):
    start = wc.dose_regimes(boluses, parameter)[-1].start
    print(f"   {parameter} regime starts {start:%Y-%m-%d %H:%M}")
candidates = wc._review_candidates([], boluses, [], [], mature_window=wc._MATURE_WINDOW, horizon_start=datetime.min)
for cand in candidates:
    print(f"   Trial candidate {cand.parameter} dated {cand.start:%Y-%m-%d %H:%M}: edit at {edit:%H:%M},"
          f" first bolus carrying the new values {first_new:%H:%M};"
          f" dated {(edit - cand.start).total_seconds() / 3600:.1f} h before the edit")
