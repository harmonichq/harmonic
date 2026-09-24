# #427 evidence

Worker-run, 2026-09-23, with the tests committed in 2e128946 against the
unfixed `frontend/day.js` (the bytes at the lock's pin 427e8be9, identical to
main a4d374a7).

- `failfirst-viewed-stamp.TZ-UTC.txt` and
  `failfirst-viewed-stamp.TZ-America-Denver.txt`: raw output of
  `TZ=<zone> node --test frontend/day.test.js` before task 1.1. Both exit 1 on
  the viewed-stamp test only. The kicker read `viewed Jun 30, 2024 · 04:45` (UTC)
  where the reader's local `Jun 29, 2024 · 22:45` was expected. The test pins its
  own zone, so the runner's zone does not change the failure.
- `nonvacuity-held-day.txt`: raw output of the held-day test alone
  (`--test-name-pattern="reopens the day last looked at"`) against a throwaway
  `adopt` that clears the date on a direct entry. It fails with `2024-06-29`
  shown where `2024-06-26` was expected. The edit was reverted; the test passes
  on base and on the branch, because it pins existing behavior.

Owed by whoever can launch a browser (task 5.2): the full `acceptance.test.py`
run, `ONLY=S60,S133` replay output at 1280x720 and 1440x900, the complete
ledger once per size on the pushed commit, and base-versus-revision renders of
the Day header in a non-UTC browser zone.
