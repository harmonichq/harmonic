"""Evidence-only event-aligned comparisons for Diagnose.

The module projects current classifier verdicts and observed timeline rows into
the ADR 675/676/679/681 comparison contract. It has no control-plane effect.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta
import math

from .analyzers.classifiers import (
    classify_carb_undercount,
    classify_correction_on_iob,
    classify_correction_stacking,
    classify_late_bolus,
)
from .analyzers.scenario.engine import _effective_isf
from .analyzers.scenario.attribute import over_treated_rebound_judgment
from .analyzers.scenario.meal_suspend import (
    MealSuspendOwnership,
    classify_meal_owned_suspend,
)
from .analyzers.scenario_config import ScenarioConfig
from .insulin import ACCOUNTING_DIA_MIN
from .window_membership import WindowQuery, outcome_minute

FMT = "%Y-%m-%d %H:%M:%S"
CONFIG = ScenarioConfig()
# The 300-minute maximum preserves accounting-IOB tails, attribution/engine
# context, the low trace, and suspend grouping while retaining every named
# component's contract.
EVENT_COMPARISON_CATALOG_LEAD_IN_MIN = max(
    CONFIG.gate_lookback_min,
    ACCOUNTING_DIA_MIN,
    CONFIG.attribute_split_context_pad_min,
    CONFIG.engine_context_pad_min,
    CONFIG.meal_suspend_ownership_min,
    CONFIG.gate_suspend_group_gap_min,
)
VIEW_CONFIG = {
    "meals": {
        "anchor": "completed carb-bolus",
        "anchor_kind": "completed_carb_bolus",
        "anchor_label": "Completed carb bolus",
        "window": [-60, 300],
        "factors": ["carb_undercount", "late_bolus", "meal_over_delivery"],
        "default_factor": "carb_undercount",
    },
    "lows": {
        "anchor": "excursion nadir",
        "anchor_kind": "excursion_nadir",
        "anchor_label": "Low excursion",
        "window": [-300, 120],
        "factors": ["over_treated_low", "correction_on_iob", "correction_stacking"],
        "default_factor": "over_treated_low",
    },
}

# Queue discovery reads the same canonical factor membership as the comparison
# projection. This derived index is exported for projection and fixture producers;
# no consumer maintains another factor allowlist.
EVENT_CHARTS = {
    factor: {"view": view, "factor": factor}
    for view, config in VIEW_CONFIG.items()
    for factor in config["factors"]
}

FACTOR_LABELS = {
    "carb_undercount": "Carb undercount",
    "late_bolus": "Late bolus",
    "meal_over_delivery": "Meal over-delivery",
    "over_treated_low": "Over-treated low",
    "correction_on_iob": "Correction on active insulin",
    "correction_stacking": "Correction stacking",
}
COHORTS = {"fired", "another_factor", "near_rule", "neutral", "excluded"}
COHORT_ORDER = ("fired", "near_rule", "neutral")
COHORT_EPISODES_FIELD = "episodes"
_BOUNDARY_FACTS = {
    "implied_carbs_g": ("Implied carbs", "g"),
    "logged_carbs_g": ("Logged carbs", "g"),
    "ratio": ("Carb ratio", "×"),
    "gap_g": ("Carb gap", "g"),
    "pre_bolus_slope_mgdl_min": ("Pre-bolus slope", "mg/dL/min"),
    "suspend_duration_min": ("Suspend duration", "min"),
    "gate_window_nadir_mgdl": ("Gate-window nadir", "mg/dL"),
    "nadir_mgdl": ("Nadir", "mg/dL"),
    "guarded_rebound_peak_mgdl": ("Guarded rebound peak", "mg/dL"),
    "live_bar_mgdl": ("Live bar", "mg/dL"),
    "observed_nadir_mgdl": ("Observed nadir", "mg/dL"),
    "downstream_nadir_mgdl": ("Downstream nadir", "mg/dL"),
    "iob_at_correction_u": ("IOB at correction", "U"),
    "stack_gap_min": ("Stack gap", "min"),
    "iob_at_stack_u": ("IOB at stack", "U"),
}


def _dt(value: str) -> datetime:
    return datetime.strptime(value, FMT)


def _verdicts(occurrence: dict) -> dict[str, dict]:
    return {item["classifier"]: item for item in occurrence.get("verdicts", [])}


def _reason(verdict) -> str | None:
    value = getattr(verdict, "silence_reason", None)
    return getattr(value, "value", value)


def _carb_near(verdict) -> dict | None:
    if verdict is None or _reason(verdict) != "under_threshold":
        return None
    implied = verdict.implied_carbs
    logged = verdict.logged_carbs
    if implied is None or logged is None:
        return None
    ratio = implied / logged if logged else 0.0
    gap = implied - logged
    if ratio < 1.25 and gap < 20:
        return None
    return {
        "boundary": {
            "implied_carbs_g": implied,
            "logged_carbs_g": logged,
            "ratio": round(ratio, 2),
            "gap_g": round(gap, 1),
        },
        "provenance": "ADR 676 under-threshold projection",
    }


def _late_near(verdict) -> dict | None:
    if verdict is None or _reason(verdict) != "no_trigger":
        return None
    slope = verdict.pre_bolus_slope
    if slope is None:
        return None
    if not 0.75 < slope <= 1.0:
        return None
    return {
        "boundary": {"pre_bolus_slope_mgdl_min": slope},
        "provenance": "ADR 676 slope projection after current exclusions",
    }


def _completed_meal_at(bolus, anchor: datetime, ordinal: int = 0):
    """The ADR 679 comparison identity at one timestamp and stable ordinal."""
    candidates = [
        item
        for item in bolus
        if item.t == anchor
        and item.completion == "Completed"
        and item.insulin is not None
        and item.insulin > 0
        and item.carbs is not None
        and item.carbs >= CONFIG.anchor_meal_min_carbs
    ]
    candidates.sort(key=lambda item: item.seq_num)
    return candidates[ordinal] if ordinal < len(candidates) else None


def completed_carb_boluses(bolus):
    """Return the ADR 679 completed carb-bolus population in stable order."""
    meals = []
    for anchor in sorted({item.t for item in bolus}):
        ordinal = 0
        while (meal := _completed_meal_at(bolus, anchor, ordinal)) is not None:
            meals.append(meal)
            ordinal += 1
    return tuple(meals)


def _meal_over_delivery_near(meal, bolus, cgm, basal, ownership) -> dict | None:
    verdict = classify_meal_owned_suspend(
        meal, bolus, cgm, basal, scenario_config=CONFIG, ownership=ownership,
    )
    if verdict.matched or verdict.suspend_start is None or verdict.suspend_end is None:
        return None
    duration = verdict.suspend_duration_min
    if duration is None or duration <= CONFIG.suspend_min_duration_min:
        return None
    gate_end = verdict.suspend_end + timedelta(minutes=CONFIG.suspend_post_window_min)
    readings = [
        row.bg
        for row in cgm
        if row.bg is not None and verdict.suspend_start <= row.t <= gate_end
    ]
    if not readings:
        return None
    nadir = min(readings)
    if not 75 < nadir <= 85:
        return None
    return {
        "boundary": {
            "suspend_duration_min": round(duration, 1),
            "gate_window_nadir_mgdl": nadir,
        },
        "provenance": "ADR 676 near-low projection on ADR 681-owned suspend",
    }


def _over_treated_low_route(anchor, nadir, cgm, bolus) -> tuple[dict | None, bool]:
    """Project the shared rebound judgment into this view's near/neutral routing.

    Event comparison retains its own cohort precedence, but it never re-decides
    whether a rebound fired, was near, calm, or unjudgeable.
    """
    judgment = over_treated_rebound_judgment(
        cgm, anchor, nadir, bolus, scenario_config=CONFIG,
    )
    reason = _reason(judgment.verdict)
    if reason == "under_threshold":
        return {
            "boundary": {
                "nadir_mgdl": nadir,
                "guarded_rebound_peak_mgdl": judgment.rebound.peak,
                "live_bar_mgdl": judgment.rebound_bar,
            },
            "provenance": "shared guarded-rebound judgment",
        }, False
    return None, reason == "no_trigger"


def _correction_on_iob_near(anchor, nadir, cgm, bolus, basal) -> dict | None:
    if nadir is None or not 70 < nadir <= 75:
        return None
    # The production classifier gates on the supplied nadir before evaluating
    # every other condition. Supplying its unchanged live edge (70) proves all
    # remaining current gates while retaining the observed 71–75 value below.
    verdict = classify_correction_on_iob(
        anchor, 70, cgm, bolus, basal, scenario_config=CONFIG
    )
    if not verdict.matched:
        return None
    return {
        "boundary": {
            "observed_nadir_mgdl": nadir,
            "live_low_line_mgdl": 70,
            "iob_at_correction_u": round(verdict.iob_at_correction, 2),
        },
        "provenance": "ADR 676 near-low projection after all remaining current gates",
    }


def _correction_stacking_read(
    episode_sources: list[dict], bolus, cgm, basal
) -> tuple[dict | None, object | None]:
    if len(episode_sources) < 2:
        return None, None
    times = {_dt(item["t"]) for item in episode_sources}
    corrections = [item for item in bolus if item.t in times]
    if len(corrections) < 2:
        return None, None
    lo = min(times) - timedelta(minutes=CONFIG.engine_context_pad_min)
    hi = max(times) + timedelta(minutes=CONFIG.engine_context_pad_min)
    verdict = classify_correction_stacking(
        corrections,
        [row for row in cgm if lo <= row.t <= hi],
        [row for row in basal if lo <= row.t <= hi],
        scenario_config=CONFIG,
    )
    if (
        verdict.matched
        or verdict.stack_t is None
        or str(getattr(verdict.silence_reason, "value", verdict.silence_reason))
        != "horizon_expired"
    ):
        return None, verdict
    horizon = verdict.stack_t + timedelta(minutes=CONFIG.stacking_low_lookahead_min)
    readings = [
        row.bg
        for row in cgm
        if row.bg is not None and verdict.stack_t < row.t <= horizon
    ]
    nadir = min(readings) if readings else None
    if nadir is None or not 70 < nadir <= 75:
        return None, verdict
    return {
        "boundary": {
            "downstream_nadir_mgdl": nadir,
            "live_low_line_mgdl": 70,
            "stack_gap_min": round(verdict.gap_min, 1),
            "iob_at_stack_u": round(verdict.iob_at_stack, 2),
        },
        "provenance": "ADR 676 near-low projection after all remaining current gates",
    }, verdict


def _trace_slice(rows, times, start: datetime, end: datetime, mapper):
    lo, hi = bisect_left(times, start), bisect_right(times, end)
    return [mapper(item) for item in rows[lo:hi]]


def _suspend_runs(basal, start: datetime, end: datetime, anchor: datetime) -> list[dict]:
    rows = [row for row in basal if start <= row.t <= end and row.basal_rate == 0]
    runs: list[list] = []
    for row in rows:
        if not runs or (row.t - runs[-1][-1].t) > timedelta(minutes=15):
            runs.append([row])
        else:
            runs[-1].append(row)
    return [
        {
            "start_min": round((run[0].t - anchor).total_seconds() / 60, 1),
            "end_min": round((run[-1].t - anchor).total_seconds() / 60, 1),
        }
        for run in runs
    ]


def _route(
    factor: str,
    matches: set[str],
    near: dict[str, dict],
    *,
    neutral: bool,
) -> dict:
    """ADR 676's one ordered routing function for both comparison views."""
    if factor in matches:
        return {"cohort": "fired", "provenance": "current classifier matched"}
    other = sorted(item for item in matches if item != factor)
    if other:
        return {
            "cohort": "another_factor",
            "provenance": "another current classifier matched",
            "other_factors": other,
        }
    if factor in near:
        return {"cohort": "near_rule", **near[factor]}
    # Another factor's near-rule event is not neutral for the selected factor.
    if near:
        return {
            "cohort": "excluded",
            "provenance": "another factor is near-rule",
        }
    if neutral:
        return {"cohort": "neutral", "provenance": "fully judged; no factor matched"}
    return {"cohort": "excluded", "provenance": "not safely comparable"}


def _route_meal(
    occurrence: dict,
    factor: str,
    meal,
    bolus,
    cgm,
    basal,
    isf,
    ownership,
) -> dict:
    verdicts = _verdicts(occurrence)
    matches = {name for name, verdict in verdicts.items() if verdict.get("matched")}
    near = {}
    carb_near = _carb_near(classify_carb_undercount(
        meal, cgm, basal, bolus, isf=isf, scenario_config=CONFIG,
    ))
    late_near = _late_near(classify_late_bolus(
        meal, cgm, basal, bolus, scenario_config=CONFIG,
    ))
    delivery_near = _meal_over_delivery_near(meal, bolus, cgm, basal, ownership)
    if carb_near:
        near["carb_undercount"] = carb_near
    if late_near:
        near["late_bolus"] = late_near
    if delivery_near:
        near["meal_over_delivery"] = delivery_near
    neutral = bool(verdicts) and all(
        verdict.get("silence_reason") == "no_trigger" for verdict in verdicts.values()
    )
    return _route(factor, matches, near, neutral=neutral)


def _route_low(
    occurrence: dict,
    factor: str,
    episode_matches: set[str],
    episode_corrections: list[dict],
    cgm,
    bolus,
    basal,
) -> dict:
    verdicts = _verdicts(occurrence)
    matches = set(episode_matches)
    anchor = _dt(occurrence["t"])
    nadir = occurrence.get("bg")
    near = {}
    rebound_near, rebound_neutral = _over_treated_low_route(
        anchor, nadir, cgm, bolus
    )
    coi_near = _correction_on_iob_near(anchor, nadir, cgm, bolus, basal)
    stacking_near, stacking_verdict = _correction_stacking_read(
        episode_corrections, bolus, cgm, basal
    )
    if rebound_near:
        near["over_treated_low"] = rebound_near
    if coi_near:
        near["correction_on_iob"] = coi_near
    if stacking_near:
        near["correction_stacking"] = stacking_near

    correction = verdicts.get("correction_on_iob")
    correction_judged = (
        correction is not None
        and correction.get("silence_reason") == "no_trigger"
    )
    stack_reason = str(
        getattr(
            getattr(stacking_verdict, "silence_reason", None),
            "value",
            getattr(stacking_verdict, "silence_reason", "no_trigger"),
        )
    )
    stacking_judged = stacking_verdict is None or stack_reason == "no_trigger"
    neutral = correction_judged and stacking_judged and rebound_neutral
    return _route(factor, matches, near, neutral=neutral)


def _validate_capture(capture: dict) -> None:
    """Fail closed if the mock capture stops satisfying its locked identity."""
    if capture.get("schema") != "issue-677-event-comparison-capture-v2":
        raise AssertionError("event comparison capture schema is stale")
    meals = capture["views"]["meals"]
    for occurrence in meals["occurrences"]:
        anchor_rows = [
            item
            for item in occurrence["trace"]["boluses"]
            if item["minute"] == 0
            and item["completion"] == "Completed"
            and item["insulin"] is not None
            and item["insulin"] > 0
            and item["carbs"] is not None
            and item["carbs"] >= CONFIG.anchor_meal_min_carbs
        ]
        anchor = occurrence["anchor_bolus"]
        selected_rows = [
            item for item in anchor_rows if item["seq_num"] == anchor["seq_num"]
        ]
        if len(selected_rows) != 1:
            raise AssertionError(
                f"ADR 679 meal identity failed for {occurrence['id']}: "
                f"{len(selected_rows)} selected anchor rows"
            )
    for view_name, view in capture["views"].items():
        if set(view["factor_labels"]) != set(view["factors"]):
            raise AssertionError(f"{view_name}: factor roster/labels diverged")
        for occurrence in view["occurrences"]:
            outcome_min = occurrence.get("outcome_min")
            if (not isinstance(outcome_min, int) or isinstance(outcome_min, bool)
                    or not 0 <= outcome_min < 1440):
                raise AssertionError(f"{occurrence['id']}: missing outcome minute")
            if set(occurrence["routes"]) != set(view["factors"]):
                raise AssertionError(f"{occurrence['id']}: incomplete factor routing")
            for factor, route in occurrence["routes"].items():
                if route.get("cohort") not in COHORTS:
                    raise AssertionError(
                        f"{occurrence['id']} {factor}: unknown cohort {route.get('cohort')}"
                    )



def _build_catalog_capture(
    store, *, window_days: int, exposures_payload: dict,
) -> dict:
    """Build the evidence-only Meals and Lows comparison contract."""
    families = exposures_payload["exposures"]

    episode_matches: dict[str, set[str]] = {}
    episode_corrections: dict[str, list[dict]] = {}
    for family in families.values():
        for occurrence in family["occurrences"]:
            matches = episode_matches.setdefault(occurrence["ep_id"], set())
            matches.update(
                verdict["classifier"]
                for verdict in occurrence.get("verdicts", [])
                if verdict.get("matched")
            )
            if occurrence.get("cause_lever"):
                matches.add(occurrence["cause_lever"])
    for occurrence in families["correction_clusters"]["occurrences"]:
        episode_corrections.setdefault(occurrence["ep_id"], []).append(occurrence)

    now = store.latest_cgm_or_basal_timestamp() or datetime.now()
    source_start = now - timedelta(days=window_days)
    catalog_start = source_start - timedelta(
        minutes=EVENT_COMPARISON_CATALOG_LEAD_IN_MIN
    )
    cgm = sorted(
        store.cgm_readings(start=catalog_start, end=None), key=lambda item: item.t
    )
    bolus = sorted(
        store.bolus_events(start=catalog_start, end=None), key=lambda item: item.t
    )
    basal = sorted(
        store.basal_events(start=catalog_start, end=None), key=lambda item: item.t
    )
    rescue = sorted(
        store.carb_entries(start=catalog_start, end=None), key=lambda item: item.t
    )
    ownership = MealSuspendOwnership(bolus, basal, scenario_config=CONFIG)
    isf = _effective_isf(
        bolus,
        basal,
        cgm,
        # Settings are not a source-window event stream: the latest active
        # programmed schedule remains the effective-ISF fallback.
        store.settings_snapshots(),
        source_start,
        now,
    )

    cgm_times = [item.t for item in cgm]
    bolus_times = [item.t for item in bolus]
    rescue_times = [item.t for item in rescue]

    views: dict[str, dict] = {}
    for view_name, config in VIEW_CONFIG.items():
        source_family = families[view_name]
        occurrences = []
        meal_ordinals: dict[datetime, int] = {}
        before, after = config["window"]
        for index, source in enumerate(source_family["occurrences"]):
            anchor = _dt(source["t"])
            meal = None
            if view_name == "meals":
                ordinal = meal_ordinals.get(anchor, 0)
                meal_ordinals[anchor] = ordinal + 1
                meal = _completed_meal_at(bolus, anchor, ordinal)
                if meal is None:
                    continue
            start = anchor + timedelta(minutes=before)
            end = anchor + timedelta(minutes=after)
            trace = {
                "cgm": _trace_slice(
                    cgm,
                    cgm_times,
                    start,
                    end,
                    lambda item: {
                        "t": item.t.strftime(FMT),
                        "minute": round((item.t - anchor).total_seconds() / 60, 1),
                        "bg": item.bg,
                    },
                ),
                "boluses": _trace_slice(
                    bolus,
                    bolus_times,
                    start,
                    end,
                    lambda item: {
                        "t": item.t.strftime(FMT),
                        "minute": round((item.t - anchor).total_seconds() / 60, 1),
                        "insulin": item.insulin,
                        "carbs": item.carbs,
                        "completion": item.completion,
                        "seq_num": item.seq_num,
                    },
                ),
                "suspends": _suspend_runs(basal, start, end, anchor),
            }
            if view_name == "lows":
                trace["rescue_carbs"] = _trace_slice(
                    rescue,
                    rescue_times,
                    start,
                    end,
                    lambda item: {
                        "t": item.t.strftime(FMT),
                        "minute": round((item.t - anchor).total_seconds() / 60, 1),
                        "grams": item.grams,
                        "certainty": item.certainty,
                    },
                )

            routes = {}
            for factor in config["factors"]:
                if view_name == "meals":
                    routes[factor] = _route_meal(
                        source, factor, meal, bolus, cgm, basal, isf, ownership
                    )
                else:
                    routes[factor] = _route_low(
                        source,
                        factor,
                        episode_matches.get(source["ep_id"], set()).intersection(
                            VIEW_CONFIG["lows"]["factors"]
                        ),
                        episode_corrections.get(source["ep_id"], []),
                        cgm,
                        bolus,
                        basal,
                    )
            occurrences.append(
                {
                    # Chosen by view: bolus_events.seq_num is a NOT NULL primary key and
                    # the store's insert raises on a missing one (#194/#198), so a stored
                    # bolus without a seq_num is unrepresentable — no positional fallback
                    # for meals.
                    "id": (
                        f"meals-{meal.seq_num}"
                        if view_name == "meals"
                        else f"{view_name}-{index + 1}"
                    ),
                    "ep_id": source["ep_id"],
                    "date": source["date"],
                    "anchor_t": source["t"],
                    "outcome_min": outcome_minute(source, exposures_payload),
                    "anchor_bg": source.get("bg"),
                    "worst_bg": source.get("worst_bg"),
                    "label": source.get("label"),
                    "verdicts": source.get("verdicts", []),
                    "routes": routes,
                    "trace": trace,
                    **({
                        "anchor_bolus": {
                            "seq_num": meal.seq_num,
                            "carbs": meal.carbs,
                            "insulin": meal.insulin,
                        },
                    } if meal is not None else {}),
                }
            )
        views[view_name] = {
            **config,
            "factor_labels": {
                name: FACTOR_LABELS[name] for name in config["factors"]
            },
            "occurrences": occurrences,
        }

    capture = {
        "schema": "issue-677-event-comparison-capture-v2",
        "source_window": exposures_payload["window"],
        "views": views,
    }
    _validate_capture(capture)
    return capture


def _finite(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _five_minute_bin(minute: float) -> int:
    """Round half-way observations toward the later aligned five-minute point."""
    return int(math.floor(minute / 5 + 0.5) * 5)


def _support(count: int, usable_count: int) -> str:
    if count <= 1:
        return "withheld"
    if count < 5:
        return "limited"
    return "supported" if count * 2 >= usable_count else "limited"


def _quantile(values: list[float], q: float) -> float:
    values = sorted(values)
    rank = (len(values) - 1) * q
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return values[lower]
    return values[lower] + (values[upper] - values[lower]) * (rank - lower)


def _usable(occurrence: dict) -> bool:
    return any(_finite(point.get("bg")) for point in occurrence["trace"]["cgm"])


def project_cohort(
    cohort: str,
    occurrences: list[dict],
    window: tuple[int, int] | list[int],
    *,
    include_withheld_episodes: bool = False,
) -> dict:
    """Aggregate event-relative CGM with the settled finite-sample discipline.

    Occurrences need only ``id`` and ``trace.cgm``. The legacy comparison opts in
    to its thin-cohort episode fallback; Finding case files reuse the same support,
    binning, and quantiles without importing that route's cohort taxonomy.
    """
    usable = [occurrence for occurrence in occurrences if _usable(occurrence)]
    usable_count = len(usable)
    samples: dict[int, list[float]] = {}
    for occurrence in usable:
        chosen: dict[int, tuple[float, float]] = {}
        for point in occurrence["trace"]["cgm"]:
            if not _finite(point.get("bg")) or not _finite(point.get("minute")):
                continue
            minute = float(point["minute"])
            bin_minute = _five_minute_bin(minute)
            candidate = (abs(minute - bin_minute), minute, float(point["bg"]))
            existing = chosen.get(bin_minute)
            if existing is None or candidate[:2] < existing[:2]:
                chosen[bin_minute] = candidate
        for minute, (_, _, bg) in chosen.items():
            samples.setdefault(minute, []).append(bg)

    start, end = window
    points = []
    for minute in range(start, end + 1, 5):
        values = samples.get(minute, [])
        point_support = _support(len(values), usable_count)
        values_or_none = values if point_support != "withheld" else []
        points.append({
            "minute": minute,
            "n": len(values),
            "support": point_support,
            "median": _quantile(values_or_none, 0.5) if values_or_none else None,
            "p25": _quantile(values_or_none, 0.25) if values_or_none else None,
            "p75": _quantile(values_or_none, 0.75) if values_or_none else None,
        })
    projection = {
        "key": cohort,
        "routed_count": len(occurrences),
        "usable_count": usable_count,
        "support": _support(usable_count, usable_count),
        "occurrence_ids": [occurrence["id"] for occurrence in occurrences],
        "points": points,
    }
    if include_withheld_episodes and projection["support"] == "withheld":
        projection[COHORT_EPISODES_FIELD] = [
            {
                "identity": occurrence.get("identity", {"id": occurrence["id"]}),
                "glucose": [
                    {"minute": _five_minute_bin(point["minute"]), "bg": point["bg"]}
                    for point in occurrence["trace"]["cgm"]
                    if _finite(point.get("bg")) and _finite(point.get("minute"))
                ],
            }
            for occurrence in usable
        ]
    return projection
