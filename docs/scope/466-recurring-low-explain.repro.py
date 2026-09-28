"""#466 reproduction: what a recurring-lows basal slot serves about its lows.

Synthetic data only. Run from the repository root:

    uv run python docs/scope/466-recurring-low-explain.repro.py
    uv run python docs/scope/466-recurring-low-explain.repro.py --row   # the served 03:00 row, JSON
    uv run python docs/scope/466-recurring-low-explain.repro.py --case  # the case-store spike

`docs/scope/466-slot-panel.repro.mjs` renders that served row through the desk's
slot panel.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ciq_autotune.analyzers.basal import analyze_basal  # noqa: E402
from ciq_autotune.events import BasalEvent, CgmReading  # noqa: E402
from ciq_autotune.harm import HarmConfig  # noqa: E402

BASE = datetime(2022, 6, 1)


def _steady(day, hour, minute, rate, programmed=0.60):
    t0 = BASE + timedelta(days=day, hours=hour, minutes=minute)
    basal = [BasalEvent(t=t0, delivery_type="algorithmDelivery", duration_mins=30,
                        basal_rate=rate, profile_basal_rate=programmed)]
    cgm = [CgmReading(t=t0 + timedelta(minutes=5 * k), bg=120.0, type="EGV")
           for k in range(7)]
    return basal, cgm


def _low(day, hour, minute):
    t0 = BASE + timedelta(days=day, hours=hour, minutes=minute)
    return [CgmReading(t=t0 + timedelta(minutes=5 * k), bg=50.0, type="EGV")
            for k in range(3)]


def _slot(slots, label):
    return next(s for s in slots if s.label == label)


def spread_probe():
    """30 steady nights either side of a programmed 0.60 at 03:00, lows on two."""
    basal, cgm = [], []
    rates = [0.45] * 14 + [0.54] * 2 + [0.66] * 14
    for day, rate in enumerate(rates):
        b, c = _steady(day, 3, 0, rate)
        basal += b
        cgm += c
    for day in (40, 41):
        cgm += _low(day, 3, 0)
    return _slot(analyze_basal(basal, cgm, [], [], harm_config=HarmConfig()), "03:00")


def band_probe():
    """One low at 03:00 on one night and one at 04:00 on another."""
    basal, cgm = [], []
    for day in range(12):
        for hour in (3, 4):
            b, c = _steady(day, hour, 0, 0.50)
            basal += b
            cgm += c
    cgm += _low(40, 3, 0) + _low(41, 4, 0)
    slots = analyze_basal(basal, cgm, [], [], harm_config=HarmConfig())
    return _slot(slots, "03:00"), _slot(slots, "04:00")


def epoch_probe():
    """03:00's rate edited on day 30; band lows two nights before it, one after."""
    basal, cgm = [], []
    for day in range(12):
        b, c = _steady(day, 4, 0, 0.50)
        basal += b
        cgm += c
    cgm += _low(20, 3, 0) + _low(21, 4, 0) + _low(40, 3, 0)
    slots = analyze_basal(basal, cgm, [], [], harm_config=HarmConfig(),
                          slot_starts={6: BASE + timedelta(days=30, hours=3)})
    return _slot(slots, "03:00")


def case_spike():
    """The manufactured spread case, through the store and `analyze()`.

    The QA basal recipe's shape (`_materialize_basal_coverage`) with one rate per
    informative night instead of one rate for all of them: 14 nights at 0.45,
    2 at 0.54, 14 at 0.66 against the default programmed 0.60, and its two
    recurring lows at 03:00.
    """
    import tempfile
    from unittest import mock

    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
    import qa_e2e_cases as cases
    from ciq_autotune.analyze import analyze
    from ciq_autotune.store import Store

    rates = iter([0.45] * 14 + [0.54] * 2 + [0.66] * 14)
    real_upsert = Store.upsert_basal

    def per_night(store, rows):
        rows = [dict(row, basal_rate=next(rates)) if row["seq_num"] < 30_000 else row
                for row in rows]
        return real_upsert(store, rows)

    with tempfile.TemporaryDirectory() as scratch:
        db = str(Path(scratch) / "case.sqlite")
        with Store.open(db) as store, mock.patch.object(Store, "upsert_basal", per_night):
            cases._materialize_basal_coverage(store, clean_rate=0.0, recurring_lows=True)
        with Store.open_readonly(db) as store:
            analysis = analyze(store, window_days=cases.WINDOW_DAYS,
                               pool_agreeing_basal_regimes=True,
                               carb_entries=store.carb_entries(),
                               prompt_responses=store.prompt_responses())
    s = next(row for row in analysis.basal if row.label == "03:00")
    e = s.estimate
    h = s.evidence["harm"]
    print("4. The spread case through the store and analyze()")
    print(f"   status {s.status.value!r}, asserts_move {s.asserts_move}, recommended {s.recommended}, "
          f"estimate {e.value} interval {e.lo}-{e.hi}, current {s.current}")
    print(f"   nudged {h['nudged']}, band_nights {h['band_nights']}, lows {len(h['lows'])}")


def main():
    if "--case" in sys.argv:
        case_spike()
        return
    if "--row" in sys.argv:
        print(json.dumps(spread_probe().to_dict()))
        return
    s = spread_probe()
    e = s.estimate
    spans = e.lo is not None and e.hi is not None and e.lo <= s.current <= e.hi
    print("1. 30 steady nights either side of a programmed 0.60 at 03:00, lows at 03:00 on two nights")
    print(f"   status {s.status.value!r}, asserts_move {s.asserts_move}, recommended {s.recommended}")
    print(f"   estimate {e.value} interval {e.lo}-{e.hi}; interval contains current: {spans}")
    harm = s.evidence["harm"]
    print(f"   evidence.harm keys: {sorted(harm)}")
    print(f"   served lows: {[(low['t'], low['bg']) for low in harm['lows']]}")
    print(f"   excluded_night_count {s.evidence['excluded_night_count']}, "
          f"roster nights {len(s.evidence['night_roster'])}")

    a, b = band_probe()
    print("2. One low at 03:00 on one night, one at 04:00 on another")
    for row in (a, b):
        h = row.evidence["harm"]
        print(f"   {row.label}: status {row.status.value!r}, nudged {h['nudged']}, "
              f"slot_nights {h['slot_nights']}, band_nights {h['band_nights']}, "
              f"lows {len(h['lows'])}")

    c = epoch_probe()
    h = c.evidence["harm"]
    print("3. 03:00 edited mid-window, band lows on two nights before the edit and one after")
    print(f"   03:00: status {c.status.value!r}, nudged {h['nudged']}, "
          f"band_nights {h['band_nights']} (bar 2), no served count of the nights the nudge counted")


if __name__ == "__main__":
    main()
