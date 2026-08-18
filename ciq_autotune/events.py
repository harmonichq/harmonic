"""Typed store rows — the data model the analysis code actually works with.

:class:`~ciq_autotune.store.Store` parses its wall-clock text timestamps into
real :class:`~datetime.datetime` objects *once*, at the read boundary, and hands
back these frozen rows. Everything downstream (model, insulin, backtest, report)
reads ``.t`` / ``.basal_rate`` / ``.bg`` as attributes instead of re-deriving the
row shape and re-parsing the timestamp string in every module.

The timestamp format lives here and only here; see :func:`parse_t`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

# The wall-clock text format every row is stored as (see store.normalize_time).
_TS_FORMAT = "%Y-%m-%d %H:%M:%S"


def parse_t(s: str) -> datetime:
    """Parse a stored wall-clock timestamp string into a naive ``datetime``."""
    return datetime.strptime(s, _TS_FORMAT)


def format_t(dt: datetime) -> str:
    """Serialize a naive wall-clock ``datetime`` to stored text (inverse of :func:`parse_t`)."""
    return dt.strftime(_TS_FORMAT)


@dataclass(frozen=True)
class BasalEvent:
    t: datetime
    delivery_type: str
    duration_mins: Optional[float] = None
    basal_rate: Optional[float] = None
    # The *programmed* profile rate at this instant (LidBasalDelivery.profileBasalRate),
    # independent of what Control-IQ actually delivered. Drives the "current" column
    # and the basal-epoch cut. None on rows imported before this column existed.
    profile_basal_rate: Optional[float] = None


# Bolus-provenance codes carried on LidBolusRequestedMsg2.options (the pump's own
# "how was this bolus initiated" discriminator; see OptionsMap in tconnectsync).
# The Control-IQ set is the algorithm dosing on its own; everything else is a
# user-initiated bolus. Used by the user-correction predicate to gate on real
# provenance instead of a magnitude heuristic (#135).
_CIQ_BOLUS_OPTIONS = frozenset({3, 6})          # Automatic, Eating Soon Automatic
_USER_BOLUS_OPTIONS = frozenset({0, 1, 2, 4, 5, 7})  # Standard/Extended/Quick/BLE.../Late


@dataclass(frozen=True)
class BolusEvent:
    t: datetime
    description: str = "Bolus"
    completion: Optional[str] = None
    insulin: Optional[float] = None
    requested_insulin: Optional[float] = None
    carbs: Optional[float] = None
    bg: Optional[float] = None
    # Pump's own "the user changed the calculated bolus size" bit
    # (LidBolusRequestedMsg2.useroverride: 1=Yes, 0=No). The authoritative *trigger*
    # for the override work — it says only *that* an override happened, never which
    # way; direction+magnitude come from `override_gap` (ADR 0014/0015). Now
    # populated by #161 (it was a schema column written by nothing until then); None
    # on rows with no Msg2 / ingested before that wiring, where override logic falls
    # back to the gap, mirroring `is_automatic_bolus`.
    user_override: Optional[int] = None
    extended: Optional[int] = None
    completion_t: Optional[str] = None
    # Raw LidBolusRequestedMsg2.options code (the pump's bolus-provenance
    # discriminator). None on rows ingested before this column existed and on any
    # bolus that carried no Msg2. Kept as the raw code — not a derived bool — so
    # later issues (#159–#162) can read the other Msg2 fields off the same join.
    bolus_options: Optional[int] = None
    # LidBolusRequestedMsg3 (eventId 66) food/correction split of the *requested*
    # dose, joined by bolusid (#160). `correction_insulin` is the correction
    # component the identity/floor gate scores a mixed food+correction bolus on —
    # NOT the total delivered `insulin`, which still carries the whole dose into
    # everyone's IOB reconstruction. Both None on rows with no Msg3 (historical
    # rows / no split emitted); a None `correction_insulin` means "no split known"
    # and the predicate treats the bolus as meal-only (today's behavior). These are
    # *requested* sizes; `insulin` is *delivered*, so they diverge on an aborted
    # bolus (the admission gate deliberately scores the requested correction part).
    correction_insulin: Optional[float] = None
    food_insulin: Optional[float] = None
    # The pump's own reported IOB at the dose (LidBolusRequestedMsg1.IOB) — the
    # ground-truth anchor the dia-sweep measures the reconstructed bolus IOB
    # against (#162). This is *total* pump IOB (bolus+basal), pre-this-dose; the
    # reconstruction is bolus-only, so a gap is expected — the sweep reports it as
    # a calibration signal, it is NOT reconciled here. None on rows ingested before
    # this column existed and on any bolus that carried no Msg1.
    pump_iob: Optional[float] = None
    # LidBolusRequestedMsg2 curve/extended-delivery shape, persisted raw (#162).
    # `selected_iob` is the decay-model family the pump used (selectediobRaw:
    # 0=Mudaliar, 1=Swan IOB Meal) and stays UNINTERPRETED. `standard_percent` /
    # `extended_duration` are the extended-bolus split (100%/0 for a standard
    # bolus); as of #174 `BolusIob` reads them to spread a `standard_percent < 100`
    # bolus across its delivery window instead of a point mass at the instant.
    # ISF's `InsulinActivity` does NOT yet (it's built from raw (t, amt) tuples, not
    # BolusEvents — see insulin.py). None on rows with no Msg2 / pre-#162 rows.
    selected_iob: Optional[int] = None
    standard_percent: Optional[int] = None
    extended_duration: Optional[int] = None
    # LidBolusRequestedMsg2 "user declined the recommended correction" bit (#161),
    # sibling of `user_override` above. Captured RAW but wired to nothing — 0
    # occurrences in real data, so no Finding / tile / detector is built around it
    # (ADR 0015 §4); the column exists so history is available the day behavior
    # changes. None on rows with no Msg2 / ingested before #161.
    declined_correction: Optional[int] = None
    # The setting the pump stamped on this dose (#159), a dense retroactive witness of
    # the active ISF/target/I:C at the instant of the bolus — unlike the settings
    # snapshot log, which only starts at the first fetch. `isf` (mg/dL per U) and
    # `target_bg` (mg/dL) are Msg2 values verbatim; `carb_ratio` (g/U) is
    # Msg1.carbratioRaw÷1000, in the same scale as the snapshot schedule, and present
    # only on carb-bearing doses (a correction-only bolus carries no I:C — ADR 0016).
    # The pump's `0` no-calc-context sentinel (phone/Remote doses) is stored as None,
    # so only real observations reach the dose-epoch series (epochs.dose_setting_epoch).
    # None on rows with no Msg1/Msg2 / ingested before #159. `target_bg` is persisted
    # for completeness only — no analyzer reads it (CIQ's built-in 110).
    isf: Optional[float] = None
    target_bg: Optional[float] = None
    carb_ratio: Optional[float] = None
    # Pump-stable event identity (#198). Retained on typed reads so two completed
    # carb boluses at the same timestamp still have a deterministic occurrence order.
    seq_num: Optional[int] = None

    @property
    def override_gap(self) -> Optional[float]:
        """Signed override gap: what the user confirmed minus what the pump calculated.

        ``requested_insulin − (food_insulin + correction_insulin)`` — positive means
        the user dosed *above* the pump's recommendation, negative below (the "Override
        gap" glossary term, ADR 0014). This is the direction+magnitude signal the bare
        ``user_override`` flag lacks. ``None`` when any component is missing (no Msg3
        split / historical row) or the gap is untrustworthy: extended boluses
        (``bolus_options == 1`` / ``extended``) are excluded because extended-split
        accounting can manufacture a spurious gap (ADR 0014, guardrail 3).
        """
        if self.bolus_options == 1 or self.extended == 1:
            return None
        if (
            self.requested_insulin is None
            or self.food_insulin is None
            or self.correction_insulin is None
        ):
            return None
        return self.requested_insulin - (self.food_insulin + self.correction_insulin)

    @property
    def is_automatic_bolus(self) -> Optional[bool]:
        """Whether the pump tagged this a Control-IQ *automatic* bolus (Msg2.options).

        ``True`` for the Control-IQ set {3, 6}, ``False`` for the user set
        {0, 1, 2, 4, 5, 7}, and ``None`` when provenance is absent (historical
        rows / no Msg2) or the code is unrecognized — callers fall back to the
        magnitude heuristic in that case.
        """
        if self.bolus_options in _CIQ_BOLUS_OPTIONS:
            return True
        if self.bolus_options in _USER_BOLUS_OPTIONS:
            return False
        return None


@dataclass(frozen=True)
class CgmReading:
    t: datetime
    bg: Optional[float] = None
    type: Optional[str] = None


@dataclass(frozen=True)
class IobEvent:
    t: datetime
    iob: Optional[float]
    event_id: str


@dataclass(frozen=True)
class PumpEvent:
    t: datetime
    event_type: str
    duration_mins: Optional[float] = None


# The unbolused-carb log (#125). A first-class manual stream — deliberately NOT a
# synthetic BolusEvent, which would lie at the interface and silently break I:C
# isolation (analyzers' `_is_meal` requires insulin). Used only as an *exclusion*
# signal for the analyzers (de-biasing the fasting-ISF window), never a modeling
# input. Revisits ADR 0003's dead event-48 `carb_entries` path, this time fed by a
# real manual source.
CARB_CERTAINTIES = ("exact", "estimate", "unknown")
CARB_SOURCES = ("manual", "rise-prompt", "low-prompt")


@dataclass(frozen=True)
class CarbEntry:
    t: datetime                      # wall-clock time of the carbs (user-editable)
    grams: Optional[float]           # nullable ONLY when certainty == "unknown"
    certainty: str                   # exact | estimate | unknown
    source: str                      # manual | rise-prompt | low-prompt (label provenance)
    note: Optional[str] = None
    created_at: Optional[datetime] = None

    def __post_init__(self):
        if self.certainty not in CARB_CERTAINTIES:
            raise ValueError(
                f"certainty must be one of {CARB_CERTAINTIES}, got {self.certainty!r}")
        if self.source not in CARB_SOURCES:
            raise ValueError(
                f"source must be one of {CARB_SOURCES}, got {self.source!r}")
        # grams may only be omitted for an "ate something, don't know" entry.
        if self.grams is None and self.certainty != "unknown":
            raise ValueError(
                f"grams=None is only valid when certainty == 'unknown', "
                f"got certainty={self.certainty!r}")

