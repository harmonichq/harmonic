# #434 basal excluded-night reasons — design

## ADR 434 — Each excluded basal night carries one reason, chosen by fixed precedence

### Context

`analyze_basal` counts a slot's excluded nights as its source nights (nights with
basal delivery in the slot) minus the nights in the final estimate
(`ciq_autotune/analyzers/basal.py`, `excluded_night_count`). That population
already includes nights cut by the slot's setting epoch and pre-cut nights a
Regime-B pooling decision declined. The clean-window filter
(`ciq_autotune/model.py` `clean_samples`) rejects a minute for any of seven rules
and records none of them. A night is excluded only when none of its minutes in
the slot was clean, so different minutes of one night can fail for different
reasons. The night-evidence projection (`ciq_autotune/basal_night_evidence.py`)
may only copy analyzer facts; it may not classify windows.

### Decision

Connor Griffin, 2026-09-23 (release decision D7): "each excluded night is counted
once, by the issue's proposed precedence (before the current setting, then below
range or suspended, above range, insulin acting, carb log, other)."

For each slot the analyzer stamps `excluded_night_reasons`, a closed object with
exactly these six integer keys, always all present, whose values sum to
`excluded_night_count`:

| Rank | Key | An excluded night lands here when |
|---|---|---|
| 1 | `before_current_setting` | it has a source minute before the slot's setting-epoch cut, and the slot's estimate did not pool its pre-cut nights back in |
| 2 | `below_range_or_suspended` | any of its minutes in the slot is covered by a delivery segment at zero rate or as a manual or algorithm suspension, or reads glucose below the in-range window |
| 3 | `above_range` | any of its minutes reads glucose above the in-range window |
| 4 | `insulin_acting` | any of its minutes has bolus-only IOB, at the Gate DIA, above the bolus-clear threshold |
| 5 | `carb_log` | any of its minutes is covered by a Carb log exclusion span |
| 6 | `other` | any of its minutes has no delivery segment covering it, an excluded pump event within its margin, no glucose reading within the staleness limit, or an untrustworthy or non-flat slope; and any excluded night none of whose minutes is attributed |

A night takes the lowest rank that applies. "Its minutes in the slot" are the
filter's own minutes: the whole minutes of that slot on that night inside the
span the filter walks. "Reads glucose" is the filter's reading, the nearest one
within the staleness limit.

The rule predicates have one implementation in `ciq_autotune/model.py`, shared by
`clean_samples` and the reason pass. `clean_samples` keeps its signature and its
output for every caller. The reason pass runs after the estimate's nights are
known and evaluates only excluded nights' minutes, so the filter's full-window
walk costs what it costs today.

`evidence/reason-precedence-spike.py` states this rule as executed code against
today's filter internals and checks it on synthetic nights: six causes land
3/1/1/1/1/1 and sum to the served count of 8; a single low minute moves an
otherwise high night into rank 2; pooling empties rank 1. Run over every slot of
the synthetic QA showcase, the spike's buckets summed to `excluded_night_count`
on all 48 slots. The implementation must own the rule itself and must not import
the spike.

### Why this order

The below-range-or-suspended count is the one that argues against a finding, so a
night that touched a low or a suspension anywhere in the slot is reported as that,
never under a milder reason. The setting cut ranks first because a pre-cut night
in an unpooled slot never reached the filter's verdict for today's rate at all,
whatever its glucose did. A missing glucose reading and an uncovered minute are
not "suspended": neither says basal stopped, so both go to `other` rather than
inflating rank 2.

### Consequences

The breakdown is new evidence beside the count, never a new verdict. No staging
predicate, floor, cap, pooling decision, estimate or Harm outcome reads it. The
durable Diagnose artifact marker hashes every package Python source
(`ciq_autotune/derived_artifacts.py`), so a night-evidence artifact written
before this change is never served after it; the projection still fails closed on
a payload without the field.

## ADR 434 — The desk names excluded-night reasons in fixed reader words

### Decision

The desk reads the served breakdown and prints each nonzero reason, in rank
order, with these words:

| Served key | Reader words |
|---|---|
| `before_current_setting` | before the current rate |
| `below_range_or_suspended` | low or suspended |
| `above_range` | high |
| `insulin_acting` | insulin on board |
| `carb_log` | logged carbs |
| `other` | other reasons |

The words reuse the desk's existing terms: basal's user noun is "rate", the
glossary names IOB "insulin on board" (`CONTEXT.md` avoids "active insulin"), and
the Carb log's shipped copy says "logged carbs". None carries a prose em dash,
engine jargon, "clean" or "slot" (`DESIGN.md`, voice and user-copy register).

One exported table in `frontend/diagnose-evidence-charts.js` maps keys to words
and orders them; the basal evidence tile and the basal slot panel both read it.
The desk derives, sums and reclassifies nothing: the total is the served
`excluded_night_count`, and each count is the served bucket.

- **Full-size rail:** the total keeps its own row, labelled "excluded", and each
  nonzero reason follows as its own row. No rail text overlaps another or crosses
  the footer rule; the layout under the total is the implementer's to set.
- **Middle rank:** the tally line ends `· N excluded`, followed by
  ` (L low or suspended)` when that count is nonzero. Room is short there, and the
  low-or-suspended count is the one that must survive. The other reasons stay on
  the full rail and the panel.
- **Accessible description:** `N nights excluded`, followed by `: ` and each
  nonzero reason as `count words`, comma-separated.
- **Basal slot panel:** its one excluded-night line reads
  `N excluded nights: ` followed by each nonzero reason as `count words`,
  comma-separated, and still prints only when the total is nonzero. The
  singular is `1 excluded night`.
- The miniature prints no tally and is unchanged.

### Sanction

Connor Griffin, 2026-09-23, answered "Q1 A, Q2 A, defaults all fine, go" to the
question "Can your reply here count as sign-off for the UI copy and tone changes?
… Yes. I record your answer as the approval for every change these 13 checklists
call for, and write the wording in CONTEXT.md terms." #434's checklist calls for
these words, so that answer is the dated sanction for this revision and its
behavior-ledger addition.

### Consequences

This is a shipped-surface revision (`/ui-craft revise`). The frozen desk behavior
ledger (`mockups/harmonic-v2-desktop.behavior.md`) has no story asserting
exclusion wording, so no story is amended or retired. The new served behavior
lands as one new story, S154 (this ticket's story block is S154–S156), with its
replay function, run on the synthetic showcase.

## Risk contract

- **Must prevent:** any change to which minutes are clean, to a slot's estimate,
  interval, night roster, `excluded_night_count`, `directional_support_count`,
  pooling decision, status, `asserts_move`, cap, or Harm outcome; an excluded night
  counted twice or not at all (buckets not summing to the count); a night with a
  low or suspended minute reported under a milder reason; a reason derived or
  re-summed in the projection or the desk; real health data in a fixture, test,
  log or comment.
- **Must recover:** none automatically.
- **Accepted failure:** a night-evidence payload without the breakdown is refused
  by the projection ("basal night evidence is incomplete"), and the desk shows its
  existing "Night evidence unavailable." state; a refresh after a rebuild recovers.
- **Unsupported:** per-night reason lists; a finer split of `other`; exclusion
  reasons for correction factor or carb ratio; the chart miniature.
- **Evidence owed:** analyzer-output tests over synthetic nights (six causes, a low
  minute outranking a high night, pooling), with no hand-set counts; a projection
  copy test and a fail-closed test; unchanged backend results elsewhere (the QA case
  suite passes without edits, and each regenerated artifact equals its base once the
  new field is set aside); frontend node tests for the rail rows and their spacing,
  the middle-rank tally, the description and the panel line; S154 replayed at both
  desktop sizes.
- **Why:** the output is advisory dosing evidence beside the safety invariants, so a
  plausible but wrong explanation, or a moved verdict, can misadvise a dose.
- **Disposition:** inline, admitted into this change and its execution lock.
