# Lock the Overview's Insulin summary and Bolus review cards (#633)

## Why

Connor asked (#631) for two of the cards Tandem Source draws below its day
chart on Harmonic's Overview: an Insulin summary (the average daily dose split
into basal and bolus, the average daily boluses split manual and Control-IQ,
the average daily carbs) and a Bolus review (bolus units by type and by
delivery method, as a daily average). #632 serves every figure as
`/api/explore/insulin?days=N` for the Overview's 14, 30 and 90 days. The
Overview is a locked screen (`docs/design/recommendations-redesign.md`,
"Overview screen locked 2026-10-13"), and a new card on it reopens the lock
(ui-craft: a new state or component amends the structure first). So, as #613
did for the row swipe, this change writes the structure, builds the two cards
in the component library on the served fixtures as the mock, and amends the
lock; it merges only after Connor replays the stories and says "locked" on the
pull request. #634 then puts the locked cards on the Overview.

## What changes

- **The structure, in the lock doc.** A dated §2.5 amendment for the two cards,
  which also names the §1.5 rows #634 adds when the cards reach the Overview
  (the shipped Glossary page lists only terms the app prints, so they cannot
  land before then); §4.2 gains entry 29, InsulinSummaryCard, and entry 30,
  BolusReviewCard, each naming the served fields it prints. §1.1 and §1.3, the
  Overview's rows, change with the screen in #634. The amendment quotes only words Connor wrote or the
  coordinating session relays as his.
- **Two library components with their stories,** `InsulinSummaryCard` and
  `BolusReviewCard` under `frontend/ui/components/`, each read through one new
  selector in `frontend/ui/overview-model.ts` from the served answer, every
  number a `Sourced` value. States: populated; a window whose boluses are none
  (Bolus review's rows at 0 U with no share); no data; not yet read. Phone at
  390 and desktop at half the Overview's row.
- **One fixture store more, from the generator.** A synthetic wearer's history
  with its boluses left out, so "a window with no boluses" is served, not
  hand-written. `scripts/ui_patient.py`'s `materialize` gains a keyword that
  leaves boluses out, its default leaving every existing store byte-identical.
  The allowlist gains the cards' words through the generator's Overview label
  list.
- **No shipped screen moves.** Not the Overview (#634), not the Settings
  Glossary page (its rows come from §1.5, which this change leaves alone), and
  nothing in the engine.

## Not in this change

- The Overview screen, its stories, the live adapter, the app's client and the
  contract test (#634).
- Any change to the insulin read or its partition rules (#632, ADR 632).
- Site changes (dropped from #631 by Connor, 2026-10-24).

## Risk contract

- **Must prevent:** a printed number that does not trace to a served field (the
  Storybook prechecks' rule (e)); a printed word outside the glossary
  allowlist; a sentence or explanatory subtitle on a card (§2.3 ban 1); a
  control on either card (the Overview carries nothing to act on); a card that
  prints a number for a window the engine served as null, or a share where the
  engine served none; a committed fixture or story value written from real
  data, or the screenshot's values anywhere; a change to any shipped screen,
  the Settings Glossary page included; the amendment recording a decision
  Connor did not make or a quotation he did not give; a change to the Overview
  screen or the engine.
- **Must recover:** nothing automatic; a wrong card is a revision before
  "locked".
- **Accepted failure:** the mock's defaults (ADR 633's five) may be changed at the replay; each change is a revision round on
  this pull request, at most three (ui-craft).
- **Unsupported:** a window switch on the card itself (the Overview's switch
  drives it, in #634); hover or tap detail on a row.
- **Evidence owed:** story plays for every state on both frames, through the
  prechecks; the ui-craft cold critique over the renders, its findings fixed; the rendered stories attached to the pull request for the replay;
  the amendment text; the fixture generator's guard for the new store; the
  full pull-request gate once on the pushed commit.
