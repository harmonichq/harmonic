# Task 1.2 — the exploration's three lifts, re-pointed and regenerated

`mockups/harmonic-v2.exploration/generate.py` lifted the same three facts v1's
page held that the desk's build lifted: the glossary literal, the Day legend
rules, and the app material that joins `frontend/shell.css` and
`frontend/theme.css` in the combined `mockups/_theme-app.css`. All three now read
the desk's committed source, `frontend-v2/glossary.js` and
`frontend-v2/material.css`.

`uv run python mockups/harmonic-v2.exploration/generate.py --check` passes on the
regenerated outputs.

Four of the nine generated outputs moved. Here is every line that differs.

## `mockups/harmonic-v2.exploration/chart-key.css`

One line — the embedded source path in the GENERATED header:

```
-/* GENERATED ... from the shipped Day legend in frontend/index.html. */
+/* GENERATED ... from the shipped Day legend in frontend-v2/material.css. */
```

The three `.ds-chart-legend` rules beneath it are byte-identical.

## `mockups/harmonic-v2.exploration/glossary.js`

One line — the embedded source path and line number:

```
-// GENERATED ... from frontend/index.html:3757.
+// GENERATED ... from frontend-v2/glossary.js:9.
```

The `glossaryGroups` literal beneath it is byte-identical. Line 9 is where
`export const glossaryGroups = [` stands in the rehomed module, computed the same
way the old line number was.

## `mockups/harmonic-v2.exploration/utilities.json`

Three lines, all inside the capture's own record of where it read:

```
-  "_note": "... preserved verbatim from v1; ..."
+  "_note": "... preserved verbatim from the desk's committed source; ..."
-    "source_path": "frontend/index.html",
-    "start_line": 3757
+    "source_path": "frontend-v2/glossary.js",
+    "start_line": 9
```

The Guide catalog and the four captured articles are byte-identical.

## `mockups/_theme-app.css`

Two hunks.

1. The embedded source list in the GENERATED header:

```
-/* GENERATED ... Sources: frontend/index.html, frontend/shell.css, frontend/theme.css. */
+/* GENERATED ... Sources: frontend-v2/material.css, frontend/shell.css, frontend/theme.css. */
```

2. Ten added lines: the provenance comment that now heads
   `frontend-v2/material.css`. It rides into this file because the material is
   concatenated verbatim, the same way the `★ HARMONIC` comment beneath it
   always has.

No selector, declaration or value differs, and the file's rule order is
unchanged. `frontend/shell.css` and `frontend/theme.css` are still read from
their own files and are untouched by this change.

The other five outputs (`setting.json`, `focus.json`, `journey.json`,
`evidence.json`, `workstation.json`) are byte-identical at this point; they read
the store and the shipped producers, not v1's page.

## A second, later regeneration: `code_version`

Task 1.5 edits `ciq_autotune/api.py`. `follow_up_comparison._execution` stamps a
`code_version` into every captured comparison context, and that stamp is a
SHA-256 over **every** `.py` file under `ciq_autotune/` — so editing any module
in the package moves it. Two of this exploration's outputs carry a captured
comparison context, and both were regenerated again after the route change:

- `focus.json`: 4 changed lines — `code_version` and the context `id` derived
  from it, each appearing twice in the document.
- `journey.json`: the same 4 lines.

Nothing else in either file differs, and no other committed artifact in the
repository carries a `code_version` (executed `git grep -l code_version`: the
two producers, these two captures, and two tests that compute the value rather
than pin it). `scripts/gen_qa_e2e_db.py --check` and
`scripts/check_demo_fixtures.py` are current, and
`tests/test_follow_up_comparison.py` with `tests/test_follow_up_store.py` pass
(73 tests, 86 subtests).
