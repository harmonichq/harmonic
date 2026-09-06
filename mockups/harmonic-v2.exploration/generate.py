#!/usr/bin/env python3
"""Generate synthetic design inputs and the current app material for #348."""
from __future__ import annotations
import argparse
import json
import sqlite3
from pathlib import Path
import sys
import tempfile
from datetime import datetime, timedelta
from dataclasses import asdict, replace
ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts")]
from ciq_autotune.store import Store
from ciq_autotune.analyzers.scenario import build_scenarios
from gen_qa_e2e_db import generate
from qa_e2e_cases import QA_CASES, execute_case
from ciq_autotune.finding_case_file import prepare
from ciq_autotune.window_membership import WindowQuery
from ciq_autotune.timeline import timeline
from ciq_autotune.watched_change import active_watched_change, review_trials, trial_is_active
from ciq_autotune.outcomes_trend import summarize_trend

def repeat_manufactured_meals(path):
    """Repeat the existing QA shapes on empty synthetic days; rerun all classifiers."""
    with Store.open(str(path)) as store:
        meals = tuple(b for b in store.bolus_events() if b.t.hour == 12)
        original = {b.t.date(): tuple(store.cgm_readings(
            b.t.date().isoformat(), (b.t.date() + timedelta(days=1)).isoformat()))
            for b in meals}
        for repetition, days in enumerate((18, 10), start=1):
            for meal in meals:
                when = meal.t - timedelta(days=days)
                store.upsert_cgm([{
                    "EventDateTime": (r.t - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S"),
                    "Readings (CGM / BGM)": r.bg, "Description": "Synthetic EGV",
                } for r in original[meal.t.date()]])
                store.upsert_bolus([{
                    "seq_num": meal.seq_num + repetition * 1000,
                    "request_time": when.strftime("%Y-%m-%d %H:%M:%S"),
                    "description": "Synthetic repeated QA meal bolus", "completion": "Completed",
                    "insulin": meal.insulin, "requested_insulin": meal.insulin,
                    "carbs": meal.carbs, "carb_ratio": 5.0, "isf": 40.0, "target_bg": 110.0,
                }])


def comparison_capture(path, variant, lever="late_bolus"):
    with Store.open_readonly(str(path)) as store:
        result = execute_case(store)
        prepared = prepare(store, query=WindowQuery.whole_day(), version=0,
                           analysis=result.analysis, exposures=result.exposures,
                           scenarios=result.scenarios)
        finding_id = f"finding:{lever}"
        case_file = prepared.case(finding_id, "event", None)
        if case_file is None:
            raise RuntimeError(f"Manufactured {lever} case file is unavailable")
        # Only the random preparation lease identity is normalized in this capture.
        case_file["projection_id"] = "fp_design_348_" + variant
        selections = {}
        days = {}
        episode_ids = {}
        for cohort in case_file["projection"]["cohorts"]:
            for occurrence_id in cohort["occurrence_ids"]:
                selected = prepared.case(finding_id, "event", occurrence_id)["selection"]
                if selected["state"] != "selected":
                    raise RuntimeError("Manufactured member selection did not resolve")
                selections[occurrence_id] = selected
                detail = selected["detail"]
                date = detail["day_target"]["date"]
                if date not in days:
                    start = datetime.fromisoformat(date)
                    days[date] = timeline(store, start, start + timedelta(days=1))
                matching = [key for key, episode in result.scenarios["episodes"].items()
                            if episode["start"] == detail["anchor"]["t"]
                            and episode["lever"] == lever]
                if matching:
                    episode_ids[occurrence_id] = matching[0]
        finding_row = next(row for row in result.findings["whole_day"]["rows"]
                           if row["id"] == finding_id)
        return {"case_file": case_file, "finding_row": finding_row, "selections": selections,
                "scenarios": result.scenarios, "days": days,
                "episode_ids": episode_ids}



def setting_capture(path):
    """One supported setting, its recorded Plan, and the same detected Trial.

    The QA recipe owns the recommendation. Manufactured follow-up keeps glucose
    unchanged and enters only that accepted basal change on the synthetic pump.
    Maturity and evidence are always computed by the shipped Trial producer.
    """
    case = next(c for c in QA_CASES if c.name == "setting-recommendation")
    generate(path, case)
    with Store.open_readonly(str(path)) as store:
        result = execute_case(store, case)
        settings = store.settings_snapshots()[-1].settings
        profile = settings.active()
        finding = next(row for row in result.findings["whole_day"]["rows"]
                       if row["register"] == "assert")
        slots = [row for row in result.analysis["basal"] if row["asserts_move"]]
        items = [{"type": "basal", "start_min": row["slot"] * 30,
                  "value": row["recommended"], "recommended": row["recommended"],
                  "current": row["current"], "label": row["label"]} for row in slots]
        dates = sorted({night["date"] for row in slots
                        for night in row["evidence"]["night_roster"]})
        days = {day: timeline(store, datetime.fromisoformat(day),
                             datetime.fromisoformat(day) + timedelta(days=1))
                for day in dates}
    if len(items) != 2 or [item["start_min"] for item in items] != [180, 210]:
        raise RuntimeError("Setting walkthrough no longer has its two supported basal slots")
    if items[0]["value"] != items[1]["value"]:
        raise RuntimeError("Setting walkthrough needs a new manufactured follow-up schedule")
    base = profile.segments[0]
    # An explicitly manufactured manual entry, not a replacement Plan algorithm.
    entered = replace(profile, segments=(base,
        replace(base, start_min=180, basal_rate=items[0]["value"]),
        replace(base, start_min=240)))
    mismatch = replace(entered, segments=(base,
        replace(base, start_min=180, basal_rate=items[0]["value"] + 0.02),
        replace(base, start_min=240)))
    captured_at = "2024-06-13 00:00:00"
    with Store.open(str(path)) as store:
        store.save_plan_draft(items, "2024-06-12 12:00:00")
        draft = store.get_plan_draft()
        decision = store.apply_plan("2024-06-12 12:05:00")
        store.upsert_settings_snapshot(captured_at,
            replace(settings, profiles=(entered,)))
        cgm, basal = [], []
        start = datetime(2024, 6, 13)
        for day in range(16):
            for minute in range(0, 1440, 5):
                at = start + timedelta(days=day, minutes=minute)
                stamp = at.strftime("%Y-%m-%d %H:%M:%S")
                cgm.append({"EventDateTime": stamp, "Readings (CGM / BGM)": 120.0,
                            "Description": "Synthetic unchanged follow-up EGV"})
                rate = items[0]["value"] if 180 <= minute < 240 else base.basal_rate
                basal.append({"seq_num": 900000 + day * 288 + minute // 5,
                              "time": stamp, "delivery_type": "profileDelivery",
                              "duration_mins": 5, "basal_rate": rate,
                              "profile_basal_rate": rate})
        store.upsert_cgm(cgm)
        store.upsert_basal(basal)
    trials = {}
    reviewed_at = {}
    with Store.open_readonly(str(path)) as store:
        for name, now in (("active", datetime(2024, 6, 18, 12)),
                          ("ready", datetime(2024, 6, 28, 12))):
            reviewed_at[name] = now.strftime("%Y-%m-%d %H:%M:%S")
            roster = review_trials(store, now=now)
            selected_id = next(row["id"] for row in roster["trials"]
                               if row["parameter"] == "basal_rate")
            trials[name] = review_trials(store, now=now, selected=selected_id)
    return {"_generated_by": "mockups/harmonic-v2.exploration/generate.py",
            "_note": "SYNTHETIC. Existing setting-recommendation QA case followed by manufactured manual pump entry and unchanged glucose. Shipped producers supply recommendation, draft/history and Trial evidence. A mismatch profile is an alternative capture, not another detected change in this Trial. V2 snapshot/finish persistence is illustrative and is not implemented by this capture.",
            "case": case.name, "finding": finding, "basal": slots,
            "active_profile": asdict(profile), "accepted_items": items,
            "draft": draft, "decision": decision, "days": days,
            "detected": {"pending": None, "mismatch": asdict(mismatch),
                         "confirmed": asdict(entered), "captured_at": captured_at},
            "trials": trials, "reviewed_at": reviewed_at}



def focus_preemption_capture(path):
    """An alternative ending: an observed profile switch takes the active watch."""
    changed_at = "2024-06-30 12:00:00"
    now = datetime(2024, 7, 1, 12)
    with Store.open(str(path)) as store:
        settings = store.settings_snapshots()[-1].settings
        profile = settings.active()
        changed = replace(profile, idp=profile.idp + 1,
            name="Synthetic changed profile",
            segments=tuple(replace(row, isf=row.isf + 5) for row in profile.segments))
        store.upsert_settings_snapshot(changed_at,
            replace(settings, active_idp=changed.idp, profiles=(*settings.profiles, changed)))
        active = active_watched_change(store, store.basal_events(), store.bolus_events(),
            store.settings_snapshots(), now=now, cgm_readings=store.cgm_readings())
        focus = store.list_focuses()[0]
        if active is None or active.kind != "trial" or focus["status"] != "dropped":
            raise RuntimeError("Manufactured setting change did not preempt the Focus")
        roster = review_trials(store, now=now)
        selected_id = next(row["id"] for row in roster["trials"]
                           if row["changed_at"] == active.changed_at)
        review = review_trials(store, now=now, selected=selected_id)
    return {"reviewed_at": now.strftime("%Y-%m-%d %H:%M:%S"),
            "changed_at": changed_at, "focus_record": focus,
            "active": asdict(active), "review": review}


def focus_capture(path):
    """A real Focus on a manufactured supported pattern, then fixed-period reads.

    Repeat the same synthetic records thirty days later so the walkthrough does
    not manufacture success. Intervening windows include zero opportunities;
    the UI must preserve that absence rather than interpreting a zero rate.
    """
    case = next(c for c in QA_CASES if c.name == "behavioral-over-treated-low")
    generate(path, case)
    initial = comparison_capture(path, "focus", "over_treated_low")
    action = next(row for row in initial["scenarios"]["patterns"]
                  if row["lever"] == "over_treated_low")
    started_at = datetime(2024, 5, 30, 12)
    preempt_path = path.with_name(path.stem + "-preempted.sqlite")
    with Store.open(str(path)) as store:
        if trial_is_active(store, now=started_at):
            raise RuntimeError("Manufactured Focus cannot start while a Trial is active")
        focus = store.pin_focus(action["lever"], started_at.strftime("%Y-%m-%d %H:%M:%S"))
        before = summarize_trend(store, now=started_at).to_dict()
        cgm, bolus, basal = store.cgm_readings(), store.bolus_events(), store.basal_events()
        shift = timedelta(days=30)
        store.upsert_cgm([{"EventDateTime": (row.t + shift).strftime("%Y-%m-%d %H:%M:%S"),
                          "Readings (CGM / BGM)": row.bg,
                          "Description": "Synthetic repeated QA EGV"} for row in cgm])
        store.upsert_bolus([{
            **{name: getattr(row, name) for name in (
                "description", "completion", "insulin", "requested_insulin", "carbs",
                "bg", "user_override", "extended", "bolus_options", "correction_insulin",
                "food_insulin", "pump_iob", "selected_iob", "standard_percent",
                "extended_duration", "declined_correction", "isf", "target_bg", "carb_ratio")},
            "seq_num": row.seq_num + 1000000,
            "request_time": (row.t + shift).strftime("%Y-%m-%d %H:%M:%S"),
            "completion_time": ((row.completion_t + shift).strftime("%Y-%m-%d %H:%M:%S")
                                if row.completion_t is not None else None),
        } for row in bolus])
        store.upsert_basal([{
            "seq_num": 2000000 + index,
            "time": (row.t + shift).strftime("%Y-%m-%d %H:%M:%S"),
            "delivery_type": row.delivery_type, "duration_mins": row.duration_mins,
            "basal_rate": row.basal_rate, "profile_basal_rate": row.profile_basal_rate,
        } for index, row in enumerate(basal)])
        followed_at = datetime(2024, 6, 29, 12)
        following = summarize_trend(store, now=followed_at).to_dict()
        if following["watched_change"]["kind"] != "focus":
            raise RuntimeError("Manufactured follow-up unexpectedly preempted its Focus")
        # Branch the same active Focus before the alternative manual ending.
        with sqlite3.connect(preempt_path) as alternative:
            store.conn.backup(alternative)
        if not store.resolve_focus(focus["id"]):
            raise RuntimeError("Manufactured Focus ending was not recorded")
        resolved = store.list_focuses()[0]
    preempted = focus_preemption_capture(preempt_path)
    return {"_generated_by": "mockups/harmonic-v2.exploration/generate.py",
            "_note": "SYNTHETIC. Existing behavioral-over-treated-low QA case with the same raw synthetic records repeated thirty days later. Current pattern, comparison, Focus and trend producers supply the data. Preemption is an alternative ending of the same active Focus, before manual resolution: a manufactured pump-profile switch is detected by the shipped watch owner. Focus has no maturity gate or stored end time/conclusion. The proposed v2 context and ending snapshot remain illustrative.",
            "case": case.name, "initial": initial, "action": action,
            "reviewed_at": {"before": started_at.strftime("%Y-%m-%d %H:%M:%S"),
                            "following": followed_at.strftime("%Y-%m-%d %H:%M:%S")},
            "focus": focus, "before": before, "following": following,
            "resolved_record": resolved, "preempted": preempted}


def outputs():
    html = (ROOT / "frontend/index.html").read_text()
    material = html.split("\n  <style>\n", 1)[1].split("    /* #634: #app", 1)[0]
    css = "/* GENERATED by mockups/harmonic-v2.exploration/generate.py. Sources: frontend/index.html, frontend/shell.css, frontend/theme.css. */\n"
    css += (ROOT / "frontend/shell.css").read_text() + "\n" + material + "\n" + (ROOT / "frontend/theme.css").read_text()
    case = next(c for c in QA_CASES if c.name == "behavioral-late-bolus")
    with tempfile.TemporaryDirectory(prefix="harmonic-v2-fixture-") as scratch:
        path = Path(scratch) / "case.sqlite"
        generate(path, case)
        with Store.open_readonly(str(path)) as store:
            scenarios = build_scenarios(store).to_dict()
        comparison_thin = comparison_capture(path, "thin")
        repeat_manufactured_meals(path)
        comparison_repeated = comparison_capture(path, "repeated")
        setting = setting_capture(Path(scratch) / "setting.sqlite")
        focus = focus_capture(Path(scratch) / "focus.sqlite")
    data = {"_generated_by": "mockups/harmonic-v2.exploration/generate.py", "_note": "SYNTHETIC. Manufactured QA case; no real records. Proposed priority selection is illustrative, not a shipped backend verdict.", "case": case.name, "scenarios": scenarios}
    workstation = {"_generated_by": "mockups/harmonic-v2.exploration/generate.py",
                   "_note": "SYNTHETIC. Existing QA shapes and repetitions on manufactured days. All case-file membership, support, selection and timelines come from current Python producers. Only the preparation lease ID is normalized; proposed guidance remains illustrative.",
                   "variants": {"thin": comparison_thin, "repeated": comparison_repeated}}
    key_css = "/* GENERATED by mockups/harmonic-v2.exploration/generate.py from the shipped Day legend in frontend/index.html. */\n"
    key_css += "\n".join(line for line in html.splitlines() if line.lstrip().startswith(".ds-chart-legend")) + "\n"
    return {ROOT / "mockups/_theme-app.css": css,
            ROOT / "mockups/harmonic-v2.exploration/chart-key.css": key_css,
            ROOT / "mockups/harmonic-v2.exploration/setting.json": json.dumps(setting, indent=2, sort_keys=True) + "\n",
            ROOT / "mockups/harmonic-v2.exploration/focus.json": json.dumps(focus, indent=2, sort_keys=True) + "\n",
            ROOT / "mockups/harmonic-v2.exploration/evidence.json": json.dumps(data, indent=2, sort_keys=True) + "\n",
            ROOT / "mockups/harmonic-v2.exploration/workstation.json": json.dumps(workstation, indent=2, sort_keys=True) + "\n"}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    failed = []
    for path, content in outputs().items():
        if args.check:
            if not path.exists() or path.read_text() != content:
                failed.append(str(path.relative_to(ROOT)))
        else:
            path.write_text(content)
    if failed:
        print("harmonic-v2 design: stale " + ", ".join(failed))
        return 1
    print("harmonic-v2 design: current" if args.check else "harmonic-v2 design: generated")
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
