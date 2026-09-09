"""ADR 383 selection, citations, and bounded preference comparison."""
from __future__ import annotations

from copy import deepcopy

from .analyzers.scenario.levers import Lever
from .watched_change import is_pinnable
from .window_membership import _hhmm as _clock_label

COMPARISON_VERSION = "383:1"
SCHEMA = "guidance-v2"
_SEVERITY = {None: -1, "info": 0, "low": 1, "medium": 2, "high": 3}
_SETTING_UNITS = {"basal_rate": "U/h", "carb_ratio": "g/U", "isf": "mg/dL/U"}
_PRIORITY_FIELDS = (
    "parameter", "title", "impact", "recurrence", "priority", "impact_u_day",
    "headline_start_min", "recurrence_channel",
)
_SUPPORT_FIELDS = {
    "basal_rate": ("points", "night_roster", "roster_glucose_mean",
                   "excluded_night_count", "directional_support_count", "harm"),
    "isf": ("direction", "fast_window", "intercept", "n_steps", "night_fits",
            "night_median", "points", "programmed", "r_squared",
            "recurrence_channels", "rescue_evidence", "rest_windows", "slope",
            "strengthen_signal"),
    "carb_ratio": ("eligibility", "n_runs_excluded", "n_runs_touching", "points",
                   "preempted_low_gate", "recurrence_channels", "runs"),
}
_TREATMENT_FIELDS = {"recommended", "priced_target"}
_SETTING_SUBJECTS = frozenset({
    "setting:basal_rate", "setting:carb_ratio", "setting:isf",
})
_INVESTIGATION_SUBJECTS = frozenset({"investigation:uncaused_highs"})
_HABIT_SUBJECTS = frozenset(f"habit:{lever.value}" for lever in Lever)
_PREFERENCE_SUBJECTS = _SETTING_SUBJECTS | _HABIT_SUBJECTS | _INVESTIGATION_SUBJECTS
_BUILDING_PATTERNS = False


def is_preference_subject(subject):
    """Whether ``subject`` belongs to ADR 383's closed stable identity set."""
    return subject in _PREFERENCE_SUBJECTS or (
        isinstance(subject, str) and subject.startswith("pattern:"))


def _factual(value):
    """Copy a closed owner payload without its treatment-pricing fields."""
    if isinstance(value, dict):
        return {key: _factual(item) for key, item in value.items()
                if key not in _TREATMENT_FIELDS}
    if isinstance(value, list):
        return [_factual(item) for item in value]
    return deepcopy(value)


def _priority_inputs(analysis, parameter):
    row = next((row for row in analysis.get("tuning_levers") or []
                if row.get("parameter") == parameter), {})
    return _factual({key: row[key] for key in _PRIORITY_FIELDS if key in row})


def _canonical_actions(actions):
    """Merge equal adjacent pump-entry instructions; source ids never enter state."""
    rows = [{key: action[key] for key in
             ("parameter", "start_min", "end_min", "direction", "units", "recommended")}
            for action in actions]
    rows.sort(key=lambda row: (row["parameter"], row["start_min"], row["end_min"],
                               row["direction"], row["units"], row["recommended"]))
    merged = []
    for row in rows:
        if (merged and merged[-1]["parameter"] == row["parameter"]
                and merged[-1]["end_min"] == row["start_min"]
                and all(merged[-1][key] == row[key]
                        for key in ("direction", "units", "recommended"))):
            merged[-1]["end_min"] = row["end_min"]
        else:
            merged.append(row)
    return merged


def _member_interval(parameter, member):
    action = (member.get("guidance") or {}).get("action")
    if action:
        return action["start_min"], action["end_min"]
    if parameter == "basal_rate":
        start = member["slot"] * 30
        return start, start + 30
    if parameter == "carb_ratio":
        return member["start_min"], member["end_min"]
    return 0, 1440


def _safe_member(parameter, member):
    start, end = _member_interval(parameter, member)
    guidance = member.get("guidance")
    evidence = member.get("evidence") or {}
    support = _factual({key: evidence[key] for key in _SUPPORT_FIELDS[parameter]
                        if key in evidence})
    return {"chart_identity": (member.get("slot") if parameter == "basal_rate"
                               else member.get("block_id") if parameter == "carb_ratio"
                               else member.get("label")),
            "span": {"start_min": start, "end_min": end},
            "asserts_move": member.get("asserts_move"),
            "safety_status": member.get("safety_status"),
            "held_reason": member.get("held_reason"),
            "direction": member.get("direction") or support.get("direction"),
            "support": support,
            "guidance_available": guidance is not None,
            "harm": (guidance or {}).get("seriousness")}


def _observed_support(parameter, member):
    """The parameter owner's nonzero observed denominator, never dict truthiness."""
    evidence = member.get("evidence") or {}
    if parameter == "basal_rate":
        return max(member.get("days") or 0,
                   (member.get("estimate") or {}).get("n") or 0,
                   len(evidence.get("points") or [])) > 0
    if parameter == "isf":
        return max(evidence.get("n_steps") or 0,
                   len(evidence.get("night_fits") or []),
                   len(evidence.get("points") or [])) > 0
    eligibility = evidence.get("eligibility") or {}
    return max(member.get("n_runs") or 0, eligibility.get("n_runs") or 0,
               eligibility.get("effective_run_count") or 0,
               len(evidence.get("runs") or [])) > 0


def _is_setting_concern(parameter, member):
    if member.get("asserts_move") is True:
        return True
    if not _observed_support(parameter, member):
        return False
    if parameter == "basal_rate":
        return member.get("safety_status") not in (None, "no data", "no change")
    if parameter == "carb_ratio":
        return member.get("state") != "numeric" or bool(member.get("held_reason"))
    return bool(member.get("annotation") or (member.get("evidence") or {}).get("direction"))


def _setting(subject, parameter, members, analysis):
    if not members:
        return None
    concerned = [member for member in members if _is_setting_concern(parameter, member)]
    if not concerned:
        return None
    unavailable = any(member.get("guidance") is None for member in concerned)
    actions = [deepcopy((member["guidance"] or {}).get("action")) for member in members
               if (member.get("guidance") or {}).get("action") is not None]
    actions.sort(key=lambda row: (row["start_min"], row["end_min"]))
    safe_members = [_safe_member(parameter, member) for member in concerned]
    harms = [{"start_min": member["span"]["start_min"], "end_min": member["span"]["end_min"],
              "seriousness": member["harm"]}
             for member in safe_members if member["harm"] is not None]
    priority_inputs = _priority_inputs(analysis, parameter)
    return {"subject": subject, "kind": "setting", "parameter": parameter,
            "title": priority_inputs.get("title"), "units": _SETTING_UNITS[parameter],
            "priority": priority_inputs.get("priority"),
            "priority_inputs": priority_inputs,
            "source_window": deepcopy(analysis.get("span")),
            "action": None if unavailable else actions or None,
            "seriousness": harms, "members": safe_members, "evidence": [],
            "support": {}, "population": [], "occurrence_ids": [],
            "unknowns": (["Guidance inputs are unavailable for retained analyzer data."] if unavailable
                         else [member["safety_status"] or member["held_reason"]
                               for member in safe_members if not member["asserts_move"]
                               and (member["safety_status"] or member["held_reason"])]),
            "unavailable": unavailable}


def _citations(pattern, scenarios):
    episodes = scenarios.get("episodes") or {}
    out, unavailable = [], False
    episode_ids = (pattern.get("guidance") or {}).get("citation_episode_ids") or []
    if not episode_ids:
        return [], True
    for episode_id in episode_ids:
        episode = episodes.get(episode_id)
        citations = [step["citation"] for step in (episode or {}).get("steps") or []
                     if step.get("citation") is not None]
        if not citations:
            unavailable = True
        else:
            out.append({"episode_id": episode_id,
                        "uncertainty": deepcopy(pattern.get("confidence") or {}),
                        "citations": citations})
    return out, unavailable


def _source_candidates(analysis, exposures, scenarios):
    out = []
    for subject, parameter, rows in (
            ("setting:basal_rate", "basal_rate", analysis.get("basal") or []),
            ("setting:carb_ratio", "carb_ratio", analysis.get("ic_blocks") or []),
            ("setting:isf", "isf", analysis.get("isf") or [])):
        candidate = _setting(subject, parameter, rows, analysis)
        if candidate:
            out.append(candidate)
    threshold = scenarios.get("priority_active_threshold")
    surfaced = scenarios.get("patterns") or []
    for pattern in surfaced + (scenarios.get("low_confidence") or []):
        guidance = pattern.get("guidance") or {}
        citations, citations_unavailable = _citations(pattern, scenarios)
        lever, action_id = pattern.get("lever"), guidance.get("action_id")
        threshold_unavailable = not isinstance(threshold, (int, float))
        unavailable = citations_unavailable or threshold_unavailable
        admitted = (not unavailable and pattern in surfaced and action_id is not None
                    and is_pinnable(lever) and isinstance(pattern.get("priority"), int)
                    and pattern["priority"] >= threshold)
        out.append({"subject": f"habit:{lever}", "kind": "habit", "lever": lever,
                    "title": pattern.get("title"), "units": None,
                    "priority": pattern.get("priority"), "action": {"action_id": action_id} if admitted else None,
                    "seriousness": guidance.get("seriousness"), "members": [], "evidence": citations,
                    "support": deepcopy(pattern.get("confidence") or {}),
                    "population": deepcopy(pattern.get("occurrence_groups") or []),
                    "occurrence_ids": list(pattern.get("occurrences") or []),
                    "source_window": deepcopy(scenarios.get("window")),
                    "priority_inputs": {key: pattern.get(key)
                                        for key in ("priority", "impact", "recurrence")},
                    "unavailable": unavailable,
                    "unknowns": (["Structured guidance citations are unavailable."]
                                 if citations_unavailable else
                                 ["The source Priority threshold is unavailable."]
                                 if threshold_unavailable
                                 else [] if admitted else ["This finding is not admitted for action."])})
    highs = ((exposures.get("exposures") or {}).get("highs") or {}).get("uncaused") or 0
    if highs:
        out.append({"subject": "investigation:uncaused_highs", "kind": "investigation",
                    "title": "Highs without a detected cause", "units": None,
                    "priority": None, "action": None, "seriousness": None, "members": [],
                    "evidence": [{"operation": "uncaused_highs", "count": highs}],
                    "support": {"count": highs}, "population": [], "occurrence_ids": [],
                    "source_window": deepcopy(exposures.get("window")), "priority_inputs": {},
                    "unavailable": False, "unknowns": ["No cause was detected by the app."]})
    return out


def _pattern_candidate(pattern, sources):
    """Adapt the outcome roster; its policy remains owned by its producer."""
    chosen = next((member for member in pattern["members"]
                   if member.get("action") == pattern.get("action")), None)
    action = ({"action_id": pattern["action"]} if pattern.get("action") else None)
    readiness = pattern["readiness"]
    habit_sources = [sources.get(member["subject"], {}) for member in pattern["members"]
                     if member["kind"] == "habit"]
    unavailable = any(row.get("unavailable") for row in habit_sources)
    return {
        "subject": pattern["subject"], "kind": "pattern", "pattern_key": pattern["key"],
        "title": pattern["title"], "units": None, "priority": pattern["settled_price"],
        "action": action, "seriousness": pattern.get("seriousness"),
        "members": deepcopy(pattern["members"]), "evidence": [], "support": {},
        "population": [], "occurrence_ids": [], "source_window": None,
        "priority_inputs": {"member_set_fingerprint": pattern["member_set_fingerprint"]},
        "unavailable": unavailable,
        "unknowns": (["Required owner-produced guidance inputs are unavailable."] if unavailable else
                     [] if action else ["No supported action was admitted; the source evidence remains inspectable."]),
        "readiness": {**readiness, "reason": (
            "Focus is ready from the backend opportunity count."
            if readiness["verdict"] == "ready" else
            f"Focus is withheld: {readiness['count']} opportunities, gate {readiness['gate']}."
        )},
        "admission_route": pattern["admission_route"], "collapse": pattern["collapse"],
        "chosen_member": chosen,
    }


def candidates(analysis, exposures, scenarios):
    """Return setting rows plus the one deterministic backend Pattern roster."""
    global _BUILDING_PATTERNS
    source = _source_candidates(analysis, exposures, scenarios)
    if _BUILDING_PATTERNS:
        return source
    from .analyzers.scenario.outcome_patterns import build_outcome_patterns
    _BUILDING_PATTERNS = True
    try:
        roster = build_outcome_patterns(analysis, exposures, scenarios)
    finally:
        _BUILDING_PATTERNS = False
    # Settings remain inspectable and independently stageable. Only roster-owned
    # habits move to Pattern subjects; other legacy behavioral rows retain their
    # existing public identity until a Pattern owns them.
    by_subject = {row["subject"]: row for row in source}
    owned = {member["subject"] for pattern in roster for member in pattern["members"]
             if member["kind"] == "habit"}
    return [row for row in source if row["kind"] != "habit" or row["subject"] not in owned] + [
        _pattern_candidate(pattern, by_subject) for pattern in roster
    ]


def _state(candidate):
    if candidate["kind"] == "setting":
        return {"kind": "setting", "action": _canonical_actions(candidate.get("action") or []),
                "seriousness": candidate.get("seriousness") or []}
    if candidate["kind"] == "pattern":
        return {"kind": "pattern", "action": candidate.get("action"),
                "seriousness": candidate.get("seriousness"),
                "member_set_fingerprint": candidate["priority_inputs"]["member_set_fingerprint"]}
    return {"kind": candidate["kind"], "action": candidate.get("action"), "seriousness": candidate.get("seriousness")}


def _overlap(left, right):
    return max(left[0], right[0]) < min(left[1], right[1])


def _describe(action):
    hours = f"{_clock_label(action['start_min'])}–{_clock_label(action['end_min'])}"
    return (f"{hours}: {action['direction']} to "
            f"{action['recommended']} {action['units']}")


def _setting_change(old, new):
    for current in new:
        overlaps = [saved for saved in old if saved["parameter"] == current["parameter"]
                    and _overlap((saved["start_min"], saved["end_min"]), (current["start_min"], current["end_min"]))]
        if not overlaps:
            return f"New instruction: {_describe(current)}."
        for saved in overlaps:
            if any(saved[key] != current[key] for key in ("direction", "units", "recommended")):
                return f"Instruction changed from {_describe(saved)} to {_describe(current)}."
        covered = sorted((max(saved["start_min"], current["start_min"]),
                          min(saved["end_min"], current["end_min"]))
                         for saved in overlaps
                         if all(saved[key] == current[key]
                                for key in ("direction", "units", "recommended")))
        edge = current["start_min"]
        for start, end in covered:
            if start > edge:
                return f"New instruction: {_describe(current)}."
            edge = max(edge, end)
        if edge < current["end_min"]:
            return f"New instruction: {_describe(current)}."
    return None


def _new_harm(old, new):
    for current in new:
        covered = sorted((max(saved["start_min"], current["start_min"]),
                          min(saved["end_min"], current["end_min"]))
                         for saved in old if saved["seriousness"] == current["seriousness"]
                         and _overlap((saved["start_min"], saved["end_min"]),
                                      (current["start_min"], current["end_min"])))
        edge = current["start_min"]
        for start, end in covered:
            if start > edge:
                return ("Recurring-low verdict now affects "
                        f"{_clock_label(current['start_min'])}–"
                        f"{_clock_label(current['end_min'])}.")
            edge = max(edge, end)
        if edge < current["end_min"]:
            return ("Recurring-low verdict now affects "
                    f"{_clock_label(current['start_min'])}–"
                    f"{_clock_label(current['end_min'])}.")
    return None


def preference_status(candidate, preference):
    if preference is None:
        return {"set_aside": False, "return_reason": None}
    saved = preference.get("state") or {}
    if preference.get("comparison_version") != COMPARISON_VERSION:
        return {"set_aside": True, "return_reason": "Comparison version is unknown; Restore is required."}
    current = _state(candidate)
    if current["kind"] == "setting":
        reason = _setting_change(saved.get("action") or [], current["action"]) or _new_harm(saved.get("seriousness") or [], current["seriousness"])
    else:
        reason = ("A recommended action is now available." if not saved.get("action") and current["action"]
                  else "The recommended action changed." if saved.get("action") and current["action"] and saved["action"] != current["action"]
                  else "The owner-reported seriousness increased." if _SEVERITY.get(current.get("seriousness"), -1) > _SEVERITY.get(saved.get("seriousness"), -1) else None)
        if current["kind"] == "pattern" and saved.get("member_set_fingerprint") != current.get("member_set_fingerprint"):
            reason = "The Pattern member set changed."
    return {"set_aside": reason is None, "return_reason": reason}


def _admission_reason(candidate):
    if candidate is None:
        return None
    if candidate.get("action") is not None:
        if candidate["kind"] == "setting":
            staged = sum(bool(member.get("asserts_move")) for member in candidate["members"])
            return f"The parameter owner staged {staged} member verdict(s) with their own evidence."
        return "The surfaced Pattern passed its source Priority and existing Focus admission checks."
    if candidate.get("unavailable"):
        return "Required owner-produced guidance inputs are unavailable."
    if candidate["kind"] == "setting":
        return "The parameter owner withheld staging; its member verdicts remain inspectable evidence."
    return "No supported action was admitted; the source evidence remains inspectable."


def _ordering_reason(candidate, disposition):
    if disposition == "eligible_action":
        return (f"Priority {candidate['priority']} leads the available admitted actions; "
                "an exact tie breaks by canonical subject.")
    if disposition == "guided_investigation":
        return ("Priced investigations lead unpriced ones by source Priority; "
                "an exact tie breaks by canonical subject.")
    return None


def build_guidance(*, analysis, exposures, scenarios, preferences=(), active_watch=None, generation="standalone:0", window=None):
    if analysis is None or any(name not in analysis for name in ("basal", "isf", "ic_blocks")):
        return {"schema": SCHEMA, "analysis_generation": generation, "window": window, "active_watch": active_watch,
                "selected": None, "disposition": "unavailable", "reasons": {"admission": None, "ordering": None, "return": None},
                "unavailable": "Required analysis inputs are unavailable.", "candidates": [], "alternatives": []}
    all_candidates, stored = candidates(analysis, exposures, scenarios), {row["subject"]: row for row in preferences}
    for row in all_candidates:
        row["preference"], row["admitted"] = preference_status(row, stored.get(row["subject"])), row.get("action") is not None
        if row["subject"] in stored:
            row["decision"] = {key: stored[row["subject"]][key] for key in ("decided_at", "reason", "comparison_version", "state")}
    known = {row["subject"] for row in all_candidates}
    absent = [{"subject": row["subject"], "kind": None, "title": None, "units": None,
               "absent": True, "action": None, "members": [], "evidence": [],
               "support": {}, "population": [], "occurrence_ids": [], "source_window": None,
               "priority": None, "priority_inputs": {}, "seriousness": None,
               "unavailable": False, "unknowns": [],
               "preference": {"set_aside": True,
                              "return_reason": ("Comparison version is unknown; Restore is required."
                                                if row["comparison_version"] != COMPARISON_VERSION
                                                else None)},
               "decision": {key: row[key] for key in ("decided_at", "reason", "comparison_version", "state")}}
              for row in preferences if row["subject"] not in known]
    selection_rows = [row for row in all_candidates if row["kind"] != "setting"
                      and (row.get("action") is not None or row.get("unavailable")
                           or any(member.get("k", 0) for member in row.get("members", ()) ))]
    available = sorted((row for row in selection_rows
                        if row["admitted"] and isinstance(row.get("priority"), int)
                        and not row["preference"]["set_aside"]),
                       key=lambda row: (-row["priority"], row["subject"]))
    evidenced = sorted((row for row in selection_rows if not row["unavailable"]
                        and not row["preference"]["set_aside"]),
                       key=lambda row: (row.get("priority") is None,
                                        -(row.get("priority") or 0), row["subject"]))
    unavailable_candidates = [row for row in all_candidates if row["unavailable"]
                              and not row["preference"]["set_aside"]]
    span = analysis.get("span") or {}
    source_missing = (not span.get("start") and not span.get("end")
                      and not (scenarios.get("patterns") or scenarios.get("low_confidence"))
                      and not any((family or {}).get("n")
                                  for family in (exposures.get("exposures") or {}).values()))
    if active_watch is not None:
        selected, disposition = None, "active_change"
        admission_reason = "An authoritative watched change is active."
        ordering_reason = "The active watched change precedes every new concern."
    elif available:
        selected, disposition = available[0], "eligible_action"
        admission_reason, ordering_reason = _admission_reason(selected), _ordering_reason(selected, disposition)
    elif evidenced:
        selected, disposition = evidenced[0], "guided_investigation"
        admission_reason, ordering_reason = _admission_reason(selected), _ordering_reason(selected, disposition)
    elif unavailable_candidates or source_missing:
        selected, disposition = None, "unavailable"
        admission_reason = ordering_reason = None
    else:
        selected, disposition = None, "quiet"
        admission_reason = ("All current concerns are set aside."
                            if all_candidates else "No current concern.")
        ordering_reason = None
    return {"schema": SCHEMA, "analysis_generation": generation, "window": window, "active_watch": active_watch,
            "selected": selected, "disposition": disposition,
            "reasons": {"admission": admission_reason, "ordering": ordering_reason,
                        "return": selected and selected["preference"].get("return_reason")},
            "unavailable": ("Required owner-produced guidance inputs are unavailable."
                            if disposition == "unavailable" else None),
            "candidates": all_candidates + absent, "alternatives": [row for row in all_candidates if row is not selected]}


def baseline_for(candidate):
    if candidate is None or candidate.get("absent"):
        raise KeyError("unknown guidance subject")
    return {"comparison_version": COMPARISON_VERSION, "state": _state(candidate)}


def plan_deliverable(segments, items):
    """Backend Plan capture; executable parity with frontend/plan.js owns drift."""
    from .store import validate_plan_items
    validate_plan_items(items)
    if not segments:
        return []
    params = {"basal_rate": "basal", "isf": "isf", "carb_ratio": "ic", "target_bg": "target"}
    accepted = {(item["start_min"], item["type"]): item for item in items}
    starts = {row["start_min"] for row in segments} | {item["start_min"] for item in items}
    starts.update(item["start_min"] + 30 for item in items
                  if item["type"] == "basal" and item["start_min"] + 30 < 1440)
    rows = []
    for start in sorted(starts):
        segment = _schedule_at(segments, start)
        row = {"start_min": start, "label": f"{start // 60:02d}:{start % 60:02d}",
               "isNewBreak": start not in {s["start_min"] for s in segments}}
        for parameter, family in params.items():
            current = segment.get(parameter)
            pick = accepted.get((start, family))
            if pick is None and family != "basal":
                candidates = [p for (minute, kind), p in accepted.items() if kind == family and minute <= start]
                candidate = max(candidates, key=lambda p: p["start_min"], default=None)
                if candidate and _schedule_at(segments, candidate["start_min"])["start_min"] == segment["start_min"]:
                    pick = candidate
            cell = {"current": current, "value": current, "provenance": "current"}
            if pick is not None and pick.get("value") is not None:
                cell.update(value=pick["value"], provenance="accepted")
                if family == "ic" and pick.get("ic_block_provenance"):
                    cell["ic_block_provenance"] = pick["ic_block_provenance"]
            row[parameter] = cell
        rows.append(row)
    return rows


def _schedule_at(rows, minute):
    return next((row for row in reversed(rows) if row["start_min"] <= minute), rows[0])


def schedule_matches(planned, actual):
    """Compare every parameter at the union of boundaries with pump precision."""
    from .result import plan_value
    if not planned or not actual:
        return False
    for minute in {row["start_min"] for row in planned + actual}:
        left, right = _schedule_at(planned, minute), _schedule_at(actual, minute)
        for parameter in ("basal_rate", "isf", "carb_ratio", "target_bg"):
            value = left.get(parameter)
            if isinstance(value, dict):
                value = value["value"]
            # Target and ISF both use whole-number pump precision.
            precision_parameter = "isf" if parameter == "target_bg" else parameter
            if plan_value(value, precision_parameter) != plan_value(right.get(parameter), precision_parameter):
                return False
    return True
