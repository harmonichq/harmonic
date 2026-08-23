# Tasks — One hash-route contract (#53)

## 1. Replace the rejected path-routing direction

- [x] Reduce issue 53's frontend routing implementation to one Vue-free hash
      routing interface for `#/<page>?<existing-page-state>`.
- [x] Keep the six existing page IDs and current page defaults. Preserve the
      existing server and API route behavior; remove issue-53 dependencies on
      `/app/...` entry paths, runtime identity resolution, and invalid-link UI.
- [x] Normalize the existing no-slash hash and old split form only where needed
      to reach the canonical hash route.

## 2. Put existing URL state behind the route

- [x] Route the existing page plus the currently round-tripped Day `date` and
      Guide `article` state through the interface without adding bookmarkable
      state.
- [x] Move P53's existing `view`, `factor`, `start_min`, `end_min`, `another`,
      and `occ` keys from `location.search` into the Diagnose fragment query.
- [x] Preserve current request behavior, back/forward re-request behavior, and
      the P53 generation guard against stale responses.
- [x] Leave `modal`, `occt`, `occd`, and `occdet` restoration unchanged; do not
      add round-trip acceptance for those emitted-but-unparsed keys.
- [x] Amend only the URL-location wording in P53 and any directly contradictory
      routing check or comment.

## 3. Verify proportionally

- [x] Add focused Vue-free tests for parsing, serialization, limited
      normalization, route transitions, and Back/Forward restoration of the
      page, Day `date`, Guide `article`, and P53 keys through the routing
      interface.
- [ ] Run the focused route tests and the existing relevant Cockpit and
      Diagnose event-comparison browser routing checks. No screenshot matrix,
      server launch, new fixture, credential/data-boundary harness, or mandatory
      all-nine-browser run is owed by this change.
- [x] Run `git diff --check` and `python3 scripts/check_adr_numbers.py` after
      the focused route and relevant browser checks.
- [ ] Request Targeted review. Surface lifecycle: none.
