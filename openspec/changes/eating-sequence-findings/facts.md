# Generated facts

Captured from this ticket checkout. Output blocks are complete command output.

## Source entry points

```sh
rg --threads 1 -n '^def (build_report|build_sequences|build_eating_sequence_report|assemble|build_scenarios|tally_attributions|attribute|_score_pattern|_anchor_state|_occurrence_verdict|priority_score|behavioral_priority)|^class (Exposure|Lever)' ciq_autotune/analyzers/eating_sequences.py ciq_autotune/analyzers/scenario/{engine,attribute,model_view,priority,levers}.py ciq_autotune/findings_projection.py
```

```text
ciq_autotune/analyzers/eating_sequences.py:401:def build_report(
ciq_autotune/analyzers/eating_sequences.py:449:def build_eating_sequence_report(store, *, window_days: int = 30,
ciq_autotune/analyzers/eating_sequences.py:469:def build_sequences(
ciq_autotune/analyzers/scenario/engine.py:128:def tally_attributions(
ciq_autotune/analyzers/scenario/engine.py:466:def _score_pattern(
ciq_autotune/analyzers/scenario/engine.py:500:def assemble(
ciq_autotune/analyzers/scenario/engine.py:749:def build_scenarios(
ciq_autotune/analyzers/scenario/attribute.py:614:def attribute(
ciq_autotune/analyzers/scenario/model_view.py:311:def _anchor_state(is_driver: bool, verdicts: Sequence[AnchorVerdict]) -> str:
ciq_autotune/analyzers/scenario/model_view.py:418:def assemble_model_view(
ciq_autotune/analyzers/scenario/priority.py:43:def priority_score(impact: float, recurrence: float) -> int:
ciq_autotune/analyzers/scenario/priority.py:76:def behavioral_priority(confidence) -> Priority:
ciq_autotune/analyzers/scenario/levers.py:33:class Exposure(str, Enum):
ciq_autotune/analyzers/scenario/levers.py:42:class Lever(str, Enum):
ciq_autotune/findings_projection.py:567:def _occurrence_verdict(occurrence: dict, lever: str) -> str:
```

## Sequence definitions

```sh
cat ciq_autotune/analyzers/eating_sequence_config.py
```

```text
"""Eating-sequence detector rules (#274).

This configuration is deliberately separate from ``ModelConfig`` and ``safety``.
It owns the code-owned definitions and evidence floor for the eating-sequence
detectors that consume the aggregate report contract.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class EatingSequenceConfig:
    """Detector rules for eating-sequence aggregate evidence (#274)."""

    #: Carb-bearing boluses this many minutes apart remain one eating window.
    window_merge_minutes: float = 30.0
    #: Eating windows this many hours apart remain one eating sequence.
    sequence_gap_hours: float = 3.0
    #: The in-sequence interval extends this far beyond the final window.
    in_sequence_tail_minutes: float = 5.0
    #: The only post-sequence horizons reported by the contract.
    post_horizons_hours: tuple[int, int] = (4, 6)
    #: Inclusive lower bound of the time-in-range convention.
    tir_low_mgdl: int = 70
    #: Inclusive upper bound of the time-in-range convention.
    tir_high_mgdl: int = 180
    #: Required occupied five-minute-slot fraction for an interval.
    cgm_coverage_floor: float = 0.7
    #: Smallest qualifying cohort that may support an aggregate.
    minimum_bucket_n: int = 8
    #: Balanced empirical cohorts in the source-window population.
    quintile_count: int = 5
    #: First local pump-wall hour included in the evening scope.
    evening_start_hour: int = 18
    #: Exclusive local pump-wall hour ending the evening scope.
    evening_end_hour: int = 24
    #: Descriptive counts of eating windows inside one sequence.
    window_count_bands: tuple[str, str, str] = ("1", "2", "3+")
```

## Chart and harness contract

```sh
rg --threads 1 -n "kind: '(basal|isf|carb-ratio|event-comparison)'|id: '(basal|isf|carb-ratio|event-comparison|workstation)'|eating-sequences" frontend/diagnose-evidence-charts.js harness/stories.js harness/dev-server.js
```

```text
frontend/diagnose-evidence-charts.js:862:    kind: 'basal',
frontend/diagnose-evidence-charts.js:886:    kind: 'isf',
frontend/diagnose-evidence-charts.js:903:    kind: 'carb-ratio',
frontend/diagnose-evidence-charts.js:924:    kind: 'event-comparison',
harness/stories.js:6:  { id: 'basal', label: 'Basal evidence', modes: ['editorial'], sizes: true, range: false },
harness/stories.js:7:  { id: 'isf', label: 'Correction factor evidence', modes: ['event', 'clock'], sizes: true, range: false },
harness/stories.js:8:  { id: 'carb-ratio', label: 'Carb ratio evidence', modes: ['event', 'clock'], sizes: true, range: true },
harness/stories.js:9:  { id: 'event-comparison', label: 'Response comparison', modes: [], sizes: true, range: true },
harness/stories.js:11:  { id: 'workstation', label: 'Diagnose workstation', modes: [], sizes: false, range: false },
```

## Safe entrypoints

```sh
sed -n '180,206p' AGENTS.md
```

```text
- **Never run normal `harmonic serve` or any `harmonic fetch` in automated
  work.** Normal startup fires a live OAuth login against the vendor (possibly
  2FA) and pulls real data; it cannot be exercised headless. There is exactly
  one permitted offline serve: the QA copy-then-serve command below for UI
  design and replay. `--no-fetch` and the empty token are mandatory. The QA
  database is generated entirely by `scripts/gen_qa_e2e_db.py`:

  ```sh
  scratch="${TMPDIR:-/tmp}/harmonic-qa-e2e.sqlite"
  rm -f "$scratch" "$scratch-wal" "$scratch-shm" "$scratch.derived.sqlite"
  cp mockups/qa-e2e.synthetic/harmonic.sqlite "$scratch"
  uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765
  ```

  
  Exercise every other model path through tests and fixtures instead.

  For chart-level UI revision rounds, the preferred safe surface is the
  component harness: `npm install && npm run dev` inside `harness/`, in
  manufactured mode (its default — served from committed synthetic fixtures,
  no app process needed). It opens one shipped chart at a time through the
  real Diagnose composition, so a chart revised there is the shipped chart.
  Live mode only forwards to a `serve` the operator already started, and is
  never used in automated work. One coupling to watch: the harness names app
  API paths as hand-written strings; `frontend/harness-api-paths.test.js`
  checks those paths, so an endpoint rename must update the harness in the
  same change.
```

## Closed document inventory

```sh
rg -l -i 'earliest.actionable|earliest.*driver|aggregate.only|eating.sequence|outranked' --glob '*.md' --glob '!openspec/changes/archive/**' --glob '!openspec/changes/eating-sequence-findings/**' --glob '!docs/scope/**' --glob '!node_modules/**' --glob '!harness/node_modules/**' . | sort
```

```text
./AGENTS.md
./CONTEXT.md
./docs/kb/reading-day.md
./mockups/INDEX.md
./mockups/finding-evidence-routing.behavior.md
./openspec/changes/announced-meal-low-ownership/design.md
./openspec/changes/diagnose-finding-case-files/design.md
./openspec/changes/finding-evidence-routing/design.md
./openspec/changes/highs-attribution-account/design.md
./openspec/changes/over-treated-low-verdict-band/design.md
./openspec/changes/over-treated-low-verdict-band/tasks.md
./openspec/changes/scoped-finding-occurrence-membership/tasks.md
./openspec/specs/behavioral-layer/spec.md
./openspec/specs/eating-sequences/spec.md
./openspec/specs/http-api/spec.md
./openspec/specs/qa-e2e-database/spec.md
./openspec/specs/surfaces/spec.md
```

## Recent history

```sh
git log a1bba57 --oneline -15
```

```text
a1bba57 docs: record ticket 342 impact study and limitations
667fbc5 docs: scope empirical impact comparison for ticket 342
d558683 docs: ground shared finding pricing for ticket 342
a4ece67 docs: require chart harness for ticket 342
734f208 docs: record eating-sequence attribution scope for #342
aeb37c6 Archive eating-sequence-evidence-plumbing (#277) (#339)
0227dbf Fetch and adapt the eating-sequence report for a Diagnose evidence section (#277) (#338)
6af7125 Archive repeat-eating-amplifier (#276) (#337)
50cf8a3 Build the repeat-eating amplifier detector (#276) (#335)
b20d585 Archive high-carb-sequence-detector (#275) (#334)
f03aba2 Archive tapered-urgency-queue (#302) (#331)
e9a69c8 Build eating-sequence primitives and the high-carb-sequence detector (#275) (#333)
15f8057 Tapered urgency queue for the Diagnose findings rail (#328)
aa2e808 Archive eating-sequence-contract (#274) (#330)
0d13039 The basal slot panel drills into its nights (#291) (#329)
```
