# Tasks — eating-sequence evidence plumbing

## 1. Data contract

- [ ] 1. Add `fetchEatingSequences()` in `frontend/data.js`, beside
  `fetchExploreTimeOfDay` in `makeDeps`, its return namespace, and default exports.
  It calls `/api/diagnose/eating-sequences` with no query parameter.
- [ ] 2. Extend `frontend/diagnose-data-age.test.js`: pin that
  `recordDiagnoseAge(ages, shape, payload)` returns a payload with no
  `input_data_age` unchanged and deletes only `ages[shape]`; invent no age.
- [ ] 3. Add an injected-fetch Node test that proves the helper requests exactly
  `/api/diagnose/eating-sequences`.

## 2. Vue-free adapter

- [ ] 4. Add `frontend/diagnose-eating-sequences.js`, Vue-free and DOM-free.
  Field-for-field, with no arithmetic or reclassification, it provides:
  - per-scope Q1–Q5 series over `in_sequence`, `post_4h`, and `post_6h`, with
    median TIR default and served mean/SD alternatives; every point has `n`/status;
  - paired Q5 and Q1–Q4 points per interval and pooled/evening scope from
    `high_carb_sequence.comparisons` plus scope rows, with served `n`/status;
  - a selected-period quintile matrix with `1`, `2`, and `3+` series, attaching
    served comparison status/differences to `3+` cells; and
  - detector `status`, `finding`, and `exclusions` passed through verbatim.
  Insufficient cells remain `null` plus status, never omitted or zero-filled.
- [ ] 5. Add `frontend/diagnose-eating-sequences.test.js` over the frozen report:
  assert row counts 5 / 5 / 6 / 15 / 15, insufficiency, and no invented number.
  Construct an all-insufficient skeleton from fixture definitions and documented
  shape in a test helper; add no ungenerated fixture.

## 3. Browser and harness boundaries

- [ ] 6. Answer `/api/diagnose/eating-sequences` with the frozen fixture in
  cockpit shell `routeApp` and the workstation app-load stub table, the only suites
  here that load Diagnose inputs. Do not alter canvas composition: it injects data
  through `openApp` and does not load shell inputs.
- [ ] 7. Declare no new harness path or story; no story requests this report.
  Keep `frontend/harness-api-paths.test.js` green. #278 adds both with rendering.
- [ ] 8. Do not hand-edit the generated workstation payload. #278 extends
  `.claude/qa/gen_synthetic_fixtures.py` and regenerates it if its story needs this
  response.

## 4. Specification and verification

- [ ] 9. Add the surfaces delta. Leave `CONTEXT.md` unchanged: its Explore entry
  describes a retired mode and should not rename this independent section.
- [ ] 10. Run the six-line fast gate exactly from `AGENTS.md`. CI runs browser legs.
