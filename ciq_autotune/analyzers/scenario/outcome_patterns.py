"""Backend-owned outcome-pattern roster (ADR 391).

This module composes published source verdicts.  It deliberately does not run a
classifier, re-price a Lever, manufacture a shared support population, or infer
an uncertainty interval that a setting owner withheld.
Overnight source nights come from the top-level ``harm_band_source_nights``
evidence copy, while printed-low nights come from ``evidence["harm"]["band_nights"]``.
"""

from __future__ import annotations

from datetime import datetime
from hashlib import sha256
from typing import Iterable

from ...uncertainty import wilson


_GATES = {
    "highs_after_meals": 12,
    "lows_after_meals": 12,
    "highs_after_treating_lows": 12,
    "lows_after_correcting_highs": 27,
    "overnight_lows_without_iob": 12,
}
"""Derived from the #391 receipt's 90-day rates by the Wilson positive-lower-bound rule, floored at 12, with 27 for lows after correcting highs."""

_ROSTER = (
    ("highs_after_meals", "Highs after meals", ("carb_undercount", "late_bolus"), ("carb_undercount", "late_bolus"), "carb_ratio", "meals"),
    ("lows_after_meals", "Lows after meals", ("meal_over_delivery",), ("meal_over_delivery",), "carb_ratio", "meals"),
    ("highs_after_treating_lows", "Highs after treating lows", ("over_treated_low",), ("over_treated_low",), None, "lows"),
    ("lows_after_correcting_highs", "Lows after correcting highs", ("correction_stacking", "correction_on_iob"), ("correction_stacking",), "isf", "correction_clusters"),
    ("overnight_lows_without_iob", "Overnight lows with no insulin on board", (), (), "basal_rate", "nights"),
)

_HABIT_EXPOSURES = {
    "carb_undercount": "meals",
    "late_bolus": "meals",
    "meal_over_delivery": "meals",
    "over_treated_low": "lows",
    "correction_stacking": "correction_clusters",
    "correction_on_iob": "lows",
}
_LOW_IDENTITY_LEVERS = frozenset({"meal_over_delivery", "correction_on_iob"})
_SETTING_ROWS = {"basal_rate": "basal", "carb_ratio": "ic_blocks", "isf": "isf"}


def _habit_members(scenarios: dict, levers: Iterable[str]) -> list[dict]:
    by_lever = {
        row.get("lever"): row
        for row in [*(scenarios.get("patterns") or ()), *(scenarios.get("low_confidence") or ())]
    }
    out = []
    for lever in levers:
        row = by_lever.get(lever)
        if row is None:
            continue
        confidence = row.get("confidence") or {}
        out.append({
            "subject": f"habit:{lever}", "kind": "habit", "k": confidence.get("k", 0),
            "price": row.get("priority", 0), "admitted": bool(row.get("guidance", {}).get("action_id")),
            "producer": "scenario", "lo": confidence.get("lo"), "hi": confidence.get("hi"),
            "seriousness": row.get("guidance", {}).get("seriousness"),
            "action": row.get("guidance", {}).get("action_id"),
        })
    return out


def _setting_seriousness(
    candidate_rows: Iterable[dict], parameter: str,
) -> list[dict]:
    from ...guidance import _state as guidance_state

    candidate = next((item for item in candidate_rows
                      if item.get("subject") == f"setting:{parameter}"), None)
    if candidate is None:
        candidate = {"kind": "setting", "action": None, "seriousness": None}
    return guidance_state(candidate)["seriousness"]


def _setting_member(
    analysis: dict, candidate_rows: Iterable[dict], parameter: str | None,
    *, overnight: bool,
) -> list[dict]:
    if parameter is None:
        return []
    row = next((item for item in analysis.get("tuning_levers") or ()
                if item.get("parameter") == parameter), None)
    if row is None:
        return []
    channel = row.get("recurrence_channel") or {}
    k = channel.get("k", 0)
    n = channel.get("n", 0)
    source_rows = {
        "basal_rate": analysis.get("basal") or (),
        "isf": analysis.get("isf") or (),
        "carb_ratio": analysis.get("ic_blocks") or (),
    }[parameter]
    admitted = any(item.get("asserts_move") for item in source_rows)
    lo, hi = channel.get("lo"), channel.get("hi")
    if overnight:
        harms = [((item.get("evidence") or {}).get("harm") or {})
                 for item in analysis.get("basal") or ()]
        k = max((item.get("band_nights", 0) for item in harms), default=0)
        n = max((item.get("evidence", {}).get("harm_band_source_nights", 0)
                 for item in analysis.get("basal") or ()), default=0)
    return [{
        "subject": f"setting:{parameter}", "kind": "setting", "k": k,
        "price": row.get("priority", 0), "admitted": admitted,
        "producer": "tuning_levers", "lo": round(lo, 4) if lo is not None else None,
        "hi": round(hi, 4) if hi is not None else None,
        "seriousness": _setting_seriousness(candidate_rows, parameter),
        "action": parameter if admitted else None,
    }]


def _identity(item: dict) -> str | None:
    return item.get("ep_id") or item.get("cause_occurrence_id") or item.get("t")


def _lever_identities(exposures: dict, lever: str) -> set[str]:
    source = (exposures.get("exposures") or {}).get(_HABIT_EXPOSURES[lever]) or {}
    return {
        identity for item in source.get("occurrences") or ()
        if item.get("attributed") and item.get("cause_lever") == lever
        if (identity := _identity(item)) is not None
    }


def _rate(exposures: dict, family: str, rate_levers: Iterable[str], *, overnight_k: int,
          overnight_n: int) -> tuple[int, int, str]:
    if family == "nights":
        return overnight_k, overnight_n, "harm_band_source_nights"
    source = (exposures.get("exposures") or {}).get(family) or {}
    identities = set().union(*(_lever_identities(exposures, lever)
                               for lever in rate_levers)) if rate_levers else set()
    return len(identities), source.get("n", 0), "exposures"


def _comparison(count: int, reason: str) -> dict:
    return {"status": "comparable", "count": count, "reason": reason}


def _not_comparable(reason: str) -> dict:
    return {"status": "not_comparable", "count": None, "reason": reason}


def _cross_pattern_overlaps(exposures: dict) -> dict[str, dict]:
    identities = {}
    families = {}
    for key, _title, habit_levers, _rate_levers, _setting, _family in _ROSTER:
        families[key] = {_HABIT_EXPOSURES[lever] for lever in habit_levers}
        identities[key] = {
            family: set().union(*(
                _lever_identities(exposures, lever) for lever in habit_levers
                if _HABIT_EXPOSURES[lever] == family
            ))
            for family in families[key]
        }
    out = {key: {} for key in identities}
    for left in identities:
        for right in identities:
            if left == right:
                continue
            shared = families[left] & families[right]
            if not families[left] or not families[right]:
                out[left][right] = _not_comparable("no_habit_exposure_identity")
            elif not shared:
                out[left][right] = _not_comparable("different_exposure_families")
            else:
                count = sum(len(identities[left][family] & identities[right][family])
                            for family in shared)
                reason = ("shared_meals_exposure" if shared == {"meals"}
                          else "shared_lows_exposure")
                out[left][right] = _comparison(count, reason)
    return out


def _low_instant(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _harm_low_ids(analysis: dict, parameter: str) -> set[datetime]:
    return {
        _low_instant(low["t"])
        for row in analysis.get(_SETTING_ROWS[parameter]) or ()
        for low in ((row.get("evidence") or {}).get("harm") or {}).get("lows") or ()
        if low.get("t") is not None
    }


def _scenario_low_ids(scenarios: dict) -> dict[str, set[datetime]]:
    out = {lever: set() for lever in _LOW_IDENTITY_LEVERS}
    for episode in (scenarios.get("episodes") or {}).values():
        lever = episode.get("lever")
        if lever not in out:
            continue
        for step in episode.get("steps") or ():
            nadir = ((step.get("citation") or {}).get("facts") or {}).get("nadir_at")
            if nadir is not None:
                out[lever].add(_low_instant(nadir))
    return out


def _harm_low_overlaps(
    analysis: dict, scenarios: dict, habit_levers: Iterable[str], parameter: str | None,
) -> list[dict]:
    if parameter is None:
        return []
    setting_lows = _harm_low_ids(analysis, parameter)
    scenario_lows = _scenario_low_ids(scenarios)
    rows = []
    for lever in habit_levers:
        row = {"habit_subject": f"habit:{lever}",
               "setting_subject": f"setting:{parameter}"}
        if lever in _LOW_IDENTITY_LEVERS:
            row.update(_comparison(
                len(scenario_lows[lever] & setting_lows), "shared_low_episode_nadir",
            ))
        else:
            row.update(_not_comparable("different_identity_spaces"))
        rows.append(row)
    return rows


def build_outcome_patterns(analysis: dict, exposures: dict, scenarios: dict) -> list[dict]:
    """Return the closed five-pattern roster from already-published source outputs.

    Correction-on-IOB remains a member of lows after correcting highs, but only
    correction stacking contributes to that Pattern's correction-cluster rate.
    """
    from ...guidance import candidates as guidance_candidates

    roster = []
    candidate_rows = guidance_candidates(analysis, exposures, scenarios)
    overlaps = _cross_pattern_overlaps(exposures)
    for key, title, habit_levers, rate_levers, setting, family in _ROSTER:
        habits = _habit_members(scenarios, habit_levers)
        overnight = family == "nights"
        members = habits + _setting_member(
            analysis, candidate_rows, setting, overnight=overnight,
        )
        overnight_n = max((
            row.get("evidence", {}).get("harm_band_source_nights", 0)
            for row in analysis.get("basal") or ()
        ), default=0)
        overnight_k = members[0]["k"] if overnight and members else 0
        k, n, producer = _rate(
            exposures, family, rate_levers,
            overnight_k=overnight_k, overnight_n=overnight_n,
        )
        if k > n:
            raise ValueError(f"{key} numerator exceeds its source population")
        bounds = wilson(k, n) if n else None
        admitted = [item for item in members if item["admitted"]]
        settings = [item for item in members if item["kind"] == "setting"]
        # A staged setting wins an interval contention; outside it, existing price
        # decides.  Equal prices retain canonical roster order by leaving max stable.
        chosen = max(admitted, key=lambda item: item["price"], default=None)
        if settings and settings[0]["admitted"]:
            habit = max((item for item in admitted if item["kind"] == "habit"),
                        key=lambda item: item["price"], default=None)
            setting_member = settings[0]
            if habit and habit.get("lo") is not None and setting_member.get("lo") is not None:
                intervals_overlap = not (
                    habit["hi"] < setting_member["lo"]
                    or setting_member["hi"] < habit["lo"]
                )
                if intervals_overlap:
                    chosen = setting_member
        collapse = ("collapse_to_member" if len(admitted) == 1 and not settings
                    else "remain_pattern")
        fingerprint = sha256(",".join(sorted(item["subject"] for item in members)).encode()).hexdigest()[:16]
        roster.append({
            "key": key, "title": title, "subject": f"pattern:{key}", "members": members,
            "rate_levers": [f"habit:{lever}" for lever in rate_levers], "n": n, "k": k,
            "rate": round(k / n, 4) if n else None,
            "wilson": ({"lo": round(bounds[1], 4), "hi": round(bounds[2], 4)} if bounds else None),
            "rate_producer": producer, "readiness": {"count": n, "gate": _GATES[key], "verdict": "ready" if n >= _GATES[key] else "withheld"},
            "settled_price": chosen["price"] if chosen else 0,
            "admission_route": ("setting_staging" if chosen and chosen["kind"] == "setting" else "habit_threshold" if chosen else "none"),
            "collapse": collapse, "action": chosen["action"] if chosen else None,
            "seriousness": chosen["seriousness"] if chosen else None,
            "overlap_counts": overlaps[key],
            "harm_low_overlap": _harm_low_overlaps(
                analysis, scenarios, habit_levers, setting,
            ),
            "member_set_fingerprint": fingerprint,
        })
    return roster
