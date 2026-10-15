# Recommendations redesign

Status: **exploring** (#481).
- Information architecture approved 2026-10-12.
- Direction approved 2026-10-12 (step 1 closed): round 3 on the design canvas,
  https://claude.ai/artifact/KHE7tPovxexxNx1ZQS8zfM, row "Current · round 3".
- Component inventory (§4) approved 2026-10-12 (step 2 closed).
- **Queue screen locked 2026-10-13**: Storybook `Screens/Queue` at commit
  `1bae486d`. The operator: "I'm happy with the queue."
- **Changes screen locked 2026-10-13**: Storybook `Screens/Changes` at commit
  `32398383`, with a delta coloured only where the engine judged that row
  better or worse. The operator: "Yes, that looks good to me. Let's proceed
  with locking it."
- **Overview screen locked 2026-10-13**: Storybook `Screens/Overview` at commit
  `0b0b78d8`: one page with no scrolling, one time-in-ranges bar for the
  selected window, colour only on Below 70 and Above 180. The operator:
  "locked."
  Revised 2026-10-14 by the operator's decisions in §2.5: one scrolling page,
  the summary as its first screenful; the glucose profile follows the window
  switch and the recent-days strip is gone; an ISF estimate card below the
  summary; each window compared with the period of the same length before it,
  its date span on the line under the window switch.
- **Day screen locked 2026-10-13**: Storybook `Screens/Day` at commit
  `4972898a`: the date in the header as a drop-down month of gapless weeks,
  the current week as a gapless ribbon on desktop, the day's insulin as one
  stacked bar (Basal delivered, Meal, Correction, Control-IQ), the day chart,
  Prompts with Not sure visible on phone, and Log carbs. The operator,
  approving it ahead of the last change: "pre-approving it".
  Re-pinned to `55fee6e4` after the operator's quieter meal teal ("just
  limit the saturation of the teal a bit"), which changes only Day's meal
  marks and its insulin bar's Meal segment.
- **Settings screen locked 2026-10-13**: Storybook `Screens/Settings` at
  commit `55fee6e4`: the grouped root (Tandem Source with its inline sync
  state, Pump profile, Glossary), the Tandem Source drill-down with its sync
  and account groups and the Update form, the Pump profile and its segment
  table, and the Glossary of only the terms the app prints. The operator:
  "locked looks good."
- **All five screens locked 2026-10-13.** Step 4 is closed.
- **Done on a Setting card, 2026-10-14** (#518, §2.5): the operator's decision,
  built on the locked Queue and Changes screens; Storybook `Screens/Queue`
  (Done, Undo, Not on pump) and `Screens/Changes` (Waiting for pump).

This document is the durable record of the redesign. Sections 1–3 are what the
build will be checked against once they are approved. The appendix keeps the
consolidated brief from the first exploration (2026-10-12) as decision history.

## 1. Information architecture (approved 2026-10-12)

### 1.1 Tabs

| Tab | Owns | Owns nothing else |
|---|---|---|
| **Queue** | The ranked recommendations, from Patterns and Settings, and the Snoozed list. | No logging, no status, no counters. |
| **Changes** | The active watched change (one Trial or one Focus) and the last finished change. | No history archive. |
| **Overview** | Standard metrics over 14, 30 or 90 days against the period of the same length before, the selected window's time-in-ranges bar and glucose profile, and the ISF estimate. | No Queue items and nothing to act on: the ISF estimate shows the engine's supported change as the Queue's card does, but changes nothing. |
| **Day** | One day's glucose, insulin and carbs, the day navigator, carb logging and Prompts. | No aggregates beyond that day. |
| **Settings** | Tandem Source (sync and account), Pump profile and the Glossary. | No preferences the engine doesn't have. |

Phone uses a bottom tab bar, and tablet and desktop use a left rail, with the same five items in the same order.

**Badges:** one system, anchored top-right of the icon.
- Count badge: Day shows the number of unanswered Prompts.
- Alert badge "!": Settings shows it when the last sync failed.

### 1.2 Errors and sync status
- **Sync state** lives only in Settings → Tandem Source.
  - The Settings badge and the root row's inline "⚠ Failed" are the only
    signals elsewhere.
  - No banner, toast or strip on any other screen.
- **Data as of** is content, not status. It appears as the selected window's
  date span on Overview ("30 Sep – 13 Oct", §2.5 2026-10-14) and as the date on
  Day.
- **Engine unavailable** (a read endpoint returns 503 or "unavailable"): the
  affected screen shows its title, the label "Unavailable" and a compact
  **Retry**. Other tabs keep working.
- **Write failed** (pin, snooze, Done, answer, log): the control returns to its prior
  state, and a transient bar shows "Not saved" with **Retry**.

### 1.3 Screen and state inventory
Each row lists a screen's states. Labels only; no state uses prose.

| Screen | Default | Empty | Loading | Error | Other states |
|---|---|---|---|---|---|
| Queue | Ranked cards, top card expanded | "0 patterns" label | Card skeletons | Unavailable + Retry | A card expanded; mid-swipe; just snoozed (bar "Snoozed · Until <date>" + Undo); just Done (bar "Waiting for pump" + Undo, §2.5); a Setting Not on pump (§2.5); Snoozed footer when N > 0 |
| Queue · Snoozed | Each snoozed item as its Queue row, plus "Until <date>" + Restore | Not reachable (the footer is hidden at 0) | — | Unavailable + Retry | Restored (row leaves) |
| Queue · setting detail | current → estimate, range, n, chart | — | Chart skeleton | Unavailable | A queued ISF: the Overview's ISF card in the Queue's frame (§2.5, 2026-10-14) |
| Changes | Active Trial or Focus + the last change as one row | "No active change" label | Skeleton | Unavailable + Retry | Maturing; Matured (result pill); last change row expanded in place; **End** (Focus: anytime; Trial: once matured) → confirm sheet → ended; Waiting for pump rows after a Done (§2.5) |
| Overview | 14 d selected; one scrolling page, the summary (window switch, date span, In range, metrics, glucose profile) its first screenful, the ISF estimate below | "No data" label per window, and in the ISF estimate when none is served | Skeleton; a window not yet read shows its profile's and ISF estimate's skeletons | Unavailable + Retry | 30 d / 90 d selected; a previous period without data (the span alone, no changes); the ISF estimate with a supported change (current → recommended), held, Uncertain, with nights beyond its axis |
| Day | Latest day with data | "No data" for a day without readings | Chart skeleton | Unavailable + Retry | Month dropped down from the header's day; desktop: the selected week as a ribbon; Prompts row when count > 0 |
| Day · Prompts | One prompt, "n / N" | Not reachable (the row is hidden at 0) | — | Not saved + Retry | Yes → grams field and keyboard; mid-swipe Not sure |
| Day · Log carbs | Grams field focused, Time = now | — | Saving | Not saved + Retry | Time edited |
| Settings | Three rows with inline status, and the Token field (§2.5) | — | Skeleton + Token field (§2.5) | Unavailable + Retry + Token field (§2.5) | Sync OK (no badge) / Failed (badge) |
| Settings · Tandem Source | Sync rows + account rows | Account "Not set" + Update | — | — | Updating credentials |
| Settings · Pump profile | The active profile's segments | "No profile" label | — | — | — |
| Settings · Glossary | Alphabetical terms | — | — | — | — |

### 1.3a Ending a change (decided 2026-10-12)
- **End** is a compact secondary action on the active change. There is no note
  field: the engine accepts an optional free-text conclusion, but the app never
  sends one.
- **Focus:** End is available at any time (`POST /api/focus/{id}/resolve`).
- **Trial:** End appears once the change has matured
  (`POST /api/verify/trials/{id}/finish`). The engine refuses it before then
  (`immature_trial`). To end a Trial early, put the previous value back on the
  pump; the engine closes it as reverted on its own.
- Ending is one tap, then a confirm sheet with **End** as its only primary.

### 1.4 Touch gestures and their desktop equivalents

| Touch (phone, tablet) | Desktop |
|---|---|
| Tap a Queue card to expand it in place | Click or ↑/↓ to select in the list; the detail shows in the right pane |
| Swipe a Queue row: it follows the finger, and released past half its Snooze reveal it snoozes, as the Snooze text action beneath Pin does (a Setting card: at its foot), with the same bar and Undo; short of half it settles back | The same Snooze text action; shortcut S |
| Swipe a Prompt: released past half its Not sure reveal it records Not sure and moves to the next, as the Not sure text action beneath its answers does; short of half it settles back | A fourth button, **Not sure** |
| Tap the day in the Day header to drop the month down, its weeks as gapless ribbons | The same drop-down, a popover under the day; the selected week stays in view as a ribbon |
| Pick a day in the month (it closes); the scrim closes it unchanged | Pick a day in the month or the week in view; Escape closes it unchanged |
| Bottom sheet for Log carbs, on the system keyboard | Popover anchored to "+ Log carbs" |
| Tap Undo in the snooze bar | Same bar, clickable; ⌘Z |
| Tap Done on an open Setting card; Undo in its "Waiting for pump" bar | The same Done and bar; ⌘Z undoes (§2.5, 2026-10-14 Done) |
| Tap "‹ Parent" in a drill-down's header (the system edge-swipe also goes back) | The same "‹ Parent" control in the pane's header |

Desktop has no hover-revealed actions, and every action has a visible control.
Every touch gesture has a visible equivalent on the phone as well: a swipe is a
shortcut, never the only way (Snooze is also a text action on the open
card). Back from a drill-down is the "‹ Parent" control in the screen header;
the system's own edge-swipe back is left to the platform, never overridden.

### 1.5 Glossary (every user-facing noun and verb)

| Term | Kind | Meaning |
|---|---|---|
| **Queue** | noun | The ranked list of recommendations. |
| **Pattern** | noun | A recurring glucose outcome the engine detected, such as highs after meals. |
| **Pin** | verb | Start a Focus on a Pattern's habit. |
| **Focus** | noun | A habit you pinned, watched for adherence and outcome. |
| **Trial** | noun | A pump setting change the app detected, watched against its before period. |
| **Change** | noun | A Trial or a Focus. One is active at a time. |
| **Maturing** | state | A change still collecting its 14 days of after data. |
| **Better / Worse / Unclear** | state | A matured change's result against its before period. |
| **Snooze** | verb | Remove from the Queue for 14 days. It returns early if the evidence changes. |
| **Restore** | verb | Bring a snoozed item back. |
| **Undo** | verb | Reverse the last snooze or Done. |
| **Done** | verb | Mark a Setting's change as programmed into the pump. The next sync checks it. |
| **Waiting for pump** | state | Done, and no sync has shown the pump since. |
| **Not on pump** | state | The sync after a Done found the Setting unchanged on the pump. |
| **Range** | noun | The engine's interval for a Setting's estimate. |
| **Uncertain** | state | Not yet clear enough to act on: the evidence behind it is thin. |
| **Peak / Nadir** | noun | The highest or lowest glucose after an event such as a meal, as the median across the events counted, in mg/dL. |
| **Typical** | noun | The same for the comparison events: similar events that did not end in the Pattern's outcome. |
| **Glucose profile** | noun | Glucose by time of day over the selected window (14, 30 or 90 days): the median and the 10th–90th percentile spread. |
| **Fasting** | state | No food and no recent bolus: the nights an ISF estimate is read from. |
| **Median** | noun | The middle value of the profile at that time of day. |
| **Yes / No / False low / Not sure** | answer | The answers to whether carbs were eaten for a low. False low marks the reading itself as invalid. |
| **Log carbs** | verb | Record carbs eaten without a bolus. |
| **End** | verb | Stop watching the active change. |
| **Recorded** | state | An answer or entry was saved. |
| **In range, Below 70, Below 54, Above 180, Above 250, Mean, GMI, CV** | metric | The standard CGM metrics. Below 54 and Above 250 are shown as subsets of Below 70 and Above 180, never as separate bands of the same total. |
| **Tandem Source** | noun | The vendor account the data syncs from. |
| **Pump profile** | noun | The active pump settings, read-only. |
| **ISF** | noun | Insulin sensitivity factor, the pump's correction factor: how far one unit of insulin lowers glucose, in mg/dL. |
| **I:C** | noun | Insulin-to-carb ratio, the pump's carb ratio: the grams of carbs one unit of insulin covers. |
| **DIA** | noun | Duration of insulin action: how long the pump counts a bolus as still working, in hours. |
| **Sleep** | noun | The pump's sleep schedule, when Control-IQ runs its tighter overnight target. |
| **Site change** | noun | A new infusion site and cartridge, as the pump logged it. |
| **Insulin** | noun | Everything the pump delivered in a day, basal and boluses together, in units (U). |
| **Basal** | noun | The insulin the pump delivered steadily through the day, including Control-IQ's changes to the programmed rate. |
| **Suspend** | noun | A stretch when the pump delivered no basal, whether Control-IQ or you stopped it. |
| **Meal** | noun | A bolus for carbs, or the carbs part of a bolus. |
| **Correction** | noun | A bolus you gave to bring glucose down, or the correction part of a meal bolus. |
| **Control-IQ** | noun | The pump's automatic boluses, as the day's insulin counts them. |

Any domain term not in this table may not appear in the UI. Plain interface
words (labels, verbs, units, dates) are exempt; see the 2026-10-13 amendment
in §2.

## 2. Lock (approved draft — binding once a direction is locked)

### 2.1 Tokens (from the running app, `frontend/material.css` `:root`)

| Role | Token | Value |
|---|---|---|
| Canvas | `--wk-canvas` | #0f0d0b |
| Surface | `--wk-surface` | #221e1b |
| Surface, sunken | `--wk-surface-sunken` | #14120f |
| Surface, rail | `--wk-surface-rail` | #2b2622 |
| Ink | `--wk-ink` | #f2ede2 |
| Ink, body | `--wk-ink-body` | #cfc8bd |
| Ink, meta | `--wk-ink-meta` | #a49c90 |
| Rule | `--wk-rule` | #3f3833 |
| Primary (library; the one accent: interaction, selection, the engine's estimate; overrides `material.css`'s orange) | `--primary` | #7aa8e6 |
| On primary | `--on-primary` | #0d1522 |
| Focus ring | `--ring` | `--primary` at 34% |
| In range | `--in-range` | #86ad78 |
| High | `--high` | #e2be4c |
| Low | `--low` | #ec6f55 |
| Warn | `--warn` | #c98a4e |
| Danger | `--danger` | #ec6f55 |
| Manual carb | `--manual-carb` | #d2743e |
| Radius | `--radius` | 4px |
| Glucose <54 (library, clinical AGP) | `--glucose-very-low` | #cc3d44 |
| Glucose 54–69 (library, clinical AGP) | `--glucose-low` | #ee6457 |
| Glucose 70–180 (library, clinical AGP) | `--glucose-in-range` | #7ec476 |
| Glucose 181–250 (library, clinical AGP) | `--glucose-high` | #efcf4c |
| Glucose >250 (library, clinical AGP) | `--glucose-very-high` | #f08a3c |
| In range, quiet (library; a day's trace and other large in-range areas) | `--glucose-in-range-quiet` | `--glucose-in-range` mixed 50% with `--wk-ink-body` (oklab) |
| Meal (library; meal bolus and logged-carb glyphs and their grams, the one coloured day-event family) | `--ui-meal` | #86bdbd (a quiet teal: 7.90:1 on `--wk-surface`, 9.26:1 on `--wk-canvas`) |

- **Glucose bands follow the clinical AGP colours** (the 2019 international
  consensus on time in range, as Dexcom Clarity and LibreView draw them): very
  low dark red, low red, in range green, high yellow, very high orange. These
  are component-library tokens in `frontend/ui/tokens.css`, not
  `material.css`; the running app keeps its own `--low` / `--in-range` /
  `--high`. Each clears 3:1 against `--wk-surface` (3.40, 5.20, 7.91, 10.79,
  6.62) and adjacent bands step in lightness as well as hue. <54 and >250 keep
  their hatching as the non-colour cue. Better/worse change colours stay
  `--wk-status-favorable` / `--wk-status-adverse`: they mean direction, not
  glucose.

- **Dark only** (`color-scheme: dark`), decided 2026-10-12. The light palette
  used by the exploration mockups is retired.
- Font: Inter, then the system stack.
- Type scale, five steps with tabular numerals: 34 / 22 / 17 / 13 / 11 px.
- Spacing: a 4/8 grid. Side margin 16 phone, 24 tablet, 32 desktop.

### 2.2 Components (one size per role)

| Role | Spec |
|---|---|
| Primary action | Full width, 50 px tall, `--primary` fill. One per screen. |
| Secondary action | 32 px, outlined neutral. |
| Text action | 32 px hit area, `--primary` text, no fill. |
| Icon button | 44 px target, 20 px glyph. |
| Answer button (Prompt) | 44 px, outlined neutral, equal widths. |
| List row | 48 px minimum, label left, value right, optional ›. |
| Numeric input | Sized to 3 digits, unit inline, the system numeric keyboard. |
| State pill | Borderless tinted tag: 18 px, 2 px radius, uppercase 11 px label, the state's tone at 15% fill (Unclear on the rail surface). No outline, so it never reads as a button. Item kinds take no pill: the kind glyph carries Pattern vs Setting. |
| Badge | 16 px; a count pill or an alert "!". |
| Caption + value pair | A caption names the value it sits with and reads as one unit with it: stacked, the caption directly above the value, left edges aligned (Nights / Range); or inline, the caption before the value on the value's own baseline (`align-items: baseline`), never centred against it. |
| Tab bar item / rail item | 44 px target, 24 px glyph above the label. The phone tab bar is 64 px tall above the device's bottom inset (none on a phone without one), its items centred in it (§2.5, 2026-10-14). The selected item carries Material 3's active indicator: a pill behind the icon, 64 x 32 px on the tab bar and 56 x 32 on the rail, fully rounded, `--primary` at 18%, the icon centred in it and the label below it. The icon and label take the accent. Badges stay top-right of the icon, above the pill. The pill fades and scales in over `--ui-motion-standard` and is instant under reduced motion. |
| Sheet | Bottom-attached, 12 px top radius, grabber. |
| Popover | Anchored to its trigger. |
| Transient bar | Above the tab bar, label and one text action. |
| Drill-down (back) | A screen that opens a sub-screen pushes it: the sub-screen's ScreenHeader gains a leading back control, "‹" and the parent screen's name ("‹ Queue"), 44 px target, in the text-action blue, on its own row; the sub-screen's title sits below it at title size, left-aligned (large-title convention, the same on every drill-down). Phone: the sub-screen replaces the screen above the tab bar, which stays; back returns to the parent as it was (the same item open). Desktop: the drill-down happens inside the pane that owns it, with the same back control in that pane's header. |
| Charts | A chart takes its container's full width at every size: it measures its box and lays out to it, so its type stays at its true px size (never a stretched viewBox), and its axis stays flush with the card's text column. No chart has a fixed width. |
| Scrolling | A screen's content scrolls as one page: on phone the content scrolls under the fixed screen header and above the fixed tab bar and transient bar; on desktop each pane scrolls on its own, as a whole pane. |

### 2.3 Absolute bans
1. **Microcopy:** any sentence, question, subtitle, caption, explanation,
   empty-state prose or tooltip sentence. The Glossary definitions are the only
   exception.
2. **Predictions** of any kind.
3. **Invented labels, actions, advice, thresholds or targets.** Every domain
   term comes from §1.5; plain interface words are exempt (amendment
   2026-10-13).
4. **Colour as the only signal.** Every state carries a glyph, label or position.
5. **More than one primary action per screen**, or any other accent-filled control.
6. **Nested scrolling.** No scroll area inside a card, table, row or cell:
   content inside a component never scrolls on its own; only a screen's page
   (or a desktop pane) scrolls. The story check enforces it.
7. **Content not in the engine's served data.** Every value traces to an
   endpoint field. The checks are `copycheck.py` and the provenance table.

### 2.4 Approved screen list
The inventory in §1.3, with phone screens at 390 px and desktop at 1440 px.
Tablet follows desktop's structure at 1180 px. Approved 2026-10-12.

### 2.5 Amendments
- **2026-10-13 — plain interface words are not glossary terms.** The labels
  Before, After, Days, Next, Time, Now, Save, Not saved, Retry and Cancel, and
  the month abbreviations of a date, may appear without a §1.5 entry. The operator:
  "I don't think those need to be glossary terms, they're just... words."
  §1.5 now governs domain terms only.
- **2026-10-13 — Sleep and Site change join the glossary** so the Day chart
  can draw the timeline's sleep windows and site changes.
- **2026-10-13 — screens scroll as one page; nothing scrolls inside a
  component.** The operator: "It's perfectly fine for a queue to scroll… we
  don't want tables that have to scroll within the cell that they live in."
  This replaces the exploration brief's "no scrolling" rule (Appendix §1, rule
  7) for the built screens; see §2.2 Scrolling and §2.3 ban 6.
- **2026-10-13 — one drill-down pattern for every sub-screen.** The operator:
  "we need some kind of standard navigation framework for drill downs, and I'm
  sure the snoozed list is going to be the same." See §2.2 Drill-down: Queue →
  Snoozed and Settings → Tandem Source, Pump profile and Glossary use it.
- **2026-10-13 — episodes and the other brief items are deferred, not cut.**
  The operator, on an episodes drill-in: it "is potentially something we can
  consider, but I'm trying to keep this lightweight for now without
  necessarily cutting what the back end can deliver." See §2.6.
- **2026-10-13 — Snooze has a visible control on the phone.** The operator
  decided the phone's open card carries the same Snooze icon button as desktop,
  in its own header row; the swipe stays as the shortcut (§1.4). Its place
  is superseded below: Snooze is now a text action beneath Pin.
- **2026-10-13 — the desktop detail pane is filled by its card.** The operator
  decided the open card fills its pane up to a 720 px reading width, left-aligned
  with the pane's margin, with Snooze in the card's own header row and no
  collapse chevron (the card does not collapse on desktop).
  Superseded for Snooze's place by the next amendment.
- **2026-10-13 — Snooze is a text action beneath Pin.** The operator asked
  "shouldn't snooze be next to pin as a little minor button", then chose
  Apple's stacked primary-plus-lesser layout ("Continue" over "Not Now") over
  Material's side-by-side row: Pin stays the full-width primary, Snooze is a
  centred text action 16 px beneath it, and a Setting card carries the same
  action at its foot. The header's Snooze icon button is removed on phone and
  desktop; S and the phone swipe stay as shortcuts.
- **2026-10-13 — a Snoozed item reads as its Queue row.** The operator: "I
  think the snoozed items can have slightly more detail, kind of looking just
  like their original rows looked … we have room to show a little bit more in
  that screen." The Snoozed list draws each item with QueueRow's snoozed state
  (glyph, title, kind pill, magnitude and cause), plus Until and Restore.
  *Amended 2026-10-14:* the cause is gone from every row, Snoozed included,
  so a Snoozed row reads glyph, title, magnitude, plus Until and Restore.
- **2026-10-13 — the state pill is a tinted tag, and kinds take no pill.** The
  operator: "I don't like that the restore button and the pattern pill look
  extremely similar … that goes for all of them." Of three treatments, the
  borderless tinted tag was chosen and the leading dot rejected ("I really
  don't like the dot"); see §2.2 State pill. The Pattern and Setting pills are
  removed: "we're already indicating patterns vs. settings with a little icon
  next to the row." The row's kind glyph is named Pattern or Setting for
  assistive tech, so the kind is still said in words.
- **2026-10-13 — only settings have a range.** The operator: "Only settings
  should have a range." The Range line leaves the Pattern card; Uncertain
  (ADR 485) carries a pattern's confidence, and §1.5 Range now means a
  Setting's estimate interval. On the same card's Range line the operator saw
  the caption "looks odd, like it's off-centered and just kind of like a
  different text than the numbers it's describing": it was centred beside a
  larger value. §2.2 now sets the caption + value pair: stacked, or inline on
  one baseline.
- **2026-10-13 — the open Pattern card carries an impact line.** The operator
  asked whether each item could carry "a very brief impact indicator for the
  glucose impact", and chose the open card over the collapsed row. Under the
  magnitude: "Peak 227 · Typical 164 mg/dL" for a high Pattern, Nadir for a low
  one, read from the Pattern's case file (the matched and comparison cohorts'
  median traces after the anchor). A Pattern the case file serves no
  comparison for shows no line. Peak, Nadir and Typical join §1.5.
- **2026-10-13 — a pattern with no attributed cause keeps its colour.** The
  operator, on Overnight lows drawn in a neutral fill: "Wouldn't we just use
  that yellow for the single cause? Like the non-striped, non-banded yellow?"
  Its occurrences now take the solid tone a single cause takes (§4.2
  CauseWaffle); the legend still names only the base cells.
- **2026-10-13 — a Focus is tracked like a Trial.** The operator, seeing the
  Focus card carry only its title: "why doesn't focus have any kind of data
  tracking to go with it?", then "update it, just like the trial." The Focus
  card now shows how often the habit happened before → after, its meals
  counted against the engine's gate as ticks, the result the engine serves
  for the habit, and Before/After for the outcomes its Pattern maps to and
  the glossary metrics (§4.2 ChangeCard).
- **2026-10-13 — a resolved change carries its deltas.** The operator:
  "Resolved trials and focuses both need to carry delta values with color
  indicators. And up-down arrows. I think we already have that in other
  elements of the design," and asked that the two be kept in sync. One Delta
  element (▲/▼, the amount, favourable or adverse colour) now serves both
  MetricFigure and ChangeCard. On a change, a row is green or red only where
  the engine judged that row better or worse; an unclear or context row moves
  in neutral ink. Every derived difference is taken between the values as
  printed, so a delta always equals the numbers beside it.
- **2026-10-13 — the last change is one row.** The operator: "the previous
  change should show as a small row that can be extended … I guess we can
  leave a slot, like a one row small slot for previous change. but I'm not
  trying to maintain a queue of all past changes in a historical record." The
  most recently ended change is one disclosure row (what changed, when, its
  result) that expands in place into its ended card; there is only ever one.
- **2026-10-13 — the Overview never scrolls** (reversed 2026-10-14, below). The operator: "No scrolling
  for the overview page." It fits one 390 × 844 phone screen and a 1440 × 900
  desktop pane: three metrics to a row and a shorter glucose-profile plot on
  phone. A story fails if its page overflows. This narrows the one-page
  scrolling amendment above for this screen only.
- **2026-10-13 — one time-in-ranges bar, and quieter colours.** The operator
  chose one bar for the selected window over the brief's three ("one bar for
  the selected window as built"), and "quiet the colors down": on the Overview
  only Below 70 and Above 180 changes take red or green; every other change
  keeps a neutral arrow, as the brief had it.
- **2026-10-13 — charts take their container's width.** The operator: "fix
  the chart width to be responsive on desktop." The Setting card's evidence
  chart had stayed at its phone width inside a wide desktop card; every chart
  now measures its box and lays out to it (§2.2 Charts).
- **2026-10-13 — Not sure has a visible control on the phone.** The phone's
  Prompt reached Not sure only by a swipe, against §1.4's rule that a swipe is
  a shortcut, never the only way. Of the options put to the operator he chose
  the recommended one: "Your recommendations." Not sure is a text action
  centred beneath Yes · No · False low, as Snooze sits beneath Pin; the swipe
  stays as its shortcut, and desktop keeps its fourth answer (§1.4, §4.2
  PromptCard).
- **2026-10-13 — Day picks its day from a drop-down, and the days run
  gapless.** The operator, on the built Day: "It feels cramped on the phone. I
  think the ability to view different day … needs to be a drop-down or
  something; it should not be always visible," and "I think the days should
  chain together so it's like a gapless kind of view," and "on desktop, the
  current week is always visible, and you can drop down the month." Of two
  mocked options he chose "4. B". The week strip, the Month sheet and the
  desktop month pane are gone. The day in the header is the control that drops
  the month down as its weeks, each a DayRibbon (§4.2 DayRibbon) with every day's
  counts and %; picking a day closes it. Desktop is one pane, the selected
  week in view as a ribbon under the header (§1.3, §1.4).
- **2026-10-13 — the day's insulin, split.** The operator: "it would be nice
  to split correction from meal from Control-IQ and to really like split those
  numbers." Of two mocked options he chose "5. A": one stacked bar for the
  day's total, its parts labelled beneath in U and % — Basal (delivered),
  Meal, Correction and Control-IQ (its automatic boluses only). Beside Basal,
  outside the bar, one signed figure, delivered − Pump profile in U, which is
  negative when Control-IQ cuts or suspends basal: "Yeah, I think B sounds
  good because then we'll be able to see like programmed vs. delivered
  basal." The engine serves these through #492 (basal delivered, basal
  programmed, meal, correction, Control-IQ bolus, total); the bar waits for
  it (§4.2 InsulinBar). Insulin, Basal, Meal, Correction and Control-IQ join
  §1.5. The signed figure beside Basal was dropped before it shipped; see the
  next amendment.
- **2026-10-13 — the insulin bar as built.**
  Decisions on the built Day. Basal shows only what was delivered, its
  U and %, with no Pump profile figure beside it, signed or not: "for basal
  just show delivered amount I don't need the +/-". Each part and the total
  print their own value to one decimal, and each % is that part as printed ÷
  the total as printed, so the %s are not forced to sum to 100 (the
  operator: "your recs."). A third change, dropping the desktop week's
  traces after "Let's not duplicate data on tablet view though that's silly.
  why showing the same graphs twice", was reverted: the operator had read a
  phone-and-desktop composite as one desktop split pane ("my bad I actually
  misread the single screenshot with 3 renderings as a single desktop
  experience so I thought we had duplicated the [right] and left sides of a
  split pane"), and answered "yes restore the traces". The desktop week keeps
  its traces (§4.2 DayRibbon, InsulinBar).
- **2026-10-13 — the glossary lists only what the app prints.** The
  operator, on the Glossary page: "Looks good, though isn't 'cause' dropped
  from the frontend?" No built screen prints it. An audit of the text every
  screen renders (not names read only by assistive tech) found five more
  terms no screen prints, and §1.5 drops all six: Cause (no screen names a
  Pattern's cause by that word), Episode (the episode drill-in is deferred,
  §2.6), Prompt (Day calls its prompts "Lows"), Setting (only the Queue row's
  kind glyph names it, for assistive tech; the word stays allowed for that
  name), and the metrics Pre-meal and Post-meal 2 h (no screen shows them).
  The answers' definition no longer leans on "Prompt".
- **2026-10-13 — a quieter teal.** The operator: "I'm not loving the teal.
  The day tab especially on desktop looks like a candyland … just limit the
  saturation of the teal a bit." `--ui-meal` keeps its hue and lightness at
  half its chroma (OKLCH 0.76, 0.116 → 0.057): #3cc8c8 becomes #86bdbd, still
  7.90:1 on `--wk-surface` and 9.26:1 on `--wk-canvas` (§2.1). Only Day draws
  it: the meal and logged-carb marks and grams, and the insulin bar's Meal.
- **2026-10-13 — motion, a full swipe acts, and what opens also closes.**
  The library moves on three durations, 120 / 200 / 280 ms
  (`--ui-motion-fast`, `--ui-motion-standard`, `--ui-motion-emphasized`), and
  two easings that never overshoot (`--ui-ease-standard`,
  `--ui-ease-emphasized`): a sheet rises, a popover opens out of its arrow, a
  drill-down pushes in from the right and back from the left, a card or
  disclosure grows open in place, the bar rises, the month drops down, the
  next prompt comes in, skeletons shimmer, and a press lands at once. Motion
  only ever ends where the layout already rests; a screen that opens with
  something open shows it still. Under reduced motion nothing travels: every
  movement is an instant change or a fade of at most 120 ms, and the shimmer
  stops. Asked whether a full swipe should act, the operator chose "13. A":
  a Queue row released past half its reveal snoozes, with the same bar and
  Undo as Snooze; a Prompt released past half records Not sure and moves on;
  short of half either settles back (§1.4). Asked whether what opens should
  close in motion, he chose "14. A": sheets, popovers, the month, the bar and
  a collapsing card or disclosure leave in about 200 ms, the reverse of their
  opening on the standard easing, instantly or as a 120 ms fade under reduced
  motion.

- **2026-10-13 — a wordmark on the desktop rail, and the mark in the new
  colours.** No built screen printed "Harmonic", and the desk's orange mark
  went with the desk (#495). Of the options put to the operator, he chose a
  wordmark at the top of the desktop rail only: "B but I guess we should
  change from the existing orange huh?", then, for its colours, "A". The rail
  opens with the existing mark, an Inter capital H in a 24 px square of 6 px
  radius, with "Harmonic" at 11 px semibold beneath it, stacked like a rail
  item above Queue but not one: nothing to press. The square is `--wk-ink`
  with the H in `--wk-canvas`, and the name is `--wk-ink`, never the accent,
  which means interactive or selected. The phone's tab bar has no wordmark.
  The favicon is the same mark in `--primary` with the H in `--on-primary`;
  the page title stays "Harmonic" (§4.2 NavBar).

- **2026-10-13 — Settings loads and fails like every screen.** The screen
  inventory (§1.3) gave Settings no Loading or Error state: the lock had none,
  though its rows are read from the engine like every other screen's. As
  built (#495), Settings shows its title over a skeleton of the root list
  while its answers load, and its title, Unavailable and Retry when they
  cannot be read, as §1.2 has every other screen do. No new words.

- **2026-10-14 — a collapsed row drops its cause, and carries the impact as
  a delta.** On the collapsed rows the operator asked: "And why are we
  repeating labels here? … it's the same thing". That first dropped the cause
  from single-cause rows; the operator then decided: "drop the leading cause
  entirely." No collapsed row names a cause, whatever its Pattern's causes;
  the second line is the magnitude alone ("38 of 137 meals"), with the
  trailing impact value as below. The Snoozed list's rows follow, as they draw
  with QueueRow's snoozed state. The open card's waffle and legend are
  unchanged and still name the causes. On the impact, which the 2026-10-13 amendment had kept to the
  open card: "for the impact number I want a comparison. or a delta maybe?…",
  and of three mocked rows "the format of B is more to my liking". A Pattern
  row with an impact ends in a trailing value: Peak (high) or Nadir (low) as a
  caption on the title line, and beneath it, on the magnitude line, the shared
  Delta of the Pattern's own value minus Typical (each as the open card prints
  it), in mg/dL. The pair is stacked, left edges aligned (§2.2). The Delta is
  neutral ink: the engine judges neither cohort better or worse, so the arrow
  alone gives the direction. Mock B's two flaws are not carried over: the
  value fits the row's two lines, so a row is the same height with or without
  it, and the chevron stays on the title line. A row with no impact (no case
  file, a standalone habit, a Setting) has no trailing value. The open card
  keeps its full "Peak 227 · Typical 164 mg/dL" line.

- **2026-10-14 — the selected tab's indicator is Material 3's pill.** The
  selected item showed a short bar above its icon. The operator: "this
  selected indicator should I think be underneath the icon on phone, and left
  or right on tablet and desktop. Unless apple or google design standards have
  other options which I'm open to." Of the options put to him he chose "A",
  Material 3's active indicator. A tinted pill sits behind the selected icon,
  64 x 32 px on the phone tab bar and 56 x 32 on the tablet/desktop rail, fully
  rounded, `--primary` at 18%, the icon centred in it and the label below.
  The icon and label keep the accent. The bar above the icon is gone. Targets
  stay 44 px, the badges stay top-right of the icon above the pill, and the
  rail wordmark is untouched. The pill fades and scales in over
  `--ui-motion-standard` on a selection change and is instant under reduced
  motion. The pill and label overflow the 44 px target by a few px, inside the
  existing spacing (§2.2 Tab bar / rail item).

- **2026-10-14 — the phone tab bar is shorter and its glyphs larger.** On
  his Android phone the operator found the tab bar "too tall. It's just
  there's too much dead space underneath the icons. And maybe the icons are
  too small?" The bar was 84 px with a fixed 34 px reserved under the items
  for an iPhone's home indicator, empty on a phone without one. The bar now
  matches Material 3 Expressive's flexible navigation bar: 64 px from its
  top rule, the 44 px items centred in it, then the device's own bottom inset
  and nothing more. The glyphs grow from 20 to 24 px, Material 3's
  navigation glyph, on the tab bar and the rail alike. The pill stays (he
  compared a filled icon with no pill and a pill, and the pill is current
  Material 3), as do the 11 px caption label and the 44 px target
  (§2.2 Tab bar / rail item, §4.1).

- **2026-10-14 — the selected day fills its column, and the month steps.** The
  operator, on the Day screen's month drop-down: "selected day is nearly
  impossible to see." The thin bar at the top of the selected day's column is
  gone. The whole column (weekday, date, its trace segment, counts and %)
  takes a `--primary` tint at 18% with a 7 px radius, as the NavBar's
  selection pill does, and its weekday and date are `--primary`; the trace and
  its glucose zone colours are unchanged and run on across the column, the
  tint behind them. The fill and the blue date both mark it, so selection
  keeps a position as well as a colour. It applies in the month drop-down and
  the desktop week alike (§4.2 DayRibbon). On the same screen: "and month
  left/right buttons are disabled." ‹ and › now step a month: ‹ is enabled
  while the month is after the first month with readings, › up to the latest.
  A month shows the drop-down's skeleton while it is read and, when it cannot
  be, Unavailable with Retry inside the drop-down. A day picked in another
  month opens that day, and on desktop the week in view follows the selected
  day across month boundaries.
- **2026-10-14 — the glucose profile follows the window; the recent-days strip
  is gone.** The operator, on a profile fixed at 30 days under a 14 / 30 / 90 d
  switch: "but then 30d and 90d don't switch it so it feels odd to me", then
  "21. B". The engine serves the profile for 14, 30 or 90 days
  (`/api/explore/time-of-day?days=`), the profile shows the selected window's,
  and the desktop's recent-days strip is removed. Day draws its days as
  DayRibbon, so the standalone DayTile goes with it (§4.2 DayRibbon,
  GlucoseProfile).
- **2026-10-14 — the Overview scrolls as one page.** The operator: "25. B for
  now sure. We can rethink later". This reverses the 2026-10-13 amendment "the
  Overview never scrolls": the Overview scrolls as every other screen does
  (§2.2 Scrolling), and the one-page rule stands, so nothing inside a component
  scrolls (§2.3 ban 6). The summary (the window switch and its date line, In
  range, the metrics and the glucose profile) is the first screenful at 390 ×
  844 and 1440 × 900; what follows it scrolls. The stories that failed on an
  overflowing page are removed.
- **2026-10-14 — an ISF estimate on the Overview.** Of the options put to the
  operator he chose "24 A", "26 B" and "28 A": a card below the summary, titled
  "ISF" with "estimate", drawing the selected window's evidence as an
  EvidenceChart: a dot per night's ISF fit, the Estimate line in its Range
  band, and the Current line. Beneath it, Estimate, Range and Fasting nights
  (the nights the estimate counts). The Uncertain tag when the engine flags the
  estimate wide. When the engine supports a change (its one ISF staging verdict),
  "current → recommended" stands above the chart as on the Queue's Setting card;
  otherwise there is no figure. The axis goes below 0 only when the Range does.
  Fasting joins §1.5; Estimate is a plain word, as the chart already prints it
  (§4.2 IsfCard).
- **2026-10-14 — an ISF the engine stages is queued, as the Overview's card.**
  The operator: "I think ISF can show up in the queue if there is an asserted
  change and then we just use the card design that we came up with basically
  or a slight modification thereof from the overview page. But I think, well,
  it can pretty much always exist on the overview page as an estimate, you
  know what I mean?" The engine queues ISF only when its one ISF staging
  verdict supports the change (ADR 504); a held, direction-only or
  unprogrammed ISF stays out of the Queue. A queued ISF's row is the Setting
  row with no time block (ISF is one fasting value): "ISF", then current →
  recommended. Open, it is the IsfCard in the Queue's frame: titled "ISF"
  alone, as its row is, with the figure, the fasting nights' EvidenceChart,
  Estimate, Range and Fasting nights, and the Setting card's Snooze at its
  foot. It is changed on the pump, so it has no other action. The Overview's
  ISF estimate card is unchanged and always shown (§4.2 QueueRow, SettingCard,
  IsfCard).
- **2026-10-14 — edge counts sit outside the plot.** The operator, on the
  nights beyond the axis ("‹ 3", "2 ›"): "clean up how those edge counts are
  handled, they collide with the data". A count now takes a gutter reserved at
  its end of the axis, which the axis and every mark stop short of, so it can
  never touch a dot, the band or a line. The EvidenceChart is shared, and the
  locked basal Setting card had the same collision (its counts were lifted
  over the end stacks, inside the plot), so it takes the same rule; a chart
  with no night beyond its axis reserves no gutter and draws as before (§4.2
  EvidenceChart).
- **2026-10-14 — each window against the period before it.** The operator:
  "do we even need those deltas? I think 14d should compare previous 14 MAYBE?"
  then "31 A, with the comparison named once in a place that makes sense." Each
  metric's change is now against the period of the same length just before the
  window (14 d against the 14 days before it, 30 against 30, 90 against 90),
  which the engine serves with each window's outcomes, by the same definitions.
  The colour rule is unchanged: only Below 70 and Above 180 take favourable or
  adverse colour. A previous period without data shows no changes (§4.2
  MetricFigure).
- **2026-10-14 — the window's date span, and the comparison named once.** The
  operator: "Name a date span entirely, not just a single 'to'". The header's
  "To 13 Oct" is gone; on the line under the window switch the window's first
  and last served days print as a span, then the comparison:
  "30 Sep – 13 Oct · vs previous 14 d". With no data before the window, the
  span stands alone. "vs" and "previous" are plain words (§1.2, §4.2
  ScreenHeader).

- **2026-10-14 — the Day chart's basal lane and the engine's marks, as the
  desk drew them.** The operator, on the redesigned Day chart: "basal lane is
  nearly useless. can't read shit." then "honestly steal from the desk,
  whatever we currently have for the day graph is pretty good". He added
  "Including seeing event triggers." and "by event triggers I also mean
  ENGINE DATA". The desk's daily chart drew basal not as a rate but as its
  difference from the programmed rate, around a zero line, with the engine's
  findings as marks at their time named in its Episode Log; the redesign's
  lane drew the delivered area under a 30 px scale, where a Control-IQ change
  of a few tenths of a unit was a pixel. §4.2 DayChart now draws:
  - **Basal against the Pump profile.** The lane is 72 px on desktop and
    56 px on the phone (the desk's 13 % of its chart), and its zero line is
    the Pump profile, dashed. Where Control-IQ delivered more than programmed
    a bar rises above the line in body ink; less, a lighter grey bar hangs
    below; nothing delivered (any run of zero-rate rows, as the desk keyed
    it) reaches down by the whole programmed rate, hatched, and is a
    **Suspend**, which joins §1.5. Slots of one difference merge into one bar
    per held command, a gap stays empty, and the linear scale is at least
    0.3 U/h each side with 15 % headroom, its two signed ticks labelled
    ("+1.7 U/h", "−1.4"). Above and below are told apart by side as well as
    tone. Legend: Basal (both tones), Pump profile (the dashed line), and
    Suspend (hatched) on a day that has one. To keep the Day pane inside
    its 1440 × 900 frame (Appendix §2, rule 7) with the taller lane and the
    Pattern row, the desktop glucose plot gives up 55 px (260 → 205 px),
    close to the desk's own three to one of glucose to basal; the phone's
    plot is unchanged.
  - **The engine's marks.** Each moment the engine counted toward a habit on
    that day, read from `/api/model-view?date=` (the desk's own read), takes
    the Pattern glyph on a new top row of the marks lane, at its time, above
    the bolus and carbs rows. A moment that drove its episode's habit
    (`state` fired) is named by the episode's served `lever_title`; one
    another habit's episode claimed (`outranked`) by the served titles of the
    verdicts it matched itself. Nothing the engine only checked, or found
    clean, is marked. The names are visible, never hovered (§1.4): a bolus
    the engine counted carries them in its event-list row ("13:10 Meal ·
    Carb undercount  30 g  3.53 U"), and any other moment (a low, a high) is
    its own row, the Pattern glyph, its habits and its reading in mg/dL.
    The habits the engine is cutting (Meal bolus fell short, High-carb
    sequence, Repeat eating) are never marked. Legend: Pattern, on a day
    that has one.
    *Amended 2026-10-14 (every finding of the day, below):* the engine now
    serves which moments are marked, and the frontend reads no anchor state.
  - **Not carried over.** The desk's hover tooltip (the delivered and
    programmed rates, the command's length): §1.4 bans hover-only content,
    and the signed scale and the bars carry the same reading. Its rate
    source, which the timeline serves as `basal[].delivery_type`: the desk
    drew it nowhere but the tooltip, and a zero rate already shows a
    suspend. Its fasting and exercise ribbons and its other pump-event pins
    (User Suspended, Exercise): fasting is not a §1.5 term, the simulated
    wearer the stories draw serves no Exercise or User Suspended event to
    check them against, and a user suspension already reads as a Suspend in
    the basal lane. The phone's collapsed basal accordion: the lane stays
    open on the phone, since nothing on Day is hover- or tap-revealed.
    Episodes, the desk's near-miss rings and its rescue mark stay out with
    the episode drill-in (§2.6).

- **2026-10-14 — every finding of the day is marked.** The operator, on a Day
  where some of the engine's findings showed and others did not: "Making sure
  that all episode, all engine lever findings have a little marker somewhere
  on the graph showing, or an event underneath as well, saying over-treated
  low or carb under delivery or whatever it might be, just so the user could
  see, oh, those are the events that the engine's finding. I think that's the
  smallest shape of this change." No hover, no tap, no popover, no episode
  browser.
  - **What is marked.** Every moment on that calendar day the engine counted
    toward a habit, as `/api/model-view?date=` now serves them in `findings`:
    a moment that drove its episode, one whose own classifier matched while
    another drove it (claimed), and the low a Correction stacking reached,
    which the Lows after correcting highs Pattern counts. Each carries the
    habits it counts toward, by their served titles. The engine serves the
    list; Day reads no anchor state and keeps no list of habits of its own.
  - **Two gaps closed.** A finding whose episode resolves after midnight (an
    evening low, a late meal) reached no day: the old read placed the episode
    on the day it resolves, and Day kept only that day's moments. It is now
    the finding of the day it happened on. And the low a Correction stacking
    reached was unmarked, though its Pattern counts it.
  - **How it is drawn is unchanged** (the amendment above): the Pattern glyph
    on the marks lane's top row at its time; a bolus it counted names the
    habits on its event row ("12:00 Meal · Carb undercount"); any other moment
    is its own Pattern row with its habits and its reading in mg/dL; two in
    one minute (a meal and the suspend it owns) share one mark and one row.
  - **Not marked**, because the engine counted nothing there: a near-miss, a
    clean or a no-data moment. Not a habit finding, so not on this chart: the
    Prompts (Day's Lows row already carries them), a pre-empted low, and the
    nights and meal blocks a setting is read from. No new words: every name
    is a served habit title.

- **2026-10-14 — a Token field in Settings.** The server gates every read on
  the API token it was started with, and the app learned it only from the
  one-time `/#token=` link, so a new browser showed Unavailable on every
  screen with nowhere to enter it. The operator: "keep it really simple:
  token field and settings, that's it." Under the Settings root list, one
  group holds a Token row, a password field (ListRow's field row, nothing
  shown back), and Save beneath it, the root's one primary, disabled while
  the field is empty. Save keeps the token where the client reads it and
  reads the app again. The field shows in Settings' Loading and Unavailable
  too, since a refused read is exactly when it is needed. No prompt, no
  modal, no sign-in screen and no new route; the `/#token=` link still works
  as before. "Token" joins the plain interface words (Settings labels).

- **2026-10-14 — Done on a Setting card (#518).** A Setting card had nothing to
  press once the person had programmed it, and Snooze means "not now". The
  operator: "have the user acknowledge, you know, I programmed this into my
  pump and only have it resurface if a pump sync occurs that contains data
  since the moment that they swiped, stating that the setting still hasn't
  changed." On a different value: "if I program something slightly different,
  for example, if I was given ... 0.82 and I was like, no, I'm gonna do 0.85.
  I'd prefer the trial. I don't want to see the old basal value." On scope:
  "one done per card, yeah ... I wouldn't want to have to enter a pump changes
  screen and say here's all the changes I did." So:
  - **Done** is a Setting card's one primary (basal, I:C and a queued ISF),
    full width at the card's foot where Pin sits on a Pattern card, with
    Snooze the centred text action 16 px beneath it, on phone and desktop. The
    phone row's swipe stays Snooze. The lock has no shortcut for a card's
    primary (Pin has none), so Done has none; ⌘Z undoes it on desktop as it
    undoes a snooze.
  - Done takes the card out of the Queue at once, and the TransientBar reads
    "Waiting for pump" with Undo, which puts it back.
  - Changes lists each Setting waiting for the pump under the caption "Waiting
    for pump", between the active change and the last change: one ListRow
    each, its name and block over current → suggested, as the last-change row
    prints its change. A Setting leaves the list when the engine resolves it.
  - The engine resolves it on the first sync after the Done that carries pump
    data from after it. A setting that moved, to any value, is the pump change
    the Changes tab already shows as a Trial. A setting that did not move
    brings the card back to the Queue with the **Not on pump** StatePill on its
    row's title line and its card's title line, until the next change of that
    setting or a snooze.
  - The pill's tone is `--warn`, the token table's Warn: it asks the person to
    look again, without the Worse or Low red.
  Done, Waiting for pump and Not on pump join §1.5; Undo now also reverses a
  Done (§4.2 SettingCard, IsfCard, QueueRow, StatePill, TransientBar,
  ChangeCard's screen).

### 2.6 Deferred (not cut)
Not built in the current screens. The engine still serves what each needs, and
nothing is removed from the engine or the fixtures for them.
- Pattern evidence drill-in: from an open Pattern, one screen with one
  aligned-episodes chart (each episode's glucose trace aligned at its trigger —
  the bolus for meal patterns, the treatment for treated lows, the night for
  overnight lows — with the median on top) and the dated episode list beneath
  (peak ▲ / nadir ▼ → resolution); the engine already serves the episodes.
  Operator, 2026-10-13: wants to see the glucose impact without "too many
  graphs" — one chart per drill-in.
- A rank number on collapsed Queue rows.
- Other statistics on their own labelled lines in the open Pattern
  ("High-carb sequences 9 / 35 less in range · 17–36%").
- The "(example)" caption on a Setting shown as an example.

## 4. Component inventory (approved 2026-10-12)

Twenty-two components. Screens are composed only from these. Every state listed
gets a Storybook story in step 3. "Fields" are the only served data a component
may display; derived values name their formula in the provenance table.

### 4.1 Size per role (one each)

| Role | Size |
|---|---|
| Type | 34 figure · 22 title · 17 body · 13 label · 11 caption. Weights 400 and 600 only. Tabular numerals. |
| Primary button | 50 px, full width, `--primary` fill. One per screen. |
| Secondary button | 32 px, outlined neutral. |
| Text button | 32 px hit area, no fill. |
| Icon button | 44 px target, 20 px glyph. |
| Segmented control | 28 px. |
| Answer button (Prompt) | 44 px, outlined neutral, equal widths. |
| Navigation item | 44 px target, 24 px glyph. |
| List row | 48 px minimum. |

### 4.2 Components

Every component's error state is "Unavailable" with Retry at screen level
unless noted. Loading is a skeleton of the component's own shape.

**Shell**

1. **NavBar**: the phone tab bar and the desktop/tablet rail; five items, an
   icon above a label; the selected item has a pill behind its icon (§2.5,
   2026-10-14). The phone tab bar is 64 px above the device's bottom inset,
   with 24 px glyphs, its items centred in it (§2.5, 2026-10-14).
   - States: default; item selected; with a count badge; with an alert badge.
   - Fields: `prompts` length (Day count); `status.last_error` and
     `status.last_success_at` (Settings alert).
   - Desktop: the rail, with the same items and badges, opened by the
     wordmark (§2.5, 2026-10-13).
   - Glyphs: Queue, Changes, Overview, Day, and a gear for Settings. The
     sliders glyph belongs to the Setting kind.
2. **ScreenHeader**: the screen title plus one trailing slot (a control, or a
   labelled action).
   - States: default; with action ("+ Log carbs"); drill-down
     ("‹ Parent" back control above the title, §2.2). The Overview's date
     moved under its window switch (§2.5, 2026-10-14).
   - Fields: none of its own.
   - Desktop: the same, at the top of each pane; a drill-down's back control
     sits in the header of the pane that owns it.
3. **SegmentedControl**: 14 / 30 / 90 d.
   - States: each option selected; disabled (window lacks coverage).
   - Fields: `outcomes_*.coverage.days`.
   - On the Overview, the line beneath it is the window's date span and its
     comparison: "30 Sep – 13 Oct · vs previous 14 d", or the span alone when
     the previous period has no data. Fields: `outcomes_*.span_start,
     span_end`, `outcomes_*.previous.window_days, span_start`.
   - Desktop: the same, full width of its group.
4. **Button**, in the roles from §4.1.
   - States: default; pressed; focused; disabled; busy.
   - Fields: none.
   - Desktop: the same, with a visible focus ring.
5. **StatePill**: a one-word state, as a borderless tinted tag (§2.2).
   - States: Uncertain, Maturing, Better, Worse, Unclear, Focus, Not on pump
     (`--warn`, §2.5 2026-10-14 Done). An item's kind is never a pill; its
     glyph carries it.
   - Words only, at the one pill size; no glyph inside a pill.
   - Fields: `findings.outcome_patterns[].wide` (Uncertain: the pattern's Queue admission does not hold at its low end, ADR 485); the trial and focus lifecycle and result.
   - Desktop: the same.
6. **TransientBar**: a label plus one text action, shown above the tab bar.
   - States: "Snoozed · Until <date>" + Undo; "Waiting for pump" + Undo,
     after a Done (§2.5, 2026-10-14 Done); "Not saved" + Retry.
   - Fields: the snooze-until date (now + 14 d).
   - Desktop: the same, at the bottom of the detail pane; Undo also on ⌘Z.

**Queue**

7. **QueueRow**: a collapsed recommendation, with a leading 20 px kind glyph
   (Pattern: rising dots; Setting: sliders; named "Pattern" / "Setting" for
   assistive tech, and no kind pill), its title, one magnitude
   ("9 of 71 lows") and no cause (§2.5, 2026-10-14: "drop the leading cause
   entirely"; the open card names the causes). A Pattern with an impact ends in a trailing value:
   the caption Peak (high) or Nadir (low) on the title line, and beneath it
   the shared Delta (▲ / ▼ and the amount, neutral ink) of own − Typical as
   printed, with mg/dL. The row is two lines with or without it, and the
   chevron sits on the title line (§2.5, 2026-10-14).
   - States: default (multi-cause, no cause named); selected (desktop);
     mid-swipe (snooze reveal); single cause (the same row; the no-cause
     state is retired with the overnight Pattern, ADR 499);
     with impact, high (Peak) or
     low (Nadir); without impact (no trailing value); setting (current →
     suggested replaces the magnitude; a queued ISF's row has no time block,
     §2.5 2026-10-14); setting Not on pump (the StatePill on the title line,
     inside its 22 px, so the row keeps its height; §2.5 2026-10-14 Done);
     snoozed (read-only: no chevron, swipe
     or selection; a last line "Until <date>" + Restore); loading.
   - Fields: `guidance.candidates[].title, kind, priority, admitted,
     preference`; `findings.outcome_patterns[].k, n` and the noun; the
     impact as
     PatternCard reads it, its delta the derived `own − typical`.
   - Desktop: a list row that selects into the detail pane. Snooze is an icon
     the open card's Snooze text action (shortcut S); there's no swipe.
8. **PatternCard**: the open pattern, showing the magnitude, a CauseWaffle,
   and Pin. No Range: only a Setting has one; Uncertain carries a pattern's
   confidence (ADR 485).
   - States: multi-cause; **single cause**; Uncertain
     (the tag at the end of the magnitude line); with or without the impact
     line (Peak or Nadir · Typical, mg/dL, beneath the magnitude);
     pinned (Pin replaced by a "Focus" pill); loading.
   - Header row: the title and (phone) the collapse chevron. Snooze is a
     text action centred beneath Pin (or the Focus pill), 16 px below it.
   - Fields: `outcome_patterns[].k, n, wide`; fold sentences (count,
     denominator, lever title); the case file's `projection.cohorts[matched,
     comparison].points[].median` (the impact line: each cohort's highest or
     lowest median at or after minute 0).
   - Desktop: fills the detail pane up to 720 px; no collapse chevron.
9. **CauseWaffle**: one cell per occurrence in n, with filled cells patterned
   by cause, plus a legend.
   - States: multi-cause; single cause (one legend entry). A counted Pattern
     always has a claiming cause since ADR 499 cut the overnight Pattern, so
     the no-cause state is retired.
   - Fields: as PatternCard.
   - Desktop: larger cells, same rules.
10. **SettingCard**: the open setting, showing current → suggested in figure
    type, the time block as its title, a compact EvidenceChart, the evidence
    count ("30 nights") and one Range. One button, Done, the card's primary
    (§2.5, 2026-10-14 Done).
    - States: default; range collapsed (lo = hi, single value shown);
      matured into a Trial (Changes link): the block lies in a matured basal
      Trial's served block (#506), whether or not it starts where the Trial
      starts; Not on pump (the StatePill on the title line, after the block).
    - Done: full width at the card's foot, where Pin sits on a PatternCard.
      Snooze: a text action centred 16 px beneath Done.
    - Fields: `guidance.candidates[].acknowledgment.state` (`not_on_pump`).
    - Fields: `analyze.basal[slot].current, estimate.value, estimate.lo, hi,
      days`, plus their carb-ratio equivalents. A queued ISF opens into the
      IsfCard instead (§2.5, 2026-10-14).
    - Desktop: fills the detail pane up to 720 px.
11. **EvidenceChart**: a setting's evidence, one dot per night against current
    and the estimate in its range: a basal slot's delivered rate, or an ISF
    fasting night's fit.
    - States: default; zero variance (a compact strip); nights beyond the
      axis, counted ("‹ 3", "2 ›") in a gutter reserved at that end, outside
      the plot (§2.5, 2026-10-14).
    - The axis covers the marks, padded; it goes below 0 only when the range
      does. Every tick keeps its mark, but a tick label that would touch its
      neighbour is left out; the last, which carries the unit, always shows.
    - Fields: `analyze.basal[slot].evidence.night_roster`;
      `analyze.isf[0].evidence.night_fits[].isf`.
    - Desktop: wider, same marks.

**Overview**

12. **GlucoseProfile**: 24 h over the selected window (14, 30 or 90 d). Shows
    the median, the 10–90% spread, the above-180 tint, the 70/180 lines with a
    250 tick, meal density, and one Median callout.
    - States: default; insufficient data ("No data"); not yet read (its
      skeleton).
    - Fields: `time_of_day[days].window.data_days`, `pooled.bins[]` (median,
      p10, p90), `pooled.meals`, `target_range`.
    - Desktop: full pane width.
13. **TimeInRangeBar**: five AGP bands, each labelled; 70–180 labelled
    "In range".
    - States: each window.
    - Fields: `outcomes_*.metrics.tbr_lvl1, tbr_lvl2, tir, tar_lvl1, tar_lvl2`
      (bands derived as differences).
    - Desktop: the same.
14. **MetricFigure**: a value, its unit, and its change against the previous
    period of the same length (arrow, units; better/worse colour only on Below
    70 and Above 180), the difference taken between the values as printed.
    - States: better; worse; unchanged (neutral); not available; no previous
      data (no change).
    - Fields: `outcomes_*.metrics.tir, mean_glucose, gmi, cv, tbr_lvl1,
      tar_lvl1`, and the same under `outcomes_*.previous.metrics`.
    - Desktop: the same, in a row.
15. **DayRibbon**: a week of days, gapless, on one band with one trace that
    runs on from day to day, hairline dividers, and each day's weekday and
    date above and ▽/△ counts or ✓ and in-range % beneath; each day picks
    itself.
    - States: default; selected; a week without readings.
    - Fields: `day_navigator.days[]`.
    - Day's month is its weeks stacked, with ‹ › stepping to the previous and
      next month (loading, or Unavailable with Retry, while a month is not
      read); desktop keeps the selected week in view, across months. Selected:
      the whole column takes a `--primary` tint at 18%, 7 px radius, behind the
      trace, and its weekday and date are `--primary`; no bar. (The standalone
      DayTile went with the Overview's recent-days strip, §2.5 2026-10-14.)

22. **IsfCard**: the ISF estimate for the selected window, below the
    Overview's summary. The title "ISF" with "estimate", and the Uncertain
    pill when the estimate is wide; "current → recommended" in figure type
    only when the engine supports the change; an EvidenceChart of the fasting
    nights' fits; then Estimate, Range and Fasting nights as captioned values.
    - States: supported change; held (no figure); Uncertain; nights beyond the
      axis; no data ("No data"); not yet read (its skeleton).
    - Fields: `analyze.isf[0].current, recommended, asserts_move,
      estimate.value, lo, hi, wide, n_clusters,
      evidence.night_fits[].isf`, read from `/api/analyze?window=N`.
    - Desktop: the width of the Overview's body, below its summary.
    - In the Queue (§2.5, 2026-10-14): the open card of a queued ISF, the
      engine's default window (`/api/analyze`). The title is "ISF" alone;
      the figure always stands (the engine queues ISF only with its staging
      verdict); Done at its foot and Snooze a text action centred beneath it,
      as on the SettingCard (§2.5, 2026-10-14 Done); no other action. Not on
      pump: the StatePill on its title line. Phone: in its row's place.
      Desktop: fills the detail pane up to 720 px.

**Changes**

16. **ChangeCard**: the active Trial or Focus. Shows what changed (the
    setting before → after, or how often the habit happened before → after),
    its evidence as ticks (a Trial's days, a Focus's meals), and Before/After
    values with a Δ (the shared Delta) once matured, with End.
    - States: Trial maturing; Trial matured with a result (Better / Worse /
      Unclear); Focus with no data yet; Focus maturing; Focus matured with a
      result (the engine's verdict on the habit); ended; none ("No active
      change").
    - Fields: `trials.trials[]` (before, after, changed_at, maturing,
      ending.assessment.outcomes); `focus.focuses[]`; a Focus's retained
      comparison (`readiness.after` count and required, `adherence` before and
      after rate and assessment, `outcomes` peak, nadir, tir, tbr, tar);
      `guidance.admission`.
    - Desktop: the same, in the Changes pane.
    - Beside it on the Changes screen (§2.5, 2026-10-14 Done): the "Waiting
      for pump" ListGroup, between the active change and the last change, one
      ListRow per Setting waiting after a Done: its name and block, then
      current → suggested in meta ink. Fields:
      `guidance.candidates[acknowledgment.state=waiting].title, parameter,
      acknowledgment.blocks[0].start_min, end_min, current, recommended,
      units`.

**Day**

17. **DayChart**: one day. Shows glucose with the 70–180 band, a marks lane
    (a Pattern glyph at each of the day's findings, every moment the engine
    counted toward a habit, above the meal / correction and logged-carb
    markers), basal as its difference from the Pump profile (above, below,
    Suspend hatched, on a signed U/h scale; §2.5, 2026-10-14), and an event
    list below, where a counted bolus carries its habits' titles and any other
    finding is its own Pattern row with its reading (§2.5, 2026-10-14, every
    finding of the day).
    - States: default; no data; with logged carbs, which carries findings of
      several kinds.
    - Fields: `timeline.cgm, boluses, basal, pump_events, sleep_windows`;
      `carbs.carb_entries`; `model_view.findings[].t, kind, bg,
      levers[].lever, title` (`/api/model-view?date=`).
    - Desktop: wide, under the selected week's DayRibbon.
18. **PromptCard**: one low prompt, showing "Low · <date time> · <mg/dL>",
    its sparkline, Yes · No · False low, and on phone Not sure as a text
    action centred beneath them, as Snooze sits beneath Pin (the swipe is its
    shortcut).
    - States: unanswered; Yes recorded (a checkmark on Yes, labelled "Recorded"
      for screen readers only, plus the optional grams field); mid-swipe (Not sure).
    - Fields: `prompts[].anchor_t, key_bg, cgm`; answers posted to
      `/api/prompts/answer`; grams via `PATCH /api/carbs/{id}`.
    - Desktop: a fourth button, Not sure, instead of the text action and the swipe.
19. **LogCarbsEntry**: a grams field sized to 3 digits, Time (a tappable row,
    default now), and Save.
    - States: empty; filled; saving; not saved.
    - Fields: posts `t, grams, certainty` to `/api/carbs`.
    - Desktop: a popover anchored to "+ Log carbs"; on phone, a bottom sheet
      on the system keyboard.
21. **InsulinBar**: the selected day's insulin, "Insulin" and its total
    above one stacked bar of it, its parts labelled beneath in U and %: Basal
    (delivered, grey as the chart's basal), Meal (the meal teal), Correction
    (neutral ink) and Control-IQ (its automatic boluses only, hatched). Each
    value prints its own rounding to one decimal; each % is the part as
    printed ÷ the total as printed.
    - States: default; no data (no bar); loading.
    - Fields: `timeline.insulin_totals.basal, meal, correction,
      control_iq_bolus, total` (ADR 492); `null` serves no bar.
    - Desktop: the same, the parts in one row, beside the Prompts row under the
      selected week.

**Settings**

20. **ListRow**: label, inline value or state, ›; read-only rows have no ›.
    - States: navigable; read-only; with alert ("⚠ Failed"); with a secondary
      button ("Update"); disclosure, closed or open (expands in place: the
      Changes screen's last change); field (the account form's Email and
      Password, and the root's Token).
    - Fields: `status`; `credentials.configured, email` (masked), `region`;
      `pump_settings.profile.segments[]`.
    - Desktop: the same.

The Glossary page is ListRow plus `.glossary` definitions. The Pump profile
segment table is ListRow in a dense variant. The Token field (§2.5,
2026-10-14) is a field row in its own group under the root list, with Save,
the root's one primary, beneath it; it is on the root, in Loading and in
Unavailable, and the token is kept in the browser, never read back from the
engine.

## 3. Files beside this document
- `build.py`: the exploration generator. It reads captured API answers, which are not committed.
- `provenance.tsv`: every value in the last exploration render, mapped to its source field.
- `copycheck.py`: lists every visible string in a mockup and flags microcopy, exempting `.glossary`.

---

## Appendix — consolidated brief from the first exploration (2026-10-12)


This brief is the single source of truth. It supersedes `SPEC.md` and every
earlier round message. Decisions recorded here are settled; do not re-open them.

### 0. Context
Harmonic is a self-hosted tool for one person on a Tandem pump with Control-IQ.
It suggests changes to basal, correction factor (CF) and carb ratio (CR), and
coaches habits. It is **advisory only** and never writes to the pump.

The engine is good. The user has rejected three UI generations because they were
exploration workstations. This is a rewrite in place: **simplify the
experience, not the engine.** Hide complexity; don't remove capability.

Platforms: phone first, then tablet. Desktop gets its own layout.

### 1. Absolute rules (any violation is a failure)
1. **No microcopy.**
   - Allowed: labels, values with units, counts with denominators, dates,
     durations, axis and legend labels, one-word state pills, one-verb buttons.
   - Banned: sentences, questions, subtitles, captions, explanations, empty-state
     prose and tooltip sentences.
   - The single exception is the Glossary list (inside `.glossary`), where each
     entry gets a one-line definition.
2. **Engine-only content.**
   - Every visible number or data label traces to a captured payload in `api/*.json`.
     Record each one in `provenance.tsv` as engine, derived (state the formula),
     prototype, example or UI.
   - Never invent labels, actions, advice, thresholds or targets. The engine has
     no clinical targets except the 70–180 range.
   - Untraceable means deleted.
3. **No predictions.**
   - Before/after appears only for a change the user has made, using data
     collected after it.
4. **Never mix units.**
   - Never pair numbers with different denominators.
   - An interval sits only next to the statistic it belongs to.
5. **Colour is never the only signal.**
   - Pair it with a glyph (▲ ▼ ✓ ⚠ !), a label or a position.
6. **At most one primary button per screen.**
   - It must be the only accent-filled control on that screen.
   - It sits apart from other tap targets, outside any swipe area.
   - It must be hard to hit by accident.
7. **Every screen fits its frame.**
   - No scrolling, no clipping. `harness.js` must report `data-harness="ok"`.
   - When a screen doesn't fit, cut content. Never shrink type below 11 px.
8. **Every screen owns only its own content.**
   - No stray controls, status strips or toasts that look like content items.
9. **Real data stays in the scratchpad.**
   - Nothing goes into the repo.
   - Never run `harmonic serve` or `fetch`.
   - New captures use the in-process FastAPI TestClient against `work.db` with
     `enable_fetch_loop=False`, the pattern already used in `build.py` and its
     neighbours.

### 2. Craft standard (the current mockup fails this; fix it)
The user's latest verdict: "undesigned, uninspired". Specific failures:
- Three different button sizes on one screen.
- The time control doesn't look tappable.
- The grams field is sized for 900 g.
- A popover hovers in an arbitrary place.
- Charts aren't full width.
- Stacked prompt cards: you can't tell what a keyboard belongs to, and you can
  swipe one item while answering another.

Build a small, explicit design system and apply it everywhere. Write it at the
top of the page as a token sheet, as labels and swatches, not prose.

**Type scale:** 5 steps at most, for example 34 large title / 22 figure /
17 body / 13 label / 11 caption, with tabular numerals for every number.

**Spacing:** a 4/8 grid. Side margin 16 phone, 24 tablet, 32 desktop. One rhythm.

**Controls: exactly two button sizes.**
- Primary: full width, 50 px tall.
- Compact: 32 px, used for outlined neutral and text buttons.

Other control rules:
- Icon buttons are 44 px touch targets.
- Anything tappable looks tappable. A value you can change (e.g. Time) is a
  native-style row with a value and a chevron, or an inline picker pill.
- Inputs are sized to their content. The grams field fits 3 digits, has the
  unit inline, and the number is the visual focus.

**Framing:** as little as possible.
- No boxes that only group things.
- Use full-bleed sections, hairline separators and spacing.
- Keep a container only where it does a job:
  - the expanded Queue card, as a subtle surface change
  - sheets and popovers
  - Day tiles
- Charts span the full content width. Tables have no outer borders.

**Overlays:**
- Phone and tablet use bottom sheets attached to the system keyboard.
- Desktop uses a popover anchored to and visually connected with its trigger
  (with an arrow or edge alignment), or a centred modal. Nothing floats
  arbitrarily.

**Keyboards:**
- The app uses the native numeric keyboard (`inputmode="numeric"`). The mockup
  draws an iOS-style system numeric keyboard docked to the bottom edge, directly
  attached to the focused field's sheet or screen.
- The tab bar is hidden while the keyboard is up.
- Desktop draws no keyboard.

**Look:** clinical, premium, restrained.
- Palette: warm paper, white, teal accent.
- Glucose colours: `--low` / `--inrange` / `--high` / `--vhigh` (see `harness.css`).
- Radii: about 10 px containers, 8 px controls.
- No soft shadows except on overlays.
- No cute chips, no bubbly pills.

**Feel:** a native app, iOS grouped-but-flat. Not a website, not a stack of cards.

### 3. Information architecture (settled)
Tabs, plain nouns: **Queue · Changes · Overview · Day · Settings**. Line icons.
Phone uses a bottom tab bar; tablet and desktop use a left rail.

**Badges:** one system, top-right of the icon, 16 px.
- Count badge: a neutral-dark pill. Day shows the number of unanswered prompts.
- Alert badge: a warning-colour circle with "!". Settings shows it when the
  last sync failed.
- No other screen shows sync state.

### Queue
Owns only the ranked recommendations.

**Order:** `guidance.candidates` where `admitted` is true and
`preference.set_aside` is false, sorted by `priority` descending. That gives
Highs after meals 40, Highs after treating lows 29, Lows after meals 14, and
Lows after correcting highs 10.

**Cards:** one stack of identical cards.
- Collapsed: rank, title, kind (Pattern / Setting), headline count, chevron.
- Tapping expands a card in place, accordion style. The others stay visible.
  There's no sheet.

**Expanded Pattern card:**
- Headline from `findings.outcome_patterns[key]` k/n, worded with the engine's
  outcome words, e.g. "Meals ran high 34 / 150", with "Range 19–27%" from that
  pattern's `wilson`.
- Causes on the SAME denominator: Carb undercount 22 / 150, Late bolus 8 / 150.
- Other statistics on their own labelled line with their own interval:
  "High-carb sequences 9 / 35 less in range · 17–36%".
- A "Wide" pill when `support.wide`.
- Episodes as plain dated rows (peak ▲ / nadir ▼ → resolution), with no count.
  Low values use `--low` plus ▼.
- **Pin** is the only action, the primary, at the foot of the card.

**Expanded Setting card:**
- current → engine estimate with units, Range lo–hi, n with its engine noun
  (e.g. "19 days").
- One compact full-width chart of current (step) vs estimate with its CI band.
- **No button.** A Trial starts by itself when the pump reports the new value.
- No setting is admitted today. Show one as an example from
  `analyze.json` basal 07:00–08:00, captioned "(example)".

**Snooze:**
- The only removal. It lasts 14 days and returns early if the evidence changes.
- Phone and tablet: swipe a collapsed card to reveal a **snooze icon**, line
  drawn, with no text, date or coloured block.
- Desktop: an icon-only button in the detail header (`aria-label` "Snooze 14 days").
- After snoozing, a transient bar shows "Snoozed · Until 26 Oct" with **Undo**
  as neutral text. It sits above the tab bar, or at the bottom of the desktop
  detail pane.
- A quiet footer row "Snoozed · N ›" at the end of the list appears only when
  N > 0. It opens the Snoozed list (rows with "Until <date>" and Restore).
- There is no dismiss and no "never".

**Desktop Queue:** master–detail.
- Ranked list on the left, with the selected row shown by tint, an accent bar
  and a focus ring. Arrow keys move the selection.
- Detail on the right, with the snooze icon button top-right and Pin at the foot.
- No hover-revealed actions anywhere.

### Changes
A watched change is either a **Trial** (a pump setting change, detected
automatically) or a **Focus** (a habit pinned by hand). One is active at a time.

- **Active card:** a Trial, carb ratio 07:00–11:00, 4 → 4.4 g/U, labelled
  "Maturing", Days 0 / 14, with frozen Before (14 d) values and an empty After
  column. This is an **example** state: no data has arrived since the change.
- **Last change:** one row: Trial · Profile · 5 Aug, Unclear, in range
  81.4% → 77.7%, ▼3.7 pts.
- Result words: Maturing / Unclear / Better / Worse.

### Overview
- Segmented 14 / 30 / 90 d control.
- Hero: in range 65.9% with ▼12.2 pts vs 90 d.
- Three five-band time-in-ranges bars with band labels (superseded 2026-10-13:
  one bar, for the selected window).
- A short designed table: Below 70, Above 180, Mean, Pre-meal, Post-meal 2 h.
  Columns are 14 / 30 / 90 plus Δ 14/90 with arrows. The selected window is
  emphasised and the others quieter. Red and green apply only to the below- and
  above-range shares; other arrows are grey.
- The engine's fixed 30-day time-of-day strip.
- Tablet and desktop: the full 10-row table.
- `tar_lvl1` already includes everything above 250 and `tbr_lvl1` everything
  below 54. **Never add the two levels.**
- Pre/post-meal medians are **prototype** values: 150/142/136 and 170/161/141.

### Day
Owns the day, carb logging and prompts.

**Day navigator** (the user likes the current app's navigator), restyled:
- Tiles with weekday/date, a sparkline over a tint (green clean, amber highs
  only, red lows), ▽N / △N counts or ✓, and in-range %.
- Data from `/api/day-navigator?month=2026-09`. Capture it into
  `api/day_navigator_2026-09.json` if it isn't there.
- Phone: a swipeable week strip, with a Month sheet holding the full grid.
- Tablet and desktop: the month grid in the left pane, the selected day on the right.

**Day content:**
- 4 stats.
- One full-width chart: glucose with the range band, bolus markers (meal vs
  correction; the timeline has no other type), basal delivered vs programmed,
  and logged-carb markers with a legend.
- A short timestamped event list.
- Use `timeline_2026-09-29.json` and `carbs.json`.

**Log carbs:** a labelled control "+ Log carbs" in the Day header.
- Phone: a bottom sheet on the system keyboard containing:
  - a grams field (focused, 3 digits)
  - Time as a tappable row defaulting to now
  - **Save** as the only primary
- No certainty control and no preset amounts.
- Desktop: an anchored popover.
- Engine call: POST `/api/carbs`. A typed amount is sent with certainty "exact".

**Prompts:**
- Unanswered prompts appear as one section row on Day, "▼ Lows · 3 ›", plus the
  Day tab badge.
- The Prompts screen shows **one prompt at a time**, with "1 / 3" in the header.
  The prompt shows "Low · 26 Sep 13:27 · 69 mg/dL" and a full-width sparkline
  with the low marked.
- Under the label "Carbs" sit three neutral buttons: **Yes · No · False low**.
- **Yes** records immediately as carbs with unknown grams (one tap). It then
  shows "Recorded", an optional grams field focused on the system keyboard, and
  a "Next" text action.
- **Swiping the prompt** records "not-sure". Desktop shows Not sure as a fourth
  button instead.
- Nothing else is interactive while a prompt is active.
- Engine calls:
  - POST `/api/prompts/answer` with answer ∈ {carbs, no, not-sure, false-low}
  - PATCH `/api/carbs/{id}` for grams added later
- Never show the engine's question or context sentences.

### Settings
The root is a grouped list:
- **Tandem Source** (inline "⚠ Failed") ›
- **Pump profile** (inline "P008") ›
- **Glossary** ›

**Tandem Source:**
- State ⚠ Failed
- Last success 30 Sep 17:18
- Last attempt 12 Oct 14:52
- Error "HTTP 400 · eventIds"
- Data 5 Jul 2025 – 30 Sep 2026 · 228 d
- Email · Region: fully masked plus US
- Password: Set, with a compact outlined Update button
- Never show a real email or a secret.

**Pump profile:**
- Header: P008 · 12 Oct 14:52
- DIA 5 h · Max bolus 15 U · Target 110 mg/dL
- A read-only segment table: start, basal, CF, CR.

**Glossary:**
- Lists only the terms visible in the app, alphabetically, each with a
  one-line definition.
- Sources: the repo's `frontend/glossary.js` and `CONTEXT.md`.
- "Hide 14 d" is replaced by "Snooze".

### 4. Screens to deliver
**Phone (390×844):**
- Queue (card 1 expanded)
- Queue (card 2 expanded)
- Queue just after a snooze (confirmation bar)
- Snoozed list (example)
- Queue setting card (example)
- Changes (example)
- Overview
- Day (week strip)
- Day month sheet
- Prompts (Yes tapped, keyboard up)
- Prompts (mid-swipe on Not sure)
- Log carbs (keyboard up)
- Settings root
- Tandem Source
- Pump profile
- Glossary

**Tablet (1180×820):**
- Queue
- Overview
- Day

**Desktop (1440×900, `.desktop` frame):**
- Queue (master–detail)
- Queue with the setting selected (example)
- Overview
- Day (month grid with the selected day, Log carbs popover open)

At the top of the page, add the token sheet (type scale, spacing, the two
button sizes, colours, input and row specs), drawn with swatches and labels.

### 5. Files and checks
**Working folder:**
`/private/tmp/claude-501/-Users-connor-Code-harmonichq-harmonic/8b673b5e-3331-415c-923a-a53babd464ea/scratchpad/redesign/`

**Inputs:**
- `api/*.json`: the captured engine answers
- `work.db`: for any new capture, read-only via TestClient
- `harness/harness.css` and `harness/harness.js`

**Previous agent's output (reference only):** `out/final/`
- `build.py`, `provenance.tsv` and `mockup.html`, a mid-revision state of a
  previous agent; its Day screens overflow
- Treat it as reference. Its data mappings are verified; its visual craft is
  rejected.

**Write to `out/v2/`:**
- `build.py`, a generator reading `../../api/*.json`
- `mockup.html`, linking `../../harness/harness.css` and `harness.js`
- `provenance.tsv`

**Checks:**
- `harness.js` must print `data-harness="ok"`:

  ```
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --virtual-time-budget=3000 --dump-dom file://<mockup> | grep -o 'data-harness="[^"]*"'
  ```

- `python3 ../../copycheck.py <mockup>` may flag only data labels, never a
  sentence outside `.glossary`.
- Look at your own renders before reporting:
  `--screenshot --window-size=2900,<tall>`, then crop regions.
