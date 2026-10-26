# Design: Day's and Changes' writes draw at once

## ADR 630 — A held Day or Changes write is drawn by the served fields it writes

**Context.** #629 (ADR 629) draws each Queue write from the adapter's held
writes. Day and Changes hold theirs on the screen. Day keeps the Prompts
answered while their write is in flight (`pending`) and draws the next card
at once, but its badge and counts read the served Prompts
(`unanswered(store)`). Log carbs sets the entry `saving` until the save
resolves. End waits for its write before the screen changes. Each of these
writes resolves only after the reads it changed have landed (`live.js`
`write()`), so a screen that clears its held write on resolve already draws
the served answer.

**Decision.**

1. These writes stay held on their screen, as Day's answers are today. App is
   unchanged; the adapter changes only in what Log carbs is sent (point 3).
   A held write is cleared when its
   write resolves (the re-read has landed) or is refused.
2. **Day badge and counts.** `unanswered` (`day-model.ts`) takes the number
   of the screen's answers whose write is still in flight: the `pending`
   answers and a Yes until its write settles. A Yes card held open for its
   grams after its write settled is not counted again, since the served
   Prompts already leave it out. It keeps the served count's formula less their number as a
   whole-number literal, which the provenance grammar admits (as ADR 629 point
   8). Day's own NavBar badge and the Lows and Rises rows read it. Other
   tabs' badges read the served Prompts (Accepted failure).
3. **Log carbs.** At Save the Day screen reads its clock once. That is the
   browser's clock, or, in the stories, a `now` prop giving
   `YYYY-MM-DD HH:MM`. It sends the write the entry's whole time, date and
   time, as `YYYY-MM-DD HH:MM`: today's date at the time picked in the Time
   row, or the clock's own. `live.js` `logCarbs(grams, t)` posts exactly that
   time (lock 2). Before, it took only `HH:MM` and stamped the date when the
   write ran, so a Retry after midnight logged the entry on the next day; and
   with no time it stamped its own. The screen holds `{ grams, t }` on the Day
   screen, and Retry sends that same `t`. A mark is drawn once: a held entry is
   dropped in the same update that draws the served answer, never a render
   later. `dayChartOf` takes the
   held entries for the day and draws each as a logged-carbs mark. Its time
   and grams are literal `Sourced` values (`{ value, source }`, not
   `sourced()`, which resolves its path against the served answers) whose
   source names the held entry. The story check never ends on one, because
   each story releases its fake first. A refusal drops the held entry and
   holds the refusal apart from the Prompts' Retry: the Day view's
   TransientBar reads "Not saved" with Retry, and a Prompt answer does not
   clear it. Retry sends the same grams and `HH:MM` again, and draws the
   entry held again. `LogCarbsEntry` loses its `saving`
   and `not_saved` states, and the screen loses its Log carbs states of the
   same names.
4. **End.** Confirming End holds `ending` on the Changes screen (the screen's
   `ended` already names the stories' simulated End). The Changes
   model's selectors (`change`, `previousCount`, `previousChanges`, `waiting`
   unchanged) take it and read the served store as if its admission named no
   active change:
   - `change` draws "No active change";
   - `previousCount` drops its "− 1" and so counts the ended change;
   - `previousChanges` lists the ended Trial, or the ended Focus, from its
     served record.

   An active Focus has no `ending`, so the held reading lists it from its
   served record with no result. Its result is read only from a saved
   ending, and the active record has none, so the row draws no result pill until the engine's answer carries
   one. The model derives no verdict. A refusal drops `ending`, and the
   existing "Not saved" with Retry stays. A refusal while Previous is open
   returns to Changes when the served store has no previous change, since the
   lock has no empty Previous (§1.3: "Not reachable"; lock 2).
5. **Stories that answer late.** Each such story's wrapper switches the
   screen's served store when its fake answers, as #629's `LiveQueue` does.
   - Day answer: the Prompts store served after that answer.
   - Log carbs: a stories-only variant of the `with_carbs` day without its
     first logged entry (`served-variants.ts`), with the story clock at that
     entry's time and its grams typed. On release the story shows the
     `with_carbs` day itself, so the served mark matches the held one.
   - End: `wearer` → `wearer-ended`.
6. **The lock.** A dated §2.5 entry records the Log carbs and End states. The
   §1.3 rows for Day · Log carbs (Loading "—"; Error "Not saved + Retry" in
   the bar) and Changes · Previous (the change just ended, without its result
   until saved) follow, and so does §4.2 LogCarbsEntry (States: empty;
   filled). The mock is the new stories. The operator's "locked" on the pull
   request closes it, as #619's did.

**Consequences.** No second copy of any served fact. The Previous row's
result stays the engine's saved verdict (`capture_ending` computes it at End
with `data_cutoff=now`, so the active card's cached verdict can differ). A
Log carbs Retry has no request identity, as today.

**Alternatives rejected.**
- Holding these writes in the adapter (ADR 629's shape) would keep them
  across a tab change and move every tab's badge. It costs an adapter
  interface and a change to every screen's NavBar, for a few seconds' window
  the operator did not raise.
- Reopening the sheet on a refusal (#628 Q6 B) pops a sheet open unbidden.
- Drawing the active card's last result on the ended row (#628 Q7 B) could
  draw a verdict the engine never saved.
