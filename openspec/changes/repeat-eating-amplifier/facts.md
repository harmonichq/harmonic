# Generated facts — #276 plan inputs

These are command transcripts from the checked-out tree at drafting time. They are
evidence for the lock's closed expected diff, not a second source of behavior.

## Current repeat-eating skeleton

Command:

```sh
python3 -c 'import json; r=json.load(open("frontend/__fixtures__/eating-sequence-report.json")); x=r["repeat_eating_amplifier"]; print(x["status"], x["finding"], len(x["matrix"]), len(x["comparisons"]))'
```

Output:

```text
insufficient None 15 15
```

## Frozen public rows

Command:

```sh
sed -n '110,125p' ciq_autotune/analyzers/eating_sequences.py
```

Output:

```text
@dataclass(frozen=True)
class MatrixRow:
    """All three interval aggregates for one quintile and window-count band."""

    carb_quintile: int
    window_count_band: str
    in_sequence: IntervalAggregate
    post_4h: IntervalAggregate
    post_6h: IntervalAggregate

    def to_dict(self) -> dict:
        return {
            "carb_quintile": self.carb_quintile,
            "window_count_band": self.window_count_band,
            **_period_dict(self),
        }
```

Command:

```sh
sed -n '153,180p' ciq_autotune/analyzers/eating_sequences.py
```

Output:

```text
@dataclass(frozen=True)
class RepeatComparisonRow:
    """A 3+-minus-1 window-count comparison for one quintile and interval."""

    carb_quintile: int
    period: str
    status: str
    reference_n: int
    repeat_n: int
    tir_difference_pct_points: Optional[float]
    mean_difference_mgdl: Optional[float]
    sd_difference_mgdl: Optional[float]
    reference_band: str = "1"
    repeat_band: str = "3+"

    def to_dict(self) -> dict:
        return {
            "carb_quintile": self.carb_quintile,
            "period": self.period,
            "reference_band": self.reference_band,
            "repeat_band": self.repeat_band,
            "status": self.status,
            "reference_n": self.reference_n,
            "repeat_n": self.repeat_n,
            "tir_difference_pct_points": self.tir_difference_pct_points,
            "mean_difference_mgdl": self.mean_difference_mgdl,
            "sd_difference_mgdl": self.sd_difference_mgdl,
        }
```

Command:

```sh
sed -n '228,241p' ciq_autotune/analyzers/eating_sequences.py
```

Output:

```text
@dataclass(frozen=True)
class RepeatEatingFinding:
    """The optional aggregate-only summary for repeated eating evidence."""

    summary: str
    carb_quintile: int
    period: str

    def to_dict(self) -> dict:
        return {
            "summary": self.summary,
            "carb_quintile": self.carb_quintile,
            "period": self.period,
        }
```

## Existing two-tier finding precedent

Command:

```sh
sed -n '544,577p' ciq_autotune/analyzers/eating_sequences.py
```

Output:

```text
def _finding(compared: Sequence[_ComparedCohorts]) -> Optional[HighCarbFinding]:
    """Select the adverse cohort sentence from the authoritative comparison aggregates."""
    pooled = {item.row.period: item.row for item in compared if item.row.scope == "pooled"}
    candidates = [item for item in compared if item.row.status == "supported" and (
        item.row.scope == "pooled" or pooled[item.row.period].status == "supported")]
    tir = [item for item in candidates if item.row.tir_difference_pct_points < 0]
    sd = [item for item in candidates if item.row.sd_difference_mgdl > 0]
    if tir:
        chosen = min(tir, key=lambda item: (item.row.tir_difference_pct_points,
                                            _PERIODS.index(item.row.period),
                                            item.row.scope != "pooled"))
        metric = "tir"
    elif sd:
        chosen = max(sd, key=lambda item: (item.row.sd_difference_mgdl,
                                           -_PERIODS.index(item.row.period),
                                           item.row.scope == "pooled"))
        metric = "sd"
    else:
        return None
    row, reference, high = chosen.row, chosen.reference, chosen.high
    period_label = {
        "in_sequence": "in-sequence interval",
        "post_4h": "four-hour post-sequence interval",
        "post_6h": "six-hour post-sequence interval",
    }[row.period]
    if metric == "tir":
        summary = (f"In {row.scope} sequences, the highest-carb fifth spent {high.tir_pct}% of the "
                   f"{period_label} in range against {reference.tir_pct}% for the rest "
                   f"(n = {row.high_n} vs {row.reference_n})")
    else:
        summary = (f"In {row.scope} sequences, the highest-carb fifth's {period_label} glucose spread "
                   f"was {high.sd_mgdl} mg/dL against {reference.sd_mgdl} mg/dL for the rest "
                   f"(n = {row.high_n} vs {row.reference_n})")
    return HighCarbFinding(summary, row.scope, row.period)
```

## Window-count construction

Command:

```sh
sed -n '435,453p' ciq_autotune/analyzers/eating_sequences.py
```

Output:

```text
def build_sequences(
    boluses: Sequence[BolusEvent], *, config: EatingSequenceConfig,
) -> tuple[EatingSequence, ...]:
    """Construct eating sequences for this report and the repeat-eating amplifier (#276)."""
    meals = sorted((event for event in boluses if event.carbs is not None and event.carbs > 0),
                   key=lambda event: event.t)
    windows = []
    for event in meals:
        if not windows or event.t - windows[-1][1] > timedelta(minutes=config.window_merge_minutes):
            windows.append([event.t, event.t, event.carbs])
        else:
            windows[-1][1], windows[-1][2] = event.t, windows[-1][2] + event.carbs
    built = []
    for first, last, carbs in windows:
        if not built or first - built[-1][1] > timedelta(hours=config.sequence_gap_hours):
            built.append([first, last, carbs, 1])
        else:
            built[-1][1], built[-1][2], built[-1][3] = last, built[-1][2] + carbs, built[-1][3] + 1
    return tuple(EatingSequence(*item) for item in built)
```

## Synthetic builder and fixture generator

Command:

```sh
sed -n '8p' tests/eating_sequence_streams.py
```

Output:

```text
def high_carb_stream(*, start=datetime(2040, 1, 1, 12), count=40, sd_only=False):
```

Command:

```sh
sed -n '20,33p' scripts/gen_eating_sequence_fixtures.py
```

Output:

```text
def payload() -> dict:
    """Build a populated report from the shared manufactured stream."""
    boluses, cgm, carb_log, _ = high_carb_stream()
    end = cgm[-1].t
    report = build_report(
        boluses, cgm, carb_log,
        window_start=end - timedelta(days=30), window_end=end,
        config=EatingSequenceConfig(),
    )
    return {
        "_generated_by": "scripts/gen_eating_sequence_fixtures.py",
        "_note": "SYNTHETIC. Fixed invented eating sequences; no personal data.",
        **report_dict(report),
    }
```

## Existing drift-check register

Command:

```sh
grep -n 'gen_eating_sequence_fixtures.py' AGENTS.md
```

Output:

```text
73:uv run python scripts/gen_eating_sequence_fixtures.py --check
```

## Expected-diff paths

Command:

```sh
for p in openspec/changes/repeat-eating-amplifier ciq_autotune/analyzers/eating_sequences.py tests/eating_sequence_streams.py tests/test_eating_sequences.py tests/test_eating_sequence_fixture.py scripts/gen_eating_sequence_fixtures.py frontend/__fixtures__/eating-sequence-report.json; do test -e "$p" && echo "present $p" || echo "absent $p"; done
```

Output:

```text
present openspec/changes/repeat-eating-amplifier
present ciq_autotune/analyzers/eating_sequences.py
present tests/eating_sequence_streams.py
present tests/test_eating_sequences.py
present tests/test_eating_sequence_fixture.py
present scripts/gen_eating_sequence_fixtures.py
present frontend/__fixtures__/eating-sequence-report.json
```
