import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { queryState } from './diagnose-workstation.js';
import { assertMatchingFindingCasePreparation } from './finding-case-file-validation.js';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';
import {
  generatedFindingPose,
  generatedFindingProjection,
} from './diagnose-workstation-behavior.replay.mjs';

test('queryState reads Diagnose state from the canonical route query', () => {
  const original = globalThis.window;
  try {
    globalThis.window = {
      location: { hash: '', search: '?mode=drawn' },
    };
    assert.equal(queryState('typical'), 'drawn');

    globalThis.window.location.search = '?mode=dense';
    assert.equal(queryState('typical'), 'dense');
  } finally {
    globalThis.window = original;
  }
});

test('selected detail describes its glucose trace in product language', () => {
  const source = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');
  assert.match(source, /The canvas shows the selected glucose trace and evidence markers\./);
  assert.doesNotMatch(source, /Occurrence's server-owned trace/);
});

test('C44/C56 replay poses enter the existing Findings queue once', () => {
  const source = readFileSync(new URL('./diagnose-workstation-behavior.replay.mjs', import.meta.url), 'utf8');
  for (const story of ['C44', 'C56']) {
    const body = source.match(new RegExp(`export const ${story} = async \\(page\\) => \\{([\\s\\S]*?)\\n\\};`));
    assert.ok(body, `${story} story exists`);
    assert.match(body[1], /await openWholeDay\(page\);\s*await clickQueueRow\(page, 'Missed \/ unannounced meal'\);/,
      `${story} reaches the queue from the 24-hour surface`);
    assert.doesNotMatch(body[1], /getByRole\('button', \{ name: 'Findings'/,
      `${story} does not wait for a retired second Findings control`);
  }
  assert.match(source, /\['C56', C56, 'typical', \{ findingsProjectionInputs: generatedFindingProjection\('finding:missed_meal'\),\s*caseScenario:/,
    'C56 passes its generated queue pose to the app opener, not only to the case handler');
});

test('generated finding story pose preserves a ready id already in its preparation', () => {
  const caseFiles = JSON.parse(readFileSync(
    new URL('../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8',
  ));
  const id = 'finding:missed_meal';
  const preparation = structuredClone(caseFiles.preparation);
  const before = preparation.rendered_rows.filter((row) => row.id === id).length;
  const posed = generatedFindingPose(id)({ preparation, caseFiles }).body;
  assert.equal(posed.rendered_rows.filter((row) => row.id === id).length, before,
    'a queue-projected row is not duplicated in the preparation response');
  assert.equal(posed.findings.rows.filter((row) => row.id === id).length, 1,
    'the findings projection retains one missed-meal row');
});

test('generated missed-meal queue pose does not duplicate a served row', () => {
  const payload = JSON.parse(readFileSync(
    new URL('../mockups/diagnose-workstation.synthetic/payload.json', import.meta.url), 'utf8',
  ));
  const projectionFixture = JSON.parse(readFileSync(
    new URL('./__fixtures__/findings-projection.json', import.meta.url), 'utf8',
  ));
  const caseFiles = JSON.parse(readFileSync(
    new URL('../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8',
  ));
  const id = 'finding:missed_meal';
  const served = projectFindings({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
    event_charts: projectionFixture.inputs.event_charts,
  });
  const projection = generatedFindingProjection(id)(served, caseFiles);
  assert.equal(projection.rows.filter((row) => row.id === id).length, 1,
    'the replay sends one ready missed-meal row through the same fixture projection as the built app');
  const preparation = structuredClone(caseFiles.preparation);
  preparation.findings = structuredClone(projection);
  const posed = generatedFindingPose(id)({ preparation, caseFiles }).body;
  assert.equal(posed.findings.rows.filter((row) => row.id === id).length, 1,
    'the combined queue projection and story pose retain one missed-meal finding');
  assert.doesNotThrow(() => assertMatchingFindingCasePreparation(posed, null),
    'the combined pose remains a valid no-duplicate-ready-id preparation response');
});

test('#223 · direction-only Correction factor detail leaves evidence ownership with the analyzer', () => {
  const fixture = JSON.parse(readFileSync(
    new URL('./__fixtures__/findings-projection.json', import.meta.url), 'utf8',
  ));
  const analyzer = fixture.direction_only_inputs.analysis.isf[0];
  const source = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');

  assert.match(analyzer.annotation, /fasting data agrees with the set factor/i);
  assert.match(analyzer.annotation, /recurring correction-linked lows call for weaker corrections/i);
  assert.match(source, /sentence: isf\.annotation,/, 'detail transcribes the analyzer explanation');
  assert.match(source, /No new number is available, so there is nothing to stage\./,
    'the extra footer is limited to actionability');
  assert.doesNotMatch(source,
    /Corrections look stronger than needed, but recent lows make a new number unsafe to suggest\./,
    'the frontend does not restate which evidence owns the direction');
});
