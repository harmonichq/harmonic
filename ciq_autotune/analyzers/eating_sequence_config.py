"""Eating-sequence detector rules (#274).

This configuration is deliberately separate from ``ModelConfig`` and ``safety``.
It owns the code-owned definitions and evidence floor for the eating-sequence
detectors that consume the aggregate report contract.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class EatingSequenceConfig:
    """Detector rules for eating-sequence aggregate evidence (#274)."""

    #: Carb-bearing boluses this many minutes apart remain one eating window.
    window_merge_minutes: float = 30.0
    #: Eating windows this many hours apart remain one eating sequence.
    sequence_gap_hours: float = 3.0
    #: The in-sequence interval extends this far beyond the final window.
    in_sequence_tail_minutes: float = 5.0
    #: The only post-sequence horizons reported by the contract.
    post_horizons_hours: tuple[int, int] = (4, 6)
    #: Inclusive lower bound of the time-in-range convention.
    tir_low_mgdl: int = 70
    #: Inclusive upper bound of the time-in-range convention.
    tir_high_mgdl: int = 180
    #: Required occupied five-minute-slot fraction for an interval.
    cgm_coverage_floor: float = 0.7
    #: Smallest qualifying cohort that may support an aggregate.
    minimum_bucket_n: int = 8
    #: Balanced empirical cohorts in the source-window population.
    quintile_count: int = 5
    #: First local pump-wall hour included in the evening scope.
    evening_start_hour: int = 18
    #: Exclusive local pump-wall hour ending the evening scope.
    evening_end_hour: int = 24
    #: Descriptive counts of eating windows inside one sequence.
    window_count_bands: tuple[str, str, str] = ("1", "2", "3+")
