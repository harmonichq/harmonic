"""Stable-era replay for comparing I:C block estimators against the incumbent."""

from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
from dataclasses import dataclass
from datetime import datetime, timedelta
from io import StringIO
from typing import Optional

from .admission import call_ic_block_estimator, recovers_target
from .analyze import analyze
from .analyzers.ic import analyze_ic_blocks
from .result import IcBlock
from .store import Store


@dataclass(frozen=True)
class ReplayWindow:
    """The stable era whose successive endpoints the replay reads."""

    start: datetime
    end: datetime

    def __post_init__(self) -> None:
        if self.end < self.start:
            raise ValueError("replay window ends before it starts")


class WindowRefused(ValueError):
    """A replay precondition that prevents real-data evidence from being admitted."""


@dataclass(frozen=True)
class ReplayReport:
    """Non-sensitive replay verdict and the counts needed to audit it."""

    block_id: int
    cutoffs: int
    incumbent_first_convergence: Optional[datetime]
    candidate_first_convergence: Optional[datetime]
    incumbent_final_ci_width: Optional[float]
    candidate_final_ci_width: Optional[float]
    incumbent_final_runs: int
    candidate_final_runs: int
    incumbent_final_meals: int
    candidate_final_meals: int
    convergence_days_delta: Optional[int]
    ci_width_delta: Optional[float]
    meal_count_delta: int
    agreement_verdict: str
    candidate_verdict: str

    def render(self) -> str:
        """Render only audit counts, deltas, and verdicts — never clinical rows."""
        lines = [
            f"block={self.block_id}",
            f"cutoffs={self.cutoffs}",
            f"incumbent-final-runs={self.incumbent_final_runs}",
            f"candidate-final-runs={self.candidate_final_runs}",
            f"incumbent-final-meals={self.incumbent_final_meals}",
            f"candidate-final-meals={self.candidate_final_meals}",
            "convergence-days-delta=" + _render_count(self.convergence_days_delta),
            "final-ci-width-delta=" + _render_count(self.ci_width_delta),
            f"final-meal-count-delta={self.meal_count_delta}",
            f"incumbent-self-agreement={self.agreement_verdict}",
            f"candidate-verdict={self.candidate_verdict}",
        ]
        return "\n".join(lines)

    def __str__(self) -> str:
        return self.render()

    def __repr__(self) -> str:
        return self.render()


def _render_count(value: Optional[float]) -> str:
    return "unavailable" if value is None else str(value)


def _schedule(snapshot, parameter: str) -> tuple:
    return tuple(snapshot.settings.active_schedule(parameter))


def _covered_snapshots(store: Store, window: ReplayWindow):
    snapshots = store.settings_snapshots()
    if (not snapshots or not any(snapshot.captured_at <= window.start
                                 for snapshot in snapshots)
            or snapshots[-1].captured_at < window.end):
        raise WindowRefused("settings snapshot coverage does not cover replay window")
    return snapshots


def _tail_schedule_changed(snapshots, window: ReplayWindow, parameter: str) -> bool:
    before = [snapshot for snapshot in snapshots if snapshot.captured_at < window.start]
    tail = [snapshot for snapshot in snapshots if snapshot.captured_at >= window.start]
    # The latest pre-window capture is the schedule in force at the window boundary.
    # Keeping it makes a first in-window change visible even when the log is sparse.
    observed = ([before[-1]] if before else []) + tail
    return any(
        _schedule(previous, parameter) != _schedule(current, parameter)
        for previous, current in zip(observed, observed[1:])
    )


def qualify_window(store: Store, block: IcBlock, window: ReplayWindow) -> None:
    """Refuse a window where later settings can leak into replayed endpoints."""
    snapshots = _covered_snapshots(store, window)
    if _tail_schedule_changed(snapshots, window, "carb_ratio"):
        raise WindowRefused("carb-ratio schedule changed in replay window tail")
    if _tail_schedule_changed(snapshots, window, "isf"):
        raise WindowRefused("ISF schedule changed in replay window tail")
    eligibility = (block.evidence or {}).get("eligibility") or {}
    if not eligibility.get("runs_floor_met"):
        raise WindowRefused("incumbent final block does not meet runs floor")


def _block_at(result, block_id: int) -> Optional[IcBlock]:
    return next((block for block in result.ic_blocks if block.block_id == block_id), None)


def _converges(block: Optional[IcBlock], incumbent: IcBlock) -> bool:
    if block is None or block.state != "numeric":
        return False
    return recovers_target(block, incumbent.estimate.value)


def _ci_width(block: Optional[IcBlock]) -> Optional[float]:
    if block is None or block.estimate.lo is None or block.estimate.hi is None:
        return None
    return block.estimate.hi - block.estimate.lo


def _cutoffs(window: ReplayWindow, step_days: int) -> list[datetime]:
    if step_days <= 0:
        raise ValueError("replay step_days must be positive")
    step = timedelta(days=step_days)
    cutoffs = []
    cutoff = window.start
    while cutoff < window.end:
        cutoffs.append(cutoff)
        cutoff += step
    if not cutoffs or cutoffs[-1] != window.end:
        cutoffs.append(window.end)
    return cutoffs


def _first_convergence(store: Store, estimator, block_id: int, cutoffs: list[datetime],
                       incumbent: IcBlock, *, suppress_output: bool = False) -> Optional[datetime]:
    for cutoff in cutoffs:
        block = _block_at(
            _analyze_at(store, cutoff, estimator, suppress_output=suppress_output), block_id)
        if _converges(block, incumbent):
            return cutoff
    return None


def _analyze_at(store: Store, cutoff: datetime, estimator, *, suppress_output: bool):
    if not suppress_output:
        return analyze(store, now=cutoff, ic_estimator=estimator)
    with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
        return analyze(store, now=cutoff, ic_estimator=estimator)


def _contract_estimator(estimator):
    def validated(bolus_events, ic_segments, **kwargs):
        return call_ic_block_estimator(estimator, bolus_events, ic_segments, **kwargs)

    return validated


def run_replay(
    store: Store,
    estimator=analyze_ic_blocks,
    *,
    block_id: int,
    window: ReplayWindow,
    step_days: int = 7,
) -> ReplayReport:
    """Replay an estimator through ``analyze`` and judge it against the incumbent."""
    _covered_snapshots(store, window)
    incumbent_result = analyze(store, now=window.end, ic_estimator=analyze_ic_blocks)
    incumbent = _block_at(incumbent_result, block_id)
    if incumbent is None:
        raise WindowRefused("incumbent final block was not found")
    qualify_window(store, incumbent, window)

    cutoffs = _cutoffs(window, step_days)
    candidate_estimator = _contract_estimator(estimator)
    candidate_result = _analyze_at(
        store, window.end, candidate_estimator, suppress_output=True)
    candidate = _block_at(candidate_result, block_id)
    incumbent_first = _first_convergence(
        store, analyze_ic_blocks, block_id, cutoffs, incumbent)
    candidate_first = _first_convergence(
        store, candidate_estimator, block_id, cutoffs, incumbent, suppress_output=True)
    incumbent_width = _ci_width(incumbent)
    candidate_width = _ci_width(candidate)
    incumbent_runs = incumbent.n_runs
    candidate_runs = 0 if candidate is None else candidate.n_runs
    incumbent_meals = incumbent.n_meals
    candidate_meals = 0 if candidate is None else candidate.n_meals
    convergence_delta = (
        None if incumbent_first is None or candidate_first is None
        else int((candidate_first - incumbent_first).total_seconds() // 86400)
    )
    width_delta = (
        None if incumbent_width is None or candidate_width is None
        else candidate_width - incumbent_width
    )
    self_run = estimator is analyze_ic_blocks
    agreement = "pass" if incumbent_first is not None else "fail"
    candidate_passes = bool(
        candidate_first is not None
        and incumbent_first is not None
        and candidate_first <= incumbent_first
        and _converges(candidate, incumbent)
        and candidate_width is not None
        and incumbent_width is not None
        and candidate_width <= incumbent_width
        and (self_run or candidate_meals > incumbent_meals)
    )
    return ReplayReport(
        block_id=block_id,
        cutoffs=len(cutoffs),
        incumbent_first_convergence=incumbent_first,
        candidate_first_convergence=candidate_first,
        incumbent_final_ci_width=incumbent_width,
        candidate_final_ci_width=candidate_width,
        incumbent_final_runs=incumbent_runs,
        candidate_final_runs=candidate_runs,
        incumbent_final_meals=incumbent_meals,
        candidate_final_meals=candidate_meals,
        convergence_days_delta=convergence_delta,
        ci_width_delta=width_delta,
        meal_count_delta=candidate_meals - incumbent_meals,
        agreement_verdict=agreement,
        candidate_verdict="pass" if candidate_passes else "fail",
    )
