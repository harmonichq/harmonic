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
- **The qa-e2e-database migration requirement stays a record.** Why: its Verify
  word names a deleted test harness inside a completed #319 migration contract
  that #416 left stale in other ways too. Rewriting it is QA-database contract
  work. → reported to the coordinator (finding F4).
- **Surface lifecycle `revise`** (`ui-craft` route: shipped, runnable, complete
  declaration, manufactured data). The frozen desk ledger and replay are the
  contract, and no sweep is re-run. S169 and S170 are added in a dated `#447
  amendment`. inline.
- **Shape flat; review depth targeted.** Why: see the lock. inline.

### Risk contract

- **Must prevent:** the dock and Changes printing different day counts for one
  served Trial. Any printed "‹N› of ‹R›" with ‹N› > ‹R›. A frontend rule that
  re-derives readiness, maturity or the count instead of reading the served
  facts. Any change to a served payload, `_maturing`, the readiness rule, a
  staging predicate, cap or floor. Real glucose, insulin or schedule values in
  any committed test, fixture, capture or comment. Plus the defaults: secret
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

Each carries the default this triage assumed. The coordinator decides; none goes
to the operator.

1. **The dock's ready-state words.** Default: "Ready to judge — ‹N› days since
   ‹MM-DD› · ‹R› required", emphasising ‹N›, which uses Changes' own ready-state
   words. The alternative is "Ready to judge — ‹N› days since ‹MM-DD›", which
   drops the requirement the lead already implies. It is one string in tasks
   1.1, 1.2 and 3.2 and S169.
2. **How far R447's count reaches.** Default: the watch-maturity count behind
   "Maturing" / "Ready to judge". Changes' evidence-readiness arms print each
   comparison period's own elapsed days (about 18 on `c3-trial`, bounded by the
   data tail). That is a separate HV2-24 fact under its own label, and it stays
   as it is.
3. **Unarchived OpenSpec changes (35 files with the word).** Default: dated
   records, left alone. That includes the `harmonic-v2` durable-follow-up delta's
   "Verify roster", which names the `/api/verify/trials` resource.
4. **Digest, Localized outcome and Tracked candidate in CONTEXT.md.** Default:
   keep the definitions, drop the Verify placement, and say that no desk surface
   renders them since #416, following the #500 precedent. The alternative is to
   delete the three entries.

## Findings for the coordinator (not fixed here; no issue filed)

- **F1.** `ciq_autotune/watched_change.detect_trial` has no production caller.
  The graph shows 31 callers, all in `tests/test_watched_change.py`. Its line-507
  comment is re-pointed by this change regardless.
- **F2.** `/api/outcomes/trend` serves `metrics`, `behaviors` and
  `overnight_lows` (including `cleared`), and no desk surface reads them. The
  desk reads only `watched_change` (`frontend/diagnose.js:183`).
- **F3.** The surfaces requirement "Plan surface asks 'what will I program into
  my pump?'" still describes the v1 Plan surface. It is not Verify wording, so it
  is outside R447 as written.
- **F4.** The qa-e2e-database requirement "Remaining consumers migrate before
  revise-E2E retires" describes a CI `server: true` row and a
  `$RUNNER_TEMP/harmonic-qa.sqlite` copy step that no longer exist. It also names
  three replays #416 deleted.
- **F5.** ACCEPTANCE.md's browser-leg timing table still lists legs #416
  deleted: Cockpit shell, the Diagnose workstation, event-comparison and
  support-audit legs, and the Verify behaviour ledger.

## Spawned tasks

None. No issue is filed from triage.

## Review rounds

Instrumentation for `/plan-review` rounds, dispatched by the coordinator: the
blockers found per round, each tagged `authoring` or `injected`.
