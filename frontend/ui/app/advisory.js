// Whether this browser has been through the Advisory notice (§2.5, 2026-11-02).
// Storage that refuses access (a private window, blocked site data, a full
// quota) keeps nothing, and the notice shows again on the next load.
//
// Plain JS, DOM-free; the storage is injected.

const KEY = 'harmonic.advisory-understood';

/** @param {Storage | undefined} storage */
export function createAdvisory(storage) {
  return {
    understood() {
      try { return storage?.getItem(KEY) === '1'; } catch { return false; }
    },
    understand() {
      try { storage?.setItem(KEY, '1'); } catch {}
    },
  };
}
