"""The shipped cross-block I:C estimator: fractional block credit by carb share.

Admitted through the #109 ladder (ADR 117). A meal run whose member meals were
dosed in more than one block is information-free to the whole-run estimator in
`ic.py`; here every run, lone or chained, enters one weighted fit of inverse
ratios on carb share, and each block reads its ratio off the fitted mixture.
`ic.analyze_ic_blocks` remains the ladder's incumbent reference and is what the
admission harnesses replay against; nothing else calls it.
"""

from __future__ import annotations

import math
import random
from dataclasses import replace
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

from ..events import BasalEvent, BolusEvent, CarbEntry, CgmReading
from ..harm import HarmConfig, PrintedLow
from ..ic_history import HistoryIdentity, RunEvidence, RunIdentity, prove_runs
from ..result import IcBlock, IcHistory
from ..settings import Snapshot
from ..uncertainty import DEFAULT_CONFIDENCE, Estimate
from .ic import (
    IcConfig,
    MealRun,
    _IcBlockFit,
    _analyze_ic_blocks_shared,
    _block_of,
    _run_is_numeric_candidate,
    _run_pool,
    _same_ratio,
    _tod,
)

_BOOTSTRAP_ITERS = 1000
_BOOTSTRAP_SEED = 12345


def _solve_coefficients(rows: Sequence[Tuple[float, float, Sequence[float]]]) -> List[float]:
    """Fit weighted inverse ratios with Gaussian elimination."""
    if not rows:
        raise ZeroDivisionError("no fitted runs")
    width = len(rows[0][2])
    if width == 0:
        raise ZeroDivisionError("no fitted blocks")
    matrix = [[0.0] * (width + 1) for _ in range(width)]
    for carbs, inverse_ratio, shares in rows:
        for i, share_i in enumerate(shares):
            matrix[i][width] += carbs * share_i * inverse_ratio
            for j, share_j in enumerate(shares):
                matrix[i][j] += carbs * share_i * share_j

    matrix_scale = max(abs(matrix[i][j]) for i in range(width) for j in range(width))
    pivot_floor = max(1e-12, matrix_scale * 1e-10)
    for column in range(width):
        pivot = max(range(column, width), key=lambda row: abs(matrix[row][column]))
        if abs(matrix[pivot][column]) <= pivot_floor:
            raise ZeroDivisionError("singular cross-block fit")
        matrix[column], matrix[pivot] = matrix[pivot], matrix[column]
        scale = matrix[column][column]
        matrix[column] = [value / scale for value in matrix[column]]
        for row in range(width):
            if row == column:
                continue
            factor = matrix[row][column]
            matrix[row] = [
                value - factor * pivot_value
                for value, pivot_value in zip(matrix[row], matrix[column])
            ]
    coefficients = [matrix[row][width] for row in range(width)]
    if any(not math.isfinite(value) or value <= 0.0 for value in coefficients):
        raise ZeroDivisionError("non-positive fitted inverse ratio")
    return coefficients


def _regression_estimates(
    rows: Sequence[Tuple[float, float, Sequence[float]]],
) -> List[Estimate]:
    """Fit points and 80% run-cluster bootstrap intervals for every block."""
    width = len(rows[0][2]) if rows else 0
    try:
        point = _solve_coefficients(rows)
    except ZeroDivisionError:
        return [Estimate(None, None, None, 0, method="none") for _ in range(width)]

    rng = random.Random(_BOOTSTRAP_SEED)
    samples: List[List[float]] = [[] for _ in range(width)]
    for _ in range(_BOOTSTRAP_ITERS):
        resample = [rows[rng.randrange(len(rows))] for _ in rows]
        try:
            coefficients = _solve_coefficients(resample)
        except ZeroDivisionError:
            continue
        for index, coefficient in enumerate(coefficients):
            samples[index].append(1.0 / coefficient)

    if any(len(values) < _BOOTSTRAP_ITERS * 0.8 for values in samples):
        return [Estimate(None, None, None, 0, method="none") for _ in range(width)]
    estimates = []
    tail = (1.0 - DEFAULT_CONFIDENCE) / 2.0
    for index, coefficient in enumerate(point):
        values = sorted(samples[index])
        lo = values[max(0, int(tail * len(values)))]
        hi = values[min(len(values) - 1, int((1.0 - tail) * len(values)))]
        estimates.append(Estimate(
            value=round(1.0 / coefficient, 4),
            lo=round(lo, 4),
            hi=round(hi, 4),
            n=len(rows),
            n_clusters=len(rows),
            confidence=DEFAULT_CONFIDENCE,
            method="bootstrap-inverse-ratio-wls-clustered",
        ))
    return estimates


def _chained_run_is_current(
    run: MealRun,
    source: Sequence[BolusEvent],
    groups: Sequence[Dict],
    snapshots: Sequence[Snapshot],
    cfg: IcConfig,
) -> bool:
    """Prove each mixed-block member against its dose-time current identity."""
    if not source:
        return False
    by_block: Dict[int, List[BolusEvent]] = {}
    for member in source:
        bid = _block_of(_tod(member.t), groups)
        if bid is None:
            return False
        by_block.setdefault(bid, []).append(member)
    for bid, block_members in by_block.items():
        group = next((item for item in groups if item["start_min"] == bid), None)
        if group is None or group["value"] is None:
            return False
        expected = HistoryIdentity(
            group["start_min"], group["end_min"], float(group["value"]))
        evidence = RunEvidence(
            started_at=run.t,
            ended_at=run.end_t + timedelta(minutes=cfg.post_meal_min),
            member_times=tuple(member.t for member in block_members),
            stamped_ratios=tuple(member.carb_ratio for member in block_members),
        )
        proof = prove_runs([evidence], snapshots).get(RunIdentity(run.t))
        if proof is None or proof.history_id != expected:
            return False
    return True


def _regression_block_fits(
    groups: Sequence[Dict],
    runs: Sequence[MealRun],
    run_blocks: Sequence[set],
    members_by_run: Dict[RunIdentity, List[BolusEvent]],
    identity_by_run: Dict[RunIdentity, HistoryIdentity],
    snapshots: Optional[Sequence[Snapshot]],
    cfg: IcConfig,
) -> Dict[int, _IcBlockFit]:
    block_ids = [group["start_min"] for group in groups]
    group_by_id = {group["start_min"]: group for group in groups}
    blocks_by_run = {
        RunIdentity(run.t): touched for run, touched in zip(runs, run_blocks)
    }
    admitted = []
    for run, touched in zip(runs, run_blocks):
        if not touched or not _run_is_numeric_candidate(run):
            continue
        if snapshots is not None:
            if len(touched) == 1:
                bid = next(iter(touched))
                group = group_by_id[bid]
                if group["value"] is None:
                    continue
                expected = HistoryIdentity(
                    group["start_min"], group["end_min"], float(group["value"]))
                if identity_by_run.get(RunIdentity(run.t)) != expected:
                    continue
            elif not _chained_run_is_current(
                run, members_by_run.get(RunIdentity(run.t), []), groups, snapshots, cfg,
            ):
                continue
        admitted.append(run)

    fitted = _run_pool(admitted)
    shares_by_run: Dict[RunIdentity, Dict[int, float]] = {}
    for run in fitted:
        meal_carbs = sum(meal.carbs for meal in run.meals)
        if meal_carbs <= 0 or run.carbs_covered <= 0:
            continue
        shares = {bid: 0.0 for bid in block_ids}
        for meal in run.meals:
            bid = _block_of(_tod(meal.t), groups)
            if bid is not None:
                shares[bid] += meal.carbs / meal_carbs
        shares_by_run[RunIdentity(run.t)] = shares
    active_ids = [
        bid for bid in block_ids
        if any(shares.get(bid, 0.0) > 0.0 for shares in shares_by_run.values())
    ]
    row_by_run = {
        RunIdentity(run.t): (
            run.carbs_covered,
            run.effective_insulin / run.carbs_covered,
            [shares_by_run[RunIdentity(run.t)][bid] for bid in active_ids],
        )
        for run in fitted if RunIdentity(run.t) in shares_by_run
    }
    rows = list(row_by_run.values())
    estimates = _regression_estimates(rows)
    singular = bool(active_ids) and (
        len(estimates) != len(active_ids) or any(est.value is None for est in estimates)
    )
    estimate_by_id = dict(zip(active_ids, estimates)) if not singular else {}
    if snapshots is not None:
        on_regime_runs = list(fitted)
    else:
        on_regime_runs = [
            run for run in fitted
            if all(
                (group := group_by_id.get(_block_of(_tod(member.t), groups))) is not None
                and _same_ratio(member.carb_ratio, group["value"])
                for member in members_by_run.get(RunIdentity(run.t), [])
            )
            and members_by_run.get(RunIdentity(run.t), [])
        ]
    on_regime_ids = {RunIdentity(run.t) for run in on_regime_runs}
    on_regime_rows = [
        row for run_id, row in row_by_run.items() if run_id in on_regime_ids
    ]
    on_regime_estimates = _regression_estimates(on_regime_rows)
    on_regime_by_id = (
        dict(zip(active_ids, on_regime_estimates))
        if len(on_regime_estimates) == len(active_ids) else {}
    )
    fit_meals = sum(
        run.n_meals for run in fitted if RunIdentity(run.t) in row_by_run
    )
    fits: Dict[int, _IcBlockFit] = {}
    for bid in block_ids:
        pool = [] if bid not in active_ids else [
            run for run in fitted
            if shares_by_run.get(RunIdentity(run.t), {}).get(bid, 0.0) > 0.0
        ]
        whole = sum(
            1 for run in pool
            if blocks_by_run[RunIdentity(run.t)] == {bid}
        )
        fractional = sum(
            shares_by_run[RunIdentity(run.t)][bid] for run in pool
            if blocks_by_run[RunIdentity(run.t)] != {bid}
        )
        estimate = estimate_by_id.get(bid, Estimate(None, None, None, 0, method="none"))
        estimate = replace(estimate, n=len(pool), n_clusters=len(pool))
        on_regime_pool = [
            run for run in pool if RunIdentity(run.t) in on_regime_ids
        ]
        on_regime_value = on_regime_by_id.get(
            bid, Estimate(None, None, None, 0, method="none")
        ).value
        fits[bid] = _IcBlockFit(
            estimate=estimate,
            eligible_runs=tuple(pool),
            pool_runs=tuple(pool),
            effective_run_count=whole + fractional,
            whole_runs=whole,
            fractional_run_ownership=fractional,
            fit_meals=fit_meals if pool and not singular else 0,
            on_regime_value=on_regime_value,
            n_runs_on_regime=len(on_regime_pool),
        )
    return fits


def analyze_ic_blocks_fuzzy(
    bolus_events: List[BolusEvent],
    ic_segments: List[Tuple[int, float]],
    *,
    config: IcConfig = IcConfig(),
    cgm_readings: Optional[List[CgmReading]] = None,
    isf_effective: Optional[float] = None,
    carb_entries: Optional[List[CarbEntry]] = None,
    basal_events: Optional[List[BasalEvent]] = None,
    harm_config: Optional[HarmConfig] = None,
    harm_lows: Optional[Sequence[PrintedLow]] = None,
    analysis_start: Optional[datetime] = None,
    prior_action_observed_from: Optional[datetime] = None,
    observed_days: Optional[int] = None,
    snapshots: Optional[Sequence[Snapshot]] = None,
    analysis_end: Optional[datetime] = None,
    history_catalog: Optional[List[IcHistory]] = None,
    history_harm_lows: Optional[Sequence[PrintedLow]] = None,
) -> Tuple[List[IcBlock], int]:
    """Fit cross-block run ledgers and stamp them through the shipped safety seam."""
    return _analyze_ic_blocks_shared(
        bolus_events,
        ic_segments,
        config=config,
        cgm_readings=cgm_readings,
        isf_effective=isf_effective,
        carb_entries=carb_entries,
        basal_events=basal_events,
        harm_config=harm_config,
        harm_lows=harm_lows,
        analysis_start=analysis_start,
        prior_action_observed_from=prior_action_observed_from,
        observed_days=observed_days,
        snapshots=snapshots,
        analysis_end=analysis_end,
        history_catalog=history_catalog,
        history_harm_lows=history_harm_lows,
        _fit_builder=_regression_block_fits,
    )
