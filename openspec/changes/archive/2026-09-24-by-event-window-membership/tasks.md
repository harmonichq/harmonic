# Tasks — By-event window membership (#62)

Delivered in four serial pieces, each on its own branch merged back into the
ticket branch. Every box below was verified through the public interface, never
through a hand-set fixture flag.

## 1. One membership rule, owned by the server

- [x] `ciq_autotune/window_membership.py` is the single home of the rule:
      `WindowQuery` and one outcome-anchor operation, with segmentation, the
      containment predicate and the episode-anchor map private to it.
- [x] Every catalog occurrence is stamped with its outcome minute at
      catalog-build time; a capture missing it is rejected, so a stale fixture
      fails closed.
- [x] Every occurrence publishes the shared key beside its opaque id, on the
      members of every cohort rather than only the selected one.
- [x] Selection still travels as the server's unique occurrence id; the
      episode-and-time pair is published for joining only.
- [x] The block coordinate is replaced by the window, which is published in
      exactly the shape the queue publishes it. No caller of the block table
      remains.
- [x] A withheld cohort publishes its usable members' own five-minute traces; a
      limited or supported cohort publishes none.
- [x] Both schemas bumped.
- [x] The endpoint takes both bounds or neither, and rejects the retired
      coordinate.

## 2. The fixtures and the mirror, held to the server's answers

- [x] The replay mirror follows the server: it reads the stamped outcome minute
      and applies the same predicate, transcribing the filter rather than
      re-deriving the anchoring.
- [x] The event capture's meal occurrences are re-keyed onto the workstation
      fixture's episodes so a roster-row click can be proven end to end. Lows stay
      disjoint, stated in the generator's own header.
- [x] The support stamp is re-keyed from the block coordinate to the window, and
      stays fail-loud on an absent fact.
- [x] The capture generator gains a byte-comparing drift check; it had none.
- [x] A parity gate freezes the Python answers over both views and six
      coordinates — no bounds, mid-day, wrapping midnight, a starved cohort, a
      selection, and a window that separates an occurrence's trigger from its
      consequence — and the mirror is deep-compared against them.
- [x] Both new checks run in CI and are listed in the contributor brief.

## 3. The chart, drawn over the window it names

- [x] The request carries the window instead of the block, with the whole day
      sent as omitted bounds rather than a zero-span window.
- [x] Selecting an occurrence refetches, so it draws (#57).
- [x] Only the event canvas's own header is on screen while it is mounted (#58),
      and it is restored on every exit path, including an abandoned fetch.
- [x] A failed projection fetch restores the clock canvas and leaves the reader
      there.
- [x] A withheld cohort renders its episodes, faint and named as episodes, never
      as a median — on the visual legend and on the accessible readout alike.
- [x] The rendered window-membership caption is retired from both public callers;
      projection and population behavior remain covered by their public replays.
- [x] The lens's own retained read path moves off the block coordinate.

## 4. The roster on the server's clock, and the surface re-settled

- [x] The browser re-derives no window membership anywhere: the roster, the
      factor header and the clock canvas read the keys the findings row
      published.
- [x] A finding the lens can re-project frames on the family its event view
      names, so the panel lists the episodes the chart draws.
- [x] A published finding whose event-view family holds none of this window's
      evidence still opens, framed on that family, rather than swallowing the
      click.
- [x] A finding narrowed out of the window keeps the reader, with both panes
      saying so and no browser-side fallback filter.
- [x] While a new window's rows are in flight the panes count nothing rather than
      counting the window that just left.
- [x] The replay drivers, browser suites and support audit follow the new
      contract; the document inventory is closed against the retired coordinate,
      leaving the unrelated carb-ratio block untouched.
- [x] The revise lane ran against the running app; its behavior ledger and replay
      output are committed, and its renders are attached to the pull request
      rather than committed.

## Verification

- [x] The whole fast gate, all eight drift checks, and the five browser legs this
      change can break, run on the merged branch.
