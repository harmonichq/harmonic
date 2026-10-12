# Recommendations redesign

Status: **exploring**. The information architecture is approved (2026-10-12).
The Lock is approved as a draft and becomes binding when a direction is locked.

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
| Queue · Snoozed | Rows "Until <date>" + Restore | Not reachable (the footer is hidden at 0) | — | Unavailable + Retry | Restored (row leaves) |
| Queue · setting detail | current → estimate, range, n, chart | — | Chart skeleton | Unavailable | — |
| Changes | Active Trial or Focus + last change | "No active change" label | Skeleton | Unavailable + Retry | Maturing; Matured (result pill); **End** (Focus: anytime; Trial: once matured) → confirm sheet → ended |
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
| Swipe a Queue card to snooze it | Snooze icon button in the detail header; shortcut S |
| Swipe a Prompt to record Not sure | A fourth button, **Not sure** |
| Swipe the Day week strip | ‹ › buttons and a month grid that is always visible |
| Tap the month label to open the Month sheet | Month grid in the left pane |
| Bottom sheet for Log carbs, on the system keyboard | Popover anchored to "+ Log carbs" |
| Tap Undo in the snooze bar | Same bar, clickable; ⌘Z |

Desktop has no hover-revealed actions, and every action has a visible control.

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
| **Range** | noun | The engine's interval for the statistic it sits next to. |
| **Wide** | state | That range is wide; the evidence is thin. |
| **Episode** | noun | A dated event the engine cites as evidence. |
| **Prompt** | noun | A question about a low, asking whether carbs were eaten. |
| **Yes / No / False low / Not sure** | answer | A Prompt's answers. False low marks the reading itself as invalid. |
| **Log carbs** | verb | Record carbs eaten without a bolus. |
| **End** | verb | Stop watching the active change. |
| **Recorded** | state | An answer or entry was saved. |
| **In range, Below 70, Above 180, Mean, GMI, CV, Pre-meal, Post-meal 2 h** | metric | The standard CGM metrics. |
| **Tandem Source** | noun | The vendor account the data syncs from. |
| **Pump profile** | noun | The active pump settings, read-only. |

Any term not in this table may not appear in the UI.

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
| Primary (interaction) | `--primary` | #e07f3f |
| On primary | `--on-primary` | #1b1109 |
| Focus ring | `--ring` | rgba(210,116,62,.34) |
| In range | `--in-range` | #86ad78 |
| High | `--high` | #e2be4c |
| Low | `--low` | #ec6f55 |
| Warn | `--warn` | #c98a4e |
| Danger | `--danger` | #ec6f55 |
| Manual carb | `--manual-carb` | #d2743e |
| Radius | `--radius` | 4px |

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
| State pill | 20 px, uppercase 11 px label. |
| Badge | 16 px; a count pill or an alert "!". |
| Tab bar item / rail item | 44 px target, icon above label. |
| Sheet | Bottom-attached, 12 px top radius, grabber. |
| Popover | Anchored to its trigger. |
| Transient bar | Above the tab bar, label and one text action. |

### 2.3 Absolute bans
1. **Microcopy:** any sentence, question, subtitle, caption, explanation,
   empty-state prose or tooltip sentence. The Glossary definitions are the only
   exception.
2. **Predictions** of any kind.
3. **Invented labels, actions, advice, thresholds or targets.** Every term
   comes from §1.5.
4. **Colour as the only signal.** Every state carries a glyph, label or position.
5. **More than one primary action per screen**, or any other accent-filled control.
6. **Content not in the engine's served data.** Every value traces to an
   endpoint field. The checks are `copycheck.py` and the provenance table.

### 2.4 Approved screen list
The inventory in §1.3, with phone screens at 390 px and desktop at 1440 px.
Tablet follows desktop's structure at 1180 px. Approved 2026-10-12.

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
