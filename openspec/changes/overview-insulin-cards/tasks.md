## 0. Before

- [x] 0.1 Per ui-craft `revise`, render the before shots from this branch's base: Storybook `Screens/Overview` DefaultPhone, DefaultDesktop, ScrolledPhone, ScrolledDesktop, EstimatesDesktop, and `Screens/Settings` GlossaryPhone, GlossaryDesktop; and the served Overview at 1440×900 and 390×844 through the QA copy-then-serve (`--no-fetch`, `--token ''`) run from a base worktree on the same synthetic copy and port

## 1. The screen and the client

- [x] 1.1 `frontend/data.js`: `fetchInsulin(days)` beside `fetchMealSize`, exported with the client
- [x] 1.2 `frontend/ui/app/live.js`: the insulin read per window (ADR 634), seeded in `empty()`, in `overviewWindow`, and `insulin <window>` in the Overview's keys; `frontend/ui/app/live.test.js`: the fake client gains `fetchInsulin`, and count assertions mirror Meal size's (one insulin read per window, read again by a write and by Retry)
- [x] 1.3 `frontend/ui/screens/Overview/OverviewScreen.tsx` and `.css`: the two cards below Meal size (ADR 634): desktop one row of two, sized to its own content, the basal and Meal size rows keeping their one height; phone stacked after Meal size
- [x] 1.4 Header comments in the screen and the live adapter updated in their idiom

## 2. The lock document and the words

- [ ] 2.1 `docs/design/recommendations-redesign.md`: §1.1's and §1.3's Overview rows name the cards and their states (populated, No data, skeleton); §1.5 gains Bolus, Override, Food, Manual, Standard, Extended, Quick in the 2026-10-25 amendment's wording; a dated §2.5 amendment "2026-10-26 — the insulin cards on the Overview (#634)" recording ADR 634's row decision with the delegation quoted, and restating the Overview's must-survive list, superseding #564's: the 14 / 30 / 90 d switch moves the basal estimate, Meal size and the insulin cards together (`Screens/Overview` choose 30); the basal estimate's and Meal size's rows one height, none half empty, on desktop (Estimates Desktop); the insulin row's two cards one height with each other, the row as tall as its taller card's content (Estimates Desktop); the phone's one column in proportion, Meal size then Insulin summary then Bolus review (Estimates Phone); the basal estimate's and Meal size's states and the insulin cards' No data and skeleton (`BasalCard`, `MealSizeCard`, `InsulinSummaryCard`, `BolusReviewCard`, `Screens/Overview` No data); the Overview as one scrolling page, the summary its first screenful (Scrolled); and the #564 list's Queue and Changes lines as they stand; §4.2 entries 29 and 30's placement as built. No earlier amendment and no locked header line edited
- [x] 2.2 `scripts/gen_ui_fixtures.py`: `OVERVIEW_LABELS` drops the seven words §1.5 now holds; regenerate `frontend/ui/__fixtures__/ui-fixtures.json` and `ui-allowlist.json`; `--check` green

## 3. The roster's description

- [x] 3.1 `ciq_autotune/api.py` `warm_roster` docstring and its leading comment on the Overview's lighter reads, and `AGENTS.md`'s roster and fixed-result paragraphs, name the insulin read beside Meal size (ADR 634); no roster change

## 4. Tests

- [x] 4.1 `Screens/Overview` stories: the cards on both layouts in Default, Window 30, Window 90, Scrolled and No data; the `choose30` play also asserts `[data-source^="overview.wearer.insulin.30."]` present and `.14.` absent after the click; the `scrolled` play's last card is Bolus review; the `noData` play expects the insulin cards' two "No data" beside the others; EstimatesDesktop's play still asserts the basal and Meal size rows one height, and also the insulin row's two cards one height with each other and the row no taller than its taller card's content; EstimatesPhone's play asserts the order Meal size, Insulin summary, Bolus review
- [ ] 4.2 `frontend/ui/app/live.contract.test.mjs`: the showcase's insulin cards at 14 and 90 days, each printed figure as a literal read once from the served answer (the method rows at 0.0 U on the showcase)
- [ ] 4.3 `npm run test:ui` for `Screens/Overview` (`UI_STORY=screens-overview`), the contract test on the showcase through `smoke_app.py --then`, and the browser smoke

## 5. After

- [ ] 5.1 After shots of the same stories and served views as 0.1, attached to the pull request beside the before shots, with each must-survive line of task 2.1 mapped to the render or play that shows it
