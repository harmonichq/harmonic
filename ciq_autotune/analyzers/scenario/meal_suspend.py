"""Meal-owned Control-IQ suspend selection (ADR 681)."""

from __future__ import annotations

from datetime import timedelta
from typing import Sequence

from ...events import BasalEvent, BolusEvent, CgmReading
from ..classifiers.evidence import EvidenceTier, SilenceReason
from ..classifiers.suspend import SuspendVerdict, classify_suspend
from ..scenario_config import ScenarioConfig
from .anchors import AnchorKind, _is_meal, collect_anchors


class MealSuspendOwnership:
    """ADR 681 meal-to-suspend ownership for one bolus/basal context."""

    def __init__(
        self,
        bolus_events: Sequence[BolusEvent],
        basal_events: Sequence[BasalEvent],
        *,
        scenario_config: ScenarioConfig = ScenarioConfig(),
    ) -> None:
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
        self._meals = tuple(bolus for _, bolus in indexed_meals)
        owned = [[] for _ in self._meals]
        for anchor in collect_anchors([], [], basal_events, scenario_config=scenario_config):
            if anchor.kind is not AnchorKind.SUSPEND:
                continue
            eligible = [
                (candidate.t, index)
                for index, candidate in enumerate(self._meals)
                if candidate.t
                <= anchor.t
                <= candidate.t
                + timedelta(minutes=scenario_config.meal_suspend_ownership_min)
            ]
            if eligible:
                owned[max(eligible)[1]].append(anchor)
        self._owned = tuple(tuple(anchors) for anchors in owned)

    def owned_anchors(self, meal: BolusEvent):
        """Return the ADR 681-owned suspend anchors for ``meal`` in input order."""
        meal_index = next(
            (i for i, candidate in enumerate(self._meals) if candidate is meal), None
        )
        if meal_index is None:
            meal_index = next(
                (i for i, candidate in enumerate(self._meals) if candidate == meal), None
            )
        return () if meal_index is None else self._owned[meal_index]


def classify_meal_owned_suspend(
    meal: BolusEvent,
    bolus_events: Sequence[BolusEvent],
    cgm_readings: Sequence[CgmReading],
    basal_events: Sequence[BasalEvent],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    ownership: MealSuspendOwnership | None = None,
) -> SuspendVerdict:
    """Judge the suspend owned by ``meal`` under ADR 681's selection rule."""
    if ownership is None:
        ownership = MealSuspendOwnership(
            bolus_events, basal_events, scenario_config=scenario_config,
        )
    owned = ownership.owned_anchors(meal)

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
