---
name: harmonic
description: Local, advisory basal/ISF/I:C tuning for Tandem Control-IQ users — a clinical instrument, not a wellness app.
colors:
  primary: "#E07F3F"
  primary-600: "#EF9459"
  primary-100: "#40291B"
  on-primary: "#1B1109"
  secondary: "#A89A85"
  accent: "#D08150"
  accent-100: "#43291D"
  bg: "#0F0D0B"
  bg-tint: "#14120F"
  surface: "#221E1B"
  surface-2: "#14120F"
  text: "#F2EDE2"
  muted: "#A49C90"
  line: "#3F3833"
  danger: "#EC6F55"
  danger-bg: "#3A221C"
  ok: "#9AADA1"
  ok-bg: "#2B332D"
  warn: "#C98A4E"
  warn-bg: "#3A2B1B"
  in-range: "#86AD78"
  high: "#E2BE4C"
  low: "#EC6F55"
  on-target: "#86AD78"
  on-target-soft: "#2F3A2C"
  manual-carb: "#D2743E"
  manual-carb-soft: "#40291B"
  observed: "#86AD78"
  inferred: "#B08858"
  notindata: "#8D8579"
  basal: "#A89A85"
typography:
  title:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.02rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-.01em"
  body:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: ".9rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: ".72rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: ".1em"
  stat:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-.02em"
rounded:
  sm: "9px"
  md: "14px"
  pill: "999px"
  circle: "50%"
spacing:
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "22px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "10px"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-600}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "10px"
    padding: "9px 15px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "22px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "9px 11px"
---

# Design System: Harmonic

> **The Harmonic theme is locked** (2026-08-18, issue #736) and it **ships in
> `frontend/`**: the tokens are the single `:root` block in
> `frontend/material.css`, and the shell's role rules are `frontend/theme.css`,
> which loads last. Those two files are the source of truth for the app-wide
> material — colour, elevation, and the type split — and they supersede the
> palette and elevation values recorded below wherever the two disagree. Read
> them, not this file, for a colour. The design-time manifest the theme was
> settled against is a record of the decision and is not part of the shipped
> tree. **#304 retired the Light theme** (2026-09-01): the app ships Dark only,
> and the `:root` block above carries every token directly — no `html.dark`
> selector, no boot-time class, no stored preference. ADR 37 (pull request #37,
> parchment `#F3EADB`/`#EBE0CF`/`#E3D7C5` to bone `#FAF8F4`/`#F0EEE8`/`#E7E4DC`)
> and ADR 230 described the retired Light theme and its repaint behavior; their
> records stay as history and #304 supersedes them. Dark was separately
> re-settled by **ADR 255** (issue #255): one warm tonal ladder now owns the
> Diagnose desk, well, field, sheet, rail, rule, edge, and ink roles; chart
> wells sit below sheets; vessels use one visible edge; spotlight elevation is
> shadow-only; and glucose targets use boundary rails instead of a filled slab.
> The sections here still describe component anatomy and voice.
> The shell is locked **by role** (chrome bar · instrument rail · pane header rail ·
> pane body · dock floor), not by surface class: a rule scoped to `.dw` left Verify
> rendering as floating cards, and a rule that missed `.verify-strip` made the Trial
> line vanish. A new surface realises a role or is a recorded gap.

## 1. Overview

Diagnose puts the selected evidence chart ahead of the glucose overview. The
overview remains the real clock control surface below it. **All charts** opens
the full catalog directly, rather than a docked chart strip. At phone widths,
Spotlight, the overview, Findings and Watching form one vertical reading flow;
temporary chart catalog and fullscreen states still own the viewport.

**Creative North Star: "The Diagnostic Instrument"**

Harmonic reads like a piece of clinical equipment a technically literate patient trusts, not a consumer wellness app trying to be liked. There is no hero typography, no marketing voice, no gamification — the largest text on the page is a numeric stat (1.4–1.5rem), never a headline. The Diagnose stage card's served headline sentence is a card title under that cap, not a page headline. Every visual decision serves one goal: let a single self-hosted user read their own glucose/insulin data and trust a specific number enough to bring it to their clinician. The system is calm, precise, and evidence-first — color and shape encode meaning (glucose state, evidence tier, bolus kind), never decoration for its own sake.

This system explicitly rejects **consumer health/wellness app** conventions (Apple Health, MyFitnessPal): no badges, streaks, mascots, or congratulatory copy. It also rejects the **generic SaaS analytics dashboard**: no hero-KPI-tile templates, no gradient accent cards, no stock chart-library defaults dropped in unmodified.

**Key Characteristics:**
- Restrained, tinted-neutral palette with two committed colors (burnt-orange primary, muted terracotta accent) — never cream/sand-default.
- Flat by default; a single soft ambient shadow is the only elevation tier.
- No display/hero typography — the numeric stat, not the headline, is the largest text on any screen.
- Domain color tokens (glucose in-range/high/low, evidence tiers, manual-carb) are first-class citizens alongside the brand palette, because this is a data-encoding system as much as a brand system.

## Voice and user-copy register

This is the canonical register for app surfaces and accessible labels. Engine code
and technical documentation keep their established domain terms.

1. Use plain app and user language. Keep sentences short and use no prose em dashes.
   Let visuals and clear numbers carry the meaning.
2. Do not expose engine jargon such as "fitted relationship," "asserts," "pooled,"
   or attribution codes.
3. Do not say "clean nights," "clean slots," or "clean days." Say **"nights of
   steady data."**
4. Never show the 0–100 urgency number. **Decide now**, **Next in line**, **Worth a
   look**, and **noted** are the complete ranking-tier vocabulary. **Flagged**,
   **Held**, **Held for safety**, and **collecting** are result states, not severity
   tiers.
5. Charts explain themselves through on-chart legend chips, not caption sentences.
   A chart that requires a paragraph fails the bar.
6. Direction-only findings name the direction in user terms wherever the trend is
   referenced, such as **"Corrections look stronger than needed."**
7. Use these refusal lines verbatim:
   - **"No new number is available, so there is nothing to stage."**
   - **"A change is already being watched, so nothing new starts until it finishes."**
8. User copy uses **Correction factor**, **1 U : 36 mg/dL**, and **Carb ratio**.
   Reserve **segment** for actual pump-profile and I:C segments. Show basal model
   slots as bare time ranges, such as **Basal · 00:00–00:30**. Engine code and
   technical documentation retain **ISF**, **slot**, and **I:C**.
9. A carb-ratio result's meal window is always fixed and longer than the audit's
   own look-back, so name the reason once, in its method-and-evidence ledger:
   **"90 days, longer than the rest of this audit because meals need more time to
   gather enough runs to measure."** Nothing else in that result says "in this
   window" without naming the 90 days it means.

### Worked examples

- Before: "Hold without a number. The fitted relationship points weaken, but no
  target is produced while lows own the safer reading."
  After: "Recent lows outweigh the trend, so no new number is suggested."
- Before: "Hold without a replacement. Recurring lows outrank the measured rate in
  this slot."
  After: "Lows keep happening at this hour, so this rate stays as it is."
- Before: "One cautious basal step is available. The measured rate supports 1.23 U/h
  for this slot."
  After: "20 nights of steady data support a step from 1.10 to 1.23 U/h."

## 2. Colors

Two committed brand colors (primary, accent) carry identity; a much larger set of domain-semantic tokens carries data meaning. #304 retired the Light theme, so the app ships the Dark value of each token alone — the swatches below name that shipped value, read directly from `frontend/material.css`'s `:root` block (e.g. primary is burnt orange `#E07F3F`, tuned to hold contrast against a near-black surface).

### Primary
- **Burnt Orange** (`--primary`, `#E07F3F`): the one recurring brand color — primary buttons, active tab underline, focus rings, links. Used sparingly outside of these functional roles.
- **Primary Tint** (`--primary-100`, `#40291B`): pill/badge backgrounds and hover fills where primary needs a soft surface, not a solid fill.

### Secondary
- **Warm Grey** (`--secondary`, `#A89A85`): a quieter secondary text/icon tone, used far less than `--muted` — reserve for de-emphasized-but-not-disabled content.

### Tertiary
- **Terracotta** (`--accent`, `#D08150`): the interaction accent — bolus markers, near-miss highlights, CIQ-added indicators, and reject actions. High glucose is `--high` (see Data Semantics below), a gold of its own, never this token or `--primary`.

### Neutral
- **Background** (`--bg`, `#0F0D0B`): page background — ADR 255's desk.
- **Surface** (`--surface`, `#221E1B`): card and popover background — ADR 255's sheet.
- **Surface Tint** (`--surface-2`, `#14120F`): table header rows, hover states, chip backgrounds — one step off `--surface`; ADR 255's chart well.
- **Ink** (`--text`, `#F2EDE2`): body text.
- **Muted** (`--muted`, `#A49C90`): secondary text, labels, placeholders. Meets 4.5:1 against `--bg`.
- **Hairline** (`--line`, `#3F3833`): all borders and dividers.

For the Diagnose Dark workstation, ADR 255's shipped role ladder supersedes
the legacy examples above: desk `#0F0D0B`, chart well `#14120F`, field
`#1E1A17`, sheet `#221E1B`, rail `#2B2622`, rule `#3F3833`, vessel edge
`#453D35`, and inks `#F2EDE2` / `#CFC8BD` / `#A49C90` (nav `#C6BFB3`).
The `--wk-*`, `--mk-*`, `--ck-*`, and compatibility namespaces derive from
those roles; they are not independent palettes. Forest green remains confined
to data marks and burnt orange to interaction.

### Data Semantics (domain-specific, not brand)
These encode meaning in glucose/insulin charts and are never used decoratively:
- **In-range** (`--in-range`, `#86AD78`): glucose within target band.
- **High** (`--high`, `#E2BE4C`, gold) / **Low** (`--low`, `#EC6F55`): glucose excursions. Distinguished from each other by hue, not just lightness. High takes a hue no control uses, so a high reading never looks tappable (ADR 317); the CGM convention of yellow-high, red-low is what it follows.
- **On-target** (`--on-target`, `#86AD78`): a separate token reserved for "hit the target exactly" — currently the same shipped value as `--in-range`, so it is always paired with a shape or label per the Color-Never-Alone Rule below, never told apart from in-range by hue alone.
- **Manual Carb** (`--manual-carb`, `#D2743E`): the user-entered carb-log token, kept visually distinct from pump-sourced bolus-carb grey by design (CONTEXT.md: Carb log vs. bolus-carbs are unrelated streams).
- **Observed / Inferred / Not-in-data** (`--observed`, `#86AD78` / `--inferred`, `#B08858` / `--notindata`, `#8D8579`): the evidence-tier vocabulary for the scenario/walkthrough views — always paired with a shape or label, never color alone (accessibility requirement).
- **Basal** (`--basal`, `#A89A85`): the basal-rate chart-series token; currently the same shipped value as `--secondary`.

### Named Rules
**The Color-Never-Alone Rule.** Every glucose/evidence/bolus semantic that uses color must pair it with a shape, icon, or text label. Color-only encoding of clinical state is prohibited — this is a hard accessibility requirement (see `bolus_symbol` shape mapping and the daily-chart legend as the reference implementation), not a nice-to-have.

**The Two-Green Rule.** `--on-target` and `--observed` are both green but serve different charts and are never rendered in the same view; don't introduce a third green without checking this collision first.

## 3. Typography

**Body Font:** Inter (with `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` fallback)

**Character:** A single geometric-humanist sans carries every role in the app — there is no serif/display pairing, because there is no display typography at all. Weight and size do the hierarchy work instead of a second family.

### Hierarchy
- **Title** (700, 1.02rem, -.01em tracking): card headers (`.card h2`), section leads. The largest recurring text style in the app.
- **Stat** (800, 1.4–1.5rem, -.02em tracking, tabular nums): the one place text gets genuinely large — a hero number inside a card (e.g. I:C stat, guide term-rate), always with `font-variant-numeric: tabular-nums` so digits don't jitter.
- **Body** (400–600, .84–.9rem, 1.5 line-height): table cells, prose, form values.
- **Label** (700, .72–.76rem, .05–.1em tracking, uppercase): section eyebrows, form labels, table headers. Used for structural labeling, not as a decorative kicker — see Do's and Don'ts.

### Named Rules
**The No-Hero Rule.** No heading in this system exceeds 1.5rem. If a screen seems to need a bigger number, it should be a Stat-style tabular-nums figure inside a card, not a page-level display headline — this is a clinical instrument, not a landing page. The Diagnose stage card's headline (ADR 306) is a card title that lives under this cap; it is the one sentence-length title in the system, and it never becomes a page headline.

## 4. Elevation

Flat by default with exactly one shadow token (`--shadow`) reused everywhere elevation is needed — there is no multi-tier elevation scale. Depth signals "this is a floating/interactive surface" (card, button, popover, drawer), not hierarchy of importance; importance is carried by typography and color, not shadow depth.

### Shadow Vocabulary
- **Ambient** (`box-shadow: 0 1px 2px rgba(0,0,0,.5), 0 16px 34px -16px rgba(0,0,0,.8)`, `--shadow`): the single shadow used on cards, primary buttons, icon buttons, popovers, and drawers — deep and dark to compensate for the near-black surface.

### Named Rules
**The One-Shadow Rule.** Don't introduce a second shadow tier ("elevated," "raised," "floating") — every floating surface in this system uses the same `--shadow` token. If something needs to look more prominent, change its color or border, not its shadow depth.

## 5. Components

### Buttons
- **Shape:** 10px radius on primary/ghost buttons, 11px on icon buttons (`--btn-icon`), pill (999px) on chip-style toggles.
- **Primary:** solid `--primary` fill, `--on-primary` text, ambient shadow, 10–16px padding. Hover darkens to `--primary-600`; active nudges down 1px (no scale transforms).
- **Ghost:** transparent fill, 1px `--primary` border, `--primary` text; hover fills with `--primary-100`.
- **Icon:** square-ish (42×42px), `--surface` background, `--line` border, ambient shadow; hover shifts icon color to `--primary`, never the background.
- **Disabled:** `opacity: .55` + `cursor: not-allowed` across every button variant — one consistent disabled treatment, not per-component.

### Chips / Pills / Badges
- **Pill** (`.pill`): 999px radius, `--primary-100` bg / `--primary` text for informational tags; a `.warn` variant swaps to `--warn-bg`/`--warn` with a solid border for attention-worthy tags.
- **Badge** (`.badge`): inline-flex with a small `currentColor` dot, used for status (ok/warn/err) rather than category — the dot is the state indicator, not decoration.
- **Tab** (`.tab`): transparent background, bottom-border-only active state (2px `--primary` underline) — no filled/pill tab treatment anywhere.

### Cards / Containers
- **Corner Style:** 14px radius (`--radius`).
- **Background:** `--surface`, 1px `--line` border, ambient shadow, 22px internal padding.
- **Header:** `.card h2` currently carries a 4px colored left tab (`::before`, always `--primary` regardless of card state) — flagged in the latest critique as decorative rather than semantic; treat as a candidate for removal or for being made state-dependent, not as a pattern to propagate to new components.
- **Full-width variant:** `.card.full` spans the grid via `grid-column: 1 / -1`.

### Inputs / Fields
- **Style:** 1px `--line` border, `--radius-sm` (9px) corners, `--surface` background, inherited font.
- **Focus:** border shifts to `--primary` + a 3px `--ring` glow (`rgba(210,116,62,.34)`) — no color-only focus state; the ring is always paired with the border-color shift.
- **Label:** uppercase-free, `.76rem` `--muted` text above the field, 500 weight.

### Navigation
- **Tabs:** flat, bottom-bordered, `--muted` inactive / `--primary` active text+underline. Currently 8 flat entries with no visual primary/secondary grouping — the in-flight IA redesign (ADR 0027 / issue #243) will collapse this to Diagnose/Verify/Day as primaries with Plan/Guide/Settings as visually distinct supporting tabs; don't invest further in the current 8-tab treatment.

### Tooltip (signature component)
- **Style:** pure-CSS `.has-tooltip` primitive (no JS) — dark (`--text`-colored) callout bubble with a small triangle pointer, shown on `:hover` and `:focus-visible` alike. This is the system's one reusable "define a term inline" mechanism (glossary terms, chart legends) and should be reused rather than re-invented per feature.

### Toast / Banner
- **Toast:** solid-tint background (`--ok-bg`/`--danger-bg`) with matching text color, no border, 10px radius — used for transient save/error confirmation.
- **Data-quality banner:** `--warn-bg` fill with a full `--warn` border (heavier than the toast's borderless treatment) — reserved for a persistent, dismissible data-caveat notice, not a one-off alert.

## 6. Do's and Don'ts

### Do:
- **Do** keep the palette to two committed brand colors (burnt-orange primary, terracotta accent) plus the neutral ramp — resist adding a third "brand" color; new meaning should extend the Data Semantics set instead.
- **Do** pair every color-coded clinical signal (glucose state, evidence tier, bolus kind) with a shape, icon, or text label. This is a hard accessibility requirement, not a style preference.
- **Do** use the single `--shadow` ambient token for every floating surface; let color/border carry emphasis instead of shadow depth.
- **Do** keep numeric emphasis in `font-variant-numeric: tabular-nums` wherever a stat can update (I:C stats, chart hovers) so digits don't jitter.
- **Do** reuse the `.has-tooltip` primitive for any new inline-definition need rather than building a new popover mechanism.

### Don't:
- **Don't** read this bullet's predecessor as still standing: it forbade warm parchment in the neutral ramp, and the locked Harmonic theme (#736) is exactly that — a warm sheet on a dark desk, with the ramp's saturation spent on marks instead of grounds (ADR 37 relit that sheet from parchment to bone, taking the beige out while keeping the warmth). What survives is the reason behind it: grounds stay low-chroma so only data and interaction carry colour.
- **Don't** add gamification UI (badges, streaks, congratulatory copy, mascots) — an explicit anti-reference from PRODUCT.md; this is a clinical instrument, not a wellness app.
- **Don't** add generic-SaaS-dashboard scaffolding — hero KPI tiles, gradient accent cards, stock unmodified chart-library defaults — another explicit PRODUCT.md anti-reference.
- **Don't** use a `border-left` greater than 1px as a purely decorative colored stripe. The current `.card h2::before` 4px left-tab and its five sibling instances (advisory callouts, table-row grouping, warning callouts, popovers) are a known, flagged pattern — don't propagate it into new components; the in-flight Verify redesign has already dropped it ("no card accent").
- **Don't** exceed 1.5rem for any heading or display text — there is no hero/display tier in this system; a bigger number belongs in a Stat-styled card, not a page headline.
- **Don't** rely on hover-only interaction for any state-carrying element (flag lists, calendar heat-map cells currently do this) — pair with `:focus-visible` and a keyboard path, per the existing `.has-tooltip` precedent.


### Eating-sequence evidence (#342)

High-carb sequence and Repeat eating are habit causes nested under Highs after
meals. Each retains its own sequence count and canonical evidence chart, including
when its winning episode covers no meal. The parent keeps its meals denominator
and Pattern case chart.

The sixth registry family, eating-sequence, reuses the shared tile, mini mount,
All charts and fullscreen shell. Repeat eating uses cohort aggregate dots with
the shipped comparison/matched colors and diamond/circle redundancy. High-carb
sequence uses the backend-owned title “Glucose after high-carb eating” (or
“Glucose during high-carb eating” for an in-sequence comparison) and the shared
response renderer: observed glucose in mg/dL over time
from the end of eating, the target range, named highest-carb and other-sequence
curves, cohort support and source scope. The legend names “Sequences at all times
of day” or “Evening sequences” within the source population, independently of the
clock-filtered roster. A selected singleton paints one focus-colored marker;
dense selected traces retain lines without markers. Its supporting detail retains the full numerical comparison summary and all three
served aggregate intervals, including explicit unavailable cells. The mini rank
omits axis furniture and interaction. The end anchor keeps two lines; narrow
High-carb charts omit the adjacent +1 h label to leave reading space. Short
during-eating windows retain a tick at the zero-minute end anchor. The shared
readout overlays the High-carb headline without moving its Full control, with
three reserved rows in narrow stage and fullscreen headers. Pattern alignment is unchanged.
The dedicated fixture retains producer preparations (including findings.rows), rendered rows and cases for global and 0–360 windows, interns repeated JSON values as $ref entries, and expands them unchanged through frontend/eating-sequence-fixture.js. It losslessly retains every roster selection, including clean reference sequences, through shared JSON values.
Chart-level revision of these surfaces happens in the served desk, not in a
second composition of it: ADR 416 deleted the component harness, and AGENTS.md's
no-fetch QA copy-then-serve over a generator-owned synthetic case store is the
safe surface that replaced it. A chart revised there is the shipped chart. The
coordinator owns rendered direction review and the three-viewport evidence
matrix.

### #404 desk revise amendment

Window and Filter share compact control material in resting, expanded, and
Findings-loading states. Diagnose, Changes, and Day share one reading rail;
grouped comparison headings own their constant cohort label so each row keeps
its event description, while mixed case rows retain their varying tier before
their long text truncates. Selected Pattern glucose and markers render only from
the served case file. Focus admission remains backend-owned: a withheld child
offers only its uniquely served parent context and states the served reason.
The 2026-09-11 operator request for Filter to match the resized Window control
is carried by this revise record; no new caret is needed because visual review
found the resting v2 control readable as Window's peer.

#413 completes the rail and lane that #404 left unfinished (Connor's design
lock, 2026-09-14). Every value painted below is served. No token in
`frontend/theme.css` changed.

- **Pattern fold.** A Pattern owns its claimed causes. They fold under it on
  one spine, a rule down the title column in the rule ink, one line per cause:
  the name, its share of the Pattern's count, then the drill.
  - The cause's other served counts sit on the line's second row in the muted
    ink, behind the words "outside the count" (#424, Connor's "Q2 A",
    2026-09-23). A cause under a Pattern that serves no count has no share, so
    its line leads with those words. No outcome word prints.
  - The fold's toggle names the cause count and sits inside the Pattern's own
    list item, with a triangle caret.
  - The causes are a nested list the toggle controls.
  - The fold is open on the first ranked row and closed below it.
  - A cause is never a sibling row and draws no mini.
- **Urgency.** The first served tier paints its caption and rank numeral in
  primary. Its rows carry a straight 3 px rank stripe on a squared left edge.
  Later tiers stay quiet.
- **Count sentence.** Every count-bearing row prints the served
  `n of d noun outcome`, with the count and denominator at weight 600. Unpriced
  tail rows print it too, still with no tag, summary or mini.
- **One mini.** Every mini drawn from a served count sentence is one
  instrument:
  - the claimed cohort's outcome word and count at left, in the miss ink;
  - TYPICAL and the denominator at right, in body ink, with the only
    interquartile band (muted);
  - unmarked solid medians;
  - the case file's served anchor label on the anchor line;
  - a dashed 70–180 target band.
  Setting rows keep their night strip. The By-event stage keeps its own
  `--ec-*` cohort inks.
- **Basal lane.** The lane's head row carries its name and the served verdict
  key with counts, above the cells.
  - Hold paints a filled neutral, raise the high gold with an up glyph, lower
    the accent with a down glyph.
  - Insufficient is hatched and no data dotted, each key mark on its cells'
    paint.
  - The selection keeps a 1 px primary outline, offset from the cell. The
    stage keeps a 2 px accent underline.
  - Cells release the shell's button height floor, so every cell sits inside
    the 11 px track.
  - A lower the backend serves because lows keep recurring at that hour has
    its own key word, "lower · recurring lows", on the lower paint and glyph.
    Its cells are named "suggests a lower because lows keep happening at this
    hour". The word is read from the served status alone (#433).
  - The key stands on one line at 1280×720 and 1440×900. Near the narrowest
    split it wraps between whole entries, taking the extra line from the chart
    inside the fixed body, so no entry, cell or chart edge runs past the pane.
  - On a desktop window too short for the canvas pane's row floors, the pane
    scrolls vertically, so the lane is always within reach. At the supported
    sizes it has no scroll range.
- **Window caption.** The glucose overview's window caption stands on one line
  wherever that line fits, inside its window or beside it in the roomier
  margin. Where it fits neither, it stacks inside whichever is wider: the
  window's name on one line and, on a thin window, the insufficient-sample
  notice on the next, each breaking only between whole words and each line on
  the knock-out pad the target caption wears. The target caption then sits on
  the band's floor. No word is split, cut or dropped (#455).
- **Axis labels under the target numerals.** A glucose axis label that would
  sit under the 70 or 180 numeral is not printed; the numeral names the target
  line there.
- **Spotlight verdict line.** At the Spotlight's middle rank the verdict line
  breaks between its facts where they do not fit one line, never inside one,
  and the tally line and the figure move down with it. The programmed-rate rule
  ends at the axis tick, above the tick labels.
- **All charts at the narrowest split.** Between 832 and 1023 px wide the All
  charts control shows its icon only, keeping its name and tooltip, so the
  overview's title draws; the header stays one line.
- **Resize.** The overview and the evidence charts re-lay out when the window
  is resized, so a narrowed window gets the narrow layout rather than the wide
  one rescaled.
- **24 h arrival.** Diagnose opens on 24 h when nothing else chooses a window.
  A contextual entry or a retained window still wins, and the workstation's
  ISF, drill, occurrence and drawn presets keep Overnight.
- **Cold skeleton.** A cold destination shows one text-free skeleton per pane.
  - The stage shows a window bar, the nameplate's two lines and the
    instrument's chart well.
  - The rail shows four rows, the first tall enough for its mini.
  - Both sit one surface step above the field and shimmer slowly, still under
    reduced motion.
  - The status role and its named text are unchanged.
- **Evidence.** A private design-evidence record — not part of the public
  tree — holds the evidence and the critique. The desk ledger's S113–S117
  hold the replays.

#423 revises the Day Episode Log's claimed anchors, under the operator's
standing Q2 sanction of 2026-09-23. No token in `frontend/theme.css` changed.

- **Claimed.** An anchor whose served state is outranked reads `claimed`.
  Diagnose's label for an outranked occurrence reads `claimed by another
  finding`, built from the same exported word. A claimed row names what its
  anchor matched, by served title, then ends with the episode's served Lever
  name.
- **Hue.** A claimed anchor takes its Finding's hue on the tier word, both rings
  and the focus hairline, and its resting marker the fired marker's size. The
  warning hue leaves the Episode Log. The word, not the colour, tells a claimed
  anchor from the one that drove its episode.
- **Count.** The Findings caption counts distinct Findings, one per served
  Lever, and names claimed anchors beside it: `Findings · 1 · 1 claimed`.
- **Glossary.** Each band caption ends in a small `Glossary` link button, in
  sentence case against the uppercase caption. It opens the Glossary at its
  Episode Log group, and Close returns focus to it. Below 700px, where the
  Episode Log is a sheet, closing the Glossary returns to the open sheet, so the
  same control takes focus back.
- **Evidence.** The desk ledger's S121 and S122 hold the replays; a private
  design-evidence record — not part of the public tree — holds the logs and
  captures.
