## 0. Interface (settled at triage)

- No adapter, App or server change. Each write stays held on its screen (ADR 630 point 1) and clears when its write resolves or is refused.
- `unanswered(store, kind?, held?)` (`day-model.ts`) takes the number of answers held, and keeps the served formula less it as a literal (ADR 630 point 2).
- `dayChartOf(iso, held?)` takes the Log carbs entries held for the day, `{ grams: number; t: string }[]`, and draws each as a logged-carbs mark (ADR 630 point 3).
- `change`, `previousCount` and `previousChanges` (`changes-model.ts`) take `ended?: boolean` and, when set, read the store as if its admission named no active change (ADR 630 point 4). The result comes only from a saved ending.
- `LogCarbsState` loses `'saving'` and `'not_saved'`.

## 1. The lock (the mock and the amendment)

- [ ] 1.1 `docs/design/recommendations-redesign.md`: a dated §2.5 entry (2026-10-25, #630) recording #628 Q6 A and Q7 A and the badge moving at once; §1.3 Day · Log carbs (Loading "—"; Error "Not saved + Retry", in the bar); §1.3 Changes · Previous (other states: the change just ended, without its result until End is saved); §4.2 item 19 LogCarbsEntry (States: empty; filled). The header's lock line is added only after the operator says "locked" on the pull request (task 5.2)
- [ ] 1.2 The mock: the stories of tasks 2.2 to 2.4 are the states the operator replays

## 2. Tests first (stories, each fake released before its play ends)

- [ ] 2.1 Day stories, phone and desktop: a Prompt answer whose fake answers late; before release the Day badge and the kind's count are one less, after release the same
- [ ] 2.2 Day stories, phone and desktop: Log carbs Save whose fake answers late; before release the entry is closed and its mark is drawn at its time with its grams; after release the same. And a refused save: the mark leaves, the bar reads "Not saved", and Retry sends the same grams and time (the fake records them)
- [ ] 2.3 Changes stories, phone and desktop. On `wearer` (an active Trial): End whose fake answers late; before release "No active change" and the Previous count one more, and in Previous the ended row with its date and before → after and no result pill; after release, `wearer-ended`, with the row's pill. On `wearer-focus` (an active Focus; no store serves it ended): End held, the same held state with the ended Focus's row and no pill; the fake then refuses, and the active Focus is back with "Not saved"
- [ ] 2.4 The existing Changes not-saved story still reverts to the active change with "Not saved" and Retry
- [ ] 2.5 `LogCarbsEntry.stories.tsx`: drop the Saving and Not saved stories and Save's busy play

## 3. Models

- [ ] 3.1 `day-model.ts`: `unanswered` with held answers; `dayChartOf` with held entries
- [ ] 3.2 `changes-model.ts`: `change`, `previousCount`, `previousChanges` with `ended`

## 4. Screens and component

- [ ] 4.1 `DayScreen.tsx`: pass the held answers to the badge and counts; Save closes the entry, holds it and draws it; a refusal drops it and raises the bar's "Not saved" with Retry; remove the Log carbs `saving` and `not_saved` handling
- [ ] 4.2 `ChangesScreen.tsx`: confirming End holds `ended` until the write resolves or is refused
- [ ] 4.3 `LogCarbsEntry.tsx` (and its CSS if it styles them): remove the `saving` and `not_saved` states

## 5. Gate and lock

- [ ] 5.1 The Verification command passes once on the pushed commit
- [ ] 5.2 After the operator's "locked" on the pull request: the header's lock line quoting it (in revise)
