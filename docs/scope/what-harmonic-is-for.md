# Scope ledger — what Harmonic is for

Session 2026-09-08, interview mode. Operator present (Connor). Trigger: a
"what would a diabetic want from this" assessment overreached; Connor set
premises and asked to be interviewed on what he wants out of the app,
re-assessed against the v2 spec (#348/#389) and in-flight work.

## Premises set by Connor (2026-09-08, settled, not re-litigated)

- Nobody judges a basal change on one day of data. `inline`
- CGM coverage gaps are a phone-app gap, not a tool problem. `inline`
- Life is too variable for same-meal trials; the tool collects over the long
  haul and suggests changes slowly. It is a field tool, not an experiment. `inline`
- Site age has been tried repeatedly and does not yield a consistent finding;
  do not re-propose it. `inline`
- The app must not become a food diary. The private observation diary exists
  only to correlate lived events with engine findings and find gaps; it is not
  a product input. `inline`

## Decisions

- **Cadence:** analysis sessions every two to four weeks, fewer once steady.
  Future shape is a companion app that notifies: a new finding took priority,
  a Focus or Trial resolved, a carb question needs an answer. (Q1, 2026-09-08) `inline`
- **Endo view:** a 90-day snapshot usable in a clinician visit, with a change
  log of what changed, what motivated it, and what the impact was. (Q1) `inline`
- **Success at six months:** one or two setting changes with a noticed impact;
  and being told of a bad habit, correcting it swiftly, and seeing the result
  in the app. Two clocks: settings slow, habits fast. (Q2) `inline`
- **Attention:** habits lead (carb counting, over-treating lows are high impact
  and in Connor's direct control); a strongly supported setting change takes
  priority when it asserts; habit detection is an equal contender, not
  context. (Q3) `inline`
- UI shape is out of bounds for this interview. (Q4 withdrawn) `inline`
- **Notifications are not part of the v2 first release**; v2 ships as an app
  you open. The future companion-app idea stays in Connor's head: no issue, no
  epic, no further ledger detail. (Q5, Q13) `inline`
- **Endo 90-day snapshot comes after the first release.** The v2 Changes
  history (original context, motivation, ending, impact; persisted by #387) is
  the change log the endo view will read. Medium already settled as a
  print-ready read-only view (evidence-canvas ledger, #136). (Q6) `inline`
- **Focus confirmation is gated on observed opportunities, not a calendar.**
  Enough opportunities (order of a dozen lows or meals) confirm a habit
  correction however many days that takes. This amends the v2 lock's Focus
  readiness rule (HV2-24: fourteen elapsed days plus a measured population)
  and ADR 387's Focus arm; the exact opportunity count is a backend policy
  decision, not a frontend gate. (Q7) `→ issue`
- **First release follows every habit that has a detector today:** carb
  undercount, late bolus, meal over-delivery, over-treated low, correction
  stacking, correction on active insulin, missed meal, meal bolus short (the
  eight in `analyzers/scenario/levers.py`). Eating sequences (#342) stay a
  separate admitted build. (Q8) `inline`

- **One active watch stays for the first release.** A maturing Trial blocks
  starting a Focus, as today; concurrent Trial + Focus is a later question.
  (Q9) `inline`
- **Near-tie goes to the setting.** When a staged setting and a supported
  habit sit close on Priority, the setting leads, because it is the rarer and
  better-supported event. This amends ADR 383 step 4 (greatest Priority, tie by
  canonical subject string, no flavor preference) and needs a defined
  "near-tie" band; ADR 383 refused a numerical materiality threshold, so the
  band must be argued, not assumed. (Q10) `→ issue`
- **v1 retires after Connor accepts the v2 release.** No v1 job survives; the
  lock's predecessor inventory is the carried-job list. (Q11) `inline`

## Fixed point — where #389 stands (2026-09-08 23:12 UTC)

Work is stopped at Connor's request
([checkpoint](https://github.com/harmonichq/harmonic/issues/389#issuecomment-5593144963)).
Three clean, unintegrated chunk branches exist (c1 desk/Day/utilities, c2
Overview/Explore/Plan, c3 Trial/Focus follow-up and records), no implementation
PR is open, seven documentation amendments sit uncommitted in the ticket
worktree, and the next requested deliverable is a partial v2 preview served
from a fresh read-only snapshot of Connor's own database. A "Just v2 home
slice" message was left ambiguous and not acted on. Nothing resumes
automatically.

- **No diary reconciliation.** Roughly five days were journaled; Connor judges
  it not useful. The observation-diary experiment closes with no output. (Q12) `inline`
- **"Just v2 home slice" was a nickname, not an instruction.** The coordinator's
  home-only rescope reading was a misread; nothing follows from it. The
  checkpoint's stated next deliverable (partial v2 preview on a fresh read-only
  snapshot) stands unchanged. (Q14) `inline`

- **Overview and Explore collapse into one Diagnose destination.** v2 ships
  three destinations: Diagnose, Changes, Day. Diagnose carries the shipped v1
  rail as-is: tapered tiers with the EVENT · RESPONSE minis (#302, shipped
  2026-09-04), clock windows, the leading finding in the stage, All charts one
  click away. Explore retires before it ships; the v2 prototype's plain-text
  roster is not carried. Why: cold QA found the two destinations
  indistinguishable, and the shipped rail already does in one place what v2
  split across two. Amends the lock (HV2-09, HV2-10, HV2-11) and ADR 348's
  four-destination navigation; #389 chunk c2 is unintegrated, so the cost is
  lowest now. (Q15, 2026-09-08) `→ issue`

## Grounding — read-only snapshot of the operator's database, 2026-09-08 (aggregates only)

- 90-day scenario report: eight behavioral levers, highest Priority 27 against the
  active threshold of 30; the whole habit queue is tail. Four of 48 basal slots
  assert, five are held by the recurring-low gate; correction factor carries a
  direction-only weaken; both carb-ratio blocks measure near programmed and
  assert nothing. Eating sequences are a supported finding not yet in the queue
  (#342). Eleven highs in 30 days are unattributed.
- Grouped by ADR 348's four outcome shapes: highs after meals about 1 in 8 meals;
  lows after meals about 1 in 8 meals; highs after treating lows about 1 in 5
  lows; lows after correcting highs about 1 in 30 corrections, sharing its lows with
  the correction-factor weaken; a fifth shape the data adds, overnight fasting
  lows with no insulin on board, is what holds five basal slots (harm layer,
  00:00 to 06:00 band) and has no habit member. Corrected 2026-09-08 after
  Connor caught the basal slots misfiled under corrections. Meal dosing misses both ways at equal rates while the
  ratio reads right, so it is precision, not a setting.
- Pooling alone does not cross the line: with weighted member impact a shape
  prices at 27; with worst-member impact at 40. The impact rule is the decision.
- Visual: session scratchpad `outcome-shapes.html` (not committed).

- **Outcome shapes become the priced unit, and the shapes spike runs before
  #389 resumes.** Diagnose leads with a shape, set-aside and Focus operate on a
  shape, levers become evidence rows beneath it. The spike's one real question
  is how a shape's impact is summarised (weighted member impact prices the
  meal-dosing shape at 27, worst-member at 40); shape membership follows ADR
  348's four connected problem shapes plus the overnight-fasting-low shape the
  data added. It changes what ADR 383 selects from and what a Focus can pin, so
  it is backend policy first, UI after. #389 resumes on top of it. (Q16,
  2026-09-08) `→ issue`

## Open questions

(none; frontier empty 2026-09-08)

## Remaining dispositions

(none) — all four `→ issue` decisions (Q7, Q10, Q15, Q16) are discharged into
epic #390 and its first child #391, filed 2026-09-08.

## Spawned tasks

- [#390 — Diagnose leads with outcome shapes](https://github.com/harmonichq/harmonic/issues/390) (epic; sequence, decisions, risk contract)
- [#391 — Settle the outcome-shape unit](https://github.com/harmonichq/harmonic/issues/391) (spike, first child)
- Comments linking the change posted on #348 and #389.
