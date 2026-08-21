"""The scenario denominator and opportunity identities share one builder."""

from datetime import datetime

from ciq_autotune.analyzers.scenario.engine import _exposure_counts
from ciq_autotune.analyzers.scenario.levers import Exposure
from ciq_autotune.analyzers.scenario.opportunities import build_opportunities
from ciq_autotune.events import BolusEvent


def test_correction_pairs_are_adjacent_in_canonical_equal_time_order():
    boluses = [
        BolusEvent(t=datetime(2026, 1, 1, 12), insulin=1, seq_num=11),
        BolusEvent(t=datetime(2026, 1, 1, 12), insulin=1, seq_num=12),
        BolusEvent(t=datetime(2026, 1, 1, 12, 5), insulin=1, seq_num=13),
    ]

    opportunities = build_opportunities(boluses, [], [])

    assert [item.source_key for item in opportunities[Exposure.CORRECTION_CLUSTERS]] == [
        (11, 12), (12, 13),
    ]
    assert _exposure_counts(boluses, [], [])[Exposure.CORRECTION_CLUSTERS] == 2
