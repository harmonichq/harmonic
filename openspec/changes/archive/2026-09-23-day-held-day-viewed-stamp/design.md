# #427 design record

## ADR 427 — The topbar's Day reopens the day last looked at until the page reloads

### Decision

A direct Day entry opens the day the reader last looked at on this page. A
direct entry is the topbar's Day, or any move to Day that carries no context.
The day last looked at is the date a contextual entry carried, or the day last
chosen with Day's own controls: a week column, a month cell, Previous, Next or
Latest. A direct entry drops that earlier entry's subject and return, as
HV2-13 already requires.

That memory lives as long as the page. A reload, or a fresh page opened at the
plain `/day` address, opens the latest recorded day. A remembered date that the
current read does not record still moves to the nearest recorded day, and Day
says so, exactly as it does today.

**Accepted with this decision: the address does not match the view.** A direct
entry writes plain `/day`. Reached through the topbar, that address shows the day
last looked at; reloaded, it shows the latest recorded day. The address carries a
contextual entry's context and nothing else (`frontend/tab-routing.js`
`CONTEXT_KEYS`), and a direct entry has none. This split is what the decision
describes, not a defect to reconcile.

### Authority

Connor Griffin, 2026-09-23, on #427: "we can keep today's behavior, but if
you're saying we just need to document it, that's fine."

### Context

Main already behaves this way. `frontend/day.js` `adopt` takes the date on a
contextual entry and keeps it on a direct one. `settle` falls back to the latest
recorded day only when no day is held yet. The rule came over from the locked
prototype's page memory in #405.

HV2-13, the harmonic-v2 surfaces requirement "The desk carries persistent
chrome…" and story S60 each require only that a direct entry invent no prior
subject and offer no return. None of them says which date a direct entry opens
on, no decision record did, and no test or story pinned it.

The desk's address is the path form that `frontend/tab-routing.js` owns (#389,
rehomed to the root page by ADR 416). v1's hash-route contract (ADR 53) went
with v1, and it does not govern this address.

### Consequences

- Behavior does not change. Three things pin it: a surfaces requirement, a
  Node test through the Day destination's own mount, and story S133, which a
  dated #427 amendment adds to the desk's frozen ledger. S133 reaches Day the
  way the reader did: from a selected occurrence's "Open <date> in Day". It
  exists because UI Craft's revise
  lifecycle turns observed shipped behavior with no story into a story.
- The spec and ledger call it "the day last looked at", never "held".
  CONTEXT.md already uses **held** for a Diagnose register. The code's "held
  date" stays an internal name.
- CONTEXT.md's Day navigator entry is amended. On a fresh page Day lands on the
  most recent day with data; within the page, the topbar's Day reopens the day
  last looked at.
- Not changed here: the Day header's recorded-days count reads only the months
  loaded so far. That is another page-memory consequence, and #425 owns it.

## The viewed stamp is the reader's local clock

This is a defect fix, not a decision record.

`dayState()` in `frontend/day.js` builds `viewedAt` from
`new Date().toISOString()`. That is UTC, and `frame.js` `stamp()` prints it as
local wall time. Reproduced in-process with the Day destination driven through
`installDay`, `startDesk` and `navigate` against stubbed reads, at
2024-06-30T03:30:40Z under `TZ=America/Denver` (21:30:40 on Jun 29 locally):

- With no recorded read, the header read `Day · viewed <b>Jun 30, 2024 · 03:30</b>`.
- With a read stamped `2024-06-29 21:30:12`, the same local minute, it read
  `Day · read <b>Jun 29, 2024 · 21:30</b> · viewed Jun 30, 2024 · 03:30`. The
  fold did not fire.
- Under `TZ=UTC`, with the same clock, the Denver read `2024-06-29 21:30:12`
  rendered `Day · read <b>Jun 29, 2024 · 21:30</b> · viewed Jun 30, 2024 · 03:30`.
  No fold. A read stamped `2024-06-30 03:30:12`, the same UTC minute, rendered
  `Day · read <b>Jun 30, 2024 · 03:30</b>`, folded. Only a read in the viewed
  stamp's own zone and minute folds.

The fix reuses `formatWallClock` from `frontend/carb-log.js`. It is the existing
exported formatter from a `Date` to the stored `YYYY-MM-DD HH:MM:SS` wall-clock
string, built from local getters, and a second formatter in `day.js` would
duplicate it. `stamp()` and the existing same-minute comparison in `dayFrame`
stay as they are. Once both strings are local wall time, that comparison folds a
same-minute read. A spike of exactly this one-import, one-line change passed
both planned tests under runner zones UTC and America/Denver. Without it, the
stamp test failed under both.

**The served read stamp is out of scope.** `last_success_at` is
`datetime.now()` in the server process's zone (`ciq_autotune/fetch_loop.py`).
It shares the reader's zone when the server runs in that zone, as a local
`harmonic serve` does. The shipped Docker image sets no process zone
(`python:3.12-slim-bookworm`), and `TIMEZONE_NAME` sets the record wall clock,
not the process zone, so that deploy stamps the read in UTC. There, after this
fix, the read stamp stays in UTC and the fold does not fire. #427 is frontend
and documentation only, with no served payload change, so that zone is a
follow-up, not this change.

**Why the stamp has a Node test and no replay story.** No replay or browser
context sets a `timezoneId`, so the replay browser runs in the runner's zone,
which is UTC on CI. There the defect is invisible, and a stamp story could not
fail on it. The Node test pins its own zone and clock instead.

## Risk contract

- **Must prevent:** a viewed stamp that names a date or time other than the
  reader's local one when Day rendered; any change to which day a direct Day
  entry opens; any change to a served payload, analyzer, staging predicate, cap
  or floor; real data in a fixture, test or evidence file.
- **Must recover:** none. The stamp is display-only and recomputed on every
  render.
- **Accepted failure:** where the server process runs in a different zone from
  the browser, as in the shipped Docker image (UTC), the read stamp stays in
  the server's zone and a same-minute read does not fold. The header shows
  both stamps. A follow-up owns the served stamp's zone.
- **Unsupported:** a browser whose zone differs from the pump's `TIMEZONE_NAME`.
  The viewed stamp is the browser's clock, while the day's records are the
  pump's wall clock.
- **Evidence owed:** the held-day Node test through the Day destination's
  mount, shown non-vacuous by a deliberately broken variant. The viewed-stamp
  Node test under a pinned non-UTC zone and a fixed clock, failing first on the
  unfixed code. The same-minute fold assertion. S133 and S60 replayed at
  1280×720 and 1440×900. Before and after Day header renders.

Why: the change is a display defect and a record of existing behavior. Its
worst outcome is a misleading clock, never a dose. Disposition: copied into the
#427 execution lock by reference to this pinned change.

## UI Craft revise record

- **Route:** `revise`. The router reported "safe manufactured data source
  declared" for a shipped, runnable surface with a complete declaration.
- **Safe start:** `AGENTS.md`, "The data boundary", the QA copy-then-serve
  command, which ends
  `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`
  after copying `mockups/qa-e2e.synthetic/harmonic.sqlite` to a scratch path.
- **Data source:** the showcase store, generated by `scripts/gen_qa_e2e_db.py`.
  It records 35 days from 2024-05-20 to 2024-06-30 and has no fetch-status row,
  so the desk shows the viewed stamp. Replay stories take per-story case
  stores from the same generator (`frontend/replay-cases.mjs`); S60–S62 and
  S133 use `showcase`.
- **Contract:** the frozen ledger `mockups/harmonic-v2-desktop.behavior.md`
  and replay `frontend/desk-behavior.replay.mjs` at base
  `a4d374a72c8048d9d93ee4925805b91cf5674835`. Per the release brief, it is not
  re-swept. No story is amended or retired. S133 is added, and no existing
  story asserts either stamp.
- **Sanction:** Connor Griffin, 2026-09-23, answered "Q2 A" to: "Can your
  reply here count as sign-off for the UI copy and tone changes? … Yes. I record
  your answer as the approval for every change these 13 checklists call for, and
  write the wording in CONTEXT.md terms."
- **Evidence owed:** replay output for S60 and S133 at both sizes, then the
  complete ledger once per size on the pushed commit. Before and after renders
  of the Day header (the kicker and the Episode Log meta) at 1280×720 and
  1440×900, from base and revision. Take them in a non-UTC browser zone;
  under UTC, base and revision render the same stamp. The app ships one dark
  theme, so there is one theme to render.
