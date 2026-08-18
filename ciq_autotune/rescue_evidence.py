"""Observation-aware rescue evidence — what the rescue log *knew*, and when (#467).

The manual rescue-carb log (#125) began part-way through the available history, so a
window with no rescue rows is not automatically a window with no rescues: it may
simply predate the instrument. Two distinct times matter, and every downstream slice
used to key on only the first:

* the **physiological** time (``CarbEntry.t`` / ``prompt_responses.anchor_t``) — when
  the carbs were eaten / the prompt's anchor happened. This still drives exclusion
  masking and rescue attribution.
* the **observation** time (``CarbEntry.created_at`` / ``prompt_responses.answered_at``)
  — when the row became *known*. A replayed historical endpoint may only read
  evidence that existed at that endpoint, otherwise a rescue entered retrospectively
  today leaks into a window that closed before it was recorded.

From those two, this module answers the two questions the rescue-dependent channels
ask, and nothing else:

1. **Eligibility** — :func:`eligible_carb_entries` / :func:`eligible_prompt_responses`
   keep only the rows observed at-or-before a window's endpoint. This is a *second*
   predicate alongside the usual ``start <= t <= end`` slice, never a replacement.
2. **Coverage** — :func:`observe` reports how much of a window the log was even
   watching (:attr:`RescueObservation.observed_days`, counted from the first-ever
   observation) plus the four rescue-evidence states. Pre-instrumentation time is
   **unknown**, so it can neither be read as zero rescues nor satisfy the "silence"
   the ISF strengthen gate requires.

The hard lines (ADR 0012 / adr-166) hold here: coverage is an *observed-window day
count*, never a rate over rescues and never a per-low "covered ✓" ledger. Pure
functions of plain rows (no store), so it is fully unit-testable.

**Deliberately out of scope: retroactive *invalidation*.** A ``false-low`` flag (#381)
and a ``no`` low-prompt answer (#129) each correct a claim the CGM shape already made,
and they are meant to apply to every read of that excursion, however late they arrive.
The observation boundary here guards the opposite move — a claim of *absence* — so it
governs rescue evidence only, not those invalidation paths.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Sequence

from .events import CarbEntry, parse_t

# The four rescue-evidence states (#467). The first three are recorded prompt answers;
# the fourth is the absence of any record, which is *unknown* — not a negative.
CONFIRMED_RESCUE = "confirmed-rescue"
EXPLICIT_NO = "explicit-no"
NOT_SURE = "not-sure"
NO_RECORDED_OBSERVATION = "no-recorded-observation"
RESCUE_STATES = (CONFIRMED_RESCUE, EXPLICIT_NO, NOT_SURE, NO_RECORDED_OBSERVATION)

# ``prompt_responses.answer`` → the state it records. ``false-low`` is a reading
# invalidation (#381), not an answer about carbs, so it maps to no rescue state.
_ANSWER_STATES = {
    "carbs": CONFIRMED_RESCUE,
    "no": EXPLICIT_NO,
    "not-sure": NOT_SURE,
}

_FMT = "%Y-%m-%d %H:%M:%S"


def _as_dt(value) -> Optional[datetime]:
    if value is None or isinstance(value, datetime):
        return value
    return parse_t(value)


def entry_observed_at(entry: CarbEntry) -> datetime:
    """When ``entry`` became known.

    ``created_at`` is ``NOT NULL`` for every stored row, but
    :class:`~ciq_autotune.events.CarbEntry` leaves it ``Optional`` for hand-built
    fixtures and the CLI back-compat callers. The explicit fallback is the entry's own
    event time: an entry with no recorded creation time is treated as observed when it
    happened, which is exactly the pre-#467 behaviour (the window's ``t`` slice already
    bounds it) — never "observed at the epoch", which would leak it everywhere.
    """
    return entry.created_at or entry.t


def response_observed_at(row: dict) -> Optional[datetime]:
    """When a ``prompt_responses`` row became known — ``answered_at``, else its anchor."""
    return _as_dt(row.get("answered_at")) or _as_dt(row.get("anchor_t"))


def eligible_carb_entries(
    entries: Sequence[CarbEntry], endpoint: datetime
) -> List[CarbEntry]:
    """The carb entries already observed at ``endpoint`` (``created_at <= endpoint``)."""
    return [e for e in entries if entry_observed_at(e) <= endpoint]


def eligible_prompt_responses(
    responses: Sequence[dict], endpoint: datetime
) -> List[dict]:
    """The prompt responses already answered at ``endpoint`` (``answered_at <= endpoint``)."""
    out = []
    for r in responses:
        at = response_observed_at(r)
        if at is None or at <= endpoint:
            out.append(r)
    return out


def first_observation(
    carb_entries: Sequence[CarbEntry], prompt_responses: Sequence[dict] = ()
) -> Optional[datetime]:
    """The first instant the rescue log ever recorded anything.

    The earliest carb-entry observation time or *rescue* prompt answer time across the
    streams given — the coarse start of instrumentation (ADR 0012: no heartbeat proves
    prompt exposure, so coverage can only be "from the first-ever observation onward").
    ``None`` when neither stream has a single row: nothing has ever been observed, so
    **no** window is observed.

    Only answers that are one of the four rescue-observation states begin coverage. A
    ``false-low`` flag (#381) is a reading invalidation, not an answer about carbs, so a
    lone old ``false-low`` must not make an otherwise-unwatched window read as observed.
    """
    times = [entry_observed_at(e) for e in carb_entries]
    times += [at for at in (response_observed_at(r) for r in prompt_responses
                            if r.get("answer") in _ANSWER_STATES)
              if at is not None]
    return min(times) if times else None


def _days(start: datetime, end: datetime) -> float:
    return max(0.0, (end - start).total_seconds() / 86400.0)


def observed_days(
    start: datetime, end: datetime, observed_from: Optional[datetime]
) -> int:
    """Whole days of ``[start, end]`` the rescue log was watching — a count, never a rate.

    Floors, so a partly-covered day never rounds up into an observed one. ``0`` when
    the log had not started by ``end`` (or never started at all).
    """
    if observed_from is None:
        return 0
    return int(_days(max(start, observed_from), end))


@dataclass(frozen=True)
class RescueObservation:
    """How much of one window the rescue log observed, and what it recorded (#467).

    ``observed_days`` of ``window_days`` is the honest coverage count the
    rescue-dependent channels ran over; ``observed_from`` is the first-ever recorded
    observation (``None`` = the log has never recorded anything). The three answer
    tallies are the recorded prompt answers whose anchor falls in this window and
    which were answered by its endpoint; the fourth state — *no recorded
    observation* — is an absence, reported through :attr:`state` and the coverage
    counts rather than a tally.

    :attr:`fully_observed` is the decision-relevant predicate: false when the window's
    span reaches back before instrumentation, in which case its silence is *unknown*
    and cannot support a move toward more insulin.
    """

    start: datetime
    end: datetime
    observed_from: Optional[datetime]
    observed_days: int
    window_days: int
    confirmed: int = 0
    explicit_no: int = 0
    not_sure: int = 0

    @property
    def fully_observed(self) -> bool:
        """Whether the log was already recording at this window's start."""
        return self.observed_from is not None and self.observed_from <= self.start

    @property
    def unobserved_days(self) -> int:
        return max(0, self.window_days - self.observed_days)

    @property
    def state(self) -> str:
        """This window's strongest rescue-evidence state, one of :data:`RESCUE_STATES`.

        A confirmed rescue outranks everything. A ``not-sure`` answer outranks an
        ``explicit-no`` — it is recorded *unknown*, so it may not read as a negative.
        An ``explicit-no`` only counts as recorded evidence of absence over a fully
        observed window; otherwise the window has no recorded observation.
        """
        if self.confirmed:
            return CONFIRMED_RESCUE
        if self.not_sure:
            return NOT_SURE
        if self.explicit_no and self.fully_observed:
            return EXPLICIT_NO
        return NO_RECORDED_OBSERVATION

    def to_dict(self) -> dict:
        return {
            "observed_from": (self.observed_from.strftime(_FMT)
                              if self.observed_from is not None else None),
            "observed_days": self.observed_days,
            "window_days": self.window_days,
            "unobserved_days": self.unobserved_days,
            "fully_observed": self.fully_observed,
            "state": self.state,
            "states": {
                CONFIRMED_RESCUE: self.confirmed,
                EXPLICIT_NO: self.explicit_no,
                NOT_SURE: self.not_sure,
            },
        }


def observe(
    carb_entries: Sequence[CarbEntry],
    prompt_responses: Sequence[dict] = (),
    *,
    start: datetime,
    end: datetime,
    observed_from: Optional[datetime] = None,
) -> RescueObservation:
    """Build the :class:`RescueObservation` for the window ``[start, end]``.

    ``carb_entries`` / ``prompt_responses`` are the **full** streams (not a window
    slice): coverage is measured from the first-ever observation across all of
    history, and the answer tallies do their own window slice by anchor time.
    ``observed_from`` short-circuits that first-observation scan when the caller
    already resolved it once for several windows.
    """
    if observed_from is None:
        observed_from = first_observation(carb_entries, prompt_responses)
    confirmed = explicit_no = not_sure = 0
    for r in eligible_prompt_responses(prompt_responses, end):
        anchor = _as_dt(r.get("anchor_t"))
        if anchor is None or not (start <= anchor <= end):
            continue
        state = _ANSWER_STATES.get(r.get("answer"))
        if state == CONFIRMED_RESCUE:
            confirmed += 1
        elif state == EXPLICIT_NO:
            explicit_no += 1
        elif state == NOT_SURE:
            not_sure += 1
    return RescueObservation(
        start=start,
        end=end,
        observed_from=observed_from,
        observed_days=observed_days(start, end, observed_from),
        window_days=int(round(_days(start, end))),
        confirmed=confirmed,
        explicit_no=explicit_no,
        not_sure=not_sure,
    )
