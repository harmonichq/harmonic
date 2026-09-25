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
    "outcome",
})
_COUNT_FACTS = frozenset({"above_high", "below_low", "both", "in_range", "unread", "n"})
# The per-run facts #464 added; a roster row without them is a hole, not a row.
_RUN_FACTS = frozenset({
    "pool_reason", "side", "meal_carbs", "meal_dose", "post_correction_user",
    "post_correction_ciq", "post_correction_unknown", "ciq_basal_delta_acted_u",
    "rescue_carbs", "member_in_block",
})
# The pooled balance sheet's terms and the quotient they make.
_LEDGER_FACTS = frozenset({
    "carbs_covered", "meal_dose", "post_correction_user", "post_correction_ciq",
    "post_correction_unknown", "ciq_basal_delta_acted_u", "bg_outcome_u",
    "rescue_carbs", "effective_insulin", "pooled_ratio",
})
# The harm row the analyzer publishes on every block, in its one closed shape.
_HARM_FACTS = frozenset({
    "arm", "gated", "nudged", "arm_days", "row_days", "lows", "evaluated",
    "seriousness", "minutes_after_bolus_median",
})

# One reconciling sentence per served key, chosen on the server and printed verbatim
# (ADR 464 — sentence).  The key is the block's asserted direction and whether more
# of its meals went above the band than below it; every sentence names the chain-end
# read, because a reader who sees over-coverage beside a chart of high meals is owed
# exactly that reconciliation.  The band edges are filled from `_BAND`, and nothing
# on the client composes a second sentence.
_SENTENCES = {
    ("raise", True): (
        "These meals more often went above {high:g} than below {low:g}, and the "
        "ledger still reads over-coverage: it closes at the end of each meal chain, "
        "when the insulin is spent, not at the peak in between."
    ),
    ("raise", False): (
        "These meals did not go above {high:g} more often than below {low:g}, and "
        "the ledger reads over-coverage at the end of each meal chain, when the "
        "insulin is spent."
    ),
    ("lower", True): (
        "These meals more often went above {high:g} than below {low:g}, and the "
        "ledger reads under-coverage at the end of each meal chain, when the insulin "
        "is spent."
    ),
    ("lower", False): (
        "These meals did not go above {high:g} more often than below {low:g}, yet "
        "the ledger reads under-coverage: it closes at the end of each meal chain, "
        "when the insulin is spent, not at the lowest point in between."
    ),
    (None, True): (
        "These meals more often went above {high:g} than below {low:g}, and this "
        "block still asserts no change: the ledger closes at the end of each meal "
        "chain, when the insulin is spent, not at the peak in between."
    ),
    (None, False): (
        "These meals did not go above {high:g} more often than below {low:g}, and "
        "this block asserts no change from what the ledger reads at the end of each "
        "meal chain, when the insulin is spent."
    ),
}


class UnknownIcBlockId(KeyError):
    """The requested current block is absent from the fixed analysis."""


class InconsistentIcBlockEvidence(RuntimeError):
    """The analyzer payload omitted a fact this projection must copy."""


class _CgmWindows:
    """The preparation's single CGM read, sliced by window without re-scanning it."""

    def __init__(self, readings: Sequence):
        self._readings = sorted(readings, key=lambda reading: reading.t)
        self._times = [reading.t for reading in self._readings]

    def between(self, lower: datetime, upper: datetime) -> Sequence:
        start = bisect.bisect_left(self._times, lower)
        return self._readings[start:bisect.bisect_right(self._times, upper)]


def _meal_reading(point: dict, windows: _CgmWindows) -> dict:
    """One block-hours meal's own plain reading over its post-meal window.

    The peak and nadir are the highest and lowest store readings from the bolus to
    the end of the window, and the outcome is where they fall against the band.  A
    meal with no reading in its window is `unread` rather than in range — silence
    is not a reading.
    """
    bolus = datetime.fromisoformat(point["t"])
    before, after = MEAL_WINDOW_MIN
    readings = windows.between(bolus + timedelta(minutes=before),
                               bolus + timedelta(minutes=after))
    row = {
        "t": point["t"], "run_id": point["run_id"],
        "offset_min": (bolus - datetime.fromisoformat(point["run_id"])).total_seconds()
        / 60.0,
        "peak_bg": None, "peak_min": None, "nadir_bg": None, "nadir_min": None,
        "outcome": "unread",
    }
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


def _outcome_tally(block: dict, meals: Sequence[dict]) -> dict:
    tally = Counter(meal["outcome"] for meal in meals)
    counts = {
        "above_high": tally["high"] + tally["high-and-low"],
        "below_low": tally["low"] + tally["high-and-low"],
        "both": tally["high-and-low"],
        "in_range": tally["in-range"],
        "unread": tally["unread"],
        "n": len(meals),
    }
    return {
        "counts": counts,
        "band": dict(_BAND),
        "sentence": _SENTENCES[
            (block["direction"], counts["above_high"] > counts["below_low"])
        ].format(**_BAND),
    }


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
            if not _HARM_FACTS <= harm_evidence.keys():
                raise KeyError("harm evidence is missing a published fact")
            if not _LEDGER_FACTS <= evidence["ledger"].keys():
                raise KeyError("ledger is missing a published term")
            for run in runs:
                if not _RUN_FACTS <= run.keys():
                    raise KeyError("run row is missing a published fact")
            # The preparation's own facts are guarded the same way: a sidecar
            # rebuilt from an older shape is refused, not served with a hole.
            meals = list(evidence["meals"])
            for meal in meals:
                if not _MEAL_FACTS <= meal.keys():
                    raise KeyError("meal row is missing a served fact")
            outcomes = evidence["outcomes"]
            if (not _COUNT_FACTS <= outcomes["counts"].keys()
                    or not {"low", "high"} <= outcomes["band"].keys()
                    or "sentence" not in outcomes):
                raise KeyError("outcome tally is missing a served fact")
            payload = {
                "schema": SCHEMA,
                "analysis_generation": analysis_generation,
                "block": {
                    "block_id": block["block_id"], "start_min": block["start_min"],
                    "end_min": block["end_min"], "label": block["label"],
                    "state": block["state"], "asserts_move": block["asserts_move"],
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
            "outcomes": _outcome_tally(block, meals),
        }})
    return IcBlockEvidenceProjection(tuple(prepared), series)
