import test from 'node:test';
import assert from 'node:assert/strict';
import { showSequenceStory } from './stories.js';

for (const lever of ['high_carb_sequence', 'repeat_eating']) {
  const story = { lever, label: lever };
  const preparation = { rendered_rows: [{ id: `finding:${lever}` }] };
  const rowSelector = `#level .qitem.claimed .qrow[data-id="finding:${lever}"]`;

  test(`${lever} full story drills the nested row before waiting for its focal tile`, async () => {
    let drilled = false;
    const root = { querySelector(selector) {
      if (selector === rowSelector) return { click() { drilled = true; } };
      assert.equal(selector, `#tile-focal .evidence-tile[data-chart-id="finding:${lever}"][data-state="ok"]`);
      assert.equal(drilled, true, 'the cause tile is available only after its row is drilled');
      return {};
    } };
    assert.equal(await showSequenceStory(root, story, { size: 'full' }, preparation),
      `Diagnose workstation · drilled finding:${lever}`);
  });

  test(`${lever} mini story reads the nested row mini without drilling`, async () => {
    const root = { querySelector(selector) {
      if (selector === rowSelector) return { click() { assert.fail('mini must stay in its row'); } };
      assert.equal(selector, `${rowSelector} .mini canvas, ${rowSelector} .mini svg`);
      return {};
    } };
    assert.equal(await showSequenceStory(root, story, { size: 'mini' }, preparation),
      `Diagnose workstation · ${lever} mini`);
  });

  test(`${lever} unsupported story does not wait for a fabricated chart`, async () => {
    const root = { querySelector() { assert.fail('no finding means no chart target'); } };
    assert.equal(await showSequenceStory(root, story, { size: 'full' }, { rendered_rows: [] }),
      `Diagnose workstation · no supported ${lever} finding`);
  });
}
