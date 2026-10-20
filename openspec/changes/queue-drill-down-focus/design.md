## ADR 594 — A Pattern is multi-cause when its counter serves more than one cause

**Context.** The drill-down lock reaches the drill-down "only from a Pattern
with more than one served cause". After #593 a Pattern's causes are served on
the same object its count is read from: a Pattern row's `cause_counts`, or, for
a Pattern served as its one habit, that habit row's `served_as.cause_counts`
(ADR 520, ADR 593). `queue-model.ts` `pattern()` already reads the count through
that one "counter".

**Decision.** A Pattern is multi-cause exactly when its counter's
`cause_counts` holds more than one entry. The Queue model reads the causes
from the counter, in served order, and never sorts, filters or re-counts them.
A Pattern served as its one habit with two causes, such as Lows after
correcting highs on `pattern-correction-collapse`, is multi-cause like any
other.

**Consequences.** That collapsed Pattern's Queue card loses its button, and its
drill-down shows Correction stacking's card without one (ADR 594, below). A
showcase Pattern #593 serves with two causes changes the same way; the
contract test's showcase expectations are re-read from the served answers.

## ADR 594 — A cause the engine serves as not pinnable shows no Focus button, and nothing says why

**Context.** #593 serves `pinnable` on every cause, from the one predicate the
Focus endpoint admits a sent lever by (ADR 593). A credited cause too thin to
be one of the Pattern's members is served `pinnable: false`, and a Focus on it
is refused. The lock puts a Focus button on every cause card and hides it,
unexplained, while a change is watched; it says nothing of a cause that cannot
be focused.

**Decision.** A cause card draws its Focus button only when its served cause
is `pinnable` and the served admission allows a Focus (next ADR). A cause
served `pinnable: false` keeps its title, count and trace, and its head keeps
the button's height with nothing in it, the same as the watched-change gate.
No word, pill or tooltip explains it.

**Consequences.** No new UI and no new word. The app never offers a write the
engine refuses for membership. On `pattern-correction-collapse`, Correction
stacking's card has no button and Correction on active insulin's has one.

## ADR 594 — The Queue reads `admission.focus_pin.available`, and every Focus button follows it

**Context.** The lock: "The button renders only while the served admission
allows it (`GET /api/focus` `admission.focus_pin.available`)." The live adapter
already keeps the whole Focus answer, `admission` included, on the Queue
store. The fixture generator's Queue store keeps only `focuses`
(`gen_ui_fixtures._queue_store`), so no story can draw the gate.

**Decision.** The Queue store's `focus` carries `admission.focus_pin`
(`available`, `reason`) in the generator, as the live adapter already serves
it. One Queue-model function, `focusable(store)`, reads
`focus.admission.focus_pin.available`, and every Pattern card, habit card and
cause card draws its Focus button only when it is true (a cause card also
needs its cause's `pinnable`). A card whose subject is the active Focus shows
its pill as today, whatever the admission says.

**Consequences.** After any Focus or Trial starts, the engine serves the
admission as unavailable and every other button is gone on the next read. A
store the generator produces before a Focus keeps `available: true`; the
pinned stores serve it false, so the "no button while watched" state comes
from the engine, never from a story flag.

## ADR 594 — The drill-down is a Queue screen view; the one router gives it a history entry, not an address

**Context.** `tab-routing.js` is the app's one router: "Drill-downs stay inside
their tab and are not addressed." The Queue's Snoozed list is a view inside
`QueueScreen` (`view: 'queue' | 'snoozed'`), and the open card is the screen's
`selected` state, which a view change keeps, so "‹ Queue" already returns with
the same item open. The lock adds that "the system edge-swipe" also returns,
and Escape on desktop. On a phone browser the edge-swipe is the browser's
Back, and no drill-down pushes a history entry today, so Back leaves the tab
(or the app) instead of returning to the Queue.

**Decision.**

1. The drill-down is a third `QueueScreen` view, holding the Pattern's subject;
   the open card stays `selected` while it is shown. No second router, and no
   route state outside `tab-routing.js`.
2. `tab-routing.js` gains one export that pushes a history entry at the
   current address marked as a drill-down, and `subscribeRoute` reports a Back
   that lands on the tab's own address with no drill-down mark. The address
   never changes: a drill-down stays unaddressed, and a reload lands on the
   Queue.
3. Opening any Queue drill-down (Snoozed or a Pattern's causes, which share the
   screen's one `go`) pushes that entry; "‹ Queue" goes back through history;
   a Back the router reports closes the drill-down. So "‹ Queue", the
   edge-swipe and the browser's Back all land on the Queue with the same card
   open. Desktop: Escape does the same.
4. On desktop the drill-down opens in the detail pane with "‹ Queue" in that
   pane's header, and the list stays beside it. Selecting another row (click,
   ↑/↓) shows that item and closes the drill-down, so one pane never holds two
   things.

**Consequences.** Snoozed gains the same Back behaviour as the cause
drill-down, which §1.4 already requires of every drill-down. Changes · Previous
and the Settings drill-downs are out of this change and keep today's Back.
The Storybook stories render the screen without the app's router; they drive
"‹ Queue" and Escape, and `tab-routing.test.js` covers the history entry.

## ADR 594 — A cause's Focus sends its lever, and its request identity names it

**Context.** `live.js` `queueWrites.pin(subject)` sends a Pattern's
`pattern_key` with no `lever`, under a durable request identity keyed
`pin <subject>`. #593 keeps a sent `lever` and refuses a retry whose lever
differs from the record's (`request_identity_mismatch`). If two causes of one
Pattern shared `pin <subject>`, a Retry of a failed Late bolus Focus followed
by a tap on Carb undercount would reuse the first request id with another
lever and be refused.

**Decision.** `pin(subject, lever?)`: a cause card passes its cause's lever
(its served `subject` after `habit:`), and the request identity is
`pin <subject> <lever>`. The Queue card of a single-cause Pattern and a habit
card send what they send today, under today's key. The Queue screen tracks the
write in flight by subject and lever, so only the pressed card shows the pill
at once.

**Consequences.** A single-cause Pattern's Focus is unchanged, as the lock's
must-survive line requires. `live.test.js` asserts the sent body and the key.

## ADR 594 — The tappable chart is a drill-down row

**Context.** The lock: the multi-cause card's TraceChart opens the drill-down
and "carries a trailing '›', the same mark as every other drill-down row, and
no other label"; desktop "click it, or Enter with it focused". The story
prechecks require every `button` to declare a §4.1 role at its height, and a
list row's role (`row`) is a 48 px minimum with a trailing "›" (`ListRow`).

**Decision.** On a multi-cause Pattern's card the chart is wrapped in a
`button` with `data-role="row"`, the chart beside a trailing "›" drawn as a
ListRow's chevron, in its own column so the chart still measures its own box
(§2.2 Charts). Its accessible name is the card's title (`aria-labelledby`), so
it adds no word. A single-cause or habit card's chart is not a control.

**Consequences.** The "›"'s exact place is a rendering of a locked line, and
the story "multi-cause Queue card" is one Connor approves on the pull request.

## ADR 594 — The cause card's head, loading, and the desktop grid

**Context.** The lock fixes the cause card's head (title, a 32 px outlined
secondary Focus with a 44 px hit area, the head keeping that height in every
state, the pill in the button's place), its loading ("a card skeleton per
cause") and its desktop form ("its cards flow into a grid"). It does not say
how many skeletons a drill-down draws before its answers land, or the grid's
column width.

**Decision.**

1. The head is PatternCard's head; the 44 px hit area is a transparent
   extension around the 32 px button in PatternCard's own CSS, so the button
   measures 32 px and the head's height is the hit area's in every state.
2. Loading draws one PatternCard skeleton per cause the drill-down was opened
   with: the screen keeps that count, not the answers.
3. The desktop grid fills the detail pane with columns no narrower than the
   phone card (390 px less its two 16 px gutters, 358 px), so a cause card is
   never narrower than its locked phone width.

**Consequences.** The desktop drill-down has no locked render (the lock's
approved screen is 390x844); its story is one Connor approves on the pull
request beside the four the lock names.

## ADR 594 — A pinned multi-cause Pattern names its cause from the served causes

**Context.** The lock: once a cause is pinned, the Queue card shows the caption
"Focus" over "the cause's served title". `GET /api/focus` serves a Focus's
`lever` and `pattern_key` but no title; the served title is the cause's
`cause_counts` entry.

**Decision.** The card's value is the `title` of the counter's cause whose
`subject` is `habit:<lever>` of the active Focus with that `pattern_key`. When
no served cause names it (a Focus pinned before this change on a lever that has
since lost its share; the store is durable and the data move under it), the
card shows the Focus pill, the locked pinned state, and invents no title.

**Consequences.** One served source for the name; no title is joined from
another endpoint.

## ADR 594 — "Pin" leaves the screen and the glossary; the engine's verb stays

**Context.** The amendment: "'Pin' leaves §1.5 and the control's name with the
build"; #591: "Focus's definition is reworded". ui-craft's revise rule: a
renamed term changes the glossary, and the old name is searched across the
whole repository.

**Decision.**

1. Every printed "Pin" becomes "Focus": the button on Pattern and habit cards,
   and the stories that print it (`Button.stories.tsx`, `Motion.stories.tsx`).
2. §1.5 loses the Pin row and Focus reads: "A Pattern's habit, or a Habit,
   you chose to watch for adherence and outcome." The allowlist and the served
   Glossary are regenerated from it in the same change; "started" joins the
   Queue labels (§1.3, "Focus started").
3. Prose that names the control (the lock docs' current sections, component
   comments, `README.md`, the redesign change's Queue requirement) says
   Focus. Dated amendments, decision records, archived changes, the 2026-10-12
   exploration canvas (`docs/design/build.py`, `provenance.tsv`) and evidence
   logs are history and keep their words.
4. Internal identifiers keep the engine's verb: `pin`, `onPin`, `pinned`,
   `POST /api/focus`, `focus_pin`. `prechecks.test.js`'s synthetic allowlist
   is not the generated one and keeps "pin".

**Consequences.** The Glossary page changes by one row and one definition,
which Connor approves on the pull request with the stories.
