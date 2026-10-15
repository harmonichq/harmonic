"""Trial + Focus — the single active *watched change* on the outcomes trend (#244).

Trial candidates are detected from programmed settings and retained with their
first observation, comparison context and immutable ending. Focus is pinned by
hand. One transactional reconciliation owns admission for every consumer (#387).

**At most one watched change is active at a time — Trial XOR Focus, pump wins**
(ADR 0029): a Focus pin is rejected while a Trial is live, and a setting change
detected mid-Focus *preempts and drops* the Focus. So the outcomes payload exposes a
**single** active watched-change object, never two lists.

The target metric a Trial foregrounds is inferred from the changed parameter + slot
and always selects an **existing** series of the CLI trend, ``summarize_trend``
(ADR 0028 §4 — never invent a metric; ``/api/outcomes/trend`` serves only the
watched change, #447): basal→``tbr``, ISF→``tir``, I:C→``arc``, target→``tir``, a
whole-profile / untargeted edit→overall (``tir`` + ``arc``). A Trial never carries a
lever — the "inherited from a Diagnose lever" branch is cut (ADR 0029 §3).

Dependency-light: reuses the ``epochs`` change-point reductions and the scenario
lever taxonomy; the ``OVERRIDE_*`` copy is imported lazily to avoid an import cycle
with ``outcomes_trend`` (which calls into this module).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from functools import cached_property
from typing import Dict, List, Optional

from .epochs import _DOSE_ATTR, _MIN_EPOCH_DAYS, _settled_days
from .analyzers.meals import group_meals
from .analyzers.scenario.levers import (
    Exposure,
    Lever,
    exposure as lever_exposure,
    title as lever_title,
)
from .store import wall_clock_now
from .trial_evidence import trial_breakdown

_DT_FMT = "%Y-%m-%d %H:%M:%S"

# The changed parameter → the existing trend series its before/after is read off
# (ADR 0028 §4). Every value here is a series the CLI trend (``summarize_trend``)
# already emits (``tir``/``tbr`` in ``metrics``, ``arc`` the top-level arc object).
_TARGET_METRIC: Dict[str, List[str]] = {
    "basal_rate": ["tbr"],
    "isf": ["tir"],
    "carb_ratio": ["arc"],
    "target_bg": ["tir"],
}
# A whole-profile switch or untargeted raw edit has no single target — overall
# TIR + the post-meal arc (CONTEXT.md "Trial"; ADR 0029 §3).
_PROFILE_TARGET = ["tir", "arc"]
# The settings whose targeted pump change owns its changed time block as its
# identity and cohort: a carb-ratio block (#581, ADR 500) and a basal block
# (#506), each measured across the block rather than at its starting slot.
_BLOCK_SCOPED = ("carb_ratio", "basal_rate")

# A Trial's maturing window is a fixed backend fact — 14 days of target-metric
# data-days — never a caller's trend or analysis window (#18): the dock and the
# Trial roster (``/api/verify/trials``) that Changes reads must report the same
# maturity for the same change no matter what window the surface was tiled at.
TRIAL_WINDOW_DAYS = 14
_MATURE_WINDOW = timedelta(days=TRIAL_WINDOW_DAYS)

# A Trial stays foregrounded through its maturing and review windows.
# Reconciliation records expiry at this horizon; comparison bounds are separate.
_WATCH_MULT = 2
_WATCH_HORIZON = timedelta(days=TRIAL_WINDOW_DAYS * _WATCH_MULT)

# Two parameters that move within this span of each other read as one whole-profile
# switch, not two independent single-knob edits (the dense basal feed and the
# dose-stamped ISF/IC land a change on slightly different instants for one switch).
_PROFILE_TOLERANCE = timedelta(days=1)

# A plan-apply this close to a detected change corroborates it as deliberate.
_APPLY_TOLERANCE = timedelta(days=3)
# Changed parameter → the plan-item ``type`` an apply would carry (target has none).
_PLAN_TYPE = {"basal_rate": "basal", "isf": "isf", "carb_ratio": "ic"}


# --- regime extraction (the ordered value history of one parameter) --------


@dataclass(frozen=True)
class Regime:
    """One settled stretch of a parameter at a constant ``value``, starting ``start``.

    ``start`` is the first observation carrying this value on the run's first day, so
    a change made mid-day is dated when the new value was first seen (ADR 463). The
    day is the one ``epochs``' change walk picks; ``epochs`` itself still places its
    change point at that day's first observation. The regime list is the value
    history the Trial's change-point and revert rule read off.

    ``legacy_start`` is that day's first observation whatever it carried: the
    instant the dating before ADR 463 gave this regime, which a record saved then
    still carries (ADR 463 decision 5).
    """

    start: datetime
    value: float
    legacy_start: datetime


def _regimes_from_days(days: List[tuple]) -> List[Regime]:
    """Collapse ``[(day, rep_value, first_time, day_first_time)]`` (ascending) into
    value regimes.

    Consecutive days at the same representative value are one regime; the regime's
    ``start`` is the run's first day's ``first_time``, which each caller gives as
    that day's first observation carrying ``rep_value``, and its ``legacy_start``
    that day's first observation of any value. A day given without the fourth
    element (the #463 triage spike) is its own legacy start. This is the same
    value history ``epochs``' newest→oldest change walk reads, exposed as a list.
    """
    regimes: List[Regime] = []
    for _, value, first_t, *day_first in days:
        if not regimes or regimes[-1].value != value:
            regimes.append(Regime(start=first_t, value=value,
                                  legacy_start=day_first[0] if day_first else first_t))
    return regimes


def dose_regimes(boluses, parameter: str) -> List[Regime]:
    """The value history of ``parameter`` from the pump's dose-stamped settings (#159).

    Mirrors :func:`ciq_autotune.epochs.dose_setting_epoch`'s reduction — collapse each
    observed day to the mode of its dose-stamped values, debounce single-day
    excursions (``_MIN_EPOCH_DAYS``) — but returns the whole settled-regime list
    rather than only the latest change-point, so the Trial can see the value *before*
    the previous change (the revert rule) and the parameter's before/after values.
    """
    attr = _DOSE_ATTR[parameter]
    obs = sorted(((b.t, getattr(b, attr)) for b in boluses if getattr(b, attr) is not None),
                 key=lambda tv: tv[0])
    if not obs:
        return []
    by_day: Dict[object, List[float]] = {}
    first_t: Dict[tuple, datetime] = {}
    day_first: Dict[object, datetime] = {}
    for t, v in obs:
        value = round(float(v), 6)
        by_day.setdefault(t.date(), []).append(value)
        first_t.setdefault((t.date(), value), t)
        day_first.setdefault(t.date(), t)
    days: List[tuple] = []
    for day, values in by_day.items():
        counts = Counter(values)
        rep = max(counts.items(), key=lambda kv: (kv[1], kv[0]))[0]
        days.append((day, rep, first_t[(day, rep)], day_first[day]))
    days.sort(key=lambda d: d[0])
    return _regimes_from_days(_settled_days(days, _MIN_EPOCH_DAYS))


def basal_slot_regimes(basal_events, slot_minutes: int = 30) -> Dict[int, List[Regime]]:
    """Per-slot programmed-rate regimes from the dense feed (sibling of ``basal_slot_epochs``).

    Same per-slot per-day majority reduction the epoch uses, returned as each slot's
    full value history so a basal Trial can name the changed slot and its before/after
    rate. No ``_MIN_EPOCH_DAYS`` debounce — the dense basal feed does not need one.
    """
    evs = sorted((e for e in basal_events if e.profile_basal_rate is not None),
                 key=lambda e: e.t)

    def slot(e) -> int:
        return (e.t.hour * 60 + e.t.minute) // slot_minutes

    by_slot_day: Dict[tuple, List] = {}
    for e in evs:
        by_slot_day.setdefault((slot(e), e.t.date()), []).append(e)

    by_slot: Dict[int, List[tuple]] = {}
    for (s, day), samples in by_slot_day.items():
        counts = Counter(round(e.profile_basal_rate, 6) for e in samples)
        rep = max(counts.items(), key=lambda kv: (kv[1], kv[0]))[0]
        first = next(e.t for e in samples if round(e.profile_basal_rate, 6) == rep)
        by_slot.setdefault(s, []).append((day, rep, first, samples[0].t))

    out: Dict[int, List[Regime]] = {}
    for s, days in by_slot.items():
        days.sort(key=lambda d: d[0])
        out[s] = _regimes_from_days(days)
    return out


def same_change(record, *, parameter, slot, block, legacy, before, after) -> bool:
    """Whether a retained record saved under the dating before ADR 463 names this
    delivery-detected change (ADR 463 decision 5).

    That dating put a delivery-detected change at its settled day's first
    observation, whatever it carried: ``legacy``, computed from the same data.
    The record is this change only when its parameter, slot and block match, its
    change time equals ``legacy`` to the second, and its before and after values
    match wherever it carries them. A whole-profile record carries no values, so
    it matches on that exact instant alone. Nothing else about the time counts:
    no window, no ordering.
    """
    kept = record.get("block")
    return (record["parameter"] == parameter and record.get("slot") == slot
            and (tuple(kept) if kept is not None else None) == (tuple(block) if block is not None else None)
            and (record.get("before") is None or record.get("before") == before)
            and (record.get("after") is None or record.get("after") == after)
            and datetime.fromisoformat(record["changed_at"]) == legacy)


# --- Trial detection -------------------------------------------------------


@dataclass(frozen=True)
class Maturing:
    """A Trial's watch phase (ADR 0029 §6, CONTEXT.md "Maturing").

    ``is_maturing`` is True while the target metric's **data is still accruing** —
    fewer than ``days_required`` (the fixed ``TRIAL_WINDOW_DAYS``) post-change *days
    that actually carry target data* have landed, so the before/after delta is not
    yet trustworthy.
    ``days_elapsed`` counts those data-days, not calendar days: an I:C trial (target
    ``arc``) matures on post-meal days, not on the wall clock, so a stretch with no
    meals does not falsely mature it. Gated on data accrual, "not on model
    sufficiency" (CONTEXT.md). A **new, distinct** concept from ``result.Settling``
    (#95); do not conflate them.
    """

    is_maturing: bool
    days_elapsed: int
    days_required: int

    def to_dict(self) -> dict:
        return {
            "is_maturing": self.is_maturing,
            "days_elapsed": self.days_elapsed,
            "days_required": self.days_required,
        }


@dataclass(frozen=True)
class TrialView:
    """The legacy active-view shape projected from a retained Trial."""

    parameter: str            # basal_rate | isf | carb_ratio | target_bg | profile
    changed_at: str
    target_metrics: List[str]
    maturing: Maturing
    slot: Optional[str] = None
    before: Optional[float] = None
    after: Optional[float] = None
    deliberate: bool = False
    kind: str = field(default="trial", init=False)

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "parameter": self.parameter,
            "slot": self.slot,
            "changed_at": self.changed_at,
            "before": self.before,
            "after": self.after,
            "target_metrics": list(self.target_metrics),
            "maturing": self.maturing.to_dict(),
            "deliberate": self.deliberate,
        }


@dataclass
class _Cand:
    parameter: str
    slot: Optional[str]
    start: datetime
    before: float
    after: float
    regimes: List[Regime]
    # A switch-derived candidate is already fully classified by the profile diff, so
    # it carries its own revert verdict instead of one read off ``regimes`` (which the
    # snapshot feed doesn't produce).
    switch: bool = False
    reverted: bool = False
    # The instant the dating before ADR 463 gave a delivery-detected candidate:
    # its settled day's first observation (for a whole-profile one, the latest of
    # its parts'). ``None`` for a pump-read switch, which that dating never moved.
    legacy: Optional[datetime] = None
    # A block-scoped I:C or basal candidate carries the wrap-aware arc (and, for
    # I:C, the member list) the settings reads either side of its change recorded
    # (#581, #500, #506). The arc is
    # Trial-owned identity: later profile repartitions cannot retarget it, because
    # the retained record keeps it, never re-reading current settings.
    block: Optional[tuple] = None
    members: Optional[list] = None
    # A pump-read candidate's earlier read (#500): the change landed after it, so a
    # dose or delivery observation of the same move after it is this change.
    observed_after: Optional[datetime] = None
    # The time block a targeted pump-read candidate moved, whatever its setting:
    # a slotted delivery observation corroborates it only inside this block.
    arc: Optional[tuple] = None
    # A delivery-only basal block's per-slot observations, from its block's start
    # (#510): the candidate is its first, and a saved per-slot record of any of
    # them holds the block.
    parts: Optional[list] = None


def _slot_label(slot: int, slot_minutes: int = 30) -> str:
    m = slot * slot_minutes
    return f"{m // 60:02d}:{m % 60:02d}"


def _is_revert(regimes: List[Regime], mature_window: timedelta) -> bool:
    """Was the latest change a walk-back to the exact pre-change baseline, in-window?

    ``[A, B, A]`` where the B→A step landed within ``mature_window`` of the A→B step
    is a revert (ADR 0029 §2): the Trial closes as reverted and spawns no second
    Trial. A walk-back *after* the window matured, or to a third value, is not.
    """
    if len(regimes) < 3:
        return False
    a, b, c = regimes[-3], regimes[-2], regimes[-1]
    return c.value == a.value and (c.start - b.start) <= mature_window


def _maturing(changed_at: datetime, now: datetime, window_days: int,
              data_times) -> Maturing:
    """Maturing gated on the target metric's post-change **data-day** accrual.

    ``data_times`` is the timeline the target series draws on (CGM instants for
    tir/tbr, meal instants for the arc). The Trial is maturing until ``window_days``
    distinct post-change days actually carry that data — so a sparse or meal-less
    stretch keeps it maturing rather than trusting a delta the data can't support.
    """
    days = {t.date() for t in data_times if changed_at < t <= now}
    elapsed = len(days)
    return Maturing(is_maturing=elapsed < window_days,
                    days_elapsed=elapsed, days_required=window_days)


def _deliberate(parameter: str, changed_at: datetime, plan_history) -> bool:
    """Is the change corroborated by a recent matching plan-apply? (soft signal)."""
    if not plan_history:
        return False
    want = _PLAN_TYPE.get(parameter)  # profile/target have no single item type
    for entry in plan_history:
        try:
            applied = datetime.strptime(entry["applied_at"], _DT_FMT)
        except (KeyError, ValueError):
            continue
        if abs(applied - changed_at) > _APPLY_TOLERANCE:
            continue
        items = entry.get("items") or []
        if want is None or any(it.get("type") == want for it in items):
            return True
    return False


@dataclass(frozen=True)
class _Switch:
    """One change the person made on the pump, as two consecutive settings reads show it.

    Either an active-profile switch or an in-place edit of the active profile
    (#500). ``at`` is the read that first shows the change and ``observed_after``
    the read before it, so the change itself landed in ``(observed_after, at]``.
    ``blocks`` maps each changed setting to its changed time blocks,
    ``(start_min, end_min, before, after)``, read off the full schedule either
    side of the change. An **empty** mapping means the outgoing profile is gone
    from the read or the two profiles are identical, which classifies as
    whole-profile. ``old`` and ``new`` are the two carb-ratio schedules, which an
    applied Plan's block annotation is matched against (#581).
    """

    at: datetime
    observed_after: datetime
    blocks: Dict[str, List[tuple]]
    old: list = field(default_factory=list)
    new: list = field(default_factory=list)


def _changed_blocks(old_sched, new_sched) -> List[tuple]:
    """Each wrap-aware time block one setting moved over, with its before and after.

    Both schedules are read piecewise over the union of their boundaries; adjacent
    stretches that moved between the same two values are one block, across
    midnight too. A block over the whole day is ``(0, 1440, before, after)``.
    """
    bounds = sorted({0} | {s for s, _ in old_sched} | {s for s, _ in new_sched})
    bounds = [b for b in bounds if 0 <= b < 1440]
    runs: List[list] = []
    for index, start in enumerate(bounds):
        end = bounds[index + 1] if index + 1 < len(bounds) else 1440
        before, after = _value_at(old_sched, start), _value_at(new_sched, start)
        if before == after:
            continue
        if runs and runs[-1][1] == start and runs[-1][2:] == [before, after]:
            runs[-1][1] = end
        else:
            runs.append([start, end, before, after])
    if (len(runs) > 1 and runs[0][0] == 0 and runs[-1][1] == 1440
            and runs[0][2:] == runs[-1][2:]):
        last = runs.pop()
        runs[0][0] = last[0]
    return [(start, end % 1440 if (start, end) != (0, 1440) else 1440,
             float(before), float(after)) for start, end, before, after in runs]


def _pump_changes(snapshots) -> List[_Switch]:
    """Every change the person made to the profile the pump runs, chronological (#500).

    Consecutive reads are compared directly. An ``active_idp`` switch diffs the
    outgoing profile as the later read holds it against the incoming one (#331);
    otherwise an in-place edit diffs the active profile across the two reads. An
    edit to an inactive profile is never delivered, and an in-place edit that
    moves no value (a segment split or merge) delivers nothing new, so neither is
    a pump change.
    """
    from .settings import SEGMENT_PARAMETERS
    snaps = sorted(snapshots or [], key=lambda s: s.captured_at)
    out: List[_Switch] = []
    for prev, cur in zip(snaps, snaps[1:]):
        switched = prev.settings.active_idp != cur.settings.active_idp
        old = (cur.settings.by_idp(prev.settings.active_idp) if switched
               else prev.settings.active())
        new = cur.settings.active()
        blocks = {}
        if old is not None and new is not None:
            for parameter in SEGMENT_PARAMETERS:
                moved = _changed_blocks(old.schedule(parameter), new.schedule(parameter))
                if moved:
                    blocks[parameter] = moved
        if not switched and not blocks:
            continue
        out.append(_Switch(cur.captured_at, prev.captured_at, blocks,
                           old.schedule("carb_ratio") if old else [],
                           new.schedule("carb_ratio") if new else []))
    return out


def _switch_reverts(prev: Optional[_Switch], cur: _Switch,
                    mature_window: timedelta) -> bool:
    """Did ``cur`` put back exactly what ``prev`` moved, in-window?

    Compared on the blocks each change moved, not the profile ids: a change whose
    blocks are the exact inverse of the preceding one's, landing inside the
    maturing window, is a walk-back — that Trial closes and spawns no second
    Trial, the same rule the dose stream gets from :func:`_is_revert`.
    """
    if prev is None or not prev.blocks or not cur.blocks:
        return False
    if (cur.at - prev.at) > mature_window:
        return False
    was = sorted((p, s, e, b, a) for p, rows in prev.blocks.items() for s, e, b, a in rows)
    back = sorted((p, s, e, a, b) for p, rows in cur.blocks.items() for s, e, b, a in rows)
    return was == back


def _switch_candidates(snapshots, plan_history, mature_window: timedelta) -> List[_Cand]:
    """Trial candidates supplied by the settings reads themselves (#463, #500).

    A change made on the pump is authoritative on its own (#331, #500): the two
    reads either side of it name what moved, so the Trial starts at the read that
    shows it rather than waiting for the dose stream to re-observe the new value
    across two days, and no Plan is needed for it. A change confined to one
    setting is one targeted candidate per changed time block; zero or two-plus
    changed settings is one whole-profile candidate. A carb-ratio or basal block
    owns its wrap-aware arc as its identity and cohort (#581, #506); a carb-ratio
    block also owns its member starts, and an applied Plan group that matches the
    change uniquely only supplies its own member list.
    """
    cands: List[_Cand] = []
    switches = _pump_changes(snapshots)
    groups = _annotated_ic_groups(plan_history)
    # A walk-back closes the change it undid, so both ends of the pair drop out —
    # otherwise the fall-through to the next-most-recent change would resurrect the
    # very change that was reverted.
    closed = set()
    for i, sw in enumerate(switches):
        if i and _switch_reverts(switches[i - 1], sw, mature_window):
            closed.update((i - 1, i))
    for i, sw in enumerate(switches):
        if len(sw.blocks) != 1:
            cands.append(_Cand("profile", None, sw.at, None, None, [], switch=True,
                               reverted=i in closed, observed_after=sw.observed_after))
            continue
        (parameter, blocks), = sw.blocks.items()
        group = (_match_unique_group(sw.old, sw.new, sw.at, groups)
                 if parameter == "carb_ratio" else None)
        for start, end, before, after in blocks:
            whole_day = (start, end) == (0, 1440)
            block = (start, end) if parameter in _BLOCK_SCOPED and not whole_day else None
            if block is None or parameter != "carb_ratio":
                members = None
            elif group is not None and tuple(group["block"]) == block:
                members = list(group["members"])
            else:
                members = sorted({start} | {s for s, _ in sw.new if _in_arc(s, block)})
            cands.append(_Cand(parameter, None if whole_day else _min_label(start), sw.at,
                               before, after, [], switch=True, reverted=i in closed,
                               block=block, members=members, observed_after=sw.observed_after,
                               arc=(start, end)))
    return cands


# --- Focus (the pinned behavioral lever) -----------------------------------

# Which existing series a Focus reads its *outcome* off, by the lever's exposure —
# a meal habit against the post-meal arc, a lows habit against time-below-range.
# Adherence is always the lever's own clean-rate series (the frontend joins to
# ``behaviors[lever]``); this is only the outcome dimension.
_FOCUS_OUTCOME = {
    Exposure.MEALS: "arc",
    Exposure.LOWS: "tbr",
    Exposure.HIGHS: "tir",
    Exposure.CORRECTION_CLUSTERS: "tbr",
}


def _behavioral_levers() -> List[Lever]:
    """The scorecard's behavioral levers, imported lazily to avoid an import cycle."""
    from .outcomes_trend import _BEHAVIOR_ORDER
    return list(_BEHAVIOR_ORDER)


def pinnable_levers() -> set:
    """The lever ids a Focus may pin — every **behavioral-flavored** lever Diagnose
    surfaces (ADR 0029 §5). Tuning knobs (isf, basal_rate, …) are never here: applying
    one to the pump makes a Trial instead."""
    from .outcomes_trend import OVERRIDE_LEVER
    return {lv.value for lv in _behavioral_levers()} | {OVERRIDE_LEVER}


def is_pinnable(lever: str, pattern_key: str | None = None) -> bool:
    """A Pattern with only a setting member is never a Focus subject."""
    if pattern_key is None:
        return lever in pinnable_levers()
    from .analyzers.scenario.outcome_patterns import _ROSTER
    return any(key == pattern_key and lever in levers
               for key, _title, levers, _rates, _setting, _family in _ROSTER)


def _focus_identity(store, focus: dict) -> dict:
    """Join retained Pattern identity onto the legacy Focus row when present."""
    record = store.follow_up_record("focus", focus["id"])
    key = record.get("pattern_key") if record is not None else None
    return {**focus, **({"pattern_key": key} if key else {})}


@dataclass(frozen=True)
class FocusView:
    """The active Focus — read from the stored ``{lever, pinned_at, status}`` row.

    ``title`` and ``target_metric`` are **derived from the lever id** at read time
    (not frozen at pin time, ADR 0029 §5). Adherence and the outcome series are the
    lever's own ``BehaviorTrend`` / arc series already in the payload — the frontend
    joins on ``lever``; nothing about them is duplicated here.
    """

    lever: str
    title: str
    pinned_at: str
    status: str
    target_metric: str
    subject: str | None = None
    pattern_key: str | None = None
    kind: str = field(default="focus", init=False)

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "lever": self.lever,
            "title": self.title,
            "pinned_at": self.pinned_at,
            "status": self.status,
            "target_metric": self.target_metric,
            **({"subject": self.subject, "pattern_key": self.pattern_key}
               if self.pattern_key else {}),
        }


def _focus_meta(lever: str) -> tuple:
    """``(title, outcome_series_key)`` for a pinned lever id."""
    from .outcomes_trend import OVERRIDE_LEVER, OVERRIDE_TITLE
    if lever == OVERRIDE_LEVER:
        return OVERRIDE_TITLE, "tbr"  # an override-up's harm is a lows story
    lv = Lever(lever)
    return lever_title(lv), _FOCUS_OUTCOME.get(lever_exposure(lv), "tir")


def focus_view(focus_row: dict) -> FocusView:
    title, target = _focus_meta(focus_row["lever"])
    key = focus_row.get("pattern_key")
    return FocusView(lever=focus_row["lever"], title=title,
                     pinned_at=focus_row["pinned_at"], status=focus_row["status"],
                     target_metric=target, subject=f"pattern:{key}" if key else None,
                     pattern_key=key)


# --- the one-active resolution (Trial XOR Focus, pump wins) -----------------


def _reviewable_trials(store, now, *, horizon_start=None):
    """Derive uncapped canonical candidates before applying display ordering."""
    basal = store.basal_events()
    bolus = store.bolus_events()
    snapshots = store.settings_snapshots()
    cgm = store.cgm_readings()
    plan_history = store.plan_history()
    horizon_start = horizon_start if horizon_start is not None else now - _WATCH_HORIZON
    mature_window = _MATURE_WINDOW
    # One arc datum per meal, at its first bolus (ADR 470).
    meal_times = [meal.t for meal in group_meals(bolus)]

    candidates = _review_candidates(
        basal, bolus, snapshots, plan_history, mature_window=mature_window,
        horizon_start=horizon_start,
    )
    # A record saved under the dating before ADR 463 keeps its own time, and so
    # its id: a delivery-detected candidate keeps it only when the record's
    # change time is exactly the date that dating gave the candidate (same_change),
    # and each record is kept by one candidate at most, the earliest. A record
    # dated at a pump-read switch, reverted ones included, is never kept: the
    # switch's own candidate carries it (ADR 463 decision 5).
    switched = {switch.at for switch in _pump_changes(snapshots)}
    records = store.follow_up_records("trial")
    candidates = [cand for cand in candidates
                  if not _recorded_from_delivery(cand, records, switched)]
    delivered = sorted((cand for cand in candidates if not cand.switch), key=lambda cand: cand.start)
    keeper = {}
    for record in records:
        if datetime.fromisoformat(record["changed_at"]) in switched:
            continue
        cand = next((cand for cand in delivered if same_change(
            record, parameter=cand.parameter, slot=cand.slot, block=cand.block,
            legacy=cand.legacy, before=cand.before, after=cand.after)), None)
        if cand is not None:
            keeper.setdefault(id(cand), record)
    # A delivery-only basal block an earlier build saved per slot (#510) is held
    # by the record its saved slots are served under, whichever slot first
    # recorded it, under either dating, so the change is never recorded again.
    saved = _saved_blocks(records, switched)
    for cand in delivered:
        if cand.parts is None or id(cand) in keeper:
            continue
        held = next((saved[record["id"]].served for record in records if record["id"] in saved
                     and any(record["slot"] == part.slot and record.get("before") == part.before
                             and record.get("after") == part.after
                             and datetime.fromisoformat(record["changed_at"]) in (part.start, part.legacy)
                             for part in cand.parts)), None)
        if held is not None:
            keeper[id(cand)] = held
    trials = []
    for cand in candidates:
        kept = keeper.get(id(cand))
        start = datetime.fromisoformat(kept["changed_at"]) if kept else cand.start
        target = _PROFILE_TARGET if cand.parameter == "profile" else _TARGET_METRIC[cand.parameter]
        # A block-bound I:C Trial accrues only from meals inside its captured arc
        # (#581): out-of-block meals never mature it, fill its gaps, or feed its
        # evidence — the same one wrap-aware cohort the detail and breakdown read.
        # A basal Trial matures on the clock, block or not (#506): a change read
        # after its block's hours would otherwise count its own day as a gap.
        data_times = meal_times if target[0] == "arc" else [r.t for r in cgm]
        if cand.block is not None and target[0] == "arc":
            data_times = [t for t in data_times if _in_block(t, cand.block)]
        # Maturity accrues only from the same bounded Trial period displayed in
        # the selected detail.  Later observations cannot complete an otherwise
        # empty Trial or make its ready-to-judge state imply unavailable evidence.
        trial_end = min(now, start + mature_window)
        maturing = _maturing(start, trial_end, TRIAL_WINDOW_DAYS, data_times)
        trials.append(_ReviewTrial(
            view=TrialView(
                parameter=cand.parameter,
                changed_at=start.strftime(_DT_FMT),
                target_metrics=target,
                maturing=maturing,
                slot=kept["slot"] if kept else cand.slot,
                before=cand.before,
                after=cand.after,
                deliberate=_deliberate(cand.parameter, start, plan_history),
            ),
            gap_count=_data_gaps(start, trial_end, data_times),
            block=cand.block,
            members=list(cand.members) if cand.members else None,
        ))

    return trials


def _recorded_from_delivery(cand: _Cand, records: List[dict], switched: set) -> bool:
    """Whether a retained record already holds this pump change under the delivery
    dating, so the change is not recorded a second time (#500).

    A record saved before pump changes were read from settings, or by a reconcile
    whose fetch brought the delivery feed but not the settings read, dates the
    change at its first delivery observation. That record is this change when it
    names the same setting, before and after, inside the change's block, and its
    time falls after the earlier read and within a day of the read that shows the
    change; a whole-profile record matches on its time alone. The pump change's
    own record, dated at that read, never counts, and a change that already has
    its own record is kept.
    """
    if cand.observed_after is None:
        return False
    stamp = cand.start.strftime(_DT_FMT)
    if any(r["changed_at"] == stamp and r["parameter"] == cand.parameter for r in records):
        return False
    for record in records:
        at = datetime.fromisoformat(record["changed_at"])
        if (at in switched or record["parameter"] != cand.parameter
                or not cand.observed_after < at <= cand.start + _PROFILE_TOLERANCE):
            continue
        if cand.parameter == "profile" or (
                record.get("before") == cand.before and record.get("after") == cand.after
                and _slot_in_arc(record.get("slot"), cand.arc)):
            return True
    return False


def _review_focus_title(record):
    """Historical records can outlive the lever vocabulary of the active view."""
    from .analyzers.scenario.outcome_patterns import _ROSTER
    pattern_titles = {key: title for key, title, *_ in _ROSTER}
    title = pattern_titles.get(record.get("pattern_key"))
    if title is not None:
        return title
    return _focus_meta(record["lever"])[0] if is_pinnable(record["lever"]) else "Focus"


def _review_lever_title(lever):
    """The watched behavior's one served name (ADR 449): the nameplate's own title
    source, never the Pattern title. A stored lever that is no longer a Lever or
    the override has none, and the record still reads."""
    try:
        return _focus_meta(lever)[0]
    except ValueError:
        return None


def _group_edits(retained_records: List[dict]) -> tuple:
    """Chain RETAINED trial records into Edits (ADR 414).

    Sorted by ``changed_at``, a record joins the previous retained record's edit
    when the gap is at most ``_PROFILE_TOLERANCE`` (one day); otherwise it starts a
    new edit, keyed off its own id. Returns ``(id -> edit key, edits summary
    list)``; ``parameters`` on each summary is ordered by first occurrence within
    the edit (sub-order 2 renders "Basal ×11 · Carb ratio" from that order).

    Two callers read it: the roster, and the reconcile's ending rule, where a
    change inside a record's own Edit never supersedes it (ADR 442). A change to
    this grouping or its tolerance therefore changes how records end too.
    """
    ordered = sorted(retained_records, key=lambda r: datetime.fromisoformat(r["changed_at"]))
    id_to_key: Dict[str, str] = {}
    edits: List[dict] = []
    current = None
    previous_at = None
    for record in ordered:
        changed_at = datetime.fromisoformat(record["changed_at"])
        if current is None or (changed_at - previous_at) > _PROFILE_TOLERANCE:
            current = {"key": f"edit-{record['id']}", "first_changed_at": record["changed_at"],
                      "last_changed_at": record["changed_at"], "count": 0, "parameters": []}
            edits.append(current)
        current["last_changed_at"] = record["changed_at"]
        current["count"] += 1
        entry = next((p for p in current["parameters"] if p["parameter"] == record["parameter"]), None)
        if entry is None:
            current["parameters"].append({"parameter": record["parameter"], "count": 1})
        else:
            entry["count"] += 1
        id_to_key[record["id"]] = current["key"]
        previous_at = changed_at
    return id_to_key, edits


def review_trials(store, *, now: datetime, selected=None, kind="trial", assessment="original"):
    """Read retained history and optional reassessment without resolving a watch."""
    from .follow_up_comparison import compare_follow_up
    trials = _reviewable_trials(store, now)
    by_id = {_review_id(t.view, t.block): t for t in trials}
    retained_records = store.follow_up_records("trial")
    # A delivery-only basal change saved per slot is one Trial (#510): only the
    # record it is served under is a roster row, and its siblings' ids open it.
    saved = _saved_blocks(retained_records, {switch.at for switch in _pump_changes(store.settings_snapshots())})
    alias = {rid: held.served["id"] for rid, held in saved.items() if held.served["id"] != rid}
    retained_records = [record for record in retained_records if record["id"] not in alias]
    for rid in alias:
        by_id.pop(rid, None)
    for record in retained_records:
        by_id[record["id"]] = _retained_trial(store, record, now, saved=saved)
    edit_by_id, edits = _group_edits(retained_records)
    ordered = sorted(by_id.values(), key=lambda t: (
        0 if t.view.maturing.is_maturing else 1,
        -datetime.fromisoformat(t.view.changed_at).timestamp(), _review_id(t.view, t.block)))
    admission = follow_up_admission(store, now=now)
    roster = []
    for trial in ordered:
        row = _review_summary(trial)
        record = store.follow_up_record("trial", row["id"])
        row.update(ending=record["ending"] if record else _unavailable("not_recorded"),
                   watch_disposition=("active" if admission["active_kind"] == "trial"
                                      and admission["active_id"] == row["id"] else "not_selected_for_watch"))
        if row["id"] in edit_by_id:
            row["edit"] = edit_by_id[row["id"]]
        roster.append(row)
    focuses = [{**record, "title": _review_focus_title(record)}
               for record in store.follow_up_records("focus")]
    result = {"trials": roster, "focuses": focuses, "selected": None, "edits": edits,
              "input_revision": store.input_data_revision(), "admission": admission}
    if selected is None:
        return result
    identity = int(selected) if kind == "focus" else alias.get(selected, selected)
    record = store.follow_up_record(kind, identity)
    if kind == "trial":
        trial = by_id.get(identity)
        if trial is None:
            raise KeyError(identity)
        detail = _review_detail(store, trial, now)
    else:
        if record is None:
            raise KeyError(identity)
        detail = {"id": identity, "lever": record["lever"], "status": record["status"],
                  "title": _review_focus_title(record), "lever_title": _review_lever_title(record["lever"])}
    context = (record.get("observed_context", record.get("decision_context"))
               if record else _unavailable("not_recorded"))
    receipt = record["reconciliation"] if record and kind == "trial" else {}
    if receipt.get("state") == "available":
        # A Trial matched to a Plan shows the decision that Plan recorded (ADR 463).
        decision = store.follow_up_record("plan", receipt["applied_at"])["decision_context"]
        context = decision if decision.get("state") == "available" else context
    detail.update(kind=kind, admission=admission,
                  original={"context": context,
                            "ending": record["ending"] if record else _unavailable("not_recorded"),
                            "late_conclusion": record.get("late_conclusion", _unavailable("not_recorded"))
                                               if record else _unavailable("not_recorded"),
                            "assessment": record["ending"].get("assessment", _unavailable("not_recorded"))
                                          if record else _unavailable("not_recorded")},
                  reassessment=None)
    if assessment != "original":
        if record is None:
            comparison = {"comparison_context": _unavailable("not_recorded"),
                          "comparison": {"availability": _unavailable("not_recorded")}}
        else:
            # An ended Trial is reassessed only on the evidence up to its ending,
            # as its saved ending was (ADR 462); an open record reads to the tail.
            ending = record.get("ending") or {}
            cutoff = (min(now, datetime.fromisoformat(ending["effective_at"]))
                      if kind == "trial" and "kind" in ending else now)
            comparison = compare_follow_up(store, record=record, data_cutoff=cutoff,
                                           input_revision=store.input_data_revision(), context_mode=assessment)
        detail["reassessment"] = {"mode": assessment, "computed_at": wall_clock_now().strftime(_DT_FMT),
                                  "input_revision": store.input_data_revision(), **comparison}
    result["selected"] = detail
    return result


@dataclass(frozen=True)
class _ReviewTrial:
    """One retained Trial candidate on the roster and the data-accrual facts it owns."""

    view: TrialView
    gap_count: int
    # The captured wrap-aware arc when this is a block-bound I:C or basal Trial
    # (#581, #500, #506), and an I:C Trial's member starts; ``None`` for every
    # other Trial. Trial-owned identity read off the change's own two settings
    # reads, never off current settings.
    block: Optional[tuple] = None
    members: Optional[list] = None


def _review_candidates(basal, bolus, snapshots, plan_history, *,
                       mature_window: timedelta,
                       horizon_start: datetime) -> List[_Cand]:
    """Every current/recent derived Trial candidate, excluding closed loops.

    The Trial roster keeps the bounded historical set here, so reversion
    suppression and switch corroboration remain local rather than making a
    frontend recreate setting history.

    A change the settings reads show is a candidate whether or not a Plan proposed
    it (#500); a carb-ratio block change carries its own observed arc.
    """
    switches = [
        candidate for candidate in _switch_candidates(snapshots, plan_history, mature_window)
        if not candidate.reverted
    ]
    raw = []
    for parameter in ("isf", "carb_ratio", "target_bg"):
        raw.extend(_regime_candidates(parameter, None, dose_regimes(bolus, parameter),
                                       mature_window))
    for slot, regimes in basal_slot_regimes(basal).items():
        raw.extend(_regime_candidates("basal_rate", _slot_label(slot), regimes,
                                       mature_window))

    # A later dose observation can corroborate a pump change but never deserves a
    # second roster entry.  Keep the pump change even if its source data later ages
    # out so the observation cannot resurrect it under a different identity. The
    # change landed after the read before the one that shows it, and reads are
    # taken at fetch time, so a dose or delivery that carried the new value after
    # that earlier read is this change (#500), even when it precedes the read that
    # first shows it.
    raw = [
        candidate for candidate in raw
        if not any(
            (
                switch.parameter == "profile"
                and abs(switch.start - candidate.start) <= _PROFILE_TOLERANCE
            ) or (
                switch.observed_after < candidate.start
                and switch.parameter == candidate.parameter
                and switch.before == candidate.before
                and switch.after == candidate.after
                and _slot_in_arc(candidate.slot, switch.arc)
            )
            for switch in switches
        )
    ]
    # The slots a delivery-only basal change moved together are one change (#510),
    # grouped after corroboration so a slot a pump read already holds stays out.
    raw = _coalesce_profile_changes(_delivery_blocks(raw))
    return [
        candidate for candidate in switches + raw
        if candidate.start > horizon_start
    ]


def _slot_in_arc(slot: Optional[str], arc: Optional[tuple]) -> bool:
    """Whether a delivery observation at ``slot`` lies in a pump change's block.

    A whole-parameter observation (no slot) or a whole-day block always does.
    """
    if slot is None or arc is None or tuple(arc) == (0, 1440):
        return True
    hour, minute = map(int, slot.split(":"))
    return _in_arc(hour * 60 + minute, arc)


# --- delivery-only basal blocks (#510) ---------------------------------------
#
# The basal feed names a slot, never a block. A change to one stretch of the
# schedule shows as the same before → after in every slot it covers, each first
# delivered within a day of its neighbour. Those adjacent slots, across midnight
# too, are one change and one Trial, as two settings reads would show it.

_SLOTS_PER_DAY = 48


def _slot_index(slot: str) -> int:
    hour, minute = map(int, slot.split(":"))
    return (hour * 60 + minute) // 30


def _contiguous_blocks(items) -> List[tuple]:
    """Group per-slot basal changes into the wrap-aware blocks they form (#510).

    ``items`` are ``(slot_index, at, before, after, payload)``. An item is
    followed by the item in the next slot, across midnight too, that moved
    between the same two rates and was first seen within ``_PROFILE_TOLERANCE``
    of it — the nearest such, and each item follows at most one. Returns one
    ``(payloads, block)`` per block, the payloads ordered from the block's first
    slot; ``block`` is ``(start_min, end_min)``, or ``None`` when the change
    covers the whole day.
    """
    ordered = sorted(items, key=lambda item: (item[1], item[0]))
    by_slot: Dict[int, list] = {}
    for item in ordered:
        by_slot.setdefault(item[0], []).append(item)
    successor: Dict[int, tuple] = {}
    followed = set()
    for item in ordered:
        nearby = [other for other in by_slot.get((item[0] + 1) % _SLOTS_PER_DAY, [])
                  if id(other) not in followed and other[2:4] == item[2:4]
                  and abs(other[1] - item[1]) <= _PROFILE_TOLERANCE]
        if nearby:
            other = min(nearby, key=lambda other: abs(other[1] - item[1]))
            successor[id(item)] = other
            followed.add(id(other))
    seen = set()

    def run_from(head):
        run = [head]
        seen.add(id(head))
        while id(run[-1]) in successor and id(successor[id(run[-1])]) not in seen:
            run.append(successor[id(run[-1])])
            seen.add(id(run[-1]))
        return run

    runs = [run_from(item) for item in ordered if id(item) not in followed]
    # Whatever is left closes a ring around the whole day; it reads from midnight.
    for item in ordered:
        if id(item) not in seen:
            ring = run_from(item)
            first = min(range(len(ring)), key=lambda index: ring[index][0])
            runs.append(ring[first:] + ring[:first])
    return [([item[4] for item in run],
             None if len(run) >= _SLOTS_PER_DAY else (run[0][0] * 30, (run[-1][0] + 1) * 30 % 1440))
            for run in runs]


def _delivery_blocks(candidates: List[_Cand]) -> List[_Cand]:
    """One candidate per delivery-only basal block (#510); the rest pass through.

    A block's candidate is its first slot's: dated at that slot's first delivery
    of the new rate, read through that slot's history, and carrying the block
    as a pump-read basal change does (ADR 506). A change over the whole day has
    no slot and no block, read through midnight's slot.
    """
    out = [cand for cand in candidates if cand.parameter != "basal_rate"]
    slotted = [(_slot_index(cand.slot), cand.start, cand.before, cand.after, cand)
               for cand in candidates if cand.parameter == "basal_rate"]
    for parts, block in _contiguous_blocks(slotted):
        lead = parts[0]
        out.append(_Cand("basal_rate", lead.slot if block else None, lead.start,
                         lead.before, lead.after, lead.regimes, legacy=lead.legacy,
                         block=block, parts=parts))
    return out


@dataclass(frozen=True)
class _SavedBlock:
    """The per-slot records an earlier build saved for one delivery-only basal
    change, and the one record the change is served under (#510)."""

    served: dict
    block: Optional[tuple]


def _saved_blocks(records: List[dict], switched: set) -> Dict[str, _SavedBlock]:
    """Each per-slot delivery-only basal record's change, by record id (#510).

    Before #510 a basal change seen only in delivery history was saved as one
    record per slot, with no block. No record is rewritten: the records of one
    change, grouped by the rule a new change is, are served as one Trial over
    their block. That Trial is the record carrying the person's own decision —
    a finish, else a late conclusion — or else the block's first slot's, so a
    decision is never hidden and the served id never moves once chosen. A
    record dated at a pump read is that read's change, never one of these.
    """
    def decided(record, kind):
        if kind == "finish":
            return (record.get("ending") or {}).get("kind") == "user_finished"
        return (record.get("late_conclusion") or {}).get("state") == "available"

    items = [(_slot_index(record["slot"]), datetime.fromisoformat(record["changed_at"]),
              record.get("before"), record.get("after"), record)
             for record in records
             if record["parameter"] == "basal_rate" and record.get("block") is None
             and record.get("slot") is not None
             and datetime.fromisoformat(record["changed_at"]) not in switched]
    out: Dict[str, _SavedBlock] = {}
    for members, block in _contiguous_blocks(items):
        served = next((record for kind in ("finish", "conclusion") for record in members
                       if decided(record, kind)), members[0])
        for record in members:
            out[record["id"]] = _SavedBlock(served, block)
    return out


def _maybe_saved(record: dict) -> bool:
    """Whether a record has the shape of a per-slot delivery-only basal record."""
    return (record.get("parameter") == "basal_rate" and record.get("block") is None
            and record.get("slot") is not None)


def store_saved_blocks(store) -> Dict[str, _SavedBlock]:
    """:func:`_saved_blocks` over the store's own retained records and reads."""
    return _saved_blocks(store.follow_up_records("trial"),
                         {switch.at for switch in _pump_changes(store.settings_snapshots())})


def _served_frontier_record(store, frontier) -> Optional[dict]:
    """The retained Trial the frontier admits, as the roster serves it (#510).

    An earlier build admitted the newest of a delivery-only change's per-slot
    records; that change is served as one Trial, so its admission is that one.
    """
    record = (store.follow_up_record("trial", frontier["trial_id"])
              if frontier and frontier["trial_id"] else None)
    if record is not None and _maybe_saved(record):
        saved = store_saved_blocks(store).get(record["id"])
        if saved is not None and saved.served["id"] != record["id"]:
            record = store.follow_up_record("trial", saved.served["id"])
    return record


def retained_block(record: dict, snapshots, saved: Optional[Dict[str, _SavedBlock]] = None) -> Optional[tuple]:
    """The time block a retained Trial is measured across (#581, #506, #510).

    A record's own captured block is its identity and is always read first. A
    basal record saved at a pump change before basal Trials carried their block
    keeps its id and is never rewritten; its block is the one the two settings
    reads either side of its own change show moving from its slot, with its
    before and after — the same reads, never the current settings, so a later
    repartition cannot retarget it. A per-slot record of a delivery-only basal
    change takes the block its change's records form together (``saved``, from
    :func:`store_saved_blocks`). Any other record has no block.
    """
    block = record.get("block")
    if block is not None:
        return tuple(block)
    if record.get("parameter") != "basal_rate" or record.get("slot") is None:
        return None
    # Dated as the comparison dates it (``_setting_period``).
    at = datetime.fromisoformat(record.get("detected_at") or record["changed_at"])
    hour, minute = map(int, record["slot"].split(":"))
    for switch in _pump_changes(snapshots):
        if switch.at != at or set(switch.blocks) != {"basal_rate"}:
            continue
        for start, end, before, after in switch.blocks["basal_rate"]:
            if (start == hour * 60 + minute and (start, end) != (0, 1440)
                    and (before, after) == (record.get("before"), record.get("after"))):
                return start, end
    held = (saved or {}).get(record["id"])
    return held.block if held is not None else None


def _regime_candidates(parameter: str, slot: Optional[str], regimes: List[Regime],
                       mature_window: timedelta) -> List[_Cand]:
    """Every non-reverted transition in one setting's settled value history."""
    closed = set()
    for index in range(2, len(regimes)):
        before, changed, returned = regimes[index - 2:index + 1]
        if (returned.value == before.value
                and returned.start - changed.start <= mature_window):
            # A → B → A closes both sides of this exact-baseline loop.  It is not a
            # resolved-record type and therefore never becomes a roster/archive row.
            closed.update((index - 1, index))
    return [
        _Cand(parameter, slot, regime.start, regimes[index - 1].value, regime.value,
              regimes[:index + 1], legacy=regime.legacy_start)
        for index, regime in enumerate(regimes)
        if index and index not in closed
    ]


def _coalesce_profile_changes(candidates: List[_Cand]) -> List[_Cand]:
    """Turn contemporaneous raw multi-parameter edits into one profile Trial."""
    out = []
    consumed = set()
    for index, candidate in enumerate(candidates):
        if index in consumed:
            continue
        related = [
            (other_index, other)
            for other_index, other in enumerate(candidates)
            if abs(other.start - candidate.start) <= _PROFILE_TOLERANCE
        ]
        if len({other.parameter for _, other in related}) >= 2:
            consumed.update(other_index for other_index, _ in related)
            out.append(_Cand(
                "profile", None, max(other.start for _, other in related),
                None, None, [], legacy=max(other.legacy for _, other in related),
            ))
        else:
            consumed.add(index)
            out.append(candidate)
    return out


# --- block-scoped I:C matching (private, #581, #500) ------------------------
#
# A carb-ratio change on the pump is a block-bound Trial on its own (ADR 500,
# revising ADR 581): the two settings reads either side of it record the whole
# schedule, so its arc, before and after are observed, never inferred, and a Plan
# is not needed. The arc becomes the Trial's durable identity and cohort, so a
# later repartition cannot retarget the earlier Trial. An applied Plan group still
# annotates the change: when one complete annotated group (the
# ``ic_block_provenance`` stamped onto every staged member) uniquely matches the
# observed change within ``_APPLY_TOLERANCE`` of the read, its member starts are
# the Trial's, and the Plan receipt names its block.


def _norm_ic(value) -> Optional[float]:
    """One I:C value at the pump settings parser's 4-decimal precision (#581)."""
    if value is None:
        return None
    try:
        return round(float(value), 4)
    except (TypeError, ValueError):
        return None


def _value_at(schedule, minute: int) -> Optional[float]:
    """The value in force at ``minute`` for a ``[(start_min, value)]`` schedule.

    A schedule wraps: a minute before the first segment takes the final segment's
    value, matching :func:`ciq_autotune.settings.resample_schedule`.
    """
    sched = sorted(schedule)
    if not sched:
        return None
    val = sched[-1][1]
    for start, v in sched:
        if start <= minute:
            val = v
        else:
            break
    return val


def _in_arc(minute: int, block: tuple) -> bool:
    """Whether ``minute`` falls in the wrap-aware arc ``[start, end)`` (#581)."""
    start, end = block
    span = (end - start) % 1440
    if span == 0:
        return False
    return (minute - start) % 1440 < span


def _in_block(when: datetime, block: tuple) -> bool:
    """Whether a wall-clock instant falls in a (possibly wrapping) I:C block."""
    return _in_arc(when.hour * 60 + when.minute, block)


def _ic_change_matches(old_sched, new_sched, block: tuple, members,
                       current: float, proposed: float) -> bool:
    """Does an observed I:C schedule change match one captured block exactly? (#581)

    Evaluate ``old_sched`` and ``new_sched`` piecewise over the union of both
    schedules' boundaries, the captured block bounds, and the captured member
    starts. The change matches only when every interval inside the captured
    wrap-aware arc moves from the group's identical normalized ``current`` to its
    identical normalized ``proposed`` value, and **no** interval outside the arc
    changes I:C. A redundant internal member boundary (a segment split inside the
    arc where the value does not move) is inert — it enters the boundary union but
    the value is constant across it, so it neither admits nor rejects a match.
    """
    boundaries = {0}
    boundaries.update(s for s, _ in old_sched)
    boundaries.update(s for s, _ in new_sched)
    boundaries.update(block)
    boundaries.update(members or ())
    changed = False
    for b in sorted(x for x in boundaries if 0 <= x < 1440):
        old_v = _norm_ic(_value_at(old_sched, b))
        new_v = _norm_ic(_value_at(new_sched, b))
        if _in_arc(b, block):
            if old_v != current or new_v != proposed:
                return False
            if old_v != new_v:
                changed = True
        elif old_v != new_v:
            return False
    return changed


def _annotated_ic_groups(plan_history) -> List[dict]:
    """Complete, consistent annotated I:C block groups from applied Plan history.

    One entry per ``(block_start, block_end, members)`` group, carrying its apply
    instant and the group's identical normalized current/proposed I:C values. Any
    malformed or internally inconsistent group is dropped (fail closed) — apply
    already validated live groups, but the roster never trusts a history row it
    cannot itself prove complete. Unannotated rows never form a group.
    """
    groups: List[dict] = []
    for entry in plan_history or []:
        try:
            applied = datetime.strptime(entry["applied_at"], _DT_FMT)
        except (KeyError, ValueError):
            continue
        by_key: Dict[tuple, list] = {}
        for item in entry.get("items") or []:
            if item.get("type") != "ic":
                continue
            prov = item.get("ic_block_provenance")
            if not isinstance(prov, dict):
                continue
            start = prov.get("block_start_min")
            end = prov.get("block_end_min")
            members = prov.get("block_member_start_mins")
            if not (isinstance(start, int) and not isinstance(start, bool)
                    and isinstance(end, int) and not isinstance(end, bool)
                    and isinstance(members, list) and members):
                continue
            by_key.setdefault((start, end, tuple(members)), []).append(item)
        for (start, end, members), rows in by_key.items():
            values = {_norm_ic(r.get("value")) for r in rows}
            currents = {_norm_ic(r.get("current")) for r in rows}
            starts = {r.get("start_min") for r in rows}
            if len(values) != 1 or len(currents) != 1:
                continue
            if len(rows) != len(members) or starts != set(members):
                continue
            current = next(iter(currents))
            value = next(iter(values))
            if current is None or value is None:
                continue
            groups.append({
                "applied": applied, "block": (start, end),
                "members": list(members), "current": current, "value": value,
            })
    return groups


def _match_unique_group(old_sched, new_sched, snapshot_at: datetime,
                        groups: List[dict]) -> Optional[dict]:
    """The single annotated group an observed change matches within 3 days, else None.

    Fail-closed: zero or more than one matching group returns ``None``, so an
    ambiguous annotation never names the change's Plan or its member starts. The
    change is a Trial either way (#500).
    """
    matches = [
        g for g in groups
        if abs(g["applied"] - snapshot_at) <= _APPLY_TOLERANCE
        and _ic_change_matches(old_sched, new_sched, g["block"], g["members"],
                               g["current"], g["value"])
    ]
    return matches[0] if len(matches) == 1 else None


def _min_label(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _review_id(view: TrialView, block: Optional[tuple] = None) -> str:
    """A stable selection identity derived only from the Trial's own facts.

    ``block`` is the captured wrap-aware arc of a block-bound I:C Trial (#581); its
    end minute is folded into the id alongside the parameter/slot/changed-at stamp
    so two block groups that happen to share a start at the same instant (same
    parameter, slot, changed_at) cannot collide on one id — the roster's dedupe key
    is ``(at, start, end)``, and the id must be at least as specific. A basal
    block (#506) keeps the slotted id a basal pump change has always had, so a
    record saved before basal Trials carried their block keeps its identity.
    """
    stamp = datetime.strptime(view.changed_at, _DT_FMT).strftime("%Y%m%d%H%M%S")
    slot = (view.slot or "all").replace(":", "-")
    suffix = f"-{block[1]}" if block is not None and view.parameter == "carb_ratio" else ""
    return f"{view.parameter}-{slot}-{stamp}{suffix}"


def _data_gaps(changed_at: datetime, now: datetime, data_times) -> int:
    """Missing target-data dates elapsed so far, never the unelapsed future days."""
    observed = {t.date() for t in data_times if changed_at < t <= now}
    day = changed_at.date()
    gaps = 0
    while day <= now.date():
        if day not in observed:
            gaps += 1
        day += timedelta(days=1)
    return gaps


def _review_summary(trial: _ReviewTrial) -> dict:
    view = trial.view
    return {
        "id": _review_id(view, trial.block),
        "parameter": view.parameter,
        "slot": view.slot,
        "changed_at": view.changed_at,
        "before": view.before,
        "after": view.after,
        "target_metrics": list(view.target_metrics),
        # The block the Trial is measured across (#506, #510), so a reader can
        # tell a time block inside it from one outside; None for a whole-day or
        # whole-profile Trial.
        "block": list(trial.block) if trial.block is not None else None,
        "state": "maturing" if view.maturing.is_maturing else "complete",
        "maturing": {
            "days_elapsed": view.maturing.days_elapsed,
            "days_required": view.maturing.days_required,
            "gap_count": trial.gap_count,
        },
    }


def _review_detail(store, trial: _ReviewTrial, now: datetime) -> dict:
    view = trial.view
    changed_at = datetime.strptime(view.changed_at, _DT_FMT)
    state = "maturing" if view.maturing.is_maturing else "complete"
    detail = _review_summary(trial)
    focus = follow_up_admission(store, now=now)["focus_pin"]
    if not focus["available"]:
        focus = {**focus, "message": {
            "active_trial": "Focus is unavailable while a Trial is live. It will not queue behind this change.",
            "active_focus": "A Focus is already active.",
            "reconciliation_required": "Focus is unavailable until follow-up admission is reconciled.",
        }[focus["reason"]]}
    detail.update({
        "before_period": {
            "start": (changed_at - _MATURE_WINDOW).strftime(_DT_FMT),
            "end": view.changed_at,
        },
        "trial_period": {
            "start": view.changed_at,
            "end": min(now, changed_at + _MATURE_WINDOW).strftime(_DT_FMT),
        },
        "focus": focus,
        "readiness": (
            {
                "label": "Maturing",
                "message": "No verdict is ready while evidence accrues.",
            }
            if state == "maturing" else {
                "label": "Ready to judge",
                "message": "This Trial is ready for a before-and-Trial read.",
            }
        ),
        "evidence": _trial_evidence(store, view, changed_at, now,
                                    block=trial.block),
        "limits": _trial_limits(trial),
    })
    # The selected Trial's paired reads (#660), which Changes' Trial view renders:
    # the settings diff, the Before-vs-Trial envelopes, the rescue log, and the
    # per-day accrual, each scoped to the two periods above.
    detail.update(trial_breakdown(
        store,
        parameter=view.parameter,
        slot=view.slot,
        changed_at=changed_at,
        target_metrics=view.target_metrics,
        before_period=detail["before_period"],
        trial_period=detail["trial_period"],
        before=view.before,
        after=view.after,
        block=trial.block,
    ))
    return detail


def _trial_evidence(store, view: TrialView, changed_at: datetime, now: datetime,
                    *, block: Optional[tuple] = None) -> List[dict]:
    """The selected Trial's period-aligned targets, guardrails, and rescue context.

    ``block`` is the Trial's captured wrap-aware arc. For a block-bound I:C Trial
    (#581) the arc and rescue context read only meals inside it, so out-of-block
    meals never feed a block-scoped Trial's selected evidence — the same cohort the
    roster maturity and breakdown use — while the clock-based tir/tbr guardrails
    stay day-wide (the change is programmed to one block, but a low it caused can
    land outside that block). For a basal block Trial (#506) the clock metrics read
    the readings inside the block, as its comparison does, and the meal arc stays
    day-wide context.
    """
    from .outcomes import compute_metrics
    from .outcomes_trend import post_meal_arc, post_meal_rescue_context
    from .rescue_evidence import eligible_carb_entries

    before_start = changed_at - _MATURE_WINDOW
    trial_end = min(now, changed_at + _MATURE_WINDOW)
    cgm = store.cgm_readings()
    bolus = store.bolus_events()
    carbs = store.carb_entries()
    before_cgm = [reading for reading in cgm if before_start <= reading.t < changed_at]
    trial_cgm = [reading for reading in cgm if changed_at < reading.t <= trial_end]
    meal_block = block if view.parameter == "carb_ratio" else None
    clock_block = block if view.parameter == "basal_rate" else None

    # Each meal is read at its first bolus, and only a meal's first bolus ends an
    # earlier meal's arc (ADR 470).
    meals = [meal.first for meal in group_meals(bolus)]

    def in_cohort(dose) -> bool:
        return meal_block is None or _in_block(dose.t, meal_block)

    before_meals = [dose for dose in meals
                    if before_start <= dose.t < changed_at and in_cohort(dose)]
    trial_meals = [dose for dose in meals
                   if changed_at < dose.t <= trial_end and in_cohort(dose)]

    def in_clock(readings):
        return [r for r in readings if clock_block is None or _in_block(r.t, clock_block)]

    before_metrics = compute_metrics(in_clock(before_cgm))
    trial_metrics = compute_metrics(in_clock(trial_cgm))

    def role(key: str) -> str:
        return "target" if key in view.target_metrics else "guardrail"

    evidence = [
        {
            "key": key,
            "role": role(key),
            "before": {"value": getattr(before_metrics, attr),
                       "n_readings": before_metrics.n_readings},
            "trial": {"value": getattr(trial_metrics, attr),
                      "n_readings": trial_metrics.n_readings},
        }
        for key, attr in (("tir", "tir"), ("tbr", "tbr_lvl1"))
    ]
    before_arc = post_meal_arc(before_meals, before_cgm, ctx_meals=meals)
    trial_arc = post_meal_arc(trial_meals, trial_cgm, ctx_meals=meals)
    rescue = post_meal_rescue_context(
        trial_meals,
        [entry for entry in eligible_carb_entries(carbs, trial_end)
         if changed_at < entry.t <= trial_end],
        trial_cgm,
        ctx_meals=meals,
    )
    evidence.append({
        "key": "arc",
        "role": role("arc"),
        "before": _arc_evidence(before_arc),
        "trial": _arc_evidence(trial_arc),
        "rescue_context": rescue.to_dict(),
    })
    return evidence


def _arc_evidence(arc: tuple) -> dict:
    peak, nadir, n_peak, n_nadir = arc
    return {"peak": peak, "nadir": nadir, "n_peak": n_peak, "n_nadir": n_nadir}


def _trial_limits(trial: _ReviewTrial) -> List[str]:
    """The explicit limits of one observational before-and-Trial read.

    A block-scoped I:C Trial no longer carries the general non-isolation caveat
    (#581): its evidence *is* isolated to the observed block, so ADR 579 §5's
    "This is general I:C evidence" line is amended away for every block Trial.
    """
    limits = [
        "The evidence is limited to the selected Before and Trial periods.",
        "Observed movement does not establish that the setting caused it.",
    ]
    if trial.gap_count:
        gap_word = "gap" if trial.gap_count == 1 else "gaps"
        verb = "remains" if trial.gap_count == 1 else "remain"
        limits.append(f"{trial.gap_count} data {gap_word} {verb} in the post-change period.")
    return limits


def _unavailable(reason):
    return {"version": "386:1", "state": "unavailable", "reason": reason}


def _retained_trial(store, record, now, *, saved=None):
    parameter = record["parameter"]
    target = _PROFILE_TARGET if parameter == "profile" else _TARGET_METRIC[parameter]
    start = datetime.fromisoformat(record["changed_at"])
    if saved is None and _maybe_saved(record):
        saved = store_saved_blocks(store)
    block = retained_block(record, store.settings_snapshots(), saved)
    end = min(now, start + _MATURE_WINDOW)
    # Store._select is half-open [start, end); _maturing/_data_gaps filter the
    # open-start, closed-end (changed_at, end]. Request [start, end + 1s) so the
    # store's exclusive end can't silently drop a reading landing exactly on end.
    read_start = start.strftime(_DT_FMT)
    read_end = (end + timedelta(seconds=1)).strftime(_DT_FMT)
    if target[0] == "arc":
        # Meals form over the whole bolus history, as the roster's do, so which
        # bolus opened a meal never depends on the change instant (ADR 470);
        # `_maturing` keeps only the meals after the change.
        times = [meal.t for meal in group_meals(store.bolus_events(end=read_end))
                 if block is None or _in_block(meal.t, block)]
    else:
        times = [r.t for r in store.cgm_readings(start=read_start, end=read_end)]
    return _ReviewTrial(TrialView(parameter, record["changed_at"], target,
                                  _maturing(start, end, TRIAL_WINDOW_DAYS, times),
                                  slot=record["slot"], before=record["before"], after=record["after"],
                                  deliberate=record.get("reconciliation", {}).get("state") == "available"),
                        _data_gaps(start, end, times), block, record.get("members"))


# --- Done: a Setting card's acknowledgment, recorded as a Plan (ADR 518) -----

# A Plan item's family → the profile setting it programs.
_PLAN_PARAMETER = {"basal": "basal_rate", "isf": "isf", "ic": "carb_ratio", "target": "target_bg"}


def plan_subject(plan) -> Optional[str]:
    """The guidance subject a Plan acknowledges: the one its decision recorded,
    else (a Plan from before decisions were recorded) its items' one setting."""
    context = plan["decision_context"]
    if context.get("state") == "available" and context.get("subjects"):
        return context["subjects"][0]
    families = {item.get("type") for item in plan["items"] if isinstance(item, dict)}
    if len(families) != 1 or not families <= _PLAN_PARAMETER.keys():
        return None
    return f"setting:{_PLAN_PARAMETER[families.pop()]}"


def _is_open(plan) -> bool:
    return (plan["reconciliation"].get("state") != "available"
            and plan["withdrawal"].get("state") != "available")


def open_plans(store) -> Dict[str, dict]:
    """Each subject's open acknowledgment: a recorded Plan neither resolved nor
    withdrawn, the newest per subject (ADR 518)."""
    out = {}
    for plan in store.follow_up_records("plan"):  # newest first
        subject = plan_subject(plan)
        if subject is not None and subject not in out and _is_open(plan):
            out[subject] = plan
    return out


def _programmed(profile, parameter, minute):
    return getattr(next((s for s in reversed(profile.segments) if s.start_min <= minute),
                        profile.segments[0]), parameter)


def _moved(plan, before, after) -> Optional[bool]:
    """Whether ``after``'s active profile programs any of the Plan's items'
    settings differently from ``before``'s, at each item's start minute and at
    pump precision; None when either read has no active profile or an item names
    no setting or integer start minute (an incomparable Plan, which only Undo
    closes)."""
    from .result import plan_value
    old, new = before.settings.active(), after.settings.active()
    if old is None or new is None or not old.segments or not new.segments:
        return None
    moved = False
    for item in plan["items"]:
        parameter = _PLAN_PARAMETER.get(item.get("type")) if isinstance(item, dict) else None
        minute = item.get("start_min") if parameter else None
        if type(minute) is not int or not 0 <= minute < 1440:
            return None
        precision = "isf" if parameter == "target_bg" else parameter
        if (plan_value(_programmed(old, parameter, minute), precision)
                != plan_value(_programmed(new, parameter, minute), precision)):
            moved = True
    return moved


def _resolve_from_read(store, recorded_at, snapshots):
    """Close each open acknowledgment the latest read after it decides (ADR 518).

    The read at or before the decision is what the person saw; the latest read
    captured after it is what the pump now runs. A setting that moved there, to
    any value, closes the acknowledgment on the pump at once: the pump change is
    its Trial, by the ordinary rule. A setting that did not move decides only
    once the store holds pump data from after the decision, so a sync of what
    the pump uploaded before it never reads as not on the pump.
    """
    if not snapshots:
        return
    latest = snapshots[-1]
    horizon = store.latest_cgm_or_basal_timestamp()
    for plan in store.follow_up_records("plan"):
        if not _is_open(plan):
            continue
        decision = datetime.fromisoformat(plan["applied_at"])
        before = next((s for s in reversed(snapshots) if s.captured_at <= decision), None)
        if before is None or latest.captured_at <= decision:
            continue
        moved = _moved(plan, before, latest)
        if moved is None or (not moved and (horizon is None or horizon <= decision)):
            continue
        store.save_follow_up_record({**plan, "reconciliation": {
            "version": "386:1", "state": "available", "applied_at": plan["id"], "trial_id": None,
            "established_at": recorded_at.strftime(_DT_FMT), "on_pump": moved,
            "observed_snapshot": {"captured_at": latest.captured_at.strftime(_DT_FMT),
                                  "active_idp": latest.settings.active_idp}}})


def _link_from_read(store, recorded_at):
    """Link a Trial to the acknowledgment a read closed on the pump (ADR 463
    decision 7, as ADR 518 amends it).

    A Trial with no receipt and no captured carb-ratio block links to a Plan a
    read closed on the pump with no Trial when the Trial is of the Plan's
    setting (a slotted Trial's slot being one of its item start minutes) or is
    whole-profile, its change time is within a day of the closing read, and the
    match is one-to-one both ways with no Trial already naming the Plan. It
    never compares the Plan's recorded time. Only the Trial's receipt is written;
    nothing rewrites a Plan.
    """
    trials = store.follow_up_records("trial")
    named = {trial["reconciliation"].get("applied_at") for trial in trials
             if trial["reconciliation"].get("state") == "available"}
    plans = [plan for plan in store.follow_up_records("plan")
             if plan_verdict(plan)["state"] == "on_pump"
             and plan["reconciliation"].get("trial_id") is None and plan["id"] not in named]
    unlinked = [trial for trial in trials
                if trial["reconciliation"].get("state") != "available"
                and not (trial["parameter"] == "carb_ratio" and trial.get("block"))]

    def qualifies(trial, plan):
        read = datetime.fromisoformat(plan["reconciliation"]["observed_snapshot"]["captured_at"])
        if abs(datetime.fromisoformat(trial["changed_at"]) - read) > timedelta(days=1):
            return False
        if trial["parameter"] == "profile":
            return True
        starts = {item.get("start_min") for item in plan["items"]
                  if item.get("type") == _PLAN_TYPE.get(trial["parameter"])}
        if trial.get("slot") is None:
            return bool(starts)
        hour, minute = map(int, trial["slot"].split(":"))
        return hour * 60 + minute in starts

    for plan in plans:
        matches = [trial for trial in unlinked if qualifies(trial, plan)]
        if len(matches) != 1 or sum(qualifies(matches[0], other) for other in plans) != 1:
            continue
        trial = matches[0]
        store.save_follow_up_record({**trial, "reconciliation": {
            "version": "386:1", "state": "available", "applied_at": plan["id"], "trial_id": trial["id"],
            "established_at": recorded_at.strftime(_DT_FMT),
            "observed_snapshot": plan["reconciliation"]["observed_snapshot"]}})


def plan_verdict(plan) -> dict:
    """A recorded Plan's one served verdict (ADR 518), read off its record:
    ``withdrawn`` (Undo), ``waiting`` for the pump, or resolved ``on_pump`` (a
    read showed the setting moved, or a Trial's transition carried it out) or
    ``not_on_pump``. ``read_at`` is the deciding read's capture time, null until
    resolved. A Plan an earlier build confirmed from a holding read is on the
    pump."""
    receipt = plan["reconciliation"]
    if plan["withdrawal"].get("state") == "available":
        return {"state": "withdrawn", "read_at": None}
    if receipt.get("state") != "available":
        return {"state": "waiting", "read_at": None}
    on_pump = receipt.get("trial_id") is not None or receipt.get("on_pump", True)
    return {"state": "on_pump" if on_pump else "not_on_pump",
            "read_at": (receipt.get("observed_snapshot") or {}).get("captured_at")}


def with_plan_verdicts(store, records):
    """Each recorded Plan with its served verdict, for the Plan history read."""
    return [{**plan, "verdict": plan_verdict(plan)} for plan in records]


def _blocks(plan) -> List[dict]:
    """The decision's blocks as its card showed them: each served action's span,
    the value programmed when it was recorded, and the suggestion."""
    from .guidance import _schedule_at
    context, deliverable = plan["decision_context"], plan["deliverable"]
    actions = context.get("action") if context.get("state") == "available" else None
    source = ((deliverable.get("source_profile") or {}).get("segments")
              if deliverable.get("state") == "available" else None)
    if not isinstance(actions, list) or not source:
        return []
    return [{"start_min": action["start_min"], "end_min": action["end_min"],
             "current": _schedule_at(source, action["start_min"]).get(action["parameter"]),
             "recommended": action["recommended"], "units": action["units"]}
            for action in actions]


def setting_acknowledgments(store) -> Dict[str, dict]:
    """Each Setting subject's served Done state (ADR 518), when it has one.

    The subject's newest acknowledgment that was not taken back decides it:
    ``waiting`` while open; ``not_on_pump`` once a sync found the setting
    unchanged, until the next pump change of that setting or a snooze of the
    subject decided after that read. One resolved on the pump serves nothing:
    its Trial carries it.
    """
    snoozed = {row["subject"]: row["decided_at"] for row in store.guidance_preferences()}
    changed = {}
    for trial in store.follow_up_records("trial"):
        changed[trial["parameter"]] = max(changed.get(trial["parameter"], ""), trial["changed_at"])
    decided, out = set(), {}
    for plan in store.follow_up_records("plan"):  # newest first
        subject = plan_subject(plan)
        if subject is None or subject in decided or plan["withdrawal"].get("state") == "available":
            continue
        decided.add(subject)
        verdict = plan_verdict(plan)
        read = verdict["read_at"]
        if verdict["state"] == "not_on_pump" and (
                changed.get(subject.split(":", 1)[1], "") > read or (snoozed.get(subject) or "") > read):
            continue
        if verdict["state"] in ("waiting", "not_on_pump"):
            out[subject] = {"state": verdict["state"], "applied_at": plan["applied_at"],
                            "read_at": read, "blocks": _blocks(plan)}
    return out


def follow_up_admission(store, *, now):
    """Project the committed frontier; an unreconciled input grants no permission."""
    frontier = store.follow_up_frontier()
    verdict = {"state": "available", "reason": "no_active_change", "active_kind": None,
               "active_id": None, "maturity": None, "can_finish_trial": False,
               "focus_pin": {"available": False, "reason": "reconciliation_required"},
               "ending": _unavailable("not_recorded")}
    if frontier is None or frontier["reconciled_input_revision"] != store.input_data_revision():
        return {**verdict, "state": "unavailable", "reason": "reconciliation_required"}
    record = _served_frontier_record(store, frontier)
    if record:
        verdict["ending"] = record["ending"]
        if "kind" not in record["ending"]:
            if datetime.fromisoformat(record["changed_at"]) + _WATCH_HORIZON <= now:
                return {**verdict, "state": "unavailable", "reason": "reconciliation_required"}
            trial = _retained_trial(store, record, now)
            verdict.update(active_kind="trial", active_id=record["id"], reason="active_trial",
                           maturity=trial.view.maturing.to_dict(),
                           can_finish_trial=not trial.view.maturing.is_maturing)
    focus = store.active_focus()
    if verdict["active_kind"] is None and focus:
        focus = _focus_identity(store, focus)
        if not is_pinnable(focus["lever"], focus.get("pattern_key")):
            return {**verdict, "state": "unavailable", "reason": "reconciliation_required"}
        verdict.update(active_kind="focus", active_id=focus["id"], reason="active_focus")
    reason = verdict["reason"] if verdict["active_kind"] else None
    verdict["focus_pin"] = {"available": reason is None, "reason": reason}
    return verdict


def capture_ending(store, record, *, kind, effective_at, recorded_at, data_cutoff, conclusion=None):
    """Save the comparison and release this identity in the caller's transaction.

    The data cutoff bounds every evidence read but the retained context, which
    was read once when the record was first recorded. The comparison answers a
    context whose pump read is later than the cutoff, or that names none,
    unavailable ``context_after_ending`` (ADR 442, ADR 462).
    """
    from .follow_up_comparison import compare_follow_up
    if "kind" in record["ending"]:
        return record
    ending = {"version": "386:1", "state": "available", "kind": kind,
              "effective_at": effective_at.strftime(_DT_FMT),
              "recorded_at": recorded_at.strftime(_DT_FMT), "conclusion": conclusion}
    proposed = {**record, "ending": ending}
    compared = compare_follow_up(store, record=proposed, data_cutoff=data_cutoff,
                                 input_revision=store.input_data_revision())
    comparison = compared["comparison"]
    ending["assessment"] = {**{key: value for key, value in comparison.items() if key != "views"},
                            "version": "386:1", **comparison["availability"],
                            "comparison_context": compared["comparison_context"],
                            "input_revision": store.input_data_revision(),
                            "data_cutoff": data_cutoff.strftime(_DT_FMT)}
    # The clock envelopes alone, so the saved ending can draw its curve (ADR 463).
    clocks = {arm: {"clock": view["clock"]} for arm, view in comparison["views"].items() if "clock" in view}
    if clocks:
        ending["assessment"]["views"] = clocks
    # Adherence carries metadata as well as rows; Store's bounded row validator
    # consumes only its displayed Before/After/assessment rows.
    if "adherence" in comparison:
        ending["assessment"]["adherence"] = {key: comparison["adherence"][key]
            for key in ("before", "after", "assessment")}
    if record["kind"] == "focus":
        store.resolve_focus(record["id"], "resolved" if kind == "manual" else "dropped")
        proposed["status"] = "resolved" if kind == "manual" else "dropped"
    return store.save_follow_up_record(proposed)


class _ReversalHistory:
    """The detector's history the reversal check reads, each part read once.

    One reconcile shares one instance across every open record it evaluates
    (ADR 442), so a pass costs one scan of each history rather than one per
    record. The pass writes only follow-up records, never these inputs.
    """

    def __init__(self, store):
        self._store = store
        self._doses = {}

    @cached_property
    def switches(self):
        return _pump_changes(self._store.settings_snapshots())

    @cached_property
    def slots(self):
        return basal_slot_regimes(self._store.basal_events())

    def doses(self, parameter):
        if parameter not in self._doses:
            self._doses[parameter] = dose_regimes(self._store.bolus_events(), parameter)
        return self._doses[parameter]


def _reversal_at(store, record, history=None):
    history = _ReversalHistory(store) if history is None else history
    start = datetime.fromisoformat(record["changed_at"])
    switches = history.switches
    for previous, current in zip(switches, switches[1:]):
        if previous.at == start and _switch_reverts(previous, current, _MATURE_WINDOW):
            return current.at
    if record["parameter"] == "profile" or (record["parameter"] == "carb_ratio" and record.get("block")):
        return None
    if record["parameter"] == "basal_rate":
        # A whole-day basal change has no slot; midnight's history is its own (#510).
        regimes = history.slots.get(_slot_index(record.get("slot") or "00:00"), [])
    else:
        regimes = history.doses(record["parameter"])
    for previous, changed, returned in zip(regimes, regimes[1:], regimes[2:]):
        if ((changed.start == start
             or same_change(record, parameter=record["parameter"], slot=record.get("slot"), block=None,
                            legacy=changed.legacy_start, before=previous.value, after=changed.value))
                and _is_revert([previous, changed, returned], _MATURE_WINDOW)):
            return returned.start
    return None


def _end_open_records(store, trials, *, now, recorded_at):
    """End every retained Trial record by one rule, oldest first (ADR 442).

    ``reverted`` at the detector's reversal; else ``superseded`` at the first of
    this reconcile's detected changes after the record, outside its own Edit and
    inside its watch window; else ``expired_unreviewed`` once that window has
    passed. Each saved assessment reads evidence only up to its ending instant.
    Every detected change has a retained record by now, so each has an Edit.
    The detector's history is read once for the whole pass.
    """
    records = sorted(store.follow_up_records("trial"), key=lambda r: (r["changed_at"], r["id"]))
    edit_of, _ = _group_edits(records)
    history = _ReversalHistory(store)
    starts = sorted((datetime.fromisoformat(t.view.changed_at), edit_of[_review_id(t.view, t.block)])
                    for t in trials)
    for retained in records:
        record = store.follow_up_record("trial", retained["id"])
        if "kind" in record["ending"]:
            continue
        changed = datetime.fromisoformat(record["changed_at"])
        expiry = changed + _WATCH_HORIZON
        reversal = _reversal_at(store, record, history)
        successor = next((start for start, edit in starts
                          if changed < start < expiry and edit != edit_of[record["id"]]), None)
        if reversal is not None:
            capture_ending(store, record, kind="reverted", effective_at=reversal, recorded_at=recorded_at, data_cutoff=reversal)
        elif successor is not None:
            capture_ending(store, record, kind="superseded", effective_at=successor, recorded_at=recorded_at, data_cutoff=successor)
        elif now >= expiry:
            capture_ending(store, record, kind="expired_unreviewed", effective_at=expiry, recorded_at=recorded_at, data_cutoff=expiry)


def reconcile_follow_up(store, *, now, recorded_at):
    """Reconcile observed inputs atomically; the caller owns commit and cache."""
    from .follow_up_comparison import capture_comparison_context
    # Advance even an empty frontier through Store's transaction-only interface.
    frontier = store.follow_up_frontier()
    trials = _reviewable_trials(store, now, horizon_start=datetime.min)
    trials.sort(key=lambda t: (-datetime.fromisoformat(t.view.changed_at).timestamp(), _review_id(t.view, t.block)))
    # Parsed once: this runs inside the one reserved writer, and the history
    # grows by a read every hourly fetch, so a parse per Trial held the write
    # lock long enough for every concurrent Store.open to time out.
    snapshots = sorted(store.settings_snapshots(), key=lambda s: s.captured_at)
    for trial in trials:
        view = trial.view
        identity = _review_id(view, trial.block)
        record = store.follow_up_record("trial", identity)
        if record is None:
            unit = {"basal_rate": "U/h", "carb_ratio": "g/U", "isf": "mg/dL/U", "target_bg": "mg/dL"}.get(view.parameter)
            observed = {"version": "386:1", "state": "available", "captured_at": recorded_at.strftime(_DT_FMT),
                        "input_revision": store.input_data_revision(), "action": None,
                        "explanation": "Observed programmed setting transition; original decision is not recorded.",
                        "source_window": {"start": view.changed_at, "end": now.strftime(_DT_FMT)},
                        "policy": "386:1", "subjects": [identity], "occurrences": [],
                        "settings": ([{"value": view.before, "unit": unit}, {"value": view.after, "unit": unit}] if unit else []),
                        "support": {}, "unknowns": ["Original user decision is unavailable."]}
            record = store.save_follow_up_record({"kind": "trial", "id": identity, "version": "386:1",
                "parameter": view.parameter, "slot": view.slot, "changed_at": view.changed_at,
                "before": view.before, "after": view.after, "block": trial.block, "members": trial.members,
                "first_observed_at": recorded_at.strftime(_DT_FMT), "observed_context": observed,
                "comparison_context": capture_comparison_context(store, at=now, input_revision=store.input_data_revision())})
        _reconcile_plan(store, record, recorded_at, snapshots)
    _resolve_from_read(store, recorded_at, snapshots)
    _link_from_read(store, recorded_at)
    _end_open_records(store, trials, now=now, recorded_at=recorded_at)
    newest = trials[0] if trials else None
    later = newest is not None and (not frontier or frontier["detected_at"] is None or newest.view.changed_at > frontier["detected_at"])
    if later:
        identity = _review_id(newest.view, newest.block)
        frontier = store.advance_follow_up_frontier(identity, newest.view.changed_at, reconciled_input_revision=store.input_data_revision())
    focus = store.active_focus()
    if focus:
        focus = _focus_identity(store, focus)
    active_trial = _served_frontier_record(store, frontier)
    if focus and (not is_pinnable(focus["lever"], focus.get("pattern_key")) or (active_trial and "kind" not in active_trial["ending"])):
        record = store.follow_up_record("focus", focus["id"])
        preempt = is_pinnable(focus["lever"], focus.get("pattern_key"))
        capture_ending(store, record, kind="trial_preempted" if preempt else "lever_unavailable",
                       effective_at=datetime.fromisoformat(active_trial["changed_at"]) if preempt else recorded_at,
                       recorded_at=recorded_at, data_cutoff=now)
    store.advance_follow_up_frontier(frontier["trial_id"] if frontier else None,
        frontier["detected_at"] if frontier else None, reconciled_input_revision=store.input_data_revision())
    return follow_up_admission(store, now=now)


def trial_is_active(store, *, now, **unused):
    return follow_up_admission(store, now=now)["active_kind"] == "trial"


def active_watched_change(store, basal_events, bolus_events, snaps, *, now, cgm_readings=()):
    """Legacy view adapter for the single read-only admission verdict."""
    verdict = follow_up_admission(store, now=now)
    if verdict["active_kind"] == "trial":
        return _retained_trial(store, store.follow_up_record("trial", verdict["active_id"]), now).view
    if verdict["active_kind"] == "focus":
        record = store.follow_up_record("focus", verdict["active_id"])
        return focus_view(record)
    return None


def _reconcile_plan(store, record, recorded_at, snapshots):
    """A receipt needs one applied full schedule and an observed transition."""
    from dataclasses import asdict
    from .guidance import schedule_matches
    if record["reconciliation"]["state"] == "available":
        return
    changed = datetime.fromisoformat(record["changed_at"])
    previous = next((s for s in reversed(snapshots) if s.captured_at < changed), None)
    observed = next((s for s in snapshots if s.captured_at == changed), None)
    if previous is None or observed is None or not previous.settings.active() or not observed.settings.active():
        return
    old = [asdict(s) for s in previous.settings.active().segments]
    actual = [asdict(s) for s in observed.settings.active().segments]
    matches = []
    for plan in store.follow_up_records("plan"):
        deliverable = plan["deliverable"]
        if (plan["withdrawal"]["state"] == "available" or plan["reconciliation"]["state"] == "available"
                or deliverable.get("state") != "available"
                or datetime.fromisoformat(plan["applied_at"]) > changed):
            continue
        source, rows = deliverable.get("source_profile"), deliverable.get("rows")
        if not source or not rows or schedule_matches(rows, old):
            continue
        if schedule_matches(source["segments"], old) and schedule_matches(rows, actual):
            if record["parameter"] == "carb_ratio" and record.get("block"):
                groups = _annotated_ic_groups([plan])
                group = _match_unique_group(
                    [(s["start_min"], s["carb_ratio"]) for s in old],
                    [(s["start_min"], s["carb_ratio"]) for s in actual], changed, groups)
                if group is None or list(group["block"]) != list(record["block"]):
                    continue
            matches.append(plan)
    if len(matches) != 1:
        return
    plan = matches[0]
    receipt = {"version": "386:1", "state": "available", "applied_at": plan["id"],
               "trial_id": record["id"], "established_at": recorded_at.strftime(_DT_FMT),
               "observed_snapshot": {"captured_at": observed.captured_at.strftime(_DT_FMT),
                                     "active_idp": observed.settings.active_idp},
               "matched_deliverable": plan["deliverable"], "block": record.get("block")}
    store.save_follow_up_record({**record, "reconciliation": receipt})
    store.save_follow_up_record({**plan, "reconciliation": receipt})


def reconcile_ingested_follow_up(store):
    """Completion adapter shared by standalone ingestion, the fetch loop and the
    guidance preference writes, which advance the input revision the same way."""
    times = ([row.t for row in store.cgm_readings()] + [row.t for row in store.basal_events()]
             + [row.t for row in store.bolus_events()] + [row.captured_at for row in store.settings_snapshots()])
    now = max(times) if times else datetime.now()
    with store.follow_up_transaction():
        return reconcile_follow_up(store, now=now, recorded_at=wall_clock_now(after=store.latest_server_stamp()))
