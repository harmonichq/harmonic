"""Meal-owned Control-IQ suspend selection (ADR 681)."""

from __future__ import annotations

from datetime import timedelta
from typing import Sequence

from ...events import BasalEvent, BolusEvent, CgmReading
from ..classifiers.evidence import EvidenceTier, SilenceReason
from ..classifiers.suspend import SuspendVerdict, classify_suspend
from ..scenario_config import ScenarioConfig
from .anchors import AnchorKind, _is_meal, collect_anchors


def classify_meal_owned_suspend(
    meal: BolusEvent,
    bolus_events: Sequence[BolusEvent],
    cgm_readings: Sequence[CgmReading],
    basal_events: Sequence[BasalEvent],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> SuspendVerdict:
    """Judge the suspend owned by ``meal`` under ADR 681's selection rule."""
    indexed_meals = [
        (input_index, bolus)
        for input_index, bolus in enumerate(bolus_events)
        if _is_comparison_meal(bolus, scenario_config=scenario_config)
    ]
    indexed_meals.sort(
        key=lambda item: (
            item[1].t,
            item[1].seq_num if item[1].seq_num is not None else item[0],
        )
    )
    meals = [bolus for _, bolus in indexed_meals]
    meal_index = next(
        (i for i, candidate in enumerate(meals) if candidate is meal), None
    )
    if meal_index is None:
        meal_index = next(
            (i for i, candidate in enumerate(meals) if candidate == meal), None
        )
    if meal_index is None:
        return _no_owned_suspend()

    owned = []
    for anchor in collect_anchors([], [], basal_events, scenario_config=scenario_config):
        if anchor.kind is not AnchorKind.SUSPEND:
            continue
        eligible = [
            (candidate.t, index)
            for index, candidate in enumerate(meals)
            if candidate.t
            <= anchor.t
            <= candidate.t
            + timedelta(minutes=scenario_config.meal_suspend_ownership_min)
        ]
        if eligible and max(eligible) == (meal.t, meal_index):
            owned.append(anchor)

    if not owned:
        return _no_owned_suspend()

    verdicts = [
        classify_suspend(
            anchor.t,
            cgm_readings,
            basal_events,
            scenario_config=scenario_config,
        )
        for anchor in owned
    ]
    return next((verdict for verdict in verdicts if verdict.matched), verdicts[0])


def _no_owned_suspend() -> SuspendVerdict:
    return SuspendVerdict(
        matched=False,
        detail="no Meal-owned Control-IQ suspend episode found in the ownership window",
        evidence_tier=EvidenceTier.NOT_IN_DATA,
        silence_reason=SilenceReason.INSUFFICIENT_DATA,
    )


def _is_comparison_meal(
    bolus: BolusEvent,
    *,
    scenario_config: ScenarioConfig,
) -> bool:
    return (
        _is_meal(bolus, scenario_config=scenario_config)
        and bolus.insulin is not None
        and bolus.insulin > 0
        and bolus.completion == "Completed"
    )
