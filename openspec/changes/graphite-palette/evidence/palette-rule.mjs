// The one sanction rule of the #317 palette-only diff. `palette-diff.mjs`
// (task 3.1) imports `admits` and admits a computed-style difference only when
// this function says so; there is no other rule. Run `node palette-rule.mjs
// --self-check` to execute the table below.
//
// Inputs, both read from the pinned design record's "Moved tokens" section:
//   * `movedTokens`  — the custom properties whose computed value moved;
//   * `colourPairs`  — every admitted before → after colour pair: each moved
//     token's computed before/after, plus any derived pair the record lists
//     explicitly (a color-mix of a moved token, for instance) with its ruling.
// A difference is admitted when:
//   * the property is a custom property named in `movedTokens`, or
//   * the property is colour-valued on both sides, replacing every colour
//     literal with a placeholder leaves the two values identical, and every
//     colour literal that differs is one of the listed before → after pairs.
// Anything else — a layout or typographic property, a colour-valued property
// whose structure changed, an unlisted custom property, a colour pair no moved
// token explains, an equal pair — is refused. Element additions and removals
// are refused by the caller.

const COLOUR = /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi;

// Computed styles report rgb()/rgba(); the record may write hex. Normalise both.
export function norm(colour) {
  const c = colour.trim().toLowerCase();
  const hex = c.match(/^#([0-9a-f]{3,8})$/);
  let r, g, b, a = 1;
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else {
    const m = c.match(/^rgba?\(([^)]*)\)$/);
    if (!m) return c.replace(/\s+/g, '');
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    [r, g, b] = parts;
    if (parts.length > 3) a = parts[3];
  }
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${Number(a.toFixed(3))})`;
}

export function admits({ property, base, revision }, movedTokens, colourPairs) {
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
  for (let i = 0; i < baseColours.length; i += 1) {
    const before = norm(baseColours[i]), after = norm(revisionColours[i]);
    if (before === after) continue;
    if (!colourPairs.some(([b, a]) => norm(b) === before && norm(a) === after)) {
      return { admitted: false, why: `colour pair ${before} → ${after} is not explained by a moved token` };
    }
  }
  return { admitted: true, why: 'only listed colour pairs differ' };
}

const MOVED = new Set(['--high']);
const PAIRS = [['#e07f3f', '#dcb446'], ['rgba(224,127,63,.16)', 'rgba(220,180,70,.16)']];
const CASES = [
  [{ property: 'color', base: 'rgb(224, 127, 63)', revision: 'rgb(220, 180, 70)' }, true],
  [{ property: 'color', base: 'rgb(54, 49, 46)', revision: 'rgb(60, 49, 46)' }, false],
  [{ property: 'background-color', base: 'rgb(15, 13, 11)', revision: 'rgb(15, 13, 11)' }, false],
  [{ property: 'background-color', base: 'rgba(224, 127, 63, 0.16)', revision: 'rgba(220, 180, 70, 0.16)' }, true],
  [{ property: 'box-shadow', base: 'rgb(224, 127, 63) 0px 1px 2px 0px', revision: 'rgb(220, 180, 70) 0px 1px 2px 0px' }, true],
  [{ property: 'box-shadow', base: 'rgb(224, 127, 63) 0px 1px 2px 0px', revision: 'rgb(220, 180, 70) 0px 2px 2px 0px' }, false],
  [{ property: 'box-shadow', base: 'rgb(224, 127, 63) 0px 1px 2px 0px', revision: 'rgb(220, 180, 70) 0px 1px 2px 0px, rgba(0, 0, 0, 0.1) 0px 0px 0px 1px' }, false],
  [{ property: 'width', base: '120px', revision: '130px' }, false],
  [{ property: 'font-weight', base: '400', revision: '500' }, false],
  [{ property: 'outline', base: 'rgb(224, 127, 63) solid 1px', revision: 'rgb(220, 180, 70) dashed 1px' }, false],
  [{ property: '--high', base: '#e07f3f', revision: '#dcb446' }, true],
  [{ property: '--primary', base: '#e07f3f', revision: '#dcb446' }, false],
  [{ property: 'fill', base: 'rgb(224, 127, 63)', revision: 'none' }, false],
];

if (process.argv.includes('--self-check')) {
  let failed = 0;
  for (const [input, expected] of CASES) {
    const got = admits(input, MOVED, PAIRS);
    const ok = got.admitted === expected;
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${input.property.padEnd(18)} ${String(expected).padEnd(5)} ${got.why}`);
  }
  console.log(failed ? `FAIL: ${failed} of ${CASES.length} cases` : `PASS: ${CASES.length} of ${CASES.length} cases`);
  process.exit(failed ? 1 : 0);
}
