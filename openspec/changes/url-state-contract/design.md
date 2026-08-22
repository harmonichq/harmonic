# Design — One URL-state contract (#53)

## ADR 53 — Paths identify pages; queries identify evidence context

**Ruling.** Harmonic uses canonical `/app/<page>` paths for its six shipped
pages and the query component for meaningful, bookmarkable state owned by that
page. One Vue-free module owns the route grammar, syntactic validation,
canonical serialization, and atomic browser-history transitions. Page adapters
resolve server-owned identities through that interface; no page parses or edits
`location`, `history`, or `URLSearchParams` independently.

The `/app/` namespace is deliberate. Harmonic already exposes root-level JSON
interfaces, including `/plan`; reserving `/app/` gives pages conventional path
routing without breaking those callers or forcing an unrelated API migration.

**Context.** ADR 31 requires one URL-state contract and says the current
hash/query split retires. The frozen behavior ledger's P53 correctly keeps the
event-comparison coordinates, `popstate` re-request, and generation-based stale
response rejection, but its evidence URL still demonstrates that split. The
shell separately parses and writes hash state for page, Day, and Guide.

Connor selected conventional path routing after asking for the industry
standard, then delegated implementation choices with “whatever is standard.”
The standard implementation here is a single atomic route interface rather
than independent parameter writers.

### Closed route grammar

All keys are single-valued. A duplicate key, unknown key, empty value, malformed
percent escape, non-canonical explicit default, forbidden combination, or
nonempty fragment makes a canonical `/app/` URL invalid. Serialization uses
`URLSearchParams` encoding and the key order shown below; no trailing `?` or `#`
is emitted. For supplied keys, the raw search must equal the serializer's
output; only the explicitly documented default omissions are accepted as
non-final forms.

| Page | Query keys in canonical order | Grammar and combinations | Omission/default |
|---|---|---|---|
| `/app/day` | `date` | `date` is a real Gregorian date in `YYYY-MM-DD` form. After `/status` succeeds, an explicit date must be within its earliest/latest data bounds. | Omission asks for the latest data day. After a successful nonempty `/status`, replace the current entry with `?date=<resolved-day>` before showing Day. With no data, the key remains absent. |
| `/app/diagnose` — workstation | `finding`, `factor`, `start_min`, `end_min`, `projection`, `occ` | `finding` matches `[A-Za-z0-9._:-]{1,160}` and is exactly a successful findings projection's `rows[].id`. `factor` is the token `<family>.<lever>`, where each half matches `[a-z][a-z0-9_]*`, `family` comes from that row's `evidence[].family`, and `lever` equals that row's `lever`; `finding` and `factor` are paired. Bounds are paired canonical decimal integers (`0` or a nonzero value with no leading zero) in `0..1440` and must differ modulo 1440, so `0/1440` and `1440/0` are invalid. `projection`, when present, is `event`, requires the finding/factor pair, and absence means `clock`. `occ` requires the pair, matches `[A-Za-z0-9_-]{1,512}`, and is unpadded base64url of the UTF-8, whitespace-free JSON array `[family,ep_id,t]` from the joined `rows[].evidence` / `exposures[family].occurrences` triple. `view` and `another` are forbidden. Every supplied identity resolves from one successful projection before display. | All keys may be absent for the Diagnose queue. The default `projection=clock` is omitted. |
| `/app/diagnose` — direct event comparison (P53) | `view`, `factor`, `start_min`, `end_min`, `another`, `occ` | `view` is required and is `meals` or `lows`; workstation-only `finding` and `projection` are forbidden. Bounds use the same paired, canonical-decimal, modulo-distinct grammar. `factor` matches `[a-z][a-z0-9_]*` and is a successful response's `coordinates.factor_options[].key`; `occ` matches `[A-Za-z0-9._:-]{1,160}` and is its `occurrences[].identity.id`. `another`, when present, is exactly `1`; absence means false. Supplied identities must be members of the same successful response. | The Glucose workstation omits `view`, never `view=glucose`. An omitted factor asks the endpoint for its default and is replaced with `coordinates.factor` before display. False `another` is omitted. |
| `/app/verify` | `trial` | `trial` matches `[A-Za-z0-9._:-]{1,160}` and, after a successful roster load, must identify one roster Trial. | Omission asks for `initialTrial`. A nonempty successful roster replaces the current entry with its resolved `trial`; an empty roster leaves the key absent. |
| `/app/plan` | none | Any query key is invalid. | No state. |
| `/app/settings` | none | Any query key is invalid. | No state. |
| `/app/guide` | `article` | `article` matches `[a-z0-9]+(?:-[a-z0-9]+)*` and must identify one `KB_ARTICLES` entry. | Omission resolves to `start-here` and replaces the current entry with `?article=start-here` before showing Guide. |

Opaque identifiers are compared after URL decoding and are serialized back by
the shared module; callers never concatenate them into a URL. Query ordering is
therefore byte-stable. A successfully resolved route serializes to the same
bytes whether reached by a copied URL, a page control, Back, or Forward.

### Two-phase resolution and atomic failure

Parsing returns exactly one of `LegacyRedirect`, `InvalidRoute`, or a frozen
`PendingRoute`. A pending route has passed the static table above but is not
visible state. The shell loads only the authoritative catalog needed by its
target page, and the page adapter returns either a complete `ResolvedRoute` or
an invalid-membership result. Defaults are inserted only during that resolution.

The route module then performs one operation: it canonicalizes a resolved
default with `replaceState` and emits one complete route to the app, or it emits
an invalid route and no page selection. It never emits a partially resolved
route. A transport/authentication failure remains the page's existing data
error; a successful response that does not contain a named identifier is an
invalid link.

The visible invalid-link stop is the cockpit shell with its content replaced by
one `<main role="alert" data-route-error="invalid-link">`. It names the rejected
address, says that no selection was applied, and offers a link to
`/app/diagnose`. It performs no automatic navigation or recovery.

### History and legacy entry

Every completed meaningful navigation pushes one entry. Back and Forward pass
through the same parse/resolve/emit transaction. A drag or resize contributes no
entry until the gesture commits. Restoring a route preserves P53's generation
guard so an older projection response cannot overwrite the restored state.

`/`, with or without its old query/fragment state, is the legacy entry form. It
discards query and fragment, replaces the current entry with exact
`/app/diagnose`, and shows the default Diagnose queue. A fragment on an
`/app/` URL is invalid under the table above. Other unknown paths retain their
existing server 404 behavior; unknown `/app/` pages are served the SPA so the
invalid-link stop is visible.

### Superseded behavior-ledger rulings

This ADR supersedes Cockpit S2's hash grammar and R1's stale-hash destination.
It also supersedes the finding-evidence ALIGN story's ruling that alignment
“never writes the URL”: a committed By clock/By event choice is meaningful
projection state. P53 otherwise remains kept: its coordinates stay in the
query, history restoration re-requests the projection, and stale responses are
dropped. The issue-53 amendment must update all three rulings, add the missing
Verify stories to the umbrella shipped ledger, and preserve unrelated stories.

### Finite evidence matrix

The live proof covers these eight rows—no implicit “every affected state” set.
`D1` is 1440×900, `D2` is 1280×800, and `M1` is 390×844. Each listed viewport is
captured in Light and Dark, first on base and then on revision, sequentially on
the same authorized server port. Base uses the shipped hash/query address when
one exists; state that was not addressable is reached through shipped controls
and captured with the unchanged old address, which is the baseline defect. The
invalid-link base is the currently observed `/app/` 404.

| Row | State | Viewports | Behavioral proof |
|---|---|---|---|
| E1 | Default Diagnose; navigate to Plan and Back | D1, M1 | Cockpit S2 plus mobile drawer assertions |
| E2 | Day with one explicit manufactured-data date | D1, D2 | cold load, canonical bytes, Back/Forward |
| E3 | Guide article `start-here` | D1, D2 | cold load, article restoration, Back/Forward |
| E4 | Diagnose finding + factor + window, By clock | D1, D2 | workstation route story |
| E5 | Same Diagnose evidence, By event + occurrence | D1, D2 | alignment/occurrence route story and stale-response guard |
| E6 | P53 direct `view=lows` comparison with factor + window | D1, D2 | P53 replay and query discard on page exit |
| E7 | Verify with one selected manufactured-data Trial | D1, D2 | Verify route story and Back/Forward |
| E8 | Exact `/app/diagnose?start_min=60&start_min=60&end_min=120` duplicated-key URL | D1, D2 | the identical URL is base 404 and revision atomic invalid-link stop; no page selection |

Runtime-owned identifiers and the Day date come from committed manufactured
sources and are recorded with the evidence; they are not hand-invented. E2 and
E4–E6 use `mockups/revise-e2e.synthetic/harmonic.sqlite`. E7 uses
`mockups/verify-660-story.synthetic/payload.json` through the shipped app-only
browser adapter because the revise database deliberately contains no Trial-
producing settings history. The matrix yields 64 base/revision/theme/viewport
captures.
Replays—not additional screenshots—prove repeated Back/Forward steps and
held-response ordering.

**Consequences.**

- The server returns the SPA for `/app/` paths. HTML changes its document-
  relative `./…` stylesheet, module, and favicon references to
  root-absolute `/…` references (or establishes one equivalent document base)
  so a direct nested load requests the existing root asset endpoints.
- Synthetic screenshot modes move out of product query parsing and into browser
  adapter setup.
- Removing the URL-state module would redistribute grammar, validation,
  serialization, resolution coordination, and history rules across multiple
  callers; it therefore passes the deletion test and is a real module.

**Rejected.**

- Keep `/?state…#page`: preserves the contradiction and two browser event
  models.
- Put state after a hash route: internally consistent but retains the legacy
  routing fallback Connor rejected.
- Move every JSON interface under `/api/`: conventional in a greenfield app,
  but unnecessary API churn and compatibility risk for this repair.
- Migrate former hash bookmarks: rejected in favor of a clean default-Diagnose
  fallback with no legacy-state parser.
- Let each page edit its own parameters: recreates partial and contradictory
  states inside a superficially modern URL.

Decision: harmonichq/harmonic#53, 2026-08-21.

## Revision provenance

- **Base:** `02d400e`, fetched `origin/main` when the ticket worktree was cut.
- **UI Craft route:** revise. The cockpit and Diagnose/Verify workstations are
  shipped, runnable surfaces with frozen behavior ledgers and app-only replays.
- **Safe-start authority:** `AGENTS.md`, “The data boundary”.
- **Only allowed served command:**

  ```sh
  uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite
  ```

- **Data provenance:** the database was opened read-only during triage and its
  `synthetic_fixture_provenance` row names committed
  `scripts/gen_revise_e2e_db.py`, fixed seed 620, and states that it contains no
  real pump, patient, credential, or vendor data.
- **Verify provenance:** E7's committed payload is manufactured by
  `.claude/qa/gen_verify_payload.py --synthetic` through `review_trials`; its
  drift is covered by `scripts/check_demo_fixtures.py`.

Base and revision evidence run sequentially through the exact command above on
its default port; no concurrent two-port variant is authorized. No normal
`serve`, live fetch, credential read, or real pump database is authorized.
