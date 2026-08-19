"""Trial + Focus — the single active *watched change* on the outcomes trend (#244).

A **Trial** is a pump-programmable value (basal / ISF / I:C / target) the user has
flipped and is now watching for an outcome. It is **derived-live** from the
setting-change epoch (``epochs.py``) every run — never stored — following the
``result.Settling`` precedent (ADR 0029). A **Focus** is a behavioral lever the user
pins by hand; it is the one persisted object (the ``focus`` table), because it has no
derivable source.

**At most one watched change is active at a time — Trial XOR Focus, pump wins**
(ADR 0029): a Focus pin is rejected while a Trial is live, and a setting change
detected mid-Focus *preempts and drops* the Focus. So the outcomes payload exposes a
**single** active watched-change object, never two lists.

The target metric a Trial foregrounds is inferred from the changed parameter + slot
and always selects an **existing** ``/outcomes/trend`` series (ADR 0028 §4 — never
invent a metric): basal→``tbr``, ISF→``tir``, I:C→``arc``, target→``tir``, a
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
from typing import Dict, List, Optional, Union

from .epochs import _DOSE_ATTR, _MIN_EPOCH_DAYS, _settled_days
from .analyzers.scenario.anchors import _is_meal
from .analyzers.scenario.levers import (
    Exposure,
    Lever,
    exposure as lever_exposure,
    title as lever_title,
)
from .trial_evidence import trial_breakdown

_DT_FMT = "%Y-%m-%d %H:%M:%S"

# The changed parameter → the existing trend series its before/after is read off
# (ADR 0028 §4). Every value here is a series ``/outcomes/trend`` already emits
# (``tir``/``tbr`` in ``metrics``, ``arc`` the top-level arc object).
_TARGET_METRIC: Dict[str, List[str]] = {
    "basal_rate": ["tbr"],
    "isf": ["tir"],
    "carb_ratio": ["arc"],
    "target_bg": ["tir"],
}
# A whole-profile switch or untargeted raw edit has no single target — overall
# TIR + the post-meal arc (CONTEXT.md "Trial"; ADR 0029 §3).
_PROFILE_TARGET = ["tir", "arc"]

# A Trial's maturing window is a fixed backend fact — 14 days of target-metric
# data-days — never a caller's trend or analysis window (#18): the dock and the
# Verify roster must report the same maturity for the same change no matter what
# window the surface was tiled at.
TRIAL_WINDOW_DAYS = 14
_MATURE_WINDOW = timedelta(days=TRIAL_WINDOW_DAYS)

# A Trial stays foregrounded while its change is recent — through the maturing
# window plus a review window after, then it ages out into "just how things are
# now". Two windows is the watch horizon (a derive-live policy, no stored
# keep-decision to end it).
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

    ``start`` is the conservative boundary instant (the first observation back at this
    value), matching ``epochs``' change-point placement. The regime list is the value
    history the Trial's change-point and revert rule read off.
    """

    start: datetime
    value: float


def _regimes_from_days(days: List[tuple]) -> List[Regime]:
    """Collapse ``[(day, rep_value, first_time)]`` (ascending) into value regimes.

    Consecutive days at the same representative value are one regime; the regime's
    ``start`` is that run's first observation. This is the same value history
    ``epochs``' newest→oldest change walk reads, exposed as a list.
    """
    regimes: List[Regime] = []
    for _, value, first_t in days:
        if not regimes or regimes[-1].value != value:
            regimes.append(Regime(start=first_t, value=value))
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
    first_t: Dict[object, datetime] = {}
    for t, v in obs:
        by_day.setdefault(t.date(), []).append(round(float(v), 6))
        first_t.setdefault(t.date(), t)
    days: List[tuple] = []
    for day, values in by_day.items():
        counts = Counter(values)
        rep = max(counts.items(), key=lambda kv: (kv[1], kv[0]))[0]
        days.append((day, rep, first_t[day]))
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
        by_slot.setdefault(s, []).append((day, rep, samples[0].t))

    out: Dict[int, List[Regime]] = {}
    for s, days in by_slot.items():
        days.sort(key=lambda d: d[0])
        out[s] = _regimes_from_days(days)
    return out


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
    """The active Trial — a derived-live view, never a stored row."""

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
    # A block-scoped I:C candidate bound to one complete annotated applied Plan group
    # (#581) carries that group's captured wrap-aware arc and member list. The arc is
    # Trial-owned identity: later profile repartitions cannot retarget it, because it
    # is read off the immutable provenance, never off current settings.
    block: Optional[tuple] = None
    members: Optional[list] = None


def _slot_label(slot: int, slot_minutes: int = 30) -> str:
    m = slot * slot_minutes
    return f"{m // 60:02d}:{m % 60:02d}"


def _candidate(parameter, slot, regimes: List[Regime]) -> Optional[_Cand]:
    """The latest change-point in ``regimes`` as a candidate, or ``None`` if constant."""
    if len(regimes) < 2:
        return None
    return _Cand(parameter, slot, regimes[-1].start,
                 regimes[-2].value, regimes[-1].value, regimes)


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
    """One observed active-profile switch and what it changed.

    ``diffs`` is the outgoing→incoming :func:`~ciq_autotune.settings.diff_profiles`
    result; an **empty** list means the diff couldn't be taken (outgoing profile gone)
    or the two profiles are identical, which classifies as whole-profile.
    """

    at: datetime
    diffs: list


def _profile_switches(snapshots) -> List[_Switch]:
    """Every ``active_idp`` switch in the changelog, chronological, already diffed."""
    if not snapshots:
        return []
    from .settings import changelog, diff_profiles
    by_time = {s.captured_at: s for s in snapshots}
    out: List[_Switch] = []
    for ch in changelog(snapshots):
        if ch.parameter != "active_idp":
            continue
        snap = by_time.get(ch.at)
        old = snap.settings.by_idp(ch.old_schedule) if snap else None
        new = snap.settings.by_idp(ch.new_schedule) if snap else None
        diffs = [] if (old is None or new is None) else diff_profiles(old, new)
        out.append(_Switch(at=ch.at, diffs=diffs))
    out.sort(key=lambda s: s.at)
    return out


def _switch_reverts(prev: Optional[_Switch], cur: _Switch,
                    mature_window: timedelta) -> bool:
    """Did ``cur`` switch straight back to what ``prev`` switched away from, in-window?

    Compared on the *values* each switch moved, not the profile ids: a switch whose
    diff is the exact inverse of the preceding one, landing inside the maturing
    window, is a walk-back — that Trial closes and spawns no second Trial, the same
    rule the dose stream gets from :func:`_is_revert`.
    """
    if prev is None or not prev.diffs or not cur.diffs:
        return False
    if (cur.at - prev.at) > mature_window:
        return False
    was = sorted((d.parameter, d.slot or "", d.before, d.after) for d in prev.diffs)
    back = sorted((d.parameter, d.slot or "", d.after, d.before) for d in cur.diffs)
    return was == back


def _switch_candidates(snapshots, mature_window: timedelta) -> List[_Cand]:
    """Trial candidates supplied by the settings snapshots themselves (#463).

    An active-profile switch is authoritative on its own (#331): the diff names what
    moved and the switch snapshot is the change instant, so the Trial starts there
    rather than waiting for the dose stream to re-observe the new value across two
    days. Exactly one changed parameter is a targeted candidate; zero or two-plus
    stay whole-profile.
    """
    cands: List[_Cand] = []
    switches = _profile_switches(snapshots)
    # A walk-back closes the switch it undid, so both ends of the pair drop out —
    # otherwise the fall-through to the next-most-recent change would resurrect the
    # very switch that was reverted.
    closed = set()
    for i, sw in enumerate(switches):
        if i and _switch_reverts(switches[i - 1], sw, mature_window):
            closed.update((i - 1, i))
    for i, sw in enumerate(switches):
        if len(sw.diffs) == 1:
            d = sw.diffs[0]
            cands.append(_Cand(d.parameter, d.slot, sw.at, d.before, d.after, [],
                               switch=True, reverted=i in closed))
        else:
            cands.append(_Cand("profile", None, sw.at, None, None, [],
                               switch=True, reverted=i in closed))
    return cands


def detect_trial(basal_events, bolus_events, snapshots, *, now: datetime,
                 cgm_readings=(), plan_history=None
                 ) -> Optional[TrialView]:
    """The active Trial from the setting-change epoch, or ``None`` (ADR 0029).

    Collects each parameter's latest change-point (ISF/I:C/target from the
    dose-stamped stream, basal per-slot from the dense feed) within the watch horizon,
    **plus every active-profile switch in the settings snapshots**, which is a
    candidate in its own right (#463) — the switch diff is authoritative (#331), so a
    Trial starts at the switch instant instead of waiting for the dose stream's
    two-day debounce to re-observe the new value. Then, newest change first:

    * skips a **revert** (walk-back to baseline in-window) — that setting's Trial
      closed and spawns no second Trial (:func:`_is_revert`) — and considers the next
      most-recent change, so a revert on one parameter doesn't hide a live Trial on
      another;
    * classifies the surviving anchor as a **whole-profile switch** (target = overall
      TIR + arc) when two or more parameters moved together, or an ``active_idp``
      switch shows in the snapshot changelog; else maps the single parameter to its
      target series.

    A change older than the watch horizon (``_WATCH_HORIZON``) has matured into
    the status quo and is not surfaced.
    """
    watch_start = now - _WATCH_HORIZON
    mature_window = _MATURE_WINDOW

    cands: List[_Cand] = []
    for p in ("isf", "carb_ratio", "target_bg"):
        c = _candidate(p, None, dose_regimes(bolus_events, p))
        if c is not None:
            cands.append(c)
    basal_cand: Optional[_Cand] = None
    for s, regs in basal_slot_regimes(basal_events).items():
        c = _candidate("basal_rate", _slot_label(s), regs)
        if c is not None and (basal_cand is None or c.start > basal_cand.start):
            basal_cand = c
    if basal_cand is not None:
        cands.append(basal_cand)
    cands.extend(_switch_candidates(snapshots, mature_window))
    # A later dose observation of the value established by a profile switch
    # corroborates that switch; it does not create a newer change. Keep genuinely
    # different resulting values eligible as their own candidates. Match before
    # applying the watch horizon so late observations cannot resurrect an aged-out
    # switch as a new Trial.
    live_switches = [c for c in cands if c.switch and not c.reverted]
    cands = [
        c for c in cands
        if c.switch or not any(
            s.start < c.start
            and s.parameter == c.parameter
            and s.before == c.before
            and s.after == c.after
            for s in live_switches
        )
    ]
    # #518 declared fallback: a BLOCK-SCOPED carb-ratio edit opens no Trial in v1.
    # Watching one stretch honestly means recording the arc it covered AT STAGE TIME —
    # a later profile edit re-partitions the blocks underneath a live Trial, so a Trial
    # that re-derives its own arc can end up watching a stretch that no longer exists.
    # That needs the arc persisted with the Plan, which is deliberately not in this
    # change, so a segment-scoped carb-ratio candidate is dropped rather than watched
    # wrongly. A WHOLE-PARAMETER carb-ratio change (the dose-stamped, slot-less
    # candidate) is unaffected and still opens its Trial as before.
    #
    # Dropped HERE, after the corroboration match above and not before it: a late dose
    # observation of the value a segment switch established must still be recognised as
    # corroborating that switch, or removing the switch would let the observation
    # resurrect an aged-out change as a brand-new whole-parameter Trial (#463).
    cands = [c for c in cands
             if not (c.parameter == "carb_ratio" and c.slot is not None)]
    cands = [c for c in cands if c.start > watch_start]
    # Newest change first; a reverted change closes without surfacing, so fall through
    # to the next-most-recent live change rather than blanking the whole payload.
    anchor: Optional[_Cand] = None
    for c in sorted(cands, key=lambda c: c.start, reverse=True):
        if c.reverted if c.switch else _is_revert(c.regimes, mature_window):
            continue
        anchor = c
        break
    if anchor is None:
        return None

    # An ``active_idp`` switch near the anchor is classified by diffing the outgoing
    # vs incoming profile (the duplicate-and-switch workflow, #331): exactly one
    # changed parameter is a *targeted* Trial on that knob, two or more stay
    # whole-profile. The diff is authoritative for a switch, replacing the old
    # any-switch→profile override. Absent a switch, the dose/basal stream decides:
    # two parameters moving together read as one whole-profile edit.
    switch = None if anchor.switch else _profile_switch_diff(snapshots, anchor.start)
    if anchor.switch:
        # Already classified off the authoritative diff when the candidate was built.
        parameter, slot = anchor.parameter, anchor.slot
        before, after = anchor.before, anchor.after
        changed_at = anchor.start
        target = (_PROFILE_TARGET if parameter == "profile"
                  else _TARGET_METRIC[parameter])
    elif switch is not None:
        switch_at, diffs = switch
        changed_at = switch_at
        if len(diffs) == 1:
            d = diffs[0]
            parameter, slot, before, after = d.parameter, d.slot, d.before, d.after
            target = _TARGET_METRIC[parameter]
        else:  # zero (outgoing profile gone) or ≥2 changed → whole-profile
            parameter, slot, before, after = "profile", None, None, None
            target = _PROFILE_TARGET
    else:
        changed_at = anchor.start
        near = {c.parameter for c in cands
                if abs((anchor.start - c.start)) <= _PROFILE_TOLERANCE}
        if len(near) >= 2:
            parameter, slot, before, after = "profile", None, None, None
            target = _PROFILE_TARGET
        else:
            parameter, slot = anchor.parameter, anchor.slot
            before, after = anchor.before, anchor.after
            target = _TARGET_METRIC[parameter]

    # The target's data-day timeline: post-meal instants for the arc, CGM otherwise.
    data_times = ([b.t for b in bolus_events if _is_meal(b)] if target[0] == "arc"
                  else [r.t for r in cgm_readings])
    # Maturity accrues only within the Trial's own bounded period — the same
    # ``min(now, changed_at + mature_window)`` cap :func:`review_trials` applies —
    # so the dock and the Verify roster count the same days for the same change.
    trial_end = min(now, changed_at + mature_window)
    return TrialView(
        parameter=parameter,
        changed_at=changed_at.strftime(_DT_FMT),
        target_metrics=target,
        maturing=_maturing(changed_at, trial_end, TRIAL_WINDOW_DAYS, data_times),
        slot=slot,
        before=before,
        after=after,
        deliberate=_deliberate(parameter, changed_at, plan_history),
    )


def _profile_switch_diff(snapshots, anchor: datetime):
    """The parameters that moved at an active-profile switch near ``anchor`` (#331).

    Finds the nearest ``active_idp`` switch in the snapshot changelog and diffs the
    outgoing vs incoming active profile in the post-switch snapshot, returning
    ``(switch_at, [ParameterDiff, ...])``. Returns ``None`` when no switch is within
    ``_PROFILE_TOLERANCE`` (the dose/basal stream then classifies the change). An
    empty diff list — outgoing profile deleted, or the two profiles are identical —
    falls through to whole-profile at the caller.
    """
    if not snapshots:
        return None
    from .settings import changelog, diff_profiles
    by_time = {s.captured_at: s for s in snapshots}
    for ch in changelog(snapshots):
        if ch.parameter != "active_idp" or abs(ch.at - anchor) > _PROFILE_TOLERANCE:
            continue
        snap = by_time.get(ch.at)
        old = snap.settings.by_idp(ch.old_schedule) if snap else None
        new = snap.settings.by_idp(ch.new_schedule) if snap else None
        if old is None or new is None:
            return (ch.at, [])  # outgoing/incoming profile gone → whole-profile
        return (ch.at, diff_profiles(old, new))
    return None


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


def is_pinnable(lever: str) -> bool:
    return lever in pinnable_levers()


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
    kind: str = field(default="focus", init=False)

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "lever": self.lever,
            "title": self.title,
            "pinned_at": self.pinned_at,
            "status": self.status,
            "target_metric": self.target_metric,
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
    return FocusView(lever=focus_row["lever"], title=title,
                     pinned_at=focus_row["pinned_at"], status=focus_row["status"],
                     target_metric=target)


# --- the one-active resolution (Trial XOR Focus, pump wins) -----------------


def review_trials(store, *, now: datetime,
                  selected: Optional[str] = None) -> dict:
    """The bounded, read-only Verify Trial review surface (ADR 579).

    This deliberately does not resolve the active watched change: that legacy
    singleton may drop a Focus when a live Trial preempts it.  The roster will own
    its independent candidate derivation here, while this stable interface keeps
    the HTTP and frontend adapters unaware of those rules.
    """
    basal = store.basal_events()
    bolus = store.bolus_events()
    snapshots = store.settings_snapshots()
    cgm = store.cgm_readings()
    plan_history = store.plan_history()
    horizon_start = now - _WATCH_HORIZON
    mature_window = _MATURE_WINDOW

    candidates = _review_candidates(
        basal, bolus, snapshots, plan_history, mature_window=mature_window,
        horizon_start=horizon_start,
    )
    trials = []
    for cand in candidates:
        target = _PROFILE_TARGET if cand.parameter == "profile" else _TARGET_METRIC[cand.parameter]
        # A block-bound I:C Trial accrues only from meals inside its captured arc
        # (#581): out-of-block meals never mature it, fill its gaps, or feed its
        # evidence — the same one wrap-aware cohort the detail and breakdown read.
        if cand.block is not None:
            data_times = [b.t for b in bolus if _is_meal(b) and _in_block(b.t, cand.block)]
        elif target[0] == "arc":
            data_times = [b.t for b in bolus if _is_meal(b)]
        else:
            data_times = [r.t for r in cgm]
        # Maturity accrues only from the same bounded Trial period displayed in
        # the selected detail.  Later observations cannot complete an otherwise
        # empty Trial or make its ready-to-judge state imply unavailable evidence.
        trial_end = min(now, cand.start + mature_window)
        maturing = _maturing(cand.start, trial_end, TRIAL_WINDOW_DAYS, data_times)
        trials.append(_ReviewTrial(
            view=TrialView(
                parameter=cand.parameter,
                changed_at=cand.start.strftime(_DT_FMT),
                target_metrics=target,
                maturing=maturing,
                slot=cand.slot,
                before=cand.before,
                after=cand.after,
                deliberate=_deliberate(cand.parameter, cand.start, plan_history),
            ),
            gap_count=_data_gaps(cand.start, trial_end, data_times),
            block=cand.block,
            members=list(cand.members) if cand.members else None,
        ))

    # A maturing Trial is the current live one; completed recent Trials follow from
    # newest to oldest.  Retention stays bounded by the two-window horizon above.
    trials.sort(key=lambda trial: (
        0 if trial.view.maturing.is_maturing else 1,
        -datetime.strptime(trial.view.changed_at, _DT_FMT).timestamp(),
    ))
    trials = trials[:3]
    roster = [_review_summary(trial) for trial in trials]
    if selected is None:
        return {"trials": roster, "selected": None}
    match = next(
        (trial for trial in trials if _review_id(trial.view, trial.block) == selected),
        None,
    )
    if match is None:
        raise KeyError(selected)
    return {"trials": roster, "selected": _review_detail(store, match, now)}


@dataclass(frozen=True)
class _ReviewTrial:
    """One private Verify candidate and the data-accrual facts it owns."""

    view: TrialView
    gap_count: int
    # The captured wrap-aware arc + member starts when this is a block-bound I:C
    # Trial (#581); ``None`` for every other Trial. Trial-owned identity read off
    # the immutable applied-Plan provenance, never off current settings.
    block: Optional[tuple] = None
    members: Optional[list] = None


def _review_candidates(basal, bolus, snapshots, plan_history, *,
                       mature_window: timedelta,
                       horizon_start: datetime) -> List[_Cand]:
    """Every current/recent derived Trial candidate, excluding closed loops.

    The legacy singleton only needs the newest candidate.  Verify instead keeps the
    bounded historical set here, so reversion suppression and switch corroboration
    remain local rather than making a frontend recreate setting history.

    Block-scoped I:C changes are handled apart from the generic switch diff (#581):
    a slot-scoped ``carb_ratio`` switch candidate is dropped here and re-derived by
    :func:`_block_ic_candidates`, which admits it only when it uniquely matches one
    complete annotated applied Plan group — fail-closed otherwise, so an
    uncorroborated block change no longer surfaces general, non-isolated evidence.
    """
    all_switches = [
        candidate for candidate in _switch_candidates(snapshots, mature_window)
        if not candidate.reverted
    ]
    block_ic = _block_ic_candidates(snapshots, plan_history, horizon_start)
    raw = []
    for parameter in ("isf", "carb_ratio", "target_bg"):
        raw.extend(_regime_candidates(parameter, None, dose_regimes(bolus, parameter),
                                       mature_window))
    for slot, regimes in basal_slot_regimes(basal).items():
        raw.extend(_regime_candidates("basal_rate", _slot_label(slot), regimes,
                                       mature_window))

    # A later dose observation can corroborate a profile switch but never deserves
    # a second roster entry.  Keep the switch even if its source data later ages out
    # so the observation cannot resurrect it under a different identity. Matched
    # against every live switch, INCLUDING slot-scoped I:C ones (#463): a late dose
    # observation of the value a block switch established must still be recognised
    # as corroborating that switch, or dropping it first would let the observation
    # resurrect an aged-out change as a brand-new whole-parameter Trial.
    raw = [
        candidate for candidate in raw
        if not any(
            (
                switch.parameter == "profile"
                and abs(switch.start - candidate.start) <= _PROFILE_TOLERANCE
            ) or (
                switch.start < candidate.start
                and switch.parameter == candidate.parameter
                and switch.before == candidate.before
                and switch.after == candidate.after
            )
            for switch in all_switches
        )
    ]
    raw = _coalesce_profile_changes(raw)
    # Slot-scoped I:C is owned by the block-matching path above; drop it here, AFTER
    # the corroboration match, not before — a switch that moved only one I:C block
    # only counts as a roster entry when a Plan group corroborates it.
    switches = [
        candidate for candidate in all_switches
        if not (candidate.parameter == "carb_ratio" and candidate.slot is not None)
    ]
    return [
        candidate for candidate in switches + raw
        if candidate.start > horizon_start
    ] + block_ic


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
              regimes[:index + 1])
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
                None, None, [],
            ))
        else:
            consumed.add(index)
            out.append(candidate)
    return out


# --- block-scoped I:C matching (private, #581) ------------------------------
#
# ADR 581 amends ADR 579 §5: a block-scoped I:C change is no longer surfaced with
# general, non-isolated evidence. It is admitted only when the pump-observed
# schedule change *uniquely* matches exactly one complete annotated applied Plan
# group (the ``ic_block_provenance`` slice 1 stamped onto every staged member) in
# ``store.plan_history()`` within ``_APPLY_TOLERANCE`` of the settings-snapshot
# instant. Zero or ≥2 matching groups fail closed — no block-scoped roster entry.
# The captured group's arc, members, and current/proposed values then become the
# Trial's durable identity and cohort, read off the immutable provenance rather
# than current settings, so a later repartition cannot retarget the earlier Trial.


def _norm_ic(value) -> Optional[float]:
    """One I:C value at the pump settings parser's 4-decimal precision (#581)."""
    if value is None:
        return None
    try:
        return round(float(value), 4)
    except (TypeError, ValueError):
        return None


def _ic_at(schedule, minute: int) -> Optional[float]:
    """The I:C value in force at ``minute`` for a ``[(start_min, value)]`` schedule.

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
        old_v = _norm_ic(_ic_at(old_sched, b))
        new_v = _norm_ic(_ic_at(new_sched, b))
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

    Fail-closed: zero or more than one matching group returns ``None``, so a block
    change with no corroborating annotated Plan group — or an ambiguous one — never
    becomes a block-scoped roster entry.
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


def _observed_ic_changes(snapshots) -> List[tuple]:
    """Every pump-observed active-profile I:C change: ``(at, old_sched, new_sched)``.

    Two sources, both dated at the *later* snapshot's instant (the pump-observed
    settings boundary, never Plan apply time):

    * a **duplicate-and-switch** ``active_idp`` change — the outgoing active
      profile's I:C schedule against the incoming active profile's; and
    * an **in-place edit** ``SettingChange`` on ``carb_ratio`` whose ``idp`` equals
      the active IDP in the later snapshot — an edit to an *inactive* profile is
      never observed by the wearer, so it is excluded (#581 regression).
    """
    from .settings import changelog
    if not snapshots:
        return []
    by_time = {s.captured_at: s for s in snapshots}
    out: List[tuple] = []
    for ch in changelog(snapshots):
        snap = by_time.get(ch.at)
        if snap is None:
            continue
        if ch.parameter == "active_idp":
            old = snap.settings.by_idp(ch.old_schedule)
            new = snap.settings.by_idp(ch.new_schedule)
            if old is None or new is None:
                continue
            old_ic, new_ic = old.schedule("carb_ratio"), new.schedule("carb_ratio")
            if old_ic != new_ic:
                out.append((ch.at, old_ic, new_ic))
        elif ch.parameter == "carb_ratio" and ch.idp == snap.settings.active_idp:
            out.append((ch.at, ch.old_schedule, ch.new_schedule))
    return out


def _block_ic_candidates(snapshots, plan_history,
                         horizon_start: datetime) -> List[_Cand]:
    """Block-scoped I:C candidates uniquely corroborated by applied Plan groups.

    Each pump-observed active-profile I:C change is matched against the complete
    annotated applied groups; a unique match yields one block-bound candidate that
    owns the captured arc, members, and current→proposed values. A multi-member
    block produces exactly one candidate, not one per member row.
    """
    groups = _annotated_ic_groups(plan_history)
    if not groups:
        return []
    cands: List[_Cand] = []
    seen = set()
    for at, old_sched, new_sched in _observed_ic_changes(snapshots):
        group = _match_unique_group(old_sched, new_sched, at, groups)
        if group is None:
            continue
        start, end = group["block"]
        key = (at, start, end)
        if key in seen:
            continue
        seen.add(key)
        cands.append(_Cand(
            "carb_ratio", _min_label(start), at,
            group["current"], group["value"], [],
            switch=True, reverted=False,
            block=group["block"], members=list(group["members"]),
        ))
    return [c for c in cands if c.start > horizon_start]


def _review_id(view: TrialView, block: Optional[tuple] = None) -> str:
    """A stable selection identity derived only from the Trial's own facts.

    ``block`` is the captured wrap-aware arc of a block-bound I:C Trial (#581); its
    end minute is folded into the id alongside the parameter/slot/changed-at stamp
    so two block groups that happen to share a start at the same instant (same
    parameter, slot, changed_at) cannot collide on one id — the roster's dedupe key
    is ``(at, start, end)``, and the id must be at least as specific.
    """
    stamp = datetime.strptime(view.changed_at, _DT_FMT).strftime("%Y%m%d%H%M%S")
    slot = (view.slot or "all").replace(":", "-")
    suffix = f"-{block[1]}" if block is not None else ""
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
    detail.update({
        "before_period": {
            "start": (changed_at - _MATURE_WINDOW).strftime(_DT_FMT),
            "end": view.changed_at,
        },
        "trial_period": {
            "start": view.changed_at,
            "end": min(now, changed_at + _MATURE_WINDOW).strftime(_DT_FMT),
        },
        "focus": (
            {
                "available": False,
                "message": (
                    "Focus is unavailable while a Trial is live. "
                    "It will not queue behind this change."
                ),
            }
            if state == "maturing" else {"available": True}
        ),
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
        "plan_route": _prior_plan_route(view, trial.members),
        "limits": _trial_limits(trial),
    })
    # The Verify workstation's paired reads (#660): the settings diff, the
    # Before-vs-Trial envelopes, the rescue log, and the per-day accrual, each
    # scoped to the two periods above.
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

    ``block`` is the block-bound I:C Trial's captured wrap-aware arc (#581); when
    set, the arc and rescue context read only meals inside it, so out-of-block
    meals never feed a block-scoped Trial's selected evidence — the same cohort the
    roster maturity and breakdown use. The clock-based tir/tbr guardrails stay
    day-wide (the change is programmed to one block, but a low it caused can land
    outside that block).
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

    def in_cohort(dose) -> bool:
        return _is_meal(dose) and (block is None or _in_block(dose.t, block))

    before_meals = [dose for dose in bolus
                    if before_start <= dose.t < changed_at and in_cohort(dose)]
    trial_meals = [dose for dose in bolus
                   if changed_at < dose.t <= trial_end and in_cohort(dose)]
    before_metrics = compute_metrics(before_cgm)
    trial_metrics = compute_metrics(trial_cgm)

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
    before_arc = post_meal_arc(before_meals, before_cgm, ctx_meals=bolus)
    trial_arc = post_meal_arc(trial_meals, trial_cgm, ctx_meals=bolus)
    rescue = post_meal_rescue_context(
        trial_meals,
        [entry for entry in eligible_carb_entries(carbs, trial_end)
         if changed_at < entry.t <= trial_end],
        trial_cgm,
        ctx_meals=bolus,
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
    (#581): its evidence *is* isolated to the captured block, so ADR 579 §5's
    "This is general I:C evidence" line is amended away for corroborated blocks.
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


def _prior_plan_route(view: TrialView, members: Optional[list] = None) -> dict:
    """Describe a manual Plan route without staging or writing anything.

    A prior value is safe to prefill only for one ordinary Plan family at one known
    slot.  Whole-profile, missing-baseline, whole-day, and target Trials instead
    retain the manual Plan boundary instead of inventing a setting to revert.

    ``members`` is a block-bound I:C Trial's captured member starts (#581 finding
    3): every member shares the group's one prior value, so a Revert stages every
    member of the block, not only its lead slot — half-reverting a multi-member
    block would leave the pump split between the old and new setting.
    """
    item_type = _PLAN_TYPE.get(view.parameter)
    if members:
        starts = sorted(members)
    elif view.slot is not None:
        hour, minute = (int(part) for part in view.slot.split(":"))
        starts = [hour * 60 + minute]
    else:
        starts = None
    if item_type is not None and view.before is not None and starts is not None:
        return {
            "mode": "stage-prior",
            "label": "Prior setting ready for Plan",
            "draft": {
                "items": [
                    {"type": item_type, "start_min": start, "value": view.before}
                    for start in starts
                ],
            },
            "message": (
                "The prior setting is staged for manual pump programming. After programming, "
                "confirm it with a fresh pump snapshot in Plan."
            ),
        }
    return {
        "mode": "manual-review",
        "label": "Review this change in Plan",
        "message": (
            "This Trial does not have one prior setting that can be staged. Review the "
            "change in Plan, program the pump manually, then confirm it with a fresh pump snapshot."
        ),
    }


def trial_is_active(store, *, now: datetime,
                    basal_events=None, bolus_events=None, snaps=None,
                    cgm_readings=None) -> bool:
    """Is a Trial live right now? (the pin-time guard for the one-active invariant)."""
    basal = store.basal_events() if basal_events is None else basal_events
    bolus = store.bolus_events() if bolus_events is None else bolus_events
    snapshots = store.settings_snapshots() if snaps is None else snaps
    cgm = store.cgm_readings() if cgm_readings is None else cgm_readings
    return detect_trial(basal, bolus, snapshots, now=now,
                        cgm_readings=cgm,
                        plan_history=store.plan_history()) is not None


def active_watched_change(store, basal_events, bolus_events, snaps, *,
                          now: datetime, cgm_readings=()
                          ) -> Optional[Union[TrialView, FocusView]]:
    """The single active watched change — Trial XOR Focus, pump wins (ADR 0029 §4).

    A live Trial takes the slot and **drops** any active Focus (preemption is
    persisted, not paused — the drop is a real state change the user must re-pin past).
    With no Trial, the pinned Focus surfaces; with neither, ``None``.
    """
    trial = detect_trial(basal_events, bolus_events, snaps, now=now,
                         cgm_readings=cgm_readings,
                         plan_history=store.plan_history())
    if trial is not None:
        focus = store.active_focus()
        if focus is not None:
            store.resolve_focus(focus["id"], "dropped")
        return trial
    focus = store.active_focus()
    if focus is None:
        return None
    # A Focus persisted before a taxonomy change can point at a Lever that no longer
    # exists. Drop it like any other invalidated watch instead of letting Verify fail
    # while deriving the current title/outcome metadata (#327).
    if not is_pinnable(focus["lever"]):
        store.resolve_focus(focus["id"], "dropped")
        return None
    return focus_view(focus)
