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
from qa_e2e_cases import (
    QA_CASES, _materialize_basal_coverage, _materialize_behavioral_over_treated_low,
    _settings, execute_case,
)
from ciq_autotune.finding_case_file import prepare
from ciq_autotune.window_membership import WindowQuery
from ciq_autotune.timeline import timeline
from ciq_autotune.false_low import false_low_span_records
from ciq_autotune.basal_night_evidence import prepare_basal_night_evidence
from ciq_autotune.pending_prompts import build_pending_prompts
from ciq_autotune.analyzers.scenario.guide import build_catalog
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
                anchor = detail["anchor"]["t"]
                matching = [key for key, episode in result.scenarios["episodes"].items()
                            if episode["lever"] == lever
                            and episode["start"] <= anchor <= episode["end"]]
                if matching:
                    if len(matching) != 1:
                        raise RuntimeError(
                            f"Manufactured {lever} occurrence has ambiguous episode identity")
                    episode_ids[occurrence_id] = matching[0]
        finding_row = next(row for row in result.findings["whole_day"]["rows"]
                           if row["id"] == finding_id)
        if lever == "over_treated_low":
            matched = next(cohort for cohort in case_file["projection"]["cohorts"]
                           if cohort["key"] == "matched")["occurrence_ids"]
            if len(matched) != 2 or any(key not in episode_ids for key in matched):
                raise RuntimeError("Manufactured matched low occurrences need unique source episodes")
        return {"case_file": case_file, "finding_row": finding_row, "selections": selections,
                "scenarios": result.scenarios, "days": days,
                "episode_ids": episode_ids}


def _recorded_days(store):
    """Return shipped Day payloads for every date that has source records."""
    dates = sorted({row.t.date().isoformat() for row in store.cgm_readings()} |
                   {row.t.date().isoformat() for row in store.basal_events()} |
                   {row.t.date().isoformat() for row in store.bolus_events()})
    snaps = store.settings_snapshots()
    false_lows = false_low_span_records(store.cgm_readings(), store.prompt_responses())
    return dates, {day: timeline(store, datetime.fromisoformat(day),
                                 datetime.fromisoformat(day) + timedelta(days=1),
                                 snaps=snaps, false_low_records=false_lows)
                   for day in dates}


def _finding_evidence(path, lever):
    """Read an existing behavioral Finding through its case-file producer."""
    evidence = comparison_capture(path, f"evidence-{lever}", lever)
    with Store.open_readonly(str(path)) as store:
        evidence["source_findings"] = execute_case(store).findings["whole_day"]["rows"]
    return evidence


def _following_evidence(path, first_date):
    """Read only the repeated source window; trend windows stay on the full branch."""
    with tempfile.TemporaryDirectory(prefix="harmonic-v2-following-") as scratch:
        view = Path(scratch) / "following.sqlite"
        _copy_database(path, view)
        with sqlite3.connect(view) as connection:
            for table in ("basal_events", "bolus_events", "cgm_readings", "iob_events", "pump_events"):
                connection.execute(f"DELETE FROM {table} WHERE t < ?", (first_date,))
        evidence = _finding_evidence(view, "over_treated_low")
        evidence["finding_evidence"] = {
            "finding:correction_on_iob": _finding_evidence(view, "correction_on_iob"),
        }
        with Store.open_readonly(str(view)) as store:
            dates, days = _recorded_days(store)
    return evidence, dates, days



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



def focus_preemption_capture(path, *, changed_at="2024-06-30 12:00:00", now=datetime(2024, 7, 1, 12)):
    """An alternative ending: an observed profile switch takes the active watch."""
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
    following_evidence, following_dates, following_days = _following_evidence(
        path, started_at.strftime("%Y-%m-%d %H:%M:%S"))
    with Store.open(str(path)) as store:
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
            "following_evidence": following_evidence,
            "following_recorded_dates": following_dates, "following_days": following_days,
            "resolved_record": resolved, "preempted": preempted}


def _copy_database(source, target):
    """Make an isolated synthetic branch without changing the common source."""
    with sqlite3.connect(target) as destination, sqlite3.connect(source) as original:
        original.backup(destination)


def _combined_source(path):
    """Materialize the one manufactured history shared by both v2 alternatives."""
    with Store.open(str(path)) as store:
        # The behavioral helper writes a 5 g/U profile.  The combined person has
        # one explicitly selected 10 g/U profile at the common baseline instead.
        _materialize_behavioral_over_treated_low(store)
        _materialize_basal_coverage(store, clean_rate=0.48, informative_nights=30,
                                    include_settings=False)
        second_half_hour = []
        for offset in range(30):
            at = datetime(2024, 5, 1, 3, 30) + timedelta(days=offset)
            second_half_hour.append({
                "seq_num": 300_000 + offset, "time": at.strftime("%Y-%m-%d %H:%M:%S"),
                "delivery_type": "algorithmDelivery", "duration_mins": 30,
                "basal_rate": 0.48, "profile_basal_rate": 0.6,
            })
        store.upsert_basal(second_half_hour)
        store.upsert_settings_snapshot("2024-05-01 00:00:00", _settings(10.0))


def _combined_initial_capture(path):
    """Capture source-owned findings, evidence, selections, and Day data once."""
    behavioral = comparison_capture(path, "journey", "over_treated_low")
    with Store.open_readonly(str(path)) as store:
        result = execute_case(store)
        settings = store.settings_snapshots()
        if len(settings) != 1 or settings[0].settings.active().segments[0].carb_ratio != 10.0:
            raise RuntimeError("Combined journey must retain one stable manufactured profile")
        rows = result.findings["whole_day"]["rows"]
        basal_finding = next(row for row in rows if row["id"] == "basal:180-240")
        basal = [row for row in result.analysis["basal"] if row["asserts_move"]]
        if [row["slot"] for row in basal] != [6, 7]:
            raise RuntimeError("Combined journey needs adjacent supported 03:00 and 03:30 basal slots")
        behavioral_finding = next(row for row in rows if row["id"] == "finding:over_treated_low")
        action = next(row for row in behavioral["scenarios"]["patterns"]
                      if row["lever"] == "over_treated_low")
        if action["confidence"]["n"] != 6 or action["confidence"]["k"] != 2:
            raise RuntimeError("Combined journey lost the measured over-treated-low evidence")
        dates, days = _recorded_days(store)
        night_source = prepare_basal_night_evidence(result.analysis)
        slot_evidence = {}
        for row in result.analysis["basal"]:
            slot = row["slot"]
            try:
                evidence = night_source.project(slot, analysis_generation="qa:0")
            except (KeyError, ValueError) as error:
                slot_evidence[str(slot)] = {"state": "unavailable", "error": str(error)}
                continue
            for night in evidence["nights"]:
                if night["date"] not in days:
                    raise RuntimeError("Basal supporting night lacks its shipped Day payload")
            slot_evidence[str(slot)] = evidence
        tail = max([row.t for row in store.cgm_readings()] +
                   [row.t for row in store.basal_events()] +
                   [row.t for row in store.bolus_events()])
    return {
        "source_id": "harmonic-v2-journey-synthetic-may-2024",
        "source_tail": tail.strftime("%Y-%m-%d %H:%M:%S"),
        "profile": asdict(settings[0].settings.active()),
        "source_findings": rows,
        "candidates": {
            "basal": {"finding_row": basal_finding, "slots": basal},
            "over_treated_low": {"finding_row": behavioral_finding, "action": action},
        },
        "behavioral_evidence": behavioral,
        "basal_exploration": {
            "source_clock": tail.strftime("%Y-%m-%d %H:%M:%S"),
            "analysis_slots": result.analysis["basal"],
            "grouped_finding_projection": result.findings["whole_day"],
            "slot_night_evidence": slot_evidence,
            "provenance": "48 analysis slots and their basal-night-evidence projections; grouped finding projection is distinct from the slot lane",
        },
        "days": days,
        "day_navigator": {"recorded_dates": dates,
                          "selected_dates": sorted(set(days) | set(behavioral["days"]))},
        "provenance": {"selected_clock": tail.strftime("%Y-%m-%d %H:%M:%S"),
                       "guidance_order": "illustrative prototype order; backend fields are verbatim"},
    }


def _carb_utility_snapshot(store, now):
    """Serialize prompt and manual-carb producer reads without inventing entries."""
    prompts = build_pending_prompts(store, now=now)
    return {"event_clock": now.strftime("%Y-%m-%d %H:%M:%S"),
            "wall_clock": "not supplied; wrapper uses real wall time only for answered grace",
            "pending": [row.to_dict() for row in prompts],
            "manual_carb_entries": [asdict(row) for row in store.carb_entries()],
            "prompt_responses": store.prompt_responses()}


def utilities_capture():
    """Static Guide and glossary sources, with bounded extraction of the JS literal."""
    html = (ROOT / "frontend/index.html").read_text()
    start = "        const glossaryGroups = ref([\n"
    end = "        ]);\n\n        const tokenInput"
    if html.count(start) != 1 or html.count(end) != 1:
        raise RuntimeError("Glossary source markers changed; extraction is unsafe")
    literal = html.split(start, 1)[1].split(end, 1)[0]
    articles = {}
    for name in ("start-here.md", "reading-day.md", "reading-diagnose.md", "the-plan-tab.md"):
        source = ROOT / "docs/kb" / name
        articles[name.removesuffix(".md")] = {"source_path": str(source.relative_to(ROOT)),
                                               "markdown": source.read_text()}
    line = html[:html.index(start)].count("\n") + 1
    module = ("// GENERATED by mockups/harmonic-v2.exploration/generate.py from "
              f"frontend/index.html:{line}.\nexport const glossaryGroups = [\n{literal}];\n")
    return {"_generated_by": "mockups/harmonic-v2.exploration/generate.py",
            "_note": "SYNTHETIC static source capture. Glossary wording is preserved verbatim from v1; presentation labels remain governed by CONTEXT.md.",
            "guide": {"catalog": build_catalog(), "articles": articles},
            "glossary": {"source_path": "frontend/index.html", "start_line": line,
                         "module_path": "mockups/harmonic-v2.exploration/glossary.js"}}, module


def _combined_setting_branch(path, initial):
    """Apply the common basal recommendation, then let Trial producers observe it."""
    slots = initial["candidates"]["basal"]["slots"]
    items = [{"type": "basal", "start_min": row["slot"] * 30,
              "value": row["recommended"], "recommended": row["recommended"],
              "current": row["current"], "label": row["label"]} for row in slots]
    if len(items) != 2 or [item["start_min"] for item in items] != [180, 210]:
        raise RuntimeError("Combined setting branch requires both staged basal half-hours")
    source_tail = datetime.fromisoformat(initial["source_tail"])
    draft_at = datetime.combine(
        source_tail.date() + timedelta(days=1), datetime.min.time()).replace(hour=12)
    decision_at = draft_at.replace(minute=5)
    captured_at = datetime.combine(source_tail.date() + timedelta(days=2), datetime.min.time())
    with Store.open(str(path)) as store:
        settings = store.settings_snapshots()[-1].settings
        profile = settings.active()
        base = profile.segments[0]
        entered = replace(profile, segments=(base,
            replace(base, start_min=180, basal_rate=items[0]["value"]),
            replace(base, start_min=240)))
        mismatch = replace(entered, segments=(base,
            replace(base, start_min=180, basal_rate=items[0]["value"] + 0.02),
            replace(base, start_min=240)))
        store.save_plan_draft(items, draft_at.strftime("%Y-%m-%d %H:%M:%S"))
        draft = store.get_plan_draft()
        decision = store.apply_plan(decision_at.strftime("%Y-%m-%d %H:%M:%S"))
        store.upsert_settings_snapshot(captured_at.strftime("%Y-%m-%d %H:%M:%S"),
                                       replace(settings, profiles=(entered,)))
        cgm, basal = [], []
        for day in range(16):
            for minute in range(0, 1440, 5):
                at = captured_at + timedelta(days=day, minutes=minute)
                stamp = at.strftime("%Y-%m-%d %H:%M:%S")
                cgm.append({"EventDateTime": stamp, "Readings (CGM / BGM)": 120.0,
                            "Description": "Synthetic flat manufactured setting follow-up EGV"})
                rate = items[0]["value"] if 180 <= minute < 240 else base.basal_rate
                basal.append({"seq_num": 900_000 + day * 288 + minute // 5, "time": stamp,
                              "delivery_type": "profileDelivery", "duration_mins": 5,
                              "basal_rate": rate, "profile_basal_rate": rate})
        store.upsert_cgm(cgm)
        store.upsert_basal(basal)
    trials, reviewed_at = {}, {}
    with Store.open_readonly(str(path)) as store:
        for name, now in (("active", captured_at + timedelta(days=5, hours=12)),
                          ("ready", captured_at + timedelta(days=15, hours=12))):
            reviewed_at[name] = now.strftime("%Y-%m-%d %H:%M:%S")
            roster = review_trials(store, now=now)
            selected_id = next(row["id"] for row in roster["trials"]
                               if row["parameter"] == "basal_rate")
            trials[name] = review_trials(store, now=now, selected=selected_id)
        if trials["active"]["selected"]["id"] != trials["ready"]["selected"]["id"]:
            raise RuntimeError("Combined setting branch changed Trial identity across clocks")
        if trials["active"]["selected"]["state"] != "maturing":
            raise RuntimeError("Combined setting Trial became ready before its measured window")
        if trials["ready"]["selected"]["state"] != "complete":
            raise RuntimeError("Combined setting Trial was not ready at its measured review clock")
        recorded_dates, days = _recorded_days(store)
    current_evidence = _finding_evidence(path, "over_treated_low")
    current_evidence["finding_evidence"] = {
        "finding:correction_on_iob": _finding_evidence(path, "correction_on_iob"),
    }
    with Store.open_readonly(str(path)) as store:
        current_evidence["read_at"] = max(
            [row.t for row in store.cgm_readings()] + [row.t for row in store.basal_events()] +
            [row.t for row in store.bolus_events()]).strftime("%Y-%m-%d %H:%M:%S")
    return {"shared_source_id": initial["source_id"], "basal": slots,
            "finding": initial["candidates"]["basal"]["finding_row"],
            "active_profile": asdict(profile), "accepted_items": items, "draft": draft,
            "decision": decision, "detected": {"pending": None, "mismatch": asdict(mismatch),
            "confirmed": asdict(entered), "captured_at": captured_at.strftime("%Y-%m-%d %H:%M:%S")},
            "reviewed_at": reviewed_at, "trials": trials, "days": days,
            "recorded_dates": recorded_dates,
            "current_evidence": current_evidence}


def _combined_focus_branch(path, initial):
    """Pin the common behavioral action and retain separate resolution alternatives."""
    source_tail = datetime.fromisoformat(initial["source_tail"])
    started_at = datetime.combine(source_tail.date() + timedelta(days=1), datetime.min.time()).replace(hour=12)
    followed_at = started_at + timedelta(days=30)
    preempt_path = path.with_name(path.stem + "-preempted.sqlite")
    action = initial["candidates"]["over_treated_low"]["action"]
    with Store.open(str(path)) as store:
        if trial_is_active(store, now=started_at):
            raise RuntimeError("Combined Focus cannot start while the source has a Trial")
        focus = store.pin_focus(action["lever"], started_at.strftime("%Y-%m-%d %H:%M:%S"))
        before = summarize_trend(store, now=started_at).to_dict()
        cgm, bolus, basal = store.cgm_readings(), store.bolus_events(), store.basal_events()
        shift = timedelta(days=30)
        store.upsert_cgm([{"EventDateTime": (row.t + shift).strftime("%Y-%m-%d %H:%M:%S"),
                          "Readings (CGM / BGM)": row.bg,
                          "Description": "Synthetic repeated shared evidence EGV"} for row in cgm])
        store.upsert_bolus([{
            **{name: getattr(row, name) for name in (
                "description", "completion", "insulin", "requested_insulin", "carbs", "bg",
                "user_override", "extended", "bolus_options", "correction_insulin",
                "food_insulin", "pump_iob", "selected_iob", "standard_percent",
                "extended_duration", "declined_correction", "isf", "target_bg", "carb_ratio")},
            "seq_num": row.seq_num + 1_000_000,
            "request_time": (row.t + shift).strftime("%Y-%m-%d %H:%M:%S"),
            "completion_time": ((row.completion_t + shift).strftime("%Y-%m-%d %H:%M:%S")
                                if row.completion_t is not None else None),
        } for row in bolus])
        store.upsert_basal([{
            "seq_num": 2_000_000 + index, "time": (row.t + shift).strftime("%Y-%m-%d %H:%M:%S"),
            "delivery_type": row.delivery_type, "duration_mins": row.duration_mins,
            "basal_rate": row.basal_rate, "profile_basal_rate": row.profile_basal_rate,
        } for index, row in enumerate(basal)])
        following = summarize_trend(store, now=followed_at).to_dict()
        if following["watched_change"]["kind"] != "focus":
            raise RuntimeError("Combined repeated evidence unexpectedly preempted Focus")
        _copy_database(path, preempt_path)
    following_evidence, following_dates, following_days = _following_evidence(
        path, started_at.strftime("%Y-%m-%d %H:%M:%S"))
    with Store.open(str(path)) as store:
        if not store.resolve_focus(focus["id"]):
            raise RuntimeError("Combined manual Focus resolution was not recorded")
        resolved = store.list_focuses()[0]
        if resolved["status"] != "resolved":
            raise RuntimeError("Combined Focus resolution did not persist its status")
    preempted = focus_preemption_capture(
        preempt_path,
        changed_at=(followed_at + timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S"),
        now=followed_at + timedelta(days=2),
    )
    if preempted["focus_record"]["status"] != "dropped" or preempted["active"]["kind"] != "trial":
        raise RuntimeError("Combined Focus preemption did not retain the alternate ending")
    return {"shared_source_id": initial["source_id"], "initial": initial["behavioral_evidence"],
            "action": action, "focus": focus,
            "reviewed_at": {"before": started_at.strftime("%Y-%m-%d %H:%M:%S"),
                            "following": followed_at.strftime("%Y-%m-%d %H:%M:%S")},
            "before": before, "following": following, "resolved_record": resolved,
            "following_evidence": following_evidence,
            "following_recorded_dates": following_dates, "following_days": following_days,
            "preempted": preempted,
            "limitations": {"ending_context": "illustrative page-memory proposal; current Focus storage has no ended_at or conclusion"}}


def journey_capture(path):
    """Produce two real workflow alternatives from one common synthetic history."""
    path.mkdir()
    source = path / "original.sqlite"
    setting_path = path / "setting.sqlite"
    focus_path = path / "focus.sqlite"
    _combined_source(source)
    initial = _combined_initial_capture(source)
    with Store.open_readonly(str(source)) as store:
        initial["utilities"] = _carb_utility_snapshot(
            store, datetime.fromisoformat(initial["source_tail"]))
    _copy_database(source, setting_path)
    _copy_database(source, focus_path)
    setting = _combined_setting_branch(setting_path, initial)
    focus = _combined_focus_branch(focus_path, initial)
    with Store.open_readonly(str(setting_path)) as store:
        setting["utilities_by_clock"] = {
            "source_tail": _carb_utility_snapshot(store, datetime.fromisoformat(initial["source_tail"])),
            "captured": _carb_utility_snapshot(store, datetime.fromisoformat(setting["detected"]["captured_at"])),
            "active_trial": _carb_utility_snapshot(store, datetime.fromisoformat(setting["reviewed_at"]["active"])),
            "ready_trial": _carb_utility_snapshot(store, datetime.fromisoformat(setting["reviewed_at"]["ready"])),
        }
    with Store.open_readonly(str(focus_path)) as store:
        focus["utilities_by_clock"] = {
            "before": _carb_utility_snapshot(store, datetime.fromisoformat(focus["reviewed_at"]["before"])),
            "following": _carb_utility_snapshot(store, datetime.fromisoformat(focus["reviewed_at"]["following"])),
            "preempted": _carb_utility_snapshot(store, datetime.fromisoformat(focus["preempted"]["reviewed_at"])),
        }
    if setting["shared_source_id"] != focus["shared_source_id"] or setting["shared_source_id"] != initial["source_id"]:
        raise RuntimeError("Combined journey branches lost their shared original identity")
    return {"_generated_by": "mockups/harmonic-v2.exploration/generate.py",
            "_note": "SYNTHETIC. One manufactured May 2024 source history branches through shipped Plan/Trial and Focus producers. Guidance order is illustrative prototype metadata, not a certified ranker or clinical policy. Manual resolution and detected-setting preemption are alternate histories.",
            "metadata": {"guidance_order": "illustrative prototype order; backend fields preserved verbatim",
                         "shared_source_id": initial["source_id"]},
            "initial": initial, "setting_branch": setting, "focus_branch": focus}


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
        journey = journey_capture(Path(scratch) / "journey")
        utilities, glossary_module = utilities_capture()
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
            ROOT / "mockups/harmonic-v2.exploration/journey.json": json.dumps(journey, indent=2, sort_keys=True) + "\n",
            ROOT / "mockups/harmonic-v2.exploration/utilities.json": json.dumps(utilities, indent=2, sort_keys=True) + "\n",
            ROOT / "mockups/harmonic-v2.exploration/glossary.js": glossary_module,
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
