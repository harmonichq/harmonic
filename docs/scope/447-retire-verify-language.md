# #447 scope ledger — Verify leaves the live language; one Trial day count

Triage worker ledger for #447 (change `retire-verify-language`), grounded on
`origin/main` b03431d2 against synthetic QA case stores only. The in-process
reproduction is `docs/scope/447-day-count.repro.py`, and its browser half is
`docs/scope/447-day-count.repro.mjs`. `/scope` ran in delegated mode and found
nothing genuinely uncertain: R447 settles both parts, and every open point below
carries the default this triage assumed.

## Decisions

- **R447 (coordinator ruling under the Q3 delegation, 2026-09-23).** Verify is
  retired from CONTEXT.md, the surfaces spec and the test comment, re-pointed at
  Changes' Trial and Focus progress (ADR 397). The dock and Changes print the
  same day count for a Trial: the count the served readiness rule reads. A clamp
  may shape a progress bar, never a printed number. Why: settled by the
  coordinator; not re-litigated. → ADR (both ADR 447 sections in
  `openspec/changes/retire-verify-language/design.md`).
- **Coordinator instruction: sweep the whole repo, outside archived changes,
  frozen ledger blocks and `docs/scope/`, for live-surface Verify wording, and
  put every hit in scope.** Why: #429 left the residue to this issue, and a
  sampled sweep leaks one document per review round. → ADR (the closed
  105-line inventory).
- **The printed count is the served `days_elapsed`, and the form follows the
  served verdict in Changes' locked words.** Why: one backend builder
  (`_retained_trial` → `_maturing`) serves one count to both reads, and Changes'
  words are locked verbatim strings. → ADR.
- **One exported printer in `follow-up.js` serves the dock and Changes.** Why:
  two implementations of one fact is how they diverged, and there are two real
  callers. → ADR.
- **Residue classes: negative assertion, retirement pointer, identifier, dated
  or frozen record (including unarchived changes), locked prototype, generated
  copy, generic verb.** Why: ADR 397's own residue classes, extended with this
  ticket's grounding. → ADR.
- **The Guide article is edited, and its locked preface is not.** Why: the
  preface is a locked verbatim string, and the article is served text. → ADR.
- **Coordinator rulings on #447 under the Q3 delegation (2026-09-23):**
  - Q1: the dock's ready line is "Ready to judge — ‹N› days since ‹MM-DD› ·
    ‹R› required".
  - Q2: R447's count is the watch-maturity count, and the comparison period's own
    length is a different fact.
  - Q3: unarchived OpenSpec changes are dated records and stay untouched.
  - Q4: delete from the desk glossary every term no desk surface can render.
    CONTEXT.md keeps a term only where the backend still serves the concept, and
    says there that the desk does not show it.
  - F1–F5: every finding is fixed in this change; "not fixed" is not an
    available outcome.

  → ADR (the five ADR 447 sections).
- **Q4 applied.** The desk glossary holds none of the three terms, so nothing is
  deleted from it. CONTEXT.md deletes Digest. It keeps Localized outcome,
  Confound triage, Tracked candidate and Candidate sweep, which
  `/api/pattern-sweep` still serves. → ADR.
- **F2 applied.** The route serves only `watched_change` through one function
  `summarize_trend` also uses. The CLI's `outcomes-trend` is the series'
  production caller, so no producer is deleted. The route loses its window
  parameter and changes its persisted shape marker. → ADR.
- **F1 applied.** `detect_trial` and `_profile_switch_diff` are deleted with the
  five test classes (31 tests) that exist only to test them. The enforced fact is
  that no production module imports or calls either. → ADR.
- **F3–F5 applied.**
  - The v1 Plan requirement is REMOVED and replaced by "Changes' Plan asks…".
  - The QA consumer requirement is MODIFIED to today's tree, keeping its four
    scenario headers, because the validator refuses a MODIFIED block that drops
    them.
  - ACCEPTANCE.md's table drops the nine legs #416 deleted and invents no
    number.

  → ADR.
- **Surface lifecycle `revise`.** The `ui-craft` route is shipped, runnable, with
  a complete declaration and manufactured data. The frozen desk ledger and replay
  are the contract, and no sweep is re-run. S169 and S170 are added in a dated
  `#447 amendment`. inline.
- **Shape chunked: three serial sub-orders (backend contract → shipped surfaces
  → language and records). Review depth Full for the whole diff (sub-order 1 is
  Full).** Why: see the lock. inline.

### Risk contract

- **Must prevent:** the dock and Changes printing different day counts for one
  served Trial. Any printed "‹N› of ‹R›" with ‹N› > ‹R›. A frontend rule that
  re-derives readiness, maturity or the count instead of reading the served
  facts. Any change to a served payload, `_maturing`, the readiness rule, a
  staging predicate, cap or floor. A served `watched_change` that differs from
  the base's for the same store, a persisted full-trend payload served under
  the new route shape, or any change to the CLI trend's output. Real glucose,
  insulin or schedule values in any committed test, fixture, capture or comment. Plus the defaults: secret
  exposure, irreversible loss of authoritative data, and silent incorrect
  success.
- **Must recover:** nothing automatic; both printers are stateless renders of
  served payloads.
- **Accepted failure:** none new.
- **Unsupported:** viewports other than 1280×720 and 1440×900; real-data stores.
- **Evidence owed:** node tests over one served Trial showing both printers print
  the same count and requirement in the maturing, just-ready (14 of 14) and
  15-date states. The backend test gains the served `state` assertion. S169 at
  both sizes fails at its dock-count assertion on the base with the branch's
  harness laid over it, and passes on the branch. S46, S139 and S140 still pass
  on the branch at both sizes. Base and branch renders of the dock on `c3-trial`
  at both sizes show the ready line wrapped inside the dock's reserve and never
  ellipsized (term 49).
- Why: watch maturity is lifecycle metadata, not dosing guidance. The harm is a
  reader told two different things about one change. Disposition: admitted into
  `openspec/changes/retire-verify-language/design.md` unchanged.

## Open questions

None. The coordinator answered Q1–Q4 on the defaults this triage proposed, with
Q4 turned into a deletion rule, and moved F1–F5 into scope. All of it is
recorded under Decisions.

## Findings

All five are fixed in this change (F1–F5 above). No issue is filed.

## Spawned tasks

None. No issue is filed from triage.

## Review rounds

Instrumentation for `/plan-review` rounds, dispatched by the coordinator: the
blockers found per round, each tagged `authoring` or `injected`.
