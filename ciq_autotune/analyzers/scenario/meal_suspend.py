"""Meal-owned Control-IQ suspend selection (ADR 681)."""

from __future__ import annotations

from datetime import timedelta
from typing import Sequence

from ...events import BasalEvent, BolusEvent, CgmReading
from ..classifiers.evidence import EvidenceTier, SilenceReason
from ..classifiers.suspend import SuspendVerdict, classify_suspend
from ..meals import Meal, group_meals
from ..scenario_config import ScenarioConfig
from .anchors import AnchorKind, collect_anchors


class MealSuspendOwnership:
    """ADR 681 meal-to-suspend ownership for one bolus/basal context.

    Each suspend goes to the latest completed meal (ADR 470) whose first bolus is
    within the ownership window before it, so a same-meal top-up never takes a
    suspend from the meal it tops up.
    """

    def __init__(
        self,
        bolus_events: Sequence[BolusEvent],
        basal_events: Sequence[BasalEvent],
        *,
        scenario_config: ScenarioConfig = ScenarioConfig(),
    ) -> None:
        self._meals = tuple(
            meal for meal in group_meals(bolus_events, scenario_config=scenario_config)
            if meal.completed
        )
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

    def owned_anchors(self, meal: Meal | BolusEvent):
        """Return the ADR 681-owned suspend anchors for ``meal`` in input order.

        The meal is looked up by its first bolus's ``(t, seq_num)``, so a one-member
        meal's own bolus finds it, and a top-up, which opens no meal, owns nothing.
        """
        meal_index = next(
            (i for i, candidate in enumerate(self._meals)
             if (candidate.t, candidate.seq_num) == (meal.t, meal.seq_num)), None
        )
        return () if meal_index is None else self._owned[meal_index]


def classify_meal_owned_suspend(
    meal: Meal | BolusEvent,
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
