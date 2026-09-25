# The findings rail follows the one urgency ranking — triage and review ledger

Ticket: #469. Change: `openspec/changes/qa-round-2` (ADR 469; tasks 64–72;
behavioral-layer requirement 2, surfaces requirements 11 and 12). Triage ran
unattended (AFK run, 2026-09-25).

## Reproduction

`node docs/scope/469-queue-rank.repro.mjs`, at this change's base (9c41e67e),
reads the committed fixture's served windows through the rail's own
`queueRows`:

```text
windows.global
    1  ic:720                            priority 66    tier next_in_line   urgent
    2  pattern:highs_after_meals         priority 66    tier worth_a_look   caption "Worth a look"  route setting_staging  [1 of 3 meals ran high]
    3  pattern:lows_after_meals          priority 66    tier worth_a_look   route setting_staging  [0 of 3 meals ran low]
    4  basal:30-90                       priority 39    tier next_in_line   caption "Next in line"  urgent
    5  basal:330-360                     priority 39    tier next_in_line   urgent
    6  pattern:overnight_lows_no_iob     priority 39    tier worth_a_look   caption "Worth a look"  route setting_staging  [0 of 0 nights ran low overnight]
    7  finding:over_treated_low          priority 28    tier worth_a_look   [1 of 5 lows rebounded high]
    -  pattern:lows_after_correcting_highs  priority —     tier noted          seam "Not recurring often enough to rank yet."  route none
  tier words painted: 4 (rank 1 "next_in_line", captions ["Worth a look","Next in line","Worth a look"])
windows.afternoon
    1  ic:720                            priority 66    tier next_in_line   urgent
    2  pattern:highs_after_meals         priority 66    tier worth_a_look   caption "Worth a look"  route setting_staging  [0 of 1 meals ran high]
    3  finding:over_treated_low          priority 28    tier worth_a_look   [1 of 2 lows rebounded high]
    -  finding:correction_stacking       priority —     tier noted          seam "Not recurring often enough to rank yet."  [1 of 1 correction clusters went low]
direction_only_windows.global
    ...
    7  finding:over_treated_low          priority 28    tier worth_a_look   [1 of 5 lows rebounded high]
    -  isf                               priority —     tier noted          seam "Not recurring often enough to rank yet."  asserts_move false direction weaken
    -  pattern:lows_after_correcting_highs  priority —     tier noted          route none
browser_windows.0-360
    1  finding:over_treated_low          priority 28    tier worth_a_look   urgent  [7 of 8 lows rebounded high]
    2  pattern:highs_after_meals         priority 21    tier worth_a_look   urgent  route habit_threshold  [0 of 4 meals ran high]
    3  pattern:lows_after_correcting_highs  priority 20    tier worth_a_look   urgent  route habit_threshold  [0 of 8 lows followed a correction]
```

(Lines for `drawn` and `low_block` trimmed; they repeat `afternoon`'s shape.)
The four breaks Connor named, as they reproduce:

1. A Pattern admitted through its setting takes a ranked position at that
   setting's Priority while reading 0 of 3 meals or 0 of 0 nights (global ranks
   3 and 6). The committed showcase store shows the same at 24 h: the overnight
   Pattern, "0 of 30 nights", ranks second on the 03:00–04:00 basal row's
   Priority.
2. A scoped window ranks on 30-day Priority while printing window counts, and
   nothing on screen says so (afternoon rank 2; browser 0–360 ranks 2 and 3).
3. The tier words repeat (global paints four) and nothing explains them.
4. The direction-only correction-factor weaken sits under "Not recurring often
   enough to rank yet"; it is unranked because it has no new number to stage.

## Spike

`uv run python docs/scope/469-queue-rank.spike.py` applies ADR 469's server
rules after #467's (see its docstring). On the fixture's global window:

```text
  ic:720                                priority 66  tier next_in_line
  pattern:highs_after_meals             priority 66  tier next_in_line  anchored_by ic:720  note 'Ranked with its setting'  [1 of 3 meals ran high]
  finding:carb_undercount               priority 21  tier worth_a_look  claimed_by pattern:highs_after_meals  [...]
  pattern:lows_after_meals              priority 66  tier next_in_line  anchored_by ic:720  note 'Ranked with its setting'  [0 of 3 meals ran low]
  basal:30-90                           priority 39  tier next_in_line
  pattern:overnight_lows_no_iob         priority 39  tier next_in_line  anchored_by basal:30-90  note 'Ranked with its setting'  [0 of 0 nights ran low overnight]
  basal:330-360                         priority 39  tier next_in_line
  finding:over_treated_low              priority 28  tier worth_a_look  [1 of 5 lows rebounded high]
  pattern:lows_after_correcting_highs   priority None  tier noted
```

and on `afternoon`, `finding:over_treated_low` carries "Ranked on all 30 days";
on `direction_only_windows.global` the unpriced correction-factor row sorts before
the first unpriced finding. Run through today's unchanged `queueRows` caption
code, every fixture window paints each tier word at most once, with no stripe
after an unstriped ranked row:

```text
global                 tier words ["next_in_line","worth_a_look"] repeats false stripe-gap false
afternoon              tier words ["next_in_line","worth_a_look"] repeats false stripe-gap false
direction_only_global  tier words ["next_in_line","worth_a_look"] repeats false stripe-gap false
```

`... spike.py --qa` runs every QA case under both tickets' rules: `QA expectations
that move: 0`.

## Grounding notes

- The four breaks are presentation of one server order. Priority, its inputs,
  the Pattern producer's price (ADR 391, pinned by `tests/test_pattern_policy.py`)
  and every staging predicate stay; the fix is in the projection's placement,
  tier stamp and served words, and in the rail's painting of them.
- Server tiers become bands of the one ranking, so the rail's existing caption
  rule ("a caption where the tier changes") can no longer repeat, and its
  existing stripe rule ("rows of the first priced tier") marks one leading run.
  S115 reads the served tier and the stripe dynamically and holds unchanged.
- The rail already words the direction-only weaken's staging refusal in the ISF
  panel's foot note ("No new number is available, so there is nothing to
  stage."), chosen from the served staging verdict beside `isfVerdict`. The
  queue reuses that one choice rather than serving a second copy.
- Rail-reading replay stories: R4, R10, R15, S113, S115, S116, S126, S136, S138,
  S147, S154, S178, S183, S190 and S191 (every story in `frontend/c4.replay.mjs`
  reading `#level .q*`, a tier, the stripe, the tail note, `rendered_rows` or a
  Window preset). The desk suite's queue tests read the browser fixture windows.
- `frontend/glossary.js` is extracted by the design exploration's generator, so
  a Glossary edit owes that generator's regeneration and `--check`.
- Would have checked live: nothing; this ticket depends on no deployed state.

## Decisions

- Settled (Connor, 2026-09-24): the queue is one ranking by urgency; fix only
  the four places the rail breaks it.
- Decided autonomously during the AFK run (ADR 469): a setting-admitted Pattern
  sits beneath its setting in that setting's position (the issue's 2(b) fold);
  tiers are bands of the ranking; a scoped window states the 30-day rank on the
  rows that print window counts (3(a)); the direction-only weaken prints its
  staging refusal and stands before the tail note; the Glossary explains the
  tier words and the tail sentence, with no new caption control.
- Surface lifecycle `revise`; the behavior sweep is deferred to start (Chromium
  cannot launch in the triage sandbox).
- Flat order, as for #467; the nearby reviewer-memory anchors disagree.
- Review depth Full: the change reorders the queue that leads to staging an
  advisory dose change and changes which rows it presents as ranked.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
| 1 | — | Initial flat draft pinned dd531198 | Blockers (`authoring`): regenerating the design exploration moves the queue-row captures (measured under the spike: `setting.json`, `focus.json`, `journey.json`, `workstation.json`; `evidence.json` listed too), outside Expected diff; the eating-sequence payload moves (measured 979,302 bytes) outside Expected diff and Verification; task 65's direction-only order bullet already holds on the base (confirmed by the reproduction). Notes (`authoring`): a filtered-out setting left its anchored Pattern printing "Next in line"; the issue's caption-opens-Glossary item had no Boundaries line; `$scratch`/`$PW` undefined; flat shape. Refuted: none. Fixed: the five captures and the payload join Expected diff, the payload's `--check` and size limit join Verification and Expectation; task 65's bullet uses a no-roster projection where two one-episode causes sort ahead of the correction-factor row today (confirmed) and behind it after; ADR 469 decision 6 (a filtered-out setting's Pattern takes a numeral but no tier word, caption or stripe) with tasks 68–69 and surfaces 11 following; a Boundaries line puts the caption control out of scope; `scratch` and `PW` are defined per lock. | BLOCKED (3 blocks, 4 notes); fixed, no further panel by operator instruction |
