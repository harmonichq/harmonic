"""Canonical, identity-bearing opportunities for scenario exposures."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Mapping, Sequence

from ...events import BasalEvent, BolusEvent, CgmReading
from ..scenario_config import ScenarioConfig
from .anchors import AnchorKind, _is_meal, _is_user_correction, collect_anchors
from .levers import Exposure


@dataclass(frozen=True)
class Opportunity:
    """One stable member of an Exposure population."""

    family: Exposure
    source_key: tuple
    anchor_t: datetime
    anchor_kind: str
    anchor_bg: float | None = None
    reach_start: datetime | None = None
    members: tuple[BolusEvent, ...] = ()


def build_opportunities(
    bolus: Sequence[BolusEvent], cgm: Sequence[CgmReading], basal: Sequence[BasalEvent],
    *, scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Mapping[Exposure, tuple[Opportunity, ...]]:
    """Return the four closed opportunity populations.

    Corrections use adjacent pairs in ``(t, seq_num)`` order, so equal-time
    corrections stay distinct and deterministic.
    """
    anchors = collect_anchors(
        bolus, cgm, basal, scenario_config=scenario_config,
        low_mgdl=scenario_config.gate_low_mgdl,
    )
    families: dict[Exposure, list[Opportunity]] = {item: [] for item in Exposure}
    for item in bolus:
        if _is_meal(item, scenario_config=scenario_config):
            families[Exposure.MEALS].append(Opportunity(
                Exposure.MEALS, (item.seq_num,), item.t, "meal", members=(item,),
            ))
    for anchor in anchors:
        if anchor.kind is AnchorKind.LOW:
            families[Exposure.LOWS].append(Opportunity(
                Exposure.LOWS, (anchor.span_start, anchor.span_end, anchor.t), anchor.t, "low", anchor.bg,
            ))
        elif anchor.kind is AnchorKind.HIGH:
            families[Exposure.HIGHS].append(Opportunity(
                Exposure.HIGHS, (anchor.span_start, anchor.span_end, anchor.t), anchor.t, "high", anchor.bg,
                reach_start=anchor.reach_start,
            ))
    corrections = sorted(
        (item for item in bolus if _is_user_correction(item, scenario_config=scenario_config)),
        key=lambda item: (item.t, item.seq_num),
    )
    for previous, second in zip(corrections, corrections[1:]):
        families[Exposure.CORRECTION_CLUSTERS].append(Opportunity(
            Exposure.CORRECTION_CLUSTERS, (previous.seq_num, second.seq_num), second.t,
            "correction", members=(previous, second),
        ))
    return {family: tuple(items) for family, items in families.items()}
