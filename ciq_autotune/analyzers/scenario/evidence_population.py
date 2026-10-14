"""The complete, per-lever evidence-population policy (#202).

This is deliberately separate from :mod:`levers`: an Exposure describes the event
family an episode belongs to, while this module owns what recurrence and an event
comparison mean for the lever's claim.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Sequence

from ..meals import group_meals
from ..scenario_config import ScenarioConfig
from .levers import Exposure, Lever, exposure


def _completed_meal(meal, *, scenario_config: ScenarioConfig = ScenarioConfig()) -> bool:
    """ADR 679's completed carb-bolus population, counted in meals (ADR 470): a meal is
    in it when any member is a completed carb bolus."""
    return meal.completed


def _family_member(family: Exposure) -> Callable:
    return lambda item, *, scenario_config: getattr(item, "family", None) is family


@dataclass(frozen=True)
class EvidencePopulationPolicy:
    recurrence_family: Exposure
    recurrence_noun: str
    recurrence_members: Callable
    comparison_family: Exposure | None
    comparison_members: Callable
    comparison_name: str
    comparison_window: tuple[int, int]
    cross_population: bool

    def recurrence_population(
        self,
        families: dict,
        *,
        scenario_config: ScenarioConfig = ScenarioConfig(),
    ) -> tuple:
        return tuple(item for item in families.get(self.recurrence_family, ())
                     if self.recurrence_members(
                         item, scenario_config=scenario_config,
                     ))

    def comparison_population(
        self,
        roster: Sequence,
        bolus: Sequence,
        *,
        scenario_config: ScenarioConfig = ScenarioConfig(),
    ) -> tuple:
        """Return the candidates eligible for this lever's comparison cohort."""
        if self.cross_population:
            return tuple(
                meal for meal in group_meals(bolus, scenario_config=scenario_config)
                if self.comparison_members(meal, scenario_config=scenario_config)
            )

        def eligible(member) -> bool:
            opportunity = member.opportunity
            if self.comparison_family is not None:
                return self.comparison_members(
                    opportunity, scenario_config=scenario_config,
                )
            # Only a meals opportunity carries a meal to be completed.
            return opportunity.meal is not None and self.comparison_members(
                opportunity.meal, scenario_config=scenario_config,
            )

        return tuple(member for member in roster if eligible(member))


_WINDOWS = {
    Exposure.MEALS: (-60, 300), Exposure.LOWS: (-60, 120),
    Exposure.CORRECTION_CLUSTERS: (-120, 180), Exposure.HIGHS: (-150, 300),
}


def _ordinary(lever: Lever) -> EvidencePopulationPolicy:
    family = exposure(lever)
    return EvidencePopulationPolicy(
        recurrence_family=family, recurrence_noun=family.value,
        recurrence_members=_family_member(family),
        comparison_family=family,
        comparison_members=_family_member(family),
        comparison_name={
            Exposure.MEALS: "Other meal opportunities", Exposure.LOWS: "Other low excursions",
            Exposure.CORRECTION_CLUSTERS: "Other back-to-back correction pairs", Exposure.HIGHS: "Other highs",
        }[family],
        comparison_window=_WINDOWS[family], cross_population=False,
    )


_POLICIES = {lever: _ordinary(lever) for lever in Lever}
_POLICIES[Lever.MISSED_MEAL] = EvidencePopulationPolicy(
    Exposure.HIGHS, "highs", _family_member(Exposure.HIGHS), None,
    _completed_meal, "Completed carb-bolus meals", (-60, 300), True,
)


def policy_for(lever: Lever | str) -> EvidencePopulationPolicy:
    """Return the closed evidence-population contract for one behavioral lever."""
    return _POLICIES[Lever(lever)]


def recurrence_count(
    lever: Lever | str,
    families: dict,
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> int:
    return len(policy_for(lever).recurrence_population(
        families, scenario_config=scenario_config,
    ))
