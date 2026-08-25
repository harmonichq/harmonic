# Scope ledger — Drill-in keeps the user's scope (#179)

Ticket: [harmonichq/harmonic#179](https://github.com/harmonichq/harmonic/issues/179)

Base: `0a2d115` (`origin/main`)

Classification: code. UI Craft lifecycle: revise. Review depth: Targeted.

## Decisions

- **The defect is a precedence-chain ordering bug, not a missing guard.**
  `paintChart`'s factor branch (`frontend/diagnose-workstation.js:1706`) runs
  BEFORE the `canvasDrawn` (`:1726`) and `explicitPreset` (`:1735`) branches, and
  its only user-scope guard is `!(f.eventDiscovery && (drawn || explicitPreset))`.
  `eventDiscovery` is true only when `eventChartsOnly` is set and the row carries
  an event-chart coordinate (`:1577`), so an ordinary clock drill never reaches
  the guard and the factor's peak bucket seizes the window.
  **Why:** read at those lines. **Disposition:** inline.
- **Only the whole-day choice is affected, and that is why it looked
  intermittent.** A sub-day window reaches the server through `findingsWindow()`
  (`:1141`) and comes back as `caseWindow.scoped`, taking the `Window` branch at
  `:1711` — preserved. `findingsWindow()` returns `null` for `[0, 1440]`, so the
  24 h choice arrives at the factor branch unscoped and falls to the peak branch.
  The user's choice IS recorded (`explicitPreset = true` at `:1057` for a preset
  press, `:2556` for a whole-day drag commit); it is simply never consulted.
  **Why:** read at those lines; `WINDOWS.all` is literally the `24 h` preset
  (`:236`). **Disposition:** → work order.
- **The behavior is PINNED, so this is a recorded retirement, not a plain
  regression.** Frozen story P20 (`mockups/finding-evidence-routing.behavior.md:573`,
  verdict `kept`, operator-ruled 2026-08-19) pins exactly the seizure.
  **Disposition:** → work order.
- **P20 and P17 contradict each other, and P17 wins.** P17 (`:495`, verdict
  `kept`, the same operator ruling date) says an explicit preset press or drag
  "outranks the window a frame would derive… A user window is a workspace: it
  survives drilling and popping." The code satisfies P20 and violates P17. P20 is
  retired outright, the way P21 was retired for occurrence selection; P17 becomes
  the single precedence rule. **Disposition:** → ADR.
- **The factor frame derives NO canvas window.** It takes ISF's treatment
  (term 31, `:1759-1762`): whatever window stands, stands. No peak chip, no
  `PEAK` label, no `n of N` canvas note tail, no shading, no replacement label of
  any kind. **Why:** operator ruling 2026-08-25, verbatim — "it just keeps my
  selector. The selection is a slicing method that lets me then dig into
  findings. Those findings will show up as dots on the chart anyway that I can
  then trace into." **Disposition:** → work order.
- **Nothing is lost by the retirement, and that is checkable.** The peak keeps
  two permanent homes this change does not touch: the inspector's "When it lands"
  histogram, captioned `peak HH:MM–HH:MM · n of N` (`:512-527`, ADR 79's
  server-owned 12-bucket clock), and the coincidence links "Peak hour falls in
  the … basal slot / … I:C block" with their View slot / View segment routes
  (`:542-556`, P37/P38). The occurrence dots already render on the standing
  window whatever set it (`:1766-1770`). **Disposition:** → work order.
- **The crumb meta count is a different number and stays.** S09 asserts both a
  canvas chip (`/^Factor peak …/`) and a crumb meta (`/^\d+ of \d+ · /`); only
  the canvas chip assertion is retired. Deleting the crumb meta would be a
  second, unsanctioned retirement. **Why:**
  `frontend/diagnose-workstation-behavior.replay.mjs:1037-1038`.
  **Disposition:** → work order.
- **Closed inventory of everything that pins the seizure** (grepped repo-wide for
  `Factor peak` / `PEAK ` / `peak_bucket_index`, not sampled): the factor branch
  `frontend/diagnose-workstation.js:1706-1725`; its two prose comments at `:376`
  and `:1105`; the replay assertion at
  `frontend/diagnose-workstation-behavior.replay.mjs:1037`; ledger P20 (`:573-577`)
  and P21's back-reference (`:585`). No OpenSpec spec pins it. The server payload
  field `clock.peak_bucket_index` and its validator
  (`frontend/finding-case-file-validation.js:49`) feed the inspector histogram and
  are untouched. **Disposition:** → work order.
- **The ledger's own header count is already stale, and this change must not
  paper over it.** Header `:11-13` reads "**99 executable entries** (S01–S81,
  C41–C55, and D1–D3)" while the replay exports 90 S stories (S01–S90), 15 C and
  3 D — 108, matching the last revision's "app: 108 of 108 stories passed". The
  drift predates this ticket. Next free story id is **S91**, and the header
  becomes 109 (S01–S91, C41–C55, D1–D3). **Why:** counted from
  `grep -c '^export const S[0-9]'` and the max exported ids. **Disposition:**
  → work order.
- **Post-freeze changes add a dated revision section; they never edit the P
  inventory.** Five precedents plus the 2026-08-24 §132 revision at the file tail.
  P20's verdict line flips to `retired` with a `sanction:` line carrying the
  operator's own words, exactly as P21's does. **Disposition:** → work order.
- **UI Craft route is revise, confirmed live this session.**
  `routeSurface({embodiment:'shipped', runnability:'runnable',
  declaration:'complete', dataSource:'synthetic'})` returns
  `{"mode":"revise","reason":"safe synthetic data source declared"}`. Safe start is
  AGENTS.md's exact `--no-fetch` entrypoint against
  `mockups/revise-e2e.synthetic/harmonic.sqlite`; frozen ledger
  `mockups/finding-evidence-routing.behavior.md`; replay
  `frontend/diagnose-workstation-behavior.replay.mjs`. **Disposition:** → work order.
- **ADR home is the existing surface change folder.**
  `openspec/changes/finding-evidence-routing/design.md` already holds ADRs 96, 31,
  42, 97, 100 and 41 for this surface, under `## ADR <issue> — Title`. ADR 179
  joins it; no new change folder, no `docs/adr/` tree. **Disposition:** → ADR.
- **Slicing stays flat.** No rubric trait fires: one deliverable surface, one
  module, the browser harness already exists and is not built here, no live
  resource, no trust boundary, no lock phase (revise, not build). Anchor row A,
  the same call #100 made for the same surface and lifecycle.
  **Disposition:** one work order, one pull request.

### Risk contract

- **Must prevent:** secret exposure; irreversible loss of authoritative data;
  silent incorrect success — here specifically a green replay that never presses
  a preset before drilling, which would pass on the defective base. A drill must
  never move the canvas window, and the canvas window must never disagree with
  the window `findingsWindow()` sent to the server.
- **Must recover:** none. Pure view state; nothing is written.
- **Accepted failure:** a factor whose case file has no clock projection now
  leaves the standing window untouched instead of forcing 24 h. The reader sees
  their own window with no occurrence dots rather than a whole-day jump.
- **Unsupported:** the peak's discoverability for a reader who never opens the
  inspector panel; narrow-viewport behavior; assistive-technology announcement of
  the removed chip.
- **Evidence owed:** a browser-gate assertion that fails on this base and passes
  after — press `24 h`, drill a finding, assert the canvas window and the pressed
  preset are byte-identical to before the drill and no `Factor peak` chip exists;
  the same assertion for a drawn window; a guard that the inspector's "When it
  lands" caption and the coincidence links still print after the drill; the
  amended S09; a new frozen story with its replay leg.
- **Why:** advisory dosing tool, one reader at a time, no data written by this
  change; the failure mode is a reader losing the slice they chose.
- **Disposition:** copied into the work order.

## Plan-review rounds

**Degraded, and recorded as such.** This session authored the order and is under a
standing instruction not to spawn subagents, so the cold-reviewer panel the
procedure calls for did not run. What ran instead was the rubric's grounding pass
executed directly: every load-bearing claim in the draft was reproduced against the
worktree — each cited line opened, each count executed rather than typed. That
catches wrong facts, which is the objection class that measured reviews find most
of; it does not catch what a cold reader would. Two of three objections below were
authoring defects in claims that read as confident and were false.

**Round 1 — 1 blocking, 2 notes, all 3 `authoring`, 0 `injected`.**

Blocking:

1. Step 2 asserted that `windowNote` in `frontend/diagnose-workstation-chart.js`
   is "shared and node-tested" and told the agent to leave it. Both halves are
   wrong. `windowNote` appears nowhere in
   `frontend/diagnose-workstation-chart.test.js` (grepped), and `renderCanvas`
   has exactly one production caller — `diagnose-workstation.js:1796`, the very
   line step 2 deletes. Leaving it would strand a parameter no caller can ever
   set, which is the charter's dead-code rule, and the order would have
   instructed the defect. Step 2 now removes `labelNote` (`chart.js:651`) and its
   three dependent expressions by name.

Notes, both adopted:

2. Step 5 said "register it wherever the newest story is registered" without
   naming the registration, and told the agent to drive a brace drag to obtain a
   drawn window. The replay has a `STORIES` array (`:3843`, `:3978-3981`) and a
   boot state `'drawn'` that S01 already uses, whose CFG carries
   `drawn: [135, 285]`. Driving a drag to reach a state the harness boots into is
   avoidable flakiness. Step 5 now names `['S91', S91, 'drawn']` and the
   `// STORY:finding-evidence-routing:S91` tag form.
3. P17's own `source:` cite in the ledger is stale — it reads `:1176-1183`,
   `:1479-1480`, `:1213-1226`, while the real lines are `:1109`, `:2324/:2328`
   and `:1706-1740`, and they move again under step 1. P17 becomes the single
   load-bearing precedence rule in this ledger, so the order now sanctions
   correcting that one cite in the same revision section.

**Round 2 — the cold panel, two fresh reviewers with no context from this
session. 2 blocking (both found independently by both reviewers), 6 notes.
7 `authoring`, 1 `injected`.** Run at the operator's explicit request after
round 1 was disclosed as degraded.

Blocking:

1. `authoring`. **Deleting the branch retires a SECOND pinned assertion the order
   never named, and CI would have gone red on it.** The branch has two
   load-bearing arms, not one. Besides the peak arm, the `caseWindow.scoped` arm
   (`frontend/diagnose-workstation.js:1711-1714`) reports a sub-day window by
   calling `markWindowSegment`, which unpresses every preset and installs a
   `Window HH:MM–HH:MM` follow chip (`:383`, `:400`). Frozen story S36
   (`frontend/diagnose-workstation-behavior.replay.mjs:2988-3004`) drills
   `Late bolus` and then presses Overnight, and asserts that output verbatim at
   `:2999`: `is(narrowed.pressed, ['Window 00:00–06:00'], …)`. After the deletion
   it reads `['Overnight']` with `chip` null. The round-1 "closed inventory"
   grepped for `Factor peak` / `PEAK ` / `peak_bucket_index`, none of which occur
   in S36, so it was structurally incapable of finding this — the inventory was
   closed over the wrong term set. Fixed as step 5, with a sweep instruction for
   any further assertion read on a factor frame under a sub-day window, and the
   §132 literal-move precedent (`:2285-2288`) for recording it.
2. `authoring`. **The new story, as round 1 specified it, passes on the defective
   base** — the silent-incorrect-success outcome this ledger's own risk contract
   names as must-prevent. Existing story S21 (`:1339-1352`, registered
   `['S21', S21, 'drawn']`) already asserts
   `is(drilled.chip, start.chip, 'S21 drilling a factor does not move the user
   window')` and passes today, because the deleted scoped arm emits the same
   `Window HH:MM–HH:MM` text and `state()` strips the `×` glyph at `:86`. So the
   drawn-window half of P17 is already enforced and already gated, and a
   chip/pressed equality story would have been a duplicate that could never fail.
   What genuinely changes for a drawn window is the CLEAR AFFORDANCE: the deleted
   arm passes no `onClear`, so the `×` vanishes after a drill today, while the
   `canvasDrawn` fall-through passes `clearDrawn` (`:1733-1734`) and it survives.
   The new story now asserts that element directly, the way S08 reaches it at
   `:1018`.

Refuted, and NOT carried into the fix round:

3. One reviewer reported P17's verdict as `amended · issue #81 · 2026-08-21`,
   which would have falsified the "two stories, one ruling date" framing that
   justifies the retirement. Reproduced and refuted: P17's block opens at `:495`
   and its own verdict line is `:503`, reading
   `kept          operator-ruled: Connor Griffin · 2026-08-19`. The line quoted
   at `:567` is P19b's verdict, a different block. Command:
   `awk 'NR>=493 && NR<=570' mockups/finding-evidence-routing.behavior.md |
   grep -n -E "P1[789] ·|verdict:"`. Had this reached the fix round it would have
   been written into ADR 179 as permanent false provenance.

Notes, all adopted:

4. `authoring`. Two further prose sites describe the retired behavior beyond the
   two named: the surviving `canvasDrawn` branch comment (`:1729-1730`,
   "Reported in the chip slot the peak chip already occupies") and
   `frontend/diagnose-workstation.css:161-163`, which justifies the follow chip's
   `width: 172px` as sized for `"Factor peak 00:00–24:00"` — a string that can no
   longer render. Step 3 now enumerates four sites and forbids re-measuring the
   width, which would be an unrequested visual change.
5. `injected`. Round 1's step 2 named three dependents of `labelNote`; there are
   four. `notePx` is consumed at `frontend/diagnose-workstation-chart.js:672` as
   well as `:674`, and `:672` sits inside the block round 1 simultaneously told
   the agent to leave intact. Behavior-identical to drop (it is 0 whenever
   `labelNote` is empty), but the contradiction was introduced by round 1's own
   fix.
6. `authoring`. "One production caller" for `renderCanvas` is wrong — 
   `mockups/finding-evidence-routing.exploration/pooled.js:243` is a second. The
   conclusion holds for the true reason: no caller anywhere passes `windowNote`.
7. `authoring`. The order's verification enumerated AGENTS.md's eight backend
   drift checks; `.github/workflows/ci.yml:35-74` runs eleven, plus
   `node --test scripts/screenshots.local.test.mjs` (`:132`). AGENTS.md is stale
   against its own CI. Verification now points at `ci.yml` and names the gap.
8. `authoring`. Round 1's step 6e told the agent to correct P17's `source:` cite
   and supplied the pre-change line numbers while also saying they move again —
   without saying which set to write. Now: write the post-change numbers, read
   off the agent's own diff.

Both reviewers verified independently and agreed on blockers 1 and 2, reaching
them by different routes (rubric grounding pass and step-by-step execution
realism). The order was rewritten clean rather than patched, per the
rewrite-clean rule; one `injected` blocker in round 1's own fix is what that rule
exists for.

**Round 2 re-check — both reviewers re-read the rewritten order. 3 blocking,
5 notes. ALL 3 blockers `injected` by round 2's own fixes.** Both independently
confirmed the P17 refutation; one wrote that it had "bound a verdict line to a
block header 72 lines earlier without checking the intervening fence."

Blocking, all injected:

1. **The rewrite pointed the frozen-ledger edit at the wrong line.** Step 7a said
   "flip P20's verdict line (:577)"; `:577` is P20's `mock:` line and its verdict
   is `:580`. An agent following the cite literally would rewrite the `mock:`
   line and leave `verdict: kept` standing — a frozen contract asserting the
   seizure is still kept while the code no longer does it. Nothing catches that:
   the ledger is prose, and none of the three policy guards reads it. The
   previous draft carried no line number here and was right by omission; the
   rewrite introduced the error while adding precision. Both reviewers flagged
   it; only one had the correct replacement.
2. **Step 2's own chart-module surgery leaves dead code, while citing the
   dead-code rule as its rationale.** Removing `notePx` from
   `frontend/diagnose-workstation-chart.js:672` makes the `thin` shedding branch
   at `:678-679` unreachable: `thin` guarantees a non-empty `tailText`
   (`:653-655`), so branch 1's condition subsumes it. That branch was reachable
   only through a non-empty `labelNote` inflating branch 1's sum — exactly what
   step 2 deletes. Worse, the step's closing sentence instructed the agent to
   leave the shedding order intact, forbidding the fix. Found independently by
   both reviewers; they disagreed by one line on where it sits, and the file says
   `:678-679`.
3. The same-round cite corrections: P21's `sanction:` form is `:594`, not `:597`
   (a closing fence); S36 is exported at `:2991` with a doc comment from `:2986`,
   not `:2988`; P17's `source:` is `:499-500`, and `:501` is a frozen `mock:`
   line an over-wide replacement range would clobber; S36 keeps five other
   assertions, not three; and Done-when still carried the hard literal `109` that
   the Expectation had just been hedged away from, which would have defeated the
   #178 guard at the acceptance gate.

Notes adopted: "the only other `renderCanvas` caller" is wrong a second way —
`frontend/diagnose-workstation-chart.test.js` calls it seven times (passing
`windowNote` in none), so the order now says PRODUCTION caller and tells the
agent to re-grep rather than trust the enumeration.

Cleared on re-check: the new story is genuinely red on this base, verified
through the mechanism — `markWindowSegment` assigns `follow.textContent`
(`:391`), destroying the `<i class="x">` child, and re-appends it only
`if (onClear)` (`:392-399`), so the count goes 1 → 0 after a drill today and
1 → 1 after the change. One reviewer also swept the other CI legs unprompted:
`frontend/diagnose-workstation.browser.test.mjs` reads the chip at `:666`,
`:736` and `:761` but never with a factor frame open, and `chipIs` (`:290`) is
called only from a level-1 drag helper, so no further gate moves.

**Injected-blocker trend: 1 → 3.** Every round-2 blocker was introduced by
round-1's or round-2's own fixes rather than present in the original draft. Each
was a fact error with an exact, reproduced counterpart, applied surgically and
re-verified by opening the file and printing the line, rather than answered with
a third rewrite that would mint fresh surface. No unsettled decision was blocking
at any point.

**Cross-ticket collision found while the panel ran, and guarded rather than
sequenced.** Ticket #178 is in flight against the same replay file and the same
behaviour ledger: both tickets add a story at the next free id, and both amend a
header that counts itself. The order now instructs the agent to re-derive the id
and every count rather than trust the triage-time literals, and states the
expectation as "exactly one more passing story than the branch point, all green"
rather than the bare number 109.

## Open questions

- none. The dominant uncertainty (what replaces the seizure) was ruled by the
  operator on 2026-08-25; the two residual code branches have obvious defaults
  recorded above.

## Spawned tasks

- none. #178 was considered and kept separate: it changes the missed-meal
  comparison's cohorts, anchors and relative axis inside the event lens
  (a server projection concern), and decides nothing about the clock scope
  window this ticket fixes.
