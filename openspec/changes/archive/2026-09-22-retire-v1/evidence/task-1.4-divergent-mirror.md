# Task 1.4 — the mirror half of the agreement check, proved non-blind

`tests/test_frontend_asset_routes.py` compares three owners of the desk's page
set: the Python route policy, the browser router, and the disk-serving mirror
`frontend/built-shell.js`. The server side has a backstop — the test pins the
complete non-API route set — and the mirror side had none: it read the mirror's
page set with a filter, so a path the mirror served and the server did not was
silently skipped and the assertion still passed.

The mirror side now ENUMERATES every element of that set. Below, each divergence
is written into the mirror, the one agreement test is run against it, and the
committed line is restored before the next. The last section is the committed
mirror itself.

## a double-quoted extra path

```
const V2_PAGE_PATHS = new Set([V2_PAGE, '/diagnose', '/changes', '/day', "/day2"]);
```

FAILED as required

```
E       AssertionError: Items in the first set but not the second:
E       '/day2'
```

## a differently-cased path

```
const V2_PAGE_PATHS = new Set([V2_PAGE, '/diagnose', '/changes', '/day', '/Day']);
```

FAILED as required

```
E       AssertionError: Items in the first set but not the second:
E       '/Day'
```

## a hyphenated path

```
const V2_PAGE_PATHS = new Set([V2_PAGE, '/diagnose', '/changes', '/day', '/day-old']);
```

FAILED as required

```
E       AssertionError: Items in the first set but not the second:
E       '/day-old'
```

## an element this test cannot resolve

```
const V2_PAGE_PATHS = new Set([V2_PAGE, '/diagnose', '/changes', '/day', LEGACY_PAGE]);
```

FAILED as required

```
E   AssertionError: unexpectedly None : the mirror's page set names 'LEGACY_PAGE', which this test cannot resolve to a served path
```

## a page the mirror drops but the server still serves

```
const V2_PAGE_PATHS = new Set([V2_PAGE, '/diagnose', '/changes']);
```

FAILED as required

```
E       AssertionError: Items in the second set but not the first:
E       '/day'
```

## the committed mirror

```
const V2_PAGE_PATHS = new Set([V2_PAGE, '/diagnose', '/changes', '/day']);
```

PASSES

```
1 passed, 1 warning in 0.13s
```
