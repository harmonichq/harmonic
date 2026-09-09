"""Backend-owned outcome-pattern roster (ADR 391).

This module composes published source verdicts.  It deliberately does not run a
classifier, re-price a Lever, or manufacture a shared support population.
"""

from __future__ import annotations

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

_ROSTER = (
    ("highs_after_meals", "Highs after meals", ("carb_undercount", "late_bolus"), "carb_ratio", "meals"),
    ("lows_after_meals", "Lows after meals", ("meal_over_delivery",), "carb_ratio", "meals"),
    ("highs_after_treating_lows", "Highs after treating lows", ("over_treated_low",), None, "lows"),
    ("lows_after_correcting_highs", "Lows after correcting highs", ("correction_stacking", "correction_on_iob"), "isf", "correction_clusters"),
    ("overnight_lows_without_iob", "Overnight lows with no insulin on board", (), "basal_rate", "nights"),
)


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


def _setting_member(analysis: dict, parameter: str | None, *, overnight: bool) -> list[dict]:
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
    if admitted and lo is None and hi is None and n:
        _, lo, hi = wilson(k, n)
    if overnight:
        harms = [item.get("evidence") or {} for item in analysis.get("basal") or ()]
        k = max((item.get("band_nights", 0) for item in harms), default=0)
        n = max((item.get("harm_band_source_nights", 0) for item in harms), default=0)
    return [{
        "subject": f"setting:{parameter}", "kind": "setting", "k": k,
        "price": row.get("priority", 0), "admitted": admitted,
        "producer": "tuning_levers", "lo": round(lo, 4) if lo is not None else None,
        "hi": round(hi, 4) if hi is not None else None,
        "seriousness": None, "action": parameter if admitted else None,
    }]


def _rate(exposures: dict, family: str, habits: list[dict], *, overnight_n: int) -> tuple[int, int, str]:
    if family == "nights":
        return (habits[0]["k"] if habits else 0, overnight_n, "harm_band_source_nights")
    source = (exposures.get("exposures") or {}).get(family) or {}
    rate_levers = {item["subject"].removeprefix("habit:") for item in habits}
    identities = {
        item.get("ep_id") or item.get("cause_occurrence_id") or item.get("t")
        for item in source.get("occurrences") or ()
        if item.get("attributed") and item.get("cause_lever") in rate_levers
    }
    return len(identities), source.get("n", 0), "exposures"


def build_outcome_patterns(analysis: dict, exposures: dict, scenarios: dict) -> list[dict]:
    """Return the closed five-pattern roster from already-published source outputs."""
    roster = []
    for key, title, habit_levers, setting, family in _ROSTER:
        habits = _habit_members(scenarios, habit_levers)
        overnight = family == "nights"
        members = habits + _setting_member(analysis, setting, overnight=overnight)
        overnight_n = max((
            row.get("evidence", {}).get("harm_band_source_nights", 0)
            for row in analysis.get("basal") or ()
        ), default=0)
        k, n, producer = _rate(exposures, family, habits if not overnight else members,
                               overnight_n=overnight_n)
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
                overlaps = not (habit["hi"] < setting_member["lo"] or setting_member["hi"] < habit["lo"])
                if overlaps:
                    chosen = setting_member
        collapse = ("collapse_to_member" if len(admitted) == 1 and not settings
                    else "remain_pattern")
        fingerprint = sha256(",".join(sorted(item["subject"] for item in members)).encode()).hexdigest()[:16]
        roster.append({
            "key": key, "title": title, "subject": f"pattern:{key}", "members": members,
            "rate_levers": [item["subject"] for item in habits], "n": n, "k": k,
            "rate": round(k / n, 4) if n else None,
            "wilson": ({"lo": round(bounds[1], 4), "hi": round(bounds[2], 4)} if bounds else None),
            "rate_producer": producer, "readiness": {"count": n, "gate": _GATES[key], "verdict": "ready" if n >= _GATES[key] else "withheld"},
            "settled_price": chosen["price"] if chosen else 0,
            "admission_route": ("setting_staging" if chosen and chosen["kind"] == "setting" else "habit_threshold" if chosen else "none"),
            "collapse": collapse, "action": chosen["action"] if chosen else None,
            "seriousness": chosen["seriousness"] if chosen else None,
            "member_set_fingerprint": fingerprint,
        })
    return roster
