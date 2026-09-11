import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('./fonts/', import.meta.url);
const sheet = readFileSync(new URL('inter.css', dir), 'utf8');
const provenance = JSON.parse(readFileSync(new URL('inter-provenance.json', dir), 'utf8'));

// Inter travels with the desk: HV2-08 keeps it the single UI family and HV2-01
// forbids reaching a CDN for it. It is carried as data URLs rather than as
// files beside this sheet, because every shipping file must stay readable as
// text for the publishable tree's contamination scan. These pin that packaging
// so a re-vendor cannot quietly reintroduce a binary, drop the licence, or ship
// the same bytes five times over.

test('the font ships as text, with no remote source left in it', () => {
  assert.equal(readdirSync(dir).filter((name) => name.endsWith('.woff2')).length, 0,
    'a font binary is back in the shipping tree; the public-tree scan fails closed on one');
  assert.doesNotMatch(sheet, /https?:\/\//, 'the stylesheet still names a remote font source');
  assert.match(sheet, /url\(data:font\/woff2;base64,/);
});

test('one face per subset carries its file once, across the weights it serves', () => {
  const faces = sheet.match(/@font-face \{[^}]*\}/g) || [];
  assert.equal(faces.length, 7, 'expected one face per subset');
  const embedded = sheet.match(/url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\)/g) || [];
  assert.equal(embedded.length, 7, 'a subset is embedded more than once');
  assert.equal(new Set(embedded).size, 7, 'two subsets embed the same bytes');
  for (const face of faces) {
    // Inter is variable: upstream names the same file for weights 400 through
    // 800, so the range is the honest declaration and the one that avoids
    // carrying each file five times.
    assert.match(face, /font-weight: 400 800;/, `a face does not span the weights it serves: ${face.slice(0, 80)}`);
    assert.match(face, /font-style: normal;/);
    assert.match(face, /font-display: swap;/);
    assert.match(face, /unicode-range: /, 'a face lost the subset it is for');
  }
  assert.equal(new Set((sheet.match(/unicode-range: [^;]+;/g) || [])).size, 7,
    'two faces claim the same characters');
});

test('every embedded subset is the upstream file its provenance records', () => {
  assert.equal(provenance.packaging, 'css-data-url');
  const subsets = Object.entries(provenance.subsets);
  assert.equal(subsets.length, 7);
  const embedded = [...sheet.matchAll(/url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g)]
    .map((match) => {
      const bytes = Buffer.from(match[1], 'base64');
      return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
    });
  for (const [name, record] of subsets) {
    assert.match(record.url, /^https:\/\/fonts\.gstatic\.com\//, `${name} records no upstream URL`);
    assert.deepEqual(record.weights, [400, 500, 600, 700, 800], `${name} records the wrong weights`);
    const found = embedded.find((item) => item.sha256 === record.sha256);
    assert.ok(found, `${name}: no embedded subset matches the recorded sha256 ${record.sha256}`);
    assert.equal(found.bytes, record.bytes, `${name} embeds a different number of bytes than recorded`);
  }
  // Each embedded blob is accounted for by exactly one record.
  assert.equal(new Set(subsets.map(([, record]) => record.sha256)).size, embedded.length);
});

test('the licence travels with the font', () => {
  const licence = readFileSync(new URL('OFL.txt', dir), 'utf8');
  assert.match(licence, /SIL OPEN FONT LICENSE/i);
  assert.match(provenance.license.url, /githubusercontent\.com\/google\/fonts\/.*\/ofl\/inter\/OFL\.txt$/);
  assert.equal(createHash('sha256').update(licence).digest('hex'), provenance.license.sha256,
    'the licence text does not match the hash recorded for it');
  assert.match(sheet, /OFL\.txt/, 'the stylesheet does not point at the licence beside it');
});
