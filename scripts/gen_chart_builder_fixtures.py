#!/usr/bin/env python3
"""Generate the frontend's chart-builder fixtures (#728).

``analysis.json`` and ``daily.day.json`` carried the owner's real captured data —
31 real dates of basal evidence, a real day's CGM/bolus/basal/pump history
(``"insulin": 5.5299997``, a float32 artifact off a real pump). Neither carried a
provenance marker. Both are now invented inputs on the real schema, produced by
running the real analyzers and endpoint builders, never hand-written: they come
from one synthetic ``Store`` — a month of 5-minute basal/CGM plus three meals a
day — fed through the real :func:`~ciq_autotune.analyze.analyze` facade and the
real :func:`~ciq_autotune.timeline.timeline` endpoint builder, exactly as
``/analyze`` and ``/timeline`` do. Both fixtures keep only the same top-level
keys the pre-existing (real-data) fixtures carried — the schema the two consumer
tests read.

ADR 416 retired v1, and with it the only reader of this generator's third output,
``episode.carb-undercount.json``. The fixture and the scenario-engine episode that
produced it retire together; the engine's own attribution stays covered by
``tests/test_scenario_engine.py``.

Every invented date is in 2024 — before the cutover's 2025-07-01 real-capture
span, so the structural contamination scan's date rule passes them silently.

Synthetic only: invented inputs on the real schema, no patient data anywhere
near it.

    python3 scripts/gen_chart_builder_fixtures.py         # rewrites the fixtures in place
    python3 scripts/gen_chart_builder_fixtures.py --check  # CI-style drift check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from datetime import datetime, timedelta
from typing import List

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from ciq_autotune.analyze import analyze  # noqa: E402
from ciq_autotune.analyzers.classifiers.context_gate import CIQ_SUSPEND_TYPE  # noqa: E402
from ciq_autotune.settings import parse_pump_settings  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402
from ciq_autotune.timeline import timeline as build_timeline  # noqa: E402

FIXTURES = pathlib.Path(__file__).resolve().parents[1] / "frontend" / "__fixtures__"
ANALYSIS_OUT = FIXTURES / "analysis.json"
DAY_OUT = FIXTURES / "daily.day.json"

_FMT = "%Y-%m-%d %H:%M:%S"
_NOTE = ("SYNTHETIC. Produced by running the real analyzers and endpoint "
         "builders on invented inputs — never hand-written or captured from "
         "real data. Regenerate with `python3 scripts/gen_chart_builder_fixtures.py`.")

# --- the invented month ------------------------------------------------------
# 2024 is well before the cutover's real-capture span (2025-07-01 -> open), so
# every date below is out of span and passes the structural scan silently.
STORE_START = datetime(2024, 3, 1, 0, 0, 0)
STORE_DAYS = 34
WINDOW_DAYS = 30
NOW = STORE_START + timedelta(days=STORE_DAYS)
# The day `frontend/chart-builders.test.js` pins its `DAY` constant to — the
# last full day in the store, mirroring the real fixture's DAY sitting at the
# end of its 30-day capture.
DAY = "2024-04-02"

# (start_min, basal_rate U/h, isf mg/dL/U, carb_ratio g/U, target_bg)
_SCHEDULE = [
    (0, 0.60, 40, 5.0, 110),
    (360, 0.75, 38, 4.5, 110),
    (720, 0.65, 35, 5.5, 110),
    (1080, 0.70, 42, 5.0, 110),
]
_SLEEP_START_MIN = 1380  # 23:00
_SLEEP_END_MIN = 420     # 07:00 next day


def _rate_at(minute_of_day: int) -> float:
    rate = _SCHEDULE[0][1]
    for start, r, *_rest in _SCHEDULE:
        if start <= minute_of_day:
            rate = r
        else:
            break
    return rate


def _carb_ratio_at(minute_of_day: int) -> float:
    cr = _SCHEDULE[0][3]
    for start, _r, _isf, ratio, _tbg in _SCHEDULE:
        if start <= minute_of_day:
            cr = ratio
        else:
            break
    return cr


def _raw_settings() -> dict:
    pad = [{"startTime": 0, "basalRate": 0, "isf": 0, "carbRatio": 0, "targetBg": 0}
           ] * (16 - len(_SCHEDULE))
    segs = [{"startTime": s, "basalRate": int(round(r * 1000)), "isf": isf,
             "carbRatio": int(round(cr * 1000)), "targetBg": tbg}
            for s, r, isf, cr, tbg in _SCHEDULE]
    return {
        "profiles": {"activeIdp": 1, "profile": [
            {"name": "Everyday", "idp": 1, "insulinDuration": 300, "carbEntry": 1,
             "maxBolus": 15000, "tDependentSegs": segs + pad},
        ]},
        "controlIqSettings": {
            "sleepSchedule0": {
                "enabled": True, "startTime": _SLEEP_START_MIN, "endTime": _SLEEP_END_MIN,
                "activeDays": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
                               "Friday", "Saturday"],
            },
        },
        "cgmSettings": {},
    }


def _seq(t: datetime) -> int:
    return int(t.strftime("%Y%m%d%H%M%S"))


# --- the main month-long store: feeds both analyze() and timeline() ---------

def _build_main_store() -> Store:
    """A month of clean basal/CGM/meals, plus one day's suspend + exercise.

    Delivered basal tracks the programmed schedule exactly on every clean
    night except a small deterministic day-of-month wobble (so the bootstrap
    estimate isn't degenerately equal to `current` everywhere, same as real
    Control-IQ variance) — deterministic, not random, so the fixture is
    byte-reproducible. `DAY` alone carries two Control-IQ defensive-suspend
    runs (for the frontend's suspend-ribbon contract, #82) and one Exercise
    event spanning past midnight (for the clipped-ribbon contract, #394).
    """
    store = Store.open(":memory:")
    day_dt = datetime.strptime(DAY, "%Y-%m-%d")

    basal_rows: List[dict] = []
    cgm_rows: List[dict] = []
    bolus_rows: List[dict] = []

    t = STORE_START
    end = STORE_START + timedelta(days=STORE_DAYS)
    day_index = 0
    while t < end:
        minute_of_day = t.hour * 60 + t.minute
        programmed = _rate_at(minute_of_day)
        wobble = 0.02 * ((t.day % 5) - 2)  # deterministic +/-0.04 U/h spread
        delivered = round(max(0.0, programmed + wobble), 3)
        delivery_type = "algorithmDelivery"

        is_day = t.strftime("%Y-%m-%d") == DAY
        if is_day and t.hour == 2 and 0 <= t.minute < 20:
            delivery_type = CIQ_SUSPEND_TYPE
            delivered = 0.0
        elif is_day and t.hour == 15 and 0 <= t.minute < 15:
            delivery_type = CIQ_SUSPEND_TYPE
            delivered = 0.0

        basal_rows.append({
            "seq_num": _seq(t), "time": t.strftime(_FMT),
            "delivery_type": delivery_type, "duration_mins": 5,
            "basal_rate": delivered, "profile_basal_rate": programmed,
        })
        cgm_rows.append({
            "EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
            "Readings (CGM / BGM)": 120.0, "Description": "EGV",
        })
        t += timedelta(minutes=5)
        day_index += 1

    # Three well-covered meals a day (breakfast/lunch/dinner) — dosed at the
    # programmed I:C, so they stay isolated clean-window boundaries rather than
    # runaway excursions. A modest post-meal glucose bump, back to baseline
    # inside two hours, keeps the day realistic without poisoning the night's
    # clean-window count.
    meal_defs = [(8, 0, 35.0), (12, 30, 45.0), (18, 30, 50.0)]
    for d in range(STORE_DAYS):
        base = STORE_START + timedelta(days=d)
        for hour, minute, carbs in meal_defs:
            mt = base.replace(hour=hour, minute=minute)
            minute_of_day = hour * 60 + minute
            ratio = _carb_ratio_at(minute_of_day)
            dose = round(carbs / ratio, 2)
            bolus_rows.append({
                "seq_num": _seq(mt) + 1, "request_time": mt.strftime(_FMT),
                "description": "Bolus", "completion": "Completed",
                "insulin": dose, "carbs": carbs, "carb_ratio": ratio,
            })
            # A gentle post-meal rise and return, overwriting the flat baseline
            # for the next 100 minutes (20 x 5-min steps).
            bump_t = mt
            for k in range(21):
                bg = 120.0 + 55.0 * (k / 10.0 if k <= 10 else (20 - k) / 10.0)
                cgm_rows.append({
                    "EventDateTime": bump_t.strftime("%Y-%m-%dT%H:%M:%S"),
                    "Readings (CGM / BGM)": round(bg, 1), "Description": "EGV",
                })
                bump_t += timedelta(minutes=5)

    store.upsert_basal(basal_rows)
    store.upsert_cgm(cgm_rows)
    store.upsert_bolus(bolus_rows)
    store.upsert_pump([{
        "seq_num": _seq(day_dt.replace(hour=23, minute=30)),
        "time": day_dt.replace(hour=23, minute=30).strftime(_FMT),
        "event_type": "Exercise", "duration_mins": 60,
    }])
    store.upsert_settings_snapshot(
        (STORE_START + timedelta(days=1)).strftime(_FMT),
        parse_pump_settings(_raw_settings()))
    return store


def analysis_payload(store: Store) -> dict:
    result = analyze(store, window_days=WINDOW_DAYS, now=NOW).to_dict()
    return {
        "_generated_by": "scripts/gen_chart_builder_fixtures.py",
        "_note": _NOTE,
        "basal": result["basal"],
        "isf": result["isf"],
        "ic": result["ic"],
    }


def day_payload(store: Store) -> dict:
    start = datetime.strptime(DAY, "%Y-%m-%d")
    end = start + timedelta(days=1)
    full = build_timeline(store, start, end)
    return {
        "_generated_by": "scripts/gen_chart_builder_fixtures.py",
        "_note": _NOTE,
        "cgm": full["cgm"],
        "boluses": full["boluses"],
        "basal": full["basal"],
        "pump_events": full["pump_events"],
        "sleep_windows": full["sleep_windows"],
    }


def _write(path: pathlib.Path, data: dict) -> str:
    return json.dumps(data, indent=1, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="fail if any committed fixture is stale")
    args = ap.parse_args()

    store = _build_main_store()
    try:
        outputs = {
            ANALYSIS_OUT: _write(ANALYSIS_OUT, analysis_payload(store)),
            DAY_OUT: _write(DAY_OUT, day_payload(store)),
        }
    finally:
        store.close()

    if args.check:
        stale = []
        for path, text in outputs.items():
            current = path.read_text() if path.exists() else ""
            if current != text:
                stale.append(path)
        if stale:
            for path in stale:
                print(f"stale fixture: {path} — rerun scripts/gen_chart_builder_fixtures.py")
            return 1
        print(f"chart-builder fixtures current ({', '.join(str(p) for p in outputs)})")
        return 0

    for path, text in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
