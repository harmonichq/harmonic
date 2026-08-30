# Generated facts — Diagnose Dark retheme (#255)

Every block below is verbatim command output from the issue worktree. Re-run a
fact after changing any file it describes.

## F1 — exact ticket base includes the archived #253/#256 change

Command:

```sh
git rev-parse HEAD && git log -2 --format='%H %s'
```

Output:

```text
3864f8c6c9af2970df8a80b787b63f23d7429001
3864f8c6c9af2970df8a80b787b63f23d7429001 Archive glucose chart legibility change
8908a3773427ef443bb947f811302c01e0538fe6 Repair glucose chart gate boundaries and legibility (#256)
```

## F2 — the only safe live app source is the generated synthetic database

Command:

```sh
rg -n 'Never run normal|uv run harmonic serve --no-fetch|mockups/revise-e2e.synthetic/harmonic.sqlite' AGENTS.md
```

Output:

```text
180:- **Never run normal `harmonic serve` or any `harmonic fetch` in automated
188:  uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite
```

## F3 — current source carries the rescinded values and treatments

Command:

```sh
rg -n -- '--wk-canvas:#0f0d0b|--wk-surface:#26221f|--wk-surface-rail:#2d2926|--wk-surface-sunken:#504a45|markArea: \{ silent: true|opacity: runById' frontend/index.html frontend/diagnose-evidence-charts.js frontend/chart-builders.js
```

Output:

```text
frontend/diagnose-evidence-charts.js:283:        markArea: { silent: true, itemStyle: { color: colors.target },
frontend/diagnose-evidence-charts.js:292:          opacity: runById.get(series.run_id)?.in_pool ? .48 : .28,
frontend/chart-builders.js:457:        markArea: { silent: true, itemStyle: { color: colors.inRange, opacity: 0.05 },
frontend/index.html:115:      --wk-canvas:#0f0d0b; --wk-surface:#26221f; --wk-surface-rail:#2d2926; --wk-surface-sunken:#504a45;
```

## F4 — the evidence-canvas template freezes theme bytes by hand

Command:

```sh
sed -n '7,27p' mockups/diagnose-evidence-canvas.exploration/canvas.tpl.html
```

Output:

```text
<style>
/* ── app tokens, verbatim from frontend/index.html html.dark + theme.css ───── */
:root{
  --wk-canvas:#0f0d0b; --wk-surface:#26221f; --wk-surface-rail:#2d2926; --wk-surface-sunken:#504a45;
  --wk-ink:#f5ece0; --wk-ink-body:#dbcfbc; --wk-ink-meta:#a3968a;
  --wk-rule:#4d4742; --wk-rule-strong:#776e68;
  --primary:#e07f3f; --primary-600:#ef9459; --primary-100:#40291b;
  --secondary:#a89a85; --warn:#c98a4e; --danger:#ec6f55; --low:#ec6f55; --high:#e07f3f;
  --in-range:#86ad78; --on-target:#86ad78; --on-target-soft:#2f3a2c;
  --wk-status-incomplete:#d7a75c; --wk-status-adverse:#d97f71; --wk-status-favorable:#7cae8d;
  --mk-primary:#86ad78; --mk-primary-600:#c3b49c; --mk-primary-soft:#2f3a2c;
  --mk-accent:#e07f3f; --mk-ok:#a89a85; --mk-line:#322e29;
  /* chrome bar, theme.css html.dark .cockpit-topbar */
  --ck-ground:#171412; --ck-panel:#292522; --ck-text:#efe5d4; --ck-body:#d3c7b4; --ck-meta:#a19484;
  --ck-rule:#48433e; --ck-bar-signal:#dc7b42; --ck-bar-on-signal:#171412;
  /* docked workspace grounds, theme.css html.dark :is(.dw,.vw) */
  --field:#161311; --pane-head:#1b1816; --rail:#1e1b19; --hair:#302c29; --seam:#524c47;
  --seg-line:#3b3632; --seg-bg:#171412; --seg-on:#332e2b;
```

## F5 — its generator currently compares only template output

Command:

```sh
rg -n 'template =|return template.replace|--check' mockups/diagnose-evidence-canvas.exploration/generate.py
```

Output:

```text
152:    template = (HERE / "canvas.tpl.html").read_text()
154:    return template.replace("/*__DATA__*/", "const D = " + blob + ";")
9:``index.html`` is generated; never hand-edit it. ``--check`` regenerates in memory
14:    uv run python mockups/diagnose-evidence-canvas.exploration/generate.py --check
159:    parser.add_argument("--check", action="store_true",
```

## F6 — both exploration checks are explicit CI gates

Command:

```sh
rg -n "Check the exploration's generated artifacts|diagnose-evidence-canvas.exploration/generate.py --check|finding-evidence-routing.exploration/build.mjs --check" .github/workflows/ci.yml
```

Output:

```text
37:        run: uv run python mockups/diagnose-evidence-canvas.exploration/generate.py --check
146:      - name: Check the exploration's generated artifacts are current
147:        run: node mockups/finding-evidence-routing.exploration/build.mjs --check
```

## F7 — current fast checks for the affected contracts are green

Commands:

```sh
node mockups/finding-evidence-routing.exploration/build.mjs --check
set -o pipefail
node --test frontend/diagnose-evidence-charts.test.js | rg '^ℹ (tests|suites|pass|fail|cancelled|skipped|todo)'
node --test frontend/diagnose-behavior-ledger-parity.test.js | rg '^ℹ (tests|suites|pass|fail|cancelled|skipped|todo)'
```

Output:

```text
finding-evidence-routing artifacts current (data.json, evidence-table.extracted.js, app-base.extracted.css)
ℹ tests 23
ℹ suites 0
ℹ pass 23
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
