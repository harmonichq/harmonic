---
name: harmonic
description: Local, advisory basal/ISF/I:C tuning for Tandem Control-IQ users — a clinical instrument, not a wellness app.
colors:
  primary: "#1C6E8C"
  primary-600: "#15576F"
  primary-100: "#E2EEF2"
  on-primary: "#FFFFFF"
  secondary: "#566069"
  accent: "#C2554D"
  accent-100: "#F8E6E4"
  bg: "#F7F8FA"
  bg-tint: "#F1F4F7"
  surface: "#FFFFFF"
  surface-2: "#F1F3F5"
  text: "#1B2126"
  muted: "#656D76"
  line: "#E3E7EA"
  danger: "#B3402C"
  danger-bg: "#F7E4DF"
  ok: "#1C6E8C"
  ok-bg: "#E2EEF2"
  warn: "#93701B"
  warn-bg: "#F6EFDC"
  in-range: "#1C6E8C"
  high: "#C2554D"
  low: "#B3402C"
  on-target: "#2A8C5E"
  on-target-soft: "#E2F4EC"
  manual-carb: "#93701B"
  manual-carb-soft: "#F6EFDC"
  observed: "#2A8C5E"
  inferred: "#93701B"
  notindata: "#69727B"
  basal: "#4A6FA5"
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
> `frontend/`**: the tokens are the single `:root` block at the top of
> `frontend/index.html`, and the shell's role rules are `frontend/theme.css`,
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

**Creative North Star: "The Diagnostic Instrument"**

Harmonic reads like a piece of clinical equipment a technically literate patient trusts, not a consumer wellness app trying to be liked. There is no hero typography, no marketing voice, no gamification — the largest text on the page is a numeric stat (1.4–1.5rem), never a headline. Every visual decision serves one goal: let a single self-hosted user read their own glucose/insulin data and trust a specific number enough to bring it to their clinician. The system is calm, precise, and evidence-first — color and shape encode meaning (glucose state, evidence tier, bolus kind), never decoration for its own sake.

This system explicitly rejects **consumer health/wellness app** conventions (Apple Health, MyFitnessPal): no badges, streaks, mascots, or congratulatory copy. It also rejects the **generic SaaS analytics dashboard**: no hero-KPI-tile templates, no gradient accent cards, no stock chart-library defaults dropped in unmodified.

**Key Characteristics:**
- Restrained, tinted-neutral palette with two committed colors (teal primary, muted terracotta accent) — never cream/sand-default.
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

Two committed brand colors (teal, terracotta) carry identity; a much larger set of domain-semantic tokens carries data meaning. #304 retired the Light theme, so the app ships the Dark value of each token alone — the swatches below name only that shipped value (e.g. primary is the brighter, more saturated teal `#5BAFD0`, tuned to hold contrast against a near-black surface, not a filtered/inverted version of a light-mode color that no longer ships).

### Primary
- **Deep Teal** (`#5BAFD0`): the one recurring brand color — primary buttons, active tab underline, focus rings, links, the "in-range"/"ok" glucose semantic. Used sparingly outside of these functional roles.
- **Teal Tint** (`--primary-100`, `#1C2C32`): pill/badge backgrounds and hover fills where primary needs a soft surface, not a solid fill.

### Secondary
- **Slate** (`--secondary`, `#9BA0A6`): a quieter secondary text/icon tone, used far less than `--muted` — reserve for de-emphasized-but-not-disabled content.

### Tertiary
- **Muted Terracotta** (`--accent`, `#E08B7E`): the accent color and the "high glucose" / "ran-high" semantic. This dual role is intentional — it reads as "attention, not alarm," matching the brand's refusal to over-dramatize excursions.

### Neutral
- **Paper** (`--bg`, `#15171A`): page background. Explicitly cool-neutral, not cream/sand-tinted.
- **Surface** (`--surface`, `#1C1F22`): card and popover background.
- **Surface Tint** (`--surface-2`, `#24272B`): table header rows, hover states, chip backgrounds — one step off `--surface`, never a third tone.
- **Ink** (`--text`, `#E9EAEC`): body text.
- **Ash** (`--muted`, `#93979E`): secondary text, labels, placeholders. Meets 4.5:1 against `--bg`.
- **Hairline** (`--line`, `#2C2E33`): all borders and dividers.

For the Diagnose Dark workstation, ADR 255's shipped role ladder supersedes
the legacy examples above: desk `#0F0D0B`, chart well `#14120F`, field
`#1E1A17`, sheet `#221E1B`, rail `#2B2622`, rule `#3F3833`, vessel edge
`#453D35`, and inks `#F2EDE2` / `#CFC8BD` / `#A49C90` (nav `#C6BFB3`).
The `--wk-*`, `--mk-*`, `--ck-*`, and compatibility namespaces derive from
those roles; they are not independent palettes. Forest green remains confined
to data marks and burnt orange to interaction.

### Data Semantics (domain-specific, not brand)
These encode meaning in glucose/insulin charts and are never used decoratively:
- **In-range** (`--in-range`, shares Primary teal): glucose within target band.
- **High** (`--high`, shares Tertiary terracotta) / **Low** (`--low`, `#E08B6E`): glucose excursions. Distinguished from each other by hue, not just lightness.
- **On-target** (`--on-target`, `#3DB87E`): a third, separate green reserved for "hit the target exactly" — never conflated with in-range teal.
- **Manual Carb** (`--manual-carb`, `#D9B568`, shares Warn): the user-entered carb-log amber, kept visually distinct from pump-sourced bolus-carb grey by design (CONTEXT.md: Carb log vs. bolus-carbs are unrelated streams).
- **Observed / Inferred / Not-in-data** (`--observed` green, `--inferred` amber, `--notindata` grey): the evidence-tier vocabulary for the scenario/walkthrough views — always paired with a shape or label, never color alone (accessibility requirement).
- **Basal** (`--basal`, `#6E8BB5`): a fourth, dedicated blue reserved for basal-rate chart series so it's never confused with the teal in-range/primary color in the same chart.

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
**The No-Hero Rule.** No heading in this system exceeds 1.5rem. If a screen seems to need a bigger number, it should be a Stat-style tabular-nums figure inside a card, not a page-level display headline — this is a clinical instrument, not a landing page.

## 4. Elevation

Flat by default with exactly one shadow token (`--shadow`) reused everywhere elevation is needed — there is no multi-tier elevation scale. Depth signals "this is a floating/interactive surface" (card, button, popover, drawer), not hierarchy of importance; importance is carried by typography and color, not shadow depth.

### Shadow Vocabulary
- **Ambient** (`box-shadow: 0 1px 2px rgba(20,28,22,.05), 0 14px 30px -18px rgba(20,28,22,.20)` light / `0 1px 2px rgba(0,0,0,.3), 0 18px 36px -20px rgba(0,0,0,.55)` dark): the single shadow used on cards, primary buttons, icon buttons, popovers, and drawers. Softer/tighter in light mode, deeper/darker in dark mode to compensate for the near-black surface.

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
- **Focus:** border shifts to `--primary` + a 3px `--ring` glow (`rgba(28,110,140,.16)` light / `rgba(91,175,208,.22)` dark) — no color-only focus state; the ring is always paired with the border-color shift.
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
- **Do** keep the palette to two committed brand colors (teal primary, terracotta accent) plus the neutral ramp — resist adding a third "brand" color; new meaning should extend the Data Semantics set instead.
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
