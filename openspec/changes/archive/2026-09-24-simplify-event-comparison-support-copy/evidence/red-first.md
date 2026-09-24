# Red-first browser evidence

The new browser assertions were executed against detached base
`983c48effc39fb069c4453b478da2d61b667d55e` before the production module changed.
The fixture-stubbed built-app opener used the committed synthetic capture and
reported all five intended failures:

```text
FAIL 6d supported detail
  actual: 7 events · 64 supported · 6 limited · 3 withheld points
  expected: /^\d+ events?$/
FAIL 6d limited detail
  actual: 4 events · 73 limited points
  expected: /^\d+ events? · thin$/
FAIL at-rest aria description
  actual: Meal response comparison. Aggregate lines compare supported cohorts; thin cohorts show individual episodes. Sparse whiskers show the 25th to 75th percentile.
  expected: no /episodes|whiskers|percentile/
FAIL 6e withheld point
  actual: Meal response comparison. +5 h. Rule matched median 144 milligrams per deciliter. Near rule median 158 milligrams per deciliter. Rule did not match episodes shown individually, n6.
  expected: /no value at this point/ and no /shown individually/
FAIL 6c zero-event detail
  actual: 0 events · no usable episodes to draw
  expected: 0 events · nothing to draw
5 intended pre-change failures
```

The command exited 1. The final seven-case audit executes the same DOM and
keyboard paths against the revision and exits 0.
