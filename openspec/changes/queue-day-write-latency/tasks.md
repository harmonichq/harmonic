## 0. Interface (settled at triage)

- `QueueWrites` (`QueueScreen.tsx`) gains `held: () => { inFlight: ReadonlySet<string>; refused: readonly Refused[] }` and `retry: () => Promise<readonly Refused[]>` (the writes it saved), where `Refused = { kind: 'snooze' | 'restore' | 'done' | 'undoDone' | 'pin'; subject: string; lever?: string }`. The live adapter's `queueWrites` implements both; the screen hides `inFlight` subjects, draws "Not saved" + Retry while `refused` is non-empty (outranking its own bars), and calls `retry` from it. The screen keeps no in-flight or refused state of its own.
- App redraws when a Queue write starts as well as when it settles.
- The live adapter holds the day on screen as the iso its `readDay` last read, and exposes it as `shownDay()`. `dayWrites.answer(prompt, answer)` keeps its signature. After it settles, App calls `live.readDay(live.shownDay())` and redraws when that lands. `DayScreen.tsx` is untouched.

## 1. Tests first

- [x] 1.1 Live-adapter test: two snoozes fired unawaited against a fake that refuses a reused generation both save, each with a distinct generation (fails on today's code)
- [x] 1.2 Live-adapter test: `held().inFlight` names a snooze's subject until it settles; a refused snooze is in `held().refused` until `retry()` saves it; a refusal answered 404 on Retry is dropped
- [x] 1.3 Live-adapter test: a Queue write resolves with no Trial roster read; afterwards Changes is not landed, in the page and after a memory refresh, and reading it reads the roster; a Changes read in flight when the write starts reads again, and once it settles `answers.changes.wearer` holds the post-write roster and only then is Changes landed
- [x] 1.4 Live-adapter test: a Prompt answer resolves after the Prompts, reads no day, and drops every visited day's answer but `shownDay()`'s
- [x] 1.5 Queue stories, phone and desktop, on the existing stores: a wrapper renders `wearer-pinned` and switches to `wearer-pinned-snoozed` when a snooze of `fixtures.snooze.subject` saves; a second ranked item's snooze is refused on its first call; the play asserts the first item gone, the second back, the bar "Not saved", and after Retry that the bar leaves. The fake `writes` implement `held` and `retry` in the story file, and the wrapper redraws whenever a fake write starts or settles, as App does

## 2. Live adapter (`frontend/ui/app/live.js`)

- [x] 2.1 Queue writes run one at a time in the order made, each on a guidance (and Focus list) read made after the write before it was answered
- [x] 2.2 `held()` and `retry()` as in section 0; a refusal leaves on save or on a 404
- [x] 2.3 A Queue write forgets the roster, deletes `answers.changes.wearer` and drops 'changes' from the landed tabs before remembering, re-reads only the Queue's own answers with the held roster, and resolves. The adapter counts Queue writes; a `changes()` read notes the count when it starts and, if a Queue write ran since, it discards what it read and reads again, until no Queue write crossed it, so its promise resolves only with an answer read after the last write and `readTab`, `retryTab`, `catchUp` and memory need no change
- [x] 2.4 `shownDay()`; a Prompt answer forgets the Prompts and every visited day, deletes every visited day's answer but `shownDay()`'s, re-reads the Prompts and resolves

## 3. App and screens

- [x] 3.1 `App.tsx`: redraw on a Queue write's start; after a Queue write, drop Changes' read state so it draws loading until its read lands; after a Prompt answer, read `live.shownDay()` again and redraw
- [x] 3.2 `QueueScreen.tsx`: the section 0 interface, replacing the component's `hidden` set and its `not_saved` bar
- [x] 3.3 Update `live.test.js` where the change moves it: the re-read counts in 'Retry and a write read again only what they change', and the Done test (`Done records the card's subject…`), which reads Changes before asserting its waiting list, in the page and after the memory refresh

## 4. Gate

- [x] 4.1 `node --test 'frontend/**/*.test.js'`, `npm run test:ui`, and the app job's contract tests and browser smoke pass on the pushed commit
