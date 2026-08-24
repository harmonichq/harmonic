"""Synthetic admission bar for I:C estimators."""

from __future__ import annotations

from typing import List, Protocol, Tuple

from .analyzers.ic import IcConfig
from .result import IcBlock


class IcBlockEstimator(Protocol):
    """The production I:C block-estimator interface."""

    def __call__(
        self, bolus_events, ic_segments, *, config=IcConfig(), cgm_readings=None,
        isf_effective=None, carb_entries=None, basal_events=None, harm_config=None,
        harm_lows=None, analysis_start=None, prior_action_observed_from=None,
        observed_days=None, snapshots=None, analysis_end=None, history_catalog=None,
        history_harm_lows=None,
    ) -> Tuple[List[IcBlock], int]: ...


def call_ic_block_estimator(
    estimator: IcBlockEstimator, bolus_events, ic_segments, **kwargs,
) -> Tuple[List[IcBlock], int]:
    """Call an estimator while enforcing the production output contract."""
    history_catalog = kwargs.get("history_catalog")
    if history_catalog is None:
        raise ValueError("estimator requires a caller-owned history_catalog")
    history_count_before = len(history_catalog)
    blocks, run_count = estimator(bolus_events, ic_segments, **kwargs)
    if len(history_catalog) == history_count_before:
        raise ValueError("estimator did not populate history_catalog in place")
    if (isinstance(run_count, bool) or not isinstance(run_count, int)
            or run_count < 0 or run_count > len(bolus_events)
            or (blocks and run_count == 0)):
        raise ValueError("estimator returned an invalid whole-day run count")
    return blocks, run_count


def _blocks(estimator: IcBlockEstimator, truth_set: dict) -> Tuple[List[IcBlock], int]:
    return call_ic_block_estimator(
        estimator, truth_set["events"], truth_set["segments"], config=IcConfig(),
        cgm_readings=truth_set["cgm_readings"],
        isf_effective=truth_set["isf_effective"], carb_entries=[], basal_events=[],
        harm_config=None, harm_lows=None,
        analysis_start=truth_set["analysis_start"],
        prior_action_observed_from=truth_set["prior_action_observed_from"],
        observed_days=truth_set["observed_days"], snapshots=truth_set["snapshots"],
        analysis_end=truth_set["analysis_end"], history_catalog=[],
        history_harm_lows=None,
    )


def recovers_target(block: IcBlock, target: float | None) -> bool:
    """Whether an estimate's interval and point value recover ``target``."""
    estimate = block.estimate
    return bool(
        target is not None and estimate.value is not None and estimate.lo is not None
        and estimate.hi is not None and estimate.lo <= target <= estimate.hi
        and abs(estimate.value - target) <= 0.1
    )


def _engine_evidence(block: IcBlock) -> dict:
    eligibility = (block.evidence or {}).get("eligibility") or {}
    return {
        "state": block.state,
        "asserts_move": block.asserts_move,
        "runs_floor_met": bool(eligibility.get("runs_floor_met")),
        "band_excludes_programmed": bool(eligibility.get("band_excludes_programmed")),
    }


def _known_verdict(truth_set: dict, blocks: List[IcBlock], run_count: int) -> dict:
    rows = []
    recovered = bool(blocks)
    for block in blocks:
        truth = truth_set["true_ratio_by_block"].get(block.block_id)
        evidence = _engine_evidence(block)
        one_recovered = recovers_target(block, truth)
        recovered = recovered and one_recovered
        rows.append({"block_id": block.block_id, "true_ratio": truth,
                     "recovered": one_recovered, "evidence": evidence})
    return {"name": truth_set["name"], "kind": "known", "gated": truth_set["gated"],
            "run_count": run_count, "block_count": len(blocks),
            "verdict": "recovered" if recovered else "not-recovered", "blocks": rows}


def _placebo_verdict(truth_set: dict, blocks: List[IcBlock], run_count: int) -> dict:
    rows = []
    vacuous = not blocks
    finding_seen = False
    for block in blocks:
        evidence = _engine_evidence(block)
        numeric_supported = block.state == "numeric" and evidence["runs_floor_met"]
        finding = evidence["band_excludes_programmed"] or block.asserts_move
        vacuous = vacuous or not numeric_supported
        finding_seen = finding_seen or finding
        rows.append({"block_id": block.block_id, "verdict": "finding" if finding else
                     ("vacuous" if not numeric_supported else "clean"),
                     "evidence": evidence})
    verdict = "finding" if finding_seen else ("vacuous" if vacuous else "clean")
    return {"name": truth_set["name"], "kind": "placebo", "gated": True,
            "run_count": run_count, "block_count": len(blocks),
            "verdict": verdict, "blocks": rows}


def run_synthetic_bar(
    estimator: IcBlockEstimator, *, known_sets: List[dict], placebo_sets: List[dict],
) -> dict:
    """Run the recovery and non-vacuous placebo contracts against ``estimator``."""
    known = []
    for truth_set in known_sets:
        blocks, run_count = _blocks(estimator, truth_set)
        known.append(_known_verdict(truth_set, blocks, run_count))
    placebo = []
    for truth_set in placebo_sets:
        blocks, run_count = _blocks(estimator, truth_set)
        placebo.append(_placebo_verdict(truth_set, blocks, run_count))
    gated_known = [row for row in known if row["gated"]]
    return {
        "known": known,
        "placebo": placebo,
        "recovery_passed": bool(gated_known) and all(
            row["verdict"] == "recovered" for row in gated_known),
        "placebo_passed": bool(placebo) and all(
            row["verdict"] == "clean" for row in placebo),
        "counts": {"known": len(known), "gated_known": len(gated_known),
                   "placebo": len(placebo)},
    }
