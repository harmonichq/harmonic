## 0. Before

- [ ] 0.1 Per ui-craft `revise`, render the before shots from this branch's base: Storybook `Screens/Overview` DefaultPhone, DefaultDesktop, ScrolledPhone, ScrolledDesktop, EstimatesDesktop

## 1. The screen and the client

- [ ] 1.1 `frontend/data.js`: `fetchInsulin(days)` beside `fetchMealSize`, exported with the client
- [ ] 1.2 `frontend/ui/app/live.js`: the insulin read per window (ADR 634), seeded in `empty()`, in `overviewWindow`, and `insulin <window>` in the Overview's keys
- [ ] 1.3 `frontend/ui/screens/Overview/OverviewScreen.tsx` and `.css`: the two cards below Meal size (ADR 634): desktop one row of two, sized to its own content, the basal and Meal size rows keeping their one height; phone stacked after Meal size
- [ ] 1.4 Header comments in the screen and the live adapter updated in their idiom

## 2. The lock document and the words

- [ ] 2.1 `docs/design/recommendations-redesign.md`: §1.1's and §1.3's Overview rows name the cards and their states (populated, No data, skeleton); §1.5 gains Bolus, Override, Food, Manual, Standard, Extended, Quick in the 2026-10-25 amendment's wording; a dated §2.5 amendment "2026-10-26 — the insulin cards on the Overview (#634)" recording ADR 634's row decision with the delegation quoted; §4.2 entries 29 and 30's placement as built. No earlier amendment and no locked header line edited
- [ ] 2.2 `scripts/gen_ui_fixtures.py`: `OVERVIEW_LABELS` drops the seven words §1.5 now holds; regenerate `frontend/ui/__fixtures__/ui-fixtures.json` and `ui-allowlist.json`; `--check` green

## 3. The roster's description

- [ ] 3.1 `ciq_autotune/api.py` `warm_roster` docstring and `AGENTS.md`'s roster and fixed-result paragraphs name the insulin read beside Meal size (ADR 634); no roster change

## 4. Tests

- [ ] 4.1 `Screens/Overview` stories: the cards on both layouts in Default, Window 30, Window 90, Scrolled and No data; EstimatesDesktop's play still asserts the basal and Meal size rows one height, and a new play asserts the insulin row's two cards one height with each other and the row no taller than its taller card's content; the phone play asserts the order Meal size, Insulin summary, Bolus review
- [ ] 4.2 `frontend/ui/app/live.contract.test.mjs`: the showcase's insulin cards at 14 and 90 days, each printed figure as a literal read once from the served answer (the method rows at 0.0 U on the showcase)
- [ ] 4.3 `npm run test:ui` for `Screens/Overview` (`UI_STORY=screens-overview`), the contract test on the showcase through `smoke_app.py --then`, and the browser smoke

## 5. After

- [ ] 5.1 After shots of the same stories as 0.1, and the cards on the served app at 1440×900 and 390×844 through the QA copy-then-serve (`--no-fetch`, `--token ''`), attached to the pull request with the before shots
