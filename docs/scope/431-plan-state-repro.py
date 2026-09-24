"""#431 in-process reproduction on a manufactured QA case store (synthetic only).

Path A: a Plan is recorded through the public route, then the pump's active
profile is edited IN PLACE (same IDP) to the Plan's deliverable and a settings
read lands after the decision. No dose-stream evidence, so no Trial.
Path B: the same in-place edit, and two days of pump-local basal events at the
edited rates, so the dose stream detects a basal-rate Trial.
Path C: two recorded Plans (the first withdrawn): the served history order.
Each path runs the server's reconciliation and reports what the server holds;
A and B also dump the served inputs plan-view.js's browser comparison reads,
which docs/scope/431-plan-state-repro.mjs replays.

Run from the repository root:
  PYTHONPATH=. uv run python docs/scope/431-plan-state-repro.py <out.json>
  node docs/scope/431-plan-state-repro.mjs <out.json>
"""
import json
import sys
import tempfile
import time
from dataclasses import replace
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from ciq_autotune.api import create_app
from ciq_autotune.settings import ProfileSegment
from ciq_autotune.store import Store
from ciq_autotune.watched_change import pending_plan, reconcile_ingested_follow_up
from scripts.qa_e2e_cases import QA_CASES, materialize_case

H = {"Authorization": "Bearer t"}


def setup():
    d = tempfile.mkdtemp()
    path = d + "/synthetic.sqlite"
    with Store.open(path) as store:
        materialize_case(store, next(c for c in QA_CASES if c.name == "basal-raise"))
        reconcile_ingested_follow_up(store)
    return path, TestClient(create_app(db_path=path, token="t", enable_fetch_loop=False))


def record_plan(client):
    g = client.get("/api/guidance", headers=H).json()
    action = next(r for r in g["candidates"] if r["subject"] == "setting:basal_rate")["action"][0]
    items = [{"type": "basal", "start_min": action["start_min"], "value": action["recommended"]}]
    draft = client.put("/api/plan", headers=H, json={"items": items}).json()
    r = client.post("/api/plan/apply", headers=H, json={
        "request_id": f"a-{time.time_ns()}", "input_revision": g["input_revision"], "subject": "setting:basal_rate",
        "analysis_generation": g["analysis_generation"], "draft_updated_at": draft["updated_at"]})
    assert r.status_code == 200, r.text
    return r.json()["record"]


def write_read(path, rows, at, switch):
    with Store.open(path) as store:
        settings = store.settings_snapshots()[-1].settings
        segs = tuple(ProfileSegment(start_min=row["start_min"], **{k: row[k]["value"] for k in
                     ("basal_rate", "isf", "carb_ratio", "target_bg")}) for row in rows)
        profile = replace(settings.active(), segments=segs)
        if switch:
            profile = replace(profile, idp=max(p.idp for p in settings.profiles) + 1)
            settings = replace(settings, active_idp=profile.idp, profiles=(*settings.profiles, profile))
        else:
            settings = replace(settings, profiles=tuple(
                profile if p.idp == settings.active_idp else p for p in settings.profiles))
        store.upsert_settings_snapshot(at.isoformat(sep=" "), settings)
        reconcile_ingested_follow_up(store)


def spike(store, plan):
    """The server's own comparison over the reads after the decision.

    Captured schedule: schedule_matches(deliverable rows, read). Without one
    (a pre-#388 Plan): the recorded items applied over that read's profile.
    Returns, per read after the decision, whether each form holds it.
    """
    from dataclasses import asdict
    from ciq_autotune.guidance import plan_deliverable, schedule_matches
    applied = datetime.fromisoformat(plan["applied_at"])
    out = []
    for snap in store.settings_snapshots():
        if snap.captured_at <= applied or not snap.settings.active():
            continue
        segs = [asdict(s) for s in snap.settings.active().segments]
        out.append({"read": str(snap.captured_at),
                    "captured_schedule_holds": schedule_matches(plan["deliverable"]["rows"], segs),
                    "recorded_values_hold": schedule_matches(plan_deliverable(segs, plan["items"]), segs)})
    source = plan["deliverable"]["source_profile"]["segments"]
    out.append({"read": "source profile, before the decision",
                "captured_schedule_holds": schedule_matches(plan["deliverable"]["rows"], source),
                "recorded_values_hold": None})
    return out


def report(label, path, client, applied_at):
    with Store.open_readonly(path) as store:
        pend = pending_plan(store)
        plan = store.follow_up_record("plan", applied_at)
        trials = store.follow_up_records("trial")
        reads = spike(store, plan)
    g = client.get("/api/guidance", headers=H).json()
    hist = client.get("/api/plan/history", headers=H).json()["history"]
    pump = client.get("/api/pump-settings", headers=H).json()
    out = {
        "label": label,
        "server_pending_plan_id": pend and pend["id"],
        "plan_reconciliation_state": plan["reconciliation"].get("state"),
        "trial_count": len(trials),
        "trial_changed_at": [t["changed_at"] for t in trials][:3],
        "applied_at": applied_at,
        "guidance_disposition": g["disposition"],
        "focus_pin": g["admission"]["focus_pin"],
        "spike_reads_after_decision": reads,
        # inputs plan-view.js reconcile() reads
        "browser": {"history": hist, "pump": {"profile": pump.get("profile"), "fetched_at": pump.get("fetched_at")}},
    }
    return out


def path_a():
    path, client = setup()
    rec = record_plan(client)
    at = datetime.fromisoformat(rec["applied_at"]) + timedelta(minutes=5)
    write_read(path, rec["deliverable"]["rows"], at, switch=False)
    return report("A in-place edit after decision", path, client, rec["applied_at"])


def path_b():
    """In-place edit after the decision, and the dose stream sees it: a Trial exists."""
    path, client = setup()
    rec = record_plan(client)
    applied = datetime.fromisoformat(rec["applied_at"])
    rows = rec["deliverable"]["rows"]
    # Pump-local events: the edited schedule delivered for two days after the decision.
    def rate_at(minute):
        return [r for r in rows if r["start_min"] <= minute][-1]["basal_rate"]["value"]
    day0 = (applied + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    events = []
    for d in range(2):
        for slot in range(48):
            t = day0 + timedelta(days=d, minutes=30 * slot + 2)
            events.append({"seq_num": 9_000_000 + d * 48 + slot, "time": t.strftime("%Y-%m-%d %H:%M:%S"),
                           "delivery_type": "algorithmDelivery", "duration_mins": 30,
                           "basal_rate": rate_at(30 * slot), "profile_basal_rate": rate_at(30 * slot)})
    with Store.open(path) as store:
        store.upsert_basal(events)
    write_read(path, rows, day0 + timedelta(days=2, hours=1), switch=False)
    return report("B in-place edit, dose stream detects it", path, client, rec["applied_at"])


def path_c():
    import time
    path, client = setup()
    first = record_plan(client)
    revision = client.get("/api/guidance", headers=H).json()["input_revision"]
    withdrawn = client.post("/api/plan/history/withdraw", headers=H, json={
        "request_id": "w", "input_revision": revision, "applied_at": first["applied_at"], "reason": None})
    assert withdrawn.status_code == 200, withdrawn.text
    time.sleep(1.1)  # applied_at is second-resolution and keys the record
    second = record_plan(client)
    served = [row["applied_at"] for row in client.get("/api/plan/history", headers=H).json()["history"]]
    return {"label": "C served history order", "served": served,
            "newest_first": served == [second["applied_at"], first["applied_at"]]}


if __name__ == "__main__":
    print(json.dumps(path_c()))
    results = [path_a(), path_b()]
    json.dump(results, open(sys.argv[1], "w"), indent=1, default=str)
    for r in results:
        print(json.dumps({k: v for k, v in r.items() if k != "browser"}, default=str))
