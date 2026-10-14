"""Backend-owned outcome-pattern roster (ADR 391).

This module composes published source verdicts.  It deliberately does not run a
classifier, re-price a Lever, manufacture a shared support population, or infer
an uncertainty interval that a setting owner withheld.
A clock-scoped roster carries a Pattern only when its outcomes land in the window
(:func:`pattern_in_window`). Every Pattern carries at least one pinnable habit
(ADR 499): a Pattern only a setting could answer is that setting counted twice.
"""

from __future__ import annotations

from hashlib import sha256
from typing import Iterable

from ...uncertainty import wilson
_GATES = {
    "highs_after_meals": 12,
    "lows_after_meals": 12,
    "highs_after_treating_lows": 12,
    "lows_after_correcting_highs": 12,
}
"""Derived from the #391 receipt's 90-day rates by the Wilson positive-lower-bound
rule, floored at 12. The receipt carries no union-of-correction-stacking-and-
correction-on-IOB rate over lows, so ``lows_after_correcting_highs`` uses the ADR's
lows-family floor of 12 rather than a derived bound.
"""

_ROSTER = (
    ("highs_after_meals", "Highs after meals", ("carb_undercount", "late_bolus"), ("carb_undercount", "late_bolus"), "carb_ratio", "meals"),
    ("lows_after_meals", "Lows after meals", ("meal_over_delivery",), ("meal_over_delivery",), "carb_ratio", "meals"),
    ("highs_after_treating_lows", "Highs after treating lows", ("over_treated_low",), ("over_treated_low",), None, "lows"),
    # The correction factor never queues (ADR 499), so this Pattern has no setting member.
    ("lows_after_correcting_highs", "Lows after correcting highs", ("correction_stacking", "correction_on_iob"), ("correction_stacking", "correction_on_iob"), None, "lows"),
)

_SETTING_ROWS = {"carb_ratio": "ic_blocks"}


def opportunity_readiness(key: str, analysis: dict, exposures: dict) -> dict:
    """Read one Pattern's opportunity criterion from its published source family.

    Both the roster and exact-period follow-up use this gate, unit and count
    authority. Occurrence dates are supplied by the exposure producer.
    """
    family = next(family for pattern, *_rest, family in _ROSTER if pattern == key)
    source = (exposures.get("exposures") or {}).get(family) or {}
    count = source.get("n", 0)
    dates = sorted({item["t"][:10] for item in source.get("occurrences") or ()
                    if item.get("t") is not None})
    gate = _GATES[key]
    return {"count": count, "gate": gate, "unit": family,
            "verdict": "ready" if count >= gate else "withheld",
            "reason": "zero_opportunities" if not count else "collecting" if count < gate else None,
            "contributing_dates": dates}


def _habit_members(scenarios: dict, levers: Iterable[str], *, exposures: dict | None = None,
                   family: str | None = None) -> list[dict]:
    """Use a scoped producer population when one was explicitly requested.

    Scenario guidance still owns admission and price.  A clock-scoped Pattern
    must not retain a member whose published episode ownership has no occurrence
    in that same outcome population, however, so its count and interval come
    from the already-filtered exposure rows rather than a whole-day scenario.
    """
    by_lever = {
        row.get("lever"): row
        for row in [*(scenarios.get("patterns") or ()), *(scenarios.get("low_confidence") or ())]
    }
    out = []
    occurrences = ((exposures or {}).get("exposures", {}).get(family or "", {})
                   .get("occurrences", []))
    denominator = len(occurrences)
    for lever in levers:
        row = by_lever.get(lever)
        if row is None:
            continue
        confidence = row.get("confidence") or {}
        if exposures is not None:
            owned = {item.get("ep_id") or item.get("t") for item in occurrences
                     if lever in item.get("attributed_levers", [])
                     or item.get("cause_lever") == lever}
            owned.discard(None)
            if not owned:
                continue
            k = len(owned)
            bounds = wilson(k, denominator) if denominator else None
            lo, hi = (bounds[1], bounds[2]) if bounds else (None, None)
        else:
            k = confidence.get("k", 0)
            lo, hi = confidence.get("lo"), confidence.get("hi")
        out.append({
            "subject": f"habit:{lever}", "kind": "habit", "k": k,
            "price": row.get("priority", 0), "admitted": bool(row.get("guidance", {}).get("action_id")),
            "producer": "scenario", "lo": lo, "hi": hi,
            "seriousness": row.get("guidance", {}).get("seriousness"),
            "action": row.get("guidance", {}).get("action_id"),
            "admission_basis": row["admission_basis"],
        })
    return out


def _uncertain(bounds, chosen: dict | None) -> bool:
    """Whether a Pattern reads Uncertain: in the Queue without its admission holding
    at the low end of its evidence (ADR 485).

    A missing range is as soft as it gets. Outside the Queue nothing is admitted to be
    uncertain about, so the range's precision alone never flags it. A setting admits
    only through its owner's ``asserts_move``, whose support floor already judges the
    low end. A habit holds only when the scenario engine surfaced it on its Wilson
    lower-bound score, not through the strong override nor from its low-confidence tier.
    """
    if not bounds:
        return True
    if chosen is None or chosen["kind"] == "setting":
        return False
    return chosen["admission_basis"] != "lower_bound"


def _setting_seriousness(
    candidate: dict | None, admitted_row: dict | None,
) -> tuple[str | None, list[dict]]:
    """Return the selected owner's category and guidance's structured comparison state.

    Setting seriousness has no cross-category severity order: guidance compares
    its owner-published categories over their spans.  The categorical Pattern
    value therefore comes from one owner member itself, while the complete span
    list remains available separately for guidance's own comparison.
    """
    from ...guidance import _state as guidance_state

    if candidate is None:
        candidate = {"kind": "setting", "action": None, "seriousness": None}
    segments = guidance_state(candidate)["seriousness"]
    seriousness = (admitted_row or {}).get("harm")
    if admitted_row is not None and "span" not in admitted_row:
        seriousness = (admitted_row.get("guidance") or {}).get("seriousness")
    return seriousness, segments


def _setting_member(
    analysis: dict, candidate_rows: Iterable[dict], parameter: str | None,
) -> list[dict]:
    """Compose one setting member without reclassifying its owner's verdicts.

    Categorical seriousness uses the first asserting member's harm when present,
    otherwise the first relevant member harm (including an owner-published hold).
    Price remains the tuning Lever's parameter-level Priority.
    """
    if parameter is None:
        return []
    row = next((item for item in analysis.get("tuning_levers") or ()
                if item.get("parameter") == parameter), None)
    if row is None:
        return []
    channel = row.get("recurrence_channel") or {}
    source_rows = analysis.get(_SETTING_ROWS[parameter]) or ()
    admitted_row = next((item for item in source_rows if item.get("asserts_move")), None)
    candidate = next((item for item in candidate_rows
                      if item.get("subject") == f"setting:{parameter}"), None)
    published_rows = (candidate or {}).get("members") or ()
    admitted = admitted_row is not None
    lo, hi = channel.get("lo"), channel.get("hi")
    seriousness_row = admitted_row
    if (seriousness_row or {}).get("harm") is None:
        seriousness_row = next((item for item in published_rows
                                if item.get("harm") is not None), seriousness_row)
    seriousness, seriousness_segments = _setting_seriousness(candidate, seriousness_row)
    return [{
        "subject": f"setting:{parameter}", "kind": "setting", "k": channel.get("k", 0),
        "price": row.get("priority", 0), "admitted": admitted,
        "producer": "tuning_levers", "lo": round(lo, 4) if lo is not None else None,
        "hi": round(hi, 4) if hi is not None else None,
        "seriousness": seriousness,
        "seriousness_segments": seriousness_segments,
        "action": parameter if admitted else None,
    }]


def _lever_identities(exposures: dict, family: str, lever: str) -> set[str]:
    """Read a rate lever's claims from the Pattern's target-family population."""
    source = (exposures.get("exposures") or {}).get(family) or {}
    return {
        item["t"] for item in source.get("occurrences") or ()
        if lever in (item.get("attributed_levers") or ())
        and item.get("t") is not None
    }


def credited_claims(exposures: dict, family: str,
                    rate_levers: Iterable[str]) -> dict[str, str]:
    """Credit each claimed Occurrence of a Pattern's family to exactly one rate lever.

    The credit goes to the first lever, in ``rate_levers`` order, whose claims include
    the Occurrence, so a meal two rate levers both claim counts once (ADR 424). The
    Pattern's count, its case file's per-meal member and each folded cause's share of
    that count all read this one map over the same window population.
    """
    credits: dict[str, str] = {}
    for lever in rate_levers:
        for identity in _lever_identities(exposures, family, lever):
            credits.setdefault(identity, lever)
    return credits


def build_outcome_patterns(analysis: dict, exposures: dict, scenarios: dict, *,
                           scoped_population: bool = False) -> list[dict]:
    """Return the closed four-pattern roster from already-published source outputs.

    A Pattern's count is its family's Occurrences its rate levers claim. Both
    correction levers contribute the low opportunity attributed to them.
    """
    from ...guidance import _source_candidates as guidance_candidates

    roster = []
    candidate_rows = guidance_candidates(analysis, exposures, scenarios)
    for key, title, habit_levers, rate_levers, setting, family in _ROSTER:
        members = _habit_members(scenarios, habit_levers,
                                 exposures=exposures if scoped_population else None,
                                 family=family) + _setting_member(
            analysis, candidate_rows, setting,
        )
        k = len(credited_claims(exposures, family, rate_levers))
        n = ((exposures.get("exposures") or {}).get(family) or {}).get("n", 0)
        count_status = (None if k <= n else {
            "status": "inconsistent_counts", "k": k, "n": n,
        })
        bounds = wilson(k, n) if n and k <= n else None
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
            "rate": round(k / n, 4) if n and k <= n else None,
            "wilson": ({"lo": round(bounds[1], 4), "hi": round(bounds[2], 4)} if bounds else None),
            "wide": _uncertain(bounds, chosen),
            **({"count_status": count_status} if count_status else {}),
            "rate_producer": "exposures", "readiness": {
                field: value for field, value in opportunity_readiness(key, analysis, exposures).items()
                if field in ("count", "gate", "verdict")
            },
            "settled_price": chosen["price"] if chosen else 0,
            "admission_route": ("setting_staging" if chosen and chosen["kind"] == "setting" else "habit_threshold" if chosen else "none"),
            "collapse": collapse, "action": chosen["action"] if chosen else None,
            "seriousness": chosen["seriousness"] if chosen else None,
            "member_set_fingerprint": fingerprint,
        })
    return roster


def pattern_in_window(pattern: dict, query) -> bool:
    """Whether a scoped Pattern's outcomes land in the window (ADR 467).

    A Pattern's scoped ``n`` is already its outcome-anchored count in the window,
    so a count above zero is membership, admitted or not.
    """
    return (pattern.get("n") or 0) > 0


def outcome_window_population(analysis: dict, exposures: dict, scenarios: dict, query):
    """Return the one outcome-window evidence population and its Pattern roster.

    A scoped roster carries only the Patterns :func:`pattern_in_window` admits, so
    the rows a window serves and the roster published beside them agree.
    """
    from ...window_membership import outcome_window_exposures

    population = outcome_window_exposures(exposures, query)
    roster = build_outcome_patterns(analysis, population, scenarios,
                                    scoped_population=query.scoped)
    if query.scoped:
        roster = [pattern for pattern in roster if pattern_in_window(pattern, query)]
    return population, roster
