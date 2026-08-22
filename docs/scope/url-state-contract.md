# Scope — URL-state contract

Ticket: [harmonichq/harmonic#53](https://github.com/harmonichq/harmonic/issues/53)

Base: `02d400e` (`origin/main`)

Classification: code. UI Craft lifecycle: revise. Review depth: Full.

## Decisions

- Harmonic adopts conventional path routing under the app namespace with page-local query parameters: for example, `/app/diagnose?view=lows&factor=…`. Paths identify pages; query parameters identify bookmarkable state within the page. `/app/` preserves the existing root-level data interfaces, including the JSON `/plan` endpoint, instead of turning URL cleanup into an API migration. This retires both the hash router and the split `/?state…#page` grammar. Why: it uses the browser platform's standard URL components, gives the app one routing model, and keeps existing data callers compatible. → ADR 53 (discharged in `openspec/changes/url-state-contract/design.md`)
- Existing hash-based URLs are unsupported. Opening one ignores its former page and state, falls back to Diagnose, and replaces the address with the ordinary canonical `/app/diagnose` route. Harmonic does not migrate or preserve any former hash state. Why: the operator chose a clean break instead of carrying compatibility machinery for old bookmarks. → ADR 53 (discharged)
- A copied URL reproduces the meaningful evidence context: page, selected day or trial, finding, factor, window, projection, and occurrence. Incidental interface state such as open dialogs, theme, test-only modes, loading state, hover, and focus is not URL state. Why: a link must reproduce the evidence being judged without making transient presentation details permanent compatibility obligations. → ADR 53 (discharged)
- A canonical path URL with invalid, incomplete, or internally inconsistent evidence state stops with a clear invalid-link error. Harmonic does not guess, partially apply, normalize, or automatically recover that state; the wearer navigates away or edits the URL. Why: URLs are external input, and visible manual recovery is cheaper and safer than silently showing evidence different from what the address names. → ADR 53 (discharged)
- Every completed meaningful navigation within a page creates a browser-history entry. Back and Forward step through finding, factor, window, projection, occurrence, selected day, and selected trial states as well as page changes; continuous pointer movement is not itself navigation. Why: history and copied URLs must describe the same evidence states without flooding history during one gesture. → ADR 53 (discharged)
- Implementation-level routing choices follow established browser practice without further operator escalation: one Vue-free URL-state module owns parsing, validation, serialization, and atomic history transitions for complete route states; pages do not edit URL parameters independently. Why: this is the standard implementation of the settled behavior and restores one interface where the current shell and event lens duplicate URL ownership. → ADR 53 (discharged)
- UI Craft routes the work to revise. The only allowed live entrypoint is `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`; the database's read-only provenance row names fixed-seed generator `scripts/gen_revise_e2e_db.py` and excludes real pump, patient, credential, and vendor data. Why: the route changes shipped Cockpit and Diagnose/Verify behavior. → work order
- Slice into three serial capabilities. The multiple-deliverable-artifacts and live-run-inside-the-ticket traits fire, matching anchor B: first establish the route and SPA-entry interface, then address page evidence state and behavior contracts, then run and correct the built app through the declared browser evidence. Why: one flat session would combine an app-wide router, six page consumers, two frozen ledgers, and a served-browser correction loop. → work order
- Review at Full depth. Why: this replaces navigation shared by every rendered surface and controls which advisory evidence a copied/restored URL claims to show. → work order

### Risk contract

- **Must prevent:** a shared or restored URL silently showing different evidence from the state it names; accidental exposure of secrets or patient data; irreversible loss of authoritative data; silent incorrect success.
- **Must recover:** browser back/forward restores the same supported page and evidence selection without accepting an out-of-order response.
- **Accepted failure:** an invalid canonical path URL stops with a clear invalid-link error and requires manual navigation or URL correction; no automatic recovery is promised.
- **Unsupported:** preserving every retired legacy URL spelling indefinitely; bookmarkability for synthetic screenshot-only controls.
- **Evidence owed:** cold-open and back/forward behavior through the shipped browser interface; stale-response rejection for event-comparison projections; canonicalization of any retired URL form; the frozen behavior ledger and replay remain aligned.

Why: URL state controls which advisory evidence the wearer believes they are viewing, so silent mismatch is the material hazard; malformed links are recoverable and need not earn speculative compatibility.

Disposition: → admitted proposal and copied unchanged into every dispatched
sub-order

## Open questions

- None.

## Spawned tasks

- None.

## Grounding

- ADR 31 requires one URL-state contract and says the hash/query split retires.
- Cockpit behavior S2 currently binds every public page affordance to the hash; R1 binds a retired stale hash to Diagnose.
- Finding-evidence P53 keeps `view`, `factor`, `start_min`/`end_min`, `another`, and `occ` in `location.search`, re-requests on `popstate`, and drops stale responses by generation.
- `frontend/index.html` separately owns `parseHash`, `syncHashFromState`, and `hashchange`, including Day date and Guide article.
- `ciq_autotune/api.py` serves the SPA only at `/`; `/plan` is already a JSON interface, which is why canonical pages use `/app/`.
- The fast gate and nine browser-gate legs are declared in `AGENTS.md` and `.github/workflows/ci.yml`; browser adapters currently open hash URLs and must move with the public contract.

## Review rounds

- **Preflight facts:** `git rev-parse HEAD` returned full base
  `02d400ed6b62c79a8eb8d8283c0c7c83c95421de`; the `TABS` enumeration printed
  Day, Diagnose, Verify, Plan, Settings, and Guide; the API route inventory
  printed root HTML at `/` and an existing JSON `GET /plan`; the behavior
  inventory printed Cockpit S2/R1 and finding-evidence P53 at their current
  ledger paths.
- **First-hour live probe:** after syncing the lockfile's declared extras, the
  no-fetch manufactured-data server ran once with an explicit unused port
  because the default port was occupied. That one-off probe is evidence only;
  the execution order admits the repository's exact default-port command and
  runs base/revision sequentially.
  `GET /` returned HTML 200, `GET /app/diagnose` returned JSON 404, and
  `GET /plan` returned JSON 200. In bundled Chromium,
  `/?view=lows#diagnose` retained all three independent URL components;
  clicking Plan changed only the hash and retained the Diagnose query;
  `history.back()` restored Diagnose. No console errors appeared.
- **Adversarial review round 1 (authoring defects):** three cold reviewers
  refused the first draft. Reproduced blockers were uncommitted authority, an
  absent route grammar and async identity boundary, split/overlapping contract
  ownership, a nonexistent predecessor, an impossible two-port proof, an
  unbounded evidence obligation that omitted the mobile drawer, an unstated
  supersession of ALIGN's no-URL ruling, a missing frozen Verify ledger, worker/
  coordinator conflict over the OpenSpec record, and fixed Opus builders that
  bypassed cheapest-clear routing. The order and ADR were rewritten cleanly;
  none was waived or forwarded to the operator.
