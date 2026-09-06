import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createBuiltShell } = require('./built-shell.js');

test('serves the built document, page paths, and existing assets only', () => {
  const dist = mkdtempSync(join(tmpdir(), 'harmonic-built-shell-'));
  try {
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<main>built</main>');
    writeFileSync(join(dist, 'assets', 'app.js'), 'export {}');
    writeFileSync(join(dist, 'assets', 'app.css'), 'body {}');
    const shell = createBuiltShell({ dist });
    for (const path of ['/', '/day', '/diagnose', '/verify', '/plan', '/settings', '/guide']) {
      assert.equal(shell.serve(path).body.toString(), '<main>built</main>');
    }
    assert.equal(shell.serve('/assets/app.js').contentType, 'text/javascript');
    assert.equal(shell.serve('/assets/app.css').contentType, 'text/css');
    assert.equal(shell.serve('/assets/missing.js'), null);
    assert.equal(shell.serve('/other'), null);
  } finally { rmSync(dist, { recursive: true, force: true }); }
});

test('fails closed when the built document is absent', () => {
  const dist = mkdtempSync(join(tmpdir(), 'harmonic-built-shell-'));
  try {
    assert.throws(() => createBuiltShell({ dist }), /frontend\/dist\/index.html is missing — run npm ci && npm run build/);
  } finally { rmSync(dist, { recursive: true, force: true }); }
});
