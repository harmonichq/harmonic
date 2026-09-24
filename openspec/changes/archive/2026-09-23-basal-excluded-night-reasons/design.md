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
otherwise high night into rank 2; pooling empties rank 1. The implementation must
own the rule itself and must not import the spike. The spike and
`evidence/showcase-reasons.py` import private filter internals that the
implementation may restructure, so both run against the base (a4d374a7) only and
are not gates after the change.

### Generated facts

Run on the base, from the repository root:

```
$ uv run python openspec/changes/basal-excluded-night-reasons/evidence/showcase-reasons.py
08:00 30 insulin_acting=30
08:30 30 insulin_acting=30
09:00 30 insulin_acting=30
09:30 30 insulin_acting=30
10:00 30 insulin_acting=30
12:00 1 insulin_acting=1
12:30 3 insulin_acting=1 other=2
13:00 1 above_range=1
13:30 1 above_range=1
14:00 1 above_range=1
14:30 2 above_range=2
15:00 2 above_range=2
15:30 2 insulin_acting=1 other=1
16:00 1 insulin_acting=1
19:00 1 insulin_acting=1
19:30 1 above_range=1
20:00 1 insulin_acting=1
20:30 1 insulin_acting=1
21:00 1 insulin_acting=1
21:30 1 below_range_or_suspended=1
22:00 1 below_range_or_suspended=1
21 of 48 slots exclude nights; every slot's reasons sum to its count
```

It analyzes the showcase's whole history, not the served 30-day window, so the
served payload stays authoritative for any count a story pins. No showcase slot
has more than two nonzero reasons.

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
| `other` | other reasons; "other reason" when its count is 1 |

The words follow the count ("3 other reasons"), so the one that holds a counted
noun agrees with it: one night reads "1 other reason". The others name a cause
rather than a thing counted and read the same at any count; "1 logged carbs" is
one night under the Carb log, not one carb.

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
  the footer rule. The whole rail below its head (the direction rows, the rule,
  the total and the reasons) is the implementer's to lay out: when reason rows are
  present, pitch and type size may follow the canvas height (`api.getHeight()`),
  and today's positions stay wherever the rows fit. Today's layout cannot hold a
  crowded rail: in a 307px canvas, today's pitch leaves room below the total for
  two reason rows, or one when the no-programmed-rate row is present (rule at 180
  or 204, total row to 212 or 236, footer rule at 279).
- **Middle rank:** the tally line ends `· N excluded`, followed by
  ` (L low or suspended)` when that count is nonzero. Room is short there, and the
  low-or-suspended count is the one that must survive. The other reasons stay on
  the full rail and the panel. A worst case such as "16 steady nights · 10 more ·
  3 less · 1 as set · 2 unpaired · 14 excluded (12 low or suspended)" (95
  characters) needs about 494px at today's 10px type by the chart's own estimate
  (0.52 of the type size per character), against 452px inside a 480px seat's
  margins. The implementer may set the line in smaller type, down to the design
  system's 9px, or give the tally a second line and move the figure down, so that
  case fits; every existing token keeps its words and order, and the
  low-or-suspended count prints.
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
The singular "1 other reason", settled in #434's fix round on 2026-09-23, is one
of those words and rests on the same answer.

### Consequences

This is a shipped-surface revision (`/ui-craft revise`). The frozen desk behavior
ledger (`mockups/harmonic-v2-desktop.behavior.md`) has no story asserting
exclusion wording, so no story is amended or retired. The new served behavior
lands as one new story, S154 (this ticket's story block is S154–S156), with its
replay function, run on the synthetic showcase, in the ledger's own dated
`## #434 amendment — 2026-09-23` section. The ledger's existing frozen blocks, its
header inventory line and `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md` are
left to the release coordinator, who writes the release's one freeze block.

The crowded rail has node-level evidence only: no showcase slot serves more than
two reasons (generated facts above), so no served desk state can show it. Its
node test runs at the full-size tile canvas height the coordinator measures on the
served desk, because the height the desk actually gives the tile, not a guessed
one, decides what fits. The coordinator also keeps before-and-after captures of
the S154 slot's tile and panel, from the base and the branch served from the same
QA copy-then-serve bytes, at both desktop sizes, for the release pull request.

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
  new field is set aside); frontend node tests for the rail rows and their spacing
  (the crowded case at the measured tile canvas height), the middle-rank tally
  (the worst case fitting a 480px seat), the description and the panel line; S154
  replayed at both desktop sizes; before-and-after captures of the S154 slot's tile
  and panel at both sizes.
- **Why:** the output is advisory dosing evidence beside the safety invariants, so a
  plausible but wrong explanation, or a moved verdict, can misadvise a dose.
- **Disposition:** inline, admitted into this change and its execution lock.
