"""Basal and ISF/I:C setting epochs: caveats plus basal measurement cuts (F2).

A *setting epoch* is the maximal recent stretch over which the setting an analyzer
reads held constant. The key move (ROADMAP §2, F2) is that this is **per
parameter**: a profile switch or in-place edit only marks the parameter whose
setting moved. Basal still uses that boundary to cut the affected slots'
measurement windows. ISF/I:C measure over the full requested analysis window
(ADR 0039); ISF/I:C setting epochs drive settling and "verified only since"
caveats instead of starving the measurement after a setting edit.

Two setting-epoch sources, by what reveals each setting's history:

* **Basal** — the dense ``profileBasalRate`` feed (one programmed-rate sample
  every ~5 min). Every edit and profile switch is visible across the whole 120d
  pull. (The roadmap's F1 also names a ``basal_changes`` table from
  ``LidBasalRateChange``; a live probe found that event absent on the test pump,
  so the dense feed is the sole basal setting-epoch source for now. Revisit if another
  pump model does emit it.) A schedule *change* is a time-of-day slot whose
  programmed rate moved;
  ordinary within-day variation (the schedule stepping through its segments) is
  not a change. The boundary is placed conservatively at the first sample that
  shows the *new* value for each changed slot, so a transition day is excluded.
* **ISF / I:C / target** — the append-only settings snapshots. Only edits made
  *after* the first snapshot are visible (Tandem exposes a current snapshot only),
  so the back-edge before the first snapshot is "assumed constant, unverifiable"
  (``unverified_before``) — it shrinks with every fetch (ROADMAP §9). The relevant
  signal is the *active* profile's schedule for the parameter, so a switch to a
  profile with a different value starts a new setting epoch and one that matches does not.

Dependency-free: stdlib ``datetime`` and the core event/settings types only.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from .events import BasalEvent, BolusEvent
from .settings import Snapshot

# BolusEvent attribute carrying each dose-stamped setting value (#159).
_DOSE_ATTR = {"isf": "isf", "carb_ratio": "carb_ratio", "target_bg": "target_bg"}

# A dose-stamped value must hold across at least this many consecutive *observed*
# days to count as a settled regime (#159 follow-up). A single day is not enough:
# the most-recent day is often partial (one breakfast dose can be in a different
# I:C time-of-day segment than the rest of the day), and an isolated mid-series
# day where the bolus mix skewed to a minority segment would otherwise manufacture
# a false change-point. Confirmed on real data: a lone 4.0 breakfast dose on the
# current day collapsed the whole carb-ratio window to zero.
_MIN_EPOCH_DAYS = 2


@dataclass(frozen=True)
class Epoch:
    """The current setting epoch for one parameter.

    ``start`` is the most recent detected change to the parameter's effective
    schedule (``None`` if no change is visible in the data). ``unverified_before``
    is set for snapshot-derived parameters with no detected change: the setting is
    only *verified* constant back to that first-snapshot instant; earlier edits are
    invisible.
    """

    parameter: str
    start: Optional[datetime]
    unverified_before: Optional[datetime]


def basal_slot_epochs(basal_events: List[BasalEvent],
                      slot_minutes: int = 30) -> Dict[int, Optional[datetime]]:
    """Per-slot basal setting-epoch starts from the dense feed.

    ``{slot: start}`` where ``start`` is when that time-of-day slot's programmed
    rate last changed (``None`` if it never did within the data). Per-*slot*, not
    per-schedule: editing the 05:00 segment must not shrink the untouched 02:00
    slot's window — same intent as parameter setting epochs, one level finer.

    A change is detected on the **per-day** representative rate, not on raw
    samples. A profile segment boundary rarely lands on a 30-min slot edge, and
    the pump's 5-min sample clock drifts, so the boundary sample jitters within a
    slot day to day — leaving a slot holding *both* the pre- and post-boundary
    rate every day. Comparing raw samples reads that ordinary daily stepping as a
    fresh change (it always points at "today"). Collapsing each slot-day to its
    majority rate first makes the daily schedule look constant, so only a rate
    that actually differs across days is reported.
    """
    evs = sorted((e for e in basal_events if e.profile_basal_rate is not None),
                 key=lambda e: e.t)

    def slot(e: BasalEvent) -> int:
        return (e.t.hour * 60 + e.t.minute) // slot_minutes

    # (slot, day) -> its samples, so each slot-day yields one representative rate.
    by_slot_day: "Dict[Tuple[int, object], List[BasalEvent]]" = {}
    for e in evs:
        by_slot_day.setdefault((slot(e), e.t.date()), []).append(e)

    # slot -> [(day, representative_rate, first_sample_time)] in ascending day order.
    by_slot: "Dict[int, List[Tuple[object, float, datetime]]]" = {}
    for (s, day), samples in by_slot_day.items():
        counts = Counter(round(e.profile_basal_rate, 6) for e in samples)
        # Majority rate for the slot that day; ties break to the higher rate so the
        # pick is deterministic regardless of sample order.
        rep = max(counts.items(), key=lambda kv: (kv[1], kv[0]))[0]
        by_slot.setdefault(s, []).append((day, rep, samples[0].t))

    out: Dict[int, Optional[datetime]] = {}
    for s, days in by_slot.items():
        days.sort(key=lambda d: d[0])
        current = days[-1][1]
        start = None
        for i in range(len(days) - 1, -1, -1):  # newest -> oldest
            if days[i][1] != current:
                # First day back at the current rate is where this slot changed;
                # its first sample is the conservative boundary instant.
                start = days[i + 1][2]
                break
        out[s] = start
    return out


def basal_epoch(basal_events: List[BasalEvent], slot_minutes: int = 30) -> Epoch:
    """Whole-schedule basal setting epoch: the latest per-slot change (for reporting).

    Per-slot windowing (:func:`basal_slot_epochs`) is what the analyzer actually
    uses; this single boundary is the schedule-level summary shown in the result.
    """
    starts = [t for t in basal_slot_epochs(basal_events, slot_minutes).values()
              if t is not None]
    return Epoch("basal_rate", max(starts) if starts else None, None)


def setting_epoch(snapshots: List[Snapshot], parameter: str) -> Epoch:
    """Setting epoch for an ISF / I:C / target schedule, from append-only snapshots.

    The effective schedule is the *active* profile's schedule for ``parameter``.
    The setting epoch starts when the current value first appeared (the snapshot right
    after the last snapshot that differed). With no detected change, the value is
    only verified constant back to the first snapshot (``unverified_before``).
    """
    snaps = sorted(snapshots, key=lambda s: s.captured_at)
    if not snaps:
        return Epoch(parameter, None, None)
    current = snaps[-1].settings.active_schedule(parameter)
    for i in range(len(snaps) - 1, -1, -1):  # newest -> oldest
        if snaps[i].settings.active_schedule(parameter) != current:
            return Epoch(parameter, snaps[i + 1].captured_at, None)
    return Epoch(parameter, None, snaps[0].captured_at)


def dose_setting_epoch(boluses: List[BolusEvent], parameter: str) -> Epoch:
    """Setting epoch for one setting from the value the pump stamps on every bolus (#159).

    Unlike the append-only snapshot (forward-only from the first fetch), the
    dose-stamped ISF / I:C the pump wrote onto each confirmed bolus is a dense,
    **retroactive** witness across the whole pull — so it can date a setting change
    the snapshot never saw and verify constancy back before the first snapshot. That
    is the point: a first-time user whose settings have held constant gets their full
    requested window analyzed instead of being throttled to forward-only snapshot
    history (and one who recently changed a setting gets a setting epoch start for
    caveats/settling).

    The change-point detection reuses :func:`basal_slot_epochs`' proven idea: collapse
    each *day* to the **mode** of its (non-``None``) dose values, then walk newest ->
    oldest and place the boundary at the first dose back at the current value. A single
    scalar per day — deliberately no per-time-of-day schedule. The scenario engine
    no longer collapses I:C to one median, and this narrowed scope does not need
    per-slot ISF/I:C setting epochs. With no change, ``start`` is ``None`` and
    ``unverified_before`` is the earliest observed dose — constancy is verified back
    to there. An empty series (no observations for the parameter) is a no-op setting
    epoch.

    Single-day excursions are **debounced** (``_MIN_EPOCH_DAYS``): a value must persist
    across consecutive observed days to count as a regime, so a partial most-recent day
    or an isolated day whose bolus mix skewed to a minority I:C segment can't
    manufacture a change-point. The most recent *settled* regime defines the current
    value; a genuine change (a new value that itself persists) is still dated to where
    it began.
    """
    attr = _DOSE_ATTR[parameter]
    obs = sorted(((b.t, getattr(b, attr)) for b in boluses if getattr(b, attr) is not None),
                 key=lambda tv: tv[0])
    if not obs:
        return Epoch(parameter, None, None)

    # day -> its (nonzero) values, so each day yields one representative scalar.
    by_day: "Dict[object, List[float]]" = {}
    first_t: "Dict[object, datetime]" = {}
    for t, v in obs:
        by_day.setdefault(t.date(), []).append(round(float(v), 6))
        first_t.setdefault(t.date(), t)  # obs is time-sorted, so this is the day's first dose

    # [(day, representative_value, first_dose_time)] in ascending day order.
    days: "List[Tuple[object, float, datetime]]" = []
    for day, values in by_day.items():
        counts = Counter(values)
        # Majority value that day; ties break to the higher value for determinism —
        # same rule as basal_slot_epochs.
        rep = max(counts.items(), key=lambda kv: (kv[1], kv[0]))[0]
        days.append((day, rep, first_t[day]))
    days.sort(key=lambda d: d[0])

    # Keep only days that belong to a run of >= _MIN_EPOCH_DAYS consecutive observed
    # days at the same value; short runs (partial current day, minority-segment blip)
    # are noise and are dropped before change detection.
    stable = _settled_days(days, _MIN_EPOCH_DAYS)
    if not stable:
        # No value held long enough to assert a regime (too few / too noisy days):
        # treat as constant, verified back to the earliest observed dose.
        return Epoch(parameter, None, days[0][2])

    current = stable[-1][1]
    for i in range(len(stable) - 1, -1, -1):  # newest -> oldest, over settled days only
        if stable[i][1] != current:
            # First settled day back at the current value is where it changed; its
            # first dose is the conservative boundary instant.
            return Epoch(parameter, stable[i + 1][2], None)
    # Constant across every settled day: verified back to the earliest settled dose.
    return Epoch(parameter, None, stable[0][2])


def _settled_days(days: "List[Tuple[object, float, datetime]]",
                  min_run: int) -> "List[Tuple[object, float, datetime]]":
    """Drop days whose value doesn't persist across ``min_run`` consecutive observed
    days. Run length is counted over the observed-day sequence (calendar gaps where
    the user didn't bolus don't break a run), so an isolated one-day excursion — a
    partial current day, or a day whose bolus mix skewed to a minority I:C segment —
    is filtered out before change-point detection."""
    out: "List[Tuple[object, float, datetime]]" = []
    i = 0
    while i < len(days):
        j = i
        while j < len(days) and days[j][1] == days[i][1]:
            j += 1
        if j - i >= min_run:
            out.extend(days[i:j])
        i = j
    return out


def reconcile_epoch(snapshot_ep: Epoch, dose_ep: Epoch,
                    window_start: datetime) -> Epoch:
    """Combine the snapshot setting epoch with the dose-stamped setting epoch (#159).

    The two witnesses see different spans: the snapshot log is authoritative but
    forward-only (from the first fetch), while the dose stream is retroactive across
    the whole pull. Reconciled so:

    * ``start`` is the **more recent** of the two detected changes — a real change
      either source saw still carries the caveat/settling signal, and the freshest
      boundary wins.
    * with no change from either source, ``unverified_before`` is pushed **back** to
      the earliest evidence of constancy (typically the earliest dose, well before
      the first snapshot), and **clears** entirely when the dose stream verifies
      constancy across the full requested window (its earliest dose is at//before
      ``window_start``) — the first-time-setup win: full window, no caveat.

    A detected change carries no ``unverified_before`` caveat (mirrors
    :func:`setting_epoch`). An empty dose-stamped setting epoch leaves the snapshot
    setting epoch's behavior unchanged.
    """
    param = snapshot_ep.parameter
    starts = [s for s in (snapshot_ep.start, dose_ep.start) if s is not None]
    if starts:
        return Epoch(param, max(starts), None)
    uvs = [u for u in (snapshot_ep.unverified_before, dose_ep.unverified_before)
           if u is not None]
    unverified = min(uvs) if uvs else None
    if dose_ep.unverified_before is not None and dose_ep.unverified_before <= window_start:
        unverified = None  # dose data covers the whole analyzable window — no caveat
    return Epoch(param, None, unverified)


def effective_window(epoch: Epoch, now: datetime,
                     requested_days: int) -> Tuple[datetime, datetime]:
    """``(start, end)`` when a setting epoch intentionally bounds measurement.

    Basal still uses setting epochs as measurement cuts; ISF/I:C do not (ADR 0039).
    ``end`` is ``now``; ``start`` is ``now - requested_days`` unless the supplied
    setting epoch started more recently, in which case the window is shortened so it
    never straddles that setting change. A setting epoch wider than the request does
    not *extend* the window — the user's window is the cap.
    """
    end = now
    requested_start = now - timedelta(days=requested_days)
    if epoch.start is not None and epoch.start > requested_start:
        return epoch.start, end
    return requested_start, end
