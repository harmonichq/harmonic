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

1. These writes stay held on their screen, as Day's answers are today. The
   adapter is unchanged, and so is App. A held write is cleared when its
   write resolves (the re-read has landed) or is refused.
2. **Day badge and counts.** `unanswered` (`day-model.ts`) takes the screen's
   held answers and keeps the served count's formula less their number as a
   whole-number literal, which the provenance grammar admits (as ADR 629 point
   8). Day's own NavBar badge and the Lows and Rises rows read it. Other
   tabs' badges read the served Prompts (Accepted failure).
3. **Log carbs.** Save closes the entry and holds `{ grams, t }` on the Day
   screen. `t` is the time the entry is logged at, which the screen already
   computes for the write. `dayChartOf` takes the held entries for the day
   and draws each as a logged-carbs mark whose time and grams are `Sourced`
   values naming the held entry. The story check never ends on one (each
   story releases its fake). A refusal drops the held entry and raises the
   Day TransientBar's "Not saved" with Retry. Retry sends the same grams and
   time, and draws the entry held again. `LogCarbsEntry` loses its `saving`
   and `not_saved` states, and the screen loses its Log carbs states of the
   same names.
4. **End.** Confirming End holds `ended` on the Changes screen. The Changes
   model's selectors (`change`, `previousCount`, `previousChanges`, `waiting`
   unchanged) take it and read the served store as if its admission named no
   active change:
   - `change` draws "No active change";
   - `previousCount` drops its "− 1" and so counts the ended change;
   - `previousChanges` lists the ended Trial, or the ended Focus, from its
     served record.

   Its result is read only from a saved ending, and the active record has
   none, so the row draws no result pill until the engine's answer carries
   one. The model derives no verdict. A refusal drops `ended`, and the
   existing "Not saved" with Retry stays.
5. **The lock.** A dated §2.5 entry records the Log carbs and End states. The
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
