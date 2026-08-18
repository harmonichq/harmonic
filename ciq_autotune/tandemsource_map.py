"""Map upstream ``tconnectsync`` Tandem Source events to local store rows.

Tandem migrated t:connect to *Tandem Source*, whose history log is a stream of
typed binary events (``tconnectsync.eventparser.events``). This module turns one
pass over that stream into the same JSON-shaped dict rows the local importer
feeds :class:`~ciq_autotune.store.Store`, so a live pull and a local import land
in the database through the *identical* upserts and merge idempotently.

Design notes
------------
* **No tconnectsync import.** The core package is deliberately dependency-free;
  the ``sync`` extra is only needed to *fetch* events, not to map them. So this
  module never imports tconnectsync. It dispatches on ``type(event).__name__``
  and reads the events' plain ``*Raw`` integer / value attributes — which also
  makes it trivial to unit-test with hand-built fakes.
* **Timestamps.** Real events expose an ``arrow`` ``eventTimestamp``; fakes can
  use a stdlib ``datetime``. :func:`_iso` / :func:`_epoch` accept either.
* **Time model.** Two feeds, two zones, one output. Event ``eventTimestamp`` is
  **UTC** (tz-aware); CGM ``egvTimestamp`` is the pump's **local** wall clock
  (seconds since the 2008 epoch, equal to the BFF ``pumpDateTime`` — see
  :func:`_cgm_time`). We emit each as its own zone (UTC tagged, local naive) and
  let :func:`~ciq_autotune.store.normalize_time` land both on ``TIMEZONE_NAME``
  local: it converts the tz-aware ones and passes the naive ones through. Never
  hand ``normalize_time`` a local time tagged UTC — that double-shifts it by the
  offset (issue #103; a Phoenix pump slid its whole evening into the afternoon).

What each event becomes:

==========================  ===================================================
event class                 store row(s)
==========================  ===================================================
``LidBasalDelivery``        one ``basal_events`` row (delivered ``commandedRate``;
                            ``delivery_type`` synthesized from ``commandedRateSource``)
``LidCgmData{Gxb,G7,Fsl2}`` one ``cgm_readings`` row (the ~5-min EGV stream),
                            timestamped by ``egvTimestamp`` (the reading's true
                            time) so reconnect backfill dumps land correctly
                            instead of collapsing onto one point (#90)
``LidBgReadingTaken``       one ``iob_events`` row — the pump's own IOB at the
                            sparse (~8/day) BG-reading instants, kept only as a
                            ground-truth *reference* for validating the model's
                            reconstructed IOB (see ``insulin.py``). Tandem Source
                            has no dense IOB telemetry, so the model does not rely
                            on this series.
``LidBolusCompleted``       one ``bolus_events`` row (joined with its requested
                            msg); also the input to reconstructed bolus IOB
cartridge / cannula / tube  ``pump_events`` "Site/Cartridge Change"
``LidPumpingSuspended``     ``pump_events`` "User Suspended"
``LidAaUserModeChange``     ``pump_events`` "Exercise" / "Sleep"
==========================  ===================================================

Note: ``LidCarbsEntered`` (event 48) is never emitted by the Tandem Source BFF
for this pump — it fires only for a "carbs, no bolus" flow Control-IQ users don't
use, so ``carb_entries`` is always empty in practice. Carbs ride exclusively on
``LidBolusCompleted`` via the paired ``LidBolusRequestedMsg1.carbAmount``. See
ADR 0003 (and ADR 0005, which re-sources overcorrect-low from CGM instead).

Alarms and other event types are ignored for v1 (not model-critical).

History: an earlier cut sourced CGM from ``LidBgReadingTaken`` on the (wrong)
assumption it fired per-reading; live data showed it fires ~8x/day, so CGM now
comes from the dedicated ``LidCgmData*`` events (~288/day).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional

from .store import CONTINUOUS_IOB_EVENT_ID

# Tandem event epoch (2008-01-01T00:00:00Z). CGM events carry an ``egvTimestamp``
# counting seconds from this; it is the reading's *true* time, distinct from the
# ``eventTimestamp`` at which the pump stored it. See :func:`_cgm_time` / #90.
_TANDEM_EPOCH = 1199145600

# LidBasalDelivery fires once every 5 minutes regardless of whether the rate
# changed, so 5-minute segments tile the whole timeline. We size each segment
# by the gap to the next event but cap it at two cadences: a longer gap means
# the pump was off / not reporting, and should read as a *coverage hole*
# (model returns no rate there) rather than one rate smeared across hours.
_BASAL_CADENCE_MIN = 5.0
_BASAL_GAP_CAP_MIN = 10.0

# commandedRateSource (LidBasalDelivery) -> store delivery_type string.
# The model special-cases only "profileDelivery" (recovers the programmed
# profile) and the two zero-delivery strings; any other string is treated as a
# normal delivered rate, which is what we want for temp/algorithm delivery.
_RATE_SOURCE = {
    0: "algorithmDelivery (control-iq suspension)",  # Suspended (in model's _ZERO_DELIVERY)
    1: "profileDelivery",                            # Profile -> reveals programmed rate
    2: "tempDelivery",                               # Temp Rate
    3: "algorithmDelivery",                          # Algorithm (Control-IQ)
    4: "algorithmDelivery",                          # Temp Rate and Algorithm
}

# currentusermode (LidAaUserModeChange) -> pump_events event_type, for the modes
# the model cares about. Exercise is in the model's excluded set; Sleep is a
# legitimate steady state and is recorded but not excluded.
_USER_MODE = {1: "Sleep", 2: "Exercise"}

# completionstatus (LidBolusCompleted) -> human string for the bolus row.
_BOLUS_COMPLETION = {
    0: "User Aborted", 1: "Terminated by Alarm", 2: "Terminated by Malfunction",
    3: "Completed", 5: "Bolus rejected", 6: "Aborted by PLGS",
}


# --- timestamp helpers (accept arrow or datetime) ---------------------------


def _iso(event) -> str:
    """Wall-clock string for ``normalize_time`` (arrow ``.format()`` or ``str``)."""
    ts = event.eventTimestamp
    fmt = getattr(ts, "format", None)
    return fmt() if callable(fmt) else str(ts)


def _epoch(event) -> float:
    """Epoch seconds, for duration math (arrow ``.int_timestamp`` or datetime)."""
    ts = event.eventTimestamp
    it = getattr(ts, "int_timestamp", None)
    return float(it) if it is not None else ts.timestamp()


def _milliunits(v) -> float:
    return round(v / 1000.0, 3)


def _seq_num(ev) -> Optional[int]:
    """The pump's stable per-event sequence number — a basal row's natural key.

    A ``LidBasalDelivery``'s ``eventTimestamp`` (``pumpDateTime``) is not
    byte-stable across pulls — the BFF re-decodes it a few seconds off from a
    prior generation — so keying basal rows on it let a re-pull insert a jittered
    parallel copy instead of merging, doubling the 5-min stream and ~2×-ing
    reconstructed basal insulin (which collapsed fasting-ISF, #194). ``seqNum`` is
    monotonic and identical across pulls of the *same* event, so it dedupes
    re-pulls losslessly without ever conflating two distinct deliveries (which
    carry distinct seqNums). It rides on the underlying ``raw`` event; test fakes
    may set it directly."""
    raw = getattr(ev, "raw", None)
    seq = getattr(raw, "seqNum", None) if raw is not None else None
    if seq is None:
        seq = getattr(ev, "seqNum", None)
    return int(seq) if seq is not None else None


def _cgm_time(ev) -> str:
    """Wall-clock string for a CGM reading, preferring its ``egvTimestamp``.

    A CGM event's ``eventTimestamp`` is when the pump *stored* the reading. When
    the sensor briefly drops BLE and reconnects, Dexcom backfills the missed
    readings in one dump, so the whole batch shares a single store time — the
    reconnect instant. Keying rows on that store time collapses the batch onto one
    point and leaves the gap it was meant to fill (issue #90). ``egvTimestamp``
    carries the reading's real, 5-min-spaced time, so use it when present (this
    mirrors tconnectsync's own CGM sync); fall back to the store time for events
    or test fakes that lack it.

    ``egvTimestamp`` is seconds since the 2008 epoch in the pump's **local wall
    clock** — it equals the BFF ``pumpDateTime`` to the second, verified against
    the vendor UI (a 20:54 local reading carries the egv that decodes to 20:54,
    not 20:54 UTC). So emit a **naive** local string and let ``normalize_time``
    pass it through unshifted. Do NOT tag it UTC: an earlier "fix" (issue #103)
    did, and ``normalize_time`` then converted an already-local time to local a
    *second* time, landing every reading ``TIMEZONE_NAME``'s UTC offset early
    (7 h for a Phoenix pump — the whole evening slid into the afternoon). The
    2008 epoch itself is a fixed offset, so it does not matter that we read the
    seconds via a UTC helper; what matters is we keep the wall-clock digits and
    tag them naive, exactly as the ``pumpDateTime``/``_iso`` feeds arrive.
    """
    # tconnectsync 3.0.0 renamed this field `egvTimeStamp` (was `egvTimestamp`);
    # a stale name here silently returned None and fell back to the store time,
    # re-opening the #90 backfill-collapse it exists to prevent.
    egv = getattr(ev, "egvTimeStamp", None)
    if egv:
        # Keep the wall-clock digits, drop the tz: egvTimeStamp is already local.
        return datetime.fromtimestamp(
            _TANDEM_EPOCH + egv, timezone.utc).replace(tzinfo=None).isoformat(sep=" ")
    return _iso(ev)


# --- per-event row builders -------------------------------------------------


def _basal_rows(events: List) -> List[dict]:
    """Sized basal segments from the every-5-min LidBasalDelivery stream."""
    evs = sorted(events, key=_epoch)
    rows: List[dict] = []
    for i, ev in enumerate(evs):
        if i + 1 < len(evs):
            gap = (_epoch(evs[i + 1]) - _epoch(ev)) / 60.0
            duration = min(gap, _BASAL_GAP_CAP_MIN)
        else:
            duration = _BASAL_CADENCE_MIN
        rows.append({
            # The pump's stable sequence number is the row's natural key (#194);
            # eventTimestamp jitters across pulls and must not key the row.
            "seq_num": _seq_num(ev),
            "time": _iso(ev),
            "delivery_type": _RATE_SOURCE.get(ev.commandedRateSourceRaw, "algorithmDelivery"),
            "duration_mins": duration,
            "basal_rate": _milliunits(ev.commandedRate),
            # The programmed profile rate at this instant, independent of CIQ's
            # delivery — the basal-schedule signal F2/A1 read. Older rows lack it.
            # 0xFFFF (65535) is the pump's "no value" sentinel emitted during a
            # Control-IQ suspension; treat it as None, not 65.535 U/h (#409).
            "profile_basal_rate": (
                None if getattr(ev, "profileBasalRate", None) in (None, 0xFFFF)
                else _milliunits(ev.profileBasalRate)
            ),
        })
    return rows


def _cgm_row(ev) -> dict:
    # glucoseValueStatusRaw: 0 = value present; 1 = "high"; 2 = "low" (value set
    # to 0 in those cases). High/low aren't usable in-range readings, so drop the
    # value to None — the model ignores None and the minute fails the BG gate.
    # (3.0.0 camelCased both fields from `glucosevaluestatusRaw` /
    # `currentglucosedisplayvalue`; the value read was the hard KeyError crash.)
    in_range = getattr(ev, "glucoseValueStatusRaw", 0) == 0
    bg = ev.currentGlucoseDisplayValue if in_range else None
    return {"EventDateTime": _cgm_time(ev), "Readings (CGM / BGM)": bg, "Description": "EGV"}


def _iob_row(ev) -> dict:
    return {"seq_num": _seq_num(ev), "time": _iso(ev), "iob": ev.iob,
            "event_id": CONTINUOUS_IOB_EVENT_ID}


def _bolus_row(completed, requested, requested2=None, requested3=None) -> dict:
    carbs = getattr(requested, "carbAmount", 0) if requested else 0
    bg = getattr(requested, "bg", 0) if requested else 0
    # LidBolusRequestedMsg2.options is the pump's own bolus-provenance code
    # (Control-IQ automatic vs user-initiated). Read the raw int off `optionsRaw`,
    # NOT the `options` enum property, so this module stays dependency-free
    # (CLAUDE.md). None when no Msg2 joined this bolus. The whole Msg2 event is
    # passed in (not just the code) so #159–#162 can pull its other fields here.
    options = getattr(requested2, "optionsRaw", None) if requested2 else None
    # LidBolusRequestedMsg3 (eventId 66) carries the food/correction split of the
    # *requested* dose, joined on the same bolusid (#160). Read the raw float attrs
    # directly (dependency-free). None when no Msg3 joined — a mixed food+correction
    # bolus then reads as meal-only downstream (see BolusEvent.correction_insulin).
    correction_insulin = getattr(requested3, "correctionBolusSize", None) if requested3 else None
    food_insulin = getattr(requested3, "foodBolusSize", None) if requested3 else None
    # Three more signals that already ride the same join (#162), persisted raw and
    # NOT interpreted here — measure-only. `IOB` (Msg1) is the pump's own reported
    # IOB anchor at the dose, the ground truth dia-sweep validates the reconstructed
    # curve against; `selectediobRaw` (Msg2) is the decay-model family it used
    # (0=Mudaliar, 1=Swan IOB Meal); `standardpercent`/`duration` (Msg2) are the
    # extended-bolus delivery shape. Raw `*Raw`/plain attrs keep this module
    # dependency-free (never the `selectediob` enum property). None when unjoined.
    pump_iob = getattr(requested, "iob", None) if requested else None
    selected_iob = getattr(requested2, "selectedIobRaw", None) if requested2 else None
    standard_percent = getattr(requested2, "standardPercent", None) if requested2 else None
    extended_duration = getattr(requested2, "duration", None) if requested2 else None
    # The two Msg2 override flags (#161). `useroverrideRaw` (1=Yes/0=No) is the
    # pump's own "user changed the calculated bolus size" bit — the trigger for the
    # override enrichment + rate tile (ADR 0014/0015); it was a store column written
    # by nothing until this wiring. `declinedcorrectionRaw` is captured raw only
    # (persisted, drives nothing — ADR 0015 §4). Raw `*Raw` attrs keep this module
    # dependency-free (never the enum properties). None when no Msg2 joined.
    user_override = getattr(requested2, "userOverrideRaw", None) if requested2 else None
    declined_correction = getattr(requested2, "declinedCorrectionRaw", None) if requested2 else None
    # The setting the pump stamped on this dose (#159): `Msg2.ISF` (whole mg/dL per
    # unit) and `Msg2.targetbg` (whole mg/dL) verbatim; the carb ratio rides on
    # `Msg1.carbratioRaw`, which is milli-g/U (the `.carbratio` enum-free property is
    # ×0.001), so ÷1000 to land in g/U — the same scale the settings snapshot stores
    # (settings.parse_pump_settings divides carbRatio by _MILLI). Raw `*Raw`/plain
    # attrs keep this module dependency-free (never enum properties). A dense,
    # RETROACTIVE witness of ISF/target/I:C across the whole pull — the snapshot log
    # only starts at first fetch. `0` is the pump's no-calc-context sentinel (phone/
    # Remote doses carry ISF=0/targetbg=0), coerced to None so only real observations
    # enter the series. The carb ratio is meaningful only on a dose that dosed carbs
    # (a correction-only bolus carries no I:C, ADR 0016), so it is persisted only when
    # this dose had carbs — a stale/zero carbratio on a zero-carb dose never pollutes
    # the I:C series. None when no Msg2/Msg1 joined.
    isf = getattr(requested2, "isf", None) if requested2 else None
    target_bg = getattr(requested2, "targetBg", None) if requested2 else None
    carb_ratio_raw = getattr(requested, "carbRatioRaw", None) if requested else None
    isf = isf if isf else None
    target_bg = target_bg if target_bg else None
    carb_ratio = (round(carb_ratio_raw / 1000.0, 4)
                  if carb_ratio_raw and carbs and carbs > 0 else None)
    return {
        # The completion event's seqNum keys the row (#198): stable across pulls,
        # unlike (t, description, insulin) whose t a wrong-tz re-pull shifted +7h.
        "seq_num": _seq_num(completed),
        "request_time": _iso(completed),
        "description": "Bolus",
        "completion": _BOLUS_COMPLETION.get(completed.completionStatusRaw),
        "insulin": completed.insulinDelivered,
        "requested_insulin": getattr(completed, "insulinRequested", None),
        "carbs": carbs if carbs and carbs > 0 else None,
        "bg": bg if bg and bg > 0 else None,
        "completion_time": _iso(completed),
        "bolus_options": options,
        "correction_insulin": correction_insulin,
        "food_insulin": food_insulin,
        "pump_iob": pump_iob,
        "selected_iob": selected_iob,
        "standard_percent": standard_percent,
        "extended_duration": extended_duration,
        "user_override": user_override,
        "declined_correction": declined_correction,
        "isf": isf,
        "target_bg": target_bg,
        "carb_ratio": carb_ratio,
    }


def _pump_row(ev, event_type: str, duration_mins: float = 0.0) -> dict:
    return {"seq_num": _seq_num(ev), "time": _iso(ev), "event_type": event_type,
            "duration_mins": duration_mins}


# --- the one public entry point ---------------------------------------------


def events_to_rows(events) -> Dict[str, List[dict]]:
    """Bucket a single pass of typed Tandem Source events into store rows.

    ``events`` is any iterable of upstream ``eventparser`` event objects (the
    generator returned by ``tandemsource.pump_events`` is fine — it is consumed
    once). Returns ``{"basal", "bolus", "cgm", "iob", "pump"}`` lists ready for
    the matching ``Store.upsert_*`` calls.
    """
    basal: List = []
    bolus_completed: List = []
    bolus_requested: Dict[int, object] = {}
    bolus_requested2: Dict[int, object] = {}
    bolus_requested3: Dict[int, object] = {}
    cgm: List[dict] = []
    iob: List[dict] = []
    pump: List[dict] = []

    for ev in events:
        name = type(ev).__name__
        if name == "LidBasalDelivery":
            basal.append(ev)
        elif name in ("LidCgmDataGxb", "LidCgmDataG7", "LidCgmDataFsl2"):
            cgm.append(_cgm_row(ev))
        elif name == "LidBgReadingTaken":
            iob.append(_iob_row(ev))  # reference IOB only; model reconstructs its own
        elif name == "LidBolusCompleted":
            bolus_completed.append(ev)
        elif name == "LidBolusRequestedMsg1":
            bolus_requested[ev.bolusId] = ev
        elif name == "LidBolusRequestedMsg2":
            # Carries bolus provenance (options) joined to its completion on
            # bolusId, same as Msg1.
            bolus_requested2[ev.bolusId] = ev
        elif name == "LidBolusRequestedMsg3":
            # Carries the food/correction split, joined on bolusId like Msg1/Msg2 (#160).
            bolus_requested3[ev.bolusId] = ev
        elif name in ("LidCartridgeFilled", "LidCannulaFilled", "LidTubingFilled"):
            pump.append(_pump_row(ev, "Site/Cartridge Change"))
        elif name == "LidPumpingSuspended":
            pump.append(_pump_row(ev, "User Suspended"))
        elif name == "LidAaUserModeChange":
            etype = _USER_MODE.get(ev.currentUserModeRaw)
            if etype:
                # Exercise carries a planned duration; use it so the model's
                # exclusion window covers the whole session, not just a point.
                dur = float(getattr(ev, "exerciseTime", 0) or 0) if etype == "Exercise" else 0.0
                pump.append(_pump_row(ev, etype, dur))
        # else: LidCarbsEntered (event 48), alarms, device-status, other -> ignored.
        # LidCarbsEntered is never emitted by the Tandem Source BFF; see ADR 0003.

    bolus = [_bolus_row(bc, bolus_requested.get(bc.bolusId),
                        bolus_requested2.get(bc.bolusId),
                        bolus_requested3.get(bc.bolusId)) for bc in bolus_completed]
    return {"basal": _basal_rows(basal), "bolus": bolus, "cgm": cgm, "iob": iob,
            "pump": pump}
