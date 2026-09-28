#!/usr/bin/env python3
"""Generate synthetic current I:C meal-run evidence (#145, #464)."""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
from datetime import datetime, timedelta

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ciq_autotune.analyzers.ic import _CIQ_SUSPEND_TYPE, IcConfig  # noqa: E402
from ciq_autotune.analyzers.ic_regression import analyze_ic_blocks_fuzzy  # noqa: E402
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading  # noqa: E402
from ciq_autotune.harm import HarmArm, HarmConfig, PrintedLow  # noqa: E402
from ciq_autotune.ic_block_evidence import prepare_ic_block_evidence  # noqa: E402
from ciq_autotune.settings import (  # noqa: E402
    ProfileSegment, ProfileSettings, PumpSettings, Snapshot,
)
from ciq_autotune.store import Store  # noqa: E402
from scripts.gen_estimator_truth import write_set_to_store  # noqa: E402

OUT = ROOT / "mockups" / "diagnose-workstation.synthetic" / "ic-block-evidence.capture.json"
BASE = datetime(2026, 1, 1)
ISF = 50.0
# The explained case's two programmed values, and the earlier pair a snapshot
# retired inside the measured window.
CURRENT = ((0, 5.0), (720, 6.0))
EARLIER = ((0, 6.0), (720, 7.0))


def seed_store(store, events, readings, basal=()):
    """Write one case's boluses, CGM and basal through the store's public shapes.

    The preparation reads its meal outcomes off a real store, so the rows a case
    was prepared over are part of the case.
    """
    write_set_to_store(store, {"events": list(events),
                               "cgm_readings": list(readings), "snapshots": []})
    store.upsert_basal([
        {"seq_num": index, "time": row.t.strftime("%Y-%m-%d %H:%M:%S"),
         "delivery_type": row.delivery_type, "basal_rate": row.basal_rate,
         "duration_mins": row.duration_mins,
         "profile_basal_rate": row.profile_basal_rate}
        for index, row in enumerate(basal, start=1)
    ])


def _meal(day, hour, *, carbs=60.0, insulin=12.0, bg=110.0, ratio=5.0):
    return BolusEvent(t=BASE + timedelta(days=day, hours=hour), insulin=insulin,
                      carbs=carbs, carb_ratio=ratio, bg=bg, completion="Completed")


def case_inputs(events, *, segments=((0, 5.0),), block_id=0, cgm=None, basal=None,
                harm_lows=None, snapshots=None, window=None):
    """One case's analyzer payload, and the store rows its preparation reads."""
    blocks, _ = analyze_ic_blocks_fuzzy(
        events, list(segments), config=IcConfig(), observed_days=90,
        cgm_readings=cgm, isf_effective=ISF, basal_events=basal,
        harm_config=HarmConfig() if harm_lows else None, harm_lows=harm_lows,
        snapshots=snapshots,
        analysis_start=window[0] if window else None,
        analysis_end=window[1] if window else None,
        prior_action_observed_from=BASE if window else None,
    )
    payload = [row.to_dict() for row in blocks]
    block = next(row for row in payload if row["block_id"] == block_id)
    readings = cgm or [
        CgmReading(datetime.fromisoformat(run["t"]) + timedelta(minutes=minute),
                   100 + minute, "synthetic")
        for run in block["evidence"]["runs"] for minute in (-10, 0, 120, 435)
    ]
    return {"ic_blocks": payload}, (events, readings, basal or ())


def _project(events, *, block_id=0, **kwargs):
    analysis, rows = case_inputs(events, block_id=block_id, **kwargs)
    store = Store.open(":memory:")
    seed_store(store, *rows)
    return prepare_ic_block_evidence(store, analysis).project(
        block_id, analysis_generation="ic-block-evidence-fixture:0")


def explained_case():
    """The published case's analyzer payload and store rows, so a test can serve it."""
    return case_inputs(**_explained())


def _settings(segments):
    return PumpSettings(active_idp=1, profiles=(ProfileSettings(
        idp=1, name="Synthetic block evidence profile", dia_min=300,
        carb_entry=True, max_bolus=15.0,
        segments=tuple(ProfileSegment(start, 0.8, int(ISF), ratio, 110)
                       for start, ratio in segments),
    ),))


def _trace(anchor, shape, until=330):
    """Dense five-minute CGM over the meal's own clock and the chain's read."""
    return [CgmReading(anchor + timedelta(minutes=minute), shape(minute), "synthetic")
            for minute in range(-60, until + 1, 5)]


def _ran_high(minute):
    """A rise already under way before the bolus — the late-bolus shape."""
    if minute <= -30:
        return 120.0
    if minute <= 30:
        return 120.0 + 2.0 * (minute + 30)
    if minute <= 150:
        return 360.0 - 2.0 * (minute - 30)
    return 120.0


def _in_range(minute):
    return 120.0


def _spike_then_low(minute):
    """A two-meal chain from its first bolus: rising into it and peaking at 300,
    then a low at +210 while Control-IQ suspends under the second meal."""
    if minute <= -30:
        return 120.0
    if minute <= 30:
        return 120.0 + 3.0 * (minute + 30)
    if minute <= 100:
        return 300.0 - 190.0 * (minute - 30) / 70.0
    if minute <= 195:
        return 110.0
    if minute <= 210:
        return 110.0 - 2.8 * (minute - 195)
    if minute <= 270:
        return 68.0 + 0.7 * (minute - 210)
    return 110.0


def _suspends(anchor, rows=12):
    return [BasalEvent(t=anchor + timedelta(minutes=15 + 5 * step),
                       delivery_type=_CIQ_SUSPEND_TYPE, duration_mins=5,
                       basal_rate=0.0, profile_basal_rate=0.9)
            for step in range(rows)]


def _explained():
    """One block carrying every fact #464 publishes, on both of its blocks.

    Lone morning runs on the current value (half of them meals that spike), two
    pooled morning chains that spike and then print a low attributed to their first
    meal (on separate days), ten runs chained across the midday boundary, one run
    read into a CGM gap, and three runs dosed under the value a snapshot retired
    inside the window.  The first spiking morning meal's own window carries a short
    sensor gap — two store readings with no glucose value, clear of its peak and nadir.
    """
    events, cgm, basal, lows = [], [], [], []
    for day in range(25, 37):
        event = _meal(day, 9, bg=None)
        events.append(event)
        trace = _trace(event.t, _ran_high if day % 2 else _in_range)
        if day == 25:
            gap = {event.t + timedelta(minutes=minute) for minute in (60, 65)}
            trace = [CgmReading(reading.t, None, reading.type) if reading.t in gap
                     else reading for reading in trace]
        cgm.extend(trace)
    for day in (37, 38):
        first = _meal(day, 9, bg=None)
        second = _meal(day, 11, carbs=50.0, insulin=10.0, bg=None)
        events.extend([first, second])
        cgm.extend(_trace(first.t, _spike_then_low, until=450))
        basal.extend(_suspends(second.t))
        lows.append(PrintedLow(t=first.t + timedelta(minutes=210), bg=68.0, iob_u=2.2,
                               arm=HarmArm.IC, dominant_bolus_t=first.t,
                               dominant_bolus_carbs=first.carbs,
                               attribution_reason="meal-bolus"))
    for day in range(40, 50):
        first = _meal(day, 11, carbs=40.0, insulin=8.0, bg=None)
        second = _meal(day, 13, carbs=60.0, insulin=10.0, bg=None, ratio=6.0)
        events.extend([first, second])
        cgm.extend(_trace(first.t, _in_range))
        cgm.extend(_trace(second.t, _ran_high if day % 2 else _in_range))
    events.append(_meal(52, 9, carbs=55.0, insulin=11.0, bg=None))
    for day in range(12, 15):
        event = _meal(day, 9, insulin=10.0, bg=None, ratio=6.0)
        events.append(event)
        cgm.extend(_trace(event.t, _in_range))

    end = BASE + timedelta(days=100)
    snapshots = [Snapshot(BASE, _settings(EARLIER)),
                 Snapshot(BASE + timedelta(days=20), _settings(CURRENT))]
    return {
        "events": events, "segments": CURRENT, "cgm": cgm, "basal": basal,
        "harm_lows": lows, "snapshots": snapshots,
        "window": (end - timedelta(days=90), end),
    }


def payload():
    cross_events = [
        item for day in range(9)
        for item in (_meal(day, 23, bg=110.0), _meal(day + 1, 1, bg=110.0))
    ]
    cross_cgm = [
        CgmReading(event.t + timedelta(minutes=minute), 110, "synthetic")
        for event in cross_events for minute in (290, 295, 300, 305, 310)
    ]
    cross_midnight = _project(cross_events, cgm=cross_cgm,
                              segments=((0, 5.0), (420, 4.0), (1200, 5.0)),
                              block_id=1200)
    events = [_meal(day, 9) for day in range(1, 9)] + [_meal(9, 9, carbs=20, insulin=4,
                                                              bg=300)]
    cgm = [
        CgmReading(event.t + timedelta(minutes=minute),
                   40 if event.insulin == 4 else 110, "synthetic")
        for event in events for minute in (290, 295, 300, 305, 310)
    ]
    directional = _project(events, cgm=cgm)
    below_floor = _project([_meal(day, 9) for day in range(4)])
    rejected_event = _meal(1, 9, carbs=20, insulin=4, bg=300)
    rejected_cgm = [CgmReading(rejected_event.t + timedelta(minutes=minute), 40, "synthetic")
                    for minute in (290, 295, 300, 305, 310)]
    all_rejected = _project([rejected_event], cgm=rejected_cgm)
    return {
        "_generated_by": "scripts/gen_ic_block_evidence_fixtures.py",
        "_note": ("SYNTHETIC. Current I:C blocks and run rosters are production fuzzy "
                  "analyzer output; CGM curves are deterministic invented evidence."),
        "cases": {"cross_midnight": cross_midnight, "directional_only": directional,
                  "below_floor": below_floor, "all_rejected": all_rejected,
                  "explained": _project(**_explained())},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(payload(), indent=1, sort_keys=True) + "\n"
    if args.check:
        if (OUT.read_text() if OUT.exists() else "") != rendered:
            print(f"stale fixture: {OUT} — rerun scripts/gen_ic_block_evidence_fixtures.py")
            return 1
        print(f"I:C block-evidence fixture current ({OUT})")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(rendered)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
