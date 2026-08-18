#!/usr/bin/env python3
"""Price ADR 364's localized-outcome candidates against a read-only snapshot.

This is intentionally a grounding tool, not the reusable gate engine tracked by
issue #365.  It fixes each candidate's observation unit and confound probes in one
auditable place, then emits either human-readable evidence or JSON.  Stored ``t``
values are pump-local wall clock and are parsed without timezone conversion.
"""

from __future__ import annotations

import argparse
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import date, datetime, time, timedelta
import json
import math
from pathlib import Path
import sqlite3
import statistics
import sys
from typing import Iterable, Optional, Sequence


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ciq_autotune.insulin import iob_fraction  # noqa: E402

# The gate math is owned by the sweep engine now (#378); this reference tool re-imports
# it so its six hand candidates are priced through the *identical* primitives the
# generated grammar uses — the six stay the regression bed with byte-identical verdicts
# (adr-365-swept-candidate-space §3).
from ciq_autotune.pattern_sweep import (  # noqa: E402
    fisher_exact_two_sided as _fisher_exact_two_sided,
    newcombe_risk_difference_ci as _newcombe_risk_difference_ci,
    wilson_score_interval as _wilson_score_interval,
)


LOW = 70.0
HIGH = 250.0
MIN_BLOCK_COVERAGE = 0.5  # half of the expected five-minute readings
SITE_CLUSTER = timedelta(minutes=5)
SUSPEND_CLUSTER = timedelta(hours=3)
ACCOUNTING_PEAK_MIN = 75.0
ACCOUNTING_DIA_MIN = 300.0
HIGH_IOB_UNITS = 1.0


@dataclass(frozen=True)
class Cgm:
    t: datetime
    bg: float


@dataclass(frozen=True)
class Bolus:
    t: datetime
    insulin: float
    carbs: float


@dataclass(frozen=True)
class Pump:
    t: datetime
    event_type: str


@dataclass(frozen=True)
class CarbLogEntry:
    t: datetime


@dataclass(frozen=True)
class Gate:
    passed: bool
    evidence: str


class Snapshot:
    def __init__(
        self,
        cgm: Sequence[Cgm],
        bolus: Sequence[Bolus],
        pump: Sequence[Pump],
        carb_log: Sequence[CarbLogEntry],
    ):
        self.cgm = sorted(cgm, key=lambda row: row.t)
        self.bolus = sorted(bolus, key=lambda row: row.t)
        self.pump = sorted(pump, key=lambda row: row.t)
        self.carb_log = sorted(carb_log, key=lambda row: row.t)
        self.cgm_times = [row.t for row in self.cgm]
        self.bolus_times = [row.t for row in self.bolus]
        self.by_day: dict[date, list[Cgm]] = defaultdict(list)
        for row in self.cgm:
            self.by_day[row.t.date()].append(row)
        self.observed_days = sorted(self.by_day)
        cut = len(self.observed_days) // 2
        self.halves = (set(self.observed_days[:cut]), set(self.observed_days[cut:]))

    def readings(self, start: datetime, end: datetime) -> list[Cgm]:
        lo = bisect_left(self.cgm_times, start)
        hi = bisect_left(self.cgm_times, end)
        return self.cgm[lo:hi]

    def boluses(self, start: datetime, end: datetime) -> list[Bolus]:
        lo = bisect_left(self.bolus_times, start)
        hi = bisect_right(self.bolus_times, end)
        return self.bolus[lo:hi]

    def iob_at(self, at: datetime) -> float:
        start = at - timedelta(minutes=ACCOUNTING_DIA_MIN)
        return sum(
            row.insulin
            * iob_fraction(
                (at - row.t).total_seconds() / 60.0,
                ACCOUNTING_PEAK_MIN,
                ACCOUNTING_DIA_MIN,
            )
            for row in self.boluses(start, at)
            if row.insulin > 0
        )

    def unexplained(self, at: datetime) -> bool:
        recent = self.boluses(at - timedelta(minutes=ACCOUNTING_DIA_MIN), at)
        if any(row.carbs > 0 and at - row.t <= timedelta(hours=4) for row in recent):
            return False
        return self.iob_at(at) <= HIGH_IOB_UNITS


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("T", " "))


def load_snapshot(path: Path) -> Snapshot:
    # ``mode=ro`` sees a snapshot's copied WAL when one is present.  ``immutable``
    # would silently ignore that WAL and under-count the newest rows.
    uri = path.resolve().as_uri() + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        cgm = [
            Cgm(_parse(t), float(bg))
            for t, bg in conn.execute(
                "SELECT t, bg FROM cgm_readings WHERE bg IS NOT NULL ORDER BY t"
            )
        ]
        bolus = [
            Bolus(_parse(t), float(insulin or 0), float(carbs or 0))
            for t, insulin, carbs in conn.execute(
                "SELECT t, insulin, carbs FROM bolus_events ORDER BY t"
            )
        ]
        pump = [
            Pump(_parse(t), event_type)
            for t, event_type in conn.execute(
                "SELECT t, event_type FROM pump_events ORDER BY t"
            )
        ]
        carb_log = [
            CarbLogEntry(_parse(t))
            for t, in conn.execute("SELECT t FROM carb_entries ORDER BY t")
        ]
    finally:
        conn.close()
    if not cgm:
        raise ValueError("snapshot contains no CGM readings")
    return Snapshot(cgm, bolus, pump, carb_log)


def _pct(n: int, d: int) -> float:
    return 100.0 * n / d if d else 0.0


def _rate(n: int, d: int) -> float:
    return n / d if d else 0.0


def _fmt_rate(n: int, d: int) -> str:
    return f"{n}/{d} ({_pct(n, d):.1f}%)"


def _median(values: Iterable[float]) -> Optional[float]:
    vals = list(values)
    return statistics.median(vals) if vals else None


def _f(value: Optional[float], digits: int = 1) -> float:
    return round(value or 0.0, digits)


def _day_rows(snapshot: Snapshot, day: date, start_hour: int, end_hour: int) -> list[Cgm]:
    start = datetime.combine(day, time()) + timedelta(hours=start_hour)
    end = datetime.combine(day, time()) + timedelta(hours=end_hour)
    return snapshot.readings(start, end)


def _eligible_days(snapshot: Snapshot, start_hour: int, end_hour: int) -> set[date]:
    expected = (end_hour - start_hour) * 12
    minimum = math.ceil(expected * MIN_BLOCK_COVERAGE)
    return {
        day
        for day in snapshot.observed_days
        if len(_day_rows(snapshot, day, start_hour, end_hour)) >= minimum
    }


def _low_days(snapshot: Snapshot, start_hour: int = 0, end_hour: int = 24) -> set[date]:
    return {
        day
        for day in snapshot.observed_days
        if any(row.bg < LOW for row in _day_rows(snapshot, day, start_hour, end_hour))
    }


def _half_counts(days: set[date], eligible: set[date], halves: Sequence[set[date]]) -> list[dict]:
    return [
        {"events": len(days & half & eligible), "n": len(half & eligible)}
        for half in halves
    ]


def _clusters(times: Iterable[datetime], gap: timedelta) -> list[list[datetime]]:
    groups: list[list[datetime]] = []
    for at in sorted(times):
        if not groups or at - groups[-1][-1] > gap:
            groups.append([at])
        else:
            groups[-1].append(at)
    return groups


def _candidate(
    ident: str,
    title: str,
    effective_n: int,
    effect: str,
    numbers: dict,
    signal: Gate,
    gates: dict[str, Gate],
    wording: Optional[str] = None,
) -> dict:
    survived = signal.passed and all(gate.passed for gate in gates.values())
    return {
        "id": ident,
        "title": title,
        "effective_n": effective_n,
        "effect": effect,
        "numbers": numbers,
        "day_level_signal": asdict(signal),
        "gates": {name: asdict(gate) for name, gate in gates.items()},
        "verdict": "survived" if survived else "died",
        "card_wording": wording if survived else None,
    }


def overnight_low_clustering(snapshot: Snapshot) -> dict:
    eligible = _eligible_days(snapshot, 2, 5)
    low_days = _low_days(snapshot, 2, 5) & eligible
    low_readings = [row for row in snapshot.cgm if 2 <= row.t.hour < 5 and row.bg < LOW]
    hourly = Counter(row.t.hour for row in snapshot.cgm if row.bg < LOW)

    late_meal_days: set[date] = set()
    for row in snapshot.bolus:
        if row.carbs <= 0:
            continue
        if row.t.hour >= 20:
            late_meal_days.add(row.t.date() + timedelta(days=1))
        elif row.t.hour < 2:
            late_meal_days.add(row.t.date())
    clean, selected = eligible - late_meal_days, eligible & late_meal_days
    clean_lows, selected_lows = low_days & clean, low_days & selected

    comparison_rates = []
    for start in (5, 8, 11, 14, 17, 20):
        comp_eligible = _eligible_days(snapshot, start, start + 3)
        comp_lows = _low_days(snapshot, start, start + 3) & comp_eligible
        if comp_eligible:
            comparison_rates.append(len(comp_lows) / len(comp_eligible))
    other_rate = statistics.mean(comparison_rates) if comparison_rates else 0.0
    target_rate = _rate(len(low_days), len(eligible))
    clock_signal = bool(low_days) and target_rate >= other_rate * 1.25
    halves = _half_counts(low_days, eligible, snapshot.halves)
    half_rates = [_rate(row["events"], row["n"]) for row in halves if row["n"]]

    selection_pass = (
        not selected
        or _rate(len(selected_lows), len(selected))
        - _rate(len(clean_lows), len(clean))
        <= 0.10
    )
    carryover_pass = not clean or _rate(len(clean_lows), len(clean)) >= target_rate * 0.5
    stability_pass = len(half_rates) == 2 and min(half_rates) >= max(half_rates) * 0.6
    return _candidate(
        "overnight-low-clustering",
        "Overnight low clustering, 02:00–05:00",
        len(eligible),
        f"{_fmt_rate(len(low_days), len(eligible))} eligible days carried a low; "
        f"04h contributed {hourly[4]} low readings.",
        {
            "low_days": len(low_days),
            "eligible_days": len(eligible),
            "low_readings": len(low_readings),
            "hourly_low_readings_00_06": {str(hour): hourly[hour] for hour in range(7)},
            "clean_handoff": {"events": len(clean_lows), "n": len(clean)},
            "late_meal_handoff": {"events": len(selected_lows), "n": len(selected)},
            "other_three_hour_block_mean_pct": _f(other_rate * 100),
            "halves": halves,
        },
        Gate(clock_signal, f"02:00–05:00 was {target_rate*100:.1f}% versus {other_rate*100:.1f}% across other three-hour blocks."),
        {
            "selection": Gate(selection_pass, f"Nights with a 20:00–02:00 carb-bearing bolus were {_fmt_rate(len(selected_lows), len(selected))}; nights without one were {_fmt_rate(len(clean_lows), len(clean))}."),
            "carryover": Gate(carryover_pass, f"After a clean 20:00–02:00 handoff, only {_fmt_rate(len(clean_lows), len(clean))} retained the clock-window low."),
            "time_of_day_balance": Gate(clock_signal, f"The day-level clock-window rate was {target_rate*100:.1f}%, versus a {other_rate*100:.1f}% mean across non-overlapping comparison blocks."),
            "stability": Gate(stability_pass, f"Window halves were " + " and ".join(_fmt_rate(row['events'], row['n']) for row in halves) + "."),
        },
        "Lows clustered between 2 and 5 a.m. on {low_days} of {eligible_days} observed days.",
    )


def sunday_lows(snapshot: Snapshot) -> dict:
    low_days = _low_days(snapshot)
    sundays = {day for day in snapshot.observed_days if day.weekday() == 6}
    others = set(snapshot.observed_days) - sundays
    sun_lows, other_lows = low_days & sundays, low_days & others
    sun_readings = [row for row in snapshot.cgm if row.t.weekday() == 6]
    other_readings = [row for row in snapshot.cgm if row.t.weekday() != 6]
    reading_ratio = _rate(sum(row.bg < LOW for row in sun_readings), len(sun_readings)) / max(
        _rate(sum(row.bg < LOW for row in other_readings), len(other_readings)), 1e-12
    )
    day_ratio = _rate(len(sun_lows), len(sundays)) / max(_rate(len(other_lows), len(others)), 1e-12)

    prior_evening_late: set[date] = set()
    for row in snapshot.bolus:
        if row.t.hour >= 20 and row.carbs > 0:
            prior_evening_late.add(row.t.date() + timedelta(days=1))
    selected_sun, clean_sun = sundays & prior_evening_late, sundays - prior_evening_late
    selected_other, clean_other = others & prior_evening_late, others - prior_evening_late

    post_handoff_sun = _low_days(snapshot, 6, 24) & sundays
    post_handoff_other = _low_days(snapshot, 6, 24) & others
    block_excesses = []
    block_numbers = []
    for start in (0, 6, 12, 18):
        block_lows = _low_days(snapshot, start, start + 6)
        a, b = len(block_lows & sundays), len(block_lows & others)
        block_excesses.append(_rate(a, len(sundays)) > _rate(b, len(others)))
        block_numbers.append({"start_hour": start, "sunday": a, "other": b})

    halves = []
    diffs = []
    for half in snapshot.halves:
        hs, ho = sundays & half, others & half
        a, b = len(low_days & hs), len(low_days & ho)
        halves.append({"sunday_events": a, "sunday_n": len(hs), "other_events": b, "other_n": len(ho)})
        diffs.append(_rate(a, len(hs)) - _rate(b, len(ho)))
    diff, ci_lo, ci_hi = _newcombe_risk_difference_ci(
        len(sun_lows), len(sundays), len(other_lows), len(others)
    )
    fisher_p = _fisher_exact_two_sided(
        len(sun_lows), len(sundays), len(other_lows), len(others)
    )
    wording = (
        f"Sundays carried a low on {len(sun_lows)} of {len(sundays)} observed days "
        f"({_pct(len(sun_lows), len(sundays)):.0f}%), compared with {len(other_lows)} "
        f"of {len(others)} other days ({_pct(len(other_lows), len(others)):.0f}%)."
    )
    return _candidate(
        "sunday-lows",
        "Sunday lows",
        len(sundays),
        f"{_fmt_rate(len(sun_lows), len(sundays))} Sundays versus {_fmt_rate(len(other_lows), len(others))} other days (risk ratio {day_ratio:.2f}×).",
        {
            "sunday": {"events": len(sun_lows), "n": len(sundays)},
            "other_days": {"events": len(other_lows), "n": len(others)},
            "reading_level_ratio": _f(reading_ratio, 2),
            "day_level_ratio": _f(day_ratio, 2),
            "risk_difference_pct": _f(diff * 100),
            "risk_difference_newcombe_95ci_pct": [
                _f(ci_lo * 100),
                _f(ci_hi * 100),
            ],
            "fisher_exact_two_sided_p": _f(fisher_p, 4),
            "prior_evening_late_meal": {
                "sunday_events": len(sun_lows & selected_sun),
                "sunday_n": len(selected_sun),
                "other_events": len(other_lows & selected_other),
                "other_n": len(selected_other),
            },
            "clean_prior_evening": {
                "sunday_events": len(sun_lows & clean_sun),
                "sunday_n": len(clean_sun),
                "other_events": len(other_lows & clean_other),
                "other_n": len(clean_other),
            },
            "post_06": {"sunday_events": len(post_handoff_sun), "sunday_n": len(sundays), "other_events": len(post_handoff_other), "other_n": len(others)},
            "six_hour_blocks": block_numbers,
            "halves": halves,
        },
        Gate(
            ci_lo > 0 and fisher_p < 0.05,
            f"The day-level excess was {diff*100:+.1f} points (Newcombe/Wilson 95% CI {ci_lo*100:+.1f} to {ci_hi*100:+.1f}; two-sided Fisher exact p={fisher_p:.3f}).",
        ),
        {
            "selection": Gate(
                (not selected_sun or not selected_other or _rate(len(sun_lows & selected_sun), len(selected_sun)) > _rate(len(other_lows & selected_other), len(selected_other)))
                and (not clean_sun or not clean_other or _rate(len(sun_lows & clean_sun), len(clean_sun)) > _rate(len(other_lows & clean_other), len(clean_other))),
                f"After a prior-evening late meal, Sundays were {_fmt_rate(len(sun_lows & selected_sun), len(selected_sun))} versus {_fmt_rate(len(other_lows & selected_other), len(selected_other))} other days; clean handoffs were {_fmt_rate(len(sun_lows & clean_sun), len(clean_sun))} versus {_fmt_rate(len(other_lows & clean_other), len(clean_other))}.",
            ),
            "carryover": Gate(_rate(len(post_handoff_sun), len(sundays)) > _rate(len(post_handoff_other), len(others)), f"After removing 00:00–06:00, Sundays remained {_fmt_rate(len(post_handoff_sun), len(sundays))} versus {_fmt_rate(len(post_handoff_other), len(others))}."),
            "time_of_day_balance": Gate(sum(block_excesses) >= 2, f"Sunday exceeded other days in {sum(block_excesses)} of four six-hour blocks, including afternoon and evening."),
            "stability": Gate(len(diffs) == 2 and min(diffs) > 0, "Half-window Sunday excesses were " + " and ".join(f"{value*100:+.1f} points" for value in diffs) + "."),
        },
        wording,
    )


def late_evening_meals(snapshot: Snapshot) -> dict:
    eligible_nights = _eligible_days(snapshot, 0, 6)
    eligible_evenings = {day - timedelta(days=1) for day in eligible_nights}
    late: dict[date, list[Bolus]] = defaultdict(list)
    for row in snapshot.bolus:
        if row.t.hour >= 20 and row.carbs > 0:
            late[row.t.date()].append(row)
    exposed = set(late) & eligible_evenings
    unexposed = eligible_evenings - exposed
    overnight_lows = _low_days(snapshot, 0, 6)
    exposed_out = {day for day in exposed if day + timedelta(days=1) in overnight_lows}
    unexposed_out = {day for day in unexposed if day + timedelta(days=1) in overnight_lows}

    after_dia = 0
    for evening in exposed_out:
        last_meal = max(row.t for row in late[evening])
        first_low = min(
            row.t
            for row in _day_rows(snapshot, evening + timedelta(days=1), 0, 6)
            if row.bg < LOW
        )
        if first_low - last_meal >= timedelta(minutes=ACCOUNTING_DIA_MIN):
            after_dia += 1

    late_meals = [row for rows in late.values() for row in rows]
    early_meals = [row for row in snapshot.bolus if row.carbs > 0 and row.t.hour < 20]
    late_grams = _median(row.carbs for row in late_meals) or 0.0
    early_grams = _median(row.carbs for row in early_meals) or 0.0

    halves = []
    diffs = []
    for half in snapshot.halves:
        eh = {day for day in exposed if day + timedelta(days=1) in half}
        uh = {day for day in unexposed if day + timedelta(days=1) in half}
        ae = len(exposed_out & eh)
        au = len(unexposed_out & uh)
        halves.append({"late_events": ae, "late_n": len(eh), "no_late_events": au, "no_late_n": len(uh)})
        diffs.append(_rate(ae, len(eh)) - _rate(au, len(uh)))

    exposed_rate = _rate(len(exposed_out), len(exposed))
    unexposed_rate = _rate(len(unexposed_out), len(unexposed))
    return _candidate(
        "late-evening-meals",
        "Late-evening meals preceding 00:00–06:00 lows",
        len(exposed),
        f"Late meals preceded a 00:00–06:00 low on {_fmt_rate(len(exposed_out), len(exposed))} evenings, versus {_fmt_rate(len(unexposed_out), len(unexposed))} without a late meal.",
        {
            "late_meal": {"events": len(exposed_out), "n": len(exposed)},
            "no_late_meal": {"events": len(unexposed_out), "n": len(unexposed)},
            "first_low_after_5h": after_dia,
            "median_late_meal_grams": _f(late_grams),
            "median_earlier_meal_grams": _f(early_grams),
            "halves": halves,
        },
        Gate(exposed_rate > unexposed_rate, f"The day-level excess was {(exposed_rate-unexposed_rate)*100:+.1f} points."),
        {
            "selection": Gate(not early_grams or late_grams <= early_grams * 1.25, f"Late meals were not larger: median {late_grams:.0f} g versus {early_grams:.0f} g earlier meals."),
            "carryover": Gate(not exposed_out or after_dia / len(exposed_out) >= 0.25, f"{after_dia}/{len(exposed_out)} exposed low-nights first crossed low after the five-hour bolus DIA."),
            "time_of_day_balance": Gate(True, f"Both arms used the identical 00:00–06:00 outcome window and required ≥50% CGM coverage ({len(exposed)+len(unexposed)} nights)."),
            "stability": Gate(len(diffs) == 2 and min(diffs) >= 0.05, "Half-window excesses were " + " and ".join(f"{value*100:+.1f} points" for value in diffs) + "."),
        },
        "A late-evening meal preceded a 00:00–06:00 low on {events} of {n} observed nights.",
    )


def post_low_rebound(snapshot: Snapshot) -> dict:
    low_by_day = {
        day: [row for row in rows if row.bg < LOW]
        for day, rows in snapshot.by_day.items()
        if any(row.bg < LOW for row in rows)
    }
    rebound_days: set[date] = set()
    observed_treatment_days: set[date] = set()
    manual_treatment_days: set[date] = set()
    first_low_hour: dict[date, int] = {}
    for day, lows in low_by_day.items():
        first_low_hour[day] = lows[0].t.hour
        for low in lows:
            highs = [row for row in snapshot.readings(low.t, low.t + timedelta(hours=3)) if row.bg > HIGH]
            if not highs:
                continue
            rebound_days.add(day)
            first_high = highs[0].t
            if any(row.carbs > 0 for row in snapshot.boluses(low.t, first_high)):
                observed_treatment_days.add(day)
            if any(low.t < row.t <= first_high for row in snapshot.carb_log):
                observed_treatment_days.add(day)
                manual_treatment_days.add(day)
            break

    # One time-matched block per non-low control day.  Each control day borrows the
    # first-low hour from its nearest observed low-day, so the denominator remains
    # independent days rather than many overlapping blocks from the same day.
    control_pool = set(snapshot.observed_days) - set(low_by_day)
    controls: dict[date, bool] = {}
    for other in control_pool:
        nearest_low_day = min(
            low_by_day,
            key=lambda low_day: (abs((low_day - other).days), low_day),
        )
        hour = first_low_hour[nearest_low_day]
        control_start = datetime.combine(other, time(hour))
        rows = snapshot.readings(control_start, control_start + timedelta(hours=3))
        if len(rows) >= 18:
            controls[other] = any(row.bg > HIGH for row in rows)

    halves = _half_counts(rebound_days, set(low_by_day), snapshot.halves)
    half_rates = [_rate(row["events"], row["n"]) for row in halves if row["n"]]
    rebound_rate = _rate(len(rebound_days), len(low_by_day))
    control_highs = sum(controls.values())
    control_rate = _rate(control_highs, len(controls))
    clean_rebounds = len(rebound_days - observed_treatment_days)
    stability = len(half_rates) == 2 and min(half_rates) >= max(half_rates) * 0.5
    return _candidate(
        "post-low-rebound",
        "Post-low rebound above 250 mg/dL",
        len(low_by_day),
        f"{_fmt_rate(len(rebound_days), len(low_by_day))} low-days reached >250 within three hours; time-matched non-low control days were {_fmt_rate(control_highs, len(controls))}.",
        {
            "rebound_days": len(rebound_days),
            "low_days": len(low_by_day),
            "matched_control_highs": control_highs,
            "matched_control_n": len(controls),
            "observed_treatment_rebounds": len(observed_treatment_days),
            "manual_carb_treatment_rebounds": len(manual_treatment_days),
            "manual_carb_log_entries_available": len(snapshot.carb_log),
            "halves": halves,
        },
        Gate(rebound_rate > control_rate, f"The rebound rate was {rebound_rate*100:.1f}% versus a {control_rate*100:.1f}% time-matched base rate."),
        {
            "selection": Gate(len(observed_treatment_days) <= len(rebound_days) / 2, f"{len(observed_treatment_days)}/{len(rebound_days)} rebound days had an observed carb-bearing bolus or manual Carb log entry before the high; older rescue carbs are not logged."),
            "carryover": Gate(clean_rebounds >= max(3, math.ceil(len(rebound_days) * 0.75)), f"Only {clean_rebounds}/{len(rebound_days)} rebound days remained after observed treatment carryover was removed."),
            "time_of_day_balance": Gate(rebound_rate > control_rate, f"One same-hour block per non-low control day reached >250 on {_fmt_rate(control_highs, len(controls))} days."),
            "stability": Gate(stability, f"Window halves were " + " and ".join(_fmt_rate(row['events'], row['n']) for row in halves) + "."),
        },
        "After a low, glucose reached above 250 mg/dL within three hours on {events} of {n} low-days.",
    )


def user_suspend_clusters(snapshot: Snapshot) -> dict:
    raw = [row.t for row in snapshot.pump if row.event_type == "User Suspended"]
    clusters = _clusters(raw, SUSPEND_CLUSTER)
    site_times = [row.t for row in snapshot.pump if row.event_type == "Site/Cartridge Change"]
    rows = []
    for cluster in clusters:
        post = snapshot.readings(cluster[-1], cluster[-1] + timedelta(hours=3))
        if len(post) < 18:  # ≥50% of the expected five-minute follow-up rows
            continue
        near_site = any(
            abs((suspend - site).total_seconds()) <= 30 * 60
            for suspend in cluster
            for site in site_times
        )
        rows.append({
            "start": cluster[0],
            "near_site": near_site,
            "low": any(row.bg < LOW for row in post),
            "high": any(row.bg > HIGH for row in post),
        })
    selected = [row for row in rows if row["near_site"]]
    clean = [row for row in rows if not row["near_site"]]
    hour_counts = Counter(at.hour for at in raw)
    afternoon = lambda row: 15 <= row["start"].hour < 24
    all_afternoon = _rate(sum(afternoon(row) for row in rows), len(rows))
    clean_afternoon = _rate(sum(afternoon(row) for row in clean), len(clean))

    halves = []
    high_rates = []
    low_rates = []
    afternoon_rates = []
    for half in snapshot.halves:
        part = [row for row in rows if row["start"].date() in half]
        highs = sum(row["high"] for row in part)
        lows = sum(row["low"] for row in part)
        halves.append({"clusters": len(part), "highs": highs, "lows": lows})
        if part:
            high_rates.append(highs / len(part))
            low_rates.append(lows / len(part))
            afternoon_rates.append(sum(afternoon(row) for row in part) / len(part))
    selected_high = _rate(sum(row["high"] for row in selected), len(selected))
    clean_high = _rate(sum(row["high"] for row in clean), len(clean))
    selection_pass = not selected or len(selected) / len(rows) < 0.4 or selected_high < clean_high * 1.5
    stability = (
        len(high_rates) == len(low_rates) == len(afternoon_rates) == 2
        and max(high_rates) - min(high_rates) <= 0.10
        and max(low_rates) - min(low_rates) <= 0.10
        and max(afternoon_rates) - min(afternoon_rates) <= 0.10
    )
    return _candidate(
        "user-suspend-clusters",
        "User-suspend clusters and what follows",
        len(rows),
        f"{len(raw)} events collapsed to {len(clusters)} clusters ({len(rows)} with follow-up); {sum(row['high'] for row in rows)} highs and {sum(row['low'] for row in rows)} lows followed within three hours.",
        {
            "raw_events": len(raw),
            "clusters": len(clusters),
            "clusters_with_followup": len(rows),
            "post_highs": sum(row["high"] for row in rows),
            "post_lows": sum(row["low"] for row in rows),
            "hour_counts": {str(hour): hour_counts[hour] for hour in sorted(hour_counts)},
            "within_30m_site_change": len(selected),
            "near_site_highs": sum(row["high"] for row in selected),
            "clean_highs": sum(row["high"] for row in clean),
            "clean_n": len(clean),
            "halves": halves,
        },
        Gate(len(rows) >= 20 and all_afternoon > 0.6, f"{sum(afternoon(row) for row in rows)}/{len(rows)} clusters began from 15:00 onward; 22h alone had {hour_counts[22]} raw events."),
        {
            "selection": Gate(selection_pass, f"{len(selected)}/{len(rows)} clusters were within 30 minutes of a site change; highs followed {_fmt_rate(sum(row['high'] for row in selected), len(selected))} near changes versus {_fmt_rate(sum(row['high'] for row in clean), len(clean))} otherwise."),
            "carryover": Gate(clean_high >= selected_high * 0.75, f"After a clean handoff away from site-change work, the high rate fell from {selected_high*100:.1f}% to {clean_high*100:.1f}%."),
            "time_of_day_balance": Gate(abs(all_afternoon-clean_afternoon) <= 0.10, f"15:00–24:00 held {all_afternoon*100:.1f}% of all clusters and {clean_afternoon*100:.1f}% after site-change clusters were removed."),
            "stability": Gate(stability, "Half-window high/low/15:00–24:00 rates were " + " and ".join(f"{high_rates[i]*100:.1f}%/{low_rates[i]*100:.1f}%/{afternoon_rates[i]*100:.1f}%" for i in range(len(high_rates))) + "."),
        },
        "User suspends clustered in the afternoon and evening; {highs} highs and {lows} lows followed within three hours.",
    )


def reactive_site_changes(snapshot: Snapshot) -> dict:
    raw_times = [row.t for row in snapshot.pump if row.event_type == "Site/Cartridge Change"]
    changes = [group[0] for group in _clusters(raw_times, SITE_CLUSTER)]
    lives = list(zip(changes, changes[1:]))
    life_days = [(end - start).total_seconds() / 86400.0 for start, end in lives]

    def values(start: datetime, end: datetime, clean: bool) -> list[Cgm]:
        rows = snapshot.readings(start, end)
        return [row for row in rows if not clean or snapshot.unexplained(row.t)]

    def eligible_lives(clean: bool) -> list[dict]:
        out = []
        for start, end in lives:
            duration = (end - start).total_seconds() / 86400.0
            if not 1 <= duration <= 7:
                continue
            midpoint = start + (end - start) / 2
            baseline = values(midpoint - timedelta(hours=12), midpoint + timedelta(hours=12), clean)
            final = values(end - timedelta(hours=24), end, clean)
            if len(baseline) < 12 or len(final) < 12:
                continue
            delta = statistics.median(row.bg for row in final) - statistics.median(row.bg for row in baseline)
            clock_deltas = []
            for hour in range(24):
                before = [row.bg for row in baseline if row.t.hour == hour]
                after = [row.bg for row in final if row.t.hour == hour]
                if len(before) >= 2 and len(after) >= 2:
                    clock_deltas.append(statistics.median(after) - statistics.median(before))
            out.append({
                "end": end,
                "delta": delta,
                "clock_delta": _median(clock_deltas),
            })
        return out

    naive = eligible_lives(False)
    clean = eligible_lives(True)
    naive_median = _median(row["delta"] for row in naive) or 0.0
    clean_median = _median(row["delta"] for row in clean) or 0.0
    clock_median = _median(row["clock_delta"] for row in clean if row["clock_delta"] is not None) or 0.0
    naive_high = sum(row["delta"] > 10 for row in naive)
    clean_high = sum(row["delta"] > 10 for row in clean)

    carryover_rows = []
    for start, end in lives:
        duration = (end - start).total_seconds() / 86400.0
        if not 1 <= duration <= 7:
            continue
        midpoint = start + (end - start) / 2
        baseline = values(
            midpoint - timedelta(hours=12), midpoint + timedelta(hours=12), True
        )
        early_final = values(
            end - timedelta(hours=24), end - timedelta(hours=6), True
        )
        late_final = values(end - timedelta(hours=6), end, True)
        if min(len(baseline), len(early_final), len(late_final)) < 6:
            continue
        baseline_median = statistics.median(row.bg for row in baseline)
        carryover_rows.append({
            "early_delta": statistics.median(row.bg for row in early_final)
            - baseline_median,
            "late_delta": statistics.median(row.bg for row in late_final)
            - baseline_median,
        })
    early_carry = _median(row["early_delta"] for row in carryover_rows) or 0.0
    late_carry = _median(row["late_delta"] for row in carryover_rows) or 0.0
    carryover_pass = (
        bool(carryover_rows)
        and abs(late_carry - early_carry) <= 5
        and _rate(sum(row["early_delta"] > 10 for row in carryover_rows), len(carryover_rows))
        >= _rate(sum(row["late_delta"] > 10 for row in carryover_rows), len(carryover_rows)) * 0.75
    )

    split_day = snapshot.observed_days[len(snapshot.observed_days) // 2]
    halves = []
    half_medians = []
    for predicate in (lambda row: row["end"].date() < split_day, lambda row: row["end"].date() >= split_day):
        part = [row for row in clean if predicate(row)]
        med = _median(row["delta"] for row in part) or 0.0
        halves.append({"over_10": sum(row["delta"] > 10 for row in part), "n": len(part), "median_delta": _f(med)})
        half_medians.append(med)

    selection_pass = abs(clean_median - naive_median) <= 5 and _rate(clean_high, len(clean)) >= _rate(naive_high, len(naive)) * 0.75
    stability = len(half_medians) == 2 and half_medians[0] > 0 and half_medians[1] > 0
    median_life = _median(life_days) or 0.0
    return _candidate(
        "reactive-site-changes",
        "Reactive site changes",
        len(clean),
        f"{len(raw_times)} rows collapsed to {len(changes)} changes (median life {median_life:.2f} d); clean final windows ran >+10 mg/dL on {_fmt_rate(clean_high, len(clean))} lives.",
        {
            "raw_rows": len(raw_times),
            "distinct_changes": len(changes),
            "median_life_days": _f(median_life, 2),
            "naive_over_10": naive_high,
            "naive_n": len(naive),
            "naive_median_delta": _f(naive_median),
            "clean_over_10": clean_high,
            "clean_n": len(clean),
            "clean_median_delta": _f(clean_median),
            "clock_matched_median_delta": _f(clock_median),
            "carryover": {
                "n": len(carryover_rows),
                "prior_18h_median_delta": _f(early_carry),
                "final_6h_median_delta": _f(late_carry),
                "prior_18h_over_10": sum(
                    row["early_delta"] > 10 for row in carryover_rows
                ),
                "final_6h_over_10": sum(
                    row["late_delta"] > 10 for row in carryover_rows
                ),
            },
            "halves": halves,
        },
        Gate(clean_median > 10 and _rate(clean_high, len(clean)) > 0.5, f"After post-meal and >{HIGH_IOB_UNITS:.0f} U IOB exclusions, the median shift was {clean_median:+.1f} mg/dL and {_fmt_rate(clean_high, len(clean))} exceeded +10."),
        {
            "selection": Gate(selection_pass, f"The current-snapshot raw comparison was {_fmt_rate(naive_high, len(naive))} with median {naive_median:+.1f}; unexplained windows fell to {_fmt_rate(clean_high, len(clean))} and {clean_median:+.1f}."),
            "carryover": Gate(carryover_pass, f"Across {len(carryover_rows)} lives with clean coverage in both subwindows, the prior 18 h and final 6 h shifted {early_carry:+.1f} and {late_carry:+.1f} mg/dL; >+10 counts were {sum(row['early_delta'] > 10 for row in carryover_rows)}/{len(carryover_rows)} and {sum(row['late_delta'] > 10 for row in carryover_rows)}/{len(carryover_rows)}."),
            "time_of_day_balance": Gate(abs(clock_median-clean_median) <= 5, f"Matching baseline and final readings by wall-clock hour gave a median shift of {clock_median:+.1f} mg/dL."),
            "stability": Gate(stability, "Clean half-window median shifts were " + " and ".join(f"{value:+.1f} mg/dL" for value in half_medians) + "."),
        },
        "A sustained unexplained high ended in a site change on {events} of {n} observed site lives.",
    )


def analyze(snapshot: Snapshot) -> dict:
    candidates = [
        overnight_low_clustering(snapshot),
        sunday_lows(snapshot),
        late_evening_meals(snapshot),
        post_low_rebound(snapshot),
        user_suspend_clusters(snapshot),
        reactive_site_changes(snapshot),
    ]
    return {
        "snapshot": {
            "cgm_readings": len(snapshot.cgm),
            "observed_days": len(snapshot.observed_days),
            "first_day": snapshot.observed_days[0].isoformat(),
            "last_day": snapshot.observed_days[-1].isoformat(),
            "half_1_days": len(snapshot.halves[0]),
            "half_2_days": len(snapshot.halves[1]),
        },
        "survivors": [row["id"] for row in candidates if row["verdict"] == "survived"],
        "killed": [row["id"] for row in candidates if row["verdict"] == "died"],
        "candidates": candidates,
    }


def render(report: dict) -> str:
    snap = report["snapshot"]
    lines = [
        "ADR 364 localized-outcome grounding",
        f"Snapshot: {snap['cgm_readings']} CGM readings across {snap['observed_days']} observed days ({snap['first_day']} to {snap['last_day']})",
        f"Survivors: {', '.join(report['survivors']) or 'none'}",
        "",
    ]
    for row in report["candidates"]:
        lines.extend([
            f"{row['title']} — {row['verdict'].upper()}",
            f"  Effect (effective n={row['effective_n']}): {row['effect']}",
            f"  day-level signal: {'PASS' if row['day_level_signal']['passed'] else 'FAIL'} — {row['day_level_signal']['evidence']}",
        ])
        for name in ("selection", "carryover", "time_of_day_balance", "stability"):
            gate = row["gates"][name]
            lines.append(f"  {name.replace('_', '-')}: {'PASS' if gate['passed'] else 'FAIL'} — {gate['evidence']}")
        if row["card_wording"]:
            lines.append(f"  Card: {row['card_wording']}")
        lines.append("")
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        type=Path,
        default=ROOT / "tconnect-data" / "ciq.db",
        help="local database snapshot (opened immutable/read-only)",
    )
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args(argv)
    if not args.db.is_file():
        parser.error(f"database not found: {args.db}; pass --db, or run a fetch first")
    report = analyze(load_snapshot(args.db))
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(render(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
