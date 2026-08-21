"""Canonical identity and snapshot proof for dose-stamped I:C history.

This module is the only authority for historical I:C and meal-run identifiers.
It also reduces the append-only settings snapshots to the intervals in which a
particular active-profile block shape is established.  Numeric estimation stays
in :mod:`ciq_autotune.analyzers.ic`; this boundary answers only which closed run
may belong to which dose-stamped regime.
"""

from __future__ import annotations

import base64
import binascii
import json
import math
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Iterable, List, Optional, Sequence, Tuple

from .settings import Snapshot

_HISTORY_PREFIX = "ich1_"
_RUN_PREFIX = "icr1_"
_DAY_MINUTES = 1440


class InvalidIcHistoryId(ValueError):
    """A malformed or non-canonical I:C history identity."""


class InvalidIcRunId(ValueError):
    """A malformed or non-canonical I:C run identity."""


def _ratio_text(value: float) -> str:
    if isinstance(value, bool):
        raise ValueError("ratio must be a positive finite number")
    try:
        number = float(value)
        decimal = Decimal(str(value))
    except (TypeError, ValueError, InvalidOperation) as exc:
        raise ValueError("ratio must be a positive finite number") from exc
    if not math.isfinite(number) or number <= 0:
        raise ValueError("ratio must be a positive finite number")
    text = format(decimal.normalize(), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return "0" if text == "-0" else text


@dataclass(frozen=True)
class HistoryIdentity:
    """The historical block span plus the ratio stamped on every member dose."""

    block_start_min: int
    block_end_min: int
    ratio: float

    def __post_init__(self) -> None:
        if isinstance(self.block_start_min, bool) or not isinstance(
                self.block_start_min, int):
            raise ValueError("block_start_min must be an integer")
        if isinstance(self.block_end_min, bool) or not isinstance(
                self.block_end_min, int):
            raise ValueError("block_end_min must be an integer")
        if not 0 <= self.block_start_min < _DAY_MINUTES:
            raise ValueError("block_start_min must be in [0, 1440)")
        if not 0 < self.block_end_min <= _DAY_MINUTES:
            raise ValueError("block_end_min must be in (0, 1440]")
        if self.block_end_min == self.block_start_min:
            raise ValueError("a block span may not be empty")
        _ratio_text(self.ratio)


# Explicit aliases make the domain names discoverable without creating a second type.
IcHistoryIdentity = HistoryIdentity


@dataclass(frozen=True)
class RunIdentity:
    """A meal run's canonical temporal origin: its first member bolus."""

    started_at: datetime

    def __post_init__(self) -> None:
        if not isinstance(self.started_at, datetime):
            raise ValueError("run start must be a datetime")
        if self.started_at.tzinfo is not None or self.started_at.microsecond:
            raise ValueError("run start must be a naive whole-second pump time")


IcRunIdentity = RunIdentity


def _encode(prefix: str, payload: list) -> str:
    raw = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("ascii")
    return prefix + base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_payload(value: str, prefix: str, error_type: type[ValueError]) -> list:
    if not isinstance(value, str) or not value.startswith(prefix):
        raise error_type("identifier has the wrong prefix")
    token = value[len(prefix):]
    if not token or "=" in token:
        raise error_type("identifier is malformed")
    try:
        raw = base64.b64decode(
            token + "=" * (-len(token) % 4), altchars=b"-_", validate=True)
        payload = json.loads(raw.decode("ascii"))
    except (binascii.Error, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise error_type("identifier is malformed") from exc
    if not isinstance(payload, list):
        raise error_type("identifier payload must be a list")
    return payload


def encode_history_id(identity: HistoryIdentity) -> str:
    if not isinstance(identity, HistoryIdentity):
        raise TypeError("identity must be HistoryIdentity")
    return _encode(_HISTORY_PREFIX, [
        identity.block_start_min,
        identity.block_end_min,
        _ratio_text(identity.ratio),
    ])


def decode_history_id(value: str) -> HistoryIdentity:
    payload = _decode_payload(value, _HISTORY_PREFIX, InvalidIcHistoryId)
    if len(payload) != 3 or isinstance(payload[0], bool) or isinstance(payload[1], bool):
        raise InvalidIcHistoryId("history identifier has the wrong shape")
    if not isinstance(payload[0], int) or not isinstance(payload[1], int):
        raise InvalidIcHistoryId("history block bounds must be integers")
    if not isinstance(payload[2], str):
        raise InvalidIcHistoryId("history ratio must be canonical decimal text")
    try:
        identity = HistoryIdentity(payload[0], payload[1], float(payload[2]))
    except (ValueError, OverflowError) as exc:
        raise InvalidIcHistoryId(str(exc)) from exc
    if payload[2] != _ratio_text(identity.ratio) or encode_history_id(identity) != value:
        raise InvalidIcHistoryId("history identifier is not canonical")
    return identity


def validate_history_id(value: str) -> bool:
    decode_history_id(value)
    return True


def encode_run_id(identity: RunIdentity) -> str:
    if not isinstance(identity, RunIdentity):
        raise TypeError("identity must be RunIdentity")
    return _encode(_RUN_PREFIX, [identity.started_at.strftime("%Y-%m-%dT%H:%M:%S")])


def decode_run_id(value: str) -> RunIdentity:
    payload = _decode_payload(value, _RUN_PREFIX, InvalidIcRunId)
    if len(payload) != 1 or not isinstance(payload[0], str):
        raise InvalidIcRunId("run identifier has the wrong shape")
    try:
        identity = RunIdentity(datetime.strptime(payload[0], "%Y-%m-%dT%H:%M:%S"))
    except ValueError as exc:
        raise InvalidIcRunId("run timestamp is malformed") from exc
    if encode_run_id(identity) != value:
        raise InvalidIcRunId("run identifier is not canonical")
    return identity


def validate_run_id(value: str) -> bool:
    decode_run_id(value)
    return True


# Fully qualified spellings for callers that keep several identifier families in
# one module. They are aliases, not alternate encoders or parsers.
encode_ic_history_id = encode_history_id
decode_ic_history_id = decode_history_id
validate_ic_history_id = validate_history_id
encode_ic_run_id = encode_run_id
decode_ic_run_id = decode_run_id
validate_ic_run_id = validate_run_id


@dataclass(frozen=True)
class ScheduleBlock:
    start_min: int
    end_min: int
    value: Optional[float]
    member_start_mins: Tuple[int, ...]


@dataclass(frozen=True)
class ScheduleInterval:
    """One snapshot-established active-profile schedule interval."""

    start: datetime
    end: Optional[datetime]
    blocks: Tuple[ScheduleBlock, ...]


@dataclass(frozen=True)
class RunEvidence:
    """The proof-relevant facts from one analyzer-built closed meal run."""

    started_at: datetime
    ended_at: datetime
    member_times: Tuple[datetime, ...]
    stamped_ratios: Tuple[Optional[float], ...]


@dataclass(frozen=True)
class ProvenRun:
    run_id: RunIdentity
    history_id: HistoryIdentity
    regime_end: Optional[datetime]


def schedule_blocks(
    schedule: Sequence[Tuple[int, Optional[float]]],
) -> Tuple[ScheduleBlock, ...]:
    """Return the circular maximal-value blocks for one typed I:C schedule."""
    segs = sorted((int(start), None if value is None else float(value))
                  for start, value in schedule)
    if not segs:
        return ()
    groups: List[ScheduleBlock] = []
    for index, (start, value) in enumerate(segs):
        end = segs[index + 1][0] if index + 1 < len(segs) else _DAY_MINUTES
        if groups and _same_ratio(groups[-1].value, value):
            previous = groups[-1]
            groups[-1] = ScheduleBlock(
                previous.start_min, end, previous.value,
                previous.member_start_mins + (start,),
            )
        else:
            groups.append(ScheduleBlock(start, end, value, (start,)))
    if len(groups) > 1 and _same_ratio(groups[0].value, groups[-1].value):
        head = groups[0]
        tail = groups.pop()
        groups[0] = ScheduleBlock(
            tail.start_min, head.end_min, head.value,
            tail.member_start_mins + head.member_start_mins,
        )
    return tuple(groups)


def schedule_intervals(snapshots: Sequence[Snapshot]) -> Tuple[ScheduleInterval, ...]:
    """Reduce snapshots to active-profile/I:C intervals, oldest first.

    Repeated captures of the same active profile and schedule extend an interval.
    An active-profile switch cuts the interval even when its visible I:C values are
    equal: the snapshot proves a profile lifecycle boundary, not continuity.
    """
    ordered = sorted(snapshots, key=lambda snapshot: snapshot.captured_at)
    if not ordered:
        return ()
    starts: List[Tuple[datetime, tuple, Tuple[ScheduleBlock, ...]]] = []
    for snapshot in ordered:
        schedule = snapshot.settings.active_schedule("carb_ratio")
        blocks = schedule_blocks(schedule)
        signature = (
            snapshot.settings.active_idp,
            tuple((block.start_min, block.end_min, block.value,
                   block.member_start_mins) for block in blocks),
        )
        if starts and starts[-1][1] == signature:
            continue
        starts.append((snapshot.captured_at, signature, blocks))
    return tuple(
        ScheduleInterval(start, starts[index + 1][0] if index + 1 < len(starts) else None,
                         blocks)
        for index, (start, _signature, blocks) in enumerate(starts)
    )


def prove_runs(
    evidence: Iterable[RunEvidence], snapshots: Sequence[Snapshot],
) -> dict[RunIdentity, ProvenRun]:
    """Prove eligible run membership in one ordered pass over retained evidence.

    Runs before the first snapshot, crossing the next relevant change, spanning a
    block boundary, carrying a missing dose stamp, or carrying mixed stamps are
    absent from the result.  Absence is the only unsupported verdict; no fallback
    to the newest schedule exists.
    """
    intervals = schedule_intervals(snapshots)
    if not intervals:
        return {}
    rows = sorted(evidence, key=lambda row: row.started_at)
    out: dict[RunIdentity, ProvenRun] = {}
    interval_index = 0
    for row in rows:
        while (interval_index + 1 < len(intervals)
               and row.started_at >= intervals[interval_index + 1].start):
            interval_index += 1
        interval = intervals[interval_index]
        if row.started_at < interval.start:
            continue
        if interval.end is not None and row.ended_at >= interval.end:
            continue
        if not row.member_times or len(row.member_times) != len(row.stamped_ratios):
            continue
        ratio_texts = []
        try:
            for ratio in row.stamped_ratios:
                if ratio is None:
                    raise ValueError
                ratio_texts.append(_ratio_text(ratio))
        except ValueError:
            continue
        if len(set(ratio_texts)) != 1:
            continue
        blocks = {_block_at(_minute_of_day(member), interval.blocks)
                  for member in row.member_times}
        if None in blocks or len(blocks) != 1:
            continue
        block = next(iter(blocks))
        assert block is not None
        identity = HistoryIdentity(block.start_min, block.end_min,
                                   float(ratio_texts[0]))
        run_id = RunIdentity(row.started_at)
        out[run_id] = ProvenRun(run_id, identity, interval.end)
    return out


def programmed_values_over_span(
    identity: HistoryIdentity,
    current_schedule: Sequence[Tuple[int, Optional[float]]],
) -> Tuple[float, ...]:
    """Distinct current programmed values overlapping a historical block span."""
    blocks = schedule_blocks(current_schedule)
    values = {
        float(block.value)
        for block in blocks
        if block.value is not None and _spans_overlap(
            identity.block_start_min, identity.block_end_min,
            block.start_min, block.end_min,
        )
    }
    return tuple(sorted(values))


def _same_ratio(left: Optional[float], right: Optional[float]) -> bool:
    if left is None or right is None:
        return left is right
    return _ratio_text(left) == _ratio_text(right)


def _minute_of_day(value: datetime) -> int:
    return value.hour * 60 + value.minute


def _block_at(minute: int, blocks: Sequence[ScheduleBlock]) -> Optional[ScheduleBlock]:
    for block in blocks:
        if _in_span(minute, block.start_min, block.end_min):
            return block
    return None


def _in_span(minute: int, start: int, end: int) -> bool:
    if end > start:
        return start <= minute < end
    return minute >= start or minute < end


def _arcs(start: int, end: int) -> Tuple[Tuple[int, int], ...]:
    if end > start:
        return ((start, end),)
    return ((start, _DAY_MINUTES), (0, end))


def _spans_overlap(left_start: int, left_end: int,
                   right_start: int, right_end: int) -> bool:
    return any(max(a0, b0) < min(a1, b1)
               for a0, a1 in _arcs(left_start, left_end)
               for b0, b1 in _arcs(right_start, right_end))
