// The one sanction rule of the #317 palette-only diff. `palette-diff.mjs`
// (task 3.1) imports `admits` and admits a computed-style difference only when
// this function says so; there is no other rule. Run `node palette-rule.mjs
// --self-check` to execute the table below.
//
// A difference is admitted when:
//   * the property is a custom property named in the moved-token list, or
//   * the property is colour-valued on both sides, and replacing every colour
//     literal with a placeholder leaves the two values identical — so only the
//     colours moved, never a length, a count of shadows, or a keyword.
// Anything else (a layout or typographic property, a colour-valued property
// whose structure changed, an unlisted custom property, an equal pair) is
// refused. Element additions and removals are refused by the caller.

const COLOUR = /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi;

export function admits({ property, base, revision }, movedTokens) {
  if (base === revision) return { admitted: false, why: 'no difference' };
  if (property.startsWith('--')) {
    return movedTokens.has(property)
      ? { admitted: true, why: 'moved token' }
      : { admitted: false, why: 'custom property outside the moved-token list' };
  }
  const baseColours = base.match(COLOUR), revisionColours = revision.match(COLOUR);
  if (!baseColours || !revisionColours) return { admitted: false, why: 'not colour-valued on both sides' };
  if (baseColours.length !== revisionColours.length) return { admitted: false, why: 'colour count changed' };
  if (base.replace(COLOUR, '□') !== revision.replace(COLOUR, '□')) return { admitted: false, why: 'non-colour text differs' };
  return { admitted: true, why: 'only colours differ' };
}

const CASES = [
  [{ property: 'color', base: 'rgb(224, 127, 63)', revision: 'rgb(220, 180, 70)' }, true],
  [{ property: 'background-color', base: 'rgb(15, 13, 11)', revision: 'rgb(15, 13, 11)' }, false],
  [{ property: 'box-shadow', base: 'rgba(0, 0, 0, 0.5) 0px 1px 2px 0px', revision: 'rgba(0, 0, 0, 0.6) 0px 1px 2px 0px' }, true],
  [{ property: 'box-shadow', base: 'rgba(0, 0, 0, 0.5) 0px 1px 2px 0px', revision: 'rgba(0, 0, 0, 0.5) 0px 2px 2px 0px' }, false],
  [{ property: 'box-shadow', base: 'rgba(0, 0, 0, 0.5) 0px 1px 2px 0px', revision: 'rgba(0, 0, 0, 0.5) 0px 1px 2px 0px, rgba(0, 0, 0, 0.1) 0px 0px 0px 1px' }, false],
  [{ property: 'width', base: '120px', revision: '130px' }, false],
  [{ property: 'font-weight', base: '400', revision: '500' }, false],
  [{ property: 'outline', base: 'rgb(236, 111, 85) solid 1px', revision: 'rgb(236, 111, 85) dashed 1px' }, false],
  [{ property: '--high', base: '#e07f3f', revision: '#dcb446' }, true],
  [{ property: '--primary', base: '#e07f3f', revision: '#dcb446' }, false],
  [{ property: 'fill', base: 'rgb(224, 127, 63)', revision: 'none' }, false],
];

if (process.argv.includes('--self-check')) {
  const moved = new Set(['--high']);
  let failed = 0;
  for (const [input, expected] of CASES) {
    const got = admits(input, moved);
    const ok = got.admitted === expected;
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${input.property.padEnd(18)} ${String(expected).padEnd(5)} ${got.why}`);
  }
  console.log(failed ? `FAIL: ${failed} of ${CASES.length} cases` : `PASS: ${CASES.length} of ${CASES.length} cases`);
  process.exit(failed ? 1 : 0);
}
