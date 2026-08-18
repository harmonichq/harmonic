"""Render an :class:`~ciq_autotune.result.AnalysisResult` as terminal text.

The CLI is a thin renderer over the result object (ROADMAP §5): everything here is
formatting, no analysis. The HTTP API serves the same result as JSON, and a
future frontend consumes it — so this module and the API are peers, not a
pipeline. Every number is shown with its CI and n; nothing is hidden.
"""

from __future__ import annotations

from typing import List, Optional

from .result import AnalysisResult, ConsolidatedProfile, SegmentEstimate, SlotEstimate
from .uncertainty import Estimate

_W = 78


def _consolidated(result: AnalysisResult) -> ConsolidatedProfile:
    """The ≤16-segment deliverable profile (#87), taken from the result when a
    producer populated it, else derived on the fly from the raw 48-slot basal.

    Deriving here keeps this a pure renderer that never needs the producer
    (``analyze()``) to change: the raw slots already carry everything the
    consolidation needs."""
    if result.consolidated_basal is not None:
        return result.consolidated_basal
    from .analyzers.basal import consolidate_profile
    # Derive-on-read fallback: the result carries the ISF/I:C recommendations but
    # not the programmed schedules (those live in the snapshots, not the result), so
    # carry-forward of *unchanged* params is unavailable here — the primary path
    # (analyze.py) fills those. This covers older stored JSON.
    #
    # Carb ratio is therefore **carry-forward-only here, which means absent** (#518,
    # D5): writing the headline block's recommendation with no programmed schedule
    # behind it leaves the move with no restoring boundary, so it would render as
    # running to midnight. See the identical note in report.py.
    return consolidate_profile(result.basal, isf=result.isf)


def _consolidated_section(prof: ConsolidatedProfile) -> List[str]:
    out = [
        f"CONSOLIDATED PROFILE — pump-programmable schedule "
        f"({len(prof.segments)}/{prof.max_segments} segments)",
        f"{'Start':<8}{'Basal':>7}{'ISF':>6}{'I:C':>6}{'Target':>8}{'MaxDev':>9}",
    ]
    for seg in prof.segments:
        out.append(
            f"{seg.label:<8}{_num(seg.basal_rate):>7}{_num(seg.isf, 0):>6}"
            f"{_num(seg.carb_ratio, 1):>6}{_num(seg.target_bg, 0):>8}"
            f"{_num(seg.basal_max_deviation):>9}")
    out.append(f"Total daily basal ~ {_num(prof.total_daily_basal)} U")
    if prof.note:
        out.append(f"⚠ {prof.note}")
    return out


def _num(x: Optional[float], nd: int = 2) -> str:
    return f"{x:.{nd}f}" if x is not None else "—"


def _ci(e: Estimate, nd: int = 2) -> str:
    if e.lo is None or e.hi is None:
        return "—"
    flag = "  ~wide" if e.wide else ""
    return f"{_num(e.lo, nd)}–{_num(e.hi, nd)}{flag}"


def _rule(char: str = "-") -> str:
    return char * _W


def _basal_section(rows: List[SlotEstimate]) -> List[str]:
    out = ["BASAL — suggested maintenance rate (U/h)",
           f"{'Time':<6}{'Current':>8}{'Est':>7}{'80% CI':>18}{'n':>4}  {'1-step':>7}  Note"]
    # Every slot gets a row, empties included — the no-blanking principle.
    for s in rows:
        out.append(
            f"{s.label:<6}{_num(s.current):>8}{_num(s.estimate.value):>7}"
            f"{_ci(s.estimate):>18}{s.estimate.n:>4}  {_num(s.recommended):>7}  {s.annotation}")
    return out


def _segment_section(title: str, unit: str, rows: List[SegmentEstimate], nd: int) -> List[str]:
    out = [f"{title} — measured vs programmed ({unit})",
           f"{'Seg':<6}{'Prog':>7}{'Meas':>7}{'80% CI':>18}{'n':>4}  {'Rec':>6}  Note"]
    for s in rows:
        out.append(
            f"{s.label:<6}{_num(s.current, nd):>7}{_num(s.estimate.value, nd):>7}"
            f"{_ci(s.estimate, nd):>18}{s.estimate.n:>4}  {_num(s.recommended, nd):>6}  {s.annotation}")
    return out


def render_basal(result: AnalysisResult) -> str:
    """Just the basal section — the focused `ciq-autotune basal` view, over the
    same non-gating result (every slot shown with its CI, nothing blanked)."""
    r = result
    lines = [
        f"Control-IQ basal suggestion · window {r.window_days}d · "
        f"span {r.span.start} → {r.span.end}",
        "⚠ " + r.disclaimer,
        "",
    ]
    lines += _basal_section(r.basal)
    lines.append("")
    lines += _consolidated_section(_consolidated(r))
    basal_notes = [n for n in r.data_quality.notes if n.lower().startswith("some basal")]
    if basal_notes:
        lines.append("")
        lines += [f"• {n}" for n in basal_notes]
    return "\n".join(lines)


def render_text(result: AnalysisResult) -> str:
    r = result
    lines: List[str] = []
    lines.append(_rule("="))
    lines.append(f"Control-IQ Autotune — analysis (schema v{r.schema_version})")
    lines.append(f"window {r.window_days}d · span {r.span.start} → {r.span.end}")
    lines.append(_rule("="))
    lines.append("")
    lines.append("⚠ " + r.disclaimer)
    lines.append("")

    # Setting changes.
    lines.append("SETTING CHANGES (basal measurement cuts; ISF/I:C caveats)")
    for e in r.epochs:
        bits = [f"~{e.effective_days:.1f}d"]
        if e.start:
            bits.append(f"changed {e.start}")
        if e.unverified_before:
            bits.append(f"unverified before {e.unverified_before}")
        lines.append(f"  {e.parameter:<12} {' · '.join(bits)}")
    lines.append("")

    lines += _basal_section(r.basal)
    lines.append("")
    lines += _consolidated_section(_consolidated(r))
    lines.append("")
    lines += _segment_section("ISF", "mg/dL per unit", r.isf, nd=1)
    lines.append("")
    lines += _segment_section("I:C", "grams per unit", r.ic, nd=1)
    lines.append("")

    lines.append("BEHAVIORAL")
    if r.behavioral:
        for f in r.behavioral:
            lines.append(f"  [{f.severity}] {f.detector}: {f.summary}")
    else:
        lines.append("  (no behavioral flags)")
    lines.append("")

    if r.data_quality.notes:
        lines.append("DATA QUALITY")
        for n in r.data_quality.notes:
            lines.append(f"  • {n}")
        lines.append("")
    lines.append(_rule())
    lines.append("Every estimate is advisory and shown with its uncertainty. "
                 "Discuss changes with your endocrinologist.")
    return "\n".join(lines)
