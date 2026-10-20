# Revise the Queue: the multi-cause drill-down, Focus everywhere, and the snooze bar (#594)

## Why

The drill-down lock (`docs/design/drill-down.md`, locked 2026-10-20) and the
Queue lock's two amendments of 2026-10-20 (`docs/design/recommendations-redesign.md`
§2.5, "the snooze bar loses its middle dot" and "Pin is 'Focus', and says so")
change the shipped Queue. Today:

- A Pattern with several causes offers one Pin, which the engine resolves to
  its first member: the person cannot choose the cause they mean to work on,
  and nothing shows the causes side by side.
- The button reads "Pin", and pressing it swaps it for the Focus pill and says
  nothing else, while the Focus appears on Changes unannounced.
- Pin shows on every card while a Trial or Focus is already watched, and the
  engine refuses the second one.
- The snooze bar reads "Snoozed · Until <date>".
- The drill-down exists only as a Storybook mock (`Screens/DrillDown`) over
  hand-made two-cause stores (`served-variants.ts`) that draw the Pattern's
  pooled trace on every cause card.

The engine half (#593, `openspec/changes/cause-traces-severity-focus`) serves
what the screen needs: each cause's share with `pinnable` on every Pattern row
that serves a count (`cause_counts`), each cause's own trace
(`traces.causes`), causes largest harm first, and a Pattern Focus that keeps
the `lever` it was sent. `GET /api/focus` already serves
`admission.focus_pin.available`.

## What changes

- **A multi-cause Pattern's open card** (its counter serves more than one
  cause) has no Focus button. Its trace chart is a control with a trailing
  "›" that opens the drill-down; nothing else labels it.
- **The drill-down** is a sub-screen of the Queue: "‹ Queue" over the
  Pattern's title, one open card per served cause in served order, each with
  the cause's served title, its count over the Pattern's own count ("3 of 7
  meals"), its own served trace against the Pattern's Typical, and its Focus
  button, a 32 px outlined secondary with a 44 px hit area in the card's head.
  The screen has no primary. Phone: it replaces the Queue above the tab bar
  and scrolls as one page. Desktop: it opens in the detail pane, its cards in
  a flowing grid, the list beside it. "‹ Queue", the platform's back (the
  phone's edge-swipe) and Escape on desktop return to the Queue with the same
  card open.
- **A cause's Focus** sends that cause's lever with the Pattern. Once it is
  the Focus, the Queue card shows the caption "Focus" over the cause's served
  title in the button's place, and the cause's card shows the Focus pill.
- **"Pin" becomes "Focus"** on every Pattern and habit card. A started Focus
  shows the transient bar "Focus started" with the text action "Changes",
  which opens that tab. A refused or failed one shows Not saved + Retry, as
  today.
- **The Focus button renders only while `GET /api/focus` serves
  `admission.focus_pin.available`**, and a cause card's only while its served
  cause is `pinnable`. Nothing explains its absence.
- **The snooze bar** reads "Snoozed until <date>".
- **"Pin" leaves** §1.5, the generated allowlist and the served Glossary, and
  Focus's definition is reworded, in the same change as the rename.
- **The stand-ins go.** The drill-down's and the Queue's two-cause stories read
  stores the component library's fixture generator materializes from the
  generated `pattern-meal-two-causes` and `pattern-correction-collapse` QA
  cases; `served-variants.ts` loses its two-cause stores.
- **Stories for approval.** Every surface the lock approved by text alone gets
  a story, and the drill-down's Open and Pinned are redrawn on served traces,
  for Connor to approve on the pull request with rendered evidence.

## Not in this change

- Any engine change: #593 serves every field this change reads.
- A cause's further detail pane, the Flat vs Into a rise card, Changes reusing
  the drill-down, and a fourteen-day Focus minimum (outside the lock).
- A drill-down for a single-cause Pattern: its card keeps its Focus button,
  which starts a Focus with no lever, as today.
- Addressing a drill-down: a reload lands on the Queue, as for Snoozed today.

## Risk contract

- **Must prevent:** a Focus that watches a lever other than the cause the
  person pressed it on (silent incorrect success), including through a retried
  write that reuses another cause's request identity; a Focus button drawn
  while the served admission is unavailable or on a cause served
  `pinnable: false`; the app ordering causes, or deciding membership,
  pinnability or multi-cause, from anything but the served fields; a cause card
  whose count and trace read different populations (its count is its served
  share, its trace the served trace with the same subject); more than one
  primary on any screen; a printed word outside the generated allowlist; a
  story store that is hand-made rather than generated; any real value
  committed; a must-survive line of either lock lost without its dated
  amendment.
- **Must recover:** a failed or refused Focus write puts the card back as it
  was, with Not saved + Retry in the bar; a re-read that fails keeps the last
  answers marked stale, as every Queue read does today.
- **Accepted failure:** the drill-down is not addressed, so a reload on it
  lands on the Queue with its top card open, as Snoozed does today. A Pattern
  pinned before this change, whose watched lever is no longer one of its
  served causes, shows the Focus pill on its card rather than a cause title.
- **Unsupported:** a drill-down from anything but a Pattern whose counter
  serves more than one cause; choosing a cause from the Queue card itself;
  undoing a Focus from its bar (End on Changes stays the way to stop one).
- **Evidence owed:** stories with plays for every state the lock lists for the
  drill-down and the amended Queue (listed in `tasks.md`), clean under the
  story prechecks; the contract test's screen-model assertions on the
  `pattern-meal-two-causes` and `pattern-correction-collapse` stores, including
  a live cause Focus that watches the cause it was started on; a node test that
  the live pin sends the cause's lever and keys its request identity by subject
  and lever; a node test that the router's drill-down history entry keeps the
  address and pops back to the Queue; the fixture generator's `--check` green
  with the regenerated fixtures and allowlist; rendered before and after
  evidence on the pull request for every affected screen, state and frame.
