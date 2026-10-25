## 1. The structure (no pixels)

- [x] 1.1 `docs/design/recommendations-redesign.md`: a dated §2.5 amendment "2026-10-25 — Insulin summary and Bolus review for the Overview (#631, #633)" recording the request, the dropped site changes (Connor's words as relayed), the two cards, the states, the five defaults (ADR 633: Food, precision, placement, U, Average daily insulin) marked as defaults pending the replay, the admission of Food, Override, Manual, Standard, Extended, Quick and Bolus to the two library cards ahead of their §1.5 rows (ADR 633), and the §1.5 rows #634 adds with the cards on the Overview; §4.2 entries 29 InsulinSummaryCard and 30 BolusReviewCard, each with its states, served fields under `/api/explore/insulin?days=N`, desktop and phone placement, "Nothing to act on". §1.1, §1.3 and §1.5 are not edited here
- [x] 1.2 Quote only words Connor wrote on #631–#633 or the pull request, or that the coordinating session relays as his verbatim words

## 2. The fixtures

- [x] 2.0 `scripts/ui_patient.py`: `materialize(..., boluses: bool = True)`; with False no bolus row is ingested; every existing store byte-identical (the `--check` proves it)
- [x] 2.1 `scripts/gen_ui_fixtures.py`: the `wearer-no-bolus` store (ADR 633) under `overview` with its insulin answer; `_require_insulin` extended; the cards' label words in the generator's Overview label list
- [x] 2.2 Regenerate `frontend/ui/__fixtures__/ui-fixtures.json` and `ui-allowlist.json`; `uv run python scripts/gen_ui_fixtures.py --check` green; every existing `_require_*` guard green

## 3. The components

- [ ] 3.1 `frontend/ui/overview-model.ts`: `insulinSummary` and `bolusReview` (ADR 633), every printed number `Sourced`
- [ ] 3.2 `frontend/ui/components/InsulinSummaryCard/` (tsx, css, stories) and `frontend/ui/components/BolusReviewCard/` (tsx, css, stories), in the library's idiom (MealSizeCard, BasalCard), tokens only from `frontend/ui/tokens.css`
- [ ] 3.3 Stories, each with a play, at 390 and at half the Overview's 1120 desktop row: Populated (wearer, 30 d), No boluses (wearer-no-bolus, 30 d), No data (wearer-unsynced), Loading; plays assert each printed number's source and that no share is printed where the engine served none
- [ ] 3.4 `npm run test:ui` clean for every new story (`UI_STORY=insulinsummarycard`, `UI_STORY=bolusreviewcard` while iterating)
- [ ] 3.5 The ui-craft cold critique: a fresh read-only reviewer given only the lock doc (with this change's amendment) and the rendered stories, reporting violations of the lock, the design-rules bans and a persona walk; its confirmed findings fixed and the prechecks re-run before 4.1

## 4. The replay

- [ ] 4.1 Render every story at both frames and attach the renders to the pull request, which names the five triage defaults and asks Connor to replay and say "locked"
- [ ] 4.2 After "locked" (in revise): the header's locked line quoting him, and any default he changed, applied and re-rendered
