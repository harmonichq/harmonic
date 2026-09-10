// Explicit CI entry for the complete c3 app selection at both locked sizes.
// The replay owns fresh generator-backed stores and the offline server lifecycle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { C3_STORIES } from './c3.replay.mjs';
import { boundedWait } from './c2.replay.mjs';

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('PLAYWRIGHT_MODULE is required; the c3 gate cannot skip browser execution.');
for (const viewport of ['1280x720', '1440x900']) {
  test(`Trial and Pattern Focus journeys at ${viewport}`, { timeout: 1200000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'harmonic-c3-browser-'));
    const child = spawn(process.execPath, ['frontend/harmonic-v2-desktop-behavior.replay.mjs'], {
      detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
        TARGET: 'app', VIEWPORT: viewport, BASE_URL: 'http://127.0.0.1:8765',
        CASE_STORE_DIR: directory, ONLY: Object.keys(C3_STORIES).join(',') },
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { output += chunk; process.stderr.write(chunk); });
    let code;
    try { [code] = await boundedWait(once(child, 'exit'), `c3 replay ${viewport}`, 1100000); }
    finally { try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    assert.equal(code, 0, output);
    assert.match(output, new RegExp(`# executed ${Object.keys(C3_STORIES).length} · failed 0 · deferred 0`));
  });
}
