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
- **Q1 default (awaiting the coordinator): the watched Trial's and Focus's
  nameplate offers "Open Plan" while a draft exists.** Why: nothing else renders
  an Open Plan while `active_change` is served. A Focus has no Plan route, and a
  Trial's Revert to Plan replaces a saved draft on its stage-prior route. → ADR.
- **Q2 default (awaiting the coordinator): Diagnose's return from a watched Focus
  reads "Return to Focus".** Why: the served watched change is the Focus, the
  return lands on the Focus, and today its label names a Trial. It is one of the
  three arrivals #446 names, fixed here under the no-follow-ups rule. → ADR.
- **Stories S166 (Trial, `basal-lower`), S167 (nothing watched, `basal-lower`)
  and S168 (Focus, `c3-focus`), each `lock: HV2-15`.** Why: in-process probes
  showed these stores serve each premise. No store serves both a stageable
  action and a pinnable Pattern, so the Focus-pin landing after Open Plan is
  proved at node level through the desk's `navigate('changes')`. inline.
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

- **Q1 (coordinator).** R446 says a saved draft stays reachable "by pressing Open
  Plan while a watch runs". No Open Plan renders while `active_change` is served,
  except the Trial's Revert to Plan. A: add "Open Plan" to the watched Trial's and
  Focus's nameplate while a draft exists (the default). B: rely on the address
  and Revert to Plan only. Under B a Focus has no route, and Revert replaces the
  draft on its stage-prior route.
- **Q2 (coordinator).** Widen the fence to relabel Diagnose's return from a
  watched Focus as "Return to Focus", in `frontend/diagnose.js` and
  `frontend/diagnose.test.js`, carried by S168 (the default)? Or leave it as it
  is?

## Spawned tasks

None. The operator ruled out follow-up issues for this release.

## Review rounds

(Instrumented per round by the coordinator's `/plan-review` dispatch.)
