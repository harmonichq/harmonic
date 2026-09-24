# Desk browser helpers wait for the control they act on (#457)

## Why

The desk browser suite failed on `main` after the #422–#434 release merged,
while the same tree passed it twice on the pull request and twice locally. The
first attempt of push run 35959034199 recorded `tests 43`, `pass 42`, `fail 1`:
test 25, "a key pressed on Day leaves the parked Diagnose as it was, and the Day
return keeps it with no guidance re-read", failed at its first press with
`no control matched [data-day="return"]` after 258 ms.

The suite opens the desk once `.gf .pane` exists, and Day's loading frame
satisfies that before Day's reads land. The suite's `press` helper then counts
the matching controls once and fails at once when none exists yet. The product
is not at fault: Day paints its Return control in the same frame as its stage,
once its reads land.

The same decide-from-one-snapshot shape sits in the replay's rail row resolver
and in the desk suite's two copies of it. Their callers in the desk suite reach
them straight after a window click, while the rail can still read "Loading
findings…". Today the shipped fixtures hide it, because the only ranked Pattern
there opens its fold on arrival. Four desk tests also count Day's controls
straight after arriving at a Day address, before Day has painted.

A port-free reproduction on b03431d2 (`docs/scope/457-press-wait.repro.mjs`)
shows both helpers failing against a page that paints 50 ms late.

## What changes

- The desk suite's `press` waits, within a bound (30 s by default), for its
  first visible match, presses it, and keeps its short settle afterwards. A
  control that never renders, or that stays hidden, still fails after the
  bound, and the failure names the selector and the bound.
- The replay's rail row resolver waits, within the same bound, for a settled,
  painted Findings rail before it decides whether the row is a plain rail row
  or a cause folded under its Pattern. The desk suite resolves rail rows only
  through it; its own two copies go.
- The four desk tests that read Day straight after arriving at a Day address
  wait for Day's stage first, as the suite's month-paging test already does.
- One new browser test holds Day's read, presses Return while Day is still
  loading, and proves the press lands once the read is released. It also proves
  that an absent and a hidden control still fail, naming their selectors.
  Another new dependency-free test proves the resolver waits for the settled
  rail before reading it.

## Risk contract

- **Must prevent:** a press or row resolution that reports success without
  acting on the intended visible control; an absent or hidden control that
  stops failing, or fails without naming its selector; any change to shipped
  desk code, served payloads, generated fixtures, behavior-ledger stories or
  the ledger itself; real data in a test or log.
- **Must recover:** nothing automatically; the suite and the reproduction are
  hermetic.
- **Accepted failure:** a control that genuinely never renders now fails after
  the 30 s bound instead of at once, which costs up to 30 s per such failure
  inside the desk job's five-minute budget. A rail that never settles fails the
  same way, naming the row it was resolving.
- **Unsupported:** proving freedom from scheduler races by repetition alone;
  a control that renders and then detaches before the click, which stays
  Playwright's own click-time wait; the post-press count checks that rely on
  the press's fixed settle, which this change leaves as they are.
- **Evidence owed:** the held-read browser test failing on its own commit
  before any helper change, for the ticket's reason, and passing after; the
  absent and hidden failures naming their selector and bound; the resolver's
  dependency-free test failing on the base and passing after; the reproduction
  printing its after-fix rows; ten consecutive green runs of the affected Day
  tests; the whole desk suite and the replay stories that resolve rail rows,
  green.

Why: a flaky required gate trains everyone to rerun instead of read. A careless
fix could also let a vanished control pass silently.

Disposition: inline in this proposal and unchanged in the locked work order.

## Impact

Test harness only: the desk browser suite, the replay's shared Diagnose helper,
one dependency-free replay test and this change's reproduction script. No
rendered surface, product module, API, analyzer, staging predicate, safety
floor, fixture, generator, behavior-ledger story or ledger text changes.
