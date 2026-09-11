// Synthetic-only replay transport. Each story gets a fresh copy, served on the
// declared QA port. The caller opts in with CASE_STORE_DIR; an existing server
// is never stopped or reused under a different case name.
import { boundedWait } from './c2.replay.mjs';
import { C3_CASES } from './c3.replay.mjs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, rm, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const setting = 'S14,S15,S16,S17,S31,S32,S33,S34,S35,S37,S37b,S38,S39,S40,S41,S42,S43,S44,S77,S78,S79,S81,S88,S89,S90';
export const STORY_CASES = Object.freeze({
  ...Object.fromEntries(setting.split(',').map(id => [id, 'basal-lower'])),
  S7: 'c3-trial', S7b: 'basal-no-change', S9: 'basal-lower', S18: 'basal-no-change', S80b: 'basal-no-change', S97: 'basal-lower', S98: 'ic-lower', S99: 'basal-insufficient-seven-night',
  S101: 'showcase', S102: 'pattern-near-tie', S103: 'showcase', S104: 'showcase', S105: 'c3-trial',
  S106: 'pattern-near-tie', S107: 'showcase',
  S100: 'showcase', R18: 'c4-history', R5: 'basal-lower', R8: 'behavioral-carb-undercount', R10: 'ic-lower', R17: 'c3-trial',
});
export function storyCase(id, overrides = '') {
  const mapping = { ...STORY_CASES, ...C3_CASES };
  for (const pair of overrides.split(',').filter(Boolean)) {
    const match = /^([SR]\d+[a-z]?)=([a-z][a-z0-9-]*)$/.exec(pair);
    if (!match) throw new Error(`Invalid STORY_CASES entry: ${pair}`);
    mapping[match[1]] = match[2];
  }
  return mapping[id] || 'showcase';
}

export function createCaseServer({ directory, repo, baseURL = 'http://127.0.0.1:8765' }) {
  if (baseURL !== 'http://127.0.0.1:8765') throw new Error('Case stores use the declared QA port 8765 only.');
  const scratch = join(resolve(directory), `run-${Date.now()}-${process.pid}`);
  const db = join(scratch, "harmonic-qa-e2e.sqlite");
  let child = null;
  let log = null;
  let serial = 0;
  const generated = new Map();
  async function command(args) {
    const process = spawn('uv', ['run', ...args], { cwd: repo, stdio: ['ignore', log.fd, log.fd] });
    let code;
    try { [code] = await boundedWait(once(process, 'exit'), `generated case command ${args[0]}`, 60000); }
    catch (error) { process.kill('SIGKILL'); throw error; }
    if (code !== 0) throw new Error(`uv run ${args.join(' ')} exited ${code}; see ${scratch}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit'); process.kill(-child.pid, 'SIGTERM');
      try { await boundedWait(exited, 'synthetic server shutdown', 10000); }
      catch { process.kill(-child.pid, 'SIGKILL'); await boundedWait(exited, 'synthetic server forced shutdown', 5000); }
    }
    child = null;
    if (log) { await log.close(); log = null; }
  }
  async function prepare(id, name) {
    await stop();
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('Invalid generated case name.');
    const started = performance.now();
    await mkdir(scratch, { recursive: true });
    log = await open(join(scratch, `${++serial}-${id}-${name}.log`), 'w');
    const source = join(scratch, `generated-${name}.sqlite`);
    if (!generated.has(name)) {
      if (name === 'showcase') await copyFile(join(repo, 'mockups/qa-e2e.synthetic/harmonic.sqlite'), source);
      else await command(['python', 'scripts/gen_qa_e2e_db.py', '--case', name, '--out', source]);
      // Cache ingestion's completed output. Every story still mutates only its
      // own copy; preference-write reconciliation remains exercised by S16.
      await command(['python', '-c',
        'import sys; from ciq_autotune.store import Store; from ciq_autotune.watched_change import reconcile_ingested_follow_up\nwith Store.open(sys.argv[1]) as store: reconcile_ingested_follow_up(store)', source]);
      generated.set(name, source);
    }
    for (const suffix of ['', '-wal', '-shm', '.derived.sqlite', '.derived.sqlite-wal', '.derived.sqlite-shm'])
      await rm(`${db}${suffix}`, { force: true });
    await copyFile(source, db);
    process.stdout.write(`# case-copy ${id} case=${name} milliseconds=${(performance.now() - started).toFixed(3)}\n`);
    return { caseName: name, db };
  }
  async function start(id, name) {
    await stop();
    // Do not turn an unrelated listener into this story's apparent success.
    try {
      await fetch(`${baseURL}/api/status`, { signal: AbortSignal.timeout(1000) });
      throw new Error('Port 8765 is occupied; stop the external QA server before CASE_STORE_DIR replay.');
    } catch (error) { if (error.message.startsWith('Port 8765')) throw error; }
    const result = await prepare(id, name);
    await serve();
    return result;
  }
  async function serve() {
    child = spawn('uv', ['run', 'harmonic', 'serve', '--no-fetch', '--token', '', '--db', db, '--port', '8765'],
      { cwd: repo, detached: true, stdio: ['ignore', log.fd, log.fd] });
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Synthetic server exited ${child.exitCode}`);
      try {
        const response = await fetch(`${baseURL}/api/status`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return;
      } catch { /* startup has not bound the declared port yet */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Synthetic server did not become ready; see ${scratch}`);
  }
  async function capturePump(mode) {
    if (!['mismatch', 'match'].includes(mode) || !child) throw new Error('A running synthetic story and named capture are required.');
    await stop();
    log = await open(join(scratch, `${++serial}-pump-${mode}.log`), 'w');
    await command(['python', 'frontend-v2/replay-pump.py', db, mode]);
    await serve();
  }
  // prepare also measures/checks case copying without launching a server/browser.
  return { prepare, start, stop, capturePump };
}
