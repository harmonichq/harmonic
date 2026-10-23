## ADR 614 — The open card takes the row's Snooze swipe, not a copy of it

The row's swipe (ADR 613) is `useSwipe` plus a wrapper that binds it and draws
the Snooze reveal, inline in `QueueRow.tsx` with its CSS in `QueueRow.css`
(`ui-qrow-swipe*`). The open card is that wrapper's second caller, so the
wrapper becomes one exported component in the same module, `SnoozeSwipe`
(`QueueRow.tsx`), which the row and the Queue screen's phone open card both
render. Its props are the hook's (`held`, `onCommit`), an optional `onLeaving`
that tells the open card to stay drawn until its commit has run, and its
children; it always `leaves`, and its reveal is always Snooze at 88 px. For both callers it
renders the moving element itself, a `div.ui-swipe-settle` carrying the hook's
`style` around its children, as the wrapper's last child: that class carries
`touch-action: pan-y` and the settle and leave transitions (`shared.css`), and
the hook's transition end reads the last child. The row's button moves inside
that div rather than carrying the class itself, and `QueueRow.css`'s open
offset follows it. The reveal spans the moving element's full height, its icon and label
centred in its right-hand 88 px column, so a card's reveal is a row's, taller.
The Prompt's Not sure reveal is a different action at 96 px and keeps its own
markup.

## ADR 614 — The screen gates Snooze by layout; the cards stay layout-free

`PatternCard` and `SettingCard` draw the Snooze text action whenever they are
given `onSnooze`, and know nothing of the layout. The Queue screen passes
`onSnooze` to the open card on desktop only, and on the phone wraps the open
card in `SnoozeSwipe` with the same snooze as its commit. One place decides
which Snooze a layout gets, and the card components' stories show each
composition: their phone stories pass no `onSnooze` and their desktop stories
pass one.

## ADR 614 — The chevron is a disclosure control named by the card's title

The prechecks allow only glossary words in an accessible name, and the
glossary has no word for closing a card. The chevron is therefore a plain
`<button type="button" data-role="icon">` (44 px, §4.1), not the library
`Button`, whose `icon` kind is named only by an `aria-label`. It is named by
the card's title (`aria-labelledby` the title's id; `SettingCard`'s title gains
one, from `useId`, as `PatternCard`'s has), with
`aria-expanded="true"`: the open half of the disclosure whose closed half is
the row, a button named by its title with `aria-expanded="false"`. A
multi-cause card's chart is also a button named by the title; a test that
reaches either one scopes it by its element, not by the name alone.

`PatternCard`'s `collapsible` boolean becomes `onCollapse`. The chevron is
drawn exactly when `onCollapse` is given, so desktop and a cause card, which
pass none, have none, as today. `SettingCard` takes the same `onCollapse`, its
chevron at the end of its title line.

## ADR 614 — Closed is the phone screen's state, and only the chevron sets it

The Queue screen holds `closed`, false at mount. On the phone the open item is
none while it is closed, and otherwise what it is today. The chevron sets it;
tapping a row clears it and opens that row's item. Nothing else sets or clears
it: a row's snooze, its Undo and a failed write leave it as it was. The card
closes through the screen's existing presence, shrinking back into its row.
Desktop ignores it: its detail pane always shows the selected item. App mounts
each tab's screen under its own key, so a tab change mounts a new Queue with
nothing closed. A story may start closed (`closed`).
