# One URL-state contract (#53)

## Why

ADR 31 says the app-wide hash/query split retires, while the frozen finding-to-
evidence behavior ledger's P53 keeps event-comparison coordinates in the URL
query. The shipped app currently does both: its cockpit page route and some
page-local state live after `#`, while the event-comparison lens reads and
writes `location.search` independently.

That split gives two modules authority over one browser address. A copied link
can therefore name one page and a different evidence context, and browser
history is divided between `hashchange` and `popstate`.

## What changes

- The shipped app uses canonical `/app/<page>` routes for Day, Diagnose,
  Verify, Plan, Settings, and Guide. Query parameters carry meaningful state
  within the selected page.
- One Vue-free URL-state module owns parsing, validation, serialization, and
  atomic browser-history transitions. The cockpit shell, event-comparison
  lens, Diagnose workstation, Verify workstation, Day, and Guide use that
  interface instead of editing URL components independently.
- A copied URL restores the selected day or trial and the current finding,
  factor, window, projection, and occurrence. Completed meaningful changes
  create history entries; intermediate pointer movement does not.
- Root and former hash URLs do not migrate their page or state. They open the
  default Diagnose page at `/app/diagnose`. An invalid canonical path URL
  stops with a clear invalid-link error instead of guessing or partially
  applying state.
- The server serves the SPA for `/app/` page paths without moving or shadowing
  existing root-level JSON endpoints, including `/plan`. Browser adapters are
  updated so direct cold loads exercise the same public paths.
- Cockpit behavior S2 and retired-route behavior R1 are amended to the path
  contract. Finding-evidence P53 keeps query coordinates, `popstate`
  re-requests, and stale-response rejection under the canonical Diagnose path;
  the ALIGN story's no-URL ruling is superseded. The umbrella ledger gains the
  eight shipped Verify stories currently enforced only by legacy lock tags.

## Risk contract

- **Must prevent:** a shared or restored URL silently showing different evidence from the state it names; accidental exposure of secrets or patient data; irreversible loss of authoritative data; silent incorrect success.
- **Must recover:** browser back/forward restores the same supported page and evidence selection without accepting an out-of-order response.
- **Accepted failure:** an invalid canonical path URL stops with a clear invalid-link error and requires manual navigation or URL correction; no automatic recovery is promised.
- **Unsupported:** preserving every retired legacy URL spelling indefinitely; bookmarkability for synthetic screenshot-only controls.
- **Evidence owed:** cold-open and back/forward behavior through the shipped browser interface; stale-response rejection for event-comparison projections; canonicalization of any retired URL form; the frozen behavior ledger and replay remain aligned.

Why: URL state controls which advisory evidence the wearer believes they are
viewing, so silent mismatch is the material hazard; malformed links are
recoverable and need not earn speculative compatibility.

Disposition: this proposal is the admitted authority; every dispatched
sub-order copies this block unchanged.

## Impact

The change touches the SPA route interface, the server's HTML entry routes,
the existing shipped-surface behavior ledgers and browser replays, and the
Surfaces capability specification. It does not change analysis, membership,
advisory conclusions, Plan data, stored data, authentication, or any existing
JSON endpoint.
