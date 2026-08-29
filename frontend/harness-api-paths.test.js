'use strict';
// The harness names app API paths as hand-written strings; nothing else checks
// them, and the manufactured dev-server's prefix routes answer a wrong path
// silently ('/api/explore/time' shipped that way). Every path a harness story
// requests must be a route the API actually declares.
const assert = require('node:assert');
const { test } = require('node:test');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');

test('every harness API path is a route the API declares', () => {
  const api = readFileSync(join(root, 'ciq_autotune', 'api.py'), 'utf8');
  const declared = new Set(
    [...api.matchAll(/@app\.(?:get|post|put|delete)\("([^"]+)"\)/g)].map(([, path]) => path),
  );
  const harnessDir = join(root, 'harness');
  for (const name of readdirSync(harnessDir).filter((f) => f.endsWith('.js'))) {
    const source = readFileSync(join(harnessDir, name), 'utf8');
    for (const [, path] of source.matchAll(/'(\/api\/[^'?]+)[?']/g)) {
      assert.ok(declared.has(path), `harness/${name} requests ${path}, which api.py never declares`);
    }
  }
});
