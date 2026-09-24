// #451 reproduction: desk lines that print a setting concern's served engine title,
// a correction-factor value with the engine unit mg/dL/U, or a setting value with
// no unit at all. Synthetic inputs only: served shapes mirror the manufactured QA
// cases isf-strengthen and ic-lower and the committed findings-projection fixture.
//
// Run from the repo root: node docs/scope/451-setting-concern-labels.repro.mjs
import { readFileSync } from 'node:fs';

let answer;
globalThis.fetch = async () => ({ ok: true, json: async () => answer });
const { loadGuidance } = await import('../../frontend/guidance.js');
const { mount } = await import('../../frontend/changes.js');
const { queueRows } = await import('../../frontend/diagnose-findings-queue.js');
const { watchDockView } = await import('../../frontend/watched-change-dock.js');
const host = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const figure = () => (host.innerHTML.match(/<div class="gf-figure">([^<]*)/) || [])[1];

// 1. A Pattern whose chosen member is a setting carries that setting's span rows and
//    serves units: null (guidance._pattern_candidate), so the figure prints no unit.
for (const [parameter, direction, recommended, units] of [
  ['isf', 'strengthen', 32, 'mg/dL/U'], ['carb_ratio', 'lower', 9, 'g/U']]) {
  const selected = { subject: 'pattern:synthetic', kind: 'pattern', title: 'Synthetic Pattern', units: null,
    action: [{ kind: 'setting_instruction', parameter, start_min: 0, end_min: 1440, direction, units, recommended }],
    members: [], preference: {} };
  answer = { disposition: 'eligible_action', selected, candidates: [selected], reasons: {} };
  await loadGuidance({ force: true }); mount(host);
  console.log(`Changes Action figure, Pattern carrying ${parameter}:`, JSON.stringify(figure()));
}

// 2. A setting concern rendered as guidance serves it today: engine title, engine unit.
const setting = { subject: 'setting:isf', kind: 'setting', parameter: 'isf', title: 'ISF', units: 'mg/dL/U',
  action: [{ parameter: 'isf', start_min: 0, end_min: 1440, direction: 'strengthen', units: 'mg/dL/U', recommended: 32 }],
  members: [], preference: {} };
answer = { disposition: 'eligible_action', selected: setting, candidates: [setting], reasons: {} };
await loadGuidance({ force: true }); mount(host);
const frame = text(host.innerHTML);
console.log('Setting concern frame:', ['ISF', 'mg/dL/U'].filter((needle) => frame.includes(needle)).join(', '),
  '| figure', JSON.stringify(figure()));
// The nameplate and Action heading print the served disposition code itself.
console.log('Disposition code printed:', ['eligible_action', 'guided_investigation'].filter((code) => frame.includes(code)).join(', '));

// 3. A set-aside setting preference the read no longer carries: served with title null.
const selected = { subject: 'pattern:synthetic', kind: 'pattern', title: 'Synthetic Pattern', units: null,
  action: null, members: [], preference: {} };
const absent = { subject: 'setting:isf', kind: null, title: null, absent: true, preference: { set_aside: true },
  decision: { reason: null } };
answer = { disposition: 'guided_investigation', selected, candidates: [selected, absent], reasons: {} };
await loadGuidance({ force: true }); mount(host);
console.log('Set-aside list prints the id:', text(host.innerHTML).includes('setting:isf'));

// 4. Diagnose's findings queue: an asserting correction-factor row's numbers.
const fixture = JSON.parse(readFileSync(new URL('../../frontend/__fixtures__/findings-projection.json', import.meta.url), 'utf8'));
const window = structuredClone(Object.values(fixture.windows).find((w) => w.rows.some((row) => row.parameter === 'isf')));
const isf = window.rows.find((row) => row.parameter === 'isf');
Object.assign(isf, { register: 'assert', asserts_move: true, current: 30, recommended: 32 });
const row = queueRows(window).find((entry) => entry.id === isf.id);
console.log('Diagnose queue, correction factor:', JSON.stringify(row?.detail));

// 5. The watched-change dock, for a correction-factor Trial.
const dock = watchDockView({ watched: { kind: 'trial', parameter: 'isf', before: 30, after: 32,
  changed_at: '2026-01-01 00:00:00', maturing: { is_maturing: true, days_elapsed: 1, days_required: 14 } } });
console.log('Watched-change dock title:', JSON.stringify(dock.title));
