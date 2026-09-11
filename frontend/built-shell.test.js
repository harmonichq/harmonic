import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createBuiltShell } = require('./built-shell.js');

// Both build roots, as `npm run build` leaves them.
function builds() {
  const dist = mkdtempSync(join(tmpdir(), 'harmonic-built-shell-'));
  const distV2 = mkdtempSync(join(tmpdir(), 'harmonic-built-shell-v2-'));
  mkdirSync(join(dist, 'assets'));
  mkdirSync(join(distV2, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<main>built</main>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'export {}');
  writeFileSync(join(dist, 'assets', 'app.css'), 'body {}');
  writeFileSync(join(distV2, 'index.html'), '<main>desk</main>');
  writeFileSync(join(distV2, 'assets', 'desk.js'), 'export {}');
  return { dist, distV2, clean: () => { rmSync(dist, { recursive: true, force: true }); rmSync(distV2, { recursive: true, force: true }); } };
}

test('serves the built document, page paths, and existing assets only', () => {
  const { dist, distV2, clean } = builds();
  try {
    const shell = createBuiltShell({ dist, distV2 });
    for (const path of ['/', '/day', '/diagnose', '/verify', '/plan', '/settings', '/guide']) {
      assert.equal(shell.serve(path).body.toString(), '<main>built</main>');
    }
    assert.equal(shell.serve('/assets/app.js').contentType, 'text/javascript');
    assert.equal(shell.serve('/assets/app.css').contentType, 'text/css');
    assert.equal(shell.serve('/assets/missing.js'), null);
    assert.equal(shell.serve('/other'), null);
    // An asset URL reaches its own assets/ directory and nothing above it.
    assert.equal(shell.serve('/assets/../index.html'), null);
  } finally { clean(); }
});

// #389: the harness serves the same closed set the Python policy does, so a v2
// route the server never added cannot pass here.
test('serves the v2 desk at its own page path and asset prefix', () => {
  const { dist, distV2, clean } = builds();
  try {
    const shell = createBuiltShell({ dist, distV2 });
    assert.equal(shell.serve('/v2/').body.toString(), '<main>desk</main>');
    assert.equal(shell.serve('/v2/assets/desk.js').contentType, 'text/javascript');
    assert.equal(shell.serve('/v2/assets/missing.js'), null);
    // The two surfaces stay separate: neither prefix reaches the other's build.
    assert.equal(shell.serve('/assets/desk.js'), null);
    assert.equal(shell.serve('/v2/assets/app.js'), null);
    // Not a page path: the desk's destinations are query state, not paths.
    assert.equal(shell.serve('/v2'), null);
    assert.equal(shell.serve('/v2/day'), null);
    assert.equal(shell.serve('/v2/assets/../index.html'), null);
  } finally { clean(); }
});

test('fails closed when either built document is absent', () => {
  const { dist, distV2, clean } = builds();
  const empty = mkdtempSync(join(tmpdir(), 'harmonic-built-shell-empty-'));
  try {
    assert.throws(() => createBuiltShell({ dist: empty, distV2 }),
      /frontend\/dist\/index.html is missing — run npm ci && npm run build/);
    assert.throws(() => createBuiltShell({ dist, distV2: empty }),
      /frontend-v2\/dist\/index.html is missing — run npm ci && npm run build/);
  } finally { clean(); rmSync(empty, { recursive: true, force: true }); }
});
