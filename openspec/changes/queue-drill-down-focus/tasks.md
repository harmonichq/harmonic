## 0. Base

- [ ] 0.1 Start only once #593 (`cause-traces-severity-focus`) is on `origin/main`. Bring this branch up to date with `git merge --no-edit origin/main`, never a rebase, so the pinned change commit stays an ancestor of HEAD. Confirm `git grep -n "pattern-meal-two-causes" scripts/qa_e2e_cases.py` and `git grep -n '"causes"' frontend/ui/app/live.js` both hit; stop if either does not
- [ ] 0.2 Per ui-craft `revise` §1, serve the base (`origin/main` after #593) from a second fresh worktree with AGENTS.md's QA no-fetch serve on another port, and render the before shots: Queue (Pattern open, Habit open, Habit pinned, just snoozed) at 390x844 and 1440x900, and `Screens/DrillDown` Open and Pinned from the base Storybook

## 1. Stores from the generated cases

- [ ] 1.1 `scripts/gen_ui_fixtures.py` `_queue_store`: keep `focus.admission.focus_pin` (`available`, `reason`) beside `focuses` (ADR 594)
- [ ] 1.2 Materialize `pattern-meal-two-causes` into Queue stores `meal-two-causes` and, after a cause Focus posted with `pattern_key: highs_after_meals` and `lever: late_bolus` over the whole day, `meal-two-causes-pinned`; materialize `pattern-correction-collapse` into `correction-collapse`, in the `missed-meal` stores' idiom. Assert in the generator, as `_require_*` does, that the first store serves two causes with `pinnable` true and `focus_pin.available` true, the pinned one serves `available` false with the Focus on `late_bolus`, and the collapse store serves Correction stacking `pinnable` false
- [ ] 1.3 Add each new store's states to `states()` (`drill_down`, `drill_down_pinned`, `drill_down_unpinnable`) and include the Pattern rows' `cause_counts` titles in the allowlist's engine titles
- [ ] 1.4 Remove `wearer-two-causes` and `wearer-two-causes-pinned` from `frontend/ui/served-variants.ts`, with its header line
- [ ] 1.5 Regenerate `frontend/ui/__fixtures__/ui-fixtures.json` and `ui-allowlist.json` through the generator; `--check` green

## 2. The Queue model and the adapter

- [ ] 2.1 `frontend/ui/queue-model.ts`: `focusable(store)` from `focus.admission.focus_pin.available`; `causes(store, key)` from the Pattern's counter, each with its served title, count over the Pattern's count and noun, `pinnable`, its served trace (`traces.causes` entry of the same subject, against `traces.typical`) and `pinned` (the active Focus with this `pattern_key` and `lever`); `PatternData` gains `multiCause` (more than one served cause) and `focusedCause` (the served title of the watched cause, else null) (ADRs 594)
- [ ] 2.2 `frontend/ui/app/live.js` `queueWrites.pin(subject, lever)`: a cause's Focus sends `pattern_key` and `lever`, keyed `pin <subject> <lever>`; without a lever, the body and key are today's. `live.test.js`: the sent body and key for both, and that two causes of one Pattern use different identities

## 3. The router

- [ ] 3.1 `frontend/tab-routing.js`: one export that pushes a history entry at the current address marked as a drill-down, and `subscribeRoute` reporting a Back onto an unmarked entry of the same tab; the address never changes (ADR 594). `tab-routing.test.js`: the entry keeps the address, Back reports the return, a reload parses to the Queue
- [ ] 3.2 `frontend/ui/app/App.tsx`: hand the Queue screen the router's push and its Back, and the Changes tab for the bar's action, through the props it already takes (`nav`), adding no second router

## 4. The components

- [ ] 4.1 `PatternCard`: the button reads Focus; it renders only when the card is `focusable` (and, on a cause card, `pinnable`); a multi-cause card has no button, its chart is a `button data-role="row"` with a trailing "›" named by the card's title, and, pinned on a cause, the §2.2 caption + value pair "Focus" over the cause's title in the button's place, or the Focus pill when `focusedCause` is null; the cause card's head keeps a 44 px hit area around the 32 px secondary in every state (ADR 594)
- [ ] 4.2 `TransientBar`: "Snoozed until <date>" (one label), and a `focused` kind, "Focus started" + Changes
- [ ] 4.3 `QueueScreen`: the drill-down view (phone: replaces the Queue above the tab bar; desktop: the detail pane, cards in a grid no narrower than 358 px, the list beside it); opening pushes the router entry, "‹ Queue", Back and Escape close it with the same card open; selecting another row on desktop closes it; loading draws a skeleton per cause it opened with; a cause's Focus shows its pill at once, then "Focus started" + Changes, or Not saved + Retry; Snoozed uses the same history entry (ADR 594)
- [ ] 4.4 Rename the printed "Pin" in `Button.stories.tsx` and `Motion.stories.tsx`, and the comments that name the control in `PromptCard.tsx`, `SettingCard.tsx`, `shared.css`, `queue-model.ts` and `live.js` (ADR 594)

## 5. Stories (the approval set)

- [ ] 5.1 `Screens/DrillDown` (`frontend/ui/screens/DrillDown/DrillDown.stories.tsx`) renders the shipped `QueueScreen` opened on the drill-down, from the generated stores: Open and Pinned at 390x844 (re-approval against the served traces), Desktop at 1440x900, Loading, NotSaved (a cause Focus that fails once), FocusStarted (the bar on the drill-down), Unpinnable (`correction-collapse`), and a Back play ("‹ Queue" and Escape return with the card open)
- [ ] 5.2 `Screens/Queue`: MultiCauseOpen (no button, the "›" on the chart, the chart opens the drill-down) and MultiCausePinned ("Focus" over Late bolus), phone and desktop; FocusStarted on a habit card with the Changes action calling the nav; every story whose store serves an active Focus asserts no card offers Focus; JustSnoozed asserts "Snoozed until"
- [ ] 5.3 `PatternCard`, `HabitCard` and `TransientBar` stories: Focus for Pin in every play; a multi-cause card; the caption + value pinned state; the `focused` bar
- [ ] 5.4 `npm run test:ui` clean for every story above; `UI_STORY=<id part>` while iterating

## 6. The contract test

- [ ] 6.1 `frontend/ui/app/live.contract.test.mjs`: on `pattern-meal-two-causes`, the Queue card is multi-cause with no Focus; the drill-down model's causes (titles, counts, denominator, noun, `pinnable`, each trace's episode count) as literals read once from the served answers; a live `pin(subject, 'late_bolus')` makes the card's `focusedCause` Late bolus, the Late bolus cause `pinned`, `focusable` false, and Changes' Focus Late bolus under Highs after meals; End restores the button. On `pattern-correction-collapse`, the collapsed Pattern is multi-cause with Correction stacking not pinnable. Re-read the showcase's expectations if #593 serves any of its Patterns with two causes

## 7. The lock docs and the record

- [ ] 7.1 `docs/design/recommendations-redesign.md`: the sections its 2026-10-20 amendments say follow: §1.3 (the Queue's just-focused bar), §1.4 (Snooze beneath Focus), §1.5 (no Pin row; Focus reworded per ADR 594), §4.2 PatternCard, HabitCard and TransientBar. No other section
- [ ] 7.2 `docs/design/drill-down.md`: Served vocabulary names the served fields #593 added in place of the engine gaps; after Connor approves the stories on the pull request, a dated `Amendments` line quoting him and the `Approved screens` line updated for the re-approved Open and Pinned and the newly approved stories. Nothing else
- [ ] 7.3 `openspec/changes/recommendations-redesign/specs/surfaces/spec.md`: the Queue requirement's Pin wording becomes Focus, nothing else
- [ ] 7.4 `README.md`'s Pin sentence and AGENTS.md's contract-test paragraph (what `pattern-meal-two-causes` adds)
- [ ] 7.5 Search the whole tree for `\bPin\b` once more and confirm every remaining hit is history or an internal identifier (ADR 594)

## 8. Verify and evidence

- [ ] 8.1 Run each complete suite of the pull-request gate once, on the commit that will be pushed
- [ ] 8.2 Attach to the pull request, per ui-craft `revise` §4: before/after pairs from the same QA stores for every story in 5.1–5.3 and the live QA serve's Queue at 390x844 and 1440x900; the must-survive lines of both locks each with its render or live check; the precheck output; the base SHA, the quoted safe-start command and its data source; every Amendments line
