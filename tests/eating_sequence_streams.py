"""Manufactured eating-sequence event streams shared by detector consumers."""

from datetime import datetime, timedelta

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


def carb_entry(t):
    return CarbEntry(t, 17.3, "exact", "manual")
