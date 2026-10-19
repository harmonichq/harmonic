## 1. Structure and look
- [x] 1.1 Information architecture, glossary and draft lock approved
- [x] 1.2 Three directions on the design canvas; one chosen

## 2. Component inventory
- [x] 2.1 Inventory of 15–20 components with states, served fields and desktop equivalents, approved

## 3. Library
- [x] 3.1 React, TypeScript, Storybook and per-story screenshot capture set up
- [x] 3.2 Components implemented and approved in batches

## 4. Compose
- [x] 4.1 Each screen composed from the library as Storybook screen stories and locked (ADR 481 amendment)

## 5. Build
- [ ] 5.1 Screens assembled from the library against real data (separate ticket)

## 6. Swap (#495)
- [x] 6.1 The app replaces the desk as the only shell; the desk is preserved as v0.1.0
- [x] 6.2 Specifications describe the five tabs, not the desk (ADR 495)
- [ ] 6.3 The operator opens the app on real data before merge
- [x] 6.4 Contract tests and one browser smoke replace the behaviour ledgers (#475, ADR 475)
- [ ] 6.5 The PR's CI finishes within #475's budget, measured on its run
- [x] 6.6 The findings answer serves only what the app reads, and the desk mirror's fixture inputs go (#531, ADR 531)
- [x] 6.7 The desk's last evidence routes, scoped window, row copies and demo set go (#547, ADR 547)
- [x] 6.8 The Overview's Meal size card reads one 90-day window of the engine's own meals (#501, ADR 501)
