"""Pump settings: the current ISF / I:C / target / DIA / basal schedule, and a
reconstructed change-log for them.

Tandem Source exposes settings as a **current snapshot only** — the
``lastUpload.settings`` blob from ``pump_event_metadata()`` for the active pump
(see ``sync.pull_settings_snapshot``). There is no settings-change *event*: from
Tandem alone you only ever see each profile's *current* ISF/I:C/target, so a past
time is mis-attributed across any in-place edit. We manufacture the missing event
by snapshotting settings append-only on every fetch and diffing successive
snapshots per ``IDP`` (:func:`changelog`) — a forward-only change-log timed to
fetch cadence. Edits before the first snapshot stay invisible (ROADMAP §9).

Units (confirmed live against tconnectsync's own Nightscout parser):

* ``basalRate`` and ``carbRatio`` are **milliunits** — divide by 1000 for U/h and
  g/U. ``isf`` and ``targetBg`` are whole mg/dL. ``insulinDuration`` is minutes.
* ``maxBolus`` is milliunits. ``tDependentSegs`` is zero-padded to 16 entries; a
  segment that is all-zero is a *skip* placeholder, not a real 00:00 segment.

This module is deliberately **dependency-free** — it parses plain dicts and
stdlib ``datetime`` only — so core imports without the ``sync`` extra, exactly
like :mod:`~ciq_autotune.tandemsource_map`.

Note on scale: a retired pump on the same account can report an older firmware
scale (whole units, not milliunits). We only ever snapshot the *active* pump
(``sync`` picks it by ``maxDateWithEvents``), whose firmware uses the milliunit
scale, so the ÷1000 conversion is applied unconditionally.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Sequence, Tuple, Union

# The five per-segment parameters and how each scales from raw to canonical units.
# basal_rate / carb_ratio are milliunits; isf / target_bg are already whole.
_MILLI = 1000.0

# Parameters a per-segment schedule can carry, in the order analyzers read them.
SEGMENT_PARAMETERS = ("basal_rate", "isf", "carb_ratio", "target_bg")


@dataclass(frozen=True)
class ProfileSegment:
    """One time-of-day segment of a profile, in canonical units."""

    start_min: int          # minutes since midnight
    basal_rate: float       # U/h
    isf: int                # mg/dL per unit
    carb_ratio: float       # grams per unit
    target_bg: int          # mg/dL


@dataclass(frozen=True)
class ProfileSettings:
    """One pump profile (one ``IDP``): its segments plus profile-wide settings."""

    idp: int
    name: str
    dia_min: int            # insulin duration, minutes
    carb_entry: bool
    max_bolus: float        # U
    segments: Tuple[ProfileSegment, ...]

    @property
    def dia_hours(self) -> float:
        return self.dia_min / 60.0

    def schedule(self, parameter: str) -> List[Tuple[int, Union[int, float]]]:
        """``[(start_min, value), ...]`` for one parameter, sorted by start."""
        return [(s.start_min, getattr(s, parameter)) for s in self.segments]


# Control-IQ sleep schedule day names -> Python weekday() (Mon=0 .. Sun=6).
_WEEKDAY = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
            "Friday": 4, "Saturday": 5, "Sunday": 6}


@dataclass(frozen=True)
class SleepSchedule:
    """One enabled Control-IQ sleep schedule.

    ``start_min`` / ``end_min`` are minutes since **local** midnight (e.g. 1380 =
    23:00, 540 = 09:00); a window wraps past midnight when ``end_min <= start_min``.
    ``active_days`` are the weekdays the window *begins* on (Mon=0 .. Sun=6).
    """

    start_min: int
    end_min: int
    active_days: Tuple[int, ...]


@dataclass(frozen=True)
class PumpSettings:
    """A full settings snapshot: every profile plus which one is active."""

    active_idp: int
    profiles: Tuple[ProfileSettings, ...]
    sleep_schedules: Tuple[SleepSchedule, ...] = ()

    def by_idp(self, idp: int) -> Optional[ProfileSettings]:
        for p in self.profiles:
            if p.idp == idp:
                return p
        return None

    def active(self) -> Optional[ProfileSettings]:
        return self.by_idp(self.active_idp)

    def active_schedule(self, parameter: str) -> List[Tuple[int, Union[int, float]]]:
        """The active profile's schedule for ``parameter`` — what an analyzer that
        reads ``parameter`` is actually subject to right now."""
        prof = self.active()
        return prof.schedule(parameter) if prof else []


def _is_skip(seg: dict) -> bool:
    """A zero-padded placeholder segment (all five fields zero), not a real one."""
    return (seg.get("startTime", 0) == 0 and seg.get("basalRate", 0) == 0
            and seg.get("isf", 0) == 0 and seg.get("carbRatio", 0) == 0
            and seg.get("targetBg", 0) == 0)


def _parse_segment(seg: dict) -> ProfileSegment:
    return ProfileSegment(
        start_min=int(seg["startTime"]),
        basal_rate=round(seg["basalRate"] / _MILLI, 4),
        isf=int(seg["isf"]),
        carb_ratio=round(seg["carbRatio"] / _MILLI, 4),
        target_bg=int(seg["targetBg"]),
    )


def _parse_profile(p: dict) -> ProfileSettings:
    # BFF uses "timeDependentSegments"; reportsfacade used "tDependentSegs".
    raw_segs = p.get("timeDependentSegments", p.get("tDependentSegs", []))
    segs = tuple(sorted(
        (_parse_segment(s) for s in raw_segs if not _is_skip(s)),
        key=lambda s: s.start_min,
    ))
    return ProfileSettings(
        idp=int(p["idp"]),
        name=p.get("name", ""),
        dia_min=int(p.get("insulinDuration", 0)),
        carb_entry=bool(p.get("carbEntry", 0)),
        max_bolus=round(p.get("maxBolus", 0) / _MILLI, 4),
        segments=segs,
    )


def parse_sleep_schedules(raw: dict) -> Tuple[SleepSchedule, ...]:
    """Enabled Control-IQ sleep schedules from a raw ``lastUpload.settings`` dict.

    Reads the ``controlIqSettings.sleepSchedule0..N`` blocks, keeping only those
    that are ``enabled`` with a non-empty ``activeDays`` (a disabled or day-less
    schedule paints no band). Times are minutes since local midnight, verbatim.
    """
    ciq = raw.get("controlIqSettings", raw.get("controlIQSettings", {})) or {}
    out: List[SleepSchedule] = []
    for key in sorted(k for k in ciq if k.startswith("sleepSchedule")):
        s = ciq[key] or {}
        if not s.get("enabled"):
            continue
        days = tuple(_WEEKDAY[d] for d in s.get("activeDays", []) if d in _WEEKDAY)
        if not days:
            continue
        out.append(SleepSchedule(
            start_min=int(s["startTime"]), end_min=int(s["endTime"]), active_days=days,
        ))
    return tuple(out)


def parse_pump_settings(raw: dict) -> PumpSettings:
    """Parse a raw ``lastUpload.settings`` dict into typed, unit-correct settings.

    ``raw`` is the ``settings`` object from a pump's ``lastUpload`` (see
    :func:`~ciq_autotune.sync.pull_settings_snapshot`). Extra top-level keys we
    don't model (pumpProperties, ...) are ignored; ``controlIqSettings`` feeds the
    sleep schedules.
    """
    profiles_blob = raw.get("profiles", {})
    profiles = tuple(_parse_profile(p) for p in profiles_blob.get("profile", []))
    return PumpSettings(
        active_idp=int(profiles_blob.get("activeIdp", -1)),
        profiles=profiles,
        sleep_schedules=parse_sleep_schedules(raw),
    )


# --- snapshot diff: the manufactured settings-change event --------------------


@dataclass(frozen=True)
class Snapshot:
    """One append-only settings capture (``profile_settings`` rows for one fetch)."""

    captured_at: datetime
    settings: PumpSettings


@dataclass(frozen=True)
class SettingChange:
    """A reconstructed change event: ``parameter`` for ``idp`` moved at ``at``.

    For per-segment parameters, ``old_schedule`` / ``new_schedule`` are the
    ``[(start_min, value)]`` schedules either side. For ``parameter == "active_idp"``
    they are the old/new active IDP integers (a profile switch).
    """

    at: datetime
    idp: int                 # -1 for an active_idp switch (account-wide)
    parameter: str
    old_schedule: object
    new_schedule: object


def changelog(snapshots: List[Snapshot]) -> List[SettingChange]:
    """Diff successive snapshots into a forward-only change-log.

    For each consecutive pair, emit a :class:`SettingChange` for every per-segment
    parameter whose schedule moved on a given ``IDP`` (an in-place edit Tandem
    never logged), plus one for an ``active_idp`` switch. Timed to capture cadence:
    a change is dated to the *later* snapshot, since that is when we first observed
    it. Snapshots are processed in chronological order regardless of input order.
    """
    snaps = sorted(snapshots, key=lambda s: s.captured_at)
    changes: List[SettingChange] = []
    for prev, cur in zip(snaps, snaps[1:]):
        if prev.settings.active_idp != cur.settings.active_idp:
            changes.append(SettingChange(
                at=cur.captured_at, idp=-1, parameter="active_idp",
                old_schedule=prev.settings.active_idp,
                new_schedule=cur.settings.active_idp,
            ))
        for prof in cur.settings.profiles:
            before = prev.settings.by_idp(prof.idp)
            if before is None:
                continue  # profile new this snapshot; nothing to diff against
            for param in SEGMENT_PARAMETERS:
                old = before.schedule(param)
                new = prof.schedule(param)
                if old != new:
                    changes.append(SettingChange(
                        at=cur.captured_at, idp=prof.idp, parameter=param,
                        old_schedule=old, new_schedule=new,
                    ))
    return changes


# --- profile-vs-profile diff (attributing a profile switch) ------------------
#
# When the user duplicates a profile, edits one thing, and switches to it, the
# outgoing and incoming profiles both live in the post-switch snapshot. Diffing
# them says *what* the switch changed — one parameter (a targeted change) or
# several (a genuine whole-profile switch). Segment boundaries differ between
# profiles, so both schedules are resampled onto a common 30-min grid and
# compared per slot (#331).

_SLOT_MINUTES = 30
_SLOTS_PER_DAY = 24 * 60 // _SLOT_MINUTES


@dataclass(frozen=True)
class ParameterDiff:
    """One parameter that moved between two profiles.

    ``before`` / ``after`` carry the changed value pair when the parameter moved
    uniformly (a single old→new pair across every changed slot); they are ``None``
    for a non-uniform change (different slots moved to different values). ``slot`` is
    the first changed slot's label unless the change spans the whole day — a
    whole-schedule edit (e.g. ISF all day) carries ``slot=None``, matching a
    same-IDP in-place edit.
    """

    parameter: str
    before: Optional[float]
    after: Optional[float]
    slot: Optional[str]


def _slot_label(slot: int) -> str:
    m = slot * _SLOT_MINUTES
    return f"{m // 60:02d}:{m % 60:02d}"


def resample_schedule(schedule: List[Tuple[int, Union[int, float]]]) -> List[Union[int, float]]:
    """The value in force at each 30-min slot across the day (48 slots).

    ``schedule`` is ``[(start_min, value)]``; the value at a slot is the last
    segment whose ``start_min`` is at or before it (a schedule wraps, so a slot
    before the first segment takes the final segment's value).
    """
    sched = sorted(schedule)
    if not sched:
        return [None] * _SLOTS_PER_DAY
    grid: List[Union[int, float]] = []
    for i in range(_SLOTS_PER_DAY):
        t = i * _SLOT_MINUTES
        val = sched[-1][1]
        for start, v in sched:
            if start <= t:
                val = v
            else:
                break
        grid.append(val)
    return grid


def diff_profiles(old: ProfileSettings, new: ProfileSettings) -> List[ParameterDiff]:
    """Which of :data:`SEGMENT_PARAMETERS` differ between two profiles.

    One :class:`ParameterDiff` per changed parameter, resampled onto a common
    30-min grid so profiles with different segment boundaries compare per slot. A
    whole-day change is ONE changed parameter (not many changed slots), so callers
    that count changed parameters see it as a single-setting switch (#331).
    """
    diffs: List[ParameterDiff] = []
    for param in SEGMENT_PARAMETERS:
        old_grid = resample_schedule(old.schedule(param))
        new_grid = resample_schedule(new.schedule(param))
        changed = [i for i in range(_SLOTS_PER_DAY) if old_grid[i] != new_grid[i]]
        if not changed:
            continue
        pairs = {(old_grid[i], new_grid[i]) for i in changed}
        if len(pairs) == 1:
            b, a = next(iter(pairs))
            before, after = float(b), float(a)
        else:
            before, after = None, None
        whole_day = len(changed) == _SLOTS_PER_DAY
        diffs.append(ParameterDiff(
            parameter=param, before=before, after=after,
            slot=None if whole_day else _slot_label(changed[0]),
        ))
    return diffs


# --- The effective-settings read -------------------------------------------
#
# "Which single ISF / I:C is in force over this window?" One place, called by
# both orchestrators (analyze.py, scenario/engine.py). Pure and store-free: it
# reads the latest snapshot's active schedule and the ISF analyzer's rows.


def active_schedule(
    snaps: List[Snapshot], parameter: str
) -> List[Tuple[int, float]]:
    """The latest snapshot's active-profile schedule for ``parameter``.

    ``[(start_min, value)]`` from the newest snapshot; empty when there are no
    snapshots. Values are coerced to ``float``.
    """
    if not snaps:
        return []
    return [(s, float(v)) for s, v in snaps[-1].settings.active_schedule(parameter)]


def effective_isf(isf_rows: Sequence, snaps: List[Snapshot]) -> Optional[float]:
    """A single representative ISF (mg/dL per U) in force over the window.

    Prefer the *measured* fasting ISF the ISF analyzer produced (a single value
    now — ADR 0001); fall back to the median programmed ISF; ``None`` when
    nothing is known. Callers use it to turn a settled-BG error into insulin
    units, so one day-representative value suffices.
    """
    if isf_rows and isf_rows[0].estimate.value is not None:
        return float(isf_rows[0].estimate.value)
    programmed = [v for _, v in active_schedule(snaps, "isf")]
    return float(statistics.median(programmed)) if programmed else None


def programmed_ic_range(snaps: List[Snapshot]) -> Optional[Tuple[float, float]]:
    """The active profile's programmed I:C bounds, or ``None`` without a schedule.

    I:C is a timed setting. Its minimum and maximum are real programmed values;
    collapsing the schedule to a median can invent a ratio that never applies.
    """
    ic_sched = [v for _, v in active_schedule(snaps, "carb_ratio")]
    return (float(min(ic_sched)), float(max(ic_sched))) if ic_sched else None
