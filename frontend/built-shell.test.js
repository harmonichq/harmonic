import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createBuiltShell } = require('./built-shell.js');

// The one build root, as `npm run build` leaves it.
function build() {
  const dist = mkdtempSync(join(tmpdir(), 'harmonic-built-shell-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<main>desk</main>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'export {}');
  writeFileSync(join(dist, 'assets', 'app.css'), 'body {}');
  return { dist, clean: () => rmSync(dist, { recursive: true, force: true }) };
}

test('serves the built document at the root page set, and existing assets only', () => {
  const { dist, clean } = build();
  try {
    const shell = createBuiltShell({ dist });
    for (const path of ['/', '/diagnose', '/changes', '/day']) {
      assert.equal(shell.serve(path).body.toString(), '<main>desk</main>');
    }
    assert.equal(shell.serve('/assets/app.js').contentType, 'text/javascript');
    assert.equal(shell.serve('/assets/app.css').contentType, 'text/css');
    assert.equal(shell.serve('/assets/missing.js'), null);
    assert.equal(shell.serve('/other'), null);
    // An asset URL reaches its own assets/ directory and nothing above it.
    assert.equal(shell.serve('/assets/../index.html'), null);
  } finally { clean(); }
});

// ADR 416: no retired address is served, and the mirror never redirects. The
// retired prefix the desk itself used to answer on is named in the server route
// test rather than here, because the naming boundary allows that address to
// appear only where the served contract is asserted end to end.
test('every retired address stays closed', () => {
  const { dist, clean } = build();
  try {
    const shell = createBuiltShell({ dist });
    for (const path of ['/verify', '/plan', '/settings', '/guide',
      '/index.html', '/unknown']) {
      assert.equal(shell.serve(path), null, path);
    }
  } finally { clean(); }
});

test('fails closed when the built document is absent', () => {
  const empty = mkdtempSync(join(tmpdir(), 'harmonic-built-shell-empty-'));
  try {
    assert.throws(() => createBuiltShell({ dist: empty }),
      /frontend\/dist\/index.html is missing — run npm ci && npm run build/);
  } finally { rmSync(empty, { recursive: true, force: true }); }
});
