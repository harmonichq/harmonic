"""Read-only current I:C-block meal-run evidence.

Preparation receives the active analyzer payload, retains its published run roster,
and reads CGM once — over the analyzer-owned display bounds and over the block-hours
meals' own post-meal clocks.  It adds the two facts the block stamper cannot reach,
because both need the store the stamper never sees: each block-hours meal's outcome
as the Pattern roster's own credited claims read it, and the pooled comparison of
those meals.  Projection copies every fact through; it never forms runs, re-counts
support, or changes a block verdict.
"""
from __future__ import annotations

import bisect
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Sequence, Tuple

from .analyzers.ic import BLOCK_WINDOW_DAYS, IcConfig
# `_ROSTER` is the Pattern roster's own lever table and the only place the two
# meal Patterns' rate levers are written down; reading it here is what keeps
# "ran high" one definition in this app (ADR 464 — credited claims).
from .analyzers.scenario.outcome_patterns import _ROSTER, credited_claims
from .event_comparison import project_cohort
from .explore_exposures import build_exposures
# The Finding case file's meals-family trace producer, reused so a meal's clock is
# cut, rounded and filtered exactly as the Pattern comparison chart's is.
from .finding_case_file import _comparison_trace


SCHEMA = "diagnose-carb-ratio-block-evidence-v2"
MEAL_COMPARISON_SCHEMA = "diagnose-carb-ratio-meal-comparison-v1"
# From the run series' own start before the bolus to the end of the post-meal
# window: the meal's own clock, over the span the run ledger closes over.
MEAL_WINDOW_MIN = (-IcConfig().bg0_max_gap_min, IcConfig().post_meal_min)
_MEAL_ANCHOR = {"kind": "completed_carb_bolus", "label": "Completed carb bolus"}
# The outcomes a meal can be traced under.  An `unread` meal is counted in the
# tally and traced nowhere — there is no verdict to pool it with.
_COHORT_NAMES = {"ran-high": "Ran high", "ran-low": "Ran low", "in-range": "In range"}
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
# (ADR 464 — sentence).  The key is the block's asserted direction and whether its
# meals ran high more often than they ran low; every sentence names the chain-end
# read, because a reader who sees over-coverage beside a chart of high meals is owed
# exactly that reconciliation.  Nothing on the client composes a second one.
_SENTENCES = {
    ("raise", True): (
        "These meals more often ran high than low, and the ledger still reads "
        "over-coverage: it closes at the end of each meal chain, when the insulin "
        "is spent, not at the peak in between."
    ),
    ("raise", False): (
        "These meals did not run high more often than they ran low, and the ledger "
        "reads over-coverage at the end of each meal chain, when the insulin is "
        "spent."
    ),
    ("lower", True): (
        "These meals more often ran high than low, and the ledger reads "
        "under-coverage at the end of each meal chain, when the insulin is spent."
    ),
    ("lower", False): (
        "These meals did not run high more often than they ran low, yet the ledger "
        "reads under-coverage: it closes at the end of each meal chain, when the "
        "insulin is spent, not at the lowest point in between."
    ),
    (None, True): (
        "These meals more often ran high than low, and this block still asserts no "
        "change: the ledger closes at the end of each meal chain, when the insulin "
        "is spent, not at the peak in between."
    ),
    (None, False): (
        "These meals did not run high more often than they ran low, and this block "
        "asserts no change from what the ledger reads at the end of each meal "
        "chain, when the insulin is spent."
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


def _rate_levers(pattern: str) -> Tuple[str, ...]:
    return next(rate for key, _title, _habit, rate, *_rest in _ROSTER if key == pattern)


def _meal_outcomes(store, blocks: Sequence[dict]) -> Dict[str, str]:
    """Each block-hours meal's outcome, keyed by the analyzer's own meal instant.

    The verdict is the Pattern roster's, not a second 70/180 read: one store-level
    exposure pass over the block's own span, then the same `credited_claims` map the
    "Highs after meals" and "Lows after meals" counts are formed from (ADR 464 —
    credited claims).  A meal the exposure feed never emitted is `unread` rather
    than in range — silence is not a reading.
    """
    exposures = build_exposures(store, window_days=BLOCK_WINDOW_DAYS)
    high = credited_claims(exposures, "meals", _rate_levers("highs_after_meals"))
    low = credited_claims(exposures, "meals", _rate_levers("lows_after_meals"))
    # The exposure feed prints the engine's "%Y-%m-%d %H:%M:%S"; the analyzer prints
    # `isoformat()`.  Both parse, so the instant is the key and neither spelling is.
    claimed = {
        datetime.fromisoformat(item["t"]): item["t"]
        for item in exposures["exposures"]["meals"]["occurrences"]
    }
    outcomes: Dict[str, str] = {}
    for block in blocks:
        for point in block["evidence"]["points"]:
            identity = claimed.get(datetime.fromisoformat(point["t"]))
            if identity is None:
                outcomes[point["t"]] = "unread"
            elif identity in high:
                outcomes[point["t"]] = "ran-high"
            elif identity in low:
                outcomes[point["t"]] = "ran-low"
            else:
                outcomes[point["t"]] = "in-range"
    return outcomes


def _outcome_tally(block: dict, outcomes: Dict[str, str]) -> dict:
    counts = {"ran_high": 0, "ran_low": 0, "in_range": 0, "unread": 0}
    for point in block["evidence"]["points"]:
        counts[outcomes[point["t"]].replace("-", "_")] += 1
    counts["n"] = sum(counts[key] for key in ("ran_high", "ran_low", "in_range",
                                              "unread"))
    return {
        "counts": counts,
        "sentence": _SENTENCES[
            (block["direction"], counts["ran_high"] > counts["ran_low"])
        ],
    }


def _meal_comparison(block: dict, outcomes: Dict[str, str],
                     windows: _CgmWindows) -> dict:
    """The block-hours meals pooled by outcome, as a Finding case file pools a family.

    One trace per traced meal on its own clock, then one `project_cohort` per served
    outcome: the same producer, the same five-minute binning and the same
    finite-sample support the Pattern comparison chart already draws.
    """
    before, after = MEAL_WINDOW_MIN
    traces: Dict[str, List[dict]] = {key: [] for key in _COHORT_NAMES}
    for point in block["evidence"]["points"]:
        outcome = outcomes[point["t"]]
        if outcome not in traces:
            continue
        anchor = datetime.fromisoformat(point["t"])
        # The slice only spares the producer a scan of the whole read; the
        # producer applies its own window bounds to what it is handed.
        nearby = windows.between(anchor + timedelta(minutes=before),
                                 anchor + timedelta(minutes=after))
        traces[outcome].append(
            _comparison_trace(point["t"], anchor, nearby, MEAL_WINDOW_MIN))
    cohorts = []
    for key, name in _COHORT_NAMES.items():
        cohort = project_cohort(key, traces[key], MEAL_WINDOW_MIN)
        cohort["name"] = name
        cohort["anchor"] = dict(_MEAL_ANCHOR)
        cohorts.append(cohort)
    return {
        "schema": MEAL_COMPARISON_SCHEMA,
        "alignment": "event",
        "anchor": dict(_MEAL_ANCHOR),
        "window_min": list(MEAL_WINDOW_MIN),
        "cohorts": cohorts,
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
                "outcomes": evidence["outcomes"],
                "harm_evidence": harm_evidence,
                "meal_comparison": evidence["meal_comparison"],
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
    outcomes = _meal_outcomes(store, blocks)

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
        # The two preparation-owned facts ride beside the analyzer's on a COPY: the
        # analysis payload is shared with every other cached read of this generation.
        prepared.append({**block, "evidence": {
            **block["evidence"],
            "outcomes": _outcome_tally(block, outcomes),
            "meal_comparison": _meal_comparison(block, outcomes, windows),
        }})
    return IcBlockEvidenceProjection(tuple(prepared), series)
