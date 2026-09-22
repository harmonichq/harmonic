# Task 1.11 — the group 1 gate

Every leg below was run on the committed tree. Raw output is beside this file.

| Leg | Result | Log |
|---|---|---|
| `npm ci && npm run build` | both builds succeed | `gate-1-build.txt` |
| `pytest tests/test_frontend_asset_routes.py tests/test_api.py tests/test_deploy_assets.py` | 135 passed, 5 subtests passed | `gate-2-pytest.txt` |
| `node --test 'frontend/**/*.test.js' 'frontend-v2/**/*.test.js'` | 910 passed, 0 failed | `gate-3-node.txt` |
| `acceptance.test.py` | 40 of 41 passed; 1 cannot run in this sandbox | `gate-4-acceptance-test.txt` |
| `acceptance.py case-cache --check --out <fresh>` | exit 0, every registry case | `gate-5-case-cache.txt` |
| `mockups/harmonic-v2.exploration/generate.py --check` | current | `gate-6-exploration-check.txt` |

No browser leg was run.

## The one leg this machine cannot run

`ServerLifecycleTest.test_taken_port_is_rejected_without_touching_its_listener`
errors before it reaches any driver code, on its own
`socket.socket().bind(("127.0.0.1", 0))`:

```
PermissionError: [Errno 1] Operation not permitted
```

The worker's sandbox denies every loopback bind, proved by running that one
call on its own in the same sandbox and getting the same error. The test
exercises `free_port`, which this change does not touch. It is owed a run
wherever a bind is permitted.

## The rewritten route guard, recorded failing first

`tests/test_frontend_asset_routes.py` was rewritten before `ciq_autotune/api.py`
changed, and all four of its cases failed against the unchanged server —
`gate-0` is `task-1.4-route-test-fails-first.txt`:

```
FAILED ... test_built_shell_exists_and_names_no_cdn_host_at_all
FAILED ... test_every_page_built_asset_and_generated_interface_answers_over_http
FAILED ... test_missing_build_fails_closed_without_hiding_the_api
FAILED ... test_server_router_and_disk_mirror_name_the_same_pages
4 failed
```

The agreement case failed with `api.py must carry the explicit desk page tuple`;
the HTTP case failed on the shell's assets still sitting under `/v2/assets/`;
the fail-closed case failed with `200 != 503 : /`, because the root page was
still v1's.

## Three more negatives, observed rather than assumed

**The three-owner agreement check.** The mirror half of
`test_server_router_and_disk_mirror_name_the_same_pages` enumerates the mirror's
page set rather than filtering it, and was run against five deliberately
divergent mirrors — a double-quoted extra path, a differently-cased path, a
hyphenated path, an element the test cannot resolve, and a page the mirror drops
while the server keeps serving it. All five fail; the committed mirror passes.
Each run and its message is in `task-1.4-divergent-mirror.md`.

**The disk-serving mirror.** With `'/v2/'` added back to `V2_PAGE_PATHS` in
`frontend/built-shell.js`, `frontend/built-shell.test.js` fails its new
`every retired address stays closed` case (`AssertionError: /v2/`); with the set
as committed, all three cases pass. The edit was reverted.

**The public tree.** `scripts/build_public_tree.py`,
`scripts/check_public_links.py` and `scripts/scan_public_tree.py` were run over
the materialized tree: 478 files copied, every link resolves inside the tree,
and the contamination scan reports 0 findings with no new pin. Before the three
new desk files were tracked, `check_public_links.py` named each of them as an
import the public tree does not ship — so that check is live, not vacuous.
`check_adr_numbers.py`, `check_owned_identifiers.py` and
`check_public_allowlist.py` all pass.

## Beyond the gate, because task 1.5 moved a hashed input

`ciq_autotune/api.py` is part of the `code_version` digest, so
`gen_qa_e2e_db.py --check`, `check_demo_fixtures.py`,
`tests/test_follow_up_comparison.py` and `tests/test_follow_up_store.py` were
also run. All current, all passing. See
`task-1.2-exploration-regenerated.md` for the two regenerated captures.
