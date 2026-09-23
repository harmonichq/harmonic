# #427 implementation checklist

## 1. The viewed stamp (desk)

- [ ] 1.1 In `frontend/day.js` `dayState()`, build `viewedAt` as
  `formatWallClock(new Date())`, imported from `./carb-log.js` (the existing
  exported local-getter wall-clock formatter). Delete the
  `toISOString()` expression. Add no second formatter, and leave
  `frame.js` `stamp()` and the read/viewed comparison in `dayFrame` as they
  are. Once both stamps are local wall strings, the existing same-minute
  comparison folds. Change no other line of `day.js`: `adopt`, `settle` and
  the direct-entry behavior stay byte-identical.

## 2. Tests through the Day destination (frontend/day.test.js)

- [ ] 2.1 Drive the Day destination through its public seam, as
  `frontend/changes.test.js` does. `frontend/data.js` binds `fetch` once at
  import (`const _defaults = makeDeps()`), so install a stub
  `globalThis.fetch` before a dynamic `import('./day.js')`, and turn the
  file's static `day.js` import into that dynamic import.
  - **Reads:** the stub answers `/api/status`, `/api/day-navigator`,
    `/api/model-view`, `/api/timeline` and `/api/carbs` from manufactured
    values written in the file.
  - **Page:** stub `document` (`activeElement`, `querySelectorAll`,
    `documentElement`) and `getComputedStyle`. Pass a fake browser to
    `startDesk`: `location`, `history.pushState`/`replaceState` updating that
    location, `matchMedia` and `addEventListener`. Seat the desk on a plain
    host object.
  - **Order:** call `installDay()` before `startDesk`. Wait for open reads
    through `routes.js` `loading()`.
  - **Existing tests:** every existing `dayFrame` test keeps passing
    unchanged.
- [ ] 2.2 Held-day test.
  1. A fresh page at `/day` holds the latest recorded day.
  2. `navigate('day', {date, from: 'diagnose', subject, focus})` on an earlier
     recorded day holds that day and shows "Opened from".
  3. `navigate('diagnose')`, `navigate('changes')`, then `navigate('day')`
     still holds the earlier day. It shows no "Opened from" and no
     `data-day="return"`, and the fake browser's address is `/day` with an
     empty query.

  "Holds" means the pressed week column (`data-pick="<iso>"
  aria-pressed="true"`). This test pins existing behavior, so it passes on
  base. Show it is not vacuous: make a direct entry clear the held date in a
  throwaway edit, watch the test fail, then revert the edit.
- [ ] 2.3 Viewed-stamp test, fail-first. Inside the test, set
  `process.env.TZ = 'America/Denver'`, then restore the previous value, or
  delete it when there was none. Fix the clock with `node:test`
  `mock.timers.enable({ apis: ['Date'], now })`, and reset it in a `finally`.
  Serve a read stamp of `2024-06-29 21:30:12`, then check:
  1. **Earlier minute.** At 2024-06-30T04:45:05Z (22:45 on Jun 29 locally),
     the kicker reads `Day · read <b>Jun 29, 2024 · 21:30</b> · viewed Jun 29,
     2024 · 22:45`: the local date and time, not `Jun 30` or `04:45`.
  2. **Same minute.** With the clock moved to 2024-06-30T03:30:40Z (the read's
     local minute) and the desk re-rendered, the kicker reads
     `Day · read <b>Jun 29, 2024 · 21:30</b>` and nothing on the desk says
     "viewed".

  The test pins its own zone, so it must fail on the unfixed `day.js` under
  the CI runner's UTC zone and under a local zone alike. Record the failing
  run from before 1.1. The desk has one module instance per file, so this
  test uses the same served status as 2.2. Place 2.2 first, or make the
  status answer carry this read stamp from the start. The held-day
  assertions do not depend on it.

## 3. Behavior ledger and replay

- [ ] 3.1 Add story S133 to the Day section of
  `mockups/harmonic-v2-desktop.behavior.md`, in the ledger's story format:
  - **Summary:** direct Day entry reopens the day last looked at. After a
    contextual Open Day on a recorded day earlier than the latest, a visit to
    Diagnose, then Changes, then the topbar's Day shows that same day. It shows
    no Opened from and no return, at the plain `/day` address, and a reload
    opens the latest recorded day.
  - **element:** `[data-destination="day"]`; `.gf-nav-col[aria-pressed="true"][data-pick]`;
    `[data-day="latest"]`; absence of `[data-day="return"]`.
  - **source:** `frontend/day.js` `adopt`/`settle`.
  - **lock:** HV2-13, ADR 427.
  - **data:** showcase (35 recorded days, 2024-05-20 to 2024-06-30).
  - **evidence:** replay fn S133.
  - **status:** owed until replayed.
- [ ] 3.2 Add `export const S133` to `frontend/desk-behavior.replay.mjs` and
  register `['S133', S133, M()]` in `REGISTRY`, beside the other Day stories.
  Use the existing `goto`, `visible`, `activate`, `waitForReplayAssertion` and
  `deskText` helpers. The story:
  1. Press the topbar's Day and read the held column's `data-pick` as the
     latest recorded day. Assert `[data-day="latest"]` is disabled.
  2. Press Diagnose. Choose the first visible `[data-action="day"][data-date]`
     whose `data-date` differs from that day, and fail naming how many controls
     it checked if none does. Never skip.
  3. Open it, and assert the held column is that date and "opened from" is
     shown.
  4. Press Diagnose, then Changes, then Day. Assert the held column is still
     that date, `[data-day="latest"]` is enabled, and there is no
     `[data-day="return"]` and no "opened from" text. Assert
     `location.pathname` is `/day` and `location.search` is empty.
  5. `page.reload()`. Assert the held column is the latest recorded day again
     and `[data-day="latest"]` is disabled.
- [ ] 3.3 Move the replay driver's inventory literals from 147 / 128 / 19 to
  148 / 129 / 19:
  - `mockups/sweep/harmonic-v2-desktop/acceptance.py` `inventory()`;
  - `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`: the replay plan's
    `count`, the stated active/retired inventory (S1–S129 plus R1–R19), and
    the same-total test (130 S and 18 R, total 148).

  The smoke slice and its hash do not change. The CI shards are fractional, so
  `ci.yml` does not change.

## 4. Documentation

- [ ] 4.1 In `CONTEXT.md` **Day navigator**, replace "Lands on the **most
  recent day with data**." with a sentence saying: a fresh page lands on the
  most recent day with data, and within the page the topbar's Day reopens the
  day last looked at (ADR 427). Do not use "held" as the domain word; CONTEXT.md
  already gives **held** to a Diagnose register.

## 5. Verification and evidence

- [ ] 5.1 Fast gate and guards, on the commit to be pushed:
  `node --test 'frontend/**/*.test.js'`,
  `TZ=America/Denver node --test frontend/day.test.js`,
  `npx --yes @fission-ai/openspec@1 validate --all --strict`,
  `python3 scripts/check_adr_numbers.py`,
  `python3 scripts/check_owned_identifiers.py`,
  `python3 scripts/check_public_allowlist.py`, and
  `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py ReplayPlanTest InventoryProofTest SmokeSelectionTest`.
  The whole `acceptance.test.py` runs in 5.2, because its
  `ServerLifecycleTest` binds a socket.
- [ ] 5.2 Port-bound. Whoever can launch a browser runs this, never a
  sandboxed worker. Run the whole
  `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py`.
  Replay `ONLY=S60,S133` at 1280×720 and 1440×900 against the
  built app on the showcase store. Run the complete desk ledger once per size
  on the pushed commit. Render the Day header (kicker and Episode Log meta) at
  both sizes from base and revision, in a non-UTC browser zone, and save the
  renders and raw replay output under
  `openspec/changes/day-held-day-viewed-stamp/evidence/`.
