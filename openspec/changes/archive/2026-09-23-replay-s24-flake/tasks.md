# #441 implementation checklist

## 1. Keep a seated Diagnose case file attached across renders

- [x] 1.1 In `createDiagnoseDestination().mount` (`frontend/diagnose.js`),
  replace the unconditional re-seat of the root (`host.replaceChildren(root)`)
  so that a render never detaches a root already seated in its host. Remove any
  host child other than the root, and attach the root only when it is not
  already the host's child. A cold seat and a parked return still end with the
  root as the host's only child, exactly as today. Leave every other branch of
  mount unchanged: the return's status check, the loading frame during
  Diagnose's own read, both failed-read frames, the parked-return
  `deferredApply` and scroll handling, `restoreEntry()`/`showFocusAction()`
  calls, and the held cleanup (ADR 414). Do not touch `routes.js`,
  `diagnose-workstation.js` or any replay file.
- [x] 1.2 Public-interface test in `frontend/diagnose.test.js`, driven only
  through `createDiagnoseDestination(...).mount`. Extend the file's mocked host
  so it models the host's children the way a DOM node does (child list, append,
  and removal of a child). It must record every time the seated root is removed
  from the host. Seat Diagnose (cold read resolves, second mount seats the
  root). Then mount again with the same `navigation`, which is an in-place
  render such as a guidance completion. Assert that the seated root was never
  removed from the host, and that it is still the host's only child with
  `isConnected` true. Red-prove it: with task 1.1 reverted, the test fails
  because the root was removed and re-inserted, not because of a mock gap. Every
  existing test in the file stays green on the extended mock, with no assertion
  removed or weakened.

## 2. Verify

- [x] 2.1 `npm ci && npm run build`, then `node --test 'frontend/**/*.test.js'`
  with zero failures, and `python3 scripts/check_adr_numbers.py`,
  `python3 scripts/check_owned_identifiers.py`,
  `python3 scripts/check_public_allowlist.py` and
  `npx --yes @fission-ai/openspec@1 validate --all --strict` all passing.
- [x] 2.2 Port-bound replay legs, run serially by whichever session holds
  port 8765 and only on the built commit under test. First, S24 at 1280×720
  passes ten consecutive runs:
  `PLAYWRIGHT_MODULE=<playwright> TARGET=app BASE_URL=http://127.0.0.1:8765
  VIEWPORT=1280x720 ONLY=S24 CASE_STORE_DIR=<scratch>/cases node
  frontend/desk-behavior.replay.mjs`, repeated ten times, each `PASS S24`.
  Then one run at 1280×720 of the stories that cross the Diagnose mount,
  `ONLY=S3,S19,S20,S20b,S23,S24,S25,S29,S81,S108,S109,S114,S117` with the same
  environment, reports `failed 0`. The complete ledger at both sizes stays with
  the release's single pre-merge run.
  - Evidence (coordinator, 2026-09-23, built 743ff47a, synthetic case
    stores): ten consecutive `ONLY=S24` runs at 1280×720 each reported
    `PASS S24` and `# executed 1 · failed 0 · deferred 0 · selected 1`; the
    thirteen-story run reported `# executed 13 · failed 0 · deferred 0 ·
    selected 13`.
  - Forcing harness (scratch-only, uncommitted; holds the Diagnose press's
    `/api/focus` and `/api/guidance` responses and releases them right after
    S24's third Occurrence response), same commit: three
    `# releasing 2 held background response(s): /api/focus /api/guidance`
    lines, then `# pass 3 fail 0 rate 1`. On a4d374a7 triage's run of the same
    harness printed `# pass 0 fail 3 rate 1`.
