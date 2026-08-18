"""The pattern sweep — a generated candidate grammar priced through one gate (#378).

Every reporting window this enumerates a **closed, versioned candidate grammar**
(outcome × where, pump-derived dimensions only), prices *every* cell through one
identical evidence gate, and routes the results: per-cell verdicts + gate evidence,
a set of **tracked candidates** (real signal, not yet cleared), and a
**ready-for-review** queue for any cell that clears. The runtime never
self-publishes — a cleared cell stays in the queue until a human approve call
(``store.record_pattern_review``); only that decision persists.

This replaces the six hand-written candidate functions of
``scripts/analyze_localized_outcomes.py`` with a *generated* grammar swept through
one shared gate. Those six remain the regression bed: the reference script re-imports
the gate math below, so its verdicts are identical by construction and its grounding
test stays green (adr-365-swept-candidate-space §3).

Design (adr-378-pattern-sweep-engine):

- **Candidates are generated, never authored.** The grammar is the union of a fixed
  set of generating families, each a cross product of closed dimension tables drawn
  only from pump-derived data (adr-363 charter): a *between* family (an outcome, a
  window, a day-partition), a *clock* family (does an outcome cluster in a window
  versus a comparable block?), an *anchor-follow* family (does an outcome follow a
  pump event — a suspend cluster, a low — within three hours, versus a time-matched
  control?), and a *site-life* family (does glucose drift over an infusion site's
  life?). Growing any family is a reviewed change to its table; membership is never
  hand-picked. The grammar re-derives all six #364 candidates **with their reference
  shapes** — the suspend cell anchors on suspend clusters with a three-hour follow-up,
  the post-low cell scores rebounds against time-matched non-low control days, and the
  site cell measures site-life drift — not day-rate reframings.
- **One identical gate per cell.** Every family builds the same evidence: a day/unit
  level signal (a cluster or a day is one observation unit, never its many
  autocorrelated readings), confound triage (selection, carryover, time-of-day
  balance), and stability, then routes through the one :func:`_classify`. The
  significance bar is **tightened for the size of the closed family** (Bonferroni over
  the whole enumerated grammar, not just the cells that happen to be testable this
  window) so a wide sweep cannot fish a false positive and the bar never loosens as
  data thins.
- **Every enumerated cell gets one of exactly three verdicts.** Every cell — including
  one with an empty arm this era, and every cell on an empty reporting window — is
  priced through the identical gate and carried in the payload with gate evidence,
  counted in the multiplicity denominator, never silently dropped. An empty-arm cell
  has no unit-level excess to establish, so the gate *kills* it (it is not a live
  candidate); it is not a fourth outcome.
- **Clock cells compare against a comparable block, day by day.** A clock cell asks
  whether an outcome concentrates in one part of the day *relative to a comparable-length
  block elsewhere in the same day* — one paired observation per day (never many
  day×block observations pooled as if independent), scored with the exact test for
  paired binary data (McNemar).
- **Era-bounded accrual.** A cell's evidence counts from the most recent era boundary
  forward — a settings regime change (an ``active_idp`` switch with a real profile
  diff, *or* a deliberate within-profile basal/dose edit) or a data gap — and
  restarts there. A cell whose excess has faded to nothing in the recent half of the
  era is killed: era accrual exists so an old regime can't prop up a current pattern.
- **Verdicts (exactly three).** *killed* (a confound fires, there is no excess, or the
  effect has already faded this era), *tracked* (confounds clean and the effect is still
  present, but it fails only on evidence volume / multiplicity / not-yet-stable), or
  *ready* (clears the full tightened bar). Only a *ready* cell can become a card, and
  only on human sign-off.

Stored ``t`` is pump-local naive wall clock; parsed without timezone conversion (the
CGM-timezone trap in AGENTS.md). Observation units are days or clusters, never readings.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
import math
import statistics
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple

from .insulin import iob_fraction

GRAMMAR_VERSION = 1

LOW = 70.0
HIGH = 250.0
MIN_BLOCK_COVERAGE = 0.5  # a day is eligible only with ≥ half the window's readings
ALPHA = 0.05
# A cleared cell becomes an advice-adjacent card, so it needs enough supporting
# outcome-days to trust before it can ship — mirroring the basal engine's
# _MIN_SUPPORTED_NIGHTS floor (a narrow, thin-support signal must not assert a
# direction; AGENTS.md "thin basal slot" gotcha). Below the floor a genuine, clean
# effect caps at *tracked* (watch) rather than *ready*, and clears once more accrues.
_MIN_SUPPORTED_DAYS = 8
# A gap of at least this many days between consecutive observed days is an era
# boundary — evidence restarts on the far side. Sized well above a normal
# sensor-warmup skip so an ordinary missed day is not mistaken for a new regime.
_ERA_GAP_DAYS = 14
# A day within this many days *before* a site change is late in that site's life —
# the "site-age" where the reactive-site candidate lives.
_SITE_AGING_DAYS = 2
# The anchor-follow window and clustering gaps (mirrors the #364 reference).
_FOLLOW_HOURS = 3
_SUSPEND_CLUSTER = timedelta(hours=3)
_SITE_CLUSTER = timedelta(minutes=5)
_NEAR_SITE = timedelta(minutes=30)
# Site-life drift accounting (mirrors the #364 reference's reactive-site probe): the
# reconstructed-IOB curve peak/DIA, and the IOB above which a reading is "explained".
_ACCOUNTING_PEAK_MIN = 75.0
_ACCOUNTING_DIA_MIN = 300.0
_HIGH_IOB_UNITS = 1.0
_SITE_DRIFT_MGDL = 10.0  # a site-life median shift past this is a "drift"

FOOTNOTE = (
    "Pattern sweep: nothing recurring in your data has cleared the evidence bar "
    "this window."
)


# --- the shared gate math (lifted from the #364 reference so verdicts match) ----


def wilson_score_interval(events: int, n: int) -> Tuple[float, float]:
    if not n:
        return 0.0, 0.0
    z = 1.959963984540054
    p = events / n
    denominator = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denominator
    half_width = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator
    return center - half_width, center + half_width


def newcombe_risk_difference_ci(a: int, n: int, b: int, m: int) -> Tuple[float, float, float]:
    if not n or not m:
        return 0.0, 0.0, 0.0
    p1, p0 = a / n, b / m
    lo1, hi1 = wilson_score_interval(a, n)
    lo0, hi0 = wilson_score_interval(b, m)
    diff = p1 - p0
    lower = diff - math.sqrt((p1 - lo1) ** 2 + (hi0 - p0) ** 2)
    upper = diff + math.sqrt((hi1 - p1) ** 2 + (p0 - lo0) ** 2)
    return diff, lower, upper


def paired_risk_difference_ci(n11: int, n10: int, n01: int, n00: int
                              ) -> Tuple[float, float, float]:
    """Newcombe's method-10 confidence interval for the difference of two *paired*
    proportions — the interval for a clock cell, whose two arms (the window and a
    comparable block) are measured on the **same** days. Feeding those correlated arms
    to the unpaired :func:`newcombe_risk_difference_ci` would understate the
    correlation and overstate the excess; this carries the four discordance cells."""
    n = n11 + n10 + n01 + n00
    if not n:
        return 0.0, 0.0, 0.0
    p1 = (n11 + n10) / n  # the window's rate
    p2 = (n11 + n01) / n  # the comparable block's rate
    diff = p1 - p2
    lo1, hi1 = wilson_score_interval(n11 + n10, n)
    lo2, hi2 = wilson_score_interval(n11 + n01, n)
    row1, row0 = n11 + n10, n01 + n00
    col1, col0 = n11 + n01, n10 + n00
    product = row1 * row0 * col1 * col0
    phi = 0.0 if product == 0 else (n11 * n00 - n10 * n01) / math.sqrt(product)
    lower = diff - math.sqrt(max(0.0,
        (p1 - lo1) ** 2 - 2 * phi * (p1 - lo1) * (hi2 - p2) + (hi2 - p2) ** 2))
    upper = diff + math.sqrt(max(0.0,
        (hi1 - p1) ** 2 - 2 * phi * (hi1 - p1) * (p2 - lo2) + (p2 - lo2) ** 2))
    return diff, lower, upper


def fisher_exact_two_sided(a: int, n: int, b: int, m: int) -> float:
    successes = a + b
    total = n + m
    if not total:
        return 1.0
    minimum = max(0, n - (total - successes))
    maximum = min(n, successes)
    denominator = math.comb(total, n)

    def probability(first_events: int) -> float:
        return (
            math.comb(successes, first_events)
            * math.comb(total - successes, n - first_events)
            / denominator
        )

    observed = probability(a)
    return min(
        1.0,
        sum(
            probability(first_events)
            for first_events in range(minimum, maximum + 1)
            if probability(first_events) <= observed * (1 + 1e-12)
        ),
    )


def mcnemar_exact_two_sided(n10: int, n01: int) -> float:
    """The exact McNemar test for paired binary data: an exact two-sided binomial test
    on the discordant pairs. The observation unit is the *pair* (a day contributing one
    window reading and one comparable-block reading), never the reading — this is the
    exact test appropriate to the day-level clock comparison."""
    discordant = n10 + n01
    if not discordant:
        return 1.0
    smaller = min(n10, n01)
    tail = sum(math.comb(discordant, i) for i in range(smaller + 1)) / (2 ** discordant)
    return min(1.0, 2 * tail)


# --- the day-level snapshot the grammar sweeps over -----------------------------


@dataclass(frozen=True)
class _Cgm:
    t: datetime
    bg: float


@dataclass(frozen=True)
class _Bolus:
    t: datetime
    insulin: float
    carbs: float


class DaySnapshot:
    """The observed-day / event view the sweep prices cells against.

    Pump-derived only: CGM (the low/high outcomes), boluses (carb exposure and the
    reconstructed IOB the site-life probe cleans on), site-change / user-suspend pump
    events (the anchor-follow and site-life families), and the manual carb log (the
    post-low rescue-carb exclusion). Rate-based cells operate on **days**; the
    anchor-follow family operates on **event clusters**; both are cluster-level
    observation units — one unit carries an outcome or it does not, regardless of how
    many readings cross the threshold.
    """

    def __init__(self, cgm: Sequence[_Cgm], bolus: Sequence[_Bolus],
                 site_change_days: Iterable[date], suspend_days: Iterable[date],
                 site_times: Iterable[datetime] = (),
                 suspend_times: Iterable[datetime] = (),
                 carb_log_times: Iterable[datetime] = ()):
        self.cgm = sorted(cgm, key=lambda r: r.t)
        self.cgm_times = [r.t for r in self.cgm]
        self.bolus = sorted(bolus, key=lambda r: r.t)
        self.bolus_times = [r.t for r in self.bolus]
        self.site_times = sorted(site_times)
        self.suspend_times = sorted(suspend_times)
        self.carb_log_times = sorted(carb_log_times)
        self.by_day: Dict[date, List[_Cgm]] = defaultdict(list)
        for row in self.cgm:
            self.by_day[row.t.date()].append(row)
        self.observed_days = sorted(self.by_day)

        # Prior-evening late meal → the *following* day carries the exposure (a
        # ≥20:00 carb bolus's tail runs into the overnight window). This is the one
        # confound stratifier every cell shares (the #364 reference's selection probe).
        self.late_meal_days: set = set()
        for row in bolus:
            if row.carbs > 0 and row.t.hour >= 20:
                self.late_meal_days.add(row.t.date() + timedelta(days=1))
        self.site_change_days = set(site_change_days)
        self.suspend_days = set(suspend_days)
        # A day within one day of a site change is "fresh site".
        self.fresh_site_days: set = set()
        for d in self.site_change_days:
            self.fresh_site_days.add(d)
            self.fresh_site_days.add(d + timedelta(days=1))

    def readings(self, start: datetime, end: datetime) -> List[_Cgm]:
        lo = bisect_left(self.cgm_times, start)
        hi = bisect_left(self.cgm_times, end)
        return self.cgm[lo:hi]

    def boluses(self, start: datetime, end: datetime) -> List[_Bolus]:
        lo = bisect_left(self.bolus_times, start)
        hi = bisect_right(self.bolus_times, end)
        return self.bolus[lo:hi]

    def _rows(self, day: date, start_h: int, end_h: int) -> List[_Cgm]:
        start = datetime.combine(day, time()) + timedelta(hours=start_h)
        end = datetime.combine(day, time()) + timedelta(hours=end_h)
        return [r for r in self.by_day.get(day, ()) if start <= r.t < end]

    def eligible_days(self, start_h: int, end_h: int, universe: Iterable[date]) -> set:
        # A *sub-day* window needs ≥ half its five-minute readings before "no outcome
        # there" is trustworthy. The whole-day window counts every observed day (a
        # recorded outcome is real regardless of coverage) — matching the #364
        # reference's day-of-week candidate, which gates on observed days, not coverage.
        if start_h == 0 and end_h == 24:
            minimum = 1
        else:
            minimum = math.ceil((end_h - start_h) * 12 * MIN_BLOCK_COVERAGE)
        return {d for d in universe if len(self._rows(d, start_h, end_h)) >= minimum}

    def outcome_in(self, day: date, start_h: int, end_h: int,
                   crosses: Callable[[float], bool]) -> bool:
        return any(crosses(r.bg) for r in self._rows(day, start_h, end_h))

    def iob_at(self, at: datetime) -> float:
        start = at - timedelta(minutes=_ACCOUNTING_DIA_MIN)
        return sum(
            row.insulin * iob_fraction((at - row.t).total_seconds() / 60.0,
                                       _ACCOUNTING_PEAK_MIN, _ACCOUNTING_DIA_MIN)
            for row in self.boluses(start, at) if row.insulin > 0
        )

    def unexplained(self, at: datetime) -> bool:
        recent = self.boluses(at - timedelta(minutes=_ACCOUNTING_DIA_MIN), at)
        if any(row.carbs > 0 and at - row.t <= timedelta(hours=4) for row in recent):
            return False
        return self.iob_at(at) <= _HIGH_IOB_UNITS


# --- the closed grammar (versioned; growing it is a reviewed change) ------------


@dataclass(frozen=True)
class Outcome:
    """What a unit can carry — a low (<70) or a high (>250). No causal claim."""

    key: str
    label: str
    crosses: Callable[[float], bool]


OUTCOMES: Tuple[Outcome, ...] = (
    Outcome("low", "a low", lambda bg: bg < LOW),
    Outcome("high", "a high", lambda bg: bg > HIGH),
)


@dataclass(frozen=True)
class Window:
    """An outcome window — "an outcome sometime in these hours". The localized where."""

    key: str
    start_h: int
    end_h: int
    label: str


@dataclass(frozen=True)
class Partition:
    """A *where* — a pump-derived split of observed days into an in-group vs the rest."""

    key: str
    label: str
    predicate: Callable[["DaySnapshot", date], bool]


@dataclass(frozen=True)
class Anchor:
    """An event the anchor-follow family fires from — a suspend cluster or a low.

    ``outcomes`` is the closed set of follow-outcomes that anchor can meaningfully ask
    about. A pump suspend can be followed by either extreme; a *low* anchor asks only
    about the opposite extreme (a rebound high) — "does a low follow a low" is the same
    low episode, not a pattern, so the self-referential outcome is not in the grammar.
    """

    key: str
    label: str
    outcomes: Tuple[str, ...]


WINDOWS: Tuple[Window, ...] = (
    Window("full", 0, 24, "all day"),
    Window("overnight", 0, 6, "00:00–06:00"),
    Window("earlyam", 2, 5, "02:00–05:00"),
    Window("morning", 6, 12, "06:00–12:00"),
    Window("afternoon", 12, 18, "12:00–18:00"),
    Window("evening", 18, 24, "18:00–24:00"),
)

_WEEKDAY_LABEL = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
                  "Saturday", "Sunday")


def _partitions() -> Tuple[Partition, ...]:
    """The *between* family's day-partitions — pure calendar / day-membership splits
    only. Event-shaped candidates (post-low rebound, reactive site, user suspend) are
    **not** day-partitions — they have their own families with their reference shapes,
    so they are deliberately absent here rather than reframed as a "day with an event"
    rate.
    """
    parts: List[Partition] = []
    for wd in range(7):
        parts.append(Partition(
            f"dow-{wd}", f"{_WEEKDAY_LABEL[wd]}s",
            (lambda snap, d, wd=wd: d.weekday() == wd)))
    parts.append(Partition("weekend", "weekends",
                           lambda snap, d: d.weekday() >= 5))
    parts.append(Partition("late-meal", "days after a late-evening meal",
                           lambda snap, d: d in snap.late_meal_days))
    parts.append(Partition("fresh-site", "fresh-infusion-site days",
                           lambda snap, d: d in snap.fresh_site_days))
    return tuple(parts)


PARTITIONS: Tuple[Partition, ...] = _partitions()

ANCHORS: Tuple[Anchor, ...] = (
    Anchor("suspend", "a pump suspend", ("low", "high")),
    Anchor("postlow", "a low", ("high",)),
)

# The clustering family compares one part of the day against a comparable block, so it
# only makes sense for the sub-day windows (a whole-day window has no comparable block).
_CLUSTER_WINDOWS: Tuple[Window, ...] = tuple(w for w in WINDOWS if w.key != "full")


@dataclass(frozen=True)
class CellSpec:
    """One enumerated grammar cell. ``kind`` selects the family and its pricer:

    - ``between`` — the partition's in-group days versus the rest, in one window.
    - ``clock``   — a sub-day window versus a comparable block of the same days.
    - ``follow``  — an outcome within three hours of an anchor event, versus a
                    time-matched control.
    - ``sitelife``— a glucose drift over an infusion site's life.
    """

    outcome: Outcome
    kind: str
    window: Optional[Window] = None
    partition: Optional[Partition] = None
    anchor: Optional[Anchor] = None

    @property
    def id(self) -> str:
        if self.kind == "clock":
            return f"{self.outcome.key}__{self.window.key}__clock"
        if self.kind == "follow":
            return f"{self.outcome.key}__{self.anchor.key}__follow"
        if self.kind == "sitelife":
            return f"{self.outcome.key}__site__life"
        return f"{self.outcome.key}__{self.window.key}__{self.partition.key}"

    @property
    def window_label(self) -> str:
        if self.kind == "follow":
            return f"within three hours of {self.anchor.label}"
        if self.kind == "sitelife":
            return "over an infusion site's life"
        return self.window.label

    @property
    def where_label(self) -> str:
        if self.kind == "clock":
            return "a comparable block elsewhere in the day"
        if self.kind == "follow":
            return "a time-matched control"
        if self.kind == "sitelife":
            return "the site's own baseline"
        return self.partition.label


def grammar_cells() -> Tuple[CellSpec, ...]:
    """The whole closed family, enumerated. Its *size* is the multiplicity denominator,
    fixed by the grammar and independent of how much data is available this window."""
    cells: List[CellSpec] = []
    for outcome in OUTCOMES:
        for window in WINDOWS:
            for partition in PARTITIONS:
                cells.append(CellSpec(outcome, "between", window=window,
                                      partition=partition))
        for window in _CLUSTER_WINDOWS:
            cells.append(CellSpec(outcome, "clock", window=window))
        for anchor in ANCHORS:
            if outcome.key in anchor.outcomes:
                cells.append(CellSpec(outcome, "follow", anchor=anchor))
        cells.append(CellSpec(outcome, "sitelife"))
    return tuple(cells)


GRAMMAR_CELLS: Tuple[CellSpec, ...] = grammar_cells()


# --- pricing one cell -----------------------------------------------------------


@dataclass(frozen=True)
class Gate:
    passed: bool
    evidence: str


def _rate(n: int, d: int) -> float:
    return n / d if d else 0.0


def _fmt(n: int, d: int) -> str:
    return f"{n}/{d} ({100.0 * _rate(n, d):.1f}%)"


def _f(value: float, digits: int = 1) -> float:
    return round(value, digits)


@dataclass
class CellResult:
    id: str
    outcome: str
    window: str
    where: str
    a_events: int
    a_n: int
    b_events: int
    b_n: int
    risk_difference_pct: float
    newcombe_95ci_pct: Tuple[float, float]
    fisher_p: float
    alpha_corrected: float
    day_level_signal: Gate
    gates: Dict[str, Gate]
    verdict: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "outcome": self.outcome,
            "window": self.window,
            "where": self.where,
            "in_group": {"events": self.a_events, "n": self.a_n},
            "out_group": {"events": self.b_events, "n": self.b_n},
            "risk_difference_pct": self.risk_difference_pct,
            "risk_difference_newcombe_95ci_pct": list(self.newcombe_95ci_pct),
            "fisher_exact_two_sided_p": self.fisher_p,
            "alpha_corrected": self.alpha_corrected,
            "day_level_signal": {"passed": self.day_level_signal.passed,
                                 "evidence": self.day_level_signal.evidence},
            "gates": {k: {"passed": g.passed, "evidence": g.evidence}
                      for k, g in self.gates.items()},
            "verdict": self.verdict,
        }


def _six_hour_blocks(snap: DaySnapshot, in_days: set, out_days: set,
                     crosses: Callable[[float], bool]) -> int:
    """How many of the four 6-hour blocks the in-group's outcome rate exceeds the out's.

    The #364 time-of-day-balance probe: a genuine day-partition effect shows across the
    clock, not in one block a confound could explain.
    """
    excess = 0
    for start in (0, 6, 12, 18):
        a = sum(snap.outcome_in(d, start, start + 6, crosses) for d in in_days)
        b = sum(snap.outcome_in(d, start, start + 6, crosses) for d in out_days)
        if _rate(a, len(in_days)) > _rate(b, len(out_days)):
            excess += 1
    return excess


def _halves(days: Sequence[date]) -> Tuple[set, set]:
    cut = len(days) // 2
    return set(days[:cut]), set(days[cut:])


def _empty_arm_result(spec: CellSpec, alpha_corrected: float, in_n: int, out_n: int,
                      unit: str = "eligible days") -> CellResult:
    """A cell with an empty arm this era: no two-arm comparison exists, so the gate finds
    no unit-level excess and the cell is *killed* — one of the three verdicts, priced
    through the same gate as every other cell, and still counted in the closed family's
    multiplicity denominator so the bar cannot loosen as data thins (adr-378 §3). It
    never enters the tracked or ready sets."""
    note = Gate(False,
                f"Only one arm had {unit} this era "
                f"(in-group n={in_n}, out-group n={out_n}); no unit-level excess "
                f"could be established.")
    return CellResult(
        id=spec.id, outcome=spec.outcome.key, window=spec.window_label,
        where=spec.where_label, a_events=0, a_n=in_n, b_events=0, b_n=out_n,
        risk_difference_pct=0.0, newcombe_95ci_pct=(0.0, 0.0), fisher_p=1.0,
        alpha_corrected=_f(alpha_corrected, 5), day_level_signal=note,
        gates={k: note for k in ("selection", "carryover",
                                 "time_of_day_balance", "stability")},
        verdict="killed",
    )


def _comparison_blocks(window: Window) -> List[Tuple[int, int]]:
    """Every same-width block tiling the *rest* of the day — the pool a clock cell draws
    its per-day comparable block from. Laid down forward from the window's end and
    backward from its start so only full, non-overlapping same-width blocks are used."""
    w = window.end_h - window.start_h
    blocks: List[Tuple[int, int]] = []
    x = window.end_h
    while x + w <= 24:
        blocks.append((x, x + w)); x += w
    x = window.start_h - w
    while x >= 0:
        blocks.append((x, x + w)); x -= w
    return sorted(blocks)


def price_cell(snap: DaySnapshot, spec: CellSpec,
               era_days: Sequence[date], alpha_corrected: float) -> CellResult:
    """Price one grammar cell through the shared gate over ``era_days`` (era-bounded).

    Always returns a :class:`CellResult` with one of the three verdicts; a cell whose
    comparison cannot be formed (an empty arm, or an empty reporting window) comes back
    *killed* through the same gate, never a silent drop."""
    if spec.kind == "clock":
        return _price_clock(snap, spec, era_days, alpha_corrected)
    if spec.kind == "follow":
        if spec.anchor.key == "suspend":
            return _price_suspend_follow(snap, spec, era_days, alpha_corrected)
        return _price_postlow_follow(snap, spec, era_days, alpha_corrected)
    if spec.kind == "sitelife":
        return _price_sitelife(snap, spec, era_days, alpha_corrected)
    return _price_between(snap, spec, era_days, alpha_corrected)


def _price_between(snap: DaySnapshot, spec: CellSpec,
                   era_days: Sequence[date], alpha_corrected: float) -> CellResult:
    """A *between* cell: the partition's in-group days versus the rest, same window."""
    window, outcome = spec.window, spec.outcome
    crosses = outcome.crosses
    eligible = snap.eligible_days(window.start_h, window.end_h, era_days)
    in_days = {d for d in eligible if spec.partition.predicate(snap, d)}
    out_days = eligible - in_days
    if not in_days or not out_days:
        return _empty_arm_result(spec, alpha_corrected, len(in_days), len(out_days))

    def hit(d: date) -> bool:
        return snap.outcome_in(d, window.start_h, window.end_h, crosses)

    a = sum(hit(d) for d in in_days)
    b = sum(hit(d) for d in out_days)
    diff, lo, hi = newcombe_risk_difference_ci(a, len(in_days), b, len(out_days))
    p = fisher_exact_two_sided(a, len(in_days), b, len(out_days))
    signal = Gate(
        lo > 0 and p < alpha_corrected,
        f"The day-level excess was {diff*100:+.1f} points (Newcombe/Wilson 95% CI "
        f"{lo*100:+.1f} to {hi*100:+.1f}; two-sided Fisher exact p={p:.3f}; "
        f"multiplicity-corrected bar p<{alpha_corrected:.4f}).",
    )

    # --- confound triage --------------------------------------------------------
    # selection: does the effect survive stratifying by the prior-evening late meal?
    sel_in = {d for d in in_days if d in snap.late_meal_days}
    sel_out = {d for d in out_days if d in snap.late_meal_days}
    clean_in = in_days - sel_in
    clean_out = out_days - sel_out

    def _stratum_holds(gi: set, go: set) -> bool:
        if not gi or not go:
            return True  # empty stratum can't confound (degenerate for the late-meal cell)
        return _rate(sum(hit(d) for d in gi), len(gi)) \
            >= _rate(sum(hit(d) for d in go), len(go))

    selection = Gate(
        _stratum_holds(sel_in, sel_out) and _stratum_holds(clean_in, clean_out),
        f"After a prior-evening late meal the in-group was "
        f"{_fmt(sum(hit(d) for d in sel_in), len(sel_in))} "
        f"versus {_fmt(sum(hit(d) for d in sel_out), len(sel_out))}; "
        f"clean handoffs were "
        f"{_fmt(sum(hit(d) for d in clean_in), len(clean_in))} "
        f"versus {_fmt(sum(hit(d) for d in clean_out), len(clean_out))}.",
    )

    # carryover: does the excess persist after dropping the window's first six hours
    # (removing an overnight bleed the previous day's dosing could carry)?
    c_start = window.start_h + 6 if window.end_h - window.start_h > 6 else max(window.start_h, 6)
    c_end = max(c_start, window.end_h)
    if c_end > c_start:
        ca = sum(snap.outcome_in(d, c_start, c_end, crosses) for d in in_days)
        cb = sum(snap.outcome_in(d, c_start, c_end, crosses) for d in out_days)
        carry_pass = _rate(ca, len(in_days)) >= _rate(cb, len(out_days))
        carry_ev = (f"After dropping the first hours, the in-group remained "
                    f"{_fmt(ca, len(in_days))} versus {_fmt(cb, len(out_days))}.")
    else:
        carry_pass, carry_ev = True, "Window too short to test a carryover tail."
    carryover = Gate(carry_pass, carry_ev)

    # time-of-day balance: a genuine whole-day partition effect shows across the clock;
    # a sub-day window is localized by construction, so balance is met there.
    if window.start_h == 0 and window.end_h == 24:
        blocks = _six_hour_blocks(snap, in_days, out_days, crosses)
        balance = Gate(blocks >= 2,
                       f"The in-group exceeded the out-group in {blocks} of four "
                       f"six-hour blocks.")
    else:
        balance = Gate(True, f"The outcome is localized to {window.label} by construction.")

    # stability: split the era's *observed* days in half (not the cell's eligible
    # subset), intersect each arm with the halves, and require both halves to carry a
    # positive, comparable excess. Splitting observed days keeps the cut point the same
    # across cells and matches the #364 reference's "first 75 vs last 75 observed days".
    h1, h2 = _halves(list(era_days))
    diffs = []
    for half in (h1, h2):
        ai, ni = sum(hit(d) for d in in_days & half), len(in_days & half)
        bo, no = sum(hit(d) for d in out_days & half), len(out_days & half)
        diffs.append(_rate(ai, ni) - _rate(bo, no))
    stability = _stability_gate(diffs)

    confounds = {"selection": selection, "carryover": carryover,
                 "time_of_day_balance": balance, "stability": stability}
    verdict = _classify(diff, signal, confounds, _recent_positive(diffs), a)
    return CellResult(
        id=spec.id, outcome=outcome.key, window=window.label, where=spec.where_label,
        a_events=a, a_n=len(in_days), b_events=b, b_n=len(out_days),
        risk_difference_pct=_f(diff * 100),
        newcombe_95ci_pct=(_f(lo * 100), _f(hi * 100)),
        fisher_p=_f(p, 4), alpha_corrected=_f(alpha_corrected, 5),
        day_level_signal=signal, gates=confounds, verdict=verdict,
    )


def _price_clock(snap: DaySnapshot, spec: CellSpec,
                 era_days: Sequence[date], alpha_corrected: float) -> CellResult:
    """A *clock* cell: the window versus a comparable same-width block, **paired by day**.

    Each eligible day contributes one paired observation — did the outcome fall in the
    window, and did it fall in the comparable block — so the comparison arm is a
    per-day binary, never a pool of many day×block observations counted as if
    independent. The exact test is McNemar's on the discordant pairs; the interval is
    Newcombe's paired method. This restores the day as the observation unit (adr-378 §3)
    while keeping the #364 reference's "does the outcome pile up here versus a comparable
    stretch?" question."""
    window, outcome = spec.window, spec.outcome
    crosses = outcome.crosses
    s, e = window.start_h, window.end_h
    blocks = _comparison_blocks(window)
    if not blocks:
        return _empty_arm_result(spec, alpha_corrected, 0, 0, "paired days")

    def win_hit(d: date) -> bool:
        return snap.outcome_in(d, s, e, crosses)

    # Each day is matched to ONE comparable block — but the block *rotates* across days,
    # cycling through the whole pool, so the comparison arm's pooled rate is the average
    # comparable-block rate (representative of "elsewhere in the day"), not a single
    # possibly-atypical block, while each day still contributes exactly one paired
    # observation. A day whose rotational block is not coverable falls through to the
    # next coverable block deterministically; a day with no coverable comparable block
    # is not a pair.
    window_days = sorted(snap.eligible_days(s, e, era_days))
    paired: List[Tuple[date, Tuple[int, int]]] = []
    for i, d in enumerate(window_days):
        for offset in range(len(blocks)):
            bs, be = blocks[(i + offset) % len(blocks)]
            if snap.eligible_days(bs, be, (d,)):
                paired.append((d, (bs, be)))
                break

    n = len(paired)
    if not n:
        return _empty_arm_result(spec, alpha_corrected, 0, 0, "paired days")

    def blk_hit(d: date, block: Tuple[int, int]) -> bool:
        return snap.outcome_in(d, block[0], block[1], crosses)

    n11 = sum(win_hit(d) and blk_hit(d, blk) for d, blk in paired)
    n10 = sum(win_hit(d) and not blk_hit(d, blk) for d, blk in paired)
    n01 = sum(not win_hit(d) and blk_hit(d, blk) for d, blk in paired)
    n00 = n - n11 - n10 - n01
    a = n11 + n10  # window outcome-days
    b = n11 + n01  # comparable-block outcome-days (same n days)
    diff, lo, hi = paired_risk_difference_ci(n11, n10, n01, n00)
    p = mcnemar_exact_two_sided(n10, n01)
    signal = Gate(
        lo > 0 and p < alpha_corrected,
        f"The outcome fell in {window.label} on {_fmt(a, n)} of paired days versus "
        f"{_fmt(b, n)} in a comparable same-width block elsewhere in the day "
        f"(paired risk difference {diff*100:+.1f} points, Newcombe 95% CI "
        f"{lo*100:+.1f} to {hi*100:+.1f}; exact McNemar p={p:.3f}; "
        f"multiplicity-corrected bar p<{alpha_corrected:.4f}).",
    )

    # selection: a genuine clock concentration is not just the tail of a prior-evening
    # late meal. If the window-outcome rate runs far higher after a late meal than on
    # clean nights, the concentration is a meal artifact (the #364 reference's kill).
    late_days = [d for d, _ in paired if d in snap.late_meal_days]
    clean_days = [d for d, _ in paired if d not in snap.late_meal_days]
    r_late = _rate(sum(win_hit(d) for d in late_days), len(late_days))
    r_clean = _rate(sum(win_hit(d) for d in clean_days), len(clean_days))
    selection = Gate(
        not late_days or (r_late - r_clean) <= 0.10,
        f"The window-outcome rate was {_fmt(sum(win_hit(d) for d in late_days), len(late_days))} "
        f"after a prior-evening late meal versus "
        f"{_fmt(sum(win_hit(d) for d in clean_days), len(clean_days))} on clean days.",
    )

    # carryover: after a clean prior-evening handoff, the window still concentrates the
    # outcome (it did not merely inherit it from the evening before).
    carryover = Gate(
        not clean_days or r_clean >= _rate(a, n) * 0.5,
        f"After a clean prior-evening handoff the window still carried the outcome on "
        f"{_fmt(sum(win_hit(d) for d in clean_days), len(clean_days))} of days.",
    )

    # balance: a clock cell is localized to the window by construction.
    balance = Gate(True, f"The outcome is localized to {window.label} by construction.")

    # stability: both era-halves show a positive window-versus-block paired excess.
    h1, h2 = _halves(list(era_days))
    diffs = []
    for half in (h1, h2):
        ph = [(d, blk) for d, blk in paired if d in half]
        ah = _rate(sum(win_hit(d) for d, _ in ph), len(ph))
        bh = _rate(sum(blk_hit(d, blk) for d, blk in ph), len(ph))
        diffs.append(ah - bh)
    stability = _stability_gate(diffs)

    confounds = {"selection": selection, "carryover": carryover,
                 "time_of_day_balance": balance, "stability": stability}
    verdict = _classify(diff, signal, confounds, _recent_positive(diffs), a)
    return CellResult(
        id=spec.id, outcome=outcome.key, window=window.label, where=spec.where_label,
        a_events=a, a_n=n, b_events=b, b_n=n,
        risk_difference_pct=_f(diff * 100),
        newcombe_95ci_pct=(_f(lo * 100), _f(hi * 100)),
        fisher_p=_f(p, 4), alpha_corrected=_f(alpha_corrected, 5),
        day_level_signal=signal, gates=confounds, verdict=verdict,
    )


def _clusters(times: Sequence[datetime], gap: timedelta) -> List[List[datetime]]:
    groups: List[List[datetime]] = []
    for at in times:
        if not groups or at - groups[-1][-1] > gap:
            groups.append([at])
        else:
            groups[-1].append(at)
    return groups


def _era_window(era_days: Sequence[date]) -> Tuple[Optional[datetime], Optional[datetime]]:
    if not era_days:
        return None, None
    lo = datetime.combine(era_days[0], time())
    hi = datetime.combine(era_days[-1], time()) + timedelta(days=1)
    return lo, hi


def _price_suspend_follow(snap: DaySnapshot, spec: CellSpec,
                          era_days: Sequence[date], alpha_corrected: float) -> CellResult:
    """A *suspend-follow* cell: does the outcome follow a **user-suspend cluster** within
    three hours, versus a time-matched control window on non-suspend days?

    The observation unit is the suspend *cluster* (events collapsed on a three-hour gap)
    with ≥50% follow-up coverage — the #364 reference's user-suspend shape, not a
    "day with a suspend" rate. The selection probe is co-location with a site change: on
    the real snapshot the outcome follows far more often within 30 minutes of a site
    change than away from one, so the follow is a site-change artifact and the cell is
    killed on selection — the reference's own kill, reached without an era trick."""
    outcome, crosses = spec.outcome, spec.outcome.crosses
    lo_t, hi_t = _era_window(era_days)
    suspends = [t for t in snap.suspend_times if lo_t is not None and lo_t <= t < hi_t]
    clusters = _clusters(suspends, _SUSPEND_CLUSTER)

    rows: List[dict] = []
    for cluster in clusters:
        end = cluster[-1]
        post = snap.readings(end, end + timedelta(hours=_FOLLOW_HOURS))
        if len(post) < 18:  # ≥50% of the expected five-minute follow-up rows
            continue
        near_site = any(abs((s - site).total_seconds()) <= _NEAR_SITE.total_seconds()
                        for s in cluster for site in snap.site_times)
        rows.append({"start": cluster[0], "near_site": near_site,
                     "hit": any(crosses(r.bg) for r in post)})

    # A time-matched control: the same three-hour clock window on observed days that
    # carry no suspend cluster — one control per suspend cluster's start hour.
    suspend_days = {t.date() for t in suspends}
    control_days = [d for d in era_days if d not in suspend_days]
    controls: List[bool] = []
    control_cursor = 0
    for row in rows:
        if not control_days:
            break
        d = control_days[control_cursor % len(control_days)]
        control_cursor += 1
        start = datetime.combine(d, time(row["start"].hour))
        window = snap.readings(start, start + timedelta(hours=_FOLLOW_HOURS))
        if len(window) >= 18:
            controls.append(any(crosses(r.bg) for r in window))

    n, m = len(rows), len(controls)
    if not n or not m:
        return _empty_arm_result(spec, alpha_corrected, n, m, "suspend clusters")
    a = sum(row["hit"] for row in rows)
    b = sum(controls)
    diff, ci_lo, ci_hi = newcombe_risk_difference_ci(a, n, b, m)
    p = fisher_exact_two_sided(a, n, b, m)
    signal = Gate(
        ci_lo > 0 and p < alpha_corrected,
        f"{outcome.label.capitalize()} followed a suspend cluster within three hours on "
        f"{_fmt(a, n)} clusters versus {_fmt(b, m)} time-matched control windows "
        f"(risk difference {diff*100:+.1f} points, Newcombe 95% CI {ci_lo*100:+.1f} to "
        f"{ci_hi*100:+.1f}; two-sided Fisher exact p={p:.3f}; "
        f"multiplicity-corrected bar p<{alpha_corrected:.4f}).",
    )

    selected = [row for row in rows if row["near_site"]]
    clean = [row for row in rows if not row["near_site"]]
    sel_rate = _rate(sum(row["hit"] for row in selected), len(selected))
    clean_rate = _rate(sum(row["hit"] for row in clean), len(clean))
    selection = Gate(
        not selected or len(selected) / n < 0.4 or sel_rate < clean_rate * 1.5,
        f"{len(selected)}/{n} clusters were within 30 minutes of a site change; the "
        f"outcome followed {_fmt(sum(row['hit'] for row in selected), len(selected))} "
        f"near a change versus {_fmt(sum(row['hit'] for row in clean), len(clean))} "
        f"otherwise.",
    )
    carryover = Gate(
        not clean or clean_rate >= sel_rate * 0.75,
        f"After a clean handoff away from site-change work the outcome still followed "
        f"{_fmt(sum(row['hit'] for row in clean), len(clean))} of clusters.",
    )
    afternoon = lambda row: 15 <= row["start"].hour < 24
    all_pm = _rate(sum(afternoon(row) for row in rows), n)
    clean_pm = _rate(sum(afternoon(row) for row in clean), len(clean))
    balance = Gate(
        abs(all_pm - clean_pm) <= 0.10,
        f"15:00–24:00 held {all_pm*100:.1f}% of all clusters and {clean_pm*100:.1f}% "
        f"after site-change clusters were removed.",
    )

    h1, h2 = _halves(list(era_days))
    diffs = []
    for half in (h1, h2):
        part = [row for row in rows if row["start"].date() in half]
        diffs.append(_rate(sum(row["hit"] for row in part), len(part))
                     - _rate(b, m))
    stability = _stability_gate(diffs)

    confounds = {"selection": selection, "carryover": carryover,
                 "time_of_day_balance": balance, "stability": stability}
    verdict = _classify(diff, signal, confounds, _recent_positive(diffs), a)
    return CellResult(
        id=spec.id, outcome=outcome.key, window=spec.window_label, where=spec.where_label,
        a_events=a, a_n=n, b_events=b, b_n=m,
        risk_difference_pct=_f(diff * 100),
        newcombe_95ci_pct=(_f(ci_lo * 100), _f(ci_hi * 100)),
        fisher_p=_f(p, 4), alpha_corrected=_f(alpha_corrected, 5),
        day_level_signal=signal, gates=confounds, verdict=verdict,
    )


def _price_postlow_follow(snap: DaySnapshot, spec: CellSpec,
                          era_days: Sequence[date], alpha_corrected: float) -> CellResult:
    """A *post-low-follow* cell: does the outcome follow a **low** within three hours,
    versus a **time-matched non-low control day**?

    The unit is the low-day (a day carrying a low is one observation, not its many low
    readings); each non-low control day borrows its match's first-low hour so the
    control arm stays independent days, not overlapping blocks. The #364 post-low
    rebound shape (a high after a low), restored — on the real snapshot rebounds run
    *below* the time-matched base rate, so there is no excess and the cell is killed."""
    outcome, crosses = spec.outcome, spec.outcome.crosses
    low_by_day: Dict[date, List[_Cgm]] = {}
    for d in era_days:
        lows = [r for r in snap.by_day.get(d, ()) if r.bg < LOW]
        if lows:
            low_by_day[d] = lows

    follow_days: set = set()
    treated: set = set()
    first_low_hour: Dict[date, int] = {}
    for d, lows in low_by_day.items():
        first_low_hour[d] = lows[0].t.hour
        for low in lows:
            after = [r for r in snap.readings(low.t, low.t + timedelta(hours=_FOLLOW_HOURS))
                     if crosses(r.bg)]
            if not after:
                continue
            follow_days.add(d)
            first = after[0].t
            if any(r.carbs > 0 for r in snap.boluses(low.t, first)):
                treated.add(d)
            if any(low.t < ct <= first for ct in snap.carb_log_times):
                treated.add(d)
            break

    control_pool = [d for d in era_days if d not in low_by_day]
    controls: Dict[date, bool] = {}
    for other in control_pool:
        if not low_by_day:
            break
        nearest = min(low_by_day, key=lambda ld: (abs((ld - other).days), ld))
        start = datetime.combine(other, time(first_low_hour[nearest]))
        rows = snap.readings(start, start + timedelta(hours=_FOLLOW_HOURS))
        if len(rows) >= 18:
            controls[other] = any(crosses(r.bg) for r in rows)

    n, m = len(low_by_day), len(controls)
    if not n or not m:
        return _empty_arm_result(spec, alpha_corrected, n, m, "low-days")
    a = len(follow_days)
    b = sum(controls.values())
    diff, ci_lo, ci_hi = newcombe_risk_difference_ci(a, n, b, m)
    p = fisher_exact_two_sided(a, n, b, m)
    signal = Gate(
        ci_lo > 0 and p < alpha_corrected,
        f"{outcome.label.capitalize()} followed a low within three hours on {_fmt(a, n)} "
        f"low-days versus {_fmt(b, m)} time-matched non-low control days "
        f"(risk difference {diff*100:+.1f} points, Newcombe 95% CI {ci_lo*100:+.1f} to "
        f"{ci_hi*100:+.1f}; two-sided Fisher exact p={p:.3f}; "
        f"multiplicity-corrected bar p<{alpha_corrected:.4f}).",
    )
    clean = len(follow_days - treated)
    selection = Gate(
        len(treated) <= len(follow_days) / 2,
        f"{len(treated)}/{len(follow_days)} follow-days had an observed carb-bearing "
        f"bolus or manual carb-log entry before the outcome; older rescue carbs are not "
        f"logged.",
    )
    carryover = Gate(
        clean >= max(3, math.ceil(len(follow_days) * 0.75)),
        f"Only {clean}/{len(follow_days)} follow-days remained after observed treatment "
        f"carryover was removed.",
    )
    balance = Gate(
        _rate(a, n) > _rate(b, m),
        f"One same-hour block per non-low control day carried the outcome on "
        f"{_fmt(b, m)} days.",
    )
    h1, h2 = _halves(list(era_days))
    diffs = []
    for half in (h1, h2):
        ldh = set(low_by_day) & half
        diffs.append(_rate(len(follow_days & ldh), len(ldh)) - _rate(b, m))
    stability = _stability_gate(diffs)

    confounds = {"selection": selection, "carryover": carryover,
                 "time_of_day_balance": balance, "stability": stability}
    verdict = _classify(diff, signal, confounds, _recent_positive(diffs), a)
    return CellResult(
        id=spec.id, outcome=outcome.key, window=spec.window_label, where=spec.where_label,
        a_events=a, a_n=n, b_events=b, b_n=m,
        risk_difference_pct=_f(diff * 100),
        newcombe_95ci_pct=(_f(ci_lo * 100), _f(ci_hi * 100)),
        fisher_p=_f(p, 4), alpha_corrected=_f(alpha_corrected, 5),
        day_level_signal=signal, gates=confounds, verdict=verdict,
    )


def _price_sitelife(snap: DaySnapshot, spec: CellSpec,
                    era_days: Sequence[date], alpha_corrected: float) -> CellResult:
    """A *site-life* cell: does glucose drift over an infusion site's life — the final
    24 hours running higher (a ``high`` cell) or lower (a ``low`` cell) than the site's
    own mid-life baseline, after post-meal and >1 U IOB readings are excluded?

    The unit is the site life (a change-to-change span, 1–7 days), and the drift is a
    median shift in mg/dL — the #364 reactive-site shape. On the real snapshot the clean
    median shift is essentially flat, so there is no drift and the cell is killed."""
    outcome = spec.outcome
    up = outcome.key == "high"
    lo_t, hi_t = _era_window(era_days)
    site_times = [t for t in snap.site_times if lo_t is not None and lo_t <= t < hi_t]
    changes = [group[0] for group in _clusters(site_times, _SITE_CLUSTER)]
    lives = list(zip(changes, changes[1:]))

    def clean_values(start: datetime, end: datetime) -> List[float]:
        return [r.bg for r in snap.readings(start, end) if snap.unexplained(r.t)]

    deltas: List[float] = []
    for start, end in lives:
        duration = (end - start).total_seconds() / 86400.0
        if not 1 <= duration <= 7:
            continue
        midpoint = start + (end - start) / 2
        baseline = clean_values(midpoint - timedelta(hours=12), midpoint + timedelta(hours=12))
        final = clean_values(end - timedelta(hours=24), end)
        if len(baseline) < 12 or len(final) < 12:
            continue
        shift = statistics.median(final) - statistics.median(baseline)
        deltas.append(shift if up else -shift)

    n = len(deltas)
    if not n:
        return _empty_arm_result(spec, alpha_corrected, 0, 0, "site lives")
    over = sum(d > _SITE_DRIFT_MGDL for d in deltas)
    median_shift = statistics.median(deltas)
    # diff drives the shared gate's "is there an excess?" guard; for a drift cell it is
    # the median shift itself (in mg/dL, reported as the risk-difference field). A flat
    # or wrong-signed median is no drift, so _classify kills it up front.
    diff = median_shift
    signal = Gate(
        median_shift > _SITE_DRIFT_MGDL and _rate(over, n) > 0.5,
        f"After post-meal and >{_HIGH_IOB_UNITS:.0f} U IOB exclusions, the site-life "
        f"median shift was {median_shift:+.1f} mg/dL and {_fmt(over, n)} lives exceeded "
        f"{'+' if up else '-'}{_SITE_DRIFT_MGDL:.0f}.",
    )
    # selection: does the drift survive the IOB/meal exclusion, or was it a dosing tail?
    raw: List[float] = []
    for start, end in lives:
        duration = (end - start).total_seconds() / 86400.0
        if not 1 <= duration <= 7:
            continue
        midpoint = start + (end - start) / 2
        base = [r.bg for r in snap.readings(midpoint - timedelta(hours=12),
                                            midpoint + timedelta(hours=12))]
        fin = [r.bg for r in snap.readings(end - timedelta(hours=24), end)]
        if len(base) < 12 or len(fin) < 12:
            continue
        shift = statistics.median(fin) - statistics.median(base)
        raw.append(shift if up else -shift)
    raw_median = statistics.median(raw) if raw else 0.0
    selection = Gate(
        abs(median_shift - raw_median) <= 5,
        f"The raw site-life median shift was {raw_median:+.1f} mg/dL; after excluding "
        f"post-meal and high-IOB readings it was {median_shift:+.1f}.",
    )
    # carryover: the drift is a sustained end-of-life effect, not a one-reading spike.
    over_rate = _rate(over, n)
    carryover = Gate(
        over_rate <= 0.75 or median_shift > _SITE_DRIFT_MGDL,
        f"{_fmt(over, n)} lives drifted past the threshold in their final day.",
    )
    balance = Gate(True, "The drift is measured against the site's own baseline by "
                         "construction.")
    days_sorted = list(era_days)
    split = days_sorted[len(days_sorted) // 2] if days_sorted else None
    early, late = [], []
    for (start, end), shift in zip(
            [(s, e) for s, e in lives
             if 1 <= (e - s).total_seconds() / 86400.0 <= 7
             and len(clean_values(s + (e - s) / 2 - timedelta(hours=12),
                                   s + (e - s) / 2 + timedelta(hours=12))) >= 12
             and len(clean_values(e - timedelta(hours=24), e)) >= 12],
            deltas):
        (early if split and end.date() < split else late).append(shift)
    half_medians = [statistics.median(early) if early else 0.0,
                    statistics.median(late) if late else 0.0]
    stability = Gate(
        half_medians[0] > 0 and half_medians[1] > 0,
        "Site-life half-window median shifts were "
        + " and ".join(f"{v:+.1f} mg/dL" for v in half_medians) + ".",
    )
    confounds = {"selection": selection, "carryover": carryover,
                 "time_of_day_balance": balance, "stability": stability}
    verdict = _classify(diff, signal, confounds, half_medians[1] > 0, over)
    return CellResult(
        id=spec.id, outcome=outcome.key, window=spec.window_label, where=spec.where_label,
        a_events=over, a_n=n, b_events=0, b_n=0,
        risk_difference_pct=_f(median_shift),
        newcombe_95ci_pct=(0.0, 0.0), fisher_p=1.0,
        alpha_corrected=_f(alpha_corrected, 5),
        day_level_signal=signal, gates=confounds, verdict=verdict,
    )


def _stability_gate(diffs: Sequence[float]) -> Gate:
    stable = (len(diffs) == 2 and min(diffs) > 0 and max(diffs) > 0
              and min(diffs) >= 0.5 * max(diffs))
    return Gate(
        bool(stable),
        "Half-window in-group excesses were "
        + " and ".join(f"{v*100:+.1f} points" for v in diffs) + ".",
    )


def _recent_positive(diffs: Sequence[float]) -> bool:
    """Is the effect still present in the *recent* half of the era?

    ``diffs`` runs oldest half first, recent half second (the observed-day split), so the
    recent-half excess is ``diffs[-1]``. A pattern whose excess has faded to nothing in
    the current half is not a live candidate — era accrual exists precisely so an old
    regime cannot prop up a current pattern, and this enforces that at the sign level."""
    return len(diffs) == 2 and diffs[-1] > 0


def _classify(diff: float, signal: Gate, confounds: Dict[str, Gate],
              recent_positive: bool, support: int) -> str:
    """killed / tracked / ready from the unit-level signal + confound triage.

    - **killed**: no real excess, a *confound* fires (selection / carryover / balance),
      or the effect has faded to nothing in the recent half of the era — the pattern is
      explained away or already gone, not merely under-powered.
    - **ready**: confounds clean, the effect is still present, the multiplicity-tightened
      signal clears, the effect is stable across the era, *and* it rests on enough
      supporting outcome-days to trust (``support >= _MIN_SUPPORTED_DAYS``).
    - **tracked**: confounds clean, the effect is genuine and still present, but it fails
      to fully clear — significance (under-powered / multiplicity), stability (an
      *emerging* split not yet trustworthy), or thin support (too few outcome-days to
      ship yet). Sunday lows fail significance; late-evening meals fail stability. Both
      track, neither ships.
    """
    if diff <= 0:
        return "killed"
    for name in ("selection", "carryover", "time_of_day_balance"):
        if not confounds[name].passed:
            return "killed"
    if not recent_positive:
        return "killed"
    if (signal.passed and confounds["stability"].passed
            and support >= _MIN_SUPPORTED_DAYS):
        return "ready"
    return "tracked"


# --- era boundary ---------------------------------------------------------------


def era_boundary(observed_days: Sequence[date],
                 regime_change_days: Iterable[date]) -> Optional[date]:
    """The most recent era boundary: latest of (a ≥14-day data gap, a settings regime
    change). Evidence accrues from here forward. ``None`` when the whole record is one
    uninterrupted era (no gap, no regime change).

    A settings regime change is supplied by the caller (from the settings changelog);
    a data gap is derived here from the observed-day sequence.
    """
    boundaries: List[date] = []
    for prev, cur in zip(observed_days, observed_days[1:]):
        if (cur - prev).days >= _ERA_GAP_DAYS:
            boundaries.append(cur)
    boundaries.extend(d for d in regime_change_days
                      if observed_days and observed_days[0] <= d <= observed_days[-1])
    return max(boundaries) if boundaries else None


def _as_date(at) -> date:
    return at.date() if hasattr(at, "date") else at


def _regime_change_days(snapshots) -> List[date]:
    """Settings regime-change dates from the append-only profile snapshots.

    A regime change is *either* an ``active_idp`` switch whose incoming profile
    genuinely differs from the outgoing one, *or* a deliberate within-profile edit to
    a basal or dose setting (any of the per-segment parameters — basal rate, ISF, I:C,
    target). A duplicate-and-switch that changes nothing is cosmetic and ignored, so a
    bookkeeping profile switch does not spuriously restart accrual. Reuses the existing
    changelog + profile diff so the definition stays grounded, not reinvented
    (watched_change / settings). Empty when the settings module or its data is
    unavailable.
    """
    if not snapshots:
        return []
    try:
        from .settings import changelog, diff_profiles
    except Exception:
        return []
    days: List[date] = []
    by_time = {s.captured_at: s for s in snapshots}
    for ch in changelog(snapshots):
        if ch.parameter == "active_idp":
            snap = by_time.get(ch.at)
            old = snap.settings.by_idp(ch.old_schedule) if snap else None
            new = snap.settings.by_idp(ch.new_schedule) if snap else None
            # Only a switch we can confirm changed the profile counts; an identical
            # duplicate (or one we cannot compare) is not a regime change and must not
            # cut the era short.
            if old is None or new is None or not diff_profiles(old, new):
                continue
            days.append(_as_date(ch.at))
        else:
            # A deliberate within-profile basal/dose edit is a regime change on its own
            # — the changelog only emits one when a per-segment schedule actually moved.
            days.append(_as_date(ch.at))
    return days


# --- the sweep ------------------------------------------------------------------


def build_snapshot(cgm_readings, bolus_events, pump_events, carb_log=()) -> DaySnapshot:
    cgm = [_Cgm(r.t, float(r.bg)) for r in cgm_readings if r.bg is not None]
    bolus = [_Bolus(r.t, float(getattr(r, "insulin", 0) or 0), float(r.carbs or 0))
             for r in bolus_events]
    site_times = [r.t for r in pump_events if r.event_type == "Site/Cartridge Change"]
    suspend_times = [r.t for r in pump_events if r.event_type == "User Suspended"]
    carb_times = [c.t for c in carb_log]
    return DaySnapshot(cgm, bolus, {t.date() for t in site_times},
                       {t.date() for t in suspend_times},
                       site_times=site_times, suspend_times=suspend_times,
                       carb_log_times=carb_times)


def sweep(cgm_readings, bolus_events, pump_events, *, carb_log=(),
          settings_snapshots=(), reviews: Optional[dict] = None,
          era_start: Optional[date] = None, generated_at: Optional[datetime] = None) -> dict:
    """Run the full sweep and return the versioned payload.

    Every enumerated grammar cell is priced and carried in ``cells`` with one of the
    three verdicts and its gate evidence — including on an empty reporting window, where
    every cell comes back killed with an empty-arm note (never a bare ``cells: []``).

    ``era_start`` overrides the derived era boundary (the reference/identity check runs
    the whole record as one era); by default the boundary is derived from the data.
    ``reviews`` is ``store.pattern_reviews(era_start)`` — the human decisions that bind
    this era; a cleared cell stays in ``ready_for_review`` until it is approved.
    """
    snap = build_snapshot(cgm_readings, bolus_events, pump_events, carb_log)

    if era_start is None and snap.observed_days:
        era_start = era_boundary(snap.observed_days, _regime_change_days(settings_snapshots))
    era_days = [d for d in snap.observed_days if era_start is None or d >= era_start]

    # The multiplicity bar is tightened over the WHOLE closed family, fixed by the
    # grammar — not the subset that happens to be testable this window. That keeps the
    # bar from loosening as data thins (an empty-arm cell is still a hypothesis in
    # the family) and makes a wide sweep unable to fish (adr-378 §3).
    n_cells = len(GRAMMAR_CELLS)
    alpha_corrected = ALPHA / n_cells if n_cells else ALPHA

    reviews = reviews or {}
    cells = [price_cell(snap, spec, era_days, alpha_corrected) for spec in GRAMMAR_CELLS]

    tracked = [c.id for c in cells if c.verdict == "tracked"]
    ready = [c for c in cells if c.verdict == "ready"]
    # The runtime never self-publishes: a cleared cell only ships once a human
    # approves it. Dismissed cells drop out of the queue; undecided ones wait.
    ready_queue = []
    approved = []
    for c in ready:
        decision = reviews.get(c.id, {}).get("decision")
        if decision == "dismissed":
            continue
        if decision == "approved":
            approved.append(c.id)
        else:
            ready_queue.append(c.id)

    era_start_str = era_start.isoformat() if era_start else None
    return {
        "grammar_version": GRAMMAR_VERSION,
        "generated_at": (generated_at or datetime.now()).strftime("%Y-%m-%d %H:%M:%S"),
        "era_start": era_start_str,
        "cells_swept": n_cells,
        "cells_testable": sum(1 for c in cells if c.a_n and c.b_n),
        "alpha_corrected": _f(alpha_corrected, 5),
        "snapshot": {
            "observed_days": len(snap.observed_days),
            "era_days": len(era_days),
            "first_day": snap.observed_days[0].isoformat() if snap.observed_days else None,
            "last_day": snap.observed_days[-1].isoformat() if snap.observed_days else None,
            "cgm_readings": len(snap.cgm),
        },
        "cells": [c.to_dict() for c in cells],
        "tracked": tracked,
        "ready_for_review": ready_queue,
        "approved": approved,
        # The only always-on user-facing string. No names, numbers, or advice — a
        # tracked candidate stays nameless until a human clears it (adr-365-swept §4).
        "footnote": FOOTNOTE,
    }


def sweep_from_store(store, *, generated_at: Optional[datetime] = None) -> dict:
    """Read the streams the sweep needs from a store and run it.

    Human sign-off decisions are keyed by era, so the boundary is derived first (from
    the same data the sweep will use), the era's decisions fetched, and both passed in
    so the ready queue reflects exactly this era's approvals.
    """
    cgm = store.cgm_readings()
    bolus = store.bolus_events()
    pump = store.pump_events()
    carb_log = store.carb_entries()
    snapshots = store.settings_snapshots()
    days = sorted({r.t.date() for r in cgm if r.bg is not None})
    boundary = era_boundary(days, _regime_change_days(snapshots)) if days else None
    reviews = store.pattern_reviews(boundary.isoformat() if boundary else None)
    return sweep(cgm, bolus, pump, carb_log=carb_log, settings_snapshots=snapshots,
                 reviews=reviews, era_start=boundary, generated_at=generated_at)
