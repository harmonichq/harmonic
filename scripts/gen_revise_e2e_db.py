#!/usr/bin/env python3
"""Generate the committed synthetic SQLite store for supervised UI revision.

Every reading, delivery, and dose is manufactured from a fixed seed. The
database is suitable only for local design/replay work: it contains no account,
credential, vendor, pump, or patient source data.

    python3 scripts/gen_revise_e2e_db.py
    python3 scripts/gen_revise_e2e_db.py --check
"""

from __future__ import annotations

import argparse
import math
import random
import sqlite3
import tempfile
from datetime import date, timedelta
from pathlib import Path

from ciq_autotune.settings import (
    ProfileSegment,
    ProfileSettings,
    PumpSettings,
    SleepSchedule,
)
from ciq_autotune.store import Store


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "mockups" / "revise-e2e.synthetic" / "harmonic.sqlite"
GENERATED_BY = "scripts/gen_revise_e2e_db.py"
NOTE = (
    "SYNTHETIC. Fixed-seed glucose, insulin, and settings shapes for supervised "
    "ui-craft revise E2E work. No real pump, patient, credential, or vendor data."
)
SEED = 620
FIRST_DAY = date(2020, 2, 3)
DAY_COUNT = 100
SETTING_CHANGE_OFFSET = 45
PAST_CARB_RATIO = 6.0
CURRENT_CARB_RATIO = 5.6


def _hhmm(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def _glucose(minute: int, rng: random.Random) -> float:
    """One invented daily trace with a low and three post-meal rises."""
    value = 128 + 26 * math.sin((minute - 300) / 1440 * 2 * math.pi)
    for peak, height in ((450, 52), (780, 44), (1140, 60)):
        value += height * math.exp(-(((minute - peak) / 70) ** 2))
    if 60 <= minute <= 240:
        value -= 55 * math.exp(-(((minute - 150) / 60) ** 2))
    return round(max(48, min(310, value + rng.gauss(0, 7))), 1)


def _profile_rate(minute: int) -> float:
    if minute < 420:
        return 0.80
    if minute < 660:
        return 0.95
    if minute < 1080:
        return 0.85
    return 0.90


def _settings(carb_ratio: float) -> PumpSettings:
    profile = ProfileSettings(
        idp=1,
        name="Synthetic profile",
        dia_min=180,
        carb_entry=True,
        max_bolus=10.0,
        segments=tuple(
            ProfileSegment(start, basal, 42, carb_ratio, 110)
            for start, basal in ((0, 0.80), (420, 0.95), (660, 0.85), (1080, 0.90))
        ),
    )
    return PumpSettings(
        active_idp=1,
        profiles=(profile,),
        sleep_schedules=(SleepSchedule(1380, 420, tuple(range(7))),),
    )


def _rows() -> tuple[list[dict], list[dict], list[dict]]:
    rng = random.Random(SEED)
    cgm: list[dict] = []
    basal: list[dict] = []
    boluses: list[dict] = []
    basal_seq = 1
    bolus_seq = 1

    for offset in range(DAY_COUNT):
        current = FIRST_DAY + timedelta(days=offset)
        day = current.isoformat()
        glucose_by_minute = {}
        for minute in range(0, 1440, 5):
            bg = _glucose(minute, rng)
            glucose_by_minute[minute] = bg
            timestamp = f"{day} {_hhmm(minute)}:00"
            cgm.append({
                "EventDateTime": timestamp,
                "Readings (CGM / BGM)": bg,
                "Description": "Synthetic EGV",
            })
            rate = _profile_rate(minute)
            basal.append({
                "seq_num": basal_seq,
                "time": timestamp,
                "delivery_type": (
                    "algorithmDelivery" if bg < 75 or bg > 180 else "profileDelivery"
                ),
                "duration_mins": 5,
                "basal_rate": 0.0 if bg < 75 else rate,
                "profile_basal_rate": rate,
            })
            basal_seq += 1

        carb_ratio = (PAST_CARB_RATIO if offset < SETTING_CHANGE_OFFSET
                      else CURRENT_CARB_RATIO)
        for minute, carbs in (
            (445, 38), (455, 22), (770, 51),
            (1130, 44), (1145, 27), (1150, 19),
        ):
            insulin = round(carbs / carb_ratio, 2)
            boluses.append({
                "seq_num": bolus_seq,
                "request_time": f"{day} {_hhmm(minute)}:00",
                "description": "Synthetic meal bolus",
                "completion": "Completed",
                "insulin": insulin,
                "requested_insulin": insulin,
                "carbs": carbs,
                "bg": glucose_by_minute[minute],
                "user_override": 0,
                "extended_bolus": "0",
                "correction_insulin": 0.0,
                "food_insulin": insulin,
                "pump_iob": 0.0,
                "isf": 42,
                "target_bg": 110,
                "carb_ratio": carb_ratio,
            })
            bolus_seq += 1

    return cgm, basal, boluses


def generate(output: Path) -> None:
    """Replace ``output`` with a complete deterministic synthetic store."""
    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)
    cgm, basal, boluses = _rows()

    with Store.open(str(output)) as store:
        store.upsert_cgm(cgm)
        store.upsert_basal(basal)
        store.upsert_bolus(boluses)
        store.upsert_settings_snapshot(
            f"{FIRST_DAY.isoformat()} 00:00:00", _settings(PAST_CARB_RATIO)
        )
        changed = FIRST_DAY + timedelta(days=SETTING_CHANGE_OFFSET)
        store.upsert_settings_snapshot(
            f"{changed.isoformat()} 00:00:00", _settings(CURRENT_CARB_RATIO)
        )
        with store.conn:
            store.conn.execute(
                "CREATE TABLE synthetic_fixture_provenance ("
                "id INTEGER PRIMARY KEY CHECK (id = 1), "
                "_generated_by TEXT NOT NULL, "
                "_note TEXT NOT NULL, "
                "synthetic INTEGER NOT NULL CHECK (synthetic = 1))"
            )
            store.conn.execute(
                "INSERT INTO synthetic_fixture_provenance "
                "(id, _generated_by, _note, synthetic) VALUES (1, ?, ?, 1)",
                (GENERATED_BY, NOTE),
            )

    # Leave one self-contained file: Store.open selects WAL for live concurrency,
    # while a committed fixture must not depend on untracked sidecars.
    with sqlite3.connect(output) as conn:
        conn.execute("PRAGMA journal_mode = DELETE")
        conn.execute("VACUUM")


def _logical_dump(path: Path) -> str:
    with sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True) as conn:
        return "\n".join(conn.iterdump()) + "\n"


def check(committed: Path) -> bool:
    if not committed.is_file():
        print(f"revise-e2e database: missing committed fixture: {committed}")
        return False
    with tempfile.TemporaryDirectory() as tmp:
        regenerated = Path(tmp) / committed.name
        generate(regenerated)
        expected = _logical_dump(regenerated)
        actual = _logical_dump(committed)
    if actual != expected:
        print(
            "revise-e2e database: committed logical contents differ from the "
            f"generator ({committed})"
        )
        print(f"regenerate with: python3 {GENERATED_BY}")
        return False
    print(f"revise-e2e database: current ({committed})")
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)

    output = args.out.resolve()
    if args.check:
        return 0 if check(output) else 1
    generate(output)
    print(f"wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
