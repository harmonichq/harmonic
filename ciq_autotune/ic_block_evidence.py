"""Read-only current I:C-block meal-run evidence.

Preparation receives the active analyzer payload, retains its published run roster,
and reads CGM once — over the analyzer-owned display bounds and over the block-hours
meals' own post-meal windows.  It adds the one fact the block stamper cannot reach,
because it needs the store the stamper never sees: each block-hours meal's own plain
reading — its peak, its nadir, and where they fall against the target band.
Projection copies every fact through; it never forms runs, re-counts support, or
changes a block verdict.
"""
from __future__ import annotations

import bisect
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Sequence, Tuple

from .analyzers.ic import IcConfig
from .analyzers.scenario_config import ScenarioConfig


SCHEMA = "diagnose-carb-ratio-block-evidence-v2"
# A meal is read from its bolus to the end of the analyzer's post-meal window.
MEAL_WINDOW_MIN = (0, IcConfig().post_meal_min)
# The analyzer's own in-range band, served once so no client restates it.
_BAND = {"low": ScenarioConfig().segment_range_low_mgdl,
         "high": ScenarioConfig().segment_range_high_mgdl}
# The per-meal facts the preparation serves; a meal row without them is a hole.
_MEAL_FACTS = frozenset({
    "t", "run_id", "offset_min", "peak_bg", "peak_min", "nadir_bg", "nadir_min",
    "outcome", "next_bolus_min", "peak_before_next_bg", "peak_before_next_min",
    "on_counted_run",
})
_COUNT_FACTS = frozenset({
    "above_high", "below_low", "both", "in_range", "unread", "n",
    "meals_on_counted_runs", "peaked_above_high_before_next",
    "peaked_above_high_in_window",
})
# The per-run facts #464 added; a roster row without them is a hole, not a row.
_RUN_FACTS = frozenset({
    "pool_reason", "side", "meal_carbs", "meal_dose", "post_correction_user",
    "post_correction_ciq", "post_correction_unknown", "ciq_basal_delta_acted_u",
    "post_correction_total", "rescue_carbs", "member_in_block", "end_class",
    "ended_after_later_meal", "fit_weight",
})
_RUN_END_FACTS = frozenset({"lower", "flat", "higher", "unread", "after_later_meal", "n"})
_RECOMMENDATION_FACTS = frozenset({"value", "rule", "sentence"})
# The pooled balance sheet's terms and the quotient they make.
_LEDGER_FACTS = frozenset({
    "carbs_covered", "meal_dose", "post_correction_user", "post_correction_ciq",
    "post_correction_unknown", "ciq_basal_delta_acted_u", "bg_outcome_u",
    "rescue_carbs", "effective_insulin", "pooled_ratio",
})
# The harm row the analyzer publishes on every block, in its one closed shape.
_HARM_FACTS = frozenset({
    "arm", "gated", "nudged", "arm_days", "row_days", "lows", "evaluated",
    "seriousness", "minutes_after_bolus_median", "groups", "minutes_after_bolus_min",
    "minutes_after_bolus_max", "bearing_sentence",
})
_LOW_FACTS = frozenset({"run_id", "group", "minutes_after_bolus", "bolus_carbs"})
_LOW_GROUP_FACTS = frozenset({
    "counted_run", "counted_runs_distinct", "uncounted_run", "not_a_meal_run", "total",
})


class UnknownIcBlockId(KeyError):
    """The requested current block is absent from the fixed analysis."""


class InconsistentIcBlockEvidence(RuntimeError):
    """The analyzer payload omitted a fact this projection must copy."""


class _CgmWindows:
    """The preparation's single CGM read, sliced by window without re-scanning it.

    A store reading with no glucose value (a sensor gap, or a HIGH/LOW the sensor
    could not number) is dropped here, once, so no window a meal or a series is read
    from ever holds one.
    """

    def __init__(self, readings: Sequence):
        self._readings = sorted((reading for reading in readings if reading.bg is not None),
                                key=lambda reading: reading.t)
        self._times = [reading.t for reading in self._readings]

    def between(self, lower: datetime, upper: datetime) -> Sequence:
        start = bisect.bisect_left(self._times, lower)
        return self._readings[start:bisect.bisect_right(self._times, upper)]


def _meal_reading(point: dict, windows: _CgmWindows) -> dict:
    """One block-hours meal's own plain reading over its post-meal window.

    The peak and nadir are the highest and lowest store readings from the bolus to
    the end of the window, and the outcome is where they fall against the band.  A
    meal with no reading in its window, or only a sensor gap, is `unread` rather
    than in range — silence is not a reading.  The peak before next is the highest reading from the bolus
    until the run's next member bolus the analyzer served, or the window's end.
    """
    bolus = datetime.fromisoformat(point["t"])
    before, after = MEAL_WINDOW_MIN
    readings = windows.between(bolus + timedelta(minutes=before),
                               bolus + timedelta(minutes=after))
    next_min = point["next_bolus_min"]
    cut = bolus + timedelta(minutes=after if next_min is None else min(after, next_min))
    before_next = [reading for reading in readings if reading.t <= cut]
    row = {
        "t": point["t"], "run_id": point["run_id"],
        "offset_min": (bolus - datetime.fromisoformat(point["run_id"])).total_seconds()
        / 60.0,
        "peak_bg": None, "peak_min": None, "nadir_bg": None, "nadir_min": None,
        "outcome": "unread", "next_bolus_min": next_min,
        "peak_before_next_bg": None, "peak_before_next_min": None,
        "on_counted_run": point["on_counted_run"],
    }
    if before_next:
        peak_before_next = max(before_next, key=lambda reading: reading.bg)
        row.update({
            "peak_before_next_bg": peak_before_next.bg,
            "peak_before_next_min": (peak_before_next.t - bolus).total_seconds() / 60.0,
        })
    if not readings:
        return row
    peak = max(readings, key=lambda reading: reading.bg)
    nadir = min(readings, key=lambda reading: reading.bg)
    above, below = peak.bg > _BAND["high"], nadir.bg < _BAND["low"]
    return {
        **row,
        "peak_bg": peak.bg, "peak_min": (peak.t - bolus).total_seconds() / 60.0,
        "nadir_bg": nadir.bg, "nadir_min": (nadir.t - bolus).total_seconds() / 60.0,
        "outcome": ("high-and-low" if above and below else "high" if above
                    else "low" if below else "in-range"),
    }


def _outcome_tally(meals: Sequence[dict]) -> dict:
    tally = Counter(meal["outcome"] for meal in meals)
    counted = [meal for meal in meals if meal["on_counted_run"]]
    counts = {
        "above_high": tally["high"] + tally["high-and-low"],
        "below_low": tally["low"] + tally["high-and-low"],
        "both": tally["high-and-low"],
        "in_range": tally["in-range"],
        "unread": tally["unread"],
        "n": len(meals),
        # Over meals on counted runs only: how many went above the band before the
        # run's next bolus, and how many anywhere in their own window.
        "meals_on_counted_runs": len(counted),
        "peaked_above_high_before_next": sum(
            1 for meal in counted
            if meal["peak_before_next_bg"] is not None
            and meal["peak_before_next_bg"] > _BAND["high"]),
        "peaked_above_high_in_window": sum(
            1 for meal in counted if meal["outcome"] in ("high", "high-and-low")),
    }
    # The window every meal was read over, served so no client restates it.
    return {"counts": counts, "band": dict(_BAND), "window_min": MEAL_WINDOW_MIN[1]}


@dataclass(frozen=True)
class IcBlockEvidenceProjection:
    _blocks: Tuple[dict, ...]
    _series: Dict[int, Tuple[dict, ...]]

    def project(self, block_id: int, *, analysis_generation: str = "standalone:0") -> dict:
        block = next((row for row in self._blocks if row.get("block_id") == block_id), None)
        if block is None:
            raise UnknownIcBlockId(block_id)
        # Every fact is read inside the guard: a block missing any one of them is
        # refused as inconsistent rather than served with a hole.
        try:
            evidence = block["evidence"]
            runs = list(evidence["runs"])
            eligibility = evidence["eligibility"]
            channels = evidence["recurrence_channels"]
            estimate = block["estimate"]
            harm_evidence = evidence["harm_evidence"]
            # Every run row carries its own reason, side and ledger terms, and the
            # harm row its whole closed shape, or the payload has a hole in exactly
            # the place the reader looks first.
            if (not _HARM_FACTS <= harm_evidence.keys()
                    or not _LOW_GROUP_FACTS <= harm_evidence["groups"].keys()):
                raise KeyError("harm evidence is missing a published fact")
            for low in harm_evidence["lows"]:
                if not _LOW_FACTS <= low.keys():
                    raise KeyError("low row is missing a published fact")
            if not _LEDGER_FACTS <= evidence["ledger"].keys():
                raise KeyError("ledger is missing a published term")
            for run in runs:
                if not _RUN_FACTS <= run.keys():
                    raise KeyError("run row is missing a published fact")
            run_ends = evidence["run_ends"]
            recommendation = evidence["recommendation"]
            if (not _RUN_END_FACTS <= run_ends.keys()
                    or not _RECOMMENDATION_FACTS <= recommendation.keys()):
                raise KeyError("block is missing a published fact")
            # The preparation's own facts are guarded the same way: a sidecar
            # rebuilt from an older shape is refused, not served with a hole.
            meals = list(evidence["meals"])
            for meal in meals:
                if not _MEAL_FACTS <= meal.keys():
                    raise KeyError("meal row is missing a served fact")
            outcomes = evidence["outcomes"]
            if (not _COUNT_FACTS <= outcomes["counts"].keys()
                    or not {"low", "high"} <= outcomes["band"].keys()
                    or "window_min" not in outcomes):
                raise KeyError("outcome tally is missing a served fact")
            payload = {
                "schema": SCHEMA,
                "analysis_generation": analysis_generation,
                "block": {
                    "block_id": block["block_id"], "start_min": block["start_min"],
                    "end_min": block["end_min"], "label": block["label"],
                    "state": block["state"], "asserts_move": block["asserts_move"],
                    # The analyzer's own direction of the asserted move; null when
                    # the block asserts none.
                    "direction": block["direction"],
                    "current": (block["current_values"] or [None])[0],
                    "estimate": {"value": estimate["value"], "lo": estimate["lo"],
                                 "hi": estimate["hi"], "wide": estimate["wide"]},
                    "side": {"side_k": channels["side_k"],
                             "side_n": channels["side_n"],
                             "direction": channels["side_direction"]},
                    "support_detail": {
                        "whole_runs": eligibility["whole_runs"],
                        "fractional_run_ownership":
                            eligibility["fractional_run_ownership"],
                        "effective_run_count": eligibility["effective_run_count"],
                    },
                    # The analyzer's published support, not a roster-derived count.
                    "support": block["n_runs"],
                    "effective_support": eligibility["effective_run_count"],
                    "examined_runs": evidence["n_runs_touching"],
                    "excluded_runs": evidence["n_runs_excluded"],
                    "end_band_mgdl": evidence["end_band_mgdl"],
                    "run_ends": run_ends,
                    "recommendation": recommendation,
                },
                "ledger": evidence["ledger"],
                "outcomes": outcomes,
                "meals": meals,
                "harm_evidence": harm_evidence,
                "runs": runs,
            }
        except (KeyError, TypeError) as error:
            raise InconsistentIcBlockEvidence("current block evidence is incomplete") from error
        return {**payload, "series": list(self._series.get(block_id, ()))}


def prepare_ic_block_evidence(store, analysis: dict) -> IcBlockEvidenceProjection:
    """Prepare exact current-block CGM series and the block's meal outcomes."""
    try:
        blocks = tuple(analysis["ic_blocks"])
        runs = [run for block in blocks for run in block["evidence"]["runs"]]
        meals = [point for block in blocks for point in block["evidence"]["points"]]
    except (KeyError, TypeError) as error:
        raise InconsistentIcBlockEvidence("current block evidence is incomplete") from error
    before, after = MEAL_WINDOW_MIN
    bounds = [
        (datetime.fromisoformat(run["t"]) + timedelta(minutes=run["cgm_start_min"]),
         datetime.fromisoformat(run["t"]) + timedelta(minutes=run["cgm_end_min"]))
        for run in runs
    ] + [
        (datetime.fromisoformat(point["t"]) + timedelta(minutes=before),
         datetime.fromisoformat(point["t"]) + timedelta(minutes=after))
        for point in meals
    ]
    if bounds:
        readings = store.cgm_readings(
            min(lower for lower, _upper in bounds),
            max(upper for _lower, upper in bounds) + timedelta(microseconds=1),
        )
    else:
        readings = []
    windows = _CgmWindows(readings)

    prepared: List[dict] = []
    series: Dict[int, Tuple[dict, ...]] = {}
    for block in blocks:
        rows = []
        for run in block["evidence"]["runs"]:
            start = datetime.fromisoformat(run["t"])
            rows.append({
                "run_id": run["run_id"],
                "points": [
                    {"minute": (reading.t - start).total_seconds() / 60.0,
                     "bg": reading.bg}
                    for reading in windows.between(
                        start + timedelta(minutes=run["cgm_start_min"]),
                        start + timedelta(minutes=run["cgm_end_min"]))
                ],
            })
        series[block["block_id"]] = tuple(rows)
        # The preparation-owned facts ride beside the analyzer's on a COPY: the
        # analysis payload is shared with every other cached read of this generation.
        meals = [_meal_reading(point, windows) for point in block["evidence"]["points"]]
        prepared.append({**block, "evidence": {
            **block["evidence"],
            "meals": meals,
            "outcomes": _outcome_tally(meals),
        }})
    return IcBlockEvidenceProjection(tuple(prepared), series)
