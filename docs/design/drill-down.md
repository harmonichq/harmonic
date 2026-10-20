# Drill-down — design lock
Status: locked 2026-10-20 by Connor
Embodiment: shipped (revise): a sub-screen of the shipped Queue, built on its locked screens
Stack: the component library in `frontend/ui/` (Storybook), as `recommendations-redesign.md` §4
Frames: 390x844, 1440x900
Button sizes: 1
Canvas: Storybook `Screens/DrillDown` (Open, Pinned), frontend/ui/screens/DrillDown/DrillDown.stories.tsx

Tokens, bans, motion and component sizes are `recommendations-redesign.md`
§2.1–§2.3 and §4.1, unchanged. This page adds only what the drill-down owns.
Anything under `Open` is undecided; nothing there is a requirement.

## Navigation
- Drill-down — a pushed sub-screen of the Queue, per §2.2 Drill-down: "‹ Queue"
  on its own row, the Pattern's title below it at title size. Phone: it
  replaces the Queue above the tab bar and scrolls as one page. Desktop: it
  opens inside the Queue's detail pane and its cards flow into a grid; the
  list stays beside it. (Decided 2026-10-20.)
- Back — "‹ Queue", or the system edge-swipe, returns to the Queue as it was,
  the same item open (§1.4).

## Screens
- Queue (open card, a multi-cause Pattern) — owns: the Pattern's summary as
  locked (count, impact line, TraceChart, Snooze) and no Pin. Tapping its
  TraceChart opens the drill-down, where each cause has its own Pin; the
  chart carries a trailing "›", the same mark as every other drill-down row,
  and no other label (decided 2026-10-20).
- Queue (open card, any other item) — unchanged: Pin pins as today.
- Drill-down — reached only from a Pattern with more than one served cause.
  Owns: one card per cause, every card open, in a list: the cause's name, its
  count in the Pattern card's form, the cause's claimed episodes over the
  Pattern's own total ("9 of 45 meals", so the episodes no cause claims show
  as the gap), its episodes' glucose trace against Typical, and that cause's
  Focus button (the control every Pattern card calls Pin today; renamed by
  Q14 below) as an outlined secondary in the card's head beside the title, so
  every cause's control is in view without scrolling and the screen has no
  primary; pinned, the Focus pill sits there instead. The cards come in the
  engine's served order, which the build changes to summed severity: each
  cause's claimed episodes' mg/dL·min outside range, the engine's existing
  per-episode score, largest first. The app never sorts. Not here: Snooze,
  ranking, or any other Queue item, which live on the Queue; a cause's further
  detail, which waits for its own design (decided 2026-10-20).

## States
- Drill-down: loading — a card skeleton per cause; error — Unavailable + Retry
  in the pane; a cause of 8 or fewer episodes — thin traces, as the TraceChart
  draws them; a cause pinned — the Focus pill in its Pin's place; Pin failed —
  Not saved + Retry, as the Queue's Pin. (Copied from the Queue's locked
  states; say so if any should differ.)

## Focus, the write Pin makes (decided 2026-10-20, Q14)
- The button reads "Focus", on every Pattern and habit card and on the cause
  cards, in Pin's place and size; "Pin" leaves §1.5 and the control's name.
- Tapping it shows the Queue's transient bar, "Focus started", with the text
  action "Changes", which opens that tab; the bar is the same bar Snooze and
  Done use, with an action where theirs have Undo. The engine's refusal shows
  Not saved + Retry as today.
- Done on a Setting card is unchanged: a Trial starts through the pump, never
  through this button.
- This amends the locked Queue (recommendations-redesign.md §1.4, §1.5, §4.2
  PatternCard, HabitCard, TransientBar); the amendment there carries the words.

## Pin while a change is watched (decided 2026-10-20)
- Pin renders only while the served admission allows it
  (`GET /api/focus` `admission.focus_pin.available`). While a Trial or Focus
  is active, no card and no cause card shows Pin; the watched item shows its
  Focus pill as today, and every other card shows its chart and Snooze.
  Nothing on the Queue explains the absence.
- A multi-cause Pattern with a pinned cause shows, in Pin's place, the lock's
  caption-and-value pair: "Focus" as the caption, the cause's served title as
  the value beneath it (§2.2 Caption + value pair). On the drill-down, that
  cause's card shows the Focus pill in its Pin's place.

## Interaction map
- Tap the open card's TraceChart — desktop: click it, or Enter with it focused.
- Tap "‹ Queue" or edge-swipe — desktop: "‹ Queue" in the pane header, Escape.
- Tap Pin on a cause card — desktop: the same Pin.
- No swipe on a cause card: a horizontal swipe means Snooze on the Queue, and
  there is no Snooze here.

## Glossary
- (none new: no screen prints "Cause"; the cause cards print the habits'
  served titles)

## Served vocabulary
- Pattern title, count — `GET /api/diagnose/findings` `outcome_patterns[].title`, `rows[].count_sentences`
- Cause, cause count — `rows[].served_as.cause_counts[]` (`subject`, `title`, `count`)
- Cause traces — not served: the case file pools every cause into `traces.pattern` (engine gap)
- Cause order — `cause_counts` is in `rate_levers` roster order today; the build serves it by summed episode severity (`analyzers/scenario/severity.py`), largest first (engine gap)
- Episode cause — `finding-case-file` `occurrences[].member` (served, not yet traced)
- Pin target — `POST /api/focus` `lever`; the server overrides it with the first pinnable member (engine gap)
- Pin shown — `GET /api/focus` `admission.focus_pin.available`

## Allowed strings
- (none yet)

## Must survive (shipped only)
- A Queue card opens in place, and Snooze stays on it — Queue, a card expanded.
- A row swipe snoozes — Queue, mid-swipe.
- Back returns with the same item open — every drill-down.
- Pin on a single-cause Pattern or a habit pins as today — Queue, Habit pinned.
- One primary per screen — every screen.

## Desk lessons this page holds to
- One gesture opens one drill-down; no second panel family (#294, #298).
- Every card's count, chart and population read one served source (#79).
- No card re-derives a verdict (#294).
- No breadcrumb repeats the title; each chart has a legend at true size (#215, #222).


## Exploratory (not requested)
- Flat vs Into a rise — an agent's suggestion (#532 comment, 2026-10-19, from
  the #501 meal-trace analysis), never asked for by Connor: on a later Late
  bolus detail pane, meals bolused flat against meals bolused into a rise, by
  the Late bolus classifier's own verdict. Not part of this lock.

## Approved screens
- Drill-down at 390x844 — Storybook `Screens/DrillDown`, Open and Pinned — locked 2026-10-20 — build ticket #591

## Amendments
- 2026-10-20 Connor: the phone drill-down is a pushed sub-screen scrolling as
  one page, a flowing grid in the desktop pane, over a pager, a carousel, an
  in-place grid or a sheet. Shown the five as mocks: "a".
- 2026-10-20 Connor: only a multi-cause Pattern gets a drill-down, one headline
  card per cause, "very basically just the glucose trace vs typical"; a
  further per-cause pane is designed later. "only adopt multi-causal cards for
  now, not expand every single cause to multi-card."
- 2026-10-20 Connor: tapping the open card's chart opens the drill-down. Shown
  four entries as mocks: "I prefer tapping."
- 2026-10-20 Connor: a multi-cause Pattern's open card has no Pin; pinning
  happens only on the cause cards: "having a button called Pin that instead
  just opens another panel leading to more decisions seems wrong to me".
- 2026-10-20 Connor: Pin is hidden on every card while a change is watched,
  read from the served admission; no callout, no engine change: "the simplest
  version … that supports hiding the stupid Pin button while a focus is in
  effect".
- 2026-10-20 Connor: once a cause is pinned, the Queue card's pill keeps the
  word Focus and names the cause ("sure. A"), joined some way other than a
  middle dot: "there's gotta be a less AI-way to represent that". Then the
  caption-and-value pair, Focus over the cause's name: "use A. fuck it".
- 2026-10-20 Connor: the chart is marked with a trailing "›" and nothing
  else: "let's do the chevron".
- 2026-10-20 Connor: "Structure approved." The mock is phone-first.
- 2026-10-20 Connor, on the mock: the causes are listed as the Queue lists
  its items, rows that open in place, the first open, the open card's Pin
  filled: "why don't we on these multi-causal screens use the same logic as
  the home screen? Where you have to expand the cards?" "yep". Then
  reversed the same day, before it was drawn: every cause card open, Pin an
  outlined secondary on each, no primary on the screen: "do we just do cards
  for everything and drop the primary button entirely?" "A". The Queue keeps
  its own rows-and-one-open form.
- 2026-10-20 Connor: a cause card's count is its episodes over the Pattern's
  total, "9 of 45 meals": "a".
- 2026-10-20 Connor: cause cards come in the engine's order, and the engine
  is changed to order causes by summed severity, the area outside range he
  asked after ("does the engine rank based on … area under curve for highs,
  above curve for lows"): "A".
- 2026-10-20 Connor, on the mock: the cause card's control moves from the
  card's foot to its head beside the title: "There's gotta be a better place
  to put that tiny little pin button, and not have to expand the card to
  show it." Shown there; not objected.
- 2026-10-20 Connor: Pin becomes "Focus" everywhere, with a "Focus started"
  bar whose action opens Changes: "make it more clear that it's a focus or a
  trial or whatever. The "Pin -> Changes" integration in the app right now is
  shit." "A".
- 2026-10-20 Connor: the Flat vs Into a rise card stays exploratory, outside
  this lock: "keep it as an engine-recommended card that Connor never asked
  for but that an agent thought might be a good idea, keep it exploratory."
- 2026-10-20 Connor: "locked".
