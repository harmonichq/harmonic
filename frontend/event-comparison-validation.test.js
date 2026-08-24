import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validEventProjection } from './diagnose-event-comparison.js';
import { projectSyntheticCapture } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';

const capture = JSON.parse(readFileSync(fileURLToPath(new URL(
  '../mockups/diagnose-event-comparison.synthetic/capture.json', import.meta.url)), 'utf8'));
const requested = {
  view: 'meals', factor: 'late_bolus', window: null, another: false,
};
const projection = projectSyntheticCapture(capture, requested);

test('#83 · the workstation accepts a response matching its exact request', () => {
  assert.equal(validEventProjection(projection, requested), true);
  assert.equal(validEventProjection({ ...projection, input_data_age: {
    revision: 7, covers_to: '2026-08-24 08:00:00',
  } }, requested), true);
});

test('#83 · the workstation rejects malformed and stale event responses', () => {
  assert.equal(validEventProjection({ schema: 'malformed' }, requested), false);
  assert.equal(validEventProjection(projection, { ...requested, factor: 'carb_undercount' }), false);
  assert.equal(validEventProjection(projection, {
    ...requested, window: { start_min: 420, end_min: 615 },
  }), false);
  assert.equal(validEventProjection({ ...projection, input_data_age: 'malformed' }, requested), false);
  assert.equal(validEventProjection({ ...projection, input_data_age: {
    revision: 7, covers_to: null,
  } }, requested), false);
});

test('#83 · selected event evidence must match the requested occurrence exactly', () => {
  const occurrenceId = projection.occurrences[0].identity.id;
  const otherId = projection.occurrences.find((item) => item.identity.id !== occurrenceId).identity.id;
  const selectedRequest = { ...requested, occurrenceId };
  const selected = projectSyntheticCapture(capture, selectedRequest);

  assert.equal(validEventProjection(selected, selectedRequest), true);
  assert.equal(validEventProjection(selected, { ...requested, occurrenceId: otherId }), false,
    'a valid but stale selection cannot answer another occurrence request');
  assert.equal(validEventProjection(selected, requested), false,
    'an unsolicited selected occurrence cannot answer an unselected request');
  assert.equal(validEventProjection(projection, selectedRequest), false,
    'an empty selection cannot answer a selected-occurrence request');
});
