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

This document is the durable record of the redesign. Sections 1–3 are what the
build will be checked against once they are approved. The appendix keeps the
consolidated brief from the first exploration (2026-10-12) as decision history.

## 1. Information architecture (approved 2026-10-12)

### 1.1 Tabs

| Tab | Owns | Owns nothing else |
|---|---|---|
| **Queue** | The ranked recommendations, from Patterns and Settings, and the Snoozed list. | No logging, no status, no counters. |
| **Changes** | The active watched change (one Trial or one Focus) and the last finished change. | No history archive. |
| **Overview** | Standard metrics over 14, 30 and 90 days, the time-in-ranges bars and the time-of-day strip. | No recommendations. |
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
- **Data as of** is content, not status. It appears as "To 30 Sep" on Overview
  and as the date on Day.
- **Engine unavailable** (a read endpoint returns 503 or "unavailable"): the
  affected screen shows its title, the label "Unavailable" and a compact
  **Retry**. Other tabs keep working.
- **Write failed** (pin, snooze, answer, log): the control returns to its prior
  state, and a transient bar shows "Not saved" with **Retry**.

### 1.3 Screen and state inventory
Each row lists a screen's states. Labels only; no state uses prose.

| Screen | Default | Empty | Loading | Error | Other states |
|---|---|---|---|---|---|
| Queue | Ranked cards, top card expanded | "0 patterns" label | Card skeletons | Unavailable + Retry | A card expanded; mid-swipe; just snoozed (bar "Snoozed · Until <date>" + Undo); Snoozed footer when N > 0 |
| Queue · Snoozed | Each snoozed item as its Queue row, plus "Until <date>" + Restore | Not reachable (the footer is hidden at 0) | — | Unavailable + Retry | Restored (row leaves) |
| Queue · setting detail | current → estimate, range, n, chart | — | Chart skeleton | Unavailable | — |
| Changes | Active Trial or Focus + the last change as one row | "No active change" label | Skeleton | Unavailable + Retry | Maturing; Matured (result pill); last change row expanded in place; **End** (Focus: anytime; Trial: once matured) → confirm sheet → ended |
| Overview | 14 d selected | "No data" label per window | Skeleton | Unavailable + Retry | 30 d / 90 d selected |
| Day | Latest day with data | "No data" for a day without readings | Chart skeleton | Unavailable + Retry | Week strip; Month sheet; Prompts row when count > 0 |
| Day · Prompts | One prompt, "n / N" | Not reachable (the row is hidden at 0) | — | Not saved + Retry | Yes → grams field and keyboard; mid-swipe Not sure |
| Day · Log carbs | Grams field focused, Time = now | — | Saving | Not saved + Retry | Time edited |
| Settings | Three rows with inline status | — | — | — | Sync OK (no badge) / Failed (badge) |
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
| Swipe a Queue card to snooze it, or the Snooze text action beneath Pin (a Setting card: at its foot) | The same Snooze text action; shortcut S |
| Swipe a Prompt to record Not sure | A fourth button, **Not sure** |
| Swipe the Day week strip | ‹ › buttons and a month grid that is always visible |
| Tap the month label to open the Month sheet | Month grid in the left pane |
| Bottom sheet for Log carbs, on the system keyboard | Popover anchored to "+ Log carbs" |
| Tap Undo in the snooze bar | Same bar, clickable; ⌘Z |
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
| **Setting** | noun | A pump value: basal, correction factor or carb ratio. |
| **Pin** | verb | Start a Focus on a Pattern's habit. |
| **Focus** | noun | A habit you pinned, watched for adherence and outcome. |
| **Trial** | noun | A pump setting change the app detected, watched against its before period. |
| **Change** | noun | A Trial or a Focus. One is active at a time. |
| **Maturing** | state | A change still collecting its 14 days of after data. |
| **Better / Worse / Unclear** | state | A matured change's result against its before period. |
| **Snooze** | verb | Remove from the Queue for 14 days. It returns early if the evidence changes. |
| **Restore** | verb | Bring a snoozed item back. |
| **Undo** | verb | Reverse the last snooze. |
| **Range** | noun | The engine's interval for a Setting's estimate. |
| **Uncertain** | state | Not yet clear enough to act on: the evidence behind it is thin. |
| **Episode** | noun | A dated event the engine cites as evidence. |
| **Cause** | noun | The habit the engine attributes most of a Pattern's occurrences to. |
| **Peak / Nadir** | noun | The highest or lowest glucose after an event such as a meal, as the median across the events counted, in mg/dL. |
| **Typical** | noun | The same for the comparison events: similar events that did not end in the Pattern's outcome. |
| **Glucose profile** | noun | Glucose by time of day over the last 30 days: the median and the 10th–90th percentile spread. |
| **Median** | noun | The middle value of the profile at that time of day. |
| **Prompt** | noun | A question about a low, asking whether carbs were eaten. |
| **Yes / No / False low / Not sure** | answer | A Prompt's answers. False low marks the reading itself as invalid. |
| **Log carbs** | verb | Record carbs eaten without a bolus. |
| **End** | verb | Stop watching the active change. |
| **Recorded** | state | An answer or entry was saved. |
| **In range, Below 70, Below 54, Above 180, Above 250, Mean, GMI, CV, Pre-meal, Post-meal 2 h** | metric | The standard CGM metrics. Below 54 and Above 250 are shown as subsets of Below 70 and Above 180, never as separate bands of the same total. |
| **Tandem Source** | noun | The vendor account the data syncs from. |
| **Pump profile** | noun | The active pump settings, read-only. |
| **ISF** | noun | Insulin sensitivity factor, the pump's correction factor: how far one unit of insulin lowers glucose, in mg/dL. |
| **I:C** | noun | Insulin-to-carb ratio, the pump's carb ratio: the grams of carbs one unit of insulin covers. |
| **DIA** | noun | Duration of insulin action: how long the pump counts a bolus as still working, in hours. |
| **Sleep** | noun | The pump's sleep schedule, when Control-IQ runs its tighter overnight target. |
| **Site change** | noun | A new infusion site and cartridge, as the pump logged it. |

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
| Meal (library; meal bolus and logged-carb glyphs and their grams, the one coloured day-event family) | `--ui-meal` | #3cc8c8 |

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
| Tab bar item / rail item | 44 px target, icon above label. |
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
- **2026-10-13 — charts take their container's width.** The operator: "fix
  the chart width to be responsive on desktop." The Setting card's evidence
  chart had stayed at its phone width inside a wide desktop card; every chart
  now measures its box and lays out to it (§2.2 Charts).

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

Twenty components. Screens are composed only from these. Every state listed
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
| Navigation item | 44 px target. |
| List row | 48 px minimum. |

### 4.2 Components

Every component's error state is "Unavailable" with Retry at screen level
unless noted. Loading is a skeleton of the component's own shape.

**Shell**

1. **NavBar**: the phone tab bar and the desktop/tablet rail; five items, an
   icon above a label.
   - States: default; item selected; with a count badge; with an alert badge.
   - Fields: `prompts` length (Day count); `status.last_error` and
     `status.last_success_at` (Settings alert).
   - Desktop: the rail, with the same items and badges.
   - Glyphs: Queue, Changes, Overview, Day, and a gear for Settings. The
     sliders glyph belongs to the Setting kind.
2. **ScreenHeader**: the screen title plus one trailing slot (a date, a
   control, or a labelled action).
   - States: default; with date; with action ("+ Log carbs"); drill-down
     ("‹ Parent" back control above the title, §2.2).
   - Fields: `outcomes_*.span_end` (date).
   - Desktop: the same, at the top of each pane; a drill-down's back control
     sits in the header of the pane that owns it.
3. **SegmentedControl**: 14 / 30 / 90 d.
   - States: each option selected; disabled (window lacks coverage).
   - Fields: `outcomes_*.coverage.days`.
   - Desktop: the same, full width of its group.
4. **Button**, in the roles from §4.1.
   - States: default; pressed; focused; disabled; busy.
   - Fields: none.
   - Desktop: the same, with a visible focus ring.
5. **StatePill**: a one-word state, as a borderless tinted tag (§2.2).
   - States: Uncertain, Maturing, Better, Worse, Unclear, Focus. An item's
     kind is never a pill; its glyph carries it.
   - Words only, at the one pill size; no glyph inside a pill.
   - Fields: `findings.outcome_patterns[].wide` (Uncertain: the pattern's Queue admission does not hold at its low end, ADR 485); the trial and focus lifecycle and result.
   - Desktop: the same.
6. **TransientBar**: a label plus one text action, shown above the tab bar.
   - States: "Snoozed · Until <date>" + Undo; "Not saved" + Retry.
   - Fields: the snooze-until date (now + 14 d).
   - Desktop: the same, at the bottom of the detail pane; Undo also on ⌘Z.

**Queue**

7. **QueueRow**: a collapsed recommendation, with a leading 20 px kind glyph
   (Pattern: rising dots; Setting: sliders; named "Pattern" / "Setting" for
   assistive tech, and no kind pill), its title, one magnitude
   ("9 of 71 lows") and a cause label.
   - States: default; selected (desktop); mid-swipe (snooze reveal);
     no cause (label omitted); setting (current → suggested replaces the
     magnitude); snoozed (read-only: no chevron, swipe or selection; a last
     line "Until <date>" + Restore); loading.
   - Fields: `guidance.candidates[].title, kind, priority, admitted,
     preference`; `findings.outcome_patterns[].k, n` and the noun; the top
     cause lever from `findings.rows[].fold_sentences`.
   - Desktop: a list row that selects into the detail pane. Snooze is an icon
     the open card's Snooze text action (shortcut S); there's no swipe.
8. **PatternCard**: the open pattern, showing the magnitude, a CauseWaffle,
   and Pin. No Range: only a Setting has one; Uncertain carries a pattern's
   confidence (ADR 485).
   - States: multi-cause; **single cause**; **no attributed cause**; Uncertain
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
   - States: multi-cause; single cause (one legend entry); no cause (the
     occurrences in the pattern's solid tone, as a single cause draws them,
     with a "Meals" or "Lows" legend only).
   - Fields: as PatternCard.
   - Desktop: larger cells, same rules.
10. **SettingCard**: the open setting, showing current → suggested in figure
    type, the time block as its title, a compact EvidenceChart, the evidence
    count ("30 nights") and one Range. No button.
    - States: default; range collapsed (lo = hi, single value shown);
      matured into a Trial (Changes link).
    - Snooze: a text action centred at the card's foot.
    - Fields: `analyze.basal[slot].current, estimate.value, estimate.lo, hi,
      days`, plus their ISF/carb-ratio equivalents.
    - Desktop: fills the detail pane up to 720 px.
11. **EvidenceChart**: the setting's slot evidence, showing the nights'
    delivered rate against current and suggested.
    - States: default; zero variance (a compact strip).
    - Fields: `analyze.basal[slot].evidence.night_roster`.
    - Desktop: wider, same marks.

**Overview**

12. **GlucoseProfile**: 24 h, 30 d. Shows the median, the 10–90% spread, the
    above-180 tint, the 70/180 lines with a 250 tick, meal density, and one
    Median callout.
    - States: default; insufficient data ("No data").
    - Fields: `time_of_day.pooled.bins[]` (median, p10, p90), `pooled.meals`,
      `target_range`.
    - Desktop: full pane width.
13. **TimeInRangeBar**: five AGP bands, each labelled; 70–180 labelled
    "In range".
    - States: each window.
    - Fields: `outcomes_*.metrics.tbr_lvl1, tbr_lvl2, tir, tar_lvl1, tar_lvl2`
      (bands derived as differences).
    - Desktop: the same.
14. **MetricFigure**: a value, its unit, and its change against 90 d (arrow,
    better/worse colour, units).
    - States: better; worse; unchanged (neutral); not available.
    - Fields: `outcomes_*.metrics.tir, mean_glucose, gmi, cv, tbr_lvl1,
      tar_lvl1`.
    - Desktop: the same, in a row.
15. **DayTile**: a weekday and date, sparkline over the 70–180 band, ▽/△
    counts or ✓, and in-range %.
    - States: default; selected; clean (✓); no data.
    - Fields: `day_navigator.days[]`.
    - Desktop: the Overview's recent-days strip and Day's month grid.

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

**Day**

17. **DayChart**: one day. Shows glucose with the 70–180 band, bolus markers
    (meal / correction), basal delivered against programmed, logged-carb
    markers, and an event list below.
    - States: default; no data; with logged carbs.
    - Fields: `timeline.cgm, boluses, basal, pump_events, sleep_windows`;
      `carbs.carb_entries`.
    - Desktop: wide, with the month grid of DayTiles beside it.
18. **PromptCard**: one low prompt, showing "Low · <date time> · <mg/dL>",
    its sparkline, and Yes · No · False low.
    - States: unanswered; Yes recorded (a checkmark on Yes, labelled "Recorded"
      for screen readers only, plus the optional grams field); mid-swipe (Not sure).
    - Fields: `prompts[].anchor_t, key_bg, cgm`; answers posted to
      `/api/prompts/answer`; grams via `PATCH /api/carbs/{id}`.
    - Desktop: a fourth button, Not sure, instead of the swipe.
19. **LogCarbsEntry**: a grams field sized to 3 digits, Time (a tappable row,
    default now), and Save.
    - States: empty; filled; saving; not saved.
    - Fields: posts `t, grams, certainty` to `/api/carbs`.
    - Desktop: a popover anchored to "+ Log carbs"; on phone, a bottom sheet
      on the system keyboard.

**Settings**

20. **ListRow**: label, inline value or state, ›; read-only rows have no ›.
    - States: navigable; read-only; with alert ("⚠ Failed"); with a secondary
      button ("Update"); disclosure, closed or open (expands in place: the
      Changes screen's last change).
    - Fields: `status`; `credentials.configured, email` (masked), `region`;
      `pump_settings.profile.segments[]`.
    - Desktop: the same.

The Glossary page is ListRow plus `.glossary` definitions. The Pump profile
segment table is ListRow in a dense variant.

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
- Three five-band time-in-ranges bars with band labels.
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
