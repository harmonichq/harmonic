# #446 scope ledger — the watched change leads every plain arrival to Changes

Triage worker ledger for #446 (change `changes-arrival-leads-active`). Grounded
on `origin/main` b03431d2 against synthetic QA case stores only. The node
reproduction is `docs/scope/446-changes-arrival.repro.mjs`.

## Decisions

- **R446 (coordinator ruling under the Q3 delegation, Connor Griffin,
  2026-09-23): the served active change leads every plain arrival to Changes
  (HV2-15). Open Plan is a choice within one visit, cleared on each plain arrival
  in one place. A saved draft stays reachable by pressing Open Plan while a
  watch runs. Its apply stays refused by the server, and no frontend gate is
  added.** Why: settled for the release, not re-litigated. → ADR (ADR 446 in
  `openspec/changes/changes-arrival-leads-active/design.md`).
- **Clear on every arrival, keyed on the router's `navigation` value, and delete
  #429's `watchArrival` exception.** Why: the router hands every arrival a new
  value and a re-render keeps it. After the clear, the dock exception cannot
  differ from the general rule: the concern frame that carries Open Plan never
  renders while `active_change` is served. → ADR.
- **Stage in the Plan's own idle frame re-renders in place.** Why: its focus
  target is the Plan's Save draft, and after the clear a plain arrival never
  reaches the Plan. This is the one consumer whose landing depended on the
  remembered state. → ADR.
- **Q1 A (coordinator ruling, Q3 delegation, 2026-09-23): while a watch runs and
  a Plan draft exists, the watched Trial's and Focus's nameplate offers "Open
  Plan", which opens the Plan for that visit; no draft, no control.** Its apply
  stays refused by the server, with no frontend gate. Why: nothing else renders
  an Open Plan while `active_change` is served. A Focus has no Plan route, and a
  Trial's Revert to Plan replaces a saved draft on its stage-prior route. The
  Trial carries both because they are different actions. → ADR.
- **Q2 widened (coordinator ruling, 2026-09-23): Diagnose opened from a watched
  Focus reads "Return to Focus", in `frontend/diagnose.js` and
  `frontend/diagnose.test.js`, carried by S168.** Why: the served watched change
  is the Focus, the return lands on the Focus, and its label named a Trial. → ADR.
- **Plan's own Stage in this change (coordinator acceptance, 2026-09-23).**
  inline.
- **Stories: S166 and S167 on `basal-lower` (Trial), S168 on `c3-focus`
  (Focus), each `lock: HV2-15`.** S166 is the one-visit journey before and after
  a Trial begins. S167 is the Trial's nameplate Open Plan and the server's
  refusal. S168 is "Return to Focus" (checked first) and the Focus's Open Plan.
  Why: the committed probes (`docs/scope/446-*.probe.py`, literal output in ADR
  446's generated facts) show each store serves its story's premises. The
  Focus-pin landing is `loadGuidance({ force: true }); navigate('changes')`, the
  same no-context arrival S166 drives from the topbar, so it stays proved at
  node level. inline.
- **Plan-review round 1 rulings (coordinator, 2026-09-23).** The premise probes
  and ledger counts are committed with literal output. The fail-first clause
  names only the tests tasks.md marks fail-first. S167 and S168 reload after
  each pump capture and Plan write before asserting the nameplate. S168 checks
  the return label first, and base renders 1 and 2 are driven directly. inline.
- **Flat order, Targeted review.** Why: the only slicing trait that fires for
  the worker is multiple deliverables (code, ledger and replay, spec). The
  release already gives the live browser run to the coordinator. A nearby
  reviewer-memory anchor disagreed; reconciled in the order. inline.

### Risk contract

- **Must prevent:** Changes showing a Plan in the watched change's seat on a
  plain arrival while the server serves an active change. A frontend rule that
  decides which change is active, or whether recording is allowed, instead of
  reading the served disposition and the server's answer. A control that promises
  the Plan and lands elsewhere. And the defaults of secret exposure, irreversible
  loss of authoritative data and silent incorrect success.
- **Must recover:** nothing automatic. The state is per visit. A reload starts
  clean.
- **Accepted failure:** a staged change that was never saved lives only in this
  page's memory, as it does today. After a reload it is gone, and nothing warns
  about that.
- **Unsupported:** real-data stores, and any viewport other than 1280×720 and
  1440×900.
- **Evidence owed:** each scenario in the change's requirements, through public
  interfaces. At node level: Changes' `mount`, the desk's `navigate('changes')`,
  Diagnose's return label, and Plan's own Stage. In the browser: S166–S168 at
  both sizes, each failing first on the base. S45, S45b, S56, S57, S139 and S140
  still pass.

Why: advisory-free routing and one control, so the stakes are a reader misled
about which change they are looking at, not a dose.
Disposition: inline (copied unchanged into ADR 446).

## Open questions

None. Q1 and Q2 were settled by the coordinator's rulings, recorded under
Decisions.

## Spawned tasks

None. The operator ruled out follow-up issues for this release.

## Review rounds

- **Round 1 (lock pinned at a36cc438): blocked, 3 blockers and 1 note, all
  `authoring`, none `injected`.**
  1. The premise evidence lived only in session scratch. The probes are now
     committed with literal output, and the partial-survey premise is replaced.
  2. The Expectation's fail-first clause was broader than the tests that can
     fail first.
  3. S167 and S168 asserted after server-side writes without reloading.
  4. (Note) S168's check order hid the base crumb render, and the base renders
     1 and 2 had no driver stated.
  All four are fixed in one commit.
