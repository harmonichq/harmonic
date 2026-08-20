# Scope — #61 Diagnose: sifting the inspector to the excursion you are pointing at

Routed from `/ticket triage 61` to `/scope` -> interview mode (ticket carries a
grill trigger; a design exists in the user's head, untested).

Branch `codex/61-severity-filter-day-compare`, worktree `/Users/connor/worktrees/harmonic/61`.

## Grounding (measured, not assumed)

Measured read-only against a fresh snapshot of the real database pulled from the
homelab per the repo's sanctioned path (`Store.open_readonly`, snapshot at
`tconnect-data/ciq-snapshot.db`, gitignored). The 14:15 to 23:45 projection
reproduces the ticket's screenshot row for row, so the snapshot is the same data
the ticket was filed against.

- The findings projection is server owned; the frontend renders rows verbatim and
  composes nothing (ADR 730). Any filter is a projection input, never a frontend
  sieve.
- The window axis is **time of day** (clock minutes, pooled across 30 days), not a
  date range. A good-day / bad-day split is a **new day-cohort axis** with no
  existing machinery.
- **No `severity` field exists on any queue row.** Rows order by scenario
  `Pattern.priority`. The ticket's "filter by severity" has no field behind it.
- `_OUTCOME_KIND` (`ciq_autotune/analyzers/scenario/levers.py:141`) already maps all
  seven behavioral levers to consequence direction `high` / `low`, and
  `findings_projection` already imports `outcome_kind` to decide window membership.
  Publishing it on the row is nearly free.
- Every row already carries `appearances[].family` (`lows` / `highs` / `meals` /
  `correction_clusters`) with its own `n of m`.

### Measured windows (real data, 30 days)

| window | today | filtered to consequence direction |
| --- | --- | --- |
| 15:30 to 20:00 ("why the highs") | 8 rows | keeps Carb undercount 5/60 meals, Late bolus; drops Correction stacking, Meal over-delivery (consequence low); 3 held/blind suppressed |
| 00:00 to 03:00 ("why the lows") | 8 rows | keeps Meal over-delivery 1/10 meals; **drops Over-treated low 2/7 lows**, the top-priority row, because its consequence is the rebound high |

- **A family-based filter cannot answer the highs question**: no row in 15:30 to
  20:00 carries a `highs` denominator.
- **`_isf_rows()` takes no window argument**, so "ISF weaken" is byte-identical in
  every window projected and survives every filter while saying nothing about the
  window.

## Decisions

**D1. SUPERSEDED in round 2 by D9.** Originally: the filter axis is consequence
direction. Retired in favour of exposure-family filter chips. Kept here because the
measurement that motivated it still stands and still constrains the chips (see D10).

**D9. The sift is a row of four filter chips, and the four are NOT one axis.**
`highs` / `lows` are driven by the finding's **result** (`_OUTCOME_KIND`), so an
over-treated low chips as a **high** (its rebound) and a correction stack chips as a
**low** (its overshoot) even on the same day. `meals` / `corrections` are driven by the
**context** the finding is counted in (`appearances[].family`). A finding appears under
every chip that applies, and multi-chip membership is expected, not a collision (carb
undercount is highs + meals). Why: the user's own rule is "driven by the findings
result, scoped by its result time"; measured, it makes all four chips populate on real
data where a pure family reading left `highs` empty in every drawn span.
Disposition: -> ADR

**D10. Result-time scoping is already built; no work owed.** Window membership is
already outcome-anchored, so an over-treated low already sits in the span holding its
rebound rather than the span holding the low. Disposition: inline (verify with a test,
do not re-implement)

**D11. Chips ship without any engine change.** The measured "empty highs chip" was an
artifact of the family reading, not a gap; under D9 every chip populates. The
high-attribution gap (3 of 30 highs carry a lever) is real but is a ceiling on how much
the engine can explain, never a blocker on the chips. Disposition: -> issue (triage
unexplained highs; handoff written)

**D2. The good-day / bad-day cohort comparison is dropped from this ticket.**
Not deferred within the work, dropped. Why: the span pools 30 days by time of day, so a
day-cohort split is a second axis with no existing machinery, and D1 answers both
questions the ticket was filed about. Disposition: inline (revisit only if D1 lands and
proves insufficient)

**D5. A settings row lands on the side its change would fix** (more insulin under
highs, less under lows), using the verified mapping below, not a naive "raise means
high". Disposition: -> ADR (folded into D9's record)

**D6. Chips are both-on until the user picks; never pre-set from the span's shape.**
Why: guessing intent can hide the top row before it has been read, which is the failure
the ticket was filed about. Disposition: inline

**D7. The chart is untouched by the chips; only the list sifts.** Why: the chart is a
30-day pooled shape with no per-finding geometry to dim. Disposition: inline

**D8. An empty filtered list is an acceptable outcome.** It shows a soft, clearly
placeholder row ("no findings match this filter"). No pinning, no forced restore. Why:
an explicit placeholder is not a silent hide, so the must-prevent still holds.
Disposition: inline

**D3. Rows that assert no direction collapse to one expandable count while a filter is
active.** Why: they are three of eight rows in both measured spans, so they crowd out the
answer, but they are the only signal saying where the model is blind in that span.
Disposition: inline

**D4. The correction-factor row is labelled whole day rather than scoped to the span.**
Why: it reads identically in every span and survives every filter, which blunts the
sifting; genuinely scoping correction factor to a clock window is analyzer work and gets
its own ticket. Disposition: -> issue (scope ISF to a clock window)

### Verified: the excursion side of a settings row is NOT "raise means high"

Insulin direction decides it, and the three parameters disagree on which way their
number moves:

- basal `raise` adds insulin, so it answers a **high** (measured: 05:30 and 07:30 both
  `raise`). basal `lower` answers a **low**.
- I:C is grams per unit, so *raising* the ratio removes insulin and answers a **low**.
- correction factor `weaken` is owned by recurring correction-caused lows
  (`analyzers/isf.py:530`, "Lows own the direction"), so it answers a **low** even
  though its estimate moves the opposite way to basal's.

A single "raise means high" rule files the correction-factor row on the wrong side.
Whatever ships must put this mapping in one server-side place with a test.

### MEASURED: the `highs` chip is empty on real data, and that is an engine gap

Family chips over the real 30 days, per drawn span:

| span | highs | lows | meals | corrections |
| --- | --- | --- | --- | --- |
| global 24h | Over-treated low 1/30, Missed meal 2/30 | Over-treated low 8/45, Correction on IOB 2/45 | Carb undercount 16/184, Meal over-delivery 14/184, Late bolus 5/184 | Correction stacking 4/80, + 2 |
| 15:30 to 20:00 | **empty** | **empty** | Carb undercount 5/60, Meal over-delivery 2/60, Late bolus 1/60 | Correction stacking 2/28, Late bolus 1/28 |
| 00:00 to 03:00 | **empty** | Over-treated low 2/7 | Carb undercount 1/10, + 2 | empty |

Root cause, measured on the exposures feed: **only 3 of 30 highs carry any lever
attribution (10%)**, against lows 22%, meals 19%, corrections 8%. Structurally,
`MISSED_MEAL` is the only lever with a highs case file and the event-comparison lens
has no view for it (`frontend/diagnose-workstation.js:237`).

So the highs chip is honest but near-empty, and the user's evening highs answer really
lives under the meals and corrections chips. **The filter is not what blocks "why am I
high at 17:00"; high attribution is.** That gap is its own ticket.

### Risk contract

Why: Harmonic is advisory insulin-dosing guidance, and this change decides which
findings a user sees while reasoning about a dose. Disposition: -> copied verbatim into
the work order.

- **Must prevent:** a chip hiding a finding with no visible indication that anything
  was hidden; the frontend deriving chip membership itself (this repo has a recurring
  defect class where a frontend gate hid a verdict the backend asserted, and the
  standing rule is that the frontend re-derives no threshold and no direction); silent
  incorrect success.
- **Must recover:** nothing automatically. Chip state is UX-only, holds no analysis,
  and is restored by clicking the chip.
- **Accepted failure:** a chip selection matches nothing. The list shows a soft
  placeholder row saying so and the user clears the chip by hand. Settled explicitly by
  the user; an explicit placeholder is not a silent hide.
- **Unsupported:** the good-day / bad-day cohort split; ALIGN / event-aligned chip
  behavior; raising high attribution; scoping correction factor to a clock span.
- **Evidence owed:**
  1. chip membership asserted through the projection's public interface on
     analyzer-built output, never a hand-set flag (this repo's stated test trap is
     fixtures that hand-set the very flag under test);
  2. the settings-row direction mapping, including the correction-factor case whose
     number moves opposite to basal's;
  3. result-time scoping: an over-treated low chips as a **high** in the span holding
     its rebound, and a correction stack chips as a **low**, on the same day.

### Pinned acceptance (measured on the real snapshot, reproduce shape on fixtures)

The implementation must reproduce this chip membership. Real-data figures cannot go in
a test (no patient data may be committed); they are the sanity check, and the committed
synthetic fixtures carry the equivalent assertions.

| span | highs | lows | meals | corrections |
| --- | --- | --- | --- | --- |
| 15:30 to 20:00 | Carb undercount, Late bolus | Correction stacking, Meal over-delivery | Carb undercount, Meal over-delivery, Late bolus | Correction stacking, Late bolus |
| 00:00 to 03:00 | Over-treated low, Carb undercount, Late bolus | Meal over-delivery | Carb undercount, Meal over-delivery, Late bolus | (empty) |
| 14:15 to 23:45 | Over-treated low, Carb undercount, Late bolus | Correction stacking, Meal over-delivery | Carb undercount, Meal over-delivery, Late bolus | Correction stacking, Late bolus |

### Wiring: three places must move together

`ciq_autotune/findings_projection.py` is the source of truth. Two consumers are
drift-checked against it and fail the fast gate if they lag:

- `mockups/findings-projection.mirror.mjs` — the fixture-only JS transcription the
  browser gates answer from. It already carries `OUTCOME_KIND` (line 46), so the chip
  rule is derivable there with no new table. `frontend/findings-projection-mirror.test.js`
  deep-compares every field of every row.
- `scripts/gen_findings_projection_fixtures.py --check` — freezes the projected answers
  and the three payloads they were projected from. A new row field means regenerating.

## Open questions

Round 1 settled Q1 to Q4 (see Decisions). Round 2 frontier:

- Q5 do the setting rows (basal, I:C, correction factor) join the direction filter,
  and by what rule.
- Q6 where the control lives and what it defaults to.
- Q7 whether filtering the list also changes the chart.
- Q8 risk contract: what must happen when the filter would hide a relevant finding.

## Spawned tasks

_(none yet)_

## Plan review — round 1 (inline; cold panel NOT spawned)

Seven blocking objections, **all tagged `authoring`** (present since the draft), zero
`injected`. The rewrite-clean signal did not fire. Deltas re-verified against the frozen
corpus with no new defects.

1. Verification command referenced `$PW` / `$VENDOR` with no producer anywhere in the
   order. A fresh agent pasting it gets an empty `PLAYWRIGHT_MODULE` and the leg fails
   closed. Fixed: the setup that produces both is inlined into the order.
2. The six-pair settings mapping could not be evidenced. Measured: the frozen corpus
   carries only `basal_rate raise` and `carb_ratio lower`; `basal_rate lower`,
   `carb_ratio raise`, `isf strengthen` and `isf weaken` are all absent. Fixed: the
   order requires a closed-set table test plus a `carb_ratio raise` fixture, that being
   the inverting entry.
3. Chip membership for four of seven levers was unexercised (`late_bolus`,
   `meal_over_delivery`, `missed_meal`, `correction_on_iob` appear in no window). Fixed:
   assert over `_OUTCOME_KIND`'s closed set.
4. Acceptance cited real-snapshot behavior the executing agent may not be able to
   reproduce. Fixed: binding criteria restated on named fixture windows; the real-data
   check demoted to an explicitly optional sanity note.
5. Interface shape for the mapping was left to build time ("one named place"). Fixed:
   named as a module-level dict beside `_row` in `findings_projection.py`, with the
   deletion-test reason for not creating a module.
6. The settings mapping must ALSO be transcribed into the JS mirror, which builds its
   own basal / carb-ratio / ISF rows (`isfRows` at line 227) and holds no
   settings-direction table. The order did not say so. Fixed.
7. Partly refuted, recorded: the fear that the fixture corpus could not carry the
   headline acceptance. Reproduced and false — `global` populates all four chips,
   `rebound` chips its over-treated low HIGH, and `afternoon` chips an over-treated low
   HIGH and a correction stack LOW in one window. Kept as the binding acceptance.

**Not done:** a cold reviewer panel. `plan-review` requires a reviewer with no stake,
and this session authored the order; the session also carries a standing instruction not
to spawn agents unasked. The review above is an author self-review with every factual
claim reproduced against the repo, which is weaker than cold on judgment axes (interface
shape, scope) and equal on grounding. Offered to the user at step 12.

## Plan review — round 2 (COLD, codex gpt-5.6-sol high effort, read-only)

Verdict: **not countersigned**, five blocking objections, all `authoring`, zero
`injected`. Each reproduced against the repo before it was acted on.

1. **CONFIRMED, and the round's most valuable finding.** The order's fast gate omitted
   four CI steps: `check_adr_numbers.py` (`ci.yml:73`), `check_owned_identifiers.py`
   (`ci.yml:75`), two fixture drift checks, and
   `node mockups/finding-evidence-routing.exploration/build.mjs --check` (`ci.yml:128`).
   Proven empirically: the exploration reads
   `frontend/__fixtures__/findings-projection.json` and embeds **six projection rows
   with their full field set** in its generated `data.json`, so adding a row field
   drifts it. The order as written would have passed every check it named and then
   failed CI — the light-theme-relight failure mode AGENTS.md documents, reproduced in
   advance. Fixed: the gate is now the complete CI set, plus a Do step regenerating the
   exploration in the same change.
2. **CONFIRMED.** "Browser leg reports a nonzero test count" is vacuous; the existing
   suite already satisfies it, so nothing about the chips would be certified. Fixed:
   named new cases required in `diagnose-workstation.browser.test.mjs`, each observing a
   rendered outcome that a vue-free test cannot reach.
3. **CONFIRMED.** The backend interface was pinned and the frontend one left to build
   time — the rubric's axis-3 failure verbatim. `queueRows` (line 124) and
   `renderFindingsQueue` (line 200) already own this behavior and `EMPTY_LINE` already
   ships an empty state. Fixed: specified as `queueRows(projection, selected = null)`
   with an UNCHANGED return type, rows gaining `hidden` / `collapsed`, seam computed
   over visible rows, no new module and no second placeholder string.
4. **CONFIRMED.** A table test over the mapping dict passes even if no row builder ever
   calls it. Fixed: the six pairs are asserted through `FindingsProjection.project()`.
5. **SPLIT.** The wrong-field-names half is CONFIRMED — the order said
   `executable` / `args` where the file uses `runtimeExecutable` / `runtimeArgs`
   (`.claude/launch.json:4`), which would have produced a dead entry. The
   remove-it-on-scope-grounds half is **REFUTED**: the user settled this in Q14. Panel 3
   is told not to re-litigate it.

Round 1 (inline, author self-review) also stands above: seven objections, all authoring.
Across both rounds: twelve authoring defects, zero injected. The rewrite-clean signal
never fired.

## Plan review — round 3 (COLD, fresh panel, codex gpt-5.6-sol high, read-only)

Verdict: **not countersigned**, five blocking. THREE `authoring`, **TWO `injected`** by
round 2's own fixes. Injected climbed 0 -> 0 -> 2, which is the rewrite-clean signal
firing; edits this round were applied with per-edit assertions rather than blind
`replace`, after round 2's launch-field fix was found to have silently no-opped.

1. **INJECTED, confirmed.** Round 2's `hidden` / `collapsed` split was internally
   impossible: held and blind rows carry `chips: []`, so a "hidden = fails the
   selection" rule marks them hidden under every sift, the renderer skips them, and the
   expandable group can never render — the collapse would have been a silent drop, which
   the risk contract forbids. Fixed: `hidden` applies only to rows carrying at least one
   chip; held and blind are only ever `collapsed`, stated as explicit precedence.
2. **INJECTED, confirmed.** Round 2's "reuse `EMPTY_LINE`" was me over-applying the
   reuse rule. Its text is "No pattern or setting asserts a direction in this window"
   (`diagnose-findings-queue.js:23`), which is FALSE when assertions exist and the chips
   merely exclude them — the surface would state something untrue about the user's data.
   Fixed: a new exported string for the filtered-empty case.
3. **CONFIRMED.** The renderer's front door was still unspecified: how selection and
   expansion state reach `renderFindingsQueue`. Fixed: one added argument, state owned
   by the workstation, module holds none.
4. **CONFIRMED, and round 2 claimed to have fixed it.** The launch entry still said
   `executable` / `args` against a file using `runtimeExecutable` / `runtimeArgs`. The
   round-2 edit's target string had already changed, so `str.replace` silently did
   nothing and reported success. Fixed and verified in place this time.
5. **CONFIRMED.** The gate was STILL short three CI steps even after round 2 completed
   it: `gen_revise_e2e_db.py --check` (`ci.yml:50`), `screenshots.local.test.mjs`
   (`ci.yml:114`), and the materialised public-tree link + contamination scan
   (`ci.yml:81`). The first is directly load-bearing here: the order's no-fetch server
   run is against that very database, so a run that mutates it fails the check.
   Separately found while verifying: the order never named the FROZEN 29-story behaviour
   ledger (`mockups/finding-evidence-routing.behavior.md`) whose replay is a CI browser
   leg over this exact surface. Both fixed.

### At the cap: one decision left, and it is the user's

`plan-review` caps at three panels, and a blocker surviving the cap means an unsettled
decision, not an undiscovered typo. Exactly one qualifies.

**Which `/ui-craft` governs this repo.** `skills-lock.json` pins ui-craft to
`ConnorGriffin/skills` ref `230e71a5`, and the vendored, git-tracked copy at
`.claude/skills/ui-craft/` offers six modes — lock, build, critique, audit, polish,
resettle — and has **no `revise`**. The operator's global copy at
`~/.claude/skills/ui-craft/` is newer and does have `revise.md`. The order's step 10
names the revise lane, which the repo's own pinned copy cannot execute. Put to the user.

## Closed

Work order posted to the ticket as
https://github.com/harmonichq/harmonic/issues/61#issuecomment-5352401833 and the ticket
moved to `ready-for-agent`. Branch rebased onto `52bf135`.

Corrected after posting: the order named the repo `ConnorGriffin/harmonic`. The remote
is `harmonichq/harmonic` (`git remote -v`); the posted comment was edited in place. The
same wrong slug was fixed in both handoff documents.

Status label: the pipeline's own `agentflow:*` vocabulary has no "triaged" value and
agentflow is retired as of #65, so the repo's `ready-for-agent` label was used and
`agentflow:needs-grilling` removed.

### Dispositions

- D1/D5/D9 `-> ADR`: **owed by the implementation**, not by triage. The order's step 11
  requires `## ADR 61 — Chipping a finding by its result, not by the event it is counted
  over` in an OpenSpec change folder, and `scripts/check_adr_numbers.py` enforces the
  identity in CI. Not yet written.
- D4 `-> issue` (scope correction factor to a clock span): **not yet filed.**
- D11 `-> issue` (unexplained highs, 3 of 30 attributed): handoff written and handed to
  the operator, who reports it moved to its right place. Ticket id unknown to this
  session.
- Skills retirement: filed and merged as #65 (`52bf135`).
