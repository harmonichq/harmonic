"""Manufactured eating-sequence event streams shared by detector consumers."""

from datetime import datetime, timedelta
from dataclasses import replace
from ciq_autotune.analyzers.eating_sequence_config import EatingSequenceConfig
from ciq_autotune.analyzers.eating_sequences import build_sequences

from ciq_autotune.events import BasalEvent, BolusEvent, CarbEntry, CgmReading


def high_carb_stream(*, start=datetime(2040, 1, 1, 12), count=40, sd_only=False):
    """Return non-personal event streams with a supported Q5 adverse cohort."""
    boluses, cgm = [], []
    for index in range(count):
        meal = start + timedelta(hours=index * 12)
        high = index >= count * 4 // 5
        boluses.append(BolusEvent(meal, carbs=13.7 + index * 2.3))
        glucose = 101.3 if not high or sd_only else 211.7
        for minute in range(0, 365, 5):
            spread = 0 if not sd_only or not high else (30.4 if minute % 10 else -30.4)
            cgm.append(CgmReading(meal + timedelta(minutes=minute), glucose + spread + (minute % 15) / 10))
    return boluses, cgm, [], [BasalEvent(cgm[-1].t, "Profile")]


def repeat_eating_stream(*, start=datetime(2040, 1, 1, 12), repeat_count=8,
                         two_count=0, sd_only=False):
    """Return invented matched-carb cohorts with one, two, and repeated windows."""
    boluses, cgm = [], []
    for index in range(80):
        meal = start + timedelta(hours=index * 8)
        carb_total = 13.7 + index * 2.3
        q5_index = index - 64
        if index < 64 or q5_index >= two_count + repeat_count:
            window_count = 1
        elif q5_index < two_count:
            window_count = 2
        else:
            window_count = 3 + (q5_index - two_count) % 2
        for window in range(window_count):
            boluses.append(BolusEvent(
                meal + timedelta(minutes=window * 31), carbs=carb_total / window_count,
            ))
        adverse = index >= 64 and two_count <= q5_index < two_count + repeat_count
        glucose = 111.3 if not adverse or sd_only else 211.7
        for minute in range(0, 425, 5):
            spread = 0 if not adverse or not sd_only else (30.4 if minute % 10 else -30.4)
            cgm.append(CgmReading(meal + timedelta(minutes=minute), glucose + spread))
    return boluses, cgm, [], [BasalEvent(cgm[-1].t, "Profile")]


def carb_entry(t):
    return CarbEntry(t, 17.3, "exact", "manual")


def sequence_episode_stream(lever, *, covered=False, competitor="mild", multi=False):
    factory = high_carb_stream if lever == "high_carb_sequence" else repeat_eating_stream
    bolus, _, carbs, basal = factory()
    bolus = [replace(b, insulin=0.5, seq_num=i + 1) for i, b in enumerate(bolus)]
    sequences = build_sequences(bolus, config=EatingSequenceConfig())
    cgm = []
    for index, sequence in enumerate(sequences):
        adverse = index >= 32 if lever == "high_carb_sequence" else sequence.window_count >= 3
        delay = 60 if covered else 330
        stop = int((sequence.end - sequence.start).total_seconds() / 60) + 360
        for minute in range(-15, stop + 1, 5):
            t = sequence.start + timedelta(minutes=minute)
            high = sequence.end + timedelta(minutes=delay) <= t < sequence.end + timedelta(minutes=delay + 25)
            if multi:
                high = high or sequence.end + timedelta(minutes=245) <= t < sequence.end + timedelta(minutes=260)
            cgm.append(CgmReading(t, 270.0 if adverse and high else 110.0))
    if competitor is not None:
        # A separate unbolused excursion changes the existing missed-meal price
        # without changing any sequence cohort or contested episode geometry.
        t = bolus[0].t - timedelta(hours=12)
        peak, duration = (260, 5) if competitor == "mild" else (390, 120)
        cgm.extend(CgmReading(t + timedelta(minutes=m), peak if 30 <= m < 30 + duration else 110)
                   for m in range(0, 190, 5))
    cgm.sort(key=lambda r: r.t)
    return bolus, cgm, carbs, [replace(basal[0], t=cgm[-1].t)]
