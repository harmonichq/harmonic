# Design

## ADR 582 — Keyboard use and accessibility are Storybook gate prechecks, walked by hand-written keys and Playwright's own accessibility tree

**Context.** The visual prechecks (#483) judge every story as it rests. Nothing
judged how a story behaves for a keyboard or a screen reader, and the operator
asked for a systemic bar rather than a one-off pass (#582). The issue left two
questions open: whether to take axe-core for the accessible-name and contrast
rules, and whether the criteria also become the `/ui-craft` standard.

**Decision.**

1. The criteria are prechecks of the existing Storybook gate, judged by one more
   pure function beside the visual prechecks (`interactionProblems`), over what a
   keyboard walk of the same rendered story found. A story fails closed on any of
   them, as it does on a visual precheck.
2. **No new dependency.** Accessible names are read from the browser driver the
   gate already runs: Playwright's accessibility snapshot of each control and
   graphic, which computes the name by the ARIA rules. Contrast is the WCAG 2.x
   luminance formula, a dozen lines, over the colour tokens as the page paints
   them. axe-core would have bought neither: its name rule reads the same tree,
   and its contrast rule judges each render, which the issue said not to do.
3. **The keyboard walk is hand-written**, with the keys a keyboard user has:
   - *Reachable*: a native control, anything with a role or tabindex, and
     anything React gives a tap handler (click, double-click, mouse down or up)
     is a control; each needs a role and must be reached by Tab, which the walk
     presses from the top of the document until focus leaves the story. A Tab
     stop that is no visible control (drawn at opacity 0, say) fails.
   - *Visible focus*: each element Tab reaches is compared with its own rest
     (outline, shadow, background, borders, colour, its pseudo-elements and its
     parent); identical fails. A story's held pseudo state (`.sb-focused`) is
     dropped first, so it cannot stand in for the control's own focus. A text
     field shows its focus by its caret: the grams field's accent underline is
     drawn by its `focused` prop, as the lock draws it, not by keyboard focus.
   - *Named*: every control, and every SVG, canvas or image not hidden from
     assistive technology, has an accessible name. The name reads as words: two
     pieces of the control's own text that the name reads with nothing between
     them fail (word and word, word and number), and no badge drawn on the
     control is inside it (a count or an alert is the control's description). A
     graphic drawn as an image (`role="img"`) hides no text of its own; a chart
     that draws text is a named group, so its text stays readable. A tab, and a
     button among two or more in a group, exposes pressed, selected, checked or
     current; nothing focusable sits inside `aria-hidden`.
   - *Order*: no positive tabindex, and Tab never moves up a column or left along
     a line within one region (a scrolling pane, or what lies outside every pane).
   - *Escape and return*: every control that declares `aria-haspopup="dialog"` is
     pressed with Enter; its dialog must take focus, close on Escape and hand
     focus back to it. It is marked modal (`aria-modal`) exactly when nothing
     beside it still takes a tap, read by hit-testing every control outside it,
     and a modal one keeps focus through one more Tab and Shift+Tab than it has
     stops. A dialog a story already shows is walked for its focus, trap and
     Escape, and, once Escape has closed it, from its trigger again, which
     proves the return. A trigger that reads open while it draws no dialog
     fails. A component story draws a trigger whose dialog its screen owns, so a
     trigger that opens nothing fails at once only on a screen's story, and a
     whole run proves its label opens a dialog on some screen's story. Every
     dialog that appears while a story renders or plays is recorded with the
     control pressed just before it: that control must declare it. A whole run
     proves every dialog any story draws was opened from its trigger and closed
     by Escape somewhere.
   - *Target size*: on a phone-width frame (under 1024 px, the preview's own
     phone/desktop split) every control takes a tap at its centre and 22 px out
     each way. The screen's edge counts as part of the target. At any width, a
     control pinned over a scrolling page (a bar, the tab bar) is hit-tested at
     every 12 px of the page's scroll: a tap on it that lands on a control
     scrolled beneath it fails.
   - *Announced*: a status sits in a live region. Statuses are read from where
     the app writes them: every transient bar's label (`.ui-bar__label`, the
     one component that raises Not saved, Snoozed until, Waiting for pump and
     Focus started), and the Prompt's "Recorded"; a heading with a status's
     words names a section and is not a status.
   - *Contrast*: once per run, every text ink on every ground the components
     draw on at 4.5:1, and the focus ring and the glucose band fills at 3:1.
4. **Each story is walked once, at its own frame's width, not at both phone and
   desktop as the issue asked.** This is for the operator to accept or reject.
   Screens switch layout by their `layout` prop, not by the viewport, so a phone
   story drawn at desktop width is still the phone layout, only wider: a second
   width would walk the same layout twice and prove nothing about the other.
   The screens' phone and desktop stories each carry their layout at its width,
   so every screen is walked in both layouts; a component story is walked at
   the one width it is drawn at. If the operator wants both widths, the cost is
   a second walk of every story (about doubling the gate's walk time) for no
   layout the walk does not already see.
5. **Fixes keep the lock.** A control under 44 px keeps its drawn size and gains
   an unpainted hit area; the button is its own stacking context, so its hit
   area never stacks above anything the button does not (a bar pinned over it
   is over its hit area too). A dialog's focus contract is one hook
   (`useDialogFocus`) every sheet and popover uses: focus in, focus kept when
   what held it goes, focus back to the trigger on close, or, when closing took
   the trigger away (a confirmed End), to the nearest heading still on the
   page; a sheet over a scrim is modal and keeps Tab inside, and an anchored
   desktop popover, beside a page that still takes taps, is not modal and lets
   Tab out. A sheet whose scrim also shows something to press (Settings' Not
   saved bar and its Retry, over the account form) is one dialog, the scrim, so
   that Retry is inside the Tab cycle. Escape stays with each screen, which owns what closing means. A
   trigger declares its dialog through the component it is drawn with.
6. **Exemptions are listed in the precheck's own allowlists, each with its
   reason** (`INTERACTION_EXEMPT`, `CONTRAST_EXEMPT`). There are five: a sheet's
   scrim, whose keyboard equivalent is Escape on its dialog, which the walk
   proves; a control an open dialog or its scrim covers, which no tap and no Tab
   reaches while it is open (skipped for reachable and target size only: its
   name is still read, and a control beside the dialog is checked as any); a
   Prompt's answers in the Mid swipe stories, a finger's frame held still that
   the app never rests in; Day's "+ Log carbs" while the day loads, whose sheet
   opens once the day lands (which a loading story never does), and which reads
   closed until then, walked open on every loaded Day story; and the focus
   ring's contrast, below.
7. **The walk proves its own rules can fail.** Each rule has gate probes
   (`frontend/ui/gate/`, Storybook's `Gate/`): stories that draw one defect on
   purpose and name, in their `gate` parameter, the rules they probe and exactly
   what the walk must find. A probe passes when the walk finds exactly that, so
   a rule that goes vacuous fails its probe. The probes are not screenshotted
   and not part of the app.
8. **Scope stays in this repository.** Whether these criteria also become the
   `/ui-craft` standard is the operator's to decide separately.

**The focus ring is the one open case.** The lock sets `--ring` to `--primary`
at 34%, which paints near 1.9:1 on the canvas and the surface, under the 3:1 a
focus indicator needs. Raising it changes a locked colour token, so the pair is
exempt with that reason, pending the operator.

**Limits, recorded rather than closed.**
- A badge is recognised by the library's badge (`.ui-badge`), the one way the
  library draws one; a count drawn some other way inside a control's name is
  not seen.
- A status written outside the transient bar and the Prompt's "Recorded" is
  seen only if its words are in `STATUS_TEXTS`; a new status component joins
  `STATUS_SELECTOR`.
- A dialog that no story opens, at rest or in its play, and whose opener does
  not declare it, is not seen: the walk presses declared triggers only.
- Run together is judged on the control's own text pieces when its contents
  name it; an authored `aria-label` is judged only for a letter run into a
  digit.

**Alternatives.** axe-core for names and contrast (rejected above). Activating
every control to discover undeclared dialog triggers: each press needs a fresh
render, which multiplies the gate's run time by the controls in a story; the
trigger contract, the record of what each play opened, and the run-wide dialog
tests cover it instead. Running every story at a second viewport (decision 4).

**Consequences.** The Storybook gate runs longer (9 min 25 s before, 8 to 12
min with the walk, on one loaded machine). A new component cannot merge without
a role, a name, a visible focus and a 44 px phone target, and a new sheet
cannot merge without the dialog hook and a declared trigger. The walk sees what
a story draws: a state no story draws is not walked. A live region that mounts
together with its words passes, although some screen readers announce only a
change inside a region already present; the Prompt's "Recorded" now uses a
region that is always there.
