"""Meal identity (ADR 470): a meal is its first carb bolus plus its same-meal top-ups.

Every meal counter reads this one rule: the scenario engine's anchors and
opportunities, the meal classifiers, the completed carb-bolus population (ADR 679),
Meal over-delivery's suspend ownership (ADR 681), the Post-meal arc and the Trial,
watched-change, follow-up and time-of-day meal counts.

A meal bolus (carbs at or over ``anchor_meal_min_carbs``) that is not already a
member opens a meal, and every later meal bolus at most
``carb_undercount_same_meal_grace_min`` after that opener joins it: a pre-bolus plus
a top-up, a dual-wave, a forgotten side. The grace is measured from the opener and
never chained (ADR 0030), and a bolus exactly at the grace is a member. Carb-free
boluses and carb boluses under the floor are never members.

The module sits beside :mod:`.scenario_config` rather than inside :mod:`.scenario`
because the classifiers read it, and a classifier that imports ``scenario.anchors``
first re-enters ``scenario/__init__``, which imports the classifier back
half-initialized.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Sequence

from ..events import BolusEvent
from .scenario_config import ScenarioConfig


def _is_meal(b: BolusEvent, *, scenario_config: ScenarioConfig = ScenarioConfig()) -> bool:
    return b.carbs is not None and b.carbs >= scenario_config.anchor_meal_min_carbs


def completed_carb_bolus(item, *, scenario_config: ScenarioConfig = ScenarioConfig()) -> bool:
    """ADR 679's eligible completed carb-bolus identity, shared by all consumers."""
    return (
        item.completion == "Completed"
        and item.insulin is not None and item.insulin > 0
        and item.carbs is not None and item.carbs >= scenario_config.anchor_meal_min_carbs
    )


@dataclass(frozen=True)
class Meal:
    """One meal: its member boluses in time order, the first being the opener.

    Its anchor time and identity are the first bolus's, so a one-bolus meal's anchor,
    identity and occurrence ids are that bolus's own. It is judged on sums over its
    members, at the first member's stamped carb ratio (ADR 470 decision 2). The
    attributes a meal classifier reads (``t``, ``seq_num``, ``carbs``, ``insulin``,
    ``carb_ratio``, ``bg``) mean the same on a :class:`Meal` and on a one-member
    meal's :class:`~ciq_autotune.events.BolusEvent`.

    ``completed`` is true when any member is a :func:`completed_carb_bolus`.
    """

    members: tuple[BolusEvent, ...]
    completed: bool

    @property
    def first(self) -> BolusEvent:
        return self.members[0]

    @property
    def t(self) -> datetime:
        return self.first.t

    @property
    def seq_num(self) -> Optional[int]:
        return self.first.seq_num

    @property
    def bg(self) -> Optional[float]:
        return self.first.bg

    @property
    def carb_ratio(self) -> Optional[float]:
        return self.first.carb_ratio

    @property
    def carbs(self) -> float:
        """Carbs over the members the pump completed (``Completed`` or unknown), or
        over every member when none did: a cancelled leg's carbs, which its re-issue
        carries again, count once."""
        completed = [b for b in self.members if b.completion in ("Completed", None)]
        return sum(b.carbs for b in (completed or self.members))

    @property
    def insulin(self) -> Optional[float]:
        """What every member delivered, or ``None`` when no member carries a dose."""
        doses = [b.insulin for b in self.members if b.insulin is not None]
        return sum(doses) if doses else None


def group_meals(
    bolus_events: Sequence[BolusEvent],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> tuple[Meal, ...]:
    """The meals among ``bolus_events``, in time order.

    Meal boluses are taken in ``(t, seq_num)`` order, input order breaking a tie
    between rows with no ``seq_num``.
    """
    grace = timedelta(minutes=scenario_config.carb_undercount_same_meal_grace_min)
    ordered = sorted(
        (
            (b.t, b.seq_num if b.seq_num is not None else index, b)
            for index, b in enumerate(bolus_events)
            if _is_meal(b, scenario_config=scenario_config)
        ),
        key=lambda item: item[:2],
    )
    groups: list[list[BolusEvent]] = []
    for _, _, b in ordered:
        if groups and b.t <= groups[-1][0].t + grace:
            groups[-1].append(b)
        else:
            groups.append([b])
    return tuple(
        Meal(tuple(members), any(
            completed_carb_bolus(b, scenario_config=scenario_config) for b in members))
        for members in groups
    )


def next_meal_t(
    t: datetime,
    bolus_events: Sequence[BolusEvent],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Optional[datetime]:
    """The first bolus of the next meal after ``t``, or ``None``: where a meal at ``t``
    stops owning its excursion. A top-up of that meal never ends it."""
    return next((meal.t for meal in group_meals(bolus_events, scenario_config=scenario_config)
                 if meal.t > t), None)
