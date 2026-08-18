import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractIntervals } from './rest-window.js';

describe('subtractIntervals', () => {
  it('returns the full window when no exclusions', () => {
    const result = subtractIntervals('2026-06-11 00:00:00', '2026-06-11 08:00:00', []);
    assert.deepEqual(result, [{ start: '2026-06-11 00:00:00', end: '2026-06-11 08:00:00' }]);
  });

  it('returns full window when exclusion is null/undefined', () => {
    const result = subtractIntervals('2026-06-11 00:00:00', '2026-06-11 08:00:00', null);
    assert.deepEqual(result, [{ start: '2026-06-11 00:00:00', end: '2026-06-11 08:00:00' }]);
  });

  it('carves a gap when exclusion sits mid-window', () => {
    // Window: 00:00–08:00, exclusion: 03:00–04:12
    // Expected: [00:00–03:00, 04:12–08:00]
    const result = subtractIntervals(
      '2026-06-11 00:00:00', '2026-06-11 08:00:00',
      [{ start: '2026-06-11 03:00:00', end: '2026-06-11 04:12:00' }],
    );
    assert.deepEqual(result, [
      { start: '2026-06-11 00:00:00', end: '2026-06-11 03:00:00' },
      { start: '2026-06-11 04:12:00', end: '2026-06-11 08:00:00' },
    ]);
  });

  it('trims the start when exclusion overlaps the window start', () => {
    // Window: 03:00–08:00, exclusion: 02:00–04:12 → only 04:12–08:00 remains
    const result = subtractIntervals(
      '2026-06-11 03:00:00', '2026-06-11 08:00:00',
      [{ start: '2026-06-11 02:00:00', end: '2026-06-11 04:12:00' }],
    );
    assert.deepEqual(result, [
      { start: '2026-06-11 04:12:00', end: '2026-06-11 08:00:00' },
    ]);
  });

  it('trims the end when exclusion overlaps the window end', () => {
    // Window: 00:00–05:00, exclusion: 04:00–06:00 → only 00:00–04:00 remains
    const result = subtractIntervals(
      '2026-06-11 00:00:00', '2026-06-11 05:00:00',
      [{ start: '2026-06-11 04:00:00', end: '2026-06-11 06:00:00' }],
    );
    assert.deepEqual(result, [
      { start: '2026-06-11 00:00:00', end: '2026-06-11 04:00:00' },
    ]);
  });

  it('returns empty when exclusion covers the whole window', () => {
    const result = subtractIntervals(
      '2026-06-11 03:00:00', '2026-06-11 04:12:00',
      [{ start: '2026-06-11 02:00:00', end: '2026-06-11 05:00:00' }],
    );
    assert.deepEqual(result, []);
  });

  it('handles multiple exclusions producing multiple slices', () => {
    // Window: 00:00–08:00, two exclusions: 02:00–02:30 and 05:00–05:45
    const result = subtractIntervals(
      '2026-06-11 00:00:00', '2026-06-11 08:00:00',
      [
        { start: '2026-06-11 02:00:00', end: '2026-06-11 02:30:00' },
        { start: '2026-06-11 05:00:00', end: '2026-06-11 05:45:00' },
      ],
    );
    assert.deepEqual(result, [
      { start: '2026-06-11 00:00:00', end: '2026-06-11 02:00:00' },
      { start: '2026-06-11 02:30:00', end: '2026-06-11 05:00:00' },
      { start: '2026-06-11 05:45:00', end: '2026-06-11 08:00:00' },
    ]);
  });

  it('ignores exclusions entirely outside the window', () => {
    // Exclusion before window start
    const r1 = subtractIntervals(
      '2026-06-11 04:00:00', '2026-06-11 08:00:00',
      [{ start: '2026-06-11 01:00:00', end: '2026-06-11 02:00:00' }],
    );
    assert.deepEqual(r1, [{ start: '2026-06-11 04:00:00', end: '2026-06-11 08:00:00' }]);

    // Exclusion after window end
    const r2 = subtractIntervals(
      '2026-06-11 00:00:00', '2026-06-11 04:00:00',
      [{ start: '2026-06-11 05:00:00', end: '2026-06-11 06:00:00' }],
    );
    assert.deepEqual(r2, [{ start: '2026-06-11 00:00:00', end: '2026-06-11 04:00:00' }]);
  });
});
