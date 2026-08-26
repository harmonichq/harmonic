"""One server-owned outcome-anchored clock-window membership rule."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from .analyzers.scenario.levers import outcome_kind

DAY_MINUTES = 1440

_KIND_FOR_FAMILY = {"lows": "low", "meals": "meal", "highs": "high",
                    "correction_clusters": "correction"}


def _hhmm(minute: int) -> str:
    if minute == DAY_MINUTES:
        return "24:00"
    return f"{minute // 60:02d}:{minute % 60:02d}"


def _segments(start_min: int, end_min: int) -> List[Tuple[int, int]]:
    if end_min > start_min:
        return [(start_min, end_min)]
    return [(start_min, DAY_MINUTES), (0, end_min)]


def _contains(minute: int, window: List[Tuple[int, int]]) -> bool:
    return any(start <= minute < end for start, end in window)


def _minute_of(stamp: str) -> int:
    return int(stamp[11:13]) * 60 + int(stamp[14:16])


@dataclass(frozen=True)
class WindowQuery:
    """The whole day, or one half-open clock interval on the circular day."""

    start_min: Optional[int] = None
    end_min: Optional[int] = None

    @classmethod
    def whole_day(cls) -> "WindowQuery":
        return cls()

    @classmethod
    def clock(cls, start_min: int, end_min: int) -> "WindowQuery":
        for name, value in (("start_min", start_min), ("end_min", end_min)):
            if not isinstance(value, int) or isinstance(value, bool):
                raise ValueError(f"{name} must be minutes past midnight")
            if not 0 <= value <= DAY_MINUTES:
                raise ValueError(f"{name} must be within 0..{DAY_MINUTES}")
        if start_min % DAY_MINUTES == end_min % DAY_MINUTES:
            raise ValueError("a window must span some part of the day")
        return cls(start_min, end_min)

    @property
    def scoped(self) -> bool:
        return self.start_min is not None

    def _window(self) -> List[Tuple[int, int]]:
        if not self.scoped:
            return [(0, DAY_MINUTES)]
        return _segments(self.start_min % DAY_MINUTES, self.end_min)

    def contains(self, minute: int) -> bool:
        """Whether a clock minute belongs to this projection's window."""
        return _contains(minute, self._window())

    def overlaps(self, start_min: int, end_min: int) -> bool:
        """Whether a circular interval overlaps this window."""
        return any(max(a, c) < min(b, d)
                   for a, b in _segments(start_min, end_min)
                   for c, d in self._window())

    def to_dict(self) -> dict:
        return {
            "scoped": self.scoped,
            "start_min": self.start_min,
            "end_min": self.end_min,
            "label": (None if not self.scoped else
                      f"{_hhmm(self.start_min % DAY_MINUTES)}–{_hhmm(self.end_min)}"),
        }


def outcome_minute(occurrence: dict, exposures_payload: dict) -> int:
    """Return the clock minute where an occurrence's consequence landed."""
    anchors = _episode_anchors(exposures_payload.get("exposures") or {})
    return _outcome_minute(occurrence, anchors)


def _episode_anchors(families: dict) -> Dict[str, List[Tuple[int, str]]]:
    anchors: Dict[str, List[Tuple[int, str]]] = {}
    for family, payload in families.items():
        kind = _KIND_FOR_FAMILY.get(family, family)
        for occurrence in payload.get("occurrences") or []:
            anchors.setdefault(occurrence.get("ep_id"), []).append(
                (_minute_of(occurrence["t"]), occurrence.get("kind", kind)))
    return anchors


def _outcome_minute(occurrence: dict, anchors: Dict[str, List[Tuple[int, str]]]) -> int:
    kind = outcome_kind(occurrence.get("cause_lever"))
    if kind is not None:
        landings = [minute for minute, anchor_kind
                    in anchors.get(occurrence.get("ep_id"), [])
                    if anchor_kind == kind]
        if landings:
            return max(landings)
    return _minute_of(occurrence["t"])
