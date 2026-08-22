"""The scenario denominator and opportunity identities share one builder."""

from datetime import datetime

import pytest

from ciq_autotune.analyzers.scenario.engine import _exposure_counts
from ciq_autotune.analyzers.scenario import engine
from ciq_autotune.analyzers.scenario.levers import Exposure
from ciq_autotune.analyzers.scenario import opportunities
from ciq_autotune.analyzers.scenario.opportunities import build_opportunities
from ciq_autotune import finding_case_file
from ciq_autotune.events import BolusEvent, CgmReading


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


def test_mutating_the_shared_builder_changes_both_consumers(monkeypatch):
    class MutatedBuilder(RuntimeError):
        pass

    calls = []

    def mutation(*args, **kwargs):
        calls.append(tuple(len(rows) for rows in args[:3]))
        raise MutatedBuilder

    monkeypatch.setattr(opportunities, "build_opportunities", mutation)
    with pytest.raises(MutatedBuilder):
        engine._exposure_counts([], [], [])

    class StoreStub:
        @staticmethod
        def prompt_responses():
            return []

    cgm = [CgmReading(t=datetime(2026, 1, 1, 12), bg=120)]
    with pytest.raises(MutatedBuilder):
        finding_case_file._population(StoreStub(), [], cgm, [])

    assert calls == [(0, 0, 0), (0, 1, 0)]
