/* Spike for #241 — proves the three pieces of executable logic the stage-1
   harness work order depends on, so the order references a run rather than
   prose. Run from the repo root:  node docs/scope/241-harness-wiring.spike.mjs
   Exits 0 with a PROVEN line per piece, nonzero on the first failure. */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const ok = (label, detail) => console.log(`PROVEN  ${label} — ${detail}`);

/* 1. The shipped design tokens can be lifted out of index.html at runtime with
      no copy and no parser: two <style> blocks, light tokens in the first,
      dark tokens under html.dark in the second. */
const html = await readFile('frontend/index.html', 'utf8');
/* THE TRAP: the literal string "<style>" also appears inside an HTML COMMENT in
   this file, so a naive match opens on the comment and swallows the <link> tags
   after it. Strip comments first, then match. Measured: 1 such occurrence. */
const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
const styles = [...stripped.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
assert.equal(styles.length, 2, 'expected exactly two inline <style> blocks');
assert.ok(styles[0].includes('--in-range:'), 'light tokens absent from the first block');
assert.ok(styles[0].includes('html.dark'), 'dark theme selector absent from the first block');
assert.equal(html.split('<style>').length - stripped.split('<style>').length, 1,
  'the commented-out <style> mention moved — re-check the strip');
ok('token lift', `2 blocks (${styles[0].length} + ${styles[1].length} chars) after stripping 1 commented <style>; :root and html.dark tokens both in block 1`);

/* 2. Every manufactured payload the harness serves exists at the key the browser
      replay driver reads it at. Endpoint -> file -> key. */
const FEEDS = [
  ['/api/diagnose/basal-night-evidence', 'frontend/__fixtures__/basal-night-evidence.json', ['expected']],
  ['/api/diagnose/isf-rest-window-evidence', 'mockups/diagnose-workstation.synthetic/isf-rest-window-evidence.capture.json', ['payload']],
  ['/api/diagnose/carb-ratio-block-evidence', 'mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json', ['cases', 'cross_midnight']],
  ['/api/diagnose/finding-case-file', 'mockups/diagnose-workstation.synthetic/finding-case-files.json', []],
];
const feeds = {};
for (const [endpoint, file, path] of FEEDS) {
  const body = path.reduce((v, k) => {
    assert.ok(v && k in v, `${file} has no key ${k}`);
    return v[k];
  }, JSON.parse(await readFile(file, 'utf8')));
  assert.ok(body && typeof body === 'object', `${file} at ${path.join('.')} is not an object`);
  feeds[endpoint] = body;
  ok('feed', `${endpoint} <- ${file}${path.length ? ' .' + path.join('.') : ''}`);
}

/* 2b. The glucose-by-clock strip is NOT fed from a registry entry. The server
       sends it already binned, and the workstation takes it as given
       (`const envelope = envelopeIn` at diagnose-workstation.js:1213), so the
       strip story's feed is payload.evidence, served at /api/explore/time. */
const payload = JSON.parse(await readFile('mockups/diagnose-workstation.synthetic/payload.json', 'utf8'));
for (const key of ['bin_minutes', 'bins', 'pooled', 'target_range', 'window']) {
  assert.ok(key in payload.evidence, `payload.evidence has no ${key}`);
}
const { stripGlucoseRange } = await import('../../frontend/diagnose-workstation-chart.js');
const stripRange = stripGlucoseRange(payload.evidence.bins);
assert.ok(Array.isArray(stripRange) && stripRange.length === 2, 'strip range is not a pair');
ok('feed', `/api/explore/time <- payload.json .evidence (${payload.evidence.bins.length} bins, range ${JSON.stringify(stripRange)})`);

/* 3. The shipped registry imports live under a plain ES resolver, and each of the
      four kinds produces a drawable option off manufactured data — at full rank
      and at the miniature size ADR 240 reviews thumbnails at. */
const { DIAGNOSE_EVIDENCE_CHARTS, glucoseRange } =
  await import('../../frontend/diagnose-evidence-charts.js');
assert.equal(DIAGNOSE_EVIDENCE_CHARTS.length, 4, 'registry is not four kinds');

/* The case-file store is keyed `cases['finding:<lever>'][alignment]`, with
   per-occurrence `selected_<alignment>` maps and `unavailable_*` / `empty_event`
   variants beside them — eight levers, so the manufactured side already carries
   the drilled states and the failure states without a new fixture. */
const CASES = feeds['/api/diagnose/finding-case-file'].cases;
assert.deepEqual(Object.keys(CASES).length, 8, 'expected eight finding case files');
const caseFile = CASES['finding:meal_bolus_short'].event;
ok('case-file keying', `cases['finding:<lever>'].event over ${Object.keys(CASES).length} levers; each also carries selected_event, unavailable_event`);
const DATA = {
  basal: feeds['/api/diagnose/basal-night-evidence'],
  isf: feeds['/api/diagnose/isf-rest-window-evidence'],
  'carb-ratio': feeds['/api/diagnose/carb-ratio-block-evidence'],
  'event-comparison': caseFile,
};
for (const entry of DIAGNOSE_EVIDENCE_CHARTS) {
  const data = DATA[entry.kind];
  /* basal and isf publish `glucoseValues: null` — they contribute nothing to the
     shared range, exactly as `fieldRange` in diagnose-canvas-layout.js guards for.
     The harness's shared-vs-fitted range toggle inherits that: two of the four
     kinds have no glucose axis to share. */
  const range = glucoseRange(entry.glucoseValues ? entry.glucoseValues(data) || [] : []);
  for (const mode of entry.modes ?? [null]) {
    for (const mini of [false, true]) {
      const option = entry.option(mode, { data, range, mini });
      assert.ok(option && Array.isArray(option.series),
        `${entry.kind}/${mode}/mini=${mini} produced no series`);
    }
  }
  ok('registry', `${entry.kind} drew ${(entry.modes ?? [null]).length * 2} options (modes x mini) off committed data; glucoseValues=${entry.glucoseValues ? 'yes' : 'null'}`);
}
console.log('\nAll three pieces proven.');
