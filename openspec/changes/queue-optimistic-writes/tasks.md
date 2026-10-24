## 0. Interface (settled at triage)

- `QueueWrites.held()` (`QueueScreen.tsx`) returns `{ inFlight: ReadonlyMap<string, Held>; focus: { subject: string; lever?: string } | null; refused: readonly Refused[] }`, where `Held = { kind: Exclude<Refused['kind'], 'pin'>; at: string }`, keyed by subject, the newest such write made for that subject, and `focus` is the Focus in flight (ADR 629 point 1). `Refused` and `retry` are unchanged. The live adapter's `queueWrites` and the stories' `heldWrites` fake both implement it.
- The Queue order rule (admitted, not snoozed, not waiting for the pump) is exported from one plain-JS module, `frontend/ui/queue-order.js`, imported by `live.js`'s guidance composition and by `queue-model.ts`. `scripts/gen_ui_fixtures.py` keeps its Python copy.
- `ranking`, `snoozed`, `snoozedCount`, `queuedCount` and `focusable` (`queue-model.ts`) take an optional held map and draw it as ADR 629 point 3 says. Without one they are unchanged. A held snooze's Until is `{ value: at, source: <names the held write>, format: 'until' }`; a held count keeps its served formula plus or minus a literal (ADR 629 point 8).
- App needs no change: it already redraws as a Queue write starts and settles.

## 1. Tests first

- [ ] 1.1 Live-adapter test (`live.test.js`): a held snooze is in `held().inFlight` with kind `snooze` and an `at` in `YYYY-MM-DD HH:MM:SS` from the moment it is made; a restore made for the same subject while the snooze is in flight is reported instead and stays reported once the snooze settles; each leaves `inFlight` only after the Queue is read again; a Focus is in `focus`, and stays there when a snooze on its subject is made after it. It fails on today's code, whose `inFlight` is a set of subjects
- [ ] 1.1a Live-adapter test (ADR 629 point 7): a snooze refused after a restore on its subject was made leaves `refused` empty and the restore unsent; the same for a Done refused after its Undo; a snooze refused with no newer write is held as today
- [ ] 1.2 Queue stories, phone and desktop, each with a fake write that answers only when the play releases it: Snooze (the Snoozed count, the row in the Snoozed list with its Until, and the bar, before release; the same after release: the fake stamps a snooze's `at` with the served decision time of the store it switches to, standing in for a browser clock on that day), Restore (the row back in the Queue at its served place, the count one less), Done then Undo before release, and Focus (the pill, "Focus started", no other Focus). Each play releases its fake before it ends, so the story check reads served fields
- [ ] 1.3 A Queue story with a fake that refuses after a delay: before the refusal the row is in Snoozed; after it the item is back, the row is gone and the bar reads "Not saved"

## 2. The order rule and the model

- [ ] 2.1 Move the order rule into the shared plain-JS module, and import it in `live.js`'s guidance composition
- [ ] 2.2 `queue-model.ts`: the held overlay on `ranking`, `snoozed`, `snoozedCount`, `queuedCount` and `focusable`, setting each held subject's served fields and applying the shared rule (ADR 629)

## 3. The live adapter (`frontend/ui/app/live.js`)

- [ ] 3.1 `held()` as in section 0: each write enters `inFlight` (or `focus`, for a Pin) with its kind, its `at` (`now()`) and any lever when it is made; an older write's settle removes only its own entry
- [ ] 3.2 Superseded writes (ADR 629 point 7): a per-subject count of writes made; a refusal is not held when a newer write on its subject was made after it; a Restore or an Undo of a Done is not sent when its subject's earlier Snooze or Done was refused

## 4. The screen and stories

- [ ] 4.1 `QueueScreen.tsx`: pass `held()`'s `inFlight` and `focus` to the model selectors, in place of the `hidden` filter and the local `pinning` state; raise each write's bar when it is made (ADR 629 point 5); on Undo, move the item back and clear the bar at once; on a refusal, clear the write's own bar
- [ ] 4.2 `QueueScreen.stories.tsx`: `heldWrites` implements section 0's `held()`; update the stories that read `inFlight` as a set; add 1.2 and 1.3 (1.1a is covered by the adapter test alone)
- [ ] 4.3 `live.test.js`: update the tests that assert `held()` with a `Set`

## 5. Gate

- [ ] 5.1 `node --test 'frontend/**/*.test.js'`, `npm run test:ui`, and the app job's contract tests and browser smoke pass on the pushed commit
