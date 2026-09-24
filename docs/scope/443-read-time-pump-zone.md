# #443 — The served read time is stamped in the container's zone, not the pump's

Scope ledger. Opened 2026-09-23 by delegated triage (release brief for #442–#455
and #457). Route: interview mode, answered by the release coordinator under
Connor Griffin's Q3 delegation. R443 settled the direction. The coordinator's
rulings on the triage questions (2026-09-23) widened the scope. Every decision
below is recorded in `openspec/changes/read-time-pump-zone/design.md`, ADR 443.

## Decisions

- Classification: code. Why: reproduced backend defects, with served values and
  durable records. `inline`
- One clock, `store.wall_clock_now()`, writes every server stamp that is printed
  beside, or compared with, a record time or another server stamp. It also writes
  the two stamps that are neither (credentials, sweep), so one clock writes every
  stamp. Why: the coordinator's ruling rejected the narrow default. Fixing only
  the fetch status would make Day's read disagree with the pump-settings read of
  the same fetch, and this release files no follow-ups. `→ ADR` (Decision 1)
- Data-time anchors (the latest record instant, read from the clock only on a
  store without one) are not stamps and stay. Why: they are not written, and they
  have no record to disagree with. `→ ADR` (Decision 1)
- An unset `TIMEZONE_NAME` reads the process clock. Why: a local serve, the
  no-fetch replay serve and the CLI reach it, and each path already runs on the
  process clock. `→ ADR` (Decision 2)
- The three writes into ordered histories floor their stamp one second after the
  latest capture, Plan or Focus pin: the pump-read capture, the follow-up
  mutation and the reconcile. The floor has no bound. Why: the coordinator ruled
  that the transition is settled by evidence. Base reproduces three durable wrong
  states after a 7 h backward step: an inverted Trial, a new Plan served
  superseded, and a Focus ending before its pin. A spike of the floor clears all
  three, and removing the floor brings them back. `→ ADR` (Decision 3)
- The fetch window ends on the pump's day, in both the scheduled fetch and
  `harmonic fetch --days`. Why: the coordinator's Q2 ruling; the CLI shares the
  fault. `→ ADR` (Decision 4)
- Day reads `last_success_at` alone. Why: the coordinator's Q3 ruling;
  `record_fetch_result` advances both fields in one statement. `→ ADR`
  (Decision 5)
- The six clock patches in tests and the case-cache check re-point to the bound
  `wall_clock_now`. Why: a patched `datetime` no longer reaches a stamp. `→ ADR`
  (Decision 6)
- Surface lifecycle `none`, no new replay story, no browser test. Why: no rendered
  behavior changes. Replay and browser serves run without `TIMEZONE_NAME`, on the
  process clock. S160–S161 stay unused. S42, S105, S145 and S146 (synthetic pump
  reads) are named as port-bound regression stories. `inline`
- Flat order, Full review. Why: the coordinator stamped the stakes load-bearing.
  One trait fires (port-bound legs the coordinator runs after the build), and the
  build is testable alone. No reviewer-memory slicing anchor matched. `inline`
- Moved artifacts: only the design exploration's `focus.json` and `journey.json`,
  whose `code_version` hashes and derived ids move. Every committed fixture and
  the QA catalog stayed current against the spike. `inline`

### Risk contract

- **Must prevent:**
  - a durable record written out of order across a clock step: a Trial with its
    direction inverted, a Plan that sorts behind an older one, an ending before
    its own start;
  - any server stamp named in Decision 1 written on a clock other than
    `TIMEZONE_NAME`'s when that variable is set;
  - a fetch attempt that raises out of the loop or goes unrecorded;
  - a window that stops before the pump's current day;
  - any change to an analyzer, classifier, staging predicate, cap or floor;
  - real data in a test, fixture or log.
- **Must recover:** none. The next write replaces a single-row stamp, and the
  seam converges on its own.
- **Accepted failure:**
  - rows stored before the upgrade keep their zone;
  - for up to |offset| hours after a west-of-UTC container upgrades, ordered
    stamps run ahead of the pump's clock (Consequences), which delays a verdict
    but writes nothing out of order;
  - a stamp stored ahead of the clock by any amount holds later ordered stamps
    just after it until the clock passes it.
- **Unsupported:** a browser in a zone other than `TIMEZONE_NAME` (as #427
  records); a `TIMEZONE_NAME` changed between writes for any reason other than
  this upgrade.
- **Evidence owed:**
  - tests through public paths, with the process zone and `TIMEZONE_NAME` pinned
    apart, for each stamp family in the spec deltas, each seen failing on the
    unfixed code;
  - the three transition tests (pump read, Plan, Focus) through the capture,
    reconcile and API paths, each seen failing with the floor removed;
  - the unset-zone tests (fetch loop and API) with a broken variant;
  - the fetch-window tests in both zone orders, and for the CLI.

Why: the widened stamps feed durable change records and Plan admission on
advisory dosing guidance. Disposition: copied unchanged into
`openspec/changes/read-time-pump-zone/design.md`.

## Open questions

None open. The coordinator settled Q1 (widen), Q2 (fix the window end here) and
Q3 (remove the `day.js` fallback) on 2026-09-23.

## Spawned tasks

None. No follow-up issue is filed by this release.

## Review rounds

- Coordinator ruling round, 2026-09-23. The default was rejected, the scope
  widened, and the change re-authored. Blockers: none from review yet; the
  mandatory plan review follows this re-pin.
