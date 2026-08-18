"""Turn results into something you'd actually read and take to an appointment.

The markdown report is pure stdlib. The per-slot "why" plots need matplotlib,
which is an optional extra (``pip install harmonic[report]``); if it isn't
installed the report still renders, just without the figures.
"""

from __future__ import annotations

import os
from typing import List, Optional

from .backtest import BacktestResult
from .model import ModelConfig, clean_samples
from .result import AnalysisResult, ConsolidatedProfile, SegmentEstimate, SlotEstimate
from .uncertainty import Estimate


def _fmt(x: Optional[float], nd: int = 2) -> str:
    return f"{x:.{nd}f}" if x is not None else "—"


def _ci(e: Estimate, nd: int = 2) -> str:
    if e.lo is None or e.hi is None:
        return "—"
    flag = " ~wide" if e.wide else ""
    return f"{_fmt(e.lo, nd)}–{_fmt(e.hi, nd)}{flag}"


def _basal_table(rows: List[SlotEstimate]) -> List[str]:
    out = ["## Basal — suggested maintenance rate (U/h)", "",
          "| Time | Current | Est | 80% CI | n | Recommended | Note |",
          "|------|--------:|----:|--------|--:|------------:|------|"]
    # Every slot gets a row, thin ones included — the no-blanking principle
    # (ROADMAP §8): a wide CI replaces what used to be a blank/dash.
    for s in rows:
        out.append(
            f"| {s.label} | {_fmt(s.current)} | {_fmt(s.estimate.value)} | "
            f"{_ci(s.estimate)} | {s.estimate.n} | {_fmt(s.recommended)} | {s.annotation} |"
        )
    out.append("")
    return out


def _consolidated_profile(result: AnalysisResult) -> ConsolidatedProfile:
    """The ≤16-segment deliverable profile (#87), from the result if a producer
    populated it, else derived from the raw 48-slot basal so the report never
    depends on ``analyze()`` having filled the field."""
    if result.consolidated_basal is not None:
        return result.consolidated_basal
    from .analyzers.basal import consolidate_profile
    # Derive-on-read fallback: the result carries the ISF/I:C recommendations but not
    # the programmed schedules (those ride on the snapshots), so carry-forward of
    # unchanged params is unavailable here — the primary path (analyze.py) fills it.
    #
    # Carb ratio is therefore **carry-forward-only here, which means absent** (#518,
    # D5). Passing the headline block without a programmed schedule would write its
    # recommended ratio at the block's members and leave NO restoring boundary after
    # it, so a 07:00–12:00 move would render as running from 07:00 to midnight. An
    # empty I:C column is honest; an unbounded one is a dosing error.
    return consolidate_profile(result.basal, isf=result.isf)


def _consolidated_table(prof: ConsolidatedProfile) -> List[str]:
    out = [
        f"## Consolidated pump profile ({len(prof.segments)}/"
        f"{prof.max_segments} segments)",
        "",
        f"A single deliverable four-parameter schedule the pump can accept "
        f"(≤{prof.max_segments} segments), merged from the estimates above at the "
        "union of every parameter's change boundaries; unchanged values are carried "
        f"forward from the current programmed profile. Total daily basal ≈ "
        f"**{_fmt(prof.total_daily_basal)} U**.",
        "",
        "| Start | Basal (U/h) | ISF | I:C | Target | Basal slots | Basal max dev |",
        "|-------|------------:|----:|----:|-------:|------------:|--------------:|",
    ]
    for seg in prof.segments:
        out.append(
            f"| {seg.label} | {_fmt(seg.basal_rate)} | {_fmt(seg.isf, 0)} | "
            f"{_fmt(seg.carb_ratio, 1)} | {_fmt(seg.target_bg, 0)} | "
            f"{len(seg.basal_slots)} | {_fmt(seg.basal_max_deviation)} |")
    out.append("")
    if prof.note:
        out.append(f"> ⚠ {prof.note}")
        out.append("")
    return out


def _segment_table(title: str, unit: str, rows: List[SegmentEstimate], nd: int) -> List[str]:
    out = [f"## {title} — measured vs programmed ({unit})", "",
          "| Segment | Programmed | Measured | 80% CI | n | Recommended | Note |",
          "|---------|-----------:|---------:|--------|--:|------------:|------|"]
    for s in rows:
        out.append(
            f"| {s.label} | {_fmt(s.current, nd)} | {_fmt(s.estimate.value, nd)} | "
            f"{_ci(s.estimate, nd)} | {s.estimate.n} | {_fmt(s.recommended, nd)} | {s.annotation} |"
        )
    out.append("")
    return out


def markdown_report(
    result: AnalysisResult,
    backtest: Optional[BacktestResult] = None,
) -> str:
    """Render an :class:`AnalysisResult` as a markdown report.

    A fourth renderer over the same result the CLI text/JSON views use (ROADMAP
    §5) — nothing here is gated; thin estimates show a wide CI instead of being
    omitted.
    """
    r = result
    out: List[str] = []
    out.append("# Control-IQ Autotune — advisory report")
    out.append("")
    out.append(f"> **{r.disclaimer}**")
    out.append("")
    out.append(f"- Data span: `{r.span.start}` → `{r.span.end}`")
    out.append(f"- Window: {r.window_days}d · generated {r.generated_at}")
    out.append("")

    out += _basal_table(r.basal)
    out += _consolidated_table(_consolidated_profile(r))
    out += _segment_table("ISF", "mg/dL per unit", r.isf, nd=1)
    out += _segment_table("I:C", "grams per unit", r.ic, nd=1)

    out.append("## Behavioral findings")
    out.append("")
    if r.behavioral:
        for f in r.behavioral:
            out.append(f"- **[{f.severity}] {f.detector}**: {f.summary}")
    else:
        out.append("- (none)")
    out.append("")

    if r.data_quality.notes:
        out.append("## Data quality")
        out.append("")
        for n in r.data_quality.notes:
            out.append(f"- {n}")
        out.append("")

    if backtest is not None:
        out += _backtest_section(backtest)
    return "\n".join(out)


def _backtest_section(bt: BacktestResult) -> List[str]:
    out = ["## Backtest", ""]
    out.append(f"- Held out the most recent **{bt.holdout_days}** day(s); trained on "
               f"**{bt.train_days}**.")
    out.append(f"- Scored against **{bt.test_clean_minutes}** clean held-out minute(s).")
    if bt.n_matched == 0:
        out.append("- Not enough overlap between a known current rate and a suggested "
                   "rate on held-out clean minutes to compare head-to-head. Collect "
                   "more days and re-run.")
        out.append("")
        return out
    out.append(f"- On the **{bt.n_matched}** minute(s) where both a current and a "
               "suggested rate exist:")
    out.append(f"  - current profile MAE: **{_fmt(bt.mae_current_matched, 3)} U/h**")
    out.append(f"  - suggested profile MAE: **{_fmt(bt.mae_suggested_matched, 3)} U/h**")
    imp = bt.improvement
    if imp is not None:
        verdict = "better" if imp > 0 else ("worse" if imp < 0 else "no different")
        out.append(f"  - suggestion is **{verdict}** by {_fmt(abs(imp), 3)} U/h MAE.")
    out.append("")
    out.append("_Scored against what Control-IQ actually delivered, not a true "
               "counterfactual — corroboration, not proof._")
    out.append("")
    return out


# --- optional plotting ------------------------------------------------------


def plots_available() -> bool:
    try:
        import matplotlib  # noqa: F401
        return True
    except ImportError:
        return False


def write_why_plot(
    out_path: str,
    basal_events, cgm_readings, bolus_events, pump_events,
    config: ModelConfig = ModelConfig(),
) -> Optional[str]:
    """Scatter the clean delivered-basal samples by slot. Returns the path, or
    None if matplotlib isn't installed."""
    if not plots_available():
        return None
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    samples = clean_samples(basal_events, cgm_readings, bolus_events, pump_events, config)
    xs = [s.slot * config.slot_minutes / 60.0 for s in samples]
    ys = [s.rate for s in samples]

    fig, ax = plt.subplots(figsize=(11, 4))
    ax.scatter(xs, ys, s=6, alpha=0.3, label="clean delivered basal")
    ax.set_xlabel("hour of day")
    ax.set_ylabel("U/h")
    ax.set_title("Clean delivered basal by time of day")
    ax.set_xlim(0, 24)
    ax.set_xticks(range(0, 25, 3))
    ax.legend(loc="upper right")
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    fig.tight_layout()
    fig.savefig(out_path, dpi=110)
    plt.close(fig)
    return out_path
