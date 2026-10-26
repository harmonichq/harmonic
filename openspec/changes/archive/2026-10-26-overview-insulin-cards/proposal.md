# Put the insulin cards on the Overview (#634)

## Why

#632 serves the Overview's insulin figures per window, and #633 locked the two
cards that print them, Insulin summary and Bolus review, as library components
(locked 2026-10-26, the operator having handed the gate to the coordinating
session: "No input from me please, do everything unattended."). Connor's
request (#631) is the cards on the Overview, below the day's glucose and Meal
size, over the window the Overview shows. This change puts them there and reads
them live.

## What changes

- **The Overview screen draws the two cards** below Meal size, over the selected
  window, following its 14 / 30 / 90 d switch. On desktop the two share one row
  sized to its own content, while the basal estimate's and Meal size's rows keep
  their one height; on the phone they stack after Meal size, Insulin summary
  first (the coordinating session's decision, 2026-10-26, under Connor's
  delegation). A window not yet read shows their skeletons; a store with no
  delivery shows their "No data".
- **The live adapter reads `/api/explore/insulin`** per window through the app's
  one client, under the Overview's window read beside Meal size, and names it
  in the keys the app reads again after a write.
- **The lock document follows:** §1.1 and §1.3's Overview rows name the cards
  and their states; §1.5 gains the rows #633 admitted ahead of them (Bolus,
  Override, Food, Manual, Standard, Extended, Quick); a dated §2.5 amendment
  records the row decision; §4.2 entries 29 and 30 name the placement as built.
  The generator's admission list drops those seven words, now §1.5's.
- **The roster's description follows the app:** the warm roster has warmed the
  insulin read since #632 (ADR 632 recorded that it led the app by one slice);
  its docstring and AGENTS.md's roster paragraphs now name it.
- **Tests:** the Overview's stories show the cards on both layouts; the live
  contract test asserts the insulin cards' screen model on the showcase at 14
  and 90 days as literals.

## Not in this change

- Any change to the cards (#633, locked) or to the insulin read (#632).
- Site changes (dropped from #631 by Connor, 2026-10-24).

## Risk contract

- **Must prevent:** a printed number that does not trace to a served field; a
  card drawn for one window with another window's answer; a stale answer drawn as
  current after a write (the read is in the keys the app reads again); a locked
  row above the cards changing height or order (the basal estimate and Meal size
  keep their one height and place); the Glossary page listing a term no screen
  prints, or a printed term missing from §1.5; a committed fixture or value from
  real data; a normal serve or a fetch in automated work.
- **Must recover:** a failed insulin read leaves the cards' skeleton and the
  Overview's existing Unavailable and Retry behaviour, as Meal size's does; no
  new recovery path.
- **Accepted failure:** on the showcase, whose boluses carry no delivery method,
  the method rows read 0.0 U and the method shares fall short of 100%, as the
  engine serves (ADR 632).
- **Unsupported:** a per-card window switch; anything to act on.
- **Evidence owed:** before and after renders of the Overview on both layouts
  (ui-craft revise), the Overview stories with the cards and their plays, the
  live contract test's literal assertions on the showcase at 14 and 90 days, the
  browser smoke opening the Overview with no skeleton and no Unavailable, and
  the full pull-request gate once on the pushed commit.
