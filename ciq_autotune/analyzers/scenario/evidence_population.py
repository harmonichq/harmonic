"""The complete, per-lever evidence-population policy (#202).

This is deliberately separate from :mod:`levers`: an Exposure describes the event
family an episode belongs to, while this module owns what recurrence and an event
comparison mean for the lever's claim.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Sequence

from ..scenario_config import ScenarioConfig
from .levers import Exposure, Lever, exposure


def completed_carb_bolus(item, *, scenario_config: ScenarioConfig = ScenarioConfig()) -> bool:
    """ADR 679's eligible completed carb-bolus identity, shared by all consumers."""
    return (
        item.completion == "Completed"
        and item.insulin is not None and item.insulin > 0
        and item.carbs is not None and item.carbs >= scenario_config.anchor_meal_min_carbs
    )


def _event_identity(item) -> str:
    return f"meal-{item.seq_num}" if item.seq_num is not None else f"meal-{item.t.isoformat()}"


def _episode_identity(item) -> str:
    return item.id


def _family_member(family: Exposure) -> Callable:
    return lambda item: getattr(item, "family", None) is family


@dataclass(frozen=True)
class EvidencePopulationPolicy:
    recurrence_family: Exposure | None
    recurrence_noun: str
    recurrence_members: Callable
    comparison_family: Exposure | None
    comparison_members: Callable
    comparison_name: str
    comparison_anchor_kind: str
    comparison_window: tuple[int, int]
    cross_population: bool
    occurrence_id: Callable

    def recurrence_population(self, families: dict, bolus: Sequence) -> tuple:
        if self.recurrence_family is None:
            return tuple(item for item in bolus if self.recurrence_members(item))
        return tuple(item for item in families.get(self.recurrence_family, ())
                     if self.recurrence_members(item))

    def occurrence_for_episode(
        self, episode_id: str, bolus: Sequence, before: datetime,
    ) -> str:
        """Return the policy's stable occurrence id for an attributed episode."""
        if self.recurrence_family is not None:
            return episode_id
        members = [item for item in bolus
                   if item.t < before and self.recurrence_members(item)]
        if not members:
            raise ValueError("attributed episode has no recurrence-population occurrence")
        return self.occurrence_id(max(members, key=lambda item: item.t))


_WINDOWS = {
    Exposure.MEALS: (-60, 300), Exposure.LOWS: (-300, 120),
    Exposure.CORRECTION_CLUSTERS: (-300, 180), Exposure.HIGHS: (-150, 300),
}


def _ordinary(lever: Lever) -> EvidencePopulationPolicy:
    family = exposure(lever)
    return EvidencePopulationPolicy(
        recurrence_family=family, recurrence_noun=family.value,
        recurrence_members=_family_member(family),
        comparison_family=family,
        comparison_members=_family_member(family),
        comparison_name={
            Exposure.MEALS: "Other completed carb-bolus meals", Exposure.LOWS: "Other low excursions",
            Exposure.CORRECTION_CLUSTERS: "Other back-to-back correction pairs", Exposure.HIGHS: "Other highs",
        }[family],
        comparison_anchor_kind={Exposure.MEALS: "completed_carb_bolus", Exposure.LOWS: "excursion_nadir",
                                Exposure.CORRECTION_CLUSTERS: "correction_pair", Exposure.HIGHS: "high_peak"}[family],
        comparison_window=_WINDOWS[family], cross_population=False, occurrence_id=_episode_identity,
    )


_POLICIES = {lever: _ordinary(lever) for lever in Lever}
_POLICIES[Lever.MISSED_MEAL] = EvidencePopulationPolicy(
    Exposure.HIGHS, "highs", _family_member(Exposure.HIGHS), None,
    completed_carb_bolus, "Completed carb-bolus meals",
    "completed_carb_bolus", (-60, 300), True, _episode_identity,
)
_POLICIES[Lever.MEAL_BOLUS_SHORT] = EvidencePopulationPolicy(
    None, "meals", completed_carb_bolus, None, completed_carb_bolus,
    "Other completed carb-bolus meals",
    "completed_carb_bolus", (-60, 300), False, _event_identity,
)


def policy_for(lever: Lever | str) -> EvidencePopulationPolicy:
    """Return the closed evidence-population contract for one behavioral lever."""
    return _POLICIES[Lever(lever)]


def recurrence_count(lever: Lever | str, families: dict, bolus: Sequence) -> int:
    return len(policy_for(lever).recurrence_population(families, bolus))
