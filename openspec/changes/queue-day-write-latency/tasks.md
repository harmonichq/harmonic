## 1. Tests first

- [ ] 1.1 Live-adapter test: two snoozes fired unawaited against a fake that refuses a reused generation both save, each with a distinct generation (fails on today's code)
- [ ] 1.2 Live-adapter test: a Queue write resolves with no Trial roster read, and reading Changes afterwards reads the roster
- [ ] 1.3 Live-adapter test: a Prompt answer resolves after the Prompts, reads no day other than the one on screen, and drops the other visited days' answers
- [ ] 1.4 Queue stories, phone and desktop: two live snoozes where the second is refused show the first snoozed, the second back with "Not saved", and Retry saves it

## 2. Live adapter (`frontend/ui/app/live.js`)

- [ ] 2.1 Queue writes run one at a time in the order made, each on a guidance (and Focus list) read made after the write before it was answered
- [ ] 2.2 The adapter keeps the subjects of Queue writes in flight and the refused writes, so a remounted Queue reads them
- [ ] 2.3 A Queue write forgets the roster and Changes, re-reads only the Queue's own answers with the held roster, and resolves
- [ ] 2.4 A Prompt answer forgets every visited day, drops the off-screen days' answers, re-reads the Prompts and resolves; the day on screen is read again after it

## 3. App and screens

- [ ] 3.1 `App.tsx`: after a Queue write, Changes is drawn loading until its read lands; after a Prompt answer, the day on screen is read again and redrawn
- [ ] 3.2 `QueueScreen.tsx`: hide the adapter's in-flight subjects; hold "Not saved" while any refusal is held, with Retry sending each again
- [ ] 3.3 Update `live.test.js` assertions the change moves (the write test's re-read counts)

## 4. Gate

- [ ] 4.1 `node --test 'frontend/**/*.test.js'`, `npm run test:ui`, and the app job's contract tests and browser smoke pass on the pushed commit
