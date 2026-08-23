#!/usr/bin/env python3
"""Deterministic synthetic truth and placebo sets for the estimator admission bar."""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Dict, Iterable, List

from ciq_autotune.analyzers.ic import BLOCK_WINDOW_DAYS
from ciq_autotune.events import BolusEvent, CgmReading
from ciq_autotune.settings import PumpSettings, ProfileSegment, ProfileSettings, Snapshot

BASE = datetime(2026, 1, 1)
PROGRAMMED_RATIO = 5.6
EFFECTIVE_ISF = 50.0
MEAL_COUNT = 24


def _settings(segments: List[tuple[int, float]]) -> PumpSettings:
    return PumpSettings(
        active_idp=1,
        profiles=(ProfileSettings(
            idp=1, name="Synthetic admission profile", dia_min=300,
            carb_entry=True, max_bolus=10.0,
            segments=tuple(
                ProfileSegment(start, 0.8, int(EFFECTIVE_ISF), ratio, 110)
                for start, ratio in segments),
        ),),
    )


def _set(name: str, seed: int, segments: List[tuple[int, float]], events: List[BolusEvent],
         cgm_readings: List[CgmReading], true_ratio_by_block: Dict[int, float]) -> dict:
    # Start the fixed 90-day block window before the first meal while leaving a
    # complete 90 days from the first stored insulin event to the replay endpoint.
    end = BASE + timedelta(days=BLOCK_WINDOW_DAYS, hours=13)
    settings = _settings(segments)
    return {
        "name": name,
        "seed": seed,
        "events": events,
        "segments": segments,
        "cgm_readings": cgm_readings,
        "isf_effective": EFFECTIVE_ISF,
        "observed_days": BLOCK_WINDOW_DAYS,
        "true_ratio_by_block": true_ratio_by_block,
        "analysis_start": end - timedelta(days=BLOCK_WINDOW_DAYS),
        "analysis_end": end,
        "snapshots": [Snapshot(BASE, settings)],
        "settings": settings,
    }


def _meal(day: int, hour: int, carbs: float, dose: float, ratio: float) -> BolusEvent:
    return BolusEvent(
        t=BASE + timedelta(days=day * 3, hours=hour), insulin=round(dose, 4),
        carbs=carbs, carb_ratio=ratio, completion="Completed",
    )


def _known(name: str, true_ratio: float) -> dict:
    segments = [(0, PROGRAMMED_RATIO)]
    events = [_meal(day, 13, 60.0, 60.0 / true_ratio, PROGRAMMED_RATIO)
              for day in range(MEAL_COUNT)]
    return _set(name, 0, segments, events, [], {0: true_ratio})


def known_ratio_sets() -> List[dict]:
    """Known-ratio recovery sets; the first two are the admission gate."""
    gated_tighten = _known("known-tighten", 5.0)
    gated_loosen = _known("known-loosen", 6.2)

    multi_segments = [(0, 5.0), (720, 6.2)]
    multi_events = ([_meal(day, 13, 60.0, 12.0, 5.0) for day in range(MEAL_COUNT)]
                    + [_meal(day, 21, 62.0, 10.0, 6.2) for day in range(MEAL_COUNT)])
    multi = _set("exploratory-multi-block", 0, multi_segments, multi_events, [],
                 {0: 5.0, 720: 6.2})
    equal = _known("exploratory-equal-programmed", PROGRAMMED_RATIO)
    for truth in (gated_tighten, gated_loosen):
        truth["gated"] = True
    for truth in (multi, equal):
        truth["gated"] = False
    return [gated_tighten, gated_loosen, multi, equal]


def _placebo(seed: int) -> dict:
    rng = random.Random(seed)
    segments = [(0, PROGRAMMED_RATIO)]
    events, cgm = [], []
    noise = []
    for _ in range(MEAL_COUNT // 2):
        magnitude = rng.uniform(0.0, 25.0)
        noise.extend((magnitude, -magnitude))
    rng.shuffle(noise)
    for day, drift in enumerate(noise):
        event = _meal(day, 13, 60.0, 60.0 / PROGRAMMED_RATIO, PROGRAMMED_RATIO)
        events.append(event)
        for minute in range(0, 331, 5):
            cgm.append(CgmReading(
                t=event.t + timedelta(minutes=minute),
                bg=120.0 + drift * min(minute / 300.0, 1.0),
            ))
    return _set(f"placebo-{seed}", seed, segments, events, cgm, {})


def placebo_sets() -> List[dict]:
    """Dose-at-programmed placebos with zero-mean, dose-independent outcome noise."""
    return [_placebo(seed) for seed in (3, 17)]


def write_set_to_store(store, truth_set: dict) -> None:
    """Write a truth set through the Store's public synthetic-import shapes."""
    boluses: Iterable[dict] = (
        {
            "seq_num": index + 1,
            "request_time": event.t.strftime("%Y-%m-%d %H:%M:%S"),
            "description": "Synthetic admission meal",
            "completion": event.completion,
            "insulin": event.insulin,
            "requested_insulin": event.insulin,
            "carbs": event.carbs,
            "bg": event.bg,
            "user_override": 0,
            "extended_bolus": "0",
            "correction_insulin": 0.0,
            "food_insulin": event.insulin,
            "pump_iob": 0.0,
            "isf": EFFECTIVE_ISF,
            "target_bg": 110,
            "carb_ratio": event.carb_ratio,
        }
        for index, event in enumerate(truth_set["events"])
    )
    cgm: Iterable[dict] = (
        {
            "EventDateTime": reading.t.strftime("%Y-%m-%d %H:%M:%S"),
            "Readings (CGM / BGM)": reading.bg,
            "Description": "Synthetic EGV",
        }
        for reading in truth_set["cgm_readings"]
    )
    store.upsert_bolus(boluses)
    store.upsert_cgm(cgm)
    store.upsert_settings_snapshot(
        truth_set["analysis_start"].strftime("%Y-%m-%d %H:%M:%S"),
        truth_set["settings"],
    )


def main() -> None:
    for truth_set in known_ratio_sets() + placebo_sets():
        print(f"{truth_set['name']}: events={len(truth_set['events'])} "
              f"cgm={len(truth_set['cgm_readings'])} seed={truth_set['seed']}")


if __name__ == "__main__":
    main()
