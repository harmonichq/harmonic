"""#463 re-dating spike (triage, 2026-09-24).

The candidate rule: a delivery-detected regime starts at the first observation,
on its first settled day, that carries the regime's own value, instead of that
day's first observation whatever it carries. Both detectors' reductions are
otherwise unchanged. This spike checks, on synthetic stores only:

1. the mid-morning probe from docs/scope/463-record-display.repro.py item 5 is
   dated at the first bolus carrying the new values;
2. every re-dated regime start falls on the same pump day as the old start and
   never before it, on every committed QA case store and a reconciled copy of
   the showcase (the invariant the existing-record rule in ADR 463 relies on);
3. which cases' derived Trial ids the rule moves.

Run from the repo root:
    uv run python docs/scope/463-redate.spike.py
"""
import shutil
import sys
import tempfile
from collections import Counter
from datetime import datetime, timedelta
from typing import Dict, List
from unittest import mock

sys.path.insert(0, ".")
import ciq_autotune.watched_change as wc
from ciq_autotune.epochs import _MIN_EPOCH_DAYS
from ciq_autotune.events import BolusEvent
from ciq_autotune.store import Store
from scripts.qa_e2e_cases import QA_CASES, materialize_case

SHOWCASE = "mockups/qa-e2e.synthetic/harmonic.sqlite"


def dose_regimes(boluses, parameter):
    attr = wc._DOSE_ATTR[parameter]
    obs = sorted(((b.t, getattr(b, attr)) for b in boluses if getattr(b, attr) is not None),
                 key=lambda tv: tv[0])
    by_day: Dict[object, List[float]] = {}
    first: Dict[tuple, datetime] = {}
    for t, v in obs:
        value = round(float(v), 6)
        by_day.setdefault(t.date(), []).append(value)
        first.setdefault((t.date(), value), t)
    days = []
    for day, values in by_day.items():
        rep = max(Counter(values).items(), key=lambda kv: (kv[1], kv[0]))[0]
        days.append((day, rep, first[(day, rep)]))
    days.sort(key=lambda d: d[0])
    return wc._regimes_from_days(wc._settled_days(days, _MIN_EPOCH_DAYS))


def basal_slot_regimes(basal_events, slot_minutes=30):
    evs = sorted((e for e in basal_events if e.profile_basal_rate is not None), key=lambda e: e.t)
    by_slot_day: Dict[tuple, list] = {}
    for e in evs:
        by_slot_day.setdefault(((e.t.hour * 60 + e.t.minute) // slot_minutes, e.t.date()), []).append(e)
    by_slot: Dict[int, list] = {}
    for (s, day), samples in by_slot_day.items():
        rep = max(Counter(round(e.profile_basal_rate, 6) for e in samples).items(), key=lambda kv: (kv[1], kv[0]))[0]
        first = next(e.t for e in samples if round(e.profile_basal_rate, 6) == rep)
        by_slot.setdefault(s, []).append((day, rep, first))
    return {s: wc._regimes_from_days(sorted(days, key=lambda d: d[0])) for s, days in by_slot.items()}


def regime_sets(store, dose, basal):
    bolus, events = store.bolus_events(), store.basal_events()
    out = {(p, None): dose(bolus, p) for p in ("isf", "carb_ratio", "target_bg")}
    out.update({("basal_rate", s): r for s, r in basal(events).items()})
    return out


def trial_ids(store, now):
    return {wc._review_id(t.view, t.block) for t in wc._reviewable_trials(store, now, horizon_start=datetime.min)}


print("1. The mid-morning probe")
day = datetime(2024, 3, 10)
probe = [BolusEvent(t=day + timedelta(days=n, hours=h, minutes=m), description="Bolus", completion="Completed",
                    insulin=4.0, carbs=40, isf=44.0 if (n > 0 or (n == 0 and h >= 10)) else 40.0,
                    carb_ratio=9.0 if (n > 0 or (n == 0 and h >= 10)) else 10.0, target_bg=110.0)
         for n in range(-3, 3) for h, m in ((8, 0), (12, 30), (18, 30))]
for parameter in ("isf", "carb_ratio"):
    print(f"   {parameter}: day rule {wc.dose_regimes(probe, parameter)[-1].start:%Y-%m-%d %H:%M},"
          f" first-new-value rule {dose_regimes(probe, parameter)[-1].start:%Y-%m-%d %H:%M}")

print("2-3. Committed case stores")
moved_cases, violations, total = [], [], 0
with tempfile.TemporaryDirectory() as scratch:
    stores = [("showcase (reconciled copy)", None)] + [(case.name, case) for case in QA_CASES]
    for name, case in stores:
        path = f"{scratch}/{len(moved_cases)}-{total}.sqlite"
        if case is None:
            shutil.copy(SHOWCASE, path)
        with Store.open(path) as store:
            if case is None:
                wc.reconcile_ingested_follow_up(store)
            else:
                materialize_case(store, case)
            total += 1
            old = regime_sets(store, wc.dose_regimes, wc.basal_slot_regimes)
            new = regime_sets(store, dose_regimes, basal_slot_regimes)
            moved = 0
            for key, regimes in old.items():
                for before, after in zip(regimes, new[key]):
                    if before.value != after.value or before.start.date() != after.start.date() or after.start < before.start:
                        violations.append((name, key, before, after))
                    moved += before.start != after.start
            times = ([r.t for r in store.cgm_readings()] + [r.t for r in store.bolus_events()]
                     + [r.t for r in store.basal_events()] + [s.captured_at for s in store.settings_snapshots()])
            if not times:
                continue
            now = max(times)
            ids_old = trial_ids(store, now)
            with mock.patch.object(wc, "dose_regimes", dose_regimes), \
                    mock.patch.object(wc, "basal_slot_regimes", basal_slot_regimes):
                ids_new = trial_ids(store, now)
            if moved or ids_old != ids_new:
                moved_cases.append((name, moved, sorted(ids_old - ids_new), sorted(ids_new - ids_old)))
print(f"   stores checked: {total}; same-day, never-earlier violations: {len(violations)}")
for name, moved, gone, added in moved_cases:
    print(f"   {name}: {moved} regime starts moved; ids gone {gone}; ids new {added}")
if not moved_cases:
    print("   no regime start and no derived Trial id moved on any committed case store")
